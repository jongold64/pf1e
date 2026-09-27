// Small page helpers shared by app.js and the tab modules.

export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// Plain text with blank lines between paragraphs -> <p> elements.
export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');
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
