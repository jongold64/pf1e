// Magic Items tab: the character's magic items, and every magic item (alphabetical within its category) with a
// side panel for the item being looked at.
import { openLines, $, esc, paragraphs, facts, sourceText } from './dom.js';
import { magicItemStats, magicItemTotals, ownable, formatGp, formatLbs, maxCharges, chargedPrice, priceChange } from './equipment.js';
import { itemKind, listedCost, craftedItemCost, craftedItemPrice, SPELL_ITEMS } from './crafting.js';
import { initCrafting, renderCrafting, craftListedItem, openSpellItem, openBuyKind, showBuyCard } from './tab-crafting.js';
import { renderCustomBuilder, customRowsHtml, initCustomItems } from './tab-custom-items.js';
import { customItemPaid } from './custom-items.js';
import { SKILLS } from './skills.js';
import { givesHtml, itemRowHtml, itemRowChange, itemRowClick, popSource } from './item-rows.js';
import { freeBox, sellButton, sellItem } from './tab-equipment.js';
import { pickList } from './pick-list.js';


const entryName = (item, option) => (option ? `${item.name} (${option})` : item.name);

function addButtons(item) {
  if (!ownable(item)) {
    return '<p class="hint">Special abilities are added to a magic weapon or armor, so they can\'t be owned on their own.</p>';
  }
  const options = item.price_options || [];
  const max = maxCharges(item);
  const n = chargesFor(item);
  const priced = gp => esc(formatGp(chargedPrice(gp, n, max)));
  const buttons = options.length
    ? options.map(o => `<button type="button" class="primary" data-add-item="${esc(item.id)}" data-option="${esc(o.label)}">
        Add ${esc(o.label)} (${priced(o.price_gp)})</button>`).join('')
    : `<button type="button" class="primary" data-add-item="${esc(item.id)}">Add to my magic items${item.price_gp && max && n < max ? ` (${priced(item.price_gp)})` : ''}</button>`;
  const craft = itemKind(item) ? `<button type="button" data-craft-item="${esc(item.id)}">Craft this item</button>` : '';
  return `${chargesBox(item)}${freeBuyBox()}<div class="slot-buttons">${buttons}${craft}</div>`;
}
// Charges to buy an item with (wands' are on the Add magic gear card): full unless changed; fewer cost proportionally less.
let buyCharges = { id: '', n: 0 };
const chargesFor = item => (buyCharges.id === item.id ? buyCharges.n : maxCharges(item));
const chargesBox = item => {
  const max = maxCharges(item);
  return max ? `<label class="charges-row">Charges <input type="number" data-buy-charges="${esc(item.id)}" min="1" max="${max}" step="1" inputmode="numeric" value="${chargesFor(item)}">
    <small class="muted">of ${max}${chargesFor(item) < max ? ': the price is in proportion' : ''}</small></label>` : '';
};
// Buy for free (found or a gift): ticked, Add puts the item in My magic items marked free. Kept while the page is open.
let freeBuy = false;
const freeBuyBox = () => `<label class="check-row"><input type="checkbox" data-free-buy${freeBuy ? ' checked' : ''}> Buy for free (found or a gift: no gold)</label>`;

