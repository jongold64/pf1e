// The Roll buttons: any element with data-roll (a JSON spec for rollSpec in dice.js) rolls when clicked, and the
// result shows in a panel at the bottom of the screen that keeps the last few rolls.
import { esc } from './dom.js';
import { rollSpec } from './dice.js';

const KEEP = 6;
const history = [];
// House rule options that change how rolls are made ({ maxHealing }).
let options = {};
export function setRollOptions(o) {
  options = o;
}

// The attribute value for a Roll button: data-roll="${rollAttr(spec)}".
export function rollAttr(spec) {
  return esc(JSON.stringify(spec));
}

export function rollButton(spec, label = 'Roll') {
  return `<button type="button" class="roll-button" data-roll="${rollAttr(spec)}" aria-label="${esc(`${label}: ${spec.title}`)}">🎲 ${esc(label)}</button>`;
}

// One rolled line; a line starting with a tab (an attack's damage, confirmation roll) sits indented under the attack.
const line = l => (l.startsWith('	') ? `<li class="roll-under">${esc(l.slice(1))}</li>` : `<li>${esc(l)}</li>`);

function render(panel) {
  const [latest, ...older] = history;
  panel.hidden = !latest;
  if (!latest) return;
  panel.innerHTML = `<div class="roll-head"><b>${esc(latest.title)}</b>
      <button type="button" class="link" data-roll-close aria-label="Close">close</button></div>
    <ul class="roll-lines">${latest.lines.map(line).join('') || '<li>Nothing to roll.</li>'}</ul>
    ${older.length ? `<details class="roll-older"><summary>Earlier rolls</summary>${older.map(r =>
      `<div class="roll-earlier"><b>${esc(r.title)}</b><ul class="roll-lines">${r.lines.map(line).join('')}</ul></div>`).join('')}</details>` : ''}`;
}

export function initRolls() {
  const panel = document.createElement('div');
  panel.id = 'roll-panel';
  panel.className = 'roll-panel';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  document.body.append(panel);
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-roll]');
    if (btn) {
      e.preventDefault();
      history.unshift(rollSpec(JSON.parse(btn.dataset.roll), undefined, options));
      history.length = Math.min(history.length, KEEP);
      render(panel);
      return;
    }
    if (e.target.closest?.('[data-roll-close]')) panel.hidden = true;
  });
}
