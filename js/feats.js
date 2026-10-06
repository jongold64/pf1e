// Feat rules: where feat slots come from, which feats a slot accepts, and prerequisite checks.
// No page code here, so these functions can be tested on their own.
import { spellsPerDay, classCounts } from './rules.js';
import { ranksFor, SKILLS } from './skills.js';

const lower = s => String(s ?? '').toLowerCase();
const hasType = (feat, ...types) => types.some(t => (feat.types || []).includes(t));

// Monk bonus feats: the list grows at 6th and 10th level, and prerequisites are waived.
const MONK_FEATS = {
  1: ['Catch Off-Guard', 'Combat Reflexes', 'Deflect Arrows', 'Dodge', 'Improved Grapple', 'Scorpion Style', 'Throw Anything'],
  6: ['Gorgon\'s Fist', 'Improved Bull Rush', 'Improved Disarm', 'Improved Feint', 'Improved Trip', 'Mobility'],
  10: ['Improved Critical', 'Medusa\'s Wrath', 'Snatch Arrows', 'Spring Attack'],
};
export function monkFeatList(monkLevel) {
  return Object.entries(MONK_FEATS).filter(([lv]) => monkLevel >= Number(lv)).flatMap(([, names]) => names);
}

// What each kind of class bonus feat accepts, from the classes' rules text.
// allowed(feat, slotLevel) returns true if the feat can go in the slot; null means any feat.
const combat = { note: 'Must be a combat feat.', allowed: f => hasType(f, 'Combat') };
export const BONUS_FEAT_RULES = {
  fighter: combat,
  cavalier: combat,
  samurai: combat,
  swashbuckler: combat,
  brawler: combat,
  warpriest: { ...combat, note: 'Must be a combat feat. Uses your warpriest level as your BAB and fighter level for these feats.',
               levelAsBab: true, levelAsFighter: true },
  gunslinger: { note: 'Must be a combat or grit feat.', allowed: f => hasType(f, 'Combat', 'Grit') },
  magus: { note: 'Must be a combat, item creation or metamagic feat.',
           allowed: f => hasType(f, 'Combat', 'Item Creation', 'Metamagic') },
  wizard: { note: 'Must be a metamagic or item creation feat, or Spell Mastery.',
            allowed: f => hasType(f, 'Metamagic', 'Item Creation') || f.name === 'Spell Mastery' },
  monk: { note: 'Must be from the monk bonus feat list. Prerequisites are waived.',
          allowed: (f, slotLevel) => monkFeatList(slotLevel).includes(f.name), waivePrereqs: true },
  // The unchained monk uses the same bonus feat list.
  'monk-unchained': { note: 'Must be from the monk bonus feat list. Prerequisites are waived.',
                      allowed: (f, slotLevel) => monkFeatList(slotLevel).includes(f.name), waivePrereqs: true },
  teamwork: { note: 'Must be a teamwork feat.', allowed: f => hasType(f, 'Teamwork') },
  rangerStyle: { note: 'Must be from your combat style\'s list (not checked). Prerequisites are waived.',
                 allowed: null, waivePrereqs: true },
  bloodline: { note: 'Must be from your bloodline\'s list.',
               allowed: (f, slotLevel, slot) => !BLOODLINE_FEATS[slot?.clsId] || BLOODLINE_FEATS[slot.clsId].includes(lower(f.name)) },
};

