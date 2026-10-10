"""Write eidolons.json: the eidolon's base statistics by summoner level (core summoner and unchained summoner) and every
evolution with its point cost, from the Archives of Nethys eidolon and evolution pages (cached in
../../aonprd-classes/lists). Base forms and unchained subtypes are in class-paths.json. Only evolutions from a book whose
OGL notice is known are written.

{ "tables": { "summoner": [row], "summoner-unchained": [row] },
  "evolutions": { "summoner": [evolution], "summoner-unchained": [evolution] } }
row: { level, hd, bab, good, bad, skills, feats, armor, strDex, pool, maxAttacks, special: [names] }
evolution: { id, name, type ('Ex'/'Su'/'Sp' or ''), cost, source, text, requirements }

Usage: python build_aon_eidolon.py path/to/eidolons.json
"""
import html, json, re, sys
from bs4 import BeautifulSoup
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book

PAGES = {'summoner': ('Class_Eidolon', 'ClassDisplay.aspx?ItemName=Eidolon', 'Evolutions', 'SummonerEvolutions.aspx'),
         'summoner-unchained': ('Class_EidolonUnchained', 'ClassDisplay.aspx?ItemName=Eidolon%20(Unchained)', 'EvolutionsUC', 'SummonerUCEvolutions.aspx')}


def num(s):
    m = re.search(r'[-+]?\d+', s or '')
    return int(m.group(0)) if m else 0


def table(page):
    """The Base Statistics table: one row per summoner level."""
    soup = BeautifulSoup(page, 'html.parser')
    for t in soup.find_all('table'):
        head = [c.get_text(' ', strip=True) for c in t.find('tr').find_all(['td', 'th'])]
        if 'Evolution Pool' not in head:
            continue
        rows = []
        for tr in t.find_all('tr')[1:]:
            c = [x.get_text(' ', strip=True) for x in tr.find_all(['td', 'th'])]
            if len(c) < 11 or not num(c[0]):
                continue
            rows.append({'level': num(c[0]), 'hd': num(c[1]), 'bab': num(c[2]), 'good': num(c[3]), 'bad': num(c[4]),
                         'skills': num(c[5]), 'feats': num(c[6]), 'armor': num(c[7]), 'strDex': num(c[8]), 'pool': num(c[9]),
                         'maxAttacks': num(c[10]), 'special': [s.strip() for s in c[11].split(',') if s.strip() not in ('', '—')] if len(c) > 11 else []})
        return rows
    raise SystemExit('no Base Statistics table')


def evolutions(page, notices):
    """Every evolution: the "N-Point Evolutions" sections, each entry "Name (Ex) (Book pg. N): text"."""
    text = page_text(page)
    out = []
    for cost, body in re.findall(r'\n(\d+)-Point Evolutions\n(.*?)(?=\n\d+-Point Evolutions\n|\Z)', text, re.S):
        for m in re.finditer(r'(?:^|\n)([A-Z][^\n:(]*?)(?:\s*\((Ex|Su|Sp)\))?\s*\(([^)]*?)pg\.[^)]*\):\s*(.*?)(?=\n[A-Z][^\n:(]*?(?:\s*\((?:Ex|Su|Sp)\))?\s*\([^)]*?pg\.[^)]*\):|\Z)', body, re.S):
            name, typ, book, desc = m.group(1).strip(), m.group(2) or '', aon_book(m.group(3).strip()), m.group(4).strip()
            if not find_notices(notices, book):
                continue
            desc = desc.split('\nSite Owner')[0].strip()
            req = re.search(r'Requirements?:\s*([^\n]*)', desc)
            out.append({'id': slug(name), 'name': name, 'type': typ, 'cost': int(cost), 'source': book,
                        'text': desc, 'requirements': req.group(1).strip() if req else '', 'origin': 'aonprd'})
    return out


def main():
    notices = load_notices()
    data = {'tables': {}, 'evolutions': {}}
    for cls, (tname, turl, ename, eurl) in PAGES.items():
        data['tables'][cls] = table(aon_page(tname, 'https://aonprd.com/' + turl))
        data['evolutions'][cls] = evolutions(aon_page(ename, 'https://aonprd.com/' + eurl), notices)
    json.dump(data, open(sys.argv[1], 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print('eidolons.json: ' + ', '.join(f"{c}: {len(data['tables'][c])} levels, {len(data['evolutions'][c])} evolutions" for c in PAGES))


if __name__ == '__main__':
    main()
