// Magic Items tab: the character's magic items, and every magic item (alphabetical within its category) with a
// side panel for the item being looked at.
import { openLines, $, esc, paragraphs, facts, sourceText } from './dom.js';
import { magicItemStats, magicItemTotals, ownable, formatGp, formatLbs } from './equipment.js';
import { itemKind, listedCost, craftedItemCost, craftedItemPrice, SPELL_ITEMS } from './crafting.js';
import { initCrafting, renderCrafting, craftListedItem, openSpellItem } from './tab-crafting.js';

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

// The item in a popup (the list's Details button): everything the side panel shows, with Add and Craft as buttons.
// An item you have, in a popup: its description and stats, with One more and Remove.
function popOwned(app, i) {
  const e = app.state.magicItems[i];
  const item = e && app.data.itemsById.get(e.id);
  if (!item) return;
  const change = d => {
    const owned = app.state.magicItems.map(x => ({ ...x }));
    owned[i].qty += d;
    app.update({ magicItems: owned.filter(x => x.qty > 0) });
  };
  app.openDetail(entryName(item, e.option), `<p class="hint">You have ${e.qty}${e.crafted ? ' (crafted: counted at the cost to make)' : ''}.</p>${itemDetails(item, false)}`,
    [{ label: 'One more', run: () => change(1) }, { label: e.qty > 1 ? 'One fewer' : 'Remove it', run: () => change(-1) }]);
}

// A potion, scroll or wand you added, in a popup: how it's used, its caster level, save DC and price.
function popMade(app, i) {
  const e = app.state.craftedItems[i];
  if (!e) return;
  const info = SPELL_ITEMS[e.kind];
  // The save DC of a spell from an item: 10 + spell level + the lowest ability modifier that can cast it.
  const dc = 10 + e.spellLevel + Math.floor(e.spellLevel / 2);
  const use = { potion: 'Drink it (a standard action): the spell affects you, as if cast by the caster level below. One use.',
    scroll: 'Read it (as casting the spell): the spell must be on your class list; if its caster level is higher than yours, make a caster level check (DC = its caster level + 1). One use.',
    wand: 'Use it (spell trigger, a standard action): the spell must be on your class list (or use Use Magic Device). It holds 50 charges.' }[e.kind];
  app.openDetail(`${info.label} of ${e.spellName}`, `<table class="skill-why"><tbody>
      <tr><td>Spell</td><td class="num">${esc(e.spellName)}, level ${e.spellLevel}</td></tr>
      <tr><td>Caster level</td><td class="num">${e.cl}</td></tr>
      <tr><td>Save DC (10 + spell level + the lowest casting modifier)</td><td class="num">${dc}</td></tr>
      <tr><td>Price (${formatGp(info.perLevel)} × spell level × caster level)</td><td class="num">${esc(formatGp(craftedItemPrice(e)))}</td></tr>
      <tr><td>You have</td><td class="num">${e.qty}${e.bought ? ' (bought or found)' : ' (crafted: counted at the cost to make)'}</td></tr></tbody></table>
    <p>${esc(use)}</p><p class="hint">${esc(info.label)}s hold spells of up to level ${info.maxSpellLevel}.</p>`);
}

// Which body slots your items fill (Core Rulebook, Magic Items on the Body): one item per slot, two rings; slotless items
// and ones worn as armor or a shield are listed apart. Two items wanting the same slot are flagged.
const BODY_SLOTS = [['head', 'Head'], ['headband', 'Headband'], ['eyes', 'Eyes'], ['shoulders', 'Shoulders'], ['neck', 'Neck'],
  ['chest', 'Chest'], ['body', 'Body'], ['belt', 'Belt'], ['wrists', 'Wrists'], ['hands', 'Hands'], ['ring', 'Rings (two)'], ['feet', 'Feet']];
