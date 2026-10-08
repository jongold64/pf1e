// Armor tab: choose worn armor and a shield, with an optional magic bonus, and see what they do.
import { magicPrefix, magicPart } from './crafting.js';
import { openLines, $, esc, signed, paragraphs, facts, sourceText } from './dom.js';
import { ENHANCEMENT_MAX, proficiencyWarnings, druidMetalWarnings, spellFailureByClass, speedInArmor } from './armor.js';
import { MONK_IDS, slowedSpeed } from './rules.js';
import { materialsFor, withMaterial } from './materials.js';
import { openMagicArmor } from './tab-crafting.js';
import { armorCost, formatGp } from './equipment.js';

// What makes up each number on the tab, by key, for its Details popup (filled when the tab is drawn).
const armorWhy = new Map();
const whyButton = (key, what) => ` <button type="button" class="skill-details" data-armor-why="${esc(key)}" aria-label="How ${esc(what)} is worked out">Details</button>`;

// Rows for one worn item's price: the item (with its material), masterwork, enhancement and special abilities.
function priceRows(item, enh, mw, abilities, crafted) {
  const rows = [{ label: item.material ? `${item.name} (${item.material.toLowerCase()} price, masterwork included)` : item.name,
                  text: formatGp(item.price_gp || 0) }];
  if ((enh > 0 || mw || abilities.length) && !item.mw_included) rows.push({ label: 'Masterwork', text: '+150 gp' });
  const magic = magicPart(enh, abilities, 1000);
  if (magic) {
    const bonus = enh + abilities.reduce((n, a) => n + (a.bonus || 0), 0);
    if (bonus) rows.push({ label: `Magic: total bonus +${bonus} (+${enh} enhancement${abilities.filter(a => a.bonus).map(a => `, ${a.name} +${a.bonus}`).join('')}), squared × 1,000 gp`,
                           text: `+${formatGp(bonus * bonus * 1000)}` });
    for (const a of abilities.filter(x => x.gp)) rows.push({ label: a.name, text: `+${formatGp(a.gp)}` });
    if (crafted) rows.push({ label: 'Crafted: the magic costs half', text: `−${formatGp(magic / 2)}` });
  }
  return rows;
}

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
      ['Material', a.material ? [a.material + (a.mw_included ? ' (masterwork, included in the price)' : ''),
        a.move_category && a.move_category !== a.category ? `counts as ${a.move_category} armor for speed and limits` : '',
        a.material_notes, a.metal === false ? 'not metal (druids can wear it)' : ''].filter(Boolean).join('; ') : null],
    ])}
    ${a.description ? `<details class="rules"><summary>Rules text</summary>${paragraphs(a.description)}</details>` : ''}`;
}

// A Details popup (the AC one is the same as on the Race card).
export function showArmorWhy(app, key) {
  if (key === 'ac') { app.showAcDetails(); return; }
  if (key === 'touch' || key === 'flat') { app.showAcDetails(key); return; }
  const d = armorWhy.get(key);
  if (!d) return;
  app.openDetail(d.title, `<table class="skill-why"><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(d.total)}</b></td></tr></tfoot></table>${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
}

// Wearing an armor or shield (or taking it off): a different one doesn't keep the old one's abilities or material.
export function wearArmor(app, a) {
  const k = a.category === 'shield' ? 'shield' : 'armor';
  const off = app.state[`${k}Id`] === a.id;
  app.update({ [`${k}Id`]: off ? '' : a.id, [`${k}Abilities`]: [], [`${k}Crafted`]: false, [`${k}Material`]: '' });
}

