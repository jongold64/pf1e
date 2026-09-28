// The printable character sheet: everything on one page flow, black on white, built from the same numbers the
// tabs show. app.js fills #print-sheet with buildSheet() just before printing.
import { esc, signed } from './dom.js';
import { ABILITIES, formatBab, spellsPerDay, combatManeuvers, initiative, channelEnergy, layOnHands } from './rules.js';
import { spellContext, spellLines } from './spell-math.js';

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ORDINAL = ['0', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

const section = (title, body) => (body ? `<section class="sheet-section"><h2>${esc(title)}</h2>${body}</section>` : '');
const facts = rows => `<dl class="sheet-facts">${rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const table = (head, rows) => (rows.length ? `<table class="sheet-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '');

// parts: { app, view, name, weapons (weaponSummaries), skills ([{ name, ranks, total }]), moneyRows ([[label, value]]),
//          featLabel(slot) -> "Weapon Focus (longsword)" or null, extraSlotOn(clsId) }
export function buildSheet({ app, view, name, weapons, skills, moneyRows, featLabel, extraSlotOn }) {
  const { state, data } = app;
  const { race, stats } = view;
  const classes = view.counts.map(e => `${e.cls.name} ${e.level}`).join(' / ');
  const { cmb, cmd, maneuvers } = combatManeuvers(stats, race.size, view.haveFeats);
  const init = initiative(stats, view.haveFeats);

  const header = `<header class="sheet-header"><h1>${esc(name)}</h1>
    <p>${esc(race.name)} ${esc(classes)} · level ${view.level} · ${esc(race.size)} ${esc(race.type || '')}</p></header>`;

  const abilities = table(['Ability', 'Score', 'Modifier'],
    ABILITIES.map(a => [ABILITY_NAMES[a], stats.scores[a], signed(stats.mod[a])]));

  const worn = [[view.gear.armor, state.armorEnh], [view.gear.shield, state.shieldEnh]].filter(([a]) => a)
    .map(([a, enh]) => `${enh ? `+${enh} ` : ''}${a.name}`).join(', ');
  const defense = facts([
    ['Hit points', stats.hp], ['Armor Class', stats.ac], ['Touch', stats.touch], ['Flat-footed', stats.flatFooted],
    ['Fortitude', signed(stats.fort)], ['Reflex', signed(stats.ref)], ['Will', signed(stats.will)], ['CMD', cmd],
    ['Armor', worn || 'none'],
  ]);
  const offense = facts([
    ['Speed', view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.`], ['Initiative', signed(init)],
    ['Base attack', formatBab(stats.bab)], ['CMB', signed(cmb)],
    ...maneuvers.map(m => [m.name, `CMB ${signed(m.cmb)}, CMD ${m.cmd}`]),
    ...channelEnergy(stats, view.haveFeats).map(c => [`Channel energy${c.source !== 'Cleric' ? ` (${c.source})` : ''}`,
      `${c.dice} ${c.energy}, DC ${c.dc}, ${c.uses}/day`]),
    ...layOnHands(stats).map(l => [l.name, `${l.dice}, ${l.uses}/day`]),
  ]) + table(['Weapon', 'Attack', 'Damage', 'Critical', 'Range'],
    weapons.map(w => [w.name + (w.proficient ? '' : ' (not proficient, −4)'), w.attack, w.damage, w.critical, w.range]))
    + (weapons.some(w => w.extra.length) ? `<ul class="sheet-list">${weapons.flatMap(w => w.extra.map(x => `<li>${esc(w.name)}: ${esc(x)}</li>`)).join('')}</ul>` : '');

  // Two side-by-side halves, so the long skill list takes half the height.
  const skillRows = skills.map(s => [s.name, s.ranks || '', s.total]);
  const half = Math.ceil(skillRows.length / 2);
  const skillTable = skillRows.length ? `<div class="sheet-columns even">${table(['Skill', 'Ranks', 'Total'], skillRows.slice(0, half))}
    ${table(['Skill', 'Ranks', 'Total'], skillRows.slice(half))}</div>` : '';

  const feats = view.slots.map(s => featLabel(s)).filter(Boolean);
  const featList = `<ul class="sheet-list">${[...feats, ...view.granted.map(n => `${n} (class)`)].map(n => `<li>${esc(n)}</li>`).join('')
    || '<li>None</li>'}</ul>`;

  const traits = (race.traits || []).filter(t => !t.kind).map(t => t.name);
  const racial = `<p>${esc(traits.join(', ') || '—')}</p>`;
  const features = view.counts.map(e => {
    const specials = e.cls.progression.slice(0, e.level).flatMap(r => (r.special || []).map(s => `${s} (${r.level})`));
    return `<p><b>${esc(e.cls.name)} ${e.level}:</b> ${esc(specials.join(', ') || '—')}</p>`;
  }).join('');

  // Spells per day for each casting class, then the chosen spells by spell level.
  const spellTables = view.casting.casting.map(c => {
    const t = spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores: stats.scores, extraSlot: extraSlotOn(c.cls.id) });
    if (!t || !t.rows.length) return '';
    const showKnown = t.rows.some(r => r.known !== null);
    const showPrepared = t.rows.some(r => r.prepared !== null);
    return `<h3>${esc(c.cls.name)} (caster level ${c.effectiveLevel})</h3>` + table(
      ['Level', 'Per day', ...(showKnown ? ['Known'] : []), ...(showPrepared ? ['Prepared'] : [])],
      t.rows.map(r => [ORDINAL[r.spellLevel], !r.canCast ? '—' : r.spellLevel === 0 && r.base === null ? 'at will' : (r.total ?? '—'),
        ...(showKnown ? [r.known ?? '—'] : []), ...(showPrepared ? [r.prepared ?? '—'] : [])]));
  }).join('');
  // Chosen spells by level, each with its attack, damage and save DC as cast by the class it's on the list of.
  const contexts = view.casting.casting.map(c => spellContext({ cls: c.cls, effectiveLevel: c.effectiveLevel, stats,
                                                                size: race.size, featChoices: view.featChoices }));
  const chosen = (data.spells ? state.spells.map(id => data.spells.find(s => s.id === id)).filter(Boolean) : []).map(s => {
    const ctx = contexts.filter(c => s.levels[c.cls.id] !== undefined).sort((a, b) => s.levels[a.cls.id] - s.levels[b.cls.id])[0];
    return { name: s.name, level: ctx ? s.levels[ctx.cls.id] : null,
             lines: ctx ? spellLines(s, ctx).map(l => (l.label ? `${l.label}: ` : '') + l.text) : [] };
  });
  const byLevel = [...new Set(chosen.map(s => s.level))].sort((a, b) => (a ?? 99) - (b ?? 99)).map(lv => {
    const here = chosen.filter(s => s.level === lv).sort((a, b) => a.name.localeCompare(b.name));
    const plain = here.filter(s => !s.lines.length).map(s => s.name);
    return `<p><b>${lv === null ? 'Other' : ORDINAL[lv]}:</b> ${esc(plain.join(', '))}</p>` +
      (here.some(s => s.lines.length) ? `<ul class="sheet-spell-lines">${here.filter(s => s.lines.length)
        .map(s => `<li><b>${esc(s.name)}</b>: ${esc(s.lines.join('; '))}</li>`).join('')}</ul>` : '');
  }).join('');

  const inventory = state.inventory.map(e => {
    const item = data.gearById?.get(e.id);
    return item ? `${item.name}${e.variant && e.variant !== 'Common' ? ` (${e.variant.toLowerCase()})` : ''}${e.qty > 1 ? ` ×${e.qty}` : ''}` : null;
  }).filter(Boolean);
  const magic = state.magicItems.map(e => {
    const item = data.itemsById?.get(e.id);
    return item ? `${item.name}${e.option ? ` (${e.option})` : ''}${e.qty > 1 ? ` ×${e.qty}` : ''}` : null;
  }).filter(Boolean);
  const gear = (magic.length ? `<p><b>Magic items:</b> ${esc(magic.join(', '))}</p>` : '')
    + `<p><b>Equipment:</b> ${esc(inventory.join(', ') || 'none')}</p>` + facts(moneyRows);

  return header
    + `<div class="sheet-columns">
        <div>${section('Ability scores', abilities)}${section('Defense', defense)}</div>
        <div>${section('Offense', offense)}</div>
      </div>`
    + section('Skills', skillTable)
    + section('Feats', featList)
    + section('Racial traits', racial)
    + section('Class features', features)
    + section('Spells', spellTables + byLevel)
    + section('Gear', gear)
    + `<p class="sheet-footer">Pathfinder RPG rules content is Open Game Content under the Open Game License 1.0a. Printed ${esc(new Date().toLocaleDateString())}.</p>`;
}
