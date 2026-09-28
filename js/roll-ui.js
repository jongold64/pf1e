// The Roll buttons: any element with data-roll (a JSON spec for rollSpec in dice.js) rolls when clicked, and the
// result shows in a panel at the bottom of the screen that keeps the last few rolls.
import { esc } from './dom.js';
import { rollSpec } from './dice.js';

const KEEP = 6;
const history = [];

// The attribute value for a Roll button: data-roll="${rollAttr(spec)}".
export function rollAttr(spec) {
  return esc(JSON.stringify(spec));
}

export function rollButton(spec, label = 'Roll') {
  return `<button type="button" class="roll-button" data-roll="${rollAttr(spec)}" aria-label="${esc(`${label}: ${spec.title}`)}">🎲 ${esc(label)}</button>`;
}

function render(panel) {
  const [latest, ...older] = history;
  panel.hidden = !latest;
  if (!latest) return;
  panel.innerHTML = `<div class="roll-head"><b>${esc(latest.title)}</b>
      <button type="button" class="link" data-roll-close aria-label="Close">close</button></div>
    <ul class="roll-lines">${latest.lines.map(l => `<li>${esc(l)}</li>`).join('') || '<li>Nothing to roll.</li>'}</ul>
    ${older.length ? `<details class="roll-older"><summary>Earlier rolls</summary>${older.map(r =>
      `<p><b>${esc(r.title)}</b><br>${r.lines.map(esc).join('<br>')}</p>`).join('')}</details>` : ''}`;
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
      history.unshift(rollSpec(JSON.parse(btn.dataset.roll)));
      history.length = Math.min(history.length, KEEP);
      render(panel);
      return;
    }
    if (e.target.closest?.('[data-roll-close]')) panel.hidden = true;
  });
}
