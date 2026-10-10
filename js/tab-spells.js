// Spells tab: the character's chosen spells, and their class spell list (grouped by spell level) with a side
// panel for the spell being looked at.
import { openLines, fitLines, $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { activeBonuses } from './effects.js';
import { spellsPerDay, EXTRA_SLOTS } from './rules.js';
import { spellContext, spellLines, srCheck } from './spell-math.js';
import { rollButton } from './roll-ui.js';

let selectedId = null;
// The numbers behind each spell line shown in My spells, by key, for its Details popup.
const lineDetails = new Map();
let listClassId = null;  // which class's spell list is shown, for characters with several

// The classes that have a spell list, and the one being shown, with its effective level (prestige classes can
// raise it) and the highest spell level it can cast.
function listClass(app, view) {
  const withList = view.classes.filter(c => app.data.spells.some(s => s.levels[c.id] !== undefined));
  const cls = withList.find(c => c.id === listClassId) || withList[0] || view.cls;
  const cast = view.casting.casting.find(c => c.cls.id === cls.id);
  const level = cast ? cast.effectiveLevel : (view.counts.find(e => e.cls.id === cls.id)?.level || 1);
  const table = spellsPerDay({ cls, level, scores: view.stats.scores, knownChange: app.knownChange?.(cls.id) || 0, diminished: !!app.diminished?.(cls.id) });
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
    ${button && withButton ? `<div class="slot-buttons">${button}</div>` : ''}
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

function renderPanel(app, view) {
  const spell = app.data.spells?.find(s => s.id === selectedId);
  $('spell-panel').innerHTML = spell ? spellDetails(app, spell, listClass(app, view).cls)
    : '<p class="hint">Choose a spell to see its details.</p>';
  document.querySelectorAll('#spell-list [data-spell]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.spell === selectedId)));
}

// A spell button in a list; spells the character has are marked with a tick.
function spellButton(app, s) {
  const mine = app.state.spells.includes(s.id);
  return `<li class="with-details"><button type="button" data-spell="${esc(s.id)}"${mine ? ' class="mine"' : ''}>` +
    `${mine ? '<span class="status met" title="In my spells">✓</span>' : ''}${esc(s.name)}<small>${esc(s.school || '')}</small></button>` +
    `<button type="button" class="skill-details" data-spell-pop="${esc(s.id)}" aria-label="${esc(s.name)} in a popup">Details</button></li>`;
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
                             haveFeats: view.haveFeats });
  const row = s => {
    const lines = spellLines(s, ctx);
    const sr = srCheck(s, ctx);
    const numbers = lines.map((l, i) => {
      const key = `${cls.id}|${s.id}|${i}`;
      if (l.why?.attack || l.why?.dc) lineDetails.set(key, { spell: s, line: l, cls });
      return `<span class="spell-line">${l.label ? `<b>${esc(l.label)}:</b> ` : ''}${esc(l.text)}` +
        `${l.roll ? ` ${spellRollButtons(l.roll)}` : ''}` +
        `${l.why?.attack || l.why?.dc ? ` <button type="button" class="skill-details" data-spell-details="${esc(key)}" aria-label="What makes up these numbers">Details</button>` : ''}</span>`;
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
        <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${esc(key)}" aria-expanded="${open}" aria-label="Everything about ${esc(s.name)}">Details</button></div>
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
        <button type="button" class="skill-details" data-spell-level-why="${lv}" aria-label="How many spells of this level">Details</button></h3>
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
function popSpell(app, id) {
  const spell = app.data.spells?.find(s => s.id === id);
  if (!spell) return;
  const { cls } = listClass(app, app.view);
  const mine = app.state.spells.includes(spell.id);
  const onList = spell.levels[cls.id] !== undefined;
  const actions = mine ? [{ label: 'Remove from my spells', run: () => removeSpell(app, spell.id) }]
    : onList ? [{ label: 'Add to my spells', primary: true, run: () => addSpell(app, spell.id) }] : [];
  app.openDetail(spell.name, spellDetails(app, spell, cls, false), actions);
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
    html += `<h3>Attack roll${w.count > 1 ? ` (each of ${w.count})` : ''}</h3>${table(rows, signed(w.attackTotal))}`;
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
  $('spell-filter').addEventListener('input', () => renderSpellList(app, app.view));
  $('spell-filter-form').addEventListener('submit', e => { e.preventDefault(); renderSpellList(app, app.view); });
  $('spell-all').addEventListener('change', () => renderSpellList(app, app.view));
  $('spell-class').addEventListener('change', e => { listClassId = e.target.value; renderSpellList(app, app.view); });
  $('spell-list').addEventListener('click', e => {
    const pop = e.target.closest('[data-spell-pop]');
    if (pop) { popSpell(app, pop.dataset.spellPop); return; }
    const btn = e.target.closest('[data-spell]');
    if (!btn) return;
    selectedId = btn.dataset.spell;
    renderPanel(app, app.view);
  });
  // Add/remove buttons in the side panel and in My spells (app.update re-renders the whole tab).
  for (const el of [$('spell-panel'), $('my-spells')]) {
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
function preparers(app, view) {
  return view.casting.casting.map(c => ({ cls: c.cls, table: spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores: view.stats.scores,
                                                                            extraSlot: app.extraSlotOn?.(c.cls.id), knownChange: app.knownChange?.(c.cls.id) || 0 }) }))
    .filter(x => x.table && (x.cls.id === 'arcanist' || x.table.rows.every(r => r.known === null)));
}
// How many slots of each spell level today: the spells per day (cantrips: the number prepared); an arcanist prepares
// the "spells prepared" number and casts from them.
const slotCount = (cls, r) => (!r.canCast ? 0 : cls.id === 'arcanist' ? r.prepared ?? 0 : r.total ?? 0);

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
      const rows = Array.from({ length: n }, (_, i) => {
        const slot = saved[i] || { id: '', cast: false };
        const s = byId.get(slot.id);
        slots++;
        if (s) filled++;
        const key = `${cls.id}|${lv}|${i}`;
        const label = x => `${x.name}${x.levels[cls.id] < lv ? ` (${x.levels[cls.id] === 0 ? 'cantrip' : LEVEL_NAMES[x.levels[cls.id]].replace(' spells', '')}, in a higher slot)` : ''}`;
        const opts = pool.map(x => `<option value="${esc(x.id)}"${x.id === slot.id ? ' selected' : ''}>${esc(label(x))}</option>`).join('');
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

export async function renderSpellList(app, view) {
  if (!app.data.spells) {
    $('spell-list').innerHTML = '<p class="hint">Loading spells…</p>';
    await app.loadSpells();
    view = app.view;  // the character may have changed while loading
  }
  const { withList, cls, maxLevel } = listClass(app, view);
  $('spell-class-row').hidden = withList.length < 2;
  $('spell-class').innerHTML = withList.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('spell-class').value = cls.id;
  renderMySpells(app, view);
  renderPrepared(app, view);
  const all = app.data.spells;
  const onList = all.filter(s => s.levels[cls.id] !== undefined);
  const filter = $('spell-filter').value.trim().toLowerCase();
  // Classes without a spell list can still search every spell.
  $('spell-all').closest('label').hidden = !onList.length;
  const searchAll = $('spell-all').checked || !onList.length;
  $('spell-list-title').textContent = onList.length ? `${cls.name} spells (${onList.length})` : 'Spells';

  if (searchAll) {
    if (filter.length < 2) {
      $('spell-list').innerHTML = `<p class="hint">${onList.length ? '' : `${esc(cls.name)}s don't have a spell list. `}` +
        `Type at least 2 letters to search all ${all.length.toLocaleString()} spells.</p>`;
    } else {
      const hits = all.filter(s => s.name.toLowerCase().includes(filter));
      $('spell-list').innerHTML = hits.length ? `<section class="list-group">
        <h3 class="list-heading">All spells <span class="count">${hits.length}</span></h3>
        <ul class="pick-list">${hits.slice(0, 200).map(s => spellButton(app, s)).join('')}</ul>
      </section>` : '<p class="hint">No spells match.</p>';
    }
    renderPanel(app, view);
    return;
  }

  const groups = [];
  for (let lv = 0; lv <= 9; lv++) {
    const spells = onList.filter(s => s.levels[cls.id] === lv && (!filter || s.name.toLowerCase().includes(filter)));
    if (!spells.length) continue;
    const later = lv > maxLevel;
    groups.push(`<section class="list-group">
      <h3 class="list-heading">${LEVEL_NAMES[lv]} <span class="count">${spells.length}${later ? ' · not yet' : ''}</span></h3>
      <ul class="pick-list${later ? ' later' : ''}">${spells.map(s => spellButton(app, s)).join('')}</ul>
    </section>`);
  }
  $('spell-list').innerHTML = groups.join('') || '<p class="hint">No spells match.</p>';
  renderPanel(app, view);
}

// Used by search: open a spell in the side panel (even one that isn't on the class list).
export async function showSpell(app, id) {
  selectedId = id;
  await renderSpellList(app, app.view);
  document.querySelector(`#spell-list [data-spell="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
  $('spell-panel').scrollIntoView({ block: 'nearest' });
}
