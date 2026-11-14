// Export on a computer: the open character saved straight into one chosen folder (a OneDrive folder, say), without a Save
// window each time. Only Edge and Chrome on a computer can write to a folder (window.showDirectoryPicker); elsewhere Export
// shares or downloads the file instead. The folder is remembered in the browser's IndexedDB (a folder can't go in
// localStorage), so it is picked once; after the browser restarts it asks once to allow saving there again.

const DB = 'pf1e-builder-folder';
const STORE = 'handles';
const KEY = 'characters';

export const folderSaveSupported = () => typeof window !== 'undefined' && !!window.showDirectoryPicker;

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, f) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = f(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// The folder picked before, or null.
export async function savedFolder() {
  try { return (await run('readonly', s => s.get(KEY))) || null; } catch { return null; }
}

// Ask for a folder; remembers and returns it, or null if the window was closed.
export async function chooseFolder() {
  try {
    const dir = await window.showDirectoryPicker({ id: 'pf1e-characters', mode: 'readwrite' });
    await run('readwrite', s => s.put(dir, KEY));
    return dir;
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    throw err;
  }
}

// Write text to name in the folder (asking for one the first time). Returns the folder's name, or null if cancelled.
export async function saveToFolder(name, text) {
  let dir = await savedFolder();
  // The browser forgets the permission when it restarts: ask again (this runs from a button press, which it needs).
  if (dir && (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted'
      && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') dir = null;
  dir ||= await chooseFolder();
  if (!dir) return null;
  const file = await dir.getFileHandle(name, { create: true });
  const out = await file.createWritable();
  await out.write(text);
  await out.close();
  return dir.name || 'your folder';
}
