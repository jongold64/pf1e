// Class choices made at set levels (rage powers, rogue talents, hexes, discoveries, magus arcana, revelations, mercies,
// ki powers...): which classes get them, at which class levels, and which options fit a slot (data/talents.json, or a
// short fixed list such as the bard's Perform types). No page code here, so it can be tested on its own.
//
// Each rule: { key, label, plural, kinds (data kinds allowed), levels (class levels with a pick),
// later: [{ from, kinds }] (more kinds allowed from a class level: advanced rogue talents at 10th...),
// needs: 'mystery' (oracle revelations follow the mystery), browse (a Browse all list under the picks), classOnly (only options listed for this class: witch and
// shaman hexes share names but not lists), choices: { option: what it does } (a fixed list instead of data) }.
// The levels follow the Core Rulebook and later books' class tables.

const even = (from = 2, to = 20) => Array.from({ length: (to - from) / 2 + 1 }, (_, i) => from + i * 2);
const odd = (from = 1, to = 19) => even(from, to);
const RAGE = { key: 'rage-power', label: 'Rage power', kinds: ['rage-power'], levels: even() };
const ROGUE = { key: 'rogue-talent', label: 'Rogue talent', kinds: ['rogue-talent'], levels: even(),
                later: [{ from: 10, kinds: ['advanced-rogue-talent'] }] };

// Bard's versatile performance (Core Rulebook): each Perform type and the two skills it can stand in for.
export const VERSATILE_PERFORMANCE = {
  Act: ['Bluff', 'Disguise'], Comedy: ['Bluff', 'Intimidate'], Dance: ['Acrobatics', 'Fly'], Keyboard: ['Diplomacy', 'Intimidate'],
  Oratory: ['Diplomacy', 'Sense Motive'], Percussion: ['Handle Animal', 'Intimidate'], Sing: ['Bluff', 'Sense Motive'],
  String: ['Bluff', 'Diplomacy'], Wind: ['Diplomacy', 'Handle Animal'],
};
const performChoices = types => Object.fromEntries(types.map(p =>
  [p, `use your Perform (${p.toLowerCase()}) bonus for ${VERSATILE_PERFORMANCE[p].join(' and ')} checks`]));

// Ranger favored enemies and terrains (Core Rulebook tables).
const FAVORED_ENEMIES = ['Aberration', 'Animal', 'Construct', 'Dragon', 'Fey', 'Humanoid (aquatic)', 'Humanoid (dwarf)',
  'Humanoid (elf)', 'Humanoid (giant)', 'Humanoid (goblinoid)', 'Humanoid (gnoll)', 'Humanoid (gnome)', 'Humanoid (halfling)',
  'Humanoid (human)', 'Humanoid (orc)', 'Humanoid (reptilian)', 'Humanoid (other subtype)', 'Magical beast', 'Monstrous humanoid',
  'Ooze', 'Outsider (air)', 'Outsider (chaotic)', 'Outsider (earth)', 'Outsider (evil)', 'Outsider (fire)', 'Outsider (good)',
  'Outsider (lawful)', 'Outsider (native)', 'Outsider (water)', 'Plant', 'Undead', 'Vermin'];
const FAVORED_TERRAINS = { Cold: 'ice, glaciers, snow and tundra', Desert: 'sand and wastelands', Forest: 'coniferous and deciduous',
  Jungle: 'jungle', Mountain: 'including hills', Plains: 'plains', Planes: 'one plane other than the Material Plane',
  Swamp: 'swamp', Underground: 'caves and dungeons', Urban: 'buildings, streets and sewers', Water: 'above and below the surface' };
// Fighter weapon groups (Core Rulebook, Advanced Player's Guide, Ultimate Combat).
const WEAPON_GROUPS = ['Axes', 'Blades, heavy', 'Blades, light', 'Bows', 'Close', 'Crossbows', 'Double', 'Firearms', 'Flails',
  'Hammers', 'Monk', 'Natural', 'Polearms', 'Siege engines', 'Spears', 'Thrown', 'Tribal'];
