// Spells tab: the character's chosen spells, and their class spell list (grouped by spell level) with a side
// panel for the spell being looked at.
import { openLines, fitLines, $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { activeBonuses } from './effects.js';
import { spellsPerDay, EXTRA_SLOTS } from './rules.js';
import { spellContext, spellLines, srCheck, spellstrikeRoll } from './spell-math.js';
import { SCHOOLS as CS_SCHOOLS, DIE_SIZES as CS_DIE_SIZES, SCALINGS as CS_SCALINGS } from './custom-spells.js';
import { CASTING_ABILITY } from './rules.js';
import { rollButton } from './roll-ui.js';

// The numbers behind each spell line shown in My spells, by key, for its Details popup.
const lineDetails = new Map();
let listClassId = null;  // which class's spell list is shown, for characters with several

// The classes that have a spell list, and the one being shown, with its effective level (prestige classes can
// raise it) and the highest spell level it can cast.
function listClass(app, view) {
  const withList = view.classes.filter(c => app.data.spells.some(s => s.levels[c.id] !== undefined));
  // (No class yet: a stand-in with no spell list, so every spell can still be searched.)
  const cls = withList.find(c => c.id === listClassId) || withList[0] || view.cls || { id: '', name: 'No class yet' };
  const cast = view.casting.casting.find(c => c.cls.id === cls.id);
  const level = cast ? cast.effectiveLevel : (view.counts.find(e => e.cls.id === cls.id)?.level || 1);
  const table = cls.progression && spellsPerDay({ cls, level, scores: view.stats.scores, knownChange: app.knownChange?.(cls.id) || 0, diminished: !!app.diminished?.(cls.id) });
  const castable = (table?.rows || []).filter(r => r.canCast && ((r.total ?? 0) > 0 || (r.known ?? 0) > 0));
  return { withList, cls, level, table, maxLevel: castable.length ? Math.max(...castable.map(r => r.spellLevel)) : -1 };
}

const LEVEL_NAMES = ['Level 0 (cantrips / orisons)', ...Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`)];

// "sorcerer 3, wizard 3, magus 3" using the app's class names where it knows them.
function levelText(app, spell) {
  const name = id => app.data.classes.find(c => c.id === id)?.name
    || id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  return Object.entries(spell.levels).map(([id, lv]) => `${name(id)} ${lv}`).join(', ');
}

function spellDetails(app, spell, cls, withButton = true) {
  const onList = spell.levels[cls.id] !== undefined;
  const mine = app.state.spells.includes(spell.id);
  const school = [spell.school, spell.subschool ? `(${spell.subschool})` : '', spell.descriptors ? `[${spell.descriptors}]` : '']
    .filter(Boolean).join(' ');
  const button = mine
    ? `<button type="button" data-remove-spell="${esc(spell.id)}">Remove from my spells</button>`
    : onList ? `<button type="button" class="primary" data-add-spell="${esc(spell.id)}">Add to my spells</button>` : '';
  return `<h3>${esc(spell.name)}</h3>
    <p class="hint">${esc(school)} · ${esc(sourceText(spell))}</p>
    ${onList ? '' : `<p class="warning">Not on the ${esc(cls.name.toLowerCase())} spell list${mine ? '' : ', so it can\'t be added'}.</p>`}
    ${button && withButton ? `<div class="slot-buttons">${button}${spell.custom ? ` <button type="button" data-cs-edit="${esc(spell.id)}">Change this custom spell</button>` : ''}</div>` : ''}
    ${facts([
      ['Level', levelText(app, spell)],
      ['Casting time', spell.casting_time],
      ['Components', spell.components],
      ['Range', spell.range],
      ...(spell.effects || []),
      ['Duration', spell.duration],
      ['Saving throw', spell.saving_throw],
      ['Spell resistance', spell.spell_resistance],
    ])}
    ${paragraphs(spell.description)}`;
}

// One row of the Add a spell list: the name, and under it ✓ in my spells, the school, prohibited, not yet (a level you
// can't cast yet) or the classes' levels (when every spell is listed).
function spellRow(app, s, note = '') {
  const mine = app.state.spells.includes(s.id);
  const banned = (app.prohibitedSchools?.('wizard') || []).some(x => x.toLowerCase() === String(s.school || '').toLowerCase());
  const line = [mine ? 'in my spells' : '', s.school || '', banned ? 'prohibited' : '', note].filter(Boolean).join(' · ');
  return `<button type="button" data-spell-pick="${esc(s.id)}"${mine ? ' aria-pressed="true"' : ''}><b>${mine ? '<span class="status met">✓</span> ' : ''}${esc(s.name)}</b><small>${esc(line)}</small></button>`;
}

// The character's chosen spells, grouped by spell level for their class. Spontaneous casters see how many
// spells they may know at each level (from the class table).
// Roll buttons for one spell line. An attack spell gets Roll attack (attack and damage together), Roll damage
// (every ray or attack) and Roll crit damage (×2); a spell with no attack roll gets Roll damage (or healing).
function spellRollButtons(roll) {
  const g = roll.groups[0];
  if (!g.attacks.length) return rollButton(roll, g.heal ? 'Roll healing' : 'Roll damage');
  if (!g.damage) return rollButton(roll, 'Roll attack');
  const n = g.attacks.length;
  return [
    rollButton(roll, 'Roll attack'),
    rollButton({ title: `${roll.title} ${g.heal ? 'healing' : 'damage'}`, groups: [{ attacks: [], damage: g.damage, times: n, heal: g.heal }] },
      g.heal ? 'Roll healing' : n > 1 ? `Roll damage (×${n})` : 'Roll damage'),
    rollButton({ title: `${roll.title} critical damage`, groups: [{ attacks: [], damage: g.damage, critMult: g.mult || 2 }] }, 'Roll crit damage'),
  ].join(' ');
}

// A spell's numbers cast by one class (Character tab): each attack, save DC, damage or healing with one d20 (it rolls
// the attack, the damage and, on a threat, the confirmation and critical damage, like a weapon's), and the spell
// resistance check; '' when it has nothing to roll or work out.
// strike: a magus's spellstrike weapon ({ name, group: its Roll group }, 2nd level): a melee touch spell's line gets a
// Spellstrike line with that weapon's attack and the spell's damage.
// (strike.closeRange: the Close Range arcana, so ray spells, ranged touch, can be delivered by spellstrike too.)
export function spellNumbersHtml(view, cls, level, spell, strike = null) {
  const ctx = spellContext({ cls, effectiveLevel: level, stats: view.stats, size: view.size, featChoices: view.featChoices,
                             flawMelee: view.flawFx.melee, flawRanged: view.flawFx.ranged, haveFeats: view.haveFeats, schoolBonus: view.schoolBonus,
                             intensified: view.intensified });
  const parts = spellLines(spell, ctx).flatMap(l => [`<span class="b-spell-num">${l.label ? `<b>${esc(l.label)}:</b> ` : ''}${esc(l.text)}${l.roll ? ` ${rollButton(l.roll)}` : ''}</span>`,
    ...(strike && (l.kind === 'melee touch' || (strike.closeRange && l.kind === 'ranged touch')) ? [(g => `<span class="b-spell-num b-strike"><b>Spellstrike with ${esc(strike.name)}:</b> ${esc(signed(g.attacks[0]))}${g.threat < 20 ? ` (${g.threat}–20)` : ''}, ${esc(g.damage)} + ${l.spellDamage ? esc(l.spellDamage) : 'the spell'}
      <small class="muted">(crit: weapon ×${g.mult || 2}${l.spellDamage ? ', spell ×2' : ''})</small> ${rollButton(spellstrikeRoll(`${spell.name}: spellstrike with ${strike.name}`, g, l.spellDamage, spell.name))}</span>`)(strike.group)] : [])]);
  const sr = srCheck(spell, ctx);
  if (sr) parts.push(`<span class="b-spell-num">SR: caster level check ${sr.bonus >= 0 ? '+' : ''}${sr.bonus} ${rollButton(sr)}</span>`);
  return parts.join('');
}

// A potion's, scroll's or wand's spell numbers (Character tab Gear): cast at the item's caster level, with the item's
// save DC (Core Rulebook: 10 + spell level + the lowest modifier able to cast it, half the spell level rounded down);
// attack rolls use the user's own. classes: the class data (the spell is worked out for a full caster on its list).
const FULL_CASTERS = ['wizard', 'sorcerer', 'cleric', 'oracle', 'druid', 'witch', 'shaman', 'psychic', 'arcanist', 'bard', 'inquisitor', 'alchemist'];
export function itemSpellNumbersHtml(view, classes, spell, cl) {
  const id = FULL_CASTERS.find(c => spell.levels[c] !== undefined && CASTING_ABILITY[c]) || Object.keys(spell.levels).find(c => CASTING_ABILITY[c]);
  const cls = id && classes.find(c => c.id === id);
  if (!cls) return '';
  const minMod = Math.floor(spell.levels[id] / 2);
  const stats = { ...view.stats, mod: { ...view.stats.mod, [CASTING_ABILITY[id]]: minMod } };
  return spellNumbersHtml({ ...view, stats, featChoices: [], haveFeats: [], schoolBonus: null }, cls, cl, spell);
}

// What My spells still needs, for the Spells tab's tint (tab-todo.js): spells known not yet chosen (a spontaneous
// caster, for the class My spells shows), or no spells at all (a caster who can cast already). The spell list loads
// when the character has spells, so before then none are chosen.
export function spellsLeftToChoose(app, view) {
  const none = { spellsLeft: 0, noSpells: false };
  if (!view.casting?.casting?.length) return none;
  if (!app.data.spells) return { spellsLeft: 0, noSpells: !app.state.spells.length };
  const { cls, table, maxLevel } = listClass(app, view);
  if (maxLevel < 0 || !app.data.spells.some(s => s.levels[cls.id] !== undefined)) return none;
  const byId = new Map(app.data.spells.map(s => [s.id, s]));
  const levels = app.state.spells.map(id => byId.get(id)?.levels[cls.id]).filter(lv => lv !== undefined);
  const known = (table?.rows || []).filter(r => r.known !== null && r.canCast);
  if (known.length) return { spellsLeft: known.reduce((n, r) => n + Math.max(0, r.known - levels.filter(lv => lv === r.spellLevel).length), 0), noSpells: false };
  return { spellsLeft: 0, noSpells: !levels.length };
}

function renderMySpells(app, view) {
  lineDetails.clear();
  const { cls, level, table, maxLevel } = listClass(app, view);
  const byId = new Map(app.data.spells.map(s => [s.id, s]));
  const chosen = app.state.spells.map(id => byId.get(id)).filter(Boolean);
  const hasList = app.data.spells.some(s => s.levels[cls.id] !== undefined);
  $('my-spells-card').hidden = !hasList && !chosen.length;
  if ($('my-spells-card').hidden) return;

  const known = new Map((table?.rows || []).filter(r => r.known !== null).map(r => [r.spellLevel, r.known]));
  const spontaneous = known.size > 0;
  $('my-spells-count').textContent = chosen.length ? `${chosen.length}` : '';
  $('my-spells-hint').textContent = spontaneous
    ? 'The spells your character knows. Your class table sets how many you can know at each spell level.'
    : 'The spells in your spellbook, or the ones you usually prepare. You prepare spells from these each day.';

  // Attack, damage and save DC for each spell, cast as this class.
  const ctx = spellContext({ cls, effectiveLevel: level, stats: view.stats, size: view.size, featChoices: view.featChoices,
                             flawMelee: view.flawFx.melee, flawRanged: view.flawFx.ranged,
                             haveFeats: view.haveFeats, schoolBonus: view.schoolBonus });
  const row = s => {
    const lines = spellLines(s, ctx);
    const sr = srCheck(s, ctx);
    const numbers = lines.map((l, i) => {
      const key = `${cls.id}|${s.id}|${i}`;
      if (l.why?.attack || l.why?.dc) lineDetails.set(key, { spell: s, line: l, cls });
      return `<span class="spell-line">${l.label ? `<b>${esc(l.label)}:</b> ` : ''}${esc(l.text)}` +
        `${l.roll ? ` ${spellRollButtons(l.roll)}` : ''}` +
        `${l.why?.attack || l.why?.dc ? ` <button type="button" class="skill-details q-details" data-spell-details="${esc(key)}" aria-label="What makes up these numbers" title="Details">?</button>` : ''}</span>`;
    });
    if (sr) numbers.push(`<span class="spell-line">Spell resistance: caster level check ${sr.bonus >= 0 ? '+' : ''}${sr.bonus} ${rollButton(sr, 'SR check')}</span>`);
    // One line: the spell, its main numbers (attack or save, damage) with their Roll buttons, and Details for the rest.
    const key = `spell-${cls.id}-${s.id}`;
    const open = openLines.has(key);
    const main = lines[0];
    return `<li class="line-card"><div class="fit-line spell-one">
        <button type="button" class="link item-link line-name" data-show-spell="${esc(s.id)}">${esc(s.name)}</button>
        ${main ? `<span class="wl-part">${main.label ? `<span class="wl-k">${esc(main.label)}</span> ` : ''}<b>${esc(main.text)}</b>${main.roll ? ` ${spellRollButtons(main.roll)}` : ''}</span>`
          : `<span class="wl-k">${esc(s.school || '')}${s.duration ? ` · ${esc(s.duration)}` : ''}</span>`}
        ${lines.length > 1 ? `<span class="wl-k">+${lines.length - 1} more</span>` : ''}
        <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${esc(key)}" aria-expanded="${open}" aria-label="Everything about ${esc(s.name)}" title="Details">?</button></div>
      <div class="line-more"${open ? '' : ' hidden'}>
        <span class="spell-row"><button type="button" class="skill-details" data-spell-pop="${esc(s.id)}" aria-label="${esc(s.name)} in a popup">About ${esc(s.name)}</button>
          <button type="button" class="link" data-remove-spell="${esc(s.id)}">remove</button></span>
        ${numbers.length ? `<span class="spell-numbers">${numbers.join('')}</span>` : '<p class="hint">No attack, save or damage to work out.</p>'}
      </div></li>`;
  };
  const groups = [];
  for (let lv = 0; lv <= 9; lv++) {
    const spells = chosen.filter(s => s.levels[cls.id] === lv).sort((a, b) => a.name.localeCompare(b.name));
    const limit = known.get(lv);
    if (!spells.length && limit === undefined) continue;
    const over = limit !== undefined && spells.length > limit;
    const count = limit !== undefined ? `${spells.length} of ${limit} known` : `${spells.length}`;
    const notYet = lv > maxLevel && spells.length ? ' · can\'t cast yet' : '';
    groups.push(`<div class="my-spell-level">
      <h3>${LEVEL_NAMES[lv]} <span class="count${over ? ' over' : ''}">${count}${notYet}</span>
        <button type="button" class="skill-details q-details" data-spell-level-why="${lv}" aria-label="How many spells of this level" title="Details">?</button></h3>
      ${spells.length ? `<ul class="my-spell-rows">${spells.map(row).join('')}</ul>`
        : '<p class="hint">None chosen yet.</p>'}
    </div>`);
  }
  // Spells that aren't on this class's list (e.g. chosen before changing class).
  const off = chosen.filter(s => s.levels[cls.id] === undefined);
  if (off.length) {
    groups.push(`<div class="my-spell-level"><h3>Not on the ${esc(cls.name.toLowerCase())} list <span class="count over">${off.length}</span></h3>
      <ul class="my-spell-rows">${off.map(row).join('')}</ul></div>`);
  }
  $('my-spells').innerHTML = groups.join('') ||
    '<p class="hint">No spells yet. Choose a spell below, then "Add to my spells".</p>';
  requestAnimationFrame(() => fitLines($('my-spells')));
}

// How many spells of one level the character keeps (My spells' level Details): known spells from the class table for
// spontaneous casters, otherwise a spellbook or list to prepare from; and whether they can be cast yet.
function popSpellLevel(app, lv) {
  const view = app.view;
  const { cls, table, maxLevel } = listClass(app, view);
  const row = (table?.rows || []).find(r => r.spellLevel === lv);
  const chosen = app.state.spells.map(id => app.data.spells.find(s => s.id === id)).filter(s => s && s.levels[cls.id] === lv);
  const known = row?.known ?? null;
  const rows = [['Chosen', String(chosen.length)],
    ...(known !== null ? [[`Spells known (${cls.name} table)`, String(known)]] : []),
    ...(row && row.prepared !== null && row.prepared !== undefined ? [['Prepared each day', String(row.prepared)]] : []),
    ...(row && lv > 0 && row.total !== null && row.total !== undefined ? [['Cast per day', String(row.total)]] : []),
    ['Can cast this level yet', lv <= maxLevel ? 'yes' : 'not yet']];
  app.openDetail(`${LEVEL_NAMES[lv]}: ${cls.name}`, `<table class="skill-why"><tbody>${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${esc(v)}</td></tr>`).join('')}</tbody></table>
    <p class="hint">${known !== null
      ? `A ${esc(cls.name.toLowerCase())} knows a set number of spells of each level (the class table) and casts any of them with the day\u2019s spells; ${chosen.length > known ? `you have ${chosen.length - known} too many here.` : `${known - chosen.length} more can be known.`}`
      : `A ${esc(cls.name.toLowerCase())} prepares spells each day from a spellbook or the whole class list; add the ones you use. There's no limit on how many you list here.`}
      The Spells per day table above shows where each number comes from.</p>`);
}

// The spell in a popup (the list's Details button): everything the side panel shows, with Add or Remove as a button.
// A spell in a popup with Add to my spells (or Remove) and, for a custom spell, Change. fromList: opened from the Add a
// spell list, so Add and Remove go back to the list (to add the next one) and Back to the list returns to it.
export function popSpell(app, id, fromList = false) {
  const spell = app.data.spells?.find(s => s.id === id);
  if (!spell) return;
  const { cls } = listClass(app, app.view);
  const mine = app.state.spells.includes(spell.id);
  const onList = spell.levels[cls.id] !== undefined;
  const back = () => { if (fromList) popSpellPicker(app, true); };
  const actions = [...(mine ? [{ label: 'Remove from my spells', run: () => { removeSpell(app, spell.id); back(); } }]
    : onList ? [{ label: 'Add to my spells', primary: true, run: () => { addSpell(app, spell.id); back(); } }] : []),
    ...(spell.custom ? [{ label: 'Change this custom spell', run: () => editCustomSpell(app, spell.id) }] : []),
    ...(fromList ? [{ label: 'Back to the list', run: back }] : [])];
  app.openDetail(spell.name, spellDetails(app, spell, cls, false), actions);
}

// Add a spell: the class's list in one column, by spell level (cantrips first) and A to Z within each, with a search
// box; levels you can't cast yet say so. "Every spell" lists all spells A to Z instead (search to narrow it). A
// character with several spellcasting classes picks whose list. Make a custom spell is at the bottom.
const pick = { q: '', all: false, scroll: 0 };
const ALL_LIMIT = 150;
function spellPickHtml(app) {
  const { cls, maxLevel } = listClass(app, app.view);
  const spells = app.data.spells;
  const onList = spells.filter(s => s.levels[cls.id] !== undefined);
  const q = pick.q.trim().toLowerCase();
  const all = pick.all || !onList.length;
  const has = s => !q || s.name.toLowerCase().includes(q);
  if (all) {
    const hits = spells.filter(has).sort((a, b) => (q ? b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) : 0) || a.name.localeCompare(b.name));
    return `<p class="hint">${hits.length > ALL_LIMIT ? `Showing ${ALL_LIMIT} of ${hits.length.toLocaleString()} spells: search to narrow the list.` : `${hits.length} spell${hits.length === 1 ? '' : 's'}.`}
        ${onList.length ? '' : `${esc(cls.name)}${cls.id ? 's don\u2019t have a spell list' : ''}: only spells on your list can be added.`}</p>
      <div class="pick-column">${hits.slice(0, ALL_LIMIT).map(s => spellRow(app, s, levelText(app, s))).join('')}</div>`;
  }
  let html = '';
  for (let lv = 0; lv <= 9; lv++) {
    const list = onList.filter(s => s.levels[cls.id] === lv && has(s)).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    html += `<h3 class="pick-heading">${LEVEL_NAMES[lv]} <span class="count">${list.length}${lv > maxLevel ? ' · not yet' : ''}</span></h3>
      <div class="pick-column${lv > maxLevel ? ' later' : ''}">${list.map(s => spellRow(app, s)).join('')}</div>`;
  }
  return html || '<p class="hint">No spells match.</p>';
}
export async function popSpellPicker(app, keepPlace = false) {
  if (!app.data.spells) await app.loadSpells();
  const { withList, cls } = listClass(app, app.view);
  const onList = app.data.spells.some(s => s.levels[cls.id] !== undefined);
  app.openDetail(onList ? `Add a ${cls.name.toLowerCase()} spell` : 'Spells', `
    ${withList.length > 1 ? `<label class="row">Spell list for <select class="spell-pick-class">${withList.map(c => `<option value="${esc(c.id)}"${c.id === cls.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <input type="search" class="pick-search" placeholder="Search spells by name" autocomplete="off" aria-label="Search spells" value="${esc(pick.q)}">
    ${onList ? `<label class="check-row"><input type="checkbox" class="spell-pick-all"${pick.all ? ' checked' : ''}> Every spell, not just the ${esc(cls.name.toLowerCase())} list</label>` : ''}
    <div class="spell-pick-list">${spellPickHtml(app)}</div>
    <p class="hint">Tap a spell to read it and add it to My spells. Not here? Make your own:</p>`,
  [{ label: 'Make a custom spell', run: () => { sDraft = freshSpell(); spellCustomOpen = true; renderSpellList(app, app.view); $('spell-add-card').scrollIntoView({ block: 'start' }); } }]);
  const body = document.getElementById('detail-body');
  const draw = () => { body.querySelector('.spell-pick-list').innerHTML = spellPickHtml(app); };
  body.querySelector('.pick-search').addEventListener('input', e => { pick.q = e.target.value; draw(); });
  body.querySelector('.spell-pick-all')?.addEventListener('change', e => { pick.all = e.target.checked; draw(); });
  body.querySelector('.spell-pick-class')?.addEventListener('change', e => { listClassId = e.target.value; renderSpellList(app, app.view); popSpellPicker(app); });
  const dlg = document.getElementById('detail-dialog');
  // Back from a spell: the list where you left it.
  dlg.scrollTop = keepPlace ? pick.scroll : 0;
  body.querySelector('.spell-pick-list').addEventListener('click', e => {
    const b = e.target.closest('[data-spell-pick]');
    if (!b) return;
    pick.scroll = dlg.scrollTop;
    popSpell(app, b.dataset.spellPick, true);
  });
}
function editCustomSpell(app, id) {
  const d = (app.state.customSpells || []).find(x => x.id === id);
  if (!d) return;
  sDraft = { ...freshSpell(), ...d };
  spellCustomOpen = true;
  app.showTab?.('spells');
  renderSpellList(app, app.view);
  $('spell-add-card').scrollIntoView({ block: 'start' });
}

function addSpell(app, id) {
  if (!app.state.spells.includes(id)) app.update({ spells: [...app.state.spells, id] });
}

function removeSpell(app, id) {
  app.update({ spells: app.state.spells.filter(x => x !== id) });
}

// Details popup for one spell line: its attack bonus and save DC, piece by piece, and how the damage was worked out.
function showLineDetails(app, key) {
  const d = lineDetails.get(key);
  if (!d) return;
  const { spell, line, cls } = d;
  const { state } = app;
  const table = (rows, total) => `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}${r.note
    ? ` <small class="muted">(${esc(r.note)})</small>` : ''}</td><td class="num">${esc(r.text ?? signed(r.value))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(total)}</b></td></tr></tfoot></table>`;
  const w = line.why;
  let html = '';
  if (w.attack) {
    // Effects on attack rolls named one by one (with what the stacking rules take off).
    const fxTotal = w.attack.find(r => r.label === 'Active effects on attack rolls')?.value || 0;
    const effects = activeBonuses(app.view.buffs, app.view.customAll).filter(x => x.target === 'attack')
      .map(e => ({ label: `Effect: ${e.source}`, value: e.value, note: `${e.type} bonus` }));
    const listed = effects.reduce((n, e) => n + e.value, 0);
    const rows = [...w.attack.filter(r => r.label !== 'Active effects on attack rolls'), ...effects,
      ...(listed !== fxTotal ? [{ label: 'Effects of the same type do not stack', value: fxTotal - listed }] : [])];
    html += `<h3>${w.maneuver ? 'Combat maneuver check' : 'Attack roll'}${w.count > 1 ? ` (each of ${w.count})` : ''}</h3>${table(rows, signed(w.attackTotal))}`;
  }
  if (w.dc) html += `<h3>Saving throw DC</h3>${table(w.dc, String(w.dcTotal))}`;
  if (w.damage.length) {
    html += `<h3>Amount</h3><p>${w.damage.map(x => `${esc(String(x.amount))} <small class="muted">(${/@cl/.test(x.formula)
      ? `grows with caster level; yours is ${w.cl}` : 'the same at any caster level'})</small>`).join('<br>')}</p>`;
  }
  app.openDetail(`${spell.name} (${cls.name})${line.label ? `: ${line.label}` : ''}`, html);
}

export function initSpellList(app) {
  initPrepared(app);
  // Add a spell opens the list popup.
  $('spell-add-buttons').addEventListener('click', e => { if (e.target.closest('[data-spell-choose]')) popSpellPicker(app); });
  const csBox = $('spell-custom-wrap');
  csBox.addEventListener('input', e => {
    const k = e.target.dataset.cs;
    if (['name', 'castingTime', 'range', 'duration', 'damageType', 'description'].includes(k)) sDraft[k] = e.target.value;
    else if (['count', 'max'].includes(k)) sDraft[k] = Math.max(1, Math.min(40, Math.round(Number(e.target.value)) || 1));
  });
  csBox.addEventListener('change', e => {
    const k = e.target.dataset.cs;
    if (!k || ['name', 'castingTime', 'range', 'duration', 'damageType', 'description', 'count', 'max'].includes(k)) return;
    sDraft[k] = k === 'sr' ? e.target.checked : k === 'level' ? Number(e.target.value) : e.target.value;
    renderSpellCustom();
  });
  csBox.addEventListener('click', e => {
    if (e.target.closest('[data-cs-clear]')) { sDraft = freshSpell(); renderSpellCustom(); return; }
    if (e.target.closest('[data-cs-cancel]')) { sDraft = freshSpell(); spellCustomOpen = false; renderSpellList(app, app.view); return; }
    if (e.target.closest('[data-cs-delete]')) {
      const id = sDraft.id;
      if (!confirm(`Delete ${sDraft.name || 'this spell'}? It comes off My spells and any prepared slot.`)) return;
      const prepared = Object.fromEntries(Object.entries(app.state.prepared || {}).map(([c, byLv]) => [c, Object.fromEntries(Object.entries(byLv)
        .map(([lv, slots]) => [lv, slots.map(x => (x?.id === id ? { id: '', cast: false } : x))]))]));
      app.update({ customSpells: app.state.customSpells.filter(x => x.id !== id), spells: app.state.spells.filter(x => x !== id), prepared });
      sDraft = freshSpell(); spellCustomOpen = false; renderSpellList(app, app.view);
      return;
    }
    if (!e.target.closest('[data-cs-save]')) return;
    const def = { ...sDraft, name: sDraft.name.trim() || 'Custom spell' };
    const list = app.state.customSpells || [];
    if (def.id) app.update({ customSpells: list.map(x => (x.id === def.id ? def : x)) });
    else {
      def.id = `cs-${Date.now().toString(36)}`;
      app.update({ customSpells: [...list, def], spells: [...app.state.spells, def.id] });
    }
    sDraft = freshSpell();
    spellCustomOpen = false;
    renderSpellList(app, app.view);
  });
  // Add/remove buttons in My spells (app.update re-renders the whole tab).
  for (const el of [$('my-spells')]) {
    el.addEventListener('click', e => {
      const add = e.target.closest('[data-add-spell]');
      if (add) addSpell(app, add.dataset.addSpell);
      const remove = e.target.closest('[data-remove-spell]');
      if (remove) removeSpell(app, remove.dataset.removeSpell);
      const show = e.target.closest('[data-show-spell]');
      if (show) showSpell(app, show.dataset.showSpell);
      const why = e.target.closest('[data-spell-details]');
      if (why) showLineDetails(app, why.dataset.spellDetails);
      const pop = e.target.closest('[data-spell-pop]');
      if (pop && el.id === 'my-spells') popSpell(app, pop.dataset.spellPop);
      const lv = e.target.closest('[data-spell-level-why]');
      if (lv) popSpellLevel(app, Number(lv.dataset.spellLevelWhy));
    });
  }
}

// Prepared casters' spells for today. Spellbook classes prepare from their spellbook (My spells); the others (clerics,
// druids...) from their whole class list, their own My spells first.
const SPELLBOOK = new Set(['wizard', 'witch', 'magus', 'arcanist', 'alchemist', 'investigator']);
export function preparers(app, view) {
  return view.casting.casting.map(c => ({ cls: c.cls, table: spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores: view.stats.scores,
                                                                            extraSlot: app.extraSlotOn?.(c.cls.id), knownChange: app.knownChange?.(c.cls.id) || 0,
                                                                            diminished: !!app.diminished?.(c.cls.id) }) }))
    .filter(x => x.table && (x.cls.id === 'arcanist' || x.table.rows.every(r => r.known === null)));
}
// How many slots of each spell level today: the spells per day (cantrips: the number prepared); an arcanist prepares
// the "spells prepared" number and casts from them.
export const slotCount = (cls, r) => (!r.canCast ? 0 : cls.id === 'arcanist' ? r.prepared ?? 0 : r.total ?? 0);

function renderPrepared(app, view) {
  const list = preparers(app, view);
  $('prepared-card').hidden = !list.length;
  if (!list.length) return;
  const byId = new Map(app.data.spells.map(s => [s.id, s]));
  const mine = new Set(app.state.spells);
  let filled = 0, slots = 0;
  const html = list.map(({ cls, table }) => {
    const prep = app.state.prepared[cls.id] || {};
    const levels = table.rows.filter(r => slotCount(cls, r) > 0).map(r => {
      const lv = r.spellLevel;
      const n = slotCount(cls, r);
      const saved = prep[lv] || [];
      // The spells that fit a slot of this level: this level or lower from the spellbook; for the others, this level from
      // the whole list and lower ones from their My spells (keeping the lists short).
      const pool = (SPELLBOOK.has(cls.id) ? [...mine].map(id => byId.get(id))
        : app.data.spells.filter(s => s.levels[cls.id] === lv || (mine.has(s.id) && s.levels[cls.id] < lv)))
        .filter(s => s && s.levels[cls.id] !== undefined && s.levels[cls.id] <= lv)
        .sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || (b.levels[cls.id] - a.levels[cls.id]) || a.name.localeCompare(b.name));
      const extraName = r.extra && EXTRA_SLOTS[cls.id]?.name;
      // A domain slot holds one of your domains' spells of this level (or a lower one), not any spell.
      const letters = x => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
      const byName = new Map(app.data.spells.map(x => [letters(x.name), x]));
      const domainPool = (app.domainSpells?.(cls.id) || []).filter(d => d.level <= lv && d.level > 0)
        .map(d => ({ spell: byName.get(letters(d.name)), d })).filter(x => x.spell)
        .sort((a, b) => b.d.level - a.d.level || a.spell.name.localeCompare(b.spell.name));
      const rows = Array.from({ length: n }, (_, i) => {
        const slot = saved[i] || { id: '', cast: false };
        const s = byId.get(slot.id);
        slots++;
        if (s) filled++;
        const key = `${cls.id}|${lv}|${i}`;
        const label = x => `${x.name}${x.levels[cls.id] < lv ? ` (${x.levels[cls.id] === 0 ? 'cantrip' : LEVEL_NAMES[x.levels[cls.id]].replace(' spells', '')}, in a higher slot)` : ''}`;
        const domainSlot = extraName && i === n - 1 && domainPool.length;
        const opts = domainSlot
          ? domainPool.map(({ spell: x, d }) => `<option value="${esc(x.id)}"${x.id === slot.id ? ' selected' : ''}>${esc(`${x.name} (${d.domain}${d.level < lv ? `, ${LEVEL_NAMES[d.level].replace(' spells', '')}` : ''})`)}</option>`).join('')
          : pool.map(x => `<option value="${esc(x.id)}"${x.id === slot.id ? ' selected' : ''}>${esc(label(x))}</option>`).join('');
        return `<li class="prep-slot${slot.cast ? ' cast' : ''}">
          ${extraName && i === n - 1 ? `<span class="tag">${esc(extraName)} slot</span>` : ''}
          <select data-prep="${esc(key)}" aria-label="${esc(LEVEL_NAMES[lv])} slot ${i + 1}"><option value="">— empty —</option>${opts}</select>
          ${s ? `<button type="button" class="skill-details" data-prep-pop="${esc(s.id)}" aria-label="${esc(s.name)} in a popup">About</button>` : ''}
          ${lv > 0 && cls.id !== 'arcanist' && s ? `<label class="check-row small"><input type="checkbox" data-prep-cast="${esc(key)}"${slot.cast ? ' checked' : ''}> cast</label>` : ''}
        </li>`;
      }).join('');
      const used = saved.slice(0, n).filter(x => x.cast && byId.has(x.id)).length;
      const ready = saved.slice(0, n).filter(x => byId.has(x.id)).length;
      return `<div class="my-spell-level"><h3>${LEVEL_NAMES[lv]} <span class="count">${ready} of ${n} prepared${lv > 0 && used ? `, ${used} cast` : ''}${lv === 0 ? ' · cast at will' : ''}</span></h3>
        ${pool.length ? `<ul class="plain-list prep-slots">${rows}</ul>`
          : `<p class="hint">${SPELLBOOK.has(cls.id) ? 'No spells of this level in your spellbook yet: add them to My spells.' : 'No spells of this level on the list.'}</p>`}
        ${extraName ? `<p class="hint small">The ${esc(extraName.toLowerCase())} slot holds a ${cls.id === 'wizard' ? 'spell of your arcane school' : cls.id === 'shaman' ? 'spirit magic spell' : 'domain spell'}.</p>` : ''}</div>`;
    }).join('');
    return `${list.length > 1 ? `<h3>${esc(cls.name)}</h3>` : ''}${cls.id === 'arcanist' ? '<p class="hint">An arcanist prepares these and casts any of them with the spell slots on the Spells per day table.</p>' : ''}
      ${SPELLBOOK.has(cls.id) ? '' : `<p class="hint">A ${esc(cls.name.toLowerCase())} prepares from the whole ${esc(cls.name.toLowerCase())} list; your My spells come first in each list.</p>`}
      ${levels || '<p class="hint">No spell slots yet.</p>'}
      <div class="slot-buttons"><button type="button" data-prep-newday="${esc(cls.id)}">New day (clear the cast ticks)</button>
        <button type="button" data-prep-clear="${esc(cls.id)}">Clear all prepared</button></div>`;
  }).join('');
  $('prepared-count').textContent = slots ? `${filled} of ${slots}` : '';
  $('prepared').innerHTML = html;
}

// Changes to today's prepared spells: fill or empty a slot, tick it cast, a new day, or clear all.
function initPrepared(app) {
  const setSlot = (key, change) => {
    const [cid, lv, i] = key.split('|');
    const prepared = structuredClone(app.state.prepared);
    const slots = ((prepared[cid] ??= {})[lv] ??= []);
    while (slots.length <= Number(i)) slots.push({ id: '', cast: false });
    Object.assign(slots[Number(i)], change);
    app.update({ prepared });
  };
  $('prepared').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.prep) setSlot(t.dataset.prep, { id: t.value, cast: false });
    else if (t.dataset.prepCast) setSlot(t.dataset.prepCast, { cast: t.checked });
  });
  $('prepared').addEventListener('click', e => {
    const pop = e.target.closest('[data-prep-pop]');
    if (pop) { popSpell(app, pop.dataset.prepPop); return; }
    const day = e.target.closest('[data-prep-newday]');
    if (day) {
      const prepared = structuredClone(app.state.prepared);
      for (const slots of Object.values(prepared[day.dataset.prepNewday] || {})) for (const s of slots) s.cast = false;
      app.update({ prepared });
      return;
    }
    const clear = e.target.closest('[data-prep-clear]');
    if (clear && confirm('Empty every prepared spell slot?')) {
      const prepared = structuredClone(app.state.prepared);
      delete prepared[clear.dataset.prepClear];
      app.update({ prepared });
    }
  });
}

// The Add spells card: Add a spell (the list popup), and the Custom spell builder when it's open.
let spellCustomOpen = false;
let sDraft = null;     // the custom spell being made or changed
const freshSpell = () => ({ id: '', name: '', level: 1, school: 'evocation', castingTime: '1 standard action', range: 'close (25 ft. + 5 ft./2 levels)',
  duration: 'instantaneous', attack: 'none', save: 'none', saveEffect: 'half', sr: true, dice: 'none', scaling: 'level', count: 1, max: 5, damageType: '', description: '' });
function renderSpellButtons(cls, onList) {
  $('spell-add-buttons').innerHTML = `<button type="button" class="primary" data-spell-choose>${onList.length ? 'Add a spell' : 'Look up a spell'}</button>`;
  $('spell-custom-wrap').hidden = !spellCustomOpen;
  if (spellCustomOpen) renderSpellCustom();
}
function renderSpellCustom() {
  sDraft ??= freshSpell();
  const d = sDraft;
  const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(String(k))}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  $('spell-custom-wrap').innerHTML = `<div class="custom-builder">
    <div class="custom-grid">
      <label>Name <input type="text" data-cs="name" value="${esc(d.name)}" placeholder="e.g. Frost lance" maxlength="60"></label>
      <label>Spell level <select data-cs="level">${opt(Array.from({ length: 10 }, (_, i) => [i, i === 0 ? '0 (cantrip)' : String(i)]), d.level)}</select></label>
      <label>School <select data-cs="school">${opt(CS_SCHOOLS.map(x => [x, x]), d.school)}</select></label>
      <label>Casting time <input type="text" data-cs="castingTime" value="${esc(d.castingTime)}" maxlength="40"></label>
      <label>Range <input type="text" data-cs="range" value="${esc(d.range)}" maxlength="60"></label>
      <label>Duration <input type="text" data-cs="duration" value="${esc(d.duration)}" maxlength="60"></label>
    </div>
    <div class="custom-grid">
      <label>Attack roll <select data-cs="attack">${opt([['none', 'none'], ['melee touch', 'melee touch'], ['ranged touch', 'ranged touch (a ray)']], d.attack)}</select></label>
      <label>Saving throw <select data-cs="save">${opt([['none', 'none'], ['fort', 'Fortitude'], ['ref', 'Reflex'], ['will', 'Will']], d.save)}</select></label>
      ${d.save !== 'none' ? `<label>On a save <select data-cs="saveEffect">${opt([['half', 'half'], ['negates', 'negates'], ['partial', 'partial']], d.saveEffect)}</select></label>` : ''}
      <label class="check-row"><input type="checkbox" data-cs="sr"${d.sr ? ' checked' : ''}> Spell resistance applies</label>
    </div>
    <div class="custom-grid">
      <label>Damage dice <select data-cs="dice">${opt([['none', 'none'], ...CS_DIE_SIZES.map(x => [x, x])], d.dice)}</select></label>
      ${d.dice !== 'none' ? `<label>How many <select data-cs="scaling">${opt(CS_SCALINGS, d.scaling)}</select></label>
        ${d.scaling === 'flat' ? `<label>Dice <input type="number" data-cs="count" value="${d.count}" min="1" max="40" inputmode="numeric"></label>`
          : `<label>At most <input type="number" data-cs="max" value="${d.max}" min="1" max="40" inputmode="numeric"></label>`}
        <label>Damage type <input type="text" data-cs="damageType" value="${esc(d.damageType)}" placeholder="fire, cold..." maxlength="20"></label>` : ''}
    </div>
    <label>What it does <textarea data-cs="description" rows="3" maxlength="2000" placeholder="The spell's full text">${esc(d.description)}</textarea></label>
    <p class="hint">${d.id ? 'Changes apply wherever it\u2019s chosen or prepared.' : 'It goes on your casting classes\u2019 lists at that level and into My spells; its attack, save DC and damage are worked out like any spell\u2019s.'}</p>
    <div class="line-controls"><button type="button" class="primary" data-cs-save>${d.id ? 'Save changes' : 'Add to my spells'}</button>
      <button type="button" data-cs-clear>${d.id ? 'Stop changing it' : 'Clear'}</button>
      ${d.id ? '<button type="button" data-cs-delete>Delete this spell</button>' : ''}
      <button type="button" data-cs-cancel>Cancel</button></div></div>`;
}

export async function renderSpellList(app, view) {
  if (!app.data.spells) {
    $('spell-add-buttons').innerHTML = '<p class="hint">Loading spells…</p>';
    await app.loadSpells();
    view = app.view;  // the character may have changed while loading
  }
  const { cls } = listClass(app, view);
  renderMySpells(app, view);
  renderPrepared(app, view);
  const onList = app.data.spells.filter(s => s.levels[cls.id] !== undefined);
  $('spell-add-title').textContent = onList.length ? `Add ${cls.name.toLowerCase()} spells` : 'Spells';
  renderSpellButtons(cls, onList);
}

// Used by search and My spells: open a spell in a popup (even one that isn't on the class list).
export async function showSpell(app, id) {
  if (!app.data.spells) await app.loadSpells();
  popSpell(app, id);
}
