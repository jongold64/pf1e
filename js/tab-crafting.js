// Crafting card (Magic Items tab): make a magic weapon, magic armor or shield, a potion / scroll / wand, or any listed
// magic item, following the Core Rulebook's Magic Item Creation rules (see crafting.js). It shows the feat needed,
// the requirements and whether the character meets them, the Spellcraft DC against the character's Spellcraft, and
// the cost and time; "Craft it" adds the item (or improves the weapon or armor), counted at its crafting cost.
import { $, esc, signed } from './dom.js';
import { CRAFT_FEATS, SPELL_ITEMS, itemKind, abilityOptions, magicArmsPrice, magicPart, spellItemPrice, craftCost,
         craftTime, craftDC, parseRequirements, checkRequirements, optionBonus, listedCost, magicPrefix } from './crafting.js';
import { spellsPerDay } from './rules.js';
import { casterLevelOf } from './multiclass.js';
import { formatGp, magicItemStats } from './equipment.js';
import { weaponLabel } from './weapons.js';
import { rollButton } from './roll-ui.js';

const KINDS = [['weapon', 'Magic weapon'], ['armor', 'Magic armor or shield'], ['spell', 'Potion, scroll or wand'],
               ['item', 'Magic item from the list']];
const HIGH = { str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30 };

// What's being planned (kept while the page is open, not saved with the character).
const form = { kind: 'weapon', weapon: 0, target: 'armor', enh: 1, abilities: [], spellKind: 'potion', spell: '', cl: 0,
               itemId: '', option: '', rushed: false, confirmed: new Set(), extraUnmet: 0, message: '' };

// The character's spellcasting: each casting class's caster level, highest spell level it can cast, and whether it
// casts spontaneously (then a spell must be one it knows: "My spells" on the Spells tab).
function casters(app) {
  const v = app.view;
  return v.casting.casting.map(c => {
    const table = spellsPerDay({ cls: c.cls, level: c.effectiveLevel, scores: v.stats.scores });
    const castable = (table?.rows || []).filter(r => r.canCast && ((r.total ?? 0) > 0 || (r.known ?? 0) > 0));
    return {
      cls: c.cls, cl: casterLevelOf(c.cls, c.effectiveLevel),
      maxLevel: castable.length ? Math.max(...castable.map(r => r.spellLevel)) : -1,
      spontaneous: c.cls.id !== 'arcanist' && (table?.rows || []).some(r => r.known !== null),
    };
  }).filter(c => c.maxLevel >= 0);
}

// The lowest caster level at which a class can cast spells of a level (the least a potion, scroll or wand can have).
function minCasterLevel(cls, spellLevel) {
  for (let lv = 1; lv <= 20; lv++) {
    const row = (spellsPerDay({ cls, level: lv, scores: HIGH })?.rows || []).find(r => r.spellLevel === spellLevel);
    if (row && ((row.total ?? 0) > 0 || (row.known ?? 0) > 0)) return Math.max(1, casterLevelOf(cls, lv));
  }
  return 1;
}

function canCastWith(app, list) {
  const known = new Set(app.state.spells);
  return id => {
    const spell = app.data.spellsById?.get(id);
    return !!spell && list.some(c => spell.levels[c.cls.id] !== undefined && spell.levels[c.cls.id] <= c.maxLevel
      && (!c.spontaneous || known.has(id)));
  };
}

// A chosen special ability with its price: { id, name, option, bonus | gp, cl }.
function chosenAbility(app, pick) {
  const a = app.data.itemsById.get(pick.id);
  if (!a) return null;
  const opts = abilityOptions(a);
  const o = opts.find(x => x.label === pick.option) || opts[0];
  if (!o) return null;
  return { id: a.id, name: a.name, ...(o.label ? { option: o.label } : {}), ...(o.bonus ? { bonus: o.bonus } : {}),
           ...(o.gp ? { gp: o.gp } : {}), cl: a.cl };
}

