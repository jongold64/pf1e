// Page code: loads the data, builds the controls, and shows the results from rules.js.
import {
  ABILITIES, ABILITY_NAMES, BUDGETS, MIN_SCORE, MAX_SCORE, POINT_COSTS, INCREASE_LEVELS,
  EXTRA_SLOTS,
  pointsSpent, racialAdjustments, characterStats, formatBab, spellsPerDay,
} from './rules.js';
import {
  BONUS_FEAT_RULES, featSlots, slotAccepts, grantedFeats, proficiencyFeats, featContext, checkFeat,
  repeatable, featEffects,
} from './feats.js';
import {
  SKILLS, splitSkill, skillInfo, classSkillTest, skillRanksAvailable, racialSkillBonuses, skillTotal,
} from './skills.js';

const STORAGE_KEY = 'pf1e-builder-character';
const RACE_GROUPS = [['core', 'Core'], ['featured', 'Featured'], ['uncommon', 'Uncommon'], ['other', 'Other']];
const CLASS_GROUPS = [['core', 'Core'], ['base', 'Base'], ['hybrid', 'Hybrid'], ['alternate', 'Alternate']];

const $ = id => document.getElementById(id);

let races = [];
let classes = [];
let feats = [];
let featsById = new Map();

// Set by render() and used by the feat picker, so both check prerequisites the same way.
let current = { slots: [], ctx: null };
let pickerSlotId = null;

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
  extraSlots: {},  // class id -> true/false for optional extra spell slots (see EXTRA_SLOTS)
  feats: {},       // feat slot id (see featSlots) -> feat id
  skills: {},      // skill name -> ranks, e.g. { Acrobatics: 2, 'Craft (alchemy)': 1 }
  specialties: [], // Craft/Perform/Profession specialties the player added, e.g. ['Craft (alchemy)']
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
  if (typeof state.extraSlots !== 'object' || state.extraSlots === null) state.extraSlots = {};
  if (typeof state.feats !== 'object' || state.feats === null) state.feats = {};
  for (const [slotId, featId] of Object.entries(state.feats)) {
    if (!featsById.has(featId)) delete state.feats[slotId];
  }
  if (!Array.isArray(state.specialties)) state.specialties = [];
  state.specialties = state.specialties.filter(n => skillInfo(n)?.family && splitSkill(n).specialty);
  if (typeof state.skills !== 'object' || state.skills === null) state.skills = {};
  for (const [name, ranks] of Object.entries(state.skills)) {
    const known = SKILLS.some(s => s.name === name && !s.family) || state.specialties.includes(name);
    if (!known || !Number.isInteger(ranks) || ranks < 0) delete state.skills[name];
  }
}

// Skill rows in table order: each Craft/Perform/Profession row is followed by its specialties.
function skillRowNames() {
  return SKILLS.flatMap(s => (s.family
    ? [s.name, ...state.specialties.filter(n => splitSkill(n).base === s.name).sort()]
    : [s.name]));
}

