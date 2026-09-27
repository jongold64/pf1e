// Page code: loads the data, builds the controls, and shows the results from rules.js.
import {
  ABILITIES, ABILITY_NAMES, BUDGETS, MIN_SCORE, MAX_SCORE, POINT_COSTS, INCREASE_LEVELS,
  pointsSpent, racialAdjustments, characterStats, formatBab,
} from './rules.js';

const STORAGE_KEY = 'pf1e-builder-character';
const RACE_GROUPS = [['core', 'Core'], ['featured', 'Featured'], ['uncommon', 'Uncommon'], ['other', 'Other']];
const CLASS_GROUPS = [['core', 'Core'], ['base', 'Base'], ['hybrid', 'Hybrid'], ['alternate', 'Alternate'], ['npc', 'NPC']];

const $ = id => document.getElementById(id);

let races = [];
let classes = [];

const state = {
  race: 'human',
  cls: 'fighter',
  level: 1,
  budget: 15,
  base: Object.fromEntries(ABILITIES.map(a => [a, 10])),
  flexible: 'str',
  increases: INCREASE_LEVELS.map(() => ''),  // ability picked at each of levels 4, 8, 12, 16, 20
  armor: 0,
  shield: 0,
  favored: 'hp',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// Saved characters survive a reload. Storage can be blocked (private browsing), so failures are ignored.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) Object.assign(state, saved, { base: { ...state.base, ...saved.base } });
  } catch { /* start fresh */ }
  for (const a of ABILITIES) {
    if (!(state.base[a] in POINT_COSTS)) state.base[a] = 10;
  }
  if (!(Number.isInteger(state.level) && state.level >= 1 && state.level <= 20)) state.level = 1;
  state.increases = INCREASE_LEVELS.map((_, i) =>
    ABILITIES.includes(state.increases?.[i]) ? state.increases[i] : '');
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not saved */ }
}

function groupedOptions(items, groups) {
  return groups.map(([cat, label]) => {
    const opts = items.filter(x => x.category === cat)
      .map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    return opts ? `<optgroup label="${label}">${opts}</optgroup>` : '';
  }).join('');
}

function buildControls() {
  $('race').innerHTML = groupedOptions(races, RACE_GROUPS);
  $('class').innerHTML = groupedOptions(classes, CLASS_GROUPS);
  $('budget').innerHTML = BUDGETS.map(b => `<option value="${b.points}">${b.label}</option>`).join('');
  $('flexible').innerHTML = ABILITIES.map(a => `<option value="${a}">${ABILITY_NAMES[a]}</option>`).join('');
  $('level').innerHTML = Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');

  const abilityOptions = '<option value="">— choose —</option>' +
    ABILITIES.map(a => `<option value="${a}">${ABILITY_NAMES[a]}</option>`).join('');
  $('increase-rows').innerHTML = INCREASE_LEVELS.map((lv, i) => `
    <label class="row" id="increase-row-${i}">Level ${lv}: +1 to
      <select data-increase="${i}">${abilityOptions}</select>
    </label>`).join('');

  $('ability-rows').innerHTML = ABILITIES.map(a => `
    <tr>
      <td>${ABILITY_NAMES[a]}</td>
      <td><span class="base">
        <button type="button" data-ability="${a}" data-step="-1" aria-label="Lower ${ABILITY_NAMES[a]}">−</button>
        <span class="value" id="base-${a}"></span>
        <button type="button" data-ability="${a}" data-step="1" aria-label="Raise ${ABILITY_NAMES[a]}">+</button>
      </span></td>
      <td id="race-${a}"></td>
      <td id="inc-${a}"></td>
      <td class="score" id="score-${a}"></td>
      <td id="mod-${a}"></td>
    </tr>`).join('');

  $('race').value = state.race;
  $('class').value = state.cls;
  $('level').value = state.level;
  INCREASE_LEVELS.forEach((_, i) => { document.querySelector(`[data-increase="${i}"]`).value = state.increases[i]; });
  $('budget').value = state.budget;
  $('flexible').value = state.flexible;
  $('armor').value = state.armor;
  $('shield').value = state.shield;
  if (state.favored !== 'skill') state.favored = 'hp';
  document.querySelector(`input[name="favored"][value="${state.favored}"]`).checked = true;

  // A saved id that no longer exists in the data falls back to the first option.
  if (!$('race').value) $('race').selectedIndex = 0;
  if (!$('class').value) $('class').selectedIndex = 0;
  state.race = $('race').value;
  state.cls = $('class').value;

  $('race').addEventListener('change', e => update({ race: e.target.value }));
  $('class').addEventListener('change', e => update({ cls: e.target.value }));
  $('level').addEventListener('change', e => update({ level: Number(e.target.value) }));
  $('increase-rows').addEventListener('change', e => {
    const i = Number(e.target.dataset.increase);
    update({ increases: state.increases.map((a, j) => (j === i ? e.target.value : a)) });
  });
  $('budget').addEventListener('change', e => update({ budget: Number(e.target.value) }));
  $('flexible').addEventListener('change', e => update({ flexible: e.target.value }));
  $('armor').addEventListener('input', e => update({ armor: Math.max(0, Number(e.target.value) || 0) }));
  $('shield').addEventListener('input', e => update({ shield: Math.max(0, Number(e.target.value) || 0) }));
  document.querySelectorAll('input[name="favored"]').forEach(r =>
    r.addEventListener('change', e => update({ favored: e.target.value })));
  $('ability-rows').addEventListener('click', e => {
    const btn = e.target.closest('button[data-ability]');
    if (!btn) return;
    const a = btn.dataset.ability;
    const next = state.base[a] + Number(btn.dataset.step);
    if (next >= MIN_SCORE && next <= MAX_SCORE) update({ base: { ...state.base, [a]: next } });
  });
}

