"""Add Paizo feats that PSRD-Data lacks (books after 2015 and others) to data/feats.json, from the d20pfsrd.com
feat pages downloaded by fetch_d20pfsrd_feats.py (run after build_feats.py).

Each d20pfsrd feat page has the name (with its type in brackets, "Power Attack (Combat)"), a one-line description,
"Prerequisite(s)", "Benefit(s)", "Normal" and "Special" paragraphs, and a "Section 15: Copyright Notice" box naming
the book. Only feats whose notice is a Paizo book are used (d20pfsrd also hosts third-party material); the notices are
saved to scripts/d20_feat_notices.json for build_license.py. Mythic feats are left out (the app doesn't use them).

Usage: python build_d20_feats.py path/to/feats.json [cache-folder]   (cache default ../../d20pfsrd-feats)
"""
import json, os, re, sys
from bs4 import BeautifulSoup, NavigableString
from common import text, slug
from build_feats import parse_prereqs

ORIGIN = 'd20pfsrd'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-feats')
NOTICES = os.path.join(os.path.dirname(__file__), 'd20_feat_notices.json')
TYPE_NAMES = ['Combat', 'Critical', 'Teamwork', 'Metamagic', 'Item Creation', 'Style', 'Grit', 'Panache', 'Performance',
              'Story', 'Achievement', 'Betrayal', 'Called Shot', 'Monster', 'Stare', 'Conduit', 'Damnation', 'Faction',
              'Local', 'Weapon Mastery', 'Armor Mastery', 'Shield Mastery', 'Item Mastery', 'Caravan', 'Familiar',
              'Animal Companion', 'Blood Hex', 'Hero Point', 'Targeting', 'Meditation', 'Esoteric', 'Mythic']
# Types from the URL's category when the name doesn't say ("/feats/combat-feats/...").
CATEGORY_TYPES = {'combat-feats': 'Combat', 'metamagic-feats': 'Metamagic', 'teamwork-feats': 'Teamwork',
                  'item-creation-feats': 'Item Creation', 'story-feats': 'Story', 'achievement-feats': 'Achievement',
                  'betrayal-feats': 'Betrayal', 'conduit-feats': 'Conduit', 'damnation-feats': 'Damnation',
                  'grit-feats': 'Grit', 'panache-feats': 'Panache', 'stare-feats': 'Stare', 'monster-feats': 'Monster',
                  'weapon-mastery-feats': 'Weapon Mastery', 'armor-mastery-feats': 'Armor Mastery',
                  'shield-mastery-feats': 'Shield Mastery', 'item-mastery-feats': 'Item Mastery', 'local-feats': 'Local',
                  'caravan-feats': 'Caravan', 'familiar-feats': 'Familiar', 'faction-feats': 'Faction',
                  'animal-companion-feats': 'Animal Companion'}
SECTIONS = {'prerequisite': 'prerequisites_text', 'prerequisites': 'prerequisites_text', 'benefit': 'benefit',
            'benefits': 'benefit', 'normal': 'normal', 'special': 'special', 'goal': 'goal', 'note': 'note',
            'completion benefit': 'completion_benefit', 'completion benefits': 'completion_benefit',
            # Stain feats (Antihero's Handbook): the gift is the benefit, and the stain (its drawback) follows it.
            'gift': 'benefit', 'stain': 'benefit'}
