// Custom races (Build tab, Custom button): a homebrew race made into a race record like the list's (data/races.json),
// so its ability changes, size, speed, senses, languages, Bonus Feat and Skilled work like any race's. Other traits are
// listed with their text. No page code here.
//
// state.customRaces = [{ id ('cr-...'), name, size, type, speed, flexible (+2 to one ability of your choice), mods
//   ({ str: 2, ... }), lowLight, darkvision, bonusFeat, skilled, languages: [names], bonusLanguages: [names],
//   traits: [{ name, text }], summary }].

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_WORDS = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const RACE_SIZES = ['Small', 'Medium', 'Large'];
export const RACE_TYPES = ['humanoid', 'outsider', 'monstrous humanoid', 'fey', 'aberration', 'plant', 'construct', 'dragon', 'undead'];
export const RACE_SPEEDS = [20, 30, 40];

const signedNum = n => (n >= 0 ? `+${n}` : `−${-n}`);

// The ability trait's name: "+2 Dexterity, −2 Constitution", or "+2 to One Ability Score".
export function abilityTraitName(d) {
  if (d.flexible) return '+2 to One Ability Score';
  const parts = ABILITIES.filter(a => d.mods[a]).map(a => `${signedNum(d.mods[a])} ${ABILITY_WORDS[a]}`);
  return parts.join(', ') || 'No ability score changes';
}

// The race record.
export function customRaceRecord(d) {
  const senses = [...(d.darkvision ? ['darkvision 60 ft.'] : []), ...(d.lowLight ? ['low-light vision'] : [])];
  const traits = [
    { name: abilityTraitName(d), text: d.flexible ? 'A +2 racial bonus to one ability score of your choice.' : 'Racial ability score changes.', kind: 'ability_scores' },
    { name: d.size, text: `${d.name} are ${d.size} creatures.`, kind: 'size' },
    { name: d.speed < 30 ? 'Slow Speed' : d.speed > 30 ? 'Fast Speed' : 'Normal Speed', text: `A base speed of ${d.speed} feet.`, kind: 'speed' },
    ...(d.bonusFeat ? [{ name: 'Bonus Feat', text: 'One extra feat at 1st level.' }] : []),
    ...(d.skilled ? [{ name: 'Skilled', text: 'An additional skill rank at first level and one more at each level.' }] : []),
    ...(d.darkvision ? [{ name: 'Darkvision', text: 'Sees in the dark up to 60 feet.' }] : []),
    ...(d.lowLight ? [{ name: 'Low-Light Vision', text: 'Sees twice as far as humans in dim light.' }] : []),
    ...d.traits.map(t => ({ name: t.name, text: t.text || t.name })),
    { name: 'Languages', text: `Begins play speaking ${d.languages.join(', ') || 'no language'}.${d.bonusLanguages.length ? ` Bonus languages: ${d.bonusLanguages.join(', ')}.` : ''}`, kind: 'languages' },
  ];
  return { id: d.id, name: d.name, plural: d.name, source: 'Custom', category: 'custom', summary: d.summary || 'A custom race.',
    description: [], ability_modifiers: d.flexible ? {} : Object.fromEntries(ABILITIES.filter(a => d.mods[a]).map(a => [a, d.mods[a]])),
    ...(d.flexible ? { flexible_ability_bonus: true } : {}), size: d.size, base_speed: d.speed, type: d.type, subtypes: [],
    senses, languages: { starting: d.languages, bonus: d.bonusLanguages }, traits, alternate_traits: [], favored_class_options: [],
    custom: true };
}

const names = list => (Array.isArray(list) ? list : []).map(n => String(n || '').trim().slice(0, 40)).filter(Boolean).slice(0, 20);

// Saved definitions tidied (at most 10).
export function tidyCustomRaces(saved) {
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 10).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('cr-') ? d.id.slice(0, 40) : `cr-${i}`,
    name: String(d.name || 'Custom race').slice(0, 40),
    size: RACE_SIZES.includes(d.size) ? d.size : 'Medium',
    type: RACE_TYPES.includes(d.type) ? d.type : 'humanoid',
    speed: RACE_SPEEDS.includes(d.speed) ? d.speed : 30,
    flexible: d.flexible !== false,
    mods: Object.fromEntries(ABILITIES.map(a => [a, [-4, -2, 0, 2, 4].includes(d.mods?.[a]) ? d.mods[a] : 0])),
    lowLight: d.lowLight === true, darkvision: d.darkvision === true, bonusFeat: d.bonusFeat === true, skilled: d.skilled === true,
    languages: d.languages === undefined ? ['Common'] : names(d.languages), bonusLanguages: names(d.bonusLanguages),
    traits: (Array.isArray(d.traits) ? d.traits : []).filter(t => t && String(t.name || '').trim()).slice(0, 30)
      .map(t => ({ name: String(t.name).trim().slice(0, 60), text: String(t.text || '').slice(0, 1000) })),
    summary: String(d.summary || '').slice(0, 1000),
  }));
}
