// Archetypes (Advanced Player's Guide and later): each one swaps some of a class's features for its own. No page code
// here, so it can be tested on its own.
//
// An archetype's features say what they replace ("This ability replaces bravery.", "replaces armor training 1").
// Those phrases are matched to the class table's feature entries ("bravery +1", "Armor training 1"): a phrase with a
// number matches only that step, one naming levels ("the hex gained at 2nd level") only those levels, and a bare name
// every step. `classWithArchetypes` returns a copy of the class with the replaced entries gone, the archetype's
// features listed at their level, and its class skill and proficiency changes applied, so everything else in the app
// reads the changed class. Two archetypes can't be combined if they replace or change the same feature.

const ORDINAL_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

// "Armor training 1" -> "armor training", "bonus feats" -> "bonus feat". With `dropOwner`, a possessive is dropped
// too: "the witch's 1st-level hex" -> "hex" (a plain call keeps "hunter's bond").
export function featureBase(s, dropOwner = false) {
  let t = String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/-(?=[a-z])/g, ' ');
  if (dropOwner) t = t.replace(/\b\w+'s\b/g, ' ');
  t = t
    .replace(/\b\d+(?:st|nd|rd|th)(?: ?level)?\b|\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) level\b/g, ' ')
    .replace(/[+-]?\d+(?:d\d+)?(?:\/[^\s,]*)?/g, ' ')
    .replace(/\b(?:the|a|an|at|gained|gains|levels?|and|or|ft|x|class|features?|abilit(?:y|ies)|standard|normal|existing|usual)\b/g, ' ')
    .replace(/[^a-z' -]/g, ' ');
  return t.split(/\s+/).filter(Boolean).map(w => w.replace(/(?<=x)es$/, '').replace(/(?<=[a-z]{3})s$/, '')).join(' ');
}

// What a "replaces" phrase points at: its base name, step numbers ("armor training 1 and 3") and levels ("gained at
// 2nd level", "second").
export function phraseParts(p) {
  const s = String(p).toLowerCase();
  const levels = new Set([...s.matchAll(/(\d+)(?:st|nd|rd|th)/g)].map(m => Number(m[1])));
  for (const [w, n] of Object.entries(ORDINAL_WORDS)) if (new RegExp(`\\b${w} level\\b`).test(s)) levels.add(n);
  const nums = new Set([...s.replace(/\d+(?:st|nd|rd|th)/g, ' ').matchAll(/[+]?(\d+)(?!d)/g)].map(m => Number(m[1])));
  return { base: featureBase(s), owned: featureBase(s, true), nums, levels };
}

// Pathfinder Unchained: the unchained barbarian and rogue can take the original class's archetypes as long as the
// features they replace or change still exist; danger sense counts as trap sense for this (it "can be replaced by any
// archetype class feature that replaces trap sense").
export const UNCHAINED_FROM = { 'barbarian-unchained': 'barbarian', 'rogue-unchained': 'rogue' };
const SAME_AS = { 'trap sense': 'danger sense' };

// The archetypes a class can take: its own, and for an unchained class the original class's.
export function archetypesFor(classId, all) {
  return all.filter(a => a.class === classId || a.class === UNCHAINED_FROM[classId]);
}

// For an original-class archetype on an unchained class: the features it replaces or changes that the unchained class
// doesn't have (names only; the unchained table lists each feature once, without steps). Empty means it fits.
export function unchainedGaps(original, unchained, arch) {
  const names = new Set((unchained.progression || []).flatMap(r => (r.special || []).map(s => featureBase(s))));
  const has = b => names.has(b) || names.has(SAME_AS[b]) || [...names].some(n => n.startsWith(`${b} `) || b.startsWith(`${n} `));
  const gaps = [];
  for (const f of arch.features || []) {
    for (const p of [...(f.replaces || []), ...(f.alters || [])]) {
      // "trap sense (for a core rogue) or danger sense (for an unchained rogue)": either option will do.
      const options = p.replace(/\([^)]*\)/g, ' ').split(/\s+or\s+/).map(phraseParts);
      const inOriginal = options.some(parts => (original.progression || []).some(r => (r.special || []).some(s => matches(parts, s, r.level))));
      if (inOriginal && !options.some(parts => has(parts.base) || has(parts.owned))) gaps.push(p);
    }
  }
  return [...new Set(gaps)];
}

