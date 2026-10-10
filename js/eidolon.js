// The summoner's eidolon (core summoner and unchained summoner): its statistics at the summoner's level from the base
// statistics table (data/eidolons.json), its base form (class-paths.json "base-form"), the evolutions chosen with its
// evolution pool, and its ability score increases. No page code here, so it can be tested on its own.

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const mod = v => Math.floor((v - 10) / 2);
const SIZE_MOD = { Small: 1, Medium: 0, Large: -1, Huge: -2 };
// A natural attack's dice one size larger (Bestiary: 1d4 -> 1d6 -> 1d8 -> 2d6 -> 2d8...).
const STEP_UP = { '1d2': '1d3', '1d3': '1d4', '1d4': '1d6', '1d6': '1d8', '1d8': '2d6', '1d10': '2d8', '2d4': '2d6', '2d6': '3d6', '2d8': '3d8' };

// A base form's facts as values: { size, speed, natural, saves: { fort, ref, will: 'good' | 'bad' }, attacks, scores, free }.
export function baseForm(form) {
  const fact = name => (form?.facts || []).find(([k]) => k === name)?.[1] || '';
  const scores = Object.fromEntries(ABILITIES.map(a => [a, Number(fact('Ability Scores').match(new RegExp(`${a}\\s+(\\d+)`, 'i'))?.[1]) || 10]));
  const saves = Object.fromEntries(['fort', 'ref', 'will'].map(s => [s, new RegExp(`${s}\\w*\\s*\\(good\\)`, 'i').test(fact('Saves')) ? 'good' : 'bad']));
  // "2 claws (1d4)", "bite (1d6), tail slap (1d6)".
  const attacks = fact('Attack').split(/,\s*(?![^()]*\))/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(?:(\d+)\s+)?([a-z ]+?)\s*\(([^)]+)\)/i);
    return m ? { name: m[2].replace(/s$/, '').trim(), count: Number(m[1] || 1), dice: m[3], secondary: /tail slap|tentacle|wing|hoof|pincer/i.test(m[2]) } : null;
  }).filter(Boolean);
  return {
    size: fact('Size') || 'Medium', speed: fact('Speed') || '30 ft.', natural: Number(fact('AC').match(/\+(\d+)/)?.[1]) || 0,
    saves, attacks, scores, free: fact('Free Evolutions').split(/,\s*(?![^()]*\))/).map(s => s.trim()).filter(Boolean),
  };
}

// An attack evolution's natural attack: { name, count, dice by size, secondary } read from its text ("giving it two claw
// attacks... These attacks are primary attacks... deal 1d4 points of damage (1d6 if Large, 1d8 if Huge)").
export function evolutionAttack(evo) {
  const m = evo.text.match(/deals? (\d+d\d+) points? of damage \((\d+d\d+) if Large, (\d+d\d+) if Huge\)/i);
  if (!m || /grappling/.test(evo.text.slice(0, 200))) return null;
  const count = /\b(?:two|pair of)\b[^.]*attacks/i.test(evo.text.split('.').slice(0, 2).join('.')) ? 2 : 1;
  return { name: evo.name.toLowerCase().replace(/s$/, ''), count, dice: { Medium: m[1], Large: m[2], Huge: m[3] },
           secondary: /secondary attack/i.test(evo.text) };
}

