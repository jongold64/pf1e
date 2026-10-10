"""Write deities.json: Pathfinder deities with what a cleric, warpriest or inquisitor needs (alignment, domains,
subdomains, favored weapon), from the Archives of Nethys deity pages (cached in ../../aonprd-classes/lists; the first
run reads about 460 pages). Only deities from a book whose OGL notice is known are written.

Record: { id, name, title, source, alignment, pantheon, concerns, domains: [names], subdomains: [names], weapon, symbol,
          origin }. A subdomain listed with its domain ("Archon (Good)") keeps it; "*" marks (needing a trait) are dropped.

Usage: python build_aon_deities.py path/to/deities.json
"""
import html, json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book


def field(text, label):
    m = re.search(rf'\n{label} ([^\n]*)', text)
    return m.group(1).strip() if m else ''


def main():
    notices = load_notices()
    index = aon_page('DeitiesByGroup', 'https://aonprd.com/DeitiesByGroup.aspx')
    names = sorted(set(html.unescape(x) for x in re.findall(r'href="DeityDisplay\.aspx\?ItemName=([^"]+)"', index)))
    out, skipped = [], {}
    for name in names:
        page = aon_page('Deity_' + re.sub(r'[^A-Za-z0-9]+', '_', name), 'https://aonprd.com/DeityDisplay.aspx?ItemName=' + urllib.parse.quote(name, safe=''))
        text = page_text(page)
        m = re.search(rf'\n{re.escape(name)}(.*?)Source (.*?) pg\.', text)
        if not m:
            continue
        book = aon_book(m.group(2).strip())
        if not find_notices(notices, book):
            skipped[book] = skipped.get(book, 0) + 1
            continue
        split = lambda s: [x.strip().rstrip('*').strip() for x in re.split(r',\s*', s) if x.strip() and x.strip() not in ('—', 'none', 'None')]
        out.append({
            'id': slug(name), 'name': name, 'title': m.group(1).strip(), 'source': book,
            'alignment': field(text, 'Pathfinder Wiki [^\n]*?Alignment') or (re.search(r'Alignment ([A-Z]{1,2})\b', text) or [None, ''])[1],
            'pantheon': field(text, 'Pantheon'), 'concerns': field(text, 'Areas of Concern'),
            'domains': split(field(text, 'Domains')), 'subdomains': split(field(text, 'Subdomains')),
            'weapon': field(text, 'Favored Weapon'), 'symbol': field(text, 'Symbol'), 'origin': 'aonprd',
        })
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'deities.json: {len(out)} deities')
    if skipped:
        print('  left out (no OGL notice): ' + ', '.join(f'{b} ({n})' for b, n in sorted(skipped.items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    main()
