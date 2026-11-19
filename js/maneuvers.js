// Path of War (Dreamscarred Press; third-party, data/third-party.json): martial maneuvers and stances. No page code here,
// so these functions can be tested on their own.
//
// A martial disciple class (stalker, warder, warlord) has `initiator: { ability, disciplines, choose }` and each level's
// row has `maneuvers: { known, readied, stances }`. The character's choices for a class are saved in
// state.maneuvers[class id] = { discipline (the "either X or Y" pick), known: [maneuver ids], stances: [ids],
// readied: [ids], stance (the stance in use, '' for none) }.

const lower = s => String(s ?? '').toLowerCase();

// The classes in `counts` ([{ cls, level }]) that initiate maneuvers.
export const initiatorClasses = counts => counts.filter(e => e.cls?.initiator && e.level > 0);

// Initiator level for one class: its level + half the levels in every other class (Systems and Use), never more than
// the character level. With no martial disciple class it's half the character level (for feats such as Martial Training).
export function initiatorLevel(counts, clsId) {
  const total = counts.reduce((n, e) => n + e.level, 0);
  const own = counts.find(e => e.cls.id === clsId)?.level || 0;
  if (!own) return Math.floor(total / 2);
  return Math.min(total, own + Math.floor((total - own) / 2));
}

// The highest maneuver level an initiator level can learn: 1st at 1st-2nd, 2nd at 3rd-4th... 9th at 17th.
export const maxManeuverLevel = il => Math.max(1, Math.min(9, Math.ceil(il / 2)));

// How many maneuvers known, readied and stances a class gives at its level, plus feats: Extra Readied Maneuver (+1
// readied each), Advanced Study (+2 maneuvers known each; the book's other choice, one stance, is counted with
// `studyStances`). Feats count for the first initiator class (the book has the player pick one).
export function maneuverSlots(cls, level, { extraReadied = 0, advancedStudy = 0, studyStances = 0 } = {}) {
  const row = cls?.progression?.[Math.min(level, cls.progression.length) - 1]?.maneuvers;
  if (!row) return { known: 0, readied: 0, stances: 0 };
  const swapped = Math.min(studyStances, advancedStudy);
  return { known: row.known + 2 * (advancedStudy - swapped), readied: row.readied + extraReadied, stances: row.stances + swapped };
}

// The disciplines a class can learn from: its list, plus the one picked from its "either X or Y".
export function disciplinesFor(cls, choice) {
  const init = cls?.initiator;
  if (!init) return [];
  return [...init.disciplines, ...(init.choose || []).filter(d => d === choice)];
}

// Initiation modifier: the class's initiation ability modifier.
export const initiationModifier = (cls, mod = {}) => mod[cls?.initiator?.ability] || 0;

// A maneuver's save DC: 10 + its level + the initiation modifier.
export const maneuverDC = (maneuver, initMod) => 10 + (maneuver?.level || 0) + initMod;

// Whether a maneuver (or stance) can be learned: it's in one of the class's disciplines, of a level the initiator level
// allows, and the character knows enough others of its discipline (its prerequisite: "Two Silver Crane maneuvers";
// maneuvers and stances known both count). known: the ids known now (maneuvers and stances, every class), byId: maneuver
// id -> record. Returns { ok, why }.
export function canLearn(m, { disciplines, il, known = [], byId = new Map() }) {
  if (!disciplines.includes(m.discipline)) return { ok: false, why: `${m.discipline} isn't one of this class's disciplines` };
  const max = maxManeuverLevel(il);
  if (m.level > max) return { ok: false, why: `level ${m.level}: initiator level ${il} learns up to level ${max}` };
  const need = m.prerequisite || 0;
  const have = known.filter(id => id !== m.id && byId.get(id)?.discipline === m.discipline).length;
  if (have < need) return { ok: false, why: `needs ${need} other ${m.discipline} maneuver${need === 1 ? '' : 's'} known (you know ${have})` };
  return { ok: true, why: '' };
}

// The maneuvers a class can choose from for one kind of slot ('maneuver': strikes, boosts and counters; 'stance'),
// each with canLearn's answer, lowest level first.
export function maneuverOptions(maneuvers, kind, ctx) {
  return maneuvers.filter(m => (kind === 'stance') === (m.type === 'stance') && ctx.disciplines.includes(m.discipline))
    .map(m => ({ m, ...canLearn(m, ctx) }))
    .sort((a, b) => a.m.level - b.m.level || a.m.discipline.localeCompare(b.m.discipline) || a.m.name.localeCompare(b.m.name));
}

// A class's saved choices, tidied for its current level: unknown ids dropped, the lists cut to the slot counts, readied
// only from the maneuvers known and at most the readied count, the stance in use only from the stances known.
export function tidyChoices(saved, slots, byId) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const ids = (list, test) => [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && test(byId.get(id))))];
  const known = ids(s.known, m => m && m.type !== 'stance').slice(0, slots.known);
  const stances = ids(s.stances, m => m && m.type === 'stance').slice(0, slots.stances);
  const readied = ids(s.readied, m => m && known.includes(m.id)).slice(0, slots.readied);
  return { discipline: typeof s.discipline === 'string' ? s.discipline : '', known, stances, readied,
           stance: stances.includes(s.stance) ? s.stance : '' };
}

