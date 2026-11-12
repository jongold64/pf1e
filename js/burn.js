// A kineticist's burn (Character tab): how much can be accepted, the nonlethal damage it deals, and what elemental
// overflow gives for it. state.burn = points of burn now (a new day, a full night's rest, clears it). No page code here.

// kin: kineticist level; con: Constitution modifier; charLevel: character level; burn: points of burn now.
// Returns { burn, max, perRound, nonlethal, overflow: { attack, damage, max }, sizeBonus, ignoreCrit }.
// - max: 3 + Con modifier, the most burn she can choose to accept (more can be forced on her).
// - perRound: 1, 2 at 6th level, and 1 more every 3 levels after (3 at 9th, 4 at 12th...).
// - nonlethal: 1 point per character level for each point of burn.
// - overflow (3rd level): + burn on kinetic blast attacks, up to +1 per 3 kineticist levels; double that on damage.
// - sizeBonus: the size bonuses to physical ability scores at enough burn (6th: 3+ burn, +2 to two; 11th: 5+, +4/+2/+2;
//   16th: 7+, +6/+4/+2), as [6, 4, 2]-style lists ([] when none); ignoreCrit: % chance to ignore a critical hit or
//   sneak attack (6th level: 5% per point of burn).
export function burnState(kin, con, charLevel, burn = 0) {
  if (!kin) return null;
  const max = Math.max(0, 3 + con);
  const b = Math.max(0, Math.floor(burn) || 0);
  const perRound = kin >= 6 ? 2 + Math.floor((kin - 6) / 3) : 1;
  const omax = kin >= 3 ? Math.floor(kin / 3) : 0;
  const n = Math.min(b, omax);
  const sizeBonus = kin >= 16 && b >= 7 ? [6, 4, 2] : kin >= 11 && b >= 5 ? [4, 2, 2] : kin >= 6 && b >= 3 ? [2, 2] : [];
  return { burn: b, max, perRound, nonlethal: b * charLevel, overflow: { attack: n, damage: 2 * n, max: omax },
           sizeBonus, ignoreCrit: kin >= 6 ? 5 * b : 0 };
}

// The size bonuses in words: [4, 2, 2] -> "+4 size bonus to one physical ability score, +2 to the other two".
export function sizeBonusText(list) {
  if (!list.length) return '';
  if (list.length === 2) return '+2 size bonus to two physical ability scores of your choice';
  if (list[0] === 4) return '+4 size bonus to one physical ability score, +2 to the other two';
  return '+6 size bonus to one physical ability score, +4 to a second and +2 to the third';
}