// Whether the optional extra spell slot is on for a class, falling back to its default.
function extraSlotOn(clsId) {
  const slot = EXTRA_SLOTS[clsId];
  if (!slot?.optional) return false;
  return typeof state.extraSlots[clsId] === 'boolean' ? state.extraSlots[clsId] : slot.default;
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
  $('extra-slot').addEventListener('change', e =>
    update({ extraSlots: { ...state.extraSlots, [state.cls]: e.target.checked } }));
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

  // Skills
  $('skill-rows').addEventListener('click', e => {
    const step = e.target.closest('[data-skill-step]');
    if (step) {
      const name = step.dataset.skill;
      const next = (state.skills[name] || 0) + Number(step.dataset.skillStep);
      if (next < 0 || next > state.level) return;
      const { [name]: _, ...rest } = state.skills;
      update({ skills: next ? { ...rest, [name]: next } : rest });
    }
    const add = e.target.closest('[data-add-specialty]');
    if (add) {
      const base = add.dataset.addSpecialty;
      const input = $('skill-rows').querySelector(`input[data-specialty-for="${base}"]`);
      const specialty = input.value.trim().replace(/[()]/g, '').toLowerCase();
      const name = `${base} (${specialty})`;
      if (specialty && !state.specialties.includes(name)) update({ specialties: [...state.specialties, name] });
    }
    const remove = e.target.closest('[data-remove-specialty]');
    if (remove) {
      const name = remove.dataset.removeSpecialty;
      const { [name]: _, ...rest } = state.skills;
      update({ specialties: state.specialties.filter(n => n !== name), skills: rest });
    }
  });
  // Enter in a specialty box works like its Add button.
  $('skill-rows').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.specialtyFor) {
      $('skill-rows').querySelector(`[data-add-specialty="${e.target.dataset.specialtyFor}"]`).click();
    }
  });

  // Feats
  const types = [...new Set(feats.flatMap(f => f.types || []))].sort();
  $('feat-type').innerHTML = '<option value="">All types</option>' +
    types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('feat-slots').addEventListener('click', e => {
    const choose = e.target.closest('[data-choose]');
    if (choose) openPicker(choose.dataset.choose);
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      const { [remove.dataset.remove]: _, ...rest } = state.feats;
      update({ feats: rest });
    }
  });
  $('feat-list').addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    update({ feats: { ...state.feats, [pickerSlotId]: pick.dataset.pick } });
    $('feat-picker').close();
  });
  // Feat details are filled in only when opened, so the long list stays quick.
  $('feat-list').addEventListener('toggle', e => {
    const item = e.target.closest('details[data-feat]');
    if (!item?.open) return;
    const f = featsById.get(item.dataset.feat);
    const slot = current.slots.find(s => s.id === pickerSlotId);
    item.querySelector('.feat-body').innerHTML = featDetails(f, checkFeat(f, current.ctx, slot)) +
      `<button type="button" class="primary" data-pick="${esc(f.id)}">Choose ${esc(f.name)}</button>`;
  }, true);
  $('feat-search').addEventListener('input', renderPicker);
  $('feat-type').addEventListener('change', renderPicker);
  $('feat-qualify').addEventListener('change', renderPicker);
  $('picker-close').addEventListener('click', () => $('feat-picker').close());
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
    .map(r => `<li><b>${r.level}</b> ${(r.special || []).map(esc).join(', ') || '—'}</li>`).join('');
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

  // Feats the character has: chosen ones (only slots reached at this level), free ones from the
  // class, and armor/shield proficiencies. Feats don't change ability scores or BAB, so the
  // prerequisite context can use the same stats that include feat bonuses.
  const slots = featSlots({ race, cls, level: state.level });
  const chosen = slots.map(s => featsById.get(state.feats[s.id])).filter(Boolean);
  const granted = grantedFeats(cls, state.level, feats.map(f => f.name));
  const stats = characterStats({
    race, cls, level: state.level, baseScores: state.base, flexibleChoice: state.flexible,
    increases: state.increases,
    armor: state.armor, shield: state.shield, favoredHp: state.favored === 'hp',
    featBonuses: featEffects(chosen.map(f => f.name), state.level),
  });
  const skillRanks = Object.fromEntries(skillRowNames().filter(n => state.skills[n]).map(n => [n, state.skills[n]]));
  const ctx = featContext({
    race, cls, level: state.level, scores: stats.scores, bab: stats.bab[0],
    haveFeats: [...chosen.map(f => f.name), ...granted, ...proficiencyFeats(cls)],
    skillRanks,
  });
  current = { slots, ctx };
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

  renderSkills(race, cls, stats.scores, chosen.map(f => f.name));
  renderFeats(slots, granted, ctx);
  renderSpells(cls, stats.scores);
}

