// Custom armor and shields (Armor tab, Custom button): ones the list doesn't have, made into armor records like the
// list's (data/armor.json), so wearing them, magic, materials, AC, max Dex, check penalty and speed work the same way.
// No page code here.
//
// state.customArmor = [{ id ('ca-...'), name, category ('light' | 'medium' | 'heavy' | 'shield'), bonus, maxDex (null:
//   no limit), check (0 or less), spellFailure (%), price, weight, notes }].

export const CATEGORIES = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor'], ['shield', 'Shield']];

// The armor record: medium and heavy armor slow you (30 ft. to 20, 20 to 15), light armor and shields don't.
export function customArmorRecord(d) {
  const slow = d.category === 'medium' || d.category === 'heavy';
  return { id: d.id, name: d.name, source: 'Custom', category: d.category, bonus: d.bonus, max_dex: d.maxDex, check_penalty: d.check,
    spell_failure: d.spellFailure, speed_30: slow ? 20 : 30, speed_20: slow ? 15 : 20, price_gp: d.price, weight_lbs: d.weight,
    description: d.notes || 'Custom armor.', custom: true };
}

// Saved definitions tidied (at most 30).
export function tidyCustomArmor(saved) {
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : d);
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 30).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('ca-') ? d.id.slice(0, 40) : `ca-${i}`, name: String(d.name || 'Custom armor').slice(0, 60),
    category: CATEGORIES.some(([c]) => c === d.category) ? d.category : 'light', bonus: Math.round(num(d.bonus, 0, 20, 2)),
    maxDex: d.maxDex === null || d.maxDex === undefined || d.maxDex === '' ? null : Math.round(num(Number(d.maxDex), 0, 20, 4)),
    check: Math.round(num(d.check, -20, 0, 0)), spellFailure: Math.round(num(d.spellFailure, 0, 100, 0)),
    price: num(d.price, 0, 1e7, 0), weight: num(d.weight, 0, 1000, 0), notes: String(d.notes || '').slice(0, 500),
  }));
}
