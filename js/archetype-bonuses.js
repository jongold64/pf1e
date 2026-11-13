// Steady bonuses archetype features give, read from their rules text: "gains a +2 insight bonus on Will saves", "a +1
// dodge bonus to AC; this bonus increases by 1 at 7th level and every 4 levels thereafter", "a bonus on Survival checks
// equal to 1/2 his ranger level". Only ones that always apply: a sentence that limits the bonus (against, when, while,
// if, with a weapon, for allies or a companion...) is left out, as is one with a target this app can't count.
// No page code here, so it can be tested on its own.
import { amountOf, powerUses } from './daily.js';
import { SKILL_TARGET_NAMES } from './effects.js';

const TYPES = 'competence|insight|luck|morale|sacred|profane|dodge|natural armor|deflection|enhancement|racial|circumstance|trait|resistance|armor|shield|untyped';
// Words that make a bonus situational, anywhere in its sentence.
const LIMITED = /\b(?:as long as|choos\w*|terrain|underwater|in (?:cold|hot|icy|warm|dim|bright|darkness|water|urban|forests?|deserts?|jungles?|mountains?|plains|swamps?|caves?)|with (?:that|those|these)|against|when(?:ever)?|while|if|unless|during|versus|vs\.|until|after|before|whose|who|which|that (?:is|are|has|have)|made (?:to|as part|with|against)|to (?:resist|avoid|confirm|notice|identify|recall|escape|grapple|track|find|treat|stabilize|determine|locate)|on checks? (?:to|made|against)|in (?:a|an|the|his|her|their|its) |with (?:a|an|the|his|her|their|its|any|one|two|weapons?|melee|ranged|spells?)|for (?:the|a|an|purposes)|per |within|at night|by |using|from |of (?:a|an|the) |each|any (?:creature|ally|one)|allies|ally|companion|eidolon|familiar|mount|phantom|minions?|summoned|undead|creatures?|targets?|foes?|opponents?|enemies|choose|chosen|selected|favored|instead|in place of|replac|until|temporar|rounds?\b|minutes?\b|hours?\b|day\b|swift|standard|move action|immediate|free action|spend|expend|uses? (?:of|this)|duration)\b/i;
const SKILL_LOWER = new Map(SKILL_TARGET_NAMES.map(s => [s.toLowerCase(), s]));

// One target phrase ("Will saves", "Perception checks", "AC", "initiative checks") -> an effect target, or null.
function targetOf(phrase) {
  const p = phrase.trim().replace(/^(?:all |his |her |their |its |the )/i, '').replace(/\s+(?:checks?|rolls?|skill checks?)$/i, '').trim();
  const low = p.toLowerCase();
  if (/^will(?: sav(?:e|es|ing throws?))?$/.test(low)) return 'will';
  if (/^fortitude(?: sav(?:e|es|ing throws?))?$/.test(low)) return 'fort';
  if (/^reflex(?: sav(?:e|es|ing throws?))?$/.test(low)) return 'ref';
  if (/^(?:saving throws?|saves)$/.test(low)) return 'saves';
  if (/^initiative$/.test(low)) return 'init';
  if (/^(?:ac|armor class)$/.test(low)) return 'ac';
  if (/^attack$/.test(low)) return 'attack';
  if (/^(?:weapon )?damage$/.test(low)) return 'damage';
  if (/^(?:cmb|combat maneuver)$/.test(low)) return 'cmb';
  if (/^(?:cmd|combat maneuver defense)$/.test(low)) return 'cmd';
  if (/^skill$/.test(low)) return 'skills';
  if (SKILL_LOWER.has(low)) return `skill:${SKILL_LOWER.get(low)}`;
  const k = low.match(/^knowledge \(([a-z]+)\)$/);
  if (k && SKILL_LOWER.has(`knowledge (${k[1]})`)) return `skill:Knowledge (${k[1]})`;
  return null;
}
// "Will saves", "Bluff, Diplomacy, and Intimidate checks", "Perception and Stealth checks": the targets, or null when one
// of them isn't something the app counts.
function targetsOf(list) {
  const suffix = list.match(/\s+(checks?|rolls?|saves|saving throws)$/i)?.[1] || '';
  const parts = list.replace(/\s+(?:checks?|rolls?)$/i, '').split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/).filter(Boolean);
  const out = parts.map(x => targetOf(/sav/i.test(suffix) && !/sav/i.test(x) ? `${x} saves` : x));
  return out.length && out.every(Boolean) ? [...new Set(out)] : null;
}

