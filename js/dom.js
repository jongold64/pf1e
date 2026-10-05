// Small page helpers shared by app.js and the tab modules.

export const $ = id => document.getElementById(id);

// One-line summaries (class "fit-line"): each one's text shrinks (down to 55%) until it fits on one line. A line on a
// hidden tab has no width yet, so this runs again after every redraw, when a tab opens and when the window is resized.
export function fitLines(root = document) {
  for (const el of root.querySelectorAll('.fit-line')) {
    el.style.fontSize = '';
    if (!el.clientWidth) continue;
    for (let size = 100; el.scrollWidth > el.clientWidth && size > 55; size -= 3) el.style.fontSize = `${size - 3}%`;
  }
}

// Which one-line summaries have their Details open (by key: "armor", "spell-wizard-fireball", "item-0"...), kept across
// redraws. A "Details" button with data-line-more="key" opens or closes the .line-more beside its line (app.js).
export const openLines = new Set();

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// 1 -> "1st", 2 -> "2nd", 12 -> "12th".
export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${s}`;
}

const isRow = line => line.includes(' | ');

function table(rows) {
  const cells = row => row.split(' | ').map(c => c.trim());
  const [head, ...body] = rows;
  return `<div class="table-wrap"><table class="text-table">
    <thead><tr>${cells(head).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// Plain text -> HTML. Blank lines separate paragraphs, single line breaks are kept, and runs of two or more
// "a | b | c" lines (tables in the rules text) become tables with the first line as the header.
export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    let html = '';
    let words = [];
    const flush = () => {
      if (words.length) html += `<p>${words.map(esc).join('<br>')}</p>`;
      words = [];
    };
    for (let i = 0; i < lines.length;) {
      let j = i;
      while (j < lines.length && isRow(lines[j])) j++;
      if (j - i >= 2) {
        flush();
        html += table(lines.slice(i, j));
        i = j;
      } else {
        words.push(lines[i]);
        i += 1;
      }
    }
    flush();
    return html;
  }).join('');
}

// A label/value list, skipping empty values: [['Aura', 'faint abjuration'], ['CL', 5]].
export function facts(pairs) {
  const rows = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return rows.length ? `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
}

// "Core Rulebook (also in Ultimate Equipment)"
export function sourceText(x) {
  return x.also_in?.length ? `${x.source} (also in ${x.also_in.join(', ')})` : x.source;
}