// The eidolon's numbers. cls: 'summoner' | 'summoner-unchained'; level: summoner level; form: base form record;
// chosen: [{ id, choice }] evolutions (choice: an ability for ability increase, a skill for skilled); increases: abilities
// raised by the table's ability score increases (5th, 10th, 15th); table, evolutions: data/eidolons.json for the class.
export function eidolonStats({ level, form, chosen = [], increases = [], table = [], evolutions = [] }) {
  const row = table.find(r => r.level === Math.min(20, Math.max(1, level))) || table[0];
  const f = baseForm(form);
  const byId = new Map(evolutions.map(e => [e.id, e]));
  const taken = chosen.map(c => ({ ...c, evo: byId.get(c.id) })).filter(c => c.evo);
  const count = id => taken.filter(c => c.id === id).length;
  const large = count('large') > 0;
  const size = large ? 'Large' : f.size;
  // Ability scores: base form, the table's Str/Dex bonus, ability score increases (one point each), ability increase
  // evolutions (+2 each), and Large (+8 Str, +4 Con, -2 Dex).
  const scores = { ...f.scores };
  scores.str += row.strDex;
  scores.dex += row.strDex;
  const allowedIncreases = row.special ? table.filter(r => r.level <= row.level && r.special.some(s => /ability score increase/i.test(s))).length : 0;
  for (const a of increases.slice(0, allowedIncreases)) if (ABILITIES.includes(a)) scores[a] += 1;
  for (const c of taken.filter(x => x.id === 'ability-increase' && ABILITIES.includes(x.choice))) scores[c.choice] += 2;
  if (large) { scores.str += 8; scores.con += 4; scores.dex -= 2; }
  const m = Object.fromEntries(ABILITIES.map(a => [a, mod(scores[a])]));
  const sizeMod = SIZE_MOD[size] ?? 0;
  // Armor: the table's armor bonus (split between armor and natural armor as the summoner likes: counted as natural
  // armor here), the base form's natural armor, improved natural armor (+2 each) and Large (+2).
  const natural = row.armor + f.natural + 2 * count('improved-natural-armor') + (large ? 2 : 0);
  const ac = 10 + natural + m.dex + sizeMod;
  const saves = Object.fromEntries(['fort', 'ref', 'will'].map(s => [s, (f.saves[s] === 'good' ? row.good : row.bad) + m[{ fort: 'con', ref: 'dex', will: 'wis' }[s]]]));
  // Natural attacks: the base form's and the attack evolutions'. Primary: full Str (1 1/2 for a lone attack); secondary:
  // -5 (-2 with multiattack at 9th) and half Str.
  const attacks = [...f.attacks.map(a => ({ ...a, dice: { Medium: a.dice, Large: STEP_UP[a.dice] || a.dice, Huge: STEP_UP[STEP_UP[a.dice]] || a.dice } })),
    ...taken.map(c => evolutionAttack(c.evo)).filter(Boolean)];
  const totalAttacks = attacks.reduce((n, a) => n + a.count, 0);
  const multiattack = row.level >= 9;
  const lone = totalAttacks === 1;
  const atk = attacks.map(a => {
    const bonus = row.bab + m.str + sizeMod + (a.secondary ? (multiattack ? -2 : -5) : 0);
    const dmg = a.secondary ? Math.floor(m.str / 2) : lone ? Math.floor(m.str * 1.5) : m.str;
    const dice = a.dice[size] || a.dice.Medium;
    return { name: a.name, count: a.count, bonus, damage: `${dice}${dmg ? (dmg > 0 ? `+${dmg}` : dmg) : ''}`, secondary: a.secondary };
  });
  // Skilled: +8 racial bonus on a skill each.
  const skilled = taken.filter(c => c.id === 'skilled' && c.choice).map(c => c.choice);
  const used = taken.reduce((n, c) => n + c.evo.cost, 0);
  return {
    row, size, speed: f.speed, scores, mod: m, hd: row.hd, bab: row.bab,
    hp: Math.floor(5.5 * row.hd) + m.con * row.hd,
    ac, touch: 10 + m.dex + sizeMod, flat: ac - Math.max(0, m.dex), natural,
    saves, cmb: row.bab + m.str - sizeMod, cmd: 10 + row.bab + m.str + m.dex - sizeMod, init: m.dex,
    attacks: atk, totalAttacks, maxAttacks: row.maxAttacks,
    skillRanks: row.skills, skilled, feats: row.feats + count('extra-feat'),
    pool: row.pool, used, free: f.free, allowedIncreases,
    special: table.filter(r => r.level <= row.level).flatMap(r => r.special),
    taken: taken.map(c => ({ id: c.id, name: c.evo.name, cost: c.evo.cost, choice: c.choice || '', text: c.evo.text })),
  };
}
