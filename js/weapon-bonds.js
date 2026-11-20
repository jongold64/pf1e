// Class features that put an enhancement bonus and special abilities on a weapon for a while, chosen each time they're
// used: the magus's arcane pool, the paladin's divine bond (weapon), the antipaladin's fiendish boon (weapon) and the
// warpriest's sacred weapon. (A talented monk's ki weapons is talented-monk.js.) No page code here.
//
// state.weaponBonds = { [bond id]: { enh, abilities: [{ id, name, option?, bonus }], weapon, on } }: weapon is the
// index in state.weapons it's on; on: switched on (its point, use or round taken from Daily uses).

const lower = s => String(s || '').toLowerCase();

// budget(level): the bonus to spend; abilitiesFrom: the class level special abilities can be added from; pool: the Daily
// uses counter it spends from (matched on its name); allowed: the special abilities it can add, by name.
export const BONDS = [
  { id: 'arcane-pool', name: 'Arcane pool weapon', cls: 'magus', feature: 'Arcane Pool', from: 1, abilitiesFrom: 5,
    budget: l => Math.min(5, 1 + Math.floor((l - 1) / 4)), pool: /^arcane pool/i, spend: '1 arcane pool point',
    how: 'a swift action, 1 arcane pool point: for 1 minute, on a weapon you hold (one at a time)',
    allowed: () => ['Dancing', 'Flaming', 'Flaming Burst', 'Frost', 'Icy Burst', 'Keen', 'Shock', 'Shocking Burst', 'Speed', 'Vorpal'] },
  { id: 'divine-bond', name: 'Divine bond weapon', cls: 'paladin', feature: 'Divine Bond', from: 5, abilitiesFrom: 5,
    budget: l => Math.min(6, 1 + Math.floor((l - 5) / 3)), pool: /^divine bond/i, spend: '1 use of divine bond',
    how: 'a standard action, 1 use: for 1 minute per paladin level, on your bonded weapon (if you chose the weapon bond)',
    allowed: () => ['Axiomatic', 'Brilliant Energy', 'Defending', 'Disruption', 'Flaming', 'Flaming Burst', 'Holy', 'Keen', 'Merciful', 'Speed'] },
  { id: 'fiendish-boon', name: 'Fiendish boon weapon', cls: 'antipaladin', feature: 'Fiendish Boon', from: 5, abilitiesFrom: 5,
    budget: l => Math.min(6, 1 + Math.floor((l - 5) / 3)), pool: /^fiendish boon/i, spend: '1 use of fiendish boon',
    how: 'a standard action, 1 use: for 1 minute per antipaladin level, on your weapon (if you chose the weapon boon)',
    allowed: () => ['Anarchic', 'Flaming', 'Flaming Burst', 'Keen', 'Speed', 'Unholy', 'Vicious', 'Vorpal', 'Wounding'] },
  { id: 'sacred-weapon', name: 'Sacred weapon enhancement', cls: 'warpriest', feature: 'Sacred Weapon', from: 4, abilitiesFrom: 4,
    budget: l => Math.min(5, 1 + Math.floor((l - 4) / 4)), pool: /^sacred weapon/i, spend: '1 round of sacred weapon',
    how: 'a swift action: rounds a day equal to your warpriest level (switching it on takes the first round), on a sacred weapon',
    // More by alignment: chaotic anarchic and vicious, evil mighty cleaving and unholy, good ghost touch and holy,
    // lawful axiomatic and merciful, true neutral spell storing and thundering.
    allowed: (alignment = '') => {
      const a = String(alignment).toUpperCase();
      const more = [a[0] === 'C' && ['Anarchic', 'Vicious'], a[1] === 'E' && ['Mighty Cleaving', 'Unholy'], a[1] === 'G' && ['Ghost Touch', 'Holy'],
        a[0] === 'L' && ['Axiomatic', 'Merciful'], (a === 'N' || a === 'TN' || a === 'NN') && ['Spell Storing', 'Thundering']].filter(Boolean).flat();
      return ['Brilliant Energy', 'Defending', 'Disruption', 'Flaming', 'Frost', 'Keen', 'Shock', ...more];
    } },
];
export const bondById = new Map(BONDS.map(b => [b.id, b]));

