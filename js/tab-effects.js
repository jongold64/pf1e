// Active effects card (Character tab): common spells and other buffs to switch on (with a caster level where the
// bonus grows with it), custom effects the player types in, and what they add up to by the stacking rules.
import { $, esc } from './dom.js';
import { BUFFS, BONUS_TYPES, TARGETS, TARGET_NAMES } from './effects.js';

const signedN = n => (n > 0 ? `+${n}` : String(n));

// "+4 enhancement Str" for a buff at a caster level.
function buffSummary(buff, cl) {
  return buff.bonuses(cl).map(x => `${signedN(x.value)} ${x.type} ${TARGET_NAMES[x.target].toLowerCase()}`).join(', ');
}

export function renderEffects(app, view) {
  const { state } = app;
  const box = $('effects');
  const listOpen = box.querySelector('details.buff-list')?.open ?? false;
  const on = new Map(state.buffs.map(x => [x.id, x]));
  const activeCount = state.buffs.length + state.customEffects.filter(c => c.on && c.value).length;
  $('effects-count').textContent = activeCount ? `${activeCount} on` : '';

  const buffRow = buff => {
    const cur = on.get(buff.id);
    const cl = cur?.cl ?? 1;
    const level = buff.scales && cur ? `<label class="cl-input">${esc(buff.levelName || 'caster level')}
        <input type="number" min="1" max="20" value="${cl}" data-buff-cl="${esc(buff.id)}"></label>` : '';
    return `<li class="${cur ? 'on' : ''}"><label class="check-row small"><input type="checkbox" data-buff="${esc(buff.id)}"${cur ? ' checked' : ''}>
        <span><b>${esc(buff.name)}</b> <small class="muted">${esc(buffSummary(buff, cl))}</small></span></label>${level}
        ${cur && buff.note ? `<div class="hint">Not counted: ${esc(buff.note)}</div>` : ''}</li>`;
  };
  const active = BUFFS.filter(b => on.has(b.id));
  const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const custom = state.customEffects.map((c, i) => `<li class="custom-effect">
      <input type="checkbox" data-fx="${i}" data-field="on"${c.on ? ' checked' : ''} aria-label="On">
      <input type="text" data-fx="${i}" data-field="name" value="${esc(c.name)}" placeholder="Name (e.g. potion, inspire greatness)" aria-label="Name">
      <input type="number" data-fx="${i}" data-field="value" value="${c.value}" aria-label="Bonus (negative for a penalty)">
      <select data-fx="${i}" data-field="type" aria-label="Bonus type">${options(BONUS_TYPES.map(t => [t, t]), c.type)}</select>
      <select data-fx="${i}" data-field="target" aria-label="Applies to">${options(TARGETS, c.target)}</select>
      <button type="button" data-fx-remove="${i}" aria-label="Remove this effect">Remove</button></li>`).join('');

  // What counts after stacking, by what it changes.
  const fx = view.stats.fx;
  const totals = [
    ...['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(a => fx[a]).map(a => `${TARGET_NAMES[a]} ${signedN(fx[a])}`),
    ...Object.entries(fx.ac).filter(([, v]) => v).map(([t, v]) => `AC ${signedN(v)} ${t}`),
    ...['attack', 'damage', 'fort', 'ref', 'will', 'init', 'skills', 'checks', 'cmb', 'cmd', 'hp'].filter(k => fx[k]).map(k => `${TARGET_NAMES[k]} ${signedN(fx[k])}`),
    ...(fx.speed ? [`Speed ${signedN(fx.speed)} ft.`] : []),
    ...(view.size !== view.race.size ? [`Size ${view.size}`] : []),
  ];
  box.innerHTML = `
    ${totals.length ? `<p class="effect-totals"><b>Counting now:</b> ${esc(totals.join(' · '))}</p>
      <p class="hint">Bonuses of the same type don't stack (only the highest counts), except dodge, circumstance and untyped
      ones; penalties all count. Armor and shield bonuses (mage armor, shield) don't add to worn armor's: the higher counts.</p>`
      : '<p class="hint">Nothing active. Switch on a spell below, or add your own effect.</p>'}
    ${active.length ? `<ul class="buff-active">${active.map(buffRow).join('')}</ul>` : ''}
    <details class="buff-list"${listOpen ? ' open' : ''}><summary>Common spells and buffs</summary>
      <ul class="buff-grid">${BUFFS.filter(b => !on.has(b.id)).map(buffRow).join('')}</ul></details>
    <h3>Custom effects</h3>
    ${custom ? `<ul class="custom-effects">${custom}</ul>` : '<p class="hint">For anything not listed: a potion, an item, a class ability, a penalty (enter a negative number).</p>'}
    <p><button type="button" data-fx-add>Add an effect</button>${activeCount ? ' <button type="button" data-fx-clear>Switch all off</button>' : ''}</p>`;
}

export function initEffects(app) {
  const box = $('effects');
  const { state } = app;
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.buff) {
      const id = t.dataset.buff;
      app.update({ buffs: t.checked ? [...state.buffs, { id, cl: state.buffs.find(x => x.id === id)?.cl || app.view.level }]
        : state.buffs.filter(x => x.id !== id) });
    } else if (t.dataset.buffCl) {
      const cl = Math.min(20, Math.max(1, Math.floor(Number(t.value)) || 1));
      app.update({ buffs: state.buffs.map(x => (x.id === t.dataset.buffCl ? { ...x, cl } : x)) });
    } else if (t.dataset.fx !== undefined) {
      const i = Number(t.dataset.fx);
      const field = t.dataset.field;
      const value = field === 'on' ? t.checked : field === 'value' ? Math.trunc(Number(t.value)) || 0 : t.value;
      app.update({ customEffects: state.customEffects.map((c, j) => (j === i ? { ...c, [field]: value } : c)) });
    }
  });
  box.addEventListener('click', e => {
    if (e.target.closest('[data-fx-add]')) {
      app.update({ customEffects: [...state.customEffects, { name: '', target: 'attack', type: 'untyped', value: 1, on: true }] });
    } else if (e.target.closest('[data-fx-remove]')) {
      const i = Number(e.target.closest('[data-fx-remove]').dataset.fxRemove);
      app.update({ customEffects: state.customEffects.filter((_, j) => j !== i) });
    } else if (e.target.closest('[data-fx-clear]')) {
      app.update({ buffs: [], customEffects: state.customEffects.map(c => ({ ...c, on: false })) });
    }
  });
}

