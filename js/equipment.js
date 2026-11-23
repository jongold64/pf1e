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
// max (Max Starting Gold house rule): the most the class's dice can roll ("3d6 x 10 gp" -> 180) instead of the average.
export function startingGold(cls, classes = [], max = false) {
  if (!cls) return null;
  const wealth = cls.starting_wealth?.average_gp ? cls.starting_wealth
    : classes.find(c => c.name === cls.alternate_of)?.starting_wealth;
  if (!wealth?.average_gp) return null;
  if (!max) return wealth.average_gp;
  const m = String(wealth.dice || '').match(/(\d+)d(\d+)\s*[x×]\s*(\d+)/i);
  return m ? Number(m[1]) * Number(m[2]) * Number(m[3]) : wealth.average_gp;
}

// Starting gold with the traits that change it (each trait's effects.gold, read from its text by the data build):
// "increases to" an amount first, in place of the class's (Rich Parents: 900 gp, if that's more), then twice as much
// (Dusk Agent), then more gold (Lesser Noble: +100 gp). { gp, lines: [{ name, text }] }; gp null when the class has none.
export function traitStartingGold(gp, traits = []) {
  const lines = [];
  if (gp === null || gp === undefined) return { gp, lines };
  const fx = traits.filter(t => t?.effects?.gold);
  for (const t of fx.filter(t => t.effects.gold.to)) {
    const to = t.effects.gold.to;
    lines.push({ name: t.name, text: to > gp ? `raised to ${formatGp(to)}` : `${formatGp(to)}: no more than you have already` });
    gp = Math.max(gp, to);
  }
  for (const t of fx.filter(t => t.effects.gold.times)) {
    gp *= t.effects.gold.times;
    lines.push({ name: t.name, text: `× ${t.effects.gold.times}` });
  }
  for (const t of fx.filter(t => t.effects.gold.add)) {
    gp += t.effects.gold.add;
    lines.push({ name: t.name, text: `+${formatGp(t.effects.gold.add)}` });
  }
  return { gp, lines };
}

