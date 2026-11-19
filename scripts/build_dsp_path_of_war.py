"""Path of War (Dreamscarred Press; third-party, open content) in data/third-party.json, from the d20pfsrd.com pages saved by
fetch_d20pfsrd_path_of_war.py. The app offers it only on a character that has the book ticked under Third-party books
(Build tab, with the 3rd Party house rule).

- classes: the stalker, warder and warlord (the core book's classes; Path of War Expanded's harbinger, mystic and zealot
  are later work). Each progression row has `maneuvers: { known, readied, stances }`, and the class has
  `initiator: { ability, disciplines, choose }` (choose: the "either X or Y" pair, one of which is picked).
- talents: the stalker's arts (kind pow-stalker-art) and the warlord's gambits (kind pow-gambit), chosen like rogue talents.
- disciplines: { id, name, skill, weapon_groups, supernatural, text }.
- maneuvers: { id, name, discipline, type (strike, boost, counter, stance), descriptor, level, prerequisite (count of
  maneuvers of the discipline needed), action, range, target, area, duration, save, summary, text }.
- feats: the Path of War feats (d20pfsrd mixes in Path of War Expanded's; their prerequisites keep them to those who
  qualify), shaped like data/feats.json, ids prefixed "pow-" so they never clash with a Paizo feat.

Section 15 notices are read from the pages.
Usage: python build_dsp_path_of_war.py path/to/third-party.json [cache-folder, default ../../d20pfsrd-path-of-war]
"""
import json, os, re, sys
from collections import Counter
from bs4 import BeautifulSoup
from common import text, slug, save_third_party
from build_d20_feats import parse_page, take_notices, TYPE_NAMES
from build_feats import parse_prereqs

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'd20pfsrd-path-of-war')
BASE = 'https://www.d20pfsrd.com/alternative-rule-systems/3rd-party-rules-systems/path-of-war/'
ORIGIN = 'Dreamscarred Press'
BOOK_ID = 'path-of-war'
BOOK = 'Path of War'
CLASSES = ['stalker', 'warder', 'warlord']
# "Starting Wealth and Age: As cleric." -> that class's starting wealth.
WEALTH = {'cleric': {'dice': '4d6 x 10 gp', 'average_gp': 140}, 'fighter': {'dice': '5d6 x 10 gp', 'average_gp': 175},
          'paladin': {'dice': '5d6 x 10 gp', 'average_gp': 175}}
# Class features chosen from a list: class -> (feature heading, option kind, how the options are written).
CHOICES = {'stalker': [('Stalker Arts', 'pow-stalker-art', 'labels')], 'warlord': [('Warlord’s Gambit', 'pow-gambit', 'table')]}
ABILITY = {'strength': 'str', 'dexterity': 'dex', 'constitution': 'con', 'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha'}
WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9}


def page(name):
    path = os.path.join(CACHE, name)
    return open(path, encoding='utf-8').read() if os.path.exists(path) else None


NOTICES = []


def article(html):
    """The page's article, with its Section 15 notices taken out (into NOTICES)."""
    soup = BeautifulSoup(html, 'html.parser')
    art = soup.select_one('#article-content') or soup.select_one('.article-content')
    for s in art.find_all(['script', 'style']):
        s.decompose()
    for n in take_notices(art):
        n = n.replace('’', "'").replace('–', '-')
        if n not in NOTICES:
            NOTICES.append(n)
    return art


