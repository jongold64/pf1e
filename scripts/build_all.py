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
for script, out in [('build_races.py', 'data/races.json'), ('build_classes.py', 'data/classes.json'),
                    ('build_feats.py', 'data/feats.json'), ('build_armor.py', 'data/armor.json'),
                    ('build_magic_items.py', 'data/magic-items.json'), ('build_spells.py', 'data/spells.json'),
                    # Adds post-2015 spells to the PSRD ones, so it runs after build_spells.py.
                    ('build_foundry_spells.py', 'data/spells.json'),
                    ('build_equipment.py', 'data/equipment.json'), ('build_weapons.py', 'data/weapons.json'),
                    ('build_license.py', 'LICENSE-OGL.txt'), ('validate.py', 'data')]:
    subprocess.run([sys.executable, os.path.join(here, script), os.path.join(here, '..', out)], check=True, env=os.environ)
