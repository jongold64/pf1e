"""Add to magic-items.json magic items from later Paizo books that PSRD-Data lacks (Player Companions...), from their
Archives of Nethys pages (cached in ../../aonprd-classes/lists, downloaded once). Each page gives the item's book, aura,
caster level, slot, price, weight, description and construction. Only items from a book whose OGL notice is known are
added, and an item already in the file is left as it is.

Add an item: its AoN page kind and name in AON_ITEMS below.

Usage: python build_aon_magic_items.py path/to/magic-items.json   (run after build_magic_items.py; adds to the file)
"""
import json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book

# (AoN display page, item name, category in magic-items.json).
AON_ITEMS = [
    ('MagicWeaponsDisplay', 'Effortless Lace', 'Magic Weapons'),  # Giant Hunter's Handbook
]


def number(s):
    m = re.search(r'[\d,]+(?:\.\d+)?', s or '')
    return float(m.group(0).replace(',', '')) if m else None


def item_from_page(kind, name, category):
    url = f'https://aonprd.com/{kind}.aspx?ItemName={urllib.parse.quote(name)}'
    text = page_text(aon_page('Item_' + re.sub(r'[^A-Za-z]', '', name), url))
    start = text.find(name + 'Source')
    if start < 0:
        start = text.find(name + ' Source')
    if start < 0:
        raise SystemExit(f'{name}: not found on {url}')
    body = text[start + len(name):]
    field = lambda label, stop: (re.search(rf'{label}\s*(.*?)\s*(?:{stop})', body, re.S) or [None, None])[1]
    source = field('Source', r' pg\.|\n')
    aura = field('Aura', r'\s*CL\b')
    cl = field('CL', r'\n')
    slot = field('Slot', r';')
    price = field('Price', r';')
    weight = field('Weight', r'\n|Description')
    desc = re.search(r'Description\s*(.*?)\s*Construction', body, re.S)
    req = field('Requirements', r';|\n')
    cost = (re.search(r'Requirements[^\n]*?;\s*(?:Price|Cost)\s*([^\n]*)', body) or [None, None])[1]
    weight_lbs = number(weight) if weight and weight.strip() not in ('—', '-') else None
    return {
        'id': slug(name), 'name': name, 'source': aon_book(source or ''), 'category': category,
        'slot': (slot or 'none').strip().lower(), 'aura': (aura or '').strip(), 'cl': int(number(cl)) if cl and number(cl) else None,
        'price': (price or '').strip(), 'price_gp': (lambda n: int(n) if n is not None and n == int(n) else n)(number(price)), 'weight': (weight or '').strip(), 'weight_lbs': weight_lbs,
        'description': desc.group(1).strip() if desc else '',
        'construction': {k: v.strip() for k, v in (('requirements', req), ('cost', cost)) if v},
        'origin': 'aonprd',
    }


def main():
    path = sys.argv[1]
    items = json.load(open(path, encoding='utf-8'))
    have = {i['name'].lower() for i in items}
    notices = load_notices()
    added = []
    for kind, name, category in AON_ITEMS:
        if name.lower() in have:
            continue
        item = item_from_page(kind, name, category)
        if not item['source'] or not find_notices(notices, item['source']):
            print(f'  skipped {name}: no OGL notice for {item["source"]!r}')
            continue
        items.append(item)
        added.append(name)
    json.dump(items, open(path, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'magic-items.json: added {len(added)} from Archives of Nethys ({", ".join(added)})')


if __name__ == '__main__':
    main()