// Requirements from a listed item's or special ability's requirement line, leaving out the item creation feat
// (which is checked on its own).
function requirementsOf(app, text, craftFeat) {
  const feats = app.data.feats.map(f => f.name);
  const spells = new Map((app.data.spells || []).map(s => [s.name.toLowerCase(), s.id]));
  for (const s of app.data.spells || []) {
    // "Magic Weapon, Greater" is written "greater magic weapon" in requirement lines.
    const m = s.name.match(/^(.*), (Greater|Lesser|Mass|Communal)$/);
    if (m) spells.set(`${m[2]} ${m[1]}`.toLowerCase(), s.id);
  }
  return parseRequirements(text, feats, spells).filter(r => !(r.type === 'feat' && r.name === craftFeat));
}

// Everything about the item being planned: { title, feat, itemCL, market, cost, base, reqs, errors, mandatory,
// apply } (apply makes it).
function plan(app, list) {
  const { state, data, view } = app;
  const crafterCL = Math.max(0, ...list.map(c => c.cl));
  const canCast = canCastWith(app, list);
  const ctx = bonus => ({ haveFeats: view.haveFeats, canCast, casterLevel: crafterCL, bonus,
                          skillRanks: n => state.skills[n] || 0 });

  if (form.kind === 'weapon' || form.kind === 'armor') {
    const isWeapon = form.kind === 'weapon';
    const per = isWeapon ? 2000 : 1000;
    const mw = isWeapon ? 300 : 150;
    let base, current, apply;
    if (isWeapon) {
      const e = state.weapons[form.weapon];
      base = e && data.weaponsById?.get(e.id);
      if (!base) return { empty: 'Add a weapon on the Weapons tab first, then come back to make it magic.' };
      current = { enh: e.enh || 0, masterwork: !!e.masterwork, abilities: e.abilities || [] };
      apply = (enh, abilities) => {
        const weapons = state.weapons.map((x, i) => (i === form.weapon ? { ...x, enh, masterwork: true, abilities, crafted: true } : x));
        app.update({ weapons });
      };
    } else {
      const worn = form.target === 'shield' ? state.shieldId : state.armorId;
      base = data.armorById.get(worn);
      if (!base) return { empty: `Wear ${form.target === 'shield' ? 'a shield' : 'armor'} on the Armor tab first, then come back to make it magic.` };
      const k = form.target;
      current = { enh: state[`${k}Enh`] || 0, masterwork: !!state[`${k}Mw`], abilities: state[`${k}Abilities`] || [] };
      apply = (enh, abilities) => app.update({ [`${k}Enh`]: enh, [`${k}Mw`]: true, [`${k}Abilities`]: abilities, [`${k}Crafted`]: true });
    }
    const abilities = form.abilities.map(p => chosenAbility(app, p)).filter(Boolean);
    const price = magicArmsPrice({ kind: form.kind, enh: form.enh, abilities, abilityCls: abilities.map(a => a.cl) });
    const oldMagic = magicPart(current.enh, current.abilities, per);
    const added = price.base - oldMagic;
    const errors = [...price.errors];
    if (added < 0) errors.push(`it's worth less than the ${isWeapon ? 'weapon' : 'armor'} already is`);
    if (added === 0) errors.push('nothing to add: choose a higher bonus or a special ability');
    const needMw = current.enh > 0 || current.masterwork ? 0 : (base.price_gp || 0) + mw;
    const reqs = [{ type: 'cl', level: 3 * form.enh, text: `caster level ${3 * form.enh} (three times the enhancement bonus)` },
      ...abilities.flatMap(a => requirementsOf(app, data.itemsById.get(a.id).construction?.requirements, CRAFT_FEATS.weapon)
        .map(r => ({ ...r, text: `${r.text} (${a.name})` })))];
    const saved = abilities.map(({ cl, ...a }) => a);
    const title = `${magicPrefix(form.enh, true, saved)} ${base.name}`;
    return {
      title, feat: CRAFT_FEATS[form.kind], itemCL: price.casterLevel, base: Math.max(0, added),
      market: (base.price_gp || 0) + mw + price.base, cost: craftCost(Math.max(0, added), needMw), errors,
      reqs: checkRequirements(reqs, ctx(0)), mandatory: [],
      note: [needMw ? `Includes the masterwork ${base.name.toLowerCase()} (${formatGp(needMw)}, paid in full).` : '',
             oldMagic ? 'Improving magic it already has: you pay only for what you add (Adding New Abilities).' : ''].filter(Boolean).join(' '),
      apply: () => apply(form.enh, saved),
    };
  }

  if (form.kind === 'spell') {
    const [clsId, spellId] = form.spell.split('|');
    const caster = list.find(c => c.cls.id === clsId);
    const spell = data.spellsById?.get(spellId);
    if (!caster || !spell) return { empty: list.length ? 'Choose a spell you can cast.' : 'Only spellcasters can brew potions, scribe scrolls or craft wands.' };
    const sl = spell.levels[clsId];
    const min = minCasterLevel(caster.cls, sl);
    // Starts at the lowest caster level that can cast the spell (the usual, cheapest choice); it can be raised.
    const cl = Math.min(caster.cl, Math.max(min, form.cl || min));
    const info = SPELL_ITEMS[form.spellKind];
    const price = spellItemPrice(form.spellKind, sl, cl);
    const errors = [...price.errors];
    if (form.spellKind === 'potion' && /^personal/i.test(spell.range || '')) errors.push('spells with a range of personal can\'t be made into potions');
    return {
      title: `${info.label} of ${spell.name} (caster level ${cl})`, feat: CRAFT_FEATS[form.spellKind], itemCL: cl, clRange: [min, caster.cl],
      base: price.base, market: price.base, cost: craftCost(price.base), errors, reqs: [], mandatory: [],
      note: `${info.label} price: ${info.perLevel} gp × spell level ${sl === 0 ? '0 (counts as ½)' : sl} × caster level ${cl}; making it costs half.`
        + (spell.components && /\bM\b|\bF\b/.test(spell.components) ? ' Material components or a focus the spell needs are extra.' : ''),
      apply: () => {
        const items = state.craftedItems.map(x => ({ ...x }));
        const same = items.find(x => x.kind === form.spellKind && x.spellId === spellId && x.cl === cl);
        if (same) same.qty += 1;
        else items.push({ kind: form.spellKind, spellId, spellName: spell.name, spellLevel: sl, cl, qty: 1 });
        app.update({ craftedItems: items });
      },
    };
  }

  // A listed item.
  const item = data.itemsById.get(form.itemId);
  if (!item) return { empty: 'Choose an item in the list below, then press "Craft this item" in its details.' };
  const kind = itemKind(item);
  const option = form.option || item.price_options?.[0]?.label || null;
  const price = magicItemStats(item, option).price_gp;
  const text = item.construction?.requirements;
  const reqs = text ? requirementsOf(app, text, CRAFT_FEATS[kind]) : [];
  const checked = checkRequirements(reqs, ctx(optionBonus(option)));
  // Staves are spell-trigger items: their spells are required, not just +5 to the DC.
  const mandatory = kind === 'staff' ? checked.filter(r => (r.type === 'spell' || r.type === 'spells') && r.status === 'unmet') : [];
  return {
    title: option ? `${item.name} (${option})` : item.name, feat: CRAFT_FEATS[kind], itemCL: item.cl || 0,
    base: price ?? 0, market: price, cost: listedCost(item, option, price), errors: price === null ? ['the item has no price listed'] : [],
    reqs: checked, mandatory, noRequirements: !text,
    note: item.construction?.cost ? `Its listed cost to make: ${item.construction.cost}.` : 'Making it costs half its price.',
    apply: () => {
      const owned = state.magicItems.map(x => ({ ...x }));
      const same = owned.find(x => x.id === item.id && (x.option || null) === (option || null) && x.crafted);
      if (same) same.qty += 1;
      else owned.push({ id: item.id, ...(option ? { option } : {}), qty: 1, crafted: true });
      app.update({ magicItems: owned });
    },
  };
}

