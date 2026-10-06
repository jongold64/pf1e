"""Build class-paths.json: the one-time choices that shape a class, from the Archives of Nethys pages (cached in
../../aonprd-classes/lists, downloaded once): wizard arcane schools (with focused and elemental schools), witch patrons,
shaman spirits, cavalier and samurai orders, unchained summoner eidolon subtypes and eidolon base forms. (Sorcerer and
bloodrager bloodlines are in bloodlines.json.) Only entries from a book whose OGL notice is known are kept.

Each record: { id, kind, classes: [class ids], name, source, text, parent (a focused school's school, else null),
               facts: [[label, text]], class_skills: [skill names], spells: [{ level, name }], spells_by ('class' level or
               'spell' level), powers: [{ name, level, text }], hexes: [names], origin }

Usage: python build_aon_class_paths.py path/to/class-paths.json
"""
import json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book
from build_aon_bloodlines import LEVEL

# A power: "Intense Spells (Su): " or "Sudden Sting (Ex, Sp): " at the start of a line (here a tag is required, so a
# label like "Requirements:" isn't a power).
POWER = re.compile(r"(?:^|\n)([A-Z][A-Za-z'’\-]*(?:,? [A-Za-z'’\-]+){0,6})"
                   r"\s+\((?:Su|Ex|Sp)(?:,\s*(?:Su|Ex|Sp))*\)(?: \(\s*[^()]{3,80}? pg\. ?\d+\s*\))?:\s*")

ORIGIN = 'aonprd'
# "Order of the LionSource Advanced Player's Guide pg. 36": a section heading inside a page, on its own line or run on
# after a sentence ("...like wall of fire. Admixture SchoolSource ..."). Some name a second book after a comma.
HEADING = re.compile(r"(?:^|\n|(?<=[.)\]]) ?)([A-Z][A-Za-z'’ ():\-]{1,70}?)Source ([^\n]+)\n")


def first_book(text):
    """"Adventurer's Guide pg. 132, Advanced Class Origins pg. 13" -> "Adventurer's Guide" (a comma alone doesn't split:
    "Qadira, Jewel of the East")."""
    return aon_book(text.split(' pg.')[0])


# A book code run into a spell name ("wall of nauseaACG").
BOOK_CODE = re.compile(r'(?<=[a-z)])(?:APG|ACG|ARG|UM|UC|UI|UW|UE|OA|HA|ISWG|ISM|ISG|B\d|MA|AA)$')


def sections(text):
    """[(name, book, body)] for each "NameSource Book pg. N" heading, the body running to the next heading."""
    ms = list(HEADING.finditer(text))
    # A regional school is headed "Cheliax: Egorian Academy Infernal Binder School": the name is after the colon.
    return [(m.group(1).split(': ')[-1].strip(), first_book(m.group(2)), text[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(text)].strip())
            for i, m in enumerate(ms)]


def field(body, label):
    m = re.search(r'(?:^|\n)' + label + r':\s*(.+)', body)
    return m.group(1).strip() if m else ''


def intro(body):
    return body.split('\n\n')[0].strip()


def powers_in(body, first_level=1):
    """Each "Name (Su): text" in the body, its level the one its first sentence names (else `first_level`)."""
    ms = list(POWER.finditer(body))
    out = []
    for i, m in enumerate(ms):
        text = re.sub(r'\n{2,}', '\n\n', body[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(body)]).strip()
        lv = LEVEL.search(re.split(r'(?<=\.)\s', text, maxsplit=1)[0])
        out.append({'name': m.group(1).strip(), 'level': int(lv.group(1)) if lv else first_level, 'text': text})
    return out


def spell_list(text):
    """'enlarge person (1st), fog cloud (2nd)' or '2nd — jump, 4th — cat's grace' -> [{ level, name }]."""
    out = []
    for part in re.split(r',\s*(?![^()]*\))', text.rstrip('.')):
        part = part.strip()
        m = re.match(r'(.+?)\s*\((\d+)(?:st|nd|rd|th)\)$', part) or re.match(r'(\d+)(?:st|nd|rd|th)\s*[—–-]\s*(.+)$', part)
        if not m:
            continue
        name, lv = (m.group(1), m.group(2)) if not m.group(1)[0].isdigit() else (m.group(2), m.group(1))
        out.append({'level': int(lv), 'name': BOOK_CODE.sub('', name.replace('*', '').strip())})
    return out


