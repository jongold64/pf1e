"""Add to weapons.json the simple, martial and exotic weapons from later Paizo books that PSRD-Data lacks (butchering axe,
Aldori dueling sword...), from the Archives of Nethys weapon lists and pages (cached in ../../aonprd-classes/lists,
downloaded once). Each list row gives cost, damage (Small, Medium), critical, range, weight, type and special; the
weapon's page gives its book, category (light, one-handed, two-handed, ranged), proficiency and description. Tiny and
Large damage come from the Core Rulebook's table of weapon damage by size. Only weapons from a book whose OGL notice is
known are added (firearms and siege weapons are left out); ammunition goes in ammo.json beside it.

Also gives every weapon its fighter weapon groups (`groups`), from its AoN page.

Usage: python build_aon_weapons.py path/to/weapons.json   (run after build_weapons.py; adds to the file)
"""
import json, os, re, sys, urllib.parse
from collections import Counter
from bs4 import BeautifulSoup
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book

ORIGIN = 'aonprd'
# Core Rulebook Table 6-5 (Tiny and Large Weapon Damage): Medium dice -> (Tiny, Large).
SIZE_DICE = {'1d2': (None, '1d3'), '1d3': ('1', '1d4'), '1d4': ('1d2', '1d6'), '1d6': ('1d3', '1d8'), '1d8': ('1d4', '2d6'),
             '1d10': ('1d6', '2d8'), '1d12': ('1d8', '3d6'), '2d4': ('1d4', '2d6'), '2d6': ('1d6', '3d6'),
             '2d8': ('1d8', '3d8'), '2d10': ('1d10', '4d8'),
             # Beyond the table: one more die (the butchering axe's 3d6 is 4d6 Large).
             '3d6': (None, '4d6')}
CATEGORY = {'light': 'light', 'one-handed': 'one-handed', 'two-handed': 'two-handed', 'ranged': 'ranged'}


def keys(name):
    """Name words in any order, letters only ("Mace, heavy" and "Heavy mace" match), and the letters run together
    ("Short sword" and "Shortsword")."""
    words = re.sub(r"[^a-z ]", '', name.lower().replace('-', ' ')).split()
    return {' '.join(sorted(words)), ''.join(words)}


def dice(s):
    s = (s or '').strip()
    return None if not s or s.strip('—-') == '' else s


def sized(medium, which):
    """Tiny (0) or Large (1) dice from Medium ones, for each half of a double weapon ("1d6/1d6")."""
    if not medium:
        return None
    parts = [SIZE_DICE.get(p, (None, None))[which] for p in medium.split('/')]
    return '/'.join(parts) if all(parts) else None


def critical(s):
    m = re.match(r'(?:(\d+)-20/)?[x×](\d)', (s or '').strip())
    return (int(m.group(1)) if m and m.group(1) else 20), (int(m.group(2)) if m else 2)


def number(s):
    m = re.search(r'[\d.,]+', s or '')
    return float(m.group(0).replace(',', '')) if m else None


def price_gp(s):
    """'1 gp' -> 1, '5 sp' -> 0.5, '5 cp' -> 0.05 (None if there's no price)."""
    m = re.search(r'([\d.,]+)\s*(gp|sp|cp)?', s or '')
    return float(m.group(1).replace(',', '')) * {'gp': 1, 'sp': 0.1, 'cp': 0.01}[m.group(2) or 'gp'] if m else None


def rows(prof):
    """[(name, cells)] from a proficiency's list page (several tables, one per category)."""
    page = aon_page('Weapons' + prof, f'https://aonprd.com/EquipmentWeapons.aspx?Proficiency={prof}')
    out = []
    for table in BeautifulSoup(page, 'html.parser').find_all('table'):
        head = [c.get_text(' ', strip=True) for c in table.find('tr').find_all(['th', 'td'])]
        if head[:2] != ['Name', 'Cost']:
            continue
        for tr in table.find_all('tr')[1:]:
            cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
            if len(cells) == len(head) and tr.find('a'):
                out.append((cells[0], dict(zip(head, cells))))
    return out


