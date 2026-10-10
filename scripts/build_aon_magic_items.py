"""Add to magic-items.json the magic items PSRD-Data lacks (Player Companions, Campaign Setting books, later hardcovers...),
from the Archives of Nethys magic item lists and pages (cached in ../../aonprd-classes/lists, downloaded once; the first
run takes about an hour). Every list (armor and shield, weapon, ring, rod, staff, wondrous items by slot, artifacts,
cursed, intelligent, special potions) is read; an item whose name isn't in the file already is read from its page: book,
aura, caster level, slot, price, weight, description (tables as "a | b" rows) and construction. Variants listed apart
("Belt of Superior Maneuvers (+1)", "(+2)"...) become one item with `price_options`. Only items from a book whose OGL
notice is known are added; the others are counted by book at the end.

Usage: python build_aon_magic_items.py path/to/magic-items.json   (run after build_magic_items.py; adds to the file)
Set AON_LIMIT=n to read only the first n missing items (to test).
"""
import html, json, os, re, sys, urllib.parse
from collections import Counter, defaultdict
from bs4 import BeautifulSoup
from common import slug, price_gp, to_number
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, aon_book
from build_magic_items import price_options, table_price_options

# AoN list pages -> the category in magic-items.json.
LISTS = [
    ('ArmorQuality', 'MagicArmor.aspx?Category=ArmorQuality', 'Armor and Shield Special Abilities'),
    ('ShieldQuality', 'MagicArmor.aspx?Category=ShieldQuality', 'Armor and Shield Special Abilities'),
    ('SpecificArmor', 'MagicArmor.aspx?Category=SpecificArmor', 'Magic Armor'),
    ('SpecificShield', 'MagicArmor.aspx?Category=SpecificShield', 'Magic Shields'),
    ('MagicWeapons_Melee', 'MagicWeapons.aspx?Category=MeleeWeaponQuality', 'Weapon Special Abilities'),
    ('MagicWeapons_Ranged', 'MagicWeapons.aspx?Category=RangedWeaponQuality', 'Weapon Special Abilities'),
    ('MagicWeapons_Specific', 'MagicWeapons.aspx?Category=SpecificWeapon', 'Magic Weapons'),
    ('MagicRings', 'MagicRings.aspx', 'Rings'),
    ('RodsMetamagic', 'MagicRods.aspx?Category=Metamagic', 'Rods'),
    ('RodsOther', 'MagicRods.aspx?Category=Other', 'Rods'),
    ('MagicStaves', 'MagicStaves.aspx', 'Staves'),
    ('ArtifactsMinor', 'MagicArtifacts.aspx?MinorMajor=Minor', 'Artifacts'),
    ('ArtifactsMajor', 'MagicArtifacts.aspx?MinorMajor=Major', 'Artifacts'),
    ('MagicCursed', 'MagicCursed.aspx', 'Cursed Items'),
    ('MagicIntelligent', 'MagicIntelligent.aspx', 'Intelligent Items'),
    ('MagicPotions', 'MagicPotions.aspx', 'Potions'),
] + [(f'MagicWondrous_{s}', f'MagicWondrous.aspx?FinalSlot={s}', 'Wondrous Items')
     for s in ['Belts', 'Body', 'Chest', 'Eyes', 'Feet', 'Hands', 'Head', 'Headband', 'Ioun', 'Neck', 'Other', 'Shoulders', 'Wrist']]


def base_and_option(label):
    """'Belt of Superior Maneuvers (+1)' -> ('Belt of Superior Maneuvers', '+1'); no parentheses -> (label, None)."""
    m = re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', label)
    return (m.group(1), m.group(2)) if m else (label, None)


def key(name):
    """Name words in any order, letters and digits only ("Shadow, Improved" and "Improved Shadow" match)."""
    name = html.unescape(name).replace('’', "'").lower()
    return ' '.join(sorted(re.sub(r"[^a-z0-9 ]", ' ', name).split()))


