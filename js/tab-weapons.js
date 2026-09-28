// Weapons tab: the character's weapons with attack bonus and damage, and every weapon (by category) with a
// side panel for the weapon being looked at.
import { $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { SIZE_AC } from './rules.js';
import { armorAttackPenalty } from './armor.js';
import { proficiencyTest, weaponAttack, weaponCost } from './weapons.js';
import { formatGp, formatLbs } from './equipment.js';

let selectedId = null;
let listed = false;

const WEAPON_FEATS = [
  ['focus', 'Weapon Focus', '+1 attack'],
  ['greaterFocus', 'Greater Weapon Focus', '+1 attack'],
  ['spec', 'Weapon Specialization', '+2 damage'],
  ['greaterSpec', 'Greater Weapon Specialization', '+2 damage'],
];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const GROUP_TEXT = { unarmed: 'unarmed', light: 'light melee', 'one-handed': 'one-handed melee', 'two-handed': 'two-handed melee', ranged: 'ranged' };

function weaponDetails(w) {
  return `<h3>${esc(w.name)}</h3>
    <p class="hint">${esc(w.category)} · ${esc(GROUP_TEXT[w.group] || w.group || '')} · ${esc(sourceText(w))}</p>
    ${facts([
      ['Damage (Small / Medium)', [w.damage.s, w.damage.m].filter(Boolean).join(' / ') || null],
      ['Critical', w.critical],
      ['Range', w.range_ft ? `${w.range_ft} ft.${w.thrown ? ' (thrown)' : ''}` : null],
      ['Type', w.type],
      ['Special', w.special.length ? w.special.join(', ') : null],
      ['Price', w.price_gp !== null ? formatGp(w.price_gp) : w.price],
      ['Weight', w.weight_lbs !== null ? formatLbs(w.weight_lbs) : null],
      ['Weapon Finesse', w.finesse ? 'can be used' : null],
    ])}
    <div class="slot-buttons"><button type="button" class="primary" data-add-weapon="${esc(w.id)}">Add to my weapons</button></div>
    ${paragraphs(w.description) || '<p class="hint">The source has no description for this weapon.</p>'}`;
}

function renderPanel(app) {
  const w = app.data.weaponsById?.get(selectedId);
  $('weapon-panel').innerHTML = w ? weaponDetails(w) : '<p class="hint">Choose a weapon to see its details and add it.</p>';
  document.querySelectorAll('#weapon-list [data-weapon]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.weapon === selectedId)));
}

function renderList(app) {
  const all = app.data.weapons;
  const filter = $('weapon-search').value.trim().toLowerCase();
  const byCategory = new Map();
  for (const w of all) {
    if (filter && !w.name.toLowerCase().includes(filter)) continue;
    if (!byCategory.has(w.category)) byCategory.set(w.category, []);
    byCategory.get(w.category).push(w);
  }
  const order = ['Simple Weapons', 'Martial Weapons', 'Exotic Weapons', 'Firearms', 'Technological Weapons'];
  const categories = order.filter(c => byCategory.has(c));
  const shown = [...byCategory.values()].reduce((n, l) => n + l.length, 0);
  $('weapon-count').textContent = filter ? `${shown} of ${all.length}` : `${all.length}`;
  $('weapon-category').innerHTML = '<option value="">Jump to a category…</option>' +
    categories.map(c => `<option value="${slug(c)}">${esc(c)} (${byCategory.get(c).length})</option>`).join('');
  $('weapon-list').innerHTML = categories.map(c => `<section class="list-group" id="wcat-${slug(c)}">
      <h3 class="list-heading">${esc(c)} <span class="count">${byCategory.get(c).length}</span></h3>
      <ul class="pick-list">${byCategory.get(c).map(w =>
        `<li><button type="button" data-weapon="${esc(w.id)}">${esc(w.name)}<small>${esc(w.damage.m || '')}</small></button></li>`).join('')}</ul>
    </section>`).join('') || '<p class="hint">No weapons match.</p>';
  renderPanel(app);
}

// The character's weapons, each with its quality, feats, proficiency, attack bonus and damage.
export function renderMyWeapons(app, view) {
  const { state, data } = app;
  if (!data.weaponsById) return;
  const proficient = proficiencyTest(view.classes, view.race);
  const have = new Set(view.haveFeats);
  const armorPenalty = armorAttackPenalty(view.gear, view.haveFeats);
  const monk = view.counts.find(e => e.cls.id === 'monk');
  const monkUnarmed = monk ? monk.cls.progression[monk.level - 1]?.other?.['Unarmed Damage'] : null;
  $('my-weapons-count').textContent = state.weapons.length ? `${state.weapons.length}` : '';
  const notes = [];
  if (armorPenalty) notes.push(`Your armor or shield gives ${armorPenalty} on attack rolls (see the Armor tab).`);
  if (view.race.size === 'Small') notes.push('Small characters use Small weapon damage and get +1 on attack rolls.');
  $('my-weapons-note').textContent = notes.join(' ');

  $('my-weapons').innerHTML = state.weapons.map((e, i) => {
    const w = data.weaponsById.get(e.id);
    if (!w) return '';
    const byRules = proficient(w);
    const isProficient = byRules || !!e.proficient;
    const a = weaponAttack({
      weapon: w, entry: e, bab: view.stats.bab, mod: view.stats.mod, sizeAttack: SIZE_AC[view.race.size] ?? 0,
      size: view.race.size, haveFeats: view.haveFeats, proficient: isProficient, armorPenalty,
      unarmedDamage: w.id === 'unarmed-strike' && monkUnarmed ? monkUnarmed : null,
    });
    const quality = e.enh > 0 ? `+${e.enh}` : e.masterwork ? 'mw' : '0';
    const featBoxes = WEAPON_FEATS.filter(([, feat]) => have.has(feat)).map(([key, feat, what]) =>
      `<label class="check-row small"><input type="checkbox" data-weapon-flag="${key}" data-index="${i}" ${e[key] ? 'checked' : ''}> ${esc(feat)} (${what})</label>`).join('');
    return `<div class="weapon-card">
      <div class="weapon-head">
        <button type="button" class="link item-link" data-show-weapon="${esc(w.id)}">${esc(e.enh > 0 ? `+${e.enh} ` : e.masterwork ? 'Masterwork ' : '')}${esc(w.name)}</button>
        <button type="button" class="link" data-remove-weapon="${i}">remove</button>
      </div>
      <dl class="facts attack-line">
        <dt>Attack</dt><dd><b>${esc(a.attacks.map(signed).join('/'))}</b> <span class="muted">(${a.abilityUsed === 'dex' ? 'Dex' : 'Str'})</span></dd>
        <dt>Damage</dt><dd><b>${esc(a.damage)}</b></dd>
        <dt>Critical</dt><dd>${esc(w.critical || '—')}</dd>
        ${w.range_ft ? `<dt>Range</dt><dd>${w.range_ft} ft.</dd>` : ''}
        <dt>Cost</dt><dd>${esc(formatGp(weaponCost(w, e)))}</dd>
      </dl>
      <div class="weapon-controls">
        <label>Quality <select data-weapon-quality="${i}">
          <option value="0"${quality === '0' ? ' selected' : ''}>Normal</option>
          <option value="mw"${quality === 'mw' ? ' selected' : ''}>Masterwork (+1 attack)</option>
          ${[1, 2, 3, 4, 5].map(n => `<option value="+${n}"${quality === `+${n}` ? ' selected' : ''}>+${n}</option>`).join('')}
        </select></label>
        ${featBoxes}
        ${byRules ? '' : `<label class="check-row small"><input type="checkbox" data-weapon-flag="proficient" data-index="${i}" ${e.proficient ? 'checked' : ''}>
          Proficient anyway (e.g. from a feat or trait)</label>`}
      </div>
      ${isProficient ? '' : '<p class="warning">Not proficient: −4 on attack rolls.</p>'}
    </div>`;
  }).join('') || '<p class="hint">No weapons yet. Choose one below and add it.</p>';
}

function changeEntry(app, index, changes) {
  app.update({ weapons: app.state.weapons.map((e, i) => (i === index ? { ...e, ...changes } : e)) });
}

export function initWeaponsTab(app) {
  $('weapon-search-form').addEventListener('submit', e => { e.preventDefault(); renderList(app); });
  $('weapon-search').addEventListener('input', () => renderList(app));
  $('weapon-category').addEventListener('change', e => {
    document.getElementById(`wcat-${e.target.value}`)?.scrollIntoView({ block: 'start' });
  });
  $('weapon-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-weapon]');
    if (!btn) return;
    selectedId = btn.dataset.weapon;
    renderPanel(app);
  });
  $('weapon-panel').addEventListener('click', e => {
    const btn = e.target.closest('[data-add-weapon]');
    if (btn) app.update({ weapons: [...app.state.weapons, { id: btn.dataset.addWeapon, enh: 0 }] });
  });
  $('my-weapons').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-weapon]');
    if (remove) app.update({ weapons: app.state.weapons.filter((_, i) => i !== Number(remove.dataset.removeWeapon)) });
    const show = e.target.closest('[data-show-weapon]');
    if (show) showWeapon(app, show.dataset.showWeapon);
  });
  $('my-weapons').addEventListener('change', e => {
    const quality = e.target.dataset.weaponQuality;
    if (quality !== undefined) {
      const v = e.target.value;
      changeEntry(app, Number(quality), { enh: v.startsWith('+') ? Number(v.slice(1)) : 0, masterwork: v === 'mw' });
    }
    const flag = e.target.dataset.weaponFlag;
    if (flag) changeEntry(app, Number(e.target.dataset.index), { [flag]: e.target.checked });
  });
}

export async function renderWeaponsTab(app) {
  if (!app.data.weapons) {
    $('weapon-list').innerHTML = '<p class="hint">Loading weapons…</p>';
    await app.loadWeapons();
  }
  renderMyWeapons(app, app.view);
  if (listed) return;
  listed = true;
  renderList(app);
}

// Used by search: show a weapon in the side panel and scroll the list to it.
export async function showWeapon(app, id) {
  selectedId = id;
  await renderWeaponsTab(app);
  if ($('weapon-search').value) {
    $('weapon-search').value = '';
    renderList(app);
  }
  renderPanel(app);
  document.querySelector(`#weapon-list [data-weapon="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}