def details(name):
    """Book, category, proficiency, weapon groups and description from the weapon's page."""
    text = page_text(aon_page('Weapon_' + re.sub(r'[^A-Za-z]', '', name),
                              'https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
    src = re.search(r'Source (.+?) pg\.', text)
    cat = re.search(r'Category ([A-Za-z\-]+)', text)
    prof = re.search(r'Proficiency (Simple|Martial|Exotic)', text)
    groups = re.search(r'Weapon Groups ([^\n]+?)(?:Description|\n)', text)
    desc = text.split('Description', 1)[1].strip().split('\n\n')[0].strip() if 'Description' in text else ''
    return {'source': aon_book(src.group(1)) if src else '', 'category': (cat.group(1).lower() if cat else ''),
            'proficiency': (prof.group(1).lower() if prof else ''), 'weapon_groups': groups.group(1).strip() if groups else '',
            'description': desc}


# PSRD weapon names the Core Rulebook's weapon group lists write differently.
GROUP_ALIASES = {'armor spikes': 'spiked armor', 'shield, heavy; steel': 'heavy shield', 'shield, heavy; wooden': 'heavy shield',
                 'spiked light shield': 'spiked shield', 'spiked shield, light': 'spiked shield', 'mace': 'light mace'}


def core_groups(classes_path):
    """Weapon name (lower case) -> fighter weapon groups, from the fighter's Weapon Training text (Core Rulebook):
    "Axes: battleaxe, dwarven waraxe, ... and throwing axe."."""
    fighter = next(c for c in json.load(open(classes_path, encoding='utf-8')) if c['id'] == 'fighter')
    text = next(f['text'] for f in fighter['features'] if f['name'].startswith('Weapon Training'))
    out = {}
    for group, names in re.findall(r'(?m)^([A-Z][A-Za-z, ]+?): (.+?)\.\s*$', text):
        group = {'Pole Arms': 'Polearms'}.get(group, group)
        group = group[0].upper() + group[1:].lower()
        for n in re.split(r',\s*(?:and\s+)?|\s+and\s+', names):
            n = n.strip().lower()
            if n and not n.startswith('all '):
                out.setdefault(n, []).append(group)
    return out


# Ammunition for siege engines (on the ammunition list too).
SIEGE_AMMO = {'Ballista net', 'Flak', 'Flechette bolt', 'Weighted bolt'}
# Which launcher each kind of ammunition is for, by its name.
LAUNCHERS = [(r'repeating crossbow bolt', 'crossbow'), (r'\bbolt', 'crossbow'), (r'blowgun|featherweight dart', 'blowgun'),
             (r'atlatl', 'atlatl'), (r'kestros', 'kestros'), (r'throwing arrow', 'throwing arrow cord'), (r'thorn', 'bow'),
             (r'arrow', 'bow'), (r'bullet|stone', 'sling')]


def ammunition(notices):
    """Ammunition (arrows, bolts, sling bullets, darts...) from the AoN ammunition list: price for a bundle ("Arrows (20)":
    20), its weight, launcher, book and description. Siege ammunition is left out."""
    out, skipped = [], []
    for name, c in rows('Ammo'):
        d = details(name)
        if not d['source'] or not find_notices(notices, d['source']):
            skipped.append(f"{name} ({d['source'] or 'no book'})")
            continue
        launcher = next((l for pat, l in LAUNCHERS if re.search(pat, name, re.I)), None)
        if not launcher or name in SIEGE_AMMO:
            skipped.append(f'{name} (siege or unknown launcher)')
            continue
        per = re.search(r'\((\d+)\)', name + ' ' + (c.get('Cost') or ''))
        out.append({'id': slug(re.sub(r'\s*\(\d+\)', '', name)), 'name': re.sub(r'\s*\(\d+\)', '', name), 'source': d['source'],
                    'launcher': launcher, 'per': int(per.group(1)) if per else 1,
                    'price_gp': price_gp(re.sub(r'\(\d+\)', '', c.get('Cost') or '')) or 0, 'weight_lbs': number(c.get('Weight')) if (c.get('Weight') or '').strip('—- ') else 0,
                    'damage': dice(c.get('Dmg (M)')), 'special': (c.get('Special') or '').strip('—- ') or '', 'description': d['description'], 'origin': ORIGIN})
    return out, skipped


def main():
    path = sys.argv[1]
    weapons = json.load(open(path, encoding='utf-8'))
    have = {k for w in weapons for k in keys(w['name'])}
    notices = load_notices()
    added, skipped = [], []
    for prof in ('Simple', 'Martial', 'Exotic'):
        for name, c in rows(prof):
            if keys(name) & have:
                continue
            d = details(name)
            group = CATEGORY.get(d['category'])
            if not group:  # ammunition and the like
                skipped.append(f"{name} ({d['category'] or 'no category'})")
                continue
            if not d['source'] or not find_notices(notices, d['source']):
                skipped.append(f"{name} ({d['source'] or 'no book'})")
                continue
            threat, mult = critical(c.get('Critical'))
            rng = re.match(r'(\d+) ft', c.get('Range', ''))
            special = [s.strip().lower() for s in c.get('Special', '').split(',') if s.strip().strip('—-')]
            m, s = dice(c.get('Dmg (M)')), dice(c.get('Dmg (S)'))
            added.append({
                'id': slug(name), 'name': name, 'source': d['source'],
                'category': f'{prof} Weapons', 'proficiency': d['proficiency'] or prof.lower(), 'group': group,
                'firearm': False, 'thrown': group != 'ranged' and bool(rng),
                'damage': {'t': sized(m, 0), 's': s, 'm': m, 'l': sized(m, 1)},
                'critical': c.get('Critical') or None, 'threat': threat, 'multiplier': mult,
                'range_ft': int(rng.group(1)) if rng else None, 'type': c.get('Type') or None, 'special': special,
                'price': c.get('Cost') or None, 'price_gp': price_gp(c.get('Cost')),
                'weight_lbs': number(c.get('Weight')),
                'finesse': group == 'light' or bool(re.search(r'Weapon Finesse', d['description'])),
                'description': d['description'], 'origin': ORIGIN,
            })
            have |= keys(name)
    # Fighter weapon groups (weapon training) for every weapon, PSRD ones too, from its AoN page ("Double; Monk"), as
    # the app names them ("Blades, heavy").
    aon_names = {}
    for prof in ('Simple', 'Martial', 'Exotic', 'Firearm'):
        for name, _ in rows(prof):
            for k in keys(name):
                aon_names.setdefault(k, name)
    core = core_groups(os.path.join(os.path.dirname(os.path.abspath(path)), 'classes.json'))
    for w in weapons + added:
        aon = next((aon_names[k] for k in keys(w['name']) if k in aon_names), None)
        groups = details(aon)['weapon_groups'] if aon else ''
        w['groups'] = [g.strip()[0].upper() + g.strip()[1:].lower() for g in groups.split(';') if g.strip()]
        # Not matched on AoN: firearms are the Firearms group; others by the Core Rulebook's lists (by name or alias).
        if not w['groups'] and w.get('firearm'):
            w['groups'] = ['Firearms']
        if not w['groups']:
            n = w['name'].lower()
            w['groups'] = core.get(GROUP_ALIASES.get(n, n), [])
    ids = {w['id'] for w in weapons}
    for w in added:
        if w['id'] in ids:
            w['id'] = f"{w['id']}-{slug(w['source'])}"
        ids.add(w['id'])
    order = ['Simple Weapons', 'Martial Weapons', 'Exotic Weapons', 'Firearms', 'Technological Weapons']
    out = sorted(weapons + added, key=lambda w: (order.index(w['category']), w['name'].lower()))
    json.dump(out, open(path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(added), 'weapons added', dict(Counter(w['category'] for w in added)), '; skipped:', skipped)
    # Ammunition, in its own file beside weapons.json.
    ammo, ammo_skipped = ammunition(notices)
    json.dump(ammo, open(os.path.join(os.path.dirname(os.path.abspath(path)), 'ammo.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(ammo), 'kinds of ammunition; skipped:', ammo_skipped)


if __name__ == '__main__':
    main()
