// Custom magic items (Magic Items tab, Custom button), priced with the Core Rulebook's Table 15-29 (Estimating Magic
// Item Gold Piece Values), and the bonuses they give, as custom effects. No page code here.
//
// state.customItems = [{ id, name, slot, cl, powers: [power], crafted, free, off (not worn), discount, qty, notes }], each power
// (discount: gp that free upgrades took off its price, each)
// { kind, bonus, ability, type, skill, sr, spellLevel, spellCl, activation, perDay, duration }.

export const SLOTS = ['head', 'headband', 'eyes', 'shoulders', 'neck', 'chest', 'body', 'belt', 'wrists', 'hands', 'ring', 'feet', 'slotless'];
const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
// Bonus types for "other" AC and save bonuses (deflection and resistance have their own lines).
export const OTHER_TYPES = ['insight', 'luck', 'morale', 'sacred', 'profane', 'competence'];

// What a power can be: label, its bonuses to choose (max), what else it asks for, its price and its effect.
export const POWERS = [
  { kind: 'ability', label: 'Ability score bonus (enhancement)', bonuses: [2, 4, 6], asks: ['ability'], price: p => p.bonus ** 2 * 1000,
    effects: p => [{ target: p.ability, type: 'enhancement', value: p.bonus }], text: p => `+${p.bonus} enhancement to ${ABILITY_NAMES[p.ability] || p.ability}` },
  { kind: 'armor', label: 'Armor bonus to AC (like bracers of armor)', bonuses: [1, 2, 3, 4, 5, 6, 7, 8], price: p => p.bonus ** 2 * 1000,
    effects: p => [{ target: 'ac', type: 'armor', value: p.bonus }], text: p => `+${p.bonus} armor bonus to AC` },
  { kind: 'deflection', label: 'Deflection bonus to AC', bonuses: [1, 2, 3, 4, 5], price: p => p.bonus ** 2 * 2000,
    effects: p => [{ target: 'ac', type: 'deflection', value: p.bonus }], text: p => `+${p.bonus} deflection bonus to AC` },
  { kind: 'natural', label: 'Natural armor bonus (enhancement)', bonuses: [1, 2, 3, 4, 5], price: p => p.bonus ** 2 * 2000,
    effects: p => [{ target: 'ac', type: 'natural armor enhancement', value: p.bonus }], text: p => `+${p.bonus} enhancement to natural armor` },
  { kind: 'ac-other', label: 'Other bonus to AC (insight, luck, sacred...)', bonuses: [1, 2, 3, 4, 5], asks: ['type'], price: p => p.bonus ** 2 * 2500,
    effects: p => [{ target: 'ac', type: p.type, value: p.bonus }], text: p => `+${p.bonus} ${p.type} bonus to AC` },
  { kind: 'resistance', label: 'Resistance bonus on saves', bonuses: [1, 2, 3, 4, 5], price: p => p.bonus ** 2 * 1000,
    effects: p => [{ target: 'saves', type: 'resistance', value: p.bonus }], text: p => `+${p.bonus} resistance bonus on saves` },
  { kind: 'save-other', label: 'Other bonus on saves (luck, insight...)', bonuses: [1, 2, 3, 4, 5], asks: ['type'], price: p => p.bonus ** 2 * 2000,
    effects: p => [{ target: 'saves', type: p.type, value: p.bonus }], text: p => `+${p.bonus} ${p.type} bonus on saves` },
  { kind: 'skill', label: 'Competence bonus on a skill', bonuses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30], asks: ['skill'], price: p => p.bonus ** 2 * 100,
    effects: p => [{ target: `skill:${p.skill}`, type: 'competence', value: p.bonus }], text: p => `+${p.bonus} competence on ${p.skill}` },
  { kind: 'sr', label: 'Spell resistance', asks: ['sr'], price: p => Math.max(0, (p.sr || 13) - 12) * 10000,
    effects: () => [], text: p => `spell resistance ${p.sr || 13}` },
  { kind: 'spell', label: 'Spell effect', asks: ['spell'], price: spellPrice, effects: () => [], text: spellText },
];
export const powerByKind = new Map(POWERS.map(p => [p.kind, p]));

