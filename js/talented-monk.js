// The talented monk (Rogue Genius Games, The Genius Guide to the Talented Monk and More Monk Talents; third-party,
// data/third-party.json): what its chosen edges and talents add up to. No page code here, so it can be tested on its own.
//
// The class has no fixed features: Wisdom to AC, fast movement, a ki pool, flurry and the rest are edges and talents
// the player picks (talents.js TALENT_RULES['talented-monk']). Option names are "Unfettered Kata", "Fighting Style:
// Monk", "Ki Power: Barkskin"...

export const TALENTED_MONK = 'talented-monk';

// The options chosen for the talented monk: talents = state.talents ({ "talented-monk|edge|1": option id }),
// byId = data.talentsById. Returns the option records.
export function talentedMonkPicks(talents = {}, byId = new Map()) {
  return Object.entries(talents).filter(([slot]) => slot.startsWith(`${TALENTED_MONK}|`))
    .map(([, id]) => byId.get(id)).filter(Boolean);
}

const has = (picks, name) => picks.some(p => p.name === name);
const half = n => Math.floor(n / 2);

// Edges and talents work in armor only with the kata for it ("monk edges and talents only work when wearing no armor").
export function armorAllows(picks, armorCategory) {
  if (!armorCategory) return true;
  if (armorCategory === 'light') return has(picks, 'Light Armor Kata') || has(picks, 'Medium Armor Kata');
  if (armorCategory === 'medium') return has(picks, 'Medium Armor Kata');
  return false;
}

// Unfettered kata's AC and CMD bonus beside Wisdom: +1 at 4th level and every 4 levels after, at most +5.
export const unfetteredBonus = level => Math.min(5, Math.floor(level / 4));

// Fast movement edge: +10 ft. to 5th level, +20 ft. at 6th, then +10 ft. every 3 levels, at most +60 ft. (18th).
export const tmFastMovement = level => (level < 6 ? 10 : Math.min(60, 20 + 10 * Math.floor((level - 6) / 3)));

// Deadly strikes' damage die (Deadly Strikes Table 1: weapons with a 20/x2 critical, including unarmed strikes; Table 2
// for others) for the monk's level and size.
const DEADLY = {
  1: { Small: ['1d4', '1d3'], Medium: ['1d6', '1d4'], Large: ['1d8', '1d6'] },
  4: { Small: ['1d6', '1d4'], Medium: ['1d8', '1d6'], Large: ['2d6', '1d8'] },
  8: { Small: ['1d8', '1d6'], Medium: ['1d10', '1d8'], Large: ['2d8', '2d6'] },
  12: { Small: ['1d10', '1d8'], Medium: ['2d6', '1d10'], Large: ['3d6', '2d8'] },
  16: { Small: ['2d6', '1d10'], Medium: ['2d8', '2d6'], Large: ['3d8', '3d6'] },
  20: { Small: ['2d8', '2d6'], Medium: ['2d10', '2d8'], Large: ['4d8', '3d8'] },
};
export function deadlyStrikesDie(level, size = 'Medium', simple = true) {
  const step = [20, 16, 12, 8, 4, 1].find(l => level >= l) || 1;
  const row = DEADLY[step][size] || DEADLY[step].Medium;
  return row[simple ? 0 : 1];
}

// The weapon groups chosen with the fighting style edge ("Monk", "Close"...).
export const fightingGroups = picks => picks.filter(p => p.weapon_group).map(p => p.weapon_group);

// The weapons a fighting style option lists: its first paragraph, "Monk: bo staff, brass knuckles, ..., and wushu dart."
const listed = p => String(p.text || '').split('\n')[0].replace(/^[^:]*:\s*/, '').replace(/\.$/, '').split(/,\s*(?:and\s+)?|\s+and\s+/)
  .map(s => s.trim().toLowerCase()).filter(Boolean);
// "Crossbow, light" -> "light crossbow"; "Sword, short" -> "short sword".
const plainName = n => String(n).toLowerCase().replace(/^(.+?),\s*(.+)$/, '$2 $1');

