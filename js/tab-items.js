// Magic Items tab: the character's magic items, and every magic item (alphabetical within its category) with a
// side panel for the item being looked at.
import { $, esc, paragraphs, facts, sourceText } from './dom.js';
import { magicItemStats, magicItemTotals, ownable, formatGp, formatLbs } from './equipment.js';
import { itemKind, listedCost, craftedItemCost, craftedItemPrice, SPELL_ITEMS } from './crafting.js';
import { initCrafting, renderCrafting, craftListedItem } from './tab-crafting.js';

let selectedId = null;
let listed = false;

const entryName = (item, option) => (option ? `${item.name} (${option})` : item.name);

function addButtons(item) {
  if (!ownable(item)) {
    return '<p class="hint">Special abilities are added to a magic weapon or armor, so they can\'t be owned on their own.</p>';
  }
  const options = item.price_options || [];
  const buttons = options.length
    ? options.map(o => `<button type="button" class="primary" data-add-item="${esc(item.id)}" data-option="${esc(o.label)}">
        Add ${esc(o.label)} (${esc(formatGp(o.price_gp))})</button>`).join('')
    : `<button type="button" class="primary" data-add-item="${esc(item.id)}">Add to my magic items</button>`;
  const craft = itemKind(item) ? `<button type="button" data-craft-item="${esc(item.id)}">Craft this item</button>` : '';
  return `<div class="slot-buttons">${buttons}${craft}</div>`;
}

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
    ${addButtons(item)}
    ${paragraphs(item.description) || '<p class="hint">The source has no description for this item.</p>'}
    ${c.requirements || c.cost ? `<h4>Construction</h4>${facts([['Requirements', c.requirements], ['Cost', c.cost]])}` : ''}`;
}

function renderPanel(app) {
  const item = app.data.itemsById?.get(selectedId);
  $('item-panel').innerHTML = item ? itemDetails(item) : '<p class="hint">Choose an item to see its details.</p>';
  document.querySelectorAll('#item-list [data-item]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.item === selectedId)));
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// How each My magic items row's cost and weight are worked out, by key, for its Details popup.
const itemWhy = new Map();
const whyButton = (key, what) => ` <button type="button" class="skill-details" data-item-why="${esc(key)}" aria-label="How the cost of ${esc(what)} is worked out">Details</button>`;

// The "My magic items" table: quantity buttons, cost and weight, and totals.
export function renderMyItems(app) {
  const owned = app.state.magicItems;
  const byId = app.data.itemsById;
  if (!byId) return;
  renderCrafting(app, 'buy');
  const count = owned.reduce((n, e) => n + e.qty, 0) + app.state.craftedItems.reduce((n, e) => n + e.qty, 0);
  $('my-items-count').textContent = count ? `${count} item${count === 1 ? '' : 's'}` : '';
  itemWhy.clear();
  const allRows = [];
  $('my-items-rows').innerHTML = owned.map((e, i) => {
    const item = byId.get(e.id);
    if (!item) return '';
    const s = magicItemStats(item, e.option);
    const each = e.crafted ? listedCost(item, e.option || null, s.price_gp) : s.price_gp;
    const name = entryName(item, e.option);
    const fromConstruction = e.crafted && item.construction?.cost && each !== null && s.price_gp !== null && each !== s.price_gp / 2;
    itemWhy.set(`l-${i}`, { title: name, rows: [
      { label: 'Market price (each)', text: s.price_gp !== null ? formatGp(s.price_gp) : 'not listed' },
      ...(e.crafted ? [{ label: fromConstruction ? 'Cost to make (each, from its Construction line)' : 'Cost to make (each): half the market price',
                         text: each !== null ? formatGp(each) : '—' }] : []),
      { label: 'Quantity', text: `× ${e.qty}` },
      { label: 'Weight (each)', text: s.weight_lbs !== null ? formatLbs(s.weight_lbs) : 'not listed' },
    ], total: each !== null && each !== undefined ? formatGp(each * e.qty) : '—',
      note: e.crafted ? 'Crafted items count at what they cost to make.' : 'Bought or found items count at their market price.' });
    allRows.push({ label: `${name}${e.qty > 1 ? ` ×${e.qty}` : ''}`, text: each !== null && each !== undefined ? formatGp(each * e.qty) : 'no price' });
    return `<tr><td><button type="button" class="link item-link" data-show-item="${esc(item.id)}">${esc(entryName(item, e.option))}</button>
        <div class="breakdown">${esc(item.category)}${item.slot && !['none', 'slotless'].includes(item.slot) ? ` · ${esc(item.slot)}` : ''}${e.crafted ? ' · crafted (cost to make)' : ''}</div></td>
      <td><span class="base">
        <button type="button" data-item-qty="${i}" data-step="-1" aria-label="One fewer ${esc(item.name)}">−</button>
        <span class="value">${e.qty}</span>
        <button type="button" data-item-qty="${i}" data-step="1" aria-label="One more ${esc(item.name)}">+</button>
      </span></td>
      <td>${esc(each !== null && each !== undefined ? formatGp(each * e.qty) : '—')}${whyButton(`l-${i}`, name)}</td>
      <td>${esc(s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—')}</td></tr>`;
  }).join('') + app.state.craftedItems.map((e, i) => {
    const info = SPELL_ITEMS[e.kind];
    const name = `${info.label} of ${e.spellName}`;
    itemWhy.set(`c-${i}`, { title: name, rows: [
      { label: `${info.label} price per spell level per caster level`, text: formatGp(info.perLevel) },
      { label: 'Spell level', text: e.spellLevel === 0 ? '0 (counts as ½)' : `× ${e.spellLevel}` },
      { label: 'Caster level', text: `× ${e.cl}` },
      { label: 'Market price (each)', text: formatGp(craftedItemPrice(e)) },
      ...(e.bought ? [] : [{ label: 'Cost to make (each): half the market price', text: formatGp(craftedItemCost(e)) }]),
      { label: 'Quantity', text: `× ${e.qty}` },
    ], total: formatGp(craftedItemCost(e) * e.qty),
      note: e.bought ? 'Bought or found: counts at the market price.' : 'Made by the character: counts at the cost to make.' });
    allRows.push({ label: `${name}${e.qty > 1 ? ` ×${e.qty}` : ''}`, text: formatGp(craftedItemCost(e) * e.qty) });
    return `<tr><td>${esc(SPELL_ITEMS[e.kind].label)} of ${esc(e.spellName)}
        <div class="breakdown">caster level ${e.cl} · ${e.bought ? 'bought or found' : `crafted (cost to make; worth ${esc(formatGp(craftedItemPrice(e)))})`}</div></td>
      <td><span class="base">
        <button type="button" data-made-qty="${i}" data-step="-1" aria-label="One fewer">−</button>
        <span class="value">${e.qty}</span>
        <button type="button" data-made-qty="${i}" data-step="1" aria-label="One more">+</button>
      </span></td>
      <td>${esc(formatGp(craftedItemCost(e) * e.qty))}${whyButton(`c-${i}`, name)}</td><td>—</td></tr>`;
  }).join('')
    || '<tr><td colspan="4" class="hint">No magic items yet. Choose one below, then add it.</td></tr>';
  const listedTotals = magicItemTotals(owned, byId);
  const totals = { ...listedTotals, cost: listedTotals.cost + app.state.craftedItems.reduce((n, e) => n + craftedItemCost(e) * e.qty, 0) };
  itemWhy.set('total', { title: `My magic items: ${formatGp(totals.cost)}`, rows: allRows, total: formatGp(totals.cost),
                          note: 'This total is counted in gold and weight on the Equipment tab.' });
  $('my-items-total').innerHTML = owned.length || app.state.craftedItems.length
    ? esc(`Total ${formatGp(totals.cost)}, ${formatLbs(totals.weight)} (counted in gold and weight on the Equipment tab).` +
      (totals.unpriced.length ? ` No price listed for: ${[...new Set(totals.unpriced)].join(', ')}.` : '')) + whyButton('total', 'the total')
    : '';
}

