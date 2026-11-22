// Craft tab, top card: making non-magical items with the Craft skill (mundane-craft.js has the rules). Start a project
// (the raw materials are paid then), roll a week or a day of work (or take 10), and when it's finished it joins your gear.
import { $, esc } from './dom.js';
import { formatGp } from './equipment.js';
import { randomDie } from './dice.js';
import { craftDC, craftSkillFor, newProject, workOn, projectState, weeksTaking10, rawCost, MASTERWORK, MASTERWORK_DC } from './mundane-craft.js';

// Equipment that can be made (not services, animals, vehicles, food, special materials or technology).
const GEAR_CATEGORIES = ['Adventuring Gear', 'Alchemical Items', 'Tools and Skill Kits', 'Clothing', 'Ammunition', 'Entertainment and Trade Goods'];
const KINDS = [['weapon', 'Weapon'], ['armor', 'Armor or shield'], ['gear', 'Equipment or alchemical item']];
const form = { kind: 'weapon', search: '', itemId: '', mw: false, skill: '', fast: false };

function itemsFor(app, kind) {
  const d = app.data;
  if (kind === 'weapon') return [...(d.weaponsById?.values() || [])].filter(w => w.price_gp && w.id !== 'unarmed-strike');
  if (kind === 'armor') return (d.armor || []).filter(a => a.price_gp);
  return (d.gear || []).filter(g => g.price_gp && GEAR_CATEGORIES.includes(g.category));
}
const itemById = (app, kind, id) => itemsFor(app, kind).find(x => x.id === id);