function popSlots(app) {
  const by = new Map();
  const other = [];
  for (const e of app.state.magicItems) {
    const item = app.data.itemsById.get(e.id);
    if (!item) continue;
    const slot = String(item.slot || 'none').toLowerCase().replace(/[^a-z]/g, '').replace(/^wrist$/, 'wrists');
    const name = entryName(item, e.option);
    if (BODY_SLOTS.some(([k]) => k === slot)) for (let n = 0; n < e.qty; n++) by.set(slot, [...(by.get(slot) || []), name]);
    else other.push(`${name}${e.qty > 1 ? ` ×${e.qty}` : ''}${['armor', 'shield'].includes(slot) ? ` (${slot})` : ''}`);
  }
  const rows = BODY_SLOTS.map(([k, label]) => {
    const list = by.get(k) || [];
    const max = k === 'ring' ? 2 : 1;
    return `<tr${list.length > max ? ' class="over"' : ''}><td>${esc(label)}</td><td>${list.length ? esc(list.join(', ')) : '<span class="muted">empty</span>'}
      ${list.length > max ? `<span class="warning"> ${list.length} items, only ${max} can be worn (the others don\u2019t work)</span>` : ''}</td></tr>`;
  }).join('');
  app.openDetail('Body slots', `<table class="skill-why"><tbody>${rows}</tbody></table>
    ${other.length ? `<h3>No body slot (slotless, or used as armor or a shield)</h3><p>${esc(other.join(', '))}</p>` : ''}
    <p class="hint">Only one item works in each body slot (two rings). Bonuses of the same type from different items don\u2019t stack:
      add the ones you wear as active effects on the Character tab.</p>`);
}

function popItem(app, id) {
  const item = app.data.itemsById.get(id);
  if (!item) return;
  const actions = [];
  if (ownable(item)) {
    const options = item.price_options || [];
    if (options.length) options.forEach((o, n) => actions.push({ label: `Add ${o.label} (${formatGp(o.price_gp)})`, primary: n === 0, run: () => addItem(app, item.id, o.label) }));
    else actions.push({ label: 'Add to my magic items', primary: true, run: () => addItem(app, item.id) });
  }
  if (itemKind(item)) actions.push({ label: 'Craft this item', run: () => craftListedItem(app, item.id) });
  app.openDetail(item.name, itemDetails(item, false), actions);
}

