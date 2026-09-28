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
export function rollSpec(spec, rng = randomDie) {
  const lines = [];
  for (const g of spec.groups) {
    const prefix = g.label ? `${g.label}: ` : '';
    if (!g.attacks?.length) {
      // No attack roll: damage (a fireball, magic missiles), or just a check or save with no damage.
      for (let i = 0; i < (g.times || 1); i++) {
        const dmg = g.damage ? rollDamage(g.damage, rng) : null;
        if (dmg) lines.push(`${prefix}${(g.times || 1) > 1 ? `#${i + 1} ` : ''}${g.heal ? 'healing' : 'damage'} ${dmg.text}`);
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
      let text = `${prefix}Attack${n}: ${atk.text}${atk.natural === 20 ? ' (natural 20: hits)' : ''}`;
      let times = 1;
      if (atk.natural >= (g.threat || 20)) {
        const confirm = rollD20(bonus, rng);
        text += `, critical threat! Confirm: ${confirm.text}`;
        times = g.mult || 2;
        text += ` (if it hits AC, ×${times} damage)`;
      }
      const dmg = rollDamage(g.damage, rng);
      if (dmg) {
        text += `. ${g.heal ? 'Healing' : 'Damage'} ${dmg.text}`;
        if (times > 1) text += `; critical damage ${rollDamage(g.damage, rng, times).text}`;
      }
      lines.push(text);
    });
  }
  return { title: spec.title, lines };
}