function renderSkills(race, cls, scores, featNames) {
  const isClassSkill = classSkillTest(cls);
  const racial = racialSkillBonuses(race);
  const available = skillRanksAvailable({
    race, cls, level: state.level, baseScores: state.base, flexibleChoice: state.flexible,
    increases: state.increases, favoredSkill: state.favored === 'skill',
  });
  const names = skillRowNames();
  const used = names.reduce((sum, n) => sum + (state.skills[n] || 0), 0);
  $('skill-count').textContent = `${used} of ${available} ranks used`;
  $('skill-count').classList.toggle('over', used > available);

  $('skills-hint').textContent =
    `At most ${state.level} rank${state.level === 1 ? '' : 's'} in each skill. Class skills get +3 once they have a rank.`;

  const abbr = a => a.charAt(0).toUpperCase() + a.slice(1);
  $('skill-rows').innerHTML = names.map(name => {
    const info = skillInfo(name);
    // Only Craft/Perform/Profession have player-added specialties; "Knowledge (arcana)" is a skill of its own.
    const specialty = info.family ? splitSkill(name).specialty : null;
    const classSkill = isClassSkill(name);
    const tags = [classSkill ? '<span class="tag">class</span>' : '', info.trained ? '<span class="tag muted">trained only</span>' : ''].join('');

    // A family row (plain "Craft") holds the box for adding specialties; ranks go on the specialties.
    if (info.family && !specialty) {
      const untrained = skillTotal({ name, ranks: 0, scores, isClassSkill: false });
      return `<tr class="family">
        <td><div class="skill-name">${esc(name)} ${tags}</div>
          <div class="add-specialty">
            <input type="text" data-specialty-for="${esc(name)}" placeholder="Add a specialty, e.g. ${name === 'Craft' ? 'alchemy' : name === 'Perform' ? 'sing' : 'sailor'}" aria-label="${esc(name)} specialty">
            <button type="button" data-add-specialty="${esc(name)}">Add</button>
          </div></td>
        <td></td>
        <td class="total">${untrained.usable ? signed(untrained.total) : '—'}</td>
      </tr>`;
    }

    const ranks = state.skills[name] || 0;
    const t = skillTotal({ name, ranks, scores, isClassSkill: classSkill, racialBonuses: racial, featNames });
    const parts = [`${abbr(info.ability)} ${signed(t.abilityMod)}`];
    if (t.classBonus) parts.push(`class +${t.classBonus}`);
    if (t.racial) parts.push(`race ${signed(t.racial)}`);
    if (t.feat) parts.push(`feats +${t.feat}`);
    return `<tr${specialty ? ' class="specialty"' : ''}>
      <td><div class="skill-name">${esc(name)} ${tags}
          ${specialty ? `<button type="button" class="link" data-remove-specialty="${esc(name)}" aria-label="Remove ${esc(name)}">remove</button>` : ''}</div>
        <div class="breakdown">${parts.join(' · ')}</div>
        ${ranks > state.level ? `<div class="warning">More than ${state.level} ranks</div>` : ''}</td>
      <td><span class="base">
        <button type="button" data-skill="${esc(name)}" data-skill-step="-1" aria-label="Fewer ranks in ${esc(name)}">−</button>
        <span class="value">${ranks}</span>
        <button type="button" data-skill="${esc(name)}" data-skill-step="1" aria-label="More ranks in ${esc(name)}">+</button>
      </span></td>
      <td class="total">${t.usable ? signed(t.total) : '<span class="muted" title="Needs at least 1 rank">—</span>'}</td>
    </tr>`;
  }).join('');
}

const STATUS_ICON = {
  met: '<span class="status met" title="Prerequisites met">✓</span>',
  unmet: '<span class="status unmet" title="Prerequisites not met">✗</span>',
  unknown: '<span class="status unknown" title="Some prerequisites can\'t be checked">?</span>',
};

function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');
}

