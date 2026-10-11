// Natural attacks class features give: bloodline claws and bites, a shifter's claws, rage powers, discoveries,
// revelations and talents (Animal Fury, Feral Mutagen, Talons of the Dragon, Tiger's Claws...), archetype features
// (Deadly Horns, Gruesome Gobbler...). Read from the feature's rules text, so new ones need no code.
// No page code here, so it can be tested on its own.

const KINDS = [
  ['Tail slap', 'tail slap', 1],
  ['Gore', 'gore', 1],
  ['Slam', 'slam', 1],
  ['Bite', '(?:bite|fangs)', 1],
  ['Claw', 'claws?', 2],
];
const ord = '(\\d+)(?:st|nd|rd|th)';
// Damage dice: not extra damage ("an additional 1d6") or ability damage from a poison ("1d2 Con").
const DICE = '(?<!additional )(\\d+d\\d+)(?!\\s*(?:points of )?(?:Str|Dex|Con|Int|Wis|Cha\\b|(?:fire|cold|acid|electricity|sonic|energy) damage))';
// The Small dice in brackets after it: "(1d3 if you are Small)", "(assuming ... Medium; 1d3 points of damage if Small)".
const SMALL = '(?:[^().]{0,70}?\\([^)]*?(\\d+d\\d+)[^)]*?Small[^)]*\\))?';

// What a rules text gives at a class level: [{ name, count, dice, strMult, extra, when, choose }], or [] when it gives no
// natural attack with damage dice. small: use the Small dice ("1d4 (1d3 if you are Small)").
// The wordings: "allowing you to make two claw attacks ... These attacks deal 1d4 points of damage each (1d3 if you are
// Small)", "he gains two claw attacks and a bite attack ... The claw attacks deal 1d6 ... and the bite attack deals 1d8",
// "At 7th level, the damage increases by one step to 1d6 points of damage (1d4 if you are Small)", "each dealing an
// additional 1d6 points of fire damage", "plus 1-1/2 times ... Strength modifier", "either a bite attack ... or two claw
// attacks" (choose).
export function naturalAttacks(text, level, { small = false } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!new RegExp(DICE).test(t)) return [];
  // It must give the attack (not just mention one), and to you, not only to allies.
  if (!/(grows?|gains?|grant(?:s|ing)?|extend|sprout|transform)[^.]{0,90}(claws?|bite|fangs|gore|slam|tail slap)|(claws?|bite|fangs|gore|slam|tail slap)[^.]{0,40}(natural (?:attack|weapon)|attacks? that deals?)/i.test(t)) return [];
  if (/grant (?:her|his|your) allies|willing ally|allies within/i.test(t) && !/herself|himself|yourself/i.test(t)) return [];
  const kinds = KINDS.filter(([, re]) => new RegExp(`\\b${re}\\b`, 'i').test(t));
  if (!kinds.length) return [];
  const pick = m => (small && m[2] ? m[2] : m[1]);
  const any = t.match(new RegExp(`${DICE}${SMALL}`, 'i'));
  const attack = (name, count, m) => ({ name, count, dice: pick(m) });
  // One kind: the first dice in the text. Several: each one's own dice in its sentence ("the bite attack deals 1d8"); when
  // none has its own (the dragon disciple's bite, given "whenever he uses his bloodline to grow claws"), the first named.
  let out = kinds.length === 1 ? [attack(kinds[0][0], kinds[0][2], any)]
    : kinds.map(([name, re, count]) => {
      const own = t.match(new RegExp(`\\b${re}\\b[^.]*?${DICE}${SMALL}`, 'i'));
      return own ? attack(name, count, own) : null;
    }).filter(Boolean);
  if (!out.length) out = [attack(kinds[0][0], kinds[0][2], any)];
  // Damage that grows at a level (one kind only): the latest step reached.
  if (out.length === 1) {
    for (const m of t.matchAll(new RegExp(`At ${ord} level,[^.]*?(?:damage|die)[^.]*?(?:increases?|becomes?)[^.]*?to ${DICE}${SMALL}`, 'gi'))) {
      if (level >= Number(m[1])) out[0].dice = small && m[3] ? m[3] : m[2];
    }
  }
  // Extra damage on a hit from a level ("flaming weapons, each dealing an additional 1d6 points of fire damage", "an
  // additional 1d6 points of damage of your energy type").
  const extra = [];
  for (const m of t.matchAll(new RegExp(`At ${ord} level,[^.]*?additional (\\d+d\\d+) points of (?:([a-z]+) damage|damage of your (energy) type)`, 'gi'))) {
    if (level >= Number(m[1])) extra.push(`+${m[2]} ${m[3] || m[4]}`);
  }
  const when = /while (?:you are )?bloodraging/i.test(t) ? 'while bloodraging' : /while raging/i.test(t) ? 'while raging'
    : /imbibes a mutagen|mutagen is in effect/i.test(t) ? 'with your mutagen' : /vigilante identity/i.test(t) ? 'in your vigilante identity' : '';
  const strMult = /1-1\/2 times|1½ times|one and a half times/i.test(t) ? 1.5 : 1;
  const choose = out.length > 1 && /\beither\b|choose one/i.test(t);
  return out.map(a => ({ ...a, strMult, extra, when, choose }));
}

// Attack rows for natural attacks (Attacks card, Character tab): [{ name, note, attack, dice, count }].
// list: [{ attack: one of naturalAttacks(...), from }]; melee: the melee attack bonus; str: the Strength modifier.
export function naturalAttackRows(list, { melee = 0, str = 0 } = {}) {
  return list.map(({ attack: a, from }) => {
    const bonus = Math.floor(str * a.strMult);
    return {
      name: a.count > 1 ? `${a.count} ${a.name.toLowerCase()}s` : a.name,
      note: [from, 'natural attack', a.when, a.choose ? 'or the other attack (choose one)' : '', ...a.extra].filter(Boolean).join(' · '),
      attack: melee, count: a.count,
      dice: `${a.dice}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`,
    };
  });
}
