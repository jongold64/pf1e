// Dice rolling for the Roll buttons. `rng(sides)` returns 1..sides; tests pass their own.
// No page code here, so it can be tested on its own.

export function randomDie(sides) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % sides) + 1;
}

// Rolls a damage expression like "1d8+4", "2d6+9 fire" or "3 missiles of 1d4+1" (only the "NdM ± N" part is
// used). `times` rolls it that many times and adds them up, as a critical hit does.
// Returns { total, text: "1d8 (5) + 4 = 9" } or null when there's nothing to roll.
export function rollDamage(expr, rng = randomDie, times = 1) {
  const s = String(expr).trim();
  // A fixed amount ("110" hit points healed).
  if (/^\d+(\s|$)/.test(s) && !/^\d+d/.test(s)) {
    const n = Number(s.match(/^\d+/)[0]) * times;
    return { total: n, text: String(n) };
  }
  const m = s.match(/\d+d\d+(?:\s*[+-]\s*(?:\d+d\d+|\d+))*/);
  if (!m) return null;
  const terms = m[0].replace(/\s+/g, '').match(/[+-]?(\d+d\d+|\d+)/g);
  let total = 0;
  const shown = [];
  for (let t = 0; t < times; t++) {
    for (const term of terms) {
      const sign = term.startsWith('-') ? -1 : 1;
      const body = term.replace(/^[+-]/, '');
      let value;
      if (body.includes('d')) {
        const [count, sides] = body.split('d').map(Number);
        const rolls = Array.from({ length: count }, () => rng(sides));
        value = rolls.reduce((a, b) => a + b, 0);
        shown.push(`${shown.length ? (sign < 0 ? '- ' : '+ ') : ''}${body} (${rolls.join(', ')})`);
      } else {
        value = Number(body);
        shown.push(`${sign < 0 ? '-' : '+'} ${body}`);
      }
      total += sign * value;
    }
  }
  // Damage is at least 1 even with a penalty (Core Rulebook, Damage).
  total = Math.max(1, total);
  return { total, text: `${shown.join(' ')} = ${total}` };
}

// A d20 roll with a bonus: { natural, total, text: "d20 (14) +6 = 20" }.
export function rollD20(bonus, rng = randomDie) {
  const natural = rng(20);
  const total = natural + bonus;
  return { natural, total, text: `d20 (${natural}) ${bonus < 0 ? '-' : '+'} ${Math.abs(bonus)} = ${total}` };
}

// Rolls what a Roll button describes. spec: { title, groups: [{ label, attacks: [bonus, ...] (empty for no attack
// roll), damage: "1d8+4" | null, threat: 19, mult: 2, times: 1 }] }. A natural 20 always hits and a natural 1
// always misses; a natural roll in the threat range is confirmed with another attack roll, and a confirmed critical
// rolls the damage `mult` times. Returns { title, lines: [text] }.
// options.maxHealing (house rule): healing groups (heal: true) give their maximum instead of being rolled.
// options.autoCrit (house rule): a natural 20 is a confirmed critical, with no confirmation roll (other threats still roll).
// Extra damage from weapon special abilities: `extra` dice on every hit (never multiplied), and `burst` dice on a
// confirmed critical, rolled once per step of the multiplier above x1 (`steps`). Returns { total, text } or null.
function rollExtras(g, steps, rng) {
  const parts = [];
  let total = 0;
  for (const x of g.extra || []) {
    const r = rollDamage(x.dice, rng);
    if (r) { total += r.total; parts.push(`${x.type || 'extra'} ${r.text}`); }
  }
  for (const x of steps > 0 ? g.burst || [] : []) {
    const r = rollDamage(x.dice, rng, steps);
    if (r) { total += r.total; parts.push(`${x.type ? `${x.type} ` : ''}burst ${r.text}`); }
  }
  return parts.length ? { total, text: parts.join('; ') } : null;
}

// Lines starting with a tab belong under the line above (an attack's confirmation roll and damage); the panel indents them.
export function rollSpec(spec, rng = randomDie, options = {}) {
  const lines = [];
  const under = text => lines.push(`	${text}`);
  for (const g of spec.groups) {
    const maxed = options.maxHealing && g.heal;
    const dmgRng = maxed ? sides => sides : rng;
    const tag = maxed ? ' (Max Healing)' : '';
    const prefix = g.label ? `${g.label}: ` : '';
    if (!g.attacks?.length) {
      // No attack roll: damage (a fireball, magic missiles), or just a check or save with no damage.
      // `critMult` rolls critical damage: the damage rolled that many times and added up.
      if (g.critMult && g.damage) {
        const dmg = rollDamage(g.damage, rng, g.critMult);
        const more = rollExtras(g, g.critMult - 1, rng);
        if (dmg) lines.push(`${prefix}critical damage (×${g.critMult}) ${dmg.text}${more ? `; plus ${more.text} → ${dmg.total + more.total} in all` : ''}`);
        continue;
      }
      for (let i = 0; i < (g.times || 1); i++) {
        const dmg = g.damage ? rollDamage(g.damage, dmgRng) : null;
        const more = dmg ? rollExtras(g, 0, rng) : null;
        if (dmg) lines.push(`${prefix}${(g.times || 1) > 1 ? `#${i + 1} ` : ''}${g.word || (g.heal ? 'healing' : 'damage')} ${dmg.text}${tag}`
          + (more ? `; plus ${more.text} → ${dmg.total + more.total} in all` : ''));
      }
      continue;
    }
    g.attacks.forEach((bonus, i) => {
      const atk = rollD20(bonus, rng);
      const n = g.attacks.length > 1 ? ` ${i + 1}` : '';
      if (!g.damage) {
        // Skill checks have no automatic success or failure, so naturals aren't pointed out (spec.plain).
        const natural = spec.plain ? '' : atk.natural === 20 ? ' (natural 20)' : atk.natural === 1 ? ' (natural 1)' : '';
        lines.push(`${prefix}${spec.check || 'Roll'}${n}: ${atk.text}${natural}`);
        return;
      }
      if (atk.natural === 1) {
        lines.push(`${prefix}Attack${n}: ${atk.text}, natural 1: miss`);
        return;
      }
      // The attack on its line; its confirmation roll, damage and critical damage each on a line under it.
      const threat = atk.natural >= (g.threat || 20);
      lines.push(`${prefix}Attack${n}: ${atk.text}${atk.natural === 20 ? ' (natural 20: hits)' : ''}${threat ? ', critical threat!' : ''}`);
      let times = 1;
      if (threat) {
        times = g.mult || 2;
        if (options.autoCrit && atk.natural === 20) under(`Natural 20: critical hit, no confirmation roll (Auto-Crit house rule), ×${times} damage`);
        else {
          const confirm = rollD20(bonus, rng);
          under(`Confirm: ${confirm.text} (if it hits AC, ×${times} damage)`);
        }
      }
      const dmg = rollDamage(g.damage, dmgRng);
      if (dmg) {
        const more = rollExtras(g, 0, rng);
        under(`${g.heal ? 'Healing' : 'Damage'} ${dmg.text}${more ? `; plus ${more.text} → ${dmg.total + more.total} in all` : ''}`);
        if (times > 1) {
          const crit = rollDamage(g.damage, rng, times);
          const critMore = rollExtras(g, times - 1, rng);
          under(`Critical damage ${crit.text}${critMore ? `; plus ${critMore.text} → ${crit.total + critMore.total} in all` : ''}`);
        }
      }
    });
  }
  return { title: spec.title, lines };
}
