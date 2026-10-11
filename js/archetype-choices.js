// Choices some archetypes (and classes, and oracle revelations) ask for, and what they give: the kensai's chosen weapon
// (proficiency and Weapon Focus with it), and weapons a class feature makes (`gear`): the bladebound magus's black blade,
// a gunslinger's battered gun, a phantom blade's phantom weapon... added to the character's weapons for free, with an
// enhancement bonus that follows the class level.
// Saved in state.archChoices as { 'archetype id:key': weapon id }. No page code here, so it can be tested on its own.

// The black blade's progression (Ultimate Magic, Table: Black Blade Progression): from magus level 3, 5, 9, 13, 17, 19.
const BLADE = [[3, 1, 11, 7, 5], [5, 2, 12, 8, 8], [7, 2, 13, 9, 10], [9, 3, 14, 10, 12], [11, 3, 15, 11, 14],
  [13, 4, 16, 12, 16], [15, 4, 17, 13, 18], [17, 5, 18, 14, 22], [19, 5, 19, 15, 24]];
// { enh, int, wisCha, ego } at a magus level (null below 3rd).
export function blackBlade(level) {
  const row = [...BLADE].reverse().find(r => level >= r[0]);
  return row ? { enh: row[1], int: row[2], wisCha: row[3], ego: row[4] } : null;
}

// A value from a level table [[level, value], ...] (0 below the first row).
const byLevel = table => level => [...table].reverse().find(([lv]) => level >= lv)?.[1] ?? 0;

// Weapons class features make. tag: what it's called; enh(level): its enhancement bonus; masterwork(level), proficient,
// material(level): weapon material id; note: shown on the Weapons tab.
const BATTERED = { tag: 'battered gun', enh: () => 0, proficient: true,
  note: 'Your battered starting gun: only you can use it properly (others treat it as broken); it sells only for scrap.' };
const STARTING_GUNS = w => ['blunderbuss', 'musket', 'pistol'].includes(w.id);
const battered = (fromLevel, weapons = STARTING_GUNS) => [{ key: 'gun', label: 'Battered gun', fromLevel,
  hint: 'The battered gun a gunslinger starts with. It is added to your weapons for free.', weapons, gear: BATTERED }];
const simpleOrMartial = w => ['simple', 'martial'].includes(w.proficiency) && !w.firearm;
const melee = w => w.group !== 'ranged' && w.group !== 'unarmed';
// Oracle revelations that make a weapon: +1 at 7th, +2 at 15th, +3 at 19th (ancestral, wooden, iron).
const REVELATION_ENH = byLevel([[7, 1], [15, 2], [19, 3]]);

