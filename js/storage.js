// Saved characters in the browser's localStorage: a list ("roster") of { id, label } plus one entry per character.
// Storage can be blocked (private browsing), so reads return null and failed writes are ignored.

const LIST_KEY = 'pf1e-builder-characters';
// Before there was a list, the one character was saved here; it becomes the first character on the list.
const OLD_KEY = 'pf1e-builder-character';
const charKey = id => `pf1e-builder-character:${id}`;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not saved */ }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// The list of characters and which one is open: { current, characters: [{ id, label }] }. Always has at least one.
export function openRoster() {
  let roster = read(LIST_KEY);
  if (!roster || !Array.isArray(roster.characters)) {
    const id = newId();
    const old = read(OLD_KEY);
    if (old) write(charKey(id), old);
    roster = { current: id, characters: [{ id, label: '' }] };
  }
  roster.characters = roster.characters.filter(c => c && typeof c.id === 'string')
    .map(c => ({ id: c.id, label: typeof c.label === 'string' ? c.label : '' }));
  if (!roster.characters.length) roster.characters.push({ id: newId(), label: '' });
  if (!roster.characters.some(c => c.id === roster.current)) roster.current = roster.characters[0].id;
  write(LIST_KEY, roster);
  return roster;
}

export function saveRoster(roster) {
  write(LIST_KEY, roster);
}

export function loadCharacter(id) {
  return read(charKey(id));
}

export function saveCharacter(roster, id, character, label) {
  write(charKey(id), character);
  const entry = roster.characters.find(c => c.id === id);
  if (entry && entry.label !== label) {
    entry.label = label;
    write(LIST_KEY, roster);
  }
}

export function removeCharacter(roster, id) {
  try { localStorage.removeItem(charKey(id)); } catch { /* ignore */ }
  roster.characters = roster.characters.filter(c => c.id !== id);
  write(LIST_KEY, roster);
}

// Export file contents, and reading one back (also accepts a bare saved character).
export const EXPORT_FORMAT = 'pf1e-builder-character';
export function exportData(character) {
  return { format: EXPORT_FORMAT, version: 1, exported: new Date().toISOString(), character };
}
export function importData(parsed) {
  if (parsed && parsed.format === EXPORT_FORMAT && parsed.character && typeof parsed.character === 'object') return parsed.character;
  if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.classLevels) || typeof parsed.race === 'string')) return parsed;
  return null;
}
