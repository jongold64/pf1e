"""Build equipment.json (mundane gear: everything that isn't a weapon, armor or a magic item) from PSRD-Data.

An item's category comes from the headings above it ("Tools and Skill Kits", "Food and Drink", ...). When the same
item is in several books, the Ultimate Equipment version is kept (it reprints earlier gear with full stats) and the
other books are listed in `also_in`. Weapons are left for a future weapons file; alchemical weapons such as
alchemist's fire are gear.
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, node_text, clean, plain, to_number

PREFERRED = 'Ultimate Equipment'
# First heading (walking up from the item) that matches decides the category. Order matters.
CATEGORIES = [
    (r'alchemical weapon|alchemical tool|alchemical remed|alchemical', 'Alchemical Items'),
    (r'ammunition|cartridge', 'Ammunition'),
    (r'tools? and skill kits?', 'Tools and Skill Kits'),
    (r'clothing', 'Clothing'),
    (r'food and drink', 'Food and Drink'),
    (r'lodging|spellcasting and services|services', 'Services'),
    (r'transport', 'Vehicles'),
    (r'mounts|animals', 'Animals and Mounts'),
    (r'entertainment|trade goods', 'Entertainment and Trade Goods'),
    (r'special substances', 'Special Substances'),
    (r'special materials|primitive materials', 'Special Materials'),
    (r'on signals|cybertech|pharmaceutical|technolog', 'Technological Gear'),
    (r'adventuring gear|^gear$|goods and services|equipment', 'Adventuring Gear'),
]
WEAPON_FIELDS = ('Dmg (M)', 'Dmg', 'Weapon Class', 'Critical')
ARMOR_FIELDS = ('Armor Type', 'ArmorBonus', 'Armor Bonus', 'Armor/ShieldBonus', 'Shield Bonus')
UNITS = {'pp': 10, 'gp': 1, 'sp': 0.1, 'cp': 0.01}


def price_gp(s):
    """'5 sp' -> 0.5, '1,500 gp' -> 1500, ': 80 gp' -> 80, '80,500' -> 80500 (gold when no unit),
    '+50 gp' -> None (an add-on price), 'varies' -> None."""
    s = plain(s).lstrip(': ').lower()
    if s.startswith('+'):
        return None
    # Digits grouped by commas ("1,000"), then an optional footnote digit ("1,0001 gp" is 1,000 gp, note 1).
    # A range ("1-20 gp") has no single price.
    m = re.match(r'^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\s*-\s*\d)\d?\s*(pp|gp|sp|cp)?(?:\b|$)', s)
    if not m:
        return None
    return round(float(m.group(1).replace(',', '')) * UNITS[m.group(2) or 'gp'], 2)


def match_key(name):
    """'Rope, Silk' (Core Rulebook) and 'Silk Rope' (Ultimate Equipment) are the same item."""
    n = name.lower().strip()
    m = re.match(r'^([^,]+), ([^,]+)$', n)
    return f'{m.group(2)} {m.group(1)}' if m else n


VARIANT_HEADER = re.compile(r'^(type|item)\s*\|\s*price\s*\|\s*weight$', re.I)


def variant_row(line):
    """'Masterwork | 50 gp | 4 lbs.' -> a version, or None if the line isn't one."""
    if line.count('|') != 2:
        return None
    name, price, weight = [x.strip() for x in line.split('|')]
    if price_gp(price) is None:
        return None
    return {'name': name, 'price': price, 'price_gp': price_gp(price),
            'weight': weight if weight.strip('-') else None,
            'weight_lbs': to_number(weight) if weight.strip('-') else None}


def variants(description):
    """Some items list versions in a small table, with or without a "Type | Price | Weight" header:
    "Common | 2 gp | 2 lbs." / "Masterwork | 50 gp | 4 lbs.". Returns (versions, description without the table)."""
    lines = description.split('\n')
    for i in range(len(lines)):
        start = i + 1 if VARIANT_HEADER.match(lines[i].strip()) else i
        rows, j = [], start
        while j < len(lines) and variant_row(lines[j]):
            rows.append(variant_row(lines[j]))
            j += 1
        if len(rows) >= 2 or (rows and start > i):
            return rows, '\n'.join(lines[:i] + lines[j:]).strip()
    return [], description


