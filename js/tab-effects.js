// Active effects card (Character tab): common spells and other buffs to switch on (with a caster level where the
// bonus grows with it), custom effects the player types in, and what they add up to by the stacking rules.
import { $, esc, paragraphs, facts } from './dom.js';
import { BUFFS, buffById, BONUS_TYPES, TARGETS, TARGET_NAMES, activeBonuses, EFFECT_GROUPS, buffAmount, effectMods } from './effects.js';
import { ownedSources, itemRowHtml, itemRowChange, itemRowClick, buffSummary } from './item-rows.js';
import { defenseSwitchesHtml, setCombatSwitch, switchValue } from './tab-armor.js';

// What's counting now, after stacking ("Strength +4", "AC +2 deflection"...).
function countingNow(view) {
  const fx = view.stats.fx;
  return [
    ...['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(a => fx[a]).map(a => `${TARGET_NAMES[a]} ${signedN(fx[a])}`),
    ...Object.entries(fx.ac).filter(([, v]) => v).map(([t, v]) => `AC ${signedN(v)} ${t}`),
    ...['attack', 'damage', 'melee-attack', 'melee-damage', 'ranged-attack', 'fort', 'ref', 'will', 'init', 'skills', 'checks', 'cmb', 'cmd', 'hp'].filter(k => fx[k]).map(k => `${TARGET_NAMES[k]} ${signedN(fx[k])}`),
    ...(fx.speed ? [`Speed ${signedN(fx.speed)} ft.`] : []),
    ...((fx.flags || []).includes('noDexAc') ? ['no Dex bonus to AC'] : []), ...((fx.flags || []).includes('halfSpeed') ? ['half speed'] : []),
    ...(view.size !== view.race.size ? [`Size ${view.size}`] : []),
  ];
}

// The Character tab's Active effects card, larger, to work with: what's counting now; your effects (with their caster
// level, amount or form), custom effects and the attack and defense switches, each ticked on or off here (the popup
// redraws itself); magic items' effects (switched on the Magic Items tab); and Add effects (popAddEffects) to add more
// without leaving the Character tab.
// Custom effects, to change: on/off and a name, then one line per bonus it gives (amount, type, what it applies to),
// "+ another bonus from it", Remove; and a button to add one. Used in the Character tab's Active effects popup.
function customEditorHtml(state) {
  const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const partRow = (i, k, p) => `<div class="fx-part">
      <input type="number" data-fx="${i}" data-part="${k}" data-field="value" value="${p.value}" aria-label="Bonus (negative for a penalty)">
      <select data-fx="${i}" data-part="${k}" data-field="type" aria-label="Bonus type">${options(BONUS_TYPES.map(t => [t, t]), p.type)}</select>
      <select data-fx="${i}" data-part="${k}" data-field="target" aria-label="Applies to">${options(TARGETS, p.target)}</select>
      ${k ? `<button type="button" class="link" data-fx-part-remove="${i}:${k}" aria-label="Remove this bonus">remove</button>` : ''}</div>`;
  return `<ul class="plain-list custom-effects">${state.customEffects.map((c, i) => `<li class="custom-effect">
      <div class="fx-head">
        <input type="checkbox" data-fx="${i}" data-field="on"${c.on ? ' checked' : ''} aria-label="On">
        <input type="text" data-fx="${i}" data-field="name" value="${esc(c.name)}" placeholder="Name (e.g. rage, inspire greatness, potion)" aria-label="Name">
        <button type="button" data-fx-remove="${i}" aria-label="Remove this effect">Remove</button></div>
      ${[c, ...(c.more || [])].map((p, k) => partRow(i, k, p)).join('')}
      <button type="button" class="link" data-fx-more="${i}">+ another bonus from it</button></li>`).join('')}</ul>
    <button type="button" data-fx-add>Add a custom effect</button>`;
}

const ATTACK_SWITCHES = [['powerAttack', 'Power Attack'], ['deadlyAim', 'Deadly Aim'], ['rapidShot', 'Rapid Shot'], ['pointBlank', 'Point-Blank Shot']];
export function popOnNow(app) {
  const { state } = app;
  const view = app.view;
  const totals = countingNow(view);
  const yours = state.buffs.map(x => [x, buffById.get(x.id)]).filter(([, b]) => b);
  const box = (attr, on, label, note, pop = '') => `<label class="check-row small"><input type="checkbox" ${attr}${on ? ' checked' : ''}>
      <span><b>${esc(label)}</b>${note ? ` <small class="muted">${esc(note)}</small>` : ''}</span>${pop}</label>`;
  // A caster or class level, an amount (a belt's +4) or a form (a polymorph's animal), as on the Build tab.
  const levelOf = (b, x) => (b.levels ? `<label class="cl-input">${esc(b.levelName || 'amount')} <select data-onnow-cl="${esc(b.id)}">${b.levels.map(n =>
      `<option value="${n}"${n === buffAmount(b, x.cl ?? 1) ? ' selected' : ''}>${b.forms ? esc(b.forms[n - 1].label) : b.levelName === 'bonus' ? `+${n}` : n}</option>`).join('')}</select></label>`
    : b.scales ? `<label class="cl-input">${esc(b.levelName || 'caster level')} <input type="number" min="1" max="20" value="${x.cl ?? 1}" data-onnow-cl="${esc(b.id)}"></label>` : '');
  const attackSw = ATTACK_SWITCHES.filter(([, f]) => view.haveFeats.includes(f))
    .map(([k, f]) => box(`data-b-combat="${k}"`, !!state.combat[k], f, ''));
  app.openDetail('Active effects', `<div class="onnow-pop">
    ${totals.length ? `<p class="effect-totals"><b>Counting now:</b> ${esc(totals.join(' · '))}</p>` : '<p class="hint">Nothing counting now.</p>'}
    <h3>Your effects</h3>
    ${yours.length ? yours.map(([x, b]) => `<div class="onnow-row">${box(`data-onnow-buff="${esc(b.id)}"`, x.on !== false, b.name, buffSummary(b, x.cl ?? 1),
      `<button type="button" class="skill-details q-details" data-onnow-buff-pop="${esc(b.id)}" aria-label="${esc(b.name)} in a popup" title="Details">?</button>`)}${levelOf(b, x)}
      <button type="button" class="link" data-onnow-remove="${esc(b.id)}" aria-label="Take ${esc(b.name)} off your list">remove</button></div>`).join('')
      : '<p class="hint">None yet: add spells, abilities and conditions with <b>Add effects</b> below.</p>'}
    <h3>Custom effects</h3>
    <p class="hint">For anything not listed: a name, then each bonus it gives (a negative number for a penalty).</p>
    ${customEditorHtml(state)}
    ${traitSwitchesHtml(view, 'data-onnow-trait')}
    ${(view.fromItems || []).length ? `<h3>From your magic items</h3><ul>${view.fromItems.map(x => `<li>✓ ${esc(x.label)}</li>`).join('')}</ul>
      <p class="hint">Switch an item on or off on the Magic Items tab (or in Active effects).</p>` : ''}
    ${(view.gearMagic || []).length ? `<h3>From your armor and weapons</h3><ul>${view.gearMagic.map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>
      <p class="hint">Change these on the Armor and Weapons tabs.</p>` : ''}
    <h3>Combat switches</h3>
    ${attackSw.join('')}${defenseSwitchesHtml(view, state.combat, () => '', true)}
  </div>`, [
    { label: 'Add effects', primary: true, run: () => popAddEffects(app) },
    { label: 'Switch all off', run: () => app.update({ buffs: state.buffs.map(x => ({ ...x, on: false })),
      customEffects: state.customEffects.map(c => ({ ...c, on: false })), traitOn: [],
      combat: { ...state.combat, powerAttack: false, deadlyAim: false, rapidShot: false, pointBlank: false, combatExpertise: false, fightingDefensively: false, totalDefense: false, spellCombat: false, mountedCharge: false, arcaneStrike: false, conjured: undefined } }) },
  ]);
}

const signedN = n => (n > 0 ? `+${n}` : String(n));

// "From your traits": each chosen trait's attack, damage, AC, CMB or CMD bonus (traitCombat), ticked on when it applies
// (against giants, in a surprise round...), with the trait's sentence saying when; one that always applies is just listed.
function traitSwitchesHtml(view, attr) {
  const list = view.traitSwitches || [];
  if (!list.length) return '';
  const what = s => [s.effect, ...s.effect.more].map(p => `${TARGET_NAMES[p.target]} ${signedN(p.value)}`).join(', ');
  return `<h3>From your traits</h3><p class="hint">Tick one when it applies: these bonuses count only in the situation the trait names.</p>
    ${list.map(s => `<label class="check-row small"><input type="checkbox" ${attr}="${esc(s.key)}"${s.on ? ' checked' : ''}${s.always ? ' disabled' : ''}>
      <span><b>${esc(s.name)}</b> <small class="muted">${esc(what(s))}${s.always ? ' (always)' : ''}</small><br><small>${esc(s.text)}</small></span></label>`).join('')}`;
}

// Add effects (from the Character tab's Active effects): every spell, ability, item, circumstance and condition in the
// catalog, searched by name and narrowed by group, each with Add (it goes on your list, switched on, at your level) and
// Details; and a custom effect (one bonus with a name). Back returns to Active effects.
export function popAddEffects(app, q = '', group = '') {
  const groups = EFFECT_GROUPS.map(([g, label]) => `<option value="${g}"${g === group ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const opts = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  app.openDetail('Add effects', `<div class="addfx-pop">
    <div class="addfx-find"><input type="search" data-addfx-q value="${esc(q)}" placeholder="Search: bless, haste, flanking, shaken…" aria-label="Search effects">
      <select data-addfx-group aria-label="Which kind"><option value="">Every kind</option>${groups}</select></div>
    <ul class="addfx-list">${addList(app, q, group)}</ul>
    <h3>Custom effect</h3>
    <p class="hint">For anything not listed (a potion, a class ability, a penalty: enter a negative number). More bonuses for it can be added on the Build tab.</p>
    <div class="addfx-custom"><input type="text" data-addfx-c="name" placeholder="Name" aria-label="Name">
      <input type="number" data-addfx-c="value" value="1" aria-label="Bonus (negative for a penalty)">
      <select data-addfx-c="type" aria-label="Bonus type">${opts(BONUS_TYPES.map(t => [t, t]), 'untyped')}</select>
      <select data-addfx-c="target" aria-label="Applies to">${opts(TARGETS, 'attack')}</select>
      <button type="button" data-addfx-custom>Add it</button></div>
  </div>`, [{ label: 'Back to Active effects', primary: true, run: () => popOnNow(app) }]);
  setTimeout(() => $('detail-body').querySelector('[data-addfx-q]')?.focus(), 0);
}

// The catalog's effects matching a search and group: on your list ones say so (and are switched on or off there).
function addList(app, q, group) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const mine = new Map(app.state.buffs.map(x => [x.id, x]));
  const list = BUFFS.filter(b => (!group || (b.group || 'spell') === group) && words.every(w => b.name.toLowerCase().includes(w)));
  const shown = list.slice(0, 120);
  return shown.map(b => `<li><span><b>${esc(b.name)}</b> <small class="muted">${esc(buffSummary(b, b.levels ? b.levels[0] : app.view.level))}</small></span>
      ${mine.has(b.id) ? `<span class="muted">${mine.get(b.id).on === false ? 'on your list (off)' : 'on ✓'}</span>` : `<button type="button" data-addfx="${esc(b.id)}">Add</button>`}
      <button type="button" class="skill-details q-details" data-onnow-buff-pop="${esc(b.id)}" aria-label="${esc(b.name)}: details" title="Details">?</button></li>`).join('')
    + (list.length > shown.length ? `<li class="hint">${list.length - shown.length} more: type to narrow the list.</li>` : '')
    + (list.length ? '' : '<li class="hint">Nothing matches: try another word, or add a custom effect below.</li>');
}


// A buff in a popup: what it gives at your caster level (and how that grows), whether each bonus counts next to the
// other effects that are on (same-type bonuses don't stack), what isn't counted, and the spell's own text.
export async function popBuff(app, id) {
  const buff = buffById.get(id);
  if (!buff) return;
  const { state } = app;
  const kept = state.buffs.find(x => x.id === id);
  const cur = kept && kept.on !== false ? kept : null;
  const cl = kept?.cl || app.view.level;
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
  const refItem = buff.ref?.item ? app.data.items?.find(x => (buff.ref.id ? x.id === buff.ref.id : x.name.toLowerCase() === buff.ref.item.toLowerCase())) : null;
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
    ${buff.forms && buff.levelName === 'energy' ? '<p class="hint">Choose the energy type and amount in its list; it shows as Resist on the Character tab.</p>' : ''}
    ${buff.forms && buff.levelName !== 'energy' ? `<p class="hint">Choose the form in its list (${buff.forms.length} forms)${buff.forms.some(f => f.size) ? '; your size becomes the form\u2019s' : ''}.</p>` : ''}
    ${spell ? `<h3>The spell</h3>${facts([['Range', spell.range], ['Duration', spell.duration], ['Target', spell.target || null], ['Saving throw', spell.saving_throw]])}
      <details class="rules"><summary>Spell text</summary>${paragraphs(spell.description)}</details>` : ''}`,
    [cur ? { label: 'Switch it off', run: () => app.update({ buffs: state.buffs.map(x => (x.id === id ? { ...x, on: false } : x)) }) }
         : { label: 'Switch it on', primary: true, run: () => app.update({ buffs: kept ? state.buffs.map(x => (x.id === id ? { id: x.id, cl: x.cl } : x))
             : [...state.buffs, { id, cl: buff.levels ? buff.levels[0] : app.view.level }] }) },
     ...(kept ? [{ label: 'Remove from my list', run: () => app.update({ buffs: state.buffs.filter(x => x.id !== id) }) }] : [])]);
}

function refreshAddList(app) {
  const body = $('detail-body');
  const list = body.querySelector('.addfx-list');
  if (list) list.innerHTML = addList(app, body.querySelector('[data-addfx-q]').value, body.querySelector('[data-addfx-group]').value);
}

export function initEffects(app) {
  // The On now popup: ticking a box changes it at once, and the popup redraws with the new numbers.
  const pop = $('detail-body');
  pop.addEventListener('change', e => {
    if (!e.target.closest('.onnow-pop')) return;
    const t = e.target;
    const { state } = app;
    if (t.dataset.onnowBuff) {
      const id = t.dataset.onnowBuff;
      app.update({ buffs: state.buffs.map(x => (x.id === id ? (t.checked ? { id: x.id, cl: x.cl } : { ...x, on: false }) : x)) });
    } else if (t.dataset.onnowTrait) {
      const k = t.dataset.onnowTrait;
      app.update({ traitOn: t.checked ? [...new Set([...state.traitOn, k])] : state.traitOn.filter(x => x !== k) });
    } else if (t.dataset.onnowCustom !== undefined) {
      const i = Number(t.dataset.onnowCustom);
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, on: t.checked } : c)) });
    } else if (t.dataset.bCombat) {
      app.update({ combat: setCombatSwitch(state.combat, t.dataset.bCombat, switchValue(t)) });
    } else if (t.dataset.onnowCl) {
      const id = t.dataset.onnowCl;
      const cl = Math.min(20, Math.max(1, Math.floor(Number(t.value)) || 1));
      app.update({ buffs: state.buffs.map(x => (x.id === id ? { ...x, cl } : x)) });
    } else if (t.dataset.fx !== undefined) {
      const i = Number(t.dataset.fx);
      const k = Number(t.dataset.part || 0);
      const field = t.dataset.field;
      const value = field === 'on' ? t.checked : field === 'value' ? Math.trunc(Number(t.value)) || 0 : t.value;
      // Bonus 0 is the effect's own fields; bonuses 1, 2... are in `more`.
      app.update({ customEffects: state.customEffects.map((c, j) => (j !== i ? c : k
        ? { ...c, more: (c.more || []).map((p, m) => (m === k - 1 ? { ...p, [field]: value } : p)) }
        : { ...c, [field]: value })) });
    } else return;
    popOnNow(app);
  });
  pop.addEventListener('click', e => {
    const b = e.target.closest(':is(.onnow-pop, .addfx-pop) [data-onnow-buff-pop]');
    if (b) { e.preventDefault(); popBuff(app, b.dataset.onnowBuffPop); return; }
    // Add effects: an effect onto your list (switched on, at your level or its first amount), or a custom effect.
    const { state } = app;
    const add = e.target.closest('.addfx-pop [data-addfx]');
    if (add) {
      const buff = buffById.get(add.dataset.addfx);
      if (buff && !state.buffs.some(x => x.id === buff.id)) app.update({ buffs: [...state.buffs, { id: buff.id, cl: buff.levels ? buff.levels[0] : app.view.level }] });
      refreshAddList(app);
      return;
    }
    if (e.target.closest('.addfx-pop [data-addfx-custom]')) {
      const f = k => $('detail-body').querySelector(`[data-addfx-c="${k}"]`).value;
      const value = Math.trunc(Number(f('value'))) || 0;
      app.update({ customEffects: [...state.customEffects, { name: f('name').trim().slice(0, 60) || 'Custom effect', value, type: f('type'), target: f('target'), on: true }] });
      popOnNow(app);
    }
  });
  // Taking an effect off your list, or deleting a custom effect.
  pop.addEventListener('click', e => {
    if (!e.target.closest('.onnow-pop')) return;
    const { state } = app;
    const r = e.target.closest('[data-onnow-remove]');
    const more = e.target.closest('[data-fx-more]');
    const pr = e.target.closest('[data-fx-part-remove]');
    const rm = e.target.closest('[data-fx-remove]');
    if (r) app.update({ buffs: state.buffs.filter(x => x.id !== r.dataset.onnowRemove) });
    else if (more) {
      const i = Number(more.dataset.fxMore);
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, more: [...(c.more || []), { target: 'attack', type: c.type, value: 1 }] } : c)) });
    } else if (pr) {
      const [i, k] = pr.dataset.fxPartRemove.split(':').map(Number);
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, more: (c.more || []).filter((_, m) => m !== k - 1) } : c)) });
    } else if (rm) app.update({ customEffects: state.customEffects.filter((_, j) => j !== Number(rm.dataset.fxRemove)) });
    else if (e.target.closest('[data-fx-add]')) app.update({ customEffects: [...state.customEffects, { name: '', target: 'attack', type: 'untyped', value: 1, on: true }] });
    else return;
    popOnNow(app);
  });
  // Add effects: the list follows the search box and the group as you type or choose.
  pop.addEventListener('input', e => { if (e.target.closest('.addfx-pop [data-addfx-q]')) refreshAddList(app); });
  pop.addEventListener('change', e => { if (e.target.closest('.addfx-pop [data-addfx-group]')) refreshAddList(app); });
}

