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

// [{ key, name, max, unit ('uses' | 'rounds' | 'points' | 'spells'), note, how, cls, feature, text }] for the character.
// how: how the total is worked out; cls + feature: the class feature whose rules text explains it (or text, for a chosen
// power). view: computeView's result (counts, stats, haveFeats, casting); extra: { spellTables: [{ cls, table }] for
// spontaneous casters, bladebound: bool }.
// powers: chosen powers with a daily limit (school, domain, bloodline, order... powers: see powerUses), { name, max, unit, text }.
export function dailyUses(view, { spellTables = [], bladebound = false, powers = [] } = {}) {
  const { counts, stats } = view;
  const mod = stats.mod;
  const out = [];
  const add = (name, max, unit = 'uses', note = '', more = {}) => { if (max > 0) out.push({ key: key(name), name, max, unit, note, ...more }); };
  const sg = n => (n < 0 ? `− ${-n}` : `+ ${n}`);
  // Where its rules text is: a class (the first of `ids` the character has) and the feature's name.
  const from = (ids, feature) => ({ cls: counts.find(e => ids.includes(e.cls.id))?.cls.id || '', feature });
  // Rounds a day: rage and bloodrage (4 + Con modifier + 2 a level after 1st), bardic performance and raging song
  // (4 + Cha modifier + 2 a level after 1st).
  const rage = levelOf(counts, ['barbarian', 'barbarian-unchained']);
  const rounds = (ab, n, lv) => `4 ${sg(n)} (${ab} modifier) + 2 for each level after 1st (${2 * (lv - 1)})`;
  if (rage) add('Rage', 4 + mod.con + 2 * (rage - 1), 'rounds', '', { how: rounds('Constitution', mod.con, rage), ...from(['barbarian', 'barbarian-unchained'], 'Rage') });
  const blood = levelOf(counts, ['bloodrager']);
  if (blood) add('Bloodrage', 4 + mod.con + 2 * (blood - 1), 'rounds', '', { how: rounds('Constitution', mod.con, blood), ...from(['bloodrager'], 'Bloodrage') });
  const bard = levelOf(counts, ['bard']);
  if (bard) add('Bardic performance', 4 + mod.cha + 2 * (bard - 1), 'rounds', '', { how: rounds('Charisma', mod.cha, bard), ...from(['bard'], 'Bardic Performance') });
  const skald = levelOf(counts, ['skald']);
  if (skald) add('Raging song', 4 + mod.cha + 2 * (skald - 1), 'rounds', '', { how: rounds('Charisma', mod.cha, skald), ...from(['skald'], 'Raging Song') });
  // Pools.
  const monk = levelOf(counts, ['monk']);
  const half = (lv, what, ab, n) => `half your ${what} level (${Math.floor(lv / 2)}) ${sg(n)} (${ab} modifier)`;
  if (monk >= 4) add('Ki pool', Math.floor(monk / 2) + mod.wis, 'points', '', { how: half(monk, 'monk', 'Wisdom', mod.wis), ...from(['monk'], 'Ki Pool') });
  const umonk = levelOf(counts, ['monk-unchained']);
  if (umonk >= 3) add('Ki pool', Math.floor(umonk / 2) + mod.wis, 'points', '', { how: half(umonk, 'monk', 'Wisdom', mod.wis), ...from(['monk-unchained'], 'Ki Pool') });
  const ninja = levelOf(counts, ['ninja']);
  if (ninja >= 2) add('Ki pool (ninja)', Math.floor(ninja / 2) + mod.cha, 'points', '', { how: half(ninja, 'ninja', 'Charisma', mod.cha), ...from(['ninja'], 'Ki Pool') });
  if (levelOf(counts, ['gunslinger'])) add('Grit', Math.max(1, mod.wis), 'points', 'regained by confirming a critical or a killing blow with a firearm',
    { how: 'your Wisdom modifier (at least 1)', ...from(['gunslinger'], 'Grit') });
  if (levelOf(counts, ['swashbuckler'])) add('Panache', Math.max(1, mod.cha), 'points', 'regained by a critical or a killing blow with a light or one-handed piercing weapon',
    { how: 'your Charisma modifier (at least 1)', ...from(['swashbuckler'], 'Panache') });
  const magus = levelOf(counts, ['magus']);
  if (magus) add('Arcane pool', Math.max(1, Math.floor(magus / (bladebound ? 3 : 2)) + mod.int), 'points', '',
    { how: `${bladebound ? 'a third' : 'half'} of your magus level (${Math.floor(magus / (bladebound ? 3 : 2))}) ${sg(mod.int)} (Intelligence modifier), at least 1${bladebound ? ' (bladebound)' : ''}`, ...from(['magus'], 'Arcane Pool') });
  const arcanist = levelOf(counts, ['arcanist']);
  if (arcanist) add('Arcane reservoir', 3 + arcanist, 'points', 'holds at most 3 + your arcanist level; starts the day at 3 + half your level',
    { how: `3 + your arcanist level (${arcanist})`, ...from(['arcanist'], 'Arcane Reservoir') });
  const inv = levelOf(counts, ['investigator']);
  if (inv) add('Inspiration', Math.max(1, Math.floor(inv / 2) + mod.int), 'uses', '', { how: `${half(inv, 'investigator', 'Intelligence', mod.int)}, at least 1`, ...from(['investigator'], 'Inspiration') });
  const alch = levelOf(counts, ['alchemist']);
  if (alch) add('Bombs', alch + mod.int, 'uses', '', { how: `your alchemist level (${alch}) ${sg(mod.int)} (Intelligence modifier)`, ...from(['alchemist'], 'Bomb') });
  const wp = levelOf(counts, ['warpriest']);
  if (wp) add('Blessings', 3 + Math.floor(wp / 2), 'uses', '', { how: `3 + half your warpriest level (${Math.floor(wp / 2)})`, ...from(['warpriest'], 'Blessings') });
  if (wp >= 2) add('Fervor', Math.floor(wp / 2) + mod.wis, 'uses', '', { how: half(wp, 'warpriest', 'Wisdom', mod.wis), ...from(['warpriest'], 'Fervor') });
  const psy = levelOf(counts, ['psychic']);
  if (psy) add('Phrenic pool', Math.floor(psy / 2) + Math.max(mod.wis, mod.cha), 'points', 'Wisdom or Charisma, by your discipline',
    { how: half(psy, 'psychic', 'Wisdom or Charisma', Math.max(mod.wis, mod.cha)), ...from(['psychic'], 'Phrenic Pool') });
  // Worked out by the rules elsewhere: channel energy, lay on hands / touch of corruption, smite.
  const classOf = name => counts.find(e => e.cls.name === name)?.cls.id || '';
  for (const c of channelEnergy(stats, view.haveFeats)) add(`Channel ${c.energy} energy${c.source !== 'Cleric' ? ` (${c.source})` : ''}`, c.uses, 'uses', '',
    { how: `${(stats.channelFrom || []).some(f => f.source === c.source) ? 1 : 3} ${sg(mod.cha)} (Charisma modifier), and more from feats such as Extra Channel`,
      cls: classOf(c.source) || from(['cleric', 'oracle', 'warpriest', 'paladin'], '').cls, feature: 'Channel Energy',
      text: (stats.channelFrom || []).find(f => f.source === c.source)?.text || '' });
  for (const l of layOnHands(stats)) add(l.name, l.uses, 'uses', '', { how: `half your level ${sg(mod.cha)} (Charisma modifier)`, ...from(['paladin', 'antipaladin'], l.name) });
  for (const s of smite(stats)) add(s.name, s.uses, 'uses', '', { how: 'once a day, and one more at 4th level and every 3 levels after', ...from(['paladin', 'antipaladin'], s.name) });
  // Every other "N/day" entry on a class table (challenge, judgment, wild shape, knockout...): the latest one reached.
  for (const e of counts) {
    const latest = new Map();
    for (const row of e.cls.progression.slice(0, e.level)) {
      for (const s of row.special || []) {
        const p = perDay(s);
        if (p && !COMPUTED.has(lower(p[0]))) latest.set(lower(p[0]), [p[0][0].toUpperCase() + p[0].slice(1), p[1]]);
      }
    }
    for (const [name, n] of latest.values()) add(`${name}${counts.length > 1 ? ` (${e.cls.name})` : ''}`, n, 'uses', '', { how: `${n}/day at ${e.cls.name} level ${e.level} (the class table)`, cls: e.cls.id, feature: name });
  }
  // Chosen powers (school, domain, bloodline...).
  for (const p of powers) add(p.name, p.max, p.unit || 'uses', p.note || '', { how: p.how || '', text: p.text || '' });
  // Spontaneous casters: spells a day of each level.
  for (const { cls, table } of spellTables) {
    for (const r of table.rows) if (r.spellLevel >= 1 && r.canCast && r.total) add(`${cls.name} ${ordinal(r.spellLevel)}-level spells`, r.total, 'spells', '',
      { how: `spells per day from the ${cls.name.toLowerCase()} table, plus bonus spells for a high casting ability`, cls: cls.id, feature: 'Spells' });
  }
  // One entry per key (two classes giving the same pool).
  return [...new Map(out.map(x => [x.key, x])).values()];
}
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// A power's uses a day from its rules text, at a class level with the ability modifiers: { max, unit } or null when the
// text gives no daily limit. The wordings: "a number of times per day equal to 3 + your Wisdom modifier", "rounds per day
// equal to (1/2) your cleric level", "once per day at 8th level, and an additional time per day for every four levels
// beyond 8th", "At 17th level, you can use this ability twice per day", "once per day at 9th level, twice per day at 17th,
// and three times per day at 20th", "once per day, plus one additional time per day at 12th level and every 4 levels
// thereafter", "three times per day", "once per day".
const ABILITY_WORD = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const COUNT_WORD = { once: 1, twice: 2, 'three times': 3, 'four times': 4, 'five times': 5 };
const NUM_WORD = { two: 2, three: 3, four: 4, five: 5, six: 6 };
export function powerUses(text, level, mod = {}) {
  const t = String(text || '').replace(/\s+/g, ' ');
  // "a number of <unit> per day equal to <amount>": the amount is added up from its parts (3 +, a class level or half
  // of it, an ability modifier or bonus, "3 times your level", "plus 1 round for every inquisitor level above 4th").
  const eq = t.match(/(?:number|total number) of (times|rounds|minutes|bolts[a-z ]*?|uses)(?: of this effect)? per day (?:is )?equal to ([^.;]*)/i)
    || t.match(/(times|rounds|minutes) per day equal to ([^.;]*)/i);
  if (eq) {
    const expr = eq[2];
    let n = 0;
    if (/^(?:your |her |his )?3 \+|^3 \+/i.test(expr)) n += 3;
    const times = expr.match(/(\d+) times (?:your|her|his) [a-z]+ level/i);
    const lvl = expr.match(/(1\/2 )?(?:your|her|his) (?:[a-z]+ )?level/i);
    if (times) n += Number(times[1]) * level;
    else if (lvl && !/level above/.test(expr.slice(0, lvl.index + lvl[0].length + 6))) n += lvl[1] ? Math.floor(level / 2) : level;
    const ab = expr.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (?:modifier|bonus)/i);
    if (ab) n += mod[ABILITY_WORD[ab[1].toLowerCase()]] || 0;
    const above = expr.match(/plus 1 \w+ for every [a-z]+ level above (\d+)/i);
    if (above) n += Math.max(0, level - Number(above[1]));
    const unit = /rounds/i.test(eq[1]) ? 'rounds' : /minutes/i.test(eq[1]) ? 'minutes' : /bolt/i.test(eq[1]) ? 'bolts' : 'uses';
    return { max: Math.max(/minimum 1/i.test(t) ? 1 : 0, n), unit };
  }
  // "1 minute per day per cleric level", "10 feet per cleric level per day", "3 times your wizard level per day" (points).
  const perLevel = t.match(/(\d+) (minute|foot|feet) per day per [a-z]+ level/i) || t.match(/(\d+) (feet) per [a-z]+ level per day/i);
  if (perLevel) return { max: Number(perLevel[1]) * level, unit: /min/i.test(perLevel[2]) ? 'minutes' : 'feet' };
  const timesLevel = t.match(/equal to (\d+) times your [a-z]+ level per day/i);
  if (timesLevel) return { max: Number(timesLevel[1]) * level, unit: 'points' };
  const every = t.match(/once per day at (\d+)(?:st|nd|rd|th) level,? (?:and|plus) (?:an|one) additional time per day for every (\w+) (?:[a-z]+ )?levels?/i);
  if (every) {
    const from = Number(every[1]);
    const step = NUM_WORD[every[2].toLowerCase()] || Number(every[2]) || 4;
    return level >= from ? { max: 1 + Math.floor((level - from) / step), unit: 'uses' } : { max: 0 };
  }
  const plusAt = t.match(/once per day, plus one additional time per day at (\d+)(?:st|nd|rd|th) level and every (\d+) levels/i);
  if (plusAt) {
    const from = Number(plusAt[1]);
    return { max: 1 + (level >= from ? 1 + Math.floor((level - from) / Number(plusAt[2])) : 0), unit: 'uses' };
  }
  // Steps by level: "once per day at 9th level, twice per day at 17th..." and "At 17th level, you can use this ability twice per day".
  const steps = [...[...t.matchAll(/(once|twice|three times|four times) per day at (\d+)(?:st|nd|rd|th)/gi)].map(m => [m[1], m[2]]),
    ...[...t.matchAll(/At (\d+)(?:st|nd|rd|th) level,[^.]*?(once|twice|three times|four times) per day/gi)].map(m => [m[2], m[1]])]
    .map(([w, lv]) => [COUNT_WORD[w.toLowerCase()], Number(lv)]);
  const flat = t.match(/\b(once|twice|three times|four times|five times) per day(?! at)/i);
  const plain = flat ? COUNT_WORD[flat[1].toLowerCase()] : 0;
  if (steps.length) return { max: Math.max(plain, ...steps.filter(([, lv]) => level >= lv).map(([n]) => n), 0), unit: 'uses' };
  if (plain) return { max: plain, unit: 'uses' };
  return null;
}

// Uses left of an entry: its max less what's spent today (never below 0).
export const usesLeft = (entry, daily = {}) => Math.max(0, entry.max - Math.min(entry.max, daily[entry.key] || 0));
