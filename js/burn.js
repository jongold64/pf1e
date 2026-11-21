// A kineticist's burn (Character tab): how much can be accepted, the nonlethal damage it deals, and what elemental
// overflow gives for it. state.burn = points of burn now (a new day, a full night's rest, clears it). No page code here.

// kin: kineticist level; con: Constitution modifier; charLevel: character level; burn: points of burn now.
// Returns { burn, max, perRound, nonlethal, overflow: { attack, damage, max }, sizeBonus, ignoreCrit }.
// - max: 3 + Con modifier, the most burn she can choose to accept (more can be forced on her).
// - perRound: 1, 2 at 6th level, and 1 more every 3 levels after (3 at 9th, 4 at 12th...).
// - nonlethal: 1 point per character level for each point of burn.
// - gather: gather power, burn taken off one blast: { move, full } (1 and 2; 2 and 3 with supercharge at 11th).
// - metakinesis: the ones reached, [{ name, burn }]: empower 1 (5th), maximize 2 (9th), quicken 3 (13th), double blast 4 (17th).
// - bufferMax: internal buffer, the most points it holds (1 at 6th, 2 at 11th, 3 at 16th; 0 before).
// - compositeCut: composite specialization (16th), 1 less burn on composite blasts.
// - infusionCut (5th level): infusion specialization, how much less burn the infusions used on one blast cost in all.
// - overflow (3rd level): + burn on kinetic blast attacks, up to +1 per 3 kineticist levels; double that on damage.
// - sizeBonus: the size bonuses to physical ability scores at enough burn (6th: 3+ burn, +2 to two; 11th: 5+, +4/+2/+2;
//   16th: 7+, +6/+4/+2), as [6, 4, 2]-style lists ([] when none); ignoreCrit: % chance to ignore a critical hit or
//   sneak attack (6th level: 5% per point of burn).
const METAKINESIS = [{ name: 'empower', burn: 1, level: 5 }, { name: 'maximize', burn: 2, level: 9 },
  { name: 'quicken', burn: 3, level: 13 }, { name: 'double blast', burn: 4, level: 17 }];
export function burnState(kin, con, charLevel, burn = 0) {
  if (!kin) return null;
  const max = Math.max(0, 3 + con);
  const b = Math.max(0, Math.floor(burn) || 0);
  const perRound = kin >= 6 ? 2 + Math.floor((kin - 6) / 3) : 1;
  const omax = kin >= 3 ? Math.floor(kin / 3) : 0;
  const n = Math.min(b, omax);
  const sizeBonus = kin >= 16 && b >= 7 ? [6, 4, 2] : kin >= 11 && b >= 5 ? [4, 2, 2] : kin >= 6 && b >= 3 ? [2, 2] : [];
  return { burn: b, max, perRound, nonlethal: b * charLevel, overflow: { attack: n, damage: 2 * n, max: omax },
           sizeBonus, ignoreCrit: kin >= 6 ? 5 * b : 0, infusionCut: infusionSpecialization(kin),
           gather: kin >= 11 ? { move: 2, full: 3 } : { move: 1, full: 2 },
           metakinesis: METAKINESIS.filter(m => kin >= m.level).map(({ name, burn: cost }) => ({ name, burn: cost })),
           bufferMax: kin >= 16 ? 3 : kin >= 11 ? 2 : kin >= 6 ? 1 : 0, compositeCut: kin >= 16 ? 1 : 0 };
}

// Infusion specialization: whenever she uses infusions with a blast, their combined burn costs this much less (never
// below 0): 1 at 5th level, 1 more at 8th, 11th, 14th, 17th and 20th.
export const infusionSpecialization = kin => (kin >= 5 ? 1 + Math.floor((kin - 5) / 3) : 0);
// The burn of the infusions used on one blast together, after infusion specialization: [1, 2] at 5th level -> 2.
export const infusionBurn = (costs, kin) => Math.max(0, costs.reduce((a, b) => a + b, 0) - infusionSpecialization(kin));
// Each chosen infusion's burn when used alone on a blast: [{ name, burn, after }]. talents: wild talent records
// ({ name, kind, text }); the burn is read from the text's "Burn N" (no number: 0).
export function infusionCosts(talents, kin) {
  return talents.filter(t => t && t.kind === 'infusion').map(t => {
    const burn = Number(String(t.text || '').match(/\bBurn (\d+)/)?.[1] || 0);
    return { name: t.name.replace(/ Infusion$/, ''), burn, after: infusionBurn([burn], kin) };
  });
}

