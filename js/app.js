// Page code: loads the data, builds the controls, switches tabs, and shows the results from the rules modules.
import {
  ABILITIES, ABILITY_NAMES, BUDGETS, MIN_SCORE, MAX_SCORE, POINT_COSTS, INCREASE_LEVELS,
  EXTRA_SLOTS,
  pointsSpent, racialAdjustments, characterStats, formatBab, spellsPerDay, classCounts, initiative,
} from './rules.js';
import {
  BONUS_FEAT_RULES, featSlots, slotAccepts, grantedFeatsFor, proficiencyFeatsFor, featContext, checkFeat,
  repeatable, featEffects, slotCharacterLevel, CHOICE_FEATS, SPELL_SCHOOLS,
} from './feats.js';
import { castingClasses } from './multiclass.js';
import { checkRequirements, castingByTradition } from './prestige.js';
import { proficiencyTest } from './weapons.js';
import {
  SKILLS, splitSkill, skillInfo, classSkillTest, skillRanksAvailable, racialSkillBonuses, skillTotal,
} from './skills.js';
import { armorEffects, speedInArmor } from './armor.js';
import { $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { initArmorTab, renderArmorTab, armorDetails } from './tab-armor.js';
import { initSpellList, renderSpellList, showSpell } from './tab-spells.js';
import { initItemsTab, renderItemsTab, renderMyItems, showItem } from './tab-items.js';
import { initEquipmentTab, renderEquipmentTab, renderEquipment, showGear } from './tab-equipment.js';
import { initWeaponsTab, renderWeaponsTab, renderMyWeapons, showWeapon } from './tab-weapons.js';
import { initSearch } from './search-ui.js';
import { raceTerms, termButtons, initTermPopover } from './race-terms.js';
import { openRoster, saveRoster, loadCharacter, saveCharacter, removeCharacter, newId, exportData, importData } from './storage.js';
import { buildSheet } from './sheet.js';
import { initRolls, rollButton } from './roll-ui.js';
import { weaponSummaries } from './tab-weapons.js';

const RACE_GROUPS = [['core', 'Core'], ['featured', 'Featured'], ['uncommon', 'Uncommon'], ['other', 'Other']];
const CLASS_GROUPS = [['core', 'Core'], ['base', 'Base'], ['hybrid', 'Hybrid'], ['occult', 'Occult'], ['unchained', 'Unchained'],
                      ['alternate', 'Alternate'], ['prestige', 'Prestige']];
const TABS = ['character', 'feats', 'skills', 'spells', 'magic-items', 'armor', 'weapons', 'equipment'];

// Everything loaded from data/. Spells and magic items are big, so they load the first time they're needed.
const data = {
  races: [], classes: [], feats: [], featsById: new Map(), armor: [], armorById: new Map(),
  spells: null, items: null, itemsById: null, gear: null, gearById: null, weapons: null, weaponsById: null,
};
const pending = {};
function loadOnce(name, file, prepare = x => x) {
  pending[name] ??= fetch(file).then(r => r.json()).then(prepare).then(x => { data[name] = x; return x; });
  return pending[name];
}
// Mythic spells are already left out of the data file.
const loadSpells = () => loadOnce('spells', 'data/spells.json');
const loadItems = () => loadOnce('items', 'data/magic-items.json', items => {
  data.itemsById = new Map(items.map(i => [i.id, i]));
  return items;
});
const loadWeapons = () => loadOnce('weapons', 'data/weapons.json', weapons => {
  data.weaponsById = new Map(weapons.map(w => [w.id, w]));
  return weapons;
});
const loadGear = () => loadOnce('gear', 'data/equipment.json', gear => {
  data.gearById = new Map(gear.map(i => [i.id, i]));
  return gear;
});

// Set by render() and used by the feat picker and tabs, so everything checks rules the same way.
let view = null;
let pickerSlotId = null;
let tab = 'character';
let raceItems = [];

const state = {
  name: '',                  // the player's name for the character; '' shows "Human Fighter 1" instead
  race: 'human',
  classLevels: ['fighter'],  // class id at each character level, 1st level first
  favoredClass: '',          // favored class id; '' means the first class
  casterChoices: {},         // prestige spellcasting advance slot -> class id it raises (see multiclass.js)
  // Kept in step with classLevels by syncDerived(), for code that wants the total level or first class.
  cls: 'fighter',
  level: 1,
  budget: 15,
  base: Object.fromEntries(ABILITIES.map(a => [a, 10])),
  flexible: 'str',
  increases: INCREASE_LEVELS.map(() => ''),  // ability picked at each of levels 4, 8, 12, 16, 20
  favored: 'hp',
  extraSlots: {},  // class id -> true/false for optional extra spell slots (see EXTRA_SLOTS)
  feats: {},       // feat slot id (see featSlots) -> feat id
  featChoices: {}, // feat slot id -> { feat: feat id, value } for CHOICE_FEATS (weapon id, skill name or school)
  skills: {},      // skill name -> ranks, e.g. { Acrobatics: 2, 'Craft (alchemy)': 1 }
  specialties: [], // Craft/Perform/Profession specialties the player added, e.g. ['Craft (alchemy)']
  armorId: '',     // worn armor (data/armor.json id), '' for none
  armorEnh: 0,     // its magic enhancement bonus, 0-5
  shieldId: '',
  shieldEnh: 0,
  gold: null,      // gold the character has; null means the class's average starting gold
  inventory: [],   // [{ id, variant, qty }] from data/equipment.json; variant is e.g. 'Masterwork'
  spells: [],      // ids of the character's chosen spells (known spells or spellbook) from data/spells.json
  magicItems: [],  // [{ id, option, qty }] from data/magic-items.json; option is e.g. '+2'
  weapons: [],     // [{ id, enh, masterwork, focus, greaterFocus, spec, greaterSpec, proficient }] from data/weapons.json
  // Combat options on the Weapons tab: Power Attack / Deadly Aim / Rapid Shot switched on, and the weapons used
  // for two-weapon fighting as indexes into `weapons` ("2", or "2:1" for the other end of double weapon 2).
  combat: { main: '', off: '' },
};

// A fresh character, for "New" and for resetting before a saved one is loaded.
const DEFAULTS = structuredClone(state);
// The saved characters (see storage.js) and which one is open.
let roster = null;
let currentId = null;

// Shared with the tab modules.
const app = {
  state, data, update, loadSpells, loadItems, loadGear, loadWeapons, showTab, openDetail, openResult,
  get view() { return view; },
};

// Puts a saved character (or null for a new one) into `state`, repairing anything an older version saved
// differently or that the data no longer has.
function load(saved) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, structuredClone(DEFAULTS));
  if (saved && typeof saved === 'object') Object.assign(state, structuredClone(saved), { base: { ...state.base, ...saved.base } });
  state.name = typeof state.name === 'string' ? state.name.slice(0, 60) : '';
  if (!data.races.some(r => r.id === state.race)) state.race = DEFAULTS.race;
  if (!BUDGETS.some(b => b.points === state.budget)) state.budget = DEFAULTS.budget;
  if (!ABILITIES.includes(state.flexible)) state.flexible = DEFAULTS.flexible;
  if (state.favored !== 'skill') state.favored = 'hp';
  // Saves from before multiclassing have one class and a level instead of a class for each level.
  if (saved && !Array.isArray(saved.classLevels)) state.classLevels = [];
  for (const a of ABILITIES) {
    if (!(state.base[a] in POINT_COSTS)) state.base[a] = 10;
  }
  if (!(Number.isInteger(state.level) && state.level >= 1 && state.level <= 20)) state.level = 1;
  state.increases = INCREASE_LEVELS.map((_, i) =>
    ABILITIES.includes(state.increases?.[i]) ? state.increases[i] : '');
  if (typeof state.extraSlots !== 'object' || state.extraSlots === null) state.extraSlots = {};
  if (typeof state.feats !== 'object' || state.feats === null) state.feats = {};
  for (const [slotId, featId] of Object.entries(state.feats)) {
    if (!data.featsById.has(featId)) delete state.feats[slotId];
  }
  if (!Array.isArray(state.specialties)) state.specialties = [];
  state.specialties = state.specialties.filter(n => skillInfo(n)?.family && splitSkill(n).specialty);
  if (typeof state.skills !== 'object' || state.skills === null) state.skills = {};
  for (const [name, ranks] of Object.entries(state.skills)) {
    const known = SKILLS.some(s => s.name === name && !s.family) || state.specialties.includes(name);
    if (!known || !Number.isInteger(ranks) || ranks < 0) delete state.skills[name];
  }
  // Older versions saved typed-in armor and shield bonuses as numbers.
  delete state.armor;
  delete state.shield;
  const worn = (id, category) => data.armorById.get(id) && (data.armorById.get(id).category === 'shield') === (category === 'shield');
  if (!worn(state.armorId, 'armor')) state.armorId = '';
  if (!worn(state.shieldId, 'shield')) state.shieldId = '';
  for (const k of ['armorEnh', 'shieldEnh']) {
    if (!(Number.isInteger(state[k]) && state[k] >= 0 && state[k] <= 5)) state[k] = 0;
  }
  // Classes: older saves have one class and a level. The first level can't be a prestige class.
  const byId = new Map(data.classes.map(c => [c.id, c]));
  const firstBase = id => (byId.has(id) && byId.get(id).category !== 'prestige' ? id : data.classes[0].id);
  let levels = Array.isArray(state.classLevels) ? state.classLevels.filter(id => byId.has(id)).slice(0, 20) : [];
  if (!levels.length) levels = Array.from({ length: state.level }, () => firstBase(state.cls));
  levels[0] = firstBase(levels[0]);
  state.classLevels = levels;
  // Bonus feats saved under the old single-class slot ids ("class-L4") belong to the first class.
  for (const [slotId, featId] of Object.entries(state.feats)) {
    const m = slotId.match(/^class-L(\d+)$/);
    if (m) {
      delete state.feats[slotId];
      state.feats[`class-${levels[0]}-L${m[1]}`] ??= featId;
    }
  }
  if (!levels.includes(state.favoredClass) || byId.get(state.favoredClass)?.category === 'prestige') state.favoredClass = '';
  if (typeof state.casterChoices !== 'object' || state.casterChoices === null) state.casterChoices = {};
  syncDerived();
  if (!(typeof state.gold === 'number' && state.gold >= 0)) state.gold = null;
  // Items the equipment data no longer has are skipped when shown. The separate masterwork entries that were
  // removed from the data become the base item's Masterwork version.
  const MERGED = { 'backpack-masterwork': 'backpack', 'artisans-tools-masterwork': 'artisans-tools',
                   'thieves-tools-masterwork': 'thieves-tools' };
  state.inventory = (Array.isArray(state.inventory) ? state.inventory : [])
    .filter(e => e && typeof e.id === 'string' && Number.isInteger(e.qty) && e.qty > 0)
    .map(e => (MERGED[e.id] ? { id: MERGED[e.id], variant: 'Masterwork', qty: e.qty }
      : { id: e.id, ...(typeof e.variant === 'string' ? { variant: e.variant } : {}), qty: e.qty }));
  state.spells = [...new Set((Array.isArray(state.spells) ? state.spells : []).filter(id => typeof id === 'string'))];
  state.magicItems = (Array.isArray(state.magicItems) ? state.magicItems : [])
    .filter(e => e && typeof e.id === 'string' && Number.isInteger(e.qty) && e.qty > 0)
    .map(e => ({ id: e.id, ...(typeof e.option === 'string' ? { option: e.option } : {}), qty: e.qty }));
  const FLAGS = ['masterwork', 'focus', 'greaterFocus', 'spec', 'greaterSpec', 'impCrit', 'proficient'];
  state.weapons = (Array.isArray(state.weapons) ? state.weapons : [])
    .filter(e => e && typeof e.id === 'string')
    .map(e => ({ id: e.id, enh: Number.isInteger(e.enh) && e.enh >= 0 && e.enh <= 5 ? e.enh : 0,
                 ...Object.fromEntries(FLAGS.filter(f => e[f] === true).map(f => [f, true])) }));
  state.featChoices = Object.fromEntries(Object.entries(state.featChoices && typeof state.featChoices === 'object' ? state.featChoices : {})
    .filter(([, v]) => v && typeof v.feat === 'string' && typeof v.value === 'string'));
  const c = state.combat && typeof state.combat === 'object' ? state.combat : {};
  const hand = v => (typeof v === 'string' && /^\d+(:1)?$/.test(v) ? v : '');
  state.combat = { ...Object.fromEntries(['powerAttack', 'deadlyAim', 'rapidShot'].filter(k => c[k] === true).map(k => [k, true])),
                   main: hand(c.main), off: hand(c.off) };
}

