# Pathfinder 1e Rules Data (races, classes, feats)

Clean JSON files for a Pathfinder 1st Edition character builder, converted from
[PSRD-Data](https://github.com/devonjones/PSRD-Data) (the Paizo Pathfinder Reference Document).

| File | Contents |
|---|---|
| `data/races.json` | 43 races: 7 core, 16 featured, 14 uncommon, 6 other (Bestiary) |
| `data/classes.json` | 55 classes: 11 core, 8 base, 10 hybrid, 3 alternate, 18 prestige, 5 NPC |
| `data/feats.json` | 1,227 feats, including 162 mythic feats |
| `LICENSE-OGL.txt` | The Open Game License 1.0a and Section 15 copyright notices. **Ship this with your app.** |
| `scripts/` | The Python scripts that generate the files above |

Books covered: Core Rulebook, Advanced Player's Guide, Advanced Race Guide, Advanced Class Guide,
Ultimate Magic, Ultimate Combat, Ultimate Campaign, Mythic Adventures, and Bestiary 1-4.

## The character builder app

`index.html` is a character builder for a single class at levels 1-20 that uses this data: pick a race and a class, set ability
scores with point buy, choose feats (with prerequisite checks), and see HP, saves, BAB, AC and spells per day. To try it on your computer, run this from the
repo folder (needs Python 3) and open http://localhost:8000/ in a browser:

```
python -m http.server 8000
```

Open http://localhost:8000/tests.html to run the rules checks.

## Why PSRD-Data

Two sources were considered:

- **PSRD-Data**: public GitHub repo with the full rules text for each book. **Chosen.**
- **Foundry VTT PF1 system**: its data is built for Foundry's own automation engine. Some things are
  already machine-readable (bonus formulas), but the format is tied to Foundry and harder to reuse.

PSRD-Data has the complete rules text in a consistent layout, which is what a character builder needs
to show players. Its main limit is that updates stopped in 2015. Books after the Advanced Class Guide
are missing, including Occult Adventures and Ultimate Intrigue (kineticist, occultist, vigilante, etc.).
Those could be added later from another source.

## What each record looks like

All text is plain text (no HTML). Every record has an `id` (like `half-orc` or `power-attack`) and a `source`.

**Race** (for example `dwarf`):

- `ability_modifiers`: e.g. `{"con": 2, "wis": 2, "cha": -2}`. Human, half-elf, and half-orc have `{}`
  plus `"flexible_ability_bonus": true` (+2 to one score of the player's choice).
- `size`, `base_speed`, `type`, `subtypes`, `senses`, `languages` (`starting` and `bonus`)
- `traits` (list of name + text), `alternate_traits`, `favored_class_options`, `description` (list of sections)

**Class** (for example `fighter`):

- `hit_die`, `skill_ranks_per_level`, `class_skills` (skill + key ability), `alignment`, `starting_wealth`
- `progression`: one row per level with `bab` (a list, e.g. `[11, 6, 1]`), `fort`, `ref`, `will`, `special`,
  and, for casters, `spells_per_day` and `spells_known` keyed by spell level (`"0"`, `"1"`, ...)
- `features` (name, `level` when stated, `ability_type` Ex/Su/Sp, text)
- `additional_rules`: things like arcane schools, bloodlines, domains, and orders
- Prestige classes also have `requirements`. Hybrid classes have `parent_classes`. Alternate classes have `alternate_of`.

**Feat** (for example `cleave`):

- `types` (Combat, General, Metamagic, Teamwork, Mythic, and so on)
- `prerequisites_text` (as printed) and `prerequisites` (parsed), for example:
  `[{"type": "ability", "ability": "str", "value": 13}, {"type": "feat", "feat": "Power Attack"}, {"type": "bab", "value": 1}]`
- Prerequisite types: `ability`, `bab`, `feat`, `skill`, `race`, `class_level`, `class_feature`, `caster_level`,
  `character_level`, `mythic_tier`, `any_of` (a list of `options`), and `other` (free text the app should just display)
- `benefit`, `normal`, `special`; story feats also have `goal` and `completion_benefit`
- Mythic feats have `mythic_of` pointing to the regular feat

916 of 1,227 feats have prerequisites that are fully machine-readable. The rest include at least one
`other` entry, such as "Small size or smaller" or "proficiency with the selected weapon".

## Known gaps

- Six Bestiary races (drow noble, kasatha, and a few others) are marked `"incomplete": true` because the
  source text points to a monster stat block for some traits.
- A few facts missing from the source text were filled in by hand in `scripts/build_races.py`
  (half-elf and half-orc subtypes, svirfneblin speed, gathlain and wyrwood creature types).
- The source has no Benefit text for the feat Talented Magician.
- Archetypes, spells, equipment, and skill descriptions are not included yet.

## Spot checks

These were compared against d20PFSRD and matched: sorcerer hit die, skill ranks, starting wealth, and the
level 1, 10, and 20 rows (BAB, saves, spells per day, spells known); gnome ability modifiers, size,
speed, senses, and languages; Shot on the Run prerequisites and benefit. `scripts/validate.py` also
checks every class for a complete level table and every feat prerequisite for a feat that exists.

## Rebuilding

```
git clone --depth 1 https://github.com/devonjones/PSRD-Data.git
pip install beautifulsoup4
python scripts/build_all.py path/to/PSRD-Data
```

## License

The game rules are Open Game Content under the OGL 1.0a (see `LICENSE-OGL.txt`). The license requires
that a copy of it ships with anything that uses this content. Paizo's trademarks, like the name
"Pathfinder" and setting names, are not covered by the OGL. If you ever share the app publicly, read
Paizo's Community Use Policy first.
