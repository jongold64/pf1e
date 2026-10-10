// Choices some archetypes ask for, and what they give: the kensai's chosen weapon (proficiency and Weapon Focus with it)
// and the bladebound magus's black blade (a free intelligent weapon whose enhancement bonus grows with magus level).
// Saved in state.archChoices as { 'archetype id:key': weapon id }. No page code here, so it can be tested on its own.

// The black blade's progression (Ultimate Magic, Table: Black Blade Progression): from magus level 3, 5, 9, 13, 17, 19.
const BLADE = [[3, 1, 11, 7, 5], [5, 2, 12, 8, 8], [7, 2, 13, 9, 10], [9, 3, 14, 10, 12], [11, 3, 15, 11, 14],
  [13, 4, 16, 12, 16], [15, 4, 17, 13, 18], [17, 5, 18, 14, 22], [19, 5, 19, 15, 24]];
// { enh, int, wisCha, ego } at a magus level (null below 3rd).
export function blackBlade(level) {
  const row = [...BLADE].reverse().find(r => level >= r[0]);
  return row ? { enh: row[1], int: row[2], wisCha: row[3], ego: row[4] } : null;
}

// Each archetype's (or class's, by class id) choices. `weapons`: which weapons can be chosen. `fromLevel`: the class level it's chosen at.
export const ARCH_CHOICES = {
  'magus-kensai': [{ key: 'weapon', label: 'Chosen weapon', fromLevel: 1,
    hint: 'One martial or exotic melee weapon: you are proficient with it and gain Weapon Focus with it (and canny defense, perfect strike and the rest work with it).',
    weapons: w => w.group !== 'ranged' && ['martial', 'exotic'].includes(w.proficiency) }],
  'magus-bladebound': [{ key: 'blade', label: 'Black blade', fromLevel: 3,
    hint: 'A one-handed slashing weapon, a rapier or a sword cane. It is added to your weapons for free; its enhancement bonus grows with your magus level.',
    weapons: w => (w.group === 'one-handed' && /S/.test(w.type || '')) || ['rapier', 'sword-cane'].includes(w.id) }],
  warpriest: [{ key: 'focus', label: 'Focus weapon', fromLevel: 1,
    hint: 'Weapon Focus with it as a bonus feat; sacred weapon damage dice with it (1d6, growing with your level) when they beat its own.',
    weapons: w => !w.firearm }],
  gunslinger: [5, 9, 13, 17].map((lv, i) => ({ key: `gun${i + 1}`, label: `Gun training (${['1st', '2nd', '3rd', '4th'][i]} firearm)`, fromLevel: lv,
    hint: 'Add your Dexterity modifier on damage rolls with this type of firearm (its misfire value rises by 2 instead of 4).',
    weapons: w => !!w.firearm })),
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

// What the choices give, for every class: { feats: [{ name, weapon, from }], proficient: [weapon ids],
// blades: [{ weapon, level }] }. counts: [{ cls, level }]; archetypes: state.archetypes; choices: state.archChoices.
export function archetypeChoiceEffects(counts, archetypes = {}, choices = {}) {
  const out = { feats: [], proficient: [], blades: [], picks: { focus: null, gun: [], finesse: [], expertise: null } };
  for (const { cls, level } of counts) {
    for (const c of archetypeChoices([cls.id, ...(archetypes[cls.id] || [])], level)) {
      const weapon = choices[c.id];
      if (!weapon) continue;
      if (c.archetype === 'magus-kensai') {
        out.proficient.push(weapon);
        out.feats.push({ name: 'Weapon Focus', weapon, from: 'Kensai' });
      }
      if (c.archetype === 'warpriest') { out.picks.focus = weapon; out.feats.push({ name: 'Weapon Focus', weapon, from: 'Warpriest focus weapon' }); }
      if (c.archetype === 'gunslinger') out.picks.gun.push(weapon);
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
