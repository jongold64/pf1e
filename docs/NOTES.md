# Developer notes

Detailed notes on how the app, the data builders and the license fit together. CLAUDE.md has the short
version; read the section here for whatever part you're changing.

## What this repo is

Data for a Pathfinder 1e character builder: Python scripts in `scripts/` convert the
[PSRD-Data](https://github.com/devonjones/PSRD-Data) SQLite books into plain-text JSON in `data/`
(`races.json`, `classes.json`, `feats.json`, `armor.json`, `magic-items.json`, `spells.json`,
`equipment.json`, `weapons.json`) plus
`LICENSE-OGL.txt`. The JSON files are generated
artifacts — change the scripts and rebuild rather than hand-editing them. The README documents the
output record schemas and known data gaps.

On top of the data is a static web app (character builder, levels 1-20, multiclass and prestige classes) with tabs: Character (race,
class, point buy, results, global search), Feats, Skills, Spells (per day + class spell list), Magic Items
(browse by category with a details panel), Armor, Weapons (attack bonus and damage per carried weapon),
and Equipment (inventory + gold + weight; armor and weapons are kept separate from it). Every tab except Character has its own search
box that looks only through what that tab covers; the Character tab's search covers everything,
hosted on GitHub Pages and used on a laptop and a tablet. The user is new to coding: keep the app
plain HTML/CSS/JavaScript with ES modules, no framework, no build step and no npm dependencies, and
explain any new tool before asking them to install it.

## Web app

```
python -m http.server 8000     # from the repo root; then open http://localhost:8000/
```

The page must be served over HTTP (it `fetch`es `data/*.json`); opening `index.html` directly fails.
Tests: open `http://localhost:8000/tests.html`, which runs `js/rules.test.js` in the browser and
lists pass/fail. There is no command-line test runner (Node is not installed).

- `js/rules.js` holds all rules math as pure functions (point-buy costs, modifiers, racial
  adjustments, level-based ability increases, `characterStats`). Put new calculations here and add checks to `js/rules.test.js`.
- `js/app.js` owns the page: loads races/classes/feats/armor at start (spells and magic items load on
  first use via `loadSpells`/`loadItems`/`loadGear`), keeps one `state` object (the open character) saved to
  `localStorage` through `js/storage.js`, computes a shared `view` (stats, gear, feat context) in `computeView()`, and re-renders
  on each change via `update()` → `render()`. Tabs are `<main class="tab-panel">` elements switched by
  `showTab()`; the open tab is kept in the URL hash (`#spells`). Tab modules get an `app` object
  (`state`, `data`, `update`, `view`, `showTab`, `openDetail`, `openResult`): `tab-armor.js`,
  `tab-spells.js`, `tab-items.js`, `tab-weapons.js`, `tab-equipment.js`, `search-ui.js`. Shared DOM helpers are in
  `dom.js`. The Feats, Skills and Armor tab searches live in `app.js` (`initTabSearches`).
- Saved characters (`js/storage.js`): a roster `pf1e-builder-characters` = `{ current, characters: [{ id, label }] }`
  and each character under `pf1e-builder-character:<id>`. The pre-roster key `pf1e-builder-character` is migrated
  into the first character only when no roster exists, so test pages that preload a character must clear
  localStorage first. `load(saved)` resets `state` to `DEFAULTS` and repairs the saved object (used for startup,
  switching, New/Duplicate and Import); `save()` writes the open character. Export/import is a .json file
  (`exportData`/`importData`, format tag `pf1e-builder-character`).
- Printing: the Print button (or the browser's print, via `beforeprint`) fills `#print-sheet` from `js/sheet.js`
  `buildSheet` (weapon lines from `weaponSummaries` in tab-weapons.js, skill totals and money read from the
  rendered tabs); print CSS hides everything else. `combatManeuvers` (rules.js) gives CMB/CMD for the sheet.
- Equipment: `js/equipment.js` has money and weight rules (`startingGold` with the alternate-class
  fallback, `WEALTH_BY_LEVEL`, `armorCost` = base + 150 masterwork + enh² × 1,000, `equipmentTotals`,
  `formatGp`). Inventory entries are `{ id, variant, qty }`; `variant` picks one of an item's `variants`
  (e.g. common vs masterwork backpack). `state.gold === null` means "use the class's starting gold".
- Chosen spells and magic items: `state.spells` (spell ids, shown as "My spells" on the Spells tab with
  known-spell limits from the class table for spontaneous casters) and `state.magicItems`
  (`{ id, option, qty }`, "My magic items"; `option` is a `price_options` label like "+2"). Special
  abilities can't be owned alone (`ownable`). Magic item cost/weight count on the Equipment tab
  (`magicItemTotals`).
- Weapons: `js/weapons.js` — `proficiencyTest(cls, race)` reads the class proficiency text (simple /
  martial / firearms / named weapons) and racial weapon familiarity; `weaponAttack` gives iterative attack
  bonuses (BAB + Str, or Dex for ranged and for finesse weapons with Weapon Finesse; size; masterwork +1 or
  enhancement; Weapon Focus/Greater; −4 non-proficient; `armorAttackPenalty` from armor.js) and damage (size
  dice; `strToDamage`: ×1.5 two-handed, bows penalty-only unless composite, none for crossbows/firearms/tech;
  enhancement; Weapon Specialization/Greater). Feat bonuses only count when the character has the feat AND
  the weapon entry's flag is ticked. `state.weapons` entries are `{ id, enh, masterwork, focus, greaterFocus,
  spec, greaterSpec, proficient }`; `weaponCost` = price + 300 masterwork + enh² × 2,000 (counted on the
  Equipment tab).
- Combat options (Weapons tab, `state.combat`): Power Attack / Deadly Aim / Rapid Shot switches (count only with
  the feat; step from real BAB via `powerBab`), and two-weapon fighting with `main`/`off` as indexes into
  `state.weapons` ("2:1" = other end of double weapon 2, which counts as light). `weaponAttack` takes `hand`
  ('one' | 'main' | 'off' | 'flurry'), `end` (double weapon damage "1d8/1d6"), `penalty` and `options`;
  `twoWeaponAttack` applies Table 8-7 penalties and Improved/Greater TWF off-hand attacks; `flurryBabs` gives
  monk flurry (monk levels as BAB, matches the class table's Flurry column) and brawler's flurry attacks.
- Rules text is rendered by `paragraphs()` in `dom.js`: blank lines split paragraphs, single line breaks
  are kept, and runs of 2+ "a | b" lines (tables flattened by the build) become HTML tables.
- Armor: `js/armor.js` (`armorEffects`, `speedInArmor`, `proficiencyWarnings`) turns worn armor/shield +
  enhancement into AC bonus, max Dex cap, check penalty (-1 for magic/masterwork, applied to `acp` skills),
  arcane spell failure and speed. `characterStats` takes that as `gear`; a monk's AC bonus needs no armor
  and no shield.
- Search: `js/search.js` ranks names (exact, prefix, word prefix, substring, all words); `search-ui.js`
  builds the index from all data and `app.openResult()` routes each type to its tab or a details dialog.
- Multiclassing: `state.classLevels` is the class id at each character level (1st first); `state.level` and
  `state.cls` (first class) are kept in step by `syncDerived()`. `classCounts(classLevels)` gives
  `[{ cls, level }]`. `characterStats` (and `featSlots`, `skillRanksAvailable`) accept `classLevels`, or
  `{ cls, level }` for one class: BAB and base saves add up per class, iterative attacks come from total BAB
  (`babList`), HP is the first class's full die then each level's class average, favored class bonus counts
  only levels in `favoredClassId`. Class N values come from `progression[N - 1]` of that class. Class bonus
  feat slots are per class (`class-fighter-L2`); old saves with `class-L2` ids and a single `cls`/`level` are
  migrated in `load()`. Prestige classes can't be 1st level; NPC classes are filtered out.
- Spellcasting across classes: `js/multiclass.js` — `castingClasses(counts, state.casterChoices)` gives each
  casting class's effective level, adding prestige classes' `caster_advance` levels (from the build: 'arcane',
  'divine', 'alchemist' or 'any' per progression row) to a matching class (the first, or the player's choice).
  Caster level = effective level (minus 3 for classes whose spells start at 4th). Feat prerequisites use
  `featContext({ counts, casting })`: `levelsIn(ctx, 'fighter')` for class levels, class features from any class.
- Feats and prestige requirements are checked against the character as of the level they were taken:
  `slotCharacterLevel` (feats.js) turns a slot into a character level (class bonus feat n = the n-th level in that
  class), and `view.contextAt(level, exceptSlotId)` builds a feat context from the levels up to then (BAB, casting,
  ability increases, feats in earlier or same-level slots, free class feats, skill ranks capped at that level).
- Other rules details: racial natural armor / dodge bonuses that always apply are read from trait text
  (`racialAc` in rules.js); monk/brawler unarmed damage uses the Small/Large column (`unarmedForSize`); arcane spell
  failure is per class (`spellFailureByClass`: bard, skald, bloodrager, summoner, magus armor exceptions); armor and
  weapons weigh half for Small characters (`sizeWeightFactor`); everyone is proficient with unarmed strikes.
- Prestige requirements: `js/prestige.js` parses the class's requirement lines (BAB, Feats, Skills, Spells,
  Special class features, martial proficiency; alignment/languages/story ones are "?") and checks them
  against the character before its first level in the prestige class (`prestigeCheck` in app.js).
- Spells: `spellsPerDay` in `rules.js` combines the class table (`spells_per_day`/`spells_known`) with
  bonus spells from the casting ability (and `prepared` for the arcanist, from the hand-entered
  `ARCANIST_PREPARED`). `CASTING_ABILITY` and `EXTRA_SLOTS` (cleric domain, shaman
  spirit magic, wizard school, druid domain) are hand-entered because the data doesn't carry them:
  the build's `to_int` keeps only the leading number of a table cell, so printed "+1" slots are lost.
  The arcanist's "spells prepared" table is also missing from the data (hence `ARCANIST_PREPARED`).
- Feat choices: `CHOICE_FEATS` (feats.js) are taken for a weapon, skill or school. `state.featChoices[slotId]` is
  `{ feat: feat id, value }` (ignored once the slot holds a different feat); `view.featChoices` lists them. Skill
  Focus reaches skills as the name "Skill Focus (Stealth)"; weapon feats with a chosen weapon apply to it
  automatically on the Weapons tab (`flagsFor` in tab-weapons.js; the per-weapon tick boxes remain for feats with
  no weapon chosen), and Exotic/Martial Weapon Proficiency give proficiency with the chosen weapon.
- Feats: `js/feats.js` holds feat logic (pure functions, tested alongside `rules.js`). `featSlots`
  derives slots from odd levels, the race's "Bonus Feat" trait and class-table entries like "Bonus
  feat" / "Teamwork feat"; `BONUS_FEAT_RULES` encodes each class's bonus-feat restrictions from its
  rules text. `checkFeat` returns met / unmet / unknown per prerequisite; skill ranks and most `other`
  prerequisites are unknown, but `readTextPrereq` reads a few text patterns the data build missed
  ("8th-level fighter", "X with selected weapon", "ability to cast Nth-level spells"). Free class feats
  come from class-table specials (`grantedFeats`) and armor/shield proficiency from the class's
  proficiency text (`proficiencyFeats`). Mythic feats are filtered out in `app.js`.
- Skills: `js/skills.js` has the Core Rulebook skill list (abilities, trained-only, and the Craft /
  Perform / Profession "family" skills that take player-added specialties). `classSkillTest` expands
  class-data shorthand ("Craft (any)", "Knowledge (all)", limited Perform lists). Ranks per level use Int as of that level. Racial skill bonuses are parsed from trait
  text and only unconditional ones are kept. Skill ranks feed feat prerequisites via `featContext`.
- The app offers core, base, hybrid and alternate classes only: prestige and NPC classes are filtered
  out in `app.js` `start()` (the user asked for NPC classes to be removed).
- Class data quirks: the NPC classes (aristocrat, commoner, expert, warrior) have no `special` list on
  any progression row, so rules code uses `row.special || []` in case they're offered again. Some prestige classes list Disable Device
  under Int and misspell "Handle Animals" (source errors; matters once prestige classes are offered).
- The app changes by pure functions + a full re-render; UI-level behaviour (the feat picker dialog,
  skill buttons) isn't covered by tests.html, so check it in a browser after changes, including
  switching through every class.
- Race traits with a `kind` (ability_scores, size, speed, type, languages) are structured facts; traits
  without `kind` are the ones to list as racial traits. The Race card lists size, type, speed and every
  trait as buttons (`js/race-terms.js`: `raceTerms` adds general size/type/speed rules text to the race's
  own trait text); hovering, focusing or tapping one opens a popup card.
- Alternate racial traits and favored class options (`js/race-options.js`): `state.alternates` (names);
  `replacedTraits` reads "replaces X and Y" / "lose the X" against the race's trait names (stemmed; type/size/languages
  never replaced); `raceWithAlternates` returns the race with them swapped in, and computeView uses that race for
  everything (skills, AC, bonus feat, speed "base speed of N feet", Dual Talent → `dual_talent` + `state.flexible2`,
  "Replace the +2 ... to Con with a +2 ... to Dex" ability swaps). Two alternates replacing the same trait conflict.
  Favored class bonus is per level: `state.favoredPicks[i]` 'hp' | 'skill' | 'option' (old saves' single `favored`
  migrated in `load()`); `favoredChoices` → `view.favoredPicks` feed `characterStats`/`skillRanksAvailable`
  (`favoredPicks`); the option's text is shown (and totalled by `favoredOptionTotal`), not applied. Unchained classes
  use the original class's options. The later-book races get both from d20pfsrd (`build_d20_races.py`, cache
  `d20pfsrd-races`, `PAGES` map; third-party "3rd Party ..." sections and "[JBE:...]"-tagged entries skipped;
  `d20_sources` on the race puts those books' notices in the license).

- Archetypes (`js/archetypes.js`, data from `build_archetypes.py`): `state.archetypes` = { class id: [archetype ids] }.
  computeView swaps each class for `classWithArchetypes(cls, chosen)`: table entries a feature `replaces` are removed
  (kept in `row.replaced`, shown struck out) unless the feature has the same name (Zen Archer's "Bonus Feats" changes
  the list, so the bonus feat slots stay); archetype features go in `row.archetype_features` at `featureLevel` (their
  "At Nth level", else the replaced entry's level, else null for lists of extra talents/hexes); `class_skills`
  changes (set/add/remove) and `proficiency` changes (replace, or add with armor/shield/weapon groups removed via
  `changedProficiency`) are applied to the class copy, so skills, proficiency and feat prerequisites follow.
  Phrase matching (`phraseParts`/`featureBase`): a number picks that step ("armor training 1"), "gained at 2nd
  level" picks levels, a bare name every step; possessives are dropped only as a fallback ("witch's hex").
  `archetypeConflict` = both replace or change the same table entry or name the same off-table feature. Racial
  archetypes need their race. The picker is in each class's block on the Classes card (`archetypePicker`); blocks
  and feature fold-outs stay open across redraws.
- Animal companion (`js/companion.js`, card `tab-companion.js`, data `build_companions.py` -> data/companions.json:
  the Core Rulebook "Animal Companion Base Statistics" table as `progression`, its rules text sections as `rules`, and
  every `animal_companion` section with `animal_companion_details` (base + advancement) from CR, UM vermin, B1, B2, MC).
  `companionLevel(counts, { natureBond, animalDomain })` adds druid (companion bond; Animal domain bond = level - 3),
  hunter, ranger - 3, cleric with an Animal Companion domain power - 3. `companionStats` applies advancement at its level,
  table Str/Dex and natural armor, chosen increases (4th/9th/14th/20th), feats via `featEffects` plus Weapon Finesse,
  Improved Natural Armor, Improved Initiative; natural attacks: primary BAB + Str + size, secondary (hooves, tentacles,
  tail slap, wings, pincers, or "*") -5 / -2 with Multiattack (9th, 3+ attacks) and half Str, a lone attack 1 1/2 Str.
  `state.companion` = { animal, name, increases, feats (names), tricks, skills }.
- Active effects (`js/effects.js`, card in `tab-effects.js`): `state.buffs` [{ id, cl }] (hand-entered `BUFFS`, each
  `bonuses(cl)` -> [{ target, type, value }], `size` steps, `note` for what isn't applied) and `state.customEffects`
  [{ name, target, type, value, on }]. `effectTotals` stacks by type (dodge/circumstance/untyped add, penalties add, others
  highest; 'saves' expands to each save first) -> characterStats `effects` (abilities, hp, saves, AC via `acWithEffects`:
  armor/shield bonuses compete with worn armor, natural armor with racial, barkskin adds) and `stats.fx` for the rest:
  attack/damage (weaponAttack `effectAttack`/`effectDamage`, spell attacks, CMB), init, speed, skills (`effectBonus`), cmd.
  `view.size` = race size moved by enlarge/reduce, used for combat (AC, CMB, weapon dice, spells), not gear weight.
  Feat prerequisites use scores without effects (`plainScores`).
- Armor from later books: `build_foundry_armor.py` (after `build_armor.py`) adds the Foundry `armors-and-shields` pack's
  mundane pieces PSRD lacks (Adventurer's Armory 2, Adventurer's Guide, Inner Sea World Guide, UE lamellar variants...),
  Paizo books with notices only; names matched letters-only without a trailing "armor" (`SAME_AS` for renamed ones),
  specific magic armor (aura, CL, enhancement, `SKIP`) left out. Records carry `metal` (false: druids can wear it), used
  by `druidMetalWarnings` and the materials' `isMetalArmor`. Foundry has no description text for most of them.
- Armor materials (`js/materials.js`, hand-entered from the Core Rulebook / Ultimate Equipment Special Materials):
  `state.armorMaterial` / `shieldMaterial`; computeView uses `withMaterial(item, id)`, a changed copy of the armor record
  (name, price incl. masterwork, weight, max Dex, check penalty, spell failure), so cost, weight, AC and the sheet need no
  changes. Extra fields: `mw_included` (no +150 gp or second -1 penalty), `move_category` (mithral one lighter: speed and
  bard/magus spell failure; proficiency still uses `category`), `metal` (druids), `dr` (adamantine), `material_notes`.
  Mithral/darkleaf "-3 check penalty" and darkwood's "-2" include the masterwork 1; eel hide's "-1" is read the same way.
- Domains (`js/domains.js`, data from `build_domains.py`: PSRD cleric domains, APG subdomains, UM druid domains, inquisitions):
  `state.domains` = { class id: [domain ids] } (cleric 2, inquisitor 1, druid 1) and `state.natureBond` ('companion' |
  'domain'). `domainChoices` limits the druid to Air/Animal/Earth/Fire/Plant/Water/Weather, their subdomains and druid
  domains; `domainConflict` stops a subdomain going with its own domain; `domainGrants` gives a subdomain its domain's
  powers minus the one it `replaces`, and the domain's spells with its own swapped in. The druid's domain spell slot
  (`extraSlotOn('druid')`) follows the Nature bond; the Spells tab lists domain spells, the sheet prints `domainLines`.
- Archetype data: `build_archetypes.py` (PSRD: `class_archetype` sections, ARG "Name (Class)" racial archetypes with the
  race from the heading, Monster Codex ones via `MC_CLASSES`; `NOT_ARCHETYPES` skips the antipaladin's "Class
  Features") then `build_aon_archetypes.py`: every other Paizo archetype from the Archives of Nethys (d20pfsrd lacks
  the occult classes and its archetype folders mix publishers). Pages are cached in
  `C:\Users\jongo\Projects\aonprd-archetypes` (the class list page `Archetypes.aspx?Class=Name`, then
  `ArchetypeDisplay.aspx?FixedName=...`); the "Source" line gives the book, and an archetype is kept only if that
  book's notice is known (`find_notices`). Features are "<b>Name</b>: text" paragraphs split on double `<br>`, read by
  `feature_record` (level, replaces/alters, class skills, proficiency). Records carry `"origin": "aonprd"`.
- Unchained barbarian, rogue, monk and summoner: `UNCHAINED_FROM` also offers the original class's archetypes
  (`archetypesFor`); `unchainedGaps` greys out ones that replace or change a feature the unchained table doesn't have
  (names only, since unchained tables list each feature once without steps), and danger sense counts as trap sense
  (`SAME_AS`, per Pathfinder Unchained). Unnumbered table entries match any step number.
  The user's table ruling for the unchained monk (`KI_POWER_TRADE`): a monk archetype may trade away an ability the
  unchained monk no longer has by giving up one ki power per ability (`kiPowerTrades`: the first unused ki power at
  4th, 6th, ... 20th level at or after the ability's level); `unchainedFit` says whether an archetype fits and what
  it costs. Traded ki powers show struck out (`classWithArchetypes(cls, archs, kiTrades)`).
- Class level list (Classes card): every entry is a popup button (`initTermPopover` on `#class-info`, items rebuilt in
  `classItems` on each draw): class features show their rules text via `featureDescription` (table entry -> the class's
  feature by name, numbered forms like "Summon monster II" -> the base, "DR" = damage reduction, or a "Name (Su):"
  paragraph inside another feature, e.g. bard performances); replaced entries say which archetype feature replaced
  them; archetype features show their own text.
