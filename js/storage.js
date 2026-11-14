// Saved characters in the browser's localStorage: a list ("roster") of { id, label, changed, archived? } plus one entry
// per character. changed: when the character was last changed (an ISO date), shown in the Character list. archived:
// moved to the Archived group at the bottom of the list, kept but out of the way.
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

// When a character was made, from its id (newId starts with the time); null when the id isn't one of ours.
export function idDate(id) {
  const ms = parseInt(String(id).slice(0, -4), 36);
  return ms > 1.4e12 && ms < 4e12 ? new Date(ms).toISOString() : null;
}
const isDate = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// The list of characters and which one is open: { current, characters: [{ id, label, changed }] }. Always has at least
// one. A character saved before dates were kept gets the day it was made.
export function openRoster() {
  let roster = read(LIST_KEY);
  if (!roster || !Array.isArray(roster.characters)) {
    const id = newId();
    const old = read(OLD_KEY);
    if (old) write(charKey(id), old);
    roster = { current: id, characters: [{ id, label: '', changed: new Date().toISOString() }] };
  }
  roster.characters = roster.characters.filter(c => c && typeof c.id === 'string')
    .map(c => ({ id: c.id, label: typeof c.label === 'string' ? c.label : '',
                 changed: isDate(c.changed) ? c.changed : idDate(c.id) || new Date().toISOString(),
                 ...(c.archived === true ? { archived: true } : {}) }));
  if (!roster.characters.length) roster.characters.push({ id: newId(), label: '', changed: new Date().toISOString() });
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

// touch: false when nothing was changed by hand (only opening a character, which may tidy old fields), so its date
// stays. Otherwise the date moves to now when the saved character differs from what was there.
export function saveCharacter(roster, id, character, label, touch = true) {
  const text = JSON.stringify(character);
  let before = null;
  try { before = localStorage.getItem(charKey(id)); } catch { /* blocked */ }
  if (text !== before) write(charKey(id), character);
  const entry = roster.characters.find(c => c.id === id);
  if (!entry) return;
  const changed = touch && before !== null && text !== before;
  if (entry.label !== label || changed) {
    entry.label = label;
    if (changed) entry.changed = new Date().toISOString();
    write(LIST_KEY, roster);
  }
}

// "13 Nov 2026", or "today 2:15 pm" / "yesterday" for recent ones: how the Character list shows a date.
export function shortDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(now) - day(d)) / 86400000);
  const time = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  if (ago === 0) return `today ${time}`;
  if (ago === 1) return `yesterday ${time}`;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

// Archive a character, or bring it back (archived false).
export function setArchived(roster, id, archived) {
  const entry = roster.characters.find(c => c.id === id);
  if (!entry) return;
  if (archived) entry.archived = true;
  else delete entry.archived;
  write(LIST_KEY, roster);
}

// The character to open after the open one is archived or deleted: the next one on the list that isn't archived
// (else the first archived one), or null when there's no other.
export function nextCharacter(roster, id) {
  const others = roster.characters.filter(c => c.id !== id);
  const i = roster.characters.findIndex(c => c.id === id);
  const after = [...roster.characters.slice(i + 1), ...roster.characters.slice(0, Math.max(i, 0))].filter(c => c.id !== id);
  return (after.find(c => !c.archived) || others[0] || null)?.id || null;
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
// The date an export file was made, or null.
export function exportedDate(parsed) {
  return parsed && parsed.format === EXPORT_FORMAT && isDate(parsed.exported) ? new Date(parsed.exported).toISOString() : null;
}
export function importData(parsed) {
  if (parsed && parsed.format === EXPORT_FORMAT && parsed.character && typeof parsed.character === 'object') return parsed.character;
  if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.classLevels) || typeof parsed.race === 'string')) return parsed;
  return null;
}
