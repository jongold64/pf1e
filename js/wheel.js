// Selection wheels: a short list that scrolls and stops with one value in the middle band (like a phone's date picker).
// wheelHtml draws one; startWheels scrolls each to its value and reports the value it stops on.

const ROW = 40; // px: each value's height (css .wheel li)

// key: what the wheel sets ('heightFt'); values: [[value, label]]; current: the chosen value.
export function wheelHtml(key, label, values, current) {
  return `<div class="wheel-wrap"><span class="wheel-label">${label}</span>
    <div class="wheel" data-wheel="${key}" data-value="${current ?? ''}" tabindex="0" role="listbox" aria-label="${label}">
      <ul>${values.map(([v, l]) => `<li data-v="${v}" role="option"${String(v) === String(current) ? ' aria-selected="true"' : ''}>${l}</li>`).join('')}</ul>
    </div></div>`;
}

// Scrolls every wheel in box to its value; onPick(key, value) when one stops on another value. Arrow keys move one row.
export function startWheels(box, onPick) {
  for (const w of box.querySelectorAll('[data-wheel]')) {
    const items = [...w.querySelectorAll('li')];
    const at = Math.max(0, items.findIndex(li => li.dataset.v === w.dataset.value));
    w.scrollTop = at * ROW;
    let timer = null;
    const settle = () => {
      const i = Math.min(items.length - 1, Math.max(0, Math.round(w.scrollTop / ROW)));
      items.forEach((li, j) => li.toggleAttribute('aria-selected', j === i));
      if (items[i] && items[i].dataset.v !== w.dataset.value) { w.dataset.value = items[i].dataset.v; onPick(w.dataset.wheel, items[i].dataset.v); }
    };
    w.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(settle, 180); }, { passive: true });
    w.addEventListener('click', e => { const li = e.target.closest('li'); if (li) w.scrollTo({ top: items.indexOf(li) * ROW, behavior: 'smooth' }); });
    w.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      w.scrollBy({ top: e.key === 'ArrowDown' ? ROW : -ROW, behavior: 'smooth' });
    });
  }
}