BOOK_PREFIXES = r'^(Pathfinder (Roleplaying Game|RPG|Player Companion|Companion|Campaign Setting|Chronicles|Module|Adventure Path( #\d+)?|Society( Roleplaying Guild)?)\s*[:,–-]?\s+)'
# Paizo feats whose d20pfsrd page has no Section 15 notice: their book, from the Archives of Nethys feat page. The
# book's notice must already be known (scripts/ogl_notices.json or d20_feat_notices.json).
FEAT_SOURCES = {
    "Devil's Foe": 'Andoran, Spirit of Liberty', 'Gifted Mesmerist': "Legacy of Fire Player's Guide",
    'Dedicated Adversary': 'Dirty Tactics Toolbox', 'Measure Foe': 'Ultimate Intrigue',
    'Brilliant Spell Preparation': 'Ultimate Intrigue', 'Dreamed Secrets': 'Inner Sea Gods',
    'Shadow Gambit': 'Inner Sea Magic', 'Summon Guardian Spirit': "Monster Summoner's Handbook",
}
# Page titles that aren't the feat's printed name.
NAME_FIXES = {'Two Weapon Drunkard Combat': 'Two-Weapon Drunkard'}
# Feats for other things than a character (a Jade Regent caravan).
SKIP_TYPES = {'Mythic', 'Caravan'}


# Notices some pages give in shorthand, and titles the prefix stripping cuts too short.
NOTICE_FIXES = {'PCh:FG.': 'Pathfinder Chronicles: Faction Guide.'}
TITLE_FIXES = {'Primer': 'Pathfinder Society Primer', 'Cheliax: Empire of Devils': 'Cheliax, Empire of Devils'}


def fix_notice(notice):
    notice = notice.replace('’', "'")
    for short, full in NOTICE_FIXES.items():
        if notice.startswith(short):
            notice = full + notice[len(short):]
    return notice


def take_notices(art):
    """The Section 15 notices on a page, removed from it. They're paragraphs or divs in the "section15" box, or (older
    or broken pages) paragraphs and divs right after it."""
    notices = []
    # Broken HTML can leave the box outside the article; then it's looked for in the whole page.
    boxes = art.find_all('div', class_='section15')
    if not boxes:
        root = art
        while root.parent is not None:
            root = root.parent
        boxes = root.find_all('div', class_='section15')
    for box in boxes:
        parts = [box] + [el for el in box.find_next_siblings() if el.name in ('p', 'div')]
        for part in parts:
            leaves = [el for el in [part, *part.find_all(['p', 'div'])] if not el.find(['p', 'div'])]
            for el in leaves:
                n = re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).replace(' ,', ',').replace(' .', '.').replace(' ;', ';')
                if re.search(r'©|Copyright \d{4}', n) and not n.startswith('Section 15') and fix_notice(n) not in notices:
                    notices.append(fix_notice(n))
        for part in parts:
            part.decompose()
    return notices


def book_name(notice):
    """'Pathfinder Roleplaying Game Occult Adventures © 2015, Paizo Inc.; ...' -> 'Occult Adventures'."""
    notice = fix_notice(notice)
    title = re.split(r'\s*(?:©|\. Copyright|, Copyright| Copyright)', notice.replace('’', "'"))[0].strip().rstrip('.')
    for _ in range(2):
        title = re.sub(BOOK_PREFIXES, '', title).strip()
    return TITLE_FIXES.get(title, title)


