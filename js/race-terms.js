// The items listed under the Race picker (size, type, speed, each trait), each with an explanation,
// and the small popup card that shows one when it is hovered, focused or tapped.

import { esc } from './dom.js';

const SIZE_TEXT = {
  Small: 'Small creatures get a +1 size bonus to AC and on attack rolls, a −1 penalty to CMB and CMD, and a +4 size '
    + 'bonus on Stealth checks. They take up a 5-foot square, have 5 feet of reach, use Small weapons (which deal '
    + 'less damage) and can carry three-quarters as much as a Medium creature.',
  Medium: 'The standard size: no size bonuses or penalties to AC, attack rolls, CMB, CMD or Stealth. Medium '
    + 'creatures take up a 5-foot square and have 5 feet of reach.',
  Large: 'Large creatures take a −1 size penalty to AC and on attack rolls, get a +1 bonus to CMB and CMD, and take '
    + 'a −4 penalty on Stealth checks. They take up a 10-foot square and use Large weapons (which deal more damage).',
};

const TYPE_TEXT = {
  humanoid: 'Humanoids have a humanlike body: usually two arms, two legs and one head. Spells that affect only '
    + 'humanoids, such as charm person, hold person and enlarge person, work on them.',
  outsider: 'Outsiders are creatures whose origins lie beyond the Material Plane. Player races are native '
    + 'outsiders: born on the Material Plane, they eat, sleep and breathe, and can be raised or resurrected '
    + 'normally. Spells that affect only humanoids, such as charm person and hold person, don\'t work on them.',
  fey: 'Fey are creatures with a strong tie to nature or to some other force or place. They aren\'t humanoids, '
    + 'so spells that affect only humanoids, such as charm person and hold person, don\'t work on them.',
  aberration: 'Aberrations have bizarre anatomy, strange abilities or an alien outlook. They aren\'t humanoids, so '
    + 'spells that affect only humanoids, such as charm person and hold person, don\'t work on them.',
  'monstrous humanoid': 'Monstrous humanoids are similar to humanoids but have monstrous or animalistic features, often '
    + 'with supernatural abilities. Spells that affect only humanoids, such as charm person and hold person, don\'t '
    + 'work on them.',
  plant: 'Plant creatures are living plants. A player race of this type lists what it is immune to in its traits. It '
    + 'isn\'t a humanoid, so spells that affect only humanoids, such as charm person, don\'t work on it.',
  construct: 'Constructs are built rather than born. A player race of this type lists what it is immune to in its '
    + 'traits. It isn\'t a humanoid, so spells that affect only humanoids, such as charm person, don\'t work on it.',
};

const SPEED_TEXT = 'Base speed is how far you can move with one move action (twice that if you spend your whole '
  + 'turn moving). Medium or heavy armor usually lowers it; the Armor tab shows your speed in the armor you wear.';

const capital = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

// [{ label, title, text }] in the order they are listed.
export function raceTerms(race) {
  const traits = race.traits || [];
  const kind = k => traits.find(t => t.kind === k);
  const items = [];
  const sizeTrait = kind('size');
  items.push({ label: race.size, title: `${race.size} size`,
    text: [SIZE_TEXT[race.size], sizeTrait?.text].filter(Boolean) });
  if (race.type) {
    const typeTrait = kind('type');
    items.push({ label: capital(race.type), title: typeTrait ? typeTrait.name : capital(race.type),
      text: [typeTrait?.text, TYPE_TEXT[race.type]].filter(Boolean) });
  }
  const speedTrait = kind('speed');
  items.push({ label: `Speed ${race.base_speed ?? '?'} ft.`, title: speedTrait ? speedTrait.name : 'Speed',
    text: [speedTrait?.text, SPEED_TEXT].filter(Boolean) });
  const ability = kind('ability_scores');
  if (ability) items.push({ label: ability.name, title: 'Ability score modifiers', text: [ability.text] });
  for (const t of traits.filter(t => !t.kind)) items.push({ label: t.name, title: t.name, text: [t.text] });
  const languages = kind('languages');
  if (languages) items.push({ label: 'Languages', title: 'Languages', text: [languages.text] });
  return items;
}

export function termButtons(items) {
  return `<div class="terms">${items.map((it, i) =>
    `<button type="button" class="term" data-term="${i}" aria-expanded="false">${esc(it.label)}</button>`).join('')}</div>`;
}

// Shows the popup for the buttons inside `container`. `getItems()` returns the current list.
// Hovering or focusing shows it; tapping or clicking keeps it open until you tap elsewhere or press Escape.
export function initTermPopover(container, getItems) {
  const pop = document.createElement('div');
  pop.className = 'term-pop';
  pop.setAttribute('role', 'tooltip');
  pop.id = 'term-pop';
  pop.hidden = true;
  document.body.append(pop);
  let current = null;
  let pinned = false;

  const hide = () => {
    pop.hidden = true;
    current?.setAttribute('aria-expanded', 'false');
    current = null;
    pinned = false;
  };
  const show = btn => {
    const item = getItems()[Number(btn.dataset.term)];
    if (!item) return;
    current?.setAttribute('aria-expanded', 'false');
    current = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.innerHTML = `<h3>${esc(item.title)}</h3>${item.text.map(p => `<p>${esc(p)}</p>`).join('')}`;
    pop.hidden = false;
    // Below the button, or above it when there isn't room; kept inside the window.
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };
  const termOf = e => e.target.closest?.('[data-term]');

  container.addEventListener('pointerover', e => {
    const btn = termOf(e);
    if (btn && e.pointerType === 'mouse' && !pinned) show(btn);
  });
  container.addEventListener('pointerout', e => {
    const btn = termOf(e);
    if (btn && e.pointerType === 'mouse' && !pinned && !btn.contains(e.relatedTarget)) hide();
  });
  container.addEventListener('focusin', e => { const btn = termOf(e); if (btn && !pinned) show(btn); });
  container.addEventListener('focusout', e => { if (termOf(e) && !pinned) hide(); });
  container.addEventListener('click', e => {
    const btn = termOf(e);
    if (!btn) return;
    if (pinned && current === btn) { hide(); return; }
    show(btn);
    pinned = true;
  });
  document.addEventListener('click', e => { if (!pop.hidden && !termOf(e) && !pop.contains(e.target)) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) hide(); });
  window.addEventListener('scroll', () => { if (!pop.hidden) hide(); }, { passive: true });
  window.addEventListener('resize', () => { if (!pop.hidden) hide(); });
  return { hide };
}
