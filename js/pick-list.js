// One-column pick lists in a popup (Add a weapon, Add equipment, Add a magic item, Choose armor): a search box, one row
// per item A to Z (names starting with the search words first) with a line about it under the name, at most `limit`
// rows (a line says how many more). Tapping a row runs onPick(id, back); back() reopens the list where it was (the same
// search, scrolled to the same place), so several things can be added one after another.
import { esc } from './dom.js';

const places = {};  // by list key: { q, scroll }

// app: { openDetail }. items(): the items now ([{ id, name }]); line(item): the text under its name; mark(item): true
// for one the character has (ticked). top / foot: HTML above the search box / under the list. actions: the popup's
// buttons ([{ label, primary, run }]).
export function pickList(app, { key, title, placeholder, items, line, mark = () => false, onPick, top = '', foot = '', actions = [], limit = 150, noun = 'items' }) {
  const place = (places[key] ??= { q: '', scroll: 0 });
  const open = keep => {
    app.openDetail(title, `${top}<input type="search" class="pick-search" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}" value="${esc(place.q)}">
      <p class="hint pick-count"></p><div class="pick-column"></div>${foot}`, actions);
    const body = document.getElementById('detail-body');
    const dlg = document.getElementById('detail-dialog');
    const draw = () => {
      const q = place.q.trim().toLowerCase();
      const list = items().filter(x => !q || x.name.toLowerCase().includes(q))
        .sort((a, b) => (q ? b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) : 0) || a.name.localeCompare(b.name));
      body.querySelector('.pick-count').textContent = list.length > limit ? `Showing ${limit} of ${list.length.toLocaleString()} ${noun}: search to narrow the list.`
        : `${list.length} ${list.length === 1 ? noun.replace(/s$/, '') : noun}`;
      body.querySelector('.pick-column').innerHTML = list.slice(0, limit).map(x => {
        const mine = mark(x);
        return `<button type="button" data-pick="${esc(x.id)}"${mine ? ' aria-pressed="true"' : ''}><b>${mine ? '<span class="status met">✓</span> ' : ''}${esc(x.name)}</b><small>${esc(line(x))}</small></button>`;
      }).join('') || '<p class="hint">Nothing by that name.</p>';
    };
    draw();
    dlg.scrollTop = keep ? place.scroll : 0;
    body.querySelector('.pick-search').addEventListener('input', e => { place.q = e.target.value; draw(); });
    body.querySelector('.pick-column').addEventListener('click', e => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      place.scroll = dlg.scrollTop;
      onPick(b.dataset.pick, () => open(true));
    });
  };
  open(false);
}