function syncDerived() {
  state.level = state.classLevels.length;
  state.cls = state.classLevels[0];
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
  saveCharacter(roster, currentId, state, characterLabel(state));
}

// "Valeros", or "Human Fighter 1" / "Elf Wizard 3 / Fighter 2" for a character without a name.
function characterLabel(s) {
  if (s.name?.trim()) return s.name.trim();
  const race = data.races.find(r => r.id === s.race);
  const byId = new Map(data.classes.map(c => [c.id, c]));
  const counts = classCounts(s.classLevels.map(id => byId.get(id)).filter(Boolean));
  return `${race?.name || ''} ${counts.map(e => `${e.cls.name} ${e.level}`).join(' / ')}`.trim();
}

// The character bar: pick a saved character, name it, add, copy, delete, export, import and print.
function renderCharacterBar() {
  $('char-select').innerHTML = roster.characters.map(c =>
    `<option value="${esc(c.id)}">${esc(c.id === currentId ? characterLabel(state) : c.label || 'Unnamed character')}</option>`).join('');
  $('char-select').value = currentId;
  if (document.activeElement !== $('char-name')) $('char-name').value = state.name;
  $('char-name').placeholder = characterLabel({ ...state, name: '' });
}

function switchCharacter(id, character = undefined) {
  currentId = id;
  roster.current = id;
  saveRoster(roster);
  load(character === undefined ? loadCharacter(id) : character);
  save();
  pickerSlotId = null;
  render();
}

