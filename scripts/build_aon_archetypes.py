"""Add the Paizo archetypes PSRD-Data lacks (books after 2015, Player Companions, the occult, unchained, vigilante
and shifter classes) to data/archetypes.json from the Archives of Nethys (aonprd.com). Run after build_archetypes.py.

Pages are downloaded once into a cache folder (../../aonprd-archetypes), pausing between requests. Each page has
the archetype's name, a "Source" line naming the book ("Occult Adventures pg. 88"), a description, and its features
as "<b>Name</b>: text" paragraphs. Only archetypes from a book whose OGL notice is known are kept (the notice then
goes into the license through build_license.py, as for the Foundry data).

Usage: python build_aon_archetypes.py path/to/archetypes.json [cache-folder]
"""
import html as htmllib, json, os, re, sys, time, urllib.parse, urllib.request
from collections import Counter
from bs4 import BeautifulSoup
from common import text, slug
from foundry import load_notices, find_notices
from build_archetypes import feature_record

ORIGIN = 'aonprd'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'aonprd-archetypes')
HEADERS = {'User-Agent': 'pf1e-builder personal character builder (archetype import)'}
DELAY = 0.7


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60).read().decode('utf-8', 'replace')


def cached(name, url):
    path = os.path.join(CACHE, re.sub(r'[^a-z0-9]+', '_', name.lower()) + '.html')
    if not os.path.exists(path):
        page = get(url)
        open(path, 'w', encoding='utf-8').write(f'<!-- {url} -->\n' + page)
        time.sleep(DELAY)
    return open(path, encoding='utf-8').read()


def parse_page(page):
    soup = BeautifulSoup(page, 'html.parser')
    span = soup.find('span', id='MainContent_DataListTypes_LabelName_0')
    if not span or not span.find('h1'):
        return None
    # "Wild Caller (ARG)": a book tag the site adds to tell same-named archetypes apart.
    name = re.sub(r'\s*\((?:[A-Z]{2,5}\d?)\)$', '', span.find('h1').get_text(' ', strip=True))
    span.find('h1').decompose()
    src = span.find('b', string=re.compile(r'^\s*Source\s*$'))
    book = ''
    if src:
        link = src.find_next('a')
        book = re.sub(r'\s+pg\.\s*\d+.*$', '', link.get_text(' ', strip=True)) if link else ''
        if link:
            link.decompose()
        src.decompose()
    # Paragraphs are separated by two <br/>s; a paragraph starting with a bold name begins a feature.
    chunks = re.split(r'(?:<br\s*/?>\s*){2,}', str(span))
    desc, feats = [], []
    for chunk in chunks:
        bit = BeautifulSoup(chunk, 'html.parser')
        words = bit.get_text(' ', strip=True)
        if not words:
            continue
        b = bit.find('b')
        if b and words.startswith(b.get_text(' ', strip=True)) and re.match(r'\s*:', words[len(b.get_text(' ', strip=True)):]):
            label = b.get_text(' ', strip=True)
            b.decompose()
            feats.append([label, [re.sub(r'^\s*:\s*', '', text(str(bit)))]])
        elif feats:
            feats[-1][1].append(text(str(bit)))  # "This ability replaces ..." is often a paragraph of its own
        else:
            desc.append(text(str(bit)).lstrip(', '))
    feats = [feature_record(label, '\n\n'.join(p for p in parts if p).strip()) for label, parts in feats]
    return {'name': name, 'book': book, 'description': '\n\n'.join(d for d in desc if d).strip(), 'features': feats}


def main():
    out_path = sys.argv[1]
    os.makedirs(CACHE, exist_ok=True)
    arch = [a for a in json.load(open(out_path, encoding='utf-8')) if a.get('origin') != ORIGIN]
    # Every class the app offers, by the name the Archives of Nethys uses ("Barbarian (Unchained)").
    classes = {c['name']: c['id'] for c in json.load(open(os.path.join(os.path.dirname(os.path.abspath(out_path)), 'classes.json'),
                                                          encoding='utf-8')) if c.get('category') not in ('prestige', 'npc')}
    have = {(a['class'], re.sub(r'[^a-z0-9]', '', a['name'].lower())) for a in arch}
    ids = {a['id'] for a in arch}
    notices = load_notices()
    added, skipped = [], Counter()
    for cname, cid in classes.items():
        index = cached(f'index {cname}', f'https://aonprd.com/Archetypes.aspx?Class={urllib.parse.quote(cname)}')
        links = sorted(set(htmllib.unescape(l) for l in re.findall(r'href="(ArchetypeDisplay\.aspx\?FixedName=[^"]+)"', index)))
        for link in links:
            fixed = link.split('FixedName=', 1)[1]
            url = 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=' + urllib.parse.quote(fixed)
            try:
                rec = parse_page(cached(fixed, url))
            except Exception as e:  # keep going; a rerun retries what's missing
                print('failed', fixed, e)
                skipped['download failed'] += 1
                continue
            if not rec or not rec['features']:
                skipped['unreadable'] += 1
                continue
            if not find_notices(notices, rec['book']):
                skipped[f"no notice: {rec['book']}"] += 1
                continue
            k = (cid, re.sub(r'[^a-z0-9]', '', rec['name'].lower()))
            if k in have:
                skipped['already have it'] += 1
                continue
            aid = f'{cid}-{slug(rec["name"])}'
            if aid in ids:
                aid = f'{aid}-{slug(rec["book"])}'
            ids.add(aid)
            have.add(k)
            out = {'id': aid, 'name': rec['name'], 'class': cid, 'source': rec['book'],
                   'description': rec['description'], 'features': rec['features'], 'origin': ORIGIN}
            arch.append(out)
            added.append(out)
    arch.sort(key=lambda a: (a['class'], a['name'].lower()))
    json.dump(arch, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(added)} archetypes added from the Archives of Nethys ({len(arch)} in all); skipped {dict(skipped)}')
    print(Counter(a['class'] for a in added).most_common(), Counter(a['source'] for a in added).most_common())


if __name__ == '__main__':
    main()
