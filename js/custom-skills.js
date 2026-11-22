// Custom skills (Skills tab, Custom button): skills the list doesn't have (a homebrew skill, or one from a book the
// app lacks). They join the skill list (skills.js setCustomSkills) so ranks, totals, rolls and the Character tab work
// on them. No page code here.
//
// state.customSkills = [{ id ('csk-...'), name, ability, trained, acp, classSkill, description }].

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Saved definitions tidied (at most 20); a name the skill list already has is left out. taken: names already used.
export function tidyCustomSkills(saved, taken = []) {
  const seen = new Set(taken.map(n => n.toLowerCase()));
  const out = [];
  for (const [i, d] of (Array.isArray(saved) ? saved : []).entries()) {
    if (!d || typeof d !== 'object' || out.length >= 20) continue;
    const name = String(d.name || '').trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ id: typeof d.id === 'string' && d.id.startsWith('csk-') ? d.id.slice(0, 40) : `csk-${i}`, name,
      ability: ABILITIES.includes(d.ability) ? d.ability : 'int', trained: d.trained === true, acp: d.acp === true,
      classSkill: d.classSkill === true, description: String(d.description || '').slice(0, 1000) });
  }
  return out;
}