def category_of(n, rows, book, fields):
    chain, p = [], n['parent_id']
    while p in rows and len(chain) < 6:
        chain.append(rows[p]['name'] or '')
        p = rows[p]['parent_id']
    gear_type = plain(fields.get('Gear Type', ''))
    if gear_type.endswith('Transport'):
        return 'Vehicles', chain
    if gear_type == 'Animal':
        return 'Animals and Mounts', chain
    if book == 'Technology Guide':
        return 'Technological Gear', chain
    for name in chain:
        for pattern, cat in CATEGORIES:
            if re.search(pattern, name.lower()):
                return cat, chain
    return None, chain


def main():
    found, unplaced = {}, Counter()
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        details = {r[0]: r[1:] for r in c.execute('select section_id, aura, price, weight from item_details')}
        misc = {}
        for sid, field, value in c.execute('select section_id, field, value from item_misc'):
            misc.setdefault(sid, {})[field] = value
        for n in rows.values():
            if n['type'] != 'item' or not n['name']:
                continue
            aura, price, weight = details.get(n['section_id'], (None, None, None))
            fields = misc.get(n['section_id'], {})
            if plain(aura):
                continue  # magic item
            if any(f in fields for f in ARMOR_FIELDS):
                continue  # armor (armor.json)
            category, chain = category_of(n, rows, book, fields)
            is_weapon = any(f in fields for f in WEAPON_FIELDS)
            if is_weapon and category != 'Alchemical Items':
                continue  # weapons are for a future weapons file
            if not category:
                # e.g. golem "Construction" costs in the Bestiaries: rules, not gear
                unplaced[f'{book}: ' + ' < '.join(chain[:2])] += 1
                continue
            price_text = clean(price or fields.get('Price') or fields.get('Cost') or '')
            weight_text = clean(weight or fields.get('Weight') or '')
            versions, description = variants(node_text(n))
            item = {
                'id': slug(n['name']), 'name': clean(n['name']), 'source': book, 'category': category,
                'price': price_text or None, 'price_gp': price_gp(price_text),
                'weight': weight_text if weight_text.strip('-') else None,
                'weight_lbs': to_number(weight_text) if weight_text.strip('-') else None,
                **({'craft_dc': clean(fields['Craft DC'])} if fields.get('Craft DC') else {}),
                'description': description,
            }
            if versions:
                # The item's own price/weight is one of the versions (often the last); use the first as the default.
                item['variants'] = versions
                item.update({k: versions[0][k] for k in ('price', 'price_gp', 'weight', 'weight_lbs')})
            found.setdefault(match_key(item['name']), []).append(item)

    out = []
    for records in found.values():
        best = next((r for r in records if r['source'] == PREFERRED), records[0])
        also = sorted({r['source'] for r in records if r['source'] != best['source']})
        if also:
            best['also_in'] = also
        out.append(best)
    # Ids must be unique ("Rope" and "rope" or two items slugging alike).
    ids = Counter(i['id'] for i in out)
    for i in out:
        if ids[i['id']] > 1:
            i['id'] = f"{i['id']}-{slug(i['source'])}"

    out.sort(key=lambda i: (i['category'], i['name'].lower()))
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'pieces of equipment')
    for cat, n in sorted(Counter(i['category'] for i in out).items()):
        print(f'  {n:5} {cat}')
    print('  no price:', sum(1 for i in out if i['price_gp'] is None), '| no weight:', sum(1 for i in out if i['weight_lbs'] is None),
          '| with versions:', sum(1 for i in out if i.get('variants')))
    if unplaced:
        print(f'Left out ({sum(unplaced.values())} items under headings that aren\'t gear):')
        for chain, n in unplaced.most_common():
            print(f'  {n:4} {chain}')


if __name__ == '__main__':
    main()
