// The Custom magic item builder (Magic Items tab, Custom button) and the custom items' rows in My magic items. The
// price rules are in custom-items.js. The item being made is kept here while the page is open; Add saves it to
// state.customItems.
import { $, esc } from './dom.js';
import { formatGp } from './equipment.js';
import { SLOTS, POWERS, powerByKind, OTHER_TYPES, ACTIVATIONS, DURATIONS, customItemPrice, customItemPaid } from './custom-items.js';
import { sellButton, sellItem } from './tab-equipment.js';

const ABILITIES = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
const newPower = kind => ({ kind, bonus: powerByKind.get(kind)?.bonuses?.[0] || 1, ability: 'str', type: 'insight', skill: 'Perception', sr: 13,
  spellName: '', spellLevel: 1, spellCl: 1, activation: 'use', perDay: 0, duration: 'none' });
let draft = null;      // the item being made or changed: { id (when changing one), name, slot, cl, powers, crafted, free, notes }
let adding = newPower('resistance');  // the power being set up in "Add a power"
const freshDraft = () => ({ id: '', name: '', slot: 'shoulders', cl: 1, powers: [], crafted: false, free: false, notes: '' });

const opts = (list, value) => list.map(([v, label]) => `<option value="${esc(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');

// The fields one power asks for (bonus, ability, bonus type, skill, SR, spell), with data-cp="field" for changes.
function powerFields(p, skills) {
  const def = powerByKind.get(p.kind);
  const asks = def.asks || [];
  return [
    def.bonuses ? `<label>Bonus <select data-cp="bonus">${opts(def.bonuses.map(b => [b, `+${b}`]), p.bonus)}</select></label>` : '',
    asks.includes('ability') ? `<label>Ability <select data-cp="ability">${opts(ABILITIES, p.ability)}</select></label>` : '',
    asks.includes('type') ? `<label>Bonus type <select data-cp="type">${opts(OTHER_TYPES.map(t => [t, t]), p.type)}</select></label>` : '',
    asks.includes('skill') ? `<label>Skill <select data-cp="skill">${opts(skills.map(s => [s, s]), p.skill)}</select></label>` : '',
    asks.includes('sr') ? `<label>Spell resistance <select data-cp="sr">${opts(Array.from({ length: 18 }, (_, i) => [13 + i, String(13 + i)]), p.sr)}</select></label>` : '',
    asks.includes('spell') ? `<label>Spell <input type="text" data-cp="spellName" value="${esc(p.spellName)}" placeholder="e.g. invisibility" maxlength="60"></label>
      <label>Spell level <select data-cp="spellLevel">${opts(Array.from({ length: 10 }, (_, i) => [i, String(i)]), p.spellLevel)}</select></label>
      <label>Caster level <select data-cp="spellCl">${opts(Array.from({ length: 20 }, (_, i) => [i + 1, String(i + 1)]), p.spellCl)}</select></label>
      <label>How it's used <select data-cp="activation">${opts(Object.entries(ACTIVATIONS).map(([k, [t]]) => [k, t]), p.activation)}</select></label>
      <label>Uses a day <select data-cp="perDay">${opts([[0, 'unlimited'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], p.perDay)}</select></label>
      ${p.activation === 'use' && !p.perDay ? `<label>Spell's duration (continuous) <select data-cp="duration">${opts(Object.entries(DURATIONS).map(([k, [t]]) => [k, t]), p.duration)}</select></label>` : ''}` : '',
  ].join('');
}

export function renderCustomBuilder(app, skills) {
  draft ??= freshDraft();
  const pr = customItemPrice(draft);
  const box = $('custom-wrap');
  if (!box) return;
  box.innerHTML = `<div class="custom-builder">
    <p class="hint">Make your own magic item, priced with the Core Rulebook's rules for new items (Table 15-29): choose what it
      does, and its bonuses count in your numbers while it's worn.</p>
    <div class="custom-grid">
      <label>Name <input type="text" data-ci="name" value="${esc(draft.name)}" placeholder="e.g. Ring of the Wary" maxlength="60"></label>
      <label>Slot <select data-ci="slot">${opts(SLOTS.map(s => [s, s]), draft.slot)}</select></label>
      <label>Caster level <select data-ci="cl">${opts(Array.from({ length: 20 }, (_, i) => [i + 1, String(i + 1)]), draft.cl)}</select></label>
    </div>
    <h3>What it does</h3>
    ${draft.powers.length ? `<ul class="plain-list custom-powers">${draft.powers.map((p, i) => `<li><span>${esc(powerByKind.get(p.kind).text(p))}</span>
      <b>${esc(formatGp(powerByKind.get(p.kind).price(p)))}</b> <button type="button" class="link" data-ci-remove="${i}">remove</button></li>`).join('')}</ul>`
      : '<p class="hint">Nothing yet: add a power below.</p>'}
    <div class="custom-add">
      <label>Add a power <select data-ca="kind">${opts(POWERS.map(p => [p.kind, p.label]), adding.kind)}</select></label>
      <div class="custom-grid">${powerFields(adding, skills).replaceAll('data-cp=', 'data-ca=')}</div>
      <button type="button" data-ci-add>Add this power (${esc(formatGp(powerByKind.get(adding.kind).price(adding)))})</button>
    </div>
    <h3>Price</h3>
    <table class="skill-why"><tbody>
      ${pr.lines.map((l, i) => `<tr><td>${esc(l.text)}${i > 0 ? ' (×1.5: another power)' : ''}</td><td class="num">${esc(formatGp(i > 0 ? l.gp * 1.5 : l.gp))}</td></tr>`).join('')}
      ${pr.slotless && pr.price ? '<tr><td>Slotless (no body slot): ×2</td><td class="num">×2</td></tr>' : ''}
      <tr><td><b>Market price</b></td><td class="num"><b>${esc(formatGp(pr.price))}</b></td></tr></tbody></table>
    <label class="check-row"><input type="checkbox" data-ci="crafted"${draft.crafted ? ' checked' : ''}> Crafted by the character: costs half (${esc(formatGp(pr.cost))})</label>
    <label class="check-row"><input type="checkbox" data-ci="free"${draft.free ? ' checked' : ''}> Free (found or a gift: no gold)</label>
    <label>Notes <textarea data-ci="notes" rows="2" maxlength="500" placeholder="What it looks like, where it came from...">${esc(draft.notes)}</textarea></label>
    <p class="hint">Costs ${esc(formatGp(customItemPaid(draft)))}${draft.free ? ' (free)' : draft.crafted ? ' (crafted)' : ''}. Check new items with your GM: the table is a guide.</p>
    <div class="line-controls">
      <button type="button" class="primary" data-ci-save${draft.powers.length ? '' : ' disabled'}>${draft.id ? 'Save changes' : 'Add to my magic items'}</button>
      <button type="button" data-ci-clear>${draft.id ? 'Stop changing it' : 'Clear'}</button></div></div>`;
}

// The custom items in My magic items: worn box, name, slot, cost, Sell; Edit and Remove under "?".
export function customRowsHtml(app, openLines) {
  return app.state.customItems.map((it, i) => {
    const key = `custom-${i}`;
    const open = openLines.has(key);
    const paid = customItemPaid(it) * it.qty;
    const pr = customItemPrice(it);
    return `<div class="line-card"><div class="fit-line item-line">
        <input type="checkbox" data-custom-worn="${i}"${it.off ? '' : ' checked'} aria-label="${esc(it.name)} worn (its bonuses count)" title="Worn: its bonuses count">
        <span class="line-name">${esc(it.name)}</span><span class="wl-k">${esc(it.slot)} · custom</span>${it.qty > 1 ? `<span class="wl-part">×${it.qty}</span>` : ''}
        <span class="wl-part"><b>${esc(formatGp(paid))}</b></span>
        ${pr.price ? sellButton(`data-custom-sell="${i}"`, it.name) : ''}
        <button type="button" class="skill-details q-details wl-more${open ? ' on' : ''}" data-line-more="${key}" aria-expanded="${open}" aria-label="Everything about ${esc(it.name)}" title="Details">?</button></div>
      <div class="line-more"${open ? '' : ' hidden'}>
        <div class="breakdown">${esc((it.powers || []).map(p => powerByKind.get(p.kind)?.text(p)).filter(Boolean).join('; '))} · caster level ${it.cl}
          · market price ${esc(formatGp(pr.price))}${it.free ? ' · free' : it.crafted ? ` · crafted (${esc(formatGp(pr.cost))})` : ''}</div>
        ${it.notes ? `<p class="hint">${esc(it.notes)}</p>` : ''}
        <div class="line-controls"><button type="button" data-custom-edit="${i}">Change it</button><button type="button" data-custom-remove="${i}">Remove</button></div>
      </div></div>`;
  }).join('');
}

// The builder's and the rows' controls. show(): opens the Custom part of the Add magic gear card.
export function initCustomItems(app, { skills, show }) {
  const redraw = () => renderCustomBuilder(app, skills());
  const box = $('custom-wrap');
  box.addEventListener('input', e => {
    const k = e.target.dataset.ci;
    if (k === 'name' || k === 'notes') draft[k] = e.target.value;
    const ca = e.target.dataset.ca;
    if (ca === 'spellName') adding.spellName = e.target.value;
  });
  box.addEventListener('change', e => {
    const t = e.target;
    const k = t.dataset.ci;
    if (k === 'slot') draft.slot = t.value;
    else if (k === 'cl') draft.cl = Number(t.value);
    else if (k === 'crafted' || k === 'free') draft[k] = t.checked;
    else if (t.dataset.ca === 'kind') adding = newPower(t.value);
    else if (t.dataset.ca && t.dataset.ca !== 'spellName') adding[t.dataset.ca] = ['ability', 'type', 'skill', 'activation', 'duration'].includes(t.dataset.ca) ? t.value : Number(t.value);
    else return;
    redraw();
  });
  box.addEventListener('click', e => {
    if (e.target.closest('[data-ci-add]')) { draft.powers.push({ ...adding }); redraw(); return; }
    const rm = e.target.closest('[data-ci-remove]');
    if (rm) { draft.powers.splice(Number(rm.dataset.ciRemove), 1); redraw(); return; }
    if (e.target.closest('[data-ci-clear]')) { draft = freshDraft(); redraw(); return; }
    if (e.target.closest('[data-ci-save]') && draft.powers.length) {
      const item = { ...draft, name: draft.name.trim() || 'Custom item', id: draft.id || `custom-${Date.now().toString(36)}`, qty: 1, off: false };
      const list = app.state.customItems;
      const at = list.findIndex(x => x.id === item.id);
      app.update({ customItems: at >= 0 ? list.map((x, j) => (j === at ? { ...x, ...item, qty: x.qty, off: x.off } : x)) : [...list, item] });
      draft = freshDraft();
      redraw();
      $('my-items-card')?.scrollIntoView({ block: 'start' });
    }
  });
  $('my-items-rows').addEventListener('change', e => {
    const w = e.target.closest('[data-custom-worn]');
    if (w) { const i = Number(w.dataset.customWorn); app.update({ customItems: app.state.customItems.map((x, j) => (j === i ? { ...x, off: !w.checked } : x)) }); }
  });
  $('my-items-rows').addEventListener('click', e => {
    const ed = e.target.closest('[data-custom-edit]');
    if (ed) { const it = app.state.customItems[Number(ed.dataset.customEdit)]; draft = { ...it, powers: it.powers.map(p => ({ ...p })) }; show(); redraw(); return; }
    const rm = e.target.closest('[data-custom-remove]');
    if (rm) {
      const i = Number(rm.dataset.customRemove);
      if (confirm(`Remove ${app.state.customItems[i].name}? (Sell gives gold for it instead.)`)) app.update({ customItems: app.state.customItems.filter((_, j) => j !== i) });
      return;
    }
    const sell = e.target.closest('[data-custom-sell]');
    if (sell) {
      const i = Number(sell.dataset.customSell);
      const it = app.state.customItems[i];
      sellItem(app, { name: it.name, value: customItemPrice(it).price, paid: customItemPaid(it), kind: 'magic' },
        { customItems: app.state.customItems.map((x, j) => (j === i ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0) });
    }
  });
}
