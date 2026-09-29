// Weapons tab: the character's weapons with attack bonus and damage, and every weapon (by category) with a
// side panel for the weapon being looked at.
import { $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { SIZE_AC, MONK_IDS, smite } from './rules.js';
import { armorAttackPenalty } from './armor.js';
import { abilityPicker, chosenAbility } from './tab-crafting.js';
import { abilityOptions } from './crafting.js';
import { proficiencyTest, weaponAttack, weaponCost, weaponLabel, abilityDamage, damageWithExtras, twoWeaponAttack, flurryBabs, isDouble, isMonkWeapon,
         powerAttackStep, unarmedForSize, improvedCritical } from './weapons.js';
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

function weaponDetails(w) {
  return `<h3>${esc(w.name)}</h3>
    <p class="hint">${esc(w.category)} · ${esc(GROUP_TEXT[w.group] || w.group || '')} · ${esc(sourceText(w))}</p>
    ${facts([
      ['Damage (Small / Medium)', [w.damage.s, w.damage.m].filter(Boolean).join(' / ') || null],
      ['Critical', w.critical],
      ['Range', w.range_ft ? `${w.range_ft} ft.${w.thrown ? ' (thrown)' : ''}` : null],
      ['Type', w.type],
      ['Special', w.special.length ? w.special.join(', ') : null],
      ['Price', w.price_gp !== null ? formatGp(w.price_gp) : w.price],
      ['Weight', w.weight_lbs !== null ? formatLbs(w.weight_lbs) : null],
      ['Weapon Finesse', w.finesse ? 'can be used' : null],
    ])}
    <div class="slot-buttons"><button type="button" class="primary" data-add-weapon="${esc(w.id)}">Add to my weapons</button></div>
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
        `<li><button type="button" data-weapon="${esc(w.id)}">${esc(w.name)}<small>${esc(w.damage.m || '')}</small></button></li>`).join('')}</ul>
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
    ? unarmedForSize(unarmedFrom.cls.progression[unarmedFrom.level - 1]?.other?.['Unarmed Damage'], view.race.size) : null;
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
function attackArgs(app, view, ctx, e) {
  const w = app.data.weaponsById.get(e.id);
  return {
    weapon: w, entry: { ...e, ...ctx.flagsFor(e, w) }, bab: view.stats.bab, mod: view.stats.mod, sizeAttack: SIZE_AC[view.race.size] ?? 0,
    size: view.race.size, haveFeats: view.haveFeats, proficient: ctx.proficient(w) || !!e.proficient,
    armorPenalty: ctx.armorPenalty, unarmedDamage: w.id === 'unarmed-strike' && ctx.unarmed ? ctx.unarmed : null,
    options: app.state.combat,
    // Power Attack / Deadly Aim grow with the real BAB, even in a flurry (where monk levels count as BAB).
    powerBab: view.stats.bab[0],
  };
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
  ].filter(([, feat]) => have.has(feat));
  $('combat-switches').innerHTML = switches.map(([key, feat, what]) =>
    `<label class="check-row"><input type="checkbox" data-combat="${key}" ${state.combat[key] ? 'checked' : ''}> Use ${esc(feat)} <span class="muted">(${esc(what)})</span></label>`).join('')
    || '<p class="hint">Power Attack, Deadly Aim and Rapid Shot switches appear here once you have those feats.</p>';

  // Hands: every carried weapon except ranged ones; the off hand can also be the other end of a double weapon.
  const melee = state.weapons.map((e, i) => [i, e, data.weaponsById.get(e.id)]).filter(([, , w]) => w && w.group !== 'ranged');
  const name = (e, w) => weaponLabel(w, e);
  const mainOpts = melee.map(([i, e, w]) => [String(i), name(e, w)]);
  const mainIndex = state.combat.main === '' ? null : Number(state.combat.main);
  const mainEntry = mainIndex !== null ? state.weapons[mainIndex] : null;
  const mainWeapon = mainEntry && data.weaponsById.get(mainEntry.id);
  const offOpts = [
    ...(mainWeapon && isDouble(mainWeapon) ? [[`${mainIndex}:1`, `Other end of the ${mainWeapon.name}`]] : []),
    ...melee.filter(([i, , w]) => i !== mainIndex && w.group !== 'two-handed').map(([i, e, w]) => [String(i), name(e, w)]),
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
    main: { weapon: mainWeapon, entry: mainArgs.entry, end: 0 },
    off: { weapon: offArgs.weapon, entry: offArgs.entry, end: offEnd || 0, proficient: offArgs.proficient,
           unarmedDamage: offArgs.unarmedDamage },
  });
  const off = r.off;
  const spec = { title: 'Two-weapon full attack', groups: [
    rollGroup('Main hand', r.main, critOf(mainWeapon, ctx.flagsFor(mainEntry, mainWeapon), have, mainEntry)),
    rollGroup('Off hand', off, critOf(offArgs.weapon, ctx.flagsFor(offEntry, offArgs.weapon), have, offEntry)),
  ] };
  $('twf-result').innerHTML = `<dl class="facts attack-line">
      <dt>Main hand</dt><dd><b>${esc(attackText(r.main))}</b>, ${esc(r.main.damage)}${usedText(r.main)}</dd>
      <dt>Off hand</dt><dd><b>${esc(attackText(off))}</b>, ${esc(off.damage)}${usedText(off)}</dd>
    </dl>
    <div class="slot-buttons">${rollButton(spec, 'Roll full attack')}</div>
    <p class="hint">Penalties ${r.penalties.main} main hand, ${r.penalties.off} off hand
      (${r.offLight ? 'light off-hand weapon' : 'off-hand weapon isn\'t light'}${have.has('Two-Weapon Fighting') ? ', Two-Weapon Fighting' : ', no Two-Weapon Fighting feat'}).
      Off-hand damage adds ${have.has('Double Slice') ? 'full Strength (Double Slice)' : 'half Strength'}.</p>`;
}

// The character's weapons, each with its quality, feats, proficiency, attack bonus and damage.
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
    return `<div class="weapon-card">
      <div class="weapon-head">
        <button type="button" class="link item-link" data-show-weapon="${esc(w.id)}">${esc(weaponLabel(w, e))}</button>
        <button type="button" class="link" data-remove-weapon="${i}">remove</button>
      </div>
      <dl class="facts attack-line">
        <dt>Attack</dt><dd><b>${esc(attackText(a))}</b> <span class="muted">(${a.abilityUsed === 'dex' ? 'Dex' : 'Str'}${a.used.length ? `, ${esc(a.used.join(', '))}` : ''})</span>
          ${rollButton({ title: weaponName, groups: [rollGroup('', a, crit)] })}</dd>
        <dt>Damage</dt><dd><b>${esc(damageWithExtras(a.damage, crit.fx))}</b>
          ${rollButton({ title: `${weaponName} damage`, groups: [{ attacks: [], damage: a.damage, extra: crit.extra }] }, 'Roll damage')}
          ${crit.fx.notes.length ? `<div class="muted small">${esc(crit.fx.notes.join(' '))}</div>` : ''}</dd>
        ${extra.join('')}
        <dt>Critical</dt><dd>${esc(critText(w, crit))}${crit.fx.burst.length ? ` <span class="muted">(plus ${esc(crit.fx.burst.map(b => `${b.dice} ${b.type}`).join(', '))} per step above ×1)</span>` : ''}
          ${w.critical ? rollButton({ title: `${weaponName} critical damage`, groups: [{ attacks: [], damage: a.damage, critMult: crit.mult, extra: crit.extra, burst: crit.burst }] }, 'Roll crit damage') : ''}</dd>
        ${w.range_ft ? `<dt>Range</dt><dd>${w.range_ft} ft.</dd>` : ''}
        <dt>Cost</dt><dd>${esc(formatGp(weaponCost(w, e)))}</dd>
      </dl>
      <div class="weapon-controls">
        <label>Quality <select data-weapon-quality="${i}">
          <option value="0"${quality === '0' ? ' selected' : ''}>Normal</option>
          <option value="mw"${quality === 'mw' ? ' selected' : ''}>Masterwork (+1 attack)</option>
          ${[1, 2, 3, 4, 5].map(n => `<option value="+${n}"${quality === `+${n}` ? ' selected' : ''}>+${n}</option>`).join('')}
        </select></label>
        ${app.data.itemsById ? abilityPicker(app, 'Weapon Special Abilities', e.abilities || [], {
          option: `data-w="${i}" data-wab-option`, remove: `data-w="${i}" data-wab-remove`, add: `data-w="${i}" data-wab-add`,
          disabled: !(e.enh > 0) }) + (e.enh > 0 ? '' : '<p class="hint">Special abilities need at least a +1 weapon.</p>') : ''}
        ${fromFeats.length ? `<p class="hint">From your feats: ${esc(fromFeats.join(', '))}.</p>` : ''}
        ${featBoxes}
        ${byRules ? '' : `<label class="check-row small"><input type="checkbox" data-weapon-flag="proficient" data-index="${i}" ${e.proficient ? 'checked' : ''}>
          Proficient anyway (e.g. from a feat or trait)</label>`}
      </div>
      ${isProficient ? '' : '<p class="warning">Not proficient: −4 on attack rolls.</p>'}
    </div>`;
  }).join('') || '<p class="hint">No weapons yet. Choose one below and add it.</p>';
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
    const btn = e.target.closest('[data-weapon]');
    if (!btn) return;
    selectedId = btn.dataset.weapon;
    renderPanel(app);
  });
  $('weapon-panel').addEventListener('click', e => {
    const btn = e.target.closest('[data-add-weapon]');
    if (btn) app.update({ weapons: [...app.state.weapons, { id: btn.dataset.addWeapon, enh: 0 }] });
  });
  $('my-weapons').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-weapon]');
    // Removing a weapon moves the others up the list, so the two-weapon choices are cleared.
    if (remove) app.update({ weapons: app.state.weapons.filter((_, i) => i !== Number(remove.dataset.removeWeapon)),
                             combat: { ...app.state.combat, main: '', off: '' } });
    const show = e.target.closest('[data-show-weapon]');
    if (show) showWeapon(app, show.dataset.showWeapon);
    // Special abilities (treasure or purchases, at market price): remove one.
    const rm = e.target.closest('[data-wab-remove]');
    if (rm) {
      const i = Number(rm.dataset.w);
      changeEntry(app, i, { abilities: (app.state.weapons[i].abilities || []).filter((_, j) => j !== Number(rm.dataset.wabRemove)) });
    }
  });
  $('my-weapons').addEventListener('change', e => {
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