def parse_page(html, unwrap=False):
    # Some pages never close their paragraphs, so html.parser nests each one inside the last (the benefit would end
    # up inside the prerequisites). Close an open paragraph where a new paragraph or block starts, as browsers do.
    html = re.sub(r'<(?=(?:p|div|ul|ol|table|h[1-6])[\s>])', '</p><', html)
    if unwrap:
        # A "Benefit:" label that isn't bold (at the start of a paragraph, or run on after the prerequisites) starts
        # its own labelled paragraph.
        html = re.sub(r'(?<=[\s>])(?<!Completion )Benefits?(?:\(s\))?\*?\s*:', '</p><p><b>Benefit</b>:', html)
    soup = BeautifulSoup(html, 'html.parser')
    art = soup.find(id='article-content')
    if not art or not art.find('h1'):
        return None
    url = (re.match(r'<!-- (\S+) -->', html) or [None, ''])[1]
    for s in art.find_all(['script', 'style']):
        s.decompose()
    notices = take_notices(art)
    title = art.find('h1').get_text(' ', strip=True).replace('’', "'")
    # A trailing bracket holds the feat's types and, for racial feats, its race: "Blundering Defense (Combat, Halfling)".
    m = re.match(r'^(.*?)\s*\(([^)]*)\)$', title)
    name, types = title, []
    if m:
        name = m.group(1)
        types = [x for t in re.split(r'[,/]\s*', m.group(2)) for x in TYPE_NAMES if x.lower() == t.strip().lower()]
    category = (re.search(r'/feats/([^/]+)/', url) or [None, ''])[1]
    if not types and category in CATEGORY_TYPES:
        types = [CATEGORY_TYPES[category]]
    desc = art.find('p', class_='description')
    rec = {'name': NAME_FIXES.get(name.strip(), name.strip()), 'types': types or ['General'],
           'description': text(str(desc)) if desc else '', 'notices': notices, 'url': url}
    if desc:
        desc.decompose()
    art.find('h1').decompose()
    for b in art.find_all('div', class_='breadcrumbs'):
        b.decompose()
    # The book-cover box ("Source", cover, "Support Open Gaming") isn't part of the feat.
    for t in art.find_all(['table', 'div', 'p']):
        if t.decomposed:
            continue
        words = t.get_text(' ', strip=True)
        if re.search(r'Support Open Gaming|opengamingstore', words) and len(words) < 200 or words == 'Source':
            t.decompose()
        # "Source PPC:WMH" lines and the bare "Combat Trick" heading before a stamina note (the note itself is kept).
        elif t.name == 'p' and (words == 'Combat Trick' or re.fullmatch(r"Source:?\s*[\w:&' ,.-]{0,40}", words)):
            t.decompose()
    # Some pages wrap the feat's paragraphs in a plain <div> (sometimes with a margin); the walk below reads the
    # article's own children, so with `unwrap` (used when a first reading found no benefit) those are unwrapped.
    for d in art.find_all('div') if unwrap else []:
        if not d.decomposed and not d.get('class') and not d.get('id'):
            d.unwrap()
    # Text sitting loose in the article ("<b>Benefit</b>: ..." with no paragraph around it) goes into a paragraph.
    run = []
    for child in list(art.children) + [None]:
        if child is not None and (isinstance(child, NavigableString) or child.name in ('b', 'strong', 'i', 'em', 'a', 'span', 'br')):
            run.append(child)
            continue
        if any(str(x).strip() for x in run):
            p = soup.new_tag('p')
            run[0].insert_before(p)
            for x in run:
                p.append(x.extract())
        run = []
    # Walk the paragraphs, lists and tables: a bold label starts a section; anything else continues the current one.
    current = None
    for el in art.find_all(['p', 'ul', 'ol', 'table', 'h2', 'h3', 'h4'], recursive=False) or art.find_all(['p', 'ul', 'ol', 'table']):
        # The label is bold: <b>, <strong> or (older pages) <span style="font-weight:bold">.
        label = (el.find(['b', 'strong']) or el.find('span', style=re.compile(r'font-weight:\s*bold'))) if el.name == 'p' else None
        key = label.get_text(' ', strip=True).rstrip(':').strip().lower() if label else ''
        key = re.sub(r'\(s\)$', 's', key).rstrip('*')
        if key in SECTIONS or key.rstrip('s') in SECTIONS:
            current = SECTIONS.get(key) or SECTIONS[key.rstrip('s')]
            label.extract()
            body = text(str(el)).lstrip(':').strip()
            if key == 'stain':
                body = f'Stain: {body}'
            rec[current] = (rec.get(current, '') + '\n\n' + body).strip() if current in rec else body
        elif current and current != 'prerequisites_text':
            body = text(str(el)).strip()
            if body:
                rec[current] = rec[current] + '\n\n' + body
    return rec


