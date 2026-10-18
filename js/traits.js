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

// Chosen traits' combat bonuses (each trait's effects.combat, read from its text by the data build: "+1 trait bonus on
// attack rolls and weapon damage rolls against giants"). Nearly all apply only sometimes, so each is a switch in Active
// effects, counted while it's on (`on`: the keys switched on); one that always applies is always counted. One that
// depends only on the weapon (River Rat: damage with a dagger) is counted on that weapon instead (traitWeaponRows).
// [{ key: 'giant-slayer:0', name, text, always, on, effect }], effect being a custom-style effect for the totals
// ({ name, target, type: 'trait', value, more, on: true }).
export function traitCombat(traits, on = []) {
  const out = [];
  for (const t of traits) {
    (t?.effects?.combat || []).forEach((c, i) => {
      if (c.weapon) return;
      const key = `${t.id}:${i}`;
      const [first, ...more] = c.bonuses.map(x => ({ target: x.target, type: 'trait', value: x.value }));
      if (!first) return;
      out.push({ key, name: `${t.name} (trait)`, text: c.text, always: !!c.always, on: !!c.always || on.includes(key),
                 effect: { name: `${t.name} (trait)`, ...first, more, on: true } });
    });
  }
  return out;
}

// Chosen traits' bonuses with one weapon (effects.combat entries with `weapon`: ids, a word in its name, its special
// material, or made for a larger creature than you), as rows for weaponAttack's `training`:
// [{ label: 'Trait: River Rat', value: 1, on: 'damage' }]. Trait bonuses don't stack: for each of attack and damage only
// the highest counts, less any trait bonus already counted there (`already`: { attack, damage }, from switches on).
const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
export function weaponFits(rule, weapon, entry = {}, wielderSize = 'Medium') {
  if (rule.ids?.includes(weapon.id)) return true;
  if (rule.name && (weapon.name || '').toLowerCase().includes(rule.name)) return true;
  if (rule.materials?.includes(entry.material)) return true;
  return !!rule.oversized && SIZES.indexOf(entry.size || wielderSize) > SIZES.indexOf(wielderSize);
}
export function traitWeaponRows(traits, weapon, entry = {}, wielderSize = 'Medium', already = {}) {
  const best = { attack: null, damage: null };
  for (const t of traits) {
    for (const c of t?.effects?.combat || []) {
      if (!c.weapon || !weaponFits(c.weapon, weapon, entry, wielderSize)) continue;
      for (const x of c.bonuses) {
        const on = x.target.replace(/^(melee|ranged)-/, '');
        if (on in best && (!best[on] || x.value > best[on].value)) best[on] = { name: t.name, value: x.value };
      }
    }
  }
  const rows = [];
  for (const on of ['attack', 'damage']) {
    const b = best[on];
    const value = b ? Math.max(0, b.value - (already[on] || 0)) : 0;
    if (value) rows.push({ label: `Trait: ${b.name}${value < b.value ? " (less the trait bonus already on: they don't stack)" : ''}`, value, on });
  }
  return rows;
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
