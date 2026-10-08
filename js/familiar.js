// A familiar at its master's level (Core Rulebook, Familiars). No page code here, so it can be tested on its own.
//
// The familiar keeps its own size, speed, ability scores, attacks (with their damage) and special qualities. From its
// master it takes: hit points (half the master's), base attack bonus (the master's), base saves (the master's where
// better), skill ranks (the master's where better; Acrobatics, Climb, Fly, Perception, Stealth and Swim are class
// skills), and by the master's familiar class levels (wizard, witch, Arcane bloodline sorcerer: they stack) a natural
// armor bonus, a minimum Intelligence and special abilities. Hit Dice for effects: the master's level or its own.
import { abilityModifier } from './rules.js';
import { skillInfo, sizeSkillModifier } from './skills.js';

// Master class level -> natural armor adjustment, Intelligence, abilities gained at that level.
const TABLE = [
  [1, 1, 6, ['Alertness', 'Improved evasion', 'Share spells', 'Empathic link']], [3, 2, 7, ['Deliver touch spells']],
  [5, 3, 8, ['Speak with master']], [7, 4, 9, ['Speak with animals of its kind']], [9, 5, 10, []],
  [11, 6, 11, ['Spell resistance']], [13, 7, 12, ['Scry on familiar']], [15, 8, 13, []], [17, 9, 14, []], [19, 10, 15, []],
];
export const FAMILIAR_ABILITIES = {
  Alertness: 'While the familiar is within arm’s reach, the master gains the Alertness feat.',
  'Improved evasion': 'On a Reflex save against an effect that deals half damage on a save, no damage on a success and half on a failure.',
  'Share spells': 'The master may cast a spell with a target of "You" on the familiar (as a touch spell), and spells on himself also affect a familiar within 5 feet.',
  'Empathic link': 'The master and familiar share an empathic link out to 1 mile: general emotions, not sensory information.',
  'Deliver touch spells': 'The familiar can deliver touch spells the master casts, as long as they were in contact when the spell was cast.',
  'Speak with master': 'The familiar and its master can talk verbally as if using a common language; others can’t understand without magic.',
  'Speak with animals of its kind': 'The familiar can talk with animals of about the same kind (bats with bats, cats with felines...).',
  'Spell resistance': 'Spell resistance equal to the master’s level + 5.',
  'Scry on familiar': 'Once a day the master may scry on the familiar (as the scrying spell).',
};
const CLASS_SKILLS = new Set(['Acrobatics', 'Climb', 'Fly', 'Perception', 'Stealth', 'Swim']);
const SAVE_ABILITY = { fort: 'con', ref: 'dex', will: 'wis' };

// "+4 Climb, +4 Stealth" -> { Climb: 4, Stealth: 4 } (racial modifiers that aren't conditional).
function racialMods(text) {
  const out = {};
  for (const m of String(text || '').matchAll(/([+–-]\d+) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?=,|$)/g)) out[m[2]] = Number(m[1].replace('–', '-'));
  return out;
}

// The familiar's numbers. stats: its base statistics (familiars.json); master: { familiarLevel (wizard + witch + Arcane
// sorcerer levels), level (character level), hp, bab, baseSaves: { fort, ref, will }, skillRanks: { name: ranks } }.
export function familiarStats(stats, master) {
  const lv = Math.max(1, master.familiarLevel || 1);
  const row = [...TABLE].reverse().find(r => lv >= r[0]);
  const [, natAdj, intMin] = row;
  const abilities = TABLE.filter(r => lv >= r[0]).flatMap(r => r[3]);
  const scores = { ...stats.scores, int: Math.max(stats.scores.int ?? 0, intMin) };
  const mod = Object.fromEntries(Object.entries(scores).map(([a, v]) => [a, v === null || v === undefined ? 0 : abilityModifier(v)]));
  const baseMod = Object.fromEntries(Object.entries(stats.scores).map(([a, v]) => [a, v === null || v === undefined ? 0 : abilityModifier(v)]));
  const babShift = master.bab - (stats.bab || 0);

  // Saves: the familiar's base save (its total less its ability modifier) or the master's, whichever is better.
  const saves = {}, saveWhy = {};
  for (const s of ['fort', 'ref', 'will']) {
    const own = stats[s] - baseMod[SAVE_ABILITY[s]];
    const base = Math.max(own, master.baseSaves[s] || 0);
    saves[s] = base + mod[SAVE_ABILITY[s]];
    saveWhy[s] = [{ label: base === own ? 'Its own base save' : 'Master’s base save (better than its own)', value: base },
      { label: `${{ con: 'Constitution', dex: 'Dexterity', wis: 'Wisdom' }[SAVE_ABILITY[s]]} modifier`, value: mod[SAVE_ABILITY[s]] }];
  }
  // Attacks: as listed, moved up to the master's base attack bonus.
  const shift = text => String(text || '').replace(/([+–-]\d+)(?=\s*(?:\/[+–-]\d+)*\s*\()/g, m => {
    const n = Number(m.replace('–', '-')) + babShift;
    return n >= 0 ? `+${n}` : `${n}`;
  });
  // Skills: the listed total, or the master's ranks with the familiar's own modifiers, whichever is better.
  const racial = racialMods(stats.racial);
  const listed = new Map((stats.skills || []).map(([n, v]) => [n, v]));
  const names = new Set([...listed.keys(), ...Object.keys(master.skillRanks || {}).filter(n => master.skillRanks[n] > 0)]);
  const skills = [...names].sort().map(name => {
    const ranks = master.skillRanks?.[name] || 0;
    const info = (() => { try { return skillInfo(name); } catch { return null; } })();
    const withMaster = ranks && info ? ranks + mod[info.ability] + (CLASS_SKILLS.has(name.replace(/ \(.*/, '')) ? 3 : 0)
      + (racial[name] || 0) + sizeSkillModifier(name, stats.size) : null;
    const own = listed.has(name) ? listed.get(name) : null;
    const total = Math.max(own ?? -99, withMaster ?? -99);
    return { name, total, from: withMaster !== null && withMaster >= (own ?? -99) ? `master’s ${ranks} rank${ranks === 1 ? '' : 's'}` : 'its own' };
  }).filter(s => s.total > -99);
  return {
    hp: Math.max(1, Math.floor((master.hp || 0) / 2)), hd: Math.max(stats.hd || 1, master.level || 1),
    ac: (stats.ac ?? 10) + natAdj, touch: stats.touch ?? 10, flat: (stats.flat ?? 10) + natAdj, natAdj,
    bab: master.bab, cmb: stats.cmb === null || stats.cmb === undefined ? null : stats.cmb + babShift,
    cmd: stats.cmd === null || stats.cmd === undefined ? null : stats.cmd + babShift, saves, saveWhy, scores, mod,
    melee: shift(stats.melee), ranged: shift(stats.ranged),
    skills, abilities, sr: lv >= 11 ? lv + 5 : null, type: stats.type === 'animal' ? 'magical beast (augmented animal)' : stats.type,
    level: lv,
  };
}
