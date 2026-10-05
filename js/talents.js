// Class choices made at set levels (rage powers, rogue talents, hexes, discoveries, magus arcana, revelations...):
// which classes get them, at which class levels, and which options fit a slot (data/talents.json). No page code here,
// so it can be tested on its own.
//
// Each rule: { key, label, kinds (data kinds allowed), levels (class levels with a pick), later: [{ from, kinds }]
// (more kinds allowed from a class level: advanced rogue talents at 10th...), needs: 'mystery' (oracle) }.
// The levels follow the Core Rulebook and later books' class tables.

const even = (from = 2) => Array.from({ length: (20 - from) / 2 + 1 }, (_, i) => from + i * 2);
const RAGE = { key: 'rage-power', label: 'Rage power', kinds: ['rage-power'], levels: even() };
const ROGUE = { key: 'rogue-talent', label: 'Rogue talent', kinds: ['rogue-talent'], levels: even(),
                later: [{ from: 10, kinds: ['advanced-rogue-talent'] }] };

export const TALENT_RULES = {
  barbarian: [RAGE],
  'barbarian-unchained': [RAGE],
  skald: [{ ...RAGE, levels: [3, 6, 9, 12, 15, 18] }],
  rogue: [ROGUE],
  'rogue-unchained': [ROGUE],
  ninja: [{ key: 'ninja-trick', label: 'Ninja trick', kinds: ['ninja-trick', 'rogue-talent'], levels: even(),
            later: [{ from: 10, kinds: ['master-ninja-trick', 'advanced-rogue-talent'] }] }],
  slayer: [{ key: 'slayer-talent', label: 'Slayer talent', kinds: ['slayer-talent', 'rogue-talent'], levels: even(),
             later: [{ from: 10, kinds: ['advanced-slayer-talent', 'advanced-rogue-talent'] }] }],
  witch: [{ key: 'hex', label: 'Hex', kinds: ['hex'], levels: [1, ...even()],
            later: [{ from: 10, kinds: ['major-hex'] }, { from: 18, kinds: ['grand-hex'] }] }],
  shaman: [{ key: 'hex', label: 'Hex', kinds: ['hex'], levels: [2, 4, 8, 10, 12, 16, 18, 20],
             later: [{ from: 10, kinds: ['major-hex'] }, { from: 18, kinds: ['grand-hex'] }] }],
  alchemist: [{ key: 'discovery', label: 'Discovery', kinds: ['discovery'], levels: even() }],
  investigator: [{ key: 'investigator-talent', label: 'Investigator talent', kinds: ['investigator-talent'], levels: [3, 5, 7, 9, 11, 13, 15, 17, 19] }],
  magus: [{ key: 'magus-arcana', label: 'Magus arcana', kinds: ['magus-arcana'], levels: [3, 6, 9, 12, 15, 18] }],
  oracle: [{ key: 'revelation', label: 'Revelation', kinds: ['revelation'], levels: [1, 3, 7, 11, 15, 19], needs: 'mystery' }],
  arcanist: [{ key: 'arcanist-exploit', label: 'Arcanist exploit', kinds: ['arcanist-exploit'], levels: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19],
               later: [{ from: 11, kinds: ['greater-arcanist-exploit'] }] }],
  vigilante: [{ key: 'vigilante-talent', label: 'Vigilante talent', kinds: ['vigilante-talent'], levels: even() },
              { key: 'social-talent', label: 'Social talent', kinds: ['social-talent'], levels: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19] }],
  kineticist: [{ key: 'infusion', label: 'Infusion', kinds: ['infusion'], levels: [1, 3, 5, 9, 11, 13, 17, 19] },
               { key: 'wild-talent', label: 'Utility wild talent', kinds: ['wild-talent'], levels: even() }],
  bard: [{ key: 'versatile-performance', label: 'Versatile performance', kinds: [], levels: [2, 6, 10, 14, 18], perform: true }],
};

// Bard's versatile performance (Core Rulebook): each Perform type and the two skills it can stand in for.
export const VERSATILE_PERFORMANCE = {
  Act: ['Bluff', 'Disguise'], Comedy: ['Bluff', 'Intimidate'], Dance: ['Acrobatics', 'Fly'], Keyboard: ['Diplomacy', 'Intimidate'],
  Oratory: ['Diplomacy', 'Sense Motive'], Percussion: ['Handle Animal', 'Intimidate'], Sing: ['Bluff', 'Sense Motive'],
  String: ['Bluff', 'Diplomacy'], Wind: ['Diplomacy', 'Handle Animal'],
};

// The pick slots a class has up to a class level: [{ id, rule, classLevel }] (ids like "barbarian|rage-power|4").
export function talentSlots(classId, classLevel) {
  return (TALENT_RULES[classId] || []).flatMap(rule => rule.levels.filter(l => l <= classLevel)
    .map(l => ({ id: `${classId}|${rule.key}|${l}`, rule, classLevel: l })));
}

// The data kinds allowed in a slot (more open up at later levels).
export function slotKinds(slot) {
  return [...slot.rule.kinds, ...(slot.rule.later || []).filter(x => slot.classLevel >= x.from).flatMap(x => x.kinds)];
}

// The options that fit a slot: the right kinds (a ninja may also take rogue talents, so the kind decides, not the class),
// the oracle's mystery for revelations, not above the slot's level, and not taken in another slot unless it can be
// taken more than once. Returns [{ talent, why }] where why is '' or the reason it can't be taken now.
export function talentOptions(slot, all, { taken = [], mystery = '' } = {}) {
  const kinds = slotKinds(slot);
  return all.filter(t => kinds.includes(t.kind) && (slot.rule.needs !== 'mystery' || !mystery || !t.mystery || t.mystery === mystery))
    .map(t => ({ talent: t,
                 why: taken.includes(t.id) && !t.repeatable ? 'already taken' : t.level && t.level > slot.classLevel ? `needs ${t.level}th level` : '' }));
}

// The mysteries revelations are listed under (for the oracle's choice).
export function mysteries(all) {
  return [...new Set(all.filter(t => t.kind === 'revelation' && t.mystery).map(t => t.mystery))].sort();
}
