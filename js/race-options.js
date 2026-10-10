// Alternate racial traits and favored class options (Advanced Race Guide and later books). No page code here, so it
// can be tested on its own.
//
// An alternate trait says which standard traits it replaces ("This racial trait replaces hatred."). Taking it
// removes those traits and adds the alternate in their place, so everything that reads a race's traits (skill
// bonuses, AC, bonus feat, Skilled, weapon familiarity, speed) sees the changed race. Two alternates that replace
// the same trait can't both be taken.

// "Spell-Like Abilities (Sp)" -> "spell-like ability", "+2 Natural Armor" -> "natural armor": lower case, no "(Ex)"
// tags or leading number, singular words.
function stem(s) {
  return (String(s).replace(/’/g, "'").replace(/\([^)]*\)/g, '').replace(/^\s*[+-]\d+\s+/, '').toLowerCase().match(/[a-z0-9+'-]+/g) || [])
    .map(w => w.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})s$/, '')).join(' ');
}

// The part of an alternate's text naming what it replaces ("replaces defensive training and hatred", "lose the fast
// movement racial trait"). Traits from Archives of Nethys name it in `replaces` ("Keen Senses, Multitalented"), which
// counts instead: their text may name what it replaces for several races.
function replaceClause(alt) {
  if (alt.replaces) return alt.replaces.replace(/,/g, ' and ');
  return [...alt.text.matchAll(/(?:replaces?|in place of|lose|lack)\s+([^.]*)/gi)].map(m => m[1]).join(' ');
}

const ABILITY_WORDS = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

// Names of the race's standard traits that an alternate replaces (may be empty when the text names something else).
export function replacedTraits(race, alt) {
  const clause = ` ${stem(replaceClause(alt))} `;
  // A race's type, size and languages aren't replaced ("lashunta magic" doesn't replace the Lashunta type).
  const found = (race.traits || []).filter(t => !['type', 'size', 'languages'].includes(t.kind)
    && clause.includes(` ${stem(t.name)} `)).map(t => t.name);
  // Human Dual Talent replaces "the +2 bonus to any one ability score"; "Replaces Ability Score Modifiers" the race's
  // ability score trait.
  const flexible = (race.traits || []).find(t => t.kind === 'ability_scores' && race.flexible_ability_bonus);
  if (flexible && /\+2 bonus to (?:any )?one ability score/i.test(alt.text) && !found.includes(flexible.name)) found.push(flexible.name);
  const scores = (race.traits || []).find(t => t.kind === 'ability_scores');
  if (scores && /ability score modifier/i.test(alt.replaces || '') && !found.includes(scores.name)) found.push(scores.name);
  return found;
}

// Chosen alternates that are real for this race (unknown names are dropped).
export function chosenAlternates(race, names = []) {
  const alts = race.alternate_traits || [];
  return names.map(n => alts.find(a => a.name === n)).filter(Boolean);
}

// Why an alternate can't be taken with the ones already chosen ('' if it can): it replaces a trait another chosen
// alternate already replaces.
export function alternateConflict(race, alt, names = []) {
  const mine = replacedTraits(race, alt);
  for (const other of chosenAlternates(race, names)) {
    if (other.name === alt.name) continue;
    const shared = replacedTraits(race, other).filter(t => mine.includes(t));
    if (shared.length) return `${other.name} already replaces ${shared.join(', ')}`;
  }
  return '';
}