- Search (Character tab) also finds archetypes (details box with "Take …" when the character has the class and it
  doesn't clash) and traits ("Take this trait" fills the first empty trait slot; a note when all slots are full).
- Magic gear builder (`js/tab-crafting.js`, one module, two cards in `CARDS`): the **Craft tab** ("craft" mode, below)
  and the **Magic Items tab's "Add magic gear" card** ("buy" mode: treasure or purchases, no feat/requirement/DC, cost =
  market price; potions/scrolls/wands of any spell at its lowest class level and lowest caster level (`marketSpell`),
  stored with `bought: true`, which `craftedItemCost` charges in full). The Weapons tab also has a special ability
  picker per weapon (`abilityPicker`, market price, needs +1). "Craft this item" in an item's details opens the Craft
  tab (`craftListedItem`).
- Magic item creation (Core Rulebook, `js/crafting.js` + the Craft tab's card):
  magic weapon/armor (enhancement + special abilities; `abilityOptions` reads "+1 bonus" / "+3,750 gp" prices, with
  fortification and spell resistance versions; `magicArmsPrice` = (enh + bonuses)² × 2,000 or 1,000 + flat prices,
  at least +1 before abilities, at most +5/+10, caster level max(3 × enh, abilities' CL)), potions/scrolls/wands from
  spells the character can cast (spontaneous casters: "My spells" only; price 50/25/750 × spell level (0 = ½) × CL,
  CL from the class's lowest to the character's own), and listed items (`listedCost`: the item's "Cost" line per
  version, else half the price). DC 5 + item CL + 5 per unmet requirement (+5 rushed); requirements from the item's
  requirement line (`parseRequirements`: feats, spells, "X, Y, or Z" choices, caster level, "three times the bonus",
  skill ranks, else "I meet this" boxes). About 800 listed items (mostly Ultimate Equipment) have no requirement line
  in PSRD-Data: the player counts unmet ones with a stepper. Costs: crafted weapons/armor pay half the magic part
  (`crafted` flag; `weaponCost`/`armorCost`), crafted listed items `{ crafted: true }` count at `listedCost`, and
  `state.craftedItems` (potions/scrolls/wands) at half their price. Weapon/armor names come from `magicPrefix`
  (`weaponLabel`). Weapon ability damage (`ABILITY_DAMAGE`/`abilityDamage` in weapons.js, hand-entered): `hit` dice on
  every hit (flaming, frost, shock, corrosive, bursts, merciful, vicious), never multiplied; `burst` dice on a confirmed
  critical once per step above x1 (bursts, thundering); `vs` situational dice with a roll of their own (holy, unholy,
  axiomatic, anarchic, bane); keen doubles the threat range (not stacking with Improved Critical). `rollSpec` rolls a
  group's `extra`/`burst` (dice.js `rollExtras`). Other abilities are shown by name only.
- UI checks worth repeating after changes (headless Edge works: `msedge --headless=new --dump-dom` /
  `--screenshot`, loading a scratch page that drives the app in an iframe on the same origin): every
  race and class at a few levels, each tab, search results opening their tab, and a character saved
  by an older version still loading (`load()` migrates or drops old fields). `msedge --print-to-pdf` shows the
  printed sheet (copy `#print-sheet` into a page that links css/style.css; the Read tool shows the PDF).

## Data build commands

Requires Python 3.9+ and `pip install beautifulsoup4 pyyaml`, plus the PSRD-Data book databases. On this
machine they're in `C:\Users\jongo\Projects\PSRD-Data` (the `.db` files only, downloaded from the repo;
`git clone --depth 1 https://github.com/devonjones/PSRD-Data.git` also works).

Books after 2015 come from the Foundry VTT Pathfinder 1e system's packs, a partial clone at
`C:\Users\jongo\Projects\foundryvtt-pathfinder1` (`FOUNDRY` env var; see `scripts/foundry.py`). Windows can't check
out its long paths, so `foundry.py` reads files with `git cat-file` (first read of a pack downloads it, slowly).
- Only Paizo books are used (`paizo_source`: code PZO..., no other publisher in `module/registry/sources.mjs`), and
  only books with an OGL Section 15 notice in `scripts/ogl_notices.json` (made by `extract_ogl_notices.py` from the
  Archives of Nethys license page, plus `MANUAL_NOTICES`) or `scripts/d20_feat_notices.json` (read from d20pfsrd pages;
  `load_notices` merges both, `find_notices` matches titles with `book_key`, so "Pathfinder Chronicles: Faction Guide" =
  "Faction Guide"). `build_license.py` appends the notices for books the data uses, skipping ones PSRD's own list has
  for the same title and year. The d20 builders add to `d20_feat_notices.json` (never replace it) and read notices
  with `take_notices` (paragraphs or divs in or just after the "section15" box). Records from Foundry carry
  `"origin": "Foundry VTT pf1"`.
- `build_foundry_spells.py` runs after `build_spells.py`: adds spells PSRD lacks (names matched ignoring spaces and
  punctuation; Foundry's "(APG)"-style tags dropped) and adds Foundry class levels missing from PSRD spells (occult
  classes, unchained summoner).
- `build_foundry_classes.py` (after `build_classes.py`) rebuilds each class table: BAB/saves from "high/med/low"
  with the Core Rulebook formulas, spells from Foundry's `casterProgression` tables in `module/config.mjs` (checked to
  match PSRD for sorcerer, bard, paladin, inquisitor, summoner, arcanist, alchemist; prepared casters' cantrips go under
  per day, known-only 0-level spells kept before 1st-level spells start), features from the linked class abilities at
  the level first gained. `REPEATS` adds repeated features the app needs (unchained monk bonus feats), `OTHER_FROM`
  copies table columns (unchained monk uses the monk's AC bonus / unarmed damage), `SOURCE_FIXES` (vigilante has no
  source). The "Weapon and Armor Proficiency" feature is written from `weaponProf`/`armorProf` in the wording the app's
  proficiency parsers read. Categories: 'occult', 'unchained', 'base'.
- `build_foundry_races.py` (after `build_races.py`) reads traits from "<strong>Name</strong>: text" list items in the
  description, sets `kind` for the standard ones, ability modifiers from `changes`, size/speed/type from the fields.
  Bestiary 5 and 6 races use notices read from their d20pfsrd race pages (`MANUAL_NOTICES`). `KINDS` also marks size
  traits named 'Medium'/'Small' and 'Speed (Slow)'.
- Feats from later books come from d20pfsrd.com (Foundry has few feats). `fetch_d20pfsrd_feats.py` downloads every
  page under /feats/ except the third-party section (listed in the site's sitemap; the site answers some requests
  with status 404 but the real content) into `C:\Users\jongo\Projects\d20pfsrd-feats`, once. `build_d20_feats.py`
  (after `build_feats.py`, only when that cache exists) keeps feats whose page's "Section 15" notice is a Paizo book,
  drops mythic and caravan feats and ones already present (names compared letters-only, the trailing "(Combat,
  Halfling)" bracket stripped into types), parses prerequisites with `build_feats.parse_prereqs`, marks them
  `"origin": "d20pfsrd"` and saves each book's notices to `scripts/d20_feat_notices.json` for `build_license.py`.
  Pages with no notice are left out unless `FEAT_SOURCES` names the book (from Archives of Nethys; the book's notice
  must be known). Page quirks handled: unclosed `<p>`s (closed before parsing), bold `<span>` labels, "Benefit*",
  and, only when a first reading finds no benefit (`parse_page(html, unwrap=True)`), paragraphs wrapped in plain
  divs, loose text and unbolded "Benefit:". Stain feats' Gift/Stain go into the benefit. "Source PPC:XX" lines,
  "Combat Trick" headings and the book-cover box are dropped. Racial feats sharing a name with different races are
  kept as "Unusual Origin (Changeling)" etc.; `NAME_FIXES` corrects page titles. Traits: different d20pfsrd traits
  sharing a name (other category and book) are both kept; `PLAIN_ID_SOURCE` says which keeps the plain id.
  Still left out: Endure Pain, Knights Candidate, Extra Invocation, Faulty Teamwork (no book found), Fleshwarping,
  and spells from Second Darkness #2 and Shattered Star #4 (no notice found).
- Traits: `build_traits.py` (PSRD: APG and Ultimate Campaign, names compared letters-only) then `build_d20_traits.py`
  (d20pfsrd pages cached in `C:\Users\jongo\Projects\d20pfsrd-traits` by `fetch_d20pfsrd_feats.py <cache> traits`).
  Category and race/region/deity come from the page's folder; a trailing "(Dwarf)" in the name becomes the
  requirement. "Paizo" alone isn't enough for a notice ("Paizo Fans United" made Wayfinder): it must say Paizo
  Publishing / Paizo Inc. `effects_of` counts only unconditional bonuses: nothing like "while/when/against/if" before
  it in its clause, nothing after it but the clause's end ("Diplomacy checks to gather information" isn't counted),
  and no effects at all for "one of the following" choices. Short notice/book names are fixed in `NOTICE_FIXES` /
  `TITLE_FIXES` (`build_d20_feats.py`).