// A spell effect's price (Table 15-29): spell level (½ for a 0-level spell) × caster level × 2,000 if use-activated or
// continuous, × 1,800 if command word; uses a day divide it by (5 ÷ uses); a continuous effect from a spell with a short
// duration costs more (rounds ×4, 1 min/level ×2, 10 min/level ×1.5) and from a 24-hour spell half.
export const ACTIVATIONS = { use: ['Use-activated or continuous', 2000], command: ['Command word', 1800] };
export const DURATIONS = { none: ['—', 1], rounds: ['Rounds', 4], minutes: ['1 minute/level', 2], tenminutes: ['10 minutes/level', 1.5], day: ['24 hours or more', 0.5] };
function spellPrice(p) {
  const level = (p.spellLevel || 0) === 0 ? 0.5 : p.spellLevel;
  const cl = Math.max(1, p.spellCl || 1);
  let price = level * cl * (ACTIVATIONS[p.activation]?.[1] || 2000);
  if (p.perDay > 0 && p.perDay < 5) price /= 5 / p.perDay;
  if (p.activation !== 'command' && !(p.perDay > 0)) price *= DURATIONS[p.duration]?.[1] || 1;
  return Math.round(price);
}
function spellText(p) {
  return `${p.spellName || `a ${p.spellLevel || 0}-level spell`} (caster level ${p.spellCl || 1}, ${(ACTIVATIONS[p.activation]?.[0] || 'use-activated').toLowerCase()}${p.perDay > 0 ? `, ${p.perDay}/day` : ''})`;
}

// An item's price: each power's, the dearest in full and each other ×1.5 (Table 15-29: multiple different abilities),
// all ×2 when slotless (no space limitation). Returns { price, cost (crafted: half the price), lines: [{ text, gp }] }.
export function customItemPrice(item) {
  const lines = (item.powers || []).map(p => ({ text: powerByKind.get(p.kind)?.text(p) || '', gp: powerByKind.get(p.kind)?.price(p) || 0 }))
    .filter(l => l.text).sort((a, b) => b.gp - a.gp);
  let price = lines.reduce((n, l, i) => n + (i === 0 ? l.gp : l.gp * 1.5), 0);
  const multi = lines.length > 1;
  if (item.slot === 'slotless' && price) price *= 2;
  price = Math.round(price);
  return { price, cost: Math.round(price / 2 * 100) / 100, lines, multi, slotless: item.slot === 'slotless' };
}

// What one costs the character: nothing if free; half the price if crafted, else the price, less any free upgrades.
export const customItemBase = item => (item.crafted ? customItemPrice(item).cost : customItemPrice(item).price);
export const customItemPaid = item => (item.free ? 0 : Math.max(0, customItemBase(item) - (Number.isFinite(item.discount) ? item.discount : 0)));

// The bonuses a worn custom item gives, as custom effects: [{ name, target, type, value, on }].
export function customItemEffects(items = []) {
  return items.filter(i => !i.off).flatMap(i => (i.powers || []).flatMap(p => (powerByKind.get(p.kind)?.effects(p) || [])
    .filter(e => e.target && e.value).map(e => ({ name: i.name || 'Custom item', ...e, on: true }))));
}

// Notes for what isn't a number (spell resistance, spell effects): "Ring of Ice: spell resistance 15".
export const customItemNotes = (items = []) => items.filter(i => !i.off).flatMap(i => (i.powers || [])
  .filter(p => ['sr', 'spell'].includes(p.kind)).map(p => `${i.name || 'Custom item'}: ${powerByKind.get(p.kind).text(p)}`));

// Saved items tidied: known slots and powers, numbers in range, at most 40 items of 6 powers.
export function tidyCustomItems(saved) {
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return (Array.isArray(saved) ? saved : []).filter(i => i && typeof i === 'object').slice(0, 40).map((i, n) => ({
    id: typeof i.id === 'string' && i.id ? i.id.slice(0, 40) : `custom-${n}`,
    name: String(i.name || 'Custom item').slice(0, 60), slot: SLOTS.includes(i.slot) ? i.slot : 'slotless',
    cl: num(i.cl, 1, 20, 1), crafted: i.crafted === true, free: i.free === true, off: i.off === true, qty: num(i.qty, 1, 99, 1),
    ...(Number.isFinite(i.discount) && i.discount > 0 ? { discount: i.discount } : {}),
    notes: String(i.notes || '').slice(0, 500),
    powers: (Array.isArray(i.powers) ? i.powers : []).filter(p => p && powerByKind.has(p.kind)).slice(0, 6).map(p => ({
      kind: p.kind, bonus: num(p.bonus, 0, 30, 1), ability: ABILITY_NAMES[p.ability] ? p.ability : 'str',
      type: OTHER_TYPES.includes(p.type) ? p.type : 'insight', skill: String(p.skill || 'Perception').slice(0, 60), sr: num(p.sr, 13, 40, 13),
      spellName: String(p.spellName || '').slice(0, 60), spellLevel: num(p.spellLevel, 0, 9, 1), spellCl: num(p.spellCl, 1, 20, 1),
      activation: ACTIVATIONS[p.activation] ? p.activation : 'use', perDay: num(p.perDay, 0, 4, 0), duration: DURATIONS[p.duration] ? p.duration : 'none',
    })),
  }));
}
