// Spells tab: the character's class spell list, grouped by spell level, with a side panel for the chosen spell.
import { $, esc, paragraphs, facts, sourceText } from './dom.js';

let selectedId = null;

const LEVEL_NAMES = ['Level 0 (cantrips / orisons)', ...Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`)];

// "sorcerer 3, wizard 3, magus 3" using the app's class names where it knows them.
function levelText(app, spell) {
  const name = id => app.data.classes.find(c => c.id === id)?.name
    || id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  return Object.entries(spell.levels).map(([id, lv]) => `${name(id)} ${lv}`).join(', ');
}

function spellDetails(app, spell, cls) {
  const onList = spell.levels[cls.id] !== undefined;
  const school = [spell.school, spell.subschool ? `(${spell.subschool})` : '', spell.descriptors ? `[${spell.descriptors}]` : '']
    .filter(Boolean).join(' ');
  return `<h3>${esc(spell.name)}</h3>
    <p class="hint">${esc(school)} · ${esc(sourceText(spell))}</p>
    ${onList ? '' : `<p class="warning">Not on the ${esc(cls.name.toLowerCase())} spell list.</p>`}
    ${facts([
      ['Level', levelText(app, spell)],
      ['Casting time', spell.casting_time],
      ['Components', spell.components],
      ['Range', spell.range],
      ...(spell.effects || []),
      ['Duration', spell.duration],
      ['Saving throw', spell.saving_throw],
      ['Spell resistance', spell.spell_resistance],
    ])}
    ${paragraphs(spell.description)}`;
}

function renderPanel(app, view) {
  const spell = app.data.spells?.find(s => s.id === selectedId);
  $('spell-panel').innerHTML = spell ? spellDetails(app, spell, view.cls)
    : '<p class="hint">Choose a spell to see its details.</p>';
  document.querySelectorAll('#spell-list [data-spell]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.spell === selectedId)));
}

export function initSpellList(app) {
  $('spell-filter').addEventListener('input', () => renderSpellList(app, app.view));
  $('spell-filter-form').addEventListener('submit', e => { e.preventDefault(); renderSpellList(app, app.view); });
  $('spell-all').addEventListener('change', () => renderSpellList(app, app.view));
  $('spell-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-spell]');
    if (!btn) return;
    selectedId = btn.dataset.spell;
    renderPanel(app, app.view);
  });
}

export async function renderSpellList(app, view) {
  const { cls } = view;
  if (!app.data.spells) {
    $('spell-list').innerHTML = '<p class="hint">Loading spells…</p>';
    await app.loadSpells();
    view = app.view;  // the character may have changed while loading
  }
  const all = app.data.spells;
  const onList = all.filter(s => s.levels[view.cls.id] !== undefined);
  const filter = $('spell-filter').value.trim().toLowerCase();
  // Classes without a spell list can still search every spell.
  $('spell-all').closest('label').hidden = !onList.length;
  const searchAll = $('spell-all').checked || !onList.length;
  $('spell-list-title').textContent = onList.length ? `${cls.name} spells (${onList.length})` : 'Spells';

  if (searchAll) {
    if (filter.length < 2) {
      $('spell-list').innerHTML = `<p class="hint">${onList.length ? '' : `${esc(cls.name)}s don't have a spell list. `}` +
        `Type at least 2 letters to search all ${all.length.toLocaleString()} spells.</p>`;
    } else {
      const hits = all.filter(s => s.name.toLowerCase().includes(filter));
      $('spell-list').innerHTML = hits.length ? `<section class="list-group">
        <h3 class="list-heading">All spells <span class="count">${hits.length}</span></h3>
        <ul class="pick-list">${hits.slice(0, 200).map(s =>
          `<li><button type="button" data-spell="${esc(s.id)}">${esc(s.name)}<small>${esc(s.school || '')}</small></button></li>`).join('')}</ul>
      </section>` : '<p class="hint">No spells match.</p>';
    }
    renderPanel(app, view);
    return;
  }

  const maxLevel = view.ctx.maxSpellLevel;
  const groups = [];
  for (let lv = 0; lv <= 9; lv++) {
    const spells = onList.filter(s => s.levels[cls.id] === lv && (!filter || s.name.toLowerCase().includes(filter)));
    if (!spells.length) continue;
    const later = lv > maxLevel;
    groups.push(`<section class="list-group">
      <h3 class="list-heading">${LEVEL_NAMES[lv]} <span class="count">${spells.length}${later ? ' · not yet' : ''}</span></h3>
      <ul class="pick-list${later ? ' later' : ''}">${spells.map(s =>
        `<li><button type="button" data-spell="${esc(s.id)}">${esc(s.name)}<small>${esc(s.school || '')}</small></button></li>`).join('')}</ul>
    </section>`);
  }
  $('spell-list').innerHTML = groups.join('') || '<p class="hint">No spells match.</p>';
  renderPanel(app, view);
}

// Used by search: open a spell in the side panel (even one that isn't on the class list).
export async function showSpell(app, id) {
  selectedId = id;
  await renderSpellList(app, app.view);
  document.querySelector(`#spell-list [data-spell="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
  $('spell-panel').scrollIntoView({ block: 'nearest' });
}
