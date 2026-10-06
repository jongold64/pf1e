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

// Special materials for weapons (Core Rulebook and Ultimate Equipment, Special Materials). Each: which weapons it fits
// (`fits(w)`), what it adds to the price (`extra(w, { base, weight, magic })`: base = the weapon's price, weight its
// weight, magic = whether it has an enhancement or special ability) with `priceText`, `mw` (always masterwork, the
// masterwork cost included), `weight` (multiplier), `damage(w)` (on damage rolls) and `notes` (what it does in play).
// The rules leave some fits to the GM ("mostly wooden", "has metal parts"); these follow the books' examples.
const NONMETAL_WEAPON = /\b(club|greatclub|quarterstaff|bo staff|hanbo|staff|sling|blowgun|whip|net|lasso|bolas|sap|boomerang|shortbow|longbow|bow|hornbow|throwing arrow cord)\b/i;
const WOODEN_WEAPON = /\b(bow|crossbow|club|greatclub|quarterstaff|staff|hanbo|spear|shortspear|longspear|javelin|lance|pike|boomerang|tonfa|nunchaku|crook)\b/i;
const HAFTED_WEAPON = /\b(axe|waraxe|greataxe|handaxe|halberd|glaive|guisarme|ranseur|bardiche|bec de corbin|hammer|warhammer|maul|pick|mace|morningstar|flail|trident|scythe|fauchard|naginata|spear|lance|pike)\b/i;
const melee = w => w.group !== 'ranged' && w.id !== 'unarmed-strike';
const metalWeapon = w => w.id !== 'unarmed-strike' && w.group !== 'ranged' && !NONMETAL_WEAPON.test(w.name);
const woodenWeapon = w => WOODEN_WEAPON.test(w.name);
const hafted = w => woodenWeapon(w) || HAFTED_WEAPON.test(w.name);
const pierceOrSlash = w => /[PS]/.test(w.type || '');
const lightOrOne = w => ['light', 'one-handed'].includes(w.group);
const spearLike = w => /\b(spear|shortspear|longspear|javelin)\b/i.test(w.name);

