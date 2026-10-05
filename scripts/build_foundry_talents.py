"""Build talents.json: the options classes pick from at set levels (rage powers, rogue talents, ninja tricks, hexes,
alchemist discoveries, magus arcana, revelations, investigator and slayer talents, arcanist exploits, vigilante talents,
kineticist wild talents and infusions, shifter aspects), from the Foundry VTT Pathfinder 1e class-abilities pack, where
each is tagged with its kind. Kinds Foundry doesn't tag come from the Archives of Nethys list pages (paladin mercies,
unchained monk ki powers and style strikes, phrenic amplifications, mesmerist tricks and bold stares, occultist focus
powers, oracle curses; pages cached in ../../aonprd-classes/lists) and from the class texts in classes.json
(antipaladin cruelties, stalwart defender powers, battle herald commands, loremaster secrets). Only options from Paizo
books with an OGL notice are kept.

Each record: { id, name, kind, classes: [class ids], source, text, level (the minimum class level the text names, or
null), repeatable (the text says it can be taken more than once), mystery (revelations: the oracle mystery), origin }

Usage: python build_foundry_talents.py path/to/talents.json   (set FOUNDRY if needed; reads classes.json beside it)
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from collections import Counter
from bs4 import BeautifulSoup
from common import slug
from foundry import load_pack, load_sources, load_notices, find_notices, paizo_source, html_text
from common import ALL_BOOKS, iter_books, clean

# PSRD subtypes of the same kinds of options, for Foundry entries that don't name their book: the name is looked up
# among these (an oracle mystery's revelations are sections inside it).
PSRD_SUBTYPES = {'barbarian_rage_power', 'rogue_talent', 'rogue_advanced_talent', 'ninja_trick', 'alchemist_discovery',
                 'witch_hex', 'witch_major_hex', 'witch_grand_hex', 'shaman_hex', 'magus_arcana', 'oracle_mystery', 'curse',
                 'investigator_talent', 'slayer_talent', 'slayer_advanced_talent', 'arcanist_exploit', 'arcanist_greater_exploit'}


def psrd_books():
    """{letters-only name: book} for every option PSRD has (first book wins, in publication order)."""
    out = {}
    def walk(n, book):
        for ch in n.get('children') or []:
            k = re.sub(r'[^a-z]', '', clean(ch.get('name') or '').lower())
            if k:
                out.setdefault(k, book)
            walk(ch, book)
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        for n in rows.values():
            if n.get('subtype') in PSRD_SUBTYPES:
                k = re.sub(r'[^a-z]', '', clean(n.get('name') or '').lower())
                out.setdefault(k, book)
                if n.get('subtype') == 'oracle_mystery':
                    walk(n, book)
    return out

ORIGIN = 'Foundry VTT pf1'
CLASS_KINDS = {'cruelty', 'defensive-power', 'inspiring-command', 'loremaster-secret'}
# Foundry tag -> the app's kind of choice.
KINDS = {
    'Rage Power': 'rage-power', 'Rage Power, Totem': 'rage-power', 'Rage Power, Blood': 'rage-power',
    'Rage Power, Stance': 'rage-power', 'Rage Power, Elemental': 'rage-power', 'Shifter Aspect': 'shifter-aspect',
    'Rogue Talent': 'rogue-talent', 'Rogue Talent, Advanced': 'advanced-rogue-talent',
    'Ninja Trick': 'ninja-trick', 'Ninja Trick, Master': 'master-ninja-trick',
    'Alchemist Discovery': 'discovery', 'Bomb Discovery': 'discovery',
    'Hex': 'hex', 'Major Hex': 'major-hex', 'Grand Hex': 'grand-hex', 'Shaman Spirit Hex': 'spirit-hex',
    'Magus Arcana': 'magus-arcana', 'Revelation': 'revelation', 'Curse': 'oracle-curse',
    'Investigator Talent': 'investigator-talent', 'Slayer Talent': 'slayer-talent', 'Slayer Talent, Advanced': 'advanced-slayer-talent',
    'Arcanist Exploit': 'arcanist-exploit', 'Arcanist Exploit, Greater': 'greater-arcanist-exploit',
    'Vigilante Talent': 'vigilante-talent', 'Vigilante Talents': 'vigilante-talent', 'Vigilante Social Talent': 'social-talent',
    'Utility Wild Talent': 'wild-talent', 'Substance Infusion': 'infusion', 'Form Infusion': 'infusion',
}
ORDINAL = r'(\d+)(?:st|nd|rd|th)'

# Archives of Nethys list pages: page -> (kind, class ids, {heading: kind for the options after it}). The first group
# are kinds Foundry doesn't tag; the second fill in options Foundry has without a book.
AON_LISTS = {
    'PaladinMercies': ('mercy', ['paladin'], {}),
    'MonkUCKiPowers': ('ki-power', ['monk-unchained'], {}),
    'MonkUCStyleStrikes': ('style-strike', ['monk-unchained'], {}),
    'PhrenicAmplifications': ('phrenic-amplification', ['psychic'], {'Major Amplifications': 'major-phrenic-amplification'}),
    'MesmeristTricks': ('mesmerist-trick', ['mesmerist'], {'Masterful Tricks': 'masterful-trick'}),
    'MesmeristStares': ('bold-stare', ['mesmerist'], {}),
    'OracleCurses': ('oracle-curse', ['oracle'], {}),
    'AlchemistDiscoveries': ('discovery', ['alchemist'], {}),
    'InvestigatorTalents': ('investigator-talent', ['investigator'], {}),
    'MagusArcana': ('magus-arcana', ['magus'], {}),
    'NinjaTricks': ('ninja-trick', ['ninja'], {'Advanced Ninja Tricks': 'master-ninja-trick'}),
    'RogueTalents': ('rogue-talent', ['rogue'], {'Advanced Rogue Talents': 'advanced-rogue-talent'}),
    'RogueUnchainedTalents': ('rogue-talent', ['rogue-unchained'], {'Advanced Rogue Talents': 'advanced-rogue-talent'}),
    'SlayerTalents': ('slayer-talent', ['slayer'], {'Advanced Slayer Talents': 'advanced-slayer-talent'}),
    'VigilanteTalents': ('social-talent', ['vigilante'], {'Vigilante Talents': 'vigilante-talent'}),
    'WitchHexes': ('hex', ['witch'], {'Major Hexes': 'major-hex', 'Grand Hexes': 'grand-hex'}),
    'ShamanHexes': ('hex', ['shaman'], {}),
    **{f'RagePowers_{t}': ('rage-power', ['barbarian', 'barbarian-unchained', 'skald'], {})
       for t in ['Offensive', 'Defensive', 'Misc', 'Blood', 'Elemental', 'Totem']},
}
# AoN addresses that aren't just the page name.
AON_URLS = {f'RagePowers_{t}': f'https://aonprd.com/BarbarianRagePowers.aspx?Type={t}'
            for t in ['Offensive', 'Defensive', 'Misc', 'Blood', 'Elemental', 'Totem']}
# Kinds whose options share names: the same option under two of these is one option (a rogue talent a slayer can take).
GROUPS = {k: 'rogue' for k in ['rogue-talent', 'advanced-rogue-talent', 'slayer-talent', 'advanced-slayer-talent',
                                'ninja-trick', 'master-ninja-trick']}
GROUPS.update({k: 'hex' for k in ['hex', 'major-hex', 'grand-hex']})
# The occultist's implement schools: each page lists its focus powers.
IMPLEMENT_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', "Mage's Paraphernalia",
                     'Necromancy', "Performer's Accoutrements", "Saint's Holy Regalia", 'Transmutation', 'Trappings of the Warrior']
AON_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'aonprd-classes', 'lists')
# Options listed in a class feature's own text: (class id, feature name, kind).
CLASS_TEXT_LISTS = [('antipaladin', 'Cruelty', 'cruelty'), ('stalwart-defender', 'Defensive Powers', 'defensive-power'),
                    ('battle-herald', 'Inspiring Command', 'inspiring-command'), ('loremaster', 'Secret', 'loremaster-secret')]
# An option on AoN: "Name (Su) (Book pg. 12): text".
AON_OPTION = re.compile(r"([A-Z][A-Za-z'’,\- ]{2,60}?)\s*(?:\((?:Ex|Su|Sp)\)\s*)?\(\s*([^():]{3,80}?) pg\. ?\d+\s*\)\s*:\s*")


def aon_page(name, url):
    """A cached Archives of Nethys page (downloaded once, pausing between requests)."""
    os.makedirs(AON_CACHE, exist_ok=True)
    path = os.path.join(AON_CACHE, name + '.html')
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'pf1e-builder personal character builder (class options import)'})
        open(path, 'w', encoding='utf-8').write(urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace'))
        time.sleep(1)
    return open(path, encoding='utf-8').read()


def page_text(page):
    """The page's text with paragraph breaks kept (from <br>s), spaces tidied, the site footer cut off."""
    page = re.sub(r'<br\s*/?>', '\n', page, flags=re.I)
    t = BeautifulSoup(page, 'html.parser').body.get_text('')
    t = '\n'.join(re.sub(r'\s+', ' ', line).strip() for line in t.split('\n'))
    t = re.sub(r'\n{2,}', '\n\n', t).split('Site Owner:')[0]
    # A single break inside a paragraph is a wrapped line (some pages copy the book's lines): join it.
    return re.sub(r'(?<=[a-z,’;])\n(?=[a-z(])', ' ', t)


