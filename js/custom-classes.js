// Custom classes (Classes tab, Custom button): a homebrew class made into a class record like the list's
// (data/classes.json), so it takes levels, hit points, base attack, saves, skill ranks and class skills like any
// class. Spellcasting isn't part of it. No page code here.
//
// state.customClasses = [{ id ('cc-...'), name, hitDie (6/8/10/12), bab ('full' | 'medium' | 'half'), fort, ref, will
//   (good saves: true), skillRanks, classSkills: [names], features: [{ level, name, text }], summary }].

export const BAB_KINDS = [['full', 'Full (like a fighter)'], ['medium', 'Three-quarters (like a cleric)'], ['half', 'Half (like a wizard)']];

// Base attack at a level, with iterative attacks: [6, 1], [16, 11, 6, 1].
export function babAt(kind, level) {
  const b = kind === 'full' ? level : kind === 'medium' ? Math.floor(level * 3 / 4) : Math.floor(level / 2);
  const out = [b];
  for (let x = b - 5; x >= 1 && out.length < 4; x -= 5) out.push(x);
  return out;
}
// A save at a level: good +2 and half the level, poor a third of it.
export const saveAt = (good, level) => (good ? 2 + Math.floor(level / 2) : Math.floor(level / 3));

// The class record.
export function customClassRecord(d) {
  const progression = Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    return { level, bab: babAt(d.bab, level), fort: saveAt(d.fort, level), ref: saveAt(d.ref, level), will: saveAt(d.will, level),
      special: d.features.filter(f => f.level === level).map(f => f.name) };
  });
  return { id: d.id, name: d.name, source: 'Custom', category: 'custom', summary: d.summary || 'A custom class.', hit_die: `d${d.hitDie}`,
    alignment: 'Any.', role: '', class_skills: d.classSkills.map(skill => ({ skill })), skill_ranks_per_level: d.skillRanks,
    starting_wealth: { dice: '', average_gp: 0 }, progression, features: d.features.map(f => ({ name: f.name, text: f.text || f.name })),
    additional_rules: [], origin: 'custom', custom: true };
}

// Saved definitions tidied (at most 10).
export function tidyCustomClasses(saved) {
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 10).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('cc-') ? d.id.slice(0, 40) : `cc-${i}`, name: String(d.name || 'Custom class').slice(0, 40),
    hitDie: [6, 8, 10, 12].includes(d.hitDie) ? d.hitDie : 8, bab: BAB_KINDS.some(([k]) => k === d.bab) ? d.bab : 'medium',
    fort: d.fort === true, ref: d.ref === true, will: d.will === true, skillRanks: [2, 4, 6, 8].includes(d.skillRanks) ? d.skillRanks : 4,
    classSkills: (Array.isArray(d.classSkills) ? d.classSkills : []).filter(n => typeof n === 'string').slice(0, 40),
    features: (Array.isArray(d.features) ? d.features : []).filter(f => f && Number.isInteger(f.level) && f.level >= 1 && f.level <= 20 && String(f.name || '').trim())
      .slice(0, 60).map(f => ({ level: f.level, name: String(f.name).trim().slice(0, 60), text: String(f.text || '').slice(0, 1000) })),
    summary: String(d.summary || '').slice(0, 1000),
  }));
}
