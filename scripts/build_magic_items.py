"""Build magic-items.json from PSRD-Data.

A magic item is an `item` section with an aura (mundane gear has none). Its category comes from the headings
above it in the book ("Rings", "Head Slot Wondrous Items", "Specific Magic Shields", ...). When the same item is
in several books, the earliest book's entry is kept and the others are listed in `also_in`.
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, node_text, text, clean, plain, to_number, price_gp

# First heading (walking up from the item) that matches decides the category. Order matters.
CATEGORIES = [
    (r'intelligent', 'Intelligent Items'),
    (r'cursed', 'Cursed Items'),
    (r'artifact', 'Artifacts'),
    (r'weapon special abilit|special weapon abilit|magic weapon special', 'Weapon Special Abilities'),
    (r'armor special abilit|shield special abilit|special armor abilit|magic armor special|armor and shield special', 'Armor and Shield Special Abilities'),
    (r'specific (magic )?shields', 'Magic Shields'),
    (r'specific (magic )?armou?rs?\b', 'Magic Armor'),
    (r'specific (magic )?weapons', 'Magic Weapons'),
    (r'\bstaves\b|\bstaffs?\b', 'Staves'),
    (r'\brods?\b', 'Rods'),
    (r'\brings?\b', 'Rings'),
    (r'wondrous', 'Wondrous Items'),
    (r'potions?|elixirs?', 'Potions'),
    (r'wands?\b', 'Wands'),
    (r'scrolls?\b', 'Scrolls'),
]
SLOTS = {'belt', 'body', 'chest', 'eyes', 'feet', 'hands', 'head', 'headband', 'neck', 'ring', 'shoulders', 'wrist',
         'wrists', 'armor', 'shield', 'weapon', 'none', 'slotless', 'arms'}


def category_of(n, rows):
    chain, p = [], n['parent_id']
    while p in rows and len(chain) < 8:
        chain.append(rows[p]['name'] or '')
        p = rows[p]['parent_id']
    for name in chain:
        for pattern, cat in CATEGORIES:
            if re.search(pattern, name.lower()):
                return cat, chain
    return None, chain


def by_slot(slot, name):
    """Category for items under headings like "Halfling Magic Items": decided by body slot instead."""
    s = plain(slot).lower()
    if s == 'ring':
        return 'Rings'
    if s == 'armor':
        return 'Magic Armor'
    if s == 'shield':
        return 'Magic Shields'
    if s == 'weapon':
        return 'Magic Weapons'
    if re.match(r'^(rod|metamagic rod)\b', name.lower()):
        return 'Rods'
    if re.match(r'^staff\b', name.lower()):
        return 'Staves'
    return 'Wondrous Items'


PRICE_OPTION = re.compile(r'([\d,]+)\s*gp\s*\(([^)]+)\)')


def price_options(price):
    """'2,000 gp (+1), 8,000 gp (+2)' -> [{'label': '+1', 'price_gp': 2000}, {'label': '+2', 'price_gp': 8000}].
    Only when the price lists two or more choices."""
    opts = [{'label': label.strip(), 'price_gp': int(gp.replace(',', ''))} for gp, label in PRICE_OPTION.findall(price or '')]
    return opts if len(opts) >= 2 else []


def table_price_options(description):
    """Items priced "see below" / "varies" whose description has a table with a price column (bag of holding,
    carpet of flying, crystal ball, ioun stones): one option per row, with the row's weight if the table has one.
    "Type I | 15 lbs. | 250 lbs. | 30 cubic ft. | 2,500 gp" -> {'label': 'Type I', 'price_gp': 2500, 'weight_lbs': 15}."""
    lines = description.split('\n')
    for k, line in enumerate(lines):
        cells = [c.strip() for c in line.split('|')]
        if len(cells) < 2:
            continue
        price_col = next((j for j, c in enumerate(cells) if re.search(r'\bprice\b', c, re.I) and 'modifier' not in c.lower()), None)
        if price_col is None:
            continue
        weight_col = next((j for j, c in enumerate(cells) if re.fullmatch(r'(bag |item )?weight', c, re.I)), None)
        opts = []
        for row in lines[k + 1:]:
            r = [c.strip() for c in row.split('|')]
            if len(r) != len(cells):
                break
            gp = price_gp(r[price_col])
            if gp is None:
                continue
            opt = {'label': r[0].rstrip(' *'), 'price_gp': gp}
            if weight_col is not None and to_number(r[weight_col]) is not None:
                opt['weight_lbs'] = to_number(r[weight_col])
            opts.append((opt, r))
        # Rows sharing a first cell (ioun stones of one colour) are told apart by the second.
        labels = Counter(o['label'] for o, _ in opts)
        for o, r in opts:
            if labels[o['label']] > 1 and len(r) > 2:
                o['label'] = f"{r[0]} {r[1].lower()}"
        opts = [o for o, _ in opts]
        if len(opts) >= 2:
            return opts
    return []


def tidy(description):
    """Artifacts' "Destruction" sections carry a placeholder label "descriptor" in the source:
    "Destruction: descriptor The aegis is destroyed..." and a trailing "descriptor" line."""
    d = re.sub(r'(^|\n|: )descriptor\b\s*', r'\1', description)
    d = re.sub(r'^Description:\s*', '', d)
    return re.sub(r'\n{3,}', '\n\n', d).strip()


def cl_number(s):
    m = re.match(r'^(\d+)', plain(s))
    return int(m.group(1)) if m else None


# Some books store special abilities as plain text sections that end with a stat line:
# "Moderate evocation; CL 10th; Craft Magic Arms and Armor and flame blade...; Price +1 bonus."
ABILITY_HEADING = re.compile(r'special abilit(y|ies) descriptions', re.I)
STAT_LINE = re.compile(r'(?:^|\n)\s*((?:faint|moderate|strong|overwhelming)[^;\n]*);\s*CL (\d+)\w*;\s*(.*?);\s*Price ([^\n]+?)\.?\s*$',
                       re.I | re.S)


STAT_BLOCK = re.compile(r'<p[^>]*stat-block-1[^>]*>\s*<b>\s*([^<]+?)\s*</b>\s*(.*?)</p>', re.I | re.S)


def ability_from_stat_block(n, category, book):
    """Ultimate Equipment layout: "<b>Price</b> +1 bonus", "<b>Aura</b> ...", "<b>CL</b> 13th" paragraphs,
    then the description, then a "Construction Requirements" child section."""
    body = n['body'] or ''
    stats = {label.lower(): clean(value) for label, value in STAT_BLOCK.findall(body)}
    if 'aura' not in stats:
        return None
    parts = [text(STAT_BLOCK.sub('', body))]
    requirements = ''
    for ch in n['children']:
        if (ch['name'] or '').lower().startswith('construction'):
            # The child repeats the price lines; the requirements are its last paragraph.
            requirements = text(STAT_BLOCK.sub('', ch['body'] or ''))
        else:
            # Some abilities keep their description in a child section (Putrid > Putrid).
            parts.append(node_text(ch))
    description = tidy('\n\n'.join(p for p in parts if p))
    price = stats.get('price', '')
    return {
        'id': slug(n['name']), 'name': clean(n['name']), 'source': book, 'category': category, 'slot': None,
        'aura': stats['aura'], 'cl': cl_number(stats.get('cl')), 'price': price or None,
        'price_gp': to_number(price) if 'gp' in price else None, 'weight': None,
        'description': description,
        **({'construction': {'requirements': requirements}} if requirements else {}),
    }


def ability_from_section(n, heading, book):
    category = 'Armor and Shield Special Abilities' if re.search(r'armor|shield', heading, re.I) else 'Weapon Special Abilities'
    full = node_text(n)
    m = STAT_LINE.search(full)
    if not m:
        return ability_from_stat_block(n, category, book)
    return {
        'id': slug(n['name']), 'name': clean(n['name']), 'source': book, 'category': category, 'slot': None,
        'aura': m.group(1).strip(), 'cl': int(m.group(2)), 'price': m.group(4).strip(),
        'price_gp': to_number(m.group(4)) if 'gp' in m.group(4) else None, 'weight': None,
        'description': full[:m.start()].strip(),
        'construction': {'requirements': m.group(3).strip()},
    }


def main():
    items, unplaced, unread = {}, Counter(), []

    def add(item, book):
        key = (item['id'], item['category'])
        if key in items:
            if book != items[key]['source'] and book not in items[key].setdefault('also_in', []):
                items[key]['also_in'].append(book)
        else:
            items[key] = item

    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        for n in rows.values():
            parent = rows.get(n['parent_id'])
            if n['type'] == 'section' and n['name'] and parent and ABILITY_HEADING.search(parent['name'] or ''):
                ability = ability_from_section(n, parent['name'], book)
                if ability:
                    add(ability, book)
                else:
                    unread.append(f"{n['name']} ({book})")
        details = {r[0]: r[1:] for r in c.execute('select section_id, aura, slot, cl, price, weight from item_details')}
        misc = {}
        for sid, field, sub, value in c.execute('select section_id, field, subsection, value from item_misc'):
            misc.setdefault(sid, []).append((field, sub, value))
        for n in rows.values():
            if n['type'] != 'item' or not n['name'] or n['section_id'] not in details:
                continue
            aura, slot, cl, price, weight = details[n['section_id']]
            if not plain(aura):
                continue  # mundane gear
            category, chain = category_of(n, rows)
            if not category:
                heading = chain[0] if chain else ''
                if re.search(r'firearm.*special abilit|ammunition special abilit', heading, re.I):
                    category = 'Weapon Special Abilities'
                else:
                    category = by_slot(slot, n['name'])
                    unplaced[f'{category} <- {book}: {heading}'] += 1
            construction = {}
            for field, sub, value in misc.get(n['section_id'], []):
                if field in ('Requirements', 'Cost'):
                    construction[field.lower()] = clean(value)
            slot_text = plain(slot).lower() or None
            item = {
                'id': slug(n['name']), 'name': clean(n['name']), 'source': book, 'category': category,
                'slot': slot_text if slot_text in SLOTS else (slot_text or None),
                'aura': clean(aura), 'cl': cl_number(cl), 'price': clean(price) or None,
                'price_gp': price_gp(price), **({'price_options': price_options(price)} if price_options(price) else {}),
                'weight': clean(weight) if clean(weight).strip('-') else None,
                'weight_lbs': to_number(weight) if clean(weight).strip('-') else None,
                'description': tidy(node_text(n)),
                **({'construction': construction} if construction else {}),
            }
            if item['price_gp'] is None and 'price_options' not in item:
                opts = table_price_options(item['description'])
                if opts:
                    item['price_options'] = opts
            add(item, book)

    # Ids must be unique; an item name used in two categories gets the category in its id.
    ids = Counter(i['id'] for i in items.values())
    for i in items.values():
        if ids[i['id']] > 1:
            i['id'] = f"{i['id']}-{slug(i['category'])}"

    out = sorted(items.values(), key=lambda i: (i['category'], i['name'].lower()))
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'magic items')
    for cat, n in sorted(Counter(i['category'] for i in out).items()):
        print(f'  {n:5} {cat}')
    if unread:
        print(f'Special ability sections without a stat line (left out): {len(unread)}:', ', '.join(unread))
    if unplaced:
        print('Placed by body slot (their heading names no category):')
        for chain, n in unplaced.most_common(12):
            print(f'  {n:4} {chain}')
        print(f'  ... {sum(unplaced.values())} items in all')


if __name__ == '__main__':
    main()