def aon_book(book):
    return re.sub(r'^PRPG ', '', book.strip())


def aon_options(text, kind, headings):
    """[(name, book, text, kind, level)] from a list page: each option runs to the next one; a level heading ("6th-Level
    Mercies") or a kind heading ("Major Amplifications") between two options ends the first and applies to what follows."""
    # Headings stand on a line of their own.
    heads = r'(?m)^(?:' + '|'.join([re.escape(h) for h in headings] + [ORDINAL + r'-Level [A-Z][a-z]+']) + r')\s*$'
    out, cur_kind, cur_level = [], kind, None
    ms = list(AON_OPTION.finditer(text))
    for i, m in enumerate(ms):
        body = text[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(text)]
        h = re.search(heads, body)
        out.append((m.group(1).strip(), aon_book(m.group(2)), (body[:h.start()] if h else body).strip(), cur_kind, cur_level))
        # Headings in this option's tail change the kind or level of the options after it.
        for hm in re.finditer(heads, body):
            if hm.group(0).strip() in headings:
                cur_kind = headings[hm.group(0).strip()]
            elif hm.group(1):
                cur_level = int(hm.group(1))
    # A heading before the first option.
    return out


def arcanist_exploits():
    """The arcanist exploits list: "Name (Su)Source Book pg. 13", a "Strength Normal|Greater" line, then the text."""
    text = page_text(aon_page('ArcanistExploits', 'https://aonprd.com/ArcanistExploits.aspx'))
    pat = re.compile(r"(?:^|\n|\. )([A-Z][A-Za-z'’,\- ]{2,50}?) \((?:Su|Ex|Sp)\)\s*Source (.+?) pg\. ?\d+\s*\nStrength (\w+)\n")
    ms = list(pat.finditer(text))
    return [(m.group(1).strip(), aon_book(m.group(2)), text[m.end():ms[i + 1].start() + 1 if i + 1 < len(ms) else len(text)].strip(),
             'greater-arcanist-exploit' if m.group(3) == 'Greater' else 'arcanist-exploit') for i, m in enumerate(ms)]