// The item in a popup (the list's Details button): everything the side panel shows, with Add and Craft as buttons.
// An item you have, in a popup: what it gives, worn or not, and its description (the same popup as in Active effects).
const popOwned = (app, i) => popSource(app, `m:${i}`);

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
      add the ones you wear as active effects on the Build tab.</p>`);
}

// back: reopens the Add a magic item list (after adding, and from Back to the list); kept while its charges change.
let itemBack = null;
function popItem(app, id, back = undefined) {
  if (back !== undefined) itemBack = back;
  const item = app.data.itemsById.get(id);
  if (!item) return;
  const actions = [];
  const then = () => { if (itemBack) itemBack(); };
  if (ownable(item)) {
    const options = item.price_options || [];
    const priced = gp => formatGp(chargedPrice(gp, chargesFor(item), maxCharges(item)));
    if (options.length) options.forEach((o, n) => actions.push({ label: `Add ${o.label} (${priced(o.price_gp)})`, primary: n === 0, run: () => { addItem(app, item.id, o.label); then(); } }));
    else actions.push({ label: 'Add to my magic items', primary: true, run: () => { addItem(app, item.id); then(); } });
  }
  if (itemKind(item)) actions.push({ label: 'Craft this item', run: () => craftListedItem(app, item.id) });
  if (itemBack) actions.push({ label: 'Back to the list', run: itemBack });
  app.openDetail(item.name, `${itemDetails(item, false)}${ownable(item) ? `${chargesBox(item)}${freeBuyBox()}` : ''}`, actions);
}
// Add a magic item: every item A to Z (its kind, slot and price under the name), and Make a custom item. Potions,
// scrolls and wands of any spell are made with the Potion, scroll or wand button instead.
const KIND_NAME = { 'Magic Weapons': 'specific weapon', 'Magic Armor': 'specific armor', 'Magic Shields': 'specific shield' };
function popItemPicker(app) {
  const have = new Set(app.state.magicItems.map(e => e.id));
  pickList(app, { key: 'item', title: 'Add a magic item', placeholder: 'Search magic items by name', noun: 'items',
    items: () => app.data.items, mark: i => have.has(i.id),
    line: i => [KIND_NAME[i.category] || String(i.category || '').replace(/s$/, '').replace(/^Stave$/, 'Staff').replace(/ Item$/, ' item').toLowerCase(),
      i.slot && !['none', 'slotless'].includes(i.slot) ? `${i.slot} slot` : '', i.price || ''].filter(Boolean).join(' · '),
    onPick: (id, back) => popItem(app, id, back),
    top: '<p class="hint">Potions, scrolls and wands of any spell: use <b>Potion, scroll or wand</b> on the Add magic gear card.</p>',
    foot: '<p class="hint">Tap an item to read it and add it (with charges and Buy for free there) or craft it. Not here? Make your own:</p>',
    actions: [{ label: 'Make a custom item', run: () => { showCustomCard(app); $('custom-wrap').scrollIntoView({ block: 'start' }); } }] });
}
let showCustomCard = () => {};

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
    ${givesHtml(item)}
    <h4>Description</h4>
    ${paragraphs(item.description) || '<p class="hint">The source has no description for this item.</p>'}
    ${c.requirements || c.cost ? `<h4>Construction</h4>${facts([['Requirements', c.requirements], ['Cost', c.cost]])}` : ''}`;
}


const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// How each My magic items row's cost and weight are worked out, by key, for its Details popup.
const itemWhy = new Map();
const whyButton = (key, what) => ` <button type="button" class="skill-details q-details" data-item-why="${esc(key)}" aria-label="How the cost of ${esc(what)} is worked out" title="Details">?</button>`;

// The "My magic items" table: quantity buttons, cost and weight, and totals.
// The Add magic gear card's buttons: three makers, the list's categories (each shows just that part of the list),
// and Custom. [key, label]: a maker's kind, 'cat:<category>', or 'custom'.
const ADD_BUTTONS = [['list', 'Add a magic item'], ['weapon', 'Make a weapon magic'], ['armor', 'Make armor or a shield magic'], ['spell', 'Potion, scroll or wand']];
const skillNames = () => SKILLS.map(s => s.name).filter(n => !/^(Craft|Perform|Profession)$/.test(n))
  .concat(['Craft', 'Perform', 'Profession']).sort();
function renderAddButtons() {
  if (!$('add-buttons')) return;
  const open = !$('buy-wrap').hidden ? null : '';
  $('add-buttons').innerHTML = ADD_BUTTONS.map(([k, label]) => `<button type="button" data-add="${esc(k)}"${k === 'list' ? ' class="primary"' : ` aria-pressed="${open === k}"`}>${esc(label)}</button>`).join('');
  if (open === null) showBuyCard(true);
}

