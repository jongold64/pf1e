// Feat rules: where feat slots come from, which feats a slot accepts, and prerequisite checks.
// No page code here, so these functions can be tested on their own.
import { spellsPerDay, classCounts } from './rules.js';
import { ranksFor } from './skills.js';

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
  teamwork: { note: 'Must be a teamwork feat.', allowed: f => hasType(f, 'Teamwork') },
  rangerStyle: { note: 'Must be from your combat style\'s list (not checked). Prerequisites are waived.',
                 allowed: null, waivePrereqs: true },
  bloodline: { note: 'Must be from your bloodline\'s list (not checked).', allowed: null },
};

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
export function featSlots({ race, cls, level, classLevels = null }) {
  const levels = classLevels || Array.from({ length: level }, () => cls);
  const slots = [];
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
  return !allowed || allowed(feat, slot.level);
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
  const allArmor = /all armor/.test(text);
  if (allArmor || /light armor/.test(text)) out.push('Armor Proficiency, Light');
  if (allArmor || /medium armor/.test(text)) out.push('Armor Proficiency, Medium');
  if (allArmor || /heavy armor/.test(text)) out.push('Armor Proficiency, Heavy');
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
export function featContext({ race, cls, level, counts = null, casting = null, scores, bab, haveFeats, skillRanks = null }) {
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
  };
}

// Levels a character has in a class, by id or name ("fighter", "Fighter").
export function levelsIn(ctx, clsIdOrName) {
  const want = lower(clsIdOrName);
  return ctx.counts.find(e => e.cls.id === want || lower(e.cls.name) === want)?.level || 0;
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

function classFeatureLevel(cls, feature) {
  const want = words(feature);
  for (const row of cls.progression) {
    for (const special of row.special || []) {
      const have = words(special);
      if (want.every(w => have.includes(w))) return row.level;
    }
  }
  return null;
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
      const lv = p.class === 'fighter' ? Math.max(fighterLevel, levelsIn(ctx, 'fighter')) : levelsIn(ctx, p.class);
      return result(lv >= p.value, `${p.class} level ${p.value}`);
    }
    case 'class_feature': {
      const has = ctx.counts.some(e => {
        const lv = classFeatureLevel(e.cls, p.feature);
        return lv !== null && lv <= e.level;
      });
      return result(has, `Class feature: ${p.feature}`);
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
      return result(ranksFor(p.skill, ctx.skillRanks) >= p.ranks, why);
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
