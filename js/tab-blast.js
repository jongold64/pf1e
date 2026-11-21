// The kineticist's Infuse popup (Character tab, a kinetic blast row's Infuse button): up to one form and one substance
// infusion, metakinesis and gather power for her blasts, the burn they cost in all, and Accept to take that burn.
// The choices stay (the blast rows roll with them) until changed or cleared; gather power goes after each Accept.
// burn.js blastPlan has the rules.
import { $, esc } from './dom.js';

let shown = '';
export function popBlast(app, blast) {
  shown = blast;
  const p = app.blastPlanFor(blast);
  const bs = app.burnNow();
  if (!bs) return;
  const saved = app.state.blastPlan;
  const opt = (list, id) => `<option value="">none</option>${list.map(f => `<option value="${esc(f.id)}"${f.id === id ? ' selected' : ''}>${esc(f.name)} (burn ${f.burn})</option>`).join('')}`;
  const about = f => (f ? `<p class="hint">${esc(f.about)}${/^none\b/i.test(f.save) ? '' : ` <b>Save: ${esc(f.save)}</b>`}</p>` : '');
  const left = bs.max - bs.burn;
  app.openDetail(`Infuse ${blast}`, `<div class="blast-pop">
    <p class="hint">Each blast can take one form and one substance infusion. Their burn is added up${bs.infusionCut ? ` (infusion specialization takes ${bs.infusionCut} off)` : ''},
      then metakinesis, then gather power takes its part off. The blast rows roll with what's chosen here.</p>
    ${p.options.form.length ? `<label>Form infusion <select data-blast="form">${opt(p.options.form, saved.form)}</select></label>${about(p.form)}` : ''}
    ${p.form && p.focus ? `<label>Focused blast bonus <select data-blast="focus">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === p.focus ? ' selected' : ''}>+${n} (burn ${p.form.burn + 2 * (n - 1)})</option>`).join('')}</select></label>` : ''}
    ${p.options.substance.length ? `<label>Substance infusion <select data-blast="substance">${opt(p.options.substance, saved.substance)}</select></label>${about(p.substance)}` : ''}
    ${!p.options.form.length && !p.options.substance.length ? '<p class="hint">None of your infusions fit this blast (kinetic fist has its own row).</p>' : ''}
    ${bs.metakinesis.length ? `<p>Metakinesis ${bs.metakinesis.map(m => `<label class="check-row"><input type="checkbox" data-blast-meta="${esc(m.name)}"${p.meta.includes(m.name) ? ' checked' : ''}> ${esc(m.name)} <small class="muted">burn ${m.burn}</small></label>`).join(' ')}</p>` : ''}
    <label>Gather power <select data-blast="gather">
      <option value="0">none</option>
      <option value="1"${saved.gather === 1 ? ' selected' : ''}>a move action (−${bs.gather.move})</option>
      <option value="2"${saved.gather === 2 ? ' selected' : ''}>a full round, last turn (−${bs.gather.full})</option></select></label>
    <p><b>Burn for this blast: ${p.burn}</b>${p.gatherCut && p.before ? ` <small class="muted">(${p.before} − ${Math.min(p.before, p.gatherCut)} gathered)</small>` : ''}
      · burn now ${bs.burn} of ${bs.max}${p.saves.length ? ` · ${p.saves.map(x => `${esc(x.name)} DC ${x.dc} ${esc(x.save)}`).join(' · ')}` : ''}</p>
    ${p.overLimit ? `<p class="warning">That's more than the ${bs.perRound} burn you can accept in a round.</p>` : ''}
    ${p.burn > left ? `<p class="warning">That takes you past ${bs.max} burn (3 + Con modifier), the most you can choose to accept.</p>` : ''}
    <div class="line-controls">
      <button type="button" class="primary" data-blast-accept${p.burn ? '' : ' disabled'}>${p.burn ? `Accept ${p.burn} burn` : 'No burn to accept'}</button>
      <button type="button" data-blast-clear>Clear choices</button>
      <button type="button" data-blast-done>Done</button></div></div>`);
}

export function initBlast(app) {
  const body = $('detail-body');
  const set = change => {
    app.update({ blastPlan: { ...app.state.blastPlan, ...change } });
    popBlast(app, shown);
  };
  body.addEventListener('change', e => {
    const t = e.target;
    if (!t.closest('.blast-pop')) return;
    const k = t.dataset.blast;
    if (k === 'form' || k === 'substance') set({ [k]: t.value });
    else if (k === 'focus' || k === 'gather') set({ [k]: Number(t.value) });
    else if (t.dataset.blastMeta) {
      const list = app.state.blastPlan.meta.filter(m => m !== t.dataset.blastMeta);
      set({ meta: t.checked ? [...list, t.dataset.blastMeta] : list });
    }
  });
  body.addEventListener('click', e => {
    if (!e.target.closest('.blast-pop')) return;
    if (e.target.closest('[data-blast-accept]')) {
      const p = app.blastPlanFor(shown);
      if (p.burn) app.changeBurn('more', p.burn);
      // The gathered power is spent with the blast.
      app.update({ blastPlan: { ...app.state.blastPlan, gather: 0 } });
      $('detail-dialog').close();
    } else if (e.target.closest('[data-blast-clear]')) set({ form: '', substance: '', meta: [], gather: 0, focus: 1 });
    else if (e.target.closest('[data-blast-done]')) $('detail-dialog').close();
  });
}
