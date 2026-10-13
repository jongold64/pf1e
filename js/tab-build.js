// Build tab: the whole character on one page, for play. Everything comes from the other tabs' numbers (computeView);
// here it's laid out compactly, with a small d20 to roll and a small + for Details (the same popups as the other tabs),
// daily uses to tick off (a running total beside each; the popup marks them and starts a new day), and the player's
// notes. Sections show only when the character has something for them; Actions holds the attacks, class abilities and spells.
import { $, esc, signed } from './dom.js';
import { rollButton } from './roll-ui.js';
import { ABILITIES, formatBab, combatManeuvers, initiative, currentHp, channelEnergy, layOnHands, smite, SIZE_AC } from './rules.js';
import { weaponSummaries } from './tab-weapons.js';
import { spellNumbersHtml, itemSpellNumbersHtml } from './tab-spells.js';
import { ownedSources, itemRowHtml } from './item-rows.js';
import { defenseSwitchesHtml } from './tab-armor.js';
import { defenseOn } from './defense.js';
import { dailyUses, usesLeft } from './daily.js';
import { companionStats } from './companion.js';
import { familiarStats } from './familiar.js';
import { eidolonStats } from './eidolon.js';
import { featureHandling, HANDLING } from './feature-coverage.js';
import { buffById } from './effects.js';

// Cards that open larger when tapped (data-big): their title and contents as last drawn, for the popup.
const bigCards = {};
export const bigCard = key => bigCards[key] || null;

const NAMES = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
const ORD = n => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;
// The d20 Roll button and the ? Details button (shared look with the other tabs).
const roll = spec => rollButton(spec);
const plus = (kind, arg = '', what = '') => `<button type="button" class="skill-details q-details b-plus" data-b-detail="${esc(kind)}" data-arg="${esc(arg)}" aria-label="Details${what ? `: ${esc(what)}` : ''}" title="Details">?</button>`;
// extra: put after the heading (a ? that opens the card larger).
const card = (title, body, cls = '', extra = '') => (body ? `<section class="b-card${cls}"><h3>${esc(title)}${extra}</h3>${body}</section>` : '');
const check = (title, n) => ({ title, check: title, plain: true, groups: [{ attacks: [n] }] });