function addItem(app, id, option) {
  const owned = app.state.magicItems.map(e => ({ ...e }));
  const existing = owned.find(e => e.id === id && (e.option || null) === (option || null));
  if (existing) existing.qty += 1;
  else owned.push({ id, ...(option ? { option } : {}), qty: 1 });
  app.update({ magicItems: owned });
}

function showItemWhy(app, key) {
  const d = itemWhy.get(key);
  if (!d) return;
  const rows = d.rows.length ? d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">Nothing yet.</td></tr>';
  app.openDetail(d.title, `<table class="skill-why"><tbody>${rows}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(d.total)}</b></td></tr></tfoot></table>${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
}

export function initItemsTab(app) {
  for (const id of ['my-items-rows', 'my-items-total']) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-item-why]');
      if (b) showItemWhy(app, b.dataset.itemWhy);
    });
  }
  $('item-filter').addEventListener('input', () => renderList(app));
  $('item-filter-form').addEventListener('submit', e => { e.preventDefault(); renderList(app); });
  $('item-category').addEventListener('change', e => {
    document.getElementById(`cat-${e.target.value}`)?.scrollIntoView({ block: 'start' });
  });
  $('item-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-item]');
    if (!btn) return;
    selectedId = btn.dataset.item;
    renderPanel(app);
  });
  $('item-panel').addEventListener('click', e => {
    const btn = e.target.closest('[data-add-item]');
    if (btn) addItem(app, btn.dataset.addItem, btn.dataset.option);
    const craft = e.target.closest('[data-craft-item]');
    if (craft) craftListedItem(app, craft.dataset.craftItem);
  });
  initCrafting(app);
  $('my-items-rows').addEventListener('click', e => {
    const step = e.target.closest('[data-item-qty]');
    if (step) {
      const owned = app.state.magicItems.map(x => ({ ...x }));
      owned[Number(step.dataset.itemQty)].qty += Number(step.dataset.step);
      app.update({ magicItems: owned.filter(x => x.qty > 0) });
    }
    const show = e.target.closest('[data-show-item]');
    if (show) showItem(app, show.dataset.showItem);
    const made = e.target.closest('[data-made-qty]');
    if (made) {
      const items = app.state.craftedItems.map(x => ({ ...x }));
      items[Number(made.dataset.madeQty)].qty += Number(made.dataset.step);
      app.update({ craftedItems: items.filter(x => x.qty > 0) });
    }
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
  if (!app.data.items) {
    $('item-list').innerHTML = '<p class="hint">Loading magic items…</p>';
    await app.loadItems();
  }
  renderMyItems(app);
  if (listed) return;
  listed = true;
  renderList(app);
}

// Used by search: show an item in the side panel and scroll the list to it.
export async function showItem(app, id) {
  selectedId = id;
  await renderItemsTab(app);
  if ($('item-filter').value) {
    $('item-filter').value = '';
    renderList(app);
  }
  renderPanel(app);
  document.querySelector(`#item-list [data-item="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}