// Unchained rogue's edge: the skills with skill unlocks (Pathfinder Unchained).
const SKILL_UNLOCKS = ['Acrobatics', 'Bluff', 'Climb', 'Diplomacy', 'Disable Device', 'Disguise', 'Escape Artist', 'Heal',
  'Intimidate', 'Linguistics', 'Perception', 'Sense Motive', 'Sleight of Hand', 'Stealth', 'Survival', 'Swim', 'Use Magic Device'];
// Rage prophet spells from the spirit guide (Advanced Player's Guide), with the oracle spell level each counts as.
const RAGE_PROPHET_SPELLS = { 'Arcane eye': '4th', Augury: '2nd', Divination: '4th', Dream: '5th', 'Find the path': '6th',
  'Helping hand': '3rd', 'See invisibility': '2nd', 'Shadow walk': '6th', 'Speak with dead': '3rd', 'Spectral hand': '2nd',
  'Spiritual weapon': '2nd', 'Unseen servant': '1st', Vision: '7th', 'Whispering wind': '2nd' };
const listOf = (names, what) => Object.fromEntries(names.map(n => [n, what(n)]));

export const TALENT_RULES = {
  barbarian: [RAGE],
  'barbarian-unchained': [RAGE],
  skald: [{ ...RAGE, levels: [3, 6, 9, 12, 15, 18] },
          { key: 'versatile-performance', label: 'Versatile performance', kinds: [], levels: [2, 7, 12, 17],
            choices: performChoices(['Oratory', 'Percussion', 'Sing', 'String']) }],
  rogue: [ROGUE],
  'rogue-unchained': [ROGUE, { key: 'rogues-edge', label: "Rogue's edge", plural: "Rogue's edge skills", kinds: [], levels: [5, 10, 15, 20],
                               choices: listOf(SKILL_UNLOCKS, s => `skill unlocks for ${s} (at 5, 10, 15 and 20 ranks)`) }],
  ninja: [{ key: 'ninja-trick', label: 'Ninja trick', kinds: ['ninja-trick', 'rogue-talent'], levels: even(),
            later: [{ from: 10, kinds: ['master-ninja-trick', 'advanced-rogue-talent'] }] }],
  slayer: [{ key: 'slayer-talent', label: 'Slayer talent', kinds: ['slayer-talent', 'rogue-talent'], levels: even(),
             later: [{ from: 10, kinds: ['advanced-slayer-talent', 'advanced-rogue-talent'] }] }],
  shadowdancer: [{ key: 'rogue-talent', label: 'Rogue talent', kinds: ['rogue-talent'], levels: [3, 6, 9] }],
  witch: [{ key: 'hex', label: 'Hex', plural: 'Hexes', kinds: ['hex'], levels: [1, ...even()], classOnly: true,
            later: [{ from: 10, kinds: ['major-hex'] }, { from: 18, kinds: ['grand-hex'] }] }],
  shaman: [{ key: 'hex', label: 'Hex', plural: 'Hexes', kinds: ['hex', 'spirit-hex'], levels: [2, 4, 8, 10, 12, 16, 18, 20], classOnly: true }],
  alchemist: [{ key: 'discovery', label: 'Discovery', plural: 'Discoveries', kinds: ['discovery'], levels: even() }],
  investigator: [{ key: 'investigator-talent', label: 'Investigator talent', kinds: ['investigator-talent'], levels: odd(3) }],
  magus: [{ key: 'magus-arcana', label: 'Magus arcana', plural: 'Magus arcana', kinds: ['magus-arcana'], levels: [3, 6, 9, 12, 15, 18] }],
  oracle: [{ key: 'curse', label: "Oracle's curse", plural: "Oracle's curse", kinds: ['oracle-curse'], levels: [1], browse: true },
           { key: 'revelation', label: 'Revelation', kinds: ['revelation'], levels: [1, 3, 7, 11, 15, 19], needs: 'mystery', browse: true }],
  arcanist: [{ key: 'arcanist-exploit', label: 'Arcanist exploit', kinds: ['arcanist-exploit'], levels: odd(),
               later: [{ from: 11, kinds: ['greater-arcanist-exploit'] }] }],
  vigilante: [{ key: 'vigilante-talent', label: 'Vigilante talent', kinds: ['vigilante-talent'], levels: even() },
              { key: 'social-talent', label: 'Social talent', kinds: ['social-talent'], levels: odd() }],
  kineticist: [{ key: 'infusion', label: 'Infusion', kinds: ['infusion'], levels: [1, 3, 5, 9, 11, 13, 17, 19] },
               { key: 'wild-talent', label: 'Utility wild talent', kinds: ['wild-talent'], levels: even() }],
  bard: [{ key: 'versatile-performance', label: 'Versatile performance', kinds: [], levels: [2, 6, 10, 14, 18],
           choices: performChoices(Object.keys(VERSATILE_PERFORMANCE)) }],
  paladin: [{ key: 'mercy', label: 'Mercy', plural: 'Mercies', kinds: ['mercy'], levels: [3, 6, 9, 12, 15, 18] }],
  antipaladin: [{ key: 'cruelty', label: 'Cruelty', plural: 'Cruelties', kinds: ['cruelty'], levels: [3, 6, 9, 12, 15, 18] }],
  'monk-unchained': [{ key: 'ki-power', label: 'Ki power', kinds: ['ki-power'], levels: even(4) },
                     { key: 'style-strike', label: 'Style strike', kinds: ['style-strike'], levels: [5, 9, 13, 17] }],
  psychic: [{ key: 'phrenic-amplification', label: 'Phrenic amplification', kinds: ['phrenic-amplification'], levels: [1, 3, 7, 11, 15, 19],
              later: [{ from: 11, kinds: ['major-phrenic-amplification'] }] }],
  mesmerist: [{ key: 'mesmerist-trick', label: 'Mesmerist trick', kinds: ['mesmerist-trick'], levels: [1, ...even()],
                later: [{ from: 12, kinds: ['masterful-trick'] }] },
              { key: 'bold-stare', label: 'Bold stare', kinds: ['bold-stare'], levels: [3, 7, 11, 15, 19] }],
  occultist: [{ key: 'focus-power', label: 'Focus power', kinds: ['focus-power'], levels: odd() }],
  shifter: [{ key: 'aspect', label: 'Shifter aspect', kinds: ['shifter-aspect'], levels: [1, 5, 10, 15] }],
  ranger: [{ key: 'favored-enemy', label: 'Favored enemy', plural: 'Favored enemies', kinds: [], levels: [1, 5, 10, 15, 20],
             choices: listOf(FAVORED_ENEMIES, () => '+2 on Bluff, Knowledge, Perception, Sense Motive and Survival checks against them, and on weapon attack and damage rolls (raise one by +2 at each new favored enemy)') },
           { key: 'favored-terrain', label: 'Favored terrain', kinds: [], levels: [3, 8, 13, 18],
             choices: listOf(Object.keys(FAVORED_TERRAINS), t => `${FAVORED_TERRAINS[t]}: +2 on initiative, Knowledge (geography), Perception, Stealth and Survival checks there`) }],
  fighter: [{ key: 'weapon-training', label: 'Weapon training group', kinds: [], levels: [5, 9, 13, 17],
              choices: listOf(WEAPON_GROUPS, () => '+1 on attack and damage rolls with these weapons, rising by 1 for each later weapon training') }],
  'stalwart-defender': [{ key: 'defensive-power', label: 'Defensive power', kinds: ['defensive-power'], levels: even(2, 10) }],
  'battle-herald': [{ key: 'inspiring-command', label: 'Inspiring command', kinds: ['inspiring-command'], levels: odd(1, 9) }],
  loremaster: [{ key: 'secret', label: 'Loremaster secret', kinds: ['loremaster-secret'], levels: odd(1, 9) }],
  'rage-prophet': [{ key: 'spirit-guide-spell', label: 'Spirit guide spell', kinds: [], levels: even(2, 10),
                     choices: listOf(Object.keys(RAGE_PROPHET_SPELLS), s => `an extra oracle spell known (${RAGE_PROPHET_SPELLS[s]} level)`) }],
};

