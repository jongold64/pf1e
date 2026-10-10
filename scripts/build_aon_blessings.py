"""Write blessings.json: the warpriest's blessings (Advanced Class Guide and later), each with its minor (1st level) and
major (10th level) power, from the Archives of Nethys blessing pages (cached in ../../aonprd-classes/lists). Only
blessings from a book whose OGL notice is known are written.

Record: { id, name, source, deities (the page's text), minor: { name, text }, major: { name, text }, origin }

Usage: python build_aon_blessings.py path/to/blessings.json
"""
import html, json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book


def main():
    notices = load_notices()
    index = aon_page('WarpriestBlessings', 'https://aonprd.com/WarpriestBlessings.aspx')
    names = sorted(set(html.unescape(x) for x in re.findall(r'href="WarpriestBlessingDisplay\.aspx\?ItemName=([^"]+)"', index)))
    out, skipped = [], {}
    for name in names:
        text = page_text(aon_page('Blessing_' + re.sub(r'[^A-Za-z0-9]+', '_', name),
                                  'https://aonprd.com/WarpriestBlessingDisplay.aspx?ItemName=' + urllib.parse.quote(name, safe='')))
        m = re.search(rf'\n{re.escape(name)} BlessingSource (.*?) pg\.[^\n]*\n(.*?)(?:\nSite Owner|\Z)', text, re.S)
        if not m:
            print(f'  {name}: not found')
            continue
        book, body = aon_book(m.group(1).strip()), m.group(2)
        if not find_notices(notices, book):
            skipped[book] = skipped.get(book, 0) + 1
            continue
        deities = (re.search(r'Deities:\s*([^\n]*)', body) or [None, ''])[1].strip().rstrip('.')
        power = lambda kind: (lambda p: {'name': p.group(1).strip(), 'text': p.group(2).strip()} if p else None)(
            re.search(rf'\n([^\n(]+?)\s*\({kind}\):\s*(.*?)(?=\n[^\n(]+?\s*\((?:minor|major)\):|\Z)', body, re.S))
        out.append({'id': slug(name), 'name': name, 'source': book, 'deities': deities,
                    'minor': power('minor'), 'major': power('major'), 'origin': 'aonprd'})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'blessings.json: {len(out)} blessings')
    if skipped:
        print('  left out (no OGL notice): ' + ', '.join(f'{b} ({n})' for b, n in skipped.items()))


if __name__ == '__main__':
    main()