def clean(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s+([,.;:)])', r'\1', s).replace('( ', '(')
    return s.replace('’', "'").replace('–', '-').replace('—', '-')


def section(head):
    """The elements after a heading, up to the next heading of the same or a higher rank."""
    rank = int(head.name[1])
    out, n = [], head.find_next_sibling()
    while n is not None and not (n.name and re.fullmatch(r'h[1-6]', n.name) and int(n.name[1]) <= rank):
        out.append(n)
        n = n.find_next_sibling()
    return out


def html_of(elements):
    return ''.join(str(e) for e in elements)


# ---- classes ------------------------------------------------------------------------------------------------------

def class_record(cid, art):
    t = clean(art.get_text(' '))
    name = cid.title()
    table = art.find('table')
    rows = [[clean(c.get_text(' ')) for c in r.find_all(['td', 'th'])] for r in table.find_all('tr')]
    head, body = rows[0], [r for r in rows[1:] if r and re.match(r'\d+(st|nd|rd|th)$', r[0])]
    col = {h: i for i, h in enumerate(head)}
    ints = lambda s: [int(x) for x in s.replace('+', '').split('/')]
    progression = []
    for r in body:
        row = {'level': int(re.match(r'\d+', r[0]).group(0)), 'bab': ints(r[col['Base Attack Bonus']]),
               'fort': int(r[col['Fort Save']].replace('+', '')), 'ref': int(r[col['Ref Save']].replace('+', '')),
               'will': int(r[col['Will Save']].replace('+', '')),
               'special': [s.strip() for s in re.split(r',\s*(?![^()]*\))', r[col['Special']]) if s.strip() not in ('', '-', '—')],
               'maneuvers': {'known': int(r[col['Maneuvers Known']]), 'readied': int(r[col['Maneuvers Readied']]),
                             'stances': int(r[col['Stances']])}}
        if 'Dodge Bonus' in col:
            row['dodge_bonus'] = int(r[col['Dodge Bonus']].replace('+', ''))
        progression.append(row)
    skills = re.search(r"class skills \(and the key ability for each skill\) are: (.+?)\. Skill Ranks", t).group(1)
    class_skills = [{'skill': m.group(1).strip(), 'ability': m.group(2).lower()}
                    for m in re.finditer(r'(?:and )?([A-Z][\w ()]+?) \((Str|Dex|Con|Int|Wis|Cha)\)', skills)]
    disc = re.search(r'The disciplines available to \w+ are (.+?)(?: to \w+ list of available disciplines)?\. ', t).group(1)
    either = re.search(r'either ([\w ]+?) or ([\w ]+)$', disc)
    disciplines = [d.strip() for d in re.split(r',\s*(?:and\s+)?', disc[:either.start()] if either else disc) if d.strip()]
    features, started = [], False
    for h in art.find_all(['h2', 'h3', 'h4']):
        if h.name == 'h3' and 'Class Features' in h.get_text():
            started = True
        elif started and h.name == 'h2':
            break
        elif started and h.name == 'h4':
            fname = clean(h.get_text(' '))
            ftext = text(html_of(section(h))).strip()
            if fname and ftext:
                m = re.search(r'At (\d+)(?:st|nd|rd|th) level', ftext)
                features.append({'name': fname, **({'level': int(m.group(1))} if m else {}), 'text': ftext})
    wealth = re.search(r'Starting Wealth and Age: As (\w+)', t)
    hit_die = re.search(r'Hit Die: (d\d+)', t).group(1)
    ability = ABILITY[re.search(r'initiat\w+ modifier is (\w+)', t).group(1).lower()]
    summary = clean(art.find('p').get_text(' ')) if art.find('p') else ''
    intro = next((clean(p.get_text(' ')) for p in art.find_all('p') if len(p.get_text()) > 120), summary)
    alignment = re.search(r'Alignment: ([^.]+\.)', t).group(1)
    role = (re.search(r'Role: (.+?) Abilities:', t) or [None, ''])[1]
    return {'id': cid, 'name': name, 'source': BOOK, 'category': 'third-party', 'summary': intro, 'hit_die': hit_die,
            'alignment': alignment, 'role': role, 'class_skills': class_skills,
            'skill_ranks_per_level': int(re.search(r'Skill Ranks per Level: (\d+)', t).group(1)),
            'starting_wealth': WEALTH.get(wealth.group(1).lower() if wealth else 'fighter'), 'progression': progression,
            'features': features,
            'initiator': {'ability': ability, 'disciplines': disciplines, **({'choose': [either.group(1).strip(), either.group(2).strip()]} if either else {})},
            'origin': ORIGIN, 'third_party': BOOK_ID}


def class_options(cid, art):
    out = []
    for heading, kind, how in CHOICES.get(cid, []):
        h = next(x for x in art.find_all('h4') if clean(x.get_text(' ')).startswith(heading.replace('’', "'")) or heading in x.get_text())
        els = section(h)
        if how == 'labels':
            # "<i>Alacrity (Ex):</i> text" paragraphs (and list items).
            for el in [e for x in els for e in ([x] if x.name in ('p', 'li') else x.find_all(['p', 'li']))]:
                lab = el.find(['i', 'em'])
                if not lab or not el.get_text(strip=True).startswith(lab.get_text(strip=True)):
                    continue
                label = clean(lab.get_text(' ')).rstrip(':')
                if not label or len(label) > 60:
                    continue
                for inner in el.find_all(['p', 'ul']):
                    inner.extract()  # a broken page nests the next art inside this one
                body = clean(el.get_text(' '))[len(clean(lab.get_text(' '))):].lstrip(': ').strip()
                name = re.sub(r'\s*\((?:Ex|Su|Sp)\)$', '', label)
                level = re.search(r'must be (?:at least )?(\d+)(?:st|nd|rd|th) level', body)
                out.append({'id': f'pow-{slug(name)}', 'name': name, 'kind': kind, 'classes': [cid], 'source': BOOK,
                            'text': body, 'level': int(level.group(1)) if level else None,
                            'repeatable': bool(re.search(r'may be selected more than once', body)), 'origin': ORIGIN,
                            'third_party': BOOK_ID})
        else:
            table = next(x for e in els for x in ([e] if e.name == 'table' else e.find_all('table')))
            for r in table.find_all('tr')[1:]:
                cells = [clean(c.get_text(' ')) for c in r.find_all(['td', 'th'])]
                if len(cells) < 3 or not cells[0]:
                    continue
                level = re.search(r'must be (?:at least )?(\d+)(?:st|nd|rd|th) level', ' '.join(cells))
                out.append({'id': f'pow-{slug(cells[0])}', 'name': cells[0], 'kind': kind, 'classes': [cid], 'source': BOOK,
                            'text': f'Risk: {cells[1]}\n\nReward: {cells[2]}', 'level': int(level.group(1)) if level else None,
                            'repeatable': False, 'origin': ORIGIN, 'third_party': BOOK_ID})
    return out


# ---- disciplines and maneuvers --------------------------------------------------------------------------------------

FIELDS = {'initiation action': 'action', 'range': 'range', 'target': 'target', 'targets': 'target', 'area': 'area',
          'duration': 'duration', 'saving throw': 'save', 'prerequisite(s)': 'prerequisite_text', 'spell resistance': 'sr', 'prerequisites': 'prerequisite_text',
          'prerequisite': 'prerequisite_text'}


def discipline(art):
    """The discipline's name (the page title) and its introduction: the paragraphs before the first maneuver table or
    level heading, without the page's table of contents."""
    h1 = art.find('h1')
    name = re.sub(r'\s+Maneuvers$', '', clean(h1.get_text(' '))) if h1 else None
    intro = []
    for el in (h1.find_all_next() if h1 else []):
        if el.name == 'table' or (el.name in ('h3', 'h4') and re.match(r'\d', el.get_text(strip=True)) or el.name == 'h4'):
            break
        if el.name == 'p' and el.find_parent(['p', 'li', 'table']) is None and el.get_text(strip=True) not in ('Contents',)                 and not el.find_parent(class_=re.compile('toc|breadcrumb', re.I)):
            intro.append(el)
    t = clean(' '.join(e.get_text(' ') for e in intro))
    skill = re.search(r"(?:associated|key) skills? (?:for [\w' ]+? )?(?:is|are) (.+?)(?:,? and (?:its|the) |\.)", t)
    groups = re.search(r'associated weapon groups (?:are|as|is) (.+?)\.', t)
    skills = [x.strip() for x in re.split(r',\s*(?:and\s+)?|\s+and\s+', skill.group(1))] if skill else []
    return {'id': slug(name or ''), 'name': name, 'skill': skills[0] if len(skills) == 1 else '', 'skills': skills,
            'weapon_groups': [g.strip() for g in re.split(r',\s*(?:and\s+)?|\s+and\s+', groups.group(1))] if groups else [],
            'supernatural': bool(re.search(r'(?:is|be|considered) (?:to be considered )?an? supernatural discipline', t)), 'text': text(html_of(intro)).strip(),
            'origin': ORIGIN, 'third_party': BOOK_ID}


def blocks_after(head):
    """The paragraphs, list items and tables after a heading, in page order, up to the next h1-h4 (the pages nest them
    in divs differently)."""
    out = []
    for el in head.find_all_next():
        if el.name in ('h1', 'h2', 'h3', 'h4'):
            break
        if el.name in ('p', 'li', 'table') and el.find_parent(['p', 'li', 'table']) is None:
            out.append(el)
    return out


def maneuvers(art, disc):
    # The summary tables ("Table: 1st Level Silver Crane Maneuvers": Maneuver | Type | Description).
    listed = {}
    for table in art.find_all('table'):
        cap = clean(table.find('caption').get_text(' ')) if table.find('caption') else ''
        lv = re.search(r'(\d)(?:st|nd|rd|th) Level', cap)
        for r in table.find_all('tr')[1:]:
            cells = [clean(c.get_text(' ')) for c in r.find_all('td')]
            if len(cells) >= 3 and lv:
                listed[cells[0].lower()] = {'name': cells[0], 'type': re.sub(r'\s*\(.*\)$', '', cells[1]).lower(),
                                            'level': int(lv.group(1)), 'summary': cells[2]}
    # Each maneuver: the page's HTML from its heading to the next heading, as text (the pages nest it in divs, paragraphs or
    # loose text with <br>s differently).
    page_html = str(art)
    heads = [(h, page_html.find(str(h))) for h in art.find_all(['h3', 'h4'])]
    heads = [(h, i) for h, i in heads if i >= 0]
    out = []
    LABELS = r'(Discipline|Level|Prerequisites?(?:\(s\))?|Initiation Action|Range|Targets?|Area|Duration|Saving Throw|Spell Resistance)'
    for n, (h, i) in enumerate(heads):
        if h.name != 'h4':
            continue
        j = heads[n + 1][1] if n + 1 < len(heads) else len(page_html)
        block = text(page_html[i + len(str(h)):j]).strip()
        block = re.sub(r'\s*\n\s*:', ':', block)  # "Discipline\n: Sleeping Goddess"
        m = re.search(r'Discipline\s*:\s*(.+?)\s*\(\s*(Strike|Boost|Counter|Stance)[^)]*\)\s*(\[[^\]]*\])?.*?Level\s*:\s*(\d)', block, re.S | re.I)
        if not m:
            continue
        name = clean(h.get_text(' '))
        rec = {'id': f'pow-{slug(name)}', 'name': name, 'discipline': disc['name'], 'type': m.group(2).lower(),
               'level': int(m.group(4))}
        if m.group(3):
            rec['descriptor'] = m.group(3).strip('[]').strip()
        parts = re.split(r'\n\s*DESCRIPTION\s*\n?', block, maxsplit=1)
        head_text = parts[0]
        for lab, val in re.findall(LABELS + r'\s*:\s*(.+?)(?=\s*;?\s*' + LABELS.replace('(', '(?:', 1) + r'\s*:|\n|$)', head_text):
            key = FIELDS.get(lab.lower())
            if key:
                rec[key] = clean(val).rstrip(';')
        if len(parts) > 1:
            body = parts[1].strip()
        else:
            body = '\n'.join(l for l in head_text.split('\n') if not re.match(r'\s*' + LABELS + r'\s*:', l)).strip()
        req = re.match(r'(\w+)\s+.*?maneuvers?', rec.get('prerequisite_text', ''), re.I)
        rec['prerequisite'] = (int(req.group(1)) if req.group(1).isdigit() else WORDS.get(req.group(1).lower(), 0)) if req else 0
        rec['summary'] = listed.get(name.lower(), {}).get('summary', '')
        rec['text'] = body
        rec.update({'origin': ORIGIN, 'third_party': BOOK_ID})
        if rec['id'] in {r['id'] for r in out}:
            continue
        # Summaries are matched by name; a table can spell a name a little differently.
        if not rec['summary']:
            key = re.sub(r'[^a-z]', '', name.lower())
            rec['summary'] = next((v['summary'] for k, v in listed.items() if re.sub(r'[^a-z]', '', k) == key), '')
        out.append(rec)
    # A maneuver only in the tables (the Black Seraph page has no descriptions): its summary, marked so.
    loose = lambda n: re.sub(r'[^a-z]', '', n.lower().replace('stance of', '').replace('the', ''))
    have = {loose(r['name']) for r in out}
    for k, t in listed.items():
        kind = next((x for x in ('strike', 'boost', 'counter', 'stance') if x in t['type']), None)
        if loose(k) not in have and kind:
            out.append({'id': f"pow-{slug(t['name'])}", 'name': t['name'], 'discipline': disc['name'], 'type': kind,
                        'level': t['level'], 'prerequisite': None, 'summary': t['summary'], 'text': '', 'summary_only': True,
                        'origin': ORIGIN, 'third_party': BOOK_ID})
    return out


# ---- feats ------------------------------------------------------------------------------------------------------------

def feats(names_paizo):
    recs = []
    for name in sorted(os.listdir(CACHE)):
        if not name.startswith('feats_'):
            continue
        html = page(name)
        url = BASE + name[:-5].replace('_', '/') + '/'
        rec = parse_page(f'<!-- {url} -->\n' + html)
        if rec and not rec.get('benefit'):
            rec = parse_page(f'<!-- {url} -->\n' + html, unwrap=True)
        if not rec or not rec.get('benefit'):
            print('  feat page not read:', name)
            continue
        # The page's type bracket ("Martial Training I (Combat)"); "Combat, Style" pages say "(Combat, Style)".
        rec['types'] = [t for t in rec['types'] if t in TYPE_NAMES] or ['General']
        for n in rec.get("notices", []):
            n = n.replace("’", "'").replace("–", "-")
            if n not in NOTICES:
                NOTICES.append(n)
        recs.append(rec)
    names = dict(names_paizo)
    names.update({r['name'].lower(): r['name'] for r in recs})
    order = ['id', 'name', 'source', 'types', 'description', 'prerequisites_text', 'prerequisites', 'benefit', 'normal',
             'special', 'origin', 'third_party']
    out = []
    for r in recs:
        r['id'] = f"pow-{slug(r['name'])}"
        r['source'] = BOOK
        r['prerequisites'] = parse_prereqs(r['prerequisites_text'], names) if r.get('prerequisites_text') else []
        r['origin'] = ORIGIN
        r['third_party'] = BOOK_ID
        out.append({k: r[k] for k in order if k in r and r[k] not in (None, '')})
    return out


def main():
    out_path = sys.argv[1]
    arts = []
    classes, options = [], []
    for cid in CLASSES:
        art = article(page(f'classes_{cid}.html'))
        arts.append(art)
        classes.append(class_record(cid, art))
        options += class_options(cid, art)
    discs, mans = [], []
    for name in sorted(os.listdir(CACHE)):
        if name.startswith('disciplines-and-maneuvers_') and name.endswith('.html'):
            art = article(page(name))
            arts.append(art)
            d = discipline(art)
            if not d['name']:
                print('  no discipline on', name)
                continue
            d['maneuvers'] = 0
            ms = maneuvers(art, d)
            d['maneuvers'] = len(ms)
            discs.append(d)
            taken = {m['id'] for m in mans}
            for m in ms:
                if m['id'] in taken:
                    m['id'] = f"{m['id']}-{d['id']}"
            mans += ms
    paizo = json.load(open(os.path.join(os.path.dirname(os.path.abspath(out_path)), 'feats.json'), encoding='utf-8'))
    feat_recs = feats({f['name'].lower(): f['name'] for f in paizo})
    # Paizo feats the book reprints word for word (Extra Ki) stay only as the Paizo feat.
    words = lambda t: re.sub(r'[^a-z0-9]', '', (t or '').lower())
    paizo_benefit = {f['name'].lower(): words(f.get('benefit')) for f in paizo}
    reprints = [f['name'] for f in feat_recs if paizo_benefit.get(f['name'].lower()) == words(f.get('benefit'))]
    feat_recs = [f for f in feat_recs if f['name'] not in reprints]
    if reprints:
        print('  reprints of Paizo feats left out:', ', '.join(reprints))
    notices = NOTICES
    book = {'id': BOOK_ID, 'name': 'Path of War', 'publisher': ORIGIN, 'author': '',
            'sources': [BOOK, 'Path of War - Expanded'], 'notices': notices,
            'note': 'Path of War: the stalker, warder and warlord are in the class list (Classes tab, Third-party group), with '
                    'their maneuvers and stances on the Classes tab; Path of War feats join the feat list.'}
    save_third_party(out_path, book, classes=classes, talents=options, disciplines=sorted(discs, key=lambda d: d['name']),
                     maneuvers=sorted(mans, key=lambda m: (m['discipline'], m['level'], m['name'])), feats=feat_recs)
    print(f"path of war: {len(classes)} classes, {len(options)} class options {dict(Counter(o['kind'] for o in options))}, "
          f"{len(discs)} disciplines, {len(mans)} maneuvers {dict(Counter(m['type'] for m in mans))}, {len(feat_recs)} feats; "
          f"{len(notices)} notices")


if __name__ == '__main__':
    main()
