"""Collect OGL Section 15 notices for the Paizo books in the Foundry data into scripts/ogl_notices.json
({book title as Foundry names it: [notice, ...]}). build_license.py adds the ones for books the data uses, and
the Foundry builders leave out content from books with no notice here (or in PSRD-Data's license).

The notices come from the Archives of Nethys license page, which lists each Paizo book's Section 15:
    Invoke-WebRequest https://www.aonprd.com/Licenses.aspx -OutFile aon-licenses.html
    python extract_ogl_notices.py aon-licenses.html
MANUAL_NOTICES holds ones copied from a book's own Section 15 where the page doesn't list the book.
Only needs re-running when content from new books is added. Prints Paizo books it couldn't find.
"""
import html, json, os, re, sys
from bs4 import BeautifulSoup
from foundry import load_sources

OUT = os.path.join(os.path.dirname(__file__), 'ogl_notices.json')

# Copied from the book's own Section 15 (the Archives of Nethys page doesn't list these books).
MANUAL_NOTICES = {}

norm = lambda s: re.sub(r'[^a-z0-9]', '', html.unescape(s).lower().replace('&', 'and'))


def page_sections(page):
    soup = BeautifulSoup(open(page, encoding='utf-8').read(), 'html.parser')
    sections = {}
    for h in soup.find_all('h3', class_='title'):
        parts, node = [], h.next_sibling
        while node is not None and getattr(node, 'name', None) != 'h3':
            parts.append(str(node))
            node = node.next_sibling
        notices = [BeautifulSoup(p, 'html.parser').get_text(' ', strip=True) for p in re.split(r'<br\s*/?>', ''.join(parts))]
        notices = [re.sub(r'\s+', ' ', n).replace(' ,', ',').replace(' .', '.').strip() for n in notices if '©' in n]
        if notices:
            sections[norm(h.get_text())] = notices
    return sections


def keys_for(title):
    """The names a book may go by on the page: 'Wrath of the Righteous #2: Sword of Valor' is listed as
    'Pathfinder #74: Sword of Valor', 'Curse of the Crimson Throne' as '... (PFRPG)', 'Pathfinder Chronicles: X' as 'X'."""
    out = [norm(title)]
    if ':' in title:
        out.append(norm(title.split(':', 1)[1]))
    out.append(norm(re.sub(r'^(The|Pathfinder Chronicles:)\s+', '', title)))
    return out


def lookup(sections, title):
    for key in keys_for(title):
        if key in sections:
            return sections[key]
        for k, v in sections.items():
            # "pathfinder74swordofvalor" ends with "swordofvalor"; "curseofthecrimsonthronepfrpg" starts with the title
            if k.endswith(key) or (k.startswith(key) and k[len(key):] in ('pfrpg', 'pathfinderrpg')):
                return v
    return None


def main():
    sections = page_sections(sys.argv[1])
    books = sorted({b['name'] for code, b in load_sources().items()
                    if code.startswith('PZO') and b.get('publisher', 'Paizo') == 'Paizo'})
    result, missing = {}, []
    for book in books:
        notices = MANUAL_NOTICES.get(book) or lookup(sections, book)
        if notices:
            result[book] = notices
        else:
            missing.append(book)
    json.dump(result, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(result)} of {len(books)} Paizo books have notices; written to {OUT}')
    if missing:
        print(f'{len(missing)} without:', '; '.join(missing))


if __name__ == '__main__':
    main()
