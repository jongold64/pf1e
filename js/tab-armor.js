// Armor tab: choose worn armor and a shield, with an optional magic bonus, and see what they do.
import { magicPrefix } from './crafting.js';
import { $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { ENHANCEMENT_MAX, proficiencyWarnings, druidMetalWarnings, spellFailureByClass } from './armor.js';
import { MONK_IDS } from './rules.js';

const GROUPS = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor']];

// "20%", or per class when the character casts arcane spells ("Bard none, Wizard 20%").
function spellFailureText(gear, counts) {
  if (!gear.spellFailure) return 'none';
  const byClass = spellFailureByClass(gear, counts);
  if (!byClass.length) return `${gear.spellFailure}% (doesn't matter: only arcane spells are affected)`;
  return byClass.map(e => `${e.cls.name} spells ${e.chance ? `${e.chance}%` : 'none'}`).join(', ') +
    (byClass.some(e => e.chance < gear.spellFailure) ? ' (some classes can cast in some armor, see their class features)' : '');
}

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
  // None, Masterwork (-1 check penalty, +150 gp), then +1 to +5 (always masterwork).
  const enh = '<option value="0">None</option><option value="mw">Masterwork</option>' +
    Array.from({ length: ENHANCEMENT_MAX }, (_, i) => `<option value="${i + 1}">+${i + 1}</option>`).join('');
  $('armor-enh').innerHTML = enh;
  $('shield-enh').innerHTML = enh;

  // Another armor or shield doesn't keep the special abilities put on the old one.
  $('armor-select').addEventListener('change', e => app.update({ armorId: e.target.value, armorAbilities: [], armorCrafted: false }));
  $('shield-select').addEventListener('change', e => app.update({ shieldId: e.target.value, shieldAbilities: [], shieldCrafted: false }));
  const quality = v => (v === 'mw' ? { enh: 0, mw: true } : { enh: Number(v), mw: false });
  $('armor-enh').addEventListener('change', e => { const q = quality(e.target.value); app.update({ armorEnh: q.enh, armorMw: q.mw }); });
  $('shield-enh').addEventListener('change', e => { const q = quality(e.target.value); app.update({ shieldEnh: q.enh, shieldMw: q.mw }); });
}

export function renderArmorTab(app, view) {
  const { state } = app;
  const { gear, stats } = view;
  $('armor-select').value = state.armorId;
  $('shield-select').value = state.shieldId;
  $('armor-enh').value = !state.armorEnh && state.armorMw ? 'mw' : state.armorEnh;
  $('shield-enh').value = !state.shieldEnh && state.shieldMw ? 'mw' : state.shieldEnh;
  $('armor-enh').disabled = !gear.armor;
  $('shield-enh').disabled = !gear.shield;
  // Special abilities (added with the Crafting card on the Magic Items tab).
  const abilities = list => (list.length ? `<p><b>Special abilities:</b> ${esc(magicPrefix(0, false, list))}
    <small class="muted">(add or change them with the Crafting card on the Magic Items tab)</small></p>` : '');
  $('armor-info').innerHTML = gear.armor ? armorDetails(gear.armor) + abilities(state.armorAbilities) : '<p>Unarmored.</p>';
  $('shield-info').innerHTML = gear.shield ? armorDetails(gear.shield) + abilities(state.shieldAbilities) : '<p>No shield.</p>';

  const warnings = [...proficiencyWarnings(gear, view.haveFeats), ...druidMetalWarnings(gear, view.counts.map(e => e.cls.id))];
  if (gear.maxDex !== null && stats.mod.dex > gear.maxDex) {
    warnings.push(`Your Dex bonus (${signed(stats.mod.dex)}) is capped at ${signed(gear.maxDex)} in this armor.`);
  }
  if (view.counts.some(e => MONK_IDS.includes(e.cls.id)) && (gear.armor || gear.shield)) {
    warnings.push('Monks lose their Wisdom and monk AC bonus when wearing armor or using a shield.');
  }
  $('armor-warnings').innerHTML = warnings.map(w => `<p class="warning">${esc(w)}</p>`).join('');

  const rows = [
    ['Armor Class', stats.ac],
    ['Touch AC', stats.touch],
    ['Flat-footed AC', stats.flatFooted],
    ['Dex bonus to AC', signed(stats.dexAc)],
    ['Armor check penalty', gear.checkPenalty ? `${gear.checkPenalty} on Str and Dex skills` : 'none'],
    ['Arcane spell failure', spellFailureText(gear, view.counts)],
    ['Speed', view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.` +
      (gear.slows && view.speed === view.race.base_speed && view.race.base_speed ? ' (not slowed)' : '')],
  ];
  $('armor-summary').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}
