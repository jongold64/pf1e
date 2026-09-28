// Numbers for a chosen spell: attack bonus, damage or healing at the caster's level, number of rays or missiles,
// and save DC. Spells carry `actions` from the data build (Foundry roll formulas such as "(min(10, @cl))d6").
// No page code here, so it can be tested on its own.
import { CASTING_ABILITY, SIZE_AC } from './rules.js';
import { casterLevel } from './feats.js';

const SAVES = { fort: 'Fortitude', ref: 'Reflex', will: 'Will' };
const FUNCS = {
  min: Math.min, mins: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};

// A value is { n: number, dice: { sides: count } } so "1d8 + min(5, @cl)" can be added up.
const num = n => ({ n, dice: {} });
const numeric = v => Object.keys(v.dice).length === 0;

// Evaluates a Foundry roll formula with the given variables ({ cl: 5 }) to text like "5d6", "1d8+5" or "150".
// Returns null for formulas it doesn't understand.
export function evalFormula(formula, vars = {}) {
  const src = String(formula).replace(/\[[^\]]*\]/g, '').replace(/@(\w+)/g, (_, k) => String(vars[k] ?? 0));
  const tokens = src.match(/\d+(?:\.\d+)?|[a-z]+|[()+\-*/,]/gi);
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null;
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = t => { if (next() !== t) throw new Error(`expected ${t}`); };

  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = term();
      v = { n: v.n + (op === '+' ? r.n : -r.n), dice: { ...v.dice } };
      for (const [s, c] of Object.entries(r.dice)) v.dice[s] = (v.dice[s] || 0) + (op === '+' ? c : -c);
    }
    return v;
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = factor();
      if (!numeric(v) || !numeric(r)) throw new Error('dice in * or /');
      v = num(op === '*' ? v.n * r.n : v.n / r.n);
    }
    return v;
  }
  function factor() {
    let v;
    const t = next();
    if (t === '-') v = num(-factor().n);
    else if (t === '(') { v = expr(); expect(')'); }
    else if (/^\d/.test(t)) v = num(Number(t));
    else if (/^[a-z]+$/i.test(t) && FUNCS[t.toLowerCase()] && peek() === '(') {
      next();
      const args = [expr()];
      while (peek() === ',') { next(); args.push(expr()); }
      expect(')');
      if (!args.every(numeric)) throw new Error('dice in a function');
      v = num(FUNCS[t.toLowerCase()](...args.map(a => a.n)));
    } else throw new Error(`unexpected ${t}`);
    // "(min(10, @cl))d6": the value so far is the number of dice (at least one).
    if (peek() && /^d\d*$/i.test(peek())) {
      const d = next();
      const sides = d.length > 1 ? Number(d.slice(1)) : Number(next());
      if (!numeric(v) || !sides) throw new Error('bad dice');
      v = { n: 0, dice: { [sides]: Math.max(1, Math.floor(v.n)) } };
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== tokens.length) return null;
    const dice = Object.entries(v.dice).filter(([, c]) => c).sort((a, b) => b[0] - a[0]).map(([s, c]) => `${c}d${s}`);
    const n = Math.floor(v.n);
    if (!dice.length) return String(n);
    return dice.join('+') + (n ? (n > 0 ? `+${n}` : `${n}`) : '');
  } catch {
    return null;
  }
}

// What the character needs to know about casting a spell as a given class: caster level, casting ability
// modifier, BAB and attack modifiers, and school focus bonuses.
export function spellContext({ cls, effectiveLevel, stats, size, featChoices = [], haveFeats = [] }) {
  const ability = CASTING_ABILITY[cls.id];
  const focus = {};
  for (const c of featChoices) {
    if ((c.feat === 'Spell Focus' || c.feat === 'Greater Spell Focus') && c.value) focus[c.value] = (focus[c.value] || 0) + 1;
  }
  // Spell Penetration and Greater Spell Penetration: +2 each on caster level checks to overcome spell resistance.
  const penetration = (haveFeats.includes('Spell Penetration') ? 2 : 0) + (haveFeats.includes('Greater Spell Penetration') ? 2 : 0);
  return {
    cls, cl: casterLevel(cls, effectiveLevel), castMod: stats.mod[ability] ?? 0, bab: stats.bab[0], mod: stats.mod,
    sizeAttack: SIZE_AC[size] ?? 0, focus, penetration,
  };
}

