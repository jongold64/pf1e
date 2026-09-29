// Equipment rules: money, what the inventory and worn armor cost, and what they weigh.
// No page code here, so these functions can be tested on their own.

import { magicPart, listedCost } from './crafting.js';

// Core Rulebook Table 12-4, Character Wealth by Level (for characters made above 1st level).
export const WEALTH_BY_LEVEL = {
  2: 1000, 3: 3000, 4: 6000, 5: 10500, 6: 16000, 7: 23500, 8: 33000, 9: 46000, 10: 62000, 11: 82000,
  12: 108000, 13: 140000, 14: 185000, 15: 240000, 16: 315000, 17: 410000, 18: 530000, 19: 685000, 20: 880000,
};

// Average starting gold for a 1st-level character of this class. Alternate classes without their own
// figure use the class they're based on (antipaladin -> paladin).
export function startingGold(cls, classes = []) {
  if (cls.starting_wealth?.average_gp) return cls.starting_wealth.average_gp;
  const parent = classes.find(c => c.name === cls.alternate_of);
  return parent?.starting_wealth?.average_gp ?? null;
}

// Price of worn armor or a shield: base price, plus masterwork (150 gp; magic armor is always masterwork) and the
// enhancement bonus squared × 1,000 gp for magic armor (Core Rulebook, Magic Armor).
// Special abilities add their bonus equivalent (or flat price); a crafted armor's magic part costs half (Core
// Rulebook, Magic Item Creation), the masterwork armor itself full price.
export function armorCost(armor, enh = 0, mw = false, abilities = [], crafted = false) {
  if (!armor) return 0;
  const magic = magicPart(enh, abilities, 1000);
  return (armor.price_gp || 0) + (enh > 0 || mw || abilities.length ? 150 : 0) + (crafted ? magic / 2 : magic);
}

// Price and weight of one inventory entry: an item, or one of its versions (e.g. a masterwork backpack).
export function entryStats(item, variantName = null) {
  const v = variantName ? (item.variants || []).find(x => x.name === variantName) : null;
  const src = v || item;
  return { price_gp: src.price_gp ?? null, weight_lbs: src.weight_lbs ?? null };
}

// Price and weight of an owned magic item, or of one of its price options (e.g. a +2 ring of protection, a type II
// bag of holding, which also has its own weight). An item with no price of its own uses its first option.
export function magicItemStats(item, optionLabel = null) {
  const options = item.price_options || [];
  const option = (optionLabel ? options.find(o => o.label === optionLabel) : null)
    || (item.price_gp === null || item.price_gp === undefined ? options[0] : null);
  return { price_gp: option ? option.price_gp : (item.price_gp ?? null), weight_lbs: option?.weight_lbs ?? item.weight_lbs ?? null };
}

// Special abilities are added to a magic weapon or armor; they can't be owned on their own.
export function ownable(item) {
  return !/special abilities/i.test(item.category);
}

// Cost and weight of owned magic items ([{ id, option, qty }]).
export function magicItemTotals(owned, itemsById) {
  let cost = 0;
  let weight = 0;
  const unpriced = [];
  for (const entry of owned) {
    const item = itemsById.get(entry.id);
    if (!item) continue;
    const { price_gp, weight_lbs } = magicItemStats(item, entry.option);
    // A crafted item costs its creation cost (its "Cost" line, else half the price).
    const each = entry.crafted ? listedCost(item, entry.option || null, price_gp) : price_gp;
    if (each === null || each === undefined) unpriced.push(item.name); else cost += each * entry.qty;
    weight += (weight_lbs || 0) * entry.qty;
  }
  return { cost, weight: Math.round(weight * 100) / 100, unpriced };
}

// Listed weights are for Medium characters. Armor and weapons for Small characters weigh half as much and for
// Large characters twice as much (Core Rulebook, Armor for Unusual Creatures and Weapon Size). General gear keeps
// its listed weight here: only some items are lighter for Small characters, and the data doesn't mark which.
export function sizeWeightFactor(size) {
  return size === 'Small' ? 0.5 : size === 'Large' ? 2 : 1;
}

// Totals for the inventory ([{ id, variant, qty }]) plus worn armor and shield ({ armor, armorEnh, shield, shieldEnh,
// size }). Items with no listed price or weight count as 0 and are listed in `unpriced` / `unweighed`.
export function equipmentTotals(inventory, itemsById, worn = {}) {
  let cost = armorCost(worn.armor, worn.armorEnh, worn.armorMw) + armorCost(worn.shield, worn.shieldEnh, worn.shieldMw);
  let weight = ((worn.armor?.weight_lbs || 0) + (worn.shield?.weight_lbs || 0)) * sizeWeightFactor(worn.size);
  const unpriced = [];
  const unweighed = [];
  for (const entry of inventory) {
    const item = itemsById.get(entry.id);
    if (!item) continue;
    const { price_gp, weight_lbs } = entryStats(item, entry.variant);
    if (price_gp === null) unpriced.push(item.name); else cost += price_gp * entry.qty;
    if (weight_lbs === null) unweighed.push(item.name); else weight += weight_lbs * entry.qty;
  }
  return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 100) / 100, unpriced, unweighed };
}

// 1250 -> "1,250 gp", 0.5 -> "5 sp", 0.01 -> "1 cp", 2.55 -> "2 gp 5 sp 5 cp", null -> "—".
export function formatGp(gp) {
  if (gp === null || gp === undefined) return '—';
  const sign = gp < 0 ? '−' : '';
  let cp = Math.round(Math.abs(gp) * 100);
  const g = Math.floor(cp / 100);
  cp -= g * 100;
  const s = Math.floor(cp / 10);
  cp -= s * 10;
  const parts = [];
  if (g) parts.push(`${g.toLocaleString('en-US')} gp`);
  if (s) parts.push(`${s} sp`);
  if (cp) parts.push(`${cp} cp`);
  return sign + (parts.join(' ') || '0 gp');
}

// 2.5 -> "2.5 lbs.", 1 -> "1 lb."
export function formatLbs(lbs) {
  if (lbs === null || lbs === undefined) return '—';
  const n = Math.round(lbs * 100) / 100;
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'lb.' : 'lbs.'}`;
}
