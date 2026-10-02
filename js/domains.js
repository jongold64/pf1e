// Domains (Core Rulebook, Advanced Player's Guide, Ultimate Magic): which classes choose them, how many, which ones,
// and what a chosen domain gives (granted powers and domain spells). No page code here, so it can be tested on its own.
//
// - Cleric: two domains (or subdomains), each with powers and an extra domain spell slot per spell level.
// - Inquisitor: one domain, subdomain or inquisition (powers only; inquisitors get no domain spell slots).
// - Druid: Nature Bond is either an animal companion or one domain: Air, Animal, Earth, Fire, Plant, Water or
//   Weather (or one of their subdomains), or a druid domain (Ultimate Magic); the domain gives a domain spell slot.
// A subdomain replaces one of its domain's powers and some of its spells; it can't be taken with its own domain.

export const DOMAIN_CLASSES = {
  cleric: { count: 2, kinds: ['domain', 'subdomain'], label: 'Domains' },
  inquisitor: { count: 1, kinds: ['domain', 'subdomain', 'inquisition'], label: 'Domain or inquisition' },
  druid: { count: 1, kinds: ['domain', 'subdomain', 'druid'], natureBond: true, label: 'Nature bond domain',
           cleric: ['air', 'animal', 'earth', 'fire', 'plant', 'water', 'weather'] },
};

// The domains a class may choose from.
export function domainChoices(classId, all) {
  const rule = DOMAIN_CLASSES[classId];
  if (!rule) return [];
  return all.filter(d => rule.kinds.includes(d.kind) && (!rule.cleric || d.kind === 'druid'
    || (d.kind === 'domain' ? rule.cleric.includes(d.id) : (d.parents || []).some(p => rule.cleric.includes(p)))));
}

// Why a domain can't be added to the ones chosen ('' if it can): a subdomain and its own domain, or the same domain
// twice through two subdomains, can't go together.
export function domainConflict(d, chosen) {
  for (const o of chosen) {
    if (o.id === d.id) return 'already chosen';
    const mine = d.kind === 'subdomain' ? d.parents || [] : [d.id];
    const theirs = o.kind === 'subdomain' ? o.parents || [] : [o.id];
    if (mine.some(p => theirs.includes(p))) return `goes with ${o.name}, which is the same domain`;
  }
  return '';
}

// What a chosen domain gives: { powers: [{ name, text, level }], spells: { level: name } }. A subdomain uses its first
// associated domain's powers and spells, with its own power in place of the one it replaces and its own spells
// in place of those levels.
export function domainGrants(d, byId) {
  if (d.kind !== 'subdomain') return { powers: d.powers, spells: d.spells };
  const parent = (d.parents || []).map(id => byId.get(id)).find(Boolean);
  if (!parent) return { powers: d.powers, spells: d.spells };
  const replaced = String(d.replaces || '').toLowerCase();
  const kept = parent.powers.filter(p => !replaced || p.name.toLowerCase() !== replaced);
  return { powers: [...kept, ...d.powers], spells: { ...parent.spells, ...d.spells }, parent };
}

// A domain spell's name ("elemental body IV (air only)") -> the spell id, using the spells' names.
export function domainSpellId(name, spellsByName) {
  const plain = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  return spellsByName.get(plain) || spellsByName.get(plain.replace(/^(greater|lesser|mass) (.+)$/, '$2, $1')) || null;
}