// Prerequisites (each marked ✓/✗/?) and rules text for one feat.
function featDetails(f, check) {
  const prereqs = check.waived
    ? '<p class="hint">Prerequisites are waived for this bonus feat.</p>'
    : check.parts.length
      ? `<ul class="prereqs">${check.parts.map(x => `<li>${STATUS_ICON[x.status]} ${esc(x.why)}</li>`).join('')}</ul>`
      : '<p class="hint">No prerequisites.</p>';
  const section = (label, text) => (text ? `<h4>${label}</h4>${paragraphs(text)}` : '');
  return `<p class="hint">${esc((f.types || []).join(', ') || 'General')} · ${esc(f.source)}</p>
    <h4>Prerequisites</h4>${prereqs}
    ${section('Benefit', f.benefit || f.description)}
    ${section('Goal', f.goal)}
    ${section('Completion benefit', f.completion_benefit)}
    ${section('Normal', f.normal)}
    ${section('Special', f.special)}`;
}

function renderFeats(slots, granted, ctx) {
  const filled = slots.filter(s => featsById.has(state.feats[s.id])).length;
  $('feat-count').textContent = `${filled} of ${slots.length} chosen`;
  $('granted-feats').textContent = granted.length ? `Free from your class: ${granted.join(', ')}.` : '';

  $('feat-slots').innerHTML = slots.map(slot => {
    const f = featsById.get(state.feats[slot.id]);
    const rule = slot.kind === 'class' ? BONUS_FEAT_RULES[slot.ruleId].note : '';
    let body;
    if (f) {
      const check = checkFeat(f, ctx, slot);
      const wrongSlot = !slotAccepts(slot, f);
      body = `
        <details class="chosen">
          <summary>${STATUS_ICON[check.status]} ${esc(f.name)}</summary>
          ${featDetails(f, check)}
        </details>
        ${wrongSlot ? '<p class="warning">This feat isn\'t allowed in this slot.</p>' : ''}
        ${check.status === 'unmet' ? '<p class="warning">You don\'t meet all the prerequisites.</p>' : ''}
        <div class="slot-buttons">
          <button type="button" data-choose="${slot.id}">Change</button>
          <button type="button" data-remove="${slot.id}">Remove</button>
        </div>`;
    } else {
      body = `<button type="button" class="primary" data-choose="${slot.id}">Choose a feat</button>`;
    }
    return `<li class="slot">
      <div class="slot-label">${esc(slot.label)}</div>
      ${rule ? `<p class="hint">${esc(rule)}</p>` : ''}
      ${body}
    </li>`;
  }).join('');
}

const PICKER_LIMIT = 150;

function openPicker(slotId) {
  pickerSlotId = slotId;
  const slot = current.slots.find(s => s.id === slotId);
  $('picker-title').textContent = slot.label;
  $('picker-rule').textContent = slot.kind === 'class' ? BONUS_FEAT_RULES[slot.ruleId].note : '';
  $('feat-search').value = '';
  renderPicker();
  $('feat-picker').showModal();
}

function renderPicker() {
  const slot = current.slots.find(s => s.id === pickerSlotId);
  if (!slot) return;
  const search = $('feat-search').value.trim().toLowerCase();
  const type = $('feat-type').value;
  const hideUnmet = $('feat-qualify').checked;
  // Feats already chosen in another slot, unless the feat can be taken more than once.
  const taken = new Set(current.slots.filter(s => s.id !== slot.id).map(s => state.feats[s.id]));

  const matches = [];
  for (const f of feats) {
    if (!slotAccepts(slot, f)) continue;
    if (taken.has(f.id) && !repeatable(f)) continue;
    if (type && !(f.types || []).includes(type)) continue;
    if (search && !f.name.toLowerCase().includes(search)) continue;
    const check = checkFeat(f, current.ctx, slot);
    if (hideUnmet && check.status === 'unmet') continue;
    matches.push({ f, check });
  }

  $('picker-count').textContent = matches.length > PICKER_LIMIT
    ? `Showing ${PICKER_LIMIT} of ${matches.length} feats. Search to narrow the list.`
    : `${matches.length} feat${matches.length === 1 ? '' : 's'}`;
  $('feat-list').innerHTML = matches.slice(0, PICKER_LIMIT).map(({ f, check }) => `
    <details class="feat-item" data-feat="${esc(f.id)}">
      <summary>${STATUS_ICON[check.status]} <span class="feat-name">${esc(f.name)}</span>
        <small>${esc((f.types || []).join(', '))}</small></summary>
      <div class="feat-body"></div>
    </details>`).join('') || '<p class="hint">No feats match.</p>';
}

