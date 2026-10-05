"""Build skills.json from PSRD-Data: what each skill does (Core Rulebook, chapter 4), as the SRD shows it.

Each record: { id, name, source, description, sections: [{ name, blocks }] } where a section is Check, Action, Try Again,
Special, Restriction, Untrained and so on, and its blocks are { text } paragraphs or { table: title, rows: [[cells]] }
(the first row is the header). Knowledge is one record for every field; Craft, Perform and Profession likewise.

Usage: python build_skills.py path/to/skills.json   (set PSRD to the PSRD-Data folder)
"""
import json, sys
from bs4 import BeautifulSoup
from common import ALL_BOOKS, iter_books, slug, text


def table_rows(html):
    """An HTML table -> its title (caption, else the first header cell) and rows of cell texts, header first."""
    soup = BeautifulSoup(html, 'html.parser')
    t = soup.find('table')
    if not t:
        return None, []
    rows = [[c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])] for tr in t.find_all('tr')]
    rows = [r for r in rows if any(r)]
    cap = t.find('caption')
    return (cap.get_text(' ', strip=True) if cap else None), rows


def blocks_of(node):
    """A section's body and everything under it, in order: paragraphs and tables."""
    out = []
    if node.get('body'):
        if '<table' in node['body'] and node.get('type') == 'table':
            title, rows = table_rows(node['body'])
            if rows:
                out.append({'table': (title or node.get('name') or '').replace('Table: ', ''), 'rows': rows})
        else:
            t = text(node['body'])
            if t:
                out.append({'text': t})
    for ch in node.get('children') or []:
        sub = blocks_of(ch)
        # A named subsection (not a table) becomes a run-in heading on its first paragraph.
        if ch.get('type') == 'section' and ch.get('name') and sub and 'text' in sub[0]:
            sub[0] = {'text': f"{ch['name']}: {sub[0]['text']}"}
        out.extend(sub)
    return out


def main():
    out = []
    for db, book, abbr, conn, rows in iter_books([b for b in ALL_BOOKS if b[1] == 'Core Rulebook']):
        for n in rows.values():
            if n.get('type') != 'skill':
                continue
            sections = []
            for ch in n.get('children') or []:
                b = blocks_of(ch)
                if b:
                    sections.append({'name': ch.get('name') or '', 'blocks': b})
            out.append({'id': slug(n['name']), 'name': n['name'], 'source': book,
                        'description': text(n.get('description') or ''), 'sections': sections})
    out.sort(key=lambda r: r['name'])
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'skills:', ', '.join(r['name'] for r in out))


if __name__ == '__main__':
    main()
