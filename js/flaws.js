// Character flaws (Unearthed Arcana, open game content from the d20 System Reference Document), for the Flaws house
// rule: up to two flaws, each giving a bonus feat at 1st level. Pathfinder renamed Listen and Spot to Perception, so
// Inattentive's penalty goes on Perception. No page code here, so it can be tested on its own.

export const FLAWS = [
  { id: 'feeble', name: 'Feeble', flavor: 'You are unathletic and uncoordinated.',
    effect: 'You take a -2 penalty on Strength-, Dexterity-, and Constitution-based ability checks and skill checks.' },
  { id: 'frail', name: 'Frail', flavor: 'You are thin and weak of frame.',
    effect: 'Subtract 1 from the number of hit points you gain at each level. This flaw can reduce the number of hit points you gain to 0 (but not below).',
    special: 'You must have a Constitution of 4 or higher to take this flaw.' },
  { id: 'inattentive', name: 'Inattentive', flavor: 'You are particularly unaware of your surroundings.',
    effect: 'You take a -4 penalty on Listen checks and Spot checks (Perception checks in Pathfinder).' },
  { id: 'meager-fortitude', name: 'Meager Fortitude', flavor: 'You are sickly and weak of stomach.',
    effect: 'You take a -3 penalty on Fortitude saves.' },
  { id: 'murky-eyed', name: 'Murky-Eyed', flavor: 'Your vision is obscured.',
    effect: 'In combat, every time you attack an opponent that has concealment, roll your miss chance twice. If either or both results indicate that you miss, your attack fails.' },
  { id: 'noncombatant', name: 'Noncombatant', flavor: 'You are relatively inept at melee combat.',
    effect: 'You take a -2 penalty on all melee attack rolls.' },
  { id: 'pathetic', name: 'Pathetic', flavor: 'You are weaker in an attribute than you should be.', choice: 'ability',
    effect: 'Reduce one of your ability scores by 2.',
    special: 'You cannot take this flaw if the total of your ability modifiers is 8 or higher.' },
  { id: 'poor-reflexes', name: 'Poor Reflexes', flavor: 'You often zig when you should have zagged.',
    effect: 'You take a -3 penalty on Reflex saves.' },
  { id: 'shaky', name: 'Shaky', flavor: 'You are relatively poor at ranged combat.',
    effect: 'You take a -2 penalty on all ranged attack rolls.' },
  { id: 'slow', name: 'Slow', flavor: 'You move exceptionally slowly.',
    effect: 'Your base land speed is halved (round down to the nearest 5-foot interval).',
    special: 'You must have a base land speed of at least 20 feet to take this flaw.' },
  { id: 'unreactive', name: 'Unreactive', flavor: 'You are slow to react to danger.',
    effect: 'You take a -6 penalty on initiative checks.' },
  { id: 'vulnerable', name: 'Vulnerable', flavor: 'You are not good at defending yourself.',
    effect: 'You take a -1 penalty to Armor Class.' },
  { id: 'weak-will', name: 'Weak Will', flavor: 'You are highly suggestible and easily duped.',
    effect: 'You take a -3 penalty on Will saves.' },
];
export const flawById = new Map(FLAWS.map(f => [f.id, f]));

// What the chosen flaws ([{ id, choice? }]) do, in the app's terms:
// - effects: penalties as custom effects (untyped, so they add up) for saves, initiative, AC and Pathetic's ability
// - checks / skills by ability ({ str: -2, ... }): Feeble's penalty on those abilities' checks and skills
// - skills by name ({ Perception: -4 }), melee / ranged attack penalties, hpPerLevel (Frail), halfSpeed (Slow)
export function flawEffects(chosen = []) {
  const out = { effects: [], checks: {}, skillsByAbility: {}, skills: {}, melee: 0, ranged: 0, hpPerLevel: 0, halfSpeed: false };
  const fx = (name, target, value) => out.effects.push({ name, target, type: 'untyped', value, on: true });
  for (const c of chosen) {
    const f = flawById.get(c?.id);
    if (!f) continue;
    if (f.id === 'feeble') for (const a of ['str', 'dex', 'con']) { out.checks[a] = (out.checks[a] || 0) - 2; out.skillsByAbility[a] = (out.skillsByAbility[a] || 0) - 2; }
    if (f.id === 'frail') out.hpPerLevel -= 1;
    if (f.id === 'inattentive') out.skills.Perception = (out.skills.Perception || 0) - 4;
    if (f.id === 'meager-fortitude') fx('Meager Fortitude (flaw)', 'fort', -3);
    if (f.id === 'noncombatant') out.melee -= 2;
    if (f.id === 'pathetic' && ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(c.choice)) fx('Pathetic (flaw)', c.choice, -2);
    if (f.id === 'poor-reflexes') fx('Poor Reflexes (flaw)', 'ref', -3);
    if (f.id === 'shaky') out.ranged -= 2;
    if (f.id === 'slow') out.halfSpeed = true;
    if (f.id === 'unreactive') fx('Unreactive (flaw)', 'init', -6);
    if (f.id === 'vulnerable') fx('Vulnerable (flaw)', 'ac', -1);
    if (f.id === 'weak-will') fx('Weak Will (flaw)', 'will', -3);
  }
  return out;
}