// The bonus feats of each class's chosen bloodline ({ sorcerer: [names] }), set by the app; a class without a bloodline
// chosen takes any feat. "Skill Focus (Knowledge [arcana])" counts as Skill Focus.
let BLOODLINE_FEATS = {};
export function setBloodlineFeats(byClass) {
  BLOODLINE_FEATS = Object.fromEntries(Object.entries(byClass || {}).map(([c, names]) =>
    [c, names.map(n => lower(n.replace(/\s*\(.*$/, '')))]));
}

// Which class-table entries give a bonus feat, and the rule that applies to it.
function bonusFeatRule(cls, special) {
  const s = lower(special);
  if (s === 'bonus feat') return BONUS_FEAT_RULES[cls.id] ? cls.id : null;
  if (s === 'bonus combat feat') return 'brawler';
  if (s === 'teamwork feat') return 'teamwork';
  if (s === 'combat style feat') return 'rangerStyle';
  if (s === 'bloodline feat') return 'bloodline';
  return null;
}

// Every feat slot a character has at `level`. Slot ids stay the same as the level changes,
// so choices are kept when the level goes down and back up. General feats come at odd character levels;
// class bonus feats come from each class at its own class level (id "class-fighter-L2").
// Pass { cls, level } for a single class, or `classLevels` (the class at each level) for a multiclass character.
// flaws (Flaws house rule): the named flaws taken, each giving a bonus feat at 1st level (at most two).
// antihero (Action Points house rule): a character that gives up hero points gets a bonus feat at 1st level.
export function featSlots({ race, cls, level, classLevels = null, flaws = [], antihero = false }) {
  const levels = classLevels || Array.from({ length: level }, () => cls);
  const slots = [];
  flaws.slice(0, 2).forEach((f, i) => {
    if (f?.name?.trim()) slots.push({ id: `flaw-${i + 1}`, kind: 'general', level: 1, label: `Bonus feat for a flaw (${f.name.trim()})` });
  });
  if (antihero) slots.push({ id: 'antihero', kind: 'general', level: 1, label: 'Antihero bonus feat (no hero points)' });
  for (let lv = 1; lv <= levels.length; lv += 2) {
    slots.push({ id: `L${lv}`, kind: 'general', level: lv, label: `Level ${lv}` });
  }
  if ((race?.traits || []).some(t => t.name === 'Bonus Feat')) {
    slots.push({ id: 'race', kind: 'race', level: 1, label: `${race.name} bonus feat` });
  }
  for (const { cls: c, level: n } of classCounts(levels)) {
    for (const row of c.progression.slice(0, n)) {
      for (const special of row.special || []) {
        const ruleId = bonusFeatRule(c, special);
        if (ruleId) {
          slots.push({ id: `class-${c.id}-L${row.level}`, kind: 'class', level: row.level, ruleId, clsId: c.id,
                       label: `${c.name} bonus feat (level ${row.level})` });
        }
      }
    }
  }
  return slots;
}

// Feats taken for one weapon, skill or school of magic ("Weapon Focus (longsword)"). The choice is stored per slot.
export const CHOICE_FEATS = {
  'Weapon Focus': 'weapon', 'Greater Weapon Focus': 'weapon', 'Weapon Specialization': 'weapon',
  'Greater Weapon Specialization': 'weapon', 'Improved Critical': 'weapon', 'Exotic Weapon Proficiency': 'weapon',
  'Martial Weapon Proficiency': 'weapon', 'Skill Focus': 'skill', 'Spell Focus': 'school', 'Greater Spell Focus': 'school',
};
export const SPELL_SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion',
  'necromancy', 'transmutation'];

// Character level a feat slot is reached at. General and racial slots already count character levels; a class
// bonus feat at class level n comes with the character's n-th level in that class.
export function slotCharacterLevel(slot, classLevels) {
  if (slot.kind !== 'class') return slot.level;
  let seen = 0;
  for (let i = 0; i < classLevels.length; i++) {
    if (classLevels[i].id === slot.clsId && ++seen === slot.level) return i + 1;
  }
  return classLevels.length;
}

// Can this feat go in this slot at all (ignoring prerequisites)?
export function slotAccepts(slot, feat) {
  if (slot.kind !== 'class') return true;
  const allowed = BONUS_FEAT_RULES[slot.ruleId]?.allowed;
  return !allowed || allowed(feat, slot.level, slot);
}

// Feats a class gets for free, taken from its class table (e.g. a wizard's Scribe Scroll).
// A monk's or brawler's "unarmed strike" is the Improved Unarmed Strike feat.
export function grantedFeats(cls, level, featNames) {
  const known = new Map(featNames.map(n => [lower(n), n]));
  const out = new Set();
  for (const row of cls.progression.slice(0, level)) {
    for (const special of row.special || []) {
      const s = lower(special);
      if (known.has(s)) out.add(known.get(s));
      if (s === 'unarmed strike') out.add('Improved Unarmed Strike');
      // The unchained rogue's finesse training gives Weapon Finesse at 1st level.
      if (s === 'finesse training' && known.has('weapon finesse')) out.add('Weapon Finesse');
    }
  }
  return [...out];
}

