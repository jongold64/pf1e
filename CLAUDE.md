# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Data for a Pathfinder 1e character builder: Python scripts in `scripts/` convert the
[PSRD-Data](https://github.com/devonjones/PSRD-Data) SQLite books into plain-text JSON in `data/`
(`races.json`, `classes.json`, `feats.json`, `armor.json`, `magic-items.json`, `spells.json`,
`equipment.json`) plus
`LICENSE-OGL.txt`. The JSON files are generated
artifacts — change the scripts and rebuild rather than hand-editing them. The README documents the
output record schemas and known data gaps.

On top of the data is a static web app (single-class builder, levels 1-20) with tabs: Character (race,
class, point buy, results, global search), Feats, Skills, Spells (per day + class spell list), Magic Items
(browse by category with a details panel), Armor, and Equipment (inventory + gold + weight; armor is kept
separate from it, and weapons are planned as their own tab). Every tab except Character has its own search
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
  first use via `loadSpells`/`loadItems`/`loadGear`), keeps one `state` object saved to
  `localStorage`, computes a shared `view` (stats, gear, feat context) in `computeView()`, and re-renders
  on each change via `update()` → `render()`. Tabs are `<main class="tab-panel">` elements switched by
  `showTab()`; the open tab is kept in the URL hash (`#spells`). Tab modules get an `app` object
  (`state`, `data`, `update`, `view`, `showTab`, `openDetail`, `openResult`): `tab-armor.js`,
  `tab-spells.js`, `tab-items.js`, `tab-equipment.js`, `search-ui.js`. Shared DOM helpers are in
  `dom.js`. The Feats, Skills and Armor tab searches live in `app.js` (`initTabSearches`).
- Equipment: `js/equipment.js` has money and weight rules (`startingGold` with the alternate-class
  fallback, `WEALTH_BY_LEVEL`, `armorCost` = base + 150 masterwork + enh² × 1,000, `equipmentTotals`,
  `formatGp`). Inventory entries are `{ id, variant, qty }`; `variant` picks one of an item's `variants`
  (e.g. common vs masterwork backpack). `state.gold === null` means "use the class's starting gold".
- Chosen spells and magic items: `state.spells` (spell ids, shown as "My spells" on the Spells tab with
  known-spell limits from the class table for spontaneous casters) and `state.magicItems`
  (`{ id, option, qty }`, "My magic items"; `option` is a `price_options` label like "+2"). Special
  abilities can't be owned alone (`ownable`). Magic item cost/weight count on the Equipment tab
  (`magicItemTotals`).
- Rules text is rendered by `paragraphs()` in `dom.js`: blank lines split paragraphs, single line breaks
  are kept, and runs of 2+ "a | b" lines (tables flattened by the build) become HTML tables.
- Armor: `js/armor.js` (`armorEffects`, `speedInArmor`, `proficiencyWarnings`) turns worn armor/shield +
  enhancement into AC bonus, max Dex cap, check penalty (-1 for magic/masterwork, applied to `acp` skills),
  arcane spell failure and speed. `characterStats` takes that as `gear`; a monk's AC bonus needs no armor
  and no shield.
- Search: `js/search.js` ranks names (exact, prefix, word prefix, substring, all words); `search-ui.js`
  builds the index from all data and `app.openResult()` routes each type to its tab or a details dialog.
- Level N values come from `progression[N - 1]` of a class record (`bab` is the full iterative list,
  e.g. `[11, 6, 1]`); monk AC reads `other['AC Bonus']` from that row. HP uses the fixed average after
  1st level (half the die + 1), and the favored class bonus applies at every level. Multiclassing is
  not supported yet, so prestige classes stay filtered out.
- Spells: `spellsPerDay` in `rules.js` combines the class table (`spells_per_day`/`spells_known`) with
  bonus spells from the casting ability. `CASTING_ABILITY` and `EXTRA_SLOTS` (cleric domain, shaman
  spirit magic, wizard school, druid domain) are hand-entered because the data doesn't carry them:
  the build's `to_int` keeps only the leading number of a table cell, so printed "+1" slots are lost.
  The arcanist's "spells prepared" table is also missing from the data.
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
  without `kind` are the ones to list as racial traits.

- UI checks worth repeating after changes (headless Edge works: `msedge --headless=new --dump-dom` /
  `--screenshot`, loading a scratch page that drives the app in an iframe on the same origin): every
  race and class at a few levels, each tab, search results opening their tab, and a character saved
  by an older version still loading (`load()` migrates or drops old fields).

## Data build commands

Requires Python 3.9+ and `pip install beautifulsoup4`, plus the PSRD-Data book databases. On this
machine they're in `C:\Users\jongo\Projects\PSRD-Data` (the `.db` files only, downloaded from the repo;
`git clone --depth 1 https://github.com/devonjones/PSRD-Data.git` also works).

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
  footnote digits (`price_gp` in `common.py`, shared with the magic item builder). `text()` in
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