export const WEAPON_MATERIALS = [
  { id: 'adamantine', name: 'Adamantine', mw: true, fits: metalWeapon, extra: () => 3000, priceText: '+3,000 gp (masterwork included)',
    notes: 'Bypasses DR/adamantine; ignores hardness below 20 when sundering or attacking objects.' },
  { id: 'blood-crystal', name: 'Blood crystal', fits: w => metalWeapon(w) && pierceOrSlash(w), extra: () => 1500, priceText: '+1,500 gp',
    notes: '+1 damage on a hit against a creature suffering a bleed effect; half the weapon\u2019s hit points.' },
  { id: 'bone', name: 'Bone', fits: w => melee(w) && (lightOrOne(w) || (w.group === 'two-handed' && w.type === 'B') || spearLike(w)),
    extra: (w, x) => -x.base / 2, priceText: 'half price', damage: () => -2,
    notes: '\u22122 on damage rolls (minimum 1); fragile; half hardness (a magic bone weapon isn\u2019t fragile).' },
  { id: 'bronze', name: 'Bronze', fits: w => metalWeapon(w) && (lightOrOne(w) || /\b(spear|axe|rhomphaia)\b/i.test(w.name)),
    extra: () => 0, priceText: 'same price', notes: 'Fragile (unless magically strengthened).' },
  { id: 'cold-iron', name: 'Cold iron', fits: metalWeapon, extra: (w, x) => x.base + (x.magic ? 2000 : 0),
    priceText: 'twice the price, +2,000 gp once it\u2019s magic', notes: 'Bypasses DR/cold iron (demons, fey).' },
  { id: 'darkwood', name: 'Darkwood', mw: true, weight: 0.5, fits: woodenWeapon, extra: (w, x) => 300 + 10 * x.weight,
    priceText: 'masterwork +10 gp per pound', notes: 'Half weight.' },
  { id: 'elysian-bronze', name: 'Elysian bronze', fits: metalWeapon, extra: () => 1000, priceText: '+1,000 gp',
    notes: '+1 damage against magical beasts and monstrous humanoids (multiplied on a critical hit); after damaging one, +1 on attacks against that kind for 24 hours.' },
  { id: 'fire-forged-steel', name: 'Fire-forged steel', mw: true, fits: metalWeapon, extra: () => 600, priceText: '+600 gp (masterwork included)',
    notes: 'After taking 10 or more fire damage, +1d4 fire damage for 2 rounds (1d6 for 4 rounds with fire-forged armor).' },
  { id: 'frost-forged-steel', name: 'Frost-forged steel', mw: true, fits: metalWeapon, extra: () => 600, priceText: '+600 gp (masterwork included)',
    notes: 'After taking 10 or more cold damage, +1d4 cold damage for 2 rounds (1d6 for 4 rounds with frost-forged armor).' },
  { id: 'gold', name: 'Gold', weight: 1.5, fits: w => metalWeapon(w) && w.group === 'light' && pierceOrSlash(w),
    extra: (w, x) => 9 * x.base, priceText: '10 times the price', damage: () => -2,
    notes: '\u22122 on damage rolls (minimum 1); fragile; half hardness; 50% heavier.' },
  { id: 'greenwood', name: 'Greenwood', mw: true, fits: woodenWeapon, extra: (w, x) => 300 + 50 * x.weight,
    priceText: 'masterwork +50 gp per pound', notes: 'Heals itself when damp on fertile soil; takes a quarter damage from fire.' },
  { id: 'living-steel', name: 'Living steel', fits: metalWeapon, extra: () => 500, priceText: '+500 gp',
    notes: 'Repairs 2 hit points of damage a day (1 if broken).' },
  { id: 'mithral', name: 'Mithral', mw: true, weight: 0.5, fits: metalWeapon, extra: (w, x) => 500 * x.weight,
    priceText: '+500 gp per pound (masterwork included)', notes: 'Counts as silver against damage reduction; half weight.' },
  { id: 'obsidian', name: 'Obsidian', weight: 0.75, fits: w => melee(w) && ((lightOrOne(w) && pierceOrSlash(w)) || spearLike(w)),
    extra: (w, x) => -x.base / 2, priceText: 'half price', notes: 'Fragile; half hardness; 75% of the weight.' },
  { id: 'silver', name: 'Alchemical silver', fits: metalWeapon,
    extra: w => (w.group === 'light' ? 20 : w.group === 'two-handed' || /double/.test((w.special || []).join(' ')) ? 180 : 90),
    priceText: '+20 gp light, +90 gp one-handed, +180 gp two-handed or double', damage: w => (pierceOrSlash(w) ? -1 : 0),
    notes: 'Bypasses DR/silver (lycanthropes, devils); \u22121 on damage with a slashing or piercing weapon (minimum 1).' },
  { id: 'stone', name: 'Stone', weight: 0.75, fits: w => melee(w) && ((lightOrOne(w) && w.type === 'B') || spearLike(w)),
    extra: (w, x) => -x.base * 3 / 4, priceText: 'a quarter of the price', notes: 'Fragile; half hardness; 75% of the weight.' },
  { id: 'viridium', name: 'Viridium', fits: w => melee(w) && pierceOrSlash(w), extra: () => 200, priceText: '+200 gp',
    notes: 'A hit gives leprosy (Fort DC 12); a critical hit greenblood oil (Fort DC 13); fragile; carrying it unshielded risks leprosy daily.' },
  { id: 'whipwood', name: 'Whipwood', fits: w => melee(w) && hafted(w), extra: () => 500, priceText: '+500 gp',
    notes: '+2 CMD against sunder attempts on it; +5 hit points.' },
  { id: 'wyroot', name: 'Wyroot', fits: w => melee(w) && hafted(w), extra: () => 1000, priceText: '+1,000 gp (holds 1 life point)',
    notes: 'A confirmed critical hit stores 1 life point; a swift action turns it into 1 ki or arcane pool point.' },
];
export const weaponMaterialById = new Map(WEAPON_MATERIALS.map(m => [m.id, m]));
// The materials a weapon can be made of.
export const weaponMaterialsFor = w => WEAPON_MATERIALS.filter(m => m.fits(w));
