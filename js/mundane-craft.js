// Crafting non-magical items with the Craft skill (Core Rulebook, Craft): the DC by item, raw materials a third of the
// price, and progress each week (check × DC, in silver pieces; a day is a seventh of that) until it reaches the
// price. Masterwork is a separate part (300 gp for a weapon, 150 gp for armor or a shield, DC 20) made the same way.
// No page code here.
//
// state.craftProjects = [{ id, kind: 'weapon' | 'armor' | 'gear', itemId, name, priceGp, dc, mw, mwPrice, skill, fast,
//   progress (sp), mwProgress (sp), spent (gp), last (the last roll, in words) }].

const lower = s => String(s || '').toLowerCase();
export const MASTERWORK = { weapon: 300, armor: 150 };
export const MASTERWORK_DC = 20;
// Alchemical items' DCs from the Craft table (others give theirs in their text; 20 when neither does).
const ALCHEMY_DC = { acid: 15, "alchemist's fire": 20, smokestick: 20, tindertwig: 20, antitoxin: 25, sunrod: 25, 'tanglefoot bag': 25, thunderstone: 25 };

// The Craft DC to make an item. kind: weapon (simple 12, martial 15, exotic 18; longbow or shortbow 12, composite bow 15
// and +2 per point of Strength rating, crossbow 15), armor (10 + its armor or shield bonus), gear (alchemical items as
// above; anything else a typical item, 10).
export function craftDC(kind, item = {}, strRating = 0) {
  const n = lower(item.name);
  if (kind === 'armor') return 10 + (item.bonus || 0);
  if (kind === 'weapon') {
    if (/crossbow/.test(n)) return 15;
    if (/bow\b/.test(n)) return /composite/.test(n) ? 15 + 2 * Math.max(0, strRating) : 12;
    return item.proficiency === 'exotic' ? 18 : item.proficiency === 'martial' ? 15 : 12;
  }
  if (item.category === 'Alchemical Items') {
    const stated = String(item.description || '').match(/Craft[^.]{0,30}?DC (\d+)/);
    return stated ? Number(stated[1]) : ALCHEMY_DC[n] || 20;
  }
  return 10;
}

// The Craft skill that makes it: armor and shields Craft (armor), bows Craft (bows), other weapons Craft (weapons),
// alchemical items Craft (alchemy); for anything else, whichever Craft fits (null: the player picks).
export function craftSkillFor(kind, item = {}) {
  const n = lower(item.name);
  if (kind === 'armor') return 'Craft (armor)';
  if (kind === 'weapon') return /bow\b/.test(n) && !/crossbow/.test(n) ? 'Craft (bows)' : 'Craft (weapons)';
  if (item.category === 'Alchemical Items') return 'Craft (alchemy)';
  return null;
}

// A new project: its price, DC, masterwork part and the raw materials paid (a third of the price, masterwork included).
export function newProject({ kind, item, mw = false, skill, fast = false, strRating = 0 }) {
  const mwPrice = mw && MASTERWORK[kind] ? MASTERWORK[kind] : 0;
  const priceGp = item.price_gp || 0;
  return { id: `make-${Date.now().toString(36)}`, kind, itemId: item.id, name: item.name, priceGp, dc: craftDC(kind, item, strRating),
    mw: !!mwPrice, mwPrice, skill, fast: !!fast, progress: 0, mwProgress: 0, spent: rawCost(priceGp + mwPrice), last: '' };
}
export const rawCost = gp => Math.round(gp / 3 * 100) / 100;

// The part being worked on (the item, then its masterwork part) and how far each is, in silver pieces.
export function projectState(p) {
  const need = Math.round(p.priceGp * 10), mwNeed = Math.round(p.mwPrice * 10);
  const itemDone = p.progress >= need;
  const done = itemDone && (!p.mw || p.mwProgress >= mwNeed);
  return { need, mwNeed, itemDone, done, part: itemDone ? 'masterwork' : 'item', dc: (itemDone ? MASTERWORK_DC : p.dc) + (p.fast ? 10 : 0) };
}

// One check's result on a project: a week (or a day, a seventh as much) of work. check: d20 + Craft (or 10 + Craft).
// Making the DC adds check × DC silver; missing by 4 or less makes no progress; by 5 or more also ruins half the raw
// materials (half their cost paid again). Returns the project changed, and `text` saying what happened.
export function workOn(p, check, { day = false } = {}) {
  const s = projectState(p);
  if (s.done) return { ...p, last: 'Already finished.' };
  const dc = s.dc;
  let out = { ...p };
  let text;
  if (check >= dc) {
    const gain = Math.round(check * dc / (day ? 7 : 1) * 100) / 100;
    if (s.part === 'item') out.progress = Math.min(s.need, p.progress + gain); else out.mwProgress = Math.min(s.mwNeed, p.mwProgress + gain);
    text = `${check} against DC ${dc}: +${gain} sp on the ${s.part === 'item' ? 'item' : 'masterwork part'}`;
  } else if (dc - check <= 4) {
    text = `${check} against DC ${dc}: missed by ${dc - check}, no progress`;
  } else {
    const lost = rawCost(s.part === 'item' ? p.priceGp : p.mwPrice) / 2;
    out.spent = Math.round((p.spent + lost) * 100) / 100;
    text = `${check} against DC ${dc}: missed by 5 or more, half the raw materials ruined (${lost} gp more)`;
  }
  out.last = `${day ? 'Day' : 'Week'}: ${text}.`;
  return out;
}

// How long it takes taking 10 every week: weeks (null when 10 + the skill can't make the DC).
export function weeksTaking10(p, skillTotal) {
  const s = projectState(p);
  const check = 10 + skillTotal;
  const parts = [[s.need - p.progress, (p.dc + (p.fast ? 10 : 0))], ...(p.mw ? [[s.mwNeed - p.mwProgress, MASTERWORK_DC + (p.fast ? 10 : 0)]] : [])];
  let weeks = 0;
  for (const [left, dc] of parts) {
    if (left <= 0) continue;
    if (check < dc) return null;
    weeks += Math.ceil(left / (check * dc));
  }
  return weeks;
}

// Saved projects tidied (at most 20).
export function tidyProjects(saved) {
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
  return (Array.isArray(saved) ? saved : []).filter(p => p && ['weapon', 'armor', 'gear'].includes(p.kind) && typeof p.itemId === 'string').slice(0, 20)
    .map(p => ({ id: String(p.id || `make-${p.itemId}`).slice(0, 40), kind: p.kind, itemId: p.itemId, name: String(p.name || p.itemId).slice(0, 60),
      priceGp: num(p.priceGp), dc: num(p.dc, 10), mw: p.mw === true, mwPrice: num(p.mwPrice), skill: String(p.skill || 'Craft').slice(0, 60),
      fast: p.fast === true, progress: num(p.progress), mwProgress: num(p.mwProgress), spent: num(p.spent), last: String(p.last || '').slice(0, 200) }));
}
