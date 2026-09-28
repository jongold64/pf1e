"""Add Paizo traits that PSRD-Data lacks (books after 2015 and Player Companions) to data/traits.json, from the
d20pfsrd.com trait pages downloaded by fetch_d20pfsrd_feats.py (cache ../../d20pfsrd-traits). Run after build_traits.py.

Each page has the trait's name, its text, and a "Section 15" box naming the book. Only traits whose notice is a Paizo
book are used; the category (and race or region) comes from the page's place on the site
("/traits/race-traits/elf-race-traits/..."). Notices are added to scripts/d20_feat_notices.json for build_license.py.

Usage: python build_d20_traits.py path/to/traits.json [cache-folder]
"""
import json, os, re, sys
from collections import Counter
from bs4 import BeautifulSoup
from common import text, slug
from build_d20_feats import book_name, take_notices
from build_traits import effects_of, skill_names

ORIGIN = 'd20pfsrd'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-traits')
NOTICES = os.path.join(os.path.dirname(__file__), 'd20_feat_notices.json')
CATEGORIES = {'combat-traits': 'Combat', 'faith-traits': 'Faith', 'magic-traits': 'Magic', 'social-traits': 'Social',
              'race-traits': 'Race', 'regional-traits': 'Regional', 'religion-traits': 'Religion', 'campaign-traits': 'Campaign',
              'equipment-traits': 'Equipment', 'family-traits': 'Family', 'mount-traits': 'Mount', 'exemplar-traits': 'Exemplar'}


def words(slug_text):
    return ' '.join(w.capitalize() for w in slug_text.replace('-traits', '').replace('-trait', '').split('-') if w)


def parse_page(html):
    soup = BeautifulSoup(html, 'html.parser')
    art = soup.find(id='article-content')
    if not art or not art.find('h1'):
        return None
    url = (re.match(r'<!-- (\S+) -->', html) or [None, ''])[1]
    for s in art.find_all(['script', 'style']):
        s.decompose()
    notices = take_notices(art)
    name = re.sub(r'\s*\((?:[^)]*traits?)\)\s*$', '', art.find('h1').get_text(' ', strip=True).replace('’', "'"), flags=re.I)
    art.find('h1').decompose()
    for b in art.find_all('div', class_='breadcrumbs'):
        b.decompose()
    body = text(str(art)).strip()
    # "Source: Pathfinder Player Companion: ..." lines repeat the notice; the category line is kept by the page path.
    body = re.sub(r'(?im)^\s*(source|category|requirements?)\s*:.*$', '', body).strip()
    body = re.sub(r'^(Benefits?|Effect)\s*:\s*', '', body, flags=re.I)
    parts = url.split('/traits/')[1].strip('/').split('/') if '/traits/' in url else []
    category = CATEGORIES.get(parts[0] if parts else '', 'Other')
    requirement = words(parts[1]) if len(parts) > 2 and category in ('Race', 'Regional', 'Religion', 'Campaign') else None
    # "Tunnel Fighter (Dwarf)", "Fire-Tongued (Kobold, Red-Scaled)": the bracket is the race or other requirement.
    m = re.match(r'^(.*?)\s*\(([^)]*)\)$', name.strip())
    if m:
        name, requirement = m.group(1), requirement or m.group(2)
    return {'name': name.strip(), 'category': category, 'requirement': requirement, 'text': re.sub(r'\n{3,}', '\n\n', body),
            'notices': notices}


def main():
    out_path = sys.argv[1]
    traits = [t for t in json.load(open(out_path, encoding='utf-8')) if t.get('origin') != ORIGIN]
    key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
    have = {key(t['name']) for t in traits}
    skills = skill_names(os.path.dirname(os.path.abspath(out_path)))
    notices = json.load(open(NOTICES, encoding='utf-8')) if os.path.exists(NOTICES) else {}
    ids = {t['id'] for t in traits}
    added, skipped = [], Counter()
    for name in sorted(os.listdir(CACHE)):
        rec = parse_page(open(os.path.join(CACHE, name), encoding='utf-8').read())
        if not rec or not rec['text']:
            skipped['unreadable'] += 1
            continue
        # Index pages that only list links to other traits ("AP 49-54 JR": Subpages ...).
        if rec['text'].startswith('Subpages') or len(rec['text']) < 40:
            skipped['index page'] += 1
            continue
        paizo = [n for n in rec['notices'] if re.search(r'Paizo,? (?:Publishing|Inc)', n)]  # not "Paizo Fans United"
        if not paizo:
            skipped['no Paizo notice'] += 1
            continue
        if key(rec['name']) in have:
            skipped['duplicate'] += 1
            continue
        source = book_name(paizo[-1])
        for n in rec['notices']:
            notices.setdefault(source, [])
            if n not in notices[source]:
                notices[source].append(n)
        tid = slug(rec['name']) if slug(rec['name']) not in ids else f"{slug(rec['name'])}-{slug(source)}"
        ids.add(tid)
        out = {'id': tid, 'name': rec['name'], 'source': source, 'category': rec['category'],
               **({'requirement': rec['requirement']} if rec['requirement'] else {}), 'text': rec['text'], 'origin': ORIGIN}
        eff = effects_of(rec['text'], skills)
        if eff:
            out['effects'] = eff
        traits.append(out)
        have.add(key(rec['name']))
        added.append(out)
    traits.sort(key=lambda t: t['name'].lower())
    json.dump(traits, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    json.dump(notices, open(NOTICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(added)} traits added from d20pfsrd ({len(traits)} in all); skipped {dict(skipped)}')
    print(dict(Counter(t['category'] for t in added)))
    print(sum(1 for t in added if t.get('effects')), 'of them with numeric effects')


if __name__ == '__main__':
    main()