def record(kind, classes, name, book, body, **extra):
    return {'kind': kind, 'classes': classes, 'name': name, 'source': book, 'text': intro(body), 'parent': None, 'facts': [],
            'class_skills': [], 'spells': [], 'spells_by': 'class', 'powers': [], 'hexes': [], **extra}


def schools():
    """Wizard schools: each page has the school, then its focused schools ("Associated School: Evocation")."""
    page = aon_page('WizardSchools', 'https://aonprd.com/WizardSchools.aspx')
    out = []
    for name in sorted({n for n in re.findall(r'SchoolDisplay\.aspx\?ItemName=([^"&]+)', page)}):
        text = page_text(aon_page('School_' + re.sub(r'[^A-Za-z]', '', name), 'https://aonprd.com/SchoolDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
        secs = [s for s in sections(text) if s[0].endswith('School') or s[0].endswith('School)')]
        for i, (title, book, body) in enumerate(secs):
            assoc = field(body, 'Associated School').rstrip('.') if i > 0 else ''
            # A focused school's school is named on its page ("Associated School: Evocation"); an elemental school's
            # own focused schools (Ice, Smoke) belong to it.
            if not assoc and i > 0:
                assoc = re.sub(r'\s*\(Elemental School\)|\s+School$', '', secs[0][0])
            r = record('school', ['wizard'], re.sub(r'\s*\(Elemental School\)|\s+School$', '', title), book, body, parent=assoc or None)
            if assoc:
                r['text'] = (re.split(r'\nAssociated School:', body)[0].strip().split('\n\n')[0]
                             if not body.startswith('Associated School') else '')
                rep = field(body, 'Replacement Powers')
                r['facts'] = [['Associated school', assoc], ['Replacement powers', rep]]
                r['powers'] = powers_in(body.split('Replacement Powers:', 1)[-1].split('\n', 1)[-1])
            else:
                opp = field(body, 'Opposition School') or field(body, 'Opposed School')
                r['facts'] = [['Opposition school', opp.rstrip('.')]] if opp else []
                r['powers'] = powers_in(body)
            out.append(r)
    return out


def patrons():
    """Witch patrons: one page, "Agility (Advanced Player's Guide pg. 70): 2nd — jump, 4th — cat's grace, ..."."""
    text = page_text(aon_page('WitchPatrons', 'https://aonprd.com/WitchPatrons.aspx'))
    out = []
    for m in re.finditer(r'\n([A-Z][A-Za-z\'’ \-]{2,40}) \(([^()]+?)\):\s*(2nd\s*[—–-][^\n]+)', text):
        r = record('patron', ['witch'], m.group(1).strip(), first_book(m.group(2)), '')
        r['text'] = ''
        r['spells'] = spell_list(m.group(3))
        out.append(r)
    return out


def spirits():
    """Shaman spirits: spirit magic spells (by spell level), hexes, spirit animal, spirit ability (1st), greater (8th),
    true (16th) and manifestation (20th)."""
    page = aon_page('ShamanSpirits', 'https://aonprd.com/ShamanSpirits.aspx')
    out = []
    for name in sorted(set(re.findall(r'ShamanSpiritDisplay\.aspx\?ItemName=([^"&]+)', page))):
        text = page_text(aon_page('ShamanSpirit_' + re.sub(r'[^A-Za-z]', '', name),
                                  'https://aonprd.com/ShamanSpiritDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
        secs = sections(text)
        if not secs:
            continue
        title, book, body = secs[0]
        r = record('spirit', ['shaman'], name, book, body, spells_by='spell')
        r['spells'] = spell_list(field(body, 'Spirit Magic Spells'))
        hexes = body.split('\nHexes:', 1)[-1].split('\nSpirit Animal:', 1)[0]
        r['hexes'] = [p['name'] for p in powers_in(hexes.split('\n', 1)[-1])]
        r['facts'] = [['Spirit animal', field(body, 'Spirit Animal')]]
        for label, level in [('Spirit Ability', 1), ('Greater Spirit Ability', 8), ('True Spirit Ability', 16)]:
            part = re.search(r'\n' + label + r':[^\n]*\n+(.+?)(?=\n(?:Greater Spirit Ability|True Spirit Ability|Manifestation):|\Z)', body, re.S)
            if part:
                for p in powers_in('\n' + part.group(1).strip())[:1]:
                    out_p = {**p, 'level': level}
                    r['powers'].append(out_p)
        man = field(body, 'Manifestation')
        if man:
            r['powers'].append({'name': 'Manifestation', 'level': 20, 'text': man})
        out.append(r)
    return out


def orders():
    """Cavalier (and samurai) orders: edicts, challenge, skills, and order abilities by level."""
    page = aon_page('CavalierOrders', 'https://aonprd.com/CavalierOrders.aspx')
    out = []
    for name in sorted(set(re.findall(r'CavalierOrders\.aspx\?ItemName=([^"&]+)', page))):
        name = name.replace('&#39;', "'")
        text = page_text(aon_page('CavalierOrder_' + re.sub(r'[^A-Za-z]', '', name.replace('Order of the ', '').replace('Order of ', '')),
                                  'https://aonprd.com/CavalierOrders.aspx?ItemName=' + urllib.parse.quote(name)))
        secs = [s for s in sections(text) if s[0].startswith(name.split(' (')[0])]
        if not secs:
            continue
        title, book, body = secs[0]
        r = record('order', ['cavalier', 'samurai'], name, book, body)
        skills = field(body, 'Skills')
        # "... adds Knowledge (nature) (Int) and Survival (Wis) to his list of class skills."
        added = (re.search(r'adds? (.+?) to (?:his|her|their|the) (?:list of )?class skills', skills)
                 or re.search(r'gains? (.+?) as (?:a )?class skills?', skills))
        r['class_skills'] = [x for x in (re.sub(r'\s*\((?:Str|Dex|Con|Int|Wis|Cha)\)', '', part).strip()
                                         for part in re.split(r',\s*(?:and\s+)?|\s+and\s+', added.group(1) if added else ''))
                             if x and x[0].isupper()]
        r['facts'] = [['Edicts', field(body, 'Edicts')], ['Challenge', field(body, 'Challenge')], ['Skills', skills]]
        r['powers'] = powers_in(body.split('Order Abilities:', 1)[-1].split('\n', 1)[-1], first_level=2)
        out.append(r)
    return out


def eidolons():
    """Unchained eidolon subtypes (alignment, base form, base evolutions at 1st, 4th, 8th...) and base forms (both
    summoners)."""
    out = []
    for title, book, body in sections(page_text(aon_page('EidolonUCSubtypes', 'https://aonprd.com/EidolonUCSubtypes.aspx'))):
        r = record('eidolon-subtype', ['summoner-unchained'], title, book, body)
        r['facts'] = [['Alignment', field(body, 'Alignment').rstrip('.')], ['Base form', field(body, 'Base Form')]]
        evo = body.split('Base Evolutions:', 1)[-1]
        for para in [p.strip() for p in evo.split('\n\n') if p.strip()]:
            lv = LEVEL.search(para)
            if lv:
                r['powers'].append({'name': f'{lv.group(1)}{"st" if lv.group(1) in ("1", "21") else "th"}-level evolutions',
                                    'level': int(lv.group(1)), 'text': para})
        out.append(r)
    for page, cls in [('EidolonBaseForms', 'summoner'), ('EidolonUCBaseForms', 'summoner-unchained')]:
        for title, book, body in sections(page_text(aon_page(page, f'https://aonprd.com/{page}.aspx'))):
            r = record('base-form', [cls], title, book, body)
            r['text'] = ''
            r['facts'] = [[k.strip(), v.strip()] for k, v in re.findall(r'(?:^|;\s*)([A-Z][A-Za-z ]+):\s*([^;]+)', field(body, 'Starting Statistics'))]
            r['facts'] = [['Size', field(body, 'Starting Statistics').split(';')[0].replace('Size', '').strip()]] + r['facts']
            out.append(r)
    return out


def main():
    notices = load_notices()
    out, skipped = [], []
    for r in [*schools(), *patrons(), *spirits(), *orders(), *eidolons()]:
        if not r['source'] or not find_notices(notices, r['source']):
            skipped.append(f"{r['kind']} {r['name']} ({r['source'] or 'no book'})")
            continue
        r['facts'] = [[k, v] for k, v in r['facts'] if v]
        cls = r['classes'][-1] if r['kind'] == 'base-form' else r['classes'][0]
        out.append({'id': f"{r['kind']}-{cls}-{slug(r['name'])}" if r['kind'] == 'base-form' else f"{r['kind']}-{slug(r['name'])}",
                    **r, 'origin': ORIGIN})
    seen = set()
    out = [r for r in out if not (r['id'] in seen or seen.add(r['id']))]
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    from collections import Counter
    print(len(out), 'class paths', dict(Counter(r['kind'] for r in out)), '; skipped:', skipped)


if __name__ == '__main__':
    main()
