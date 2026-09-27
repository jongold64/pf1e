// Search box at the top of the Character tab: finds anything in the app by name.
import { $, esc } from './dom.js';
import { SKILLS } from './skills.js';
import { buildIndex, search, TYPE_LABELS } from './search.js';

let index = null;
let complete = false;  // spells, magic items and equipment included

function entries(app) {
  const { data } = app;
  const out = [
    ...data.races.map(r => ({ type: 'race', id: r.id, name: r.name, detail: `${r.category} race` })),
    ...data.classes.map(c => ({ type: 'class', id: c.id, name: c.name, detail: `${c.category} class` })),
    ...data.feats.map(f => ({ type: 'feat', id: f.id, name: f.name, detail: (f.types || []).join(', ') })),
    ...SKILLS.map(s => ({ type: 'skill', id: s.name, name: s.name, detail: s.ability.toUpperCase() })),
    ...data.armor.map(a => ({ type: 'armor', id: a.id, name: a.name,
                              detail: a.category === 'shield' ? 'shield' : `${a.category} armor` })),
  ];
  if (data.spells) out.push(...data.spells.map(s => ({ type: 'spell', id: s.id, name: s.name, detail: s.school || '' })));
  if (data.items) out.push(...data.items.map(i => ({ type: 'magic-item', id: i.id, name: i.name, detail: i.category })));
  if (data.gear) out.push(...data.gear.map(i => ({ type: 'equipment', id: i.id, name: i.name, detail: i.category })));
  if (data.weapons) out.push(...data.weapons.map(w => ({ type: 'weapon', id: w.id, name: w.name, detail: w.category })));
  return out;
}

function run(app) {
  const query = $('global-search').value;
  index ??= buildIndex(entries(app));
  const hits = search(index, query);
  const tooShort = query.trim().length < 2;
  $('search-results').hidden = tooShort;
  const status = !complete ? 'Loading spells, magic items, weapons and equipment so they can be searched too…'
    : tooShort ? '' : `${hits.length === 40 ? 'First 40' : hits.length} result${hits.length === 1 ? '' : 's'}`;
  $('search-status').textContent = status;
  $('search-status').hidden = !status;
  $('search-results').innerHTML = hits.map(h => `
    <li><button type="button" data-type="${h.type}" data-id="${esc(h.id)}">
      <span class="tag type-${h.type}">${TYPE_LABELS[h.type]}</span>
      <span class="result-name">${esc(h.name)}</span>
      <small>${esc(h.detail || '')}</small>
    </button></li>`).join('') || (tooShort ? '' : '<li class="hint">Nothing found by that name.</li>');
}

// Spells, magic items and equipment load the first time the search box is used, then the search runs again.
function loadAll(app) {
  if (complete || loadAll.started) return;
  loadAll.started = true;
  Promise.all([app.loadSpells(), app.loadItems(), app.loadGear(), app.loadWeapons()]).then(() => {
    complete = true;
    index = null;
    run(app);
  });
}

export function initSearch(app) {
  let timer = null;
  $('global-search').addEventListener('focus', () => loadAll(app));
  $('global-search').addEventListener('input', () => {
    loadAll(app);
    clearTimeout(timer);
    timer = setTimeout(() => run(app), 120);
  });
  $('search-form').addEventListener('submit', e => {
    e.preventDefault();
    loadAll(app);
    run(app);
  });
  $('search-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (btn) app.openResult(btn.dataset.type, btn.dataset.id);
  });
}