// Does a weapon work with the talented monk's weapon-related edges and talents (marked *) and the specialty attack
// bonus? Yes for the fighting style groups chosen (by the weapon's groups, or named in the group's list, which is
// how the book's pirate and improvised groups work), for unarmed strikes with unfettered kata, and for the weapons chosen
// with the adaptive style talent (adaptive: weapon ids).
export function styleWeapon(picks, weapon, adaptive = []) {
  if (!weapon) return false;
  if (adaptive.includes(weapon.id)) return true;
  if (weapon.id === 'unarmed-strike' && has(picks, 'Unfettered Kata')) return true;
  const groups = (weapon.groups || []).map(g => g.toLowerCase());
  const names = [plainName(weapon.name), String(weapon.name).toLowerCase()];
  return picks.filter(p => p.weapon_group).some(p => groups.includes(p.weapon_group.toLowerCase())
    || listed(p).some(n => names.includes(n) || names.includes(n.replace(/s$/, ''))));
}

// A weapon with a 20/x2 critical (unarmed strikes too) uses Deadly Strikes Table 1, any other Table 2.
export const simpleCritical = weapon => !/1[0-9][-–]20/.test(String(weapon?.critical || '')) && !/[x×]\s*[3-9]/.test(String(weapon?.critical || ''));

// The talented monk's flurry of blows edge: one extra attack at the specialty attack bonus (all attacks -2), a second
// at 8th level (-3 more) and a third at 15th (-7 more). specialty = the specialty attack bonuses as a list
// (iteratives), level = talented monk level. Returns the attack bonuses before the -2.
export function tmFlurryBabs(specialty, level) {
  const [first, ...rest] = specialty;
  return [first, first, ...(level >= 8 ? [first - 3] : []), ...(level >= 15 ? [first - 7] : []), ...rest];
}

// The always-on bonuses, as class-feature effects (the shape class-features.js gives): level = talented monk level,
// mod = ability modifiers, armorCategory = worn armor's category (null for none), shield, load ('light'...),
// specialty = the specialty attack bonus minus the base attack bonus at this level (for maneuver training's CMD).
export function talentedMonkEffects(picks, level, { mod = {}, armorCategory = null, shield = false, load = 'light', specialty = 0 } = {}) {
  const out = [];
  const add = (name, parts) => {
    const [first, ...more] = parts.filter(p => p.value);
    if (first) out.push({ name, ...first, ...(more.length ? { more } : {}), on: true, classFeature: true });
  };
  if (!level) return out;
  const armorOk = armorAllows(picks, armorCategory);
  // Unfettered kata: Wisdom bonus and +1 per 4 levels to AC and CMD, unarmored, without a shield, with a light load
  // (even with a kata for armor). It counts against touch attacks and when flat-footed, like a monk's.
  if (has(picks, 'Unfettered Kata') && !armorCategory && !shield && load === 'light') {
    add('Unfettered kata (talented monk)', [{ target: 'ac', type: 'untyped', value: Math.max(0, mod.wis || 0) + unfetteredBonus(level) }]);
  }
  if (has(picks, 'Iron Monk')) add('Iron monk (talented monk)', [{ target: 'ac', type: 'natural armor', value: 1 }]);
  if (has(picks, 'Fast Movement') && armorOk && load !== 'heavy') {
    add('Fast movement (talented monk)', [{ target: 'speed', type: 'untyped', value: tmFastMovement(level) }]);
  }
  if (has(picks, 'Devoted Guardian')) add('Devoted guardian (talented monk)', [{ target: 'init', type: 'untyped', value: half(level) }]);
  if (has(picks, 'Maneuver Training') && specialty > 0) add('Maneuver training (talented monk)', [{ target: 'cmd', type: 'untyped', value: specialty }]);
  if (has(picks, 'Mystic Prescience')) add('Mystic prescience (talented monk)', [{ target: 'ac', type: 'insight', value: level >= 20 ? 4 : 2 }]);
  if (has(picks, 'Vow of Silence')) {
    add('Vow of silence (talented monk)', [{ target: 'ac', type: 'insight', value: 2 },
      ...['Sense Motive', 'Stealth', 'Perception'].map(s => ({ target: `skill:${s}`, type: 'untyped', value: 4 }))]);
  }
  if (has(picks, 'Ki Mystic') && has(picks, 'Ki Pool')) {
    add('Ki mystic (talented monk)', ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility',
      'planes', 'religion'].map(k => ({ target: `skill:Knowledge (${k})`, type: 'untyped', value: 2 })));
  }
  if (has(picks, 'Pure Power')) add('Pure power (talented monk)', ['str', 'dex', 'wis'].map(a => ({ target: a, type: 'untyped', value: 2 })));
  return out;
}

