// A small box that asks for an amount after a button is pressed (Damage, Heal, Add XP, Add gold...): type it (the
// keyboard opens on the tablet) or step it with − and +, then OK or Enter; Cancel or Esc gives null. It opens over any other popup.
// askAmount({ title, label, ok, value, decimals, roll, hint }) -> Promise<number | null>. roll: a function giving a
// number for a Roll button (temporary hit points from a spell).
import { esc } from './dom.js';

// note: a label for a text box too (what it's for); then it resolves to { amount, note } (or null).
export function askAmount({ title, label = 'Amount', ok = 'OK', value = '', decimals = false, roll = null, hint = '', note = '' } = {}) {
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
      <label for="amount-input">${esc(label)}</label>
      <div class="amount-row"><button type="button" class="amount-step" data-amount-step="-1" aria-label="One less">−</button>
        <input type="number" id="amount-input" inputmode="${decimals ? 'decimal' : 'numeric'}" min="0" step="${decimals ? '0.01' : '1'}" value="${esc(String(value ?? ''))}">
        <button type="button" class="amount-step" data-amount-step="1" aria-label="One more">+</button></div>
      ${note ? `<label class="amount-note">${esc(note)} <input type="text" id="amount-note" maxlength="80"></label>` : ''}
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <div class="line-controls"><button value="ok" class="primary">${esc(ok)}</button>${roll ? '<button type="button" data-amount-roll>Roll</button>' : ''}
        <button type="button" data-amount-cancel>Cancel</button></div></form>`;
    const input = d.querySelector('#amount-input');
    d.querySelector('[data-amount-cancel]').onclick = () => d.close('cancel');
    // − and + (the tablet shows no arrows in a number box): one less or one more, never below 0. Held down, it keeps
    // going: after a short pause, about seven steps a second.
    const step = b => { input.value = String(Math.max(0, Math.trunc(Number(input.value) || 0) + Number(b.dataset.amountStep))); };
    let wait = null, repeat = null;
    const stop = () => { clearTimeout(wait); clearInterval(repeat); wait = repeat = null; };
    for (const b of d.querySelectorAll('[data-amount-step]')) {
      b.onpointerdown = e => {
        e.preventDefault();
        stop();
        step(b);
        wait = setTimeout(() => { repeat = setInterval(() => step(b), 140); }, 450);
      };
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      // A tap or press already stepped on pointerdown; only the keyboard (Space or Enter on the button) steps here.
      b.onclick = e => { if (e.detail === 0) step(b); };
    }
    const rb = d.querySelector('[data-amount-roll]');
    if (rb) rb.onclick = () => { input.value = String(roll()); input.focus(); };
    d.returnValue = '';
    // OK or Enter in the box submits the form (which closes the box); Cancel and Esc close it without submitting.
    let submitted = false;
    d.querySelector('form').onsubmit = () => { submitted = true; };
    d.onclose = () => {
      stop();
      const n = Number(input.value);
      const amount = submitted && input.value !== '' && Number.isFinite(n) ? Math.abs(decimals ? Math.round(n * 100) / 100 : Math.trunc(n)) : null;
      resolve(note ? (amount === null ? null : { amount, note: d.querySelector('#amount-note').value.trim() }) : amount);
    };
    d.showModal();
    input.focus();
    input.select();
  });
}
