"""Rebuild everything:  python build_all.py [path-to-PSRD-Data]
Needs Python 3.9+ and:  pip install beautifulsoup4
Get PSRD-Data with:     git clone --depth 1 https://github.com/devonjones/PSRD-Data.git
"""
import os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    os.environ['PSRD'] = os.path.abspath(sys.argv[1])
data = os.path.join(here, '..', 'data')
os.makedirs(data, exist_ok=True)
for script, out in [('build_races.py', 'data/races.json'), ('build_classes.py', 'data/classes.json'),
                    ('build_feats.py', 'data/feats.json'), ('build_armor.py', 'data/armor.json'),
                    ('build_magic_items.py', 'data/magic-items.json'), ('build_spells.py', 'data/spells.json'),
                    ('build_license.py', 'LICENSE-OGL.txt'), ('validate.py', 'data')]:
    subprocess.run([sys.executable, os.path.join(here, script), os.path.join(here, '..', out)], check=True, env=os.environ)
