"""data/third-party.json: the talented monk (Rogue Genius Games, Owen K.C. Stephens), read from the two PDFs the user owns:
The Genius Guide to the Talented Monk and The Genius Guide to More Monk Talents. The app offers it only on a character
that has the book ticked under Third-party books (Build tab).

The class (Table 1 with its specialty attack bonus, class skills, the general rules) becomes a class record shaped like
data/classes.json; each edge, talent, advanced talent and grand talent becomes a class-choice record shaped like
data/talents.json (kinds tm-edge, tm-talent, tm-advanced-talent, tm-grand-talent). Talents that pick from a list (ki
power, elemental ki power, aspect master, unearthly path / way / master) become one record per list entry, named
"Ki Power: Barkskin", with the talent's rules in each.

The PDFs carry the buyer's name on every page; those lines are dropped. Section 15 notices (hand-copied below) go to
LICENSE-OGL.txt through build_license.py.

Needs pypdf and cryptography (the Talented Monk PDF is encrypted).
Usage: python build_rgg_talented_monk.py path/to/third-party.json [folder with the PDFs, default ../../3rd Party]
"""
import json, os, re, sys
import pypdf
from common import slug

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', '3rd Party')
ORIGIN = 'Rogue Genius Games'
BOOK = 'The Genius Guide to the Talented Monk'
MORE = 'The Genius Guide to More Monk Talents'
BOOK_ID = 'talented-monk'
CLASS_ID = 'talented-monk'
KINDS = {'edge': 'tm-edge', 'talent': 'tm-talent', 'advanced talent': 'tm-advanced-talent', 'grand talent': 'tm-grand-talent'}

# Section 15 of each book (the books' own wording; the PDF text breaks it across lines and pages).
NOTICES = {
    BOOK: [
        'The Book of Experimental Might. ©2008, Monte J. Cook. All rights reserved.',
        'Tome of Horrors. ©2002, Necromancer Games, Inc.; Authors: Scott Greene, with Clark Peterson, Erica Balsley, Kevin '
        'Baase, Casey Christofferson, Lance Hawvermale, Travis Hawvermale, Patrick Lawinger, and Bill Webb; Based on original '
        'content from TSR.',
        'Tome of Horrors III, copyright 2005 Necromancer Games, Inc.; Author: Scott Greene, with Casey Christofferson, Erica '
        'Balsley, Kevin Baase, Lance Hawvermale, Travis Hawvermale, Ian S. Johnston, Patrick Lawringer, Nathan Paul, Clark '
        'Peterson, Greg Ragland, Robert Schwalb and Bill Webb',
        'The Genius Guide To: The Talented Monk. ©2013, Rogue Genius Games. Author: Owen K.C. Stephens',
    ],
    MORE: ['The Genius Guide To More Monk Talents. ©2013, Super Genius Games. Author: Owen K.C. Stephens.'],
}
# Names the books' theme lists spell differently from the entries.
NAME_FIXES = {'exertadvice': 'expertadvice', 'tongueofthesunandthemoon': 'tongueofthesunandmoon'}
# Talents that pick one entry from a list: the list's items become the options. key -> label in the option names.
PICK_LISTS = {'kipower': 'Ki Power', 'advancedkipower': 'Ki Power', 'grandkipower': 'Ki Power',
              'elementalkipower': 'Elemental Ki Power', 'advancedelementalkipower': 'Elemental Ki Power',
              'grandelementalkipower': 'Elemental Ki Power'}
# Talents whose named versions ("Aspect of the Carp: ...") follow in the text: each version becomes an option.
VERSIONS = {'aspectmaster': r'Aspect of the [A-Z][\w-]+', 'unearthlypath': r'Path of [A-Z]\w+',
            'unearthlyway': r'Way of [A-Z]\w+', 'unearthlymaster': r'[A-Z]\w+ Mastery'}
