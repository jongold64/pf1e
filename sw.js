// Offline helper (service worker): lets the installed app (or the website) work with no internet.
// - Online: every file is fetched from the site as usual (so updates arrive as before) and a copy is kept.
// - Offline: the kept copy is used.
// The page, its code and all the rules data are saved on the first visit, so everything works offline after that.
// Code files the page loads are kept as they're fetched; a new data file must be added to PRECACHE below.
const CACHE = 'pf1e-builder';
const PRECACHE = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest', 'LICENSE-OGL.txt',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon.svg',
  'data/races.json', 'data/classes.json', 'data/archetypes.json', 'data/domains.json', 'data/companions.json', 'data/drawbacks.json', 'data/talents.json', 'data/mysteries.json', 'data/bloodlines.json', 'data/skills.json', 'data/feats.json', 'data/traits.json',
  'data/armor.json', 'data/weapons.json', 'data/equipment.json', 'data/magic-items.json', 'data/spells.json',
];

// Every code file the app uses: js/app.js and, following their `import ... from './x.js'` lines, all the files it
// imports (so a new code file is saved without being listed here). The first visit loads the code before this
// helper starts, so the code has to be saved here rather than as it's fetched.
async function codeFiles(start = 'js/app.js') {
  const seen = new Set();
  const visit = async url => {
    if (seen.has(url)) return;
    seen.add(url);
    const text = await fetch(url).then(r => (r.ok ? r.text() : '')).catch(() => '');
    const base = new URL(url, self.location.href);
    const deps = [...text.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]|\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g)]
      .map(m => new URL(m[1] || m[2], base).pathname.replace(new URL('./', self.location.href).pathname, ''));
    await Promise.all(deps.map(visit));
  };
  await visit(start);
  return [...seen];
}

self.addEventListener('install', event => {
  // Save everything up front; a file that fails to download doesn't stop the rest.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = [...PRECACHE, ...await codeFiles()];
    await Promise.all([...new Set(files)].map(url => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      // Offline: the saved copy (opening the app itself falls back to the saved page).
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? await cache.match('./') || await cache.match('index.html') : undefined)
        || new Response('Offline, and this file was never saved.', { status: 503 });
    }
  })());
});