// Feats that give one more pick of a class's choices each time they're taken: feat name -> rule keys it adds to (the
// first class the character has with one of them gets it).
export const EXTRA_FEATS = {
  'Extra Rage Power': ['rage-power'], 'Extra Rogue Talent': ['rogue-talent', 'ninja-trick'], 'Extra Ninja Trick': ['ninja-trick'],
  'Extra Slayer Talent': ['slayer-talent'], 'Extra Investigator Talent': ['investigator-talent'], 'Extra Hex': ['hex'],
  'Extra Discovery': ['discovery'], 'Extra Arcana': ['magus-arcana'], 'Extra Revelation': ['revelation'],
  'Extra Arcanist Exploit': ['arcanist-exploit'], 'Extra Mercy': ['mercy'], 'Extra Amplification': ['phrenic-amplification'],
  'Extra Wild Talent': ['wild-talent'], 'Extra Focus Power': ['focus-power'],
};

// The extra pick slots feats give: feats is [{ slotId (the feat slot), name, charLevel }] and classLevels the class id at
// each character level. Each slot: { id: "class|rule|feat-<feat slot>", rule, classId, classLevel (the class's level
// when the feat was taken, for which options fit), fromFeat, charLevel }.
export function featTalentSlots(feats, classLevels) {
  const out = [];
  for (const f of feats) {
    const keys = EXTRA_FEATS[f.name];
    if (!keys) continue;
    const owner = [...new Set(classLevels)].map(cid => [cid, (TALENT_RULES[cid] || []).find(r => keys.includes(r.key))]).find(([, r]) => r);
    if (!owner) continue;
    const [classId, rule] = owner;
    const classLevel = Math.max(1, classLevels.slice(0, f.charLevel).filter(c => c === classId).length);
    out.push({ id: `${classId}|${rule.key}|feat-${f.slotId}`, rule, classId, classLevel, fromFeat: f.name, charLevel: f.charLevel });
  }
  return out;
}

