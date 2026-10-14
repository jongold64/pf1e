// Alignment (Build tab): the nine alignments, and the class rules that limit them (Core Rulebook and later books:
// "Lawful good." for a paladin, "Any lawful." for a monk, "within one step of her deity's" for a cleric...). No page
// code here, so it can be tested on its own.

export const ALIGNMENTS = [['LG', 'Lawful good'], ['NG', 'Neutral good'], ['CG', 'Chaotic good'],
  ['LN', 'Lawful neutral'], ['N', 'Neutral'], ['CN', 'Chaotic neutral'],
  ['LE', 'Lawful evil'], ['NE', 'Neutral evil'], ['CE', 'Chaotic evil']];
export const ALIGNMENT_NAMES = Object.fromEntries(ALIGNMENTS);
const ALL = ALIGNMENTS.map(([a]) => a);

// An alignment's place on the two axes: law (−1) to chaos (+1), good (−1) to evil (+1).
const axes = a => [a === 'N' ? 0 : { L: -1, N: 0, C: 1 }[a[0]], a === 'N' ? 0 : { G: -1, N: 0, E: 1 }[a[1]]];

// Within one step of another alignment, along one axis only (a cleric and her deity): LG is one step from NG and LN,
// not from N.
export function oneStep(a, b) {
  const [x1, y1] = axes(a);
  const [x2, y2] = axes(b);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) <= 1;
}

// A class's alignment rule from its text: { allowed: ['LG'], text: 'lawful good' }, { deity: true }, or null (any).
export function alignmentRule(text) {
  const t = String(text || '').toLowerCase();
  if (/within one step of (?:her|his|their) deity/.test(t)) return { deity: true };
  if (/^lawful good\b/.test(t)) return { allowed: ['LG'], text: 'lawful good' };
  if (/^chaotic evil\b/.test(t)) return { allowed: ['CE'], text: 'chaotic evil' };
  if (/^any nonlawful|any nonlawful alignment|never lawful/.test(t)) return { allowed: ALL.filter(a => a[0] !== 'L'), text: 'any nonlawful alignment' };
  if (/^any lawful/.test(t)) return { allowed: ALL.filter(a => a[0] === 'L'), text: 'any lawful alignment' };
  if (/^any neutral/.test(t)) return { allowed: ALL.filter(a => a === 'N' || a.includes('N')), text: 'any neutral alignment (neutral on at least one axis)' };
  return null;
}

// What's wrong with an alignment for the classes taken (and the deity, for a cleric, warpriest or inquisitor):
// [{ cls, text, fix }], fix being an alignment that would do (the only one allowed) or null.
// classes: [{ id, name, alignment (the class's alignment text) }]; deity: { name, alignment } or null.
export function alignmentProblems(alignment, classes, deity = null) {
  const out = [];
  for (const c of classes) {
    const rule = alignmentRule(c.alignment);
    if (!rule) continue;
    if (rule.deity) {
      if (!alignment || !deity || !ALIGNMENT_NAMES[deity.alignment]) continue;
      if (!oneStep(alignment, deity.alignment)) out.push({ cls: c.name, text: `A ${c.name.toLowerCase()}'s alignment must be within one step of ${deity.name}'s (${ALIGNMENT_NAMES[deity.alignment].toLowerCase()}).`, fix: null });
    } else if (!alignment) {
      out.push({ cls: c.name, text: `A ${c.name.toLowerCase()} must be ${rule.text}: choose an alignment.`, fix: rule.allowed.length === 1 ? rule.allowed[0] : null });
    } else if (!rule.allowed.includes(alignment)) {
      out.push({ cls: c.name, text: `A ${c.name.toLowerCase()} must be ${rule.text}, not ${ALIGNMENT_NAMES[alignment].toLowerCase()}.`, fix: rule.allowed.length === 1 ? rule.allowed[0] : null });
    }
  }
  return out;
}
