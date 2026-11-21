// Defensive switches, like the Power Attack switch for attacks: Combat Expertise, fighting defensively, total defense,
// armor a class feature conjures (oracle revelations) and the shield in hand or not. Kept in state.combat; while on,
// each counts as an effect in every number. No page code here, so it can be tested on its own.

// Combat Expertise's step (Core Rulebook): 1, and 1 more at base attack +4 and every 4 after.
export const expertiseStep = bab => 1 + Math.floor(Math.max(0, bab) / 4);

// Oracle revelations that conjure armor: +4 armor bonus, +2 at 7th level and every 4 levels after.
export const ARMOR_REVELATIONS = new Set(['air-barrier', 'armor-of-bones', 'ectoplasmic-armor', 'elemental-aegis', 'ice-armor', 'wood-armor']);
export const revelationArmor = level => 4 + 2 * Math.max(0, Math.floor((level - 3) / 4));

// What each switch does now: [{ key, label, what, rows: [[label, value]], note }]. trained: 3 or more ranks in
// Acrobatics (+1 dodge fighting defensively, +2 on total defense). conjured: [{ id, name, bonus }].
// magus / cavalier: class levels, for the attack switches classes give (attack: true; shown with the attack switches):
// spell combat (magus: -2 on attacks while casting with the free hand) and cavalier's charge (3rd: +4 melee attack on a
// mounted charge instead of +2, no AC penalty; mighty charge at 11th, supreme charge at 20th noted).
// Linnorm Style (the feat; unarmed strikes, weapons.js) and a talented monk's exploit weakness edge (exploit: true; +2 on
// attacks this turn) are attack switches too.
// Monk switches (monk: { kiPool, exploit, ironLimb, flowingDodge (the most it can give, 0 without it), level }): the ki
// pool's swift actions (1 ki each: an extra attack in a full attack, +20 ft. speed, +4 dodge AC), exploit weakness's two
// uses, iron limb defense (+2, or +4 for 1 ki) and flowing dodge (a choice of how many enemies are adjacent). KI_COST: the
// switches that spend ki when switched on (app.js takes it from the ki pool). A Core Rulebook monk's from 4th level and an
// unchained monk's from 3rd give the same three. A ninja's ki pool (ninja: true) gives the extra attack, +20 ft. and +4
// insight on Stealth (kiStealth) instead of the dodge bonus.
export const KI_COST = { kiFlurry: 1, kiSpeed: 1, kiDefense: 1, ironLimbKi: 1, kiStealth: 1 };
// Arcane Strike (the feat; arcaneCL: the highest arcane caster level): +1 damage with weapons, +1 per 5 caster levels,
// and they count as magic, for a round (arcaneStrike).
export const arcaneStrikeBonus = cl => (cl > 0 ? 1 + Math.floor(cl / 5) : 0);
export function defenseSwitches({ bab = 0, haveFeats = [], acrobatics = 0, shield = null, conjured = [], magus = 0, cavalier = 0, exploit = false, monk = {}, ninja = false, arcaneCL = 0 } = {}) {
  const trained = acrobatics >= 3;
  const step = expertiseStep(bab);
  const out = [];
  if (shield) out.push({ key: 'shieldOff', label: `${shield} in hand`, inverted: true, what: 'switch off when you put it away or let go of it',
    rows: [['Shield bonus, check penalty, spell failure', 'count only while it’s in hand']],
    note: 'Off: the shield stays on your Armor tab but adds nothing (a free hand for a spell, a two-handed weapon...).' });
  for (const c of conjured) out.push({ key: `conjured:${c.id}`, label: c.name, what: `+${c.bonus} armor bonus while conjured`,
    rows: [['Armor bonus to AC', `+${c.bonus}`]], note: 'An armor bonus: it doesn’t stack with worn armor (the higher one counts).' });
  if (haveFeats.includes('Combat Expertise')) out.push({ key: 'combatExpertise', label: 'Combat Expertise', what: `−${step} melee attack and CMB, +${step} dodge AC`,
    rows: [['Your base attack bonus: 1 step, +1 at +4 and every 4 after', `${step} step${step === 1 ? '' : 's'}`], ['Melee attack rolls and combat maneuver checks', `−${step}`], ['Dodge bonus to AC', `+${step}`]],
    note: 'Choose it when you make a melee attack or a full attack; it lasts until your next turn.' });
  out.push({ key: 'fightingDefensively', label: 'Fighting defensively', what: `−4 on attacks, +${trained ? 3 : 2} dodge AC`,
    rows: [['All attack rolls this round', '−4'], [`Dodge bonus to AC${trained ? ' (3 or more ranks in Acrobatics: +3)' : ''}`, `+${trained ? 3 : 2}`]],
    note: 'Declared with a standard action attack or a full attack; it lasts until your next turn.' });
  if (magus) out.push({ key: 'spellCombat', label: 'Spell combat', attack: true, what: '−2 on attacks; cast a magus spell with your free hand',
    rows: [['Attack rolls this round (your weapon’s and the spell’s)', '−2'],
      ['Concentration check to cast defensively', magus >= 14 ? '+ twice the extra attack penalty you choose (greater spell combat)'
        : `${magus >= 8 ? '+2 (improved spell combat) ' : ''}+ the extra attack penalty you choose, up to your Int bonus`]],
    note: 'A full-round action: a light or one-handed melee weapon in one hand, the other free. Switch it off after your turn.' });
  if (haveFeats.includes('Arcane Strike') && arcaneCL > 0) out.push({ key: 'arcaneStrike', label: 'Arcane Strike', feat: true, attack: true,
    what: `+${arcaneStrikeBonus(arcaneCL)} damage with weapons, which count as magic`,
    rows: [['Damage with your weapons (+1, and +1 for every 5 arcane caster levels)', `+${arcaneStrikeBonus(arcaneCL)}`], ['Damage reduction', 'your weapons count as magic']],
    note: 'A swift action: it lasts until your next turn. Switch it off after your turn.' });
  if (cavalier >= 3) out.push({ key: 'mountedCharge', label: 'Mounted charge', attack: true, what: '+4 melee attack, no AC penalty (cavalier’s charge)',
    rows: [['Melee attack roll on the charge', '+4 (instead of +2)'], ['AC after the charge', 'no −2 penalty'],
      ...(cavalier >= 11 ? [['Threat range of your weapons (mighty charge)', 'doubled; a free bull rush, disarm, sunder or trip on a hit']] : []),
      ...(cavalier >= 20 ? [['Damage (supreme charge)', 'double (triple with a lance); a confirmed critical stuns 1d4 rounds']] : [])],
    note: 'Use it in place of the Charging effect while you charge on your mount; it lasts until your next turn.' });
  if (haveFeats.includes('Linnorm Style')) {
    out.push({ key: 'linnormStance', label: 'Linnorm Style: in the style', feat: true, what: '−2 AC against melee attacks',
      rows: [['AC against melee attacks while in the style', '−2 (counted in your AC)']],
      note: 'A combat style: entering it is a swift action. Switch it on while you\u2019re in it; the damage choice below is the other half.' });
    out.push({ key: 'linnormStyle', label: 'Linnorm Style: it attacked you', feat: true, attack: true,
      what: 'unarmed damage with Wisdom instead of Strength against a creature that attacked you',
      rows: [['Unarmed strike damage', 'your Wisdom bonus instead of Strength (or of Dexterity, if that\u2019s what you add)'],
        ...(haveFeats.includes('Linnorm Vengeance') ? [['Unarmed attack rolls against a creature that hit you (Linnorm Vengeance)', '+2']] : [])],
      note: 'After a creature makes a melee attack against you, until the start of its next turn. Switch it on for attacks on that creature.' });
  }
  if (exploit || monk.exploit) {
    out.push({ key: 'exploitWeakness', label: 'Exploit weakness: weak point', attack: true, what: '+2 on attacks this turn, ignore DR and hardness',
      rows: [['Attack rolls until the end of your turn', '+2'], ['Damage reduction and hardness', 'ignored'],
        ['To use it', 'a swift action: Wisdom check + your monk level against DC 10 + the target’s CR (or hardness)']],
      note: 'Talented monk edge. Switch it on after the check succeeds, and off after your turn.' });
    const half = Math.max(0, Math.floor((monk.level || 0) / 2));
    out.push({ key: 'exploitDefense', label: 'Exploit weakness: read a foe', what: `+${half} dodge AC and Reflex against one creature`,
      rows: [['Dodge bonus to AC against that creature (half your monk level)', `+${half}`], ['Reflex saves and Sense Motive checks against it', `+${half}`],
        ['To use it', 'a swift action, instead of finding a weak point: one creature within 30 ft.']],
      note: 'Until the start of your next turn. Counted in your AC and Reflex while on: only against that creature.' });
  }
  if (monk.kiPool || ninja) {
    out.push({ key: 'kiFlurry', label: 'Ki: extra attack', attack: true, what: 'one more attack at your highest bonus in a full attack (1 ki)',
      rows: [['Full attack this round', 'one more attack at your highest attack bonus (it stacks with a flurry\u2019s)'], ['Cost', '1 ki, a swift action']],
      note: 'Switching it on takes 1 ki from your ki pool (Daily uses). Switch it off after your turn.' });
    out.push({ key: 'kiSpeed', label: 'Ki: +20 ft. speed', what: '+20 ft. speed for 1 round (1 ki)',
      rows: [['Speed for 1 round', '+20 ft.'], ['Cost', '1 ki, a swift action']], note: 'Switching it on takes 1 ki from your ki pool.' });
    if (monk.kiPool) out.push({ key: 'kiDefense', label: 'Ki: +4 dodge AC', what: '+4 dodge AC for 1 round (1 ki)',
      rows: [['Dodge bonus to AC for 1 round', '+4'], ['Cost', '1 ki, a swift action']], note: 'Switching it on takes 1 ki from your ki pool.' });
    if (ninja) out.push({ key: 'kiStealth', label: 'Ki: +4 Stealth', what: '+4 insight on Stealth for 1 round (1 ki)',
      rows: [['Insight bonus on Stealth checks for 1 round', '+4'], ['Cost', '1 ki, a swift action']], note: 'Ninja. Switching it on takes 1 ki from your ki pool.' });
  }
  if (monk.ironLimb) {
    out.push({ key: 'ironLimb', label: 'Iron limb defense', what: '+2 shield AC and CMD (you started and ended your turn in the same space)',
      rows: [['Shield bonus to AC and CMD until your next turn', '+2']], note: 'Talented monk edge, with bastion stance: only if you didn\u2019t move this turn.' });
    out.push({ key: 'ironLimbKi', label: 'Iron limb defense, with ki', what: '+4 shield AC and CMD instead (1 ki)',
      rows: [['Shield bonus to AC and CMD until your next turn', '+4 (instead of +2)'], ['Cost', '1 ki, a swift action']],
      note: 'Switching it on takes 1 ki from your ki pool.' });
  }
  if (monk.flowingDodge) out.push({ key: 'flowingDodge', label: 'Flowing dodge', what: `+1 dodge AC per adjacent enemy (up to +${monk.flowingDodge})`,
    choices: Array.from({ length: monk.flowingDodge + 1 }, (_, n) => [n, n ? `${n} adjacent` : 'none adjacent']),
    rows: [['Dodge bonus to AC', `+1 for each adjacent enemy, at most +${monk.flowingDodge} (your Wisdom modifier, at least 1)`]],
    note: 'Choose how many enemies are next to you now.' });
  out.push({ key: 'totalDefense', label: 'Total defense', what: `no attacks, +${trained ? 6 : 4} dodge AC`,
    rows: [[`Dodge bonus to AC${trained ? ' (3 or more ranks in Acrobatics: +6)' : ''}`, `+${trained ? 6 : 4}`], ['Attacks of opportunity', 'none']],
    note: 'A standard action instead of attacking; it can’t be combined with fighting defensively or Combat Expertise.' });
  return out;
}

