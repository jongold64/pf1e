// Magic item builder cards, one module for two uses:
// - Craft tab ("craft" mode): make a magic weapon, magic armor or shield, a potion / scroll / wand, or any listed magic
//   item, following the Core Rulebook's Magic Item Creation rules (see crafting.js): the feat needed, the requirements
//   and whether the character meets them, the Spellcraft DC against the character's Spellcraft, cost (half) and time.
// - Magic Items tab ("buy" mode): the same weapons, armor and potions / scrolls / wands as treasure or purchases, with
//   no feat, requirement or skill check, at their market price.
import { $, esc, signed, paragraphs, facts } from './dom.js';
import { CRAFT_FEATS, SPELL_ITEMS, itemKind, abilityOptions, magicArmsPrice, magicPart, spellItemPrice, craftCost,
         craftTime, craftDC, parseRequirements, checkRequirements, optionBonus, listedCost, magicPrefix } from './crafting.js';
import { spellsPerDay } from './rules.js';
import { casterLevelOf } from './multiclass.js';
import { formatGp, magicItemStats } from './equipment.js';
import { weaponLabel } from './weapons.js';
import { rollButton } from './roll-ui.js';

const HIGH = { str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30 };
const newForm = kind => ({ kind, weapon: 0, target: 'armor', enh: 1, abilities: [], spellKind: 'potion', spell: '', cl: 0,
                           itemId: '', option: '', rushed: false, confirmed: new Set(), extraUnmet: 0, message: '',
                           wsearch: '', wslot: '' });

// The two cards. Each keeps what's being planned while the page is open (not saved with the character).
const CARDS = {
  craft: { mode: 'craft', card: 'craft-card', body: 'craft-body', form: newForm('weapon'),
           kinds: [['weapon', 'Magic weapon'], ['armor', 'Magic armor or shield'], ['spell', 'Potion, scroll or wand'],
                   ['wondrous', 'Wondrous item'], ['item', 'Magic item from the list']] },
  buy: { mode: 'buy', card: 'buy-card', body: 'buy-body', form: newForm('weapon'),
         kinds: [['weapon', 'Magic weapon'], ['armor', 'Magic armor or shield'], ['spell', 'Potion, scroll or wand']] },
};

