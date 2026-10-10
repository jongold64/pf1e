// Magic items and special abilities as effects, drawn the same way on the Active effects card and the Magic Items tab:
// a row per item you own (worn box, what it gives, a box for each bonus that applies only sometimes, Details), what an
// item gives, and an owned item's popup with its description.
import { esc, paragraphs, facts } from './dom.js';
import { buffById, TARGET_NAMES, buffAmount, effectMods } from './effects.js';
import { itemEffects, rowBuff, itemAmount, rowOn, abilityEntries } from './item-effects.js';

const signedN = n => (n > 0 ? `+${n}` : String(n));

// "+4 enhancement strength" for a buff at a caster level or amount.
export function buffSummary(buff, cl) {
  const flags = { noDexAc: 'no Dex bonus to AC', halfSpeed: 'half speed' };
  return [...buff.bonuses(buffAmount(buff, cl), effectMods()).map(x => `${signedN(x.value)} ${x.type} ${TARGET_NAMES[x.target].toLowerCase()}`),
          ...(buff.flags || []).map(f => flags[f])].join(', ') || 'see Details';
}

const entryName = (item, e) => (e.option ? `${item.name} (${e.option})` : item.name);

// Everything you own that can give effects: magic items ('m:<index>') and the special abilities on your worn armor
// ('armor:<j>'), shield ('shield:<j>') and weapons ('weapon:<i>:<j>'). `where` names the armor or weapon it's on.
export function ownedSources(state, data) {
  if (!data.itemsById) return [];
  const items = state.magicItems.map((e, i) => ({ ref: `m:${i}`, entry: e, item: data.itemsById.get(e.id), worn: true }));
  const abilities = abilityEntries(state, data.weaponsById).map(e => ({ ref: e.ref, entry: e, item: data.itemsById.get(e.id), where: e.where }));
  return [...items, ...abilities].filter(x => x.item);
}

// The entry a source ref points at, changed by f (magic items, or an ability on the armor, shield or a weapon).
export function updateSource(app, ref, f) {
  const { state } = app;
  const [kind, a, b] = ref.split(':');
  const i = Number(a);
  if (kind === 'm') app.update({ magicItems: state.magicItems.map((x, j) => (j === i ? f(x) : x)) });
  else if (kind === 'armor' || kind === 'shield') app.update({ [`${kind}Abilities`]: state[`${kind}Abilities`].map((x, j) => (j === i ? f(x) : x)) });
  else if (kind === 'weapon') {
    const k = Number(b);
    app.update({ weapons: state.weapons.map((w, j) => (j === i ? { ...w, abilities: (w.abilities || []).map((x, m) => (m === k ? f(x) : x)) } : w)) });
  }
}

// Worn or not (magic items), a sometimes-bonus on or off, the chosen effect (belt of physical might).
const setWorn = worn => x => { const { off, ...rest } = x; return worn ? rest : { ...rest, off: true }; };
const setOn = (key, on) => x => {
  const list = (x.on || []).filter(k => k !== key);
  const { on: _, ...rest } = x;
  return on ? { ...rest, on: [...list, key] } : list.length ? { ...rest, on: list } : rest;
};

// One item's row: its worn box (magic items), name, what it gives, Details, a choice, and a box for each sometimes-bonus.
// compact: without the name and worn box (the Magic Items tab's line already has them).
export function itemRowHtml(src, { compact = false } = {}) {
  const { ref, entry: e, item } = src;
  const name = src.where ? `${entryName(item, e)} (on your ${src.where})` : entryName(item, e);
  const effects = itemEffects(item, e.option);
  const always = effects.filter(r => !r.when);
  const sometimes = effects.filter(r => r.when);
  const summary = r => { const buff = buffById.get(rowBuff(r, e)); return `${r.choices || buff.group === 'item' ? '' : `${buff.name}: `}${buffSummary(buff, itemAmount(buff, item, e.option))}`; };
  const what = always.map(summary).join('; ') || (sometimes.length ? 'only sometimes (below)' : 'no bonuses to count: see Details');
  const pick = always.find(r => r.choices);
  const head = compact ? `<div class="small"><b>Gives:</b> ${esc(what)}</div>` : src.worn
    ? `<label class="check-row small"><input type="checkbox" data-src-worn="${ref}"${e.off ? '' : ' checked'}>
        <span><b>${esc(name)}</b> <small class="muted">${esc(what)}</small></span>
        <button type="button" class="skill-details" data-src-pop="${ref}" aria-label="${esc(name)}: its description">Details</button></label>`
    : `<div class="check-row small"><span class="tick" aria-hidden="true">✓</span>
        <span><b>${esc(name)}</b> <small class="muted">${esc(what)}</small></span>
        <button type="button" class="skill-details" data-src-pop="${ref}" aria-label="${esc(name)}: its description">Details</button></div>`;
  const notes = always.map(r => buffById.get(rowBuff(r, e)).note).filter(Boolean);
  return `<li class="${e.off ? 'kept' : 'on'}">${head}
    ${pick ? `<label class="cl-input">which <select data-src-pick="${ref}">${pick.choices.map(id => `<option value="${esc(id)}"${id === rowBuff(pick, e) ? ' selected' : ''}>${esc(buffById.get(id).name)}</option>`).join('')}</select></label>` : ''}
    ${sometimes.map(r => { const buff = buffById.get(rowBuff(r, e)); return `<label class="check-row small mi-when"><input type="checkbox" data-src-on="${ref}" data-key="${esc(r.key)}"${rowOn(r, e) ? ' checked' : ''}${e.off ? ' disabled' : ''}>
      <span>${esc(buff.group === 'item' ? 'Its bonus' : buff.name)} <small class="muted">${esc(r.when)}: ${esc(buffSummary(buff, itemAmount(buff, item, e.option)))}</small></span></label>`; }).join('')}
    ${!e.off && notes.length ? `<div class="hint">Not counted: ${esc(notes.join('; '))}</div>` : ''}</li>`;
}