function addCharacter(character) {
  const id = newId();
  roster.characters.push({ id, label: '' });
  switchCharacter(id, character);
}

function initCharacterBar() {
  $('char-select').addEventListener('change', e => { save(); switchCharacter(e.target.value); });
  $('char-name').addEventListener('input', e => update({ name: e.target.value.slice(0, 60) }));
  $('char-new').addEventListener('click', () => { save(); addCharacter(null); });
  $('char-copy').addEventListener('click', () => {
    save();
    addCharacter({ ...structuredClone(state), name: `${characterLabel(state)} (copy)` });
  });
  $('char-delete').addEventListener('click', () => {
    if (!confirm(`Delete ${characterLabel(state)}? This can't be undone.`)) return;
    removeCharacter(roster, currentId);
    if (roster.characters.length) switchCharacter(roster.characters[0].id);
    else addCharacter(null);
  });
  $('char-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportData(state), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${characterLabel(state).replace(/[^\w\- ]+/g, '').trim() || 'character'}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('char-import').addEventListener('click', () => $('char-file').click());
  $('char-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let character = null;
    try { character = importData(JSON.parse(await file.text())); } catch { character = null; }
    if (!character) {
      alert('That file isn\'t a character exported from this app.');
      return;
    }
    save();
    addCharacter(character);
  });
  $('char-print').addEventListener('click', printSheet);
  // Printing from the browser menu (Ctrl+P) gets the sheet too, with whatever data is loaded.
  window.addEventListener('beforeprint', fillSheet);
}

// The printed sheet needs the gear, weapons, magic items and spells data, and their tabs drawn.
async function printSheet() {
  $('char-print').disabled = true;
  try {
    await Promise.all([loadGear(), state.weapons.length ? loadWeapons() : null, state.magicItems.length ? loadItems() : null,
                       state.spells.length ? loadSpells() : null, state.featChoices && Object.keys(state.featChoices).length ? loadWeapons() : null]);
    render();
    await renderEquipment(app, view);
    fillSheet();
    window.print();
  } finally {
    $('char-print').disabled = false;
  }
}

function fillSheet() {
  const skills = [...$('skill-rows').querySelectorAll('tr[data-row-skill]')].map(tr => ({
    name: tr.dataset.rowSkill,
    ranks: Number(tr.querySelector('.value')?.textContent) || 0,
    // Just the number, not the Roll button's text.
    total: tr.querySelector('.total')?.firstChild?.textContent.trim() || '',
  }));
  const moneyRows = [...$('money-summary').querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent || '']);
  $('print-sheet').innerHTML = buildSheet({
    app, view, name: characterLabel(state), weapons: weaponSummaries(app, view), skills, moneyRows, extraSlotOn,
    featLabel: slot => {
      const f = data.featsById.get(state.feats[slot.id]);
      if (!f) return null;
      const c = view.featChoices.find(x => x.slotId === slot.id);
      return c?.value ? `${f.name} (${choiceLabel(c)})` : f.name;
    },
  });
}

function groupedOptions(items, groups) {
  return groups.map(([cat, label]) => {
    const opts = items.filter(x => x.category === cat)
      .map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    return opts ? `<optgroup label="${label}">${opts}</optgroup>` : '';
  }).join('');
}

// Tabs. The open tab is in the address (#feats), so reloading or the back button keeps it.
function showTab(name) {
  if (!TABS.includes(name)) name = 'character';
  tab = name;
  for (const t of TABS) $(`tab-${t}`).hidden = t !== name;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  if (name === 'spells') renderSpellList(app, view);
  if (name === 'magic-items') renderItemsTab(app);
  if (name === 'equipment') renderEquipmentTab(app);
  if (name === 'weapons') renderWeaponsTab(app);
}

