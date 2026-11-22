// Languages (Core Rulebook, Languages and the Linguistics skill): the race's starting languages; one bonus language per
// point of Intelligence bonus, from the race's list (a cleric adds Abyssal, Celestial and Infernal to it, a druid Sylvan,
// a wizard Draconic); one language of any kind (not a secret one) per rank of Linguistics. A druid also knows Druidic.
// state.languages = the languages chosen beyond the starting ones. No page code here.

// A short list of languages, used only when data/languages.json is missing; the races' own lists are added to these.
export const LANGUAGES = ['Aboleth', 'Abyssal', 'Aklo', 'Aquan', 'Auran', 'Boggard', 'Celestial', 'Common', 'Cyclops', 'Dark Folk',
  'Draconic', 'Drow Sign Language', 'Dwarven', 'Elven', 'Giant', 'Gnoll', 'Gnome', 'Goblin', 'Grippli', 'Halfling', 'Ignan',
  'Infernal', 'Necril', 'Orc', 'Protean', 'Sphinx', 'Sylvan', 'Tengu', 'Terran', 'Treant', 'Undercommon', 'Vegepygmy'];
// Secret languages can't be learned with bonus languages or Linguistics.
const SECRET = new Set(['Druidic']);
const CLASS_BONUS = { cleric: ['Abyssal', 'Celestial', 'Infernal'], druid: ['Sylvan'], wizard: ['Draconic'] };

// Every language name that can be learned: data/languages.json's (secret ones left out; the short list above when it's
// missing) and each race's starting and bonus languages ("Any..." left out), sorted.
export function allLanguages(races = [], list = []) {
  const names = new Set(list.length ? list.filter(l => !l.secret).map(l => l.name) : LANGUAGES);
  // A plain name only: not "either Abyssal or Infernal", "one elemental language" or "D'ziriak (understanding only...)".
  const plain = l => /^[A-Z][A-Za-z' -]{1,24}$/.test(l) && !/\b(or|and|any|one|choice)\b/i.test(l);
  for (const r of races) for (const l of [...(r.languages?.starting || []), ...(r.languages?.bonus || [])]) if (plain(l)) names.add(l);
  return [...names].filter(l => !SECRET.has(l)).sort((a, b) => a.localeCompare(b));
}

// race: its record ({ languages: { starting, bonus } }); classIds: the character's classes; intMod: the Intelligence
// modifier without temporary effects; linguistics: ranks; chosen: state.languages; all: allLanguages(...).
// Returns { free (starting, and Druidic for a druid), picks (chosen ones that count), known, slots (Int bonus +
// Linguistics ranks), raceList (bonus languages the race and classes allow), anyRace, problems: [text] }.
export function languageState({ race = null, classIds = [], intMod = 0, linguistics = 0, chosen = [], all = LANGUAGES } = {}) {
  const free = [...new Set([...(race?.languages?.starting || []), ...(classIds.includes('druid') ? ['Druidic'] : [])])];
  const anyRace = (race?.languages?.bonus || []).some(b => /^any\b/i.test(b));
  const raceList = anyRace ? all : [...new Set([...(race?.languages?.bonus || []).filter(b => !/^any\b/i.test(b)), ...classIds.flatMap(c => CLASS_BONUS[c] || [])])];
  const picks = [...new Set(chosen)].filter(l => typeof l === 'string' && !free.includes(l) && !SECRET.has(l));
  const intCount = Math.max(0, intMod);
  const slots = intCount + Math.max(0, linguistics);
  const offList = picks.filter(l => !raceList.includes(l)).length;
  const problems = [];
  if (picks.length > slots) problems.push(`${picks.length} chosen, but there's room for ${slots} (Intelligence bonus ${intCount} + Linguistics ranks ${linguistics}).`);
  if (offList > linguistics) problems.push(`${offList} of them aren't on your race's list: each of those needs a rank of Linguistics (you have ${linguistics}).`);
  return { free, picks, known: [...free, ...picks], slots, intCount, linguistics, raceList, anyRace, problems };
}

// A saved list tidied: strings only, no repeats, at most 40.
export const tidyLanguages = s => [...new Set((Array.isArray(s) ? s : []).filter(l => typeof l === 'string' && l && l.length <= 40))].slice(0, 40);
