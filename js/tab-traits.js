// Traits card on the Feats tab: a slot for each trait the character gets (2, or 3 with the Extra Campaign Trait
// house rule), and a picker with every published trait, searchable and filtered by category. No limits are checked
// (the player's choice).
import { $, esc, paragraphs } from './dom.js';
import { traitSlotCount, traitSlotLabels } from './traits.js';

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
  const count = traitSlotCount(state.houseRules, state.drawback);
  const chosen = state.traits.map(id => data.traitsById.get(id));
  $('trait-count').textContent = `${chosen.slice(0, count).filter(Boolean).length} of ${count} chosen`;
  $('trait-slots').innerHTML = Array.from({ length: count }, (_, i) => {
    const t = chosen[i];
    const label = traitSlotLabels(state.houseRules, state.drawback)[i] || `Trait ${i + 1}`;
    const body = t ? `<details class="chosen"><summary>${esc(t.name)} <small class="muted">${esc(t.category)}</small></summary>
        <p class="hint">${esc(traitLabel(t))}</p>${paragraphs(t.text)}</details>
        ${effectText(t) ? `<p class="hint">Counted: ${esc(effectText(t))}.</p>` : ''}
        <div class="slot-buttons"><button type="button" data-trait-choose="${i}">Change</button>
          <button type="button" data-trait-remove="${i}">Remove</button>
          <button type="button" class="skill-details" data-trait-details="${i}" aria-label="About this trait slot and what the trait does here">Details</button></div>`
      : `<div class="slot-buttons"><button type="button" class="primary" data-trait-choose="${i}">Choose a trait</button>
          <button type="button" class="skill-details" data-trait-details="${i}" aria-label="About this trait slot">Details</button></div>`;
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
      <summary><span class="feat-name">${esc(t.name)}</span> <small>${esc(t.category)}${t.requirement ? ` · ${esc(t.requirement)}` : ''}</small>
        <button type="button" class="skill-details" data-trait-pop="${esc(t.id)}" aria-label="${esc(t.name)} in a popup">Details</button></summary>
      <div class="feat-body"><p class="hint">${esc(traitLabel(t))}</p>${paragraphs(t.text)}
        ${effectText(t) ? `<p class="hint">Counted: ${esc(effectText(t))}.</p>` : ''}
        <button type="button" class="primary" data-trait-pick="${esc(t.id)}">Choose ${esc(t.name)}</button></div>
    </details>`).join('') || '<p class="hint">No traits match.</p>';
}

// Details popup for a trait slot: where the slot comes from, the trait's category, requirement and book, and each
// bonus it gives, with whether it counts (trait bonuses don't stack: only the highest of each counts).
function showTraitDetails(app, i) {
  const { state, data } = app;
  const count = traitSlotCount(state.houseRules, state.drawback);
  const chosen = state.traits.slice(0, count).map(id => data.traitsById.get(id)).filter(Boolean);
  const t = data.traitsById.get(state.traits[i]);
  const label = traitSlotLabels(state.houseRules, state.drawback)[i] || '';
  const slotText = label === 'Extra campaign trait' ? 'The third trait from the Extra Campaign Trait house rule (it must be a campaign trait).'
    : label === 'Trait for your drawback' ? 'The extra trait your drawback gives (Drawbacks house rule).'
    : 'Every character starts with two traits. By the rules they should come from different categories (the app doesn\'t check this).';
  let html = `<h3>This slot</h3><p>${esc(slotText)}</p>`;
  if (t) {
    const rows = [];
    const best = (get, label) => {
      const mine = get(t);
      if (!mine) return;
      const top = Math.max(...chosen.map(x => get(x) || 0));
      const winner = chosen.find(x => (get(x) || 0) === top);
      rows.push(`<tr><td>${esc(label)}</td><td class="num">+${mine}</td><td>${mine >= top && winner === t ? 'counted'
        : `not counted: ${esc(winner.name)} gives +${top} (trait bonuses don't stack)`}</td></tr>`);
    };
    const e = t.effects || {};
    for (const [save, n] of Object.entries(e.saves || {})) best(x => x.effects?.saves?.[save], `${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[save]} saves`);
    if (e.initiative) best(x => x.effects?.initiative, 'Initiative');
    for (const skill of Object.keys(e.skills || {})) best(x => x.effects?.skills?.[skill], skill);
    const classSkills = e.class_skills || [];
    html += `<h3>${esc(t.name)}</h3><p class="hint">${esc(traitLabel(t))}</p>
      <h3>In the app</h3>${rows.length ? `<table class="skill-why"><tbody>${rows.join('')}</tbody></table>` : ''}
      ${classSkills.length ? `<p>Class skill: ${esc(classSkills.join(', '))} (counted on the Skills tab).</p>` : ''}
      ${!rows.length && !classSkills.length ? '<p>Not counted in the numbers automatically: read the trait and apply it in play (or add it as a custom effect on the Character tab).</p>' : ''}`;
  } else {
    html += '<p class="hint">No trait chosen yet: press Choose a trait.</p>';
  }
  app.openDetail(t ? t.name : (traitSlotLabels(state.houseRules, state.drawback)[i] || `Trait ${i + 1}`), html);
}

// Your traits in a popup: how many you get and why, each one with its category, a warning when two share a category
// (Advanced Player's Guide: no more than one trait from the same list), and what they add.
function popTraits(app) {
  const { state, data } = app;
  const count = traitSlotCount(state.houseRules, state.drawback);
  const labels = traitSlotLabels(state.houseRules, state.drawback);
  const chosen = state.traits.slice(0, count).map(id => data.traitsById.get(id));
  const cats = chosen.filter(Boolean).map(t => t.category);
  const twice = [...new Set(cats.filter((c, i) => cats.indexOf(c) !== i))];
  const rows = labels.map((l, i) => `<tr><td>${esc(l)}</td><td>${chosen[i] ? `${esc(chosen[i].name)} <small class="muted">${esc(chosen[i].category)}</small>` : '<span class="hint">not chosen</span>'}</td>
      <td>${chosen[i] && effectText(chosen[i]) ? esc(effectText(chosen[i])) : ''}</td></tr>`).join('');
  app.openDetail(`Traits: ${chosen.filter(Boolean).length} of ${count} chosen`, `
    <table class="skill-why"><thead><tr><th>Slot</th><th>Trait</th><th>Counted</th></tr></thead><tbody>${rows}</tbody></table>
    <p>Every character starts with two traits.${state.houseRules.extraTrait ? ' The Extra Campaign Trait house rule adds a third.' : ''}${state.houseRules.drawbacks && state.drawback ? ' Your drawback adds one more.' : ''}
      The Additional Traits feat gives two more; the app has no slots for those yet, so note them yourself.</p>
    ${twice.length ? `<p class="warning">Two traits from the same category (${esc(twice.join(', '))}): the rules allow only one trait from each category.</p>`
      : '<p class="hint">The rules allow only one trait from each category (combat, faith, magic, social, race, regional, campaign...).</p>'}
    <p class="hint">Trait bonuses are their own type: two trait bonuses to the same thing don\u2019t stack (the higher counts).
      Bonuses and class skills shown under Counted are added for you.</p>`);
}

export function initTraits(app) {
  $('trait-count-details').addEventListener('click', () => popTraits(app));
  const categories = [...new Set(app.data.traits.map(t => t.category))].sort();
  $('trait-category').innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('trait-slots').addEventListener('click', e => {
    const why = e.target.closest('[data-trait-details]');
    if (why) { showTraitDetails(app, Number(why.dataset.traitDetails)); return; }
    const choose = e.target.closest('[data-trait-choose]');
    if (choose) {
      pickerSlot = Number(choose.dataset.traitChoose);
      $('trait-picker-title').textContent = traitSlotLabels(app.state.houseRules, app.state.drawback)[pickerSlot] || `Trait ${pickerSlot + 1}`;
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
  const choose = id => {
    const traits = [...app.state.traits];
    while (traits.length < pickerSlot) traits.push(null);
    traits[pickerSlot] = id;
    app.update({ traits });
    $('trait-picker').close();
  };
  $('trait-list').addEventListener('click', e => {
    // Details: the trait in a popup (over the list), with what it would count and Choose.
    const pop = e.target.closest('[data-trait-pop]');
    if (pop) {
      e.preventDefault();  // it sits in the row's summary: don't open or close the row
      const t = app.data.traitsById.get(pop.dataset.traitPop);
      if (!t) return;
      const others = app.state.traits.slice(0, traitSlotCount(app.state.houseRules, app.state.drawback)).filter((id, i) => id && i !== pickerSlot)
        .map(id => app.data.traitsById.get(id)).filter(Boolean);
      const e2 = t.effects || {};
      const lines = [];
      const vs = (mine, get, what) => {
        const best = others.filter(o => (get(o) || 0) >= mine).sort((a, b) => get(b) - get(a))[0];
        lines.push(`+${mine} ${what}${best ? `: not counted while you keep ${best.name} (+${get(best)}; trait bonuses don't stack)` : ': counted'}`);
      };
      for (const [save, n] of Object.entries(e2.saves || {})) vs(n, o => o.effects?.saves?.[save], `${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[save]} saves`);
      if (e2.initiative) vs(e2.initiative, o => o.effects?.initiative, 'initiative');
      for (const [skill, n] of Object.entries(e2.skills || {})) vs(n, o => o.effects?.skills?.[skill], skill);
      if ((e2.class_skills || []).length) lines.push(`Class skill: ${e2.class_skills.join(', ')}`);
      const sameCategory = others.find(o => o.category === t.category);
      app.openDetail(t.name, `<p class="hint">${esc(traitLabel(t))}</p>${paragraphs(t.text)}
        <h3>In the app</h3>${lines.length ? `<ul class="plain-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
          : '<p>Not counted in the numbers automatically: apply it in play (or add it as a custom effect on the Character tab).</p>'}
        ${sameCategory ? `<p class="warning">You already have a ${esc(t.category)} trait (${esc(sameCategory.name)}); by the rules your traits should come from different categories.</p>` : ''}`,
        [{ label: `Choose ${t.name}`, primary: true, run: () => choose(t.id) }]);
      return;
    }
    const pick = e.target.closest('[data-trait-pick]');
    if (pick) choose(pick.dataset.traitPick);
  });
}
