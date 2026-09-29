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

// Pathfinder Unchained: the unchained classes can take the original class's archetypes as long as the
// features they replace or change still exist; danger sense counts as trap sense for this (it "can be replaced by any
// archetype class feature that replaces trap sense").
export const UNCHAINED_FROM = { 'barbarian-unchained': 'barbarian', 'rogue-unchained': 'rogue', 'monk-unchained': 'monk',
                                'summoner-unchained': 'summoner' };
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

// The table's ruling for the unchained monk: a monk archetype may trade away an ability the unchained monk no longer
// has (slow fall, high jump, diamond body, ...) by giving up a ki power instead, one per ability. The unchained monk
// gains a ki power at these levels.
export const KI_POWER_TRADE = { 'monk-unchained': [4, 6, 8, 10, 12, 14, 16, 18, 20] };

// The level an ability first appears in a class table (1 if it isn't found).
function tableLevel(cls, phrase) {
  const options = phrase.replace(/\([^)]*\)/g, ' ').split(/\s+or\s+/).map(phraseParts);
  const row = (cls.progression || []).find(r => (r.special || []).some(s => options.some(p => matches(p, s, r.level))));
  return row ? row.level : 1;
}

// Ki powers given up for original-class archetypes on the unchained monk: { trades: [{ archetype, feature, level }],
// short: [feature] } — each missing ability takes the first unused ki power gained at or after its level (else the
// latest one left); `short` lists abilities with no ki power left to give up.
export function kiPowerTrades(original, unchained, archetypes) {
  const free = [...(KI_POWER_TRADE[unchained.id] || [])];
  const trades = [], short = [];
  if (!free.length) return { trades, short };
  for (const a of archetypes.filter(x => x.class === original.id)) {
    for (const gap of unchainedGaps(original, unchained, a)) {
      const lv = tableLevel(original, gap);
      const i = free.findIndex(l => l >= lv);
      const level = i >= 0 ? free.splice(i, 1)[0] : free.pop();
      if (level === undefined) short.push(gap);
      else trades.push({ archetype: a.name, feature: gap, level });
    }
  }
  return { trades, short };
}

// Whether an original-class archetype can go on an unchained class alongside the ones chosen: { why } says why not
// ('' if it can), `kiPowers` how many ki powers it costs the unchained monk.
export function unchainedFit(original, unchained, arch, chosen = []) {
  const missing = unchainedGaps(original, unchained, arch);
  if (!missing.length) return { why: '', kiPowers: 0 };
  if (!KI_POWER_TRADE[unchained.id]) {
    return { why: `changes ${missing.slice(0, 2).join(', ')}, which the ${unchained.name} doesn't have`, kiPowers: 0 };
  }
  const { short } = kiPowerTrades(original, unchained, [...chosen.filter(a => a.id !== arch.id), arch]);
  if (short.length) return { why: `not enough ki powers left to trade for ${short.slice(0, 2).join(', ')}`, kiPowers: 0 };
  return { why: '', kiPowers: missing.length };
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

// The rules text for a class table entry ("bravery +1" -> the Bravery feature), '' when the class has none by that name.
// Falls back to a numbered form's base ("Summon monster II" -> Summon Monster I), "DR" = damage reduction, and a
// sub-ability described inside another feature's text ("Countersong (Su): ..." within Bardic Performance).
export function featureDescription(cls, entry) {
  const b = featureBase(String(entry).replace(/^DR\b/, 'damage reduction')).replace(/\s+(?:i|ii|iii|iv|v|vi|vii|viii|ix)$/, '');
  if (!b) return '';
  const feats = cls.features || [];
  const baseOf = x => featureBase(x.name).replace(/\s+(?:i|ii|iii|iv|v|vi|vii|viii|ix)$/, '');
  const f = feats.find(x => baseOf(x) === b)
    || feats.find(x => baseOf(x).startsWith(`${b} `) || b.startsWith(`${baseOf(x)} `))
    || (SAME_AS[b] && feats.find(x => baseOf(x) === SAME_AS[b]));
  if (f) return f.text;
  // "Countersong (Su): A bard can ..." up to the next "Name (Su):" paragraph.
  for (const x of feats) {
    const paras = String(x.text || '').split(/\n{2,}/);
    const start = paras.findIndex(p => featureBase((p.match(/^([^:.]{2,60})(?:\s*\((?:Ex|Su|Sp)\))?\s*:/) || [])[1] || '') === b);
    if (start >= 0) {
      const end = paras.findIndex((p, i) => i > start && /^[^:.]{2,60}\((?:Ex|Su|Sp)\)\s*:/.test(p));
      return paras.slice(start, end < 0 ? undefined : end).join('\n\n');
    }
  }
  return '';
}

// The class with its archetypes applied (the same object when there are none). `kiTrades` (from kiPowerTrades) marks
// the ki powers the unchained monk gave up.
export function classWithArchetypes(cls, archetypes = [], kiTrades = []) {
  if (!archetypes.length) return cls;
  const gone = new Set(archetypes.flatMap(a => replacedEntries(cls, a).map(e => `${e.level}#${e.index}`)));
  const progression = cls.progression.map(row => ({
    ...row,
    special: (row.special || []).filter((_, i) => !gone.has(`${row.level}#${i}`)),
    replaced: [...(row.special || []).filter((_, i) => gone.has(`${row.level}#${i}`)),
               ...kiTrades.filter(t => t.level === row.level).map(t => `ki power (traded for ${t.feature})`)],
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
