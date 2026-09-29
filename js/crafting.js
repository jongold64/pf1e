// Magic item creation (Core Rulebook, Magic Item Creation): prices, crafting cost, time, the skill check DC and the
// item's requirements. No page code here, so it can be tested on its own.
//
// - Cost: half the base price ("magic supplies"), plus the full price of the masterwork weapon or armor it's made
//   from. Potions, scrolls and wands: 25 / 12.5 / 375 gp × spell level × caster level (a 0-level spell counts as 1/2);
//   their market price is twice that.
// - Time: 8 hours per 1,000 gp of base price (at least 8); potions and scrolls of 250 gp or less take 2 hours.
//   Rushing halves the time for +5 to the DC. At most one item a day.
// - Check: DC 5 + the item's caster level, +5 for each requirement not met. The item creation feat is required, and
//   potions, scrolls and wands need their spell.
// - Arms and armor: at least +1 enhancement before special abilities, at most +5 enhancement and +10 in all; the
//   creator's caster level must be at least 3 × the enhancement bonus.

// The feat each kind of item needs.
export const CRAFT_FEATS = {
  weapon: 'Craft Magic Arms and Armor', armor: 'Craft Magic Arms and Armor', potion: 'Brew Potion',
  scroll: 'Scribe Scroll', wand: 'Craft Wand', wondrous: 'Craft Wondrous Item', ring: 'Forge Ring', rod: 'Craft Rod',
  staff: 'Craft Staff',
};

// Spell items: gp per spell level × caster level (market price), and the highest spell level allowed.
export const SPELL_ITEMS = {
  potion: { label: 'Potion', perLevel: 50, maxSpellLevel: 3 },
  scroll: { label: 'Scroll', perLevel: 25, maxSpellLevel: 9 },
  wand: { label: 'Wand', perLevel: 750, maxSpellLevel: 4 },
};

// The kind of crafting a listed magic item needs (null for ones that can't be crafted: artifacts, cursed and
// intelligent items, and special abilities on their own).
export function itemKind(item) {
  return {
    'Wondrous Items': 'wondrous', Rings: 'ring', Rods: 'rod', Staves: 'staff', 'Magic Weapons': 'weapon',
    'Magic Armor': 'armor', 'Magic Shields': 'armor',
  }[item.category] || null;
}

// Special abilities whose price the data gives only in a table in their text.
const ABILITY_OPTIONS = {
  fortification: [{ label: 'light', bonus: 1 }, { label: 'moderate', bonus: 3 }, { label: 'heavy', bonus: 5 }],
};

// A weapon or armor special ability's price: [{ label, bonus }] for "+1 bonus" (bonus equivalents) or
// [{ label, gp }] for a flat price ("+3,750 gp"); several when the ability comes in versions (spell resistance).
export function abilityOptions(ability) {
  if (ABILITY_OPTIONS[ability.id]) return ABILITY_OPTIONS[ability.id];
  const p = String(ability.price || '');
  const several = [...p.matchAll(/\+(\d+) bonus \(([^)]+)\)/gi)].map(m => ({ label: m[2], bonus: Number(m[1]) }));
  if (several.length) return several;
  const bonus = p.match(/^\s*\+(\d+) bonus\s*$/i);
  if (bonus) return [{ label: '', bonus: Number(bonus[1]) }];
  const gp = p.match(/^\s*\+?([\d,]+) gp\s*$/i);
  if (gp) return [{ label: '', gp: Number(gp[1].replace(/,/g, '')) }];
  return [];
}

// Magic weapon or armor: `enh` enhancement and chosen abilities ([{ bonus } | { gp }]) -> the magic part of the price
// (the base price crafting halves), the total effective bonus, the caster level needed, and what's wrong if it
// can't be made.
export function magicArmsPrice({ kind, enh, abilities = [], abilityCls = [] }) {
  const bonus = abilities.reduce((n, a) => n + (a.bonus || 0), 0);
  const gp = abilities.reduce((n, a) => n + (a.gp || 0), 0);
  const effective = enh + bonus;
  const per = kind === 'weapon' ? 2000 : 1000;
  const errors = [];
  if (abilities.length && enh < 1) errors.push('special abilities need at least a +1 enhancement bonus');
  if (enh > 5) errors.push('the enhancement bonus can be at most +5');
  if (effective > 10) errors.push(`the total bonus (+${effective}) can be at most +10`);
  return {
    effective, base: effective * effective * per + gp,
    casterLevel: Math.max(enh * 3, ...abilityCls.map(Number).filter(Number.isFinite), 0),
    errors,
  };
}

