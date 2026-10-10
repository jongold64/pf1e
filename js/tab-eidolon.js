// Eidolon card (Character tab): shown for a summoner (or unchained summoner). Its statistics at the summoner's level
// (eidolon.js), its base form and subtype, the evolutions bought with its evolution pool, its ability score increases,
// with Roll buttons for saves and attacks and Details for each evolution.
import { $, esc, signed, paragraphs } from './dom.js';
import { rollButton } from './roll-ui.js';
import { eidolonStats } from './eidolon.js';
import { SKILLS } from './skills.js';

const ABILITY_NAMES = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export function renderEidolon(app, view) {
  const card = $('eidolon-card');
  const e = view.eidolon;
  card.hidden = !e;
  if (!e) return;
  const box = $('eidolon');
  const data = app.data.eidolons;
  $('eidolon-level').textContent = `summoner level ${e.level}`;
  if (!data) { box.innerHTML = '<p class="hint">Loading…</p>'; return; }
  if (!e.form) {
    box.innerHTML = `<p class="hint">Choose its ${e.cls === 'summoner-unchained' ? 'subtype and ' : ''}base form on the Classes tab (in your summoner's choices) to see its statistics.</p>`;
    return;
  }
  const st = app.state.eidolon;
  const s = eidolonStats({ level: e.level, form: e.form, chosen: st.evolutions, increases: st.increases,
                           table: data.tables[e.cls], evolutions: data.evolutions[e.cls] });
  const name = st.name || 'Your eidolon';
  const roll = (label, n) => rollButton({ title: `${name}: ${label}`, check: label, plain: true, groups: [{ attacks: [n] }] });
  const defense = [
    ['Hit points', `${s.hp} <small class="muted">(${s.hd} Hit Dice, d10, average)</small>`],
    ['AC', `${s.ac} <small class="muted">touch ${s.touch}, flat-footed ${s.flat}; natural armor +${s.natural}</small>`],
    ['Fortitude', `${signed(s.saves.fort)}${roll('Fortitude', s.saves.fort)}`],
    ['Reflex', `${signed(s.saves.ref)}${roll('Reflex', s.saves.ref)}`],
    ['Will', `${signed(s.saves.will)}${roll('Will', s.saves.will)}`],
    ['Initiative', `${signed(s.init)}${roll('Initiative', s.init)}`],
    ['Base attack', signed(s.bab)], ['CMB / CMD', `${signed(s.cmb)} / ${s.cmd}`],
    ['Speed', esc(s.speed)], ['Size', esc(s.size)],
    ['Skill ranks', `${s.skillRanks} <small class="muted">(any skills; at most ${s.hd} in one)</small>`],
    ['Feats', String(s.feats)],
  ];
  const attacks = s.attacks.map(a => `<li>${a.count > 1 ? `${a.count} ` : ''}${esc(a.name)}${a.count > 1 ? 's' : ''} ${esc(signed(a.bonus))} (${esc(a.damage)})${a.secondary ? ' <small class="muted">secondary</small>' : ''}
      ${rollButton({ title: `${name}: ${a.name}`, check: a.name, groups: [{ attacks: Array(a.count).fill(a.bonus), damage: a.damage, threat: 20, mult: 2 }] })}</li>`).join('');
  const scores = Object.entries(s.scores).map(([a, v]) => `<td><b>${ABILITY_NAMES[a]}</b> ${v} <small class="muted">(${signed(s.mod[a])})</small></td>`).join('');
  const incs = Array.from({ length: s.allowedIncreases }, (_, i) => `<label>Ability score increase ${i + 1}
      <select data-eid-inc="${i}"><option value="">Choose…</option>${Object.entries(ABILITY_NAMES).map(([k, v]) => `<option value="${k}"${st.increases[i] === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`).join(' ');
  const choiceSelect = (c, i) => c.id === 'ability-increase'
    ? `<select data-eid-choice="${i}" aria-label="Which ability"><option value="">which ability…</option>${Object.entries(ABILITY_NAMES).map(([k, v]) => `<option value="${k}"${c.choice === k ? ' selected' : ''}>${v}</option>`).join('')}</select>`
    : c.id === 'skilled'
      ? `<select data-eid-choice="${i}" aria-label="Which skill"><option value="">which skill…</option>${SKILLS.map(k => `<option${c.choice === k.name ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`
      : '';
  const taken = s.taken.map((c, i) => `<li><b>${esc(c.name)}</b> <small class="muted">${c.cost} point${c.cost === 1 ? '' : 's'}</small> ${choiceSelect(c, i)}
      <button type="button" class="skill-details" data-eid-pop="${esc(c.id)}">Details</button>
      <button type="button" class="link" data-eid-remove="${i}">remove</button></li>`).join('');
  const left = s.pool - s.used;
  const options = [1, 2, 3, 4].map(cost => {
    const list = data.evolutions[e.cls].filter(x => x.cost === cost);
    return list.length ? `<optgroup label="${cost} point${cost === 1 ? '' : 's'}">${list.map(x => `<option value="${esc(x.id)}"${cost > left ? ' disabled' : ''}>${esc(x.name)}${x.type ? ` (${x.type})` : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const subtype = e.subtype ? `<details data-key="eid-sub"><summary>${esc(e.subtype.name)} subtype: what it gives by level</summary>
      <ul class="plain-list">${(e.subtype.powers || []).map(p => `<li${p.level > e.level ? ' class="muted"' : ''}><b>${esc(p.name)}</b> ${esc(p.text)}</li>`).join('')}</ul></details>` : '';
  box.innerHTML = `<label class="row-label">Name <input type="text" data-eid-name value="${esc(st.name || '')}" placeholder="Your eidolon's name" maxlength="40"></label>
    <p><b>${esc(e.form.name)}</b> base form <small class="muted">${esc(e.form.source)}${e.subtype ? ` · ${esc(e.subtype.name)} subtype` : ''}</small></p>
    ${s.free.length ? `<p class="hint">Free evolutions from its base form: ${esc(s.free.join(', '))}.</p>` : ''}
    ${subtype}
    <div class="companion-grid">
      <div><h3>Defense and movement</h3><dl class="facts">${defense.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
      <div><h3>Attacks <small class="muted">${s.totalAttacks} of ${s.maxAttacks} natural attacks</small></h3>
        ${attacks ? `<ul class="plain-list">${attacks}</ul>` : '<p class="hint">No attacks yet.</p>'}
        ${s.totalAttacks > s.maxAttacks ? `<p class="warning">More natural attacks than its maximum of ${s.maxAttacks}.</p>` : ''}
        <h3>Special</h3><p>${esc(s.special.join(', ') || '—')}</p></div>
    </div>
    <h3>Ability scores</h3><table class="companion-scores"><tr>${scores}</tr></table>
    ${incs ? `<p>${incs}</p>` : ''}
    <h3>Evolutions <span class="count">${s.used} of ${s.pool} points</span></h3>
    ${left < 0 ? `<p class="warning">${-left} point${left === -1 ? '' : 's'} over its evolution pool.</p>` : ''}
    ${taken ? `<ul class="plain-list">${taken}</ul>` : '<p class="hint">None bought yet.</p>'}
    <select data-eid-add aria-label="Add an evolution"><option value="">Add an evolution (${left} point${left === 1 ? '' : 's'} left)…</option>${options}</select>
    <p class="hint">Counted: ability increase, improved natural armor, Large, extra feat and the attack evolutions (bite, claws, slam,
      gore, sting, tail slap, tentacle...). Others (resistance, flight, reach...) are described in their Details.</p>`;
}

export function initEidolon(app) {
  const box = $('eidolon');
  const set = patch => app.update({ eidolon: { ...app.state.eidolon, ...patch } });
  box.addEventListener('change', ev => {
    const t = ev.target;
    const st = app.state.eidolon;
    if (t.dataset.eidAdd !== undefined && t.value) set({ evolutions: [...st.evolutions, { id: t.value }] });
    if (t.dataset.eidChoice !== undefined) set({ evolutions: st.evolutions.map((c, i) => (i === Number(t.dataset.eidChoice) ? { ...c, choice: t.value } : c)) });
    if (t.dataset.eidInc !== undefined) { const inc = [...st.increases]; inc[Number(t.dataset.eidInc)] = t.value; set({ increases: inc }); }
  });
  box.addEventListener('input', ev => { if (ev.target.dataset.eidName !== undefined) set({ name: ev.target.value.slice(0, 40) }); });
  box.addEventListener('click', ev => {
    const rm = ev.target.closest('[data-eid-remove]');
    if (rm) { set({ evolutions: app.state.eidolon.evolutions.filter((_, i) => i !== Number(rm.dataset.eidRemove)) }); return; }
    const pop = ev.target.closest('[data-eid-pop]');
    if (pop) {
      const cls = app.view.eidolon?.cls;
      const evo = app.data.eidolons?.evolutions[cls]?.find(x => x.id === pop.dataset.eidPop);
      if (evo) app.openDetail(`${evo.name} (${evo.cost} point${evo.cost === 1 ? '' : 's'})`, `<p class="hint">${esc(evo.source)}${evo.type ? ` · ${evo.type}` : ''}</p>${paragraphs(evo.text)}`);
    }
  });
}