// The bonds a character has: the class at the level it comes at, and the feature not replaced by an archetype.
// counts: [{ cls, level }] (classes with archetypes applied). [{ ...bond, level, budget, allowed: [names], abilities: bool }].
export function bondsFor(counts = [], alignment = '') {
  const out = [];
  for (const b of BONDS) {
    const e = counts.find(x => x.cls?.id === b.cls);
    if (!e || e.level < b.from) continue;
    const replaced = new Set((e.cls.progression || []).flatMap(r => r.replaced || []).map(lower));
    if (replaced.has(lower(b.feature))) continue;
    out.push({ ...b, level: e.level, budget: b.budget(e.level), allowed: b.allowed(alignment), abilities: e.level >= b.abilitiesFrom });
  }
  return out;
}

export const bondCost = c => (c?.enh || 0) + (c?.abilities || []).reduce((n, a) => n + (a.bonus || 0), 0);

// A saved choice tidied against a budget: enhancement 0-5 (and within the budget), abilities each within what's left,
// later ones dropped; weapon a whole number (index in state.weapons) or -1.
export function tidyBond(saved, budget = 5) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const enh = Number.isInteger(s.enh) ? Math.max(0, Math.min(5, budget, s.enh)) : 0;
  const abilities = [];
  let left = budget - enh;
  for (const a of Array.isArray(s.abilities) ? s.abilities : []) {
    if (!a || typeof a.id !== 'string' || !Number.isInteger(a.bonus) || a.bonus < 1 || a.bonus > left || abilities.some(x => x.id === a.id)) continue;
    abilities.push({ id: a.id, name: String(a.name || a.id), ...(typeof a.option === 'string' && a.option ? { option: a.option } : {}), bonus: a.bonus });
    left -= a.bonus;
  }
  const weapon = Number.isInteger(s.weapon) && s.weapon >= 0 ? s.weapon : -1;
  return { enh, abilities, weapon, on: s.on === true && enh + abilities.length > 0 };
}

// All the saved bonds tidied (unknown ids dropped; budgets of 6 at most).
export function tidyBonds(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return Object.fromEntries(Object.entries(s).filter(([id]) => bondById.has(id)).map(([id, v]) => [id, tidyBond(v, 6)]));
}

// A weapon's entry while a bond is on: its enhancement bonus added to the weapon's own (up to +5) and the abilities
// added (a duplicate doesn't stack).
export function bondEntry(entry = {}, c) {
  if (!c?.on) return entry;
  const own = entry.abilities || [];
  return { ...entry, enh: Math.min(5, (entry.enh || 0) + (c.enh || 0)), abilities: [...own, ...(c.abilities || []).filter(a => !own.some(b => b.id === a.id))] };
}

// "+2, flaming".
export const bondText = c => [c?.enh ? `+${c.enh}` : '', ...(c?.abilities || []).map(a => lower(a.name))].filter(Boolean).join(', ');

// Problems with a choice: abilities on a weapon with no enhancement bonus ("at least a +1 enhancement bonus must be
// added before any other properties"), more than +5 enhancement in all. weaponEnh: the weapon's own bonus.
export function bondProblems(c, weaponEnh = 0) {
  const out = [];
  if ((c?.abilities || []).length && !(c.enh || 0) && !weaponEnh) out.push('The weapon needs a +1 enhancement bonus before special abilities can be added: give it +1 first.');
  if ((c?.enh || 0) + weaponEnh > 5) out.push(`The weapon's own +${weaponEnh} and this +${c.enh} make more than +5: only +5 counts.`);
  return out;
}
