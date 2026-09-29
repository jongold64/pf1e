"""Read the Foundry VTT Pathfinder 1e system's compendium packs (YAML files, one per entry) straight from its git
repository. Windows can't check out some of its long file paths, so files are read with `git cat-file` instead of
from disk; a shallow partial clone of just the data is enough:

    git clone --depth 1 --filter=blob:none --sparse https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1.git

Set FOUNDRY to the clone's folder (defaults to ../foundryvtt-pathfinder1 next to this repo).

Game content in the packs is Open Game Content under the OGL 1.0a (see the repo's README and OGL.txt).
"""
import json, os, re, subprocess
import yaml
from common import text

ROOT = os.environ.get('FOUNDRY') or os.path.join(os.path.dirname(__file__), '..', '..', 'foundryvtt-pathfinder1')


def _git(*args, data=None):
    return subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=off', *args], input=data,
                          capture_output=True, check=True).stdout


def read_files(paths):
    """Contents of files at HEAD, in one `git cat-file --batch` call (fetching them on first use)."""
    out = _git('cat-file', '--batch', data='\n'.join(f'HEAD:{p}' for p in paths).encode('utf-8'))
    result, i = {}, 0
    for p in paths:
        end = out.index(b'\n', i)
        header = out[i:end].split()
        if header[-1] == b'missing':
            i = end + 1
            continue
        size = int(header[2])
        result[p] = out[end + 1:end + 1 + size].decode('utf-8')
        i = end + 1 + size + 1
    return result


def load_pack(pack, doc_type=None):
    """Every entry in packs/<pack> (folders left out), optionally only one `type` (e.g. 'spell')."""
    paths = [p for p in _git('ls-tree', '-r', '--name-only', 'HEAD', f'packs/{pack}').decode('utf-8').splitlines()
             if p.endswith('.yaml')]
    docs = [yaml.safe_load(body) for body in read_files(paths).values()]
    return [d for d in docs if d and 'system' in d and (doc_type is None or d.get('type') == doc_type)]


def load_sources():
    """Book registry from module/registry/sources.mjs: {code: {'name', 'publisher', 'date', 'type'}}."""
    src = read_files(['module/registry/sources.mjs'])['module/registry/sources.mjs']
    books = {}
    for m in re.finditer(r'^\s{4}"?([\w-]+)"?: \{\n(.*?)^\s{4}\},', src, re.M | re.S):
        fields = dict(re.findall(r'^\s{6}(\w+): "([^"]*)"', m.group(2), re.M))
        if 'name' in fields:
            books[m.group(1)] = fields
    return books


def load_notices():
    """OGL Section 15 notices per book ({title: [notice, ...]}), from scripts/ogl_notices.json
    (made by extract_ogl_notices.py) plus scripts/d20_feat_notices.json (read from d20pfsrd pages by the d20 builders).
    Content from a book without notices is left out."""
    here = os.path.dirname(__file__)
    notices = {}
    for name in ('ogl_notices.json', 'd20_feat_notices.json'):
        path = os.path.join(here, name)
        if os.path.exists(path):
            for book, lines in json.load(open(path, encoding='utf-8')).items():
                notices[book] = notices.get(book, []) + [n for n in lines if n not in notices.get(book, [])]
    return notices


def book_key(title):
    """A book title for matching across sources: 'Pathfinder Chronicles: Faction Guide' = 'Faction Guide'."""
    t = re.sub(r"^pathfinder (?:chronicles|campaign setting|player companion|companion|roleplaying game|rpg|adventure path)[:,]?\s+",
               '', title.lower().replace('’', "'"))
    t = t.replace('&', ' and ')
    # Adventure Path volumes go by two numbers ("Pathfinder #95: Anvil of Fire" = "Giantslayer #5: Anvil of Fire"),
    # so only the title after the number counts.
    t = re.sub(r'^.*#\d+:\s*', '', t)
    return re.sub(r'[^a-z0-9]', '', t)


def find_notices(notices, book):
    """The notices for a book, matching its title exactly or by book_key."""
    if book in notices:
        return notices[book]
    k = book_key(book)
    return next((lines for title, lines in notices.items() if book_key(title) == k), [])


def paizo_source(doc, books):
    """The book an entry comes from, if it's a Paizo book; None for other publishers, blogs or unknown sources."""
    for s in (doc.get('system') or {}).get('sources') or []:
        code = s.get('id') or ''
        book = books.get(code)
        if code.startswith('PZO') and book and book.get('publisher', 'Paizo') == 'Paizo':
            return book['name']
    return None


def html_text(h):
    """Foundry description HTML -> the plain text the app uses. Links like @UUID[...]{fireball} keep their label;
    inline rolls [[...]] and other @-enrichers are dropped."""
    h = re.sub(r'@\w+\[[^\]]*\]\{([^}]*)\}', r'\1', h or '')
    h = re.sub(r'@\w+\[[^\]]*\]', '', h)
    h = re.sub(r'\[\[/?\w*\s*([^\]]*)\]\]', r'\1', h)
    return text(h)