// An armor or shield in a popup: its stats, a quality (masterwork or +1 to +5) and material to wear it with, and buttons
// to wear it, to go on and add special abilities (bought, or crafted), or to take it off.
export function popArmor(app, id) {
  const a = app.data.armorById.get(id);
  if (!a) return;
  const { state } = app;
  const k = a.category === 'shield' ? 'shield' : 'armor';
  const worn = state[`${k}Id`] === a.id;
  const enh = worn ? state[`${k}Enh`] : 0;
  const quality = worn && !enh && state[`${k}Mw`] ? 'mw' : String(enh);
  const mats = materialsFor(a);
  const controls = `<div class="pop-armor-choices">
      <label>Quality <select data-pop-armor="enh"><option value="0">None</option><option value="mw">Masterwork</option>
        ${Array.from({ length: ENHANCEMENT_MAX }, (_, i) => `<option value="${i + 1}">+${i + 1}</option>`).join('')}</select></label>
      ${mats.length ? `<label>Material <select data-pop-armor="material"><option value="">Usual</option>${mats.map(m =>
        `<option value="${esc(m.id)}"${worn && state[`${k}Material`] === m.id ? ' selected' : ''}>${esc(m.name)} (${esc((m.price(a) - a.price_gp >= 0 ? '+' : '') + (m.price(a) - a.price_gp).toLocaleString())} gp)</option>`).join('')}</select></label>` : ''}
    </div>
    ${worn && state[`${k}Abilities`]?.length ? `<p class="hint">Special abilities on it now: ${esc(state[`${k}Abilities`].map(x => x.name).join(', '))}.</p>` : ''}`;
  // The choices in the popup, applied when a button is pressed.
  const choose = () => {
    const box = document.getElementById('detail-body');
    const q = box.querySelector('[data-pop-armor="enh"]').value;
    const material = box.querySelector('[data-pop-armor="material"]')?.value || '';
    const keep = worn ? { [`${k}Abilities`]: state[`${k}Abilities`], [`${k}Crafted`]: state[`${k}Crafted`] } : { [`${k}Abilities`]: [], [`${k}Crafted`]: false };
    app.update({ [`${k}Id`]: a.id, [`${k}Enh`]: q === 'mw' ? 0 : Number(q), [`${k}Mw`]: q === 'mw', [`${k}Material`]: material, ...keep });
  };
  const wear = k === 'shield' ? 'Use this shield' : 'Wear this armor';
  app.openDetail(a.name, armorDetails(a) + controls, [
    { label: worn ? 'Update it' : wear, primary: true, run: () => { choose(); app.showTab('armor'); } },
    { label: 'Add special abilities (buy)', run: () => { choose(); openMagicArmor(app, k, 'buy'); } },
    { label: 'Craft it magic', run: () => { choose(); openMagicArmor(app, k, 'craft'); } },
    ...(worn ? [{ label: 'Take it off', run: () => { wearArmor(app, a); app.showTab('armor'); } }] : []),
  ]);
  const sel = document.querySelector('#detail-body [data-pop-armor="enh"]');
  if (sel) sel.value = quality;
}

// The list of every armor and shield, grouped by category, each row with a Details button.
function renderArmorList(app) {
  const { data, state } = app;
  const groups = [...GROUPS, ['shield', 'Shields']];
  $('armor-list-count').textContent = `${data.armor.length}`;
  $('armor-list').innerHTML = groups.map(([cat, label]) => {
    const list = data.armor.filter(a => a.category === cat).sort((x, y) => x.name.localeCompare(y.name));
    return list.length ? `<section class="list-group"><h3 class="list-heading">${esc(label)} <span class="count">${list.length}</span></h3>
      <ul class="pick-list armor-pick">${list.map(a => {
        const worn = state.armorId === a.id || state.shieldId === a.id;
        return `<li class="with-details"><button type="button" data-armor-pop="${esc(a.id)}"${worn ? ' class="mine"' : ''}>${worn ? '<span class="status met" title="Wearing">✓</span>' : ''}${esc(a.name)}
          <small>${esc(signed(a.bonus))}${a.max_dex !== null ? ` · max Dex ${esc(signed(a.max_dex))}` : ''}${a.price_gp !== null ? ` · ${esc(formatGp(a.price_gp))}` : ''}</small></button>
          <button type="button" class="skill-details" data-armor-pop="${esc(a.id)}" aria-label="${esc(a.name)} in a popup">Details</button></li>`;
      }).join('')}</ul></section>` : '';
  }).join('');
}