// The magic part of a weapon's or armor's price: (enhancement + ability bonuses)² × 2,000 (weapons) or × 1,000
// (armor and shields), plus abilities with a flat price. 0 for a mundane one.
export function magicPart(enh = 0, abilities = [], per = 2000) {
  if (enh <= 0 && !abilities.length) return 0;
  const eff = enh + abilities.reduce((n, a) => n + (a.bonus || 0), 0);
  return eff * eff * per + abilities.reduce((n, a) => n + (a.gp || 0), 0);
}

// Special abilities saved on a weapon or armor: [{ id, name, option?, bonus? | gp? }] (bad entries dropped).
export function cleanAbilities(list) {
  return (Array.isArray(list) ? list : []).filter(a => a && typeof a.id === 'string' && typeof a.name === 'string')
    .map(a => ({ id: a.id, name: a.name, ...(typeof a.option === 'string' && a.option ? { option: a.option } : {}),
                 ...(Number.isInteger(a.bonus) && a.bonus > 0 ? { bonus: a.bonus } : {}),
                 ...(Number.isFinite(a.gp) && a.gp > 0 ? { gp: a.gp } : {}) }));
}

// "+1 flaming keen" / "masterwork" / "" before a weapon's or armor's name.
export function magicPrefix(enh = 0, masterwork = false, abilities = []) {
  const names = abilities.map(a => `${a.name.toLowerCase()}${a.option ? ` (${a.option})` : ''}`).join(' ');
  return [enh > 0 ? `+${enh}` : masterwork ? 'Masterwork' : '', names].filter(Boolean).join(' ');
}

// Potion, scroll or wand market price (errors when the spell level isn't allowed).
export function spellItemPrice(kind, spellLevel, casterLevel) {
  const info = SPELL_ITEMS[kind];
  const errors = [];
  if (spellLevel > info.maxSpellLevel) errors.push(`a ${info.label.toLowerCase()} can hold a spell of level ${info.maxSpellLevel} at most`);
  return { base: info.perLevel * (spellLevel === 0 ? 0.5 : spellLevel) * casterLevel, errors };
}

// A potion, scroll or wand the character has ({ kind, spellLevel, cl, bought? }): its market price, and what it
// cost: the full price when bought or found, half when the character made it.
export function craftedItemPrice(e) {
  return spellItemPrice(e.kind, e.spellLevel, e.cl).base;
}
export function craftedItemCost(e) {
  return e.bought ? craftedItemPrice(e) : craftCost(craftedItemPrice(e));
}

// Cost to make: half the base price, plus anything paid in full (the masterwork weapon or armor).
export function craftCost(base, fullPrice = 0) {
  return Math.round((base / 2 + fullPrice) * 100) / 100;
}

// Hours of work and days (8 hours of work a day, one item a day at most).
export function craftTime(base, kind, rushed = false) {
  let hours = Math.max(8, 8 * Math.ceil(base / 1000));
  if ((kind === 'potion' || kind === 'scroll') && base <= 250) hours = 2;
  if (rushed) hours = Math.max(kind === 'potion' || kind === 'scroll' ? 1 : 4, hours / 2);
  return { hours, days: Math.max(1, Math.ceil(hours / 8)) };
}

// The skill check DC: 5 + caster level, +5 for each requirement not met, +5 when rushed.
export function craftDC(casterLevel, unmet = 0, rushed = false) {
  return 5 + casterLevel + 5 * unmet + (rushed ? 5 : 0);
}

const lower = s => String(s || '').toLowerCase();

