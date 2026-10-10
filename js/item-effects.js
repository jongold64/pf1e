// Magic items' effects: which Active effects (effects.js BUFFS) a magic item you own gives while you wear or hold it, for
// the "From your magic items" list on the Active effects card. The catalog entries made for an item (ref.item = its name)
// are its bonuses; the core items' entries and the spells some items give are listed here.
import { BUFFS, buffById } from './effects.js';

// The core items' catalog entries (effects.js, which have no ref.item), by item id.
const CORE = {
  'belt-of-giant-strength': 'belt-str', 'belt-of-incredible-dexterity': 'belt-dex', 'belt-of-mighty-constitution': 'belt-con',
  'headband-of-vast-intelligence': 'headband-int', 'headband-of-inspired-wisdom': 'headband-wis', 'headband-of-alluring-charisma': 'headband-cha',
  'ring-of-protection': 'ring-of-protection', 'amulet-of-natural-armor': 'amulet-of-natural-armor', 'cloak-of-resistance': 'cloak-of-resistance',
  'bracers-of-armor': 'bracers-of-armor', 'boots-of-striding-and-springing': 'boots-of-striding',
};

// Items that give a spell's benefits: always (bracers of falcon's aim), or `when` used (offered switched off).
const SPELLS = {
  'bracers-of-falcons-aim': [{ buff: 'aspect-of-the-falcon' }],
  'boots-of-speed': [{ buff: 'haste', when: 'when you click your heels (10 rounds a day)' }],
  'mithral-full-plate-of-speed': [{ buff: 'haste', when: 'when activated (10 rounds a day)' }],
  'drums-of-haste': [{ buff: 'haste', when: 'when played (DC 20 Perform)' }],
  'rod-of-alertness': [{ buff: 'prayer', when: 'when planted and willed to alertness' }],
  'suzerain-scepter': [{ buff: 'good-hope', when: 'once a day, on command' }],
  'war-drums-of-savagery': [{ buff: 'rage', when: 'while the drums are beaten' }],
  'book-of-marvelous-recipes': [{ buff: 'heroes-feast', when: 'after eating the meal it helps cook' }],
  'juggernauts-pauldrons': [{ buff: 'enlarge-person', when: 'on command' }, { buff: 'deadly-juggernaut', when: 'after you kill a foe (3 times a day)' }],
  'drinking-horn-of-bottomless-valor': [{ buff: 'enlarge-person', when: 'after drinking 2 or 3 charges' }, { buff: 'heroism', when: 'after drinking 3 charges' }],
};

// An ioun stone's color, from its catalog name ("Ioun stone: pink and green sphere" -> "pink and green").
const iounColor = buff => buff.name.replace(/^.*?:\s*/, '').replace(/\s*\(.*\)$/, '').split(' ').slice(0, -1).join(' ');

// What an item gives, as rows: { key, buff } (one effect), or { key: 'pick', choices } (a belt of physical might: you
// choose which two abilities); `when`: only sometimes (starts switched off).
export function itemEffects(item, option) {
  const name = item.name.toLowerCase();
  // (By the item's id where two items share a name: Brawling armor and Brawling weapons.)
  let catalog = BUFFS.filter(b => b.ref?.item && (b.ref.id ? b.ref.id === item.id : b.ref.item.toLowerCase() === name));
  // Ioun stones: the stone's color is the option bought.
  if (name.startsWith('ioun stone')) {
    catalog = BUFFS.filter(b => b.id.startsWith('ioun-') && iounColor(b) === String(option || '').toLowerCase());
  }
  const rows = [];
  if (catalog.length > 1) rows.push({ key: 'pick', choices: catalog.map(b => b.id) });
  else if (catalog.length) rows.push({ key: catalog[0].id, buff: catalog[0].id, ...(catalog[0].when ? { when: catalog[0].when } : {}) });
  if (CORE[item.id]) rows.push({ key: CORE[item.id], buff: CORE[item.id] });
  for (const x of SPELLS[item.id] || []) rows.push({ key: x.buff, ...x });
  return rows.filter(r => (r.choices || [r.buff]).every(id => buffById.has(id)));
}

// The effect a row gives with the item's choices: the chosen one of a `pick` row.
export const rowBuff = (row, entry) => (row.choices ? (row.choices.includes(entry.pick) ? entry.pick : row.choices[0]) : row.buff);

// The amount an item's effect gives: a "+4" belt's +4 (the option bought), or the item's caster level for a spell.
export function itemAmount(buff, item, option) {
  if (buff.levels) {
    const n = Number(String(option || '').replace(/^\+/, ''));
    return buff.levels.includes(n) ? n : buff.levels[0];
  }
  return Math.min(20, Math.max(1, Number(item.cl) || 1));
}

// Whether a row is counted now: the item is worn (not unticked: entry.off), and a `when` row is switched on (entry.on).
export const rowOn = (row, entry) => !entry.off && (!row.when || (entry.on || []).includes(row.key));

// The effects your magic items give now, as buffs ({ id, cl, label }) to add to the ones you switched on.
// The same effect twice at the same amount (two pairs of boots of speed) counts once.
export function itemBuffs(entries = [], itemsById) {
  if (!itemsById) return [];
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    const item = itemsById.get(e.id);
    if (!item) continue;
    const itemName = `${item.name}${e.option || e.where ? ` (${[e.option, e.where && `on your ${e.where}`].filter(Boolean).join(', ')})` : ''}`;
    for (const row of itemEffects(item, e.option)) {
      if (!rowOn(row, e)) continue;
      const buff = buffById.get(rowBuff(row, e));
      const cl = itemAmount(buff, item, e.option);
      if (seen.has(`${buff.id}|${cl}`)) continue;
      seen.add(`${buff.id}|${cl}`);
      out.push({ id: buff.id, cl, label: buff.group === 'item' ? itemName : `${itemName}: ${buff.name.toLowerCase()}` });
    }
  }
  return out;
}

// The special abilities on the armor and shield you wear and on your weapons, as entries like magic items' ({ id, option,
// on }), with `ref` ('armor:<j>', 'shield:<j>', 'weapon:<i>:<j>') and `where` (what they're on). Weapon abilities' bonuses
// only apply while you wield it, so they are all switched on by hand (catalog `when`).
export function abilityEntries(state, weaponsById) {
  const of = (list, ref, where) => (list || []).map((a, j) => ({ id: a.id, ...(a.option ? { option: a.option } : {}), ...(a.on ? { on: a.on } : {}), ref: `${ref}:${j}`, where }));
  return [...(state.armorId ? of(state.armorAbilities, 'armor', 'armor') : []), ...(state.shieldId ? of(state.shieldAbilities, 'shield', 'shield') : []),
    ...state.weapons.flatMap((w, i) => of(w.abilities, `weapon:${i}`, weaponsById?.get(w.id)?.name.toLowerCase() || 'weapon'))];
}
