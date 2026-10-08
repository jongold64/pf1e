// Equipment tab: browse mundane gear by category, keep an inventory, and track gold and weight.
import { openLines, fitLines, $, esc, paragraphs, facts, sourceText } from './dom.js';
import { WEALTH_BY_LEVEL, startingGold, armorCost, equipmentTotals, magicItemTotals, magicItemStats, entryStats, formatGp, formatLbs,
         sizeWeightFactor } from './equipment.js';
import { weaponCost, weaponLabel, weaponWeight } from './weapons.js';
import { craftedItemCost, magicPrefix } from './crafting.js';
import { showArmorWhy } from './tab-armor.js';
import { carryingCapacity, encumbrance } from './rules.js';
import { bardingCost, companionSize } from './companion.js';

let selectedId = null;
let listed = false;
// What each money / weight total is made of (filled when the tab is drawn, shown by its Details button).
let moneyDetails = {};
// Each inventory row's price and weight, by key, for its Details popup.
const invWhy = new Map();

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const entryName = (item, variant) => (variant ? `${item.name} (${variant.toLowerCase()})` : item.name);

// "+1 fortification (light) Chainmail", "Masterwork Breastplate".
function armorLabel(armor, enh, mw, abilities = []) {
  const prefix = magicPrefix(enh, mw && !armor.mw_included, abilities);
  return prefix ? `${prefix} ${armor.name}` : armor.name;
}

function gearDetails(item, withButtons = true) {
  const versions = item.variants || [];
  const addButtons = versions.length
    ? versions.map(v => `<button type="button" class="primary" data-add-gear="${esc(item.id)}" data-variant="${esc(v.name)}">
        Add ${esc(v.name.toLowerCase())} (${esc(formatGp(v.price_gp))})</button>`).join('')
    : `<button type="button" class="primary" data-add-gear="${esc(item.id)}">Add to inventory</button>`;
  return `<h3>${esc(item.name)}</h3>
    <p class="hint">${esc(item.category)} · ${esc(sourceText(item))}</p>
    ${versions.length
      ? `<table class="versions"><thead><tr><th>Version</th><th>Price</th><th>Weight</th></tr></thead><tbody>${versions.map(v =>
          `<tr><td>${esc(v.name)}</td><td>${esc(v.price_gp !== null ? formatGp(v.price_gp) : v.price)}</td><td>${esc(v.weight_lbs !== null ? formatLbs(v.weight_lbs) : '—')}</td></tr>`).join('')}</tbody></table>`
      : facts([
          ['Price', item.price_gp !== null ? formatGp(item.price_gp) : item.price],
          ['Weight', item.weight_lbs !== null ? formatLbs(item.weight_lbs) : item.weight],
        ])}
    ${facts([['Craft DC', item.craft_dc]])}
    ${withButtons ? `<div class="slot-buttons">${addButtons}</div>` : ''}
    ${paragraphs(item.description)}`;
}