const ORDINALS = ['0', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function renderSpells(cls, scores) {
  const spells = spellsPerDay({ cls, level: state.level, scores, extraSlot: extraSlotOn(cls.id) });
  $('spells-card').hidden = !spells;
  if (!spells) return;

  const abilityName = ABILITY_NAMES[spells.ability];
  $('spells-summary').textContent = `Casts with ${abilityName} (${spells.score}).`;

  const slot = EXTRA_SLOTS[cls.id];
  $('extra-slot-row').hidden = !slot?.optional;
  if (slot?.optional) {
    $('extra-slot-label').textContent = slot.label;
    $('extra-slot').checked = extraSlotOn(cls.id);
  }

  $('spells-table').hidden = spells.rows.length === 0;
  if (spells.rows.length === 0) {
    $('spells-note').textContent = `${cls.name}s start casting spells at level ${spells.firstLevel}.`;
    return;
  }

  const showKnown = spells.rows.some(r => r.known !== null);
  const extraName = spells.extraSlotName;
  $('spells-head').innerHTML = `<tr><th>Spell level</th><th>Class</th><th>${esc(abilityName.slice(0, 3))}</th>` +
    (extraName ? `<th>${esc(extraName)}</th>` : '') + '<th>Per day</th>' + (showKnown ? '<th>Known</th>' : '') + '</tr>';

  const dash = v => (v === null ? '—' : v);
  $('spells-body').innerHTML = spells.rows.map(r => {
    // Level 0 spells (cantrips/orisons) are cast at will.
    let total = r.spellLevel === 0 ? (r.base === null ? 'At will' : `${r.base} prepared`) : dash(r.total);
    if (!r.canCast) total = `<span class="warning">Needs ${abilityName.slice(0, 3)} ${10 + r.spellLevel}</span>`;
    return `<tr${r.canCast ? '' : ' class="cannot"'}>
      <td>${ORDINALS[r.spellLevel]}</td>
      <td>${dash(r.base)}</td>
      <td>${r.bonus ? `+${r.bonus}` : ''}</td>
      ${extraName ? `<td>${r.extra ? `+${r.extra}` : ''}</td>` : ''}
      <td class="total">${total}</td>
      ${showKnown ? `<td>${dash(r.known)}</td>` : ''}
    </tr>`;
  }).join('');

  const notes = [];
  if (spells.rows[0].spellLevel === 0) notes.push('Level 0 spells (cantrips and orisons) can be cast any number of times.');
  if (cls.id === 'arcanist') notes.push(`Arcanists also have a "spells prepared" table, which isn't in the data yet.`);
  $('spells-note').textContent = notes.join(' ');
}

async function start() {
  try {
    [races, classes, feats] = await Promise.all([
      fetch('data/races.json').then(r => r.json()),
      fetch('data/classes.json').then(r => r.json()),
      fetch('data/feats.json').then(r => r.json()),
    ]);
  } catch (err) {
    $('loading').textContent = 'Could not load the rules data. If you opened this file directly, ' +
      'start the local server (python -m http.server 8000) and open http://localhost:8000/ instead.';
    return;
  }
  // Prestige classes need levels in other classes first, and multiclassing isn't supported yet.
  // NPC classes (adept, aristocrat, commoner, expert, warrior) aren't offered.
  classes = classes.filter(c => c.category !== 'prestige' && c.category !== 'npc');
  // Mythic feats need mythic tiers, which the builder doesn't support.
  feats = feats.filter(f => !(f.types || []).includes('Mythic'));
  featsById = new Map(feats.map(f => [f.id, f]));
  load();
  buildControls();
  $('loading').hidden = true;
  $('app').hidden = false;
  render();
}

start();
