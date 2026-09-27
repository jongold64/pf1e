"""Build weapons.json (mundane weapons: simple, martial, exotic, firearms and technological) from PSRD-Data.

Books store weapons inconsistently. The Core Rulebook, APG, Ultimate Combat and ARG give a proficiency
("Martial Weapons") and a weapon class ("One-Handed Melee Weapons"). Ultimate Equipment puts the weapon class in
its Proficiency field and lists proficiency in its "Simple / Martial / Exotic Weapons" tables instead, but has
prices. So every book's entry for a weapon is merged: Ultimate Equipment's text and price are preferred, and
missing facts are filled from the other books. Siege engines and alchemical weapons (gear) are left out.
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, node_text, clean, plain, to_number, price_gp

PREFERRED = 'Ultimate Equipment'
GROUPS = {  # weapon class text -> how the weapon is used
    'unarmed attacks': 'unarmed', 'light melee weapons': 'light', 'one-handed melee weapons': 'one-handed',
    'two-handed melee weapons': 'two-handed', 'ranged weapons': 'ranged',
    'one-handed firearms': 'ranged', 'two-handed firearms': 'ranged',
}


def cell_text(h):
    return plain(re.sub(r'<[^>]+>', '', h))


def weapon_tables(c):
    """Ultimate Equipment's Simple/Martial/Exotic Weapons tables: name -> (proficiency, group)."""
    out = {}
    for name, body in c.execute("select name, body from sections where type='table' and name in "
                                "('Simple Weapons', 'Martial Weapons', 'Exotic Weapons')"):
        prof = name.split()[0].lower()
        group = None
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', body or '', re.S):
            ths = re.findall(r'<th[^>]*>(.*?)</th>', tr, re.S)
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            if ths and not tds:
                group = GROUPS.get(cell_text(ths[0]).lower(), group)
            elif ths and tds and cell_text(ths[0]).lower() in GROUPS:
                group = GROUPS[cell_text(ths[0]).lower()]
            if tds:
                wname = re.sub(r'\s*\(\d+\)$', '', cell_text(tds[0])).lower()  # "Butterfly sword (2)" footnote
                if wname:
                    out[wname] = (prof, group)
    return out


def critical(s):
    """'19-20/x2' -> (19, 2), 'x3' -> (20, 3), 'x3/x4' (double weapon) -> (20, 3)."""
    s = plain(s).replace('×', 'x')
    m = re.match(r'^(?:(\d+)(?:-20)?\s*/?\s*)?x(\d)', s)
    if not m:
        return None, None
    return int(m.group(1) or 20), int(m.group(2))


def match_key(name):
    """'Crossbow, Heavy' (Core Rulebook) and 'Heavy Crossbow' (Ultimate Equipment) are the same weapon."""
    n = name.lower().strip()
    m = re.match(r'^([^,]+), ([^,]+)$', n)
    return f'{m.group(2)} {m.group(1)}' if m else n


def dice(s):
    s = clean(s or '')
    return None if s.strip('-') == '' else s


