// Active effects card (Character tab): common spells and other buffs to switch on (with a caster level where the
// bonus grows with it), custom effects the player types in, and what they add up to by the stacking rules.
import { $, esc, paragraphs, facts } from './dom.js';
import { BUFFS, buffById, BONUS_TYPES, TARGETS, TARGET_NAMES, activeBonuses } from './effects.js';

const signedN = n => (n > 0 ? `+${n}` : String(n));

// "+4 enhancement Str" for a buff at a caster level.
function buffSummary(buff, cl) {
  return buff.bonuses(cl).map(x => `${signedN(x.value)} ${x.type} ${TARGET_NAMES[x.target].toLowerCase()}`).join(', ');
}

export function renderEffects(app, view) {
  const { state } = app;
  const box = $('effects');
  const listOpen = box.querySelector('details.buff-list')?.open ?? false;
  const on = new Map(state.buffs.map(x => [x.id, x]));
  const activeCount = state.buffs.length + state.customEffects.filter(c => c.on && c.value).length;
  $('effects-count').textContent = activeCount ? `${activeCount} on` : '';

  const buffRow = buff => {
    const cur = on.get(buff.id);
    const cl = cur?.cl ?? 1;
    const level = buff.scales && cur ? `<label class="cl-input">${esc(buff.levelName || 'caster level')}
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
    ...['attack', 'damage', 'fort', 'ref', 'will', 'init', 'skills', 'checks', 'cmb', 'cmd', 'hp'].filter(k => fx[k]).map(k => `${TARGET_NAMES[k]} ${signedN(fx[k])}`),
    ...(fx.speed ? [`Speed ${signedN(fx.speed)} ft.`] : []),
    ...(view.size !== view.race.size ? [`Size ${view.size}`] : []),
  ];
  box.innerHTML = `
    ${totals.length ? `<p class="effect-totals"><b>Counting now:</b> ${esc(totals.join(' · '))}</p>
      <p class="hint">Bonuses of the same type don't stack (only the highest counts), except dodge, circumstance and untyped
      ones; penalties all count. Armor and shield bonuses (mage armor, shield) don't add to worn armor's: the higher counts.</p>`
      : '<p class="hint">Nothing active. Switch on a spell below, or add your own effect.</p>'}
    ${active.length ? `<ul class="buff-active">${active.map(buffRow).join('')}</ul>` : ''}
    <details class="buff-list"${listOpen ? ' open' : ''}><summary>Common spells and buffs</summary>
      <ul class="buff-grid">${BUFFS.filter(b => !on.has(b.id)).map(buffRow).join('')}</ul></details>
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
  const rows = buff.bonuses(cl).flatMap(b => (b.target === 'saves' ? ['fort', 'ref', 'will'].map(t => ({ ...b, target: t })) : [b])).map(b => {
    const rival = b.value > 0 && !['dodge', 'circumstance', 'untyped'].includes(b.type)
      ? others.filter(o => o.target === b.target && o.type === b.type && o.value >= b.value).sort((x, y) => y.value - x.value)[0] : null;
    return `<tr><td>${esc(TARGET_NAMES[b.target])}</td><td class="num">${esc(signedN(b.value))}</td><td>${esc(b.type)}</td>
      <td>${rival ? `doesn't count while ${esc(rival.source)} gives ${esc(signedN(rival.value))}` : 'counts'}</td></tr>`;
  }).join('');
  const growth = buff.scales ? `<p class="hint">It grows with ${esc(buff.levelName || 'caster level')}: ${[1, 5, 10, 15, 20].map(l =>
    `${l}: ${buff.bonuses(l).map(x => signedN(x.value)).filter((v, i, a) => a.indexOf(v) === i).join('/')}`).join(' · ')}.</p>` : '';
  // The spell's own text (spells load on first use).
  if (!app.data.spells) await app.loadSpells();
  const plain = buff.name.replace(/\s*\(.*\)$/, '').toLowerCase();
  const spell = app.data.spells?.find(s => s.name.toLowerCase() === plain);
  app.openDetail(buff.name, `<p class="hint">${spell ? `${esc(spell.school || '')} spell · ${esc(spell.source || '')}` : 'Class ability'}${cur ? ` · on, at ${esc(buff.levelName || 'caster level')} ${cl}` : ''}</p>
    <h3>${cur ? 'What it gives now' : `What it would give (${esc(buff.levelName || 'caster level')} ${cl})`}</h3>
    <table class="skill-why"><tbody>${rows}</tbody></table>${growth}
    ${buff.size ? `<p>It makes you one size ${buff.size > 0 ? 'larger' : 'smaller'}: size changes to AC, attacks, CMB/CMD and weapon damage are counted.</p>` : ''}
    ${buff.note ? `<p class="hint">Not counted: ${esc(buff.note)}.</p>` : ''}
    ${spell ? `<h3>The spell</h3>${facts([['Range', spell.range], ['Duration', spell.duration], ['Target', spell.target || null], ['Saving throw', spell.saving_throw]])}
      <details class="rules"><summary>Spell text</summary>${paragraphs(spell.description)}</details>` : ''}`,
    [cur ? { label: 'Switch it off', run: () => app.update({ buffs: state.buffs.filter(x => x.id !== id) }) }
         : { label: 'Switch it on', primary: true, run: () => app.update({ buffs: [...state.buffs, { id, cl: app.view.level }] }) }]);
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
      app.update({ buffs: t.checked ? [...state.buffs, { id, cl: state.buffs.find(x => x.id === id)?.cl || app.view.level }]
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