- Spell numbers: `build_foundry_spells.py` gives each spell Foundry matches (PSRD ones too) `actions`:
  `[{ name, kind ('ranged touch' | 'melee touch' | 'ranged' | 'melee' | 'maneuver' | 'heal' | 'save' | 'other'),
  damage: [{ formula, types }], extra_attacks, auto_hit, save, save_text, harmless }]`. Formulas are Foundry roll
  formulas with `@cl`; when Foundry has none, `damage_from_text` reads "1d6 ... damage per caster level (maximum
  10d6)" wording. `js/spell-math.js`: `evalFormula` (min/max/floor/ceil/clamp, dice at least 1), `spellContext`
  (caster level, casting modifier, Spell Focus schools) and `spellLines` (attack bonus = BAB + Dex/Str + size, DC =
  10 + spell level + modifier + focus, rays/missiles from `extra_attacks`). Shown under My spells and on the sheet.
- Roll buttons: `rollButton(spec)` (roll-ui.js) puts a JSON spec in `data-roll`; one document click handler rolls it
  with `rollSpec` (dice.js: d20 + bonus per attack, natural 20/1, threat range → confirmation roll and ×mult damage,
  damage at least 1, `times` for missiles) and shows the result in `#roll-panel` (last 6 kept). Used for saves, CMB and maneuver feats (Race
  card, where AC, CMD, saves and CMB live instead of the Results card), ability checks (Mod column), skills, initiative, weapon attack lines (tab-weapons.js `critOf`/
  `rollGroup`), and spells (`spellLines` returns `roll`; `srCheck` = caster level + 2 per Spell Penetration feat).