// Free feats from every class a character has, at that class's level. counts: [{ cls, level }].
export function grantedFeatsFor(counts, featNames) {
  return [...new Set(counts.flatMap(e => grantedFeats(e.cls, e.level, featNames)))];
}

// Armor and shield proficiencies from every class (a new class adds its proficiencies).
export function proficiencyFeatsFor(classes) {
  return [...new Set(classes.flatMap(c => proficiencyFeats(c)))];
}

// Armor and shield proficiencies, read from the class's "Weapon and Armor Proficiency" text.
// Returned as the feat names that feat prerequisites use.
export function proficiencyFeats(cls) {
  const text = lower((cls.features || []).find(f => /proficien/i.test(f.name))?.text);
  const out = [];
  // Armor comes only from sentences saying what the class is proficient with ("proficient with light and medium
  // armor"), not from ones about spell failure ("a bard wearing medium or heavy armor...").
  const kinds = new Set();
  for (const s of text.split(/(?<=\.)\s+/).filter(s => /\bproficien/.test(s) && !/\bnot proficient\b/.test(s))) {
    if (/all (?:types of )?armor/.test(s)) ['light', 'medium', 'heavy'].forEach(k => kinds.add(k));
    for (const m of s.matchAll(/((?:light|medium|heavy)(?:,?\s*(?:and|or)?\s*(?:light|medium|heavy))*)\s+armors?\b/g)) {
      for (const k of m[1].match(/light|medium|heavy/g)) kinds.add(k);
    }
  }
  if (kinds.has('light')) out.push('Armor Proficiency, Light');
  if (kinds.has('medium')) out.push('Armor Proficiency, Medium');
  if (kinds.has('heavy')) out.push('Armor Proficiency, Heavy');
  const shields = /\bshields\b/.test(text) && !/\b(not|any)\b[^.]*\bshields?\b/.test(text);
  if (shields) out.push('Shield Proficiency');
  if (shields && /tower shields/.test(text) && !/except tower shields/.test(text)) out.push('Tower Shield Proficiency');
  return out;
}

// Caster level for a single-class character (0 if the class doesn't cast spells yet).
// Classes whose spells start at 4th level (paladin, ranger, ...) cast at their level minus 3.
export function casterLevel(cls, level) {
  const spells = spellsPerDay({ cls, level, scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  if (!spells || spells.rows.length === 0) return 0;
  return spells.firstLevel >= 4 ? level - 3 : level;
}

// Everything prerequisite checks need to know about the character.
// `haveFeats` is every feat the character has (chosen, granted and proficiencies).
// `skillRanks` ({ skill name: ranks }) is optional; without it skill prerequisites can't be checked.
// A multiclass character passes `counts` ([{ cls, level }]) and `casting` ([{ cls, effectiveLevel }], see
// castingClasses in multiclass.js); a single-class one just { cls, level }.
// For class feature prerequisites (all optional): archetypes { class id: [archetype records] } (their features count from
// the level each comes at), choices [{ label, value }] (picks such as "Favored enemy": "Undead"), talentNames (chosen
// rage powers, talents, hexes...), featureWords (featureIndex: every feature name in the data, to tell a feature the
// character lacks from one the app doesn't know).
export function featContext({ race, cls, level, counts = null, casting = null, scores, bab, haveFeats, skillRanks = null,
                              archetypes = {}, choices = [], talentNames = [], featureWords = null, classNames = null }) {
  const classes = counts || [{ cls, level }];
  const casters = casting || classes.map(e => ({ cls: e.cls, effectiveLevel: e.level }));
  let maxSpellLevel = -1;
  for (const c of casters) {
    const rows = spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores })?.rows || [];
    for (const r of rows) {
      if (r.canCast && ((r.total ?? 0) > 0 || (r.known ?? 0) > 0)) maxSpellLevel = Math.max(maxSpellLevel, r.spellLevel);
    }
  }
  return {
    race, scores, bab, counts: classes,
    cls: classes[0].cls,
    level: classes.reduce((n, e) => n + e.level, 0),
    casterLevel: Math.max(0, ...casters.map(c => casterLevel(c.cls, c.effectiveLevel))),
    maxSpellLevel,
    skillRanks,
    haveFeats: new Set(haveFeats.map(lower)),
    archetypes, choices, talentNames, featureWords,
    // Every class id and name (lower case), to tell a class the character lacks from a name that isn't a class.
    classNames,
  };
}