// Each archetype's (or class's, by class id; or a chosen talent's, by "talent:" + its id) choices. `weapons`: which weapons can be chosen. `fromLevel`: the class level it's chosen at.
export const ARCH_CHOICES = {
  'magus-kensai': [{ key: 'weapon', label: 'Chosen weapon', fromLevel: 1,
    hint: 'One martial or exotic melee weapon: you are proficient with it and gain Weapon Focus with it (and canny defense, perfect strike and the rest work with it).',
    weapons: w => w.group !== 'ranged' && ['martial', 'exotic'].includes(w.proficiency) }],
  'magus-bladebound': [{ key: 'blade', label: 'Black blade', fromLevel: 3,
    hint: 'A one-handed slashing weapon, a rapier or a sword cane. It is added to your weapons for free; its enhancement bonus grows with your magus level.',
    weapons: w => (w.group === 'one-handed' && /S/.test(w.type || '')) || ['rapier', 'sword-cane'].includes(w.id),
    gear: { tag: 'black blade', enh: level => blackBlade(level)?.enh || 0, masterwork: () => true,
      note: 'Your black blade (bladebound): its enhancement bonus follows your magus level.' } }],
  // Psychic Anthology: a phantom weapon works like a black blade; +0 (masterwork) at 1st, +1 at 3rd ... +5 at 17th.
  'spiritualist-phantom-blade': [{ key: 'weapon', label: 'Phantom weapon', fromLevel: 1,
    hint: 'A weapon you are proficient with (phantom blades: simple and martial). It is added to your weapons for free; its enhancement bonus grows with your spiritualist level, and it is always ghost touch.',
    weapons: simpleOrMartial,
    gear: { tag: 'phantom weapon', enh: byLevel([[3, 1], [5, 2], [9, 3], [13, 4], [17, 5]]), masterwork: () => true,
      note: 'Your phantom weapon (phantom blade): ghost touch; its enhancement bonus follows your spiritualist level.' } }],
  // Psychic pool: a psychic weapon with +1 at 1st, +2 at 3rd and every 3 levels after, to +5 at 12th.
  'magus-mindblade': [{ key: 'weapon', label: 'Psychic weapon', fromLevel: 1,
    hint: 'A light (1 point), one-handed (2 points) or two-handed (3 points) melee weapon, not a double weapon, that you manifest from your psychic pool. It is added to your weapons for free.',
    weapons: w => melee(w) && !(w.special || []).some(x => /^double$/i.test(x)),
    gear: { tag: 'psychic weapon', enh: byLevel([[1, 1], [3, 2], [6, 3], [9, 4], [12, 5]]), proficient: true,
      note: 'Your psychic weapon (mindblade): it vanishes if it leaves your hand; its enhancement bonus follows your magus level.' } }],
  // Shadow weapon: +1 at 3rd, +1 more every 4 levels beyond 2nd, to +5 at 18th.
  'fighter-gloomblade': [{ key: 'weapon', label: 'Shadow weapon', fromLevel: 3,
    hint: 'Any melee weapon you are proficient with, created in your hand as a move action. It is added to your weapons for free.',
    weapons: melee,
    gear: { tag: 'shadow weapon', enh: byLevel([[3, 1], [6, 2], [10, 3], [14, 4], [18, 5]]),
      note: 'Your shadow weapon (gloomblade): its enhancement bonus follows your fighter level (1 lower each if you make two).' } }],
  // Battered guns: archetypes that give "a battered gun identical to the one gained by the gunslinger".
  'alchemist-gun-chemist': battered(1),
  'cavalier-spellscar-drifter': battered(1),
  'investigator-steel-hound': battered(2),
  'paladin-holy-gun': battered(1),
  'rogue-gun-smuggler': battered(1, w => ['coat-pistol', 'dagger-pistol', 'sword-cane-pistol'].includes(w.id)),
  // Oracle revelations that make a weapon (chosen on the Classes tab like other revelations).
  'talent:ancestral-weapon': [{ key: 'weapon', label: 'Ancestral weapon', fromLevel: 1,
    hint: "A simple or martial weapon from your family's history; you are proficient with it. Masterwork at 3rd level, +1 at 7th, 15th and 19th.",
    weapons: simpleOrMartial,
    gear: { tag: 'ancestral weapon', enh: REVELATION_ENH, masterwork: level => level >= 3, proficient: true,
      note: 'Your ancestral weapon (revelation): a number of minutes a day equal to your oracle level.' } }],
  'talent:iron-weapon': [{ key: 'weapon', label: 'Iron weapon', fromLevel: 1,
    hint: 'A melee simple or martial weapon made all of metal; you are proficient with it. Cold iron at 3rd level, +1 at 7th, 15th and 19th, adamantine at 11th.',
    weapons: w => simpleOrMartial(w) && melee(w),
    gear: { tag: 'iron weapon', enh: REVELATION_ENH, proficient: true, material: level => (level >= 11 ? 'adamantine' : level >= 3 ? 'cold-iron' : ''),
      note: 'Your iron weapon (revelation): lasts 1 minute per oracle level, 3 + Charisma modifier times a day.' } }],
  'talent:shadow-armament': [{ key: 'weapon', label: 'Shadow armament', fromLevel: 1,
    hint: 'A quasi-real simple or martial masterwork weapon; you are proficient with it. +1 at 3rd level, +2 at 11th, +3 at 19th. A creature it hits can disbelieve it (Will save).',
    weapons: simpleOrMartial,
    gear: { tag: 'shadow armament', enh: byLevel([[3, 1], [11, 2], [19, 3]]), masterwork: () => true, proficient: true,
      note: 'Your shadow armament (revelation): a creature that makes its Will save to disbelieve takes only 1 point of damage.' } }],
  'talent:wooden-weapon': [{ key: 'weapon', label: 'Wooden weapon', fromLevel: 1,
    hint: 'A club, quarterstaff, longspear, shortspear or spear; you are proficient with it. Masterwork at 3rd level, +1 at 7th, 15th and 19th, keen at 11th.',
    weapons: w => ['club', 'quarterstaff', 'longspear', 'shortspear', 'spear'].includes(w.id),
    gear: { tag: 'wooden weapon', enh: REVELATION_ENH, masterwork: level => level >= 3, proficient: true,
      note: 'Your wooden weapon (revelation): lasts 1 minute per oracle level, 3 + Charisma modifier times a day.' } }],
  warpriest: [{ key: 'focus', label: 'Focus weapon', fromLevel: 1,
    hint: 'Weapon Focus with it as a bonus feat; sacred weapon damage dice with it (1d6, growing with your level) when they beat its own.',
    weapons: w => !w.firearm }],
  gunslinger: [{ key: 'gunsmith', label: 'Starting gun (gunsmith)', fromLevel: 1,
    hint: 'A blunderbuss, musket or pistol, battered: only you can use it properly. It is added to your weapons for free.',
    weapons: STARTING_GUNS, gear: BATTERED }, ...[5, 9, 13, 17].map((lv, i) => ({ key: `gun${i + 1}`, label: `Gun training (${['1st', '2nd', '3rd', '4th'][i]} firearm)`, fromLevel: lv,
    hint: 'Add your Dexterity modifier on damage rolls with this type of firearm (its misfire value rises by 2 instead of 4).',
    weapons: w => !!w.firearm }))],
  'rogue-unchained': [3, 11, 19].map((lv, i) => ({ key: `finesse${i + 1}`, label: `Finesse training (${['1st', '2nd', '3rd'][i]} weapon)`, fromLevel: lv,
    hint: 'Add your Dexterity modifier instead of Strength on damage with this weapon.',
    weapons: w => w.group !== 'ranged' && (w.finesse || w.group === 'light') })),
  samurai: [{ key: 'expertise', label: 'Weapon expertise', fromLevel: 3,
    hint: 'Draw it as a free action; +2 on rolls to confirm critical hits with it (not counted); samurai levels count as fighter levels for its feats.',
    weapons: w => ['katana', 'longbow', 'naginata', 'wakizashi'].includes(w.id) }],
};