// Price of worn armor or a shield: base price, plus masterwork (150 gp; magic armor is always masterwork) and the
// enhancement bonus squared × 1,000 gp for magic armor (Core Rulebook, Magic Armor).
// Special abilities add their bonus equivalent (or flat price); a crafted armor's magic part costs half (Core
// Rulebook, Magic Item Creation), the masterwork armor itself full price.
export function armorCost(armor, enh = 0, mw = false, abilities = [], crafted = false) {
  if (!armor) return 0;
  const magic = magicPart(enh, abilities, 1000);
  // A special material that is always masterwork (mithral...) has the 150 gp in its price already.
  return (armor.price_gp || 0) + ((enh > 0 || mw || abilities.length) && !armor.mw_included ? 150 : 0) + (crafted ? magic / 2 : magic);
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
// Charges a listed magic item is made with, or null when it has none that run out: a staff 10 (or what its text says:
// a staff of the magi 50), and items whose text gives a number of charges that aren't renewed each day (a ring of the
// ram 50). Charges that come back each day (a cube of force) don't count.
const CHARGES = /(?:has|with|holds|contains|stores|possesses) (?:up to )?(\d+) charges/i;
export function maxCharges(item) {
  const d = String(item?.description || '');
  const m = CHARGES.exec(d);
  const n = m ? Number(m[1]) : null;
  if (m) {
    const after = d.slice(m.index, m.index + 140).toLowerCase();
    const renews = /(renew|refresh|restor|regenerat|replenish)/.test(after) && !/(can't|cannot|can not|impossible to)( be)? recharg/.test(after);
    if (!renews && n > 1) return n;
  }
  return item?.category === 'Staves' ? 10 : null;
}
// A price for an item bought with fewer charges than it's made with: in proportion (Core Rulebook: an item found with
// fewer charges is worth proportionally less). charges: how many; max: when full.
export const chargedPrice = (price, charges, max) => (price === null || price === undefined || !max || !Number.isFinite(charges) || charges >= max
  ? price : Math.round(price * Math.max(0, charges) / max * 100) / 100);

// What worn armor or a shield cost: nothing when free; its market price less what free upgrades added (paid: { id, off },
// for that item only: another item counts at its full price); else its market price. Special abilities bought later
// still cost their price.
export function wornPaid(market, { free = false, paid = null, id = '' } = {}) {
  if (free) return 0;
  return paid && paid.id === id && Number.isFinite(paid.off) ? Math.max(0, market - paid.off) : market;
}

// The part of an item's price that free upgrades gave (off, gp) after a change of quality or material from a market price
// of `before` to `after`: upgraded for free, the change is added to it; paid for, it stays (you pay the difference).
// A change to something cheaper takes the free part away first (no gold back for what you never paid). 0 for none.
export function upgradeDiscount({ off = 0, before, after, free = false }) {
  return free || after < before ? Math.max(0, Math.round((off + after - before) * 100) / 100) : off;
}

// What one owned magic item cost: nothing when free; what was paid when it was upgraded for free (entry.paid: the old
// version's cost); else a crafted item's cost to make, or the market price (bought with fewer charges: in proportion).
export function magicItemPaid(item, entry) {
  if (entry.free) return 0;
  if (Number.isFinite(entry.paid)) return entry.paid;
  const { price_gp } = magicItemStats(item, entry.option);
  return entry.crafted ? listedCost(item, entry.option || null, price_gp) : chargedPrice(price_gp, entry.startCharges, maxCharges(item));
}

export function magicItemTotals(owned, itemsById) {
  let cost = 0;
  let weight = 0;
  const unpriced = [];
  for (const entry of owned) {
    const item = itemsById.get(entry.id);
    if (!item) continue;
    const { weight_lbs } = magicItemStats(item, entry.option);
    const each = magicItemPaid(item, entry);
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
// What one piece of gear cost (each): nothing when free; its version's price less what free upgrades gave (entry.off);
// null when the item has no listed price.
export function gearPaid(item, entry) {
  if (entry.free) return 0;
  const { price_gp } = entryStats(item, entry.variant);
  return price_gp === null ? null : Math.max(0, price_gp - (Number.isFinite(entry.off) ? entry.off : 0));
}

export function equipmentTotals(inventory, itemsById, worn = {}) {
  let cost = armorCost(worn.armor, worn.armorEnh, worn.armorMw) + armorCost(worn.shield, worn.shieldEnh, worn.shieldMw);
  let weight = ((worn.armor?.weight_lbs || 0) + (worn.shield?.weight_lbs || 0)) * sizeWeightFactor(worn.size);
  const unpriced = [];
  const unweighed = [];
  for (const entry of inventory) {
    const item = itemsById.get(entry.id);
    if (!item) continue;
    const { weight_lbs } = entryStats(item, entry.variant);
    // Free gear (found, a gift) costs no gold; one upgraded for free, its price less that.
    const each = gearPaid(item, entry);
    if (each === null) unpriced.push(item.name); else cost += each * entry.qty;
    if (weight_lbs === null) unweighed.push(item.name); else weight += weight_lbs * entry.qty;
  }
  return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 100) / 100, unpriced, unweighed };
}

// The gold to enter so that what's left after spending is `left`: the gold you have now plus what's been spent
// (to the copper). A blank or negative left gives null (use the starting gold again only if nothing was entered).
export function goldForLeft(left, spent) {
  const n = Number(left);
  if (left === '' || left === null || !Number.isFinite(n) || n < 0) return null;
  return Math.round((n + spent) * 100) / 100;
}

// Selling one item (Core Rulebook: for half its market price). Gold is what you started with, and Left takes off what
// your items cost, so taking the item off the list already gives back what it cost (`paid`: 0 if found, the cost to make
// if crafted): the new Gold is gold + half the value - what it cost. Returns { gold, gets }.
// gets: the price agreed, if not half (a better deal haggled for).
export function sellGold(gold, value, paid = 0, gets = Math.round((value || 0) * 50) / 100) {
  gets = Math.round((gets || 0) * 100) / 100;
  return { gold: Math.round((gold + gets - (paid || 0)) * 100) / 100, gets };
}

// 1250 -> "1,250 gp", 0.5 -> "5 sp", 0.01 -> "1 cp", 2.55 -> "2 gp 5 sp 5 cp", null -> "—".
// What changing gear to another quality or material costs, beside that choice: " (+2,150 gp)", " (−150 gp)" for
// one that costs less, '' for the same price. now and then: the market prices before and after.
export function priceChange(now, then) {
  const d = Math.round(((then || 0) - (now || 0)) * 100) / 100;
  return d ? ` (${d > 0 ? '+' : ''}${formatGp(d)})` : '';
}

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

// What's charged (Wealth popup, Equipment tab): spends { armor, gear, weapons, magic } in gp; noCharge: the kinds that
// cost nothing (gear you were given: { gear: true }...); adjustments: [{ note, gp }] by hand, gp > 0 gold not spent
// after all (a gift, a discount), gp < 0 an extra cost. Returns { armor, gear, weapons, magic (what's charged),
// adjust (the adjustments' total), spent (all of it, less the adjustments) }.
export function chargedCosts(spends = {}, noCharge = {}, adjustments = []) {
  const out = {};
  for (const k of ['armor', 'gear', 'weapons', 'magic']) out[k] = noCharge[k] ? 0 : spends[k] || 0;
  out.adjust = Math.round(adjustments.reduce((n, a) => n + (Number(a?.gp) || 0), 0) * 100) / 100;
  out.spent = Math.round((out.armor + out.gear + out.weapons + out.magic - out.adjust) * 100) / 100;
  return out;
}
// Saved settings tidied: noCharge's four switches; adjustments with a short note and an amount (at most 50).
export const tidyNoCharge = s => Object.fromEntries(['armor', 'gear', 'weapons', 'magic'].filter(k => s?.[k] === true).map(k => [k, true]));
export const tidyAdjustments = s => (Array.isArray(s) ? s : []).filter(a => a && Number.isFinite(a.gp) && a.gp !== 0)
  .map(a => ({ note: String(a.note || '').slice(0, 80), gp: Math.round(a.gp * 100) / 100 })).slice(0, 50);