// Levels a character has in a class, by id or name ("fighter", "Fighter").
export function levelsIn(ctx, clsIdOrName) {
  const want = lower(clsIdOrName);
  // "unchained summoner" is the class "Summoner (Unchained)" (id summoner-unchained).
  const unchained = want.match(/^unchained (\w+)$/);
  const id = unchained ? `${unchained[1]}-unchained` : want;
  return ctx.counts.find(e => e.cls.id === id || lower(e.cls.name) === want)?.level || 0;
}

// A class level prerequisite naming something other than a class: "specialist wizard" (wizard levels), an archetype
// ("flowing monk": that class's levels if the character has the archetype), or null if it can't be read ("arcane
// caster", "manifestation").
function classLevelsNamed(ctx, name) {
  const n = lower(name);
  if (n === 'specialist wizard') return levelsIn(ctx, 'wizard');
  for (const [cid, list] of Object.entries(ctx.archetypes || {})) {
    if ((list || []).some(a => lower(a.name) === n)) return levelsIn(ctx, cid);
  }
  return null;
}

// The data build leaves some prerequisites as text. These patterns are common enough to read here:
// "8th-level fighter", "Weapon Focus with selected weapon", "ability to cast 4th-level spells".
export function readTextPrereq(text) {
  const t = String(text ?? '').trim();
  let m = t.match(/^(\d+)(?:st|nd|rd|th)[- ]level ([a-z]+)$/i);
  if (m) return { type: 'class_level', class: m[2].toLowerCase(), value: Number(m[1]) };
  m = t.match(/^(.+?) with (?:the )?selected weapon$/i);
  if (m && !/proficiency/i.test(m[1])) return { type: 'feat', feat: m[1] };
  m = t.match(/^(?:the )?(?:ability to|able to) cast (\d)(?:st|nd|rd|th)[- ]level spells$/i);
  if (m) return { type: 'spell_level', value: Number(m[1]) };
  return null;
}