// A rule's heading: "Rage powers", "Mercies".
export const pluralOf = rule => rule.plural || `${rule.label}s`;

// The rule a slot id belongs to ("ranger|favored-enemy|5").
export function ruleOf(slotId) {
  const [cid, key] = String(slotId).split('|');
  return (TALENT_RULES[cid] || []).find(r => r.key === key) || null;
}

// The pick slots a class has up to a class level: [{ id, rule, classId, classLevel }] (ids like "barbarian|rage-power|4").
export function talentSlots(classId, classLevel) {
  return (TALENT_RULES[classId] || []).flatMap(rule => rule.levels.filter(l => l <= classLevel)
    .map(l => ({ id: `${classId}|${rule.key}|${l}`, rule, classId, classLevel: l })));
}

// The data kinds allowed in a slot (more open up at later levels).
export function slotKinds(slot) {
  return [...slot.rule.kinds, ...(slot.rule.later || []).filter(x => slot.classLevel >= x.from).flatMap(x => x.kinds)];
}

// The options that fit a slot: the right kinds (a ninja may also take rogue talents, so the kind decides, not the class),
// for witches and shamans only their own class's hexes, the oracle's mystery for revelations, not above the slot's level,
// and not taken in another slot unless it can be taken more than once. Returns [{ talent, why }] where why is '' or the
// reason it can't be taken now.
// revelationNames (the chosen mystery's list) picks the oracle's revelations by name: a revelation several mysteries
// share is one record, and a name with versions per mystery ("Assumed Form (Whimsy)") keeps the mystery's own.
const baseName = n => n.replace(/\s*\(.*\)$/, '').toLowerCase().replace(/[^a-z]/g, '');
export function talentOptions(slot, all, { taken = [], mystery = '', revelationNames = null } = {}) {
  if (slot.rule.needs === 'mystery' && revelationNames) {
    const want = new Set(revelationNames.map(baseName));
    const fits = all.filter(t => slot.rule.kinds.includes(t.kind) && want.has(baseName(t.name)));
    // One record per name: the mystery's own version if there is one, else the first.
    const byName = new Map();
    for (const t of fits) {
      const k = baseName(t.name);
      if (!byName.has(k) || (t.mystery === mystery && byName.get(k).mystery !== mystery)) byName.set(k, t);
    }
    all = [...byName.values()];
    mystery = '';  // already chosen by name, so the mystery filter below doesn't apply
  }
  const kinds = slotKinds(slot);
  // "Accurate Stance (Unchained)": only for the unchained class, which takes it instead of a same-named core version.
  const unchained = slot.classId?.endsWith('-unchained');
  const twins = new Set(all.filter(t => kinds.includes(t.kind) && / \(Unchained\)$/.test(t.name)).map(t => t.name.replace(/ \(Unchained\)$/, '')));
  return all.filter(t => kinds.includes(t.kind)
      && (/ \(Unchained\)$/.test(t.name) ? unchained : !(unchained && twins.has(t.name)))
      && (!slot.rule.classOnly || !t.classes?.length || t.classes.includes(slot.classId))
      && (slot.rule.needs !== 'mystery' || !mystery || !t.mystery || t.mystery === mystery))
    .map(t => ({ talent: t,
                 why: taken.includes(t.id) && !t.repeatable ? 'already taken' : t.level && t.level > slot.classLevel ? `needs ${t.level}th level` : '' }));
}