function specialNumber(s) {
  const m = String(s).match(/[+]?(\d+)/);
  return m ? Number(m[1]) : null;
}

function matches(parts, special, level) {
  const sb = featureBase(special);
  const same = b => b && (sb === b || sb.startsWith(`${b} `) || (b.startsWith(`${sb} `) && sb.length > 3));
  const alias = b => SAME_AS[b] && same(SAME_AS[b]);
  if (!sb || !(same(parts.base) || same(parts.owned) || alias(parts.base) || alias(parts.owned))) return false;
  // A table entry without a step number (unchained tables list "sneak attack" once) matches any step.
  if (parts.nums.size && specialNumber(special) !== null && !parts.nums.has(specialNumber(special))) return false;
  if (parts.levels.size && !parts.levels.has(level)) return false;
  return true;
}

// A feature named like what it replaces ("Bonus Feats" replacing "the monk's normal bonus feats", "Divine Bond"
// replacing "divine bond") changes that feature rather than removing it: the table entry stays (it may still give
// a bonus feat slot), though it still counts as changed when combining archetypes.
function removes(f) {
  const own = featureBase(f.name);
  return (f.replaces || []).filter(p => { const q = phraseParts(p); return q.base !== own && q.owned !== own; });
}

// The class table entries an archetype replaces: [{ level, index, name }].
export function replacedEntries(cls, arch) {
  const out = [];
  const phrases = (arch.features || []).flatMap(removes).map(phraseParts);
  for (const row of cls.progression || []) {
    (row.special || []).forEach((name, index) => {
      if (phrases.some(p => matches(p, name, row.level))) out.push({ level: row.level, index, name });
    });
  }
  return out;
}

// Everything an archetype replaces or changes, for spotting clashes: table entries ("armor training@3") and the
// phrases themselves (for features that aren't in the table, such as proficiencies or a deed).
function touched(cls, arch) {
  const keys = new Set(replacedEntries(cls, arch).map(e => `${e.level}#${e.index}`));
  for (const f of arch.features || []) {
    for (const p of [...(f.replaces || []), ...(f.alters || [])]) keys.add(`~${featureBase(p)}`);
    if (f.class_skills?.set) keys.add('~class skill list');
    if (f.proficiency?.replace) keys.add('~weapon armor proficiency');
  }
  // Changed (altered, or replaced by a same-named feature) table entries clash too.
  const alters = (arch.features || []).flatMap(f => [...(f.alters || []), ...(f.replaces || [])]).map(phraseParts);
  for (const row of cls.progression || []) {
    (row.special || []).forEach((name, index) => {
      if (alters.some(p => matches(p, name, row.level))) keys.add(`${row.level}#${index}`);
    });
  }
  keys.delete('~');
  return keys;
}

// Why an archetype can't be added to the ones already chosen for this class ('' if it can).
export function archetypeConflict(cls, arch, chosen = []) {
  const mine = touched(cls, arch);
  for (const other of chosen) {
    if (other.id === arch.id) continue;
    const theirs = touched(cls, other);
    const shared = [...mine].filter(k => theirs.has(k));
    if (shared.length) {
      const names = shared.map(k => (k.startsWith('~') ? k.slice(1)
        : (cls.progression.find(r => r.level === Number(k.split('#')[0]))?.special || [])[Number(k.split('#')[1])] || k));
      return `${other.name} also changes ${[...new Set(names)].slice(0, 3).join(', ')}`;
    }
  }
  return '';
}

