// Prestige class requirements: read from the class's "requirements" text and checked like feat prerequisites.
// No page code here, so it can be tested on its own.
import { checkPrereq } from './feats.js';
import { spellsPerDay } from './rules.js';
import { tradition } from './multiclass.js';

const ORDINAL = '(\\d)(?:st|nd|rd|th)';

// Split "A, B (x or y), C" on commas that aren't inside brackets.
function splitList(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/\.$/, '')).filter(Boolean);
}

// One requirement line ({ name, text }) -> prerequisite objects (the feat-prerequisite shapes, plus
// { type: 'casting', tradition, level } and { type: 'text' } for things the app can't check).
export function parseRequirement({ name, text }) {
  const n = name.toLowerCase();
  const t = text.trim().replace(/\.$/, '');
  if (n === 'base attack bonus') {
    const m = t.match(/\+(\d+)/);
    return m ? [{ type: 'bab', value: Number(m[1]) }] : [{ type: 'text', text: `${name}: ${t}` }];
  }
  if (n === 'feats') {
    return splitList(t).map(part => {
      if (/^any /i.test(part)) return { type: 'text', text: `Feats: ${part}` };
      const options = part.split(/\s+or\s+(?![^(]*\))/).map(x => ({ type: 'feat', feat: x.replace(/\s*\(.*\)$/, '').trim() }));
      return options.length > 1 ? { type: 'any_of', options, text: part } : options[0];
    });
  }
  if (n === 'skills') {
    return splitList(t).map(part => {
      const m = part.match(/^(.+?) (\d+) ranks?$/);
      return m && !/any/i.test(m[1]) ? { type: 'skill', skill: m[1], ranks: Number(m[2]) } : { type: 'text', text: `Skills: ${part}` };
    });
  }
  if (n === 'spells' || n === 'spellcasting') {
    const found = [...t.matchAll(new RegExp(`${ORDINAL}[- ]level (arcane|divine) spells`, 'gi'))]
      .map(m => ({ type: 'casting', tradition: m[2].toLowerCase(), level: Number(m[1]) }));
    const extracts = t.match(new RegExp(`${ORDINAL}[- ]level extracts`, 'i'));
    if (extracts) found.push({ type: 'casting', tradition: 'alchemist', level: Number(extracts[1]) });
    const atLeast = t.match(/(arcane|divine) spell of (\d)(?:st|nd|rd|th) level or higher/i);
    if (atLeast) found.push({ type: 'casting', tradition: atLeast[1].toLowerCase(), level: Number(atLeast[2]) });
    // Parts the app can't check (e.g. "able to cast mage hand", "without preparation") are listed too.
    const extra = /mage hand|without preparation|divination|draconic/i.test(t) ? [{ type: 'text', text: `Spells: ${t}` }] : [];
    return found.length ? [...found, ...extra] : [{ type: 'text', text: `Spells: ${t}` }];
  }
  if (n === 'weapon proficiency' && /all martial weapons/i.test(t)) return [{ type: 'martial' }];
  if (n === 'special') {
    return splitList(t.replace(/\*/g, '')).flatMap(part => {
      if (/proficiency with light and medium armor/i.test(part)) {
        return [{ type: 'feat', feat: 'Armor Proficiency, Light' }, { type: 'feat', feat: 'Armor Proficiency, Medium' }];
      }
      const m = part.match(/^(.+?) class features?$/i);
      if (m) return m[1].split(/\s+and\s+/).map(f => ({ type: 'class_feature', feature: f.trim().toLowerCase() }));
      const sneak = part.match(/^sneak attack \+(\d)d6$/i);
      if (sneak) return [{ type: 'class_feature', feature: 'sneak attack', text: part }];
      return [{ type: 'text', text: `Special: ${part}` }];
    });
  }
  if (n === 'race' && /nondragon/i.test(t)) return [];  // no playable race is a dragon
  return [{ type: 'text', text: `${name}: ${t}` }];
}

// Highest spell level each tradition can cast, from the casting classes ([{ cls, effectiveLevel }]).
export function castingByTradition(casting, scores) {
  const out = { arcane: -1, divine: -1, psychic: -1, alchemist: -1 };
  for (const c of casting) {
    const kind = tradition(c.cls.id);
    if (!kind) continue;
    for (const r of spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores })?.rows || []) {
      if (r.canCast && ((r.total ?? 0) > 0 || (r.known ?? 0) > 0)) out[kind] = Math.max(out[kind], r.spellLevel);
    }
  }
  return out;
}

// Checks a prestige class's requirements. ctx is a feat context (featContext) for the character before its
// first level in the prestige class; `byTradition` is castingByTradition for those levels; `martial` says
// whether any class gives proficiency with all martial weapons.
// Returns { status: 'met' | 'unmet' | 'unknown', parts: [{ status, why }] }.
export function checkRequirements(prestige, ctx, byTradition, martial) {
  const parts = (prestige.requirements || []).flatMap(parseRequirement).map(p => {
    if (p.type === 'text') return { status: 'unknown', why: p.text };
    if (p.type === 'casting') {
      const what = p.tradition === 'alchemist' ? `Create ${p.level}${['th', 'st', 'nd', 'rd'][p.level] || 'th'}-level extracts`
        : `Cast ${p.level}${['th', 'st', 'nd', 'rd'][p.level] || 'th'}-level ${p.tradition} spells`;
      return { status: byTradition[p.tradition] >= p.level ? 'met' : 'unmet', why: what };
    }
    if (p.type === 'martial') return { status: martial ? 'met' : 'unmet', why: 'Proficient with all martial weapons' };
    const r = checkPrereq(p, ctx, {});
    return p.text ? { ...r, why: p.text } : r;
  });
  const status = parts.some(x => x.status === 'unmet') ? 'unmet' : parts.some(x => x.status === 'unknown') ? 'unknown' : 'met';
  return { status, parts };
}
