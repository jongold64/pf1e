// Special materials for armor and shields (Core Rulebook and Ultimate Equipment): which armor each can be made of,
// and what it changes. No page code here, so it can be tested on its own.
//
// withMaterial(item, materialId) returns the armor record as made of that material (name, price, weight, stats), so
// everything that reads armor (AC, check penalty, speed, cost, weight, the sheet) works unchanged. Extra fields:
// - mw_included: the material is always masterwork and its price includes that (check penalty already lowered by 1
//   or more; no separate +150 gp)
// - move_category: the category for speed and other limits (mithral: one lighter), while `category` stays the one
//   proficiency needs
// - metal: false when a druid can wear it
// - material, material_notes: the material's name and what it does that isn't a number here (DR, resistance...)

import { NON_METAL } from './armor.js';

const LEATHERS = ['leather', 'hide', 'studded-leather'];
const METAL_SHIELDS = ['buckler', 'light-steel-shield', 'heavy-steel-shield', 'light-steel-quickdraw-shield'];
const WOODEN_SHIELDS = ['light-wooden-shield', 'heavy-wooden-shield', 'light-wooden-quickdraw-shield', 'tower-shield'];
// Metal armor: not in NON_METAL, and not marked `metal: false` (armor from later books says which it is).
const isMetalArmor = a => a.category !== 'shield' && !NON_METAL.has(a.id) && a.metal !== false;
const byCategory = (light, medium, heavy) => a => ({ light, medium, heavy })[a.category];

// Each material: who can use it (`fits`), price (`price(a)` = the new full price), and changes. Prices from the
// materials' tables; "masterwork included" materials add the masterwork 150 gp inside their price.
export const ARMOR_MATERIALS = [
  { id: 'adamantine', name: 'Adamantine', mw: true, metal: true,
    fits: isMetalArmor, price: a => a.price_gp + byCategory(5000, 10000, 15000)(a),
    notes: a => `DR ${byCategory(1, 2, 3)(a)}/—`, dr: byCategory(1, 2, 3) },
  { id: 'angelskin', name: 'Angelskin', mw: true, metal: false,
    fits: a => LEATHERS.includes(a.id), price: a => a.price_gp + byCategory(1000, 2000, 0)(a),
    notes: () => 'masks evil auras (10 Hit Dice weaker)' },
  { id: 'bone', name: 'Bone', mw: false, metal: false,
    fits: a => ['studded-leather', 'scale-mail', 'breastplate', ...WOODEN_SHIELDS.filter(id => id !== 'tower-shield')].includes(a.id),
    price: a => a.price_gp / 2, bonus: -1, acp: a => (a.id === 'studded-leather' ? 1 : 0),
    notes: () => 'fragile (unless magic); hardness 5' },
  { id: 'bronze', name: 'Bronze', mw: false, metal: true,
    fits: a => isMetalArmor(a) && a.category !== 'heavy', price: a => a.price_gp,
    notes: () => 'fragile (unless magic); hardness 9' },
  { id: 'darkleaf-cloth', name: 'Darkleaf cloth', mw: true, metal: false,
    fits: a => ['padded', ...LEATHERS].includes(a.id), price: a => a.price_gp + byCategory(750, 1500, 0)(a),
    asf: -10, minAsf: 5, dex: 2, acp: () => 3, weight: 0.5 },
  { id: 'darkwood', name: 'Darkwood', mw: true, metal: false,
    fits: a => WOODEN_SHIELDS.includes(a.id), price: a => a.price_gp + 150 + 10 * (a.weight_lbs || 0),
    acp: () => 2, weight: 0.5 },
  { id: 'dragonhide', name: 'Dragonhide', mw: true, metal: false,
    fits: a => ['hide', 'banded-mail', 'half-plate', 'breastplate', 'full-plate', 'light-wooden-shield', 'heavy-wooden-shield',
      'light-steel-shield', 'heavy-steel-shield'].includes(a.id),
    price: a => 2 * (a.price_gp + 150), notes: () => 'immune to the dragon\'s energy type (the armor, not the wearer)' },
  { id: 'eel-hide', name: 'Eel hide', mw: true, metal: false,
    fits: a => LEATHERS.includes(a.id), price: a => a.price_gp + byCategory(1200, 1800, 0)(a),
    dex: 1, acp: () => 1, notes: () => 'electricity resistance 2' },
  { id: 'elysian-bronze', name: 'Elysian bronze', mw: false, metal: true,
    fits: isMetalArmor, price: a => a.price_gp + byCategory(1000, 2000, 3000)(a),
    notes: a => `DR ${byCategory(1, 2, 3)(a)}/— against magical beasts' and monstrous humanoids' natural weapons and unarmed strikes` },
  { id: 'fire-forged-steel', name: 'Fire-forged steel', mw: true, metal: true,
    fits: isMetalArmor, price: a => a.price_gp + byCategory(1000, 2500, 3000)(a), notes: () => 'fire resistance 2' },
  { id: 'frost-forged-steel', name: 'Frost-forged steel', mw: true, metal: true,
    fits: isMetalArmor, price: a => a.price_gp + byCategory(1000, 2500, 3000)(a), notes: () => 'cold resistance 2' },
  { id: 'gold', name: 'Gold', mw: false, metal: true,
    fits: a => isMetalArmor(a) && a.category !== 'heavy', price: a => a.price_gp * 10, bonus: -2, acp: () => -2, weight: 1.5,
    notes: () => 'hardness 5' },
  { id: 'gold-plated', name: 'Gold-plated', mw: false, metal: true,
    fits: a => isMetalArmor(a) || METAL_SHIELDS.includes(a.id), price: a => a.price_gp * 3 },
  { id: 'griffon-mane', name: 'Griffon mane', mw: false, metal: false,
    fits: a => ['padded', 'quilted-cloth'].includes(a.id), price: a => a.price_gp + 200, notes: () => '+2 competence bonus on Fly checks' },
  { id: 'living-steel', name: 'Living steel', mw: false, metal: true,
    fits: a => isMetalArmor(a) || METAL_SHIELDS.includes(a.id),
    price: a => a.price_gp + (a.category === 'shield' ? 100 : byCategory(500, 1000, 1500)(a)),
    notes: () => 'repairs itself 2 hp a day; may break metal weapons that roll a natural 1 against you' },
  { id: 'mithral', name: 'Mithral', mw: true, metal: true,
    fits: a => isMetalArmor(a) || METAL_SHIELDS.includes(a.id),
    price: a => a.price_gp + (a.category === 'shield' ? 1000 : byCategory(1000, 4000, 9000)(a)),
    asf: -10, minAsf: 0, dex: 2, acp: () => 3, weight: 0.5, lighter: true },
];