# The fighting style edge's weapon groups (each a paragraph "Axes: bardiche, battleaxe, ..."): one option per group.
GROUPS = ['Axes', 'Blades, Heavy', 'Blades, Light', 'Bows', 'Close', 'Crossbows', 'Double', 'Firearms', 'Flails', 'Hammers',
          'Improvised', 'Monk', 'Natural', 'Pirate', 'Polearms', 'Spears', 'Thrown']


def norm(name):
    k = re.sub(r'[^a-z]', '', name.lower())
    return NAME_FIXES.get(k, k).rstrip('s')  # "ki powers" = "ki power"


def pages(name):
    r = pypdf.PdfReader(os.path.join(PDF_DIR, name + '.pdf'))
    out = []
    for p in r.pages:
        lines = (p.extract_text() or '').replace(' ', ' ').split('\n')
        # The buyer's name and order number, and the page number at the top.
        lines = [l.rstrip() for l in lines if not re.search(r'\(Order #\d+\)', l)]
        if lines and re.fullmatch(r'\s*\d+\s*', lines[0]):
            lines = lines[1:]
        out.append(lines)
    return out


def themes(lines):
    """{ name key: kind } from a book's "talents by theme" lists: "Blindsight (advanced talent)"; a plain name is a talent."""
    out, joined = {}, []
    for l in lines:  # "Secret techniques (advanced" / "talent)"
        if joined and re.search(r'\((?:advanced|grand)\s*$', joined[-1]):
            joined[-1] = f'{joined[-1].rstrip()} {l.strip()}'
        else:
            joined.append(l)
    for l in joined:
        m = re.fullmatch(r'\s*([A-Z][\w’\'\- ]+?)\s*(?:\((edge|talent|advanced talent|grand talent)\))?\s*', l)
        if m and len(m.group(1)) < 45:
            out.setdefault(norm(m.group(1).replace('V ow', 'Vow').replace('V olley', 'Volley')), m.group(2) or 'talent')
    return out


def join(lines):
    """Lines of one entry -> text: a word broken at a line end is joined; a short line ending a sentence ends a paragraph."""
    text = ''
    for i, l in enumerate(lines):
        l = l.strip()
        if not l:
            continue
        if not text:
            text = l
        elif text.endswith('-') and not text.endswith(' -'):
            text = text + l if re.match(r'[a-z]', l) else text + ' ' + l
        elif re.search(r'[.:!?)]$', text) and len(lines[i - 1].strip()) < 38:
            text += '\n\n' + l
        else:
            text += ' ' + l
    # "Dragon' s breath" (the PDF's kerning) -> "Dragon's breath".
    return re.sub(r" ?' s\b", "'s", re.sub(r' {2,}', ' ', text.replace('’', "'").replace('‘', "'"))).strip()


ENTRY = re.compile(r'^([A-Z][A-Za-z’\'\-]*(?: [A-Za-z’\'\-]+){0,6}?)(?: \((Ex|Su|Sp|Ex or Sp)\))?(\*)?\s*:\s*(.*)$')
# The section headings, as the PDFs print them ("Monk TalenTs", "advanced Monk TalenTs", "Grand Monk TalenTs").
HEADING = re.compile(r'\s*(Monk edges|Monk TalenTs|advanced Monk TalenTs|[Gg]rand (?:Monk )?TalenTs)\s*')
HEAD_KIND = {'monkedge': 'edge', 'monktalent': 'talent', 'advancedmonktalent': 'advanced talent', 'grandmonktalent': 'grand talent',
             'grandtalent': 'grand talent'}


