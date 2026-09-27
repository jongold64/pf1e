"""Shared helpers for converting PSRD-Data SQLite books into clean JSON."""
import re, html
from bs4 import BeautifulSoup
from psrd_tree import load

# Books in rough publication order (earlier book wins when a name is duplicated).
BOOKS = [
    ('book-cr.db', 'Core Rulebook', 'CRB'),
    ('book-b1.db', 'Bestiary', 'B1'),
    ('book-apg.db', "Advanced Player's Guide", 'APG'),
    ('book-b2.db', 'Bestiary 2', 'B2'),
    ('book-um.db', 'Ultimate Magic', 'UM'),
    ('book-uc.db', 'Ultimate Combat', 'UC'),
    ('book-b3.db', 'Bestiary 3', 'B3'),
    ('book-arg.db', 'Advanced Race Guide', 'ARG'),
    ('book-ucampaign.db', 'Ultimate Campaign', 'UCa'),
    ('book-ma.db', 'Mythic Adventures', 'MA'),
    ('book-b4.db', 'Bestiary 4', 'B4'),
    ('book-acg.db', 'Advanced Class Guide', 'ACG'),
]

# Every book in PSRD-Data (publication order), used for armor, magic items and spells.
# BOOKS above is kept as-is so races/classes/feats rebuild unchanged.
ALL_BOOKS = [
    ('book-cr.db', 'Core Rulebook', 'CRB'),
    ('book-b1.db', 'Bestiary', 'B1'),
    ('book-apg.db', "Advanced Player's Guide", 'APG'),
    ('book-gmg.db', 'Game Mastery Guide', 'GMG'),
    ('book-b2.db', 'Bestiary 2', 'B2'),
    ('book-um.db', 'Ultimate Magic', 'UM'),
    ('book-uc.db', 'Ultimate Combat', 'UC'),
    ('book-b3.db', 'Bestiary 3', 'B3'),
    ('book-arg.db', 'Advanced Race Guide', 'ARG'),
    ('book-ue.db', 'Ultimate Equipment', 'UE'),
    ('book-npc.db', 'NPC Codex', 'NPC'),
    ('book-ucampaign.db', 'Ultimate Campaign', 'UCa'),
    ('book-ma.db', 'Mythic Adventures', 'MA'),
    ('book-b4.db', 'Bestiary 4', 'B4'),
    ('book-acg.db', 'Advanced Class Guide', 'ACG'),
    ('book-mc.db', 'Monster Codex', 'MC'),
    ('book-tech.db', 'Technology Guide', 'TG'),
]

ABILITIES = {'strength': 'str', 'dexterity': 'dex', 'constitution': 'con',
             'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha',
             'str': 'str', 'dex': 'dex', 'con': 'con', 'int': 'int', 'wis': 'wis', 'cha': 'cha'}


def slug(s):
    s = html.unescape(s or '').lower().replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def _table_text(t):
    lines = []
    cap = t.find('caption')
    if cap:
        lines.append(cap.get_text(' ', strip=True))
    for tr in t.find_all('tr'):
        cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
        if any(cells):
            lines.append(' | '.join(cells))
    return '\n'.join(lines)


def text(h):
    """HTML fragment -> readable plain text (paragraphs separated by blank lines)."""
    if not h:
        return ''
    soup = BeautifulSoup(h, 'html.parser')
    for t in soup.find_all('table'):
        t.replace_with('\n' + _table_text(t) + '\n')
    for br in soup.find_all('br'):
        br.replace_with('\n')
    for tag in soup.find_all(['p', 'li', 'blockquote', 'div', 'h1', 'h2', 'h3', 'h4']):
        tag.insert_before('\n')
        tag.insert_after('\n')
    s = soup.get_text()
    s = s.replace('\xa0', ' ').replace('–', '-').replace('—', '-')
    s = s.replace('‘', "'").replace('’', "'").replace('“', '"').replace('”', '"')
    s = s.replace('−', '-')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip().lstrip('. ').strip()


def clean(s):
    return text(s) if s else ''


def node_text(n, depth=0, max_depth=6):
    """Full text of a node including its descendants (names become sub-headings)."""
    parts = []
    if n.get('body'):
        parts.append(text(n['body']))
    elif n.get('description') and n['type'] == 'section':
        parts.append(text(n['description']))
    if depth < max_depth:
        for ch in n['children']:
            if ch['type'] in ('link', 'embed'):
                continue
            sub = node_text(ch, depth + 1, max_depth)
            if ch['name'] and ch['type'] != 'table':
                sub = (clean(ch['name']) + ': ' + sub) if sub else ''
            if sub:
                parts.append(sub)
    return '\n\n'.join(p for p in parts if p)


def walk(n):
    yield n
    for ch in n['children']:
        yield from walk(ch)


def find(n, pred):
    for x in walk(n):
        if pred(x):
            return x
    return None


def iter_books(books=None):
    for db, name, abbr in books or BOOKS:
        c, rows = load(db)
        yield db, name, abbr, c, rows


def plain(s):
    """Unescape HTML entities and normalize dashes, e.g. '&ndash;5' -> '-5'."""
    s = html.unescape(s or '').replace('\xa0', ' ')
    return s.replace('–', '-').replace('—', '-').replace('−', '-').strip()


def to_number(s):
    """'1,500 gp' -> 1500, '2 1/2 lbs.' -> 2.5, '—' -> None."""
    s = plain(s).replace(',', '')
    m = re.match(r'^\+?(\d+)(?:\s+(\d+)/(\d+))?', s)
    if not m:
        m2 = re.match(r'^(\d+)/(\d+)', s)
        return int(m2.group(1)) / int(m2.group(2)) if m2 else None
    n = int(m.group(1))
    if m.group(2):
        n += int(m.group(2)) / int(m.group(3))
    return n


def parse_table(table_html):
    """Parse an HTML table into (headers, rows) handling rowspan/colspan in the header."""
    soup = BeautifulSoup(table_html, 'html.parser')
    t = soup.find('table')
    head_rows, body_rows = [], []
    thead = t.find('thead')
    all_tr = t.find_all('tr')
    for tr in all_tr:
        if (thead and tr.find_parent('thead')) or (not thead and tr.find('th') and not tr.find('td')):
            head_rows.append(tr)
        else:
            body_rows.append(tr)
    # build header grid
    grid = {}
    for r, tr in enumerate(head_rows):
        col = 0
        for cell in tr.find_all(['th', 'td']):
            while (r, col) in grid:
                col += 1
            rs, cs = int(cell.get('rowspan', 1)), int(cell.get('colspan', 1))
            val = cell.get_text(' ', strip=True)
            for dr in range(rs):
                for dc in range(cs):
                    grid[(r + dr, col + dc)] = val
            col += cs
    ncols = max([k[1] for k in grid] + [-1]) + 1
    headers = []
    for cidx in range(ncols):
        parts = []
        for r in range(len(head_rows)):
            v = grid.get((r, cidx), '')
            if v and v not in parts:
                parts.append(v)
        headers.append(' / '.join(parts))
    rows = []
    for tr in body_rows:
        cells = [c.get_text(' ', strip=True).replace('–', '-').replace('—', '-').replace('−', '-')
                 for c in tr.find_all(['td', 'th'])]
        if cells:
            rows.append(cells)
    return headers, rows