function itemDetails(item, withButtons = true) {
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
    ${withButtons ? addButtons(item) : ''}
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
    // One line: the item, its slot, how many, cost and weight; Details opens the rest.
    const key = `item-${i}`;
    const open = openLines.has(key);
    const slot = item.slot && !['none', 'slotless'].includes(String(item.slot).replace(/[^a-z]/gi, '').toLowerCase()) ? String(item.slot).replace(/[^a-z ]/gi, '') : '';
    return `<div class="line-card"><div class="fit-line item-line">
        <input type="checkbox" data-item-worn="${i}"${e.off ? '' : ' checked'} aria-label="${esc(name)} worn (its bonuses count in Active effects)" title="Worn: its bonuses count">
        <button type="button" class="link item-link line-name" data-show-item="${esc(item.id)}">${esc(name)}</button>
        ${slot ? `<span class="wl-k">${esc(slot)}</span>` : ''}${e.qty > 1 ? `<span class="wl-part">×${e.qty}</span>` : ''}
        <span class="wl-part"><b>${esc(each !== null && each !== undefined ? formatGp(each * e.qty) : '—')}</b></span>
        <span class="wl-k">${esc(s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—')}</span>
        <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(name)}">Details</button></div>
      <div class="line-more"${open ? '' : ' hidden'}>
        <div class="breakdown">${esc(item.category)}${slot ? ` · ${esc(slot)} slot` : ''}${e.crafted ? ' · crafted (cost to make)' : ''}</div>
        <div class="line-controls">
          <button type="button" class="skill-details" data-owned-pop="${i}" aria-label="${esc(name)} in a popup">About it</button>
          <span class="base">How many
            <button type="button" data-item-qty="${i}" data-step="-1" aria-label="One fewer ${esc(item.name)}">−</button>
            <span class="value">${e.qty}</span>
            <button type="button" data-item-qty="${i}" data-step="1" aria-label="One more ${esc(item.name)}">+</button></span>
          <span>Cost ${esc(each !== null && each !== undefined ? formatGp(each * e.qty) : '—')}${whyButton(`l-${i}`, name)}</span>
        </div></div></div>`;
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
    const key = `made-${i}`;
    const open = openLines.has(key);
    return `<div class="line-card"><div class="fit-line item-line">
        <span class="line-name">${esc(name)}</span>
        <span class="wl-k">caster level ${e.cl}</span>${e.qty > 1 ? `<span class="wl-part">×${e.qty}</span>` : ''}
        <span class="wl-part"><b>${esc(formatGp(craftedItemCost(e) * e.qty))}</b></span>
        <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(name)}">Details</button></div>
      <div class="line-more"${open ? '' : ' hidden'}>
        <div class="breakdown">${e.bought ? 'bought or found' : `crafted (cost to make; worth ${esc(formatGp(craftedItemPrice(e)))})`}</div>
        <div class="line-controls">
          <button type="button" class="skill-details" data-made-pop="${i}" aria-label="${esc(name)} in a popup">About it</button>
          <span class="base">How many
            <button type="button" data-made-qty="${i}" data-step="-1" aria-label="One fewer">−</button>
            <span class="value">${e.qty}</span>
            <button type="button" data-made-qty="${i}" data-step="1" aria-label="One more">+</button></span>
          <span>Cost ${esc(formatGp(craftedItemCost(e) * e.qty))}${whyButton(`c-${i}`, name)}</span>
        </div></div></div>`;
  }).join('')
    || '<p class="hint">No magic items yet. Choose one below, then add it.</p>';
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
    const si = e.target.closest('[data-spell-item]');
    if (si) { openSpellItem(app, si.dataset.spellItem); return; }
    const pop = e.target.closest('[data-item-pop]');
    if (pop) { popItem(app, pop.dataset.itemPop); return; }
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
  $('my-items-slots').addEventListener('click', () => popSlots(app));
  // Worn or not: its bonuses count in Active effects while it's ticked.
  $('my-items-rows').addEventListener('change', e => {
    const t = e.target.closest('[data-item-worn]');
    if (!t) return;
    const i = Number(t.dataset.itemWorn);
    app.update({ magicItems: app.state.magicItems.map((x, j) => { if (j !== i) return x; const { off, ...rest } = x; return t.checked ? rest : { ...rest, off: true }; }) });
  });
  $('my-items-rows').addEventListener('click', e => {
    const step = e.target.closest('[data-item-qty]');
    if (step) {
      const owned = app.state.magicItems.map(x => ({ ...x }));
      owned[Number(step.dataset.itemQty)].qty += Number(step.dataset.step);
      app.update({ magicItems: owned.filter(x => x.qty > 0) });
    }
    const show = e.target.closest('[data-show-item]');
    if (show) showItem(app, show.dataset.showItem);
    const owned = e.target.closest('[data-owned-pop]');
    if (owned) popOwned(app, Number(owned.dataset.ownedPop));
    const mp = e.target.closest('[data-made-pop]');
    if (mp) popMade(app, Number(mp.dataset.madePop));
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
        `<li class="with-details"><button type="button" data-item="${esc(i.id)}">${esc(i.name)}${i.slot && !['none', 'slotless'].includes(i.slot) ? `<small>${esc(i.slot)}</small>` : ''}</button>
          <button type="button" class="skill-details" data-item-pop="${esc(i.id)}" aria-label="${esc(i.name)} in a popup">Details</button></li>`).join('')}</ul>
    </section>`;
  }).join('') || '<p class="hint">No items match.</p>';
  // Potions, scrolls and wands aren't in this list (any spell can be one): searching for them points to Add magic gear.
  const spellItem = ['wand', 'potion', 'scroll'].find(k => filter.includes(k));
  if (spellItem) {
    $('item-list').insertAdjacentHTML('afterbegin', `<p class="hint">${spellItem[0].toUpperCase()}${spellItem.slice(1)}s of any spell are added in the
      <b>Add magic gear</b> card: <button type="button" class="primary" data-spell-item="${spellItem}">Add a ${spellItem}</button></p>`);
  }
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