def entries(lines, known, book):
    """[{ name, kind, type, weapon, archetype, lines }] in reading order. An entry starts with a known name followed by
    "(Ex):" or ":"; section headings set the kind for names the theme lists don't give."""
    out, kind, intro = [], None, False
    # A name the column broke over two lines ("Grand Extreme" / "Endurance (Ex): ..."): joined first.
    merged = []
    for l in lines:
        m = ENTRY.match(f'{merged[-1].strip()} {l.strip()}') if merged else None
        if m and ':' not in merged[-1] and len(merged[-1].strip()) < 30 and norm(m.group(1)) in known:
            merged[-1] = f'{merged[-1].strip()} {l.strip()}'
        else:
            merged.append(l)
    for l in merged:
        h = HEADING.fullmatch(l)
        if h:
            kind, intro = HEAD_KIND[norm(h.group(1))], True
            continue
        m = ENTRY.match(l.strip())
        # A known name, or any name with its (Ex)/(Su)/(Sp) type; "Normal:" and "Path of Aeons:" lines stay in the entry.
        if m and (norm(m.group(1)) in known or m.group(2)) and kind:
            intro = False
            rest = m.group(4)
            arch = re.match(r'\[([^\]]+)\]\s*', rest)
            out.append({'name': m.group(1).strip(), 'kind': kind, 'type': m.group(2), 'weapon': bool(m.group(3)),
                        'archetype': [a.strip() for a in arch.group(1).split(',')] if arch else [],
                        'lines': [rest[arch.end():] if arch else rest], 'book': book})
        elif out and kind and not intro:  # a section's opening rules aren't part of the entry before it
            out[-1]['lines'].append(l)
    return out


LIST_HEAD = re.compile(r'^\s*(\d+)(?:st|nd|rd|th)[ -]level (?:elemental )?ki powers\s*$', re.I)
ELEMENTS = {'air': 'air', 'earth': 'earth', 'fire': 'fire', 'water': 'water'}


def pick_list(lines, default_level=None):
    """The entry's own rules and its list: (rule lines, [(level, element, item)]). Items wrap ("Resist energy (1 ki point,
    self only,\\nelectricity only)"): a line that doesn't close its bracket runs on."""
    rules, items, level, element, buf = [], [], None, None, ''
    for l in lines:
        s = l.strip()
        m = LIST_HEAD.match(s)
        if m:
            level, element = int(m.group(1)), None
            continue
        if level is None and default_level and s.lower() in ELEMENTS:  # grand lists have no level heading
            level = default_level
        if level is None:
            rules.append(l)
            continue
        if s.lower() in ELEMENTS:
            element = ELEMENTS[s.lower()]
            continue
        buf = f'{buf} {s}'.strip() if buf else s
        if buf.count('(') <= buf.count(')'):
            items.append((level, element, buf.replace('’', "'")))
            buf = ''
    return rules, items


def level_needed(text):
    """The level in the entry's requirement sentence ("A monk must be at least 8th level and ...")."""
    m = re.search(r'A monk must [^.]*?\bbe (?:at least )?(\d+)(?:st|nd|rd|th)[ -]level', text)
    return int(m.group(1)) if m else None


def strip_sidebars(lines):
    """The Talented Monk's sidebar ("Where are my unarmed strikes?!") and the Deadly Strikes tables, which sit in the
    middle of other entries; the tables come back as rows ("Level | Small | Medium | Large") for Deadly Strikes."""
    out, tables, skip, table = [], [], False, None
    for l in lines:
        s = l.strip()
        if re.match(r'WHere Are my UnArmeD StrikeS', s, re.I):
            skip = True
            continue
        if skip:
            if s.endswith('are selected.'):
                skip = False
            continue
        t = re.match(r'DeADly StrikeS tAble (\d)', s, re.I)
        if t:
            table = {'n': t.group(1), 'rows': []}
            tables.append(table)
            continue
        if table is not None:
            row = re.match(r'^(1st–3rd|4th–7th|8th–11th|12th–15th|16th–19th|20th) (\S+) (\S+) (\S+)$', s)
            if row:
                table['rows'].append(' | '.join(row.groups()))
                if row.group(1) == '20th':
                    table = None
            continue
        out.append(l)
    return out, tables


