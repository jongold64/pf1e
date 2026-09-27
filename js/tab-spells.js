// Spells tab: the character's chosen spells, and their class spell list (grouped by spell level) with a side
// panel for the spell being looked at.
import { $, esc, paragraphs, facts, sourceText } from './dom.js';
import { spellsPerDay } from './rules.js';

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
  const mine = app.state.spells.includes(spell.id);
  const school = [spell.school, spell.subschool ? `(${spell.subschool})` : '', spell.descriptors ? `[${spell.descriptors}]` : '']
    .filter(Boolean).join(' ');
  const button = mine
    ? `<button type="button" data-remove-spell="${esc(spell.id)}">Remove from my spells</button>`
    : onList ? `<button type="button" class="primary" data-add-spell="${esc(spell.id)}">Add to my spells</button>` : '';
  return `<h3>${esc(spell.name)}</h3>
    <p class="hint">${esc(school)} · ${esc(sourceText(spell))}</p>
    ${onList ? '' : `<p class="warning">Not on the ${esc(cls.name.toLowerCase())} spell list${mine ? '' : ', so it can\'t be added'}.</p>`}
    ${button ? `<div class="slot-buttons">${button}</div>` : ''}
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

// A spell button in a list; spells the character has are marked with a tick.
function spellButton(app, s) {
  const mine = app.state.spells.includes(s.id);
  return `<li><button type="button" data-spell="${esc(s.id)}"${mine ? ' class="mine"' : ''}>` +
    `${mine ? '<span class="status met" title="In my spells">✓</span>' : ''}${esc(s.name)}<small>${esc(s.school || '')}</small></button></li>`;
}

// The character's chosen spells, grouped by spell level for their class. Spontaneous casters see how many
// spells they may know at each level (from the class table).
function renderMySpells(app, view) {
  const { cls } = view;
  const byId = new Map(app.data.spells.map(s => [s.id, s]));
  const chosen = app.state.spells.map(id => byId.get(id)).filter(Boolean);
  const table = spellsPerDay({ cls, level: app.state.level, scores: view.stats.scores });
  const hasList = app.data.spells.some(s => s.levels[cls.id] !== undefined);
  $('my-spells-card').hidden = !hasList && !chosen.length;
  if ($('my-spells-card').hidden) return;

  const known = new Map((table?.rows || []).filter(r => r.known !== null).map(r => [r.spellLevel, r.known]));
  const spontaneous = known.size > 0;
  $('my-spells-count').textContent = chosen.length ? `${chosen.length}` : '';
  $('my-spells-hint').textContent = spontaneous
    ? 'The spells your character knows. Your class table sets how many you can know at each spell level.'
    : 'The spells in your spellbook, or the ones you usually prepare. You prepare spells from these each day.';

  const maxLevel = view.ctx.maxSpellLevel;
  const groups = [];
  for (let lv = 0; lv <= 9; lv++) {
    const spells = chosen.filter(s => s.levels[cls.id] === lv).sort((a, b) => a.name.localeCompare(b.name));
    const limit = known.get(lv);
    if (!spells.length && limit === undefined) continue;
    const over = limit !== undefined && spells.length > limit;
    const count = limit !== undefined ? `${spells.length} of ${limit} known` : `${spells.length}`;
    const notYet = lv > maxLevel && spells.length ? ' · can\'t cast yet' : '';
    groups.push(`<div class="my-spell-level">
      <h3>${LEVEL_NAMES[lv]} <span class="count${over ? ' over' : ''}">${count}${notYet}</span></h3>
      ${spells.length ? `<ul class="chip-list">${spells.map(s => `<li><button type="button" class="chip" data-show-spell="${esc(s.id)}">${esc(s.name)}</button>` +
        `<button type="button" class="chip-remove" data-remove-spell="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">×</button></li>`).join('')}</ul>`
        : '<p class="hint">None chosen yet.</p>'}
    </div>`);
  }
  // Spells that aren't on this class's list (e.g. chosen before changing class).
  const off = chosen.filter(s => s.levels[cls.id] === undefined);
  if (off.length) {
    groups.push(`<div class="my-spell-level"><h3>Not on the ${esc(cls.name.toLowerCase())} list <span class="count over">${off.length}</span></h3>
      <ul class="chip-list">${off.map(s => `<li><button type="button" class="chip" data-show-spell="${esc(s.id)}">${esc(s.name)}</button>` +
        `<button type="button" class="chip-remove" data-remove-spell="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">×</button></li>`).join('')}</ul></div>`);
  }
  $('my-spells').innerHTML = groups.join('') ||
    '<p class="hint">No spells yet. Choose a spell below, then "Add to my spells".</p>';
}

function addSpell(app, id) {
  if (!app.state.spells.includes(id)) app.update({ spells: [...app.state.spells, id] });
}

function removeSpell(app, id) {
  app.update({ spells: app.state.spells.filter(x => x !== id) });
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
  // Add/remove buttons in the side panel and in My spells (app.update re-renders the whole tab).
  for (const el of [$('spell-panel'), $('my-spells')]) {
    el.addEventListener('click', e => {
      const add = e.target.closest('[data-add-spell]');
      if (add) addSpell(app, add.dataset.addSpell);
      const remove = e.target.closest('[data-remove-spell]');
      if (remove) removeSpell(app, remove.dataset.removeSpell);
      const show = e.target.closest('[data-show-spell]');
      if (show) showSpell(app, show.dataset.showSpell);
    });
  }
}

export async function renderSpellList(app, view) {
  if (!app.data.spells) {
    $('spell-list').innerHTML = '<p class="hint">Loading spells…</p>';
    await app.loadSpells();
    view = app.view;  // the character may have changed while loading
  }
  const { cls } = view;
  renderMySpells(app, view);
  const all = app.data.spells;
  const onList = all.filter(s => s.levels[cls.id] !== undefined);
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
        <ul class="pick-list">${hits.slice(0, 200).map(s => spellButton(app, s)).join('')}</ul>
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
      <ul class="pick-list${later ? ' later' : ''}">${spells.map(s => spellButton(app, s)).join('')}</ul>
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
