// A small box that asks for an amount after a button is pressed (Damage, Heal, Add XP, Add gold...): type it (the
// keyboard opens on the tablet), then OK or Enter; Cancel or Esc gives null. It opens over any other popup.
// askAmount({ title, label, ok, value, decimals, roll, hint }) -> Promise<number | null>. roll: a function giving a
// number for a Roll button (temporary hit points from a spell).
import { esc } from './dom.js';

export function askAmount({ title, label = 'Amount', ok = 'OK', value = '', decimals = false, roll = null, hint = '' } = {}) {
  return new Promise(resolve => {
    let d = document.getElementById('amount-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'amount-dialog';
      d.className = 'amount-dialog';
      document.body.append(d);
    }
    d.innerHTML = `<form method="dialog">
      <h3>${esc(title)}</h3>
      <label>${esc(label)} <input type="number" id="amount-input" inputmode="${decimals ? 'decimal' : 'numeric'}" min="0" step="${decimals ? '0.01' : '1'}" value="${esc(String(value ?? ''))}"></label>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <div class="line-controls"><button value="ok" class="primary">${esc(ok)}</button>${roll ? '<button type="button" data-amount-roll>Roll</button>' : ''}
        <button type="button" data-amount-cancel>Cancel</button></div></form>`;
    const input = d.querySelector('#amount-input');
    d.querySelector('[data-amount-cancel]').onclick = () => d.close('cancel');
    const rb = d.querySelector('[data-amount-roll]');
    if (rb) rb.onclick = () => { input.value = String(roll()); input.focus(); };
    d.returnValue = '';
    // OK or Enter in the box submits the form (which closes the box); Cancel and Esc close it without submitting.
    let submitted = false;
    d.querySelector('form').onsubmit = () => { submitted = true; };
    d.onclose = () => {
      const n = Number(input.value);
      resolve(submitted && input.value !== '' && Number.isFinite(n) ? Math.abs(decimals ? Math.round(n * 100) / 100 : Math.trunc(n)) : null);
    };
    d.showModal();
    input.focus();
    input.select();
  });
}