def implement_powers(school):
    """The focus powers of one occultist implement school: [(name, book, text, school)]."""
    url = 'https://aonprd.com/OccultistImplementsDisplay.aspx?ItemName=' + urllib.parse.quote(school)
    text = page_text(aon_page('Implement_' + re.sub(r'[^A-Za-z]+', '_', school), url))
    src = re.search(r'Source\s*:?\s*(.+?) pg\.', text)
    book = aon_book(src.group(1)) if src else ''
    part = text.split('Focus Powers :', 1)[-1] if 'Focus Powers :' in text else text.split('Focus Powers:', 1)[-1]
    pat = re.compile(r"(?:^|\n)([A-Z][A-Za-z'’\- ]{2,40}) \((?:Su|Sp|Ex)\)(?: \(\s*([^()]{3,80}?) pg\. ?\d+\s*\))?\s*:\s*")
    ms = list(pat.finditer(part))
    return [(m.group(1).strip(), aon_book(m.group(2)) if m.group(2) else book,
             part[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(part)].strip(), school) for i, m in enumerate(ms)]


def class_text_options(feature_text):
    """Options written as "Name: text" paragraphs in a class feature ("• Shaken: The target is shaken..."), with the level
    from the last "At 6th level..." paragraph before them; the loremaster's table rows "4 | Name | Effect" too."""
    out, level = [], None
    for para in feature_text.split('\n'):
        para = para.strip().lstrip('• ').strip()
        row = re.match(r'^(\d+) \| ([^|]+) \| (.+)$', para)
        if row:
            out.append((row.group(2).strip().capitalize(), f'{row.group(3).strip()}. (Needs loremaster level + Intelligence modifier {row.group(1)}.)', None))
            continue
        at = re.match(r'^At ' + ORDINAL + ' level', para)
        if at:
            level = int(at.group(1))
            continue
        m = re.match(r"^([A-Z][A-Za-z'’ \-]{2,40}?)\*?: (.+)$", para)
        if m and not m.group(1).startswith(('Prerequisite', 'Benefit', 'Special', 'Note')):
            out.append((m.group(1).strip(), m.group(2).strip(), level))
    return out