function kindControls(app, list, p) {
  const { state, data } = app;
  if (form.kind === 'weapon' || form.kind === 'armor') {
    const isWeapon = form.kind === 'weapon';
    const pickTarget = isWeapon
      ? `<label>Weapon <select data-craft="weapon">${state.weapons.map((e, i) => {
          const w = data.weaponsById?.get(e.id);
          return w ? `<option value="${i}"${i === form.weapon ? ' selected' : ''}>${esc(weaponLabel(w, e))}</option>` : '';
        }).join('')}</select></label>`
      : `<label>Make magic <select data-craft="target">
          <option value="armor"${form.target === 'armor' ? ' selected' : ''}>worn armor${data.armorById.get(state.armorId) ? ` (${esc(data.armorById.get(state.armorId).name)})` : ''}</option>
          <option value="shield"${form.target === 'shield' ? ' selected' : ''}>shield${data.armorById.get(state.shieldId) ? ` (${esc(data.armorById.get(state.shieldId).name)})` : ''}</option>
        </select></label>`;
    const cat = isWeapon ? 'Weapon Special Abilities' : 'Armor and Shield Special Abilities';
    const all = data.items.filter(i => i.category === cat && abilityOptions(i).length && !form.abilities.some(a => a.id === i.id));
    const chosen = form.abilities.map((pick, i) => {
      const a = data.itemsById.get(pick.id);
      const opts = abilityOptions(a);
      const which = opts.length > 1 ? `<select data-craft-option="${i}" aria-label="${esc(a.name)} version">${opts.map(o =>
        `<option value="${esc(o.label)}"${o.label === pick.option ? ' selected' : ''}>${esc(o.label)} (${o.bonus ? `+${o.bonus} bonus` : formatGp(o.gp)})</option>`).join('')}</select>` : '';
      const o = opts.find(x => x.label === pick.option) || opts[0];
      return `<li><b>${esc(a.name)}</b> ${which} <small class="muted">${o.bonus ? `+${o.bonus} bonus` : `+${esc(formatGp(o.gp))}`} · caster level ${esc(a.cl ?? '?')}</small>
        <button type="button" data-craft-remove="${i}">Remove</button></li>`;
    }).join('');
    return `${pickTarget}
      <label>Enhancement bonus <select data-craft="enh">${[1, 2, 3, 4, 5].map(n =>
        `<option value="${n}"${n === form.enh ? ' selected' : ''}>+${n}</option>`).join('')}</select></label>
      <div class="craft-abilities"><b>Special abilities</b>
        ${chosen ? `<ul class="plain-list">${chosen}</ul>` : '<p class="hint">None. Add one below (each adds its bonus to the price).</p>'}
        <select data-craft="add-ability" aria-label="Add a special ability"><option value="">Add a special ability…</option>
          ${all.map(a => { const o = abilityOptions(a)[0]; return `<option value="${esc(a.id)}">${esc(a.name)} (${o.bonus ? `+${o.bonus}` : formatGp(o.gp)}${abilityOptions(a).length > 1 ? ', several versions' : ''})</option>`; }).join('')}
        </select></div>`;
  }
  if (form.kind === 'spell') {
    const canCast = canCastWith(app, list);
    const groups = list.map(c => {
      const spells = (data.spells || []).filter(s => s.levels[c.cls.id] !== undefined && s.levels[c.cls.id] <= Math.min(c.maxLevel, SPELL_ITEMS[form.spellKind].maxSpellLevel)
        && canCast(s.id) && (!c.spontaneous || state.spells.includes(s.id)))
        .sort((a, b) => a.levels[c.cls.id] - b.levels[c.cls.id] || a.name.localeCompare(b.name));
      return spells.length ? `<optgroup label="${esc(c.cls.name)}${c.spontaneous ? ' (spells you know)' : ''}">${spells.map(s =>
        `<option value="${esc(c.cls.id)}|${esc(s.id)}"${form.spell === `${c.cls.id}|${s.id}` ? ' selected' : ''}>${esc(s.name)} (level ${s.levels[c.cls.id]})</option>`).join('')}</optgroup>` : '';
    }).join('');
    const clInput = p.clRange ? `<label>Caster level <select data-craft="cl">${Array.from({ length: p.clRange[1] - p.clRange[0] + 1 }, (_, i) => p.clRange[0] + i)
      .map(n => `<option value="${n}"${n === p.itemCL ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : '';
    return `<label>Make a <select data-craft="spellKind">${Object.entries(SPELL_ITEMS).map(([k, v]) =>
        `<option value="${k}"${k === form.spellKind ? ' selected' : ''}>${v.label.toLowerCase()} (spells up to level ${v.maxSpellLevel})</option>`).join('')}</select></label>
      <label>Spell <select data-craft="spell"><option value="">Choose a spell…</option>${groups}</select></label>${clInput}
      ${list.some(c => c.spontaneous) ? '<p class="hint">Sorcerers, bards and other spontaneous casters can use only spells they know: add them under My spells on the Spells tab.</p>' : ''}`;
  }
  const item = data.itemsById.get(form.itemId);
  const opts = item?.price_options || [];
  return item ? `<p><b>${esc(item.name)}</b> <small class="muted">${esc(item.category)} · caster level ${esc(item.cl ?? '?')}</small></p>
      ${opts.length ? `<label>Version <select data-craft="option">${opts.map(o => `<option value="${esc(o.label)}"${o.label === (form.option || opts[0].label) ? ' selected' : ''}>${esc(o.label)} (${esc(formatGp(o.price_gp))})</option>`).join('')}</select></label>` : ''}`
    : '';
}

export function renderCrafting(app) {
  const card = $('craft-card');
  if (!card || !app.data.itemsById) return;
  if (!app.data.spells) { app.loadSpells().then(() => renderCrafting(app)); return; }
  if (!app.data.weaponsById && app.state.weapons.length) { app.loadWeapons().then(() => renderCrafting(app)); return; }
  const list = casters(app);
  const p = plan(app, list);
  const kinds = `<label>What to make <select data-craft="kind">${KINDS.map(([k, label]) =>
    `<option value="${k}"${k === form.kind ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
  if (p.empty) {
    $('craft-body').innerHTML = `${kinds}${kindControls(app, list, p)}<p class="hint">${esc(p.empty)}</p>`;
    return;
  }
  const hasFeat = app.view.haveFeats.includes(p.feat);
  const unmet = p.reqs.filter((r, i) => r.status === 'unmet' || (r.status === 'ask' && !form.confirmed.has(i))).length + form.extraUnmet;
  const dc = craftDC(p.itemCL, unmet, form.rushed);
  const time = craftTime(p.base, form.kind === 'spell' ? form.spellKind : 'item', form.rushed);
  const sc = app.skillTotalFor('Spellcraft');
  const ok = hasFeat && !p.errors.length && !p.mandatory.length && p.cost !== null;
  const reqRows = p.reqs.map((r, i) => {
    const icon = r.status === 'met' ? '✓' : r.status === 'unmet' ? '✗' : '?';
    const ask = r.status === 'ask' ? ` <label class="check-row small"><input type="checkbox" data-craft-confirm="${i}"${form.confirmed.has(i) ? ' checked' : ''}> I meet this</label>` : '';
    return `<li class="req-${r.status}">${icon} ${esc(r.type === 'spells' ? `one of: ${r.text}` : r.text)}${ask}</li>`;
  }).join('');
  const take10 = sc.usable ? 10 + sc.total : null;
  $('craft-body').innerHTML = `${kinds}
    <div class="craft-controls">${kindControls(app, list, p)}</div>
    <h3>${esc(p.title)}</h3>
    <ul class="plain-list craft-reqs">
      <li class="req-${hasFeat ? 'met' : 'unmet'}">${hasFeat ? '✓' : '✗'} ${esc(p.feat)} (required)</li>
      ${reqRows}
      ${p.noRequirements ? '<li class="hint">The data doesn\'t list this item\'s requirements (most Ultimate Equipment items); count any you don\'t meet below.</li>' : ''}
    </ul>
    <div class="craft-extra">
      <span>Other requirements you don't meet</span>
      <span class="base"><button type="button" data-craft-extra="-1" aria-label="One fewer">−</button><span class="value">${form.extraUnmet}</span>
        <button type="button" data-craft-extra="1" aria-label="One more">+</button></span>
      <label class="check-row"><input type="checkbox" data-craft="rushed"${form.rushed ? ' checked' : ''}> Rush it (half the time, +5 DC)</label>
    </div>
    <dl class="facts">
      <dt>Market price</dt><dd>${esc(p.market === null ? '—' : formatGp(p.market))}</dd>
      <dt>Cost to make</dt><dd><b>${esc(p.cost === null ? '—' : formatGp(p.cost))}</b></dd>
      <dt>Time</dt><dd>${time.hours < 8 ? `${time.hours} hours` : `${time.days} day${time.days === 1 ? '' : 's'} (${time.hours} hours of work)`}</dd>
      <dt>Spellcraft DC</dt><dd>${dc} <small class="muted">(5 + caster level ${p.itemCL}${unmet ? ` + ${5 * unmet} for ${unmet} unmet requirement${unmet === 1 ? '' : 's'}` : ''}${form.rushed ? ' + 5 rushed' : ''})</small></dd>
      <dt>Your Spellcraft</dt><dd>${sc.usable ? `${signed(sc.total)} ${rollButton({ title: `Spellcraft to craft ${p.title} (DC ${dc})`, check: 'Spellcraft', groups: [{ attacks: [sc.total] }] })}
        <small class="muted">taking 10 gives ${take10}: ${take10 >= dc ? 'success' : 'not enough'}</small>` : 'untrained (Spellcraft needs ranks)'}</dd>
    </dl>
    ${p.note ? `<p class="hint">${esc(p.note)}</p>` : ''}
    ${p.errors.length ? `<p class="warning">Can't be made: ${esc(p.errors.join('; '))}.</p>` : ''}
    ${p.mandatory.length ? `<p class="warning">You must be able to cast ${esc(p.mandatory.map(r => r.text).join(', '))} to make it.</p>` : ''}
    ${!hasFeat ? `<p class="warning">You need the ${esc(p.feat)} feat.</p>` : ''}
    <p class="hint">Failing the check wastes the time and gold; failing by 5 or more makes a cursed item. At most one item a day.</p>
    <div class="slot-buttons"><button type="button" class="primary" data-craft-make${ok ? '' : ' disabled'}>Craft it (${esc(p.cost === null ? '—' : formatGp(p.cost))})</button></div>
    ${form.message ? `<p class="craft-done">${esc(form.message)}</p>` : ''}`;
}

// "Craft this item" in a magic item's details: plan it on the Crafting card.
export function craftListedItem(app, id, option) {
  Object.assign(form, { kind: 'item', itemId: id, option: option || '', confirmed: new Set(), extraUnmet: 0, message: '' });
  renderCrafting(app);
  $('craft-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

export function initCrafting(app) {
  const card = $('craft-card');
  const reset = () => { form.confirmed = new Set(); form.message = ''; };
  card.addEventListener('change', e => {
    const t = e.target;
    const k = t.dataset.craft;
    if (k === 'kind') { form.kind = t.value; form.abilities = []; reset(); }
    else if (k === 'weapon') { form.weapon = Number(t.value); reset(); }
    else if (k === 'target') { form.target = t.value; form.abilities = []; reset(); }
    else if (k === 'enh') { form.enh = Number(t.value); reset(); }
    else if (k === 'add-ability' && t.value) {
      const opts = abilityOptions(app.data.itemsById.get(t.value));
      form.abilities.push({ id: t.value, option: opts[0]?.label || '' });
      reset();
    } else if (k === 'spellKind') { form.spellKind = t.value; form.spell = ''; reset(); }
    else if (k === 'spell') { form.spell = t.value; form.cl = 0; reset(); }
    else if (k === 'cl') form.cl = Number(t.value);
    else if (k === 'option') { form.option = t.value; reset(); }
    else if (k === 'rushed') form.rushed = t.checked;
    else if (t.dataset.craftOption !== undefined) form.abilities[Number(t.dataset.craftOption)].option = t.value;
    else if (t.dataset.craftConfirm !== undefined) {
      const i = Number(t.dataset.craftConfirm);
      if (t.checked) form.confirmed.add(i); else form.confirmed.delete(i);
    } else return;
    renderCrafting(app);
  });
  card.addEventListener('click', e => {
    const rm = e.target.closest('[data-craft-remove]');
    if (rm) { form.abilities.splice(Number(rm.dataset.craftRemove), 1); reset(); renderCrafting(app); return; }
    const extra = e.target.closest('[data-craft-extra]');
    if (extra) { form.extraUnmet = Math.max(0, form.extraUnmet + Number(extra.dataset.craftExtra)); renderCrafting(app); return; }
    if (e.target.closest('[data-craft-make]')) {
      const p = plan(app, casters(app));
      if (!p.apply) return;
      p.apply();
      form.message = `Made ${p.title} for ${formatGp(p.cost)} (counted in your gold on the Equipment tab).`;
      form.abilities = [];
      renderCrafting(app);
    }
  });
}
