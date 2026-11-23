// Character details (Build tab, Character card): gender, height and weight rolled on Paizo's Random Height & Weight
// table (data/heights.json), and the details saved by older versions. No page code here.

export const GENDERS = [['female', 'Female'], ['male', 'Male'], ['nonbinary', 'Nonbinary'], ['other', 'Other']];

// The table row for a race and gender: [{ race, gender, base_height, base_weight, dice, weight_multiplier }].
// gender 'male' or 'female'; a race with only one (changelings are female) uses that one.
export function heightRow(rows, raceId, gender) {
  const mine = (rows || []).filter(r => r.race === raceId);
  return mine.find(r => r.gender === gender) || (mine.length === 1 ? mine[0] : null);
}

// "2d4" -> { count: 2, sides: 4 }.
const parseDice = d => { const m = /^(\d+)d(\d+)$/.exec(d || ''); return m ? { count: Number(m[1]), sides: Number(m[2]) } : null; };

// Height and weight from one roll of the modifier dice: the roll in inches on the base height, and the same roll times
// the weight multiplier on the base weight. rng: () => [0, 1).
export function rollHeightWeight(row, rng = Math.random) {
  const d = parseDice(row.dice);
  const dice = Array.from({ length: d.count }, () => 1 + Math.floor(rng() * d.sides));
  const roll = dice.reduce((n, x) => n + x, 0);
  return { roll, dice, height: row.base_height + roll, weight: row.base_weight + roll * row.weight_multiplier };
}

// The heights and weights the table can give: { height: [min, max], weight: [min, max] }.
export function heightRange(row) {
  const d = parseDice(row.dice);
  return { height: [row.base_height + d.count, row.base_height + d.count * d.sides],
    weight: [row.base_weight + d.count * row.weight_multiplier, row.base_weight + d.count * d.sides * row.weight_multiplier] };
}

// 64 -> "5 ft. 4 in."
export const formatHeight = inches => `${Math.floor(inches / 12)} ft. ${inches % 12} in.`;

// A height typed in an older version ("5 ft. 4 in.", "5'4\"", "5 ft", "64 in") -> inches, or null.
export function parseHeight(text) {
  const t = String(text || '').toLowerCase();
  const ftIn = /(\d+)\s*(?:ft\.?|feet|foot|')\s*(?:(\d+)\s*(?:in\.?|inches|"|'')?)?/.exec(t);
  if (ftIn) return Number(ftIn[1]) * 12 + Number(ftIn[2] || 0);
  const inOnly = /^(\d+)\s*(?:in\.?|inches|")$/.exec(t.trim());
  return inOnly ? Number(inOnly[1]) : null;
}
// A weight typed in an older version ("150 lbs.") -> pounds, or null.
export function parseWeight(text) {
  const m = /(\d+)/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

// Random starting age (Paizo's Random Starting Ages table, data/ages.json): the race's adulthood plus the dice for the
// class's group. ages: { groups: { intuitive: [class ids], self_taught, trained }, races: [{ race, adulthood, intuitive,
// self_taught, trained }] }.
export const AGE_GROUPS = [['intuitive', 'Intuitive'], ['self_taught', 'Self-Taught'], ['trained', 'Trained']];
export const ageRow = (ages, raceId) => (ages?.races || []).find(r => r.race === raceId) || null;
// The group the table puts a class in (the unchained barbarian, monk, rogue and summoner as their originals), or null.
export function ageGroup(ages, classId) {
  const id = String(classId || '').replace(/-unchained$/, '');
  return AGE_GROUPS.map(([g]) => g).find(g => (ages?.groups?.[g] || []).includes(id)) || null;
}
// { dice: '2d6', rolls: [3, 5], age: 23 }.
export function rollAge(row, group, rng = Math.random) {
  const d = parseDice(row[group]);
  const rolls = Array.from({ length: d.count }, () => 1 + Math.floor(rng() * d.sides));
  return { dice: row[group], rolls, age: row.adulthood + rolls.reduce((n, x) => n + x, 0) };
}

// Hair and eye colours to pick from at random (no Paizo table: plain words).
export const HAIR = ['black', 'dark brown', 'brown', 'chestnut', 'auburn', 'red', 'copper', 'strawberry blond', 'blond',
  'golden', 'ash blond', 'platinum', 'white', 'silver', 'grey', 'salt and pepper', 'bald'];
export const EYES = ['brown', 'dark brown', 'hazel', 'amber', 'green', 'grey', 'blue', 'pale blue', 'violet', 'black',
  'golden', 'silver', 'one blue and one green'];
export const pickOne = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];