def main():
    table_info = {}
    records = {}  # lowercase name -> list of (book, fields, node, details)
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        if book == PREFERRED:
            table_info = weapon_tables(c)
        details = {r[0]: r[1:] for r in c.execute('select section_id, aura, price, weight from item_details')}
        misc = {}
        for sid, field, value in c.execute('select section_id, field, value from item_misc'):
            misc.setdefault(sid, {})[field] = plain(value)
        for n in rows.values():
            if n['type'] != 'item' or not n['name']:
                continue
            f = misc.get(n['section_id'], {})
            aura, price, weight = details.get(n['section_id'], (None, None, None))
            if plain(aura) or not any(k in f for k in ('Dmg (M)', 'Dmg', 'Critical')):
                continue
            chain, p = [], n['parent_id']
            while p in rows and len(chain) < 3:
                chain.append((rows[p]['name'] or '').lower())
                p = rows[p]['parent_id']
            text = ' '.join(chain) + ' ' + ' '.join(f.values()).lower()
            if 'siege' in text or 'engine' in text or any('alchemical' in h for h in chain):
                continue
            records.setdefault(match_key(clean(n['name'])), []).append((book, f, n, (price, weight), chain))

    out, missing_prof = [], []
    for key, recs in records.items():
        recs.sort(key=lambda r: r[0] != PREFERRED)  # Ultimate Equipment first
        book, f, n, (price, weight), chain = recs[0]
        merged = {}
        for _, fields, *_ in reversed(recs):  # later records (other books) first, preferred book last wins
            merged.update({k: v for k, v in fields.items() if v and v.strip('-')})
        tech = any(r[0] == 'Technology Guide' for r in recs)
        firearm = 'firearm' in ' '.join(merged.values()).lower() or any('firearm' in ' '.join(r[4]) for r in recs)

        # Proficiency: the fields that say simple/martial/exotic, else Ultimate Equipment's tables.
        prof = None
        for _, fields, *_ in recs:
            v = (fields.get('Proficiency') or '').lower()
            for word in ('simple', 'martial', 'exotic'):
                if v.startswith(word):
                    prof = word
        tprof, tgroup = table_info.get(key) or table_info.get(n['name'].lower()) or (None, None)
        prof = prof or tprof or ('exotic' if (firearm or tech) else None)

        # How it's used: a weapon class from any field or the tables.
        group = None
        for _, fields, *_ in recs:
            for v in (fields.get('Weapon Class'), fields.get('Proficiency')):
                group = group or GROUPS.get((v or '').lower())
        # Weapons with no class given (e.g. technological melee weapons) are ranged if they have a range,
        # otherwise treated as one-handed melee weapons.
        group = group or tgroup or ('ranged' if (firearm or merged.get('Range')) else 'one-handed')
        if not prof:
            missing_prof.append(n['name'])
            continue

        threat, mult = critical(merged.get('Critical', ''))
        price_text = clean(price or merged.get('Price') or merged.get('Cost') or '')
        weight_text = clean(weight or merged.get('Weight') or '')
        rng = re.match(r'^(\d+) ft', merged.get('Range', ''))
        description = next((node_text(r[2]) for r in recs if node_text(r[2])), '')
        out.append({
            'id': slug(n['name']), 'name': clean(n['name']), 'source': book,
            **({'also_in': sorted({r[0] for r in recs[1:]} - {book})} if len({r[0] for r in recs}) > 1 else {}),
            'category': 'Technological Weapons' if tech else 'Firearms' if firearm else f'{prof.title()} Weapons',
            'proficiency': prof, 'group': group,
            'firearm': firearm, 'thrown': group in ('light', 'one-handed', 'two-handed') and bool(rng),
            'damage': {s: dice(merged.get(f'Dmg ({s.upper()})') or (merged.get('Dmg') if s == 'm' else None))
                       for s in ('t', 's', 'm', 'l')},
            'critical': clean(merged.get('Critical', '')) or None, 'threat': threat, 'multiplier': mult,
            'range_ft': int(rng.group(1)) if rng else None,
            'type': clean(merged.get('Type', '')) or None,
            'special': [s.strip().lower() for s in re.split(r',\s*', clean(merged.get('Special', ''))) if s.strip() and s.strip('-')],
            'price': price_text or None, 'price_gp': price_gp(price_text),
            'weight_lbs': to_number(weight_text) if weight_text.strip('-') else None,
            # Weapon Finesse works with light weapons and weapons whose rules say so (rapier, whip, ...).
            'finesse': group in ('light', 'unarmed') or bool(re.search(r'Weapon Finesse', description)),
            'description': description,
        })

    ids = Counter(w['id'] for w in out)
    for w in out:
        if ids[w['id']] > 1:
            w['id'] = f"{w['id']}-{slug(w['source'])}"
    order = ['Simple Weapons', 'Martial Weapons', 'Exotic Weapons', 'Firearms', 'Technological Weapons']
    out.sort(key=lambda w: (order.index(w['category']), w['name'].lower()))
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'weapons')
    for cat, n in Counter(w['category'] for w in out).most_common():
        print(f'  {n:4} {cat}')
    print('  groups:', dict(Counter(w['group'] for w in out)))
    print('  no damage:', [w['name'] for w in out if not w['damage']['m']][:12])
    print('  no price:', sum(1 for w in out if w['price_gp'] is None), '| no weight:', sum(1 for w in out if w['weight_lbs'] is None),
          '| no critical:', [w['name'] for w in out if not w['multiplier']][:10])
    if missing_prof:
        print(f'Left out, no proficiency found ({len(missing_prof)}):', ', '.join(missing_prof[:30]))


if __name__ == '__main__':
    main()