// The effects of the switches that are on, in the custom-effect shape: [{ name, target, type, value, on, classFeature }].
export function defenseEffects(combat = {}, opts = {}) {
  const list = defenseSwitches(opts);
  const has = key => list.some(s => s.key === key);
  const trained = (opts.acrobatics || 0) >= 3;
  const step = expertiseStep(opts.bab || 0);
  const out = [];
  const fx = (name, target, type, value) => out.push({ name, target, type, value, on: true, classFeature: true });
  if (combat.totalDefense) fx('Total defense', 'ac', 'dodge', trained ? 6 : 4);
  else {
    if (combat.combatExpertise && has('combatExpertise')) {
      fx('Combat Expertise', 'melee-attack', 'untyped', -step);
      fx('Combat Expertise', 'cmb', 'untyped', -step);
      fx('Combat Expertise', 'ac', 'dodge', step);
    }
    if (combat.fightingDefensively) {
      fx('Fighting defensively', 'attack', 'untyped', -4);
      fx('Fighting defensively', 'ac', 'dodge', trained ? 3 : 2);
    }
  }
  if (combat.spellCombat && has('spellCombat')) fx('Spell combat', 'attack', 'untyped', -2);
  if (combat.arcaneStrike && has('arcaneStrike')) fx('Arcane Strike', 'damage', 'untyped', arcaneStrikeBonus(opts.arcaneCL));
  if (combat.mountedCharge && has('mountedCharge')) fx('Cavalier’s charge', 'melee-attack', 'untyped', 4);
  if (combat.exploitWeakness && has('exploitWeakness')) fx('Exploit weakness', 'attack', 'untyped', 2);
  const monk = opts.monk || {};
  const half = Math.floor((monk.level || 0) / 2);
  if (combat.exploitDefense && has('exploitDefense') && half) {
    fx('Exploit weakness (one foe)', 'ac', 'dodge', half);
    fx('Exploit weakness (one foe)', 'ref', 'untyped', half);
    fx('Exploit weakness (one foe)', 'skill:Sense Motive', 'untyped', half);
  }
  if (combat.kiSpeed && has('kiSpeed')) fx('Ki: speed', 'speed', 'untyped', 20);
  if (combat.kiDefense && has('kiDefense')) fx('Ki: defense', 'ac', 'dodge', 4);
  if (combat.kiStealth && has('kiStealth')) fx('Ki: Stealth', 'skill:Stealth', 'insight', 4);
  if (has('ironLimb') && (combat.ironLimbKi || combat.ironLimb)) {
    const n = combat.ironLimbKi ? 4 : 2;
    fx('Iron limb defense', 'ac', 'shield', n);
    fx('Iron limb defense', 'cmd', 'shield', n);
  }
  if (has('flowingDodge') && combat.flowingDodge > 0) fx('Flowing dodge', 'ac', 'dodge', Math.min(monk.flowingDodge, combat.flowingDodge));
  if (combat.linnormStance && has('linnormStance')) fx('Linnorm Style (against melee)', 'ac', 'untyped', -2);
  const c = (opts.conjured || []).find(x => x.id === combat.conjured);
  if (c) fx(c.name, 'ac', 'armor', c.bonus);
  return out;
}

// The switches that are on, for the On now card: [{ key, label }].
export function defenseOn(combat = {}, opts = {}) {
  return defenseSwitches(opts).filter(s => (s.key === 'shieldOff' ? combat.shieldOff
    : s.key.startsWith('conjured:') ? combat.conjured === s.key.slice(9) : combat[s.key]))
    .map(s => ({ key: s.key, label: s.key === 'shieldOff' ? `${s.label.replace(/ in hand$/, '')} put away` : s.label }));
}