// Words in a class feature name, for matching "channel energy" to "Channel positive energy".
const words = s => lower(s).split(/[^a-z']+/).filter(Boolean);

// Singular and plural count the same ("rage power" is in the unchained barbarian's table as "Rage Powers").
const singular = w => w.endsWith('ies') ? `${w.slice(0, -3)}y` : /(xes|ches|shes|sses)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

// Every feature name in the data (class tables and feature lists, archetype features, class choice options) as sets of
// singular words, for classFeatureStatus to tell "not met" from "can't be checked".
export function featureIndex(classes = [], archetypes = [], talents = []) {
  const names = [...classes.flatMap(c => [...c.progression.flatMap(r => r.special || []), ...(c.features || []).map(f => f.name)]),
                 ...archetypes.flatMap(a => (a.features || []).map(f => f.name)), ...talents.map(t => t.name)];
  return [...new Set(names.map(lower))].map(n => new Set(words(n).map(singular)));
}

// Words that don't name the feature ("the grit", "spellcaster with familiar").
const FILLER = new Set(['the', 'a', 'an', 'with', 'spellcaster', 'class', 'feature', 'ability']);
// Bracketed picks the app records: "favored enemy (undead)" is met by choosing Undead as a favored enemy.
const CHOICE_RULES = [['favored enemy', 'favored enemy'], ['favored terrain', 'favored terrain'], ['weapon training', 'weapon training group']];
const QUALIFIER_ALIASES = { 'any plane': 'planes' };
const hasWords = (want, text) => { const have = words(text).map(singular); return want.every(w => have.includes(w)); };

// Whether one class (at its level in the context) has a feature: its level table (when the table names it, the level
// there decides), else its feature list (an entry with no level counts from 1st: spellbooks, a witch's familiar), and the
// features of its archetypes from the level each comes at.
function classHas(e, want, ctx) {
  if (!want.length) return false;
  const inTable = r => (r.special || []).some(s => hasWords(want, s));
  if (e.cls.progression.some(inTable)) {
    if (e.cls.progression.slice(0, e.level).some(inTable)) return true;
  } else if ((e.cls.features || []).some(f => (f.level ?? 1) <= e.level && hasWords(want, f.name))) return true;
  return (ctx.archetypes?.[e.cls.id] || []).some(a => (a.features || []).some(f => (f.level ?? 1) <= e.level && hasWords(want, f.name)));
}

// A class feature prerequisite as written ("rage power", "the grit", "rage or raging song", "favored enemy (undead)",
// "detect undead paladin"): 'met', 'unmet' or 'unknown' (no feature by that name anywhere in the data, so it can't be
// checked). "X or Y": either; a part can also be a feat ("amateur gunslinger"). A class named in it ("wizard school")
// must be the one with the rest. A bracketed pick is checked against the character's choices where the app records them.
export function classFeatureStatus(text, ctx) {
  const parts = String(text).split(/\s+or\s+/i).map(t => oneFeatureStatus(t.trim(), ctx));
  return parts.includes('met') ? 'met' : parts.includes('unknown') ? 'unknown' : 'unmet';
}

function oneFeatureStatus(text, ctx) {
  if (ctx.haveFeats?.has(lower(text))) return 'met';
  const q = text.match(/^(.*?)\s*\((.+)\)$/);
  const want = words(q ? q[1] : text).map(singular).filter(w => !FILLER.has(w));
  let has = ctx.counts.some(e => classHas(e, want, ctx)) || (ctx.talentNames || []).some(n => hasWords(want, n));
  if (!has) {
    // "wizard school", "detect undead paladin": the class named, with the rest of the words.
    has = ctx.counts.some(e => {
      const name = singular(words(e.cls.name)[0] || '');
      return want.includes(name) && classHas(e, want.filter(w => w !== name), ctx);
    });
  }
  if (!has) {
    const known = !ctx.featureWords || ctx.featureWords.some(set => want.every(w => set.has(w)));
    return known ? 'unmet' : 'unknown';
  }
  if (!q) return 'met';
  // The bracketed pick: checked where the app records it, otherwise left to the player.
  const rule = CHOICE_RULES.find(([k]) => hasWords(words(k).map(singular), q[1]));
  if (!rule) return 'unknown';
  const pick = words(QUALIFIER_ALIASES[lower(q[2])] || q[2]).map(singular);
  return (ctx.choices || []).some(c => lower(c.label).startsWith(rule[1]) && hasWords(pick, c.value)) ? 'met' : 'unmet';
}


// A skill as a prerequisite writes it, as the app names it: "SpellCraft" -> "Spellcraft", "Performance (sing)" ->
// "Perform (sing)".
function skillName(text) {
  const t = String(text).replace(/^Performance\b/i, 'Perform');
  const base = t.replace(/\s*\(.*\)$/, '');
  const known = SKILLS.find(s => lower(s.name) === lower(t)) || SKILLS.find(s => lower(s.name) === lower(base));
  return known ? (known.name === base || lower(known.name) === lower(base) ? known.name + t.slice(base.length) : known.name) : t;
}

// Checks one prerequisite. Returns { status: 'met' | 'unmet' | 'unknown', why }.
// `slotRule` changes some checks for class bonus feats (e.g. warpriest level counts as BAB).
export function checkPrereq(p, ctx, feat, slotRule = null) {
  // Levels that count as fighter levels: fighter, swashbuckler (for combat feats), and the class of a bonus
  // feat slot whose rule says so (warpriest). A slot rule's `classLevel` is that class's level.
  const slotClassLevel = slotRule?.classLevel ?? ctx.level;
  const fighterLevel = levelsIn(ctx, 'fighter') + (hasType(feat, 'Combat') ? levelsIn(ctx, 'swashbuckler') : 0)
    + (slotRule?.levelAsFighter ? slotClassLevel : 0);
  const bab = slotRule?.levelAsBab ? Math.max(ctx.bab, slotClassLevel) : ctx.bab;
  const result = (ok, why) => ({ status: ok ? 'met' : 'unmet', why });

  switch (p.type) {
    case 'ability':
      return result(ctx.scores[p.ability] >= p.value, `${p.ability.toUpperCase()} ${p.value}`);
    case 'bab':
      return result(bab >= p.value, `BAB +${p.value}`);
    case 'feat':
      return result(ctx.haveFeats.has(lower(p.feat)), p.feat);
    case 'race': {
      const r = ctx.race;
      return result(r.id === p.race || (r.subtypes || []).map(lower).includes(p.race), `Race: ${p.race}`);
    }
    case 'class_level': {
      let lv = p.class === 'fighter' ? Math.max(fighterLevel, levelsIn(ctx, 'fighter')) : levelsIn(ctx, p.class);
      // Not a class the character has: maybe a wizard specialist or an archetype; a name that isn't a class at all
      // ("arcane caster") can't be checked.
      if (!lv && ctx.classNames && !ctx.classNames.has(lower(p.class)) && !/^unchained \w+$/.test(lower(p.class))) {
        const named = classLevelsNamed(ctx, p.class);
        if (named === null && !['specialist wizard'].includes(lower(p.class))) {
          return { status: 'unknown', why: `${p.class} level ${p.value} (can\u2019t be checked: check it yourself)` };
        }
        lv = named || 0;
      }
      return result(lv >= p.value, `${p.class} level ${p.value}`);
    }
    case 'class_feature': {
      const status = classFeatureStatus(p.feature, ctx);
      return { status, why: `Class feature: ${p.feature}${status === 'unknown' ? ' (can\u2019t be checked: check it yourself)' : ''}` };
    }
    case 'caster_level':
      return result(ctx.casterLevel >= p.value, `Caster level ${p.value}`);
    case 'character_level':
      return result(ctx.level >= p.value, `Character level ${p.value}`);
    case 'spell_level':
      return result(ctx.maxSpellLevel >= p.value, `Can cast level ${p.value} spells`);
    case 'mythic_tier':
      return result(false, `Mythic tier ${p.value}`);
    case 'skill': {
      const why = `${p.skill} ${p.ranks} rank${p.ranks === 1 ? '' : 's'}`;
      if (!ctx.skillRanks) return { status: 'unknown', why: `${why} (skills not added yet)` };
      // "Acrobatics or Fly", "Spell Penetration or Bluff", "Any one item creation feat or Craft (alchemy)": either part,
      // and a part can be a feat. Odd spellings ("SpellCraft", "Performance (sing)") are read as the skill.
      const parts = p.skill.split(/\s+or\s+/i).map(s => s.trim());
      const ok = parts.some(part => ctx.haveFeats?.has(lower(part)) || ranksFor(skillName(part), ctx.skillRanks) >= p.ranks);
      if (!ok && parts.some(part => /item creation feat/i.test(part))) {
        return { status: 'unknown', why: `${why} (check the item creation feat yourself)` };
      }
      return result(ok, why);
    }
    case 'any_of': {
      const parts = p.options.map(o => checkPrereq(o, ctx, feat, slotRule));
      const status = parts.some(x => x.status === 'met') ? 'met'
        : parts.some(x => x.status === 'unknown') ? 'unknown' : 'unmet';
      return { status, why: p.text || parts.map(x => x.why).join(' or ') };
    }
    default: {
      const read = p.type === 'other' ? readTextPrereq(p.text) : null;
      if (read) return { ...checkPrereq(read, ctx, feat, slotRule), why: p.text };
      return { status: 'unknown', why: p.text || 'Not checked' };
    }
  }
}

// Checks all of a feat's prerequisites. The overall status is 'unmet' if any part is unmet,
// otherwise 'unknown' if any part can't be checked, otherwise 'met'.
export function checkFeat(feat, ctx, slot = null) {
  const rule = slot?.kind === 'class' ? BONUS_FEAT_RULES[slot.ruleId] : null;
  const slotRule = rule && { ...rule, classLevel: slot.clsId ? levelsIn(ctx, slot.clsId) : ctx.level };
  if (slotRule?.waivePrereqs) return { status: 'met', parts: [], waived: true };
  const parts = (feat.prerequisites || []).map(p => ({ ...checkPrereq(p, ctx, feat, slotRule), p }));
  const status = parts.some(x => x.status === 'unmet') ? 'unmet'
    : parts.some(x => x.status === 'unknown') ? 'unknown' : 'met';
  return { status, parts, waived: false };
}

// A feat can normally be taken once; its Special text says when it can be taken again.
export function repeatable(feat) {
  return /(more than once|multiple times)/i.test(feat.special || '');
}

// What the app does with a feat (Feats tab Details popup): the numbers it adds and where, or null when the feat isn't
// counted automatically. level: character level; choice: the weapon, skill or school it was taken for.
const ITEM_CREATION = ['Brew Potion', 'Craft Magic Arms and Armor', 'Craft Rod', 'Craft Staff', 'Craft Wand', 'Craft Wondrous Item',
  'Forge Ring', 'Scribe Scroll'];
export function featApplied(name, { level = 1, choice = '', skillFeats = {} } = {}) {
  const what = choice ? ` (${choice})` : '';
  const saves = { 'Great Fortitude': 'Fortitude', 'Lightning Reflexes': 'Reflex', 'Iron Will': 'Will' };
  if (name === 'Toughness') return `+${Math.max(3, level)} hit points (3, or 1 per character level from 4th): counted in your hit points.`;
  if (saves[name]) return `+2 on ${saves[name]} saves: counted (see Details beside the save).`;
  if (name === 'Dodge') return '+1 dodge bonus to AC: counted in AC, touch AC and CMD (not when flat-footed).';
  if (name === 'Improved Initiative') return '+4 on initiative: counted.';
  if (name === 'Weapon Focus' || name === 'Greater Weapon Focus') return `+1 on attack rolls with the chosen weapon${what}: counted on the Weapons tab.`;
  if (name === 'Weapon Specialization' || name === 'Greater Weapon Specialization') return `+2 damage with the chosen weapon${what}: counted on the Weapons tab.`;
  if (name === 'Improved Critical') return `Doubles the threat range of the chosen weapon${what}: counted on the Weapons tab.`;
  if (name === 'Weapon Finesse') return 'Light and finesse weapons use Dex instead of Str on attack rolls when it is higher: counted on the Weapons tab.';
  if (['Power Attack', 'Deadly Aim', 'Rapid Shot'].includes(name)) return 'Switch it on in Combat options on the Weapons tab; the attacks and damage change to match.';
  if (['Two-Weapon Fighting', 'Improved Two-Weapon Fighting', 'Greater Two-Weapon Fighting', 'Double Slice'].includes(name)) {
    return 'Counted when you choose a main and off-hand weapon in Combat options on the Weapons tab.';
  }
  if (name === 'Exotic Weapon Proficiency' || name === 'Martial Weapon Proficiency') return `Proficiency with the chosen weapon${what}: no -4 on the Weapons tab.`;
  if (/^(Light|Medium|Heavy) Armor Proficiency$|^Armor Proficiency|^Shield Proficiency$|^Tower Shield Proficiency$/.test(name)) return 'Proficiency: no armor check penalty on attack rolls (Armor tab).';
  if (name === 'Agile Maneuvers') return 'Dex instead of Str on CMB when it is higher: counted.';
  if (/^(Improved|Greater) (Bull Rush|Dirty Trick|Disarm|Drag|Grapple|Overrun|Reposition|Steal|Sunder|Trip)$/.test(name)) {
    return '+2 on that combat maneuver (and +2 CMD against it for Improved): shown on the Race card.';
  }
  if (name === 'Skill Focus') return `+3 on the chosen skill${what} (+6 with 10 or more ranks): counted on the Skills tab.`;
  if (skillFeats[name]) return `+2 on ${skillFeats[name].join(' and ')} (+4 with 10 or more ranks): counted on the Skills tab.`;
  if (name === 'Spell Focus' || name === 'Greater Spell Focus') return `+1 to the save DC of spells of the chosen school${what}: counted on the Spells tab.`;
  if (name === 'Spell Penetration' || name === 'Greater Spell Penetration') return '+2 on caster level checks against spell resistance: counted on the Spells tab.';
  if (name === 'Improved Channel') return '+2 to the DC of your channel energy: counted on the Race card.';
  if (name === "Hero's Fortune" || name === 'Blood of Heroes' || name === 'Luck of Heroes') return 'Changes your hero points (Action Points house rule): counted.';
  if (ITEM_CREATION.includes(name)) return 'Lets you make these items on the Craft tab.';
  if (name === 'Improved Unarmed Strike') return 'Proficiency with unarmed strikes.';
  return null;
}

// Numbers that simple feats add to the character sheet.
export function featEffects(featNames, level) {
  const has = new Set(featNames);
  return {
    hp: has.has('Toughness') ? Math.max(3, level) : 0,
    fort: has.has('Great Fortitude') ? 2 : 0,
    ref: has.has('Lightning Reflexes') ? 2 : 0,
    will: has.has('Iron Will') ? 2 : 0,
    dodgeAc: has.has('Dodge') ? 1 : 0,
  };
}
