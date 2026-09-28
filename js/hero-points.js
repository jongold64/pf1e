// Hero points (Advanced Player's Guide, chapter 8): Pathfinder's action points, used when the "Action Points" house
// rule is on. No page code here, so it can be tested on its own.
//   - Every character starts with 1 hero point (whatever its level) and earns 1 more each time it gains a level
//     (2 with Blood of Heroes). Hero's Fortune gives 1 when taken.
//   - At most 3 at a time (5 with Hero's Fortune); points beyond that are lost.
//   - At most 1 is spent per round, except that cheating death costs 2.
//   - An antihero has no hero points and gets a bonus feat at 1st level instead.

export const HERO_POINT_START = 1;

// Each way to spend a point: cost, and whether Luck of Heroes can save the point (a reroll, or a bonus taken before
// the roll).
export const HERO_POINT_USES = [
  { id: 'bonus-before', label: '+8 bonus', cost: 1, luck: true,
    text: 'A +8 luck bonus on one d20 roll, spent before rolling (+4 if you give it to an ally you can help).' },
  { id: 'bonus-after', label: '+4 bonus', cost: 1,
    text: 'A +4 luck bonus on a d20 roll already made (+2 if you give it to an ally you can help).' },
  { id: 'reroll', label: 'Reroll', cost: 1, luck: true,
    text: 'Reroll one d20 roll you just made; the second result stands, even if it is worse.' },
  { id: 'extra-action', label: 'Extra action', cost: 1,
    text: 'An additional standard or move action on your turn.' },
  { id: 'act-now', label: 'Act out of turn', cost: 1,
    text: 'Take your turn now, just before the creature acting (a move or a standard action only); your initiative moves there.' },
  { id: 'recall', label: 'Recall', cost: 1,
    text: 'Recall a spell already cast today, or get another use of a daily ability.' },
  { id: 'inspiration', label: 'Inspiration', cost: 1,
    text: 'Ask the GM for a hint about what to do next (the point is not spent if there is nothing to learn).' },
  { id: 'special', label: 'Special', cost: 1,
    text: 'Ask the GM to let you attempt something nearly impossible, with a difficult check or attack penalty.' },
  { id: 'cheat-death', label: 'Cheat death', cost: 2,
    text: 'Spend 2 points not to die: you are left alive, below 0 hit points but stable (also for your familiar, animal companion, eidolon or mount).' },
];

const has = (haveFeats, name) => (haveFeats || []).includes(name);

export function heroPointMax(haveFeats) {
  return has(haveFeats, "Hero's Fortune") ? 5 : 3;
}

export function heroPointsPerLevel(haveFeats) {
  return has(haveFeats, 'Blood of Heroes') ? 2 : 1;
}

// Points after a change to the character: `points` is what it had (null = never counted, so it starts with 1),
// `levelsGained` the levels just added (0 or less for none), `gotFortune` true when Hero's Fortune was just taken.
export function heroPointsAfter(points, { levelsGained = 0, gotFortune = false, haveFeats = [] } = {}) {
  if (!Number.isInteger(points)) return clampHeroPoints(HERO_POINT_START, haveFeats);
  const n = points + Math.max(0, levelsGained) * heroPointsPerLevel(haveFeats) + (gotFortune ? 1 : 0);
  return clampHeroPoints(n, haveFeats);
}

export function clampHeroPoints(n, haveFeats) {
  return Math.max(0, Math.min(heroPointMax(haveFeats), Math.trunc(n) || 0));
}

// Spending a point: { points, spent, note }. `d20` is the Luck of Heroes roll (only rolled when the feat applies).
export function spendHeroPoint(points, useId, { haveFeats = [], d20 = null } = {}) {
  const use = HERO_POINT_USES.find(u => u.id === useId);
  if (!use) return { points, spent: 0, note: '' };
  if (points < use.cost) return { points, spent: 0, note: `Not enough hero points for ${use.label} (needs ${use.cost}).` };
  if (use.luck && has(haveFeats, 'Luck of Heroes') && d20 !== null && d20 > 15) {
    return { points, spent: 0, note: `${use.label}: ${use.text} Luck of Heroes rolled ${d20}, so the point is kept.` };
  }
  const luck = use.luck && has(haveFeats, 'Luck of Heroes') && d20 !== null ? ` (Luck of Heroes rolled ${d20}.)` : '';
  return { points: points - use.cost, spent: use.cost, note: `${use.label}: ${use.text}${luck}` };
}