def main():
    out_path = sys.argv[1]
    feats = [f for f in json.load(open(out_path, encoding='utf-8')) if f.get('origin') != ORIGIN]
    key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
    have = {key(f['name']) for f in feats}
    pages = sorted(os.listdir(CACHE))
    # The notices file is shared with build_d20_traits.py and build_d20_races.py, so it's added to, not replaced.
    notices = json.load(open(NOTICES, encoding='utf-8')) if os.path.exists(NOTICES) else {}
    new, skipped = {}, {'no Paizo notice': 0, 'mythic or caravan': 0, 'duplicate': 0, 'unreadable': 0, 'no benefit': 0}
    for name in pages:
        html = open(os.path.join(CACHE, name), encoding='utf-8').read()
        rec = parse_page(html)
        if rec and not rec.get('benefit') and not rec.get('goal'):
            rec = parse_page(html, unwrap=True)
        if not rec:
            skipped['unreadable'] += 1
            continue
        paizo = [n for n in rec['notices'] if re.search(r'Paizo,? (?:Publishing|Inc)', n)]  # not "Paizo Fans United"
        if not paizo and rec['name'] not in FEAT_SOURCES:
            skipped['no Paizo notice'] += 1
            continue
        if SKIP_TYPES & set(rec['types']) or 'Mythic' in rec['name']:
            skipped['mythic or caravan'] += 1
            continue
        k = key(rec['name'])
        # Racial feats sharing a name are different feats when their race differs ("Unusual Origin" for changelings,
        # dhampirs, fetchlings and gillmen); they're kept apart here and named by race below.
        if k in new and '/racial-feats/' in rec['url'] and rec.get('prerequisites_text') != new[k].get('prerequisites_text'):
            k = f"{k}|{key(rec.get('prerequisites_text') or '')}"
        if k in have or k in new:
            skipped['duplicate'] += 1
            continue
        if not rec.get('benefit') and not rec.get('goal'):
            skipped['no benefit'] += 1
            continue
        # The feat's own book: the last Paizo notice (pages list reprinted material first).
        rec['source'] = book_name(paizo[-1]) if paizo else FEAT_SOURCES[rec['name']]
        notices.setdefault(rec['source'], [])
        for n in rec['notices']:
            if n not in notices[rec['source']]:
                notices[rec['source']].append(n)
        new[k] = rec
    for k in [k for k in new if '|' in k]:
        for r in (new[k], new.get(k.split('|')[0])):
            race = (r.get('prerequisites_text') or '').strip().rstrip('.')
            if r and race and len(race.split()) <= 3 and not r['name'].endswith(')'):
                r['name'] = f"{r['name']} ({race})"
    names = {f['name'].lower(): f['name'] for f in feats if 'Mythic' not in f.get('types', [])}
    names.update({r['name'].lower(): r['name'] for r in new.values()})
    ids = {f['id'] for f in feats}
    order = ['id', 'name', 'source', 'types', 'description', 'prerequisites_text', 'prerequisites', 'benefit', 'normal',
             'special', 'goal', 'completion_benefit', 'note', 'origin']
    for r in new.values():
        r['id'] = slug(r['name']) if slug(r['name']) not in ids else f"{slug(r['name'])}-{slug(r['source'])}"
        ids.add(r['id'])
        r['prerequisites'] = parse_prereqs(r['prerequisites_text'], names) if r.get('prerequisites_text') else []
        r['origin'] = ORIGIN
        feats.append({k: r[k] for k in order if k in r and r[k] not in (None, '')})
    feats.sort(key=lambda f: (f['name'].lower(), f['id']))
    json.dump(feats, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    json.dump(notices, open(NOTICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(new)} feats added from d20pfsrd ({len(feats)} in all) from {len(pages)} pages; skipped: {skipped}')
    from collections import Counter
    for b, n in Counter(r['source'] for r in new.values()).most_common(25):
        print(f'  {n:5} {b}')


if __name__ == '__main__':
    main()
