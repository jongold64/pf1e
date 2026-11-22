// Custom feats (Feats tab, Custom button): feats the list doesn't have, made into feat records like the list's
// (data/feats.json) so they can go in feat slots, with an optional bonus that counts while the feat is chosen.
// No page code here.
//
// state.customFeats = [{ id ('cf-...'), name, type, prereq (text), benefit (text), bonus: { target, type, value } | null }].

export const FEAT_TYPES = ['General', 'Combat', 'Metamagic', 'Teamwork', 'Style', 'Critical', 'Item Creation', 'Story', 'Grit', 'Panache', 'Performance'];

// The feat record. A prerequisite in words can't be checked (shown with ?); none means it's always open.
export function customFeatRecord(d) {
  return { id: d.id, name: d.name, source: 'Custom', types: [d.type], description: d.benefit || 'A custom feat.',
    prerequisites_text: d.prereq || null, prerequisites: d.prereq ? [{ type: 'other', text: d.prereq }] : [],
    benefit: d.benefit || 'A custom feat.', custom: true };
}

// The bonuses chosen custom feats give, as custom effects: [{ name, target, type, value, on }].
export const customFeatEffects = (defs = [], chosenIds = []) => defs.filter(d => d.bonus && d.bonus.value && chosenIds.includes(d.id))
  .map(d => ({ name: d.name, target: d.bonus.target, type: d.bonus.type, value: d.bonus.value, on: true }));

// Saved definitions tidied (at most 40). targets / types: the allowed bonus targets and types (effects.js).
export function tidyCustomFeats(saved, targets = [], types = []) {
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 40).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('cf-') ? d.id.slice(0, 40) : `cf-${i}`, name: String(d.name || 'Custom feat').slice(0, 60),
    type: FEAT_TYPES.includes(d.type) ? d.type : 'General', prereq: String(d.prereq || '').slice(0, 300), benefit: String(d.benefit || '').slice(0, 2000),
    bonus: d.bonus && targets.includes(d.bonus.target) && types.includes(d.bonus.type) && Number.isInteger(d.bonus.value) && d.bonus.value
      ? { target: d.bonus.target, type: d.bonus.type, value: Math.max(-20, Math.min(20, d.bonus.value)) } : null,
  }));
}
