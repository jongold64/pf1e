// A character's deity (data/deities.json): which domains and subdomains a cleric or inquisitor of that deity may
// choose, and the deity's favored weapon (a cleric, warpriest or inquisitor is proficient with it). No page code here.

// The classes that choose a deity (on their block on the Classes tab).
export const DEITY_CLASSES = ['cleric', 'warpriest', 'inquisitor'];
// state.deity for a cleric who serves an ideal or philosophy instead (any domains, no favored weapon).
export const NO_DEITY = 'none';

const norm = s => String(s || '').toLowerCase().replace(/\s*\*$/, '').trim();

// Why a domain or subdomain can't be chosen with this deity ('' if it can). deity: a deities.json record (or null).
// A subdomain listed with its domain ("Archon (Good)") only counts for that domain.
export function deityDomainWhy(deity, d) {
  if (!deity || d.kind === 'inquisition' || d.kind === 'druid') return '';
  if (d.kind === 'domain') return deity.domains.some(x => norm(x) === norm(d.name)) ? '' : `not a domain of ${deity.name}`;
  const ok = deity.subdomains.some(x => norm(x.replace(/\s*\(.*\)\s*$/, '')) === norm(d.name));
  return ok ? '' : `not a subdomain of ${deity.name}`;
}

// The deity's favored weapon(s) as weapon ids ("Longsword", "Heavy mace", "Unarmed strike"; words in any order).
export function favoredWeaponIds(deity, weapons = []) {
  if (!deity?.weapon) return [];
  const key = s => norm(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const wanted = deity.weapon.split(/\s*(?:,|\bor\b|\band\b)\s*/).map(key).filter(Boolean);
  return weapons.filter(w => wanted.includes(key(w.name))).map(w => w.id);
}