// Problems with what's chosen (after a level goes down or the discipline pick changes): each { id, why }.
export function choiceProblems(choice, ctx) {
  const all = [...choice.known, ...choice.stances];
  return all.map(id => ctx.byId.get(id)).filter(Boolean)
    .map(m => ({ id: m.id, ...canLearn(m, { ...ctx, known: ctx.known || all }) })).filter(x => !x.ok).map(({ id, why }) => ({ id, why }));
}

// What a maneuver is: "Strike, level 1 (Broken Blade)".
export const maneuverKind = m => `${m.type[0].toUpperCase()}${m.type.slice(1)}, level ${m.level} (${m.discipline})`;

// The Path of War feats that change the counts above, from the names of the feats the character has (a list, repeats
// counted).
export function maneuverFeatCounts(featNames = []) {
  const n = name => featNames.filter(f => lower(f) === lower(name)).length;
  return { extraReadied: n('Extra Readied Maneuver'), advancedStudy: n('Advanced Study') };
}

// ---- numbers the app counts ----------------------------------------------------------------------------------------

const fx = (name, parts) => {
  const [first, ...more] = parts.filter(p => p.value);
  return first ? [{ name, ...first, ...(more.length ? { more } : {}), on: true, classFeature: true }] : [];
};

// The stance in use, where its bonuses are plain numbers (by name; the rest is rules text to apply in play). il =
// initiator level; shield: a shield is worn. Each returns effect parts { target, type, value }.
export const STANCE_EFFECTS = {
  'Iron Hand Stance': il => [{ target: 'ac', type: 'shield', value: 2 + Math.floor(il / 6) }],
  'Stance of the Defending Shell': (il, { shield }) => (shield ? [{ target: 'ac', type: 'untyped', value: Math.min(5, 1 + Math.floor((il - 1) / 4)) }] : []),
  "Running Hunter's Stance": () => [{ target: 'speed', type: 'enhancement', value: 10 }],
  'Stance of Aggression': () => [{ target: 'ac', type: 'untyped', value: -2 }],
  'Sands of Time Stance': il => ['init', 'ref'].map(target => ({ target, type: 'untyped', value: il >= 12 ? 4 : 2 })),
  'Riven Hourglass Stance': () => [{ target: 'ac', type: 'dodge', value: 4 }, { target: 'init', type: 'untyped', value: 4 }],
  'Unfettered Movement': () => [{ target: 'speed', type: 'untyped', value: 10 }],
  'Silver Crane Waltz': il => ['init', 'ref', 'ac'].map(target => ({ target, type: 'insight', value: (target === 'init' ? 4 : 2) + Math.floor((il - 1) / 8) })),
  'Steel Coils': () => [{ target: 'ac', type: 'natural armor', value: 4 }],
};

// The effects of the stance in use for one class (choice.stance), or none.
export function stanceEffects(stance, il, opts = {}) {
  const make = stance && STANCE_EFFECTS[stance.name];
  return make ? fx(`${stance.name} (stance)`, make(il, opts)) : [];
}

// The martial disciple classes' always-on features: a stalker's dodge bonus (the class table's column) and combat
// insight (2nd: initiation modifier to initiative and Reflex, insight), a warlord's force of personality (3rd:
// initiation modifier to Will). entries: [{ cls, level, initMod }].
export function martialClassEffects(entries) {
  const out = [];
  for (const { cls, level, initMod } of entries) {
    const row = cls.progression?.[level - 1];
    if (cls.id === 'stalker') {
      out.push(...fx('Dodge bonus (stalker)', [{ target: 'ac', type: 'dodge', value: row?.dodge_bonus || 0 }]));
      if (level >= 2 && initMod > 0) out.push(...fx('Combat insight (stalker)', ['init', 'ref'].map(target => ({ target, type: 'insight', value: initMod }))));
    }
    if (cls.id === 'warlord' && level >= 3 && initMod > 0) out.push(...fx('Force of personality (warlord)', [{ target: 'will', type: 'untyped', value: initMod }]));
  }
  return out;
}

// Daily uses: a stalker's ki pool (half the stalker level + initiation modifier, at least 1).
export function martialDaily(entries) {
  return entries.filter(e => e.cls.id === 'stalker').map(({ level, initMod, cls }) => ({
    name: 'Ki pool (stalker)', max: Math.max(1, Math.floor(level / 2) + initMod), unit: 'points',
    how: `half your stalker level (${Math.floor(level / 2)}) + your initiation modifier (${initMod}), at least 1`,
    text: cls.features.find(f => f.name.startsWith('Ki Pool'))?.text || '' }));
}

// Feats the classes grant: a warder's Combat Reflexes (defensive focus, 1st level).
export const martialFeats = entries => (entries.some(e => e.cls.id === 'warder') ? ['Combat Reflexes'] : []);