// The mysteries revelations are listed under (when no mysteries list is loaded).
export function mysteries(all) {
  return [...new Set(all.filter(t => t.kind === 'revelation' && t.mystery).map(t => t.mystery))].sort();
}

// What a rule's feature is called in archetype texts ("rage powers", "the hex gained at 2nd level").
const TERMS = { 'weapon-training': 'weapon training', curse: "(?:oracle['’]s )?curse", 'wild-talent': '(?:utility )?wild talents?',
  'arcanist-exploit': '(?:arcanist )?exploits?', aspect: '(?:shifter )?aspects?', secret: 'secrets?', 'spirit-guide-spell': 'rage prophet mystery',
  'rogues-edge': "rogue['’]s edge", 'favored-enemy': 'favored enem(?:y|ies)', 'magus-arcana': 'magus arcana', 'ninja-trick': 'ninja tricks?',
  'mesmerist-trick': '(?:mesmerist )?tricks?' };
function termOf(rule) {
  if (TERMS[rule.key]) return TERMS[rule.key];
  const words = rule.label.toLowerCase().split(' ');
  const last = words.pop();
  const plural = last.endsWith('y') ? `${last.slice(0, -1)}(?:y|ies)` : last.endsWith('x') ? `${last}(?:es)?` : `${last}s?`;
  return [...words, plural].join(' ');
}
const ORDINAL_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
const LEVEL_WORDS = Object.fromEntries(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth']
  .map((w, i) => [w, i + 1]));
// What may stand between "replaces" and the term (articles, levels, "the ranger's second"), and what may follow it.
const LEAD_OK = new RegExp(`^\\s*(?:(?:the|a|an|its|his|her|their|normally|and|levels?|\\d+(?:st|nd|rd|th)(?:-level)?|[a-z]+['\u2019]s|(?:${Object.keys(LEVEL_WORDS).join('|')})(?:-level)?),?\\s+)*$`, 'i');
const AFTER_OK = /^(?:\s*$|[.,;:)]|\s+(?:gained|granted|normally|at|and|or|from|\d|class|abilit|of|for|that|she|he|it|in|with|as|to|is|are|this|these|which|but|while)\b)/i;
const LEVEL_WORD = new RegExp(`\\b(${Object.keys(LEVEL_WORDS).join('|')})(?=[- ]levels?)`, 'gi');