function buildControls() {
  $('race').innerHTML = groupedOptions(data.races, RACE_GROUPS);
  $('budget').innerHTML = BUDGETS.map(b => `<option value="${b.points}">${b.label}</option>`).join('');
  $('flexible').innerHTML = ABILITIES.map(a => `<option value="${a}">${ABILITY_NAMES[a]}</option>`).join('');

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

  // A saved id that no longer exists in the data falls back to the first option.
  $('race').value = state.race;
  if (!$('race').value) $('race').selectedIndex = 0;
  state.race = $('race').value;
  if (state.favored !== 'skill') state.favored = 'hp';

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  $('race').addEventListener('change', e => update({ race: e.target.value }));
  initTermPopover($('race-info'), () => raceItems);
  // Classes: a class for each level
  $('class-levels').addEventListener('change', e => {
    const i = e.target.dataset.levelIndex;
    if (i === undefined) return;
    update({ classLevels: state.classLevels.map((id, j) => (j === Number(i) ? e.target.value : id)) });
  });
  $('add-level').addEventListener('click', () => {
    if (state.classLevels.length < 20) update({ classLevels: [...state.classLevels, state.classLevels.at(-1)] });
  });
  $('remove-level').addEventListener('click', () => {
    if (state.classLevels.length > 1) update({ classLevels: state.classLevels.slice(0, -1) });
  });
  $('favored-class').addEventListener('change', e => update({ favoredClass: e.target.value }));
  $('caster-choices').addEventListener('change', e => {
    const key = e.target.dataset.advance;
    if (key) update({ casterChoices: { ...state.casterChoices, [key]: e.target.value } });
  });
  $('spells-tables').addEventListener('change', e => {
    const id = e.target.dataset.extraSlot;
    if (id) update({ extraSlots: { ...state.extraSlots, [id]: e.target.checked } });
  });
  $('increase-rows').addEventListener('change', e => {
    const i = Number(e.target.dataset.increase);
    update({ increases: state.increases.map((a, j) => (j === i ? e.target.value : a)) });
  });
  $('budget').addEventListener('change', e => update({ budget: Number(e.target.value) }));
  $('flexible').addEventListener('change', e => update({ flexible: e.target.value }));
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
  const types = [...new Set(data.feats.flatMap(f => f.types || []))].sort();
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
  $('feat-slots').addEventListener('change', e => {
    const slotId = e.target.dataset.featChoice;
    if (!slotId) return;
    update({ featChoices: { ...state.featChoices, [slotId]: { feat: state.feats[slotId], value: e.target.value } } });
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
    const f = data.featsById.get(item.dataset.feat);
    const slot = view.slots.find(s => s.id === pickerSlotId);
    item.querySelector('.feat-body').innerHTML = featDetails(f, checkFeat(f, view.contextAt(slot.charLevel, slot.id), slot)) +
      `<button type="button" class="primary" data-pick="${esc(f.id)}">Choose ${esc(f.name)}</button>`;
  }, true);
  $('feat-search').addEventListener('input', renderPicker);
  $('feat-type').addEventListener('change', renderPicker);
  $('feat-qualify').addEventListener('change', renderPicker);
  $('picker-close').addEventListener('click', () => $('feat-picker').close());
  $('detail-close').addEventListener('click', () => $('detail-dialog').close());

  initArmorTab(app);
  initSpellList(app);
  initItemsTab(app);
  initEquipmentTab(app);
  initWeaponsTab(app);
  initSearch(app);
  initTabSearches();
}

// Search boxes on the Feats, Skills and Armor tabs (Spells, Magic Items and Equipment have theirs in
// their own modules). Each looks only through what its tab covers.
let skillFilter = '';
function initTabSearches() {
  const live = (formId, inputId, run) => {
    $(formId).addEventListener('submit', e => { e.preventDefault(); run(); });
    $(inputId).addEventListener('input', run);
  };
  live('feat-tab-search-form', 'feat-tab-search', renderFeatTabSearch);
  $('feat-tab-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-feat-result]');
    if (btn) openFeatForSlots(btn.dataset.featResult);
  });
  live('skill-search-form', 'skill-search', () => {
    skillFilter = $('skill-search').value.trim().toLowerCase();
    render();
  });
  live('armor-search-form', 'armor-search', renderArmorSearch);
  $('armor-search-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-armor-result]');
    if (btn) openResult('armor', btn.dataset.armorResult);
  });
}

// A list of results under a tab's search box: items are [{ id, name, detail, icon }].
function resultList(el, query, items, attr, limit = 60) {
  const short = query.trim().length < 2;
  el.hidden = short;
  if (short) return;
  el.innerHTML = items.slice(0, limit).map(r => `
    <li><button type="button" ${attr}="${esc(r.id)}">${r.icon || ''}<span class="result-name">${esc(r.name)}</span>
      <small>${esc(r.detail || '')}</small></button></li>`).join('') || '<li class="hint">Nothing found by that name.</li>';
}