def main():
    out_path = sys.argv[1]
    classes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(out_path)), 'classes.json'), encoding='utf-8'))
    class_id = {c['name'].lower(): c['id'] for c in classes}
    class_id.update({'barbarian (unchained)': 'barbarian-unchained', 'rogue (unchained)': 'rogue-unchained',
                     'monk (unchained)': 'monk-unchained', 'summoner (unchained)': 'summoner-unchained'})
    books, notices = load_sources(), load_notices()
    from_psrd = psrd_books()
    out, skipped = {}, Counter()
    for d in load_pack('class-abilities'):
        s = d['system']
        tags = s.get('tags') or []
        kinds = [KINDS[t] for t in tags if t in KINDS]
        if not kinds:
            continue
        kind = kinds[0]
        book = paizo_source(d, books)
        if not book and not (s.get('sources') or []):
            # No book in Foundry: the PSRD book that has an option of this name.
            plain = re.sub(r'\s*\(.*\)\s*$', '', d['name'])
            book = from_psrd.get(re.sub(r'[^a-z]', '', plain.lower())) or from_psrd.get(re.sub(r'[^a-z]', '', d['name'].lower()))
            if not book:
                skipped['no book in Foundry or PSRD'] += 1
                continue
        if not book or not find_notices(notices, book):
            skipped['no Paizo book with a notice'] += 1
            continue
        text = html_text((s.get('description') or {}).get('value') or '').strip()
        if not text:
            skipped['no text'] += 1
            continue
        # "Increased Damage Reduction" etc.; Foundry adds the kind to some names to tell them apart ("Fast Bombs (Discovery)").
        name = re.sub(r'\s*\((?:rage power|rogue talent|discovery|hex|magus arcana|revelation|ninja trick|exploit)\)\s*$', '', d['name'], flags=re.I).strip()
        # Foundry's class codes: "(ROG)" etc. only tell same-named entries apart, so they go; the unchained and shaman
        # versions differ from the others, so they're named so.
        code = re.search(r'\s*\(([A-Z]{2,4}|Talent)\)$', name)
        if code:
            name = name[:code.start()] + {'UC': ' (Unchained)', 'SHA': ' (shaman)'}.get(code.group(1), '')
        if re.search(r'Advanced Talents|^Rogue Talents?$', name):
            skipped['a class feature, not an option'] += 1
            continue
        lv = re.search(r'(?:at least|must be(?: at least)?|of)\s+' + ORDINAL + r' level', text, re.I) \
            or re.search(r'\b' + ORDINAL + r'[- ]level (?:barbarian|rogue|witch|alchemist|magus|oracle|ninja|investigator|slayer|arcanist|vigilante|kineticist|shaman|skald)', text, re.I)
        mystery = next((t.replace(' Mystery', '') for t in tags if t.endswith(' Mystery')), None)
        rec = {
            'id': slug(name), 'name': name, 'kind': kind,
            'classes': sorted({class_id[c.lower()] for c in ((s.get('associations') or {}).get('classes') or []) if c.lower() in class_id}),
            'source': book, 'text': text, 'level': int(lv.group(1)) if lv else None,
            'repeatable': bool(re.search(r'more than once|multiple times|up to (?:two|three|four|five) times|selected (?:more than|multiple)', text, re.I)),
            **({'mystery': mystery} if mystery else {}), 'origin': ORIGIN,
        }
        key = f'{kind}|{rec["id"]}'
        if key in out:
            skipped['duplicate'] += 1
            continue
        out[key] = rec

    def add(name, kind, cids, book, text, level=None, **extra):
        """An option from AoN or a class text, unless its book lacks a notice or Foundry already gave it."""
        if not book or not find_notices(notices, book):
            skipped['AoN/class text: no Paizo book with a notice'] += 1
            return
        if not level:
            lv = re.search(r'(?:at least|must be(?: at least)?|of)\s+' + ORDINAL + r' level', text, re.I)
            level = int(lv.group(1)) if lv else None
        rec = {'id': slug(name), 'name': name, 'kind': kind, 'classes': cids, 'source': book, 'text': text, 'level': level,
               'repeatable': bool(re.search(r'more than once|multiple times|up to (?:two|three|four|five) times', text, re.I)),
               **extra, 'origin': 'aonprd' if kind not in CLASS_KINDS else 'PSRD'}
        # Already there (from Foundry, or another class's list): that one stays, and this class can take it too.
        # (Matched by name without a "(shaman)"-style ending, preferring the version this class already has.)
        base = lambda n: slug(re.sub(r'\s*\(.*?\)$', '', n))
        alike = [r for r in out.values() if base(r['name']) == base(name) and GROUPS.get(r['kind'], r['kind']) == GROUPS.get(kind, kind)]
        same = next((r for r in alike if set(r['classes']) & set(cids)), alike[0] if alike else None)
        if same:
            same['classes'] = sorted(set(same['classes']) | set(cids))
            skipped['AoN: already there'] += 1
            return
        out[f'{kind}|{rec["id"]}'] = rec

    for page, (kind, cids, headings) in AON_LISTS.items():
        text = page_text(aon_page(page, AON_URLS.get(page, f'https://aonprd.com/{page}.aspx')))
        for name, book, body, k, level in aon_options(text, kind, headings):
            add(name, k, cids, book, body, level)
    # Each mystery's own revelations (the page's book unless one names another).
    from build_aon_mysteries import mystery_pages
    for m in mystery_pages():
        for name, book, body in m['revelations']:
            add(name, 'revelation', ['oracle'], book or m['source'], body, mystery=m['name'])
    for name, book, body, k in arcanist_exploits():
        add(name, k, ['arcanist'], book, body)
    for school in IMPLEMENT_SCHOOLS:
        for name, book, body, sch in implement_powers(school):
            add(f'{name} ({sch})', 'focus-power', ['occultist'], book, body, school=sch)
    by_id = {c['id']: c for c in classes}
    for cid, feature, kind in CLASS_TEXT_LISTS:
        f = next(x for x in by_id[cid]['features'] if x['name'] == feature)
        for name, body, level in class_text_options(f['text']):
            add(name, kind, [cid], by_id[cid]['source'], body, level)
    # Ids are unique across kinds ("Fast Learner" is both a rogue talent and a slayer talent).
    seen = Counter(r['id'] for r in out.values())
    for r in out.values():
        if seen[r['id']] > 1:
            r['id'] = f'{r["kind"]}-{r["id"]}'
    talents = sorted(out.values(), key=lambda r: (r['kind'], r['name'].lower()))
    json.dump(talents, open(out_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(talents), 'class talents', dict(Counter(r['kind'] for r in talents)))
    print('skipped', dict(skipped))
    print('with a level:', sum(1 for r in talents if r['level']), '| repeatable:', sum(1 for r in talents if r['repeatable']))


if __name__ == '__main__':
    main()