// How a class's archetypes change its choices: { replaced: { ruleKey: { classLevel: archetype name } },
// notes: { ruleKey: [{ name, text }] } }. "Replaces the rage powers gained at 4th, 8th, and 12th levels" removes those
// picks; "replaces weapon training 1" or "the ranger's second favored enemy" the nth pick; "replaces versatile
// performance" all of them. Other mentions ("in place of a rage power, she can choose...", "alters favored enemy") keep
// the picks and are shown as notes, with the sentence, so the player can apply them.
export function archetypeEffects(classId, archetypes) {
  const replaced = {}, notes = {};
  for (const rule of TALENT_RULES[classId] || []) {
    const term = new RegExp(`\\b(?:${termOf(rule)})\\b`, 'i');
    for (const a of archetypes) {
      for (const f of a.features || []) {
        for (const sentence of String(f.text || '').split(/(?<=\.)\s+/)) {
          if (!term.test(sentence)) continue;
          // "replaces [the 2nd and 6th level | the ranger's second | trap sense and the] <term> [gained at... | 1 | .]": the
          // term must be what's replaced, not part of another name ("infusion specialization", "final revelation").
          const rep = sentence.match(/\breplaces?\b(.*)$/i);
          const at = rep ? rep[1].search(term) : -1;
          const lead = at >= 0 ? rep[1].slice(0, at).split(/,\s*(?:and\s+)?(?!\d)|\s+and\s+(?!\d)/).pop() : '';
          const tail = at >= 0 ? rep[1].slice(at) : '';
          const after = tail.replace(term, '');
          if (at < 0 || !LEAD_OK.test(lead) || !AFTER_OK.test(after)) {
            if (/\b(?:alters?|modif(?:y|ies)|changes?|in place of|instead of)\b/i.test(sentence)) {
              (notes[rule.key] ||= []).push({ name: a.name, text: sentence.trim() });
            }
            continue;
          }
          // The picks it names: levels before or right after the term ("the 1st-level", "gained at 4th, 8th, and 12th
          // levels", "at second level"), else "weapon training 1, 3, and 4" or "second favored enemy", else all of them.
          const near = after.slice(0, 70).split(/;|\band\s+(?:the\s+)?(?!\d)[a-z]+\s+(?!levels?)/i)[0];
          const named = [...lead.matchAll(/(\d+)(?:st|nd|rd|th)/g), ...near.matchAll(/(\d+)(?:st|nd|rd|th)/g)].map(m => Number(m[1]))
            .concat([...`${lead} ${near}`.matchAll(LEVEL_WORD)].map(m => LEVEL_WORDS[m[1].toLowerCase()]));
          let levels = named.filter(l => rule.levels.includes(l));
          if (named.length && !levels.length) {
            // Levels this class doesn't pick at: shown as a note rather than guessed.
            (notes[rule.key] ||= []).push({ name: a.name, text: sentence.trim() });
            continue;
          }
          if (!levels.length) {
            const nums = after.match(/^\s+(\d(?:\s*,\s*\d)*(?:,?\s*and\s+\d)?)\b/);
            const word = lead.match(/\b(first|second|third|fourth|fifth|sixth)\b(?![- ]level)/i);
            const idx = word ? [ORDINAL_WORDS[word[1].toLowerCase()]] : nums ? nums[1].match(/\d/g).map(Number) : [];
            levels = idx.length ? idx.map(i => rule.levels[i - 1]).filter(Boolean) : rule.levels;
          }
          for (const l of levels) (replaced[rule.key] ||= {})[l] = a.name;
        }
      }
    }
  }
  return { replaced, notes };
}
