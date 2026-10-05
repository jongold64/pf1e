"""Build mysteries.json: the oracle mysteries, from the Archives of Nethys mystery pages (cached in
../../aonprd-classes/lists, downloaded once). Each page names its book ("Source Advanced Player's Guide pg. 47"),
deities, class skills, bonus spells, the mystery's revelations ("Name (Su): text", all from that book) and its final
revelation. Only mysteries from a book whose OGL notice is known are kept. build_foundry_talents.py reads the
revelations from here too (mystery_pages()).

Each record: { id, name, source, deities, class_skills, bonus_spells, revelations: [names], final_revelation, origin }

Usage: python build_aon_mysteries.py path/to/mysteries.json
"""
import json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book

ORIGIN = 'aonprd'
REVELATION = re.compile(r"(?:^|\n)([A-Z][A-Za-z'’ ,\-]{2,50}?)(?: \((?:Su|Ex|Sp)\))?(?: \(\s*([^()]{3,80}?) pg\. ?\d+\s*\))?\s*:\s*")


def mystery_names():
    page = aon_page('OracleMysteries', 'https://aonprd.com/OracleMysteries.aspx')
    return sorted({n.replace('&#39;', "'") for n in re.findall(r'MysteryDisplay\.aspx\?ItemName=([^"&]+)', page)})


def mystery_pages():
    """[{ name, source, deities, class_skills, bonus_spells, revelations: [(name, book, text)], final_revelation }]."""
    out = []
    for name in mystery_names():
        url = 'https://aonprd.com/MysteryDisplay.aspx?ItemName=' + urllib.parse.quote(name)
        text = page_text(aon_page('Mystery_' + re.sub(r'[^A-Za-z_]', '', name.replace(' ', '_')), url))
        src = re.search(re.escape(name) + r'\s*Source (.+?) pg\.', text)
        field = lambda label: (re.search(r'\n' + label + r':\s*(.+)', text) or [None, ''])[1].strip()
        body = text.split('\nRevelations:', 1)[-1]
        body, _, final = body.partition('\nFinal Revelation:')
        body = body.split('\n', 1)[-1]  # "An oracle with the X mystery can choose from..."
        ms = list(REVELATION.finditer(body))
        revs = [(m.group(1).strip(), aon_book(m.group(2)) if m.group(2) else None,
                 body[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(body)].strip()) for i, m in enumerate(ms)]
        out.append({'name': name, 'source': aon_book(src.group(1)) if src else '', 'deities': field('Deities').rstrip('.'),
                    'class_skills': field('Class Skills'), 'bonus_spells': field('Bonus Spells'),
                    'revelations': revs, 'final_revelation': final.strip().split('\n\n')[0].strip()})
    return out


def main():
    notices = load_notices()
    out, skipped = [], []
    for m in mystery_pages():
        if not m['source'] or not find_notices(notices, m['source']):
            skipped.append(f"{m['name']} ({m['source'] or 'no book'})")
            continue
        out.append({'id': slug(m['name']), 'name': m['name'], 'source': m['source'], 'deities': m['deities'],
                    'class_skills': m['class_skills'], 'bonus_spells': m['bonus_spells'],
                    'revelations': [r[0] for r in m['revelations']], 'final_revelation': m['final_revelation'], 'origin': ORIGIN})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'mysteries; skipped:', skipped)


if __name__ == '__main__':
    main()
