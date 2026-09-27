# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Data for a Pathfinder 1e character builder: Python scripts in `scripts/` convert the
[PSRD-Data](https://github.com/devonjones/PSRD-Data) SQLite books into plain-text JSON in `data/`
(`races.json`, `classes.json`, `feats.json`) plus `LICENSE-OGL.txt`. The JSON files are generated
artifacts — change the scripts and rebuild rather than hand-editing them. The README documents the
output record schemas and known data gaps.

On top of the data is a static web app (level 1 builder: race, class, point buy, HP/saves/BAB/AC),
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
  adjustments, `level1Stats`). Put new calculations here and add checks to `js/rules.test.js`.
- `js/app.js` owns the page: loads races/classes (prestige classes filtered out), builds the
  controls, keeps one `state` object, saves it to `localStorage`, and re-renders everything on each
  change via `update()` → `render()`.
- Level 1 values come from `progression[0]` of a class record; monk AC reads `progression[0].other['AC Bonus']`.
- Race traits with a `kind` (ability_scores, size, speed, type, languages) are structured facts; traits
  without `kind` are the ones to list as racial traits.

## Data build commands

Requires Python 3.9+ and `pip install beautifulsoup4`, plus a local clone of PSRD-Data
(`git clone --depth 1 https://github.com/devonjones/PSRD-Data.git`).

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
- Output files are opened without an explicit encoding and written with `ensure_ascii=False`. On
  Windows set `PYTHONUTF8=1` so non-ASCII text doesn't fail or get written as cp1252.
- There is no test suite; `validate.py` is the check (duplicate ids, complete 1–20 / 1–10 level
  tables, required class/race fields, every `feat` prerequisite referring to an existing feat name).

## Architecture

- **`psrd_tree.py`** — loads one PSRD book DB (`sections` table, nested-set `lft`/`rgt` +
  `parent_id`) into a dict of rows, each with a `children` list. `show()` prints a subtree and is
  handy for exploring how a book structures a given race/class/feat.
- **`common.py`** — `BOOKS` lists the book DBs in publication order; `iter_books()` walks them in
  that order, and builders rely on it for duplicate resolution ("earlier book wins", except races
  prefer the Advanced Race Guide write-up and record others in `also_in`). Also holds the HTML →
  plain-text conversion (`text`/`clean`/`node_text`, which also normalizes dashes and smart quotes),
  `slug()` for ids, and `parse_table()` (handles rowspan/colspan headers; used for class progression
  tables).
- **Builders** each scan every book for sections of their `type` (`race`, `class`, `feat`) and read
  child sections by name (e.g. "Prerequisites", "Benefit", "Hit Die"). Some books also have side
  tables that are queried directly (`class_details`, `feat_types`).
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
with anything that uses the data.