// Daily uses: the ki pool edge (half the level + Wisdom modifier), the advice edge (level + Wisdom modifier rounds), and
// the talents that grant a feat usable level + 1 per 4 levels in other classes times a day. Returns
// [{ name, max, unit, how, text }].
export function talentedMonkDaily(picks, level, otherLevels, mod = {}) {
  const out = [];
  const byName = name => picks.find(p => p.name === name);
  const wis = mod.wis || 0;
  const sg = n => (n < 0 ? `− ${-n}` : `+ ${n}`);
  if (byName('Ki Pool')) {
    out.push({ name: 'Ki pool', max: half(level) + wis, unit: 'points', how: `half your talented monk level (${half(level)}) ${sg(wis)} (Wisdom modifier)`, text: byName('Ki Pool').text });
  }
  if (byName('Advice')) out.push({ name: 'Advice', max: Math.max(1, level + wis), unit: 'rounds', how: `your talented monk level (${level}) ${sg(wis)} (Wisdom modifier), at least 1`, text: byName('Advice').text });
  const extra = Math.floor(otherLevels / 4);
  for (const name of ['Stunning Fist', 'Elemental Fist', 'Punishing Kick', 'Perfect Strike', 'Touch of Serenity']) {
    const p = byName(name);
    if (p) out.push({ name, max: level + extra, unit: 'uses', how: `your talented monk level (${level})${extra ? ` + ${extra} for your levels in other classes` : ''}`, text: p.text });
  }
  return out;
}

// Ki weapons (advanced talent): for 1 round, 1 ki per +1 of enhancement bonus or of a special ability's bonus, at
// most 3 ki at a time, on the monk's unarmed strikes and weapons. state.kiWeapons = { enh, abilities: [{ id, name,
// option?, bonus }], on } (on: switched on for this round, its ki spent).
export const KI_WEAPONS_MAX = 3;
export const kiWeaponsCost = k => (k?.enh || 0) + (k?.abilities || []).reduce((n, a) => n + (a.bonus || 0), 0);
// A saved choice tidied: enhancement 0-3, abilities with a +1 to +3 bonus, not more than 3 ki in all (later ones dropped).
export function tidyKiWeapons(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const enh = Number.isInteger(s.enh) ? Math.max(0, Math.min(KI_WEAPONS_MAX, s.enh)) : 0;
  const abilities = [];
  let left = KI_WEAPONS_MAX - enh;
  for (const a of Array.isArray(s.abilities) ? s.abilities : []) {
    if (!a || typeof a.id !== 'string' || !Number.isInteger(a.bonus) || a.bonus < 1 || a.bonus > left || abilities.some(b => b.id === a.id)) continue;
    abilities.push({ id: a.id, name: String(a.name || a.id), ...(typeof a.option === 'string' && a.option ? { option: a.option } : {}), bonus: a.bonus });
    left -= a.bonus;
  }
  return { enh, abilities, on: s.on === true && enh + abilities.length > 0 };
}
// A weapon's entry while ki weapons is on: the higher enhancement bonus (they don't stack) and the abilities added.
export function kiWeaponsEntry(entry = {}, k) {
  if (!k?.on) return entry;
  const own = entry.abilities || [];
  return { ...entry, enh: Math.max(entry.enh || 0, k.enh || 0), abilities: [...own, ...(k.abilities || []).filter(a => !own.some(b => b.id === a.id))] };
}
// "+2, flaming (3 ki)".
export const kiWeaponsText = k => [k?.enh ? `+${k.enh}` : '', ...(k?.abilities || []).map(a => a.name.toLowerCase())].filter(Boolean).join(', ')
  + ` (${kiWeaponsCost(k)} ki)`;

// The feats the edges and talents grant (counted like free class feats): unfettered kata gives Improved Unarmed Strike,
// sohei Mounted Combat, and the talents named after a feat give that feat.
export function talentedMonkFeats(picks) {
  const out = [];
  if (has(picks, 'Unfettered Kata')) out.push('Improved Unarmed Strike');
  if (has(picks, 'Sohei')) out.push('Mounted Combat');
  for (const name of ['Stunning Fist', 'Elemental Fist', 'Punishing Kick', 'Perfect Strike', 'Touch of Serenity']) {
    if (has(picks, name)) out.push(name);
  }
  return out;
}