// The size bonuses in words: [4, 2, 2] -> "+4 size bonus to one physical ability score, +2 to the other two".
export function sizeBonusText(list) {
  if (!list.length) return '';
  if (list.length === 2) return '+2 size bonus to two physical ability scores of your choice';
  if (list[0] === 4) return '+4 size bonus to one physical ability score, +2 to the other two';
  return '+6 size bonus to one physical ability score, +4 to a second and +2 to the third';
}

// A kineticist's elemental defense (2nd level) with the burn accepted into it (until her burn is removed).
// element: lower case; extra: points of burn accepted for the defense. Returns null below 2nd level or for an element
// without one, else { name, extra (counted), maxExtra (Infinity: no limit but her burn), text, ...numbers }:
// - aether force ward: tempMax temporary hit points (kineticist level, + half that level per burn), regen a minute
//   (1, +1 per 2 burn); recover: character level back whenever she accepts burn on an aether wild talent.
// - air enveloping winds: miss % (20, +5 per 5 levels beyond 2nd, +5 per burn, at most 75).
// - earth flesh of stone: dr (1, +1 per 2 levels beyond 2nd, +1 per burn, at most the kineticist level) /adamantine.
// - fire searing flesh: damage (1 per 4 levels, at least 1; the same again per burn, up to seven times).
// - void emptiness: resist negative energy (2 per step), ignoreCrit % (5 per step), will (+1 per step); a step for
//   the defense and one per burn.
// - water shroud of water: armor (+4, +1 per 4 levels beyond 2nd, +1 per burn up to half the starting value) or
//   shield (+2 and the same, up to half its own start).
// - wood flesh of wood: natural (+1 enhancement to natural armor, +1 per burn: 1 burn at 2nd, 1 more every 3 levels).
export function elementalDefense(element, kin, charLevel = kin, extra = 0) {
  if (kin < 2) return null;
  const want = Math.max(0, Math.floor(extra) || 0);
  const pick = (maxExtra, f) => { const x = Math.min(want, maxExtra); return { extra: x, maxExtra, ...f(x) }; };
  switch (element) {
    case 'aether': return { name: 'Force ward', ...pick(Infinity, x => ({ tempMax: kin + Math.floor(kin / 2) * x, regen: 1 + Math.floor(x / 2), recover: charLevel })),
      get text() { return `${this.tempMax} temporary hit points, lost first, regaining ${this.regen} a minute (and ${charLevel} whenever you accept burn on an aether wild talent)`; } };
    case 'air': { const base = 20 + 5 * Math.floor((kin - 2) / 5);
      return { name: 'Enveloping winds', ...pick((75 - base) / 5, x => ({ miss: base + 5 * x })),
        get text() { return `ranged attacks with physical weapons have a ${this.miss}% miss chance against you (not rays)`; } }; }
    case 'earth': { const base = 1 + Math.floor((kin - 2) / 2);
      return { name: 'Flesh of stone', ...pick(Math.max(0, kin - base), x => ({ dr: base + x })), get text() { return `DR ${this.dr}/adamantine`; } }; }
    case 'fire': { const step = Math.max(1, Math.floor(kin / 4));
      return { name: 'Searing flesh', ...pick(7, x => ({ damage: step * (1 + x) })),
        get text() { return `a creature that hits you with a natural attack or unarmed strike takes ${this.damage} fire damage (double to a creature grappling you, each of its turns; weapons that hit you take it too)`; } }; }
    case 'void': return { name: 'Emptiness', ...pick(Infinity, x => ({ resist: 2 * (1 + x), ignoreCrit: 5 * (1 + x), will: 1 + x })),
      get text() { return `negative energy resistance ${this.resist}, ${this.ignoreCrit}% to ignore critical hits and sneak attacks, +${this.will} on Will saves against emotion effects`; } };
    case 'water': { const step = Math.floor((kin - 2) / 4), armor = 4 + step, shield = 2 + step;
      return { name: 'Shroud of water', ...pick(Math.floor(armor / 2), x => ({ armor: armor + x, shield: shield + Math.min(x, Math.floor(shield / 2)) })),
        get text() { return `+${this.armor} armor bonus to AC (or, as a shield, +${this.shield} shield bonus instead)`; } }; }
    case 'wood': return { name: 'Flesh of wood', ...pick(1 + Math.floor((kin - 2) / 3), x => ({ natural: 1 + x })),
      get text() { return `+${this.natural} enhancement bonus to your natural armor`; } };
    default: return null;
  }
}

