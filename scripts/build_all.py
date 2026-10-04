"""Rebuild everything:  python build_all.py [path-to-PSRD-Data] [path-to-foundryvtt-pathfinder1]
Needs Python 3.9+ and:  pip install beautifulsoup4 pyyaml
Get PSRD-Data with:     git clone --depth 1 https://github.com/devonjones/PSRD-Data.git
Get the Foundry data:   git clone --depth 1 --filter=blob:none --sparse https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1.git
                        (books after 2015; see foundry.py)
"""
import os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    os.environ['PSRD'] = os.path.abspath(sys.argv[1])
if len(sys.argv) > 2:
    os.environ['FOUNDRY'] = os.path.abspath(sys.argv[2])
data = os.path.join(here, '..', 'data')
os.makedirs(data, exist_ok=True)
for script, out in [('build_races.py', 'data/races.json'),
                    # Adds races from later Paizo books after the PSRD ones.
                    ('build_foundry_races.py', 'data/races.json'),
                    # Alternate racial traits and favored class options for those races, from cached d20pfsrd pages.
                    *([('build_d20_races.py', 'data/races.json')]
                      if os.path.isdir(os.path.join(here, '..', '..', 'd20pfsrd-races')) else []),
                    ('build_classes.py', 'data/classes.json'),
                    # Adds post-2015 classes (occult, unchained, shifter, vigilante) after the PSRD ones.
                    ('build_foundry_classes.py', 'data/classes.json'),
                    ('build_feats.py', 'data/feats.json'),
                    # Paizo feats from later books, from d20pfsrd pages cached by fetch_d20pfsrd_feats.py.
                    *([('build_d20_feats.py', 'data/feats.json')]
                      if os.path.isdir(os.path.join(here, '..', '..', 'd20pfsrd-feats')) else []),
                    # Traits read the skill names from classes.json, so they come after the classes.
                    ('build_traits.py', 'data/traits.json'),
                    # Archetypes read the class ids and race names, so they also come after the classes.
                    ('build_archetypes.py', 'data/archetypes.json'),
                    ('build_domains.py', 'data/domains.json'), ('build_companions.py', 'data/companions.json'),
                    # Later Paizo archetypes from the Archives of Nethys pages cached in ../../aonprd-archetypes
                    # (build_aon_archetypes.py downloads what's missing when run on its own).
                    *([('build_aon_archetypes.py', 'data/archetypes.json')]
                      if os.path.isdir(os.path.join(here, '..', '..', 'aonprd-archetypes')) else []),
                    # Paizo traits PSRD lacks, from d20pfsrd pages cached by fetch_d20pfsrd_feats.py (d20pfsrd-traits).
                    *([('build_d20_traits.py', 'data/traits.json')]
                      if os.path.isdir(os.path.join(here, '..', '..', 'd20pfsrd-traits')) else []),
                    ('build_armor.py', 'data/armor.json'),
                    # Armor and shields from later Paizo books (and Ultimate Equipment variants) after the PSRD ones.
                    ('build_foundry_armor.py', 'data/armor.json'),
                    ('build_magic_items.py', 'data/magic-items.json'), ('build_spells.py', 'data/spells.json'),
                    # Adds post-2015 spells to the PSRD ones, so it runs after build_spells.py.
                    ('build_foundry_spells.py', 'data/spells.json'),
                    ('build_equipment.py', 'data/equipment.json'), ('build_weapons.py', 'data/weapons.json'),
                    ('build_license.py', 'LICENSE-OGL.txt'), ('validate.py', 'data')]:
    subprocess.run([sys.executable, os.path.join(here, script), os.path.join(here, '..', out)], check=True, env=os.environ)