def class_record(lines):
    text = '\n'.join(lines)
    rows = re.findall(r'^(\d+) ([+\d/]+) ([+\d/]+) \+(\d+) \+(\d+) \+(\d+) (.+)$', text, re.M)
    ints = lambda s: [int(x) for x in s.replace('+', '').split('/')]
    progression = [{'level': int(lv), 'bab': ints(bab), 'specialty_bab': ints(spec), 'fort': int(f), 'ref': int(r), 'will': int(w),
                    'special': [s.strip() for s in special.split(',')]} for lv, bab, spec, f, r, w, special in rows]
    skills = re.search(r'class skills are (.+?)\.\s', text.replace('\n', ' '), re.S).group(1)
    class_skills = [{'skill': re.sub(r'\s+', ' ', m.group(1)).strip(), 'ability': m.group(2).lower()}
                    for m in re.finditer(r'(?:and )?([A-Z][\w ()]+?) \((Str|Dex|Con|Int|Wis|Cha)\)', skills)]
    para = lambda start, end: join(text[text.index(start):text.index(end)].split('\n'))
    features = [
        {'name': 'Weapon Proficiency', 'text': para('Monks are proficient with the club', 'Monk edges')},
        {'name': 'Specialty Attack Bonus', 'text': 'A talented monk has a specialty attack bonus (Table 1) as well as his base attack '
         'bonus. He uses it in place of his base attack bonus for attacks and combat maneuvers with weapons he has taken the '
         'fighting style edge or adaptive style talent for, and for his CMD with the maneuver training talent.'},
        {'name': 'Monk Edges', 'text': para('Every monk develops a unique set of abilities', 'Advice (Ex)')},
        {'name': 'Monk Talents', 'text': 'As a talented monk gains experience, he learns a number of talents that expand his martial '
         'mastery and vast personal insight. Starting at 1st, a talented monk gains two monk talents. He gains an additional two '
         'monk talents at 2nd level and again at 3rd, and then one at each level shown on Table 1. A monk cannot select an '
         'individual talent more than once unless the talent specifies otherwise.\n\nMonk talents that require an action of any '
         'kind (including free actions) cannot be used when the monk is wearing armor of any kind, unless the monk has an edge '
         'or talent that says otherwise (such as the light armor kata edge). Monk talents marked with an asterisk* are '
         'weapon-related, and can only be used with weapons for which the monk has taken the fighting style edge or adaptive '
         'style talent.'},
        {'name': 'Advanced Talents', 'text': 'At 10th level, and every monk level thereafter, a monk can choose an advanced talent '
         'in place of a monk talent. Advanced talents otherwise follow the rules for talents.'},
        {'name': 'Grand Talent', 'text': 'At 20th level a monk may select one grand talent. A monk may select a talent or advanced '
         'talent in place of a grand talent, if that is preferred.'},
    ]
    summary = ('Rogue Genius Games\' rewrite of the monk: instead of fixed class features and bonus feats, a talented monk '
               'builds his own martial art from edges (core training such as unfettered kata, fighting style, flurry of blows '
               'or a ki pool), talents, advanced talents from 10th level and a grand talent at 20th.')
    return {'id': CLASS_ID, 'name': 'Talented Monk', 'source': BOOK, 'category': 'third-party', 'summary': summary,
            'hit_die': 'd8', 'alignment': 'Any lawful.', 'role': '', 'class_skills': class_skills, 'skill_ranks_per_level': 4,
            'starting_wealth': {'dice': '1d6 x 10 gp', 'average_gp': 35}, 'progression': progression, 'features': features,
            'origin': ORIGIN, 'third_party': BOOK_ID}


