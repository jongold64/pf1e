// Page code: loads the data, builds the controls, switches tabs, and shows the results from the rules modules.
import {
  ABILITIES, ABILITY_NAMES, BUDGETS, MIN_SCORE, MAX_SCORE, POINT_COSTS, INCREASE_LEVELS,
  EXTRA_SLOTS,
  pointsSpent, racialAdjustments, characterStats, hitDieSize, averageHpPerLevel, saveBreakdown, initiativeBreakdown, acBreakdown, maneuverBreakdown, MONK_IDS, formatBab, spellsPerDay, classCounts, initiative, combatManeuvers,
  currentHp, changeHp, applyHp, addTempHp, TEMP_HP_SOURCES, hpStatus, channelEnergy, layOnHands, smite, SIZE_AC, carryingCapacity, encumbrance, slowedSpeed,
} from './rules.js';
import {
  BONUS_FEAT_RULES, featSlots, slotAccepts, grantedFeatsFor, proficiencyFeatsFor, featContext, checkFeat,
  repeatable, featEffects, slotCharacterLevel, CHOICE_FEATS, SPELL_SCHOOLS, featApplied,
} from './feats.js';
import { castingClasses } from './multiclass.js';
import { checkRequirements, castingByTradition } from './prestige.js';
import { proficiencyTest, weaponWeight, WEAPON_SIZES } from './weapons.js';
import {
  SKILLS, SKILL_FEATS, CRAFTS, skillBreakdown, splitSkill, skillInfo, classSkillTest, skillRanksAvailable, racialSkillBonuses, skillTotal,
} from './skills.js';
import { armorEffects, speedInArmor } from './armor.js';
import { $, esc, signed, ordinal, paragraphs, facts, sourceText } from './dom.js';
import { initArmorTab, renderArmorTab, armorDetails, showArmorWhy, popArmor } from './tab-armor.js';
import { initSpellList, renderSpellList, showSpell } from './tab-spells.js';
import { initItemsTab, renderItemsTab, renderMyItems, showItem } from './tab-items.js';
import { renderCrafting } from './tab-crafting.js';
import { initEquipmentTab, renderEquipmentTab, renderEquipment, showGear } from './tab-equipment.js';
import { equipmentTotals, magicItemTotals, sizeWeightFactor } from './equipment.js';
import { initWeaponsTab, renderWeaponsTab, renderMyWeapons, showWeapon } from './tab-weapons.js';
import { initSearch } from './search-ui.js';
import { raceTerms, termButtons, initTermPopover } from './race-terms.js';
import { cleanAbilities } from './crafting.js';
import { withMaterial, materialById } from './materials.js';
import { buffById, BONUS_TYPES, TARGETS, effectTotals, shiftSize, activeBonuses } from './effects.js';
import { FLAWS, flawById, flawEffects } from './flaws.js';
import { initEffects, renderEffects } from './tab-effects.js';
import { companionLevel, ANIMAL_SKILLS, TRICKS } from './companion.js';
import { initCompanion, renderCompanion } from './tab-companion.js';
import { DOMAIN_CLASSES, domainChoices, domainConflict, domainGrants } from './domains.js';
import { classWithArchetypes, archetypeConflict, replacedEntries, featureDescription, archetypesFor, unchainedFit, kiPowerTrades, UNCHAINED_FROM } from './archetypes.js';
import { raceWithAlternates, replacedTraits, alternateConflict, favoredOption, favoredOptionTotal, favoredChoices } from './race-options.js';
import { traitEffects, traitSlotCount } from './traits.js';
import { initTraits, renderTraits } from './tab-traits.js';
import { openRoster, saveRoster, loadCharacter, saveCharacter, removeCharacter, newId, exportData, importData } from './storage.js';
import { buildSheet } from './sheet.js';
import { initRolls, rollButton, setRollOptions } from './roll-ui.js';
import { HERO_POINT_USES, heroPointMax, heroPointsAfter, clampHeroPoints, spendHeroPoint } from './hero-points.js';
import { randomDie, rollDamage } from './dice.js';
import { weaponSummaries } from './tab-weapons.js';

const RACE_GROUPS = [['core', 'Core'], ['featured', 'Featured'], ['uncommon', 'Uncommon'], ['other', 'Other']];
const CLASS_GROUPS = [['core', 'Core'], ['base', 'Base'], ['hybrid', 'Hybrid'], ['occult', 'Occult'], ['unchained', 'Unchained'],
                      ['alternate', 'Alternate'], ['prestige', 'Prestige']];
const TABS = ['character', 'feats', 'skills', 'spells', 'magic-items', 'craft', 'armor', 'weapons', 'equipment', 'guide'];

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
const loadSpells = () => loadOnce('spells', 'data/spells.json', spells => {
  data.spellsById = new Map(spells.map(s => [s.id, s]));
  return spells;
});
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
// Popup text for the class feature buttons on the Classes card (rebuilt on each draw).
let classItems = [];

const state = {
  name: '',                  // the player's name for the character; '' shows "Human Fighter 1" instead
  hpCurrent: null,           // current hit points during play; null means full
  tempHp: [],                // temporary hit points: [{ id (rules.js TEMP_HP_SOURCES or 'spirit-boost'), name, amount }]
  spiritBoost: 0,            // Spirit Boost (oracle Life revelation): the oracle's level when switched on, 0 when off
  heroPoints: null,          // Action Points house rule: hero points now; null until first counted (then starts at 1)
  antihero: false,           // Action Points house rule: no hero points, a bonus feat at 1st level instead
  houseRules: {},            // house rules switched on: encumbrance, maxHealing, actionPoints, flaws, extraTrait
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
  flexible2: 'dex',  // second +2 for Dual Talent (a human alternate trait)
  alternates: [],    // alternate racial traits taken (names from the race's alternate_traits)
  archetypes: {},    // class id -> archetype ids taken for that class
  domains: {},       // class id -> domain ids chosen (cleric 2, inquisitor 1, druid 1 with a Nature Bond domain)
  natureBond: 'companion',  // druid's Nature Bond: 'companion' (animal companion) or 'domain'
  increases: INCREASE_LEVELS.map(() => ''),  // ability picked at each of levels 4, 8, 12, 16, 20
  // Favored class bonus at each character level: 'hp', 'skill' or 'option' (the race's favored class option);
  // missing means 'hp'. Only levels in the favored class count.
  favoredPicks: [],
  extraSlots: {},  // class id -> true/false for optional extra spell slots (see EXTRA_SLOTS)
  feats: {},       // feat slot id (see featSlots) -> feat id
  featChoices: {}, // feat slot id -> { feat: feat id, value } for CHOICE_FEATS (weapon id, skill name or school)
  skills: {},      // skill name -> ranks, e.g. { Acrobatics: 2, 'Craft (alchemy)': 1 }
  specialties: [], // Craft/Perform/Profession specialties the player added, e.g. ['Craft (alchemy)']
  traits: [],      // chosen trait ids, one per trait slot (null for an empty slot); see traits.js
  drawback: '',    // Drawbacks house rule: the drawback taken (data/drawbacks.json id), '' for none
  flaws: [],       // Flaws house rule: up to two { id (flaws.js FLAWS, or 'other'), choice? (Pathetic's ability), name, effect }
  armorId: '',     // worn armor (data/armor.json id), '' for none
  armorEnh: 0,     // its magic enhancement bonus, 0-5
  armorMw: false,  // masterwork (non-magic); magic armor is always masterwork
  shieldMw: false,
  // Animal companion: animal id (data/companions.json), name, ability increases ('str'...), feat names, tricks, skill ranks.
  companion: { animal: '', name: '', increases: [], feats: [], tricks: [], skills: {} },
  buffs: [],          // active common buffs: [{ id (effects.js BUFFS), cl (caster level) }]
  customEffects: [],  // typed-in effects: [{ name, target, type, value, on }]
  armorMaterial: '',   // special material (materials.js id: 'mithral'...), '' for the usual
  shieldMaterial: '',
  shieldId: '',
  shieldEnh: 0,
  armorAbilities: [],   // special abilities on the worn armor ([{ id, name, option?, bonus? | gp? }])
  shieldAbilities: [],
  armorCrafted: false,  // made by the character (its magic costs half)
  shieldCrafted: false,
  craftedItems: [],     // potions, scrolls and wands: [{ kind, spellId, spellName, spellLevel, cl, qty, bought? }] (made, or bought)
  gold: null,      // gold the character has; null means the class's average starting gold
  inventory: [],   // [{ id, variant, qty }] from data/equipment.json; variant is e.g. 'Masterwork'
  spells: [],      // ids of the character's chosen spells (known spells or spellbook) from data/spells.json
  magicItems: [],  // [{ id, option, qty }] from data/magic-items.json; option is e.g. '+2'
  weapons: [],     // [{ id, enh, masterwork, focus, greaterFocus, spec, greaterSpec, proficient }] from data/weapons.json
  // Combat options on the Weapons tab: Power Attack / Deadly Aim / Rapid Shot switched on, and the weapons used
  // for two-weapon fighting as indexes into `weapons` ("2", or "2:1" for the other end of double weapon 2).
  combat: { main: '', off: '' },
};

// House rules the player can switch on (Character tab): [key, button label, what it does].
const HOUSE_RULES = [
  ['encumbrance', 'Encumbrance', 'Encumbrance: what you carry (armor, weapons, equipment, magic items; not coins) sets your load; a medium or heavy load limits Dex, adds a check penalty and slows you.'],
  ['maxHealing', 'Max Healing', 'Max Healing: healing rolls (cure spells, channel energy, lay on hands) give their maximum.'],
  ['actionPoints', 'Action Points', "Action Points: Pathfinder's hero points (Advanced Player's Guide), in the Race card: 1 to start, 1 more each level gained, at most 3, and at most 1 spent a round."],
  ['flaws', 'Flaws', 'Flaws: up to two flaws, each giving a bonus feat (Feats tab).'],
  ['extraTrait', 'Extra Campaign Trait', 'Extra Campaign Trait: a third trait slot (Feats tab).'],
  ['drawbacks', 'Drawbacks', "Drawbacks (Ultimate Campaign): take one drawback and gain an extra trait (Feats tab)."],
];

// A fresh character, for "New" and for resetting before a saved one is loaded.
const DEFAULTS = structuredClone(state);
// The saved characters (see storage.js) and which one is open.
let roster = null;
let currentId = null;

// Shared with the tab modules.
const app = {
  state, data, update, loadSpells, loadItems, loadGear, loadWeapons, showTab, openDetail, openResult, skillTotalFor,
  showAcDetails: column => showAcDetails(column),
  get view() { return view; },
};

