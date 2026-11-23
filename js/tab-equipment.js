// Equipment tab: browse mundane gear by category, keep an inventory, and track gold and weight.
import { chargedCosts } from './equipment.js';
import { customGearCost, customGearWeight } from './custom-gear.js';
import { customItemPaid } from './custom-items.js';
import { askAmount } from './amount-prompt.js';
import { openLines, fitLines, $, esc, paragraphs, facts, sourceText } from './dom.js';
import { wornPaid } from './equipment.js';
import { WEALTH_BY_LEVEL, goldForLeft, sellGold, startingGold, traitStartingGold, armorCost, equipmentTotals, magicItemTotals, magicItemStats, entryStats, formatGp, formatLbs,
         sizeWeightFactor } from './equipment.js';
import { weaponCost, weaponLabel, weaponWeight } from './weapons.js';
import { craftedItemCost, magicPrefix } from './crafting.js';
import { showArmorWhy } from './tab-armor.js';
import { carryingCapacity, encumbrance } from './rules.js';
import { bardingCost, companionSize } from './companion.js';
import { withMaterial } from './materials.js';
import { pickList } from './pick-list.js';

// What each money / weight total is made of (filled when the tab is drawn, shown by its Details button).
let moneyDetails = {};
// Each inventory row's price and weight, by key, for its Details popup.
const invWhy = new Map();

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const entryName = (item, variant) => (variant ? `${item.name} (${variant.toLowerCase()})` : item.name);

// "+1 fortification (light) Chainmail", "Masterwork Breastplate".
export function armorLabel(armor, enh, mw, abilities = []) {
  const prefix = magicPrefix(enh, mw && !armor.mw_included, abilities);
  return prefix ? `${prefix} ${armor.name}` : armor.name;
}

