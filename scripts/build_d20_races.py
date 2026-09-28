"""Add alternate racial traits and favored class options to the races from later Paizo books (the ones built from the
Foundry data, which has neither), from d20pfsrd.com race pages cached by fetch_d20pfsrd_feats.py
(python fetch_d20pfsrd_feats.py ../../d20pfsrd-races races). Run after build_foundry_races.py.

Each race page has "Alternate Racial Traits" and "Favored Class Options" sections of "<b>Name</b>: text" entries.
Third-party material is left out: sections headed "3rd Party ..." and entries tagged with a publisher link
("[JBE:BoHR:AFCO]"). The page's Paizo Section 15 notices go to scripts/d20_feat_notices.json, and the race lists
those books in `d20_sources` so build_license.py includes them.

Usage: python build_d20_races.py path/to/races.json [cache-folder]
"""
import json, os, re, sys
from bs4 import BeautifulSoup
from common import text
from build_d20_feats import book_name, fix_notice

CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-races')
NOTICES = os.path.join(os.path.dirname(__file__), 'd20_feat_notices.json')
# Race id -> the end of its d20pfsrd page name (the cache file name). Being of Ib and the reborn samsaran have no page.
PAGES = {
    'adaro': 'adaros-32-rp', 'aphorite': 'race-points-unknown_aphorite', 'aquatic-elf': 'aquatic-elves',
    'cecaelia': 'cecaelia', 'duskwalker': 'race-points-unknown_duskwalker', 'ganzi': 'ganzi', 'ghoran': 'ghoran-19-rp',
    'gnoll': 'gnoll-6-rp', 'grindylow': 'grindylows-22-rp', 'kuru': 'kuru-rp', 'lashunta-male': 'lashunta-11-rp',
    'lashunta-female': 'lashunta-11-rp', 'lizardfolk': 'lizardfolk-8-rp', 'locathah': 'locathah', 'ogre': 'ogre-23-rp',
    'sahuagin': 'sahuagin-22-rp', 'syrinx': 'syrinx-16-rp', 'triaxian': 'triaxian-10-rp', 'triton': 'triton-11-rp',
    'vine-leshy': 'vine-leshy',
}
SECTIONS = {'alternate racial traits': 'alternate_traits', 'favored class options': 'favored_class_options'}


def entries_after(heading):
    """The "<b>Name</b>: text" entries between a heading and the next heading of the same or higher level."""
    level = int(heading.name[1])
    out = []
    for el in heading.find_all_next():
        if re.fullmatch(r'h[1-6]', el.name or '') and int(el.name[1]) <= level:
            break
        if el.name not in ('p', 'li') or el.find_parent('li') or not el.find(['b', 'strong']):
            continue
        b = el.find(['b', 'strong'])
        if el.get_text(strip=True).find(b.get_text(strip=True)) != 0:
            continue  # the bold text isn't the entry's name (a term in the middle of a sentence)
        if any(re.fullmatch(r'\[.*\]', s.get_text(strip=True)) for s in el.find_all('sup')):
            continue  # a third-party publisher's tag
        name = b.get_text(' ', strip=True).rstrip(':').strip()
        b.decompose()
        body = re.sub(r'^\s*:\s*', '', text(str(el)).strip())
        if name and body:
            out.append((name, body))
    return out


def parse_page(html):
    art = BeautifulSoup(html, 'html.parser').find(id='article-content')
    if not art:
        return None
    notices = []
    for box in art.find_all('div', class_='section15'):
        for p in box.find_all('p') + list(box.find_next_siblings('p')):
            n = re.sub(r'\s+', ' ', p.get_text(' ', strip=True)).replace(' ,', ',').replace(' .', '.')
            if re.search(r'©|Copyright \d{4}', n) and not n.startswith('Section 15'):
                notices.append(fix_notice(n))
    found = {}
    for h in art.find_all(re.compile(r'^h[2-5]$')):
        title = h.get_text(' ', strip=True).lower()
        if title in SECTIONS and SECTIONS[title] not in found:
            found[SECTIONS[title]] = entries_after(h)
    return found, notices


def main():
    out_path = sys.argv[1]
    races = json.load(open(out_path, encoding='utf-8'))
    notices = json.load(open(NOTICES, encoding='utf-8')) if os.path.exists(NOTICES) else {}
    files = os.listdir(CACHE)
    for r in races:
        if r['id'] not in PAGES or r.get('alternate_traits') or r.get('favored_class_options'):
            continue
        page = [f for f in files if f.endswith(PAGES[r['id']] + '.html')]
        if len(page) != 1:
            print('no page for', r['id'], page)
            continue
        found, page_notices = parse_page(open(os.path.join(CACHE, page[0]), encoding='utf-8').read())
        paizo = [n for n in page_notices if re.search(r'Paizo,? (?:Publishing|Inc)', n)]
        if not paizo:
            print('no Paizo notice for', r['id'])
            continue
        alts = [{'name': n, 'text': t} for n, t in found.get('alternate_traits', [])]
        fcos = [{'class': n, 'text': t} for n, t in found.get('favored_class_options', [])]
        if not alts and not fcos:
            continue
        r['alternate_traits'], r['favored_class_options'] = alts, fcos
        books = sorted({book_name(n) for n in paizo})
        r['d20_sources'] = books
        for n in paizo:
            notices.setdefault(book_name(n), [])
            if n not in notices[book_name(n)]:
                notices[book_name(n)].append(n)
        print(f"{r['id']}: {len(alts)} alternate traits, {len(fcos)} favored class options")
    json.dump(races, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    json.dump(notices, open(NOTICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