// The Details beside Quality: what masterwork and +1 to +5 do for this item and what each costs, and its price now.
function popQuality(app, k) {
  const { state } = app;
  const base = app.data.armorById.get(state[`${k}Id`]);
  if (!base) { app.openDetail(k === 'shield' ? 'No shield' : 'No armor', `<p>Choose ${k === 'shield' ? 'a shield' : 'armor'} first.</p>`); return; }
  const item = state[`${k}Material`] ? withMaterial(base, state[`${k}Material`]) : base;
  const what = k === 'shield' ? 'shield bonus' : 'armor bonus';
  const rows = [
    ['Masterwork', `armor check penalty 1 less${item.mw_included ? ' (already included with this material)' : ''}`, item.mw_included ? 'included' : '+150 gp'],
    ...Array.from({ length: ENHANCEMENT_MAX }, (_, i) => i + 1).map(n => [`+${n}`, `+${n} enhancement to its ${what}; masterwork, so penalty 1 less`,
      `+${formatGp(n * n * 1000 + (item.mw_included ? 0 : 150))}`]),
  ];
  const total = armorCost(item, state[`${k}Enh`], state[`${k}Mw`], state[`${k}Abilities`], state[`${k}Crafted`]);
  app.openDetail(`Quality: ${item.name}`, `
    <table class="skill-why"><thead><tr><th>Quality</th><th>What it does</th><th class="num">Adds to the price</th></tr></thead>
      <tbody>${rows.map(([q, w, p]) => `<tr><td>${esc(q)}</td><td>${esc(w)}</td><td class="num">${esc(p)}</td></tr>`).join('')}</tbody></table>
    <p class="hint">Magic armor and shields are always masterwork. The magic price is the total bonus (enhancement plus special
      abilities' bonuses) squared × 1,000 gp; a +1 enhancement is needed before special abilities can be added, and the total
      can't go above +10.</p>
    <p><b>This ${esc(k)} now:</b> ${esc(formatGp(total))} <span class="muted">(the Details beside its price on the card shows how it adds up)</span></p>`);
}

// The Details beside Material: the chosen material against the usual item (bonus, Dex limit, penalty, spell failure, speed,
// weight, price and its own effects), then every material this item can be made of.
function popMaterial(app, k) {
  const { state } = app;
  const base = app.data.armorById.get(state[`${k}Id`]);
  if (!base) { app.openDetail(k === 'shield' ? 'No shield' : 'No armor', `<p>Choose ${k === 'shield' ? 'a shield' : 'armor'} first.</p>`); return; }
  const list = materialsFor(base);
  const chosen = state[`${k}Material`] ? withMaterial(base, state[`${k}Material`]) : null;
  const dexText = v => (v === null || v === undefined ? 'no limit' : signed(v));
  const props = it => [[k === 'shield' ? 'Shield bonus' : 'Armor bonus', signed(it.bonus)], ['Max Dex bonus', dexText(it.max_dex)],
    ['Armor check penalty', String(it.check_penalty)], ['Arcane spell failure', `${it.spell_failure}%`],
    ...(k === 'shield' ? [] : [['Counts as (speed and limits)', `${it.move_category || it.category} armor`]]),
    ['Weight', it.weight_lbs === null ? '—' : `${it.weight_lbs} lbs.`], ['Price', it.price_gp === null ? '—' : formatGp(it.price_gp)],
    ['Masterwork', it.mw_included ? 'included' : 'no'],
    ...(chosen?.metal === false ? [['Metal', it === chosen ? 'no: druids can wear it' : 'yes']] : []),
    ['Its own effects', it.material_notes || '—']];
  const compare = chosen ? `<h3>${esc(chosen.material)} against the usual ${esc(base.name.toLowerCase())}</h3>
    <table class="skill-why"><thead><tr><th></th><th>Usual</th><th>${esc(chosen.material)}</th></tr></thead><tbody>${props(base).map(([l, v], i) => {
      const w = props(chosen)[i][1];
      return `<tr${v !== w ? ' class="changed"' : ''}><td>${esc(l)}</td><td>${esc(v)}</td><td>${v !== w ? `<b>${esc(w)}</b>` : esc(w)}</td></tr>`;
    }).join('')}</tbody></table>` : `<p>${esc(base.name)} is made of the usual material (steel, wood or leather).</p>`;
  const others = list.length ? `<h3>Materials it can be made of (${list.length})</h3>
    <table class="skill-why"><tbody>${list.map(m => {
      const it = withMaterial(base, m.id);
      const diff = (it.price_gp ?? 0) - (base.price_gp ?? 0);
      const changes = [it.max_dex !== base.max_dex ? `Dex ${dexText(it.max_dex)}` : '', it.check_penalty !== base.check_penalty ? `penalty ${it.check_penalty}` : '',
        it.spell_failure !== base.spell_failure ? `failure ${it.spell_failure}%` : '', it.move_category && it.move_category !== base.category ? `counts as ${it.move_category}` : '',
        it.weight_lbs !== base.weight_lbs ? `${it.weight_lbs} lbs.` : '', it.material_notes || ''].filter(Boolean).join(', ');
      return `<tr${m.id === state[`${k}Material`] ? ' class="mine"' : ''}><td><b>${esc(m.name)}</b>${m.id === state[`${k}Material`] ? ' ✓' : ''}<br><small class="muted">${esc(changes || 'no other changes')}</small></td>
        <td class="num">${diff >= 0 ? '+' : '−'}${esc(formatGp(Math.abs(diff)))}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="hint">No special material fits this item.</p>';
  app.openDetail(`Material: ${chosen ? chosen.name : base.name}`, compare + others
    + '<p class="hint">Choose the material in the list beside this button.</p>');
}