export function gearDetails(item, withButtons = true) {
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

// An item of equipment in a popup, with an Add button for each version. back: reopens the Add equipment list (after
// adding, and from Back to the list).
function popGear(app, id, back = null) {
  const item = app.data.gearById.get(id);
  if (!item) return;
  const versions = item.variants || [];
  const then = () => { if (back) back(); };
  const actions = [...(versions.length
    ? versions.map((v, n) => ({ label: `Add ${v.name.toLowerCase()} (${formatGp(v.price_gp)})`, primary: n === 0, run: () => { addToInventory(app, item.id, v.name); then(); } }))
    : [{ label: 'Add to inventory', primary: true, run: () => { addToInventory(app, item.id); then(); } }]),
    ...(back ? [{ label: 'Back to the list', run: back }] : [])];
  app.openDetail(item.name, gearDetails(item, false), actions);
}
// Add equipment: every item A to Z (its category and price under the name), and Make custom equipment.
function popGearPicker(app) {
  const have = new Set(app.state.inventory.map(e => e.id));
  pickList(app, { key: 'gear', title: 'Add equipment', placeholder: 'Search equipment by name', noun: 'items', limit: 1000,
    items: () => app.data.gear, mark: i => have.has(i.id),
    line: i => [i.category, i.price_gp !== null ? formatGp(i.price_gp) : (i.price || ''), i.weight_lbs ? formatLbs(i.weight_lbs) : ''].filter(Boolean).join(' · '),
    onPick: (id, back) => popGear(app, id, back),
    foot: '<p class="hint">Tap an item to read it and add it to your inventory. Not here? Make your own:</p>',
    actions: [{ label: 'Make custom equipment', run: () => { gearDraft = freshGear(); customOpen = true; renderGearButtons(app); $('gear-add-card').scrollIntoView({ block: 'start' }); } }] });
}

// The Add equipment card: Add equipment (the list popup), and the Custom equipment builder when it's open.
let customOpen = false;
let gearDraft = null;  // the custom item being made or changed: { id, name, price, weight, qty, free, notes }
const freshGear = () => ({ id: '', name: '', price: 0, weight: 0, qty: 1, free: false, notes: '' });
function renderGearButtons(app) {
  $('gear-add-buttons').innerHTML = '<button type="button" class="primary" data-gear-choose>Add equipment</button>';
  $('gear-custom-wrap').hidden = !customOpen;
  if (customOpen) renderGearCustom();
}
function renderGearCustom() {
  gearDraft ??= freshGear();
  const g = gearDraft;
  $('gear-custom-wrap').innerHTML = `<div class="custom-builder">
    <div class="custom-grid">
      <label>Name <input type="text" data-cg="name" value="${esc(g.name)}" placeholder="e.g. Grandfather's pipe" maxlength="60"></label>
      <label>Price each (gp) <input type="number" data-cg="price" value="${g.price}" min="0" step="0.01" inputmode="decimal"></label>
      <label>Weight each (lbs.) <input type="number" data-cg="weight" value="${g.weight}" min="0" step="0.1" inputmode="decimal"></label>
      <label>How many <input type="number" data-cg="qty" value="${g.qty}" min="1" step="1" inputmode="numeric"></label>
    </div>
    <label class="check-row"><input type="checkbox" data-cg="free"${g.free ? ' checked' : ''}> Free (found or a gift: no gold)</label>
    <label>Notes <textarea data-cg="notes" rows="2" maxlength="500" placeholder="What it is, what it does...">${esc(g.notes)}</textarea></label>
    <div class="line-controls"><button type="button" class="primary" data-cg-save>${g.id ? 'Save changes' : 'Add to my inventory'}</button>
      <button type="button" data-cg-clear>${g.id ? 'Stop changing it' : 'Clear'}</button>
      <button type="button" data-cg-cancel>Cancel</button></div></div>`;
}


// Money, weight and the inventory table. Needs the equipment data, so it waits for it on first use.
// A "Free" tick box: found, a gift or from a class feature, so it costs no gold.
// The gold entered (or the class's starting gold, with traits, when none is).
export function goldNow(app) {
  const { state, data, view } = app;
  return state.gold ?? traitStartingGold(startingGold(view.cls, data.classes, !!state.houseRules.maxGold), view.traits).gp ?? 0;
}

// A Sell button for an item line (attr: its data attribute), and selling one: after a yes, `change` (the state with the
// item gone or one fewer) is saved with half its market value (value, each) added to gold. paid: what it cost (0 if found).
export const sellButton = (attr, name) => `<button type="button" class="wl-sell" ${attr} aria-label="Sell ${esc(name)} for half its price">Sell</button>`;
// The Sell box shows half its price, filled in, which can be changed for a better (or worse) deal. kind: armor, gear,
// weapons or magic: a kind set to cost nothing (Costs and adjustments) never took its price, so none comes back off.
export async function sellItem(app, { name, value, paid, kind = '' }, change) {
  if (!value) { alert(`${name} has no price listed, so it can't be sold here: remove it and add the gold by hand.`); return; }
  const half = Math.round(value * 50) / 100;
  const gets = await askAmount({ title: `Sell ${name}`, message: `Half its price: ${formatGp(half)}`, label: 'Sell it for (gp)', value: half, decimals: true, ok: 'Sell',
    hint: `It's worth ${formatGp(value)}; half is the usual price. Haggled for more (or less)? Change the amount. It comes off your list and the gold is added.` });
  if (gets === null) return;
  const { gold } = sellGold(goldNow(app), value, app.state.noCharge?.[kind] ? 0 : paid, gets);
  app.update({ ...change, gold });
}

// Money now (the Equipment tab, and the Wealth popup on the Character tab's banner): starting gold, the gold entered (or
// the starting gold), what's been spent on armor, equipment, weapons and magic items, and what's left. Needs the
// equipment data (data.gear): null until it's loaded.
export function moneyNow(app, view = app.view) {
  const { state, data } = app;
  if (!data.gear) return null;
  const maxGold = !!state.houseRules.maxGold;
  // The class's starting gold, changed by traits like Rich Parents (traitStartingGold).
  const classStart = startingGold(view.cls, data.classes, maxGold);
  const traitGold = traitStartingGold(classStart, view.traits);
  const start = traitGold.gp;
  const wealth = WEALTH_BY_LEVEL[state.level];
  const gold = state.gold ?? start ?? 0;

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
    cost: wornPaid(armorCost(a, state[`${k}Enh`], state[`${k}Mw`], state[`${k}Abilities`], state[`${k}Crafted`]), { free: state[`${k}Free`], paid: state[`${k}Paid`], id: state[`${k}Id`] }),
    plain: armorCost(a, state[`${k}Enh`], state[`${k}Mw`]),
    weight: (a.weight_lbs || 0) * sizeFactor, crafted: state[`${k}Crafted`],
  }));
  // The animal companion's barding (bought like armor; the animal carries it, not you).
  const compAnimal = view.companion?.level && data.companions?.animals.find(a => a.id === state.companion.animal);
  const barding = compAnimal && data.armorById.get(state.companion.armorId)
    && (withMaterial(data.armorById.get(state.companion.armorId), state.companion.armorMaterial) || data.armorById.get(state.companion.armorId));
  const bardingRow = barding ? { name: `Barding for ${state.companion.name || compAnimal.name}: ${barding.name}${state.companion.armorEnh ? ` +${state.companion.armorEnh}` : ''}`,
    cost: bardingCost(barding, companionSize(compAnimal, view.companion.level), state.companion.armorEnh || 0), weight: null } : null;
  const armorListed = wornItems.reduce((n, x) => n + x.cost, 0) + (bardingRow?.cost || 0);
  // (Raw materials for things being made on the Craft tab count with equipment until they're finished.)
  const gearListed = totals.cost - wornItems.reduce((n, x) => n + x.plain, 0) + (state.craftProjects || []).reduce((n, p) => n + (p.spent || 0), 0)
    + customGearCost(state.customGear);
  const listedMagic = data.itemsById ? magicItemTotals(state.magicItems, data.itemsById) : { cost: 0, weight: 0, unpriced: [] };
  // Potions, scrolls and wands the character made count at their crafting cost.
  const made = state.craftedItems.reduce((n, e) => n + craftedItemCost(e) * e.qty, 0)
    + (state.customItems || []).reduce((n, e) => n + customItemPaid(e) * e.qty, 0);
  const carried = state.weapons.map(e => [data.weaponsById?.get(e.id), e]).filter(([w]) => w);
  const weaponListed = carried.reduce((sum, [w, e]) => sum + weaponCost(w, e), 0);
  const weaponsWeight = carried.reduce((sum, [w, e]) => sum + weaponWeight(w, e, view.race.size), 0);
  // What's charged: kinds switched to cost nothing come to 0; hand adjustments add gold back (or take more).
  const listed = { armor: armorListed, gear: gearListed, weapons: weaponListed, magic: listedMagic.cost + made };
  const charged = chargedCosts(listed, state.noCharge || {}, state.costAdjust || []);
  const armorSpend = charged.armor, gearSpend = charged.gear, weaponSpend = charged.weapons;
  const magic = { ...listedMagic, cost: charged.magic };
  const left = Math.round((gold - charged.spent) * 100) / 100;
  return { maxGold, classStart, traitGold, start, wealth, gold, totals, sizeFactor, wornItems, compAnimal, barding, bardingRow, armorSpend, gearSpend, listedMagic, made, magic, carried, weaponSpend, weaponsWeight, left,
           listed, adjust: charged.adjust, noCharge: state.noCharge || {} };
}