// An owned item with versions (a cloak of resistance +1 to +5, a belt +2 / +4 / +6): a choice of version, each saying
// what it adds to the price of one (or takes off): bought at market price, crafted at the cost to make. You pay the
// difference. '' for an item with one version.
function versionChoice(item, e, i) {
  const options = item.price_options || [];
  if (options.length < 2) return '';
  const each = label => {
    const p = magicItemStats(item, label).price_gp;
    return e.crafted ? listedCost(item, label || null, p) : chargedPrice(p, e.startCharges, maxCharges(item));
  };
  const now = each(e.option);
  return `<label class="item-version">Version <select data-item-option="${i}">${options.map(o => `<option value="${esc(o.label)}"${o.label === e.option ? ' selected' : ''}>${esc(o.label)}${priceChange(now, each(o.label))}</option>`).join('')}</select></label>
    <p class="hint">Beside each version: what it adds to the price${e.qty > 1 ? ' of each one' : ''} (you pay the difference) or takes off.${e.free ? ' This one is marked Free, so a new version costs no gold: untick Free to pay for an upgrade.' : ''}</p>`;
}

export function renderMyItems(app) {
  const owned = app.state.magicItems;
  const byId = app.data.itemsById;
  if (!byId) return;
  renderCrafting(app, 'buy');
  renderAddButtons();
  if (!$('custom-wrap').hidden) renderCustomBuilder(app, skillNames());
  const count = owned.reduce((n, e) => n + e.qty, 0) + app.state.craftedItems.reduce((n, e) => n + e.qty, 0) + app.state.customItems.reduce((n, e) => n + e.qty, 0);
  $('my-items-count').textContent = count ? `${count} item${count === 1 ? '' : 's'}` : '';
  itemWhy.clear();
  const allRows = [];
  $('my-items-rows').innerHTML = owned.map((e, i) => {
    const item = byId.get(e.id);
    if (!item) return '';
    const s = magicItemStats(item, e.option);
    const maxC = maxCharges(item);
    const each = e.free ? 0 : e.crafted ? listedCost(item, e.option || null, s.price_gp) : chargedPrice(s.price_gp, e.startCharges, maxC);
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
        <input type="checkbox" data-src-worn="m:${i}"${e.off ? '' : ' checked'} aria-label="${esc(name)} worn (its bonuses count in Active effects)" title="Worn: its bonuses count">
        <button type="button" class="link item-link line-name" data-show-item="${esc(item.id)}">${esc(name)}</button>
        ${slot ? `<span class="wl-k">${esc(slot)}</span>` : ''}${e.qty > 1 ? `<span class="wl-part">×${e.qty}</span>` : ''}
        ${maxC ? `<span class="wl-k">${e.charges ?? maxC}/${maxC} charges</span><button type="button" data-item-charge="${i}" data-step="-1"${(e.charges ?? maxC) > 0 ? '' : ' disabled'} aria-label="Use a charge of ${esc(name)}">Use 1</button>` : ''}
        <span class="wl-part"><b>${esc(each !== null && each !== undefined ? formatGp(each * e.qty) : '—')}</b></span>
        <span class="wl-k">${esc(s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—')}</span>
        ${s.price_gp ? sellButton(`data-item-sell="${i}"`, name) : ''}
        <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(name)}" title="Details">?</button></div>
      <div class="line-more"${open ? '' : ' hidden'}>
        <div class="breakdown">${esc(item.category)}${slot ? ` · ${esc(slot)} slot` : ''}${e.crafted ? ' · crafted (cost to make)' : ''}</div>
        <ul class="buff-active item-fx">${itemRowHtml({ ref: `m:${i}`, entry: e, item, worn: true }, { compact: true })}</ul>
        <div class="line-controls">
          <button type="button" class="skill-details" data-owned-pop="${i}" aria-label="${esc(name)} in a popup">About it</button>
          <span class="base">How many
            <button type="button" data-item-qty="${i}" data-step="-1" aria-label="One fewer ${esc(item.name)}">−</button>
            <span class="value">${e.qty}</span>
            <button type="button" data-item-qty="${i}" data-step="1" aria-label="One more ${esc(item.name)}">+</button></span>
          <span>Cost ${esc(e.free ? 'free' : each !== null && each !== undefined ? formatGp(each * e.qty) : '—')}${whyButton(`l-${i}`, name)}</span>
          ${freeBox(`data-item-free="${i}"`, e.free)}
          ${versionChoice(item, e, i)}
          ${maxC ? `<span class="base">Charges
            <button type="button" data-item-charge="${i}" data-step="-1" aria-label="One charge fewer">−</button>
            <span class="value">${e.charges ?? maxC}</span>
            <button type="button" data-item-charge="${i}" data-step="1" aria-label="One charge more">+</button></span>` : ''}
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
        <span class="wl-k">caster level ${e.cl}${e.kind === 'wand' ? ` · ${e.charges ?? 50}/50 charges` : ''}</span>${e.qty > 1 ? `<span class="wl-part">×${e.qty}</span>` : ''}
        <span class="wl-part"><b>${esc(formatGp(craftedItemCost(e) * e.qty))}</b></span>
        ${sellButton(`data-made-sell="${i}"`, name)}
        <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(name)}" title="Details">?</button></div>
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
  }).join('') + customRowsHtml(app, openLines)
    || '<p class="hint">No magic items yet. Choose one below, then add it.</p>';
  const listedTotals = magicItemTotals(owned, byId);
  const totals = { ...listedTotals, cost: listedTotals.cost + app.state.craftedItems.reduce((n, e) => n + craftedItemCost(e) * e.qty, 0)
    + app.state.customItems.reduce((n, e) => n + customItemPaid(e) * e.qty, 0) };
  for (const e of app.state.customItems) allRows.push({ label: `${e.name}${e.qty > 1 ? ` ×${e.qty}` : ''} (custom)`, text: formatGp(customItemPaid(e) * e.qty) });
  itemWhy.set('total', { title: `My magic items: ${formatGp(totals.cost)}`, rows: allRows, total: formatGp(totals.cost),
                          note: 'This total is counted in gold and weight on the Equipment tab.' });
  $('my-items-total').innerHTML = owned.length || app.state.craftedItems.length || app.state.customItems.length
    ? esc(`Total ${formatGp(totals.cost)}, ${formatLbs(totals.weight)} (counted in gold and weight on the Equipment tab).` +
      (totals.unpriced.length ? ` No price listed for: ${[...new Set(totals.unpriced)].join(', ')}.` : '')) + whyButton('total', 'the total')
    : '';
}