- Traits: `build_traits.py` (PSRD APG + Ultimate Campaign; UC wording preferred) -> data/traits.json with `effects`.
  `state.traits` is a trait id per slot; `traitSlotCount(houseRules)` = 2, or 3 with the Extra Campaign Trait house
  rule. `traitEffects` (traits.js, highest bonus per thing since trait bonuses don't stack) feeds saves (via
  `withTraitSaves` into characterStats' featBonuses), initiative, skill totals (`traitBonuses`) and class skills.
  UI: tab-traits.js (Traits card + picker on the Feats tab), no category or count checks (user's choice).
- House rules: `state.houseRules` flags (HOUSE_RULES in app.js). Max Healing -> `setRollOptions` -> `rollSpec` rolls
  healing groups (heal: true) at maximum. Encumbrance: `carriedWeight` (worn armor/shield, weapons, inventory, magic
  items; not coins; Small/Large armor and weapon weights) -> `carryingCapacity(str, size)` / `encumbrance(weight,
  capacity)` (rules.js); computeView merges the load's max Dex and check penalty with the armor's (worse counts) and
  slows speed with `slowedSpeed` (Slow and Steady exempt); `view.load` shows in Results and on the Equipment tab.
  Action Points = Pathfinder hero points (APG; `js/hero-points.js`): `state.heroPoints` (null until first counted, then
  1), `update()` adds 1 per level gained (2 with Blood of Heroes) and 1 when Hero's Fortune is taken, max 3 (5 with
  Hero's Fortune); spend buttons per use (`HERO_POINT_USES`; cheat death costs 2; Luck of Heroes d20 > 15 keeps the
  point on a reroll or before-roll bonus); `state.antihero` = no hero points and an `antihero` 1st-level feat slot.
  Flaws: `state.flaws` (two { id, choice?, name, effect }; ids from `js/flaws.js` FLAWS, the d20 SRD's Unearthed Arcana
  list, or 'other' typed in); each adds a `flaw-N` general feat slot at 1st level (`featSlots({ flaws })`) while the rule is
  on. `flawEffects` turns them into penalties: untyped effects (saves, initiative, AC, Pathetic's ability, Frail's hp) added
  to `view.customAll`, plus Feeble's per-ability checks/skills, Inattentive's Perception, Noncombatant/Shaky melee/ranged
  attacks (weapons, spell touch attacks) and Slow's halved base speed. Older typed saves are matched to the list by name.
  Drawbacks (house rule `drawbacks`): `state.drawback` from data/drawbacks.json (`build_d20_drawbacks.py`, d20pfsrd cache
  ../../d20pfsrd-drawbacks fetched with `fetch_d20pfsrd_feats.py ... traits drawbacks`); `traitSlotCount(houseRules,
  drawback)` adds a slot. Their penalties are situational, so they're shown, not applied.
- App side: psychic magic (`PSYCHIC` in multiclass.js) is its own tradition; `MONK_IDS` (rules.js) gives the unchained
  monk the monk's AC bonus and unarmed damage; its flurry (`flurryBabs('monk-unchained')`) is one extra attack at full
  BAB (two from 11th) with no penalty; the unchained rogue's finesse training grants Weapon Finesse.

```
python scripts/build_all.py path/to/PSRD-Data     # rebuild everything, then validate
python scripts/validate.py data                    # sanity checks only; exits non-zero on errors
```

Run a single builder by setting `PSRD` and passing the output path (run from `scripts/` or add it to
`PYTHONPATH`, since the scripts import `common`/`psrd_tree` as top-level modules):

```
PSRD=path/to/PSRD-Data python scripts/build_feats.py data/feats.json
```

- `PSRD` defaults to `/home/claude/src/PSRD-Data` in `psrd_tree.py`; on this machine always set it
  (or pass the path to `build_all.py`, which exports it).
- The older builders (races/classes/feats) open output files without an explicit encoding and write with
  `ensure_ascii=False`. On Windows set `PYTHONUTF8=1` so non-ASCII text doesn't fail or get written as
  cp1252.
- There is no test suite; `validate.py` is the check (duplicate ids, complete 1–20 / 1–10 level
  tables, required class/race fields, every `feat` prerequisite referring to an existing feat name).

## Architecture

- **`psrd_tree.py`** — loads one PSRD book DB (`sections` table, nested-set `lft`/`rgt` +
  `parent_id`) into a dict of rows, each with a `children` list. `show()` prints a subtree and is
  handy for exploring how a book structures a given race/class/feat.
- **`common.py`** — `BOOKS` lists the book DBs in publication order (kept unchanged so races/classes/feats
  rebuild the same); `ALL_BOOKS` is every PSRD book and is used by the armor, magic item and spell
  builders. `iter_books(books)` walks them in that order, and builders rely on it for duplicate resolution ("earlier book wins", except races
  prefer the Advanced Race Guide write-up and record others in `also_in`). Also holds the HTML →
  plain-text conversion (`text`/`clean`/`node_text`, which also normalizes dashes and smart quotes),
  `slug()` for ids, and `parse_table()` (handles rowspan/colspan headers; used for class progression
  tables).
- **Builders** each scan every book for sections of their `type` (`race`, `class`, `feat`) and read
  child sections by name (e.g. "Prerequisites", "Benefit", "Hit Die"). Some books also have side
  tables that are queried directly (`class_details`, `feat_types`).
- **Armor / magic items / spells** read structured tables (`item_details`, `item_misc`, `spell_details`,
  `spell_lists`, `spell_effects`). Armor prefers the Ultimate Equipment reprint (field names vary by book,
  hence `key()`); magic items are `item` sections with an aura, categorised by the nearest heading
  (`CATEGORIES`) or by slot, plus special abilities stored as text sections with a stat line or an
  Ultimate Equipment stat block. Equipment is every other `item` without an aura (weapons and armor
  excluded; alchemical weapons kept), categorised by heading or Gear Type; version tables in the text
  ("Common | 2 gp | 2 lbs.") become `variants`, and `price_gp` understands cp/sp/gp/pp, ranges and
  footnote digits (`price_gp` in `common.py`, shared with the magic item builder). Weapons merge every
  book's entry for a weapon (Ultimate Equipment swaps its Proficiency/Weapon Class fields, so proficiency
  comes from other books or its Simple/Martial/Exotic Weapons tables; "Crossbow, Heavy" = "Heavy Crossbow");
  siege engines and alchemical weapons are left out. `text()` in
  `common.py` adds a space after a bold/italic run-in heading before a capital or digit
  ("<i>1st Round</i>Presence"), repairs broken apostrophes, drops tags written out as text and a
  leading ":". All seven data files were rebuilt with these fixes. Before replacing data after a builder
  change, rebuild to a temp folder and diff field by field (prerequisites, class `special` lists and
  race traits drive app logic). Each builder prints what it couldn't place; check that output after changes.
- **Build order matters**: `build_feats.py` reads `races.json` from the same directory as its output
  path to recognize race prerequisites, so races must be built first (`build_all.py` does this).
- **Feat prerequisite parsing** (`build_feats.py`): `split_prereqs` → `parse_one` (regex per type) →
  `any_of` for "X or Y" when every option parses, otherwise an `other` entry with the raw text.
  `FEAT_ALIASES` fixes name mismatches in prerequisites. `_old_parse_prereqs` is dead code.
- **Hand-entered facts** missing from the source text live as override dicts at the top of builders
  (`SUBTYPE_OVERRIDES`, `SPEED_OVERRIDES`, `TYPE_OVERRIDES` in `build_races.py`; `ALTERNATE` in
  `build_classes.py`). Put new source corrections there rather than special-casing parse logic.

## License

Content is OGL 1.0a; `LICENSE-OGL.txt` (generated by `build_license.py` from `book-ogl.db`) must ship
with anything that uses the data. PSRD's list lacks Mythic Adventures, so `build_license.py` adds that
notice (`MISSING_NOTICES`, wording from the official PRD license page). When adding data from a new book,
check its Section 15 notice is in the license.
