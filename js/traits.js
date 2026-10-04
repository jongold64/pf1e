// Character traits (Advanced Player's Guide / Ultimate Campaign): how many a character gets, and what the chosen
// ones add up to. No page code here, so it can be tested on its own.

// Two traits normally; the "Extra Campaign Trait" house rule adds a third.
// Trait slots: 2, a third with the Extra Campaign Trait house rule, and one more for a drawback (Drawbacks house rule,
// Ultimate Campaign: taking a drawback gives an extra trait).
export function traitSlotCount(houseRules = {}, drawback = '') {
  return 2 + (houseRules.extraTrait ? 1 : 0) + (houseRules.drawbacks && drawback ? 1 : 0);
}

// The trait slots' names, in order.
export function traitSlotLabels(houseRules = {}, drawback = '') {
  return ['Trait 1', 'Trait 2', ...(houseRules.extraTrait ? ['Extra campaign trait'] : []),
          ...(houseRules.drawbacks && drawback ? ['Trait for your drawback'] : [])];
}

// The numbers chosen traits add (from each trait's `effects`, read from its text by the data build):
// { saves: { fort, ref, will }, initiative, skills: { name: bonus }, classSkills: Set }. Trait bonuses don't stack
// with each other, so for each thing the highest one counts.
export function traitEffects(traits) {
  const out = { saves: { fort: 0, ref: 0, will: 0 }, initiative: 0, skills: {}, classSkills: new Set() };
  for (const t of traits) {
    const e = t.effects || {};
    for (const [save, n] of Object.entries(e.saves || {})) out.saves[save] = Math.max(out.saves[save], n);
    if (e.initiative) out.initiative = Math.max(out.initiative, e.initiative);
    for (const [skill, n] of Object.entries(e.skills || {})) out.skills[skill] = Math.max(out.skills[skill] || 0, n);
    for (const skill of e.class_skills || []) out.classSkills.add(skill);
  }
  return out;
}