function renderPanel(app) {
  const item = app.data.gearById?.get(selectedId);
  $('gear-panel').innerHTML = item ? gearDetails(item) : '<p class="hint">Choose an item to see its details and add it to your inventory.</p>';
  document.querySelectorAll('#gear-list [data-gear]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.gear === selectedId)));
}

function renderList(app) {
  const items = app.data.gear;
  const filter = $('gear-search').value.trim().toLowerCase();
  const byCategory = new Map();
  for (const i of items) {
    if (filter && !i.name.toLowerCase().includes(filter)) continue;
    if (!byCategory.has(i.category)) byCategory.set(i.category, []);
    byCategory.get(i.category).push(i);
  }
  const categories = [...byCategory.keys()].sort();
  const shown = [...byCategory.values()].reduce((n, list) => n + list.length, 0);
  $('gear-count').textContent = filter ? `${shown} of ${items.length}` : `${items.length}`;
  $('gear-category').innerHTML = '<option value="">Jump to a category…</option>' +
    categories.map(c => `<option value="${slug(c)}">${esc(c)} (${byCategory.get(c).length})</option>`).join('');
  $('gear-list').innerHTML = categories.map(c => {
    const list = byCategory.get(c).sort((a, b) => a.name.localeCompare(b.name));
    return `<section class="list-group" id="gear-cat-${slug(c)}">
      <h3 class="list-heading">${esc(c)} <span class="count">${list.length}</span></h3>
      <ul class="pick-list">${list.map(i =>
        `<li class="with-details"><button type="button" data-gear="${esc(i.id)}">${esc(i.name)}<small>${esc(i.price_gp !== null ? formatGp(i.price_gp) : (i.price || ''))}</small></button>
          <button type="button" class="skill-details" data-gear-pop="${esc(i.id)}" aria-label="${esc(i.name)} in a popup">Details</button></li>`).join('')}</ul>
    </section>`;
  }).join('') || '<p class="hint">No equipment matches.</p>';
  renderPanel(app);
}

// Money, weight and the inventory table. Needs the equipment data, so it waits for it on first use.
export async function renderEquipment(app, view) {
  const { state, data } = app;
  if (!data.gear || (state.magicItems.length && !data.itemsById) || (state.weapons.length && !data.weaponsById)) {
    $('inventory-rows').innerHTML = '<p class="hint">Loading equipment…</p>';
    await Promise.all([app.loadGear(), state.magicItems.length ? app.loadItems() : null,
                       state.weapons.length ? app.loadWeapons() : null]);
    view = app.view;
  }
  const maxGold = !!state.houseRules.maxGold;
  const start = startingGold(view.cls, data.classes, maxGold);
  const wealth = WEALTH_BY_LEVEL[state.level];
  $('gold-start').textContent = start ? `Use ${view.cls.name.toLowerCase()} ${maxGold ? 'maximum ' : ''}starting gold (${formatGp(start)})` : 'No starting gold listed';
  $('gold-start').disabled = !start;
  $('gold-wealth').hidden = !wealth;
  if (wealth) $('gold-wealth').textContent = `Use wealth for level ${state.level} (${formatGp(wealth)})`;
  const gold = state.gold ?? start ?? 0;
  if (document.activeElement !== $('gold')) $('gold').value = gold;

  const totals = equipmentTotals(state.inventory, data.gearById, {
    armor: view.gear.armor, armorEnh: state.armorEnh, armorMw: state.armorMw,
    shield: view.gear.shield, shieldEnh: state.shieldEnh, shieldMw: state.shieldMw,
    size: view.race.size,
  });
  const sizeFactor = sizeWeightFactor(view.race.size);
  // Worn armor and shield, with their special abilities (equipmentTotals counts them without abilities, so the gear's
  // own cost is the total less that).
  const wornItems = [[view.gear.armor, 'armor'], [view.gear.shield, 'shield']].filter(([a]) => a).map(([a, k]) => ({
    name: armorLabel(a, state[`${k}Enh`], state[`${k}Mw`], state[`${k}Abilities`]),
    cost: armorCost(a, state[`${k}Enh`], state[`${k}Mw`], state[`${k}Abilities`], state[`${k}Crafted`]),
    plain: armorCost(a, state[`${k}Enh`], state[`${k}Mw`]),
    weight: (a.weight_lbs || 0) * sizeFactor, crafted: state[`${k}Crafted`],
  }));
  // The animal companion's barding (bought like armor; the animal carries it, not you).
  const compAnimal = view.companion?.level && data.companions?.animals.find(a => a.id === state.companion.animal);
  const barding = compAnimal && data.armorById.get(state.companion.armorId);
  const bardingRow = barding ? { name: `Barding for ${state.companion.name || compAnimal.name}: ${barding.name}${state.companion.armorEnh ? ` +${state.companion.armorEnh}` : ''}`,
    cost: bardingCost(barding, companionSize(compAnimal, view.companion.level), state.companion.armorEnh || 0), weight: null } : null;
  const armorSpend = wornItems.reduce((n, x) => n + x.cost, 0) + (bardingRow?.cost || 0);
  const gearSpend = totals.cost - wornItems.reduce((n, x) => n + x.plain, 0);
  const listedMagic = data.itemsById ? magicItemTotals(state.magicItems, data.itemsById) : { cost: 0, weight: 0, unpriced: [] };
  // Potions, scrolls and wands the character made count at their crafting cost.
  const made = state.craftedItems.reduce((n, e) => n + craftedItemCost(e) * e.qty, 0);
  const magic = { ...listedMagic, cost: listedMagic.cost + made };
  const carried = state.weapons.map(e => [data.weaponsById?.get(e.id), e]).filter(([w]) => w);
  const weaponSpend = carried.reduce((sum, [w, e]) => sum + weaponCost(w, e), 0);
  const weaponsWeight = carried.reduce((sum, [w, e]) => sum + weaponWeight(w, e, view.race.size), 0);
  const left = Math.round((gold - armorSpend - gearSpend - magic.cost - weaponSpend) * 100) / 100;
  const carriedWeight = totals.weight + magic.weight + weaponsWeight;

  // What each total is made of, for its Details popup.
  const gearRows = state.inventory.map(e => {
    const item = data.gearById.get(e.id);
    if (!item) return null;
    const st = entryStats(item, e.variant);
    return { label: `${entryName(item, e.variant)}${e.qty > 1 ? ` ×${e.qty}` : ''}`, cost: (st.price_gp || 0) * e.qty,
             weight: st.weight_lbs === null ? null : st.weight_lbs * e.qty };
  }).filter(Boolean);
  const magicRows = [
    ...state.magicItems.map(e => {
      const item = data.itemsById?.get(e.id);
      if (!item) return null;
      const st = magicItemStats(item, e.option);
      return { label: `${item.name}${e.option ? ` (${e.option})` : ''}${e.qty > 1 ? ` ×${e.qty}` : ''}`, cost: (st.price_gp || 0) * e.qty,
               weight: st.weight_lbs === null ? null : st.weight_lbs * e.qty };
    }).filter(Boolean),
    ...state.craftedItems.map(e => ({ label: `${e.kind[0].toUpperCase()}${e.kind.slice(1)} of ${e.spellName}${e.qty > 1 ? ` ×${e.qty}` : ''}`,
                                       cost: craftedItemCost(e) * e.qty, note: e.bought ? '' : 'crafting cost', weight: null })),
  ];
  const weaponRows = carried.map(([w, e]) => ({ label: weaponLabel(w, e), cost: weaponCost(w, e), weight: weaponWeight(w, e, view.race.size) }));
  const armorRows = [...wornItems.map(x => ({ label: x.name, cost: x.cost, note: x.crafted ? 'crafted: magic at half price' : '', weight: x.weight })),
    ...(bardingRow ? [{ label: bardingRow.name, cost: bardingRow.cost, note: 'worn by your companion', weight: null }] : [])];
  const money = rows => rows.map(r => ({ label: r.label, text: formatGp(r.cost), note: r.note }));
  moneyDetails = {
    armor: { title: `Armor and shield: ${formatGp(armorSpend)}`, rows: money(armorRows), total: formatGp(armorSpend) },
    gear: { title: `Equipment: ${formatGp(gearSpend)}`, rows: money(gearRows), total: formatGp(gearSpend) },
    weapons: { title: `Weapons: ${formatGp(weaponSpend)}`, rows: money(weaponRows), total: formatGp(weaponSpend) },
    magic: { title: `Magic items: ${formatGp(magic.cost)}`, rows: money(magicRows), total: formatGp(magic.cost) },
    left: { title: `Left: ${formatGp(left)}`, total: formatGp(left), rows: [
      { label: state.gold === null ? `Gold (${view.cls.name.toLowerCase()} starting gold)` : 'Gold', text: formatGp(gold) },
      { label: 'Armor and shield', text: `− ${formatGp(armorSpend)}` }, { label: 'Equipment', text: `− ${formatGp(gearSpend)}` },
      { label: 'Weapons', text: `− ${formatGp(weaponSpend)}` }, { label: 'Magic items', text: `− ${formatGp(magic.cost)}` }] },
    weight: { title: `Weight carried: ${formatLbs(carriedWeight)}`, total: formatLbs(carriedWeight),
      rows: [...armorRows.filter(r => r.weight !== null), ...weaponRows, ...gearRows, ...magicRows.filter(r => r.weight !== null)]
        .map(r => ({ label: r.label, text: r.weight === null ? 'no weight listed' : formatLbs(r.weight) })),
      note: 'Coins are not counted.' },
  };
  // Gold: the class's starting gold and the wealth-by-level table (your level marked).
  const sw = view.cls.starting_wealth;
  moneyDetails.gold = { title: `Gold: ${formatGp(gold)}`, html: `
    <p>${state.gold === null ? `You haven't entered an amount, so your ${esc(view.cls.name.toLowerCase())} starting gold is used.` : 'The amount you entered.'}
      Everything bought (armor, weapons, equipment, magic items) is taken from it in <b>Left</b>.</p>
    <h3>Starting gold (1st level)</h3>
    <p>${start ? `${esc(view.cls.name)}: ${sw?.dice ? `${esc(sw.dice)}, ` : ''}${maxGold ? `maximum ${esc(formatGp(start))} (Max Starting Gold house rule; the average is ${esc(formatGp(startingGold(view.cls, data.classes)))})` : `average ${esc(formatGp(start))}`}${!sw?.average_gp ? ' (from the class it\u2019s based on)' : ''}.` : 'No starting gold is listed for this class.'}</p>
    <h3>Wealth by level (characters made above 1st level)</h3>
    <table class="skill-why"><tbody>${Object.entries(WEALTH_BY_LEVEL).map(([lv, gp]) => `<tr${Number(lv) === state.level ? ' class="mine"' : ''}>
      <td>Level ${lv}${Number(lv) === state.level ? ' (you)' : ''}</td><td class="num">${esc(formatGp(gp))}</td></tr>`).join('')}</tbody></table>
    <p class="hint">Core Rulebook: a new character above 1st level starts with this much gear; spend no more than half on one item.</p>` };
  // Carrying capacity for your Strength and size, and what each load does.
  const strNow = view.stats.scores.str;
  const cap = carryingCapacity(strNow, view.race.size);
  const loadNow = encumbrance(carriedWeight, cap);
  moneyDetails.carry = { title: `Carrying capacity (Str ${strNow}, ${view.race.size})`, html: `
    <table class="skill-why"><thead><tr><th>Load</th><th class="num">Up to</th><th>What it does</th></tr></thead><tbody>
      <tr${loadNow.load === 'light' ? ' class="mine"' : ''}><td>Light</td><td class="num">${cap.light} lbs.</td><td>nothing</td></tr>
      <tr${loadNow.load === 'medium' ? ' class="mine"' : ''}><td>Medium</td><td class="num">${cap.medium} lbs.</td><td>max Dex +3, check penalty −3, slower speed, run ×4</td></tr>
      <tr${loadNow.load === 'heavy' ? ' class="mine"' : ''}><td>Heavy</td><td class="num">${cap.heavy} lbs.</td><td>max Dex +1, check penalty −6, slower speed, run ×3</td></tr>
      <tr><td>Lift over your head</td><td class="num">${cap.heavy} lbs.</td><td></td></tr>
      <tr><td>Lift off the ground</td><td class="num">${cap.heavy * 2} lbs.</td><td>you can only stagger around</td></tr>
      <tr><td>Push or drag</td><td class="num">${cap.heavy * 5} lbs.</td><td></td></tr></tbody></table>
    <p>You carry <b>${esc(formatLbs(carriedWeight))}</b>: a <b>${esc(loadNow.load)}</b> load.
      ${state.houseRules.encumbrance ? 'The Encumbrance house rule is on, so its effects count in your numbers.' : 'Switch on the Encumbrance house rule (Character tab) to count its effects.'}</p>
    <p class="hint">Strength here includes active effects. Small characters carry ¾ as much, Large ones twice as much. A load\u2019s
      Dex limit and check penalty don\u2019t add to armor\u2019s: the worse counts.</p>` };
  const details = key => ` <button type="button" class="skill-details" data-money-details="${key}" aria-label="What makes up this total">Details</button>`;
  $('money-summary').innerHTML = [
    ['Gold', esc(formatGp(gold)) + details('gold')],
    ['Armor and shield', esc(formatGp(armorSpend)) + details('armor')],
    ['Equipment', esc(formatGp(gearSpend)) + details('gear')],
    ['Weapons', esc(formatGp(weaponSpend)) + details('weapons')],
    ['Magic items', esc(formatGp(magic.cost)) + details('magic')],
    ['Left', `<span class="${left < 0 ? 'warning' : ''}">${esc(formatGp(left))}${left < 0 ? ' (over budget)' : ''}</span>${details('left')}`],
    ['Weight carried', esc(formatLbs(carriedWeight)) + details('weight')],
    ['Carrying capacity', esc(`light ${cap.light}, medium ${cap.medium}, heavy ${cap.heavy} lbs. (${loadNow.load} now)`) + details('carry')],
    // Encumbrance house rule: the load and the limits for this character's Strength and size.
    ...(view.load ? [['Load', esc(`${view.load.load[0].toUpperCase()}${view.load.load.slice(1)} (light up to ${view.load.capacity.light} lbs., `
      + `medium ${view.load.capacity.medium}, heavy ${view.load.capacity.heavy})`)]] : []),
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');
  const notes = [sizeFactor === 1 ? 'Weights are for Medium characters.'
    : `Armor and weapons weigh ${sizeFactor < 1 ? 'half' : 'twice'} as much for ${view.race.size} characters (counted here). ` +
      (sizeFactor < 1 ? 'Some general gear (backpacks, bedrolls, clothing and the like) weighs a quarter as much when made for Small characters; the listed weights are the Medium ones.' : '')];
  const unpriced = [...totals.unpriced, ...magic.unpriced];
  if (unpriced.length) notes.push(`No price listed for: ${[...new Set(unpriced)].join(', ')}.`);
  if (state.magicItems.length) notes.push('Magic items are listed on the Magic Items tab.');
  if (state.weapons.length) notes.push('Weapons are listed on the Weapons tab.');
  if (totals.unweighed.length) notes.push(`No weight listed for: ${[...new Set(totals.unweighed)].join(', ')}.`);
  $('money-note').textContent = notes.join(' ');

  const count = state.inventory.reduce((n, e) => n + e.qty, 0);
  $('inventory-count').textContent = count ? `${count} item${count === 1 ? '' : 's'}` : '';
  const worn = [[view.gear.armor, state.armorEnh, state.armorMw, state.armorAbilities, state.armorCrafted],
                [view.gear.shield, state.shieldEnh, state.shieldMw, state.shieldAbilities, state.shieldCrafted]].filter(([a]) => a);
  invWhy.clear();
  $('inventory-rows').innerHTML = [
    ...worn.map(([a, enh, mw, abilities, crafted]) => {
      const key = a === view.gear.armor ? 'inv-armor' : 'inv-shield';
      const open = openLines.has(key);
      return `<div class="line-card"><div class="fit-line item-line">
          <b class="line-name">${esc(armorLabel(a, enh, mw, abilities))}</b><span class="wl-k">worn</span>
          <span class="wl-part"><b>${esc(formatGp(armorCost(a, enh, mw, abilities, crafted)))}</b></span>
          <span class="wl-k">${esc(formatLbs(a.weight_lbs * sizeFactor))}</span>
          <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="More about it">Details</button></div>
        <div class="line-more"${open ? '' : ' hidden'}>
          <div class="breakdown">worn${crafted ? ' · crafted' : ''} · change it on the Armor tab</div>
          <div class="line-controls"><span>Cost ${esc(formatGp(armorCost(a, enh, mw, abilities, crafted)))}
            <button type="button" class="skill-details" data-inv-why="${a === view.gear.armor ? 'price-armor' : 'price-shield'}" aria-label="How its price is worked out">Details</button></span></div>
        </div></div>`;
    }),
    ...state.inventory.map((e, i) => {
      const item = data.gearById.get(e.id);
      if (!item) return '';
      const s = entryStats(item, e.variant);
      // Its price and weight, each and in all, for the row's Details popup.
      invWhy.set(`inv-${i}`, { title: entryName(item, e.variant), rows: [
        { label: `Price each${e.variant ? ` (${e.variant.toLowerCase()} version)` : ''}`, text: s.price_gp !== null ? formatGp(s.price_gp) : 'not listed' },
        { label: 'Quantity', text: `× ${e.qty}` },
        { label: 'Price in all', text: s.price_gp !== null ? formatGp(s.price_gp * e.qty) : '—' },
        { label: 'Weight each', text: s.weight_lbs !== null ? formatLbs(s.weight_lbs) : 'not listed' },
        { label: 'Weight in all', text: s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—' },
      ], note: [`Counted in Equipment (gold) and Weight carried above.`, view.race.size === 'Small'
        ? 'Listed weights are for Medium characters; some gear made for Small characters (backpacks, bedrolls, clothing) weighs a quarter as much.' : '',
        item.category ? `Category: ${item.category}. ${item.source ? `Source: ${item.source}.` : ''}` : ''].filter(Boolean).join(' ') });
      // One line: the item, how many, cost and weight; Details opens how many, the cost breakdown and the item.
      const key = `gear-${i}`;
      const open = openLines.has(key);
      return `<div class="line-card"><div class="fit-line item-line">
          <button type="button" class="link item-link line-name" data-show-gear="${esc(item.id)}">${esc(entryName(item, e.variant))}</button>
          ${e.qty > 1 ? `<span class="wl-part">×${e.qty}</span>` : ''}
          <span class="wl-part"><b>${esc(s.price_gp !== null ? formatGp(s.price_gp * e.qty) : '—')}</b></span>
          <span class="wl-k">${esc(s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—')}</span>
          <button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(item.name)}">Details</button></div>
        <div class="line-more"${open ? '' : ' hidden'}>
          ${item.category ? `<div class="breakdown">${esc(item.category)}</div>` : ''}
          <div class="line-controls">
            <button type="button" class="skill-details" data-show-gear="${esc(item.id)}" aria-label="${esc(item.name)}">About it</button>
            <span class="base">How many
              <button type="button" data-qty="${i}" data-step="-1" aria-label="One fewer ${esc(item.name)}">−</button>
              <span class="value">${e.qty}</span>
              <button type="button" data-qty="${i}" data-step="1" aria-label="One more ${esc(item.name)}">+</button></span>
            <span>Cost ${esc(s.price_gp !== null ? formatGp(s.price_gp * e.qty) : '—')}
              <button type="button" class="skill-details" data-inv-why="inv-${i}" aria-label="Price and weight of ${esc(item.name)}">Details</button></span>
          </div></div></div>`;
    }),
  ].join('') || '<p class="hint">Nothing yet. Choose items below and add them.</p>';
  requestAnimationFrame(() => fitLines($('inventory-rows')));
}

function addToInventory(app, id, variant) {
  const inv = app.state.inventory.map(e => ({ ...e }));
  const existing = inv.find(e => e.id === id && (e.variant || null) === (variant || null));
  if (existing) existing.qty += 1;
  else inv.push({ id, ...(variant ? { variant } : {}), qty: 1 });
  app.update({ inventory: inv });
}

export function initEquipmentTab(app) {
  $('money-summary').addEventListener('click', e => {
    const b = e.target.closest('[data-money-details]');
    const d = b && moneyDetails[b.dataset.moneyDetails];
    if (!d) return;
    if (d.html) { app.openDetail(d.title, d.html); return; }
    const rows = d.rows.length ? d.rows.map(r => `<tr><td>${esc(r.label)}${r.note ? ` <small class="muted">(${esc(r.note)})</small>` : ''}</td>
      <td class="num">${esc(r.text)}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">Nothing yet.</td></tr>';
    app.openDetail(d.title, `<table class="skill-why"><tbody>${rows}</tbody>
      <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(d.total)}</b></td></tr></tfoot></table>${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
  });
  $('gear-search-form').addEventListener('submit', e => { e.preventDefault(); renderList(app); });
  $('gear-search').addEventListener('input', () => renderList(app));
  $('gear-category').addEventListener('change', e => {
    document.getElementById(`gear-cat-${e.target.value}`)?.scrollIntoView({ block: 'start' });
  });
  $('gear-list').addEventListener('click', e => {
    // Details: the item in a popup, with an Add button for each version.
    const pop = e.target.closest('[data-gear-pop]');
    if (pop) {
      const item = app.data.gearById.get(pop.dataset.gearPop);
      if (!item) return;
      const versions = item.variants || [];
      const actions = versions.length
        ? versions.map((v, n) => ({ label: `Add ${v.name.toLowerCase()} (${formatGp(v.price_gp)})`, primary: n === 0, run: () => addToInventory(app, item.id, v.name) }))
        : [{ label: 'Add to inventory', primary: true, run: () => addToInventory(app, item.id) }];
      app.openDetail(item.name, gearDetails(item, false), actions);
      return;
    }
    const btn = e.target.closest('[data-gear]');
    if (!btn) return;
    selectedId = btn.dataset.gear;
    renderPanel(app);
  });
  $('gear-panel').addEventListener('click', e => {
    const btn = e.target.closest('[data-add-gear]');
    if (btn) addToInventory(app, btn.dataset.addGear, btn.dataset.variant);
  });
  $('inventory-rows').addEventListener('click', e => {
    const why = e.target.closest('[data-inv-why]');
    if (why) {
      const key = why.dataset.invWhy;
      if (key.startsWith('price-')) { showArmorWhy(app, key); return; }
      const d = invWhy.get(key);
      if (d) app.openDetail(d.title, `<table class="skill-why"><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody></table>
        ${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
      return;
    }
    const step = e.target.closest('[data-qty]');
    if (step) {
      const inv = app.state.inventory.map(x => ({ ...x }));
      inv[Number(step.dataset.qty)].qty += Number(step.dataset.step);
      app.update({ inventory: inv.filter(x => x.qty > 0) });
    }
    const show = e.target.closest('[data-show-gear]');
    if (show) showGear(app, show.dataset.showGear);
  });
  $('gold').addEventListener('change', e => {
    const n = Number(e.target.value);
    app.update({ gold: Number.isFinite(n) && n >= 0 ? n : null });
  });
  $('gold-start').addEventListener('click', () => app.update({ gold: startingGold(app.view.cls, app.data.classes, !!app.state.houseRules.maxGold) }));
  $('gold-wealth').addEventListener('click', () => app.update({ gold: WEALTH_BY_LEVEL[app.state.level] }));
}

export async function renderEquipmentTab(app) {
  if (!app.data.gear) {
    $('gear-list').innerHTML = '<p class="hint">Loading equipment…</p>';
    await app.loadGear();
  }
  if (!listed) {
    listed = true;
    renderList(app);
  }
  await renderEquipment(app, app.view);
}

// Used by search: show an item in the side panel and scroll the list to it.
export async function showGear(app, id) {
  selectedId = id;
  await renderEquipmentTab(app);
  if ($('gear-search').value) {
    $('gear-search').value = '';
    renderList(app);
  }
  renderPanel(app);
  document.querySelector(`#gear-list [data-gear="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}