// parts (from app.js): { name, skills: [{ name, ranks, total }], choices: (cid, level) => [lines],
//   classAttacks: [{ name, note, attack, dice }], spontaneous: [{ cls, table }], bladebound }
export function renderBuild(app, view, parts) {
  const { state, data } = app;
  const { stats, race } = view;
  const box = $('build');
  const notesFocused = document.activeElement?.id === 'b-notes';
  const { cmb, cmd } = combatManeuvers(stats, view.size, view.haveFeats);
  const init = initiative(stats, view.haveFeats, view.traitFx.initiative);
  const hp = currentHp(state.hpCurrent, stats.hp);
  const temp = (state.tempHp || []).reduce((n, t) => n + t.amount, 0);

  // Header.
  const deity = data.deitiesById?.get(state.deity);
  const head = `<div class="b-head">${state.name ? `<b class="b-name">${esc(state.name)}</b>` : ''}
      <span>${esc(race.name)} ${esc(view.counts.map(e => `${e.cls.name}${e.cls.archetypes?.length ? ` (${e.cls.archetypes.join(', ')})` : ''} ${e.level}`).join(' / '))}</span>
      <span class="muted">${esc([race.size, deity ? `${deity.name} (${deity.alignment})` : '',
        (race.senses || []).join(', ')].filter(Boolean).join(' · '))}</span></div>`;

  // Core numbers.
  // One row of the numbers card: label, value, d20, ?, then a note (CMD); an empty cell keeps the columns lined up.
  const stat = (label, value, rollHtml = '', plusHtml = '', note = '') => `<div class="b-stat"><span>${label}</span><b>${value}</b>${rollHtml || '<span></span>'}${plusHtml || '<span></span>'}${note ? `<span class="muted">${note}</span>` : ''}</div>`;
  const save = (label, key) => stat(label, signed(stats[key]), roll(check(label, stats[key]), label), plus('save', { fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[key], label));
  const dr = [...(view.gear.dr ? [`${view.gear.dr}/—`] : []), ...(view.classDr || []).map(d => `${d.value}/${d.against}`)];
  // AC and HP: in the highlighted row at the top, beside who the character is.
  // HP first and biggest (the most used number in a fight): type an amount, then Damage or Heal; Full restores it.
  // Its colour warns when it's low (half or less) and when it's 0 or below.
  const hpState = hp <= 0 ? ' b-hp-down' : hp * 2 <= stats.hp ? ' b-hp-low' : '';
  const hpBox = `<div class="b-hp b-hp-big${hpState}"><span>HP</span><b>${hp}</b><span class="muted">/ ${stats.hp}${temp ? ` +${temp} temp` : ''}</span>
          <input type="number" id="b-hp-amount" inputmode="numeric" min="0" placeholder="0" aria-label="Amount of damage or healing">
          <button type="button" class="b-hp-damage" data-b-hp="damage">Damage</button><button type="button" class="b-hp-heal" data-b-hp="heal">Heal</button>
          <button type="button" data-b-hp="full">Full</button>${plus('result', 'hp', 'hit points')}</div>`;
  const acBox = `<div class="b-ac"><span>AC</span><b>${stats.ac}</b><span class="muted">touch ${stats.touch} · flat-footed ${stats.flatFooted}</span>${plus('ac', '', 'AC')}</div>`;
  // The numbers card: the ability scores in a column on the left; the saves, BAB, CMB, initiative and speed on the right.
  const core = `<div class="b-split">
        <div class="b-abilities">${ABILITIES.map(a => `<div class="b-ab"><span>${NAMES[a]}</span><b>${stats.scores[a]}</b><span class="muted">${signed(stats.mod[a])}</span>${roll(check(`${NAMES[a]} check`, stats.mod[a]), `${NAMES[a]} check`)}${plus('ability', a, NAMES[a])}</div>`).join('')}</div>
        <div class="b-grid">
          ${save('Fort', 'fort')}${save('Ref', 'ref')}${save('Will', 'will')}
          ${stat('BAB', esc(formatBab(stats.bab)), roll({ title: 'Base attack bonus', check: 'BAB', groups: [{ attacks: stats.bab }] }, 'BAB'))}
          ${stat('CMB', signed(cmb), roll({ title: 'Combat maneuver check', check: 'CMB', groups: [{ attacks: [cmb] }] }, 'CMB'), plus('cmb', '', 'CMB and CMD'), `CMD ${cmd}`)}
          ${stat('Speed', view.speed ? `${view.speed} ft.` : '—', '', plus('result', 'speed', 'speed'))}
          ${dr.length ? stat('DR', esc(dr.join(', '))) : ''}
        </div>
      </div>`;

  // On now: effects counting, each with a switch-off.
  const onNow = [...state.buffs.filter(x => x.on !== false).map(x => ({ name: buffById.get(x.id)?.name, off: `buff:${x.id}` })).filter(x => x.name),
    ...(view.fromItems || []).map(x => ({ name: x.label })),
    ...state.customEffects.map((c, i) => ({ name: c.name || 'Custom effect', off: `custom:${i}`, on: c.on && c.value })).filter(x => x.on),
    ...defenseOn(state.combat, view.defenseOpts).map(x => ({ name: x.label, off: `combat:${x.key}` }))];
  const effects = onNow.length ? `<ul class="b-chips">${onNow.map(x => `<li>${esc(x.name)}${x.off ? `<button type="button" class="link" data-b-off="${esc(x.off)}" aria-label="Switch off ${esc(x.name)}">×</button>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted">Nothing on. Switch effects on in Active effects (Build tab).</p>';

  // Daily uses: a running total beside each; tapping opens the popup to tick them off.
  const daily = dailyUses(view, { spellTables: parts.spontaneous, bladebound: parts.bladebound, powers: parts.powers });
  // An ability's uses left and a Use button (one use, round or point spent); the count opens Daily uses to change it.
  const useDaily = name => {
    const d = daily.find(x => x.name === name);
    if (!d) return '';
    const left = usesLeft(d, state.daily);
    return `<span class="b-use-left"><button type="button" class="link" data-b-uses="${esc(d.key)}"><b>${left}</b> / ${d.max}${d.unit === 'uses' ? '' : ` ${esc(d.unit)}`} left</button>
      <button type="button" data-b-use-daily="${esc(d.key)}"${left ? '' : ' disabled'}>Use</button></span>`;
  };
  const channelName = c => `Channel ${c.energy} energy${c.source !== 'Cleric' ? ` (${c.source})` : ''}`;

  // Actions: weapons with attack, damage and critical rolls; class attacks; channel energy, lay on hands, smite and
  // the other abilities with daily uses (each with a Use button); then the spells.
  const weapons = weaponSummaries(app, view);
  // Each number stays on one line with its d20 (b-rc).
  const rc = (text, rollHtml) => `<span class="b-rc"><span>${esc(text)}</span>${rollHtml}</span>`;
  const atk = weapons.map(w => `<tr><td><span class="b-wname">${esc(w.name)}${w.proficient ? '' : ' <span class="warning" title="Not proficient: −4">⚠</span>'}</span>${w.range ? `<small class="muted b-range">${esc(w.range)}</small>` : ''}</td>
      <td>${rc(w.attack, roll(w.rolls.attack, `${w.name} attack`))}</td>
      <td>${rc(w.damage, roll(w.rolls.damage, `${w.name} damage`))}</td>
      <td class="b-crit">${rc(w.critical, w.rolls.crit ? roll(w.rolls.crit, `${w.name} critical damage`) : '')}</td>
      <td>${plus('weapon', `${w.index}`, w.name)}</td></tr>`).join('');
  const combat = app.state.combat || {};
  const switches = [['powerAttack', 'Power Attack'], ['deadlyAim', 'Deadly Aim'], ['rapidShot', 'Rapid Shot'], ['pointBlank', 'Point-Blank Shot']]
    .filter(([, f]) => view.haveFeats.includes(f))
    .map(([k, f]) => `<label class="b-switch"><input type="checkbox" data-b-combat="${k}"${combat[k] ? ' checked' : ''}> ${esc(f)}</label>${plus('combatswitch', k, f)}`).join('');
  const classAtk = parts.classAttacks.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${c.attack !== null ? esc(signed(c.attack)) : ''}</td><td>${esc(c.dice)}${roll(c.attack !== null
      ? { title: c.name, check: c.name, groups: [{ attacks: Array(c.count || 1).fill(c.attack), damage: c.dice, threat: 20, mult: 2 }] }
      : { title: c.name, groups: [{ attacks: [], damage: c.dice, word: 'extra damage' }] }, c.name)}</td><td class="muted">${esc(c.note)}</td><td>${plus('classattack', String(i), c.name)}</td></tr>`).join('');
  // Channel energy, lay on hands / touch of corruption (melee touch) and smite (Character tab rows), here too.
  const touch = stats.bab[0] + stats.mod.str + (SIZE_AC[view.size] ?? 0) + stats.fx.attack + (stats.fx['melee-attack'] || 0);
  const powers = [
    ...channelEnergy(stats, view.haveFeats).map(c => `<tr><td>Channel ${esc(c.energy)}${c.source !== 'Cleric' ? ` <small class="muted">(${esc(c.source)})</small>` : ''}</td><td></td><td>${esc(c.dice)}${roll({ title: `Channel ${c.energy} energy`, groups: [{ attacks: [], damage: c.dice, word: 'heals or harms', heal: true }] }, 'channel')}</td><td class="muted">DC ${c.dc} Will half${c.itemTags.length ? ` · <span title="${esc(c.items.join('; '))}">${esc(c.itemTags.join(', '))}</span>` : ''}${useDaily(channelName(c))}</td><td>${plus('classfeat', `Channel ${c.energy} energy`, 'channel energy')}</td></tr>`),
    ...layOnHands(stats).map(l => `<tr><td>${esc(l.name)}</td><td>${l.heals ? '' : esc(signed(touch))}</td><td>${esc(l.dice)}${roll(l.heals ? { title: l.name, groups: [{ attacks: [], damage: l.dice, heal: true }] }
        : { title: l.name, check: 'Melee touch', groups: [{ attacks: [touch], damage: l.dice, threat: 20, mult: 2 }] }, l.name)}</td><td class="muted">${useDaily(l.name)}</td><td>${plus('classfeat', l.name, l.name)}</td></tr>`),
    ...smite(stats).map(sm => `<tr><td>${esc(sm.name)}</td><td>+${sm.attack}</td><td>+${sm.damage}</td><td class="muted">+${sm.deflection} deflection AC · switch it on in Active effects${useDaily(sm.name)}</td><td>${plus('classfeat', sm.name, sm.name)}</td></tr>`),
  ].join('');
  // Every other ability with daily uses (rage, bardic performance, ki, domain and school powers...): uses left and Use.
  const shown = new Set([...channelEnergy(stats, view.haveFeats).map(channelName), ...layOnHands(stats).map(l => l.name), ...smite(stats).map(s => s.name)]);
  const abilities = daily.filter(d => d.unit !== 'spells' && !shown.has(d.name))
    .map(d => `<div class="b-feat b-action"><span>${esc(d.name)}${d.note ? ` <small class="muted">${esc(d.note)}</small>` : ''}</span>${useDaily(d.name)}${plus('daily', d.key, d.name)}</div>`).join('');
  const noWeapons = atk ? '' : '<p class="hint">No weapons yet: add them on the Weapons tab and they show here with their attack and damage rolls.</p>';
  // Weapons and class abilities in two tables, so a class ability's long note doesn't widen the weapons' columns.
  const attacks = noWeapons + (switches && (atk || classAtk || powers) ? `<div class="b-switches">${switches}</div>` : '')
    + (atk ? `<table class="b-table"><thead><tr><th>Weapon</th><th>Attack</th><th>Damage</th><th>Critical</th><th></th></tr></thead><tbody>${atk}</tbody></table>` : '')
    + (classAtk || powers ? `<table class="b-table b-class-table"><tbody class="b-class-attacks">${classAtk}${powers}</tbody></table>` : '')
    + (abilities ? `<h4 class="b-sub">Class abilities</h4><div class="b-feats">${abilities}</div>` : '');

  // Defense: the defensive switches, armor a class feature gives, and situational notes (the worn armor's numbers are
  // on the Armor tab; AC is in the highlighted row).
  const sit = view.situational || {};
  const notes = [...(sit.ac || []), ...(sit.fort || []), ...(sit.ref || []), ...(sit.will || [])];
  const classArmor = parts.classGear.map((g, i) => [g, i]).filter(([g]) => g.kind === 'armor')
    .map(([g, i]) => `<div class="b-feat"><span>${esc(g.name)} <small class="muted">${esc(g.note)}</small></span>${plus('classgear', String(i), g.name)}</div>`).join('');
  const defenseSw = `<div class="b-switches b-defense-sw">${defenseSwitchesHtml(view, state.combat, s => plus('defense', s.key, s.label))}</div>`;
  const defense = `${defenseSw}${classArmor ? `<h4 class="b-sub">From your class</h4><div class="b-feats">${classArmor}</div>` : ''}
      ${notes.length ? `<h4 class="b-sub">Situational</h4><div class="b-feats">${[...new Set(notes)].map(n => {
        // "Trap sense: +1 on Reflex saves against traps." -> a ? with the Trap sense class feature.
        const name = n.split(':')[0].replace(/\s*\(.*\)$/, '').trim();
        return `<div class="b-feat"><span>${esc(n)}</span>${plus('classfeat', name, name)}</div>`;
      }).join('')}</div>` : ''}`;

  // Spellcasting: prepared spells with cast boxes; spontaneous casters' spells known by level.
  const spells = renderSpells(app, view, parts);

  // Class choices and features.
  // On the card, a short line per class (its features and choices by name); the full list with each ? opens larger.
  const featureSummary = view.counts.map(e => {
    const all = e.cls.progression.slice(0, e.level).flatMap(r => [...(r.special || []), ...(r.archetype_features || []).map(f => f.name)]);
    const names = [...new Map(all.map(n => [n.replace(/\s*\(?[+-]?\d+(?:d\d+)?(?:\/day)?\)?\s*$/i, '').toLowerCase(), n])).values()]
      .map(n => n[0].toUpperCase() + n.slice(1));
    const picks = parts.choices(e.cls.id, e.level).map(c => c.name);
    return `<p class="b-summary"><b>${esc(e.cls.name)} ${e.level}:</b> ${esc([...names, ...picks].join(' · ') || '—')}</p>`;
  }).join('');
  const features = view.counts.map(e => {
    const all = e.cls.progression.slice(0, e.level).flatMap(r => [...(r.special || []), ...(r.archetype_features || []).map(f => f.name)]);
    // One line a feature: a feature that grows ("sneak attack +1d6", "+2d6"; "trap sense +1") shows only its latest step.
    const latest = new Map(all.map(n => [n.replace(/\s*\(?[+-]?\d+(?:d\d+)?(?:\/day)?\)?\s*$/i, '').toLowerCase(), n]));
    const tagged = [...latest.values()].map(n => {
      const how = featureHandling(e.cls.id, n);
      return `<div class="b-feat"><span>${esc(n[0].toUpperCase() + n.slice(1))}${how !== 'text' ? ` <span class="how how-${how}" title="${esc(HANDLING[how])}"></span>` : ''}</span>${plus('feature', `${e.cls.id}|${n}`, n)}</div>`;
    }).join('');
    // Each choice (archetype, bloodline, domain, rage power...) on its own line with a ?.
    const choices = parts.choices(e.cls.id, e.level).map((c, i) => `<div class="b-feat"><span><small class="muted">${esc(c.label)}:</small> ${esc(c.name)}${c.note ? ` <small class="muted">(${esc(c.note)})</small>` : ''}</span>
      ${c.pop ? plus('choice', `${e.cls.id}|${i}`, c.name) : ''}</div>`).join('');
    return `<div class="b-class"><b>${esc(e.cls.name)} ${e.level}</b><div class="b-feats">${tagged}</div>
      ${choices ? `<h4 class="b-sub">Choices</h4><div class="b-feats">${choices}</div>` : ''}</div>`;
  }).join('');

  // Feats and traits.
  // Each feat, trait and racial trait on its own line with a ? for its rules text.
  const row = (name, tag, kind, arg) => `<div class="b-feat"><span>${esc(name)}${tag ? ` <small class="muted">${esc(tag)}</small>` : ''}</span>${arg ? plus(kind, arg, name) : ''}</div>`;
  const featRows = [...view.chosen.map(f => row(f.name, '', 'chosenfeat', f.id)),
    ...view.granted.map(n => row(n, 'from your class', 'feat', data.feats.find(f => f.name === n)?.id))];
  const racial = (race.traits || []).filter(t => !t.kind);
  const featSummary = [['Feats', [...view.chosen.map(f => f.name), ...view.granted]], ['Traits', view.traits.map(t => t.name)],
    ['Racial', (race.traits || []).filter(t => !t.kind).map(t => t.name)]].filter(([, l]) => l.length)
    .map(([k, l]) => `<p class="b-summary"><b>${k}:</b> ${esc(l.join(' · '))}</p>`).join('') || '<p class="muted">None yet.</p>';
  const feats = `<h4 class="b-sub">Feats</h4><div class="b-feats">${featRows.join('') || '<span class="muted">None</span>'}</div>
    ${view.traits.length ? `<h4 class="b-sub">Traits</h4><div class="b-feats">${view.traits.map(t => row(t.name, t.category ? `${t.category} trait` : '', 'trait', t.id)).join('')}</div>` : ''}
    ${racial.length ? `<h4 class="b-sub">Racial traits</h4><div class="b-feats">${racial.map(t => row(t.name, '', 'racial', t.name)).join('')}</div>` : ''}`;

  // Skills: every skill, in its own column on the right (no scrolling); ones with ranks or a bonus beyond the ability modifier stand out,
  // the rest are greyed; a trained-only skill without ranks says so.
  const skills = parts.skills.length ? `<div class="b-skills">${parts.skills.map(s => `<div class="${s.ranks > 0 || s.bonus !== 0 ? 'b-has' : 'b-plain'}">
      <span>${esc(s.name)}${s.usable ? '' : ' <small class="muted">untrained</small>'}</span><b>${signed(s.total)}</b>${roll(check(s.name, s.total), s.name)}${plus('skill', s.name, s.name)}</div>`).join('')}</div>
    <p class="hint">${parts.skills.filter(s => s.ranks > 0).length} with ranks.</p>` : '';

  // Companions.
  const comps = renderCompanions(app, view);

  // Gear: what class features make, magic items, potions, scrolls and wands made, the rest of the inventory (each on its
  // own line with a ?), then money and load.
  const gearRow = (name, note, kind, arg) => `<div class="b-feat"><span>${esc(name)}${note ? ` <small class="muted">${esc(note)}</small>` : ''}</span>${kind ? plus(kind, arg, name) : ''}</div>`;
  const list = (title, rows) => (rows.length ? `<h4 class="b-sub">${title}</h4><div class="b-feats">${rows.join('')}</div>` : '');
  const fromClass = parts.classGear.map((g, i) => gearRow(g.name, g.note, 'classgear', String(i)));
  // Magic items: worn or not (tick), what each gives, its sometimes-bonuses and Details, as in Active effects.
  const magic = ownedSources(state, data).filter(src => src.ref.startsWith('m:'))
    .map(src => itemRowHtml(src));
  // Potions, scrolls and wands: the spell's numbers and rolls at the item's caster level, and Use (one used up, or a
  // wand charge: 50 to a wand).
  const spellsById = data.spells ? new Map(data.spells.map(s => [s.id, s])) : null;
  if (!spellsById && state.craftedItems.length) app.loadSpells().then(() => app.update({}));
  const made = state.craftedItems.map((e, i) => {
    const spell = spellsById?.get(e.spellId);
    const nums = spell ? itemSpellNumbersHtml(view, data.classes, spell, e.cl) : '';
    const left = e.kind === 'wand' ? ` · ${e.charges ?? 50} charges left` : '';
    return `<div class="b-feat"><span>${esc(`${e.kind[0].toUpperCase()}${e.kind.slice(1)} of ${e.spellName}${e.qty > 1 ? ` ×${e.qty}` : ''}`)}
        <small class="muted">caster level ${e.cl}${left}</small></span>
      <span class="b-use"><button type="button" data-b-use-item="${i}">Use</button>${plus('spell', e.spellId, e.spellName)}</span>
      ${nums ? `<div class="b-spell-nums">${nums}</div>` : ''}</div>`;
  });
  const gearHtml = `${list('From your class', fromClass)}${magic.length ? `<h4 class="b-sub">Magic items</h4><ul class="b-item-list">${magic.join('')}</ul>` : ''}${list('Potions, scrolls and wands', made)}`;

  // Actions: the attacks and class abilities, then the spells.
  const actions = attacks + (spells ? `<h4 class="b-sub">Spells</h4>${spells}` : '');
  // Tap anywhere on a card (not on a roll, ? or switch) to open it larger.
  bigCards.abilities = { title: 'Abilities and Saves', html: core };
  bigCards.actions = { title: 'Actions', html: actions };
  bigCards.defense = { title: 'Defense', html: defense };
  bigCards.gear = { title: 'Gear', html: gearHtml };
  bigCards.features = { title: 'Class features and choices', html: features };
  bigCards.feats = { title: 'Feats and traits', html: feats };
  bigCards.skills = { title: 'Skills', html: skills };
  // Notes: a bigger box to write in (it saves as you type, like the card's).
  bigCards.notes = { title: 'Notes', html: `<textarea class="b-notes-big" data-big-notes rows="16" placeholder="Anything to remember: allies, quests, loot...">${esc(state.notes || '')}</textarea>` };
  const tap = key => ` b-tapcard" data-big="${key}`;
  const left = [card('Abilities and Saves', core, tap('abilities')), card('Actions', actions, ` b-wide${tap('actions')}`), card('Defense', defense, tap('defense'))];
  const notesCard = card('Notes', `<textarea id="b-notes" rows="5" placeholder="Anything to remember: allies, quests, loot...">${esc(state.notes || '')}</textarea>`, tap('notes'));
  // Everything on the left, in the order it was; every skill on the right, in full (no scrolling).
  // The highlighted row's extras: initiative, hero points, the class's main pools (what's left; tap to tick them off),
  // each caster's spell DC and concentration, and the Daily uses popup / New day.
  const MAIN_POOL = /^(Rage|Bloodrage|Bardic performance|Raging song|Ki pool|Grit|Panache|Arcane pool|Arcane reservoir|Phrenic pool|Inspiration|Bombs|Blessings|Fervor|Channel|Lay on hands|Touch of corruption|Smite|Judgment|Challenge|Wild shape)/i;
  const pools = daily.filter(d => MAIN_POOL.test(d.name)).map(d => `<span class="b-pool"><button type="button" class="link" data-b-uses="${esc(d.key)}">${esc(d.name)}</button>
      <b>${usesLeft(d, state.daily)}</b><span class="muted">/ ${d.max}${d.unit === 'uses' ? '' : ` ${esc(d.unit)}`}</span>${plus('daily', d.key, d.name)}</span>`).join('');
  const heroPts = state.houseRules.actionPoints && !state.antihero
    ? `<span class="b-pool"><span>Hero points</span> <b>${state.heroPoints ?? 1}</b>${plus('hero', '', 'hero points')}</span>` : '';
  // Initiative in a box like HP's, beside it (the two things every fight starts with).
  const initBox = `<div class="b-hp-big b-init-big"><span>Init</span><b>${signed(init)}</b>${roll(check('Initiative', init), 'initiative')}${plus('init', '', 'initiative')}</div>`;
  const extras = `${pools}
    ${daily.length ? '<span class="b-pool"><button type="button" data-b-uses="">Daily uses…</button><button type="button" data-b-newday>New day</button></span>' : ''}`;
  // A portrait beside HP and Init.
  const initials = (state.name || `${race.name} ${view.counts[0]?.cls.name || ''}`).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  // The character's picture, or a silhouette with the initials; tap to choose (or remove) a picture.
  const portrait = state.portrait
    ? `<button type="button" class="b-portrait b-has-pic" data-b-portrait aria-label="Character portrait: tap to change it" title="Change the portrait"><img src="${state.portrait}" alt=""></button>`
    : `<button type="button" class="b-portrait" data-b-portrait aria-label="Add a character portrait" title="Add a portrait">
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="23" r="12"/><path d="M10 60c2-14 11-21 22-21s20 7 22 21z"/></svg>
      <span>${esc(initials)}</span></button>`;
  box.innerHTML = `<div class="b-banner">${head}<div class="b-vitals">${portrait}<div class="b-vitals-col"><div class="b-vitals-row">${hpBox}${initBox}</div><div class="b-ac-row">${acBox}${heroPts}</div><div class="b-extras">${extras}</div></div></div></div>
    <div class="b-main">
      <div>${card('On now', effects, ' b-onnow')}${left[0]}${left[1]}${left[2]}
        ${features ? card('Class features and choices', featureSummary, tap('features')) : ''}${card('Feats and traits', featSummary, tap('feats'))}${comps}
        ${card('Gear', gearHtml, tap('gear'))}${notesCard}</div>
      <div>${card('Skills', skills, tap('skills'))}</div>
    </div>`;
  fitTables(box);
  // Fit them again when the screen turns or the window changes size.
  if (!box.dataset.fitWatch) {
    box.dataset.fitWatch = '1';
    new ResizeObserver(() => fitTables(box)).observe(box);
  }
  if (notesFocused) { const n = $('b-notes'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}

// The cards' tables (the Actions card's weapons and class abilities) use the room they have: the largest text, from
// 11.5 to 17 px, at which every row of the weapons still fits on one line (when even the smallest doesn't, rows wrap
// as before). The class abilities take the same size; their note may wrap.
function fitTables(box) {
  for (const c of box.querySelectorAll('.b-card')) {
    const tables = [...c.querySelectorAll('.b-table')];
    if (!tables.length) continue;
    const main = tables.filter(t => !t.classList.contains('b-class-table'));
    const sizes = (main.length ? main : tables).map(fitTable).filter(Boolean);
    if (sizes.length) for (const t of tables) t.style.fontSize = `${Math.min(...sizes)}px`;
  }
}

// The largest text size (px) at which a table's rows fit its card on one line, 11.5 at the least; 0 when hidden.
function fitTable(t) {
  const pad = getComputedStyle(t.parentElement);
  const room = t.parentElement.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  if (room <= 0) return 0;
  t.style.width = 'max-content';
  let size = 17;
  t.style.fontSize = `${size}px`;
  while (size > 11.5 && t.getBoundingClientRect().width > room) {
    size -= 0.5;
    t.style.fontSize = `${size}px`;
  }
  t.style.width = '';
  return size;
}

// Spells: for each casting class, its caster level, concentration and DCs, then each spell level: a preparer's slots
// with a cast box, or a spontaneous caster's spells known (spells a day are in Daily uses).
function renderSpells(app, view, parts) {
  const { state, data } = app;
  if (!view.casting.casting.length) return '';
  if (!data.spells) { app.loadSpells().then(() => app.update({})); return '<p class="muted">Loading spells…</p>'; }
  const byId = new Map(data.spells.map(s => [s.id, s]));
  return view.casting.casting.map(c => {
    const cid = c.cls.id;
    const ability = parts.castingAbility(cid);
    const mod = view.stats.mod[ability] ?? 0;
    // Each spell's numbers with their rolls (attack, save DC, damage or healing, SR check), as on the Spells tab.
    const nums = spell => {
      const h = spell ? spellNumbersHtml(view, c.cls, c.effectiveLevel, spell) : '';
      return h ? `<div class="b-spell-nums">${h}</div>` : '';
    };
    const head = `<p><b>${esc(c.cls.name)}</b> · caster level ${c.effectiveLevel} · concentration ${signed(c.effectiveLevel + mod)}${roll(check(`${c.cls.name} concentration`, c.effectiveLevel + mod), 'concentration')} · save DC 10 + spell level ${signed(mod)}</p>`;
    const prep = parts.prepared(cid);
    if (prep) {
      // Each prepared spell on its own line: a box to tick when cast, its name, and a ? for its details.
      const levels = prep.map(({ lv, slots }) => `<div class="b-spell-level"><h4 class="b-sub">${lv === 0 ? 'Cantrips' : `${ORD(lv)} level`}</h4>
        <div class="b-spell-list">${slots.map((x, i) => (x.id ? `<div class="b-feat${x.cast ? ' b-spent' : ''}"><label class="b-cast"><input type="checkbox" data-b-cast="${esc(`${cid}|${lv}|${i}`)}"${x.cast ? ' checked' : ''}${lv === 0 ? ' disabled' : ''}>
          ${esc(byId.get(x.id)?.name || x.id)}</label>${plus('spell', x.id, byId.get(x.id)?.name || 'spell')}${nums(byId.get(x.id))}</div>` : '<div class="b-feat"><span class="muted">(empty)</span></div>')).join('')}</div></div>`).join('');
      return head + (levels || '<p class="muted">Nothing prepared yet: prepare today\'s spells on the Spells tab.</p>');
    }
    const known = state.spells.map(id => byId.get(id)).filter(s => s && s.levels[cid] !== undefined);
    const lvls = [...new Set(known.map(s => s.levels[cid]))].sort((a, b) => a - b);
    // Spells known: each on its own line with a ?.
    return head + (lvls.map(lv => `<div class="b-spell-level"><h4 class="b-sub">${lv === 0 ? 'Cantrips' : `${ORD(lv)} level`}</h4><div class="b-spell-list">${known.filter(s => s.levels[cid] === lv)
      .sort((a, b) => a.name.localeCompare(b.name)).map(s => `<div class="b-feat"><span>${esc(s.name)}</span>${plus('spell', s.id, s.name)}${nums(s)}</div>`).join('')}</div></div>`).join('')
      || '<p class="muted">No spells chosen yet (Spells tab).</p>');
  }).join('');
}

// Animal companion, familiar and eidolon: a compact block each.
function renderCompanions(app, view) {
  const { state, data } = app;
  const out = [];
  const line = (k, v) => (v ? `<span><b>${esc(k)}</b> ${esc(String(v))}</span>` : '');
  const animal = view.companion?.level && data.companions?.animals.find(a => a.id === state.companion.animal);
  if (animal) {
    const c = companionStats(animal, view.companion.level, data.companions.progression, state.companion);
    out.push(card(`${state.companion.name || animal.name} (animal companion)`, `<div class="b-mini">${[line('HP', c.hp), line('AC', `${c.ac} (T ${c.touch}, FF ${c.flatFooted})`),
      line('Saves', `F ${signed(c.fort)} R ${signed(c.ref)} W ${signed(c.will)}`), line('Init', signed(c.init)), line('Speed', c.speed), line('CMB/CMD', `${signed(c.cmb)}/${c.cmd}`)].join('')}</div>
      <ul class="b-notes">${c.attacks.map(x => `<li>${x.count > 1 ? `${x.count} ` : ''}${esc(x.name)} ${esc(signed(x.bonus))}${x.damage ? ` (${esc(x.damage)})` : ''}
        ${roll({ title: `${state.companion.name || animal.name}: ${x.name}`, check: x.name, groups: [{ attacks: Array(x.count || 1).fill(x.bonus), damage: x.damage, threat: 20, mult: 2 }] }, x.name)}</li>`).join('')}</ul>`, ' b-wide'));
  }
  const f = view.familiar;
  if (f?.path?.stats) {
    const s = familiarStats(f.path.stats, f.master);
    out.push(card(`${f.path.name} (familiar)`, `<div class="b-mini">${[line('HP', s.hp), line('AC', `${s.ac} (T ${s.touch}, FF ${s.flat})`),
      line('Saves', `F ${signed(s.saves.fort)} R ${signed(s.saves.ref)} W ${signed(s.saves.will)}`), line('Speed', f.path.stats.speed),
      line('Melee', s.melee), line('Abilities', s.abilities.join(', '))].join('')}</div>`, ' b-wide'));
  }
  const e = view.eidolon;
  if (e?.form && data.eidolons) {
    const s = eidolonStats({ level: e.level, form: e.form, chosen: state.eidolon.evolutions, increases: state.eidolon.increases,
                             table: data.eidolons.tables[e.cls], evolutions: data.eidolons.evolutions[e.cls] });
    const name = state.eidolon.name || 'Eidolon';
    out.push(card(`${name} (eidolon)`, `<div class="b-mini">${[line('HP', s.hp), line('AC', `${s.ac} (T ${s.touch}, FF ${s.flat})`),
      line('Saves', `F ${signed(s.saves.fort)} R ${signed(s.saves.ref)} W ${signed(s.saves.will)}`), line('Speed', s.speed), line('CMB/CMD', `${signed(s.cmb)}/${s.cmd}`),
      line('Evolutions', s.taken.map(x => x.name).join(', '))].join('')}</div>
      <ul class="b-notes">${s.attacks.map(x => `<li>${x.count > 1 ? `${x.count} ` : ''}${esc(x.name)} ${esc(signed(x.bonus))} (${esc(x.damage)})
        ${roll({ title: `${name}: ${x.name}`, check: x.name, groups: [{ attacks: Array(x.count).fill(x.bonus), damage: x.damage, threat: 20, mult: 2 }] }, x.name)}</li>`).join('')}</ul>`, ' b-wide'));
  }
  return out.join('');
}

// The daily uses popup: each ability with a box per use (or −/+ for long lists), and New day.
export function popDailyUses(app, view, parts, focus = '') {
  const { state } = app;
  const list = dailyUses(view, { spellTables: parts.spontaneous, bladebound: parts.bladebound, powers: parts.powers });
  const rows = list.map(d => {
    const used = Math.min(d.max, state.daily[d.key] || 0);
    const control = d.max <= 12
      ? Array.from({ length: d.max }, (_, i) => `<input type="checkbox" data-b-tick="${esc(d.key)}" data-n="${i + 1}"${i < used ? ' checked' : ''} aria-label="${esc(d.name)} use ${i + 1}">`).join('')
      : `<button type="button" data-b-step="${esc(d.key)}" data-n="-1" aria-label="One less used">−</button> <b>${used}</b> used <button type="button" data-b-step="${esc(d.key)}" data-n="1" aria-label="One more used">+</button>`;
    return `<tr${d.key === focus ? ' class="b-focus"' : ''}><td><b>${esc(d.name)}</b>${d.note ? `<br><small class="muted">${esc(d.note)}</small>` : ''}</td>
      <td class="b-ticks">${control}</td><td class="num"><b>${d.max - used}</b> of ${d.max} ${esc(d.unit)} left</td></tr>`;
  }).join('');
  app.openDetail('Daily uses', `<div class="b-daily"><table class="skill-why"><tbody>${rows || '<tr><td>No limited abilities.</td></tr>'}</tbody></table>
    <p class="hint">Tick a box for each use (rounds of rage or performance, points from a pool, spells cast). New day clears them all,
      and the cast boxes of prepared spells.</p></div>`,
    [{ label: 'New day', run: () => app.update({ daily: {}, prepared: newDayPrepared(state.prepared) }) }]);
}

// Prepared spells with every cast box cleared.
export const newDayPrepared = prepared => Object.fromEntries(Object.entries(prepared || {}).map(([cid, lv]) =>
  [cid, Object.fromEntries(Object.entries(lv).map(([l, slots]) => [l, slots.map(x => ({ ...x, cast: false }))]))]));
