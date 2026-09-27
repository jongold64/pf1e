"""Build armor.json (mundane armor and shields) from PSRD-Data.

Every book's armor is read; when the same piece appears in several books, the Ultimate Equipment version is
kept (it reprints the earlier armor with clean stats) and the other books are listed in `also_in`.
"""
import json, re, sys
from common import ALL_BOOKS, iter_books, slug, node_text, plain, to_number

CATEGORY = {'lightarmor': 'light', 'mediumarmor': 'medium', 'heavyarmor': 'heavy', 'shields': 'shield', 'shield': 'shield'}
# Older books name some pieces differently from Ultimate Equipment.
ALIASES = {
    'shield, heavy; wooden': 'heavy wooden shield', 'shield, heavy; steel': 'heavy steel shield',
    'shield, light; wooden': 'light wooden shield', 'shield, light; steel': 'light steel shield',
    'shield, tower': 'tower shield', 'wooden armor': 'wooden',
    'quickdraw shield, light wooden or steel': 'light wooden quickdraw shield',
}
PREFERRED = 'Ultimate Equipment'


def key(name):
    """Field names vary between books ('MaxDex Bonus', 'MaximumDex Bonus', 'Maximum Dex Bonus')."""
    return re.sub(r'[^a-z0-9]', '', name.lower()).replace('maximum', 'max').replace('chance', '')


def signed_int(s):
    """'+6' -> 6, '-5' -> -5, '0' -> 0, '-' (none) -> None."""
    s = plain(s)
    m = re.match(r'^([+-]?)(\d+)', s)
    if not m:
        return None
    return -int(m.group(2)) if m.group(1) == '-' else int(m.group(2))


def speed(s):
    """'20 ft.2' -> 20 (a footnote digit can follow 'ft.'), '-' -> None."""
    m = re.match(r'^(\d+) ft\.', plain(s))
    return int(m.group(1)) if m else None


def match_name(name):
    n = name.lower()
    n = ALIASES.get(n, n)
    return re.sub(r' armor$', '', n)


def read_armor(c, n, book):
    m = {key(f): v for f, v in c.execute('select field, value from item_misc where section_id=?', (n['section_id'],))}
    category = CATEGORY.get(key(plain(m.get('armortype', ''))))
    if not category:
        return None  # "Extras" such as armor spikes are add-ons, not armor
    d = c.execute('select price, weight from item_details where section_id=?', (n['section_id'],)).fetchone() or (None, None)
    # Prefer the separate Armor/Shield Bonus fields; the combined one can carry a footnote ("+44" is +4, note 4).
    bonus = signed_int(m.get('shieldbonus') if category == 'shield' else m.get('armorbonus'))
    if bonus is None:
        bonus = signed_int(m.get('armorshieldbonus'))
    asf = re.match(r'^(\d+)%', plain(m.get('arcanespellfailure')))
    return {
        'id': slug(match_name(n['name'])), 'name': n['name'], 'source': book, 'category': category,
        'bonus': bonus,
        # No listed max Dex (e.g. haramaki, shields) means no limit.
        'max_dex': signed_int(m.get('maxdexbonus')),
        'check_penalty': signed_int(m.get('armorcheckpenalty')) or 0,
        'spell_failure': int(asf.group(1)) if asf else 0,
        'speed_30': speed(m.get('speed30ft')), 'speed_20': speed(m.get('speed20ft')),
        'price_gp': to_number(d[0] or m.get('price') or m.get('cost')), 'weight_lbs': to_number(d[1]),
        'description': node_text(n),
    }


def main():
    found = {}  # matched name -> list of records, in book order
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        ids = [r[0] for r in c.execute('select distinct section_id, field from item_misc') if key(r[1]) == 'armortype']
        for sid in ids:
            n = rows.get(sid)
            if n and n['type'] == 'item':
                a = read_armor(c, n, book)
                if a:
                    found.setdefault(match_name(n['name']), []).append(a)

    out = []
    for records in found.values():
        best = next((a for a in records if a['source'] == PREFERRED), records[0])
        also = sorted({a['source'] for a in records if a['source'] != best['source']})
        if also:
            best['also_in'] = also
        if best['bonus'] is None:
            print('WARNING: no armor bonus for', best['name'], f"({best['source']})")
        out.append(best)

    order = ['light', 'medium', 'heavy', 'shield']
    out.sort(key=lambda a: (order.index(a['category']), a['name']))
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'armor and shields')


if __name__ == '__main__':
    main()
