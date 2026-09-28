"""Add Paizo feats that PSRD-Data lacks (books after 2015 and others) to data/feats.json, from the d20pfsrd.com
feat pages downloaded by fetch_d20pfsrd_feats.py (run after build_feats.py).

Each d20pfsrd feat page has the name (with its type in brackets, "Power Attack (Combat)"), a one-line description,
"Prerequisite(s)", "Benefit(s)", "Normal" and "Special" paragraphs, and a "Section 15: Copyright Notice" box naming
the book. Only feats whose notice is a Paizo book are used (d20pfsrd also hosts third-party material); the notices are
saved to scripts/d20_feat_notices.json for build_license.py. Mythic feats are left out (the app doesn't use them).

Usage: python build_d20_feats.py path/to/feats.json [cache-folder]   (cache default ../../d20pfsrd-feats)
"""
import json, os, re, sys
from bs4 import BeautifulSoup
from common import text, slug
from build_feats import parse_prereqs

ORIGIN = 'd20pfsrd'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-feats')
NOTICES = os.path.join(os.path.dirname(__file__), 'd20_feat_notices.json')
TYPE_NAMES = ['Combat', 'Critical', 'Teamwork', 'Metamagic', 'Item Creation', 'Style', 'Grit', 'Panache', 'Performance',
              'Story', 'Achievement', 'Betrayal', 'Called Shot', 'Monster', 'Stare', 'Conduit', 'Damnation', 'Faction',
              'Local', 'Weapon Mastery', 'Armor Mastery', 'Shield Mastery', 'Item Mastery', 'Caravan', 'Familiar',
              'Animal Companion', 'Blood Hex', 'Hero Point', 'Targeting', 'Meditation', 'Esoteric', 'Mythic']
# Types from the URL's category when the name doesn't say ("/feats/combat-feats/...").
CATEGORY_TYPES = {'combat-feats': 'Combat', 'metamagic-feats': 'Metamagic', 'teamwork-feats': 'Teamwork',
                  'item-creation-feats': 'Item Creation', 'story-feats': 'Story', 'achievement-feats': 'Achievement',
                  'betrayal-feats': 'Betrayal', 'conduit-feats': 'Conduit', 'damnation-feats': 'Damnation',
                  'grit-feats': 'Grit', 'panache-feats': 'Panache', 'stare-feats': 'Stare', 'monster-feats': 'Monster',
                  'weapon-mastery-feats': 'Weapon Mastery', 'armor-mastery-feats': 'Armor Mastery',
                  'shield-mastery-feats': 'Shield Mastery', 'item-mastery-feats': 'Item Mastery', 'local-feats': 'Local',
                  'caravan-feats': 'Caravan', 'familiar-feats': 'Familiar', 'faction-feats': 'Faction',
                  'animal-companion-feats': 'Animal Companion'}
SECTIONS = {'prerequisite': 'prerequisites_text', 'prerequisites': 'prerequisites_text', 'benefit': 'benefit',
            'benefits': 'benefit', 'normal': 'normal', 'special': 'special', 'goal': 'goal', 'note': 'note',
            'completion benefit': 'completion_benefit', 'completion benefits': 'completion_benefit'}
BOOK_PREFIXES = r'^(Pathfinder (Roleplaying Game|RPG|Player Companion|Companion|Campaign Setting|Chronicles|Module|Adventure Path( #\d+)?|Society( Roleplaying Guild)?)[:,]?\s+)'
# Feats for other things than a character (a Jade Regent caravan).
SKIP_TYPES = {'Mythic', 'Caravan'}


def book_name(notice):
    """'Pathfinder Roleplaying Game Occult Adventures © 2015, Paizo Inc.; ...' -> 'Occult Adventures'."""
    title = re.split(r'\s*(?:©|\. Copyright|, Copyright| Copyright)', notice.replace('’', "'"))[0].strip().rstrip('.')
    for _ in range(2):
        title = re.sub(BOOK_PREFIXES, '', title).strip()
    return title


