# Pathfinder 1e Rules Data (races, classes, feats, armor, weapons, magic items, spells, equipment)

Clean JSON files for a Pathfinder 1st Edition character builder, converted from
[PSRD-Data](https://github.com/devonjones/PSRD-Data) (the Paizo Pathfinder Reference Document).

| File | Contents |
|---|---|
| `data/races.json` | 78 races: 7 core, 16 featured, 14 uncommon, 6 other (Bestiary), plus 35 "other" from later Paizo books via the Foundry data (Bestiary 5 and 6, Planar Adventures, Ultimate Wilderness, Blood of the Sea, Inner Sea Races, ...). Alternate racial traits and favored class options for the PSRD races come from the Advanced Race Guide and later PSRD books; 16 of the later-book races get theirs from d20pfsrd.com pages (Paizo entries only; recorded in `d20_sources`), the others have none in print or no page |
| `data/classes.json` | 67 classes: 11 core, 8 base, 10 hybrid, 3 alternate, 18 prestige, 5 NPC from PSRD-Data, plus 12 from the Foundry data: 6 occult (Occult Adventures), 4 unchained (Pathfinder Unchained), shifter and vigilante. Prestige classes include requirements and which levels add spellcasting to another class (`caster_advance`) |
| `data/feats.json` | 1,227 feats, including 162 mythic feats; plus 2,155 Paizo feats from later books (Ultimate Wilderness, Ultimate Intrigue, Occult Adventures, Horror Adventures, Player Companions, ...) taken from d20pfsrd.com (marked `"origin": "d20pfsrd"`) |
| `data/armor.json` | 40 armors and shields (bonus, max Dex, check penalty, spell failure, speed, price, weight) |
| `data/archetypes.json` | 1,271 class archetypes: 393 from PSRD-Data (Advanced Player's Guide, Ultimate Magic, Ultimate Combat, Advanced Class Guide, Advanced Race Guide racial archetypes, Monster Codex, Technology Guide) plus 878 from later Paizo books via the Archives of Nethys (marked `"origin": "aonprd"`; occult, unchained, vigilante and shifter classes included): `{ id, name, class, source, race?, description, features: [{ name, text, level?, replaces, alters, class_skills?, proficiency? }] }`. `replaces`/`alters` are the class features each feature's text names |
| `data/traits.json` | 1,336 character traits: 225 from the Advanced Player's Guide and Ultimate Campaign (combat, faith, magic, social, race, regional, religion, campaign), plus 1,111 from later Paizo books (Player Companions, Inner Sea Gods, Adventure Path player's guides, ...) taken from d20pfsrd.com (marked `"origin": "d20pfsrd"`; adds equipment, family, mount and exemplar traits). Simple unconditional numeric `effects` (saves, initiative, skill bonuses, class skills) are read from the text |
| `data/magic-items.json` | 1,649 magic items in 12 categories (wondrous items, rings, rods, staves, magic armor/shields/weapons, special abilities, cursed items, artifacts, intelligent items). Items with several prices have `price_options`, read from the price text or from a price table in the description (bag of holding types, with each type's weight) |
| `data/spells.json` | 3,004 spells with school, class spell levels, components, range, duration, saves and text: 1,536 from PSRD-Data (mythic spells left out) plus 1,468 from later Paizo books via the Foundry VTT Pathfinder 1e data (marked `"origin": "Foundry VTT pf1"`) |
| `data/equipment.json` | 825 pieces of mundane gear in 12 categories (adventuring gear, tools, clothing, alchemical items, animals, vehicles, services, ...), with price, weight and versions such as common/masterwork |
| `data/weapons.json` | 241 weapons: simple, martial, exotic, firearms and technological, with proficiency, damage by size, critical, range, type, special qualities, price and weight (siege engines left out) |
| `LICENSE-OGL.txt` | The Open Game License 1.0a and Section 15 copyright notices. **Ship this with your app.** |
| `scripts/` | The Python scripts that generate the files above |

Books covered by races, classes and feats: Core Rulebook, Advanced Player's Guide, Advanced Race Guide,
Advanced Class Guide, Ultimate Magic, Ultimate Combat, Ultimate Campaign, Mythic Adventures, and Bestiary 1-4.
Armor, weapons, magic items, spells and equipment also use Ultimate Equipment, GameMastery Guide, NPC Codex, Monster Codex and
Technology Guide: every book in PSRD-Data. Later books (Occult Adventures, Pathfinder Unchained, Ultimate
Intrigue, Ultimate Wilderness and others) and Player Companion / Campaign Setting books are not in PSRD-Data.

## The character builder app

`index.html` is a character builder for levels 1-20 that uses this data, with a class for each level
(multiclassing and prestige classes, whose requirements are checked). Its tabs:
Character (race, class, point buy, results, and a search box that finds anything by name), Feats (with
prerequisite checks), Skills, Spells (spells per day and the class spell list), Magic Items (every magic
item by category, with a details panel; items can be added to the character), Armor (worn armor and
shield, applied to AC, skills and speed), Weapons (attack bonus and damage for each weapon you carry) and
Equipment (an inventory with gold and weight). Spells can be
added to the character too. Every tab has its own search box as well. The bar above the tabs keeps several
characters (saved in the browser), exports one to a .json file and imports it on another device, and prints a
full character sheet.
To try it on your computer, run this from the repo folder (needs Python 3) and open http://localhost:8000/
in a browser:

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

**Class talent** (`talents.json`, for example `powerful-blow`): the options classes choose at set levels.

- `kind` (`rage-power`, `rogue-talent`, `hex`, `mercy`, `ki-power`, ...), `classes` (class ids that list it), `text`
- `level` (the minimum class level its text names, or null), `repeatable`, `mystery` (revelations), `school`
  (occultist focus powers)

**Skill** (`skills.json`, for example `acrobatics`): `description`, `sections` ({ `name`: Check, Action, Try Again...,
`blocks`: paragraphs `{ text }` or tables `{ table, rows }` with the header row first}). Knowledge, Craft, Perform and
Profession are one record each.

**Oracle mystery** (`mysteries.json`, for example `flame`): `deities`, `class_skills`, `bonus_spells` (as printed),
`revelations` (names, matched to `talents.json` by name), `final_revelation`.

**Bloodline** (`bloodlines.json`, for example `sorcerer-aberrant`): `cls` (`sorcerer` or `bloodrager`), `name`, `text`,
`class_skill` (sorcerers), `bonus_spells` ([{ `level` (class level), `name` }]), `bonus_feats` (names), `arcana`
(sorcerers), `powers` ([{ `name`, `level`, `text` }]). From the Archives of Nethys bloodline pages.

Every weapon has `groups`, its fighter weapon groups ("Blades, heavy", "Monk"...) from its Archives of Nethys page (the
Core Rulebook's lists where AoN has none; firearms are Firearms). Weapons from after 2015 (Adventurer's Armory 2, Inner Sea Combat...) come from the Archives of Nethys lists
(`origin: "aonprd"`); their Tiny and Large damage is worked out from the Core Rulebook table.

**Class path** (`class-paths.json`, for example `school-evocation`, `order-order-of-the-lion`): the other one-time class
choices. `kind` (`school`, `patron`, `spirit`, `order`, `eidolon-subtype`, `base-form`, `variant-channeling`), `classes` (ids), `name`, `text`,
`parent` (a focused school's school), `facts` ([label, text] pairs: edicts, challenge, alignment, starting statistics...),
`class_skills`, `spells` ([{ `level`, `name` }]) with `spells_by` (`class` or `spell` level), `powers` ([{ `name`, `level`,
`text` }]), `hexes` (a spirit's hex names).

916 of 1,227 feats have prerequisites that are fully machine-readable. The rest include at least one
`other` entry, such as "Small size or smaller" or "proficiency with the selected weapon".

## Known gaps

- Six Bestiary races (drow noble, kasatha, and a few others) are marked `"incomplete": true` because the
  source text points to a monster stat block for some traits.
- A few facts missing from the source text were filled in by hand in `scripts/build_races.py`
  (half-elf and half-orc subtypes, svirfneblin speed, gathlain and wyrwood creature types).
- The source has no Benefit text for the feat Talented Magician.
- Skill descriptions cover the Core Rulebook text only (later books' new skill uses aren't included).

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
