"""Add armor and shields from the Foundry VTT Pathfinder 1e packs to data/armor.json (run after build_armor.py): the
mundane armor and shields from later Paizo books (Adventurer's Armory 2, Adventurer's Guide, Inner Sea World Guide,
...) and Ultimate Equipment variants the PSRD build doesn't have (horn, iron, leather and steel lamellar, leather madu).
Only items from Paizo books with an OGL notice are added; specific magic armor (an aura, a caster level or an
enhancement bonus, e.g. armor of insults) is left to the magic items.

Records match build_armor.py's, plus `metal` (false for leather, wood, cloth, hide, horn and the like: druids can wear
them) and "origin": "Foundry VTT pf1".

Usage: python build_foundry_armor.py path/to/armor.json   (reads and rewrites that file; set FOUNDRY if needed)
"""
import json, re, sys
from common import slug
from foundry import load_pack, load_sources, load_notices, find_notices, paizo_source, html_text

ORIGIN = 'Foundry VTT pf1'
MANUAL_ORIGIN = 'entered from the book'
CATEGORY = {'lightArmor': 'light', 'mediumArmor': 'medium', 'heavyArmor': 'heavy'}
METALS = {'steel', 'iron', 'bronze', 'gold', 'silver', 'mithral', 'adamantine', 'coldIron', 'alchemicalSilver'}
# Foundry names for pieces build_armor.py already has under another name.
SAME_AS = {'stonelamellar': 'lamellar', 'steelmadu': 'madu', 'lightsteelshieldquickdraw': 'lightsteelquickdrawshield',
           'lightwoodenshieldquickdraw': 'lightwoodenquickdrawshield'}
# Specific armor that's really a magic item (no aura in Foundry's data).
SKIP = {'Elven Chain'}
# Armor from Paizo books Foundry's packs lack, entered by hand from the book (stats as in Archives of Nethys;
# descriptions in our own words). Added only if the book has an OGL notice, like the rest.
MANUAL = [
    {'name': 'Spider-Silk Bodysuit', 'source': "Adventurer's Armory 2", 'category': 'light',
     'bonus': 3, 'max_dex': 6, 'check_penalty': -1, 'spell_failure': 10, 'price_gp': 850, 'weight_lbs': 4, 'metal': False,
     'description': 'A close-fitting suit woven from alchemically treated silk of giant spiders or similar creatures. '
                    'A wearer with the drow weapon familiarity racial trait treats its maximum Dexterity bonus as 2 higher.'},
    {'name': 'Reinforced Tunic', 'source': "Adventurer's Armory 2", 'category': 'light',
     'bonus': 1, 'max_dex': 5, 'check_penalty': 0, 'spell_failure': 5, 'price_gp': 1, 'weight_lbs': 5, 'metal': False,
     'description': 'A belted cloth tunic with stiff cords woven through it. Its armor bonus is 2 higher against attack '
                    'rolls made to confirm a critical hit against the wearer.'},
]


def key(name):
    """Letters only, without a trailing "armor" ("Hide Armor" = "Hide")."""
    k = re.sub(r'[^a-z]', '', name.lower())
    k = re.sub(r'armor$', '', k) or k
    return SAME_AS.get(k, k)


def main():
    out_path = sys.argv[1]
    armor = [a for a in json.load(open(out_path, encoding='utf-8')) if a.get('origin') not in (ORIGIN, MANUAL_ORIGIN)]
    have = {key(a['name']) for a in armor}
    books, notices = load_sources(), load_notices()
    added, skipped = [], []
    for d in sorted(load_pack('armors-and-shields'), key=lambda d: d['name']):
        s = d['system']
        a = s.get('armor') or {}
        name = d['name'].strip()
        # A few names are in lower case in Foundry ("Varisian dancing scarves").
        if re.search(r' [a-z]', name):
            name = re.sub(r"(?<![\w'])([a-z])", lambda m: m.group(1).upper(), name)
        if key(name) in have:
            continue
        book = paizo_source(d, books)
        if not book or not find_notices(notices, book):
            skipped.append(f'{name} (no Paizo book with a notice)')
            continue
        if a.get('enh') or s.get('cl') or (s.get('aura') or {}).get('school') or name in SKIP:
            skipped.append(f'{name} (magic)')
            continue
        shield = s.get('subType') == 'shield'
        category = 'shield' if shield else CATEGORY.get(s.get('equipmentSubtype'))
        if not category:
            skipped.append(f'{name} (no category)')
            continue
        slows = category in ('medium', 'heavy')
        material = (((a.get('material') or {}).get('base') or {}).get('value') or '').strip()
        rec = {
            'id': slug(name), 'name': name, 'source': book, 'category': category,
            'bonus': a.get('value') or 0,
            'max_dex': a.get('dex') if a.get('dex') is not None and not shield else None,
            'check_penalty': -(a.get('acp') or 0),
            'spell_failure': s.get('spellFailure') or 0,
            'speed_30': None if shield else (20 if slows else 30),
            'speed_20': None if shield else (15 if slows else 20),
            'price_gp': (s.get('price') or {}).get('base'),
            'weight_lbs': (s.get('weight') or {}).get('value'),
            'description': html_text((s.get('description') or {}).get('value') or ''),
            'metal': material in METALS if material else True,
            'origin': ORIGIN,
        }
        if shield and name == 'Tower Shield':
            rec['max_dex'] = a.get('dex')
        armor.append(rec)
        have.add(key(name))
        added.append(f'{name} ({category}, {book})')
    for m in MANUAL:
        if key(m['name']) in have:
            continue
        if not find_notices(notices, m['source']):
            skipped.append(f"{m['name']} (no Paizo book with a notice)")
            continue
        armor.append({'id': slug(m['name']), **{k: v for k, v in m.items() if k not in ('metal', 'description')},
                      'speed_30': 30 if m['category'] == 'light' else 20, 'speed_20': 20 if m['category'] == 'light' else 15,
                      'description': m['description'], 'metal': m['metal'], 'origin': MANUAL_ORIGIN})
        have.add(key(m['name']))
        added.append(f"{m['name']} ({m['category']}, {m['source']}, entered by hand)")
    json.dump(armor, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(added), 'armor and shields added:', '; '.join(added))
    print('left out:', '; '.join(skipped))


if __name__ == '__main__':
    main()