export function initArmorTab(app) {
  // Details beside the armor / shield, its quality and its material.
  for (const card of ['armor-select', 'shield-select']) {
    $(card).closest('section').addEventListener('click', e => {
      const b = e.target.closest('[data-armor-part]');
      if (!b) return;
      e.preventDefault();
      const [k, part] = b.dataset.armorPart.split('|');
      if (part === 'item') {
        if (app.state[`${k}Id`]) popArmor(app, app.state[`${k}Id`]);
        else app.openDetail(k === 'shield' ? 'No shield' : 'No armor', `<p>Choose ${k === 'shield' ? 'a shield' : 'armor'} in the list, or browse
          <b>All armor and shields</b> at the bottom of this tab.</p>`);
      }
      if (part === 'quality') popQuality(app, k);
      if (part === 'material') popMaterial(app, k);
    });
  }
  $('armor-list').addEventListener('click', e => {
    const b = e.target.closest('[data-armor-pop]');
    if (b) popArmor(app, b.dataset.armorPop);
  });
  for (const id of ['armor-summary', 'armor-info', 'shield-info']) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-armor-why]');
      if (b) showArmorWhy(app, b.dataset.armorWhy);
    });
  }
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
  $('armor-select').addEventListener('change', e => app.update({ armorId: e.target.value, armorAbilities: [], armorCrafted: false, armorMaterial: '' }));
  $('shield-select').addEventListener('change', e => app.update({ shieldId: e.target.value, shieldAbilities: [], shieldCrafted: false, shieldMaterial: '' }));
  $('armor-material').addEventListener('change', e => app.update({ armorMaterial: e.target.value }));
  $('shield-material').addEventListener('change', e => app.update({ shieldMaterial: e.target.value }));
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
  // Materials the worn item can be made of (price changes shown); a material that includes masterwork hides "Masterwork".
  for (const k of ['armor', 'shield']) {
    const base = app.data.armorById.get(state[`${k}Id`]);
    const list = materialsFor(base);
    $(`${k}-material`).innerHTML = `<option value="">${list.length ? 'Usual (steel, wood or leather)' : 'Usual'}</option>`
      + list.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc((m.price(base) - base.price_gp >= 0 ? '+' : '') + (m.price(base) - base.price_gp).toLocaleString())} gp)</option>`).join('');
    $(`${k}-material`).value = state[`${k}Material`];
    $(`${k}-material`).disabled = !list.length;
    $(`${k}-enh`).querySelector('option[value="mw"]').textContent = gear[k]?.mw_included ? 'Masterwork (included)' : 'Masterwork';
    $(`${k}-enh`).querySelector('option[value="0"]').textContent = gear[k]?.mw_included ? 'Not magic' : 'None';
  }
  // Special abilities (added with the Crafting card on the Magic Items tab).
  const abilities = list => (list.length ? `<p><b>Special abilities:</b> ${esc(magicPrefix(0, false, list))}
    <small class="muted">(add or change them with the Crafting card on the Magic Items tab)</small></p>` : '');
  armorWhy.clear();
  // Each worn item's full price, with its Details.
  const price = k => {
    const item = gear[k];
    const args = [item, state[`${k}Enh`], state[`${k}Mw`], state[`${k}Abilities`], state[`${k}Crafted`]];
    const total = armorCost(...args);
    armorWhy.set(`price-${k}`, { title: `Price: ${formatGp(total)}`, rows: priceRows(...args), total: formatGp(total),
      note: 'This price counts on the Equipment tab.' });
    return `<p><b>Price with quality and abilities:</b> ${esc(formatGp(total))}${whyButton(`price-${k}`, 'the price')}</p>`;
  };
  // One line each for the armor and the shield (Details opens the choices and full stats; with nothing worn they stay open).
  for (const k of ['armor', 'shield']) {
    const item = gear[k];
    const enh = state[`${k}Enh`], mw = state[`${k}Mw`];
    const open = openLines.has(k) || !item;
    const penalty = item ? Math.min(0, item.check_penalty + ((enh > 0 || mw) && !item.mw_included ? 1 : 0)) : 0;
    $(`${k}-line`).innerHTML = (item ? `<b class="line-name">${esc([magicPrefix(enh, mw, state[`${k}Abilities`]), item.name].filter(Boolean).join(' '))}</b>
        <span class="wl-part"><span class="wl-k">${k === 'shield' ? 'Shield' : 'Armor'}</span> <b>${esc(signed(item.bonus + enh))}</b></span>
        <span class="wl-part"><span class="wl-k">Max Dex</span> <b>${esc(item.max_dex === null || item.max_dex === undefined ? '—' : signed(item.max_dex))}</b></span>
        <span class="wl-part"><span class="wl-k">Check</span> <b>${penalty}</b></span>
        <span class="wl-part"><span class="wl-k">Spell failure</span> <b>${item.spell_failure}%</b></span>
        ${item.dr ? `<span class="wl-part"><span class="wl-k">DR</span> <b>${item.dr}/—</b></span>` : ''}`
      : `<span class="muted">No ${k === 'shield' ? 'shield' : 'armor'}: choose one below</span>`)
      + `<button type="button" class="skill-details wl-more${open ? ' on' : ''}" data-line-more="${k}" aria-expanded="${open}" aria-label="Choose and see everything about it">Details</button>`;
    $(`${k}-more`).hidden = !open;
  }
  $('armor-info').innerHTML = gear.armor ? armorDetails(gear.armor) + abilities(state.armorAbilities) + price('armor') : '<p>Unarmored.</p>';
  $('shield-info').innerHTML = gear.shield ? armorDetails(gear.shield) + abilities(state.shieldAbilities) + price('shield') : '<p>No shield.</p>';

  const warnings = [...proficiencyWarnings(gear, view.haveFeats), ...druidMetalWarnings(gear, view.counts.map(e => e.cls.id))];
  if (gear.armor?.move_category && gear.armor.move_category !== gear.armor.category) {
    warnings.push(`${gear.armor.material} ${gear.armor.category} armor counts as ${gear.armor.move_category} armor for speed and other limits, but you still need ${gear.armor.category} armor proficiency.`);
  }
  if (gear.maxDex !== null && stats.mod.dex > gear.maxDex) {
    warnings.push(`Your Dex bonus (${signed(stats.mod.dex)}) is capped at ${signed(gear.maxDex)} in this armor.`);
  }
  if (view.counts.some(e => MONK_IDS.includes(e.cls.id)) && (gear.armor || gear.shield)) {
    warnings.push('Monks lose their Wisdom and monk AC bonus when wearing armor or using a shield.');
  }
  $('armor-warnings').innerHTML = warnings.map(w => `<p class="warning">${esc(w)}</p>`).join('');

  // Check penalty: each item's (masterwork and magic armor 1 less), and a heavy load's (the worse counts).
  const itemPenalty = item => (item ? Math.min(0, item.check_penalty + ((item === gear.armor ? state.armorEnh > 0 || state.armorMw
    : state.shieldEnh > 0 || state.shieldMw) && !item.mw_included ? 1 : 0)) : 0);
  const armorOnly = itemPenalty(gear.armor) + itemPenalty(gear.shield);
  armorWhy.set('acp', { title: `Armor check penalty: ${gear.checkPenalty || 'none'}`, total: String(gear.checkPenalty || 0), rows: [
    ...[gear.armor, gear.shield].filter(Boolean).map(item => ({ label: `${item.name}${item.check_penalty !== itemPenalty(item)
      ? ` (${item.check_penalty}, 1 less for masterwork or magic)` : item.mw_included ? ' (material and masterwork included)' : ''}`, text: String(itemPenalty(item)) })),
    ...(view.load && view.load.checkPenalty ? [{ label: `${view.load.load[0].toUpperCase()}${view.load.load.slice(1)} load: ${view.load.checkPenalty} (only the worse of armor and load counts)`,
                                                text: String(Math.min(armorOnly, view.load.checkPenalty) - armorOnly) }] : []),
  ], note: 'It applies to Str- and Dex-based skills, and to attack rolls with armor you are not proficient in.' });
  // Dex bonus to AC: Dex, capped by the armor's, the shield's and the load's limits.
  const caps = [[gear.armor?.max_dex, gear.armor?.name], [gear.shield?.max_dex, gear.shield?.name],
    [view.load?.maxDex, view.load ? `your ${view.load.load} load` : '']].filter(([v]) => v !== null && v !== undefined);
  armorWhy.set('dex', { title: `Dex bonus to AC: ${signed(stats.dexAc)}`, total: signed(stats.dexAc), rows: [
    { label: 'Dexterity modifier', text: signed(stats.mod.dex) },
    ...caps.map(([v, what]) => ({ label: `Limit from ${what}`, text: `at most ${signed(v)}` })),
  ], note: 'The lowest limit counts; a Dex penalty always applies.' });
  // Spell failure: each item's chance, and which arcane classes can ignore it.
  const byClass = spellFailureByClass(gear, view.counts);
  armorWhy.set('asf', { title: 'Arcane spell failure', total: `${gear.spellFailure}%`, rows: [
    ...[gear.armor, gear.shield].filter(Boolean).map(item => ({ label: item.name, text: `${item.spell_failure}%` })),
    ...byClass.map(e => ({ label: `${e.cls.name} spells`, text: e.chance ? `${e.chance}%` : 'none (class feature)' })),
  ], note: 'Only arcane spells with somatic components can fail; divine spells never do.' });
  // Speed: the race's, slowed by medium or heavy armor or load, plus effects.
  // The race's speed, plus fast movement (barbarian, monk...), before armor or load.
  const base = view.baseSpeed ?? view.race.base_speed;
  const armorSpeed = speedInArmor(base, gear, view.race);
  const loadSpeed = view.load?.slows && !(view.race.traits || []).some(t => t.name === 'Slow and Steady') ? slowedSpeed(base) : null;
  armorWhy.set('speed', { title: `Speed: ${view.speed ?? '—'} ft.`, total: view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.`, rows: [
    { label: `${view.race.name} base speed`, text: view.race.base_speed === null || view.race.base_speed === undefined ? '—' : `${view.race.base_speed} ft.` },
    ...(view.fastMove || []).map(x => ({ label: x.label, text: `+${x.value} ft.` })),
    ...(view.fastMove?.length ? [{ label: 'Base speed', text: `${base} ft.` }] : []),
    ...(gear.slows ? [{ label: armorSpeed === base ? 'Medium or heavy armor (does not slow this race)' : `In ${gear.armor.move_category || gear.armor.category} armor`, text: `${armorSpeed} ft.` }] : []),
    ...(loadSpeed !== null ? [{ label: `Your ${view.load.load} load (the slower of armor and load counts)`, text: `${loadSpeed} ft.` }] : []),
    ...(view.stats.fx.speed ? [{ label: 'Active effects (haste, longstrider...)', text: `${view.stats.fx.speed > 0 ? '+' : ''}${view.stats.fx.speed} ft.` }] : []),
  ] });
  const rows = [
    ['Armor Class', stats.ac, 'ac'],
    ['Touch AC', stats.touch, 'touch'],
    ['Flat-footed AC', stats.flatFooted, 'flat'],
    ['Dex bonus to AC', signed(stats.dexAc), 'dex'],
    ['Armor check penalty', gear.checkPenalty ? `${gear.checkPenalty} on Str and Dex skills` : 'none', 'acp'],
    ['Arcane spell failure', spellFailureText(gear, view.counts), 'asf'],
    ...(gear.dr ? [['Damage reduction', `${gear.dr}/— (adamantine)`]] : []),
    // Class damage reduction (barbarian, bloodrager, fighter's armor mastery, monk's perfect self...).
    ...(view.classDr || []).map(d => [`Damage reduction (${d.source})`, `${d.value}/${d.against}`]),
    ...(gear.training ? [['Armor training (fighter)', `check penalty ${gear.training} lower, max Dex ${gear.training} higher${gear.armor ? '' : ' (when wearing armor)'}`]] : []),
    ...[gear.armor, gear.shield].filter(a => a?.material_notes).map(a => [a.material, a.material_notes]),
    ['Speed', view.speed === null || view.speed === undefined ? '—' : `${view.speed} ft.` +
      (gear.slows && view.speed === base && base ? ' (not slowed)' : ''), 'speed'],
  ];
  renderArmorList(app);
  $('armor-summary').innerHTML = rows.map(([k, v, key]) => `<dt>${esc(k)}</dt><dd>${esc(v)}${key ? whyButton(key, k) : ''}</dd>`).join('');
}
