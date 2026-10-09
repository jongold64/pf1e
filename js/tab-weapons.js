// Weapons tab: the character's weapons with attack bonus and damage, and every weapon (by category) with a
// side panel for the weapon being looked at.
import { fitLines, $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { SIZE_AC, MONK_IDS, smite } from './rules.js';
import { armorAttackPenalty } from './armor.js';
import { abilityPicker, chosenAbility } from './tab-crafting.js';
import { abilityOptions } from './crafting.js';
import { proficiencyTest, weaponAttack, weaponCost, weaponCostRows, weaponLabel, isComposite, compositeRating, ratingPrice, abilityDamage, damageWithExtras, twoWeaponAttack, flurryBabs, isDouble, isMonkWeapon,
         powerAttackStep, unarmedForSize, improvedCritical, attackBreakdown, sizedWeapon, bigWeaponRules, WEAPON_SIZES } from './weapons.js';
import { activeBonuses } from './effects.js';
import { weaponTraining } from './class-features.js';
import { launcherOf, ammoFor, AMMO_MATERIALS, ammoPiecePrice } from './weapons.js';

// A launcher's ammunition (bows, crossbows, slings...): which kind, how many, a special material and a magic bonus. The
// ammunition's enhancement and the launcher's don't stack (the higher counts); its material's effects show under it.
function ammoControls(app, w, e, i) {
  const kinds = ammoFor(w);
  if (!launcherOf(w) || !kinds.length) return '';
  const a = e.ammo || {};
  const ammo = kinds.find(k => k.id === a.id);
  const mat = weaponMaterialById.get(a.material);
  return `<div class="ammo-controls"><label>Ammunition <select data-ammo="${i}" data-field="id"><option value="">None</option>${kinds.map(k =>
      `<option value="${esc(k.id)}"${k.id === a.id ? ' selected' : ''}>${esc(k.name)}${k.per > 1 ? ` (${formatGp(k.price_gp)} for ${k.per})` : ` (${formatGp(k.price_gp)} each)`}</option>`).join('')}</select></label>
    ${ammo ? `<label>How many <input type="number" min="0" max="9999" value="${a.count ?? ammo.per}" data-ammo="${i}" data-field="count" style="width:5em"></label>
      <label>Material <select data-ammo="${i}" data-field="material"><option value="">Normal</option>${Object.keys(AMMO_MATERIALS).map(id =>
        `<option value="${esc(id)}"${id === a.material ? ' selected' : ''}>${esc(weaponMaterialById.get(id)?.name || id)}</option>`).join('')}</select></label>
      <label>Magic <select data-ammo="${i}" data-field="enh">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === (a.enh || 0) ? ' selected' : ''}>${n ? `+${n}` : 'none'}</option>`).join('')}</select></label>
      <p class="hint">${esc(formatGp(Math.round(ammoPiecePrice(ammo, a) * 100) / 100))} a piece${a.count ? `, ${esc(formatGp(Math.round(ammoPiecePrice(ammo, a) * a.count * 100) / 100))} in all (in the weapon's cost)` : ''}.
        ${mat ? `${esc(mat.name)}: ${esc(mat.notes)}` : ''}${a.enh ? ` A +${a.enh} arrow or bolt doesn’t add to the launcher’s bonus: the higher counts.` : ''}</p>` : ''}</div>`;
}
import { weaponMaterialsFor, weaponMaterialById } from './materials.js';
import { formatGp, formatLbs } from './equipment.js';
import { rollButton } from './roll-ui.js';

let selectedId = null;
let listed = false;

const WEAPON_FEATS = [
  ['focus', 'Weapon Focus', '+1 attack'],
  ['greaterFocus', 'Greater Weapon Focus', '+1 attack'],
  ['spec', 'Weapon Specialization', '+2 damage'],
  ['greaterSpec', 'Greater Weapon Specialization', '+2 damage'],
  ['impCrit', 'Improved Critical', 'double threat range'],
];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const GROUP_TEXT = { unarmed: 'unarmed', light: 'light melee', 'one-handed': 'one-handed melee', 'two-handed': 'two-handed melee', ranged: 'ranged' };

function weaponDetails(w, withButton = true) {
  return `<h3>${esc(w.name)}</h3>
    <p class="hint">${esc(w.category)} · ${esc(GROUP_TEXT[w.group] || w.group || '')} · ${esc(sourceText(w))}</p>
    ${facts([
      ['Damage (Small / Medium / Large)', [w.damage.s, w.damage.m, w.damage.l].map(x => x || '—').join(' / ')],
      ['Critical', w.critical],
      ['Range', w.range_ft ? `${w.range_ft} ft.${w.thrown ? ' (thrown)' : ''}` : null],
      ['Type', w.type],
      ['Special', w.special.length ? w.special.join(', ') : null],
      ['Price', w.price_gp !== null ? formatGp(w.price_gp) : w.price],
      ['Weight', w.weight_lbs !== null ? formatLbs(w.weight_lbs) : null],
      ['Weapon Finesse', w.finesse ? 'can be used' : null],
    ])}
    ${withButton ? `<div class="slot-buttons"><button type="button" class="primary" data-add-weapon="${esc(w.id)}">Add to my weapons</button></div>` : ''}
    ${paragraphs(w.description) || '<p class="hint">The source has no description for this weapon.</p>'}`;
}

function renderPanel(app) {
  const w = app.data.weaponsById?.get(selectedId);
  $('weapon-panel').innerHTML = w ? weaponDetails(w) : '<p class="hint">Choose a weapon to see its details and add it.</p>';
  document.querySelectorAll('#weapon-list [data-weapon]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.weapon === selectedId)));
}

function renderList(app) {
  const all = app.data.weapons;
  const filter = $('weapon-search').value.trim().toLowerCase();
  const byCategory = new Map();
  for (const w of all) {
    if (filter && !w.name.toLowerCase().includes(filter)) continue;
    if (!byCategory.has(w.category)) byCategory.set(w.category, []);
    byCategory.get(w.category).push(w);
  }
  const order = ['Simple Weapons', 'Martial Weapons', 'Exotic Weapons', 'Firearms', 'Technological Weapons'];
  const categories = order.filter(c => byCategory.has(c));
  const shown = [...byCategory.values()].reduce((n, l) => n + l.length, 0);
  $('weapon-count').textContent = filter ? `${shown} of ${all.length}` : `${all.length}`;
  $('weapon-category').innerHTML = '<option value="">Jump to a category…</option>' +
    categories.map(c => `<option value="${slug(c)}">${esc(c)} (${byCategory.get(c).length})</option>`).join('');
  $('weapon-list').innerHTML = categories.map(c => `<section class="list-group" id="wcat-${slug(c)}">
      <h3 class="list-heading">${esc(c)} <span class="count">${byCategory.get(c).length}</span></h3>
      <ul class="pick-list">${byCategory.get(c).map(w =>
        `<li class="with-details"><button type="button" data-weapon="${esc(w.id)}">${esc(w.name)}<small>${esc(w.damage.m || '')}</small></button>
          <button type="button" class="skill-details" data-weapon-pop="${esc(w.id)}" aria-label="${esc(w.name)} in a popup">Details</button></li>`).join('')}</ul>
    </section>`).join('') || '<p class="hint">No weapons match.</p>';
  renderPanel(app);
}

const attackText = a => a.attacks.map(signed).join('/');

// Threat range and multiplier for the Roll buttons ("19-20/×2" -> 19, 2), with Improved Critical doubling the range.
// Threat range and multiplier, plus the extra damage dice the weapon's special abilities add. Keen and Improved
// Critical each double the threat range; they don't stack.
function critOf(w, flags, have, entry = {}) {
  const fx = abilityDamage(entry?.abilities || []);
  const doubled = (flags.impCrit && have.has('Improved Critical')) || fx.keen;
  const threat = w.threat ? (doubled ? 21 - 2 * (21 - w.threat) : w.threat) : 20;
  const mult = Number(String(w.multiplier ?? w.critical ?? '').match(/\d+/)?.[0]) || 2;
  return { threat, mult, extra: fx.hit, burst: fx.burst, doubled, fx };
}
const critText = (w, crit) => (crit.doubled ? improvedCritical(w) : w.critical) || '—';
const rollGroup = (label, a, crit) => ({ label, attacks: a.attacks, damage: a.damage, threat: crit.threat, mult: crit.mult,
                                         extra: crit.extra, burst: crit.burst });
const usedText = a => (a.used.length ? ` <span class="muted">(${esc(a.used.join(', '))})</span>` : '');

// Everything weaponAttack needs that comes from the character rather than the weapon.
function combatContext(app, view) {
  const proficient = proficiencyTest(view.classes, view.race);
  // Unarmed strike damage from the monk or brawler table (the higher class level).
  const unarmedFrom = view.counts.filter(e => [...MONK_IDS, 'brawler'].includes(e.cls.id)).sort((a, b) => b.level - a.level)[0];
  const unarmed = unarmedFrom
    ? unarmedForSize(unarmedFrom.cls.progression[unarmedFrom.level - 1]?.other?.['Unarmed Damage'], view.size) : null;
  // Flurry of blows: monk (from 1st level) or brawler's flurry (from 2nd). Monk levels count as BAB for it.
  const flurryFrom = view.counts.find(e => MONK_IDS.includes(e.cls.id)) || view.counts.find(e => e.cls.id === 'brawler' && e.level >= 2);
  const flurry = flurryFrom ? {
    kind: flurryFrom.cls.id,
    name: flurryFrom.cls.id === 'brawler' ? "Brawler's flurry" : 'Flurry of blows',
    // The unchained monk's flurry has no attack penalty.
    penalty: flurryFrom.cls.id === 'monk-unchained' ? 0 : -2,
    babs: flurryBabs(flurryFrom.cls.id, flurryFrom.level, flurryFrom.cls.progression[flurryFrom.level - 1].bab[0], view.stats.bab[0]),
  } : null;
  // Weapon feats taken for a weapon on the Feats tab ("Weapon Focus (longsword)"). Once a feat has a weapon chosen,
  // it applies to that weapon automatically; the tick boxes stay for feats with no weapon chosen.
  const weaponChoices = view.featChoices.filter(c => c.kind === 'weapon' && c.value);
  const chosenFor = feat => new Set(weaponChoices.filter(c => c.feat === feat).map(c => c.value));
  const flagsFor = (e, w) => Object.fromEntries(WEAPON_FEATS.map(([key, feat]) =>
    [key, chosenFor(feat).size ? chosenFor(feat).has(w.id) : !!e[key]]));
  const byFeat = w => chosenFor('Exotic Weapon Proficiency').has(w.id) || chosenFor('Martial Weapon Proficiency').has(w.id);
  return { proficient: w => proficient(w) || byFeat(w), unarmed, flurry, chosenFor, flagsFor, smites: smite(view.stats),
           armorPenalty: armorAttackPenalty(view.gear, view.haveFeats) };
}
// Levels in the classes holding the Titan Mauler (barbarian) and Titan Fighter archetypes, for big weapons.
function titanLevels(app, view) {
  const levelWith = id => view.counts.filter(c => (app.state.archetypes[c.cls.id] || []).includes(id)).reduce((n, c) => n + c.level, 0);
  return bigWeaponRules({ titanMauler: levelWith('barbarian-titan-mauler'), titanFighter: levelWith('fighter-titan-fighter') });
}

function attackArgs(app, view, ctx, e) {
  const w = app.data.weaponsById.get(e.id);
  // A weapon made for another size: its own damage dice, -2 per size step, and its handedness shifted (with the Titan
  // Mauler's and Titan Fighter's rules for big weapons).
  const sized = sizedWeapon(w, e.size, view.size, titanLevels(app, view), !!e.jotungrip);
  return {
    weapon: sized.weapon, entry: { ...e, ...ctx.flagsFor(e, w) }, bab: view.stats.bab, mod: view.stats.mod, sizeAttack: SIZE_AC[view.size] ?? 0,
    size: sized.diceSize, misfit: sized.penalty, sized, haveFeats: view.haveFeats, proficient: ctx.proficient(w) || !!e.proficient,
    armorPenalty: ctx.armorPenalty, unarmedDamage: w.id === 'unarmed-strike' && ctx.unarmed ? ctx.unarmed : null,
    options: app.state.combat,
    // Weapon training: the fighter's groups (picked at 5th, 9th, 13th, 17th, in that order) and the swashbuckler's.
    training: weaponTraining(view.counts, w, [5, 9, 13, 17].map(lv => app.state.talents[`fighter|weapon-training|${lv}`] || '')),
    // Power Attack / Deadly Aim grow with the real BAB, even in a flurry (where monk levels count as BAB).
    powerBab: view.stats.bab[0],
    // Active effects' bonuses on attack and damage rolls (bless, divine favor...).
    // Flaws: Noncombatant (melee) and Shaky (ranged) attack penalties.
    // Melee-only effects (an unchained barbarian's rage) on melee weapons.
    effectAttack: view.stats.fx.attack + (w.group === 'ranged' ? view.flawFx.ranged + (view.stats.fx['ranged-attack'] || 0) : view.flawFx.melee + (view.stats.fx['melee-attack'] || 0)),
    effectDamage: view.stats.fx.damage + (w.group === 'ranged' ? 0 : view.stats.fx['melee-damage'] || 0),
  };
}

// The effect bonuses on a weapon's attack and damage rolls, named, for Details popups: active effects plus a flaw's
// penalty (Noncombatant on melee attacks, Shaky on ranged ones).
function weaponEffects(app, w) {
  const v = app.view;
  const flaw = w.group === 'ranged' ? v.flawFx.ranged : v.flawFx.melee;
  const melee = w.group !== 'ranged';
  return [...activeBonuses(app.state.buffs, v.customAll).filter(x => x.target === 'attack' || x.target === 'damage'
            || (melee && (x.target === 'melee-attack' || x.target === 'melee-damage')) || (!melee && x.target === 'ranged-attack'))
          .map(x => ({ ...x, target: x.target.replace(/^(melee|ranged)-/, '') })),
          ...(flaw ? [{ target: 'attack', source: w.group === 'ranged' ? 'Shaky (flaw)' : 'Noncombatant (flaw)', type: 'untyped', value: flaw }] : [])];
}

// What the Combat options card's Details buttons show, filled when it's drawn.
const combatWhy = new Map();

function showCombatWhy(app, key) {
  const d = combatWhy.get(key);
  if (!d) return;
  const table = (rows, total) => `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody>
    ${total !== undefined ? `<tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(total)}</b></td></tr></tfoot>` : ''}</table>`;
  const body = d.sections ? d.sections.map(([h, rows, total]) => `<h3>${esc(h)}</h3>${table(rows, total)}`).join('') : table(d.rows, d.total);
  app.openDetail(d.title, body + (d.note ? `<p class="hint">${esc(d.note)}</p>` : ''));
}

// The Combat options card: Power Attack, Deadly Aim and Rapid Shot switches (only for feats the character has)
// and two-weapon fighting with the weapons chosen for each hand.
function renderCombat(app, view, ctx) {
  const { state, data } = app;
  const have = new Set(view.haveFeats);
  const step = powerAttackStep(view.stats.bab[0]);
  const switches = [
    ['powerAttack', 'Power Attack', `−${step} melee attack, +${2 * step} damage (+${3 * step} two-handed, +${step} off-hand)`],
    ['deadlyAim', 'Deadly Aim', `−${step} ranged attack, +${2 * step} damage`],
    ['rapidShot', 'Rapid Shot', 'one more ranged attack, −2 on all of them'],
    ['pointBlank', 'Point-Blank Shot', 'target within 30 ft.: +1 ranged attack and damage'],
  ].filter(([, feat]) => have.has(feat));
  // What each switch does, for its Details popup.
  const bab = view.stats.bab[0];
  const stepRow = { label: `Your base attack bonus +${bab}: 1 step, +1 more at +4 and every 4 after`, text: `${step} step${step === 1 ? '' : 's'}` };
  combatWhy.set('powerAttack', { title: 'Power Attack', rows: [stepRow,
    { label: 'Melee attack rolls', text: `−${step}` }, { label: 'Damage, one-handed or light weapon', text: `+${2 * step}` },
    { label: 'Damage, weapon in two hands (× 1½)', text: `+${3 * step}` }, { label: 'Damage, off-hand weapon (× ½)', text: `+${step}` }],
    note: 'Melee only. It applies to every melee attack until your next turn; switch it off for attacks you need to land.' });
  combatWhy.set('deadlyAim', { title: 'Deadly Aim', rows: [stepRow,
    { label: 'Ranged attack rolls', text: `−${step}` }, { label: 'Damage', text: `+${2 * step}` }],
    note: 'Ranged only; it doesn\u2019t apply to touch attacks or effects that don\u2019t deal hit point damage.' });
  combatWhy.set('pointBlank', { title: 'Point-Blank Shot', rows: [{ label: 'Ranged attack rolls', text: '+1' }, { label: 'Ranged damage', text: '+1' }],
    note: 'Only against a target within 30 feet: switch it on for those shots.' });
  combatWhy.set('rapidShot', { title: 'Rapid Shot', rows: [{ label: 'One more ranged attack at your highest bonus', text: '+1 attack' },
    { label: 'Every ranged attack this round', text: '−2' }], note: 'Only as part of a full attack with a ranged weapon.' });
  $('combat-switches').innerHTML = switches.map(([key, feat, what]) =>
    `<label class="check-row"><input type="checkbox" data-combat="${key}" ${state.combat[key] ? 'checked' : ''}> Use ${esc(feat)} <span class="muted">(${esc(what)})</span>
      <button type="button" class="skill-details" data-combat-why="${key}" aria-label="What ${esc(feat)} does">Details</button></label>`).join('')
    || '<p class="hint">Power Attack, Deadly Aim, Rapid Shot and Point-Blank Shot switches appear here once you have those feats.</p>';

  // Hands: every carried weapon except ranged ones; the off hand can also be the other end of a double weapon.
  const melee = state.weapons.map((e, i) => [i, e, data.weaponsById.get(e.id)]).filter(([, , w]) => w && w.group !== 'ranged');
  const name = (e, w) => weaponLabel(w, e);
  const mainOpts = melee.map(([i, e, w]) => [String(i), name(e, w)]);
  const mainIndex = state.combat.main === '' ? null : Number(state.combat.main);
  const mainEntry = mainIndex !== null ? state.weapons[mainIndex] : null;
  const mainWeapon = mainEntry && data.weaponsById.get(mainEntry.id);
  const offOpts = [
    ...(mainWeapon && isDouble(mainWeapon) ? [[`${mainIndex}:1`, `Other end of the ${mainWeapon.name}`]] : []),
    ...melee.filter(([i, e, w]) => i !== mainIndex && sizedWeapon(w, e.size, view.size).weapon.group !== 'two-handed').map(([i, e, w]) => [String(i), name(e, w)]),
  ];
  const select = (id, opts, value) => `<select id="${id}"><option value="">—</option>${opts.map(([v, t]) =>
    `<option value="${v}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  $('twf-hands').innerHTML = melee.length
    ? `<label>Main hand ${select('twf-main', mainOpts, state.combat.main)}</label>
       <label>Off hand ${select('twf-off', offOpts, state.combat.off)}</label>`
    : '<p class="hint">Add melee weapons below to fight with two.</p>';

  const offValue = offOpts.some(([v]) => v === state.combat.off) ? state.combat.off : '';
  if (!mainWeapon || !offValue) { $('twf-result').innerHTML = ''; return; }
  const [offIndex, offEnd] = offValue.split(':').map(Number);
  const offEntry = state.weapons[offIndex];
  // Each hand keeps its own proficiency and unarmed damage.
  const offArgs = attackArgs(app, view, ctx, offEntry);
  const mainArgs = attackArgs(app, view, ctx, mainEntry);
  const r = twoWeaponAttack({
    ...mainArgs,
    main: { weapon: mainArgs.weapon, entry: mainArgs.entry, end: 0 },
    off: { weapon: offArgs.weapon, entry: offArgs.entry, end: offEnd || 0, proficient: offArgs.proficient,
           unarmedDamage: offArgs.unarmedDamage },
  });
  const off = r.off;
  const spec = { title: 'Two-weapon full attack', groups: [
    rollGroup('Main hand', r.main, critOf(mainWeapon, ctx.flagsFor(mainEntry, mainWeapon), have, mainEntry)),
    rollGroup('Off hand', off, critOf(offArgs.weapon, ctx.flagsFor(offEntry, offArgs.weapon), have, offEntry)),
  ] };
  // The two hands' attacks in pieces, for their Details popups.
  const effects = weaponEffects(app, mainArgs.weapon);
  const hasTwf = have.has('Two-Weapon Fighting');
  for (const [key, hand, label, offWeapon] of [['main', r.main, 'Main hand', false], ['off', off, 'Off hand', true]]) {
    const b = attackBreakdown(hand, { penaltyLabel: 'Two-weapon fighting penalty', effects });
    combatWhy.set(key, { title: `${label}: ${attackText(hand)}, ${hand.damage}`, sections: [
      ['Attack roll', b.attackRows.map(x => ({ label: x.label, text: x.text ?? signed(x.value) })), signed(b.attackTotal)],
      ['Damage', [{ label: 'Weapon dice', text: hand.parts.dice || '—' }, ...b.damageRows.map(x => ({ label: x.label, text: x.text ?? signed(x.value) }))], hand.damage]],
      note: offWeapon ? `Off-hand attacks: one, a second at −5 with Improved Two-Weapon Fighting and a third at −10 with Greater. Off-hand damage adds ${have.has('Double Slice') ? 'full Strength (Double Slice)' : 'half Strength'}.` : '' });
  }
  combatWhy.set('penalties', { title: 'Two-weapon fighting penalties', rows: [
    { label: 'Normal: main hand / off hand', text: '−6 / −10' },
    { label: `Off-hand weapon is light${r.offLight ? ' (yes)' : ' (no)'}: 2 less each`, text: r.offLight ? '−4 / −8' : '—' },
    { label: `Two-Weapon Fighting feat${hasTwf ? ' (you have it)' : ' (you don\u2019t have it)'}: main hand 2 less, off hand 6 less`, text: hasTwf ? 'applied' : '—' },
  ], total: `${r.penalties.main} / ${r.penalties.off}`, note: 'A double weapon\u2019s other end counts as a light off-hand weapon.' });
  const whyBtn = (key, what) => ` <button type="button" class="skill-details" data-combat-why="${key}" aria-label="${esc(what)}">Details</button>`;
  $('twf-result').innerHTML = `<dl class="facts attack-line">
      <dt>Main hand</dt><dd><b>${esc(attackText(r.main))}</b>, ${esc(r.main.damage)}${usedText(r.main)}${whyBtn('main', 'What adds to the main-hand attack')}</dd>
      <dt>Off hand</dt><dd><b>${esc(attackText(off))}</b>, ${esc(off.damage)}${usedText(off)}${whyBtn('off', 'What adds to the off-hand attack')}</dd>
    </dl>
    <div class="slot-buttons">${rollButton(spec, 'Roll full attack')}</div>
    <p class="hint">Penalties ${r.penalties.main} main hand, ${r.penalties.off} off hand
      (${r.offLight ? 'light off-hand weapon' : 'off-hand weapon isn\'t light'}${have.has('Two-Weapon Fighting') ? ', Two-Weapon Fighting' : ', no Two-Weapon Fighting feat'}).
      Off-hand damage adds ${have.has('Double Slice') ? 'full Strength (Double Slice)' : 'half Strength'}.${whyBtn('penalties', 'How the two-weapon penalties are worked out')}</p>`;
}

// The character's weapons, each with its quality, feats, proficiency, attack bonus and damage.
// A Details button for one part of a weapon card (its popup is popWeaponPart).
const wpart = (i, part, label) => ` <button type="button" class="skill-details" data-wpart="${i}|${part}" aria-label="${esc(label)}">Details</button>`;

// The popups behind a weapon card's Size, Quality, Strength rating, Range and Cost Details.
function popWeaponPart(app, i, part) {
  const view = app.view;
  const e = app.state.weapons[i];
  const w = e && app.data.weaponsById.get(e.id);
  if (!w) return;
  const name = weaponLabel(w, e);
  const table = (head, rows) => `<table class="skill-why">${head ? `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}
    <tbody>${rows.map(r => `<tr>${r.map((c, k) => `<td${k && k === r.length - 1 ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if (part === 'cost') {
    const rows = weaponCostRows(w, e);
    app.openDetail(`Price: ${name}`, `${table(null, rows.map(r => [r.label, `${r.gp < 0 ? '−' : ''}${formatGp(Math.abs(r.gp))}`]))}
      <p><b>Total: ${esc(formatGp(weaponCost(w, e)))}</b></p>
      <p class="hint">Magic weapons are always masterwork (300 gp). A weapon's magic price is its total bonus (enhancement plus
        special abilities' bonuses) squared × 2,000 gp. This price counts on the Equipment tab.</p>`);
  }
  if (part === 'quality') {
    const rows = [['Normal', '—', '—', '—'], ['Masterwork', '+1', '—', '+300 gp'],
      ...[1, 2, 3, 4, 5].map(n => [`+${n}`, `+${n}`, `+${n}`, `+${formatGp(300 + n * n * 2000)}`])];
    app.openDetail(`Quality: ${name}`, `${table(['Quality', 'Attack', 'Damage', 'Adds to the price'], rows)}
      <p class="hint">Masterwork gives +1 on attack rolls only. An enhancement bonus adds to attack and damage rolls and lets the
        weapon hurt creatures with damage reduction (+3 counts as cold iron and silver, +4 adamantine, +5 alignment). Special
        abilities need at least +1, and the total bonus can't go above +10.</p>`);
  }
  if (part === 'size') {
    const ctx = combatContext(app, view);
    const s = attackArgs(app, view, ctx, e).sized;
    const dice = sz => w.damage?.[{ Small: 's', Medium: 'm', Large: 'l' }[sz]] || '—';
    const rows = [['You are', view.size], ['Made for', e.size || `${view.size} (your size)`], ['Damage dice', dice(s.diceSize)],
      ['Held as', s.unusable ? 'too big to use' : s.weapon.group === w.group ? w.group : `${s.weapon.group} (it\u2019s ${w.group} for its own size)`],
      ...s.rows.map(r => [r.label, signed(r.value)]),
      ['Price and weight', e.size === 'Large' ? 'twice the price, twice the weight' : e.size === 'Small' ? 'the same price, half the weight' : 'as listed']];
    app.openDetail(`Size: ${name}`, `${table(null, rows)}${s.notes.length ? `<p>${esc(s.notes.join(' '))}</p>` : ''}
      <p class="hint">A weapon made for a bigger or smaller creature gives −2 on attacks per size step, uses that size's damage
        dice, and takes one more hand per step larger (a light weapon becomes one-handed, then two-handed). Small: ${esc(dice('Small'))},
        Medium: ${esc(dice('Medium'))}, Large: ${esc(dice('Large'))}.</p>`);
  }
  if (part === 'rating') {
    const str = view.stats.mod.str;
    const rating = compositeRating(w, e, str);
    app.openDetail(`Strength rating: ${name}`, `${table(null, [['Your Strength bonus', signed(str)], ['Its strength rating', `+${rating}`],
        ['Added to damage', signed(str < 0 ? str : Math.min(str, rating))], ['Attack penalty', str < rating ? '−2 (your Strength is below its rating)' : 'none'],
        ['Price of the rating', `${ratingPrice(w)} gp a point`]])}
      <p class="hint">A composite bow is made for a set Strength bonus. It adds your Strength bonus to damage up to that rating
        (a Strength penalty always applies), and you take −2 on attacks if your Strength bonus is lower. An adaptive bow always
        matches your Strength.</p>`);
  }
  if (part === 'range') {
    const thrown = w.group !== 'ranged' || w.thrown;
    const max = thrown ? 5 : 10;
    const rows = Array.from({ length: max }, (_, k) => [`${k * w.range_ft + 1}–${(k + 1) * w.range_ft} ft.`, k ? `−${2 * k}` : '0']);
    app.openDetail(`Range: ${name}`, `${table(['Distance', 'Attack'], rows)}
      <p class="hint">Each full range increment (${w.range_ft} ft.) past the first gives −2 on the attack. A thrown weapon reaches at
        most 5 increments, a projectile weapon 10.</p>`);
  }
}

export function renderMyWeapons(app, view) {
  const { state, data } = app;
  if (!data.weaponsById) return;
  const ctx = combatContext(app, view);
  const have = new Set(view.haveFeats);
  const armorPenalty = ctx.armorPenalty;
  $('my-weapons-count').textContent = state.weapons.length ? `${state.weapons.length}` : '';
  const notes = [];
  if (armorPenalty) notes.push(`Your armor or shield gives ${armorPenalty} on attack rolls (see the Armor tab).`);
  if (view.race.size === 'Small') notes.push('Small characters use Small weapon damage and get +1 on attack rolls.');
  $('my-weapons-note').textContent = notes.join(' ');
  renderCombat(app, view, ctx);

  $('my-weapons').innerHTML = state.weapons.map((e, i) => {
    const w = data.weaponsById.get(e.id);
    if (!w) return '';
    const byRules = ctx.proficient(w);
    const isProficient = byRules || !!e.proficient;
    const args = attackArgs(app, view, ctx, e);
    const a = weaponAttack(args);
    const flags = ctx.flagsFor(e, w);
    const crit = critOf(w, flags, have, e);
    const weaponName = weaponLabel(w, e);
    // Extra lines: situational ability damage (holy vs evil foes, bane vs its chosen type) with a roll of its own,
    // a flurry with monk weapons, and a double weapon used as two weapons.
    const extra = crit.fx.vs.map(v => `<dt>${esc(v.name)}</dt><dd>+${esc(v.dice)} against ${esc(v.vs)}
        ${rollButton({ title: `${weaponName}: ${v.name.toLowerCase()} damage`, groups: [{ attacks: [], damage: v.dice, word: `${v.name.toLowerCase()} damage` }] }, `Roll +${v.dice}`)}</dd>`);
    if (ctx.flurry?.babs && isMonkWeapon(w)) {
      const f = weaponAttack({ ...args, bab: ctx.flurry.babs, hand: 'flurry', penalty: ctx.flurry.penalty });
      extra.push(`<dt>${esc(ctx.flurry.name)}</dt><dd><b>${esc(attackText(f))}</b>, ${esc(f.damage)}${usedText(f)}
        ${rollButton({ title: `${weaponName}: ${ctx.flurry.name.toLowerCase()}`, groups: [rollGroup('', f, crit)] })}</dd>`);
    }
    // Smite evil / smite good: the same attacks with +Cha to hit and +class level to damage.
    for (const sm of ctx.smites) {
      const sa = weaponAttack({ ...args, penalty: sm.attack, bonusDamage: sm.damage });
      extra.push(`<dt>${esc(sm.name)}</dt><dd><b>${esc(attackText(sa))}</b>, ${esc(sa.damage)}
        ${rollButton({ title: `${weaponName}: ${sm.name.toLowerCase()}`, groups: [rollGroup('', sa, crit)] }, sm.name)}</dd>`);
    }
    if (isDouble(w)) {
      const d2 = twoWeaponAttack({ ...args, main: { weapon: w, entry: args.entry, end: 0 }, off: { weapon: w, entry: args.entry, end: 1 } });
      extra.push(`<dt>As two weapons</dt><dd><b>${esc(attackText(d2.main))}</b>, ${esc(d2.main.damage)} and
        <b>${esc(attackText(d2.off))}</b>, ${esc(d2.off.damage)}
        ${rollButton({ title: `${weaponName} as two weapons`, groups: [rollGroup('First end', d2.main, crit), rollGroup('Other end', d2.off, crit)] })}</dd>`);
    }
    const quality = e.enh > 0 ? `+${e.enh}` : e.masterwork ? 'mw' : '0';
    const featBoxes = WEAPON_FEATS.filter(([, feat]) => have.has(feat) && !ctx.chosenFor(feat).size).map(([key, feat, what]) =>
      `<label class="check-row small"><input type="checkbox" data-weapon-flag="${key}" data-index="${i}" ${e[key] ? 'checked' : ''}> ${esc(feat)} (${what})</label>`).join('');
    const fromFeats = WEAPON_FEATS.filter(([key, feat]) => flags[key] && have.has(feat) && ctx.chosenFor(feat).size).map(([, feat]) => feat);
    // One line: the weapon, its attack, damage and critical with a Roll button each, and Details to open everything else.
    const open = openWeapons.has(i);
    const warn = !isProficient || args.sized.unusable ? ` <span class="warning" title="${esc(args.sized.unusable ? 'Too big for you to wield' : 'Not proficient: −4 on attack rolls')}">⚠</span>` : '';
    return `<div class="weapon-card">
      <div class="weapon-line fit-line">
        <button type="button" class="link item-link weapon-name" data-show-weapon="${esc(w.id)}">${esc(weaponLabel(w, e))}</button>${warn}
        <span class="wl-part"><span class="wl-k">Attack</span> <b>${esc(attackText(a))}</b>
          ${rollButton({ title: weaponName, groups: [rollGroup('', a, crit)] })}</span>
        <span class="wl-part"><span class="wl-k">Damage</span> <b>${esc(damageWithExtras(a.damage, crit.fx))}</b>
          ${rollButton({ title: `${weaponName} damage`, groups: [{ attacks: [], damage: a.damage, extra: crit.extra }] })}</span>
        <span class="wl-part"><span class="wl-k">Critical</span> <b>${esc(critText(w, crit))}</b>
          ${w.critical ? rollButton({ title: `${weaponName} critical damage`, groups: [{ attacks: [], damage: a.damage, critMult: crit.mult, extra: crit.extra, burst: crit.burst }] }) : ''}</span>
        <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-weapon-more="${i}" aria-expanded="${open}" aria-label="Everything about ${esc(w.name)}">Details</button>
      </div>
      <div class="weapon-more"${open ? '' : ' hidden'}>
      <div class="weapon-head">
        <span class="weapon-title"><button type="button" class="skill-details" data-show-weapon="${esc(w.id)}" aria-label="${esc(w.name)} in a popup">About the ${esc(w.name.toLowerCase())}</button></span>
        <button type="button" class="link" data-remove-weapon="${i}">remove</button>
      </div>
      <dl class="facts attack-line">
        <dt>Attack</dt><dd><b>${esc(attackText(a))}</b> <span class="muted">(${a.abilityUsed === 'dex' ? 'Dex' : 'Str'}${a.used.length ? `, ${esc(a.used.join(', '))}` : ''})</span>
          ${rollButton({ title: weaponName, groups: [rollGroup('', a, crit)] })}
          <button type="button" class="skill-details" data-attack-details="${i}" aria-label="What adds to this weapon's attack and damage">Details</button></dd>
        <dt>Damage</dt><dd><b>${esc(damageWithExtras(a.damage, crit.fx))}</b>
          ${rollButton({ title: `${weaponName} damage`, groups: [{ attacks: [], damage: a.damage, extra: crit.extra }] }, 'Roll damage')}
          <button type="button" class="skill-details" data-attack-details="${i}" data-part="damage" aria-label="What adds to this weapon's damage">Details</button>
          ${crit.fx.notes.length ? `<div class="muted small">${esc(crit.fx.notes.join(' '))}</div>` : ''}</dd>
        ${extra.join('')}
        <dt>Critical</dt><dd>${esc(critText(w, crit))}${crit.fx.burst.length ? ` <span class="muted">(plus ${esc(crit.fx.burst.map(b => `${b.dice} ${b.type}`).join(', '))} per step above ×1)</span>` : ''}
          ${w.critical ? rollButton({ title: `${weaponName} critical damage`, groups: [{ attacks: [], damage: a.damage, critMult: crit.mult, extra: crit.extra, burst: crit.burst }] }, 'Roll crit damage') : ''}
          <button type="button" class="skill-details" data-attack-details="${i}" data-part="critical" aria-label="How this weapon's criticals work">Details</button></dd>
        ${w.range_ft ? `<dt>Range</dt><dd>${w.range_ft} ft.${wpart(i, 'range', 'Range increments')}</dd>` : ''}
        <dt>Cost</dt><dd>${esc(formatGp(weaponCost(w, e)))}${wpart(i, 'cost', 'How the price adds up')}</dd>
      </dl>
      <div class="weapon-controls">
        <span class="control-with-details"><label>Size <select data-weapon-size="${i}">
          <option value="">Your size (${esc(view.size)})</option>
          ${WEAPON_SIZES.map(z => `<option value="${z}"${e.size === z ? ' selected' : ''}>${z}</option>`).join('')}
        </select></label>${wpart(i, 'size', 'What the weapon size changes')}</span>
        ${isComposite(w) ? (() => {
          // Composite bows: the strength rating (Str bonus added to damage, up to it; -2 attack if your Str is lower).
          const adaptive = (e.abilities || []).some(x => x.id === 'adaptive');
          const str = view.stats.mod.str;
          return adaptive ? `<p class="hint">Adaptive: its strength rating always matches your Strength bonus (+${Math.max(0, str)}).</p>`
            : `<label>Strength rating <select data-weapon-rating="${i}">
              ${Number.isInteger(e.strRating) ? '' : `<option value="" selected>Not set: matches your Strength (+${Math.max(0, str)})</option>`}
              ${Array.from({ length: 11 }, (_, n) => `<option value="${n}"${e.strRating === n ? ' selected' : ''}>+${n}${n ? ` (+${n * ratingPrice(w)} gp)` : ''}${n === Math.max(0, str) ? ' = your Strength' : ''}</option>`).join('')}
            </select></label>${wpart(i, 'rating', 'The strength rating')}${compositeRating(w, e, str) > str ? '<p class="warning small">Your Strength bonus is below its rating: −2 on attacks with it.</p>' : ''}`;
        })() : ''}
        <span class="control-with-details"><label>Quality <select data-weapon-quality="${i}">
          <option value="0"${quality === '0' ? ' selected' : ''}>Normal</option>
          <option value="mw"${quality === 'mw' ? ' selected' : ''}>Masterwork (+1 attack)</option>
          ${[1, 2, 3, 4, 5].map(n => `<option value="+${n}"${quality === `+${n}` ? ' selected' : ''}>+${n}</option>`).join('')}
        </select></label>${wpart(i, 'quality', 'What masterwork and magic do')}</span>
        ${weaponMaterialsFor(w).length ? `<label>Material <select data-weapon-material="${i}">
          <option value="">Normal (steel or wood)</option>${weaponMaterialsFor(w).map(m => `<option value="${esc(m.id)}"${e.material === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select></label>` : ''}
        ${weaponMaterialById.get(e.material) ? `<p class="hint">${esc(weaponMaterialById.get(e.material).name)}: ${esc(weaponMaterialById.get(e.material).notes)}${weaponMaterialById.get(e.material).mw ? ' Always masterwork (+1 on attacks).' : ''}</p>` : ''}
        ${ammoControls(app, w, e, i)}
        ${app.data.itemsById ? abilityPicker(app, 'Weapon Special Abilities', e.abilities || [], {
          option: `data-w="${i}" data-wab-option`, remove: `data-w="${i}" data-wab-remove`, add: `data-w="${i}" data-wab-add`,
          disabled: !(e.enh > 0) }) + (e.enh > 0 ? '' : '<p class="hint">Special abilities need at least a +1 weapon.</p>') : ''}
        ${fromFeats.length ? `<p class="hint">From your feats: ${esc(fromFeats.join(', '))}.</p>` : ''}
        ${titanLevels(app, view).jotungrip && w.group === 'two-handed' && !e.size ? `<label class="check-row small"><input type="checkbox" data-weapon-flag="jotungrip" data-index="${i}" ${e.jotungrip ? 'checked' : ''}>
          Jotungrip: hold it in one hand (−2 on attacks; one-handed for Strength and Power Attack)</label>` : ''}
        ${featBoxes}
        ${byRules ? '' : `<label class="check-row small"><input type="checkbox" data-weapon-flag="proficient" data-index="${i}" ${e.proficient ? 'checked' : ''}>
          Proficient anyway (e.g. from a feat or trait)</label>`}
      </div>
      ${isProficient ? '' : '<p class="warning">Not proficient: −4 on attack rolls.</p>'}
      ${args.sized.steps ? `<p class="${args.sized.unusable ? 'warning' : 'hint'}">${args.sized.unusable
        ? `Made for a ${esc(e.size)} creature: too big for you to wield (it would be more than two-handed).`
        : `Made for a ${esc(e.size)} creature: ${args.sized.penalty} on attack rolls, ${esc(e.size)} damage dice${args.sized.weapon.group !== w.group
          ? `, and it counts as ${esc(args.sized.weapon.group)} for you` : ''}.${args.sized.notes.length ? ` ${esc(args.sized.notes.join(' '))}` : ''}`}</p>` : ''}
      ${titanLevels(app, view).titanMauler ? '<p class="hint">Titan Mauler: Big Game Hunter gives +1 on attacks and +1 dodge AC in melee against larger creatures; Titanic Rage (14th) adds enlarge person when raging (switch it on under Active effects).</p>' : ''}
      </div>
    </div>`;
  }).join('') || '<p class="hint">No weapons yet. Choose one below and add it.</p>';
  fitWeaponLines();
}

// Weapons whose details are open (by their place in the list), kept across redraws.
const openWeapons = new Set();

// Each weapon's line stays on one line: its text shrinks (down to 55%) until it fits. Run after drawing and on resize;
// a hidden tab has no width, so it's run again when the Weapons tab opens.
export function fitWeaponLines() {
  fitLines($('my-weapons'));
}

// Details popup for one carried weapon: everything that adds to its attack roll and to its damage.
// part: 'damage' shows only the damage (with special abilities' extra dice and critical damage); otherwise attack and damage.
function showAttackDetails(app, i, part = null) {
  const { state, data, view } = app;
  const e = state.weapons[i];
  const w = e && data.weaponsById.get(e.id);
  if (!w) return;
  const ctx = combatContext(app, view);
  const args = attackArgs(app, view, ctx, e);
  const a = weaponAttack(args);
  const crit = critOf(w, ctx.flagsFor(e, w), new Set(view.haveFeats), e);
  const b = attackBreakdown(a, { effects: weaponEffects(app, w) });
  // The weapon-size penalty in its pieces (size steps, Giant Weapon Wielder, Massive Weapons, Incredible Heft, Jotungrip).
  const sizeAt = b.attackRows.findIndex(r => r.label === 'Weapon size (and archetype rules)');
  const sizeRows = args.sized.rows.filter(r => r.value);
  if (sizeAt >= 0) b.attackRows.splice(sizeAt, 1, ...sizeRows);
  else if (sizeRows.length) b.attackRows.splice(2, 0, ...sizeRows);  // they cancel out: still show them
  const table = (rows, totalLabel, totalText) => `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}${r.note
    ? ` <small class="muted">(${esc(r.note)})</small>` : ''}</td><td class="num">${esc(r.text ?? signed(r.value))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>${esc(totalLabel)}</b></td><td class="num"><b>${esc(totalText)}</b></td></tr></tfoot></table>`;
  const dice = a.parts.dice || '—';
  if (part === 'critical') {
    const base = w.threat ? `${w.threat === 20 ? '20' : `${w.threat}-20`}` : '20';
    const hasImp = view.haveFeats.includes('Improved Critical') && ctx.flagsFor(e, w).impCrit;
    const keen = crit.fx.keen;
    const threatText = crit.threat === 20 ? '20' : `${crit.threat}-20`;
    const rows = [
      { label: `${w.name}: threat range`, text: base },
      ...(hasImp || keen ? [{ label: `${[hasImp ? 'Improved Critical' : '', keen ? 'Keen' : ''].filter(Boolean).join(' and ')}: doubles the threat range${hasImp && keen ? ' (they don’t stack)' : ''}`, text: threatText }] : []),
      { label: 'Damage multiplier', text: `×${crit.mult}` },
      { label: 'Confirmation roll (same bonus as the attack)', text: signed(a.attacks[0]) },
      { label: `Critical damage: the weapon dice and bonuses rolled ×${crit.mult}`, text: `${a.damage} ×${crit.mult}` },
      ...crit.fx.hit.map(x => ({ label: `${x.name || 'Special ability'}: not multiplied`, text: `+${x.dice}${x.type ? ` ${x.type}` : ''}` })),
      ...crit.fx.burst.map(x => ({ label: `${x.name || 'Burst'}: extra on a critical, per step above ×1`, text: `+${x.dice}${x.type ? ` ${x.type}` : ''} × ${crit.mult - 1}` })),
    ];
    app.openDetail(`${weaponLabel(w, e)} critical: ${critText(w, crit)}`, `${table(rows, 'Threat / multiplier', `${threatText}/×${crit.mult}`)}
      <p class="hint">A natural roll in the threat range threatens a critical; roll again to confirm (it must hit the AC). The Roll button
        does both and rolls the critical damage for you. A natural 20 always hits.</p>`);
    return;
  }
  if (part === 'damage') {
    const extras = [...crit.fx.hit.map(x => ({ label: `${x.name || 'Special ability'}: every hit`, text: `+${x.dice}${x.type ? ` ${x.type}` : ''}` })),
      ...crit.fx.vs.map(x => ({ label: `${x.name}: only against ${x.vs}`, text: `+${x.dice}` }))];
    app.openDetail(`${weaponLabel(w, e)} damage: ${damageWithExtras(a.damage, crit.fx)}`, `
      ${table([{ label: `Weapon dice (${args.size}${e.size ? ' weapon' : ''})`, text: dice }, ...b.damageRows, ...extras.filter(x => !x.label.includes('only against'))], 'Damage', damageWithExtras(a.damage, crit.fx))}
      ${extras.some(x => x.label.includes('only against')) ? `<h3>Sometimes</h3><ul class="plain-list">${extras.filter(x => x.label.includes('only against')).map(x => `<li>${esc(x.label)}: ${esc(x.text)}</li>`).join('')}</ul>` : ''}
      <h3>On a critical hit</h3><p>${esc(critText(w, crit))}: the weapon dice and bonuses are rolled ×${crit.mult}; extra dice from special abilities aren't multiplied${crit.fx.burst.length
        ? `, but ${esc(crit.fx.burst.map(x => `${x.name || 'burst'} adds ${x.dice} ${x.type || ''}`.trim()).join(' and '))} for each step above ×1` : ''}.</p>
      ${crit.fx.notes.length ? `<p class="hint">${esc(crit.fx.notes.join(' '))}</p>` : ''}
      <p class="hint">Damage is at least 1. Power Attack and two-weapon choices are on the Combat options card above.</p>`);
    return;
  }
  app.openDetail(`${weaponLabel(w, e)}: ${attackText(a)}`, `
    <h3>Attack roll</h3>${table(b.attackRows, a.attacks.length > 1 ? 'First attack' : 'Total', signed(b.attackTotal))}
    ${a.attacks.length > 1 ? `<p class="hint">Each extra attack from a high base attack bonus is 5 lower: ${esc(attackText(a))}.</p>` : ''}
    <h3>Damage</h3>${table([{ label: `Weapon dice (${args.size}${e.size ? ' weapon' : ''})`, text: dice }, ...b.damageRows], 'Damage', damageWithExtras(a.damage, crit.fx))}
    ${crit.fx.notes.length ? `<p class="hint">${esc(crit.fx.notes.join(' '))}</p>` : ''}
    <p class="hint">Power Attack, Rapid Shot and two-weapon choices are on the Combat options card above.</p>`);
}

// Plain-text attack lines for each carried weapon (for the printed sheet).
export function weaponSummaries(app, view) {
  if (!app.data.weaponsById) return [];
  const ctx = combatContext(app, view);
  const have = new Set(view.haveFeats);
  return app.state.weapons.map(e => {
    const w = app.data.weaponsById.get(e.id);
    if (!w) return null;
    const args = attackArgs(app, view, ctx, e);
    const a = weaponAttack(args);
    const flags = ctx.flagsFor(e, w);
    const crit = critOf(w, flags, have, e);
    const extra = crit.fx.vs.map(v => `${v.name} +${v.dice} against ${v.vs}`);
    if (ctx.flurry?.babs && isMonkWeapon(w)) {
      const f = weaponAttack({ ...args, bab: ctx.flurry.babs, hand: 'flurry', penalty: ctx.flurry.penalty });
      extra.push(`${ctx.flurry.name} ${attackText(f)} (${f.damage})`);
    }
    if (isDouble(w)) {
      const d2 = twoWeaponAttack({ ...args, main: { weapon: w, entry: args.entry, end: 0 }, off: { weapon: w, entry: args.entry, end: 1 } });
      extra.push(`As two weapons ${attackText(d2.main)} (${d2.main.damage}) and ${attackText(d2.off)} (${d2.off.damage})`);
    }
    return {
      name: weaponLabel(w, e),
      attack: attackText(a) + (a.used.length ? ` (${a.used.join(', ')})` : ''),
      damage: damageWithExtras(a.damage, crit.fx),
      critical: critText(w, crit) + (crit.fx.burst.length ? ` (plus ${crit.fx.burst.map(b => `${b.dice} ${b.type}`).join(', ')} per step above ×1)` : ''),
      range: w.range_ft ? `${w.range_ft} ft.` : '',
      extra,
      proficient: args.proficient,
    };
  }).filter(Boolean);
}

// A weapon to add: a composite bow comes with a strength rating that matches your Strength bonus now.
function newEntry(app, w) {
  return { id: w.id, enh: 0, ...(isComposite(w) ? { strRating: Math.max(0, app.view.stats.mod.str) } : {}) };
}

function changeEntry(app, index, changes) {
  app.update({ weapons: app.state.weapons.map((e, i) => (i === index ? { ...e, ...changes } : e)) });
}

export function initWeaponsTab(app) {
  initCombat(app);
  $('weapon-search-form').addEventListener('submit', e => { e.preventDefault(); renderList(app); });
  $('weapon-search').addEventListener('input', () => renderList(app));
  $('weapon-category').addEventListener('change', e => {
    document.getElementById(`wcat-${e.target.value}`)?.scrollIntoView({ block: 'start' });
  });
  $('weapon-list').addEventListener('click', e => {
    // Details: the weapon in a popup, with Add to my weapons.
    const pop = e.target.closest('[data-weapon-pop]');
    if (pop) {
      const w = app.data.weaponsById.get(pop.dataset.weaponPop);
      if (w) app.openDetail(w.name, weaponDetails(w, false),
        [{ label: 'Add to my weapons', primary: true, run: () => app.update({ weapons: [...app.state.weapons, newEntry(app, w)] }) }]);
      return;
    }
    const btn = e.target.closest('[data-weapon]');
    if (!btn) return;
    selectedId = btn.dataset.weapon;
    renderPanel(app);
  });
  $('weapon-panel').addEventListener('click', e => {
    const btn = e.target.closest('[data-add-weapon]');
    if (btn) app.update({ weapons: [...app.state.weapons, newEntry(app, app.data.weaponsById.get(btn.dataset.addWeapon) || { id: btn.dataset.addWeapon })] });
  });
  $('my-weapons').addEventListener('click', e => {
    const more = e.target.closest('[data-weapon-more]');
    if (more) {
      const i = Number(more.dataset.weaponMore);
      const box = more.closest('.weapon-card').querySelector('.weapon-more');
      box.hidden = !box.hidden;
      if (box.hidden) openWeapons.delete(i); else openWeapons.add(i);
      more.classList.toggle('on', !box.hidden);
      more.setAttribute('aria-expanded', String(!box.hidden));
      return;
    }
    const remove = e.target.closest('[data-remove-weapon]');
    // The list shifts up, so which details are open is forgotten.
    if (remove) openWeapons.clear();
    // Removing a weapon moves the others up the list, so the two-weapon choices are cleared.
    if (remove) app.update({ weapons: app.state.weapons.filter((_, i) => i !== Number(remove.dataset.removeWeapon)),
                             combat: { ...app.state.combat, main: '', off: '' } });
    const show = e.target.closest('[data-show-weapon]');
    if (show) showWeapon(app, show.dataset.showWeapon);
    const part = e.target.closest('[data-wpart]');
    if (part) {
      e.preventDefault();
      const [i, which] = part.dataset.wpart.split('|');
      popWeaponPart(app, Number(i), which);
    }
    const why = e.target.closest('[data-attack-details]');
    if (why) showAttackDetails(app, Number(why.dataset.attackDetails), why.dataset.part || null);
    // Special abilities (treasure or purchases, at market price): remove one.
    const rm = e.target.closest('[data-wab-remove]');
    if (rm) {
      const i = Number(rm.dataset.w);
      changeEntry(app, i, { abilities: (app.state.weapons[i].abilities || []).filter((_, j) => j !== Number(rm.dataset.wabRemove)) });
    }
  });
  $('my-weapons').addEventListener('change', e => {
    const sizeOf = e.target.dataset.weaponSize;
    if (sizeOf !== undefined) {
      const { size, ...rest } = app.state.weapons[Number(sizeOf)];
      const weapons = app.state.weapons.map((x, j) => (j === Number(sizeOf) ? (e.target.value ? { ...rest, size: e.target.value } : rest) : x));
      app.update({ weapons });
      return;
    }
    const rating = e.target.dataset.weaponRating;
    if (rating !== undefined && e.target.value !== '') { changeEntry(app, Number(rating), { strRating: Number(e.target.value) }); return; }
    // Ammunition: kind (a new kind starts at one bundle), how many, material, magic.
    if (e.target.dataset.ammo !== undefined) {
      const i = Number(e.target.dataset.ammo);
      const cur = app.state.weapons[i].ammo || {};
      const field = e.target.dataset.field;
      const v = e.target.value;
      const kind = field === 'id' ? ammoFor(app.data.weaponsById.get(app.state.weapons[i].id)).find(k => k.id === v) : null;
      const next = field === 'id' ? (v ? { id: v, count: kind?.per || 1, enh: 0 } : null)
        : { ...cur, [field]: field === 'material' ? v : Math.max(0, Math.floor(Number(v)) || 0) };
      if (next && !next.material) delete next.material;
      const { ammo: _old, ...rest } = app.state.weapons[i];
      app.update({ weapons: app.state.weapons.map((x, j) => (j === i ? (next ? { ...rest, ammo: next } : rest) : x)) });
      return;
    }
    const material = e.target.dataset.weaponMaterial;
    if (material !== undefined) {
      const { material: _old, ...rest } = app.state.weapons[Number(material)];
      app.update({ weapons: app.state.weapons.map((x, j) => (j === Number(material) ? (e.target.value ? { ...rest, material: e.target.value } : rest) : x)) });
      return;
    }
    const quality = e.target.dataset.weaponQuality;
    if (quality !== undefined) {
      const v = e.target.value;
      changeEntry(app, Number(quality), { enh: v.startsWith('+') ? Number(v.slice(1)) : 0, masterwork: v === 'mw' });
    }
    const flag = e.target.dataset.weaponFlag;
    if (flag) changeEntry(app, Number(e.target.dataset.index), { [flag]: e.target.checked });
    // Special abilities: add one, or pick another version of one (fortification, spell resistance...).
    const t = e.target;
    if (t.dataset.wabAdd !== undefined && t.value) {
      const i = Number(t.dataset.w);
      const opts = abilityOptions(app.data.itemsById.get(t.value));
      const { cl, ...ability } = chosenAbility(app, { id: t.value, option: opts[0]?.label || '' }) || {};
      if (ability.id) changeEntry(app, i, { abilities: [...(app.state.weapons[i].abilities || []), ability] });
    }
    if (t.dataset.wabOption !== undefined) {
      const i = Number(t.dataset.w);
      const abilities = (app.state.weapons[i].abilities || []).map((a, j) => {
        if (j !== Number(t.dataset.wabOption)) return a;
        const { cl, ...b } = chosenAbility(app, { id: a.id, option: t.value }) || a;
        return b;
      });
      changeEntry(app, i, { abilities });
    }
  });
}

function initCombat(app) {
  for (const id of ['combat-switches', 'twf-result']) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-combat-why]');
      if (!b) return;
      e.preventDefault();  // inside a label: don't tick the box
      showCombatWhy(app, b.dataset.combatWhy);
    });
  }
  $('combat-switches').addEventListener('change', e => {
    const key = e.target.dataset.combat;
    if (key) app.update({ combat: { ...app.state.combat, [key]: e.target.checked } });
  });
  $('twf-hands').addEventListener('change', e => {
    if (e.target.id === 'twf-main') app.update({ combat: { ...app.state.combat, main: e.target.value, off: '' } });
    if (e.target.id === 'twf-off') app.update({ combat: { ...app.state.combat, off: e.target.value } });
  });
}

export async function renderWeaponsTab(app) {
  if (!app.data.weapons) {
    $('weapon-list').innerHTML = '<p class="hint">Loading weapons…</p>';
    await app.loadWeapons();
  }
  // Special abilities come from the magic item data.
  if (!app.data.itemsById) await app.loadItems();
  renderMyWeapons(app, app.view);
  if (listed) return;
  listed = true;
  renderList(app);
}

// Used by search: show a weapon in the side panel and scroll the list to it.
export async function showWeapon(app, id) {
  selectedId = id;
  await renderWeaponsTab(app);
  if ($('weapon-search').value) {
    $('weapon-search').value = '';
    renderList(app);
  }
  renderPanel(app);
  document.querySelector(`#weapon-list [data-weapon="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}