// Wondrous items to choose from on the Craft tab: their body slot as one word ("none" for slotless), and the ones
// matching the search box and slot filter, by name.
const slotOf = item => {
  const s = String(item.slot || '').toLowerCase().replace(/<.*|\(.*|;.*/g, '').trim();
  return !s || s === '-' || s === 'none' ? 'slotless' : s === 'wrist' ? 'wrists' : s;
};
function wondrousItems(app) {
  return app.data.wondrous ??= app.data.items.filter(x => itemKind(x) === 'wondrous').sort((a, b) => a.name.localeCompare(b.name));
}
function wondrousMatches(app, form) {
  const q = form.wsearch.trim().toLowerCase();
  return wondrousItems(app).filter(x => (!form.wslot || slotOf(x) === form.wslot) && (!q || x.name.toLowerCase().includes(q)));
}
// The options of the wondrous item list: the matches (the chosen one kept even when it doesn't match), at most 300.
function wondrousOptions(app, form) {
  const list = wondrousMatches(app, form);
  const chosen = app.data.itemsById.get(form.itemId);
  const shown = [...(chosen && itemKind(chosen) === 'wondrous' && !list.includes(chosen) ? [chosen] : []), ...list.slice(0, 300)];
  return `<option value="">${list.length ? `Choose one of ${list.length} item${list.length === 1 ? '' : 's'}…` : 'No items match'}</option>`
    + shown.map(x => `<option value="${esc(x.id)}"${x.id === form.itemId ? ' selected' : ''}>${esc(x.name)}${x.price_gp ? ` (${esc(formatGp(x.price_gp))})` : ''}</option>`).join('')
    + (list.length > 300 ? '<option disabled>… type in the search box to see more</option>' : '');
}

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

// A bought potion, scroll or wand: the spell at its lowest level on any class list, and the lowest caster level that
// can cast it at that level (the usual market item).
function marketSpell(app, spell) {
  let best = null;
  for (const [clsId, sl] of Object.entries(spell.levels || {})) {
    const cls = app.data.classes.find(c => c.id === clsId);
    if (!cls) continue;
    const min = minCasterLevel(cls, sl);
    if (!best || sl < best.sl || (sl === best.sl && min < best.min)) best = { sl, min };
  }
  return best;
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
export function chosenAbility(app, pick) {
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
// apply } (apply makes or adds it). In buy mode the cost is the market price and nothing is checked.
function plan(app, list, c) {
  const { state, data, view } = app;
  const form = c.form;
  const buying = c.mode === 'buy';
  const crafterCL = Math.max(0, ...list.map(x => x.cl));
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
        const weapons = state.weapons.map((x, i) => (i === form.weapon
          ? { ...x, enh, masterwork: true, abilities, ...(buying ? {} : { crafted: true }) } : x));
        app.update({ weapons });
      };
    } else {
      const worn = form.target === 'shield' ? state.shieldId : state.armorId;
      base = data.armorById.get(worn);
      if (!base) return { empty: `Wear ${form.target === 'shield' ? 'a shield' : 'armor'} on the Armor tab first, then come back to make it magic.` };
      const k = form.target;
      current = { enh: state[`${k}Enh`] || 0, masterwork: !!state[`${k}Mw`], abilities: state[`${k}Abilities`] || [] };
      apply = (enh, abilities) => app.update({ [`${k}Enh`]: enh, [`${k}Mw`]: true, [`${k}Abilities`]: abilities,
                                               ...(buying ? {} : { [`${k}Crafted`]: true }) });
    }
    const abilities = form.abilities.map(p => chosenAbility(app, p)).filter(Boolean);
    const price = magicArmsPrice({ kind: form.kind, enh: form.enh, abilities, abilityCls: abilities.map(a => a.cl) });
    const oldMagic = magicPart(current.enh, current.abilities, per);
    const added = price.base - oldMagic;
    const errors = [...price.errors];
    if (added < 0) errors.push(`it's worth less than the ${isWeapon ? 'weapon' : 'armor'} already is`);
    if (added === 0) errors.push('nothing to add: choose a higher bonus or a special ability');
    const needMw = current.enh > 0 || current.masterwork ? 0 : (base.price_gp || 0) + mw;
    const reqs = buying ? [] : [{ type: 'cl', level: 3 * form.enh, text: `caster level ${3 * form.enh} (three times the enhancement bonus)` },
      ...abilities.flatMap(a => requirementsOf(app, data.itemsById.get(a.id).construction?.requirements, CRAFT_FEATS.weapon)
        .map(r => ({ ...r, text: `${r.text} (${a.name})` })))];
    const saved = abilities.map(({ cl, ...a }) => a);
    const title = `${magicPrefix(form.enh, true, saved)} ${base.name}`;
    const bonusParts = [`+${form.enh} enhancement`, ...abilities.filter(a => a.bonus).map(a => `${a.name} +${a.bonus}`)].join(', ');
    const priceWhy = [
      { label: `${base.name}`, text: formatGp(base.price_gp || 0) },
      { label: 'Masterwork (magic weapons and armor always are)', text: `+${formatGp(mw)}` },
      { label: `Magic: total bonus +${price.effective} (${bonusParts}), squared × ${formatGp(per)}`, text: `+${formatGp(price.effective * price.effective * per)}` },
      ...abilities.filter(a => a.gp).map(a => ({ label: `${a.name} (flat price)`, text: `+${formatGp(a.gp)}` })),
    ];
    const costWhy = [
      { label: 'New magic (the magic part of the price)', text: formatGp(price.base) },
      ...(oldMagic ? [{ label: 'Magic it already has (not paid again)', text: `−${formatGp(oldMagic)}` }] : []),
      ...(buying ? [] : [{ label: 'Making it: half of the magic you add', text: formatGp(craftCost(Math.max(0, added))) }]),
      ...(needMw ? [{ label: `The masterwork ${base.name.toLowerCase()} itself (paid in full)`, text: `+${formatGp(needMw)}` }]
        : [{ label: `The ${base.name.toLowerCase()} is already masterwork or magic`, text: '+0 gp' }]),
    ];
    return {
      why: { price: priceWhy, cost: costWhy, base: Math.max(0, added) },
      title, feat: CRAFT_FEATS[form.kind], itemCL: price.casterLevel, base: Math.max(0, added),
      market: (base.price_gp || 0) + mw + price.base,
      cost: buying ? Math.max(0, added) + needMw : craftCost(Math.max(0, added), needMw), errors,
      reqs: checkRequirements(reqs, ctx(0)), mandatory: [],
      note: [needMw ? `Includes the masterwork ${base.name.toLowerCase()} (${formatGp(needMw)}).` : '',
             oldMagic ? `It already has magic: you pay only for what you add${buying ? '' : ' (Adding New Abilities)'}.` : ''].filter(Boolean).join(' '),
      apply: () => apply(form.enh, saved),
    };
  }

  if (form.kind === 'spell') {
    let spell, sl, min, max, clsNote = '';
    if (buying) {
      spell = data.spellsById?.get(form.spell);
      if (!spell) return { empty: 'Choose a spell.' };
      const m = marketSpell(app, spell);
      if (!m) return { empty: 'Choose a spell.' };
      ({ sl, min } = m);
      max = 20;
    } else {
      const [clsId, spellId] = form.spell.split('|');
      const caster = list.find(x => x.cls.id === clsId);
      spell = data.spellsById?.get(spellId);
      if (!caster || !spell) return { empty: list.length ? 'Choose a spell you can cast.' : 'Only spellcasters can brew potions, scribe scrolls or craft wands.' };
      sl = spell.levels[clsId];
      min = minCasterLevel(caster.cls, sl);
      max = caster.cl;
      clsNote = caster.cls.name;
    }
    // Starts at the lowest caster level that can cast the spell (the usual, cheapest choice); it can be raised.
    const cl = Math.min(max, Math.max(min, form.cl || min));
    const info = SPELL_ITEMS[form.spellKind];
    const price = spellItemPrice(form.spellKind, sl, cl);
    const errors = [...price.errors];
    if (form.spellKind === 'potion' && /^personal/i.test(spell.range || '')) errors.push('spells with a range of personal can\'t be made into potions');
    const spellWhy = [{ label: `${info.label} price per spell level per caster level`, text: formatGp(info.perLevel) },
      { label: `Spell level${clsNote ? ` (${clsNote})` : ''}`, text: sl === 0 ? '× ½ (0-level)' : `× ${sl}` },
      { label: 'Caster level', text: `× ${cl}` }];
    return {
      why: { price: spellWhy, cost: [...spellWhy, { label: 'Market price', text: formatGp(price.base) },
        ...(buying ? [] : [{ label: 'Making it costs half', text: formatGp(craftCost(price.base)) }])], base: price.base },
      title: `${info.label} of ${spell.name} (caster level ${cl})`, feat: CRAFT_FEATS[form.spellKind], itemCL: cl, clRange: [min, max],
      base: price.base, market: price.base, cost: buying ? price.base : craftCost(price.base), errors, reqs: [], mandatory: [],
      note: `${info.label} price: ${info.perLevel} gp × spell level ${sl === 0 ? '0 (counts as ½)' : sl}${clsNote ? ` (${clsNote})` : ''} × caster level ${cl}`
        + (buying ? '.' : '; making it costs half.')
        + (!buying && spell.components && /\bM\b|\bF\b/.test(spell.components) ? ' Material components or a focus the spell needs are extra.' : ''),
      apply: () => {
        const items = state.craftedItems.map(x => ({ ...x }));
        const same = items.find(x => x.kind === form.spellKind && x.spellId === spell.id && x.cl === cl && !!x.bought === buying);
        if (same) same.qty += 1;
        else items.push({ kind: form.spellKind, spellId: spell.id, spellName: spell.name, spellLevel: sl, cl, qty: 1, ...(buying ? { bought: true } : {}) });
        app.update({ craftedItems: items });
      },
    };
  }

  // A listed item (craft mode only): chosen in the wondrous item list here, or from the Magic Items tab.
  const item = data.itemsById.get(form.itemId);
  if (form.kind === 'wondrous' && (!item || itemKind(item) !== 'wondrous')) return { empty: 'Choose a wondrous item above (search by name, or pick a slot).' };
  if (!item) return { empty: 'Choose an item on the Magic Items tab and press "Craft this item" in its details.' };
  const kind = itemKind(item);
  const option = form.option || item.price_options?.[0]?.label || null;
  const price = magicItemStats(item, option).price_gp;
  const text = item.construction?.requirements;
  const reqs = text ? requirementsOf(app, text, CRAFT_FEATS[kind]) : [];
  const checked = checkRequirements(reqs, ctx(optionBonus(option)));
  // Staves are spell-trigger items: their spells are required, not just +5 to the DC.
  const mandatory = kind === 'staff' ? checked.filter(r => (r.type === 'spell' || r.type === 'spells') && r.status === 'unmet') : [];
  const listedCostNow = listedCost(item, option, price);
  return {
    why: { price: [{ label: `${item.name}${option ? ` (${option})` : ''}: listed price`, text: price === null ? 'none listed' : formatGp(price) }],
      cost: [{ label: 'Market price', text: price === null ? '—' : formatGp(price) },
        { label: item.construction?.cost ? `Cost to make, from the item's Construction line (${item.construction.cost})` : 'Making it costs half the price',
          text: listedCostNow === null ? '—' : formatGp(listedCostNow) }], base: price ?? 0 },
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

// The special ability picker: the chosen ones (with a version choice and Remove) and a list to add another.
export function abilityPicker(app, category, picks, attrs) {
  const { data } = app;
  const all = data.items.filter(i => i.category === category && abilityOptions(i).length && !picks.some(a => a.id === i.id));
  const chosen = picks.map((pick, i) => {
    const a = data.itemsById.get(pick.id);
    if (!a) return '';
    const opts = abilityOptions(a);
    const which = opts.length > 1 ? `<select ${attrs.option}="${i}" aria-label="${esc(a.name)} version">${opts.map(o =>
      `<option value="${esc(o.label)}"${o.label === pick.option ? ' selected' : ''}>${esc(o.label)} (${o.bonus ? `+${o.bonus} bonus` : formatGp(o.gp)})</option>`).join('')}</select>` : '';
    const o = opts.find(x => x.label === pick.option) || opts[0];
    return `<li><b>${esc(a.name)}</b> ${which} <small class="muted">${o.bonus ? `+${o.bonus} bonus` : `+${esc(formatGp(o.gp))}`} · caster level ${esc(a.cl ?? '?')}</small>
      <button type="button" class="skill-details" data-ability-pop="${esc(a.id)}">Details</button>
      <button type="button" ${attrs.remove}="${i}">Remove</button></li>`;
  }).join('');
  // Every special ability that could be added, each with a Details button (its popup can add it).
  const browse = all.length ? `<details class="arch-feature ability-browse"><summary>Browse all ${all.length} ${esc(category.toLowerCase())}</summary>
      <ul class="pick-list">${all.map(a => {
        const opts = abilityOptions(a);
        const o = opts[0];
        return `<li class="with-details"><button type="button" data-ability-pop="${esc(a.id)}">${esc(a.name)}
            <small>${o.bonus ? `+${o.bonus} bonus` : esc(formatGp(o.gp))}${opts.length > 1 ? ', several versions' : ''}</small></button>
          <button type="button" class="skill-details" data-ability-pop="${esc(a.id)}" aria-label="${esc(a.name)} in a popup">Details</button></li>`;
      }).join('')}</ul></details>` : '';
  return `<div class="craft-abilities"><b>Special abilities</b>
      ${chosen ? `<ul class="plain-list">${chosen}</ul>` : '<p class="hint">None. Add one below (each adds its bonus to the price).</p>'}
      <select ${attrs.add} aria-label="Add a special ability"${attrs.disabled ? ' disabled' : ''}><option value="">Add a special ability…</option>
        ${all.map(a => { const o = abilityOptions(a)[0]; return `<option value="${esc(a.id)}">${esc(a.name)} (${o.bonus ? `+${o.bonus}` : formatGp(o.gp)}${abilityOptions(a).length > 1 ? ', several versions' : ''})</option>`; }).join('')}
      </select>${browse}</div>`;
}

// A Details button beside one of the crafting card's choices (its popup is craftInfo).
const info = (key, label) => ` <button type="button" class="skill-details" data-craft-info="${key}" aria-label="${esc(label)}">Details</button>`;

// The popups behind those buttons: what each kind of item needs and costs, the enhancement bonuses, the caster level,
// how requirements work, and the item or spell itself.
function craftInfo(app, c, key) {
  const form = c.form;
  const have = new Set(app.view.haveFeats);
  const feat = f => `${have.has(f) ? '✓' : '✗'} ${f}`;
  const table = (head, rows) => `<table class="skill-why"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if (key === 'kind') {
    app.openDetail('What each kind of item needs', `${table(['Item', 'Feat', 'Lowest caster level', 'Price'], [
        ['Magic weapon', feat('Craft Magic Arms and Armor'), '3 × its bonus', 'bonus² × 2,000 gp + 300 gp masterwork'],
        ['Magic armor or shield', feat('Craft Magic Arms and Armor'), '3 × its bonus', 'bonus² × 1,000 gp + 150 gp masterwork'],
        ['Potion (spells up to 3rd)', feat('Brew Potion'), 'the spell\u2019s', '50 gp × spell level × caster level'],
        ['Scroll (any spell level)', feat('Scribe Scroll'), 'the spell\u2019s', '25 gp × spell level × caster level'],
        ['Wand (spells up to 4th)', feat('Craft Wand'), 'the spell\u2019s', '750 gp × spell level × caster level'],
        ['Wondrous item', feat('Craft Wondrous Item'), '3', 'as listed'], ['Ring', feat('Forge Ring'), '7', 'as listed'],
        ['Rod', feat('Craft Rod'), '9', 'as listed'], ['Staff', feat('Craft Staff'), '11', 'as listed']])}
      <p class="hint">${c.mode === 'buy' ? 'Buying or finding an item needs none of this: you pay the market price.'
        : 'Making an item costs half its price in materials (a masterwork weapon or armor, and costly spell components, are paid in full), takes 8 hours per 1,000 gp of the price, and needs a Spellcraft check (DC 5 + caster level). Level 0 spells count as ½.'}</p>`);
  }
  if (key === 'enh') {
    const weapon = form.kind === 'weapon';
    const per = weapon ? 2000 : 1000;
    app.openDetail(`${weapon ? 'Weapon' : 'Armor'} enhancement bonuses`, `${table(['Bonus', 'Price of the magic', 'Cost to make', 'Lowest caster level'],
        [1, 2, 3, 4, 5].map(n => [`+${n}`, formatGp(n * n * per), formatGp(n * n * per / 2), String(3 * n)]))}
      <p class="hint">Special abilities add their bonus to the total before it's squared (a +1 flaming ${weapon ? 'weapon' : 'armor'} is priced as +2),
        and the total can't go above +10. The ${weapon ? 'weapon' : 'armor'} must be masterwork (${weapon ? '300' : '150'} gp, paid in full).</p>`);
  }
  if (key === 'cl') {
    app.openDetail('Caster level', `<p>The caster level is how strongly the item casts its spell: a higher one makes the spell
      stronger where it scales (more damage, longer duration, harder to dispel) and raises the price and cost (they multiply by
      it) and the Spellcraft DC (5 + caster level). It can't be lower than the lowest level that can cast the spell, nor higher
      than your own caster level when you make it.</p>`);
  }
  if (key === 'reqs') {
    app.openDetail('Requirements', `<p>Each requirement you don't meet adds +5 to the Spellcraft DC, but you can still try. Two
      can't be skipped: the item creation feat, and (for potions, scrolls and wands) the spell itself, which you must be able to
      cast. Requirements the app checks are marked ✓ or ✗; tick "I meet this" for the ones it can't check, and count any others
      with − / +.</p>`);
  }
  // The weapon, armor or spell itself, in a popup here (the Craft tab stays open).
  if (key === 'target') {
    if (form.kind === 'weapon') {
      const e = app.state.weapons[form.weapon];
      const w = e && app.data.weaponsById?.get(e.id);
      if (!w) { app.openDetail('No weapon', '<p>Add a weapon on the Weapons tab first.</p>'); return; }
      app.openDetail(weaponLabel(w, e), `<p class="hint">${esc(w.category || '')} · ${esc(w.proficiency || '')} · ${esc(w.source || '')}</p>
        ${facts([['Damage (Medium)', w.damage?.m || null], ['Critical', w.critical || null], ['Range', w.range_ft ? `${w.range_ft} ft.` : null],
                 ['Type', w.type || null], ['Special', (w.special || []).join(', ') || null], ['Price', w.price || null], ['Weight', w.weight_lbs ? `${w.weight_lbs} lbs.` : null]])}
        ${w.description ? paragraphs(w.description) : ''}`);
    } else {
      const id = app.state[`${form.target === 'shield' ? 'shield' : 'armor'}Id`];
      const a = id && app.data.armorById.get(id);
      if (!a) { app.openDetail('Nothing worn', '<p>Choose armor or a shield on the Armor tab first.</p>'); return; }
      app.openDetail(a.name, `${facts([[a.category === 'shield' ? 'Shield bonus' : 'Armor bonus', signed(a.bonus)], ['Max Dex bonus', a.max_dex === null ? 'no limit' : signed(a.max_dex)],
                 ['Armor check penalty', a.check_penalty], ['Arcane spell failure', `${a.spell_failure}%`], ['Price', a.price_gp !== null ? formatGp(a.price_gp) : null]])}
        ${a.description ? paragraphs(a.description) : ''}`);
    }
  }
  if (key === 'spell' && form.spell) {
    const sp = (app.data.spells || []).find(x => x.id === String(form.spell).split('|').pop());
    if (sp) app.openDetail(sp.name, `<p class="hint">${esc(sp.school || '')} · ${esc(Object.entries(sp.levels || {}).map(([k, v]) => `${k} ${v}`).join(', '))}</p>
      ${facts([['Casting time', sp.casting_time || null], ['Range', sp.range || null], ['Duration', sp.duration || null],
               ['Saving throw', sp.saving_throw || null], ['Spell resistance', sp.spell_resistance || null]])}
      ${paragraphs(sp.description || '')}`);
  }
}

function kindControls(app, list, p, c) {
  const { state, data } = app;
  const form = c.form;
  if (form.kind === 'weapon' || form.kind === 'armor') {
    const isWeapon = form.kind === 'weapon';
    const pickTarget = isWeapon
      ? `<label>Weapon <select data-craft="weapon">${state.weapons.map((e, i) => {
          const w = data.weaponsById?.get(e.id);
          return w ? `<option value="${i}"${i === form.weapon ? ' selected' : ''}>${esc(weaponLabel(w, e))}</option>` : '';
        }).join('')}</select></label>${info('target', 'The weapon')}`
      : `<label>Make magic <select data-craft="target">
          <option value="armor"${form.target === 'armor' ? ' selected' : ''}>worn armor${data.armorById.get(state.armorId) ? ` (${esc(data.armorById.get(state.armorId).name)})` : ''}</option>
          <option value="shield"${form.target === 'shield' ? ' selected' : ''}>shield${data.armorById.get(state.shieldId) ? ` (${esc(data.armorById.get(state.shieldId).name)})` : ''}</option>
        </select></label>${info('target', 'The armor or shield')}`;
    return `${pickTarget}
      <label>Enhancement bonus <select data-craft="enh">${[1, 2, 3, 4, 5].map(n =>
        `<option value="${n}"${n === form.enh ? ' selected' : ''}>+${n}</option>`).join('')}</select></label>${info('enh', 'Each enhancement bonus')}
      ${abilityPicker(app, isWeapon ? 'Weapon Special Abilities' : 'Armor and Shield Special Abilities', form.abilities,
                      { option: 'data-craft-option', remove: 'data-craft-remove', add: 'data-craft="add-ability"' })}`;
  }
  if (form.kind === 'spell') {
    const kindSelect = `<label>${c.mode === 'buy' ? 'Add a' : 'Make a'} <select data-craft="spellKind">${Object.entries(SPELL_ITEMS).map(([k, v]) =>
      `<option value="${k}"${k === form.spellKind ? ' selected' : ''}>${v.label.toLowerCase()} (spells up to level ${v.maxSpellLevel})</option>`).join('')}</select></label>${info('kind', 'Potions, scrolls and wands')}`;
    const clInput = p.clRange ? `<label>Caster level <select data-craft="cl">${Array.from({ length: p.clRange[1] - p.clRange[0] + 1 }, (_, i) => p.clRange[0] + i)
      .map(n => `<option value="${n}"${n === p.itemCL ? ' selected' : ''}>${n}</option>`).join('')}</select></label>${info('cl', 'What the caster level changes')}` : '';
    if (c.mode === 'buy') {
      // Any spell, grouped by its lowest level on any class list.
      const max = SPELL_ITEMS[form.spellKind].maxSpellLevel;
      const byLevel = new Map();
      for (const s of data.spells || []) {
        const lv = Math.min(...Object.values(s.levels || {}));
        if (Number.isFinite(lv) && lv <= max) (byLevel.get(lv) || byLevel.set(lv, []).get(lv)).push(s);
      }
      const groups = [...byLevel.keys()].sort((a, b) => a - b).map(lv => `<optgroup label="Level ${lv}">${byLevel.get(lv)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(s => `<option value="${esc(s.id)}"${form.spell === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
      return `${kindSelect}<label>Spell <select data-craft="spell"><option value="">Choose a spell…</option>${groups}</select></label>${form.spell ? info('spell', 'The spell') : ''}${clInput}`;
    }
    const canCast = canCastWith(app, list);
    const groups = list.map(x => {
      const spells = (data.spells || []).filter(s => s.levels[x.cls.id] !== undefined && s.levels[x.cls.id] <= Math.min(x.maxLevel, SPELL_ITEMS[form.spellKind].maxSpellLevel)
        && canCast(s.id) && (!x.spontaneous || state.spells.includes(s.id)))
        .sort((a, b) => a.levels[x.cls.id] - b.levels[x.cls.id] || a.name.localeCompare(b.name));
      return spells.length ? `<optgroup label="${esc(x.cls.name)}${x.spontaneous ? ' (spells you know)' : ''}">${spells.map(s =>
        `<option value="${esc(x.cls.id)}|${esc(s.id)}"${form.spell === `${x.cls.id}|${s.id}` ? ' selected' : ''}>${esc(s.name)} (level ${s.levels[x.cls.id]})</option>`).join('')}</optgroup>` : '';
    }).join('');
    return `${kindSelect}
      <label>Spell <select data-craft="spell"><option value="">Choose a spell…</option>${groups}</select></label>${form.spell ? info('spell', 'The spell') : ''}${clInput}
      ${list.some(x => x.spontaneous) ? '<p class="hint">Sorcerers, bards and other spontaneous casters can use only spells they know: add them under My spells on the Spells tab.</p>' : ''}`;
  }
  const item = data.itemsById.get(form.itemId);
  const opts = item?.price_options || [];
  if (form.kind === 'wondrous') {
    const slots = [...new Set(wondrousItems(app).map(slotOf))].sort((a, b) => (a === 'slotless') - (b === 'slotless') || a.localeCompare(b));
    const chosen = item && itemKind(item) === 'wondrous' ? item : null;
    return `<label>Search <input type="search" data-craft="wsearch" value="${esc(form.wsearch)}" placeholder="Name, e.g. cloak" autocomplete="off"></label>
      <label>Slot <select data-craft="wslot"><option value="">Any slot</option>${slots.map(s => `<option value="${esc(s)}"${s === form.wslot ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Item <select data-craft="witem">${wondrousOptions(app, form)}</select></label>
      ${chosen ? `<p><small class="muted">${esc(slotOf(chosen))} slot · caster level ${esc(chosen.cl ?? '?')} · ${esc(chosen.source || '')}</small>
        <button type="button" class="skill-details" data-craft-item-pop="${esc(chosen.id)}">Details</button></p>
        ${opts.length ? `<label>Version <select data-craft="option">${opts.map(o => `<option value="${esc(o.label)}"${o.label === (form.option || opts[0].label) ? ' selected' : ''}>${esc(o.label)} (${esc(formatGp(o.price_gp))})</option>`).join('')}</select></label>` : ''}` : ''}`;
  }
  return item ? `<p><b>${esc(item.name)}</b> <small class="muted">${esc(item.category)} · caster level ${esc(item.cl ?? '?')}</small></p>
      ${opts.length ? `<label>Version <select data-craft="option">${opts.map(o => `<option value="${esc(o.label)}"${o.label === (form.option || opts[0].label) ? ' selected' : ''}>${esc(o.label)} (${esc(formatGp(o.price_gp))})</option>`).join('')}</select></label>` : ''}`
    : '';
}

function renderCard(app, c) {
  const { form } = c;
  const list = casters(app);
  const p = plan(app, list, c);
  const kinds = `<label>${c.mode === 'buy' ? 'What to add' : 'What to make'} <select data-craft="kind">${c.kinds.map(([k, label]) =>
    `<option value="${k}"${k === form.kind ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${info('kind', 'What each kind of item needs')}`;
  if (p.empty) {
    $(c.body).innerHTML = `${kinds}${kindControls(app, list, p, c)}<p class="hint">${esc(p.empty)}</p>`;
    return;
  }
  const done = form.message ? `<p class="craft-done">${esc(form.message)}</p>` : '';
  if (c.mode === 'buy') {
    const ok = !p.errors.length && p.cost !== null;
    cardWhy.set(c.mode, { cost: { title: `You pay: ${p.cost === null ? '—' : formatGp(p.cost)}`, rows: p.why?.cost || [], total: p.cost === null ? '—' : formatGp(p.cost) } });
    const why = key => (p.why ? ` <button type="button" class="skill-details" data-craft-why="${key}" aria-label="How this is worked out">Details</button>` : '');
    $(c.body).innerHTML = `${kinds}
      <div class="craft-controls">${kindControls(app, list, p, c)}</div>
      <h3>${esc(p.title)}</h3>
      <dl class="facts"><dt>Market price</dt><dd>${esc(p.market === null ? '—' : formatGp(p.market))}</dd>
        <dt>You pay</dt><dd><b>${esc(p.cost === null ? '—' : formatGp(p.cost))}</b>${why('cost')}</dd></dl>
      ${p.note ? `<p class="hint">${esc(p.note)}</p>` : ''}
      ${p.errors.length ? `<p class="warning">Can't be added: ${esc(p.errors.join('; '))}.</p>` : ''}
      <div class="slot-buttons"><button type="button" class="primary" data-craft-make${ok ? '' : ' disabled'}>Add it (${esc(p.cost === null ? '—' : formatGp(p.cost))})</button></div>
      ${done}`;
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
  // The popups behind this card's Details buttons.
  const unmetNames = [...p.reqs.filter((r, i) => r.status === 'unmet' || (r.status === 'ask' && !form.confirmed.has(i))).map(r => r.text),
    ...Array.from({ length: form.extraUnmet }, () => 'another requirement you counted')];
  const spellish = form.kind === 'spell' && (form.spellKind === 'potion' || form.spellKind === 'scroll');
  cardWhy.set(c.mode, {
    price: { title: `Market price: ${p.market === null ? '—' : formatGp(p.market)}`, rows: p.why?.price || [], total: p.market === null ? '—' : formatGp(p.market) },
    cost: { title: `Cost to make: ${p.cost === null ? '—' : formatGp(p.cost)}`, rows: p.why?.cost || [], total: p.cost === null ? '—' : formatGp(p.cost),
            note: 'Making an item costs half its base price in materials; anything bought rather than made (the masterwork item, material components) is paid in full.' },
    time: { title: 'Time to make', total: time.hours < 8 ? `${time.hours} hours` : `${time.days} day${time.days === 1 ? '' : 's'}`, rows: [
      { label: 'Base price of what you are making (the magic part)', text: formatGp(p.why?.base ?? p.base) },
      spellish && (p.why?.base ?? p.base) <= 250 ? { label: 'Potions and scrolls of 250 gp or less', text: '2 hours' }
        : { label: '8 hours per 1,000 gp (at least 8)', text: `${Math.max(8, 8 * Math.ceil((p.why?.base ?? p.base) / 1000))} hours` },
      ...(form.rushed ? [{ label: 'Rushed: half the time (+5 to the DC)', text: `${time.hours} hours` }] : []),
      { label: '8 hours of work a day, one item a day at most', text: `${time.days} day${time.days === 1 ? '' : 's'}` }] },
    dc: { title: `Spellcraft DC ${dc}`, total: String(dc), rows: [
      { label: 'Base', text: '5' }, { label: "Item's caster level", text: `+${p.itemCL}` },
      ...unmetNames.map(n => ({ label: `Requirement not met: ${n}`, text: '+5' })),
      ...(form.rushed ? [{ label: 'Rushed', text: '+5' }] : [])],
      note: `Your Spellcraft: ${sc.usable ? signed(sc.total) : 'untrained'}${take10 !== null ? `; taking 10 gives ${take10}` : ''}. Failing wastes the time and gold; failing by 5 or more makes a cursed item.` },
  });
  const why = key => ` <button type="button" class="skill-details" data-craft-why="${key}" aria-label="How this is worked out">Details</button>`;
  $(c.body).innerHTML = `${kinds}
    <div class="craft-controls">${kindControls(app, list, p, c)}</div>
    <h3>${esc(p.title)}</h3>
    <ul class="plain-list craft-reqs">
      <li class="req-${hasFeat ? 'met' : 'unmet'}">${hasFeat ? '✓' : '✗'} ${esc(p.feat)} (required)</li>
      ${reqRows}
      ${p.noRequirements ? '<li class="hint">The data doesn\'t list this item\'s requirements (most Ultimate Equipment items); count any you don\'t meet below.</li>' : ''}
    </ul>
    <div class="craft-extra">
      <span>Other requirements you don't meet${info('reqs', 'How requirements work')}</span>
      <span class="base"><button type="button" data-craft-extra="-1" aria-label="One fewer">−</button><span class="value">${form.extraUnmet}</span>
        <button type="button" data-craft-extra="1" aria-label="One more">+</button></span>
      <label class="check-row"><input type="checkbox" data-craft="rushed"${form.rushed ? ' checked' : ''}> Rush it (half the time, +5 DC)</label>
    </div>
    <dl class="facts">
      <dt>Market price</dt><dd>${esc(p.market === null ? '—' : formatGp(p.market))}${why('price')}</dd>
      <dt>Cost to make</dt><dd><b>${esc(p.cost === null ? '—' : formatGp(p.cost))}</b>${why('cost')}</dd>
      <dt>Time</dt><dd>${time.hours < 8 ? `${time.hours} hours` : `${time.days} day${time.days === 1 ? '' : 's'} (${time.hours} hours of work)`}${why('time')}</dd>
      <dt>Spellcraft DC</dt><dd>${dc} <small class="muted">(5 + caster level ${p.itemCL}${unmet ? ` + ${5 * unmet} for ${unmet} unmet requirement${unmet === 1 ? '' : 's'}` : ''}${form.rushed ? ' + 5 rushed' : ''})</small>${why('dc')}</dd>
      <dt>Your Spellcraft</dt><dd>${sc.usable ? `${signed(sc.total)} ${rollButton({ title: `Spellcraft to craft ${p.title} (DC ${dc})`, check: 'Spellcraft', groups: [{ attacks: [sc.total] }] })}
        <small class="muted">taking 10 gives ${take10}: ${take10 >= dc ? 'success' : 'not enough'}</small>` : 'untrained (Spellcraft needs ranks)'}</dd>
    </dl>
    ${p.note ? `<p class="hint">${esc(p.note)}</p>` : ''}
    ${p.errors.length ? `<p class="warning">Can't be made: ${esc(p.errors.join('; '))}.</p>` : ''}
    ${p.mandatory.length ? `<p class="warning">You must be able to cast ${esc(p.mandatory.map(r => r.text).join(', '))} to make it.</p>` : ''}
    ${!hasFeat ? `<p class="warning">You need the ${esc(p.feat)} feat.</p>` : ''}
    <p class="hint">Failing the check wastes the time and gold; failing by 5 or more makes a cursed item. At most one item a day.</p>
    <div class="slot-buttons"><button type="button" class="primary" data-craft-make${ok ? '' : ' disabled'}>Craft it (${esc(p.cost === null ? '—' : formatGp(p.cost))})</button></div>
    ${done}`;
}

// Draws the cards whose tab is open (they need the magic items, spells and weapons loaded).
export function renderCrafting(app, which = null) {
  if (!app.data.itemsById) { app.loadItems().then(() => renderCrafting(app, which)); return; }
  if (!app.data.spells) { app.loadSpells().then(() => renderCrafting(app, which)); return; }
  if (!app.data.weaponsById && app.state.weapons.length) { app.loadWeapons().then(() => renderCrafting(app, which)); return; }
  for (const c of Object.values(CARDS)) {
    if ((!which || which === c.mode) && $(c.card)) renderCard(app, c);
  }
}

// Making worn armor or a shield magic from the Armor tab's list: the Add magic gear card (buy) or the Craft tab's card
// (craft), set to that armor or shield.
export function openMagicArmor(app, target, mode = 'buy') {
  const c = CARDS[mode];
  const enh = Math.max(1, app.state[`${target}Enh`] || 0);
  Object.assign(c.form, { kind: 'armor', target, enh, abilities: [], confirmed: new Set(), extraUnmet: 0, message: '' });
  app.showTab(mode === 'buy' ? 'magic-items' : 'craft');
  renderCrafting(app, mode);
  $(c.card).scrollIntoView({ block: 'start' });
}

// "Craft this item" in a magic item's details: plan it on the Craft tab.
export function craftListedItem(app, id, option) {
  Object.assign(CARDS.craft.form, { kind: 'item', itemId: id, option: option || '', confirmed: new Set(), extraUnmet: 0, message: '' });
  app.showTab('craft');
  renderCrafting(app, 'craft');
  $('craft-card').scrollIntoView({ block: 'start' });
}

// The Details popups' contents, by card mode, filled when the card is drawn.
const cardWhy = new Map();

function initCard(app, c) {
  const card = $(c.card);
  const form = c.form;
  const redraw = () => renderCard(app, c);
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
    else if (k === 'wslot') form.wslot = t.value;
    else if (k === 'witem') { form.itemId = t.value; form.option = ''; form.extraUnmet = 0; reset(); }
    else if (k === 'wsearch') return;
    else if (k === 'rushed') form.rushed = t.checked;
    else if (t.dataset.craftOption !== undefined) form.abilities[Number(t.dataset.craftOption)].option = t.value;
    else if (t.dataset.craftConfirm !== undefined) {
      const i = Number(t.dataset.craftConfirm);
      if (t.checked) form.confirmed.add(i); else form.confirmed.delete(i);
    } else return;
    redraw();
  });
  // The wondrous item search narrows the item list as you type (the list is rebuilt in place, so the box keeps focus).
  card.addEventListener('input', e => {
    if (e.target.dataset.craft !== 'wsearch') return;
    form.wsearch = e.target.value;
    const sel = card.querySelector('[data-craft="witem"]');
    if (sel) sel.innerHTML = wondrousOptions(app, form);
  });
  card.addEventListener('click', e => {
    const ip = e.target.closest('[data-craft-item-pop]');
    if (ip) {
      const it = app.data.itemsById.get(ip.dataset.craftItemPop);
      if (it) app.openDetail(it.name, `<p class="hint">${esc(it.category)} · ${esc(slotOf(it))} slot · ${esc(it.source || '')}</p>
        ${facts([['Price', it.price], ['Aura', it.aura], ['Caster level', it.cl], ['Weight', it.weight]])}
        ${paragraphs(it.description) || '<p class="hint">The source has no description for it.</p>'}
        ${it.construction?.requirements || it.construction?.cost ? `<h4>Construction</h4>${facts([['Requirements', it.construction.requirements], ['Cost', it.construction.cost]])}` : ''}`);
      return;
    }
    const ci = e.target.closest('[data-craft-info]');
    if (ci) { e.preventDefault(); craftInfo(app, c, ci.dataset.craftInfo); return; }
    const w = e.target.closest('[data-craft-why]');
    const d = w && cardWhy.get(c.mode)?.[w.dataset.craftWhy];
    if (d) {
      app.openDetail(d.title, `<table class="skill-why"><tbody>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.text)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total</b></td><td class="num"><b>${esc(d.total)}</b></td></tr></tfoot></table>${d.note ? `<p class="hint">${esc(d.note)}</p>` : ''}`);
      return;
    }
    const rm = e.target.closest('[data-craft-remove]');
    if (rm) { form.abilities.splice(Number(rm.dataset.craftRemove), 1); reset(); redraw(); return; }
    const extra = e.target.closest('[data-craft-extra]');
    if (extra) { form.extraUnmet = Math.max(0, form.extraUnmet + Number(extra.dataset.craftExtra)); redraw(); return; }
    if (e.target.closest('[data-craft-make]')) {
      const p = plan(app, casters(app), c);
      if (!p.apply) return;
      p.apply();
      form.message = c.mode === 'buy'
        ? `Added ${p.title} for ${formatGp(p.cost)} (counted in your gold on the Equipment tab).`
        : `Made ${p.title} for ${formatGp(p.cost)} (counted in your gold on the Equipment tab).`;
      form.abilities = [];
      redraw();
    }
  });
}

// A special ability in a popup: what it does, its price (each version), aura and caster level, and what making it
// needs. From a picker it can also be added (the picker's own list does the adding, so every card works the same way).
function popAbility(app, id, picker) {
  const a = app.data.itemsById?.get(id);
  if (!a) return;
  const opts = abilityOptions(a);
  const c = a.construction || {};
  const addSel = picker ? [...picker.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === id)) : null;
  const price = opts.map(o => `${o.label ? `${o.label}: ` : ''}${o.bonus ? `+${o.bonus} bonus (counts toward the total bonus, which is squared)` : `+${formatGp(o.gp)}`}`).join('; ');
  app.openDetail(a.name, `<p class="hint">${esc(a.category)} · ${esc(a.source || '')}</p>
    ${facts([['Price', price || a.price], ['Aura', a.aura], ['Caster level', a.cl]])}
    ${paragraphs(a.description) || '<p class="hint">The source has no description for it.</p>'}
    ${c.requirements || c.cost ? `<h4>Construction</h4>${facts([['Requirements', c.requirements], ['Cost', c.cost]])}` : ''}
    <p class="hint">A weapon or armor needs at least a +1 enhancement bonus before special abilities can be added, and the total bonus
      (enhancement plus abilities) can be at most +10.</p>`,
    addSel && !addSel.disabled ? [{ label: `Add ${a.name}`, primary: true, run: () => {
      addSel.value = id;
      addSel.dispatchEvent(new Event('change', { bubbles: true }));
    } }] : []);
}

export function initCrafting(app) {
  for (const c of Object.values(CARDS)) if ($(c.card)) initCard(app, c);
  // Details on special abilities, wherever a picker is (Craft tab, Add magic gear, weapon cards).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ability-pop]');
    if (!b) return;
    popAbility(app, b.dataset.abilityPop, b.closest('.craft-abilities'));
  });
}