// The Craft skills to choose from: the one that fits, the Craft specialties the character has, and plain Craft.
function skillChoices(app, fits) {
  const mine = (app.state.specialties || []).filter(n => /^Craft \(/.test(n));
  return [...new Set([fits, ...mine, 'Craft'].filter(Boolean))];
}
const skillTotal = (app, name) => { try { return app.skillTotalFor(name)?.total ?? 0; } catch { return 0; } };

export function renderMundaneCraft(app) {
  const box = $('make-body');
  if (!box) return;
  if (!app.data.gear) { box.innerHTML = '<p class="hint">Loading equipment…</p>'; app.loadGear().then(() => renderMundaneCraft(app)); return; }
  if (!app.data.weaponsById) { app.loadWeapons().then(() => renderMundaneCraft(app)); return; }
  const list = itemsFor(app, form.kind);
  const q = form.search.trim().toLowerCase();
  const shown = list.filter(x => !q || x.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
  const item = itemById(app, form.kind, form.itemId) || null;
  const fits = item ? craftSkillFor(form.kind, item) : null;
  const skills = skillChoices(app, fits);
  if (!skills.includes(form.skill)) form.skill = skills[0];
  const total = skillTotal(app, form.skill);
  const preview = item ? newProject({ kind: form.kind, item, mw: form.mw, skill: form.skill, fast: form.fast }) : null;
  const weeks = preview ? weeksTaking10(preview, total) : null;
  const ps = preview ? projectState(preview) : null;
  box.innerHTML = `<p class="hint">Make a weapon, armor, a shield or other gear with your Craft skill (Core Rulebook): the raw materials cost
      a third of its price, and each week your check × the DC in silver pieces goes toward the price. Masterwork is a
      separate part (DC ${MASTERWORK_DC}). Magic items are made in the card below.</p>
    <div class="custom-grid">
      <label>What to make <select data-mk="kind">${KINDS.map(([k, l]) => `<option value="${k}"${k === form.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Search <input type="search" data-mk="search" value="${esc(form.search)}" placeholder="Name, e.g. longsword" autocomplete="off"></label>
      <label>Item <select data-mk="itemId"><option value="">choose one (${shown.length})</option>${shown.map(x => `<option value="${esc(x.id)}"${x.id === form.itemId ? ' selected' : ''}>${esc(x.name)} (${esc(formatGp(x.price_gp))})</option>`).join('')}</select></label>
    </div>
    ${item ? `<div class="custom-grid">
      ${MASTERWORK[form.kind] ? `<label class="check-row"><input type="checkbox" data-mk="mw"${form.mw ? ' checked' : ''}> Masterwork (+${MASTERWORK[form.kind]} gp, a DC ${MASTERWORK_DC} part)</label>` : ''}
      <label>Craft skill <select data-mk="skill">${skills.map(s => `<option value="${esc(s)}"${s === form.skill ? ' selected' : ''}>${esc(s)} (${skillTotal(app, s) >= 0 ? '+' : ''}${skillTotal(app, s)})</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" data-mk="fast"${form.fast ? ' checked' : ''}> Faster: +10 to the DC (more progress each check)</label></div>
      <table class="skill-why"><tbody>
        <tr><td>${esc(item.name)}: price</td><td class="num">${esc(formatGp(item.price_gp))}</td></tr>
        ${preview.mw ? `<tr><td>Masterwork part</td><td class="num">${esc(formatGp(preview.mwPrice))}</td></tr>` : ''}
        <tr><td>Craft DC${preview.mw ? ` (masterwork part ${MASTERWORK_DC}${form.fast ? ' + 10' : ''})` : ''}</td><td class="num">${ps.dc}</td></tr>
        <tr><td><b>Raw materials (a third of the price)</b></td><td class="num"><b>${esc(formatGp(preview.spent))}</b></td></tr>
        <tr><td>Taking 10 (${10 + total}) every week</td><td class="num">${weeks === null ? 'can’t make the DC: roll instead' : `${weeks} week${weeks === 1 ? '' : 's'}`}</td></tr>
      </tbody></table>
      <div class="line-controls"><button type="button" class="primary" data-mk-start>Start: pay ${esc(formatGp(preview.spent))} for the raw materials</button></div>` : ''}
    ${projectsHtml(app)}`;
}

function projectsHtml(app) {
  const list = app.state.craftProjects || [];
  if (!list.length) return '';
  return `<h3>Being made</h3>${list.map((p, i) => {
    const s = projectState(p);
    const total = skillTotal(app, p.skill);
    const weeks = weeksTaking10(p, total);
    const bar = (have, need) => `<progress max="${need}" value="${Math.min(have, need)}"></progress> ${Math.floor(have)} / ${need} sp`;
    return `<div class="line-card make-project">
      <p><b>${esc(p.name)}${p.mw ? ' (masterwork)' : ''}</b> <small class="muted">${esc(p.skill)} ${total >= 0 ? '+' : ''}${total} · DC ${s.dc}${p.fast ? ' (faster)' : ''} · materials ${esc(formatGp(p.spent))}</small></p>
      <p>Item: ${bar(p.progress, s.need)}${p.mw ? `<br>Masterwork part: ${bar(p.mwProgress, s.mwNeed)}` : ''}</p>
      ${p.last ? `<p class="hint">${esc(p.last)}</p>` : ''}
      <div class="line-controls">${s.done ? `<button type="button" class="primary" data-mk-finish="${i}">Finished: add it to my gear</button>`
        : `<button type="button" class="primary" data-mk-roll="${i}" data-how="week">Roll a week</button><button type="button" data-mk-roll="${i}" data-how="day">Roll a day</button>
           <button type="button" data-mk-roll="${i}" data-how="take10">Take 10 (a week)</button>`}
        <button type="button" data-mk-drop="${i}">Give up</button></div>
      ${!s.done ? `<p class="hint">${weeks === null ? 'Taking 10 can’t make the DC.' : `Taking 10, about ${weeks} more week${weeks === 1 ? '' : 's'}.`}</p>` : ''}</div>`;
  }).join('')}`;
}

// Puts a finished project in the character's gear (free: what it cost is the raw materials, kept as a cost adjustment).
function finish(app, i) {
  const p = app.state.craftProjects[i];
  const s = app.state;
  const rest = s.craftProjects.filter((_, j) => j !== i);
  const paid = { costAdjust: [...s.costAdjust, { note: `Made: ${p.name}${p.mw ? ' (masterwork)' : ''}, raw materials`, gp: -p.spent }] };
  if (p.kind === 'weapon') {
    app.update({ craftProjects: rest, ...paid, weapons: [...s.weapons, { id: p.itemId, enh: 0, ...(p.mw ? { masterwork: true } : {}), free: true }] });
  } else if (p.kind === 'armor') {
    const a = app.data.armorById.get(p.itemId);
    const k = a?.category === 'shield' ? 'shield' : 'armor';
    if (s[`${k}Id`] && !confirm(`You're already using a ${k}. Wear the new ${p.name} in its place? (The old one comes off your Armor tab.)`)) return;
    app.update({ craftProjects: rest, ...paid, [`${k}Id`]: p.itemId, [`${k}Enh`]: 0, [`${k}Mw`]: p.mw, [`${k}Abilities`]: [], [`${k}Material`]: '', [`${k}Crafted`]: false, [`${k}Free`]: true });
  } else {
    app.update({ craftProjects: rest, ...paid, inventory: [...s.inventory, { id: p.itemId, qty: 1, free: true }] });
  }
}

export function initMundaneCraft(app) {
  const box = $('make-body');
  if (!box) return;
  box.addEventListener('input', e => {
    if (e.target.dataset.mk === 'search') { form.search = e.target.value; renderMundaneCraft(app); const s = box.querySelector('[data-mk="search"]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });
  box.addEventListener('change', e => {
    const k = e.target.dataset.mk;
    if (!k || k === 'search') return;
    // A new kind or item starts with the Craft skill that fits it.
    if (k === 'kind') Object.assign(form, { kind: e.target.value, itemId: '', search: '', mw: false, skill: '' });
    else if (k === 'itemId') Object.assign(form, { itemId: e.target.value, skill: '' });
    else if (k === 'mw' || k === 'fast') form[k] = e.target.checked;
    else form[k] = e.target.value;
    renderMundaneCraft(app);
  });
  box.addEventListener('click', e => {
    if (e.target.closest('[data-mk-start]')) {
      const item = itemById(app, form.kind, form.itemId);
      if (!item) return;
      const p = newProject({ kind: form.kind, item, mw: form.mw, skill: form.skill, fast: form.fast, strRating: 0 });
      app.update({ craftProjects: [...(app.state.craftProjects || []), p] });
      form.itemId = '';
      renderMundaneCraft(app);
      return;
    }
    const roll = e.target.closest('[data-mk-roll]');
    if (roll) {
      const i = Number(roll.dataset.mkRoll);
      const p = app.state.craftProjects[i];
      const total = skillTotal(app, p.skill);
      const d = roll.dataset.how === 'take10' ? 10 : randomDie(20);
      const next = workOn(p, d + total, { day: roll.dataset.how === 'day' });
      next.last = next.last.replace(/^(Week|Day): /, `$1, ${roll.dataset.how === 'take10' ? 'taking 10' : `d20 (${d})`} + ${total} = `);
      app.update({ craftProjects: app.state.craftProjects.map((x, j) => (j === i ? next : x)) });
      renderMundaneCraft(app);
      return;
    }
    const fin = e.target.closest('[data-mk-finish]');
    if (fin) { finish(app, Number(fin.dataset.mkFinish)); renderMundaneCraft(app); return; }
    const drop = e.target.closest('[data-mk-drop]');
    if (drop) {
      const i = Number(drop.dataset.mkDrop);
      const p = app.state.craftProjects[i];
      if (!confirm(`Give up making ${p.name}? The ${formatGp(p.spent)} spent on raw materials is lost.`)) return;
      app.update({ craftProjects: app.state.craftProjects.filter((_, j) => j !== i),
        costAdjust: [...app.state.costAdjust, { note: `Gave up making ${p.name}: raw materials lost`, gp: -p.spent }] });
      renderMundaneCraft(app);
    }
  });
}
export { craftDC, rawCost };