// How the bonus grows, from the text after it: "This bonus increases by 1 at 7th level and every 4 levels thereafter",
// "increases to +2 at 8th level and +3 at 16th level", "increases by +1 for every 4 levels beyond 3rd".
function grown(rest, base, level, start) {
  const inc = rest.match(/\bincreases? by \+?(\d+) (?:at (\d+)(?:st|nd|rd|th) level and )?(?:for )?(?:every|each) (\w+) (?:[a-z]+ )?levels?(?: (?:thereafter|after that|beyond (\d+)(?:st|nd|rd|th)?|after (\d+)(?:st|nd|rd|th)?))?(?:[^.]*?maximum of \+(\d+))?/i);
  const step = inc && ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[inc[3].toLowerCase()] || Number(inc[3]));
  if (inc && step) {
    const from = inc[2] ? Number(inc[2]) : (Number(inc[4] || inc[5]) || start) + step;
    const n = base + (level >= from ? Number(inc[1]) * (1 + Math.floor((level - from) / step)) : 0);
    return inc[6] ? Math.min(Number(inc[6]), n) : n;
  }
  // "At 4th level, and every 4 bard levels thereafter, this bonus increases by 1, to a maximum of +6"
  const at = rest.match(/\bAt (\d+)(?:st|nd|rd|th) level,? and (?:every|each) (\w+) (?:[a-z]+ )?levels? thereafter, (?:this|the|these) bonus(?:es)? increases? by \+?(\d+)(?:[^.]*?maximum of \+(\d+))?/i);
  const atStep = at && ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[at[2].toLowerCase()] || Number(at[2]));
  if (at && atStep) {
    const n = base + (level >= Number(at[1]) ? Number(at[3]) * (1 + Math.floor((level - Number(at[1])) / atStep)) : 0);
    return at[4] ? Math.min(Number(at[4]), n) : n;
  }
  // "At 10th, 13th, 16th, and 19th levels, this bonus increases by 1."
  const list = rest.match(/\bAt ((?:\d+(?:st|nd|rd|th),? (?:and )?)+)levels?, (?:this|the|these) bonus(?:es)? increases? by \+?(\d+)/i);
  if (list) return base + Number(list[2]) * [...list[1].matchAll(/(\d+)/g)].filter(m => level >= Number(m[1])).length;
  const steps = [...rest.matchAll(/(?:increases? to )?\+(\d+) at (\d+)(?:st|nd|rd|th) level/gi)].filter(m => level >= Number(m[2]));
  return steps.length ? Math.max(base, ...steps.map(m => Number(m[1]))) : base;
}

// The steady bonuses one rules text gives at a class level: [{ target, type, value }] ([] when none).
// name: the archetype's name; the bonus must be the character's ("an aerochemist gains", "she gains"), not a
// companion's, a construct's or an item's. A feature that offers a choice (selects, chooses, one of the following) is
// left out: which bonus applies depends on the pick.
export function steadyBonuses(text, level, mod = {}, name = '') {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (/\b(?:selects?|chooses?|choice of|one of the following|following (?:abilities|benefits|powers|deeds))\b/i.test(t)) return [];
  // An ability used a number of times, rounds or minutes a day gives its bonus only while in use.
  if (powerUses(t, level, mod)) return [];
  const last = name ? String(name).toLowerCase().split(/\s+/).pop().replace(/[^a-z-]/g, '') : '';
  // "an artificer gains" is the character; "an artificer's golem arm gains" isn't.
  const own = new RegExp(`\\b(?:he|she|you|they${last ? `|${last}` : ''})\\b(?!'s|’s)`, 'i');
  const sentences = t.split(/(?<=\.)\s+(?=[A-Z])/);
  const lead = Number(t.match(/^\s*(?:At|Starting at|Beginning at) (\d+)(?:st|nd|rd|th) level/i)?.[1] || 1);
  const out = [];
  sentences.forEach((s, i) => {
    const rest = sentences.slice(i + 1).join(' ');
    // "gains a +2 insight bonus on Will saves" / "a +1 dodge bonus to AC"
    for (const m of s.matchAll(new RegExp(`\\b(?:gains?|receives?|has|gets?) an? \\+(\\d+) (?:(${TYPES}) )?bonus (?:on|to) ([A-Za-z (),]+?)(?=[.;]|, (?:but|and (?:a|an|the|he|she|it|gains?))|$)`, 'gi'))) {
      if (LIMITED.test(s.replace(m[0], '')) || !own.test(s.slice(0, m.index))) continue;
      const targets = targetsOf(m[3]);
      if (!targets) continue;
      const value = grown(rest, Number(m[1]), level, lead);
      for (const target of targets) out.push({ target, type: (m[2] || 'untyped').toLowerCase(), value });
    }
    // "gains a competence bonus on Survival checks equal to 1/2 his ranger level"
    for (const m of s.matchAll(new RegExp(`\\b(?:gains?|receives?|adds?) an? (?:(${TYPES}) )?bonus (?:on|to) ([A-Za-z (),]+?) equal to ([^.;]+)`, 'gi'))) {
      // The words after the amount ("... equal to his Wisdom modifier against creatures that ...") limit it too.
      const after = m[3].replace(/^.*?\b(?:level|modifier|bonus)\b(?:\s*\(minimum[^)]*\))?/i, '');
      if (LIMITED.test(`${s.replace(m[0], '')} ${after}`) || !own.test(s.slice(0, m.index))) continue;
      const targets = targetsOf(m[2]);
      const value = amountOf(m[3], level, mod);
      if (!targets || value <= 0) continue;
      for (const target of targets) out.push({ target, type: (m[1] || 'untyped').toLowerCase(), value });
    }
  });
  return out;
}

// The effects of the chosen archetypes' features the character has reached (counts: classes with their archetypes
// applied), in the custom-effect shape: [{ name, target, type, value, on, classFeature }].
export function archetypeBonusEffects(counts, mod = {}) {
  const out = [];
  for (const e of counts) {
    for (const r of (e.cls.progression || []).slice(0, e.level)) {
      for (const f of r.archetype_features || []) {
        // Deeds need grit or luck to work; a wildblooded sorcerer's mutations are one per bloodline.
        if (/deeds?\b/i.test(f.name) || /wildblooded/i.test(f.archetype)) continue;
        for (const b of steadyBonuses(f.text, e.level, mod, f.archetype)) {
          out.push({ name: `${String(f.name).replace(/\s*\((?:Ex|Su|Sp)[^)]*\)\s*$/i, '')} (${f.archetype})`, ...b, on: true, classFeature: true });
        }
      }
    }
  }
  return out;
}