// What the character has spent (Gold − Left), from the last draw: the "Gold left now" box adds it to what's typed.
let spentNow = 0;

export const freeBox = (attr, on) => `<label class="check-row small free-box"><input type="checkbox" ${attr}${on ? ' checked' : ''}> Free (found or a gift: no gold)</label>`;

export async function renderEquipment(app, view) {
  const { state, data } = app;
  if (!data.gear || (state.magicItems.length && !data.itemsById) || (state.weapons.length && !data.weaponsById)) {
    $('inventory-rows').innerHTML = '<p class="hint">Loading equipment…</p>';
    await Promise.all([app.loadGear(), state.magicItems.length ? app.loadItems() : null,
                       state.weapons.length ? app.loadWeapons() : null]);
    view = app.view;
  }
  const m = moneyNow(app, view);
  const { maxGold, classStart, traitGold, start, wealth, gold, totals, sizeFactor, wornItems, compAnimal, barding, bardingRow, armorSpend, gearSpend, listedMagic, made, magic, carried, weaponSpend, weaponsWeight, left } = m;
  $('gold-start').textContent = start ? `Use ${view.cls.name.toLowerCase()} ${maxGold ? 'maximum ' : ''}starting gold${traitGold.lines.length ? ' with traits' : ''} (${formatGp(start)})` : 'No starting gold listed';
  $('gold-start').disabled = !start;
  $('gold-wealth').hidden = !wealth;
  if (wealth) $('gold-wealth').textContent = `Use wealth for level ${state.level} (${formatGp(wealth)})`;
  if (document.activeElement !== $('gold')) $('gold').value = gold;
  // "Gold left now": typing the gold you have sets Gold to it plus what's been spent.
  spentNow = Math.round((gold - left) * 100) / 100;
  if (document.activeElement !== $('gold-left')) $('gold-left').value = left;
  const carriedWeight = totals.weight + magic.weight + weaponsWeight + customGearWeight(state.customGear);

  // What each total is made of, for its Details popup.
  const gearRows = state.inventory.map(e => {
    const item = data.gearById.get(e.id);
    if (!item) return null;
    const st = entryStats(item, e.variant);
    return { label: `${entryName(item, e.variant)}${e.qty > 1 ? ` ×${e.qty}` : ''}`, cost: e.free ? 0 : (st.price_gp || 0) * e.qty, note: e.free ? 'free' : '',
             weight: st.weight_lbs === null ? null : st.weight_lbs * e.qty };
  }).filter(Boolean);
  const magicRows = [
    ...state.magicItems.map(e => {
      const item = data.itemsById?.get(e.id);
      if (!item) return null;
      const st = magicItemStats(item, e.option);
      return { label: `${item.name}${e.option ? ` (${e.option})` : ''}${e.qty > 1 ? ` ×${e.qty}` : ''}`, cost: e.free ? 0 : (st.price_gp || 0) * e.qty, note: e.free ? 'free' : '',
               weight: st.weight_lbs === null ? null : st.weight_lbs * e.qty };
    }).filter(Boolean),
    ...state.craftedItems.map(e => ({ label: `${e.kind[0].toUpperCase()}${e.kind.slice(1)} of ${e.spellName}${e.qty > 1 ? ` ×${e.qty}` : ''}`,
                                       cost: craftedItemCost(e) * e.qty, note: e.bought ? '' : 'crafting cost', weight: null })),
  ];
  const weaponRows = carried.map(([w, e]) => ({ label: weaponLabel(w, e), cost: weaponCost(w, e), note: e.free ? 'free' : '', weight: weaponWeight(w, e, view.race.size) }));
  const armorRows = [...wornItems.map(x => ({ label: x.name, cost: x.cost, note: x.cost === 0 && x.plain ? 'free' : x.crafted ? 'crafted: magic at half price' : '', weight: x.weight })),
    ...(bardingRow ? [{ label: bardingRow.name, cost: bardingRow.cost, note: 'worn by your companion', weight: null }] : [])];
  const money = rows => rows.map(r => ({ label: r.label, text: formatGp(r.cost), note: r.note }));
  moneyDetails = {
    armor: { title: `Armor and shield: ${formatGp(armorSpend)}`, rows: money(armorRows), total: formatGp(armorSpend) },
    gear: { title: `Equipment: ${formatGp(gearSpend)}`, rows: money(gearRows), total: formatGp(gearSpend) },
    weapons: { title: `Weapons: ${formatGp(weaponSpend)}`, rows: money(weaponRows), total: formatGp(weaponSpend) },
    magic: { title: `Magic items: ${formatGp(magic.cost)}`, rows: money(magicRows), total: formatGp(magic.cost) },
    left: { title: `Left: ${formatGp(left)}`, total: formatGp(left), rows: [
      { label: state.gold === null ? `Gold (${view.cls ? `${view.cls.name.toLowerCase()} starting gold` : 'no class yet'})` : 'Gold', text: formatGp(gold) },
      { label: 'Armor and shield', text: `− ${formatGp(armorSpend)}` }, { label: 'Equipment', text: `− ${formatGp(gearSpend)}` },
      { label: 'Weapons', text: `− ${formatGp(weaponSpend)}` }, { label: 'Magic items', text: `− ${formatGp(magic.cost)}` },
      ...(m.adjust ? [{ label: 'Adjustments (Costs and adjustments)', text: `${m.adjust > 0 ? '+' : '−'} ${formatGp(Math.abs(m.adjust))}` }] : [])] },
    weight: { title: `Weight carried: ${formatLbs(carriedWeight)}`, total: formatLbs(carriedWeight),
      rows: [...armorRows.filter(r => r.weight !== null), ...weaponRows, ...gearRows, ...magicRows.filter(r => r.weight !== null)]
        .map(r => ({ label: r.label, text: r.weight === null ? 'no weight listed' : formatLbs(r.weight) })),
      note: 'Coins are not counted.' },
  };
  // Gold: the class's starting gold and the wealth-by-level table (your level marked).
  const sw = view.cls?.starting_wealth;
  moneyDetails.gold = { title: `Gold: ${formatGp(gold)}`, html: `
    <p>${state.gold === null ? `You haven't entered an amount, so your ${esc((view.cls?.name || 'class').toLowerCase())} starting gold is used.` : 'The amount you entered.'}
      Everything bought (armor, weapons, equipment, magic items) is taken from it in <b>Left</b>.</p>
    <h3>Starting gold (1st level)</h3>
    <p>${classStart ? `${esc(view.cls.name)}: ${sw?.dice ? `${esc(sw.dice)}, ` : ''}${maxGold ? `maximum ${esc(formatGp(classStart))} (Max Starting Gold house rule; the average is ${esc(formatGp(startingGold(view.cls, data.classes)))})` : `average ${esc(formatGp(classStart))}`}${!sw?.average_gp ? ' (from the class it\u2019s based on)' : ''}.` : 'No starting gold is listed for this class.'}</p>
    ${traitGold.lines.length ? `<table class="skill-why"><tbody><tr><td>${esc(view.cls.name)}</td><td class="num">${esc(formatGp(classStart))}</td></tr>
      ${traitGold.lines.map(l => `<tr><td>Trait: ${esc(l.name)}</td><td class="num">${esc(l.text)}</td></tr>`).join('')}
      <tr><td><b>Starting gold</b></td><td class="num"><b>${esc(formatGp(start))}</b></td></tr></tbody></table>` : ''}
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
      ${state.houseRules.encumbrance ? 'The Encumbrance house rule is on, so its effects count in your numbers.' : 'Switch on the Encumbrance house rule (Build tab) to count its effects.'}</p>
    <p class="hint">Strength here includes active effects. Small characters carry ¾ as much, Large ones twice as much. A load\u2019s
      Dex limit and check penalty don\u2019t add to armor\u2019s: the worse counts.</p>` };
  const details = key => ` <button type="button" class="skill-details q-details" data-money-details="${key}" aria-label="What makes up this total" title="Details">?</button>`;
  $('money-summary').innerHTML = [
    ['Gold', esc(formatGp(gold)) + details('gold')],
    ['Armor and shield', esc(formatGp(armorSpend)) + details('armor')],
    ['Equipment', esc(formatGp(gearSpend)) + details('gear')],
    ['Weapons', esc(formatGp(weaponSpend)) + details('weapons')],
    ['Magic items', esc(formatGp(magic.cost)) + details('magic')],
    ...(m.adjust ? [['Adjustments', esc(`${m.adjust > 0 ? '+' : '−'} ${formatGp(Math.abs(m.adjust))}`)]] : []),
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
  const free = [['armor', 'armor and shield'], ['gear', 'equipment'], ['weapons', 'weapons'], ['magic', 'magic items']].filter(([k]) => m.noCharge[k]).map(([, t]) => t);
  if (free.length) notes.push(`Not charged (Costs and adjustments): ${free.join(', ')}.`);
  $('money-note').textContent = notes.join(' ');

  const count = state.inventory.reduce((n, e) => n + e.qty, 0);
  $('inventory-count').textContent = count ? `${count} item${count === 1 ? '' : 's'}` : '';
  const worn = [[view.gear.armor, state.armorEnh, state.armorMw, state.armorAbilities, state.armorCrafted],
                [view.gear.shield, state.shieldEnh, state.shieldMw, state.shieldAbilities, state.shieldCrafted]].filter(([a]) => a);
  invWhy.clear();
  $('inventory-rows').innerHTML = [
    ...worn.map(([a, enh, mw, abilities, crafted]) => {
      const key = a === view.gear.armor ? 'inv-armor' : 'inv-shield';
      const k = a === view.gear.armor ? 'armor' : 'shield';
      const open = openLines.has(key);
      const cost = wornPaid(armorCost(a, enh, mw, abilities, crafted), { free: state[`${k}Free`], paid: state[`${k}Paid`], id: state[`${k}Id`] });
      return `<div class="line-card"><div class="fit-line item-line">
          <b class="line-name">${esc(armorLabel(a, enh, mw, abilities))}</b><span class="wl-k">worn</span>
          <span class="wl-part"><b>${esc(state[`${k}Free`] ? 'free' : formatGp(cost))}</b></span>
          <span class="wl-k">${esc(formatLbs(a.weight_lbs * sizeFactor))}</span>
          ${armorCost(a, enh, mw, abilities, false) ? sellButton(`data-armor-sell="${k}"`, armorLabel(a, enh, mw, abilities)) : ''}
          <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="More about it" title="Details">?</button></div>
        <div class="line-more"${open ? '' : ' hidden'}>
          <div class="breakdown">worn${crafted ? ' · crafted' : ''} · change it on the Armor tab</div>
          <div class="line-controls"><span>Cost ${esc(formatGp(cost))}
            <button type="button" class="skill-details q-details" data-inv-why="${a === view.gear.armor ? 'price-armor' : 'price-shield'}" aria-label="How its price is worked out" title="Details">?</button></span>
            ${freeBox(`data-armor-free="${k}"`, state[`${k}Free`])}</div>
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
          <span class="wl-part"><b>${esc(e.free ? 'free' : s.price_gp !== null ? formatGp(s.price_gp * e.qty) : '—')}</b></span>
          <span class="wl-k">${esc(s.weight_lbs !== null ? formatLbs(s.weight_lbs * e.qty) : '—')}</span>
          ${s.price_gp ? sellButton(`data-inv-sell="${i}"`, entryName(item, e.variant)) : ''}
          <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(item.name)}" title="Details">?</button></div>
        <div class="line-more"${open ? '' : ' hidden'}>
          ${item.category ? `<div class="breakdown">${esc(item.category)}</div>` : ''}
          <div class="line-controls">
            <button type="button" class="skill-details" data-show-gear="${esc(item.id)}" aria-label="${esc(item.name)}">About it</button>
            <span class="base">How many
              <button type="button" data-qty="${i}" data-step="-1" aria-label="One fewer ${esc(item.name)}">−</button>
              <span class="value">${e.qty}</span>
              <button type="button" data-qty="${i}" data-step="1" aria-label="One more ${esc(item.name)}">+</button></span>
            <span>Cost ${esc(e.free ? 'free' : s.price_gp !== null ? formatGp(s.price_gp * e.qty) : '—')}
              <button type="button" class="skill-details q-details" data-inv-why="inv-${i}" aria-label="Price and weight of ${esc(item.name)}" title="Details">?</button></span>
            ${freeBox(`data-inv-free="${i}"`, e.free)}
          </div></div></div>`;
    }),
    // Custom equipment (Add equipment, Custom): its own price and weight; Change it and Remove under its ?.
    ...(state.customGear || []).map((g, i) => {
      const key = `cgear-${i}`;
      const open = openLines.has(key);
      return `<div class="line-card"><div class="fit-line item-line">
          <span class="line-name">${esc(g.name)}</span><span class="wl-k">custom</span>${g.qty > 1 ? `<span class="wl-part">×${g.qty}</span>` : ''}
          <span class="wl-part"><b>${esc(g.free ? 'free' : formatGp(g.price * g.qty))}</b></span>
          <span class="wl-k">${esc(formatLbs(g.weight * g.qty))}</span>
          ${g.price ? sellButton(`data-cgear-sell="${i}"`, g.name) : ''}
          <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(g.name)}" title="Details">?</button></div>
        <div class="line-more"${open ? '' : ' hidden'}>
          ${g.notes ? `<p class="hint">${esc(g.notes)}</p>` : ''}
          <div class="line-controls">
            <span class="base">How many
              <button type="button" data-cgear-qty="${i}" data-step="-1" aria-label="One fewer ${esc(g.name)}">−</button>
              <span class="value">${g.qty}</span>
              <button type="button" data-cgear-qty="${i}" data-step="1" aria-label="One more ${esc(g.name)}">+</button></span>
            <span>${esc(formatGp(g.price))} and ${esc(formatLbs(g.weight))} each</span>
            ${freeBox(`data-cgear-free="${i}"`, g.free)}
            <button type="button" data-cgear-edit="${i}">Change it</button><button type="button" data-cgear-remove="${i}">Remove</button>
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
  // Add equipment opens the list popup.
  $('gear-add-buttons').addEventListener('click', e => { if (e.target.closest('[data-gear-choose]')) popGearPicker(app); });
  $('gear-custom-wrap').addEventListener('input', e => {
    const k = e.target.dataset.cg;
    if (!k || k === 'free') return;
    gearDraft[k] = ['price', 'weight', 'qty'].includes(k) ? Math.max(k === 'qty' ? 1 : 0, Number(e.target.value) || 0) : e.target.value;
  });
  $('gear-custom-wrap').addEventListener('change', e => { if (e.target.dataset.cg === 'free') gearDraft.free = e.target.checked; });
  $('gear-custom-wrap').addEventListener('click', e => {
    if (e.target.closest('[data-cg-clear]')) { gearDraft = freshGear(); renderGearCustom(); return; }
    if (e.target.closest('[data-cg-cancel]')) { gearDraft = freshGear(); customOpen = false; renderGearButtons(app); return; }
    if (!e.target.closest('[data-cg-save]')) return;
    const g = { ...gearDraft, name: gearDraft.name.trim() || 'Custom item', id: gearDraft.id || `cgear-${Date.now().toString(36)}` };
    const list = app.state.customGear || [];
    const at = list.findIndex(x => x.id === g.id);
    app.update({ customGear: at >= 0 ? list.map((x, j) => (j === at ? g : x)) : [...list, g] });
    gearDraft = freshGear();
    customOpen = false;
    renderGearButtons(app);
    $('inventory-rows').closest('section').scrollIntoView({ block: 'start' });
  });
  // Free: found or a gift, so it costs no gold (gear, and the worn armor or shield).
  $('inventory-rows').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.invFree !== undefined) {
      const i = Number(t.dataset.invFree);
      app.update({ inventory: app.state.inventory.map((x, j) => { if (j !== i) return x; const { free, ...rest } = x; return t.checked ? { ...rest, free: true } : rest; }) });
    }
    if (t.dataset.armorFree) app.update({ [`${t.dataset.armorFree}Free`]: t.checked });
  });
  // Custom equipment's controls in the inventory.
  $('inventory-rows').addEventListener('change', e => {
    const f = e.target.closest('[data-cgear-free]');
    if (f) { const i = Number(f.dataset.cgearFree); app.update({ customGear: app.state.customGear.map((x, j) => (j === i ? { ...x, free: f.checked } : x)) }); }
  });
  $('inventory-rows').addEventListener('click', e => {
    const cq = e.target.closest('[data-cgear-qty]');
    if (cq) {
      const i = Number(cq.dataset.cgearQty);
      app.update({ customGear: app.state.customGear.map((x, j) => (j === i ? { ...x, qty: x.qty + Number(cq.dataset.step) } : x)).filter(x => x.qty > 0) });
      return;
    }
    const ce = e.target.closest('[data-cgear-edit]');
    if (ce) { gearDraft = { ...app.state.customGear[Number(ce.dataset.cgearEdit)] }; customOpen = true; renderGearButtons(app); $('gear-add-card').scrollIntoView({ block: 'start' }); return; }
    const cr = e.target.closest('[data-cgear-remove]');
    if (cr) {
      const i = Number(cr.dataset.cgearRemove);
      if (confirm(`Remove ${app.state.customGear[i].name}? (Sell gives gold for it instead.)`)) app.update({ customGear: app.state.customGear.filter((_, j) => j !== i) });
      return;
    }
    const cs = e.target.closest('[data-cgear-sell]');
    if (cs) {
      const i = Number(cs.dataset.cgearSell);
      const g = app.state.customGear[i];
      sellItem(app, { name: g.name, value: g.price, paid: g.free ? 0 : g.price, kind: 'gear' },
        { customGear: app.state.customGear.map((x, j) => (j === i ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0) });
      return;
    }
    const why = e.target.closest('[data-inv-why]');
    if (why) {
      const key = why.dataset.invWhy;
      if (key.startsWith('price-')) { showArmorWhy(app, key); return; }
      const d = invWhy.get(key);
      if (d) app.openDetail(d.title, `<table class="skill-why"><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody></table>
        ${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
      return;
    }
    // Selling the worn armor or shield: half its market price (material, enhancement and abilities; a crafted one gives
    // back what it cost to make), and it's taken off (no armor or shield worn).
    const asell = e.target.closest('[data-armor-sell]');
    if (asell) {
      const k = asell.dataset.armorSell;
      const v = app.view;
      const a = k === 'armor' ? v.gear.armor : v.gear.shield;
      const st = app.state;
      const args = [a, st[`${k}Enh`], st[`${k}Mw`], st[`${k}Abilities`]];
      sellItem(app, { name: armorLabel(...args), value: armorCost(...args, false), paid: wornPaid(armorCost(...args, st[`${k}Crafted`]), { free: st[`${k}Free`], paid: st[`${k}Paid`], id: st[`${k}Id`] }), kind: 'armor' },
        { [`${k}Id`]: '', [`${k}Enh`]: 0, [`${k}Mw`]: false, [`${k}Abilities`]: [], [`${k}Material`]: '', [`${k}Crafted`]: false, [`${k}Free`]: false, [`${k}Paid`]: null });
      return;
    }
    const sell = e.target.closest('[data-inv-sell]');
    if (sell) {
      const i = Number(sell.dataset.invSell);
      const x = app.state.inventory[i];
      const item = app.data.gearById.get(x.id);
      const s = entryStats(item, x.variant);
      const inv = app.state.inventory.map((y, j) => (j === i ? { ...y, qty: y.qty - 1 } : y)).filter(y => y.qty > 0);
      sellItem(app, { name: entryName(item, x.variant), value: s.price_gp, paid: x.free ? 0 : s.price_gp, kind: 'gear' }, { inventory: inv });
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
  $('gold-left').addEventListener('change', e => {
    const g = goldForLeft(e.target.value, spentNow);
    if (g !== null) app.update({ gold: g });
  });
  $('gold').addEventListener('change', e => {
    const n = Number(e.target.value);
    app.update({ gold: Number.isFinite(n) && n >= 0 ? n : null });
  });
  $('money-adjust').addEventListener('click', () => app.popWealth());
  $('gold-start').addEventListener('click', () => app.update({ gold: traitStartingGold(startingGold(app.view.cls, app.data.classes, !!app.state.houseRules.maxGold), app.view.traits).gp }));
  $('gold-wealth').addEventListener('click', () => app.update({ gold: WEALTH_BY_LEVEL[app.state.level] }));
}

export async function renderEquipmentTab(app) {
  if (!app.data.gear) {
    $('gear-add-buttons').innerHTML = '<p class="hint">Loading equipment…</p>';
    await app.loadGear();
  }
  renderGearButtons(app);
  await renderEquipment(app, app.view);
}

// Used by search and the inventory: an item in a popup, with its Add buttons.
export async function showGear(app, id) {
  if (!app.data.gear) await app.loadGear();
  popGear(app, id);
}