function renderFeatTabSearch() {
  const q = $('feat-tab-search').value.trim().toLowerCase();
  const hits = data.feats.filter(f => f.name.toLowerCase().includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
  resultList($('feat-tab-results'), q, hits.map(f => ({
    id: f.id, name: f.name, detail: (f.types || []).join(', '), icon: STATUS_ICON[checkFeat(f, view.ctx).status],
  })), 'data-feat-result');
}

// A feat's details with a button for each open slot it can go in.
function openFeatForSlots(id) {
  const f = data.featsById.get(id);
  const alreadyHave = view.slots.some(s => state.feats[s.id] === id) && !repeatable(f);
  const open = view.slots.filter(s => !data.featsById.has(state.feats[s.id]) && slotAccepts(s, f));
  const actions = alreadyHave ? [] : open.map(s => ({
    label: `Choose for ${s.label}`, primary: true,
    run: () => { update({ feats: { ...state.feats, [s.id]: id } }); showTab('feats'); },
  }));
  const note = alreadyHave ? '<p class="hint">You already have this feat.</p>'
    : open.length ? '' : '<p class="hint">No open feat slot can take this feat. Remove or change a feat to make room.</p>';
  openDetail(f.name, featDetails(f, checkFeat(f, view.ctx)) + note, actions);
}

function renderArmorSearch() {
  const q = $('armor-search').value.trim().toLowerCase();
  const hits = data.armor.filter(a => a.name.toLowerCase().includes(q));
  resultList($('armor-search-results'), q, hits.map(a => ({
    id: a.id, name: a.name, detail: `${a.category === 'shield' ? 'shield' : `${a.category} armor`} · ${signed(a.bonus)}`,
  })), 'data-armor-result');
}

function update(changes) {
  Object.assign(state, changes);
  syncDerived();
  save();
  render();
}

// Everything derived from the character, computed once per change and shared by all tabs.
function computeView() {
  const race = data.races.find(r => r.id === state.race);
  const byId = new Map(data.classes.map(c => [c.id, c]));
  const classLevels = state.classLevels.map(id => byId.get(id));
  const counts = classCounts(classLevels);
  const classes = counts.map(e => e.cls);
  const cls = classLevels[0];
  // The favored class must be one the character has (and not a prestige class); otherwise the first class.
  const favoredClassId = classes.some(c => c.id === state.favoredClass && c.category !== 'prestige') ? state.favoredClass : cls.id;
  const casting = castingClasses(counts, state.casterChoices);
  // Feats the character has: chosen ones (only slots reached at this level), free ones from each
  // class, and armor/shield proficiencies. Feats don't change ability scores or BAB, so the
  // prerequisite context can use the same stats that include feat bonuses.
  const slots = featSlots({ race, classLevels });
  const chosen = slots.map(s => data.featsById.get(state.feats[s.id])).filter(Boolean);
  // What each weapon/skill/school feat was taken for (a choice made for a feat since swapped out doesn't count).
  const featChoices = slots.filter(s => CHOICE_FEATS[data.featsById.get(state.feats[s.id])?.name]).map(s => {
    const f = data.featsById.get(state.feats[s.id]);
    const saved = state.featChoices[s.id];
    return { slotId: s.id, feat: f.name, kind: CHOICE_FEATS[f.name], value: saved?.feat === f.id ? saved.value : '' };
  });
  const granted = grantedFeatsFor(counts, data.feats.map(f => f.name));
  const haveFeats = [...chosen.map(f => f.name), ...granted, ...proficiencyFeatsFor(classes)];
  const gear = armorEffects({
    armor: data.armorById.get(state.armorId) || null, armorEnh: state.armorEnh,
    shield: data.armorById.get(state.shieldId) || null, shieldEnh: state.shieldEnh,
  });
  const stats = characterStats({
    race, classLevels, favoredClassId, baseScores: state.base, flexibleChoice: state.flexible,
    increases: state.increases, favoredHp: state.favored === 'hp',
    featBonuses: featEffects(chosen.map(f => f.name), classLevels.length), gear,
  });
  const skillRanks = Object.fromEntries(skillRowNames().filter(n => state.skills[n]).map(n => [n, state.skills[n]]));
  const ctx = featContext({ race, counts, casting: casting.casting, scores: stats.scores, bab: stats.bab[0], haveFeats, skillRanks });

  // The character as it was at an earlier level, for feats taken then and for prestige class requirements:
  // BAB, saves, spellcasting and ability increases from those levels, feats from slots reached by then (and free
  // class feats), and skill ranks capped at that level (the app doesn't record which level each rank was bought at).
  for (const s of slots) s.charLevel = slotCharacterLevel(s, classLevels);
  // `except` leaves out the feat in one slot (the one being chosen), so it can't count toward its own replacement.
  const contexts = new Map();
  const contextAt = (lv, except = null) => {
    const key = `${lv}|${except}`;
    if (!contexts.has(key)) {
      const before = classLevels.slice(0, lv);
      const beforeCounts = classCounts(before);
      const beforeStats = characterStats({ race, classLevels: before, baseScores: state.base, flexibleChoice: state.flexible,
                                           increases: state.increases });
      const feats = [
        ...slots.filter(s => s.charLevel <= lv && s.id !== except).map(s => data.featsById.get(state.feats[s.id])?.name).filter(Boolean),
        ...grantedFeatsFor(beforeCounts, data.feats.map(f => f.name)), ...proficiencyFeatsFor(beforeCounts.map(e => e.cls)),
      ];
      const ranks = Object.fromEntries(Object.entries(skillRanks).map(([n, r]) => [n, Math.min(r, lv)]));
      contexts.set(key, featContext({ race, counts: beforeCounts, casting: castingClasses(beforeCounts, state.casterChoices).casting,
                                     scores: beforeStats.scores, bab: beforeStats.bab[0], haveFeats: feats, skillRanks: ranks }));
    }
    return contexts.get(key);
  };

  // Prestige class requirements, checked against the levels before the first level of each one.
  const requirements = new Map();
  for (const e of counts.filter(x => x.cls.category === 'prestige')) {
    const before = classLevels.slice(0, classLevels.findIndex(c => c.id === e.cls.id));
    requirements.set(e.cls.id, prestigeCheck(e.cls, before, race, before.length ? contextAt(before.length) : null));
  }
  const speed = speedInArmor(race.base_speed, gear, race);
  return {
    race, cls, classLevels, counts, classes, favoredClassId, casting, level: classLevels.length,
    slots, chosen, granted, haveFeats, featChoices, gear, stats, ctx, contextAt, speed, requirements,
  };
}

// A prestige class's requirements for the character as it was before taking it (ctx from view.contextAt).
function prestigeCheck(prestige, before, race, ctx) {
  const counts = classCounts(before);
  if (!counts.length) return { status: 'unmet', parts: [{ status: 'unmet', why: 'Needs a level in another class first' }] };
  const casting = castingClasses(counts, state.casterChoices).casting;
  const scores = ctx.scores;
  const martial = proficiencyTest(counts.map(e => e.cls), race)({ name: 'any martial weapon', proficiency: 'martial' });
  return checkRequirements(prestige, ctx, castingByTradition(casting, scores), martial);
}

const STATUS_WORD = { met: 'met', unmet: 'not met', unknown: 'some can\'t be checked' };

// The Classes card: a class for each level, favored class, where prestige spellcasting goes, and each
// class's features (and requirements, for prestige classes).
function renderClasses(view) {
  const { counts, classLevels } = view;
  $('class-summary').textContent = `${counts.map(e => `${e.cls.name} ${e.level}`).join(' / ')} (level ${classLevels.length})`;
  const baseOptions = groupedOptions(data.classes.filter(c => c.category !== 'prestige'), CLASS_GROUPS);
  const allOptions = groupedOptions(data.classes, CLASS_GROUPS);
  $('class-levels').innerHTML = classLevels.map((c, i) => `<li>
      <label>Level ${i + 1} <select data-level-index="${i}">${i === 0 ? baseOptions : allOptions}</select></label>
      ${c.category === 'prestige' && view.requirements.get(c.id)
        ? STATUS_ICON[view.requirements.get(c.id).status] : ''}
    </li>`).join('');
  $('class-levels').querySelectorAll('select').forEach((sel, i) => { sel.value = classLevels[i].id; });
  $('add-level').disabled = classLevels.length >= 20;
  $('remove-level').disabled = classLevels.length <= 1;

  const favoredChoices = view.classes.filter(c => c.category !== 'prestige');
  $('favored-class').innerHTML = favoredChoices.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('favored-class').value = view.favoredClassId;

  $('caster-choices').innerHTML = view.casting.slots.map(slot => {
    const kind = slot.kind === 'any' ? 'spellcasting' : slot.kind === 'alchemist' ? 'alchemist extracts' : `${slot.kind} spellcasting`;
    if (!slot.target) {
      return `<p class="warning">${esc(slot.prestige.name)} adds a level of ${esc(kind)}, but you have no class it can go to.</p>`;
    }
    if (slot.targets.length < 2) {
      return `<p class="hint">${esc(slot.prestige.name)} adds ${slot.levels} level${slot.levels === 1 ? '' : 's'} of ${esc(kind)} to ${esc(slot.target.name)}.</p>`;
    }
    return `<label class="row">${esc(slot.prestige.name)} adds ${esc(kind)} to
      <select data-advance="${esc(slot.key)}">${slot.targets.map(t =>
        `<option value="${esc(t.id)}"${t.id === slot.target.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`;
  }).join('');

  $('class-info').innerHTML = counts.map(e => {
    const features = e.cls.progression.slice(0, e.level)
      .map(r => `<li><b>${r.level}</b> ${(r.special || []).map(esc).join(', ') || '—'}</li>`).join('');
    const req = view.requirements.get(e.cls.id);
    const reqHtml = req ? `<p>${STATUS_ICON[req.status]} Requirements ${STATUS_WORD[req.status]}</p>
      <ul class="prereqs">${req.parts.map(x => `<li>${STATUS_ICON[x.status]} ${esc(x.why)}</li>`).join('')}</ul>` : '';
    return `<details class="class-block"${req && req.status !== 'met' ? ' open' : ''}>
      <summary>${esc(e.cls.name)} ${e.level} · hit die ${esc(e.cls.hit_die)} · ${e.cls.skill_ranks_per_level} + Int skill ranks per level</summary>
      ${reqHtml}
      <ol class="features">${features}</ol>
    </details>`;
  }).join('');
}

function render() {
  view = computeView();
  const { race, cls, stats } = view;

  // Controls changed from elsewhere (e.g. "Make my character a dwarf" in search) show their new value.
  $('race').value = state.race;
  $('budget').value = state.budget;
  $('flexible').value = state.flexible;
  INCREASE_LEVELS.forEach((_, i) => { document.querySelector(`[data-increase="${i}"]`).value = state.increases[i]; });
  document.querySelector(`input[name="favored"][value="${state.favored}"]`).checked = true;

  // Race info: each item opens a popup explaining it. Redrawn only when the race changes, so an open
  // popup isn't left pointing at a button that no longer exists.
  if ($('race-info').dataset.race !== race.id) {
    raceItems = raceTerms(race);
    $('race-info').dataset.race = race.id;
    $('race-info').innerHTML = `
      ${race.incomplete ? '<p class="warning">Some of this race\'s traits are missing from the source data.</p>' : ''}
      ${termButtons(raceItems)}`;
  }

  renderClasses(view);
  $('subtitle').textContent = `${race.name} ${view.counts.map(e => `${e.cls.name} ${e.level}`).join(' / ')}`;
  renderCharacterBar();

  // Point buy
  const spent = pointsSpent(state.base);
  const left = state.budget - spent;
  $('points').textContent = left >= 0 ? `${spent} spent, ${left} left` : `${spent} spent, ${-left} over budget`;
  $('points').classList.toggle('over', left < 0);

  // Ability rows
  $('flexible-row').hidden = !race.flexible_ability_bonus;
  const adj = racialAdjustments(race, state.flexible);
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
  const worn = [view.gear.armor, view.gear.shield].filter(Boolean).map(a => a.name).join(' and ');
  const init = initiative(stats, view.haveFeats);
  const results = [
    ['Hit points', esc(stats.hp)],
    ['Initiative', `${esc(signed(init))}${rollButton({ title: 'Initiative', check: 'Initiative', plain: true, groups: [{ attacks: [init] }] })}`],
    ['Base attack bonus', esc(formatBab(stats.bab))],
    ['Speed', esc(view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.`)],
    ['Wearing', esc(worn || 'no armor')],
  ];
  $('results').innerHTML = results.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // Armor Class and saving throws, in the Race card; each save has a Roll button.
  const saveRow = (name, value) => `<div class="defense-row"><span>${name}</span><b>${esc(signed(value))}</b>
    ${rollButton({ title: `${name} save`, check: `${name} save`, groups: [{ attacks: [value] }] })}</div>`;
  $('race-defense').innerHTML = `
    <div class="defense-ac">
      <div><span>AC</span><b>${stats.ac}</b></div>
      <div><span>Touch</span><b>${stats.touch}</b></div>
      <div><span>Flat-footed</span><b>${stats.flatFooted}</b></div>
    </div>
    ${saveRow('Fortitude', stats.fort)}${saveRow('Reflex', stats.ref)}${saveRow('Will', stats.will)}`;

  renderSkills(race, view.classes, stats.scores, [...view.chosen.map(f => f.name),
    ...view.featChoices.filter(c => c.kind === 'skill' && c.value).map(c => `${c.feat} (${c.value})`)]);
  renderFeats(view.slots, view.granted, view.ctx);
  renderSpells(view);
  renderArmorTab(app, view);
  if (tab === 'spells') renderSpellList(app, view);
  if (tab === 'equipment') renderEquipment(app, view);
  if (tab === 'magic-items') renderMyItems(app);
  if (tab === 'weapons') renderMyWeapons(app, view);
  if (tab === 'feats' && !$('feat-tab-results').hidden) renderFeatTabSearch();
}

function renderSkills(race, classes, scores, featNames) {
  const isClassSkill = classSkillTest(classes);
  const racial = racialSkillBonuses(race);
  const available = skillRanksAvailable({
    race, classLevels: view.classLevels, favoredClassId: view.favoredClassId, baseScores: state.base,
    flexibleChoice: state.flexible, increases: state.increases, favoredSkill: state.favored === 'skill',
  });
  const names = skillRowNames();
  const used = names.reduce((sum, n) => sum + (state.skills[n] || 0), 0);
  // The Skills tab's search shows only matching rows.
  const shownNames = skillFilter ? names.filter(n => n.toLowerCase().includes(skillFilter)) : names;
  $('skill-count').textContent = `${used} of ${available} ranks used`;
  $('skill-count').classList.toggle('over', used > available);

  const checkPenalty = view.gear.checkPenalty;
  $('skills-hint').textContent =
    `At most ${state.level} rank${state.level === 1 ? '' : 's'} in each skill. Class skills get +3 once they have a rank.` +
    (checkPenalty ? ` Your armor's check penalty (${checkPenalty}) applies to Str and Dex skills.` : '');

  const abbr = a => a.charAt(0).toUpperCase() + a.slice(1);
  $('skill-rows').innerHTML = (shownNames.length ? '' : '<tr><td colspan="3" class="hint">No skill matches that search.</td></tr>') +
    shownNames.map(name => {
    const info = skillInfo(name);
    // Only Craft/Perform/Profession have player-added specialties; "Knowledge (arcana)" is a skill of its own.
    const specialty = info.family ? splitSkill(name).specialty : null;
    const classSkill = isClassSkill(name);
    const tags = [classSkill ? '<span class="tag">class</span>' : '', info.trained ? '<span class="tag muted">trained only</span>' : ''].join('');

    // A family row (plain "Craft") holds the box for adding specialties; ranks go on the specialties.
    if (info.family && !specialty) {
      const untrained = skillTotal({ name, ranks: 0, scores, isClassSkill: false, checkPenalty });
      return `<tr class="family" data-row-skill="${esc(name)}">
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
    const t = skillTotal({ name, ranks, scores, isClassSkill: classSkill, racialBonuses: racial, featNames, checkPenalty });
    const parts = [`${abbr(info.ability)} ${signed(t.abilityMod)}`];
    if (t.classBonus) parts.push(`class +${t.classBonus}`);
    if (t.racial) parts.push(`race ${signed(t.racial)}`);
    if (t.feat) parts.push(`feats +${t.feat}`);
    if (t.armor) parts.push(`armor ${t.armor}`);
    return `<tr${specialty ? ' class="specialty"' : ''} data-row-skill="${esc(name)}">
      <td><div class="skill-name">${esc(name)} ${tags}
          ${specialty ? `<button type="button" class="link" data-remove-specialty="${esc(name)}" aria-label="Remove ${esc(name)}">remove</button>` : ''}</div>
        <div class="breakdown">${parts.join(' · ')}</div>
        ${ranks > state.level ? `<div class="warning">More than ${state.level} ranks</div>` : ''}</td>
      <td><span class="base">
        <button type="button" data-skill="${esc(name)}" data-skill-step="-1" aria-label="Fewer ranks in ${esc(name)}">−</button>
        <span class="value">${ranks}</span>
        <button type="button" data-skill="${esc(name)}" data-skill-step="1" aria-label="More ranks in ${esc(name)}">+</button>
      </span></td>
      <td class="total">${t.usable ? `${signed(t.total)}${rollButton({ title: `${name} check`, check: name, plain: true, groups: [{ attacks: [t.total] }] })}`
        : '<span class="muted" title="Needs at least 1 rank">—</span>'}</td>
    </tr>`;
  }).join('');
}

const STATUS_ICON = {
  met: '<span class="status met" title="Prerequisites met">✓</span>',
  unmet: '<span class="status unmet" title="Prerequisites not met">✗</span>',
  unknown: '<span class="status unknown" title="Some prerequisites can\'t be checked">?</span>',
};

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

// Weapon, skill or school a feat was taken for.
function choiceLabel(c) {
  if (c.kind === 'weapon') return data.weaponsById?.get(c.value)?.name.toLowerCase() || c.value;
  return c.value;
}

function choiceSelect(c) {
  const word = { weapon: 'weapon', skill: 'skill', school: 'school of magic' }[c.kind];
  let options;
  if (c.kind === 'weapon') {
    if (!data.weapons) {
      app.loadWeapons().then(() => render());
      return '<p class="hint">Loading weapons…</p>';
    }
    options = data.weapons.map(w => [w.id, w.name]);
  } else if (c.kind === 'skill') {
    options = skillRowNames().map(n => [n, n]);
  } else {
    options = SPELL_SCHOOLS.map(s => [s, s[0].toUpperCase() + s.slice(1)]);
  }
  return `<label class="row feat-choice">For which ${word}?
      <select data-feat-choice="${esc(c.slotId)}"><option value="">Choose…</option>${options.map(([v, t]) =>
        `<option value="${esc(v)}"${v === c.value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    ${c.value ? '' : `<p class="hint">Choose a ${word} so the feat's bonus can be counted.</p>`}`;
}

function renderFeats(slots, granted, ctx) {
  const filled = slots.filter(s => data.featsById.has(state.feats[s.id])).length;
  $('feat-count').textContent = `${filled} of ${slots.length} chosen`;
  $('granted-feats').textContent = granted.length ? `Free from your class${view.classes.length > 1 ? 'es' : ''}: ${granted.join(', ')}.` : '';

  $('feat-slots').innerHTML = slots.map(slot => {
    const f = data.featsById.get(state.feats[slot.id]);
    const rule = slot.kind === 'class' ? BONUS_FEAT_RULES[slot.ruleId].note : '';
    let body;
    if (f) {
      const check = checkFeat(f, view.contextAt(slot.charLevel, slot.id), slot);
      const wrongSlot = !slotAccepts(slot, f);
      const choice = view.featChoices.find(c => c.slotId === slot.id);
      body = `
        <details class="chosen">
          <summary>${STATUS_ICON[check.status]} ${esc(f.name)}${choice?.value ? ` (${esc(choiceLabel(choice))})` : ''}</summary>
          ${featDetails(f, check)}
        </details>
        ${choice ? choiceSelect(choice) : ''}
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
  const slot = view.slots.find(s => s.id === slotId);
  $('picker-title').textContent = slot.label;
  $('picker-rule').textContent = slot.kind === 'class' ? BONUS_FEAT_RULES[slot.ruleId].note : '';
  $('feat-search').value = '';
  renderPicker();
  $('feat-picker').showModal();
}

function renderPicker() {
  const slot = view.slots.find(s => s.id === pickerSlotId);
  if (!slot) return;
  const search = $('feat-search').value.trim().toLowerCase();
  const type = $('feat-type').value;
  const hideUnmet = $('feat-qualify').checked;
  // Feats already chosen in another slot, unless the feat can be taken more than once.
  const taken = new Set(view.slots.filter(s => s.id !== slot.id).map(s => state.feats[s.id]));

  const matches = [];
  for (const f of data.feats) {
    if (!slotAccepts(slot, f)) continue;
    if (taken.has(f.id) && !repeatable(f)) continue;
    if (type && !(f.types || []).includes(type)) continue;
    if (search && !f.name.toLowerCase().includes(search)) continue;
    const check = checkFeat(f, view.contextAt(slot.charLevel, slot.id), slot);
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

function renderSpells(view) {
  const tables = view.casting.casting.map(c => ({
    c, spells: spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores: view.stats.scores, extraSlot: extraSlotOn(c.cls.id) }),
  }));
  $('spells-card').hidden = !tables.length;
  $('no-spells').hidden = tables.length > 0;
  $('no-spells-text').textContent = tables.length ? ''
    : view.classes.length > 1 ? 'None of your classes cast spells.' : `${view.cls.name}s don't cast spells.`;
  $('spells-tables').innerHTML = tables.map(({ c, spells }) => spellTable(c, spells)).join('');
}

// Spells per day for one casting class (at its effective level, which prestige classes can raise).
function spellTable(c, spells) {
  const { cls } = c;
  const abilityName = ABILITY_NAMES[spells.ability];
  const raised = c.effectiveLevel !== c.classLevel
    ? ` Casts as a level ${c.effectiveLevel} ${cls.name.toLowerCase()} (${c.classLevel} ${cls.name.toLowerCase()} + ${c.effectiveLevel - c.classLevel} from prestige classes).` : '';
  const slot = EXTRA_SLOTS[cls.id];
  const extraBox = slot?.optional ? `<label class="check-row"><input type="checkbox" data-extra-slot="${esc(cls.id)}"
      ${extraSlotOn(cls.id) ? 'checked' : ''}> ${esc(slot.label)}</label>` : '';
  const head = `<h3 class="spell-class">${esc(cls.name)}</h3>
    <p class="hint">Casts with ${esc(abilityName)} (${spells.score}).${esc(raised)}</p>${extraBox}`;
  if (spells.rows.length === 0) {
    return `${head}<p class="hint">${esc(cls.name)}s start casting spells at level ${spells.firstLevel}.</p>`;
  }
  const showKnown = spells.rows.some(r => r.known !== null);
  const showPrepared = spells.rows.some(r => r.prepared !== null);
  const extraName = spells.extraSlotName;
  const dash = v => (v === null ? '—' : v);
  const rows = spells.rows.map(r => {
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
      ${showPrepared ? `<td>${dash(r.prepared)}</td>` : ''}
    </tr>`;
  }).join('');
  const notes = [];
  if (spells.rows[0].spellLevel === 0) notes.push('Level 0 spells (cantrips and orisons) can be cast any number of times.');
  if (showPrepared) notes.push('Prepared: how many spells of each level you prepare each day from your spellbook; you cast them with your spells per day.');
  return `${head}
    <table class="spells">
      <thead><tr><th>Spell level</th><th>Class</th><th>${esc(abilityName.slice(0, 3))}</th>${extraName ? `<th>${esc(extraName)}</th>` : ''}<th>Per day</th>${showKnown ? '<th>Known</th>' : ''}${showPrepared ? '<th>Prepared</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">${esc(notes.join(' '))}</p>`;
}

// A details window with action buttons: actions are [{ label, primary, run }].
function openDetail(title, bodyHtml, actions = []) {
  $('detail-title').textContent = title;
  $('detail-body').innerHTML = bodyHtml;
  $('detail-actions').innerHTML = actions.map((a, i) =>
    `<button type="button" data-action="${i}"${a.primary ? ' class="primary"' : ''}>${esc(a.label)}</button>`).join('');
  $('detail-actions').onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    $('detail-dialog').close();
    actions[Number(btn.dataset.action)].run();
  };
  if (!$('detail-dialog').open) $('detail-dialog').showModal();
}

// What happens when a search result is chosen: go to its tab, or show it with a way to use it.
function openResult(type, id) {
  if (type === 'race') {
    const r = data.races.find(x => x.id === id);
    const traits = (r.traits || []).map(t => `<li><b>${esc(t.name)}</b> ${esc(t.text)}</li>`).join('');
    openDetail(r.name, `<p class="hint">${esc(r.category)} race · ${esc(sourceText(r))}</p>
      ${paragraphs(r.summary || '')}<ul class="plain-list">${traits}</ul>`,
    [{ label: `Make my character ${/^[aeiou]/i.test(r.name) ? 'an' : 'a'} ${r.name}`, primary: true,
       run: () => { update({ race: id }); showTab('character'); } }]);
  } else if (type === 'class') {
    const c = data.classes.find(x => x.id === id);
    const featureNames = [...new Set((c.features || []).map(f => f.name))].join(', ');
    openDetail(c.name, `<p class="hint">${esc(c.category)} class · ${esc(sourceText(c))}</p>
      ${paragraphs(c.summary || '')}
      ${facts([['Hit die', c.hit_die], ['Skill ranks per level', c.skill_ranks_per_level], ['Alignment', c.alignment]])}
      ${featureNames ? `<h4>Class features</h4><p>${esc(featureNames)}</p>` : ''}`,
    [
      ...(state.classLevels.length < 20 ? [{ label: `Add a level of ${c.name}`, primary: true,
        run: () => { update({ classLevels: [...state.classLevels, id] }); showTab('character'); } }] : []),
      ...(c.category !== 'prestige' ? [{ label: `Make every level ${c.name}`,
        run: () => { update({ classLevels: state.classLevels.map(() => id) }); showTab('character'); } }] : []),
    ]);
  } else if (type === 'feat') {
    const f = data.featsById.get(id);
    openDetail(f.name, featDetails(f, checkFeat(f, view.ctx)),
      [{ label: 'Go to Feats', primary: true, run: () => showTab('feats') }]);
  } else if (type === 'skill') {
    showTab('skills');
    const row = document.querySelector(`[data-row-skill="${CSS.escape(id)}"]`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.classList.remove('flash');
      void row.offsetWidth;  // restart the highlight animation
      row.classList.add('flash');
    }
  } else if (type === 'spell') {
    showTab('spells');
    showSpell(app, id);
  } else if (type === 'magic-item') {
    showTab('magic-items');
    showItem(app, id);
  } else if (type === 'equipment') {
    showTab('equipment');
    showGear(app, id);
  } else if (type === 'weapon') {
    showTab('weapons');
    showWeapon(app, id);
  } else if (type === 'armor') {
    const a = data.armorById.get(id);
    const isShield = a.category === 'shield';
    openDetail(a.name, armorDetails(a), [
      { label: isShield ? 'Use this shield' : 'Wear this armor', primary: true,
        run: () => { update(isShield ? { shieldId: id } : { armorId: id }); showTab('armor'); } },
      { label: 'Go to Armor', run: () => showTab('armor') },
    ]);
  }
}

async function start() {
  try {
    [data.races, data.classes, data.feats, data.armor] = await Promise.all([
      fetch('data/races.json').then(r => r.json()),
      fetch('data/classes.json').then(r => r.json()),
      fetch('data/feats.json').then(r => r.json()),
      fetch('data/armor.json').then(r => r.json()),
    ]);
  } catch (err) {
    $('loading').textContent = 'Could not load the rules data. If you opened this file directly, ' +
      'start the local server (python -m http.server 8000) and open http://localhost:8000/ instead.';
    return;
  }
  // NPC classes (adept, aristocrat, commoner, expert, warrior) aren't offered. Prestige classes are, but not
  // at 1st level.
  data.classes = data.classes.filter(c => c.category !== 'npc');
  // Mythic feats need mythic tiers, which the builder doesn't support.
  data.feats = data.feats.filter(f => !(f.types || []).includes('Mythic'));
  data.featsById = new Map(data.feats.map(f => [f.id, f]));
  data.armorById = new Map(data.armor.map(a => [a.id, a]));
  roster = openRoster();
  currentId = roster.current;
  load(loadCharacter(currentId));
  save();
  buildControls();
  initCharacterBar();
  initRolls();
  $('loading').hidden = true;
  $('app').hidden = false;
  render();
  showTab(location.hash.slice(1));
}

start();
