// Active effects card (Character tab): common spells and other buffs to switch on (with a caster level where the
// bonus grows with it), custom effects the player types in, and what they add up to by the stacking rules.
import { $, esc, paragraphs, facts } from './dom.js';
import { BUFFS, buffById, BONUS_TYPES, TARGETS, TARGET_NAMES, activeBonuses, EFFECT_GROUPS, buffAmount, effectMods } from './effects.js';

const signedN = n => (n > 0 ? `+${n}` : String(n));

// "+4 enhancement Str" for a buff at a caster level.
function buffSummary(buff, cl) {
  const flags = { noDexAc: 'no Dex bonus to AC', halfSpeed: 'half speed' };
  return [...buff.bonuses(buffAmount(buff, cl), effectMods()).map(x => `${signedN(x.value)} ${x.type} ${TARGET_NAMES[x.target].toLowerCase()}`),
          ...(buff.flags || []).map(f => flags[f])].join(', ') || 'see Details';
}

export function renderEffects(app, view) {
  const { state } = app;
  const box = $('effects');
  const openGroups = new Set([...box.querySelectorAll('details.buff-list[open]')].map(d => d.dataset.group));
  const on = new Map(state.buffs.map(x => [x.id, x]));
  const activeCount = state.buffs.length + state.customEffects.filter(c => c.on && c.value).length;
  $('effects-count').textContent = activeCount ? `${activeCount} on` : '';

  const buffRow = buff => {
    const cur = on.get(buff.id);
    const cl = cur?.cl ?? 1;
    // A caster or class level, or for items and negative levels a choice of amounts.
    const level = !cur ? '' : buff.levels ? `<label class="cl-input">${esc(buff.levelName || 'amount')}
        <select data-buff-cl="${esc(buff.id)}">${buff.levels.map(n => `<option value="${n}"${n === buffAmount(buff, cl) ? ' selected' : ''}>${buff.forms ? esc(buff.forms[n - 1].label) : `${buff.levelName === 'bonus' ? '+' : ''}${n}`}</option>`).join('')}</select></label>`
      : buff.scales ? `<label class="cl-input">${esc(buff.levelName || 'caster level')}
        <input type="number" min="1" max="20" value="${cl}" data-buff-cl="${esc(buff.id)}"></label>` : '';
    return `<li class="${cur ? 'on' : ''}"><label class="check-row small"><input type="checkbox" data-buff="${esc(buff.id)}"${cur ? ' checked' : ''}>
        <span><b>${esc(buff.name)}</b> <small class="muted">${esc(buffSummary(buff, cl))}</small></span>
        <button type="button" class="skill-details" data-buff-pop="${esc(buff.id)}" aria-label="${esc(buff.name)} in a popup">Details</button></label>${level}
        ${cur && buff.note ? `<div class="hint">Not counted: ${esc(buff.note)}</div>` : ''}</li>`;
  };
  const active = BUFFS.filter(b => on.has(b.id));
  const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  // Each custom effect: on/off and a name, then one line per bonus it gives (amount, type, what it applies to).
  const partRow = (i, k, p) => `<div class="fx-part">
      <input type="number" data-fx="${i}" data-part="${k}" data-field="value" value="${p.value}" aria-label="Bonus (negative for a penalty)">
      <select data-fx="${i}" data-part="${k}" data-field="type" aria-label="Bonus type">${options(BONUS_TYPES.map(t => [t, t]), p.type)}</select>
      <select data-fx="${i}" data-part="${k}" data-field="target" aria-label="Applies to">${options(TARGETS, p.target)}</select>
      ${k ? `<button type="button" class="link" data-fx-part-remove="${i}:${k}" aria-label="Remove this bonus">remove</button>` : ''}</div>`;
  const custom = state.customEffects.map((c, i) => `<li class="custom-effect">
      <div class="fx-head">
        <input type="checkbox" data-fx="${i}" data-field="on"${c.on ? ' checked' : ''} aria-label="On">
        <input type="text" data-fx="${i}" data-field="name" value="${esc(c.name)}" placeholder="Name (e.g. rage, inspire greatness, potion)" aria-label="Name">
        <button type="button" class="skill-details" data-fx-pop="${i}" aria-label="What this effect does">Details</button>
        <button type="button" data-fx-remove="${i}" aria-label="Remove this effect">Remove</button></div>
      ${[c, ...(c.more || [])].map((p, k) => partRow(i, k, p)).join('')}
      <button type="button" class="link" data-fx-more="${i}">+ another bonus from it</button></li>`).join('');

  // What counts after stacking, by what it changes.
  const fx = view.stats.fx;
  const totals = [
    ...['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(a => fx[a]).map(a => `${TARGET_NAMES[a]} ${signedN(fx[a])}`),
    ...Object.entries(fx.ac).filter(([, v]) => v).map(([t, v]) => `AC ${signedN(v)} ${t}`),
    ...['attack', 'damage', 'melee-attack', 'melee-damage', 'ranged-attack', 'fort', 'ref', 'will', 'init', 'skills', 'checks', 'cmb', 'cmd', 'hp'].filter(k => fx[k]).map(k => `${TARGET_NAMES[k]} ${signedN(fx[k])}`),
    ...(fx.speed ? [`Speed ${signedN(fx.speed)} ft.`] : []),
    ...((fx.flags || []).includes('noDexAc') ? ['no Dex bonus to AC'] : []), ...((fx.flags || []).includes('halfSpeed') ? ['half speed'] : []),
    ...(view.size !== view.race.size ? [`Size ${view.size}`] : []),
  ];
  box.innerHTML = `
    ${totals.length ? `<p class="effect-totals"><b>Counting now:</b> ${esc(totals.join(' · '))}</p>
      <p class="hint">Bonuses of the same type don't stack (only the highest counts), except dodge, circumstance and untyped
      ones; penalties all count. Armor and shield bonuses (mage armor, shield) don't add to worn armor's: the higher counts.</p>`
      : '<p class="hint">Nothing active. Switch on a spell, ability, item, circumstance or condition below, or add your own effect.</p>'}
    ${active.length ? `<ul class="buff-active">${active.map(buffRow).join('')}</ul>` : ''}
    ${EFFECT_GROUPS.map(([g, label, hint]) => {
      const list = BUFFS.filter(b => (b.group || 'spell') === g);
      const n = list.filter(b => on.has(b.id)).length;
      return `<details class="buff-list" data-group="${g}"${openGroups.has(g) ? ' open' : ''}><summary>${esc(label)} <span class="count">${n ? `${n} on` : list.length}</span></summary>
        <p class="hint">${esc(hint)}</p>
        <ul class="buff-grid">${list.filter(b => !on.has(b.id)).map(buffRow).join('') || '<li class="hint">All of these are on (above).</li>'}</ul></details>`;
    }).join('')}
    <h3>Custom effects</h3>
    ${custom ? `<ul class="custom-effects">${custom}</ul>` : '<p class="hint">For anything not listed: a potion, an item, a class ability, a penalty (enter a negative number).</p>'}
    <p><button type="button" data-fx-add>Add an effect</button>${activeCount ? ' <button type="button" data-fx-clear>Switch all off</button>' : ''}</p>`;
}

// A buff in a popup: what it gives at your caster level (and how that grows), whether each bonus counts next to the
// other effects that are on (same-type bonuses don't stack), what isn't counted, and the spell's own text.
async function popBuff(app, id) {
  const buff = buffById.get(id);
  if (!buff) return;
  const { state } = app;
  const cur = state.buffs.find(x => x.id === id);
  const cl = cur?.cl || app.view.level;
  // The other effects on now, and which of them beat or match each of this buff's bonuses.
  const others = activeBonuses(state.buffs.filter(x => x.id !== id), app.view.customAll);
  const rows = buff.bonuses(buffAmount(buff, cl), effectMods()).flatMap(b => (b.target === 'saves' ? ['fort', 'ref', 'will'].map(t => ({ ...b, target: t })) : [b])).map(b => {
    const rival = b.value > 0 && !['dodge', 'circumstance', 'untyped'].includes(b.type)
      ? others.filter(o => o.target === b.target && o.type === b.type && o.value >= b.value).sort((x, y) => y.value - x.value)[0] : null;
    return `<tr><td>${esc(TARGET_NAMES[b.target])}</td><td class="num">${esc(signedN(b.value))}</td><td>${esc(b.type)}</td>
      <td>${rival ? `doesn't count while ${esc(rival.source)} gives ${esc(signedN(rival.value))}` : 'counts'}</td></tr>`;
  }).join('');
  const growth = buff.scales ? `<p class="hint">It grows with ${esc(buff.levelName || 'caster level')}: ${[1, 5, 10, 15, 20].map(l =>
    `${l}: ${buff.bonuses(l, effectMods()).map(x => signedN(x.value)).filter((v, i, a) => a.indexOf(v) === i).join('/')}`).join(' · ')}.</p>` : '';
  // Its rules text: the spell, the magic item, the class feature or class option it comes from (spells and items load on first use).
  if (!app.data.spells && (buff.ref?.spell || (buff.group || 'spell') === 'spell')) await app.loadSpells();
  if (buff.ref?.item && !app.data.items) await app.loadItems();
  const plain = (buff.ref?.spell || buff.name.replace(/\s*\(.*\)$/, '')).toLowerCase();
  const spell = (buff.group || 'spell') === 'spell' || buff.ref?.spell ? app.data.spells?.find(s => s.name.toLowerCase() === plain) : null;
  const refItem = buff.ref?.item ? app.data.items?.find(x => x.name.toLowerCase() === buff.ref.item.toLowerCase()) : null;
  const refFeature = buff.ref?.cls ? app.data.classes.find(c => c.id === buff.ref.cls)?.features?.find(f => f.name.startsWith(buff.ref.feature)) : null;
  const refTalent = buff.ref?.talent ? app.data.talents?.find(t => t.name === buff.ref.talent) : null;
  const ruleText = refItem ? [refItem.name, refItem.description] : refFeature ? [refFeature.name, refFeature.text] : refTalent ? [refTalent.name, refTalent.text] : null;
  const groupName = (EFFECT_GROUPS.find(([g]) => g === (buff.group || 'spell')) || [])[1];
  const flagText = { noDexAc: 'You lose your Dex bonus to AC (a Dex penalty still counts) and any dodge bonuses: this is counted.',
                     halfSpeed: 'Your speed is halved: this is counted.' };
  // "caster level 5", or a form's name ("Large animal").
  const amountText = buff.forms ? esc(buff.forms[buffAmount(buff, cl) - 1].label) : `${esc(buff.levelName || 'caster level')} ${buffAmount(buff, cl)}`;
  app.openDetail(buff.name, `<p class="hint">${spell ? `${esc(spell.school || '')} spell · ${esc(spell.source || '')}` : esc(groupName || 'Class ability')}${cur ? ` · on${buff.scales || buff.levels ? `, ${amountText}` : ''}` : ''}</p>
    ${(buff.flags || []).map(f => `<p><b>${esc(flagText[f])}</b></p>`).join('')}
    ${rows ? `<h3>${cur ? 'What it gives now' : `What it would give${buff.scales || buff.levels ? ` (${amountText})` : ''}`}</h3>
      <table class="skill-why"><tbody>${rows}</tbody></table>` : ''}${growth}
    ${buff.size ? `<p>It makes you one size ${buff.size > 0 ? 'larger' : 'smaller'}: size changes to AC, attacks, CMB/CMD and weapon damage are counted.</p>` : ''}
    ${buff.note ? `<p class="hint">Not counted: ${esc(buff.note)}.</p>` : ''}
    ${ruleText ? `<details class="rules"><summary>Rules text: ${esc(ruleText[0])}</summary>${paragraphs(ruleText[1] || '')}</details>` : ''}
    ${buff.forms ? `<p class="hint">Choose the form in its list (${buff.forms.length} forms)${buff.forms.some(f => f.size) ? '; your size becomes the form\u2019s' : ''}.</p>` : ''}
    ${spell ? `<h3>The spell</h3>${facts([['Range', spell.range], ['Duration', spell.duration], ['Target', spell.target || null], ['Saving throw', spell.saving_throw]])}
      <details class="rules"><summary>Spell text</summary>${paragraphs(spell.description)}</details>` : ''}`,
    [cur ? { label: 'Switch it off', run: () => app.update({ buffs: state.buffs.filter(x => x.id !== id) }) }
         : { label: 'Switch it on', primary: true, run: () => app.update({ buffs: [...state.buffs, { id, cl: buff.levels ? buff.levels[0] : app.view.level }] }) }]);
}

// A custom effect in a popup: what it applies to (all saves / all d20 rolls spelled out), whether it counts next to the
// other effects (same-type bonuses don't stack; dodge, circumstance, untyped and penalties do), and On / Off.
function popCustom(app, i) {
  const { state } = app;
  const c = state.customEffects[i];
  if (!c) return;
  const name = c.name || 'Custom effect';
  const others = activeBonuses(state.buffs, app.view.customAll.filter((x, j) => x !== c));
  const parts = [c, ...(c.more || [])];
  const rows = parts.flatMap(p => {
    const spread = { saves: ['fort', 'ref', 'will'], d20: ['attack', 'fort', 'ref', 'will', 'skills', 'checks'] }[p.target] || [p.target];
    const stacks = p.value < 0 || ['dodge', 'circumstance', 'untyped'].includes(p.type);
    return spread.map(t => {
      const rival = stacks ? null : others.filter(o => o.target === t && o.type === p.type && o.value >= p.value).sort((a, b) => b.value - a.value)[0];
      return `<tr><td>${esc(TARGET_NAMES[t] || t)}</td><td class="num">${esc(signedN(p.value))}</td><td>${esc(p.type)}</td>
        <td>${!c.on ? 'off' : !p.value ? 'no amount' : rival ? `doesn't count while ${esc(rival.source)} gives ${esc(signedN(rival.value))}` : 'counts'}</td></tr>`;
    });
  }).join('');
  app.openDetail(name, `<p class="hint">Custom effect · ${parts.length} bonus${parts.length === 1 ? '' : 'es'}${c.on ? '' : ' · switched off'}</p>
    <table class="skill-why"><tbody>${rows}</tbody></table>
    <p class="hint">Bonuses of the same type don't stack with each other (only the highest counts), except dodge, circumstance and
      untyped ones; penalties all add up. Change the name, amounts, types or what each applies to in its row; "+ another bonus"
      adds one more to the same effect.</p>`,
    [c.on ? { label: 'Switch it off', run: () => app.update({ customEffects: state.customEffects.map((x, j) => (j === i ? { ...x, on: false } : x)) }) }
          : { label: 'Switch it on', primary: true, run: () => app.update({ customEffects: state.customEffects.map((x, j) => (j === i ? { ...x, on: true } : x)) }) },
     { label: 'Remove it', run: () => app.update({ customEffects: state.customEffects.filter((_, j) => j !== i) }) }]);
}

export function initEffects(app) {
  // Details: inside a buff's label, so it doesn't tick the box.
  $('effects').addEventListener('click', e => {
    const cp = e.target.closest('[data-fx-pop]');
    if (cp) { popCustom(app, Number(cp.dataset.fxPop)); return; }
    const b = e.target.closest('[data-buff-pop]');
    if (!b) return;
    e.preventDefault();
    popBuff(app, b.dataset.buffPop);
  });
  const box = $('effects');
  const { state } = app;
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.buff) {
      const id = t.dataset.buff;
      const fresh = buffById.get(id)?.levels ? buffById.get(id).levels[0] : app.view.level;
      app.update({ buffs: t.checked ? [...state.buffs, { id, cl: state.buffs.find(x => x.id === id)?.cl || fresh }]
        : state.buffs.filter(x => x.id !== id) });
    } else if (t.dataset.buffCl) {
      const cl = Math.min(20, Math.max(1, Math.floor(Number(t.value)) || 1));
      app.update({ buffs: state.buffs.map(x => (x.id === t.dataset.buffCl ? { ...x, cl } : x)) });
    } else if (t.dataset.fx !== undefined) {
      const i = Number(t.dataset.fx);
      const k = Number(t.dataset.part || 0);
      const field = t.dataset.field;
      const value = field === 'on' ? t.checked : field === 'value' ? Math.trunc(Number(t.value)) || 0 : t.value;
      // Bonus 0 is the effect's own fields; bonuses 1, 2... are in `more`.
      app.update({ customEffects: state.customEffects.map((c, j) => (j !== i ? c : k
        ? { ...c, more: (c.more || []).map((p, m) => (m === k - 1 ? { ...p, [field]: value } : p)) }
        : { ...c, [field]: value })) });
    }
  });
  box.addEventListener('click', e => {
    const more = e.target.closest('[data-fx-more]');
    if (more) {
      const i = Number(more.dataset.fxMore);
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, more: [...(c.more || []), { target: 'attack', type: c.type, value: 1 }] } : c)) });
      return;
    }
    const pr = e.target.closest('[data-fx-part-remove]');
    if (pr) {
      const [i, k] = pr.dataset.fxPartRemove.split(':').map(Number);
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, more: (c.more || []).filter((_, m) => m !== k - 1) } : c)) });
      return;
    }
    if (e.target.closest('[data-fx-add]')) {
      app.update({ customEffects: [...state.customEffects, { name: '', target: 'attack', type: 'untyped', value: 1, on: true }] });
    } else if (e.target.closest('[data-fx-remove]')) {
      const i = Number(e.target.closest('[data-fx-remove]').dataset.fxRemove);
      app.update({ customEffects: state.customEffects.filter((_, j) => j !== i) });
    } else if (e.target.closest('[data-fx-clear]')) {
      app.update({ buffs: [], customEffects: state.customEffects.map(c => ({ ...c, on: false })) });
    }
  });
}