def parse_page(html):
    soup = BeautifulSoup(html, 'html.parser')
    art = soup.find(id='article-content')
    if not art or not art.find('h1'):
        return None
    url = (re.match(r'<!-- (\S+) -->', html) or [None, ''])[1]
    for s in art.find_all(['script', 'style']):
        s.decompose()
    # The notices are paragraphs in the "section15" box, or (older pages) paragraphs right after it.
    box = art.find('div', class_='section15')
    notices = []
    if box:
        paras = box.find_all('p') + [p for p in box.find_next_siblings('p')]
        for p in paras:
            n = re.sub(r'\s+', ' ', p.get_text(' ', strip=True)).replace(' ,', ',').replace(' .', '.').replace(' ;', ';')
            if re.search(r'©|Copyright \d{4}', n) and not n.startswith('Section 15'):
                notices.append(n.replace('’', "'"))
            if p.parent is not box:
                p.decompose()
        box.decompose()
    title = art.find('h1').get_text(' ', strip=True).replace('’', "'")
    # A trailing bracket holds the feat's types and, for racial feats, its race: "Blundering Defense (Combat, Halfling)".
    m = re.match(r'^(.*?)\s*\(([^)]*)\)$', title)
    name, types = title, []
    if m:
        name = m.group(1)
        types = [x for t in re.split(r'[,/]\s*', m.group(2)) for x in TYPE_NAMES if x.lower() == t.strip().lower()]
    category = (re.search(r'/feats/([^/]+)/', url) or [None, ''])[1]
    if not types and category in CATEGORY_TYPES:
        types = [CATEGORY_TYPES[category]]
    desc = art.find('p', class_='description')
    rec = {'name': name.strip(), 'types': types or ['General'],
           'description': text(str(desc)) if desc else '', 'notices': notices, 'url': url}
    if desc:
        desc.decompose()
    art.find('h1').decompose()
    for b in art.find_all('div', class_='breadcrumbs'):
        b.decompose()
    # Walk the paragraphs, lists and tables: a bold label starts a section; anything else continues the current one.
    current = None
    for el in art.find_all(['p', 'ul', 'ol', 'table', 'h2', 'h3', 'h4'], recursive=False) or art.find_all(['p', 'ul', 'ol', 'table']):
        label = el.find(['b', 'strong']) if el.name == 'p' else None
        key = label.get_text(' ', strip=True).rstrip(':').strip().lower() if label else ''
        key = re.sub(r'\(s\)$', 's', key)
        if key in SECTIONS or key.rstrip('s') in SECTIONS:
            current = SECTIONS.get(key) or SECTIONS[key.rstrip('s')]
            label.extract()
            body = text(str(el)).lstrip(':').strip()
            rec[current] = (rec.get(current, '') + '\n\n' + body).strip() if current in rec else body
        elif current and current != 'prerequisites_text':
            body = text(str(el)).strip()
            if body:
                rec[current] = rec[current] + '\n\n' + body
    return rec


def main():
    out_path = sys.argv[1]
    feats = [f for f in json.load(open(out_path, encoding='utf-8')) if f.get('origin') != ORIGIN]
    key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
    have = {key(f['name']) for f in feats}
    pages = sorted(os.listdir(CACHE))
    new, notices, skipped = {}, {}, {'no Paizo notice': 0, 'mythic or caravan': 0, 'duplicate': 0, 'unreadable': 0, 'no benefit': 0}
    for name in pages:
        rec = parse_page(open(os.path.join(CACHE, name), encoding='utf-8').read())
        if not rec:
            skipped['unreadable'] += 1
            continue
        paizo = [n for n in rec['notices'] if 'Paizo' in n]
        if not paizo:
            skipped['no Paizo notice'] += 1
            continue
        if SKIP_TYPES & set(rec['types']) or 'Mythic' in rec['name']:
            skipped['mythic or caravan'] += 1
            continue
        if key(rec['name']) in have or key(rec['name']) in new:
            skipped['duplicate'] += 1
            continue
        if not rec.get('benefit') and not rec.get('goal'):
            skipped['no benefit'] += 1
            continue
        # The feat's own book: the last Paizo notice (pages list reprinted material first).
        rec['source'] = book_name(paizo[-1])
        notices.setdefault(rec['source'], [])
        for n in rec['notices']:
            if n not in notices[rec['source']]:
                notices[rec['source']].append(n)
        new[key(rec['name'])] = rec
    names = {f['name'].lower(): f['name'] for f in feats if 'Mythic' not in f.get('types', [])}
    names.update({r['name'].lower(): r['name'] for r in new.values()})
    ids = {f['id'] for f in feats}
    order = ['id', 'name', 'source', 'types', 'description', 'prerequisites_text', 'prerequisites', 'benefit', 'normal',
             'special', 'goal', 'completion_benefit', 'note', 'origin']
    for r in new.values():
        r['id'] = slug(r['name']) if slug(r['name']) not in ids else f"{slug(r['name'])}-{slug(r['source'])}"
        ids.add(r['id'])
        r['prerequisites'] = parse_prereqs(r['prerequisites_text'], names) if r.get('prerequisites_text') else []
        r['origin'] = ORIGIN
        feats.append({k: r[k] for k in order if k in r and r[k] not in (None, '')})
    feats.sort(key=lambda f: (f['name'].lower(), f['id']))
    json.dump(feats, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    json.dump(notices, open(NOTICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(new)} feats added from d20pfsrd ({len(feats)} in all) from {len(pages)} pages; skipped: {skipped}')
    from collections import Counter
    for b, n in Counter(r['source'] for r in new.values()).most_common(25):
        print(f'  {n:5} {b}')


if __name__ == '__main__':
    main()
