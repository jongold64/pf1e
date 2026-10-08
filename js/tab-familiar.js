// Familiar card (Character tab): shown when the character has a familiar (a wizard's arcane bond, a witch's familiar, an
// Arcane bloodline sorcerer's arcane bond). Its statistics at the master's level (familiar.js), with Roll buttons and
// Details for its special abilities and the creature's own text.
import { $, esc, signed, paragraphs, facts } from './dom.js';
import { rollButton } from './roll-ui.js';
import { familiarStats, FAMILIAR_ABILITIES } from './familiar.js';

const ABILITY_NAMES = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export function renderFamiliar(app, view) {
  const card = $('familiar-card');
  const f = view.familiar;
  card.hidden = !f?.path;
  if (card.hidden) return;
  if (!f.path.stats) {
    $('familiar-level').textContent = '';
    $('familiar').innerHTML = `<p><b>${esc(f.path.name)}</b></p><p class="hint">Its statistics aren't in the data (the Bestiary page it shares with another creature); use that creature's stat block with the familiar rules.</p>`;
    return;
  }
  const { path, master } = f;
  const s = familiarStats(path.stats, master);
  const box = $('familiar');
  const openKeys = new Set([...box.querySelectorAll('details[open][data-key]')].map(d => d.dataset.key));
  const fold = (key, title, html) => `<details data-key="${esc(key)}"${openKeys.has(key) ? ' open' : ''}><summary>${esc(title)}</summary>${html}</details>`;
  const roll = (label, n) => rollButton({ title: `${path.name}: ${label}`, check: label, plain: true, groups: [{ attacks: [n] }] });
  $('familiar-level').textContent = `master level ${s.level}`;
  const st = path.stats;
  const defense = [
    ['Hit points', `${s.hp} <small class="muted">(half your ${master.hp}; ${s.hd} Hit Dice for effects)</small>`],
    ['AC', `${s.ac} <small class="muted">touch ${s.touch}, flat-footed ${s.flat}; natural armor +${s.natAdj} from you</small>`],
    ['Fortitude', `${signed(s.saves.fort)}${roll('Fortitude', s.saves.fort)}`],
    ['Reflex', `${signed(s.saves.ref)}${roll('Reflex', s.saves.ref)}`],
    ['Will', `${signed(s.saves.will)}${roll('Will', s.saves.will)}`],
    ['Speed', esc(st.speed || '—')], ['Size', esc(`${st.size}; space ${st.space || '—'}, reach ${st.reach || '—'}`)],
    ['Type', esc(s.type)], ['Base attack', `${signed(s.bab)} <small class="muted">(yours)</small>`],
    ...(s.cmb !== null ? [['CMB / CMD', `${signed(s.cmb)} / ${s.cmd}`]] : []),
    ...(s.sr ? [['Spell resistance', String(s.sr)]] : []),
    ...(st.defenses ? [['Defenses', esc(st.defenses)]] : []),
    ...(st.senses ? [['Senses', esc(st.senses)]] : []),
  ];
  const scores = Object.entries(s.scores).map(([a, v]) => `<td><b>${ABILITY_NAMES[a]}</b> ${v === null || v === undefined ? '—' : `${v} <small class="muted">(${signed(s.mod[a])})</small>`}</td>`).join('');
  const skills = s.skills.map(k => `<tr><td>${esc(k.name)} <small class="muted">${esc(k.from)}</small></td><td class="total">${signed(k.total)}${roll(k.name, k.total)}</td></tr>`).join('');
  const abilities = s.abilities.map(a => fold(`fa-${a}`, a, `<p>${esc(FAMILIAR_ABILITIES[a] || '')}</p>`)).join('');
  const warn = path.improved && master.casterLevel < (path.min_level || 1)
    ? `<p class="warning">An improved ${esc(path.name.toLowerCase())} needs arcane caster level ${path.min_level} (yours is ${master.casterLevel}).</p>` : '';
  box.innerHTML = `<p><b>${esc(path.name)}</b> <small class="muted">${esc([st.alignment, st.size, st.type].filter(Boolean).join(' '))} · ${esc(path.source)}${path.improved ? ' · improved familiar' : ''}</small></p>
    ${warn}
    <div class="companion-grid">
      <div><h3>Defense and movement</h3><dl class="facts">${defense.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
      <div><h3>Attacks</h3>${s.melee ? `<p><b>Melee</b> ${esc(s.melee)}</p>` : ''}${s.ranged ? `<p><b>Ranged</b> ${esc(s.ranged)}</p>` : ''}
        ${!s.melee && !s.ranged ? '<p class="hint">No attacks listed.</p>' : '<p class="hint">Attack bonuses use your base attack bonus; damage as the creature’s.</p>'}
        ${st.special_attacks ? `<p><b>Special attacks:</b> ${esc(st.special_attacks)}</p>` : ''}
        ${st.sq ? `<p><b>Special qualities:</b> ${esc(st.sq)}</p>` : ''}
        ${st.languages ? `<p><b>Languages:</b> ${esc(st.languages)}</p>` : ''}</div>
    </div>
    <h3>Ability scores</h3><table class="companion-scores"><tr>${scores}</tr></table>
    <div class="companion-grid">
      <div><h3>Skills</h3>${skills ? `<table class="companion-skills">${skills}</table>` : '<p class="hint">None listed.</p>'}
        <p class="hint">It uses your skill ranks where they're better than its own, with its own modifiers; Acrobatics, Climb, Fly,
          Perception, Stealth and Swim are its class skills.</p></div>
      <div><h3>Familiar abilities</h3><div class="companion-specials">${abilities}</div>
        ${st.feats?.length ? `<p><b>Feats:</b> ${esc(st.feats.join(', '))}</p>` : ''}
        ${st.abilities ? fold('fa-own', 'Its own special abilities', paragraphs(st.abilities)) : ''}</div>
    </div>`;
}