// What an item gives, as a table: each effect, its bonuses, and (for one you own) whether it counts now. For an item you
// don't own, each option's amount (a +2, +4 or +6 belt).
export function givesHtml(item, entry = null, counted = new Set()) {
  const options = entry ? [entry.option] : (item.price_options || []).length ? item.price_options.map(o => o.label) : [undefined];
  const rows = [];
  for (const option of options) {
    const e = entry || { option };
    for (const r of itemEffects(item, option)) {
      const ids = r.choices && !entry ? r.choices : [rowBuff(r, e)];
      for (const id of ids) {
        const buff = buffById.get(id);
        const label = `${options.length > 1 && option ? `${option}: ` : ''}${buff.group === 'item' ? (r.choices ? buff.name : 'Bonus') : buff.name}`;
        const status = !entry ? '' : e.off ? 'not worn' : !rowOn(r, e) ? 'off: tick it when it applies' : counted.has(buff.id) ? 'counted' : 'already on in your effects';
        rows.push(`<tr><td>${esc(label)}${r.when ? ` <small class="muted">(${esc(r.when)})</small>` : ''}</td>
          <td>${esc(buffSummary(buff, itemAmount(buff, item, option)))}${buff.note ? `<br><small class="muted">Not counted: ${esc(buff.note)}</small>` : ''}</td>${entry ? `<td>${esc(status)}</td>` : ''}</tr>`);
      }
    }
  }
  return rows.length ? `<h4>What it gives</h4><table class="skill-why"><tbody>${[...new Set(rows)].join('')}</tbody></table>
      <p class="hint">Counted in Active effects on the Character tab while you wear it${rows.some(r => r.includes('muted">(')) ? '; one marked with when it applies has its own box there, off to start' : ''}.</p>`
    : '<p class="hint">No bonuses the builder counts: its powers are in the description.</p>';
}

// An item you own (or a special ability on your armor or weapon) in a popup: what it gives, its facts and description.
export function popSource(app, ref) {
  const src = ownedSources(app.state, app.data).find(x => x.ref === ref);
  if (!src) return;
  const { entry: e, item } = src;
  const name = src.where ? `${entryName(item, e)} (on your ${src.where})` : entryName(item, e);
  const counted = new Set((app.view.fromItems || []).map(x => x.id));
  app.openDetail(name, `<p class="hint">${esc(item.category)}${item.slot && item.slot !== 'none' ? ` · ${esc(item.slot)} slot` : ''}${src.worn ? ` · ${e.off ? 'not worn' : 'worn'}` : ''}${e.qty > 1 ? ` · you have ${e.qty}` : ''}</p>
    ${givesHtml(item, e, counted)}
    ${facts([['Aura', item.aura], ['Caster level', item.cl], ['Price', item.price], ['Weight', item.weight]])}
    <h4>Description</h4>${paragraphs(item.description) || '<p class="hint">The source has no description for this item.</p>'}`,
    src.worn ? [e.off ? { label: 'Wear it', primary: true, run: () => updateSource(app, ref, setWorn(true)) } : { label: 'Take it off', run: () => updateSource(app, ref, setWorn(false)) },
      { label: 'One more', run: () => { const i = Number(ref.slice(2)); app.update({ magicItems: app.state.magicItems.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) }); } },
      { label: e.qty > 1 ? 'One fewer' : 'Remove from my magic items', run: () => { const i = Number(ref.slice(2)); app.update({ magicItems: app.state.magicItems.map((x, j) => (j === i ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0) }); } }]
      : []);
}

// Events for the rows (change: worn, sometimes-bonus, choice; click: Details). They return true when handled.
export function itemRowChange(app, t) {
  if (t.dataset.srcWorn) { updateSource(app, t.dataset.srcWorn, setWorn(t.checked)); return true; }
  if (t.dataset.srcOn) { updateSource(app, t.dataset.srcOn, setOn(t.dataset.key, t.checked)); return true; }
  if (t.dataset.srcPick) { updateSource(app, t.dataset.srcPick, x => ({ ...x, pick: t.value })); return true; }
  return false;
}
export function itemRowClick(app, e) {
  const b = e.target.closest('[data-src-pop]');
  if (!b) return false;
  e.preventDefault();
  popSource(app, b.dataset.srcPop);
  return true;
}