// Force ward's temporary hit points among the others ([{ id, name, amount }]): up to `add` more (Infinity: filled),
// at most max, kept first in the list (they're lost first). A max of 0 removes them.
export function forceWardTemps(temps = [], max = 0, add = 0) {
  const others = temps.filter(t => t.id !== 'force-ward');
  const now = Math.min(max, (temps.find(t => t.id === 'force-ward')?.amount || 0) + Math.max(0, add));
  return now > 0 ? [{ id: 'force-ward', name: 'Force ward', amount: now }, ...others] : others;
}

// ---- Infusions and metakinesis on one kinetic blast (the Character tab's Infuse popup) ----

const lower = s => String(s || '').toLowerCase();
// Infusions with rows of their own (kinetic fist) or a weapon (kinetic blade, whip): not offered on a blast.
const ON_OTHER_ROWS = new Set(['kinetic-fist-infusion', 'kinetic-blade-infusion', 'kinetic-whip-infusion']);
// What an infusion does to the blast's numbers, where its text alone doesn't say it plainly.
// attack: enhancement bonus on the attack roll (focused blast: +1, +1 more for each 2 more burn, to +5);
// range: the blast's new range.
const INFUSION_EFFECTS = {
  'focused-blast-infusion': { attack: 1, focus: true },
  'extended-range-infusion': { range: '120 ft.' },
};

// The opening sentences of a text, up to about 200 characters (at least one sentence).
function firstSentences(text) {
  let out = '';
  for (const m of text.matchAll(/[^.!]*[.!](?=\s|$)/g)) {
    if (out && out.length + m[0].length > 200) break;
    out += m[0];
  }
  return (out || text).trim();
}

// An infusion's facts, read from its text: { id, name, type: 'form' | 'substance', burn, save ('none', 'Reflex half'...),
// blasts: the associated blasts in lower case (['any'], ['blue flame', 'fire']), about: its opening sentences }.
export function infusionFacts(t) {
  const text = String(t?.text || '');
  const about = text.split(/\n\s*\n/).slice(1).join(' ').replace(/\s+/g, ' ').trim();
  return { id: t.id, name: String(t.name || '').replace(/ Infusion$/, ''),
    type: lower(text.match(/Type (form|substance) infusion/i)?.[1]), burn: Number(text.match(/\bBurn (\d+)/)?.[1] || 0),
    save: (text.match(/Saving Throw ([^\n]*)/)?.[1] || 'none').trim(),
    blasts: (text.match(/Associated Blasts ([^\n]*)/)?.[1] || 'any').split(',').map(s => lower(s).trim()).filter(Boolean),
    about: firstSentences(about) };
}
// Whether an infusion can go on a blast ("Telekinetic Blast" takes 'telekinetic' and 'any' infusions).
export const infusionFits = (f, blastName) => f.blasts.includes('any') || f.blasts.some(b => lower(blastName).startsWith(b));