// The level an archetype feature is gained at: its own "At 3rd level", else that of the first entry it replaces
// or changes, else 1st for one that replaces or changes something not in the table (proficiencies, class skills,
// spellcasting). null for the rest: lists of extra talents, hexes or discoveries the archetype can pick.
export function featureLevel(cls, feature) {
  if (feature.level) return feature.level;
  // A feature named like a table entry ("Weapon Training: As the fighter class feature, but ...") changes it.
  const named = [...(feature.replaces || []), ...(feature.alters || [])];
  const phrases = [...named, feature.name].map(phraseParts);
  for (const row of cls.progression || []) {
    if ((row.special || []).some(s => phrases.some(p => matches(p, s, row.level)))) return row.level;
  }
  const basics = /proficienc|class skills?|skill ranks|spell|alignment|hit die|diminished/i;
  return named.length || feature.class_skills || feature.proficiency || basics.test(feature.name) ? 1 : null;
}

const ARMOR = ['light', 'medium', 'heavy'];

// A class's proficiency text with an archetype's change: its own text in place of the class's, or the class's with
// some armor, shields or weapons taken away and the archetype's text added.
export function changedProficiency(text, change) {
  if (!change) return text;
  if (change.replace) return change.replace;
  let t = text || '';
  const remove = change.remove || [];
  const armorGone = ARMOR.filter(a => remove.includes(`${a} armor`));
  if (armorGone.length) {
    const left = ARMOR.filter(a => !armorGone.includes(a));
    const list = left.length ? `${left.join(' armor, ')} armor` : 'no armor';
    t = t.replace(/all (?:types of )?armor(?: \([^)]*\))?/gi, list);
    for (const a of armorGone) t = t.replace(new RegExp(`\\b${a}(?:,? (?:and|or) )?(?= armor|,)`, 'gi'), '');
  }
  if (remove.includes('tower shields')) t = t.replace(/\(including tower shields\)/gi, '(except tower shields)');
  if (remove.includes('shields')) t = t.replace(/,? (?:and |with )?(?:all )?shields(?: \([^)]*\))?/gi, '');
  if (remove.includes('martial weapons')) t = t.replace(/ and martial weapons| martial weapons and/gi, '');
  // The archetype's own sentences are added, except ones taking proficiency away (their armor names would
  // otherwise read as gained).
  const gains = (change.add || '').split(/(?<=\.)\s+/).filter(x => !/\bnot proficient|\bloses?\b|does not gain/i.test(x));
  return `${t} ${gains.join(' ')}`.trim();
}

// A class's skill list with an archetype's change.
export function changedClassSkills(list, change) {
  if (!change) return list;
  if (change.set) return change.set.map(skill => ({ skill }));
  const base = s => s.replace(/\s*\(.*\)$/, '');
  const gone = change.remove || [];
  const kept = list.filter(e => !gone.some(g => g === e.skill || (g === base(g) && base(e.skill) === g && g !== 'Knowledge')));
  const have = new Set(kept.map(e => e.skill));
  return [...kept, ...(change.add || []).filter(s => !have.has(s)).map(skill => ({ skill }))];
}

// The class with its archetypes applied (the same object when there are none).
export function classWithArchetypes(cls, archetypes = []) {
  if (!archetypes.length) return cls;
  const gone = new Set(archetypes.flatMap(a => replacedEntries(cls, a).map(e => `${e.level}#${e.index}`)));
  const progression = cls.progression.map(row => ({
    ...row,
    special: (row.special || []).filter((_, i) => !gone.has(`${row.level}#${i}`)),
    replaced: (row.special || []).filter((_, i) => gone.has(`${row.level}#${i}`)),
    archetype_features: [],
  }));
  let classSkills = cls.class_skills || [];
  let features = cls.features || [];
  const options = [];  // extra talents / hexes / discoveries the archetypes offer
  for (const a of archetypes) {
    for (const f of a.features || []) {
      const level = featureLevel(cls, f);
      const entry = { name: f.name, text: f.text, archetype: a.name };
      if (level === null) options.push(entry);
      else (progression.find(r => r.level === level) || progression[0]).archetype_features.push(entry);
      if (f.class_skills) classSkills = changedClassSkills(classSkills, f.class_skills);
      if (f.proficiency) {
        features = features.map(x => (/proficien/i.test(x.name) ? { ...x, text: changedProficiency(x.text, f.proficiency) } : x));
      }
    }
  }
  return { ...cls, progression, class_skills: classSkills, features, archetypes: archetypes.map(a => a.name),
           archetype_options: options };
}