function update(changes) {
  Object.assign(state, changes);
  save();
  render();
}

function render() {
  const race = races.find(r => r.id === state.race);
  const cls = classes.find(c => c.id === state.cls);

  // Race info
  // Ability scores, size, speed, type and languages are shown elsewhere, so list only the other traits.
  const traits = (race.traits || []).filter(t => !t.kind);
  $('race-info').innerHTML = `
    ${race.incomplete ? '<p class="warning">Some of this race\'s traits are missing from the source data.</p>' : ''}
    <p>${esc(race.size)} ${esc(race.type || '')} · Speed ${race.base_speed ?? '?'} ft.</p>
    <p>${traits.map(t => esc(t.name)).join(', ')}</p>`;

  // Class info: features gained at every level up to the current one
  const features = cls.progression.slice(0, state.level)
    .map(r => `<li><b>${r.level}</b> ${r.special.map(esc).join(', ') || '—'}</li>`).join('');
  $('class-info').innerHTML = `
    <p>Hit die ${esc(cls.hit_die)} · ${cls.skill_ranks_per_level} + Int skill ranks per level</p>
    <details>
      <summary>Class features by level</summary>
      <ol class="features">${features}</ol>
    </details>`;
  $('subtitle').textContent = `${cls.name} ${state.level}`;

  // Point buy
  const spent = pointsSpent(state.base);
  const left = state.budget - spent;
  $('points').textContent = left >= 0 ? `${spent} spent, ${left} left` : `${spent} spent, ${-left} over budget`;
  $('points').classList.toggle('over', left < 0);

  // Ability rows
  $('flexible-row').hidden = !race.flexible_ability_bonus;
  const adj = racialAdjustments(race, state.flexible);
  const stats = characterStats({
    race, cls, level: state.level, baseScores: state.base, flexibleChoice: state.flexible,
    increases: state.increases,
    armor: state.armor, shield: state.shield, favoredHp: state.favored === 'hp',
  });
  for (const a of ABILITIES) {
    $(`base-${a}`).textContent = state.base[a];
    $(`base-${a}`).title = `Costs ${POINT_COSTS[state.base[a]]} points`;
    $(`race-${a}`).textContent = adj[a] ? signed(adj[a]) : '';
    $(`inc-${a}`).textContent = stats.increases[a] ? signed(stats.increases[a]) : '';
    $(`score-${a}`).textContent = stats.scores[a];
    $(`mod-${a}`).textContent = signed(stats.mod[a]);
  }

  // Ability increases: only the levels reached so far are shown
  const reached = INCREASE_LEVELS.filter(lv => state.level >= lv).length;
  INCREASE_LEVELS.forEach((_, i) => { $(`increase-row-${i}`).hidden = i >= reached; });
  $('increases').hidden = reached === 0;
  const unchosen = state.increases.slice(0, reached).filter(a => !a).length;
  $('increase-note').textContent = unchosen ? `${unchosen} increase${unchosen > 1 ? 's' : ''} still to choose.` : '';

  // Results
  const results = [
    ['Hit points', stats.hp],
    ['Base attack bonus', formatBab(stats.bab)],
    ['Fortitude', signed(stats.fort)],
    ['Reflex', signed(stats.ref)],
    ['Will', signed(stats.will)],
    ['Armor Class', stats.ac],
    ['Touch AC', stats.touch],
    ['Flat-footed AC', stats.flatFooted],
  ];
  $('results').innerHTML = results.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

async function start() {
  try {
    [races, classes] = await Promise.all([
      fetch('data/races.json').then(r => r.json()),
      fetch('data/classes.json').then(r => r.json()),
    ]);
  } catch (err) {
    $('loading').textContent = 'Could not load the rules data. If you opened this file directly, ' +
      'start the local server (python -m http.server 8000) and open http://localhost:8000/ instead.';
    return;
  }
  // Prestige classes need levels in other classes first, and multiclassing isn't supported yet.
  classes = classes.filter(c => c.category !== 'prestige');
  load();
  buildControls();
  $('loading').hidden = true;
  $('app').hidden = false;
  render();
}

start();
