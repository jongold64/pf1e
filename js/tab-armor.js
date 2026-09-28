// Armor tab: choose worn armor and a shield, with an optional magic bonus, and see what they do.
import { $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { ENHANCEMENT_MAX, proficiencyWarnings } from './armor.js';

const GROUPS = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor']];

// Stats and rules text for one armor or shield (also used by search results).
export function armorDetails(a) {
  const pct = n => `${n}%`;
  return `<p class="hint">${esc(a.category === 'shield' ? 'Shield' : `${a.category[0].toUpperCase()}${a.category.slice(1)} armor`)}
      · ${esc(sourceText(a))}</p>
    ${facts([
      [a.category === 'shield' ? 'Shield bonus' : 'Armor bonus', signed(a.bonus)],
      ['Max Dex bonus', a.max_dex === null ? 'no limit' : signed(a.max_dex)],
      ['Armor check penalty', a.check_penalty],
      ['Arcane spell failure', pct(a.spell_failure)],
      ['Speed (30 ft. / 20 ft.)', a.speed_30 ? `${a.speed_30} ft. / ${a.speed_20} ft.` : null],
      ['Price', a.price_gp !== null ? `${a.price_gp.toLocaleString()} gp` : null],
      ['Weight', a.weight_lbs !== null ? `${a.weight_lbs} lbs.` : null],
    ])}
    ${a.description ? `<details class="rules"><summary>Rules text</summary>${paragraphs(a.description)}</details>` : ''}`;
}

export function initArmorTab(app) {
  const { data } = app;
  const option = a => `<option value="${esc(a.id)}">${esc(a.name)} (${signed(a.bonus)})</option>`;
  $('armor-select').innerHTML = '<option value="">No armor</option>' + GROUPS.map(([cat, label]) =>
    `<optgroup label="${label}">${data.armor.filter(a => a.category === cat).map(option).join('')}</optgroup>`).join('');
  $('shield-select').innerHTML = '<option value="">No shield</option>' +
    data.armor.filter(a => a.category === 'shield').map(option).join('');
  const enh = Array.from({ length: ENHANCEMENT_MAX + 1 }, (_, i) =>
    `<option value="${i}">${i ? `+${i}` : 'None'}</option>`).join('');
  $('armor-enh').innerHTML = enh;
  $('shield-enh').innerHTML = enh;

  $('armor-select').addEventListener('change', e => app.update({ armorId: e.target.value }));
  $('shield-select').addEventListener('change', e => app.update({ shieldId: e.target.value }));
  $('armor-enh').addEventListener('change', e => app.update({ armorEnh: Number(e.target.value) }));
  $('shield-enh').addEventListener('change', e => app.update({ shieldEnh: Number(e.target.value) }));
}

export function renderArmorTab(app, view) {
  const { state } = app;
  const { gear, stats } = view;
  $('armor-select').value = state.armorId;
  $('shield-select').value = state.shieldId;
  $('armor-enh').value = state.armorEnh;
  $('shield-enh').value = state.shieldEnh;
  $('armor-enh').disabled = !gear.armor;
  $('shield-enh').disabled = !gear.shield;
  $('armor-info').innerHTML = gear.armor ? armorDetails(gear.armor) : '<p>Unarmored.</p>';
  $('shield-info').innerHTML = gear.shield ? armorDetails(gear.shield) : '<p>No shield.</p>';

  const warnings = proficiencyWarnings(gear, view.haveFeats);
  if (gear.maxDex !== null && stats.mod.dex > gear.maxDex) {
    warnings.push(`Your Dex bonus (${signed(stats.mod.dex)}) is capped at ${signed(gear.maxDex)} in this armor.`);
  }
  if (view.counts.some(e => e.cls.id === 'monk') && (gear.armor || gear.shield)) {
    warnings.push('Monks lose their Wisdom and monk AC bonus when wearing armor or using a shield.');
  }
  $('armor-warnings').innerHTML = warnings.map(w => `<p class="warning">${esc(w)}</p>`).join('');

  const rows = [
    ['Armor Class', stats.ac],
    ['Touch AC', stats.touch],
    ['Flat-footed AC', stats.flatFooted],
    ['Dex bonus to AC', signed(stats.dexAc)],
    ['Armor check penalty', gear.checkPenalty ? `${gear.checkPenalty} on Str and Dex skills` : 'none'],
    ['Arcane spell failure', gear.spellFailure
      ? `${gear.spellFailure}% (only for arcane spells; some classes can cast in light armor, see their class features)`
      : 'none'],
    ['Speed', view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.` +
      (gear.slows && view.speed === view.race.base_speed && view.race.base_speed ? ' (not slowed)' : '')],
  ];
  $('armor-summary').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}