export const materialById = new Map(ARMOR_MATERIALS.map(m => [m.id, m]));

// The materials an armor or shield can be made of.
export function materialsFor(item) {
  return item ? ARMOR_MATERIALS.filter(m => m.fits(item)) : [];
}

const LIGHTER = { heavy: 'medium', medium: 'light', light: 'light' };

// The armor or shield made of a material ('' or one that doesn't fit = the item unchanged).
export function withMaterial(item, materialId) {
  const m = materialById.get(materialId);
  if (!item || !m || !m.fits(item)) return item;
  // Masterwork lowers the check penalty by 1; a material's own reduction includes that (mithral: 3 in all). Gold
  // makes it worse.
  const change = m.acp ? m.acp(item) : m.mw ? 1 : 0;
  const acp = change < 0 ? item.check_penalty + change : Math.min(0, item.check_penalty + change);
  const notes = m.notes ? m.notes(item) : '';
  return {
    ...item,
    name: `${m.name} ${item.name.toLowerCase()}`,
    material: m.name,
    material_id: m.id,
    material_notes: notes,
    bonus: Math.max(0, item.bonus + (m.bonus || 0)),
    max_dex: item.max_dex === null || item.max_dex === undefined ? item.max_dex : item.max_dex + (m.dex || 0),
    check_penalty: acp,
    spell_failure: m.asf ? Math.max(Math.min(item.spell_failure, m.minAsf), item.spell_failure + m.asf) : item.spell_failure,
    weight_lbs: item.weight_lbs === null ? null : Math.round(item.weight_lbs * (m.weight || 1) * 100) / 100,
    price_gp: item.price_gp === null ? null : m.price(item),
    mw_included: m.mw,
    move_category: m.lighter && item.category !== 'shield' ? LIGHTER[item.category] : item.category,
    metal: m.metal,
    dr: m.dr ? m.dr(item) : 0,
  };
}
