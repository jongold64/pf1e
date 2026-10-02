// Animal companion card (Character tab): shown when a class gives a companion (druid, hunter, ranger, a cleric or druid
// with the Animal domain). Choose the animal and name it; its statistics follow the effective druid level, with Roll
// buttons. Choices are kept in state.companion.
import { $, esc, signed, paragraphs } from './dom.js';
import { rollButton } from './roll-ui.js';
import { TRICKS, companionStats } from './companion.js';

const ABILITY_NAMES = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export function renderCompanion(app, view) {
  const { state, data } = app;
  const card = $('companion-card');
  const cl = view.companion;
  card.hidden = !cl.level;
  if (!cl.level) return;
  const c = state.companion;
  const box = $('companion');
  const openKeys = new Set([...box.querySelectorAll('details[open][data-key]')].map(d => d.dataset.key));
  const where = cl.sources.map(s => `${s.cls.name} ${s.levels}`).join(' + ');
  $('companion-level').textContent = `effective druid level ${cl.level}`;
  const animals = data.companions.animals;
  const group = (kind, label) => `<optgroup label="${label}">${animals.filter(a => a.kind === kind).map(a =>
    `<option value="${esc(a.id)}"${a.id === c.animal ? ' selected' : ''}>${esc(a.name)} (${esc(a.source)})</option>`).join('')}</optgroup>`;
  const picker = `<div class="companion-pick">
      <select data-comp="animal" aria-label="Animal"><option value="">Choose an animal…</option>${group('animal', 'Animals')}
        ${group('vermin', 'Vermin (needs the Vermin Heart feat)')}</select>
      <input type="text" data-comp="name" value="${esc(c.name)}" placeholder="Name" aria-label="Companion's name"></div>
    <p class="hint">Levels counted: ${esc(where)}.</p>`;
  const animal = animals.find(a => a.id === c.animal);
  if (!animal) {
    box.innerHTML = picker;
    return;
  }
  const s = companionStats(animal, cl.level, data.companions.progression, c);
  const title = c.name || animal.name;
  const roll = (label, n) => rollButton({ title: `${title}: ${label}`, check: label, plain: true, groups: [{ attacks: [n] }] });
  const defense = [
    ['Hit points', `${s.hp} <small class="muted">(${s.hd}d8)</small>`],
    ['AC', `${s.ac} <small class="muted">touch ${s.touch}, flat-footed ${s.flatFooted}</small>`],
    ['Fortitude', `${signed(s.fort)}${roll('Fortitude', s.fort)}`],
    ['Reflex', `${signed(s.ref)}${roll('Reflex', s.ref)}`],
    ['Will', `${signed(s.will)}${roll('Will', s.will)}`],
    ['Initiative', `${signed(s.init)}${roll('Initiative', s.init)}`],
    ['Speed', esc(s.speed || '—')],
    ['Size', esc(s.size)],
    ['Base attack', signed(s.bab)],
    ['CMB / CMD', `${signed(s.cmb)}${rollButton({ title: `${title}: combat maneuver`, check: 'CMB', groups: [{ attacks: [s.cmb] }] })} / ${s.cmd}`],
  ];
  const attackLines = s.attacks.map(x => {
    const label = `${x.count > 1 ? `${x.count} ` : ''}${x.name}${x.secondary ? ' (secondary)' : ''}${x.alternative ? ' (instead)' : ''}`;
    const spec = { title: `${title}: ${x.name}`, check: x.name, groups: [{ attacks: Array(x.count).fill(x.bonus), ...(x.damage ? { damage: x.damage } : {}), threat: 20, mult: 2 }] };
    return `<div class="defense-row"><span>${esc(label)}<small>${esc([x.damage, x.rider].filter(Boolean).join(' plus ') || '')}</small></span>
      <b>${esc(signed(x.bonus))}</b>${rollButton(spec)}</div>`;
  }).join('');
  const scores = Object.entries(s.scores).map(([a, v]) => `<td><b>${ABILITY_NAMES[a]}</b> ${v === null ? '—' : `${v} <small class="muted">(${signed(s.mod[a])})</small>`}</td>`).join('');
  const incs = Array.from({ length: s.increasesAllowed }, (_, i) => `<select data-comp-inc="${i}" aria-label="Ability score increase ${i + 1}">
      ${Object.entries(ABILITY_NAMES).filter(([a]) => s.scores[a] !== null).map(([a, n]) => `<option value="${a}"${(c.increases[i] || 'str') === a ? ' selected' : ''}>+1 ${n}</option>`).join('')}</select>`).join('');
  const skills = s.skills.map(k => `<tr><td>${esc(k.name)}</td><td><span class="base">
      <button type="button" data-comp-skill="${esc(k.name)}" data-step="-1" aria-label="Fewer ranks">−</button><span class="value">${k.ranks}</span>
      <button type="button" data-comp-skill="${esc(k.name)}" data-step="1" aria-label="More ranks">+</button></span></td>
      <td class="total">${signed(k.total)}${roll(k.name, k.total)}</td></tr>`).join('');
  const featOptions = data.feats.filter(f => !(f.types || []).includes('Mythic')).map(f => f.name).sort();
  const feats = Array.from({ length: s.featCount }, (_, i) => `<select data-comp-feat="${i}" aria-label="Companion feat ${i + 1}">
      <option value="">Feat ${i + 1}…</option>${featOptions.map(n => `<option${c.feats[i] === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`).join('');
  const tricks = TRICKS.map(t => `<label class="check-row small"><input type="checkbox" data-comp-trick="${esc(t)}"${c.tricks.includes(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('');
  const specials = [...new Set(s.specials)].map(name => {
    const text = data.companions.rules[name] || data.companions.rules[name.replace(/^\w/, ch => ch.toUpperCase())] || '';
    const key = `sp-${name}`;
    return `<details data-key="${esc(key)}"${openKeys.has(key) ? ' open' : ''}><summary>${esc(name.replace(/^\w/, ch => ch.toUpperCase()))}</summary>${paragraphs(text)}</details>`;
  }).join('');
  const intScore = s.scores.int;
  box.innerHTML = `${picker}
    <div class="companion-grid">
      <div><h3>Defense and movement</h3><dl class="facts">${defense.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
      <div><h3>Attacks</h3>${attackLines || '<p class="hint">No attacks listed.</p>'}
        ${s.multiattack && s.attacks.some(x => x.secondary) ? '<p class="hint">Multiattack: secondary attacks at -2.</p>' : ''}
        ${s.secondAttackNote ? `<p class="hint">${esc(s.secondAttackNote)}</p>` : ''}
        ${s.qualities ? `<p><b>Special qualities:</b> ${esc(s.qualities)}</p>` : ''}
        ${s.specialAttacks ? `<p><b>Special attacks:</b> ${esc(s.specialAttacks)}</p>` : ''}
        ${s.specialAbilities ? `<p><b>Special abilities:</b> ${esc(s.specialAbilities)}</p>` : ''}
        ${animal.cmd_note ? `<p class="hint">CMD ${esc(animal.cmd_note)}</p>` : ''}
        ${s.advanced ? `<p class="hint">Advanced at ${animal.advancement.level}th level (size, attacks and scores include it).</p>`
          : `<p class="hint">Advances at ${animal.advancement.level}th level.</p>`}</div>
    </div>
    <h3>Ability scores</h3><table class="companion-scores"><tr>${scores}</tr></table>
    ${incs ? `<p class="row-label">Ability score increases ${incs}</p>` : ''}
    <h3>Companion abilities</h3><div class="companion-specials">${specials}</div>
    <div class="companion-grid">
      <div><h3>Skills <span class="count${s.ranksUsed > s.ranksTotal ? ' over' : ''}">${s.ranksUsed} of ${s.ranksTotal} ranks</span></h3>
        <table class="companion-skills">${skills}</table></div>
      <div><h3>Feats <span class="count">${s.featCount}</span></h3><div class="companion-feats">${feats}</div>
        <p class="hint">Animal companions choose from the animal feats (Core Rulebook): Acrobatic, Agile Maneuvers, Armor Proficiency,
          Dodge, Endurance, Great Fortitude, Improved Initiative, Improved Natural Armor, Iron Will, Lightning Reflexes, Mobility,
          Power Attack, Run, Skill Focus, Stealthy, Toughness, Weapon Finesse and more with the GM's OK.</p>
        <h3>Tricks <span class="count">${c.tricks.length} known</span></h3>
        <p class="hint">${s.tricksBonus} bonus trick${s.tricksBonus === 1 ? '' : 's'} free${intScore ? `; up to ${intScore * 3 + s.tricksBonus} in all (3 per point of Int, plus the bonus ones)` : ''}.</p>
        <div class="companion-tricks">${tricks}</div></div>
    </div>`;
}

export function initCompanion(app) {
  const box = $('companion');
  const { state } = app;
  const set = patch => app.update({ companion: { ...state.companion, ...patch } });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.comp === 'animal') set({ animal: t.value });
    else if (t.dataset.comp === 'name') set({ name: t.value.slice(0, 40) });
    else if (t.dataset.compInc !== undefined) {
      const inc = [...state.companion.increases];
      inc[Number(t.dataset.compInc)] = t.value;
      set({ increases: Array.from(inc, x => x || 'str') });
    } else if (t.dataset.compFeat !== undefined) {
      const feats = [...state.companion.feats];
      feats[Number(t.dataset.compFeat)] = t.value;
      set({ feats: Array.from(feats, x => x || '') });
    } else if (t.dataset.compTrick) {
      const name = t.dataset.compTrick;
      set({ tricks: t.checked ? [...state.companion.tricks, name] : state.companion.tricks.filter(x => x !== name) });
    }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-comp-skill]');
    if (!b) return;
    const name = b.dataset.compSkill;
    const ranks = Math.min(20, Math.max(0, (state.companion.skills[name] || 0) + Number(b.dataset.step)));
    set({ skills: { ...state.companion.skills, [name]: ranks } });
  });
}

