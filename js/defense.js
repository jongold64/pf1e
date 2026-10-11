// Defensive switches, like the Power Attack switch for attacks: Combat Expertise, fighting defensively, total defense,
// armor a class feature conjures (oracle revelations) and the shield in hand or not. Kept in state.combat; while on,
// each counts as an effect in every number. No page code here, so it can be tested on its own.

// Combat Expertise's step (Core Rulebook): 1, and 1 more at base attack +4 and every 4 after.
export const expertiseStep = bab => 1 + Math.floor(Math.max(0, bab) / 4);

// Oracle revelations that conjure armor: +4 armor bonus, +2 at 7th level and every 4 levels after.
export const ARMOR_REVELATIONS = new Set(['air-barrier', 'armor-of-bones', 'ectoplasmic-armor', 'elemental-aegis', 'ice-armor', 'wood-armor']);
export const revelationArmor = level => 4 + 2 * Math.max(0, Math.floor((level - 3) / 4));

// What each switch does now: [{ key, label, what, rows: [[label, value]], note }]. trained: 3 or more ranks in
// Acrobatics (+1 dodge fighting defensively, +2 on total defense). conjured: [{ id, name, bonus }].
export function defenseSwitches({ bab = 0, haveFeats = [], acrobatics = 0, shield = null, conjured = [] } = {}) {
  const trained = acrobatics >= 3;
  const step = expertiseStep(bab);
  const out = [];
  if (shield) out.push({ key: 'shieldOff', label: `${shield} in hand`, inverted: true, what: 'switch off when you put it away or let go of it',
    rows: [['Shield bonus, check penalty, spell failure', 'count only while it’s in hand']],
    note: 'Off: the shield stays on your Armor tab but adds nothing (a free hand for a spell, a two-handed weapon...).' });
  for (const c of conjured) out.push({ key: `conjured:${c.id}`, label: c.name, what: `+${c.bonus} armor bonus while conjured`,
    rows: [['Armor bonus to AC', `+${c.bonus}`]], note: 'An armor bonus: it doesn’t stack with worn armor (the higher one counts).' });
  if (haveFeats.includes('Combat Expertise')) out.push({ key: 'combatExpertise', label: 'Combat Expertise', what: `−${step} melee attack and CMB, +${step} dodge AC`,
    rows: [['Your base attack bonus: 1 step, +1 at +4 and every 4 after', `${step} step${step === 1 ? '' : 's'}`], ['Melee attack rolls and combat maneuver checks', `−${step}`], ['Dodge bonus to AC', `+${step}`]],
    note: 'Choose it when you make a melee attack or a full attack; it lasts until your next turn.' });
  out.push({ key: 'fightingDefensively', label: 'Fighting defensively', what: `−4 on attacks, +${trained ? 3 : 2} dodge AC`,
    rows: [['All attack rolls this round', '−4'], [`Dodge bonus to AC${trained ? ' (3 or more ranks in Acrobatics: +3)' : ''}`, `+${trained ? 3 : 2}`]],
    note: 'Declared with a standard action attack or a full attack; it lasts until your next turn.' });
  out.push({ key: 'totalDefense', label: 'Total defense', what: `no attacks, +${trained ? 6 : 4} dodge AC`,
    rows: [[`Dodge bonus to AC${trained ? ' (3 or more ranks in Acrobatics: +6)' : ''}`, `+${trained ? 6 : 4}`], ['Attacks of opportunity', 'none']],
    note: 'A standard action instead of attacking; it can’t be combined with fighting defensively or Combat Expertise.' });
  return out;
}

// The effects of the switches that are on, in the custom-effect shape: [{ name, target, type, value, on, classFeature }].
export function defenseEffects(combat = {}, opts = {}) {
  const list = defenseSwitches(opts);
  const has = key => list.some(s => s.key === key);
  const trained = (opts.acrobatics || 0) >= 3;
  const step = expertiseStep(opts.bab || 0);
  const out = [];
  const fx = (name, target, type, value) => out.push({ name, target, type, value, on: true, classFeature: true });
  if (combat.totalDefense) fx('Total defense', 'ac', 'dodge', trained ? 6 : 4);
  else {
    if (combat.combatExpertise && has('combatExpertise')) {
      fx('Combat Expertise', 'melee-attack', 'untyped', -step);
      fx('Combat Expertise', 'cmb', 'untyped', -step);
      fx('Combat Expertise', 'ac', 'dodge', step);
    }
    if (combat.fightingDefensively) {
      fx('Fighting defensively', 'attack', 'untyped', -4);
      fx('Fighting defensively', 'ac', 'dodge', trained ? 3 : 2);
    }
  }
  const c = (opts.conjured || []).find(x => x.id === combat.conjured);
  if (c) fx(c.name, 'ac', 'armor', c.bonus);
  return out;
}

// The switches that are on, for the On now card: [{ key, label }].
export function defenseOn(combat = {}, opts = {}) {
  return defenseSwitches(opts).filter(s => (s.key === 'shieldOff' ? combat.shieldOff
    : s.key.startsWith('conjured:') ? combat.conjured === s.key.slice(9) : combat[s.key]))
    .map(s => ({ key: s.key, label: s.key === 'shieldOff' ? `${s.label.replace(/ in hand$/, '')} put away` : s.label }));
}
