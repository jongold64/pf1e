// Custom weapons (Weapons tab, Custom button): weapons the list doesn't have, made into weapon records like the list's
// (data/weapons.json), so attacks, criticals, sizes, cost and weight work the same way. No page code here.
//
// state.customWeapons = [{ id ('cw-...'), name, proficiency, group, damage (Medium), threat, multiplier, type, range,
//   thrown, finesse, price, weight, notes }].

// Damage dice for Small, Tiny and Large versions of a Medium weapon (Core Rulebook, Table 6-5 and Tiny and Large Weapon
// Damage).
const SMALLER = { '1d2': '1', '1d3': '1', '1d4': '1d3', '1d6': '1d4', '1d8': '1d6', '1d10': '1d8', '1d12': '1d10', '2d4': '1d6', '2d6': '1d10', '2d8': '2d6', '2d10': '2d8' };
const LARGER = { '1d2': '1d3', '1d3': '1d4', '1d4': '1d6', '1d6': '1d8', '1d8': '2d6', '1d10': '2d8', '1d12': '3d6', '2d4': '2d6', '2d6': '3d6', '2d8': '3d8', '2d10': '4d8' };
export const DICE = ['1d2', '1d3', '1d4', '1d6', '1d8', '1d10', '1d12', '2d4', '2d6', '2d8', '2d10'];
export const TYPES = ['B', 'P', 'S', 'B or P', 'B or S', 'P or S', 'B and P', 'B, P, and S'];
export const GROUPS = [['light', 'Light (one hand, off-hand friendly)'], ['one-handed', 'One-handed'], ['two-handed', 'Two-handed'], ['ranged', 'Ranged']];
export const sizeDice = m => {
  const s = SMALLER[m] || m;
  return { t: SMALLER[s] || s, s, m, l: LARGER[m] || m };
};

// The weapon record for a custom weapon.
export function customWeaponRecord(d) {
  return { id: d.id, name: d.name, source: 'Custom', category: 'Custom Weapons', proficiency: d.proficiency, group: d.group,
    firearm: false, thrown: !!d.thrown, damage: sizeDice(d.damage), threat: d.threat, multiplier: d.multiplier,
    critical: `${d.threat < 20 ? `${d.threat}-20/` : ''}×${d.multiplier}`, range_ft: d.group === 'ranged' || d.thrown ? d.range || 10 : null,
    type: d.type, special: [], price: `${d.price} gp`, price_gp: d.price, weight_lbs: d.weight, finesse: !!d.finesse,
    description: d.notes || 'A custom weapon.', origin: 'custom', groups: [], custom: true };
}

// Saved definitions tidied (at most 30).
export function tidyCustomWeapons(saved) {
  const num = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v * 100) / 100) : 0);
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 30).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('cw-') ? d.id.slice(0, 40) : `cw-${i}`, name: String(d.name || 'Custom weapon').slice(0, 60),
    proficiency: ['simple', 'martial', 'exotic'].includes(d.proficiency) ? d.proficiency : 'martial',
    group: GROUPS.some(([g]) => g === d.group) ? d.group : 'one-handed', damage: DICE.includes(d.damage) ? d.damage : '1d6',
    threat: [18, 19, 20].includes(d.threat) ? d.threat : 20, multiplier: [2, 3, 4].includes(d.multiplier) ? d.multiplier : 2,
    type: TYPES.includes(d.type) ? d.type : 'S', range: num(d.range, 500), thrown: d.thrown === true, finesse: d.finesse === true,
    price: num(d.price, 1e6), weight: num(d.weight, 1000), notes: String(d.notes || '').slice(0, 500),
  }));
}