def main():
    out_path = sys.argv[1]
    tm = pages('The_Genius_Guide_to_the_Talented_Monk')
    more = pages('The_Genius_Guide_to_More_Monk_Talents')
    known = {**themes([l for p in more[8:9] for l in p]), **themes([l for p in tm[18:20] for l in p])}
    tm_body, tables = strip_sidebars([l for p in tm[1:18] for l in p])
    more_body = [l for p in more[:8] for l in p]
    cls = class_record([l for p in tm[1:3] for l in p])
    records, seen = [], set()

    def add(name, kind, text, e, **extra):
        rid = 'tm-' + slug(name)
        if rid in seen:
            return
        seen.add(rid)
        rec = {'id': rid, 'name': name, 'kind': KINDS[kind], 'classes': [CLASS_ID], 'source': e['book'], 'text': text,
               'level': extra.pop('level', None) or level_needed(text) or (10 if kind == 'advanced talent' else 20 if kind == 'grand talent' else None),
               'repeatable': extra.pop('repeatable', bool(re.search(r'may (?:be )?(?:selected|taken) (?:more than once|a second time)', text))),
               'origin': ORIGIN, 'third_party': BOOK_ID}
        if e['type']:
            rec['type'] = e['type']
        if e['weapon']:
            rec['weapon'] = True
        if e['archetype']:
            rec['archetype'] = e['archetype']
        rec.update(extra)
        records.append(rec)

    for e in entries(tm_body, known, BOOK) + entries(more_body, known, MORE):
        k = norm(e['name'])
        kind = e['kind']  # the section it's in (the theme lists have slips: trick shot is an advanced talent)
        if k in PICK_LISTS:
            rules, items = pick_list(e['lines'], 20 if kind == 'grand talent' else None)
            rule_text = join(rules)
            for level, element, item in items:
                spell = re.match(r'^(.+?)\s*,?\s*(?:†\s*)?\((.*)\)\s*$', item)
                what, detail = (spell.group(1).rstrip(' ,†'), spell.group(2)) if spell else (item, '')
                what = what[0].upper() + what[1:]
                name = f"{PICK_LISTS[k]}: {what}" + (f' ({element})' if element else '')
                tier = 'talent' if level < 10 else 'advanced talent' if level < 20 else 'grand talent'
                add(name, tier, f'{what} ({detail}){", " + element + " only" if element else ""}; {level}th-level '
                    f'{PICK_LISTS[k].lower()}.\n\n{rule_text}', e, level=level, repeatable=False, pick=e['name'],
                    **({'element': element} if element else {}))
            continue
        text = join(e['lines'])
        if k == 'deadlystrike':
            for t in tables:
                text += f"\n\nDeadly Strikes Table {t['n']}\nMonk level | Small | Medium | Large\n" + '\n'.join(t['rows'])
        if k == 'fightingstyle':
            parts = re.split(r'\s*\b(' + '|'.join(map(re.escape, GROUPS)) + r'): ', text)
            for group, weapons in zip(parts[1::2], parts[2::2]):
                add(f'Fighting Style: {group.title()}', kind, f'{group}: {weapons.strip()}\n\n{parts[0].strip()}', e,
                    repeatable=False, pick=e['name'], weapon_group=group.title())
            continue
        if k in VERSIONS:
            parts = re.split(rf'\n\n(?=(?:{VERSIONS[k]}):)', text)
            if len(parts) > 1:
                for p in parts[1:]:
                    vname = p.split(':', 1)[0]
                    add(f"{e['name']}: {vname}", kind, f'{p}\n\n{parts[0]}', e, repeatable=False, pick=e['name'])
                continue
        add(e['name'], kind, text, e)

    missing = sorted(set(known) - {norm(r.get('pick') or r['name']) for r in records} - set(PICK_LISTS))
    data = {'books': [{'id': BOOK_ID, 'name': 'Talented Monk', 'publisher': ORIGIN, 'author': 'Owen K.C. Stephens',
                       'sources': [BOOK, MORE], 'notices': NOTICES[BOOK] + NOTICES[MORE],
                       'note': 'Talented Monk: the class is in the class list (Classes tab, Third-party group); its edges and '
                               'talents are chosen like rogue talents.'}],
            'classes': [cls], 'talents': sorted(records, key=lambda r: (r['kind'], r['name']))}
    json.dump(data, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    from collections import Counter
    print(f"talented monk: {len(cls['progression'])} levels, {len(cls['class_skills'])} class skills; "
          f"{len(records)} options: {dict(Counter(r['kind'] for r in records))}")
    if missing:
        print('  in the theme lists but not read:', ', '.join(missing))


if __name__ == '__main__':
    main()