// The choices to make for a class's archetypes at a class level: [{ archetype, key, label, hint, weapons, id: saved key }].
export function archetypeChoices(archetypeIds = [], classLevel = 0) {
  return archetypeIds.flatMap(a => (ARCH_CHOICES[a] || []).filter(c => classLevel >= c.fromLevel)
    .map(c => ({ ...c, archetype: a, id: `${a}:${c.key}` })));
}

// The choice sources open to a class: itself, its archetypes, and its chosen talents ("talent:" + id; talents are saved
// by slot, "class|kind|level").
export const choiceSources = (clsId, archetypes = {}, talents = {}) => [clsId, ...(archetypes[clsId] || []),
  ...Object.entries(talents).filter(([slot, id]) => slot.split('|')[0] === clsId && typeof id === 'string').map(([, id]) => `talent:${id}`)];

// What the choices give, for every class: { feats: [{ name, weapon, from }], proficient: [weapon ids],
// blades: [{ weapon, level }], gear: [{ id, weapon, tag, enh, masterwork, proficient, material, note }] }.
// counts: [{ cls, level }]; archetypes: state.archetypes; choices: state.archChoices; talents: state.talents.
export function archetypeChoiceEffects(counts, archetypes = {}, choices = {}, talents = {}) {
  const out = { feats: [], proficient: [], blades: [], gear: [], picks: { focus: null, gun: [], finesse: [], expertise: null } };
  for (const { cls, level } of counts) {
    for (const c of archetypeChoices(choiceSources(cls.id, archetypes, talents), level)) {
      const weapon = choices[c.id];
      if (!weapon) continue;
      if (c.gear) {
        const g = c.gear;
        out.gear.push({ id: c.id, weapon, tag: g.tag, enh: g.enh(level), masterwork: !!g.masterwork?.(level), proficient: !!g.proficient,
                        material: g.material?.(level) || '', note: g.note || '' });
        if (g.proficient) out.proficient.push(weapon);
      }
      if (c.archetype === 'spiritualist-phantom-blade') out.feats.push({ name: 'Alertness', from: 'Phantom weapon (while you wield it)' });
      if (c.archetype === 'magus-kensai') {
        out.proficient.push(weapon);
        out.feats.push({ name: 'Weapon Focus', weapon, from: 'Kensai' });
      }
      if (c.archetype === 'warpriest') { out.picks.focus = weapon; out.feats.push({ name: 'Weapon Focus', weapon, from: 'Warpriest focus weapon' }); }
      if (c.archetype === 'gunslinger' && /^gun\d/.test(c.key)) out.picks.gun.push(weapon);
      if (c.archetype === 'rogue-unchained') out.picks.finesse.push(weapon);
      if (c.archetype === 'samurai') out.picks.expertise = weapon;
      if (c.archetype === 'magus-bladebound') {
        out.blades.push({ weapon, level });
        // Alertness (Ex): while wielding the black blade, the magus has the Alertness feat.
        out.feats.push({ name: 'Alertness', from: 'Black blade (while you wield it)' });
      }
    }
  }
  return out;
}

// Kensai numbers (class-features.js): iaijutsu (7th: Intelligence modifier on initiative, minimum 0) and canny defense
// (1st: Intelligence bonus, up to the magus level, as a dodge bonus to AC with no armor or shield, wielding the chosen
// weapon). Effects in the custom-effect shape.
export function kensaiEffects(counts, archetypes = {}, { mod = {}, armor = false, shield = false } = {}) {
  const level = counts.filter(e => (archetypes[e.cls.id] || []).includes('magus-kensai')).reduce((n, e) => n + e.level, 0);
  const out = [];
  if (!level) return out;
  if (level >= 7 && mod.int > 0) out.push({ name: 'Iaijutsu (kensai)', target: 'init', type: 'untyped', value: mod.int, on: true, classFeature: true });
  if (!armor && !shield && mod.int > 0) out.push({ name: 'Canny defense (kensai, with your chosen weapon)', target: 'ac', type: 'dodge', value: Math.min(mod.int, level), on: true, classFeature: true });
  return out;
}

// An archetype that has Diminished Spellcasting (kensai...): one fewer spell per day of each level.
export const diminishedSpellcasting = archetypeList => archetypeList.some(a => (a.features || []).some(f => /^diminished spellcasting/i.test(f.name)));