// One blast with what's chosen for it. plan: { form, substance (talent ids), meta: ['empower'...], gather: 0 (none) |
// 1 (a move action) | 2 (a full round), focus: focused blast's bonus 1-5 }. kin: kineticist level; talents: the chosen
// wild talent records; bs: burnState(...); dex, con: modifiers; blast: the blast's name.
// Returns { form, substance (facts or null), options: { form, substance } (the ones that fit), focus, meta (names),
//   before (burn of infusions after infusion specialization, plus metakinesis), gatherCut, burn (what to accept), attack
//   (bonus), range, empower, maximize, saves: [{ name, save, dc }], noAttack (a form infusion with a save replaces the
//   attack roll), overLimit (more than she can accept a round) }.
export function blastPlan(plan = {}, { kin = 0, talents = [], bs = null, dex = 0, con = 0, blast = '' } = {}) {
  const facts = talents.filter(t => t && t.kind === 'infusion' && !ON_OTHER_ROWS.has(t.id)).map(infusionFacts).filter(f => infusionFits(f, blast));
  const options = { form: facts.filter(f => f.type === 'form'), substance: facts.filter(f => f.type === 'substance') };
  const form = options.form.find(f => f.id === plan.form) || null;
  const substance = options.substance.find(f => f.id === plan.substance) || null;
  const focus = form && INFUSION_EFFECTS[form.id]?.focus ? Math.max(1, Math.min(5, Math.floor(plan.focus) || 1)) : 0;
  const costs = [form && form.burn + 2 * Math.max(0, focus - 1), substance && substance.burn].filter(n => n !== null);
  const meta = (bs?.metakinesis || []).filter(m => (plan.meta || []).includes(m.name));
  const before = (costs.length ? infusionBurn(costs, kin) : 0) + meta.reduce((n, m) => n + m.burn, 0);
  const gatherCut = plan.gather === 2 ? (bs?.gather.full || 2) : plan.gather === 1 ? (bs?.gather.move || 1) : 0;
  const burn = Math.max(0, before - gatherCut);
  // The DC: 10 + the blast's effective spell level (half the kineticist level) + Dex for a form infusion, Con for a substance.
  const esl = Math.max(1, Math.floor(kin / 2));
  const dc = f => (f && !/^none\b/i.test(f.save) ? 10 + esl + (f.type === 'form' ? dex : con) : null);
  const saves = [form, substance].filter(f => dc(f) !== null).map(f => ({ name: f.name, save: f.save, dc: dc(f) }));
  return { form, substance, options, focus, meta: meta.map(m => m.name), before, gatherCut, burn,
    attack: form ? (INFUSION_EFFECTS[form.id]?.attack ? focus : 0) : 0, range: (form && INFUSION_EFFECTS[form.id]?.range) || '',
    empower: meta.some(m => m.name === 'empower'), maximize: meta.some(m => m.name === 'maximize'),
    saves, noAttack: dc(form) !== null, overLimit: !!bs && burn > bs.perRound };
}

// "extended range, empower · 1 burn" ('' when nothing is chosen).
export function blastPlanText(p) {
  const parts = [p.form && `${lower(p.form.name)}${p.focus > 1 ? ` +${p.focus}` : ''}`, p.substance && lower(p.substance.name), ...p.meta,
    p.gatherCut && `gather power −${p.gatherCut}`].filter(Boolean);
  return parts.length ? `${parts.join(', ')} · ${p.burn} burn` : '';
}

// A saved plan tidied: talent ids as strings, metakinesis names, gather 0-2, focus 1-5.
export function tidyBlastPlan(s) {
  const p = s && typeof s === 'object' ? s : {};
  return { form: typeof p.form === 'string' ? p.form : '', substance: typeof p.substance === 'string' ? p.substance : '',
    meta: Array.isArray(p.meta) ? p.meta.filter(m => METAKINESIS.some(x => x.name === m)) : [],
    gather: [1, 2].includes(p.gather) ? p.gather : 0, focus: Number.isInteger(p.focus) ? Math.max(1, Math.min(5, p.focus)) : 1 };
}
