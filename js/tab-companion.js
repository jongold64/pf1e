// Animal companion card (Character tab): shown when a class gives a companion (druid, hunter, ranger, a cleric or druid
// with the Animal domain). Choose the animal and name it; its statistics follow the effective druid level, with Roll
// buttons. Choices are kept in state.companion.
import { $, esc, signed, paragraphs, facts } from './dom.js';
import { rollButton } from './roll-ui.js';
import { TRICKS, ATTACK_FEATS, companionStats, bardingCost, bardingWeight } from './companion.js';
import { formatGp, formatLbs } from './equipment.js';

// The companion's choices as companionStats takes them (the barding as its armor record).
export const companionChoices = (state, data) => ({ ...state.companion,
  armor: state.companion.armorId && data.armorById.get(state.companion.armorId)
    ? { item: data.armorById.get(state.companion.armorId), enh: state.companion.armorEnh || 0 } : null });

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
      <input type="text" data-comp="name" value="${esc(c.name)}" placeholder="Name" aria-label="Companion's name">
      ${c.animal ? `<button type="button" class="skill-details" data-animal-pop="${esc(c.animal)}">Details</button>` : ''}</div>
    <p class="hint">Levels counted: ${esc(where)}.</p>
    <details class="flaw-browse" data-key="animal-browse"${openKeys.has('animal-browse') ? ' open' : ''}><summary>Browse all ${animals.length} companions</summary>
      <ul class="pick-list">${animals.map(a => `<li class="with-details"><button type="button" data-animal-pop="${esc(a.id)}"${a.id === c.animal ? ' class="mine"' : ''}>${a.id === c.animal ? '<span class="status met">✓</span>' : ''}${esc(a.name)}
          <small>${esc(a.size)} · ${esc(a.attacks || '')}${a.kind === 'vermin' ? ' · vermin' : ''}</small></button>
        <button type="button" class="skill-details" data-animal-pop="${esc(a.id)}" aria-label="${esc(a.name)} in a popup">Details</button></li>`).join('')}</ul></details>`;
  const animal = animals.find(a => a.id === c.animal);
  if (!animal) {
    box.innerHTML = picker;
    return;
  }
  const s = companionStats(animal, cl.level, data.companions.progression, companionChoices(state, data));
  const title = c.name || animal.name;
  const roll = (label, n) => rollButton({ title: `${title}: ${label}`, check: label, plain: true, groups: [{ attacks: [n] }] });
  const why = (key, what) => `<button type="button" class="skill-details" data-comp-why="${esc(key)}" aria-label="What adds to ${esc(what)}">Details</button>`;
  const defense = [
    ['Hit points', `${s.hp} <small class="muted">(${s.hd}d8)</small>${why('hp', 'hit points')}`],
    ['AC', `${s.ac} <small class="muted">touch ${s.touch}, flat-footed ${s.flatFooted}</small>${why('ac', 'AC')}`],
    ['Fortitude', `${signed(s.fort)}${roll('Fortitude', s.fort)}${why('fort', 'Fortitude')}`],
    ['Reflex', `${signed(s.ref)}${roll('Reflex', s.ref)}${why('ref', 'Reflex')}`],
    ['Will', `${signed(s.will)}${roll('Will', s.will)}${why('will', 'Will')}`],
    ['Initiative', `${signed(s.init)}${roll('Initiative', s.init)}${why('init', 'initiative')}`],
    ['Speed', esc(s.speed || '—')],
    ['Size', esc(s.size)],
    ['Base attack', signed(s.bab)],
    ['CMB / CMD', `${signed(s.cmb)}${rollButton({ title: `${title}: combat maneuver`, check: 'CMB', groups: [{ attacks: [s.cmb] }] })} / ${s.cmd}${why('cm', 'CMB and CMD')}`],
  ];
  const attackLines = s.attacks.map((x, ai) => {
    const label = `${x.count > 1 ? `${x.count} ` : ''}${x.name}${x.secondary ? ' (secondary)' : ''}${x.alternative ? ' (instead)' : ''}`;
    const spec = { title: `${title}: ${x.name}`, check: x.name, groups: [{ attacks: Array(x.count).fill(x.bonus), ...(x.damage ? { damage: x.damage } : {}), threat: 20, mult: 2 }] };
    return `<div class="defense-row"><span>${esc(label)}<small>${esc([x.damage, x.rider].filter(Boolean).join(' plus ') || '')}</small></span>
      <b>${esc(signed(x.bonus))}</b>${rollButton(spec)}${why(`attack-${ai}`, x.name)}</div>`;
  }).join('');
  const scores = Object.entries(s.scores).map(([a, v]) => `<td><b>${ABILITY_NAMES[a]}</b> ${v === null ? '—' : `${v} <small class="muted">(${signed(s.mod[a])})</small>`}</td>`).join('');
  const incs = Array.from({ length: s.increasesAllowed }, (_, i) => `<select data-comp-inc="${i}" aria-label="Ability score increase ${i + 1}">
      ${Object.entries(ABILITY_NAMES).filter(([a]) => s.scores[a] !== null).map(([a, n]) => `<option value="${a}"${(c.increases[i] || 'str') === a ? ' selected' : ''}>+1 ${n}</option>`).join('')}</select>`).join('');
  const skills = s.skills.map(k => `<tr><td>${esc(k.name)}</td><td><span class="base">
      <button type="button" data-comp-skill="${esc(k.name)}" data-step="-1" aria-label="Fewer ranks">−</button><span class="value">${k.ranks}</span>
      <button type="button" data-comp-skill="${esc(k.name)}" data-step="1" aria-label="More ranks">+</button></span></td>
      <td class="total">${signed(k.total)}${roll(k.name, k.total)}${why(`skill-${k.name}`, k.name)}</td></tr>`).join('');
  const featOptions = data.feats.filter(f => !(f.types || []).includes('Mythic')).map(f => f.name).sort();
  // Weapon Focus and Improved Natural Attack: which natural attack each is for.
  const attackNames = [...new Set(s.attacks.map(x => x.name))];
  const feats = Array.from({ length: s.featCount }, (_, i) => `<div class="companion-feat"><select data-comp-feat="${i}" aria-label="Companion feat ${i + 1}">
      <option value="">Feat ${i + 1}…</option>${featOptions.map(n => `<option${c.feats[i] === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${ATTACK_FEATS.includes(c.feats[i]) ? `<select data-comp-pick="${i}" aria-label="Natural attack for ${esc(c.feats[i])}">
        <option value="">Which attack…</option>${attackNames.map(n => `<option${(c.featPicks || [])[i] === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}</div>`).join('');
  // Barding: armor for the animal (any light, medium or heavy armor), with its enhancement bonus.
  const bardingList = data.armor.filter(a => a.category !== 'shield');
  const b = s.barding;
  const bardingHtml = `<h3>Barding (armor)</h3>
    <div class="companion-pick"><select data-comp="armor" aria-label="Barding"><option value="">None</option>${['light', 'medium', 'heavy'].map(cat =>
      `<optgroup label="${cat[0].toUpperCase()}${cat.slice(1)}">${bardingList.filter(a => a.category === cat).map(a => `<option value="${esc(a.id)}"${a.id === c.armorId ? ' selected' : ''}>${esc(a.name)} (+${a.bonus})</option>`).join('')}</optgroup>`).join('')}</select>
      ${b ? `<select data-comp="armorEnh" aria-label="Barding quality">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === (c.armorEnh || 0) ? ' selected' : ''}>${n ? `+${n}` : 'Normal'}</option>`).join('')}</select>` : ''}</div>
    ${b ? `<p class="hint">+${b.ac} armor to AC${b.item.max_dex !== null ? `, Dex bonus at most +${b.item.max_dex}` : ''}${b.acp ? `, ${b.acp} on Str and Dex skills` : ''}.
        Costs ${esc(formatGp(bardingCost(b.item, s.size, b.enh)))} and weighs ${esc(formatLbs(bardingWeight(b.item, s.size)))} (${esc(s.size)} animal: barding costs more than a person's armor),
        counted in your gold on the Equipment tab.</p>
      ${b.proficient ? '' : `<p class="warning">Without the ${esc(b.profFeat)} feat, its check penalty (${b.acp}) also applies to its attack rolls.</p>`}
      ${['medium', 'heavy'].includes(b.item.category) ? '<p class="hint">Medium or heavy barding slows it, and a flying animal can\u2019t fly in it.</p>' : ''}`
      : '<p class="hint">Companions can wear armor (barding); it needs the Armor Proficiency feats to use without penalty on attacks.</p>'}`;
  const tricks = TRICKS.map(t => `<label class="check-row small"><input type="checkbox" data-comp-trick="${esc(t)}"${c.tricks.includes(t) ? ' checked' : ''}> ${esc(t)}
      <button type="button" class="skill-details" data-trick-pop="${esc(t)}" aria-label="What ${esc(t)} does">Details</button></label>`).join('');
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
    ${bardingHtml}
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

// A Details popup for one of the companion's numbers (key: hp, ac, fort, ref, will, init, cm, attack-N, skill-Name).
function showWhy(app, key) {
  const { state, data, view } = app;
  const animal = data.companions.animals.find(a => a.id === state.companion.animal);
  if (!animal || !view.companion.level) return;
  const s = companionStats(animal, view.companion.level, data.companions.progression, state.companion);
  const name = state.companion.name || animal.name;
  const table = (rows, total) => `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td>
    <td class="num">${esc(r.text ?? signed(r.value))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(total)}</b></td></tr></tfoot></table>`;
  let title = '', html = '';
  if (key === 'hp') { title = `Hit points ${s.hp}`; html = table(s.why.hp, String(s.hp)); }
  else if (['fort', 'ref', 'will', 'init'].includes(key)) {
    title = `${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will', init: 'Initiative' }[key]} ${signed(s[key])}`;
    html = table(s.why[key], signed(s[key]));
  } else if (key === 'ac') {
    const cell = (v, base) => (v === null || v === undefined ? '<td class="num muted">—</td>' : `<td class="num">${esc(base ? String(v) : signed(v))}</td>`);
    title = `AC ${s.ac}`;
    html = `<table class="skill-why"><thead><tr><th></th><th class="num">AC</th><th class="num">Touch</th><th class="num">Flat-footed</th></tr></thead>
      <tbody>${s.why.ac.map((r, i) => `<tr><td>${esc(r.label)}</td>${cell(r.ac, i === 0)}${cell(r.touch, i === 0)}${cell(r.flat, i === 0)}</tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Total</b></td><td class="num"><b>${s.ac}</b></td><td class="num"><b>${s.touch}</b></td><td class="num"><b>${s.flatFooted}</b></td></tr></tfoot></table>`;
  } else if (key === 'cm') {
    title = `CMB ${signed(s.cmb)} · CMD ${s.cmd}`;
    html = `<h3>Combat Maneuver Bonus</h3>${table(s.why.cmb, signed(s.cmb))}<h3>Combat Maneuver Defense</h3>${table(s.why.cmd, String(s.cmd))}`;
  } else if (key.startsWith('attack-')) {
    const x = s.attacks[Number(key.slice(7))];
    if (!x) return;
    title = `${x.name} ${signed(x.bonus)}`;
    html = `<h3>Attack roll</h3>${table(x.why.attack, signed(x.bonus))}<h3>Damage</h3>${table(x.why.damage, x.damage || '—')}
      ${x.rider ? `<p class="hint">Plus ${esc(x.rider)}.</p>` : ''}`;
  } else if (key.startsWith('skill-')) {
    const k = s.skills.find(x => x.name === key.slice(6));
    if (!k) return;
    title = `${k.name} ${signed(k.total)}`;
    html = table(k.why, signed(k.total));
  }
  app.openDetail(`${name}: ${title}`, html);
}

// An animal in a popup: its starting statistics, what changes when it advances, and what it would be at your effective
// druid level, with Choose.
function popAnimal(app, id) {
  const { state, data, view } = app;
  const a = data.companions.animals.find(x => x.id === id);
  if (!a) return;
  const level = view.companion.level || 1;
  const s = companionStats(a, level, data.companions.progression, { increases: [], feats: [], skills: {} });
  const scores = (sc, plus = false) => Object.entries(sc).map(([k, v]) => `${ABILITY_NAMES[k]} ${v === null ? '—' : plus && v > 0 ? `+${v}` : v}`).join(', ');
  const adv = a.advancement;
  const mine = state.companion.animal === a.id;
  app.openDetail(`${a.name} (animal companion)`, `<p class="hint">${esc(a.source)}${a.kind === 'vermin' ? ' · vermin: needs the Vermin Heart feat' : ''}</p>
    <h3>Starting statistics</h3>
    ${facts([['Size', a.size], ['Speed', a.speed], ['Natural armor', `+${a.natural_armor}`], ['Attacks', a.attacks],
             ['Ability scores', scores(a.abilities)], ['Special qualities', a.special_qualities], ['Special attacks', a.special_attacks],
             ['Special abilities', a.special_abilities], ['CMD', a.cmd_note], ['Bonus feat', a.bonus_feat]])}
    ${adv ? `<h3>At ${esc(String(adv.level))}th level</h3>${facts([['Size', adv.size], ['Natural armor', adv.natural_armor ? `+${adv.natural_armor} more` : null],
      ['Attacks', adv.attacks], ['Ability scores', scores(adv.abilities || {}, true)], ['Special qualities', adv.special_qualities],
      ['Special attacks', adv.special_attacks], ['Special abilities', adv.special_abilities], ['Bonus feat', adv.bonus_feat]])}` : ''}
    <h3>At your effective druid level (${level})</h3>
    ${facts([['Hit points', `${s.hp} (${s.hd}d8)`], ['AC', `${s.ac} (touch ${s.touch}, flat-footed ${s.flatFooted})`],
             ['Saves', `Fort ${signed(s.fort)}, Ref ${signed(s.ref)}, Will ${signed(s.will)}`],
             ['Attacks', s.attacks.map(x => `${x.count > 1 ? `${x.count} ` : ''}${x.name} ${signed(x.bonus)}${x.damage ? ` (${x.damage})` : ''}`).join(', ')],
             ['CMB / CMD', `${signed(s.cmb)} / ${s.cmd}`], ['Size', s.size]])}
    <p class="hint">Before ability score increases and feats you choose.</p>`,
    mine ? [] : [{ label: `Choose the ${a.name}`, primary: true, run: () => app.update({ companion: { ...state.companion, animal: a.id } }) }]);
}

// A trick in a popup (Core Rulebook, Handle Animal): what the animal does, the DC to teach it, and Teach / Forget.
function popTrick(app, name) {
  const { state, data } = app;
  const t = name === 'Attack (all creatures)'
    ? { name, dc: 20, text: 'Attack taught a second time: the animal attacks all creatures, including unnatural ones such as undead and aberrations, not just humanoids, monstrous humanoids, giants and animals. It counts as two tricks (Attack and this one).' }
    : (data.companions.tricks || []).find(x => x.name === name);
  if (!t) return;
  const known = state.companion.tricks.includes(name);
  const animal = data.companions.animals.find(a => a.id === state.companion.animal);
  const s = animal && companionStats(animal, app.view.companion.level, data.companions.progression, companionChoices(state, data));
  const limit = s?.scores.int ? s.scores.int * 3 + s.tricksBonus : null;
  app.openDetail(`${t.name} (trick)`, `<p class="hint">Handle Animal · Core Rulebook</p>${paragraphs(t.text)}
    ${facts([['To teach it', `DC ${t.dc} Handle Animal check, after 1 week of work`], ['To push it without the trick', 'DC 25 Handle Animal check']])}
    <p class="hint">${esc(data.companions.rules['Teach an Animal a Trick'] || '')}</p>
    <p class="hint">An animal companion also knows its bonus tricks (${s ? s.tricksBonus : 'by level'}) without any training${limit ? `; yours can know up to ${limit} in all` : ''}.</p>`,
    [known ? { label: 'Forget it', run: () => app.update({ companion: { ...state.companion, tricks: state.companion.tricks.filter(x => x !== name) } }) }
           : { label: 'It knows this trick', primary: true, run: () => app.update({ companion: { ...state.companion, tricks: [...state.companion.tricks, name] } }) }]);
}

export function initCompanion(app) {
  const box = $('companion');
  const { state } = app;
  const set = patch => app.update({ companion: { ...state.companion, ...patch } });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.comp === 'animal') set({ animal: t.value });
    else if (t.dataset.comp === 'armor') set({ armorId: t.value, armorEnh: t.value ? state.companion.armorEnh || 0 : 0 });
    else if (t.dataset.comp === 'armorEnh') set({ armorEnh: Number(t.value) });
    else if (t.dataset.compPick !== undefined) {
      const picks = [...(state.companion.featPicks || [])];
      picks[Number(t.dataset.compPick)] = t.value;
      set({ featPicks: Array.from(picks, x => x || '') });
    }
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
      let tricks = t.checked ? [...state.companion.tricks, name] : state.companion.tricks.filter(x => x !== name);
      // Attack taught twice (all creatures) includes Attack itself.
      if (t.checked && name === 'Attack (all creatures)' && !tricks.includes('Attack')) tricks.push('Attack');
      if (!t.checked && name === 'Attack') tricks = tricks.filter(x => x !== 'Attack (all creatures)');
      set({ tricks });
    }
  });
  box.addEventListener('click', e => {
    const pop = e.target.closest('[data-animal-pop]');
    if (pop) { popAnimal(app, pop.dataset.animalPop); return; }
    const tp = e.target.closest('[data-trick-pop]');
    if (tp) { e.preventDefault(); popTrick(app, tp.dataset.trickPop); return; }
    const w = e.target.closest('[data-comp-why]');
    if (w) { showWhy(app, w.dataset.compWhy); return; }
    const b = e.target.closest('[data-comp-skill]');
    if (!b) return;
    const name = b.dataset.compSkill;
    const ranks = Math.min(20, Math.max(0, (state.companion.skills[name] || 0) + Number(b.dataset.step)));
    set({ skills: { ...state.companion.skills, [name]: ranks } });
  });
}

