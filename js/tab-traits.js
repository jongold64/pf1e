// Traits card on the Feats tab: a slot for each trait the character gets (2, or 3 with the Extra Campaign Trait
// house rule), and a picker with every published trait, searchable and filtered by category. No limits are checked
// (the player's choice).
import { $, esc, paragraphs } from './dom.js';
import { traitSlotCount } from './traits.js';

let pickerSlot = null;

function effectText(t) {
  const e = t.effects || {};
  const parts = [];
  for (const [save, n] of Object.entries(e.saves || {})) parts.push(`+${n} ${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[save]}`);
  if (e.initiative) parts.push(`+${e.initiative} initiative`);
  for (const [skill, n] of Object.entries(e.skills || {})) parts.push(`+${n} ${skill}`);
  if ((e.class_skills || []).length) parts.push(`class skill: ${e.class_skills.join(', ')}`);
  return parts.join(', ');
}

function traitLabel(t) {
  return `${t.category}${t.requirement ? ` (${t.requirement})` : ''} · ${t.source}`;
}

export function renderTraits(app) {
  const { state, data } = app;
  const count = traitSlotCount(state.houseRules);
  const chosen = state.traits.map(id => data.traitsById.get(id));
  $('trait-count').textContent = `${chosen.slice(0, count).filter(Boolean).length} of ${count} chosen`;
  $('trait-slots').innerHTML = Array.from({ length: count }, (_, i) => {
    const t = chosen[i];
    const label = i === 2 ? 'Extra campaign trait' : `Trait ${i + 1}`;
    const body = t ? `<details class="chosen"><summary>${esc(t.name)} <small class="muted">${esc(t.category)}</small></summary>
        <p class="hint">${esc(traitLabel(t))}</p>${paragraphs(t.text)}</details>
        ${effectText(t) ? `<p class="hint">Counted: ${esc(effectText(t))}.</p>` : ''}
        <div class="slot-buttons"><button type="button" data-trait-choose="${i}">Change</button>
          <button type="button" data-trait-remove="${i}">Remove</button></div>`
      : `<button type="button" class="primary" data-trait-choose="${i}">Choose a trait</button>`;
    return `<li class="slot"><div class="slot-label">${label}</div>${body}</li>`;
  }).join('');
  // Traits chosen beyond the slots (the house rule was switched off) are kept but not counted.
  const extra = chosen.slice(count).filter(Boolean);
  $('trait-note').textContent = extra.length ? `Not counted (no slot for it now): ${extra.map(t => t.name).join(', ')}.` : '';
}

function renderPicker(app) {
  const search = $('trait-search').value.trim().toLowerCase();
  const category = $('trait-category').value;
  const list = app.data.traits.filter(t => (!category || t.category === category)
    && (!search || t.name.toLowerCase().includes(search) || (t.requirement || '').toLowerCase().includes(search)));
  $('trait-picker-count').textContent = `${list.length} trait${list.length === 1 ? '' : 's'}`;
  $('trait-list').innerHTML = list.map(t => `<details class="feat-item">
      <summary><span class="feat-name">${esc(t.name)}</span> <small>${esc(t.category)}${t.requirement ? ` · ${esc(t.requirement)}` : ''}</small></summary>
      <div class="feat-body"><p class="hint">${esc(traitLabel(t))}</p>${paragraphs(t.text)}
        ${effectText(t) ? `<p class="hint">Counted: ${esc(effectText(t))}.</p>` : ''}
        <button type="button" class="primary" data-trait-pick="${esc(t.id)}">Choose ${esc(t.name)}</button></div>
    </details>`).join('') || '<p class="hint">No traits match.</p>';
}

export function initTraits(app) {
  const categories = [...new Set(app.data.traits.map(t => t.category))].sort();
  $('trait-category').innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('trait-slots').addEventListener('click', e => {
    const choose = e.target.closest('[data-trait-choose]');
    if (choose) {
      pickerSlot = Number(choose.dataset.traitChoose);
      $('trait-picker-title').textContent = pickerSlot === 2 ? 'Extra campaign trait' : `Trait ${pickerSlot + 1}`;
      $('trait-search').value = '';
      renderPicker(app);
      $('trait-picker').showModal();
    }
    const remove = e.target.closest('[data-trait-remove]');
    if (remove) {
      const traits = [...app.state.traits];
      traits[Number(remove.dataset.traitRemove)] = null;
      app.update({ traits });
    }
  });
  $('trait-search').addEventListener('input', () => renderPicker(app));
  $('trait-category').addEventListener('change', () => renderPicker(app));
  $('trait-picker-close').addEventListener('click', () => $('trait-picker').close());
  $('trait-list').addEventListener('click', e => {
    const pick = e.target.closest('[data-trait-pick]');
    if (!pick) return;
    const traits = [...app.state.traits];
    while (traits.length < pickerSlot) traits.push(null);
    traits[pickerSlot] = pick.dataset.traitPick;
    app.update({ traits });
    $('trait-picker').close();
  });
}
