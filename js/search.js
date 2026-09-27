// Search by name across everything in the app. No page code here, so it can be tested on its own.

// Types in the order they're listed when matches are equally good.
export const SEARCH_TYPES = ['race', 'class', 'feat', 'skill', 'spell', 'armor', 'equipment', 'magic-item'];

export const TYPE_LABELS = {
  race: 'Race', class: 'Class', feat: 'Feat', skill: 'Skill', spell: 'Spell', armor: 'Armor', equipment: 'Equipment',
  'magic-item': 'Magic item',
};

// Lowercase, without accents or punctuation, so "Mage's" matches "mages".
export function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

// entries: [{ type, id, name, detail }] -> the same entries with a precomputed search key.
export function buildIndex(entries) {
  return entries.map(e => ({ ...e, key: normalize(e.name) }));
}

// How well a name matches: exact, then starts with the query, then a word starts with it, then contains it.
function score(key, query) {
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  if (key.includes(` ${query}`)) return 2;
  if (key.includes(query)) return 3;
  // Every query word appears somewhere ("ring prot" finds "Ring of Protection").
  const words = query.split(' ');
  if (words.length > 1 && words.every(w => key.includes(w))) return 4;
  return null;
}

// Best matches first; ties go by type order, then name. Returns at most `limit` entries.
export function search(index, query, limit = 40) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const hits = [];
  for (const e of index) {
    const s = score(e.key, q);
    if (s !== null) hits.push({ e, s });
  }
  hits.sort((a, b) => a.s - b.s || SEARCH_TYPES.indexOf(a.e.type) - SEARCH_TYPES.indexOf(b.e.type)
    || a.e.name.localeCompare(b.e.name));
  return hits.slice(0, limit).map(h => h.e);
}