def list_rows():
    """[(category, label, href, cost)] from every list page."""
    rows = []
    for name, url, category in LISTS:
        page = aon_page(name, 'https://aonprd.com/' + url)
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S):
            link = re.search(r'<a href="([^"]*Display\.aspx\?[^"]*)">(.*?)</a>', tr, re.S)
            if not link:
                continue
            cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            label = html.unescape(re.sub(r'<[^>]+>', '', link.group(2))).strip()
            cost = html.unescape(re.sub(r'<[^>]+>', '', cells[1])).strip() if len(cells) > 1 else ''
            rows.append((category, label, html.unescape(link.group(1)), cost))
    return rows


def drop_sups(node):
    """Book abbreviations after a name ("cloth<sup>UE</sup>") are left out."""
    for sup in node.find_all('sup'):
        sup.decompose()
    return node


def tidy_spaces(s):
    return re.sub(r'\s+([,;.:)])', r'\1', s)


def block_text(node):
    """A description's HTML as the file's text: paragraphs split by blank lines, tables as "a | b" rows."""
    drop_sups(node)
    for t in node.find_all('table'):
        lines = [' | '.join(c.get_text(' ', strip=True) for c in tr.find_all(['td', 'th'])) for tr in t.find_all('tr')]
        t.replace_with('\n\n' + '\n'.join(l for l in lines if l.strip(' |')) + '\n\n')
    for br in node.find_all('br'):
        br.replace_with('\n')
    for h in node.find_all(['h3', 'h4']):
        h.replace_with('\n\n' + h.get_text(' ', strip=True) + '\n\n')
    text = node.get_text('')
    text = '\n'.join(re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n'))
    return tidy_spaces(re.sub(r'\n{3,}', '\n\n', text).strip())


def parse_page(page):
    """The first item on an AoN item page: { name, source, aura, cl, slot, price, weight, description, construction }."""
    soup = BeautifulSoup(page, 'html.parser')
    span = soup.find('span', id='MainContent_DataListTypes_LabelName_0')
    if not span or not span.find('h1'):
        return None
    name = span.find('h1').get_text(' ', strip=True)
    # Split at the h3 headings: the stat lines before "Description", the description, then "Construction".
    raw = str(span)
    parts = re.split(r'<h3[^>]*>\s*(Description|Construction|Destruction|Statistics)\s*</h3>', raw, flags=re.I)
    head = drop_sups(BeautifulSoup(parts[0], 'html.parser'))
    for h1 in head.find_all('h1'):
        h1.decompose()
    head_text = html.unescape(head.get_text(' ', strip=True))
    sections = {parts[i].lower(): parts[i + 1] for i in range(1, len(parts) - 1, 2)}
    field = lambda label, stop=r'(?=\b(?:Source|Aura|CL|Slot|Price|Weight|Alignment|Ego)\b|;|$)': (
        (re.search(rf'\b{label}\b\s*(.*?)\s*{stop}', head_text, re.S) or [None, None])[1])
    source = field('Source', r'pg\.|$')
    desc = BeautifulSoup(sections.get('description', ''), 'html.parser')
    description = block_text(desc)
    if 'destruction' in sections:
        description += '\n\nDestruction\n\n' + block_text(BeautifulSoup(sections['destruction'], 'html.parser'))
    if not description:
        # Pages with no Description heading: the text after the stat lines.
        description = block_text(BeautifulSoup(parts[0], 'html.parser'))
    cons = tidy_spaces(html.unescape(drop_sups(BeautifulSoup(sections.get('construction', ''), 'html.parser')).get_text(' ', strip=True)))
    req = re.search(r'Requirements\s*(.*?)\s*(?:;\s*(?:Price|Cost)\s*(.*))?$', cons, re.S)
    return {
        'name': name, 'source': aon_book(source or '').strip(),
        'aura': (field('Aura', r'(?=\bCL\b)|;|$') or '').strip().rstrip(';').strip(), 'cl': to_number(field('CL') or ''),
        'slot': (field('Slot') or '').strip(), 'price': (field('Price') or '').strip(), 'weight': (field('Weight') or '').strip(),
        'description': description,
        'construction': {k: v.strip() for k, v in (('requirements', req and req.group(1)), ('cost', req and req.group(2))) if v},
    }


# AoN's slot words -> the file's (the Magic Items tab's body slots).
SLOTS = {'wrist': 'wrists', 'hand': 'hands', 'waist': 'belt', 'amulet': 'neck', 'boots': 'feet', 'eye': 'eyes'}


def slot_name(s):
    s = (s or '').strip().lower()
    if not s or s.endswith('quality'):
        return 'none' if s else None
    return SLOTS.get(s, s)


def whole(n):
    return int(n) if isinstance(n, float) and n.is_integer() else n


def pounds(weight):
    """'1/2 lb.' -> 0.5, '2 lbs.' -> 2, '1-1/2 lbs.' -> 1.5, '—' -> None."""
    w = (weight or '').strip()
    m = re.match(r'^(?:(\d+)[- ])?(\d+)/(\d+)', w)
    if m:
        return int(m.group(1) or 0) + int(m.group(2)) / int(m.group(3))
    return whole(to_number(w)) if w.strip('—-– ') else None


def main():
    path = sys.argv[1]
    items = json.load(open(path, encoding='utf-8'))
    have = {key(i['name']) for i in items}
    ids = {i['id'] for i in items}
    notices = load_notices()
    # Rows grouped into items: a base name with its variants (each list row a price option).
    groups = defaultdict(list)
    for category, label, href, cost in list_rows():
        base, option = base_and_option(label)
        if key(label) in have or key(base) in have:
            continue
        groups[(category, key(base))].append((label, base, option, href, cost))
    todo = list(groups.items())
    limit = int(os.environ.get('AON_LIMIT') or 0)
    if limit:
        todo = todo[:limit]
    added, skipped, failed = [], Counter(), []
    for n, ((category, k), rows) in enumerate(todo):
        if k in have:
            continue
        label, base, option, href, cost = rows[0]
        cache = 'MI_' + re.sub(r'[^A-Za-z0-9]+', '_', href)[:150]
        try:
            info = parse_page(aon_page(cache, 'https://aonprd.com/' + urllib.parse.quote(href, safe='/?=&')))
        except Exception as e:  # a page that won't load: reported, the rest go on
            failed.append(f'{label}: {e}')
            continue
        if not info:
            failed.append(f'{label}: no item on the page')
            continue
        if not info['source'] or not find_notices(notices, info['source']):
            skipped[info['source'] or '(no source)'] += 1
            continue
        variants = [r for r in rows if r[2]]
        name = base if len(rows) > 1 and variants else info['name']
        opts = [{'label': r[2], 'price_gp': price_gp(r[4])} for r in variants if price_gp(r[4]) is not None] if len(rows) > 1 else []
        item_id = slug(name) if slug(name) not in ids else slug(f'{name} {category}')
        if item_id in ids:
            continue
        weight = info['weight']
        item = {
            'id': item_id, 'name': name, 'source': info['source'], 'category': category,
            'slot': slot_name(info['slot']), 'aura': info['aura'] or None, 'cl': int(info['cl']) if info['cl'] else None,
            'price': info['price'] or None, 'price_gp': whole(price_gp(info['price'].lstrip('+'))) if not opts else None,
            'weight': weight or None, 'weight_lbs': pounds(weight),
            'description': info['description'], 'construction': info['construction'], 'origin': 'aonprd',
        }
        options = opts if len(opts) >= 2 else price_options(item['price'])
        if not options and item['price_gp'] is None:
            options = table_price_options(item['description'])
        if options:
            item['price_options'] = options
        items.append(item)
        ids.add(item_id)
        have.add(k)
        added.append(name)
        if (n + 1) % 100 == 0:
            print(f'  {n + 1} of {len(todo)} read, {len(added)} added', flush=True)
    json.dump(items, open(path, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'magic-items.json: added {len(added)} from Archives of Nethys')
    if skipped:
        print(f'  left out (no OGL notice for the book): {sum(skipped.values())} items: ' +
              ', '.join(f'{b} ({n})' for b, n in skipped.most_common()))
    for f in failed:
        print('  failed:', f)


if __name__ == '__main__':
    main()
