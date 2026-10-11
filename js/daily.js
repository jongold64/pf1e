// Daily uses (Build tab): every limited ability a character has, with its uses a day, so the player can tick them off
// as they're spent and start a new day. state.daily = { key: uses spent }. No page code here.
import { channelEnergy, layOnHands, smite } from './rules.js';

const levelOf = (counts, ids) => Math.max(0, ...counts.filter(e => ids.includes(e.cls.id)).map(e => e.level));
const lower = s => String(s || '').toLowerCase();
const key = s => lower(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "smite evil 3/day" / "Wild shape (2/day)" -> ['smite evil', 3].
const perDay = s => { const m = String(s).match(/^(.*?)\s*\(?(\d+)\/day\)?\s*$/i); return m ? [m[1].trim(), Number(m[2])] : null; };
// Uses the rules work out elsewhere (rules.js), so their "N/day" table entries aren't listed twice.
const COMPUTED = new Set(['smite evil', 'smite good', 'channel energy', 'lay on hands', 'touch of corruption']);

// [{ key, name, max, unit ('uses' | 'rounds' | 'points' | 'spells'), note }] for the character. view: computeView's
// result (counts, stats, haveFeats, casting); extra: { spellTables: [{ cls, table }] for spontaneous casters,
// bladebound: bool }.
export function dailyUses(view, { spellTables = [], bladebound = false } = {}) {
  const { counts, stats } = view;
  const mod = stats.mod;
  const out = [];
  const add = (name, max, unit = 'uses', note = '') => { if (max > 0) out.push({ key: key(name), name, max, unit, note }); };
  // Rounds a day: rage and bloodrage (4 + Con modifier + 2 a level after 1st), bardic performance and raging song
  // (4 + Cha modifier + 2 a level after 1st).
  const rage = levelOf(counts, ['barbarian', 'barbarian-unchained']);
  if (rage) add('Rage', 4 + mod.con + 2 * (rage - 1), 'rounds');
  const blood = levelOf(counts, ['bloodrager']);
  if (blood) add('Bloodrage', 4 + mod.con + 2 * (blood - 1), 'rounds');
  const bard = levelOf(counts, ['bard']);
  if (bard) add('Bardic performance', 4 + mod.cha + 2 * (bard - 1), 'rounds');
  const skald = levelOf(counts, ['skald']);
  if (skald) add('Raging song', 4 + mod.cha + 2 * (skald - 1), 'rounds');
  // Pools.
  const monk = levelOf(counts, ['monk']);
  if (monk >= 4) add('Ki pool', Math.floor(monk / 2) + mod.wis, 'points');
  const umonk = levelOf(counts, ['monk-unchained']);
  if (umonk >= 3) add('Ki pool', Math.floor(umonk / 2) + mod.wis, 'points');
  const ninja = levelOf(counts, ['ninja']);
  if (ninja >= 2) add('Ki pool (ninja)', Math.floor(ninja / 2) + mod.cha, 'points');
  if (levelOf(counts, ['gunslinger'])) add('Grit', Math.max(1, mod.wis), 'points', 'regained by confirming a critical or a killing blow with a firearm');
  if (levelOf(counts, ['swashbuckler'])) add('Panache', Math.max(1, mod.cha), 'points', 'regained by a critical or a killing blow with a light or one-handed piercing weapon');
  const magus = levelOf(counts, ['magus']);
  if (magus) add('Arcane pool', Math.max(1, Math.floor(magus / (bladebound ? 3 : 2)) + mod.int), 'points');
  const arcanist = levelOf(counts, ['arcanist']);
  if (arcanist) add('Arcane reservoir', 3 + arcanist, 'points', 'holds at most 3 + your arcanist level; starts the day at 3 + half your level');
  const inv = levelOf(counts, ['investigator']);
  if (inv) add('Inspiration', Math.max(1, Math.floor(inv / 2) + mod.int), 'uses');
  const alch = levelOf(counts, ['alchemist']);
  if (alch) add('Bombs', alch + mod.int, 'uses');
  const wp = levelOf(counts, ['warpriest']);
  if (wp) add('Blessings', 3 + Math.floor(wp / 2), 'uses');
  if (wp >= 2) add('Fervor', Math.floor(wp / 2) + mod.wis, 'uses');
  const psy = levelOf(counts, ['psychic']);
  if (psy) add('Phrenic pool', Math.floor(psy / 2) + Math.max(mod.wis, mod.cha), 'points', 'Wisdom or Charisma, by your discipline');
  // Worked out by the rules elsewhere: channel energy, lay on hands / touch of corruption, smite.
  for (const c of channelEnergy(stats, view.haveFeats)) add(`Channel ${c.energy} energy${c.source !== 'Cleric' ? ` (${c.source})` : ''}`, c.uses);
  for (const l of layOnHands(stats)) add(l.name, l.uses);
  for (const s of smite(stats)) add(s.name, s.uses);
  // Every other "N/day" entry on a class table (challenge, judgment, wild shape, knockout...): the latest one reached.
  for (const e of counts) {
    const latest = new Map();
    for (const row of e.cls.progression.slice(0, e.level)) {
      for (const s of row.special || []) {
        const p = perDay(s);
        if (p && !COMPUTED.has(lower(p[0]))) latest.set(lower(p[0]), [p[0][0].toUpperCase() + p[0].slice(1), p[1]]);
      }
    }
    for (const [name, n] of latest.values()) add(`${name}${counts.length > 1 ? ` (${e.cls.name})` : ''}`, n);
  }
  // Spontaneous casters: spells a day of each level.
  for (const { cls, table } of spellTables) {
    for (const r of table.rows) if (r.spellLevel >= 1 && r.canCast && r.total) add(`${cls.name} ${ordinal(r.spellLevel)}-level spells`, r.total, 'spells');
  }
  // One entry per key (two classes giving the same pool).
  return [...new Map(out.map(x => [x.key, x])).values()];
}
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// Uses left of an entry: its max less what's spent today (never below 0).
export const usesLeft = (entry, daily = {}) => Math.max(0, entry.max - Math.min(entry.max, daily[entry.key] || 0));