// A copy of the race with the chosen alternates in place of the traits they replace. Alternates that set a new base
// speed ("base speed of 30 feet", "land speed of 15 feet") change `base_speed`; Dual Talent ("pick two ability scores")
// sets `dual_talent`.
export function raceWithAlternates(race, names = []) {
  const alts = chosenAlternates(race, names);
  if (!alts.length) return race;
  const gone = new Set(alts.flatMap(a => replacedTraits(race, a)));
  const traits = [];
  for (const t of race.traits || []) {
    if (!gone.has(t.name)) traits.push(t);
  }
  // Alternates go just before the languages, like the standard traits they replace.
  const langAt = traits.findIndex(t => t.kind === 'languages');
  traits.splice(langAt < 0 ? traits.length : langAt, 0, ...alts.map(a => ({ name: a.name, text: a.text, alternate: true })));
  const out = { ...race, traits, alternates: alts.map(a => a.name) };
  // Senses: a replaced darkvision or low-light vision trait takes its sense away; an alternate that gives darkvision
  // ("darkvision 60 feet", "gain darkvision to a distance of 60 feet") adds it.
  const lost = [...gone].map(stem);
  let senses = (race.senses || []).filter(s => !lost.some(g => stem(s).startsWith(g)));
  for (const a of alts) {
    const dark = a.text.match(/darkvision (?:to a (?:distance|range) of |out to |of )?(\d+) (?:feet|ft)/i);
    if (dark && !/lose[^.]*darkvision|darkvision[^.]*(?:is reduced|replaces)/i.test(a.text)) {
      senses = [...senses.filter(s => !/^darkvision/i.test(s)), `darkvision ${dark[1]} ft.`];
    }
  }
  out.senses = senses;
  for (const a of alts) {
    const speed = a.text.match(/(?:base|land) speed (?:of|is (?:reduced|increased) to) (\d+) feet/i);
    if (speed) out.base_speed = Number(speed[1]);
    if (/pick two ability scores and gain a \+2 racial bonus/i.test(a.text)) out.dual_talent = true;
    // "Replace the leshy's +2 racial bonus to Constitution with a +2 racial bonus to Dexterity."
    const swap = a.text.match(/Replace [^.]*?([+-]\d+) racial (?:bonus|penalty) to (\w+) with an? ([+-]\d+) racial (?:bonus|penalty) to (\w+)/i);
    const ab = w => ABILITY_WORDS[w.toLowerCase()];
    if (swap && ab(swap[2]) && ab(swap[4])) {
      const mods = { ...out.ability_modifiers };
      mods[ab(swap[2])] = (mods[ab(swap[2])] || 0) - Number(swap[1]);
      mods[ab(swap[4])] = (mods[ab(swap[4])] || 0) + Number(swap[3]);
      out.ability_modifiers = Object.fromEntries(Object.entries(mods).filter(([, v]) => v));
    }
  }
  return out;
}

// Favored class options: the race's option for a class. Unchained classes use their original class's options.
export function favoredOption(race, cls) {
  if (!race || !cls) return null;
  const name = cls.name.replace(/\s*\(Unchained\)$/i, '').toLowerCase();
  return (race.favored_class_options || []).find(o => o.class.toLowerCase() === name) || null;
}

// What `count` levels of an option add up to, from the first number in its first sentence ("Add +1/4 to ...",
// "Gain 1/6 of a new rage power", "... by +1%"): "+1 1/4", "+5%". '' when there's no number.
export function favoredOptionTotal(option, count) {
  const m = option.text.split(/\.\s/)[0].match(/\+?(\d+)(?:\/(\d+))?(%)?/);
  if (!m || !count) return '';
  const num = Number(m[1]) * count, den = Number(m[2] || 1);
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const whole = Math.floor(num / den), rest = num % den, g = gcd(rest, den);
  const parts = [whole ? String(whole) : '', rest ? `${rest / g}/${den / g}` : ''].filter(Boolean);
  return `+${parts.join(' ') || '0'}${m[3] || ''}`;
}

// The favored class choice at each character level: 'hp', 'skill' or 'option' (the race's option for that class),
// or null for a level not in the favored class. `picks` is what the player chose per level (missing = 'hp');
// 'option' falls back to 'hp' when the race has no option for the class.
export function favoredChoices(race, classLevels, favoredClassId, picks = []) {
  return classLevels.map((c, i) => {
    if (!c || c.id !== favoredClassId) return null;
    const p = picks[i];
    if (p === 'skill') return 'skill';
    if (p === 'option' && favoredOption(race, c)) return 'option';
    return 'hp';
  });
}