function addItem(app, id, option) {
  const owned = app.state.magicItems.map(e => ({ ...e }));
  const item = app.data.itemsById.get(id);
  const max = item && maxCharges(item);
  const n = item && max ? chargesFor(item) : null;
  // An item with charges is its own line (each keeps count of its charges); fewer than full are priced in proportion.
  const existing = !max && owned.find(e => e.id === id && (e.option || null) === (option || null) && !!e.free === freeBuy && !e.crafted);
  if (existing) existing.qty += 1;
  else owned.push({ id, ...(option ? { option } : {}), qty: 1, ...(freeBuy ? { free: true } : {}),
    ...(max ? { charges: n, ...(n < max ? { startCharges: n } : {}) } : {}) });
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
  // The Add magic gear buttons: a maker opens below them, a category shows that part of the list, Custom the builder.
  const showCustom = () => { showBuyCard(false); $('custom-wrap').hidden = false; renderAddButtons(); renderCustomBuilder(app, skillNames()); };
  showCustomCard = showCustom;
  initCustomItems(app, { skills: skillNames, show: () => { showCustom(); $('custom-wrap').scrollIntoView({ block: 'start' }); } });
  $('add-buttons').addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const k = b.dataset.add;
    if (k === 'list') { popItemPicker(app); return; }
    $('custom-wrap').hidden = true;
    openBuyKind(app, k);
    renderAddButtons();
  });
  for (const id of ['my-items-rows', 'my-items-total']) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-item-why]');
      if (b) showItemWhy(app, b.dataset.itemWhy);
    });
  }
  // Buy for free, in an item's popup.
  $('detail-body').addEventListener('change', e => { if (e.target.matches('[data-free-buy]')) freeBuy = e.target.checked; });
  // Charges to buy with, in an item's popup.
  $('detail-body').addEventListener('change', e => {
    const c = e.target.closest('[data-buy-charges]');
    if (!c) return;
    const item = app.data.itemsById.get(c.dataset.buyCharges);
    buyCharges = { id: item.id, n: Math.max(1, Math.min(maxCharges(item), Math.round(Number(c.value)) || maxCharges(item))) };
    popItem(app, item.id);
  });
  // Using up (or putting back) a charge of an item in My magic items.
  $('my-items-rows').addEventListener('click', e => {
    const ch = e.target.closest('[data-item-charge]');
    if (!ch) return;
    const i = Number(ch.dataset.itemCharge);
    const it = app.data.itemsById.get(app.state.magicItems[i].id);
    const max = maxCharges(it);
    app.update({ magicItems: app.state.magicItems.map((x, j) => (j === i ? { ...x, charges: Math.max(0, Math.min(max, (x.charges ?? max) + Number(ch.dataset.step))) } : x)) });
  });
  initCrafting(app);
  $('my-items-slots').addEventListener('click', () => popSlots(app));
  // Worn or not, a bonus that applies sometimes, a belt's choice: the same switches as in Active effects (item-rows.js).
  $('my-items-rows').addEventListener('change', e => {
    const t = e.target;
    // Another version of an owned item (an upgrade): its option changes; charges stay as they are.
    if (t.dataset.itemOption !== undefined) {
      const i = Number(t.dataset.itemOption);
      app.update({ magicItems: app.state.magicItems.map((x, j) => (j === i ? { ...x, option: t.value } : x)) });
      return;
    }
    if (t.dataset.itemFree !== undefined) {
      const i = Number(t.dataset.itemFree);
      app.update({ magicItems: app.state.magicItems.map((x, j) => { if (j !== i) return x; const { free, ...rest } = x; return t.checked ? { ...rest, free: true } : rest; }) });
      return;
    }
    itemRowChange(app, t);
  });
  $('my-items-rows').addEventListener('click', e => {
    if (itemRowClick(app, e)) return;
    // Sell one: half its market price to gold (a crafted item gives back what it cost to make).
    const sell = e.target.closest('[data-item-sell]');
    if (sell) {
      const i = Number(sell.dataset.itemSell);
      const x = app.state.magicItems[i];
      const item = app.data.itemsById.get(x.id);
      const s = magicItemStats(item, x.option);
      const paid = x.free ? 0 : x.crafted ? listedCost(item, x.option || null, s.price_gp) : chargedPrice(s.price_gp, x.startCharges, maxCharges(item));
      sellItem(app, { name: entryName(item, x.option), value: chargedPrice(s.price_gp, x.charges, maxCharges(item)), paid, kind: 'magic' },
        { magicItems: app.state.magicItems.map((y, j) => (j === i ? { ...y, qty: y.qty - 1 } : y)).filter(y => y.qty > 0) });
      return;
    }
    const msell = e.target.closest('[data-made-sell]');
    if (msell) {
      const i = Number(msell.dataset.madeSell);
      const x = app.state.craftedItems[i];
      sellItem(app, { name: `${SPELL_ITEMS[x.kind].label} of ${x.spellName}`, value: x.kind === 'wand' ? Math.round(craftedItemPrice(x) * (x.charges ?? 50) / 50 * 100) / 100 : craftedItemPrice(x), paid: craftedItemCost(x), kind: 'magic' },
        { craftedItems: app.state.craftedItems.map((y, j) => (j === i ? { ...y, qty: y.qty - 1 } : y)).filter(y => y.qty > 0) });
      return;
    }
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


export async function renderItemsTab(app) {
  if (!app.data.items) {
    $('add-buttons').innerHTML = '<p class="hint">Loading magic items…</p>';
    await app.loadItems();
  }
  renderMyItems(app);
  renderAddButtons();
}

// Used by search and My magic items: an item in a popup, with its Add and Craft buttons.
export async function showItem(app, id) {
  if (!app.data.items) await app.loadItems();
  popItem(app, id, null);
}
