// Maneuvers card (Classes tab): Path of War (third-party) martial disciple classes. For each one its initiator level,
// disciplines (with the "either X or Y" pick), the maneuvers and stances known (chosen from a list that says why one
// can't be learned yet), which maneuvers are readied, and the stance in use. The rules are in maneuvers.js.
import { $, esc, signed, paragraphs, facts, ordinal } from './dom.js';
import { maneuverOptions, maneuverKind, maneuverDC, STANCE_EFFECTS } from './maneuvers.js';

const ABILITY = { int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma', str: 'Strength', dex: 'Dexterity', con: 'Constitution' };

export function renderManeuvers(app, view) {
  const card = $('maneuvers-card');
  const list = view.initiators || [];
  card.hidden = !list.length;
  if (card.hidden) return;
  const byId = app.data.maneuversById;
  const name = id => esc(byId.get(id)?.name || id);
  $('maneuvers').innerHTML = list.map(x => {
    const { cls, choice, slots } = x;
    const init = cls.initiator;
    const pick = init.choose?.length ? `<label>Discipline: <select data-mv-discipline="${esc(cls.id)}">
        <option value="">choose one…</option>${init.choose.map(d => `<option${choice.discipline === d ? ' selected' : ''}>${esc(d)}</option>`).join('')}
      </select></label>` : '';
    const discs = x.disciplines.map(d => `<button type="button" class="link" data-mv-disc="${esc(d)}">${esc(d)}</button>`).join(', ');
    const problems = new Map(x.problems.map(p => [p.id, p.why]));
    const row = (id, kind) => {
      const m = byId.get(id);
      const readied = choice.readied.includes(id);
      const control = kind === 'stance'
        ? `<label class="check-row"><input type="radio" name="mv-stance-${esc(cls.id)}" data-mv-stance="${esc(cls.id)}" value="${esc(id)}"${choice.stance === id ? ' checked' : ''}> in use</label>`
        : `<label class="check-row"><input type="checkbox" data-mv-ready="${esc(cls.id)}" value="${esc(id)}"${readied ? ' checked' : ''}
            ${!readied && choice.readied.length >= slots.readied ? ' disabled' : ''}> readied</label>`;
      return `<li><b>${name(id)}</b> <small class="muted">${esc(m ? maneuverKind(m) : '')}</small>
        <button type="button" class="skill-details q-details" data-mv-info="${esc(id)}" data-mv-class="${esc(cls.id)}" aria-label="${name(id)}: details" title="Details">?</button>
        ${control} <button type="button" data-mv-remove="${esc(cls.id)}" data-kind="${kind}" value="${esc(id)}">Remove</button>
        ${problems.has(id) ? `<p class="warning">${esc(problems.get(id))}.</p>` : ''}</li>`;
    };
    const known = choice.known.map(id => row(id, 'maneuver')).join('');
    const stances = choice.stances.map(id => row(id, 'stance')).join('');
    const counted = choice.stance && STANCE_EFFECTS[byId.get(choice.stance)?.name];
    return `<div class="maneuver-class">
      <h3>${esc(cls.name)} <small class="muted">initiator level ${x.il} · maneuvers up to ${ordinal(x.maxLevel)} level ·
        initiation modifier ${signed(x.initMod)} (${esc(ABILITY[init.ability] || init.ability)})</small></h3>
      <p>Disciplines: ${discs || '<span class="muted">none yet</span>'}${pick ? ` ${pick}` : ''}</p>
      <h4>Maneuvers known <span class="count">${choice.known.length} of ${slots.known}</span> · readied <span class="count">${choice.readied.length} of ${slots.readied}</span></h4>
      ${slots.granted ? `<p class="hint">At the start of each encounter ${slots.granted} of the readied maneuvers are granted (picked at random); the rest are withheld until granted.</p>` : ''}
      ${known ? `<ul class="maneuver-list">${known}</ul>` : ''}
      ${choice.known.length < slots.known ? `<button type="button" class="primary" data-mv-add="${esc(cls.id)}" data-kind="maneuver">Add a maneuver</button>` : ''}
      <h4>Stances known <span class="count">${choice.stances.length} of ${slots.stances}</span></h4>
      ${stances ? `<ul class="maneuver-list">${stances}</ul>` : ''}
      ${choice.stances.length < slots.stances ? `<button type="button" class="primary" data-mv-add="${esc(cls.id)}" data-kind="stance">Add a stance</button>` : ''}
      ${choice.stance ? `<p class="hint">${counted ? 'The stance in use is counted in your numbers (AC, saves, initiative or speed as it says).'
        : 'The stance in use isn’t counted in the numbers automatically: apply it in play (or add it as a custom effect on the Build tab).'}</p>` : ''}
    </div>`;
  }).join('') + `<p class="hint">Save DC of a maneuver: 10 + its level + your initiation modifier. Readied maneuvers are used once
    each per encounter until recovered; stances are always available and one is in use at a time.</p>`;
}

// The popup of maneuvers (or stances) a class can add, grouped by level; ones it can't learn yet are shown with why.
function openAdd(app, cid, kind) {
  const x = app.view.initiators.find(i => i.cls.id === cid);
  if (!x) return;
  const all = app.view.initiators.flatMap(i => [...i.choice.known, ...i.choice.stances]);
  const opts = maneuverOptions(app.data.maneuvers, kind, { disciplines: x.disciplines, il: x.il, known: all, byId: app.data.maneuversById })
    .filter(o => !all.includes(o.m.id) && o.m.level <= x.maxLevel);
  const levels = [...new Set(opts.map(o => o.m.level))];
  const body = levels.map(lv => `<h4>${ordinal(lv)} level</h4><ul class="maneuver-pick">${opts.filter(o => o.m.level === lv).map(({ m, ok, why }) => `
    <li><button type="button" data-mv-choose="${esc(m.id)}"${ok ? '' : ' disabled'}>${esc(m.name)}</button>
      <small class="muted">${esc(m.type)} · ${esc(m.discipline)}</small>
      <button type="button" class="skill-details q-details" data-mv-info="${esc(m.id)}" data-mv-class="${esc(cid)}" title="Details">?</button>
      <br><small>${esc(m.summary || '')}</small>${ok ? '' : `<br><small class="warning">${esc(why)}</small>`}</li>`).join('')}</ul>`).join('');
  app.openDetail(`${x.cls.name}: add a ${kind}`, `<p class="hint">From ${esc(x.disciplines.join(', '))}; up to ${ordinal(x.maxLevel)} level
    at initiator level ${x.il}. Most maneuvers need others of their discipline known first.</p>${body || '<p class="hint">Nothing left to add.</p>'}`);
  $('detail-body').dataset.mvClass = cid;
  $('detail-body').dataset.mvKind = kind;
}

// A maneuver's details: its lines, save DC for this class, and text.
function openInfo(app, id, cid) {
  const m = app.data.maneuversById.get(id);
  if (!m) return;
  const x = app.view.initiators.find(i => i.cls.id === cid);
  app.openDetail(m.name, `<p class="hint">${esc(maneuverKind(m))}${m.descriptor ? ` [${esc(m.descriptor)}]` : ''} · Path of War (Dreamscarred Press)</p>
    ${facts([['Prerequisite', m.prerequisite_text], ['Initiation action', m.action], ['Range', m.range], ['Target', m.target], ['Area', m.area],
      ['Duration', m.duration], ['Saving throw', m.save], ['Save DC', m.save && x ? `${maneuverDC(m, x.initMod)} (10 + ${m.level} + ${x.initMod})` : '']])}
    ${m.summary_only ? `<p>${esc(m.summary)}</p><p class="hint">Only this summary is on the source page; see the book for the full text.</p>` : paragraphs(m.text)}`);
}

function discInfo(app, name) {
  const d = app.data.disciplines.find(x => x.name === name);
  if (!d) return;
  app.openDetail(`${d.name} discipline`, `${facts([['Associated skill', (d.skills || []).join(', ')], ['Weapon groups', d.weapon_groups.join(', ')],
    ['Maneuvers', String(d.maneuvers)]])}${paragraphs(d.text)}`);
}

export function initManeuvers(app) {
  const save = (cid, change) => {
    const x = app.view.initiators.find(i => i.cls.id === cid);
    app.update({ maneuvers: { ...app.state.maneuvers, [cid]: { ...x.choice, ...change(x.choice) } } });
  };
  $('maneuvers').addEventListener('click', e => {
    const t = e.target.closest('[data-mv-add],[data-mv-remove],[data-mv-info],[data-mv-disc]');
    if (!t) return;
    if (t.dataset.mvAdd) openAdd(app, t.dataset.mvAdd, t.dataset.kind);
    else if (t.dataset.mvInfo) openInfo(app, t.dataset.mvInfo, t.dataset.mvClass);
    else if (t.dataset.mvDisc) discInfo(app, t.dataset.mvDisc);
    else if (t.dataset.mvRemove) {
      const id = t.value;
      save(t.dataset.mvRemove, c => (t.dataset.kind === 'stance'
        ? { stances: c.stances.filter(s => s !== id), stance: c.stance === id ? '' : c.stance }
        : { known: c.known.filter(s => s !== id), readied: c.readied.filter(s => s !== id) }));
    }
  });
  $('maneuvers').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.mvDiscipline) save(t.dataset.mvDiscipline, () => ({ discipline: t.value }));
    else if (t.dataset.mvReady) save(t.dataset.mvReady, c => ({ readied: t.checked ? [...c.readied, t.value] : c.readied.filter(s => s !== t.value) }));
    else if (t.dataset.mvStance) save(t.dataset.mvStance, () => ({ stance: t.value }));
  });
  // Choosing in the add popup: the maneuver joins the list (a new maneuver is readied while there's room).
  $('detail-body').addEventListener('click', e => {
    const info = e.target.closest('[data-mv-info]');
    if (info) { openInfo(app, info.dataset.mvInfo, info.dataset.mvClass); return; }
    const b = e.target.closest('[data-mv-choose]');
    if (!b) return;
    const { mvClass: cid, mvKind: kind } = $('detail-body').dataset;
    const id = b.dataset.mvChoose;
    $('detail-dialog').close();
    const x = app.view.initiators.find(i => i.cls.id === cid);
    save(cid, c => (kind === 'stance'
      ? { stances: [...c.stances, id], stance: c.stance || id }
      : { known: [...c.known, id], readied: c.readied.length < x.slots.readied ? [...c.readied, id] : c.readied }));
  });
}