// A listed item's "Requirements" line -> [{ type: 'feat' | 'spell' | 'spells' (any one) | 'cl' | 'cl3x' | 'skill' |
// 'other', text, ... }]. `featNames` and `spellNames` (name -> id) are the known feats and spells.
export function parseRequirements(text, featNames = [], spellNames = new Map()) {
  let rest = ` ${String(text || '').replace(/\s+/g, ' ')} `;
  const out = [];
  // Feats first (their names can contain "and": Craft Magic Arms and Armor), longest names first.
  for (const f of [...featNames].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[\\s,;])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,;.]|$)`, 'i');
    if (re.test(rest)) {
      out.push({ type: 'feat', name: f, text: f });
      rest = rest.replace(re, '$1');
    }
  }
  const spellId = s => spellNames.get(lower(s).replace(/^or\s+/, '').trim());
  const parts = rest.split(/,|;|\s+and\s+/).map(s => s.trim().replace(/\.$/, '')).filter(s => s && !/^(?:and|or)$/i.test(s));
  const items = [];
  for (const p of parts) {
    const cl = p.match(/caster level (?:of |must be )?(?:at least )?(\d+)(?:st|nd|rd|th)?/i);
    const skill = p.match(/^(.+?) (\d+) ranks?$/i);
    const orList = p.replace(/^or\s+/i, '').split(/\s+or\s+/).map(x => x.trim());
    if (/three times/i.test(p)) items.push({ type: 'cl3x', text: p });
    else if (cl) items.push({ type: 'cl', level: Number(cl[1]), text: p });
    else if (skill) items.push({ type: 'skill', name: skill[1], ranks: Number(skill[2]), text: p });
    else if (orList.length > 1 && orList.every(spellId)) {
      items.push({ type: 'spells', options: orList.map(x => ({ name: x, id: spellId(x) })), text: p });
    } else if (spellId(p)) items.push({ type: 'spell', name: p.replace(/^or\s+/i, ''), id: spellId(p), text: p.replace(/^or\s+/i, ''), or: /^or\s/i.test(p) });
    else items.push({ type: 'other', text: p });
  }
  // "flame blade, flame strike, or fireball": the run of spells ending in "or ..." is a choice of one.
  for (const it of items) {
    if (it.type === 'spell' && it.or) {
      const run = [];
      while (out.length && out.at(-1).type === 'spell') run.unshift(out.pop());
      if (run.length) {
        const options = [...run, it].map(x => ({ name: x.name, id: x.id }));
        out.push({ type: 'spells', options, text: options.map(o => o.name).join(', ').replace(/, ([^,]+)$/, ', or $1') });
        continue;
      }
    }
    const { or, ...rec } = it;
    out.push(rec);
  }
  return out;
}

// Whether the character meets each requirement: 'met' | 'unmet' | 'ask' (the app can't tell; the player says).
// ctx: { haveFeats: [names], canCast: spellId -> bool, casterLevel, skillRanks: name -> n, bonus (for "3 × bonus") }.
export function checkRequirements(reqs, ctx) {
  return reqs.map(r => {
    let status = 'ask';
    if (r.type === 'feat') status = ctx.haveFeats.includes(r.name) ? 'met' : 'unmet';
    else if (r.type === 'spell') status = ctx.canCast(r.id) ? 'met' : 'unmet';
    else if (r.type === 'spells') status = r.options.some(o => ctx.canCast(o.id)) ? 'met' : 'unmet';
    else if (r.type === 'cl') status = ctx.casterLevel >= r.level ? 'met' : 'unmet';
    else if (r.type === 'cl3x') status = ctx.bonus ? (ctx.casterLevel >= 3 * ctx.bonus ? 'met' : 'unmet') : 'ask';
    else if (r.type === 'skill') status = (ctx.skillRanks(r.name) || 0) >= r.ranks ? 'met' : 'unmet';
    return { ...r, status };
  });
}

// The bonus in a price option label ("+2" -> 2), for "caster level at least three times the bonus".
export function optionBonus(label) {
  const m = String(label || '').match(/^\+(\d+)/);
  return m ? Number(m[1]) : 0;
}

// A listed item's crafting cost for an option: its own "Cost" line when it has one ("500 gp (+1), 2,000 gp (+2)"),
// else half its price.
export function listedCost(item, optionLabel = null, price = null) {
  const cost = item.construction?.cost;
  if (cost) {
    const entries = [...String(cost).matchAll(/([\d,]+(?:\.\d+)?)\s*gp(?:\s*\(([^)]+)\))?/g)].map(m => ({
      gp: Number(m[1].replace(/,/g, '')), label: m[2] || '',
    }));
    const hit = optionLabel ? entries.find(e => lower(e.label) === lower(optionLabel)) : entries[0];
    if (hit && (!optionLabel || entries.length > 1 || !entries[0].label)) return hit.gp;
    if (!optionLabel && entries.length === 1) return entries[0].gp;
  }
  return price === null ? null : craftCost(price);
}
