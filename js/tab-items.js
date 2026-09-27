// Magic Items tab: every magic item, alphabetical within its category, with a side panel for the chosen item.
import { $, esc, paragraphs, facts, sourceText } from './dom.js';

let selectedId = null;
let listed = false;

function itemDetails(item) {
  const c = item.construction || {};
  return `<h3>${esc(item.name)}</h3>
    <p class="hint">${esc(item.category)} · ${esc(sourceText(item))}</p>
    ${facts([
      ['Slot', item.slot && item.slot !== 'none' ? item.slot : null],
      ['Aura', item.aura],
      ['Caster level', item.cl],
      ['Price', item.price],
      ['Weight', item.weight],
    ])}
    ${paragraphs(item.description) || '<p class="hint">The source has no description for this item.</p>'}
    ${c.requirements || c.cost ? `<h4>Construction</h4>${facts([['Requirements', c.requirements], ['Cost', c.cost]])}` : ''}`;
}

function renderPanel(app) {
  const item = app.data.items?.find(i => i.id === selectedId);
  $('item-panel').innerHTML = item ? itemDetails(item) : '<p class="hint">Choose an item to see its details.</p>';
  document.querySelectorAll('#item-list [data-item]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.item === selectedId)));
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function initItemsTab(app) {
  $('item-filter').addEventListener('input', () => renderList(app));
  $('item-category').addEventListener('change', e => {
    document.getElementById(`cat-${e.target.value}`)?.scrollIntoView({ block: 'start' });
  });
  $('item-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-item]');
    if (!btn) return;
    selectedId = btn.dataset.item;
    renderPanel(app);
  });
}

function renderList(app) {
  const items = app.data.items;
  const filter = $('item-filter').value.trim().toLowerCase();
  const byCategory = new Map();
  for (const i of items) {
    if (filter && !i.name.toLowerCase().includes(filter)) continue;
    if (!byCategory.has(i.category)) byCategory.set(i.category, []);
    byCategory.get(i.category).push(i);
  }
  const categories = [...byCategory.keys()].sort();
  const shown = [...byCategory.values()].reduce((n, list) => n + list.length, 0);
  $('item-count').textContent = filter ? `${shown} of ${items.length}` : `${items.length}`;
  $('item-category').innerHTML = '<option value="">Jump to a category…</option>' +
    categories.map(c => `<option value="${slug(c)}">${esc(c)} (${byCategory.get(c).length})</option>`).join('');
  $('item-list').innerHTML = categories.map(c => {
    const list = byCategory.get(c).sort((a, b) => a.name.localeCompare(b.name));
    return `<section class="list-group" id="cat-${slug(c)}">
      <h3 class="list-heading">${esc(c)} <span class="count">${list.length}</span></h3>
      <ul class="pick-list">${list.map(i =>
        `<li><button type="button" data-item="${esc(i.id)}">${esc(i.name)}${i.slot && !['none', 'slotless'].includes(i.slot) ? `<small>${esc(i.slot)}</small>` : ''}</button></li>`).join('')}</ul>
    </section>`;
  }).join('') || '<p class="hint">No items match.</p>';
  renderPanel(app);
}

export async function renderItemsTab(app) {
  if (listed) return;
  if (!app.data.items) {
    $('item-list').innerHTML = '<p class="hint">Loading magic items…</p>';
    await app.loadItems();
  }
  listed = true;
  renderList(app);
}

// Used by search: show an item in the side panel and scroll the list to it.
export async function showItem(app, id) {
  selectedId = id;
  if (!listed) await renderItemsTab(app);
  if ($('item-filter').value) {
    $('item-filter').value = '';
    renderList(app);
  }
  renderPanel(app);
  document.querySelector(`#item-list [data-item="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}