// Puts a saved character (or null for a new one) into `state`, repairing anything an older version saved
// differently or that the data no longer has.
function load(saved) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, structuredClone(DEFAULTS));
  if (saved && typeof saved === 'object') Object.assign(state, structuredClone(saved), { base: { ...state.base, ...saved.base } });
  state.name = typeof state.name === 'string' ? state.name.slice(0, 60) : '';
  if (!Number.isInteger(state.hpCurrent)) state.hpCurrent = null;
  state.tempHp = (Array.isArray(state.tempHp) ? state.tempHp : [])
    .filter(t => t && typeof t.id === 'string' && Number.isInteger(t.amount) && t.amount > 0)
    .map(t => ({ id: t.id, name: String(t.name || t.id).slice(0, 60), amount: t.amount })).slice(0, 20);
  state.spiritBoost = Number.isInteger(state.spiritBoost) && state.spiritBoost > 0 ? Math.min(20, state.spiritBoost) : 0;
  if (!Number.isInteger(state.heroPoints) || state.heroPoints < 0) state.heroPoints = null;
  state.antihero = state.antihero === true;
  const hr = state.houseRules && typeof state.houseRules === 'object' ? state.houseRules : {};
  state.houseRules = Object.fromEntries(HOUSE_RULES.filter(([k]) => hr[k] === true).map(([k]) => [k, true]));
  if (!data.races.some(r => r.id === state.race)) state.race = DEFAULTS.race;
  if (!BUDGETS.some(b => b.points === state.budget)) state.budget = DEFAULTS.budget;
  if (!ABILITIES.includes(state.flexible)) state.flexible = DEFAULTS.flexible;
  if (!ABILITIES.includes(state.flexible2)) state.flexible2 = DEFAULTS.flexible2;
  // Saves from before per-level favored class choices had one choice for every level.
  if (!Array.isArray(saved?.favoredPicks)) {
    state.favoredPicks = state.favored === 'skill' ? (state.classLevels || []).map(() => 'skill') : [];
  }
  state.favoredPicks = state.favoredPicks.slice(0, 20).map(p => (['hp', 'skill', 'option'].includes(p) ? p : 'hp'));
  delete state.favored;
  // Archetypes: only ones that exist, for the class they're filed under.
  const arch = state.archetypes && typeof state.archetypes === 'object' && !Array.isArray(state.archetypes) ? state.archetypes : {};
  state.archetypes = Object.fromEntries(Object.entries(arch)
    .map(([cid, ids]) => [cid, (Array.isArray(ids) ? ids : [])
      .filter(id => [cid, UNCHAINED_FROM[cid]].includes(data.archetypesById.get(id)?.class))])
    .filter(([, ids]) => ids.length));
  // Domains: only ones the class may choose, at most as many as it gets.
  const dom = state.domains && typeof state.domains === 'object' && !Array.isArray(state.domains) ? state.domains : {};
  state.domains = Object.fromEntries(Object.entries(dom).filter(([cid]) => DOMAIN_CLASSES[cid]).map(([cid, ids]) => {
    const allowed = new Set(domainChoices(cid, data.domains).map(d => d.id));
    return [cid, [...new Set(Array.isArray(ids) ? ids : [])].filter(id => allowed.has(id)).slice(0, DOMAIN_CLASSES[cid].count)];
  }).filter(([, ids]) => ids.length));
  if (state.natureBond !== 'domain') state.natureBond = 'companion';
  const altNames = new Set((data.races.find(r => r.id === state.race)?.alternate_traits || []).map(a => a.name));
  state.alternates = (Array.isArray(state.alternates) ? state.alternates : []).filter(n => altNames.has(n));
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
  state.flaws = (Array.isArray(state.flaws) ? state.flaws : []).slice(0, 2).map(f => {
    const name = String(f?.name || '').slice(0, 60);
    const known = flawById.get(f?.id) || FLAWS.find(x => x.name.toLowerCase() === name.trim().toLowerCase());
    if (known) return { id: known.id, name: known.name, effect: '', ...(known.choice && ABILITIES.includes(f?.choice) ? { choice: f.choice } : {}) };
    return name.trim() ? { id: 'other', name, effect: String(f?.effect || '').slice(0, 200) } : { id: '', name: '', effect: '' };
  });
  if (!data.drawbacksById?.has(state.drawback)) state.drawback = '';
  state.traits = (Array.isArray(state.traits) ? state.traits : []).slice(0, 4)
    .map(id => (typeof id === 'string' && data.traitsById.has(id) ? id : null));
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
  state.armorMw = state.armorMw === true;
  state.shieldMw = state.shieldMw === true;
  // Animal companion: only known animals, skills and tricks.
  const comp = state.companion && typeof state.companion === 'object' ? state.companion : {};
  const list = x => (Array.isArray(x) ? x : []);
  state.companion = {
    animal: data.companions.animals.some(a => a.id === comp.animal) ? comp.animal : '',
    name: String(comp.name || '').slice(0, 40),
    increases: list(comp.increases).slice(0, 4).map(a => (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(a) ? a : 'str')),
    feats: list(comp.feats).slice(0, 8).map(n => String(n || '')),
    tricks: [...new Set(list(comp.tricks).filter(t => TRICKS.includes(t)))],
    skills: Object.fromEntries(Object.entries(comp.skills && typeof comp.skills === 'object' ? comp.skills : {})
      .filter(([n, r]) => ANIMAL_SKILLS.includes(n) && Number.isInteger(r) && r > 0 && r <= 20)),
  };
  // Active effects: known buffs once each, caster level 1-20; custom effects with a known target and type.
  const seenBuffs = new Set();
  state.buffs = (Array.isArray(state.buffs) ? state.buffs : []).filter(x => x && buffById.has(x.id) && !seenBuffs.has(x.id) && seenBuffs.add(x.id))
    .map(x => ({ id: x.id, cl: Math.min(20, Math.max(1, Math.floor(Number(x.cl)) || 1)) }));
  state.customEffects = (Array.isArray(state.customEffects) ? state.customEffects : []).filter(x => x && typeof x === 'object')
    .map(x => ({ name: String(x.name || '').slice(0, 60), target: TARGETS.some(([t]) => t === x.target) ? x.target : 'attack',
                 type: BONUS_TYPES.includes(x.type) ? x.type : 'untyped', value: Math.trunc(Number(x.value)) || 0, on: x.on !== false }))
    .slice(0, 20);
  // A material only if the worn item can be made of it.
  for (const k of ['armor', 'shield']) {
    const m = materialById.get(state[`${k}Material`]);
    const item = data.armorById.get(state[`${k}Id`]);
    if (!m || !item || !m.fits(item)) state[`${k}Material`] = '';
  }
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
    .map(e => ({ id: e.id, ...(typeof e.option === 'string' ? { option: e.option } : {}), qty: e.qty,
                 ...(e.crafted === true ? { crafted: true } : {}) }));
  const FLAGS = ['masterwork', 'focus', 'greaterFocus', 'spec', 'greaterSpec', 'impCrit', 'proficient', 'crafted', 'jotungrip'];
  state.weapons = (Array.isArray(state.weapons) ? state.weapons : [])
    .filter(e => e && typeof e.id === 'string')
    .map(e => ({ id: e.id, enh: Number.isInteger(e.enh) && e.enh >= 0 && e.enh <= 5 ? e.enh : 0,
                 ...Object.fromEntries(FLAGS.filter(f => e[f] === true).map(f => [f, true])),
                 ...(cleanAbilities(e.abilities).length ? { abilities: cleanAbilities(e.abilities) } : {}),
                 ...(WEAPON_SIZES.includes(e.size) ? { size: e.size } : {}) }));
  // Crafted items (Magic Items tab's Crafting card): abilities on worn armor, and potions, scrolls and wands.
  state.armorAbilities = cleanAbilities(state.armorAbilities);
  state.shieldAbilities = cleanAbilities(state.shieldAbilities);
  state.armorCrafted = state.armorCrafted === true;
  state.shieldCrafted = state.shieldCrafted === true;
  state.craftedItems = (Array.isArray(state.craftedItems) ? state.craftedItems : [])
    .filter(e => e && ['potion', 'scroll', 'wand'].includes(e.kind) && typeof e.spellId === 'string' && typeof e.spellName === 'string'
      && Number.isInteger(e.spellLevel) && Number.isInteger(e.cl) && e.cl > 0 && Number.isInteger(e.qty) && e.qty > 0)
    .map(({ kind, spellId, spellName, spellLevel, cl, qty, bought }) => ({ kind, spellId, spellName, spellLevel, cl, qty,
                                                                          ...(bought === true ? { bought: true } : {}) }));
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
  // A druid's domain slot comes with a Nature Bond domain (chosen on the Classes card).
  if (clsId === 'druid') return state.natureBond === 'domain' && !!state.domains.druid?.length;
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
  // The Equipment tab's totals, as text (leaving out their Details buttons).
  const moneyRows = [...$('money-summary').querySelectorAll('dt')].map(dt => [dt.textContent,
    [...(dt.nextElementSibling?.childNodes || [])].filter(n => n.nodeName !== 'BUTTON').map(n => n.textContent).join('').trim()]);
  $('print-sheet').innerHTML = buildSheet({
    app, view, name: characterLabel(state), weapons: weaponSummaries(app, view), skills, moneyRows, extraSlotOn, domainLines,
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
  if (name === 'craft') renderCrafting(app, 'craft');
  if (name === 'equipment') renderEquipmentTab(app);
  if (name === 'weapons') renderWeaponsTab(app);
}

function buildControls() {
  $('race').innerHTML = groupedOptions(data.races, RACE_GROUPS);
  $('budget').innerHTML = BUDGETS.map(b => `<option value="${b.points}">${b.label}</option>`).join('');
  $('flexible').innerHTML = ABILITIES.map(a => `<option value="${a}">${ABILITY_NAMES[a]}</option>`).join('');
  $('flexible2').innerHTML = $('flexible').innerHTML;

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

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  // A new race drops the old one's alternate traits (favored class options that don't exist fall back to +1 HP).
  $('race').addEventListener('change', e => update({ race: e.target.value, alternates: [] }));
  // Alternate racial traits: a tick box each.
  // Details on an alternate racial trait: what it gives and what it takes away, with Take / Remove.
  $('race-alternates').addEventListener('click', e => {
    const pop = e.target.closest('[data-alt-pop]');
    if (!pop) return;
    e.preventDefault();  // inside the checkbox's label: don't tick it
    const race = data.races.find(r => r.id === state.race);
    const a = (race.alternate_traits || []).find(x => x.name === pop.dataset.altPop);
    if (!a) return;
    const taken = state.alternates.includes(a.name);
    const conflict = taken ? '' : alternateConflict(race, a, state.alternates);
    const replaced = replacedTraits(race, a);
    const lost = replaced.map(n => (race.traits || []).find(t => t.name === n)).filter(Boolean);
    openDetail(`${a.name} (${race.name})`, `${paragraphs(a.text)}
      <h3>It replaces</h3>${lost.length ? `<ul class="plain-list arch-pop-features">${lost.map(t => `<li><b>${esc(t.name)}</b>${paragraphs(t.text)}</li>`).join('')}</ul>`
        : replaced.length ? `<p>${esc(replaced.join(', '))}</p>` : '<p class="hint">The text doesn\u2019t name a standard trait the app can match; read it to see what it replaces.</p>'}
      ${conflict ? `<p class="warning">Not available: ${esc(conflict)}.</p>` : taken ? '<p class="hint">You have taken it.</p>' : ''}
      <p class="hint">The app swaps it in everywhere: skills, AC, speed, bonus feats and ability score changes it can read from the text.</p>`,
      taken ? [{ label: 'Remove it', run: () => update({ alternates: state.alternates.filter(n => n !== a.name) }) }]
        : conflict ? [] : [{ label: `Take ${a.name}`, primary: true, run: () => update({ alternates: [...state.alternates, a.name] }) }]);
  });
  $('race-alternates').addEventListener('change', e => {
    const name = e.target.dataset.alternate;
    if (name === undefined) return;
    update({ alternates: e.target.checked ? [...state.alternates, name] : state.alternates.filter(n => n !== name) });
  });
  // Hit point tracker: pick an amount (negative damage, positive healing), then Apply; Full resets.
  const amount = () => Math.trunc(Number($('hp-amount').value) || 0);
  // The box starts empty; the buttons set the number (and it empties again when it's back to 0).
  const setAmount = n => { $('hp-amount').value = n ? String(n) : ''; };
  $('hp-minus').addEventListener('click', () => setAmount(amount() - 1));
  $('hp-plus').addEventListener('click', () => setAmount(amount() + 1));
  $('hp-apply').addEventListener('click', () => {
    if (!amount()) return;
    // Damage comes off temporary hit points first; with Spirit Boost, healing past the maximum becomes temporary.
    const r = applyHp({ current: state.hpCurrent, max: view.stats.hp, temps: state.tempHp, amount: amount(), spiritBoost: state.spiritBoost });
    setAmount(0);
    update({ hpCurrent: r.current, tempHp: r.temps });
  });
  $('hp-full').addEventListener('click', () => update({ hpCurrent: null }));
  $('hp-extra').addEventListener('click', showExtraHp);
  // The Xtra-HP popup's controls (it's drawn into the shared details dialog).
  $('detail-body').addEventListener('click', e => {
    const box = e.target.closest('.xtra-hp');
    if (!box) return;
    const row = e.target.closest('[data-temp-source]');
    const id = row?.dataset.tempSource;
    const src = TEMP_HP_SOURCES.find(s => s.id === id);
    if (e.target.closest('[data-temp-roll]') && src?.formula) {
      const cl = Number(row.querySelector('[data-temp-cl]')?.value) || view.level;
      row.querySelector('[data-temp-amount]').value = rollDamage(src.formula(cl, view.level)).total;
    } else if (e.target.closest('[data-temp-add]') && src) {
      const n = Number(row.querySelector('[data-temp-amount]').value);
      const name = id === 'custom' ? (row.querySelector('[data-temp-name]').value.trim() || 'Other') : src.name;
      update({ tempHp: addTempHp(state.tempHp, { id: id === 'custom' ? `custom-${name.toLowerCase()}` : id, name, amount: n }) });
      showExtraHp();
    } else if (e.target.closest('[data-temp-remove]')) {
      update({ tempHp: state.tempHp.filter(t => t.id !== e.target.closest('[data-temp-remove]').dataset.tempRemove) });
      showExtraHp();
    } else if (e.target.closest('[data-temp-clear]')) {
      update({ tempHp: [] });
      showExtraHp();
    }
  });
  $('detail-body').addEventListener('change', e => {
    if (!e.target.closest('.xtra-hp')) return;
    if (e.target.matches('[data-spirit-on]') || e.target.matches('[data-spirit-level]')) {
      const box = e.target.closest('.xtra-hp');
      const on = box.querySelector('[data-spirit-on]').checked;
      const lv = Math.min(20, Math.max(1, Math.floor(Number(box.querySelector('[data-spirit-level]').value)) || 1));
      update({ spiritBoost: on ? lv : 0 });
    }
  });
  // Details popup for a Spells per day row.
  $('spells-tables').addEventListener('click', e => {
    const b = e.target.closest('[data-spellday]');
    const d = b && spellDayWhy.get(b.dataset.spellday);
    if (!d) return;
    openDetail(d.title, `<table class="skill-why"><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Per day</b></td><td class="num"><b>${esc(d.total)}</b></td></tr></tfoot></table>
      <p class="hint">Ability scores here include active effects (an owl's wisdom, for example).</p>`);
  });
  // Details popup for initiative (Results card).
  $('results').addEventListener('click', e => {
    const rd = e.target.closest('[data-result-details]');
    if (rd) { showResultDetails(rd.dataset.resultDetails); return; }
    if (!e.target.closest('[data-init-details]')) return;
    const b = initiativeBreakdown(view.stats, view.haveFeats, view.traits,
      activeBonuses(state.buffs, view.customAll).filter(x => x.target === 'init'));
    openDetail(`Initiative ${signed(b.total)}`, detailsTable(b.lines, b.total));
  });
  // Details popup for a saving throw.
  $('race-defense').addEventListener('click', e => {
    const b = e.target.closest('[data-save-details]');
    if (b) showSaveDetails(b.dataset.saveDetails);
    const acd = e.target.closest('[data-ac-details]');
    if (acd) showAcDetails(acd.dataset.acDetails || null);
    if (e.target.closest('[data-cmb-details]')) showManeuverDetails();
  });
  // Hero points: +/− for GM awards and corrections, a button for each way to spend one, and the antihero choice.
  $('hero-points').addEventListener('click', e => {
    const add = e.target.closest('[data-hero-add]');
    if (add) {
      heroNote = '';
      update({ heroPoints: clampHeroPoints((state.heroPoints ?? 1) + Number(add.dataset.heroAdd), view.haveFeats) });
    }
    const use = e.target.closest('[data-hero-use]');
    if (use) {
      const luck = HERO_POINT_USES.find(u => u.id === use.dataset.heroUse)?.luck && view.haveFeats.includes('Luck of Heroes');
      const r = spendHeroPoint(state.heroPoints ?? 1, use.dataset.heroUse, { haveFeats: view.haveFeats, d20: luck ? randomDie(20) : null });
      heroNote = r.note;
      update({ heroPoints: r.points });
    }
  });
  $('hero-points').addEventListener('change', e => {
    if (e.target.id === 'antihero') update({ antihero: e.target.checked });
  });
  $('house-rules').addEventListener('click', e => {
    const key = e.target.closest('[data-house-rule]')?.dataset.houseRule;
    if (key) update({ houseRules: { ...state.houseRules, [key]: !state.houseRules[key] } });
  });
  initTermPopover($('race-info'), () => raceItems);
  initTermPopover($('class-info'), () => classItems);
  initTraits(app);
  initEffects(app);
  initCompanion(app);
  // Flaws (house rule): typing in a name or effect saves it when the box loses focus.
  // Details on a drawback: its text, what it gives (an extra trait slot, and the trait in it), and Take / Remove.
  $('drawback-row').addEventListener('click', e => {
    const b = e.target.closest('[data-drawback-pop]');
    if (!b) return;
    const d = data.drawbacksById.get(b.dataset.drawbackPop);
    if (!d) return;
    const mine = state.drawback === d.id;
    const slot = traitSlotCount(state.houseRules, d.id) - 1;
    const trait = mine ? data.traitsById.get(state.traits[slot]) : null;
    openDetail(d.name, `<p class="hint">Drawback · ${esc(d.source)}</p>${paragraphs(d.text)}
      <h3>In the app</h3><p>It gives you an extra trait slot${mine ? `: ${trait ? `you chose ${esc(trait.name)}` : 'not filled yet (Traits card above)'}` : ''}.
        Its penalty isn't counted automatically, since most apply only in some situations: apply it in play, or add a custom
        effect on the Character tab when it applies.</p>
      ${!mine && state.drawback ? `<p class="hint">Taking it replaces ${esc(data.drawbacksById.get(state.drawback)?.name || 'your drawback')} (only one drawback).</p>` : ''}`,
      mine ? [{ label: 'Remove it', run: () => update({ drawback: '' }) }] : [{ label: `Take ${d.name}`, primary: true, run: () => update({ drawback: d.id }) }]);
  });
  $('drawback-row').addEventListener('change', e => {
    if (e.target.id === 'drawback-select') update({ drawback: e.target.value });
  });
  // Details on a flaw: its full text, exactly what the app changes, the bonus feat it gives, and Take / Remove.
  $('flaw-rows').addEventListener('click', e => {
    const b = e.target.closest('[data-flaw-pop]');
    if (!b) return;
    const f = flawById.get(b.dataset.flawPop);
    if (!f) return;
    const at = state.flaws.findIndex(x => x?.id === f.id);
    const mine = at >= 0;
    const fx = flawEffects([{ id: f.id, choice: mine ? state.flaws[at].choice : 'str' }]);
    const applied = [
      ...fx.effects.map(x => `${TARGETS.find(([t]) => t === x.target)?.[1] || x.target} ${x.value}`),
      ...Object.entries(fx.checks).map(([a, v]) => `${ABILITY_NAMES[a]} checks and ${ABILITY_NAMES[a]}-based skills ${v}`),
      ...Object.entries(fx.skills).map(([n, v]) => `${n} ${v}`),
      ...(fx.melee ? [`melee attack rolls ${fx.melee}`] : []), ...(fx.ranged ? [`ranged attack rolls ${fx.ranged}`] : []),
      ...(fx.hpPerLevel ? [`${fx.hpPerLevel} hit point per level`] : []), ...(fx.halfSpeed ? ['base land speed halved'] : []),
    ];
    const featSlot = mine ? view.slots.find(s => s.id === `flaw-${at + 1}`) : null;
    const feat = featSlot && data.featsById.get(state.feats[featSlot.id]);
    const free = [0, 1].find(j => !state.flaws[j]?.id);
    openDetail(f.name, `<p class="hint">Flaw · Unearthed Arcana (d20 SRD)</p><p><i>${esc(f.flavor)}</i></p>
      <p><b>Effect:</b> ${esc(f.effect)}</p>${f.special ? `<p><b>Special:</b> ${esc(f.special)}</p>` : ''}
      <h3>In the app</h3>${applied.length ? `<ul class="plain-list">${applied.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="hint">Counted in your numbers and rolls (each Details popup lists it).</p>` : '<p>Not counted automatically: roll the miss chance twice in play.</p>'}
      <p>It gives a bonus feat at 1st level${mine ? `: ${feat ? `you chose ${esc(feat.name)}` : 'not chosen yet (Feats card below)'}` : ''}.</p>
      ${f.choice && !mine ? '<p class="hint">After taking it, choose which ability it lowers on the Flaws card.</p>' : ''}
      ${!mine && free === undefined ? '<p class="warning">You already have two flaws: change one of them on the Flaws card.</p>' : ''}`,
      mine ? [{ label: 'Remove it', run: () => update({ flaws: state.flaws.map((x, j) => (j === at ? { id: '', name: '', effect: '' } : x)) }) }]
        : free === undefined ? [] : [{ label: `Take ${f.name}`, primary: true, run: () => {
          const flaws = [0, 1].map(j => ({ id: '', name: '', effect: '', ...(state.flaws[j] || {}) }));
          flaws[free] = { id: f.id, name: f.name, effect: '', ...(f.choice ? { choice: 'str' } : {}) };
          update({ flaws });
        } }]);
  });
  $('flaw-rows').addEventListener('change', e => {
    const i = Number(e.target.dataset.flaw);
    const field = e.target.dataset.flawField;
    if (!field) return;
    const flaws = [0, 1].map(j => ({ id: '', name: '', effect: '', ...(state.flaws[j] || {}) }));
    if (field === 'id') {
      const f = flawById.get(e.target.value);
      flaws[i] = f ? { id: f.id, name: f.name, effect: '', ...(f.choice ? { choice: 'str' } : {}) }
        : e.target.value === 'other' ? { id: 'other', name: '', effect: '' } : { id: '', name: '', effect: '' };
    } else if (field === 'choice') flaws[i].choice = e.target.value;
    else flaws[i][field] = e.target.value.slice(0, field === 'name' ? 60 : 200);
    update({ flaws });
  });
  // Classes: a class for each level
  $('class-levels').addEventListener('change', e => {
    const f = e.target.dataset.favoredIndex;
    if (f !== undefined) {
      const picks = state.classLevels.map((_, j) => state.favoredPicks[j] || 'hp');
      picks[Number(f)] = e.target.value;
      update({ favoredPicks: picks });
      return;
    }
    // Changing a class line changes every level of that class (it joins the other class's line if there is one).
    const from = e.target.dataset.classChange;
    if (from === undefined || !e.target.value) return;
    update({ classLevels: state.classLevels.map(id => (id === from ? e.target.value : id)) });
  });
  $('class-levels').addEventListener('click', e => {
    const more = e.target.closest('[data-class-more]');
    if (more && state.classLevels.length < 20) update({ classLevels: [...state.classLevels, more.dataset.classMore] });
    const less = e.target.closest('[data-class-less]');
    if (less && state.classLevels.length > 1) {
      // That class's highest level goes (with its favored class choice); later levels move down one.
      const i = state.classLevels.lastIndexOf(less.dataset.classLess);
      if (i === 0 && state.classLevels[1] && data.classes.find(c => c.id === state.classLevels[1])?.category === 'prestige') return;
      update({ classLevels: state.classLevels.filter((_, j) => j !== i), favoredPicks: state.favoredPicks.filter((_, j) => j !== i) });
    }
  });
  $('add-level').addEventListener('click', () => {
    const id = $('add-level-class').value || state.classLevels.at(-1);
    if (state.classLevels.length < 20) update({ classLevels: [...state.classLevels, id] });
  });
  $('remove-level').addEventListener('click', () => {
    if (state.classLevels.length > 1) update({ classLevels: state.classLevels.slice(0, -1) });
  });
  $('favored-class').addEventListener('change', e => update({ favoredClass: e.target.value }));
  // Domains and the druid's Nature Bond (in a class's block).
  $('class-info').addEventListener('change', e => {
    if (e.target.matches('[data-nature-bond]')) update({ natureBond: e.target.value });
    const cid = e.target.dataset.domainAdd;
    if (cid && e.target.value) update({ domains: { ...state.domains, [cid]: [...(state.domains[cid] || []), e.target.value] } });
  });
  // Archetype Details (taken ones and the browse list).
  $('class-info').addEventListener('click', e => {
    const pop = e.target.closest('[data-arch-pop]');
    if (pop) popArchetype(pop.dataset.archPop, pop.dataset.cls);
    const dpop = e.target.closest('[data-domain-pop]');
    if (dpop) popDomain(dpop.dataset.domainPop, dpop.dataset.cls);
  });
  $('class-info').addEventListener('click', e => {
    const btn = e.target.closest('[data-domain-remove]');
    if (!btn) return;
    const cid = btn.dataset.cls;
    update({ domains: { ...state.domains, [cid]: (state.domains[cid] || []).filter(id => id !== btn.dataset.domainRemove) } });
  });
  // Archetypes: add from the list in a class's block, or remove one taken.
  $('class-info').addEventListener('change', e => {
    const cid = e.target.dataset.archetypeAdd;
    if (cid && e.target.value) update({ archetypes: { ...state.archetypes, [cid]: [...(state.archetypes[cid] || []), e.target.value] } });
  });
  $('class-info').addEventListener('click', e => {
    const btn = e.target.closest('[data-archetype-remove]');
    if (!btn) return;
    const cid = btn.dataset.cls;
    update({ archetypes: { ...state.archetypes, [cid]: (state.archetypes[cid] || []).filter(id => id !== btn.dataset.archetypeRemove) } });
  });
  // "Every level": the same favored class bonus at every level.
  $('favored-summary').addEventListener('click', e => {
    const all = e.target.closest('[data-favored-all]')?.dataset.favoredAll;
    if (all) update({ favoredPicks: state.classLevels.map(() => all) });
  });
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
  $('flexible2').addEventListener('change', e => update({ flexible2: e.target.value }));
  $('ability-rows').addEventListener('click', e => {
    const btn = e.target.closest('button[data-ability]');
    if (!btn) return;
    const a = btn.dataset.ability;
    const next = state.base[a] + Number(btn.dataset.step);
    if (next >= MIN_SCORE && next <= MAX_SCORE) update({ base: { ...state.base, [a]: next } });
  });

  // Skills
  $('skill-rows').addEventListener('click', e => {
    const why = e.target.closest('[data-skill-details]');
    if (why) { showSkillDetails(why.dataset.skillDetails); return; }
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
  // Choosing a craft from the list adds it.
  $('skill-rows').addEventListener('change', e => {
    if (!e.target.matches('[data-craft-pick]') || !e.target.value) return;
    const name = `Craft (${e.target.value})`;
    if (!state.specialties.includes(name)) update({ specialties: [...state.specialties, name] });
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
    const fd = e.target.closest('[data-feat-details]');
    if (fd) { showFeatSlotDetails(fd.dataset.featDetails); return; }
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
    // Details: the feat in a popup over the list (prerequisites at this slot's level, what the app counts), with Choose.
    const pop = e.target.closest('[data-feat-pop]');
    if (pop) {
      e.preventDefault();  // it sits in the row's summary: don't open or close the row
      const f = data.featsById.get(pop.dataset.featPop);
      const slot = view.slots.find(s => s.id === pickerSlotId);
      if (!f || !slot) return;
      const check = checkFeat(f, view.contextAt(slot.charLevel, slot.id), slot);
      const applied = featApplied(f.name, { level: view.level, skillFeats: SKILL_FEATS });
      openDetail(f.name, `<p class="hint">For: ${esc(slot.label)} (checked as of character level ${slot.charLevel})</p>${featDetails(f, check)}
        <h4>In the app</h4><p>${esc(applied || 'Not counted in the numbers automatically: apply it in play (or add it as a custom effect on the Character tab).')}</p>
        ${check.status === 'unmet' ? '<p class="warning">You do not meet all the prerequisites at this level.</p>' : ''}`,
        [{ label: `Choose ${f.name}`, primary: check.status !== 'unmet', run: () => {
          update({ feats: { ...state.feats, [pickerSlotId]: f.id } });
          $('feat-picker').close();
        } }]);
      return;
    }
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
  // Any popup window closes when you click or tap outside it (on the dimmed background), as well as with its Close button.
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;  // a click inside the window's content
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }

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
  const before = { level: state.level, fortune: !!view?.haveFeats.includes("Hero's Fortune") };
  Object.assign(state, changes);
  syncDerived();
  render();
  // Hero points (Action Points house rule) earned by this change: levels gained, or Hero's Fortune just taken.
  if (heroPointsOn()) {
    const points = heroPointsAfter(state.heroPoints, {
      levelsGained: state.level - before.level,
      gotFortune: !before.fortune && view.haveFeats.includes("Hero's Fortune"),
      haveFeats: view.haveFeats,
    });
    if (points !== state.heroPoints) {
      state.heroPoints = points;
      render();
    }
  }
  save();
}

// Hero points count while the Action Points house rule is on, unless the character is an antihero.
function heroPointsOn() {
  return !!state.houseRules.actionPoints && !state.antihero;
}

// Last hero point spent (what it does), shown under the buttons until another hero point button is pressed.
let heroNote = '';

// Total weight carried (for the Encumbrance house rule): worn armor and shield, weapons, equipment and magic items.
// Returns null while data it needs is still loading (it starts the loads and draws again when they're done).
function carriedWeight(armorGear, size) {
  const need = [];
  if (state.inventory.length && !data.gearById) need.push(loadGear());
  if (state.weapons.length && !data.weaponsById) need.push(loadWeapons());
  if (state.magicItems.length && !data.itemsById) need.push(loadItems());
  if (need.length) {
    Promise.all(need).then(() => render());
    return null;
  }
  const worn = equipmentTotals(state.inventory, data.gearById || new Map(),
                               { armor: armorGear.armor, shield: armorGear.shield, size });
  const weapons = state.weapons.reduce((n, e) => { const w = data.weaponsById?.get(e.id); return n + (w ? weaponWeight(w, e, size) : 0); }, 0);
  const magic = data.itemsById ? magicItemTotals(state.magicItems, data.itemsById).weight : 0;
  return Math.round((worn.weight + weapons + magic) * 100) / 100;
}

// "Medium (95 lbs.; light up to 76, medium 153, heavy 230)"
function loadText(load) {
  const name = load.load[0].toUpperCase() + load.load.slice(1);
  return `${name} (${load.weight} lbs.; light up to ${load.capacity.light}, medium ${load.capacity.medium}, heavy ${load.capacity.heavy})`;
}

// Ki powers the unchained monk gives up for monk archetypes (none for other classes).
function kiTradesFor(cls) {
  const original = UNCHAINED_FROM[cls.id] && data.classes.find(c => c.id === UNCHAINED_FROM[cls.id]);
  return original ? kiPowerTrades(original, cls, chosenArchetypes(cls.id)).trades : [];
}

// A skill's total as the Skills tab shows it (used for the Spellcraft check when crafting magic items).
function skillTotalFor(name) {
  const isClassSkill = classSkillTest(view.classes)(name) || view.traitFx.classSkills.has(name);
  const featNames = [...view.chosen.map(f => f.name),
    ...view.featChoices.filter(c => c.kind === 'skill' && c.value).map(c => `${c.feat} (${c.value})`)];
  return skillTotal({ name, ranks: state.skills[name] || 0, scores: view.stats.scores, isClassSkill,
                      racialBonuses: racialSkillBonuses(view.race), featNames, checkPenalty: view.gear.checkPenalty,
                      traitBonuses: view.traitFx.skills, effectBonus: view.stats.fx.skills + flawSkill(name) });
}

// A flaw's penalty on a skill: Feeble (Str, Dex and Con skills) and Inattentive (Perception).
function flawSkill(name) {
  const f = view.flawFx;
  return (f.skillsByAbility[skillInfo(name)?.ability] || 0) + (f.skills[splitSkill(name).base] || f.skills[name] || 0);
}

// The archetypes chosen for a class, as records.
function chosenArchetypes(classId) {
  return (state.archetypes[classId] || []).map(id => data.archetypesById.get(id)).filter(Boolean);
}

// The racial +2 choice: one ability, or two with Dual Talent (a human alternate trait).
function flexibleFor(race) {
  return race.dual_talent ? [state.flexible, state.flexible2] : state.flexible;
}

// Trait save bonuses added to the feat bonuses characterStats takes.
function withTraitSaves(fb, traitFx) {
  return { ...fb, fort: (fb.fort || 0) + traitFx.saves.fort, ref: (fb.ref || 0) + traitFx.saves.ref, will: (fb.will || 0) + traitFx.saves.will };
}

// Everything derived from the character, computed once per change and shared by all tabs.
function computeView() {
  // The race with its chosen alternate racial traits swapped in (everything below reads this one).
  const race = raceWithAlternates(data.races.find(r => r.id === state.race), state.alternates);
  // Each class with its chosen archetypes applied (features replaced, class skills and proficiencies changed).
  const byId = new Map(data.classes.map(c => [c.id, classWithArchetypes(c, chosenArchetypes(c.id), kiTradesFor(c))]));
  const classLevels = state.classLevels.map(id => byId.get(id));
  const counts = classCounts(classLevels);
  const classes = counts.map(e => e.cls);
  const cls = classLevels[0];
  // The favored class must be one the character has (and not a prestige class); otherwise the first class.
  const favoredClassId = classes.some(c => c.id === state.favoredClass && c.category !== 'prestige') ? state.favoredClass : cls.id;
  const favoredPicks = favoredChoices(race, classLevels, favoredClassId, state.favoredPicks);
  const flexibleChoice = flexibleFor(race);
  const casting = castingClasses(counts, state.casterChoices);
  // Feats the character has: chosen ones (only slots reached at this level), free ones from each
  // class, and armor/shield proficiencies. Feats don't change ability scores or BAB, so the
  // prerequisite context can use the same stats that include feat bonuses.
  const slots = featSlots({ race, classLevels, flaws: state.houseRules.flaws ? state.flaws : [],
                           antihero: !!state.houseRules.actionPoints && state.antihero });
  const chosen = slots.map(s => data.featsById.get(state.feats[s.id])).filter(Boolean);
  // What each weapon/skill/school feat was taken for (a choice made for a feat since swapped out doesn't count).
  const featChoices = slots.filter(s => CHOICE_FEATS[data.featsById.get(state.feats[s.id])?.name]).map(s => {
    const f = data.featsById.get(state.feats[s.id]);
    const saved = state.featChoices[s.id];
    return { slotId: s.id, feat: f.name, kind: CHOICE_FEATS[f.name], value: saved?.feat === f.id ? saved.value : '' };
  });
  const granted = grantedFeatsFor(counts, data.feats.map(f => f.name));
  const haveFeats = [...chosen.map(f => f.name), ...granted, ...proficiencyFeatsFor(classes)];
  const armorGear = armorEffects({
    armor: withMaterial(data.armorById.get(state.armorId), state.armorMaterial) || null, armorEnh: state.armorEnh, armorMw: state.armorMw,
    shield: withMaterial(data.armorById.get(state.shieldId), state.shieldMaterial) || null, shieldEnh: state.shieldEnh, shieldMw: state.shieldMw,
  });
  // Chosen traits (only as many as there are slots) and what they add.
  const chosenTraits = state.traits.slice(0, traitSlotCount(state.houseRules, state.drawback)).map(id => data.traitsById.get(id)).filter(Boolean);
  const traitFx = traitEffects(chosenTraits);
  // Active effects (spells and custom bonuses) and the size they leave the character at (enlarge person...).
  // Flaws (house rule) count like effects: their penalties are untyped, so they add up with everything else.
  const flawFx = flawEffects(state.houseRules.flaws ? state.flaws : []);
  const customAll = [...state.customEffects, ...flawFx.effects,
    ...(flawFx.hpPerLevel ? [{ name: 'Frail (flaw)', target: 'hp', type: 'untyped', value: flawFx.hpPerLevel * classLevels.length, on: true }] : [])];
  const fx = effectTotals(state.buffs, customAll);
  const size = shiftSize(race.size, fx.size);
  const statsWith = (gearNow, effects = fx) => characterStats({
    race, classLevels, favoredClassId, baseScores: state.base, flexibleChoice,
    increases: state.increases, favoredPicks,
    featBonuses: withTraitSaves(featEffects(chosen.map(f => f.name), classLevels.length), traitFx), gear: gearNow,
    effects, size,
  });
  // Encumbrance house rule: the load from everything carried limits Dex and adds a check penalty like armor does
  // (the worse of the two counts, they don't add up). Strength doesn't depend on gear, so it comes from a first pass.
  let gear = armorGear;
  let load = null;
  if (state.houseRules.encumbrance) {
    const weight = carriedWeight(armorGear, race.size);
    if (weight !== null) {
      const capacity = carryingCapacity(statsWith(armorGear).scores.str, race.size);
      const enc = encumbrance(weight, capacity);
      load = { ...enc, weight, capacity };
      const caps = [armorGear.maxDex, enc.maxDex].filter(v => v !== null && v !== undefined);
      gear = { ...armorGear, maxDex: caps.length ? Math.min(...caps) : null,
               checkPenalty: Math.min(armorGear.checkPenalty, enc.checkPenalty) };
    }
  }
  const stats = statsWith(gear);
  // Feat prerequisites use the scores without temporary effects.
  const plainScores = statsWith(gear, null).scores;
  const skillRanks = Object.fromEntries(skillRowNames().filter(n => state.skills[n]).map(n => [n, state.skills[n]]));
  const ctx = featContext({ race, counts, casting: casting.casting, scores: plainScores, bab: stats.bab[0], haveFeats, skillRanks });

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
      const beforeStats = characterStats({ race, classLevels: before, baseScores: state.base, flexibleChoice,
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
  const baseSpeed = flawFx.halfSpeed && race.base_speed ? Math.floor(race.base_speed / 2 / 5) * 5 : race.base_speed;
  let speed = speedInArmor(baseSpeed, gear, race);
  // A medium or heavy load slows like medium or heavy armor (not both); dwarves' Slow and Steady ignores it.
  if (load?.slows && !(race.traits || []).some(t => t.name === 'Slow and Steady')) {
    speed = Math.min(speed ?? Infinity, slowedSpeed(race.base_speed));
  }
  // Enhancement bonuses to speed from effects (haste, longstrider...).
  if (speed !== null && speed !== undefined && fx.speed) speed = Math.max(5, speed + fx.speed);
  return {
    race, cls, classLevels, counts, classes, favoredClassId, favoredPicks, flexibleChoice, casting, level: classLevels.length,
    slots, chosen, granted, haveFeats, featChoices, gear, stats, ctx, contextAt, speed, requirements, traits: chosenTraits, traitFx,
    load, fx, size, flawFx, customAll,
    // Animal companion's effective druid level (0 = none). A domain with the Animal Companion power counts (cleric, or
    // a druid whose Nature Bond is the Animal domain).
    companion: companionLevel(counts, { natureBond: state.natureBond, animalDomain: cid => (state.domains[cid] || [])
      .some(id => { const d = data.domainsById.get(id); return d && domainGrants(d, data.domainsById).powers.some(p => p.name === 'Animal Companion'); }) }),
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

// Alternate racial traits (Race card): a tick box for each, what it replaces, and its text. One that replaces a
// trait another chosen alternate already replaces can't be ticked. Redrawn only when the race or the choices change,
// keeping the list open or closed as it was.
function renderAlternates(baseRace) {
  const box = $('race-alternates');
  const alts = baseRace.alternate_traits || [];
  const key = `${baseRace.id}|${state.alternates.join('|')}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!alts.length) {
    box.innerHTML = '';
    return;
  }
  const wasOpen = box.querySelector('details')?.open || false;
  box.innerHTML = `<details${wasOpen ? ' open' : ''}><summary>Alternate racial traits
      <span class="count">${state.alternates.length ? `${state.alternates.length} taken` : `${alts.length} to choose from`}</span></summary>
    <p class="hint">Each one replaces the standard traits it names. Two that replace the same trait can't both be taken.</p>
    <ul class="alt-list">${alts.map(a => {
      const taken = state.alternates.includes(a.name);
      const conflict = taken ? '' : alternateConflict(baseRace, a, state.alternates);
      const replaces = replacedTraits(baseRace, a);
      return `<li class="${taken ? 'taken' : ''}"><label class="check-row"><input type="checkbox" data-alternate="${esc(a.name)}"
          ${taken ? 'checked' : ''}${conflict ? ' disabled' : ''}> <b>${esc(a.name)}</b>
          <small class="muted">${replaces.length ? `replaces ${esc(replaces.join(', '))}` : 'see text for what it replaces'}</small>
          <button type="button" class="skill-details" data-alt-pop="${esc(a.name)}" aria-label="${esc(a.name)} in a popup">Details</button></label>
        ${conflict ? `<p class="hint">Not available: ${esc(conflict)}.</p>` : ''}
        <p class="alt-text">${esc(a.text)}</p></li>`;
    }).join('')}</ul></details>`;
}

// Favored class bonuses: how many levels went to each choice, the race's option for the favored class (with its
// total when the text starts with a number), and buttons to set every level at once.
function renderFavoredSummary(view) {
  const picks = view.favoredPicks.filter(Boolean);
  const fav = view.classes.find(c => c.id === view.favoredClassId);
  const option = favoredOption(view.race, fav);
  const n = k => picks.filter(p => p === k).length;
  const parts = [n('hp') && `+${n('hp')} hit point${n('hp') === 1 ? '' : 's'}`,
                 n('skill') && `+${n('skill')} skill rank${n('skill') === 1 ? '' : 's'}`,
                 n('option') && `racial option ×${n('option')}${favoredOptionTotal(option, n('option')) ? ` (${favoredOptionTotal(option, n('option'))} in all)` : ''}`]
    .filter(Boolean);
  $('favored-summary').innerHTML = `<p><b>Favored class bonus</b> (one for each ${esc(fav.name)} level, chosen beside
      each level above): ${esc(parts.join(', ') || 'none')}.</p>
    ${option ? `<p class="hint"><b>${esc(view.race.name)} option for ${esc(fav.name)}:</b> ${esc(option.text)}</p>`
      : `<p class="hint">${esc(view.race.name)} has no favored class option for ${esc(fav.name)}.</p>`}
    <div class="slot-buttons"><span class="muted">Every level:</span>
      <button type="button" data-favored-all="hp">+1 hit point</button>
      <button type="button" data-favored-all="skill">+1 skill rank</button>
      ${option ? '<button type="button" data-favored-all="option">Racial option</button>' : ''}</div>`;
}

// The domains a class has, one line each for the printed sheet: powers (with the level they start at) and spells.
function domainLines(clsId) {
  if (clsId === 'druid' && state.natureBond !== 'domain') return ['Nature bond: animal companion'];
  return (state.domains[clsId] || []).map(id => data.domainsById.get(id)).filter(Boolean).map(d => {
    const g = domainGrants(d, data.domainsById);
    const powers = g.powers.map(p => p.level ? `${p.name} (${ordinal(p.level)})` : p.name).join(', ');
    const spells = clsId === 'inquisitor' ? '' : Object.entries(g.spells).sort((a, b) => a[0] - b[0]).map(([lv, n]) => `${lv}: ${n}`).join(', ');
    return `${d.name}${d.kind === 'inquisition' ? ' inquisition' : ' domain'}: ${powers}${spells ? `. Spells ${spells}` : ''}`;
  });
}

// Domains for a cleric, inquisitor or druid (inside its block on the Classes card): the druid's Nature Bond choice,
// the chosen domains with their powers (each in a fold-out, with the level it starts at) and domain spells, and a
// list to choose another. A subdomain shows its domain's powers and spells with its own swapped in.
function domainPicker(cls, level, openFeatures) {
  const rule = DOMAIN_CLASSES[cls.id];
  if (!rule) return '';
  const bond = rule.natureBond ? `<select data-nature-bond aria-label="Nature bond">
      <option value="companion"${state.natureBond !== 'domain' ? ' selected' : ''}>Animal companion</option>
      <option value="domain"${state.natureBond === 'domain' ? ' selected' : ''}>A domain</option></select>` : '';
  if (rule.natureBond && state.natureBond !== 'domain') {
    return `<div class="domains"><h4>Nature bond</h4>${bond}<p class="hint">An animal companion: choose it on the Animal companion card below.</p></div>`;
  }
  const chosen = (state.domains[cls.id] || []).map(id => data.domainsById.get(id)).filter(Boolean);
  const kindName = { domain: 'domain', subdomain: 'subdomain', druid: 'druid domain', inquisition: 'inquisition' };
  const taken = chosen.map(d => {
    const g = domainGrants(d, data.domainsById);
    const powers = g.powers.map((p, i) => {
      const key = `dom-${d.id}#${i}`;
      const later = p.level && p.level > level ? ` <small class="muted">(at ${ordinal(p.level)} level)</small>` : p.level ? ` <small class="muted">(${ordinal(p.level)} level)</small>` : '';
      return `<details class="arch-feature" data-key="${esc(key)}"${openFeatures.has(key) ? ' open' : ''}><summary>${esc(p.name)}${later}</summary>${paragraphs(p.text)}</details>`;
    }).join('');
    const spells = Object.entries(g.spells).sort((a, b) => a[0] - b[0]).map(([lv, n]) => `${ordinal(Number(lv))}: ${n}`).join(' · ');
    return `<li class="arch-taken"><div class="arch-head"><b>${esc(d.name)}</b> <small class="muted">${esc(kindName[d.kind])}${g.parent ? ` of ${esc(g.parent.name)}` : ''} · ${esc(d.source)}</small>
        <button type="button" class="skill-details" data-domain-pop="${esc(d.id)}" data-cls="${esc(cls.id)}">Details</button>
        <button type="button" data-domain-remove="${esc(d.id)}" data-cls="${esc(cls.id)}">Remove</button></div>
      ${d.description ? `<p class="hint">${esc(d.description)}</p>` : ''}${powers}
      ${spells && cls.id !== 'inquisitor' ? `<p class="small"><b>Domain spells</b> ${esc(spells)}</p>` : ''}</li>`;
  }).join('');
  const left = rule.count - chosen.length;
  const choices = domainChoices(cls.id, data.domains);
  const group = kind => choices.filter(d => d.kind === kind && !chosen.includes(d)).map(d => {
    const why = domainConflict(d, chosen);
    return `<option value="${esc(d.id)}"${why ? ' disabled' : ''}>${esc(d.name)}${d.kind === 'subdomain' ? ` (${esc((d.parents || []).map(p => data.domainsById.get(p)?.name || p).join(' or '))})` : ''}${why ? ` — ${esc(why)}` : ''}</option>`;
  }).join('');
  const groups = [['domain', 'Domains'], ['druid', 'Druid domains'], ['subdomain', 'Subdomains'], ['inquisition', 'Inquisitions']]
    .filter(([k]) => rule.kinds.includes(k)).map(([k, label]) => { const o = group(k); return o ? `<optgroup label="${label}">${o}</optgroup>` : ''; }).join('');
  const add = left > 0 ? `<select data-domain-add="${esc(cls.id)}" aria-label="Choose a domain"><option value="">Choose ${rule.count > 1 ? `a domain (${left} left)` : 'one'}…</option>${groups}</select>` : '';
  // Every domain this class can choose, with why one can't be taken now, each with a Details button.
  const kindLabel = { domain: 'domain', druid: 'druid domain', subdomain: 'subdomain', inquisition: 'inquisition' };
  const browse = `<details class="arch-feature arch-browse" data-key="dbrowse-${esc(cls.id)}"${openFeatures.has(`dbrowse-${cls.id}`) ? ' open' : ''}>
      <summary>Browse all ${choices.length} ${esc(rule.count > 1 || !rule.natureBond ? 'choices' : 'domains')}</summary>
      <ul class="pick-list">${choices.map(d => {
        const mine = chosen.includes(d);
        const why = mine ? 'taken' : left <= 0 ? 'no choice left' : domainConflict(d, chosen);
        return `<li class="with-details"><button type="button" data-domain-pop="${esc(d.id)}" data-cls="${esc(cls.id)}"${mine ? ' class="mine"' : ''}>${mine ? '<span class="status met">✓</span>' : ''}${esc(d.name)}
            <small>${esc(why || `${kindLabel[d.kind]}${d.kind === 'subdomain' ? ` of ${(d.parents || []).map(p => data.domainsById.get(p)?.name || p).join(' or ')}` : ''}`)}</small></button>
          <button type="button" class="skill-details" data-domain-pop="${esc(d.id)}" data-cls="${esc(cls.id)}" aria-label="${esc(d.name)} in a popup">Details</button></li>`;
      }).join('')}</ul></details>`;
  return `<div class="domains"><h4>${esc(rule.natureBond ? 'Nature bond' : rule.label)}</h4>${bond}
    ${taken ? `<ul class="arch-list">${taken}</ul>` : ''}${add}${browse}</div>`;
}

// A domain in a popup (Classes card): its description, the powers it grants (a subdomain's with its domain's, minus the
// one it replaces) with the level each starts at, its domain spells, and Choose / Remove.
function popDomain(id, clsId) {
  const d = data.domainsById.get(id);
  const rule = DOMAIN_CLASSES[clsId];
  const cls = view.classes.find(c => c.id === clsId);
  if (!d || !rule || !cls) return;
  const chosen = (state.domains[clsId] || []).map(x => data.domainsById.get(x)).filter(Boolean);
  const mine = chosen.includes(d);
  const left = rule.count - chosen.length;
  const why = mine ? '' : left <= 0 ? `you already have ${rule.count === 1 ? 'one' : rule.count}` : domainConflict(d, chosen);
  const g = domainGrants(d, data.domainsById);
  const level = view.counts.find(e => e.cls.id === clsId)?.level || 1;
  const powers = g.powers.map(p => `<li><b>${esc(p.name)}</b>${p.level ? ` <small class="muted">(${p.level > level ? 'at ' : ''}${esc(ordinal(p.level))} level)</small>` : ''}${paragraphs(p.text)}</li>`).join('');
  const spells = Object.entries(g.spells).sort((a, b) => a[0] - b[0]).map(([lv, n]) => `<li>${esc(ordinal(Number(lv)))}: ${esc(n)}</li>`).join('');
  const kind = { domain: 'Domain', druid: 'Druid domain', subdomain: 'Subdomain', inquisition: 'Inquisition' }[d.kind];
  const actions = mine
    ? [{ label: 'Remove it', run: () => update({ domains: { ...state.domains, [clsId]: (state.domains[clsId] || []).filter(x => x !== id) } }) }]
    : why ? [] : [{ label: `Choose ${d.name}`, primary: true, run: () => update({ domains: { ...state.domains, [clsId]: [...(state.domains[clsId] || []), id] } }) }];
  openDetail(`${d.name} (${cls.name})`, `<p class="hint">${esc(kind)}${g.parent ? ` of ${esc(g.parent.name)}` : ''} · ${esc(d.source)}</p>
    ${d.description ? paragraphs(d.description) : ''}
    ${d.kind === 'subdomain' && d.replaces ? `<p class="hint">Replaces the ${esc(d.replaces)} power of its domain, and some of its spells.</p>` : ''}
    ${why ? `<p class="warning">Can't choose it now: ${esc(why)}.</p>` : mine ? '<p class="hint">You have chosen it.</p>' : ''}
    <h3>Granted powers</h3><ul class="plain-list arch-pop-features">${powers || '<li class="hint">None listed.</li>'}</ul>
    ${spells && clsId !== 'inquisitor' ? `<h3>Domain spells</h3><ul class="plain-list">${spells}</ul>` : ''}
    ${clsId === 'inquisitor' ? '<p class="hint">Inquisitors get a domain\u2019s powers, not its domain spells.</p>' : ''}`, actions);
}

// An archetype in a popup (Classes card): what it's about, each feature with the level it comes at and what it
// replaces, whether it can be taken, and Take / Remove.
function popArchetype(id, clsId) {
  const a = data.archetypesById.get(id);
  const cls = view.classes.find(c => c.id === clsId);
  if (!a || !cls) return;
  const base = data.classes.find(c => c.id === clsId);
  const chosen = chosenArchetypes(clsId);
  const taken = chosen.includes(a);
  const raceName = data.races.find(r => r.id === state.race)?.name;
  const original = UNCHAINED_FROM[clsId] && data.classes.find(c => c.id === UNCHAINED_FROM[clsId]);
  const unfit = a.class !== clsId && original ? unchainedFit(original, base, a, chosen).why : '';
  const why = taken ? '' : a.race && a.race !== raceName ? `${a.race} only` : unfit || archetypeConflict(base, a, chosen);
  const list = v => (Array.isArray(v) ? v : String(v || '').replace(/^\[|\]$/g, '').split(/',\s*'|", "/).map(x => x.replace(/^['"]|['"]$/g, '')).filter(Boolean));
  const feats = a.features.map(f => `<li><b>${esc(f.name)}</b>${f.level ? ` <small class="muted">(${esc(ordinal(Number(f.level)))} level)</small>` : ''}
      ${list(f.replaces).length ? `<div class="hint">Replaces: ${esc(list(f.replaces).join(', '))}</div>` : ''}${paragraphs(f.text)}</li>`).join('');
  const actions = taken
    ? [{ label: 'Remove it', run: () => update({ archetypes: { ...state.archetypes, [clsId]: (state.archetypes[clsId] || []).filter(x => x !== id) } }) }]
    : why ? [] : [{ label: `Take ${a.name}`, primary: true, run: () => update({ archetypes: { ...state.archetypes, [clsId]: [...(state.archetypes[clsId] || []), id] } }) }];
  openDetail(`${a.name} (${cls.name})`, `<p class="hint">${esc(a.source)}${a.race ? ` · ${esc(a.race)} only` : ''}${a.class !== clsId && original ? ` · ${esc(original.name)} archetype` : ''}</p>
    ${a.description ? paragraphs(a.description) : ''}
    ${why ? `<p class="warning">Can't take it now: ${esc(why)}.</p>` : taken ? '<p class="hint">You have taken it.</p>' : ''}
    <h3>Features</h3><ul class="plain-list arch-pop-features">${feats}</ul>`, actions);
}

// Archetypes for one class (inside its block on the Classes card): the ones taken, with their features (each one's
// text in a fold-out), and a list to add another. Archetypes that clash with one already taken, or that belong to
// another race, can't be picked.
function archetypePicker(cls, level, openFeatures) {
  const base = data.classes.find(c => c.id === cls.id);
  const all = archetypesFor(cls.id, data.archetypes);
  if (!all.length) return '';
  const original = UNCHAINED_FROM[cls.id] && data.classes.find(c => c.id === UNCHAINED_FROM[cls.id]);
  // An original-class archetype on an unchained class: "Rogue archetype", and why it doesn't fit, if it doesn't.
  const from = a => (a.class !== cls.id ? ` · ${original.name} archetype` : '');
  const fit = a => (a.class !== cls.id ? unchainedFit(original, base, a, chosen) : { why: '', kiPowers: 0 });
  const cost = n => (n ? ` · trades ${n} ki power${n === 1 ? '' : 's'}` : '');
  const chosen = chosenArchetypes(cls.id);
  const raceName = data.races.find(r => r.id === state.race)?.name;
  const trades = original ? kiPowerTrades(original, base, chosen).trades : [];
  const taken = chosen.map(a => {
    const mine = trades.filter(t => t.archetype === a.name);
    const traded = mine.length ? `<p class="hint">Gives up the ki power${mine.length === 1 ? '' : 's'} gained at ${mine.map(t => ordinal(t.level)).join(', ')} level for ${esc(mine.map(t => t.feature).join(', '))}, which the ${esc(cls.name)} doesn't have.</p>` : '';
    const feats = a.features.map((f, i) => {
      const key = `${a.id}#${i}`;
      return `<details class="arch-feature" data-key="${esc(key)}"${openFeatures.has(key) ? ' open' : ''}>
        <summary>${esc(f.name)}</summary>${paragraphs(f.text)}</details>`;
    }).join('');
    return `<li class="arch-taken"><div class="arch-head"><b>${esc(a.name)}</b> <small class="muted">${esc(a.source)}${esc(from(a))}${a.race ? ` · ${esc(a.race)} only` : ''}</small>
        <button type="button" class="skill-details" data-arch-pop="${esc(a.id)}" data-cls="${esc(cls.id)}">Details</button>
        <button type="button" data-archetype-remove="${esc(a.id)}" data-cls="${esc(cls.id)}">Remove</button></div>${traded}
      ${a.description ? `<details class="arch-feature" data-key="${esc(a.id)}#d"${openFeatures.has(`${a.id}#d`) ? ' open' : ''}><summary>About</summary>${paragraphs(a.description)}</details>` : ''}
      ${feats}</li>`;
  }).join('');
  const options = all.filter(a => !chosen.includes(a)).map(a => {
    const { why: unfit, kiPowers } = fit(a);
    const why = a.race && a.race !== raceName ? `${a.race} only` : unfit || archetypeConflict(base, a, chosen);
    const label = `${a.name}${a.race ? ` (${a.race})` : ''}${from(a) ? ` (${original.name})` : ''}${why ? ` — ${why}` : cost(kiPowers)}`;
    return `<option value="${esc(a.id)}"${why ? ' disabled' : ''}>${esc(label)}</option>`;
  }).join('');
  return `<div class="archetypes"><h4>Archetypes</h4>
    ${taken ? `<ul class="arch-list">${taken}</ul>` : '<p class="hint">None taken. An archetype swaps some class features for its own.</p>'}
    <select data-archetype-add="${esc(cls.id)}" aria-label="Add a ${esc(cls.name)} archetype">
      <option value="">Add a ${esc(cls.name)} archetype…</option>${options}</select>
    <details class="arch-feature arch-browse" data-key="browse-${esc(cls.id)}"${openFeatures.has(`browse-${cls.id}`) ? ' open' : ''}>
      <summary>Browse all ${all.length} ${esc(cls.name)} archetypes</summary>
      <ul class="pick-list">${all.map(a => {
        const { why: unfit } = fit(a);
        const why = chosen.includes(a) ? 'taken' : a.race && a.race !== raceName ? `${a.race} only` : unfit || archetypeConflict(base, a, chosen);
        return `<li class="with-details"><button type="button" data-arch-pop="${esc(a.id)}" data-cls="${esc(cls.id)}"${chosen.includes(a) ? ' class="mine"' : ''}>${chosen.includes(a) ? '<span class="status met">✓</span>' : ''}${esc(a.name)}
            <small>${esc(why || a.source)}</small></button>
          <button type="button" class="skill-details" data-arch-pop="${esc(a.id)}" data-cls="${esc(cls.id)}" aria-label="${esc(a.name)} in a popup">Details</button></li>`;
      }).join('')}</ul></details></div>`;
}

// The Classes card: a class for each level, favored class, where prestige spellcasting goes, and each
// class's features (and requirements, for prestige classes).
function renderClasses(view) {
  const { counts, classLevels } = view;
  $('class-summary').textContent = `${counts.map(e => `${e.cls.name} ${e.level}`).join(' / ')} (level ${classLevels.length})`;
  const baseOptions = groupedOptions(data.classes.filter(c => c.category !== 'prestige'), CLASS_GROUPS);
  const allOptions = groupedOptions(data.classes, CLASS_GROUPS);
  // One line per class (in the order first taken): how many levels and which character levels; opened, the choices
  // made at each of its levels (favored class bonus, feats, traits, ability increases) and buttons to add, remove or
  // change it.
  const openLines = new Set([...$('class-levels').querySelectorAll('details[data-class-line][open]')].map(d => d.dataset.classLine));
  const order = [...new Set(classLevels.map(c => c.id))];
  const ranges = nums => nums.reduce((out, n) => {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]);
    return out;
  }, []).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
  const traitNames = state.traits.slice(0, traitSlotCount(state.houseRules, state.drawback)).map(id => data.traitsById.get(id)?.name).filter(Boolean);
  const choicesAt = lv => {
    const out = [];
    for (const s of view.slots.filter(x => x.charLevel === lv)) {
      const f = data.featsById.get(state.feats[s.id]);
      const c = view.featChoices.find(x => x.slotId === s.id);
      const what = /^L\d+$/.test(s.id) ? 'Feat' : s.label.replace(/\s*\(level \d+\)$/, '');
      out.push(f ? `${what}: ${f.name}${c?.value ? ` (${choiceLabel(c)})` : ''}` : `${what}: not chosen yet`);
    }
    if (lv === 1) out.push(...(traitNames.length ? traitNames.map(t => `Trait: ${t}`) : ['Traits: not chosen yet']));
    const inc = INCREASE_LEVELS.indexOf(lv);
    if (inc >= 0) out.push(state.increases[inc] ? `Ability increase: +1 ${ABILITY_NAMES[state.increases[inc]]}` : 'Ability increase: not chosen yet');
    return out;
  };
  $('class-levels').innerHTML = order.map(id => {
    const levels = classLevels.map((c, i) => (c.id === id ? i : -1)).filter(i => i >= 0);
    const c = classLevels[levels[0]];
    const req = c.category === 'prestige' && view.requirements.get(c.id);
    const rows = levels.map((i, k) => `<li><b>Level ${i + 1}</b> <span class="muted">(${esc(c.name)} ${k + 1})</span>
        ${view.favoredPicks[i] ? `<label class="favored-pick">Favored class bonus <select data-favored-index="${i}" aria-label="Favored class bonus at level ${i + 1}">
          <option value="hp">+1 hit point</option><option value="skill">+1 skill rank</option>
          ${favoredOption(view.race, c) ? '<option value="option">Racial option</option>' : ''}</select></label>` : ''}
        ${choicesAt(i + 1).map(t => `<div class="level-choice">${esc(t)}</div>`).join('')}</li>`).join('');
    return `<li><details class="class-line" data-class-line="${esc(id)}"${openLines.has(id) ? ' open' : ''}>
      <summary><b>${esc(c.name)}</b> <span class="count">${levels.length} level${levels.length === 1 ? '' : 's'}</span>
        <small class="muted">(level${levels.length === 1 ? '' : 's'} ${ranges(levels.map(i => i + 1))})</small> ${req ? STATUS_ICON[req.status] : ''}</summary>
      <div class="class-line-body">
        <div class="slot-buttons">
          <button type="button" data-class-more="${esc(id)}"${classLevels.length >= 20 ? ' disabled' : ''}>+ Add a ${esc(c.name)} level</button>
          <button type="button" data-class-less="${esc(id)}"${classLevels.length <= 1 ? ' disabled' : ''}>− Remove a ${esc(c.name)} level</button>
          <label>Change to <select data-class-change="${esc(id)}">${levels.includes(0) ? baseOptions : allOptions}</select></label>
        </div>
        <ol class="level-choices">${rows}</ol>
      </div></details></li>`;
  }).join('');
  $('class-levels').querySelectorAll('select[data-class-change]').forEach(sel => { sel.value = sel.dataset.classChange; });
  $('class-levels').querySelectorAll('select[data-favored-index]').forEach(sel => {
    sel.value = view.favoredPicks[Number(sel.dataset.favoredIndex)];
  });
  const addSel = $('add-level-class');
  const keep = addSel.value || classLevels.at(-1).id;
  addSel.innerHTML = allOptions;
  addSel.value = keep;
  $('add-level').disabled = classLevels.length >= 20;
  $('remove-level').disabled = classLevels.length <= 1;

  const favoredChoices = view.classes.filter(c => c.category !== 'prestige');
  $('favored-class').innerHTML = favoredChoices.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('favored-class').value = view.favoredClassId;
  renderFavoredSummary(view);

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

  const open = new Set([...$('class-info').querySelectorAll('details.class-block[open]')].map(d => d.dataset.cls));
  classItems = [];
  const openFeatures = new Set([...$('class-info').querySelectorAll('details.arch-feature[open]')].map(d => d.dataset.key));
  $('class-info').innerHTML = counts.map(e => {
    // Each level: the class's own features (ones an archetype replaced struck out) and the archetypes' features.
    // Each entry is a button whose popup explains it: the class feature's rules text, what replaced it, or the
    // archetype feature's own text.
    const baseCls = data.classes.find(c => c.id === e.cls.id);
    const replacedBy = new Map();  // "level|entry" -> "Feature (Archetype)"
    for (const a of chosenArchetypes(e.cls.id)) {
      for (const f of a.features) {
        for (const x of replacedEntries(baseCls, { features: [f] })) replacedBy.set(`${x.level}|${x.name}`, `${f.name} (${a.name})`);
      }
    }
    const term = (label, title, text, cls = '') => {
      classItems.push({ title, text: String(text || '').split(/\n{2,}/).filter(Boolean) });
      return `<button type="button" class="term${cls}" data-term="${classItems.length - 1}" aria-expanded="false">${label}</button>`;
    };
    const described = s => featureDescription(e.cls, s) || 'The class data has no description for this entry.';
    const features = e.cls.progression.slice(0, e.level).map(r => {
      const own = (r.special || []).map(s => term(esc(s), s, described(s)));
      const gone = (r.replaced || []).map(s => {
        const ki = s.match(/^ki power \(traded for (.+)\)$/);
        const why = ki ? `Given up so an archetype can replace ${ki[1]}, which this class doesn't have.`
          : `Replaced by ${replacedBy.get(`${r.level}|${s}`) || 'an archetype'}.`;
        return term(`<s>${esc(s)}</s>`, `${s} (replaced)`, `${why}\n\n${ki ? '' : described(s)}`, ' term-gone');
      });
      const added = (r.archetype_features || []).map(f => term(esc(f.name), `${f.name} (${f.archetype})`, f.text, ' term-arch'));
      return `<li><b>${r.level}</b> <span class="terms">${[...own, ...gone, ...added].join('') || '—'}</span></li>`;
    }).join('');
    const req = view.requirements.get(e.cls.id);
    const reqHtml = req ? `<p>${STATUS_ICON[req.status]} Requirements ${STATUS_WORD[req.status]}</p>
      <ul class="prereqs">${req.parts.map(x => `<li>${STATUS_ICON[x.status]} ${esc(x.why)}</li>`).join('')}</ul>` : '';
    const isOpen = open.has(e.cls.id) || (req && req.status !== 'met');
    const names = e.cls.archetypes?.length ? ` · ${esc(e.cls.archetypes.join(', '))}` : '';
    return `<details class="class-block" data-cls="${esc(e.cls.id)}"${isOpen ? ' open' : ''}>
      <summary>${esc(e.cls.name)} ${e.level}${names} · hit die ${esc(e.cls.hit_die)} · ${e.cls.skill_ranks_per_level} + Int skill ranks per level</summary>
      ${reqHtml}
      ${domainPicker(e.cls, e.level, openFeatures)}
      ${archetypePicker(e.cls, e.level, openFeatures)}
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
  $('flexible2').value = state.flexible2;
  INCREASE_LEVELS.forEach((_, i) => { document.querySelector(`[data-increase="${i}"]`).value = state.increases[i]; });

  // Race info: each item opens a popup explaining it. Redrawn only when the race changes, so an open
  // popup isn't left pointing at a button that no longer exists.
  const raceKey = `${race.id}|${(race.alternates || []).join('|')}`;
  if ($('race-info').dataset.race !== raceKey) {
    raceItems = raceTerms(race);
    $('race-info').dataset.race = raceKey;
    $('race-info').innerHTML = `
      ${race.incomplete ? '<p class="warning">Some of this race\'s traits are missing from the source data.</p>' : ''}
      ${termButtons(raceItems)}`;
  }

  renderAlternates(data.races.find(r => r.id === state.race));
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
  $('flexible2-row').hidden = !race.dual_talent;
  const adj = racialAdjustments(race, view.flexibleChoice);
  for (const a of ABILITIES) {
    $(`base-${a}`).textContent = state.base[a];
    $(`base-${a}`).title = `Costs ${POINT_COSTS[state.base[a]]} points`;
    $(`race-${a}`).textContent = adj[a] ? signed(adj[a]) : '';
    $(`inc-${a}`).textContent = stats.increases[a] ? signed(stats.increases[a]) : '';
    $(`score-${a}`).textContent = stats.scores[a];
  }

  // Ability increases: only the levels reached so far are shown
  const reached = INCREASE_LEVELS.filter(lv => state.level >= lv).length;
  INCREASE_LEVELS.forEach((_, i) => { $(`increase-row-${i}`).hidden = i >= reached; });
  $('increases').hidden = reached === 0;
  const unchosen = state.increases.slice(0, reached).filter(a => !a).length;
  $('increase-note').textContent = unchosen ? `${unchosen} increase${unchosen > 1 ? 's' : ''} still to choose.` : '';

  // Results
  const worn = [view.gear.armor, view.gear.shield].filter(Boolean).map(a => a.name).join(' and ');
  // House rules: a Y/N button for each, and what the ones switched on do.
  $('house-rules').innerHTML = HOUSE_RULES.map(([key, label]) => {
    const on = !!state.houseRules[key];
    return `<button type="button" class="house-rule${on ? ' on' : ''}" data-house-rule="${key}" aria-pressed="${on}">${esc(label)}
      <span class="yn">${on ? 'Y' : 'N'}</span></button>`;
  }).join('');
  $('house-rules-note').textContent = HOUSE_RULES.filter(([k]) => state.houseRules[k]).map(([, , note]) => note).join(' ');
  setRollOptions({ maxHealing: !!state.houseRules.maxHealing });

  // Hit point tracker: current hit points (full unless damage has been applied) and what they mean at 0 or below.
  const hpNow = currentHp(state.hpCurrent, stats.hp);
  $('hp-current').textContent = hpNow;
  $('hp-max').textContent = `of ${stats.hp}`;
  const temp = state.tempHp.reduce((n, t) => n + t.amount, 0);
  $('hp-temp').textContent = temp ? `+ ${temp} temporary` : '';
  $('hp-temp').title = state.tempHp.map(t => `${t.name}: ${t.amount}`).join(', ');
  $('hp-status').textContent = hpStatus(hpNow, stats.scores.con);
  $('hp-current').classList.toggle('hurt', hpNow < stats.hp);
  const init = initiative(stats, view.haveFeats, view.traitFx.initiative);
  const cm = combatManeuvers(stats, view.size, view.haveFeats);
  const why = (key, what) => `<button type="button" class="skill-details" data-result-details="${key}" aria-label="How ${esc(what)} is worked out">Details</button>`;
  const results = [
    ['Maximum hit points', esc(stats.hp) + why('hp', 'maximum hit points')],
    ['Initiative', `${esc(signed(init))}${rollButton({ title: 'Initiative', check: 'Initiative', plain: true, groups: [{ attacks: [init] }] })}<button type="button" class="skill-details" data-init-details aria-label="What adds to initiative">Details</button>`],
    ['Base attack bonus', esc(formatBab(stats.bab)) + why('bab', 'base attack bonus')],
    ['Speed', esc(view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.`) + why('speed', 'speed')],
    ['Wearing', esc(worn || 'no armor') + why('worn', 'what you wear')],
    ...(view.load ? [['Load', `<span class="${view.load.load === 'light' ? '' : 'warning'}">${esc(loadText(view.load))}</span>${why('load', 'your load')}`]] : []),
  ];
  $('results').innerHTML = results.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // Armor Class and saving throws, in the Race card; each save has a Roll button.
  const rollRow = (name, value, spec, cls = 'defense-row') => `<div class="${cls}"><span>${esc(name)}</span><b>${esc(signed(value))}</b>
    ${rollButton(spec)}</div>`;
  const saveRow = (name, value) => rollRow(name, value, { title: `${name} save`, check: `${name} save`, groups: [{ attacks: [value] }] })
    .replace(/<\/div>$/, `<button type="button" class="skill-details" data-save-details="${name}" aria-label="What adds to ${name}">Details</button></div>`);
  // Ability checks: d20 + modifier, a Roll button beside each modifier.
  for (const a of ABILITIES) {
    // An ability check: the modifier plus active effects' bonus on ability checks (good hope...).
    const check = stats.mod[a] + stats.fx.checks + (view.flawFx.checks[a] || 0);
    $(`mod-${a}`).innerHTML = `${esc(signed(stats.mod[a]))}${rollButton({ title: `${ABILITY_NAMES[a]} check${stats.fx.checks ? ` (${signed(stats.fx.checks)} from effects)` : ''}`,
      check: ABILITY_NAMES[a], plain: true, groups: [{ attacks: [check] }] })}`;
  }
  $('race-defense').innerHTML = `
    <div class="defense-ac">
      <div><span>AC</span><b>${stats.ac}</b>
        <button type="button" class="skill-details" data-ac-details aria-label="What adds to AC, touch and flat-footed">Details</button></div>
      <div><span>Touch</span><b>${stats.touch}</b>
        <button type="button" class="skill-details" data-ac-details="touch" aria-label="What counts for touch AC">Details</button></div>
      <div><span>Flat-footed</span><b>${stats.flatFooted}</b>
        <button type="button" class="skill-details" data-ac-details="flat" aria-label="What counts for flat-footed AC">Details</button></div>
      <div class="cmd-box"><span>CMD</span><b>${cm.cmd}</b>
        <button type="button" class="skill-details" data-cmb-details aria-label="What adds to CMD">Details</button></div>
      <div class="cmb-box"><span>CMB</span><b>${esc(signed(cm.cmb))}</b>
        ${rollButton({ title: 'Combat maneuver check', check: 'CMB', groups: [{ attacks: [cm.cmb] }] })}
        <button type="button" class="skill-details" data-cmb-details aria-label="What adds to CMB and CMD">Details</button></div>
    </div>
    ${cm.maneuvers.length ? `<p class="hint">CMD against ${esc(cm.maneuvers.map(m => `${m.name.toLowerCase()} ${m.cmd}`).join(', '))}.</p>` : ''}
    ${saveRow('Fortitude', stats.fort)}${saveRow('Reflex', stats.ref)}${saveRow('Will', stats.will)}
    ${channelEnergy(stats, view.haveFeats).map(c => `<div class="defense-row channel-row">
      <span>Channel energy${c.source !== 'Cleric' ? ` (${esc(c.source)})` : ''}<small>${esc(c.energy)} · DC ${c.dc} Will half · ${c.uses}/day</small></span>
      <b>${esc(c.dice)}</b>${rollButton({ title: `Channel ${c.energy} energy`, groups: [{ attacks: [], damage: c.dice, word: 'heals or harms', heal: true }] })}</div>`).join('')}
    ${layOnHands(stats).map(l => {
      // Touch of corruption needs a melee touch attack: BAB + Str + size.
      const touch = stats.bab[0] + stats.mod.str + (SIZE_AC[view.size] ?? 0) + stats.fx.attack;
      const spec = l.heals ? { title: l.name, groups: [{ attacks: [], damage: l.dice, heal: true }] }
        : { title: l.name, check: 'Melee touch', groups: [{ attacks: [touch], damage: l.dice, threat: 20, mult: 2 }] };
      return `<div class="defense-row channel-row"><span>${esc(l.name)}<small>${l.heals ? 'heals (or harms undead)' : `melee touch ${esc(signed(touch))}`} · ${l.uses}/day</small></span>
        <b>${esc(l.dice)}</b>${rollButton(spec)}</div>`;
    }).join('')}
    ${smite(stats).map(sm => `<div class="defense-row channel-row"><span>${esc(sm.name)}<small>+${sm.attack} attack, +${sm.damage} damage
      (+${sm.firstHit} on the first hit against ${sm.name === 'Smite evil' ? 'evil outsiders, evil dragons and undead' : 'good outsiders, good dragons, and good clerics and paladins'}),
      +${sm.deflection} deflection to AC against the target · roll it on the Weapons tab</small></span><b>${sm.uses}/day</b></div>`).join('')}
    ${cm.maneuvers.map((m, i) => rollRow(`${m.name} (CMB)`, m.cmb, { title: `${m.name} check`, check: m.name, groups: [{ attacks: [m.cmb] }] },
      i === 0 ? 'defense-row first-cmb' : 'defense-row')).join('')}`;

  renderSkills(race, view.classes, stats.scores, [...view.chosen.map(f => f.name),
    ...view.featChoices.filter(c => c.kind === 'skill' && c.value).map(c => `${c.feat} (${c.value})`)]);
  renderFeats(view.slots, view.granted, view.ctx);
  renderTraits(app);
  renderEffects(app, view);
  renderCompanion(app, view);
  renderFlaws();
  renderDrawback();
  renderHeroPoints();
  renderSpells(view);
  renderArmorTab(app, view);
  if (tab === 'spells') renderSpellList(app, view);
  if (tab === 'equipment') renderEquipment(app, view);
  if (tab === 'magic-items') renderMyItems(app);
  if (tab === 'craft') renderCrafting(app, 'craft');
  if (tab === 'weapons') renderMyWeapons(app, view);
  if (tab === 'feats' && !$('feat-tab-results').hidden) renderFeatTabSearch();
}

// A Details popup's table: one row per thing that adds, then the total.
function detailsTable(lines, total, totalText = signed(total)) {
  const rows = lines.map(l => `<tr><td>${esc(l.label)}${l.note ? ` <small class="muted">(${esc(l.note)})</small>` : ''}</td>
    <td class="num">${esc(l.text ?? signed(l.value))}</td></tr>`).join('');
  return `<table class="skill-why"><tbody>${rows}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(totalText)}</b></td></tr></tfoot></table>`;
}

// Details popup for a saving throw (Race card).
function showSaveDetails(name) {
  const save = { Fortitude: 'fort', Reflex: 'ref', Will: 'will' }[name];
  const b = saveBreakdown({ save, counts: view.counts, mod: view.stats.mod, featNames: view.haveFeats, traits: view.traits,
    effects: activeBonuses(state.buffs, view.customAll).filter(x => x.target === save), effectTotal: view.stats.fx[save] });
  openDetail(`${name} save ${signed(view.stats[save])}`, detailsTable(b.lines, b.total)
    + (b.total !== view.stats[save] ? `<p class="warning">Something else changes this save: the total shown on the card is ${esc(signed(view.stats[save]))}.</p>` : ''));
}

// Details popup for AC, touch and flat-footed AC (Race card).
// column: 'touch' or 'flat' shows only what counts for touch or flat-footed AC (and what's left out); otherwise all three.
function showAcDetails(column = null) {
  const { stats, gear } = view;
  const armorName = gear.armor && [gear.armor.name, state.armorEnh ? `+${state.armorEnh}` : ''].filter(Boolean).join(' ');
  const shieldName = gear.shield && [gear.shield.name, state.shieldEnh ? `+${state.shieldEnh}` : ''].filter(Boolean).join(' ');
  const monk = view.counts.find(e => MONK_IDS.includes(e.cls.id));
  const b = acBreakdown(stats, { armor: armorName, shield: shieldName, race: view.race.name, monk: monk?.cls.name },
    activeBonuses(state.buffs, view.customAll).filter(x => x.target === 'ac'));
  const cell = v => (v === null ? '<td class="num muted">—</td>' : `<td class="num">${esc(signed(v))}</td>`);
  if (column) {
    const name = column === 'touch' ? 'Touch AC' : 'Flat-footed AC';
    const total = column === 'touch' ? b.totals.touch : b.totals.flat;
    const counted = b.rows.filter(r => r[column] !== null && (r[column] !== 0 || r.label === 'Base'));
    const left = b.rows.filter(r => r[column] === null && r.ac);
    openDetail(`${name} ${total}`, `<table class="skill-why"><tbody>${counted.map(r => `<tr><td>${esc(r.label)}${r.note ? ` <small class="muted">(${esc(r.note)})</small>` : ''}</td>
        <td class="num">${r.label === 'Base' ? '10' : esc(signed(r[column]))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total</b></td><td class="num"><b>${total}</b></td></tr></tfoot></table>
      ${left.length ? `<h3>Left out</h3><ul class="plain-list">${left.map(r => `<li>${esc(r.label)} (${esc(signed(r.ac))})</li>`).join('')}</ul>` : ''}
      <p class="hint">${column === 'touch' ? 'Touch attacks (rays, touch spells) ignore armor, shields and natural armor.'
        : 'Flat-footed (before you act in combat, or caught unaware), you lose your Dex bonus and dodge bonuses; a Dex penalty still counts.'}</p>`);
    return;
  }
  const rows = b.rows.map(r => `<tr><td>${esc(r.label)}${r.note ? ` <small class="muted">(${esc(r.note)})</small>` : ''}</td>
    ${r.label === 'Base' ? `<td class="num">10</td><td class="num">10</td><td class="num">10</td>` : cell(r.ac) + cell(r.touch) + cell(r.flat)}</tr>`).join('');
  openDetail(`Armor Class ${stats.ac}`, `<table class="skill-why"><thead><tr><th></th><th class="num">AC</th><th class="num">Touch</th>
      <th class="num">Flat-footed</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td><b>Total</b></td><td class="num"><b>${b.totals.ac}</b></td><td class="num"><b>${b.totals.touch}</b></td>
      <td class="num"><b>${b.totals.flat}</b></td></tr></tfoot></table>
    <p class="hint">Touch attacks ignore armor, shields and natural armor. Flat-footed, you lose your Dex bonus and dodge bonuses.</p>`);
}

// Details popup for CMB and CMD (Race card).
function showManeuverDetails() {
  const b = maneuverBreakdown(view.stats, view.size, view.haveFeats, activeBonuses(state.buffs, view.customAll));
  openDetail(`CMB ${signed(b.cmb)} · CMD ${b.cmd}`, `<h3>Combat Maneuver Bonus</h3>${detailsTable(b.cmbRows, b.cmb)}
    <h3>Combat Maneuver Defense</h3>${detailsTable(b.cmdRows, b.cmd, String(b.cmd))}`);
}

// Details popups for the Results card: maximum hit points, base attack bonus, speed, what's worn, and load.
function showResultDetails(key) {
  const { stats, gear } = view;
  const table = (rows, total) => `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(total)}</b></td></tr></tfoot></table>`;
  if (key === 'speed') { showArmorWhy(app, 'speed'); return; }
  if (key === 'hp') {
    // 1st level: the full hit die; later levels: the die's average (half + 1); Con at every level (at least 1 a level).
    const levels = view.classLevels;
    const con = stats.mod.con;
    const rows = [{ label: `${levels[0].name} at 1st level: full hit die (${levels[0].hit_die})`, text: String(hitDieSize(levels[0])) }];
    for (const e of classCounts(levels.slice(1))) {
      rows.push({ label: `${e.cls.name} × ${e.level} more level${e.level === 1 ? '' : 's'}: average ${averageHpPerLevel(e.cls)} each (${e.cls.hit_die} ÷ 2 + 1)`,
                  text: String(averageHpPerLevel(e.cls) * e.level) });
    }
    const dice = levels.reduce((n, c, i) => n + (i === 0 ? hitDieSize(c) : averageHpPerLevel(c)), 0);
    const withCon = levels.reduce((n, c, i) => n + Math.max(1, (i === 0 ? hitDieSize(c) : averageHpPerLevel(c)) + con), 0);
    rows.push({ label: `Constitution modifier (${signed(con)}) × ${levels.length} level${levels.length === 1 ? '' : 's'}${withCon - dice !== con * levels.length ? ' (at least 1 hit point a level)' : ''}`,
                text: signed(withCon - dice) });
    const favoredHp = view.favoredPicks.filter(p => p === 'hp').length;
    if (favoredHp) rows.push({ label: `Favored class bonus: +1 hit point × ${favoredHp}`, text: `+${favoredHp}` });
    if (view.haveFeats.includes('Toughness')) rows.push({ label: 'Feat: Toughness', text: `+${Math.max(3, levels.length)}` });
    if (stats.fx.hp) rows.push({ label: 'Active effects on hit points', text: signed(stats.fx.hp) });
    const listed = withCon + favoredHp + (view.haveFeats.includes('Toughness') ? Math.max(3, levels.length) : 0) + stats.fx.hp;
    if (listed !== stats.hp) rows.push({ label: 'Other', text: signed(stats.hp - listed) });
    openDetail(`Maximum hit points ${stats.hp}`, table(rows, String(stats.hp))
      + '<p class="hint">Each level after 1st gives the average of its hit die, rounded up (half the die + 1, e.g. d8 = 5). Temporary hit points (Xtra-HP) are on top of this.</p>');
    return;
  }
  if (key === 'bab') {
    const rows = view.counts.map(e => ({ label: `${e.cls.name} ${e.level}`, text: signed(e.cls.progression[e.level - 1].bab[0]) }));
    openDetail(`Base attack bonus ${formatBab(stats.bab)}`, table(rows, signed(stats.bab[0]))
      + `<p class="hint">Each class adds its own table's base attack bonus. At +6, +11 and +16 you get another attack, 5 lower each time: ${esc(formatBab(stats.bab))}.</p>`);
    return;
  }
  if (key === 'worn') {
    const items = [[gear.armor, state.armorEnh, 'armor'], [gear.shield, state.shieldEnh, 'shield']].filter(([a]) => a);
    const rows = items.flatMap(([a, enh, k]) => [
      { label: `${a.name}${enh ? ` +${enh}` : ''}${state[`${k}Abilities`]?.length ? ` (${state[`${k}Abilities`].map(x => x.name).join(', ')})` : ''}`,
        text: `${k === 'shield' ? 'shield' : 'armor'} +${a.bonus + (enh || 0)}` },
    ]);
    openDetail('What you wear', rows.length ? `<table class="skill-why"><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody></table>
      <dl class="facts"><dt>Max Dex bonus</dt><dd>${gear.maxDex === null ? 'no limit' : esc(signed(gear.maxDex))}</dd>
        <dt>Armor check penalty</dt><dd>${gear.checkPenalty || 'none'}</dd><dt>Arcane spell failure</dt><dd>${gear.spellFailure}%</dd></dl>
      <p class="hint">Change it, and see the Details for each of these, on the Armor tab.</p>` : '<p>No armor or shield. Choose them on the Armor tab.</p>');
    return;
  }
  if (key === 'load' && view.load) {
    const l = view.load;
    openDetail(`Load: ${l.load}`, table([
      { label: `Carrying capacity for Strength ${stats.scores.str}${view.race.size !== 'Medium' ? ` (${view.race.size})` : ''}`,
        text: `light ≤ ${l.capacity.light}, medium ≤ ${l.capacity.medium}, heavy ≤ ${l.capacity.heavy} lbs.` },
      { label: 'Weight carried (armor, weapons, gear and magic items; not coins)', text: `${l.weight} lbs.` },
      ...(l.load === 'light' ? [] : [{ label: 'A medium or heavy load caps your Dex bonus and adds a check penalty (the worse of armor and load counts)',
        text: `Dex at most ${signed(l.maxDex)}, ${l.checkPenalty}` }, { label: 'It also slows you like medium or heavy armor', text: `${view.speed ?? '—'} ft.` }]),
    ], l.load) + '<p class="hint">The Equipment tab\'s Weight carried Details lists every item.</p>');
  }
}

// The Xtra-HP popup: every way to have hit points above the maximum. Spirit Boost is a switch (healing past the
// maximum becomes temporary hit points); the others add temporary hit points (roll or type the amount).
function showExtraHp() {
  const oracle = view.counts.find(e => e.cls.id === 'oracle');
  const level = state.spiritBoost || oracle?.level || view.level;
  const temps = state.tempHp.length ? `<table class="skill-why"><tbody>${state.tempHp.map(t => `<tr><td>${esc(t.name)}</td>
      <td class="num">${t.amount}</td><td><button type="button" class="link" data-temp-remove="${esc(t.id)}">remove</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Temporary hit points</b></td><td class="num"><b>${state.tempHp.reduce((n, t) => n + t.amount, 0)}</b></td>
      <td><button type="button" class="link" data-temp-clear>clear all</button></td></tr></tfoot></table>`
    : '<p class="hint">None right now.</p>';
  const rows = TEMP_HP_SOURCES.map(s => `<li data-temp-source="${s.id}">
      <div><b>${esc(s.name)}</b> <small class="muted">${esc(s.kind)}</small></div>
      <p class="hint">${esc(s.text)}</p>
      <div class="xtra-row">
        ${s.id === 'custom' ? '<input type="text" data-temp-name placeholder="Source" aria-label="Source of the temporary hit points">' : ''}
        ${s.usesCl ? `<label>Caster level <input type="number" min="1" max="20" value="${view.level}" data-temp-cl></label>` : ''}
        <input type="number" min="0" data-temp-amount placeholder="Amount" aria-label="Temporary hit points from ${esc(s.name)}"
          value="${s.formula && !/d/.test(s.formula(view.level, view.level)) ? s.formula(view.level, view.level) : ''}">
        ${s.formula ? `<button type="button" data-temp-roll>${/d/.test(s.formula(1, 1)) ? '🎲 Roll' : 'Work out'}</button>` : ''}
        <button type="button" class="primary" data-temp-add>Add</button>
      </div></li>`).join('');
  openDetail('Extra hit points', `<div class="xtra-hp">
    <h3>Now</h3>${temps}
    <p class="hint">Temporary hit points are lost first when you take damage, and healing doesn't restore them. From the same
      source they don't stack (the higher counts); from different sources they add up.</p>
    <h3>Spirit Boost (oracle, Life mystery)</h3>
    <label class="check-row"><input type="checkbox" data-spirit-on${state.spiritBoost ? ' checked' : ''}> Healing past my maximum becomes temporary hit points</label>
    <label class="xtra-row">Oracle's level (the most it can give) <input type="number" min="1" max="20" value="${level}" data-spirit-level></label>
    <p class="hint">When the oracle's healing spells heal a target past its maximum, the extra becomes temporary hit points (up to the
      oracle's level) for 1 round per oracle level. With it on, Apply on the Hit points card does this for you.</p>
    <h3>Temporary hit points</h3><ul class="xtra-list">${rows}</ul></div>`);
}

// The Skills tab's Details popup for one skill (set by renderSkills, which has what it needs).
let showSkillDetails = () => {};

function renderSkills(race, classes, scores, featNames) {
  // Class skills from the classes, plus any a chosen trait makes a class skill.
  const byClass = classSkillTest(classes);
  const isClassSkill = name => byClass(name) || view.traitFx.classSkills.has(name);
  const racial = racialSkillBonuses(race);
  const available = skillRanksAvailable({
    race, classLevels: view.classLevels, favoredClassId: view.favoredClassId, baseScores: state.base,
    flexibleChoice: view.flexibleChoice, increases: state.increases, favoredPicks: view.favoredPicks,
  });
  const names = skillRowNames();
  const used = names.reduce((sum, n) => sum + (state.skills[n] || 0), 0);
  // The Skills tab's search shows only matching rows.
  const shownNames = skillFilter ? names.filter(n => n.toLowerCase().includes(skillFilter)) : names;
  $('skill-count').textContent = `${used} of ${available} ranks used`;
  $('skill-count').classList.toggle('over', used > available);

  const checkPenalty = view.gear.checkPenalty;
  $('skills-hint').innerHTML = esc(
    `At most ${state.level} rank${state.level === 1 ? '' : 's'} in each skill. Class skills get +3 once they have a rank.` +
    (checkPenalty ? ` Your armor's check penalty (${checkPenalty}) applies to Str and Dex skills.` : ''))
    + ' Details explains what a trained-only skill allows without ranks.';

  // Everything that adds to a skill, by name, in a popup.
  showSkillDetails = name => {
    const ranks = state.skills[name] || 0;
    const b = skillBreakdown({ name, ranks, scores, isClassSkill: isClassSkill(name), racialBonuses: racial, raceName: race.name,
      featNames, checkPenalty, traits: view.traits, effects: activeBonuses(state.buffs, view.customAll).filter(x => x.target === 'skills'),
      effectTotal: view.stats.fx.skills });
    if (flawSkill(name)) { b.lines.push({ label: 'Flaw (Feeble or Inattentive)', value: flawSkill(name) }); b.total += flawSkill(name); }
    const info = skillInfo(name);
    openDetail(`${name} ${signed(b.total)}`, `
      ${detailsTable(b.lines, b.total)}
      ${b.usable ? '' : '<p class="warning">Trained only: the Core Rulebook allows no use of this skill without at least 1 rank. The Roll button is there in case your group allows it.</p>'}
      ${b.limited ? `<p class="hint">${esc(b.limited)}</p>` : ''}
      ${info.acp && !checkPenalty ? '<p class="hint">Armor check penalties would apply to this skill.</p>' : ''}
      ${b.lines.length <= 2 && b.usable ? '<p class="hint">With no ranks, a skill uses just its ability modifier (and any bonuses).</p>' : ''}`);
  };
  const details = name => `<button type="button" class="skill-details" data-skill-details="${esc(name)}" aria-label="What adds to ${esc(name)}">Details</button>`;
  $('skill-rows').innerHTML = (shownNames.length ? '' : '<tr><td colspan="3" class="hint">No skill matches that search.</td></tr>') +
    shownNames.map(name => {
    const info = skillInfo(name);
    // Only Craft/Perform/Profession have player-added specialties; "Knowledge (arcana)" is a skill of its own.
    const specialty = info.family ? splitSkill(name).specialty : null;
    const classSkill = isClassSkill(name);
    const tags = [classSkill ? '<span class="tag">class</span>' : '', info.trained ? '<span class="tag muted">trained only</span>' : ''].join(' ');

    // A family row (plain "Craft") holds the box for adding specialties; ranks go on the specialties.
    if (info.family && !specialty) {
      const untrained = skillTotal({ name, ranks: 0, scores, isClassSkill: false, checkPenalty, effectBonus: view.stats.fx.skills + flawSkill(name) });
      return `<tr class="family" data-row-skill="${esc(name)}">
        <td><div class="skill-name">${esc(name)} ${tags}</div>
          ${name === 'Craft' ? `<div class="add-specialty"><select data-craft-pick aria-label="Add a Craft skill">
              <option value="">Add a craft…</option>${CRAFTS.filter(c => !state.specialties.includes(`Craft (${c})`))
                .map(c => `<option value="${esc(c)}">${esc(c[0].toUpperCase() + c.slice(1))}</option>`).join('')}</select></div>` : ''}
          <div class="add-specialty">
            <input type="text" data-specialty-for="${esc(name)}" placeholder="${name === 'Craft' ? 'Or type another craft' : `Add a specialty, e.g. ${name === 'Perform' ? 'sing' : 'sailor'}`}" aria-label="${esc(name)} specialty">
            <button type="button" data-add-specialty="${esc(name)}">Add</button>
          </div></td>
        <td></td>
        <td class="total">${signed(untrained.total)}${rollButton({ title: `${name} check (untrained)`, check: name, plain: true, groups: [{ attacks: [untrained.total] }] })}${details(name)}</td>
      </tr>`;
    }

    const ranks = state.skills[name] || 0;
    const t = skillTotal({ name, ranks, scores, isClassSkill: classSkill, racialBonuses: racial, featNames, checkPenalty,
                            traitBonuses: view.traitFx.skills, effectBonus: view.stats.fx.skills + flawSkill(name) });
    return `<tr${specialty ? ' class="specialty"' : ''} data-row-skill="${esc(name)}">
      <td><div class="skill-name">${esc(name)} ${tags}
          ${specialty ? `<button type="button" class="link" data-remove-specialty="${esc(name)}" aria-label="Remove ${esc(name)}">remove</button>` : ''}</div>
        ${ranks > state.level ? `<div class="warning">More than ${state.level} ranks</div>` : ''}</td>
      <td><span class="base">
        <button type="button" data-skill="${esc(name)}" data-skill-step="-1" aria-label="Fewer ranks in ${esc(name)}">−</button>
        <span class="value">${ranks}</span>
        <button type="button" data-skill="${esc(name)}" data-skill-step="1" aria-label="More ranks in ${esc(name)}">+</button>
      </span></td>
      <td class="total">${signed(t.total)}${rollButton({ title: `${name} check${t.usable ? '' : ' (untrained)'}`, check: name, plain: true, groups: [{ attacks: [t.total] }] })}${details(name)}</td>
    </tr>`;
  }).join('');
}

const STATUS_ICON = {
  met: '<span class="status met" title="Prerequisites met">✓</span>',
  unmet: '<span class="status unmet" title="Prerequisites not met">✗</span>',
  unknown: '<span class="status unknown" title="Some prerequisites can\'t be checked">?</span>',
};

// Prerequisites (each marked ✓/✗/?) and rules text for one feat.
// Details popup for a feat slot: where the slot comes from, the level the feat is checked at, each prerequisite, and
// what the app counts for the feat.
function showFeatSlotDetails(slotId) {
  const slot = view.slots.find(s => s.id === slotId);
  if (!slot) return;
  const f = data.featsById.get(state.feats[slot.id]);
  const why = slot.kind === 'class'
    ? `A ${slot.label.replace(/\s*\(level \d+\)$/, '')} from the ${view.classes.find(c => c.id === slot.clsId)?.name || 'class'} table.`
      + (BONUS_FEAT_RULES[slot.ruleId]?.note ? ` ${BONUS_FEAT_RULES[slot.ruleId].note}` : '')
    : slot.kind === 'race' ? `From your race's Bonus Feat trait (${view.race.name}).`
    : slot.id.startsWith('flaw-') ? 'From a flaw (Flaws house rule): any feat you qualify for.'
    : slot.id === 'antihero' ? 'For playing an antihero (no hero points): any feat you qualify for.'
    : `Every character gets a feat at 1st level and every odd level (3rd, 5th, 7th...). This is the one for character level ${slot.level}.`;
  let html = `<h3>This slot</h3><p>${esc(why)}</p>
    <p class="hint">Prerequisites are checked against your character at level ${slot.charLevel} (the level the feat is taken).</p>`;
  if (f) {
    const check = checkFeat(f, view.contextAt(slot.charLevel, slot.id), slot);
    const choice = view.featChoices.find(c => c.slotId === slot.id);
    const applied = featApplied(f.name, { level: view.level, choice: choice?.value ? choiceLabel(choice) : '', skillFeats: SKILL_FEATS });
    html += `<h3>Prerequisites for ${esc(f.name)}</h3>${check.waived ? '<p class="hint">Waived for this bonus feat.</p>'
      : check.parts.length ? `<ul class="prereqs">${check.parts.map(x => `<li>${STATUS_ICON[x.status]} ${esc(x.why)}</li>`).join('')}</ul>`
      : '<p class="hint">None.</p>'}
      ${check.parts.some(x => x.status === 'unknown') ? '<p class="hint">? = the app can\'t check this one; check it yourself.</p>' : ''}
      <h3>In the app</h3><p>${esc(applied || 'Not counted in the numbers automatically: read its Benefit and apply it in play (or add it as a custom effect on the Character tab).')}</p>`;
  } else {
    html += '<p class="hint">No feat chosen yet: press Choose a feat.</p>';
  }
  openDetail(f ? f.name : slot.label, html);
}

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

// Flaws card (Flaws house rule): two lines to type a flaw and its penalty; each named flaw adds a bonus feat slot.
// Hero points card (Action Points house rule), in the Race card under the hit points.
function renderHeroPoints() {
  const box = $('hero-points');
  box.hidden = !state.houseRules.actionPoints;
  if (box.hidden) return;
  const antihero = `<label class="check-row"><input type="checkbox" id="antihero"${state.antihero ? ' checked' : ''}>
    Antihero: no hero points, a bonus feat at 1st level instead (Feats tab)</label>`;
  if (state.antihero) {
    box.innerHTML = `<h3>Hero points</h3>${antihero}`;
    return;
  }
  const points = state.heroPoints ?? 1;
  const max = heroPointMax(view.haveFeats);
  box.innerHTML = `<h3>Hero points</h3>
    <div class="hero-count"><b>${points}</b><span class="muted">of ${max} at most</span>
      <span class="base"><button type="button" data-hero-add="-1" aria-label="One fewer hero point">−</button>
        <button type="button" data-hero-add="1" aria-label="One more hero point (awarded by the GM)">+</button></span></div>
    <p class="hint">Spend one (no action; at most 1 a round, cheating death takes 2). + is for points the GM awards; each
      level gained adds ${view.haveFeats.includes('Blood of Heroes') ? 2 : 1} by itself.</p>
    <div class="hero-uses">${HERO_POINT_USES.map(u => `<button type="button" data-hero-use="${u.id}" title="${esc(u.text)}"
      ${points < u.cost ? 'disabled' : ''}>${esc(u.label)}${u.cost > 1 ? ` (${u.cost})` : ''}</button>`).join('')}</div>
    <p id="hero-note" class="hero-note">${esc(heroNote)}</p>
    <details><summary>What each use does</summary><ul>${HERO_POINT_USES.map(u =>
      `<li><b>${esc(u.label)}${u.cost > 1 ? ` (${u.cost} points)` : ''}:</b> ${esc(u.text)}</li>`).join('')}</ul></details>
    ${antihero}`;
}

// Drawbacks card (Drawbacks house rule): pick one drawback from the list; its full text shows, and it adds a trait slot.
function renderDrawback() {
  $('drawback-card').hidden = !state.houseRules.drawbacks;
  if ($('drawback-card').hidden) return;
  const d = data.drawbacksById.get(state.drawback);
  const browseOpen = $('drawback-row').querySelector('details.flaw-browse')?.open || false;
  $('drawback-row').innerHTML = `<label>Drawback <select id="drawback-select"><option value="">— none —</option>
      ${data.drawbacks.map(x => `<option value="${esc(x.id)}"${x.id === state.drawback ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${d ? `<button type="button" class="skill-details" data-drawback-pop="${esc(d.id)}">Details</button>` : ''}
    <details class="flaw-browse"${browseOpen ? ' open' : ''}><summary>Browse all ${data.drawbacks.length} drawbacks</summary>
      <ul class="pick-list">${data.drawbacks.map(x => `<li class="with-details"><button type="button" data-drawback-pop="${esc(x.id)}"${x.id === state.drawback ? ' class="mine"' : ''}>${x.id === state.drawback ? '<span class="status met">✓</span>' : ''}${esc(x.name)}
          <small>${esc(x.source)}</small></button>
        <button type="button" class="skill-details" data-drawback-pop="${esc(x.id)}" aria-label="${esc(x.name)} in a popup">Details</button></li>`).join('')}</ul></details>
    ${d ? `<div class="flaw-details"><p class="hint">${esc(d.source)}</p>${paragraphs(d.text)}
      <p class="hint">It gives you an extra trait slot (in the Traits card above). Its penalty isn't counted automatically: most
        apply only in some situations, so apply it in play (or add a custom effect on the Character tab).</p></div>` : ''}`;
}

function renderFlaws() {
  $('flaws-card').hidden = !state.houseRules.flaws;
  if ($('flaws-card').hidden) return;
  const active = document.activeElement?.dataset?.flawField ? document.activeElement : null;
  if (active && active.tagName === 'INPUT' && $('flaw-rows').contains(active)) return;  // don't redraw while typing
  const otherIds = i => state.flaws.filter((f, j) => j !== i && f?.id && f.id !== 'other').map(f => f.id);
  $('flaw-rows').innerHTML = [0, 1].map(i => {
    const f = state.flaws[i] || { id: '', name: '', effect: '' };
    const known = flawById.get(f.id);
    const options = FLAWS.filter(x => !otherIds(i).includes(x.id)).map(x => `<option value="${x.id}"${f.id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const choice = known?.choice ? `<label>Ability <select data-flaw="${i}" data-flaw-field="choice">${ABILITIES.map(a =>
      `<option value="${a}"${f.choice === a ? ' selected' : ''}>${ABILITY_NAMES[a]}</option>`).join('')}</select></label>` : '';
    const details = known ? `<div class="flaw-details"><p><i>${esc(known.flavor)}</i></p><p><b>Effect:</b> ${esc(known.effect)}</p>
        ${known.special ? `<p><b>Special:</b> ${esc(known.special)}</p>` : ''}
        <p class="hint">${known.id === 'murky-eyed' ? 'Not counted automatically: roll the miss chance twice in play.' : 'Applied to your numbers and rolls.'}</p></div>`
      : f.id === 'other' ? `<label>Name <input type="text" data-flaw="${i}" data-flaw-field="name" maxlength="60" value="${esc(f.name)}" placeholder="Flaw name"></label>
        <label>Penalty <input type="text" data-flaw="${i}" data-flaw-field="effect" maxlength="200" value="${esc(f.effect)}" placeholder="e.g. -2 on Strength-based checks"></label>
        <p class="hint">A typed-in flaw's penalty isn't applied: add it as a custom effect on the Character tab.</p>` : '';
    return `<div class="flaw-row"><label>Flaw ${i + 1} <select data-flaw="${i}" data-flaw-field="id">
        <option value="">— none —</option>${options}<option value="other"${f.id === 'other' ? ' selected' : ''}>Other (type it in)</option></select></label>
      ${known ? `<button type="button" class="skill-details" data-flaw-pop="${known.id}" data-slot="${i}">Details</button>` : ''}
      ${choice}${details}</div>`;
  }).join('') + `<details class="flaw-browse"${$('flaw-rows').querySelector('details.flaw-browse')?.open ? ' open' : ''}><summary>Browse all ${FLAWS.length} flaws</summary>
      <ul class="pick-list">${FLAWS.map(x => {
        const mine = state.flaws.some(f => f?.id === x.id);
        return `<li class="with-details"><button type="button" data-flaw-pop="${x.id}"${mine ? ' class="mine"' : ''}>${mine ? '<span class="status met">✓</span>' : ''}${esc(x.name)}
            <small>${esc(x.effect.length > 60 ? `${x.effect.slice(0, 57)}…` : x.effect)}</small></button>
          <button type="button" class="skill-details" data-flaw-pop="${x.id}" aria-label="${esc(x.name)} in a popup">Details</button></li>`;
      }).join('')}</ul></details>`;
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
          <button type="button" class="skill-details" data-feat-details="${slot.id}" aria-label="About this feat slot and what the feat does here">Details</button>
        </div>`;
    } else {
      body = `<div class="slot-buttons"><button type="button" class="primary" data-choose="${slot.id}">Choose a feat</button>
        <button type="button" class="skill-details" data-feat-details="${slot.id}" aria-label="About this feat slot">Details</button></div>`;
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
        <small>${esc((f.types || []).join(', '))}</small>
        <button type="button" class="skill-details" data-feat-pop="${esc(f.id)}" aria-label="${esc(f.name)} in a popup">Details</button></summary>
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
  spellDayWhy.clear();
  $('spells-tables').innerHTML = tables.map(({ c, spells }) => spellTable(c, spells)).join('');
}

// Spells per day for one casting class (at its effective level, which prestige classes can raise).
// How each Spells per day row is worked out, by "class|spell level", for its Details popup.
const spellDayWhy = new Map();

function spellTable(c, spells) {
  const { cls } = c;
  const abilityName = ABILITY_NAMES[spells.ability];
  const raised = c.effectiveLevel !== c.classLevel
    ? ` Casts as a level ${c.effectiveLevel} ${cls.name.toLowerCase()} (${c.classLevel} ${cls.name.toLowerCase()} + ${c.effectiveLevel - c.classLevel} from prestige classes).` : '';
  const slot = EXTRA_SLOTS[cls.id];
  const extraBox = slot?.optional && cls.id !== 'druid' ? `<label class="check-row"><input type="checkbox" data-extra-slot="${esc(cls.id)}"
      ${extraSlotOn(cls.id) ? 'checked' : ''}> ${esc(slot.label)}</label>` : '';
  // Domain spells (clerics, and druids with a Nature Bond domain): one a day in the domain slot of each level.
  const doms = (cls.id === 'cleric' || (cls.id === 'druid' && state.natureBond === 'domain')) ? (state.domains[cls.id] || []) : [];
  const domainLine = doms.map(id => data.domainsById.get(id)).filter(Boolean).map(d => {
    const g = domainGrants(d, data.domainsById);
    return `<p class="hint"><b>${esc(d.name)} domain spells:</b> ${esc(Object.entries(g.spells).sort((a, b) => a[0] - b[0]).map(([lv, n]) => `${ordinal(Number(lv))} ${n}`).join(', '))}</p>`;
  }).join('');
  const head = `<h3 class="spell-class">${esc(cls.name)}</h3>
    <p class="hint">Casts with ${esc(abilityName)} (${spells.score}).${esc(raised)}</p>${extraBox}${domainLine}`;
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
    // The pieces of this row, for its Details popup.
    const key = `${cls.id}|${r.spellLevel}`;
    const mod = Math.floor((spells.score - 10) / 2);
    const tableLevel = c.effectiveLevel !== c.classLevel ? `level ${c.effectiveLevel} (${c.classLevel} ${cls.name.toLowerCase()} + ${c.effectiveLevel - c.classLevel} from prestige classes)` : `level ${c.classLevel}`;
    spellDayWhy.set(key, { title: `${cls.name}: ${ORDINALS[r.spellLevel]}-level spells`, rows: [
      { label: `${cls.name} table at ${tableLevel}`, text: r.base === null ? 'none (known only)' : String(r.base) },
      ...(r.spellLevel > 0 && r.base !== null ? [{ label: `Bonus spells from ${abilityName} ${spells.score} (modifier ${signed(mod)}): 1 if the modifier is at least the spell level, plus 1 for every 4 points above it`,
                                                 text: r.bonus ? `+${r.bonus}` : '+0' }] : []),
      ...(extraName && r.spellLevel > 0 && r.base !== null ? [{ label: `${extraName} slot (one ${extraName.toLowerCase()} spell a day)`, text: r.extra ? '+1' : '+0' }] : []),
      { label: `Needs ${abilityName} ${10 + r.spellLevel} to cast ${ORDINALS[r.spellLevel]}-level spells`, text: r.canCast ? `you have ${spells.score} ✓` : `you have ${spells.score} ✗` },
      ...(r.known !== null ? [{ label: 'Spells known (class table)', text: String(r.known) }] : []),
      ...(r.prepared !== null ? [{ label: 'Spells prepared each day', text: String(r.prepared) }] : []),
    ], total: r.spellLevel === 0 ? (r.base === null ? 'at will' : `${r.base} prepared, cast at will`) : r.canCast ? String(r.total ?? '—') : '0 (score too low)' });
    return `<tr${r.canCast ? '' : ' class="cannot"'}>
      <td>${ORDINALS[r.spellLevel]}</td>
      <td>${dash(r.base)}</td>
      <td>${r.bonus ? `+${r.bonus}` : ''}</td>
      ${extraName ? `<td>${r.extra ? `+${r.extra}` : ''}</td>` : ''}
      <td class="total">${total} <button type="button" class="skill-details" data-spellday="${esc(key)}" aria-label="How this is worked out">Details</button></td>
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
  } else if (type === 'archetype') {
    const a = data.archetypesById.get(id);
    // The class that takes it: the archetype's own, or the unchained version of it the character has.
    const target = state.classLevels.includes(a.class) ? a.class
      : Object.keys(UNCHAINED_FROM).find(u => UNCHAINED_FROM[u] === a.class && state.classLevels.includes(u)) || a.class;
    const cls = data.classes.find(c => c.id === a.class);
    const targetCls = data.classes.find(c => c.id === target);
    const has = state.classLevels.includes(target);
    const taken = (state.archetypes[target] || []).includes(id);
    const { why: unfit, kiPowers } = target !== a.class ? unchainedFit(cls, targetCls, a, chosenArchetypes(target)) : { why: '', kiPowers: 0 };
    const why = a.race && a.race !== data.races.find(r => r.id === state.race)?.name ? `${a.race} only`
      : unfit ? `it ${unfit}` : archetypeConflict(targetCls, a, chosenArchetypes(target));
    const feats = a.features.map(f => `<li><b>${esc(f.name)}</b> ${esc(f.text)}</li>`).join('');
    openDetail(a.name, `<p class="hint">${esc(cls.name)} archetype · ${esc(a.source)}${a.race ? ` · ${esc(a.race)} only` : ''}</p>
      ${paragraphs(a.description || '')}<ul class="plain-list">${feats}</ul>
      ${!taken && has && why ? `<p class="warning">Can't be taken now: ${esc(why)}.</p>` : ''}
      ${!taken && has && !why && kiPowers ? `<p class="hint">Taking it gives up ${kiPowers} ki power${kiPowers === 1 ? '' : 's'} for the monk abilities it replaces that the ${esc(targetCls.name)} doesn't have.</p>` : ''}`,
    taken ? [{ label: 'Go to Classes', primary: true, run: () => showTab('character') }]
      : has ? (why ? [] : [{ label: `Take ${a.name}`, primary: true, run: () => {
        update({ archetypes: { ...state.archetypes, [target]: [...(state.archetypes[target] || []), id] } });
        showTab('character');
      } }])
      : [{ label: `Add a level of ${cls.name}`, primary: true, run: () => {
        if (state.classLevels.length < 20) update({ classLevels: [...state.classLevels, a.class] });
        showTab('character');
      } }]);
  } else if (type === 'trait') {
    const t = data.traitsById.get(id);
    // "Take this trait" puts it in the first empty trait slot (2, or 3 with the Extra Campaign Trait house rule).
    const count = traitSlotCount(state.houseRules, state.drawback);
    const taken = state.traits.slice(0, count).includes(id);
    const empty = Array.from({ length: count }, (_, i) => i).find(i => !state.traits[i]);
    const note = taken ? `<p class="hint">You have this trait.</p>`
      : empty === undefined ? `<p class="warning">All ${count} trait slots are full. Remove one on the Feats tab to take this one.</p>` : '';
    openDetail(t.name, `<p class="hint">${esc(t.category)} trait${t.requirement ? ` (${esc(t.requirement)})` : ''} · ${esc(t.source)}</p>
      ${paragraphs(t.text)}${note}`, [
      ...(!taken && empty !== undefined ? [{ label: 'Take this trait', primary: true, run: () => {
        const traits = [...state.traits];
        traits[empty] = id;
        update({ traits });
        showTab('feats');
      } }] : []),
      { label: 'Go to Feats (traits)', primary: taken || empty === undefined, run: () => showTab('feats') },
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
    popArmor(app, id);
  }
}

async function start() {
  try {
    [data.races, data.classes, data.feats, data.armor, data.traits, data.archetypes, data.domains, data.companions, data.drawbacks] = await Promise.all([
      fetch('data/races.json').then(r => r.json()),
      fetch('data/classes.json').then(r => r.json()),
      fetch('data/feats.json').then(r => r.json()),
      fetch('data/armor.json').then(r => r.json()),
      fetch('data/traits.json').then(r => r.json()),
      fetch('data/archetypes.json').then(r => r.json()),
      fetch('data/domains.json').then(r => r.json()),
      fetch('data/companions.json').then(r => r.json()),
      fetch('data/drawbacks.json').then(r => r.json()),
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
  data.traitsById = new Map(data.traits.map(t => [t.id, t]));
  data.archetypesById = new Map(data.archetypes.map(a => [a.id, a]));
  data.domainsById = new Map(data.domains.map(d => [d.id, d]));
  data.drawbacksById = new Map(data.drawbacks.map(d => [d.id, d]));
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

// The offline helper (sw.js): keeps a copy of the app and its data so it works with no internet once installed.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
