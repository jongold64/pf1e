// Custom spells (Spells tab, Custom button): spells the list doesn't have, made into spell records like the list's
// (data/spells.json), on the spell lists of the character's casting classes at the level chosen, so they can be added
// to My spells, prepared, and rolled like any other. No page code here.
//
// state.customSpells = [{ id ('cs-...'), name, level, school, castingTime, range, duration, attack ('none' | 'melee
//   touch' | 'ranged touch'), save ('none' | 'fort' | 'ref' | 'will'), saveEffect ('half' | 'negates' | 'partial'),
//   sr, dice ('none' | 'd4'...'d12'), scaling ('level' | 'two' | 'flat'), count, max, damageType, description }].

export const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation', 'universal'];
export const DIE_SIZES = ['d4', 'd6', 'd8', 'd10', 'd12'];
export const SCALINGS = [['level', 'per caster level'], ['two', 'per two caster levels'], ['flat', 'a set number']];
const SAVE_NAMES = { fort: 'Fortitude', ref: 'Reflex', will: 'Will' };

// The damage formula ("(min(5, @cl))d6", "(min(5, floor(@cl / 2)))d8", "3d6"), or null with no damage dice.
export function customSpellFormula(d) {
  if (!DIE_SIZES.includes(d.dice)) return null;
  if (d.scaling === 'flat') return `${Math.max(1, d.count || 1)}${d.dice}`;
  const max = Math.max(1, d.max || 5);
  return d.scaling === 'two' ? `(min(${max}, floor(@cl / 2)))${d.dice}` : `(min(${max}, @cl))${d.dice}`;
}

// The spell record. classIds: the casting classes whose lists it joins (at d.level).
export function customSpellRecord(d, classIds = []) {
  const formula = customSpellFormula(d);
  const saveText = d.save !== 'none' ? `${SAVE_NAMES[d.save]} ${d.saveEffect}` : 'none';
  const action = (d.attack !== 'none' || formula || d.save !== 'none') ? [{ name: 'Use', kind: d.attack !== 'none' ? d.attack : formula ? 'other' : 'save',
    ...(formula ? { damage: [{ formula, types: d.damageType ? [d.damageType] : [] }] } : {}),
    ...(d.save !== 'none' ? { save: d.save, save_text: saveText } : {}) }] : [];
  const dmgText = formula ? `${d.scaling === 'flat' ? `${d.count}${d.dice}` : `1${d.dice} ${d.scaling === 'two' ? 'per two caster levels' : 'per caster level'} (at most ${d.max}${d.dice})`}${d.damageType ? ` ${d.damageType}` : ''} damage` : '';
  return { id: d.id, name: d.name, source: 'Custom', school: d.school, subschool: null, descriptors: null,
    levels: Object.fromEntries(classIds.map(c => [c, d.level])), casting_time: d.castingTime, components: '', range: d.range,
    effects: [], duration: d.duration, saving_throw: saveText, spell_resistance: d.sr ? 'yes' : 'no',
    summary: [dmgText, d.description].filter(Boolean).join('. ').slice(0, 200) || 'A custom spell.',
    description: d.description || dmgText || 'A custom spell.', actions: action, origin: 'custom', custom: true };
}

// Saved definitions tidied (at most 40).
export function tidyCustomSpells(saved) {
  const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return (Array.isArray(saved) ? saved : []).filter(d => d && typeof d === 'object').slice(0, 40).map((d, i) => ({
    id: typeof d.id === 'string' && d.id.startsWith('cs-') ? d.id.slice(0, 40) : `cs-${i}`, name: String(d.name || 'Custom spell').slice(0, 60),
    level: int(d.level, 0, 9, 1), school: SCHOOLS.includes(d.school) ? d.school : 'evocation',
    castingTime: String(d.castingTime || '1 standard action').slice(0, 40), range: String(d.range || 'close (25 ft. + 5 ft./2 levels)').slice(0, 60),
    duration: String(d.duration || 'instantaneous').slice(0, 60), attack: ['none', 'melee touch', 'ranged touch'].includes(d.attack) ? d.attack : 'none',
    save: ['none', 'fort', 'ref', 'will'].includes(d.save) ? d.save : 'none', saveEffect: ['half', 'negates', 'partial'].includes(d.saveEffect) ? d.saveEffect : 'half',
    sr: d.sr !== false, dice: DIE_SIZES.includes(d.dice) ? d.dice : 'none', scaling: SCALINGS.some(([k]) => k === d.scaling) ? d.scaling : 'level',
    count: int(d.count, 1, 40, 1), max: int(d.max, 1, 40, 5), damageType: String(d.damageType || '').slice(0, 20), description: String(d.description || '').slice(0, 2000),
  }));
}
