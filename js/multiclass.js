// Spellcasting across several classes: each casting class's own levels plus the "+1 level of existing
// spellcasting class" advances from prestige classes. No page code here, so it can be tested on its own.
import { CASTING_ABILITY, spellsPerDay } from './rules.js';

// Arcane and divine casters (Core Rulebook and later books). Alchemists and investigators make extracts,
// which only "+1 level of alchemist" advances (master chymist) raise.
export const ARCANE = new Set(['arcanist', 'bard', 'bloodrager', 'magus', 'skald', 'sorcerer', 'summoner', 'witch', 'wizard']);
export const DIVINE = new Set(['antipaladin', 'cleric', 'druid', 'hunter', 'inquisitor', 'oracle', 'paladin', 'ranger',
                               'shaman', 'warpriest']);
const EXTRACTS = new Set(['alchemist', 'investigator']);

export function tradition(clsId) {
  return ARCANE.has(clsId) ? 'arcane' : DIVINE.has(clsId) ? 'divine' : EXTRACTS.has(clsId) ? 'alchemist' : null;
}

// Which casting classes a prestige class's advance can go to ('arcane', 'divine', 'alchemist' or 'any').
export function advanceTargets(kind, counts) {
  return counts.filter(e => CASTING_ABILITY[e.cls.id] &&
    (kind === 'any' ? true : kind === 'alchemist' ? EXTRACTS.has(e.cls.id) : tradition(e.cls.id) === kind));
}

// The spellcasting "advance slots" a character has: one per prestige class and advance kind, e.g.
// mystic theurge -> arcane and divine. Each is { key, prestige, kind, levels } where `levels` counts how many
// of the prestige class's levels add a caster level.
export function advanceSlots(counts) {
  const out = [];
  for (const e of counts) {
    const kinds = new Map();
    for (const row of e.cls.progression.slice(0, e.level)) {
      (row.caster_advance || []).forEach((kind, i) => {
        const key = `${e.cls.id}:${i}`;
        kinds.set(key, { key, prestige: e.cls, kind, levels: (kinds.get(key)?.levels || 0) + 1 });
      });
    }
    out.push(...kinds.values());
  }
  return out;
}

// Each casting class with its own level and its effective level for spells per day and caster level.
// `choices` maps an advance slot key to the class id it raises; by default the first class that fits.
// Returns [{ cls, classLevel, effectiveLevel }] and the advance slots with the class each one went to.
export function castingClasses(counts, choices = {}) {
  const casting = counts.filter(e => CASTING_ABILITY[e.cls.id])
    .map(e => ({ cls: e.cls, classLevel: e.level, effectiveLevel: e.level }));
  const slots = advanceSlots(counts).map(slot => {
    const targets = advanceTargets(slot.kind, counts);
    const chosen = targets.find(t => t.cls.id === choices[slot.key]) || targets[0] || null;
    const target = chosen && casting.find(c => c.cls.id === chosen.cls.id);
    if (target) target.effectiveLevel = Math.min(20, target.effectiveLevel + slot.levels);
    return { ...slot, targets: targets.map(t => t.cls), target: target?.cls || null };
  });
  return { casting, slots };
}

// Caster level of a casting class at an effective level: classes whose spells start at 4th level
// (paladin, ranger, ...) cast at their level minus 3; 0 before they can cast at all.
export function casterLevelOf(cls, effectiveLevel) {
  const spells = spellsPerDay({ cls, level: effectiveLevel, scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  if (!spells || spells.rows.length === 0) return 0;
  return spells.firstLevel >= 4 ? effectiveLevel - 3 : effectiveLevel;
}