// The Roll button spec for a caster level check against spell resistance, or null if the spell allows none.
export function srCheck(spell, ctx) {
  if (!/^yes/i.test(spell.spell_resistance || '')) return null;
  const bonus = ctx.cl + ctx.penetration;
  return { title: `${spell.name}: caster level check vs. spell resistance`, check: 'Caster level check', groups: [{ attacks: [bonus] }], bonus };
}

const signed = n => (n >= 0 ? `+${n}` : `${n}`);

// The spell's lines, each { label, text }: "Ranged touch +6, 2 rays of 4d6 fire", "DC 16 Reflex half, 5d6 fire".
export function spellLines(spell, ctx) {
  const level = spell.levels?.[ctx.cls.id];
  const dc = level === undefined ? null : 10 + level + ctx.castMod + (ctx.focus[spell.school] || 0);
  const vars = { cl: ctx.cl };
  const lines = [];
  for (const a of spell.actions || []) {
    const parts = [];
    let attack = null;
    if (a.kind === 'ranged touch' || a.kind === 'ranged') {
      attack = a.auto_hit ? null : ctx.bab + ctx.mod.dex + ctx.sizeAttack;
      parts.push(a.auto_hit ? 'hits automatically' : `${a.kind === 'ranged' ? 'ranged attack' : 'ranged touch'} ${signed(attack)}`);
    } else if (a.kind === 'melee touch' || a.kind === 'melee') {
      attack = ctx.bab + ctx.mod.str + ctx.sizeAttack;
      parts.push(`${a.kind === 'melee' ? 'melee attack' : 'melee touch'} ${signed(attack)}`);
    } else if (a.kind === 'maneuver') {
      parts.push('combat maneuver');
    }
    if (a.save && dc !== null) {
      // Foundry marks a whole spell harmless; the attack half of a cure/inflict spell isn't.
      const harmless = a.harmless && !/touch|melee|ranged/.test(a.kind);
      parts.push(`DC ${dc} ${a.save_text || SAVES[a.save]}${harmless ? ' (harmless)' : ''}`);
    }
    const amounts = (a.damage || []).map(d => ({ amount: evalFormula(d.formula, vars), types: d.types || [] }))
      .filter(d => d.amount !== null);
    const damage = amounts.map(d => `${d.amount}${d.types.length ? ` ${d.types.join('/')}` : ''}`);
    const count = a.extra_attacks ? 1 + Math.max(0, Number(evalFormula(a.extra_attacks, vars)) || 0) : 1;
    if (damage.length) {
      const what = a.kind === 'heal' ? 'heals ' : '';
      const unit = /missile/i.test(spell.name) ? 'missile' : /ray/i.test(spell.name) ? 'ray' : 'attack';
      parts.push(count > 1 ? `${count} ${unit}s of ${damage.join(' + ')}` : what + damage.join(' + '));
    }
    const label = a.name && a.name !== 'Use' && a.name !== 'Cast' ? a.name : '';
    // What the Roll button rolls: an attack roll for each ray (natural 20 threatens a ×2 critical) and the damage,
    // or just the damage (or healing) when there's no attack roll.
    const rollDamage = amounts.map(d => d.amount).join('+') || null;
    let roll = null;
    if (attack !== null && (rollDamage || a.kind !== 'maneuver')) {
      roll = { title: `${spell.name}${label ? `: ${label}` : ''}`, check: 'Attack',
               groups: [{ attacks: Array(count).fill(attack), damage: rollDamage, threat: 20, mult: 2, heal: a.kind === 'heal' }] };
    } else if (rollDamage) {
      roll = { title: `${spell.name}${label ? `: ${label}` : ''}`, groups: [{ attacks: [], damage: rollDamage, times: count, heal: a.kind === 'heal' }] };
    }
    if (parts.length) lines.push({ label, text: parts.join(', '), roll });
  }
  // A save with no action data: the spell's own saving throw line.
  if (!lines.length && dc !== null && spell.saving_throw && !/^none/i.test(spell.saving_throw)) {
    lines.push({ label: '', text: `DC ${dc} ${spell.saving_throw}` });
  }
  return lines;
}
