"""Build familiars.json: the arcane bond choices. Bonded objects (Core Rulebook, the wizard's Arcane Bond) and the familiars
(the Archives of Nethys familiar table: each familiar, what it gives its master, its books), cached in
../../aonprd-classes/lists. Only familiars from a book whose OGL notice is known are kept. The master's bonus is read into
numbers where it's a plain bonus ("+3 bonus on Stealth checks", "+2 bonus on Reflex saves", "+3 hit points", "+4 bonus on
initiative checks", "+1 natural armor bonus to AC"); conditional ones ("... in bright light") stay as text.

Familiars also carry their base statistics (`stats`), read from the creature's AoN stat block (Bestiary), for the app to
turn into the familiar at the master's level; the Improved Familiar list (needs the feat) adds `improved: true`, the
arcane caster level needed (`min_level`) and the alignment allowed.

Each record (like class-paths.json): { id, kind ('arcane-bond' | 'familiar'), classes, name, source, text, parent: null,
facts, class_skills: [], spells: [], spells_by: 'class', powers: [], hexes: [], master_bonus: [{ target, type, value }],
stats, improved, min_level, alignment, origin }

Usage: python build_aon_familiars.py path/to/familiars.json
"""
import json, re, sys
from bs4 import BeautifulSoup
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, aon_book, page_text

ORIGIN = 'aonprd'
# The bonded objects a wizard can choose (Core Rulebook, Arcane Bond).
BONDED_OBJECTS = ['Amulet', 'Ring', 'Staff', 'Wand', 'Weapon']
CLASSES = ['wizard', 'witch', 'arcanist', 'sorcerer', 'magus']
SKILLS = ['Acrobatics', 'Appraise', 'Bluff', 'Climb', 'Diplomacy', 'Disable Device', 'Disguise', 'Escape Artist', 'Fly',
          'Handle Animal', 'Heal', 'Intimidate', 'Linguistics', 'Perception', 'Perform', 'Profession', 'Ride', 'Sense Motive',
          'Sleight of Hand', 'Spellcraft', 'Stealth', 'Survival', 'Swim', 'Use Magic Device']


def master_bonus(text):
    """The master's bonus as effects, when it's unconditional; [] otherwise."""
    t = re.sub(r'\s*\(.*?\)', '', text).strip().rstrip('.')
    m = re.fullmatch(r'Master gains a \+(\d+) bonus on (.+?) checks', t)
    if m and m.group(2) in SKILLS:
        return [{'target': f'skill:{m.group(2)}', 'type': 'untyped', 'value': int(m.group(1))}]
    if m and m.group(2).lower() == 'initiative':
        return [{'target': 'init', 'type': 'untyped', 'value': int(m.group(1))}]
    m = re.fullmatch(r'Master gains a \+(\d+) bonus on (Fortitude|Reflex|Will) saves', t)
    if m:
        return [{'target': {'Fortitude': 'fort', 'Reflex': 'ref', 'Will': 'will'}[m.group(2)], 'type': 'untyped', 'value': int(m.group(1))}]
    m = re.fullmatch(r'Master gains (?:a )?\+?(\d+) hit points', t)
    if m:
        return [{'target': 'hp', 'type': 'untyped', 'value': int(m.group(1))}]
    m = re.fullmatch(r'Master gains a \+(\d+) natural armor bonus to AC', t)
    if m:
        return [{'target': 'ac', 'type': 'natural armor', 'value': int(m.group(1))}]
    return []


def stat_block(href):
    """A creature's base statistics from its AoN monster page: { size, type, alignment, ac, touch, flat, natural, hp, hd,
    fort, ref, will, defenses, speed, melee, ranged, space, reach, scores, bab, feats, skills: [[name, total]], racial,
    senses, languages, sq, special_attacks, abilities }."""
    name = href.split('ItemName=', 1)[1]
    text = page_text(aon_page('Monster_' + re.sub(r'[^A-Za-z]', '', name), 'https://aonprd.com/' + href.replace(' ', '%20')))
    m = re.search(r'CR [\d/]+Source', text)
    if not m:
        return None
    t = text[m.start():]
    t = t.split('Description', 1)[0] if 'Special Abilities' not in t.split('Description', 1)[0] else t
    f = lambda pat, flags=0: (re.search(pat, t, flags) or [None, None])[1]
    num = lambda v: int(v.replace('–', '-').replace('+', '')) if v else 0
    kind = re.search(r'\n(LG|NG|CG|LN|N|CN|LE|NE|CE|Any[^\n]*?) (Fine|Diminutive|Tiny|Small|Medium|Large|Huge) ([a-z ]+?)(?: \(([^)]*)\))?\n', t)
    ac = re.search(r'AC (\d+), touch (\d+), flat-footed (\d+)(?: \(([^)]*)\))?', t)
    nat = re.search(r'\+(\d+) natural', ac.group(4) or '') if ac else None
    hp = re.search(r'hp (\d+) \((\d+)(?:d\d+)', t)
    saves = re.search(r'Fort ([+–-]\d+), Ref ([+–-]\d+), Will ([+–-]\d+)', t)
    scores = {}
    for a in ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']:
        v = re.search(a + r' (\d+|—|-)', t.split('Statistics', 1)[-1])
        scores[a.lower()] = int(v.group(1)) if v and v.group(1).isdigit() else None
    skills_line = f(r'Skills ([^\n]+?)(?:Ecology|\n)') or ''
    skills_part, _, racial_part = skills_line.partition('; Racial Modifiers')
    defenses = t.split('Will ', 1)[-1].split('Offense', 1)[0]
    defenses = '\n'.join(l for l in defenses.split('\n')[1:] if l.strip()).strip()
    abilities = t.split('Special Abilities', 1)[1].split('Description', 1)[0].strip() if 'Special Abilities' in t else ''
    return {
        'size': kind.group(2) if kind else '', 'type': (kind.group(3) if kind else '').strip(), 'subtypes': kind.group(4) if kind and kind.group(4) else '',
        'alignment': kind.group(1) if kind else '',
        'ac': int(ac.group(1)) if ac else None, 'touch': int(ac.group(2)) if ac else None, 'flat': int(ac.group(3)) if ac else None,
        'ac_parts': ac.group(4) if ac else '', 'natural': int(nat.group(1)) if nat else 0,
        'hp': int(hp.group(1)) if hp else None, 'hd': int(hp.group(2)) if hp else None,
        'fort': num(saves.group(1)) if saves else 0, 'ref': num(saves.group(2)) if saves else 0, 'will': num(saves.group(3)) if saves else 0,
        'defenses': defenses,
        'speed': (f(r'Speed ([^\n]+)') or '').strip(), 'melee': (f(r'\nMelee ([^\n]+)') or '').strip(), 'ranged': (f(r'\nRanged ([^\n]+)') or '').strip(),
        'space': (f(r'Space ([^,\n]+)') or '').strip(), 'reach': (f(r'Reach ([^\n]+?)(?:Statistics|\n)') or '').strip(),
        'special_attacks': (f(r'Special Attacks ([^\n]+)') or '').strip(),
        'scores': scores, 'bab': num(f(r'Base Atk ([+–-]\d+)')),
        'cmb': num(f(r'CMB ([+–-]\d+)')) if f(r'CMB ([+–-]\d+)') else None, 'cmd': int(f(r'CMD (\d+)')) if f(r'CMD (\d+)') else None,
        'feats': [x.strip() for x in (f(r'\nFeats ([^\n]+)') or '').split(',') if x.strip()],
        'skills': [[m.group(1).strip(), num(m.group(2))] for m in re.finditer(r'([A-Z][A-Za-z ()]+?) ([+–-]\d+)', skills_part)],
        'racial': racial_part.strip(),
        'senses': (f(r'Senses ([^\n]+?); Perception') or '').strip(),
        'languages': (f(r'\nLanguages ([^\n]+)') or '').strip(), 'sq': (f(r'\nSQ ([^\n]+?)(?:Ecology|\n)') or '').strip(),
        'abilities': abilities,
    }


def record(kind, name, source, text, **extra):
    return {'kind': kind, 'classes': CLASSES, 'name': name, 'source': source, 'text': text, 'parent': None, 'facts': [],
            'class_skills': [], 'spells': [], 'spells_by': 'class', 'powers': [], 'hexes': [], 'master_bonus': [], **extra}


def main():
    out, skipped = [], []
    wizard = next(c for c in json.load(open(sys.argv[1].replace('familiars.json', 'classes.json'), encoding='utf-8')) if c['id'] == 'wizard')
    bond = next(f['text'] for f in wizard['features'] if f['name'] == 'Arcane Bond')
    for name in BONDED_OBJECTS:
        r = record('arcane-bond', f'Bonded object: {name.lower()}', 'Core Rulebook', bond)
        r['classes'] = ['wizard', 'sorcerer']
        out.append({'id': f'bond-{slug(name)}', **r, 'origin': 'psrd'})
    notices = load_notices()
    page = aon_page('WizardFamiliars', 'https://aonprd.com/WizardFamiliars.aspx')
    table = next(t for t in BeautifulSoup(page, 'html.parser').find_all('table')
                 if [c.get_text(' ', strip=True) for c in t.find('tr').find_all(['th', 'td'])][:2] == ['Familiar', 'Special Ability'])
    for tr in table.find_all('tr')[1:]:
        cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
        if len(cells) < 3 or not cells[0]:
            continue
        name, ability, sources = cells[0].rstrip('*').strip(), cells[1], cells[2]  # "Raven*": a table footnote mark
        books = [aon_book(b.split(' pg.')[0]) for b in re.split(r'\s*,\s*(?=[A-Z])', sources) if b.strip()]
        # The Core Rulebook first when it's one of them (the Animal Archive repeats the core familiars).
        book = next((b for b in sorted(books, key=lambda b: b != 'Core Rulebook') if find_notices(notices, b)), None)
        if not book:
            skipped.append(f'{name} ({sources})')
            continue
        link = tr.find('a')
        r = record('familiar', name, book, '', master_bonus=master_bonus(ability),
                   stats=stat_block(link['href']) if link and 'MonsterDisplay' in link['href'] else None)
        r['facts'] = [['Master gains', re.sub(r'^Master gains\s*', '', ability)], ['Also in', ', '.join(b for b in books if b != book)]]
        r['facts'] = [f for f in r['facts'] if f[1]]
        out.append({'id': f'familiar-{slug(name)}', **r, 'origin': ORIGIN})
    # Improved familiars (the Improved Familiar feat): alignment, arcane caster level needed, book.
    improved = next(t for t in BeautifulSoup(page, 'html.parser').find_all('table')
                    if [c.get_text(' ', strip=True) for c in t.find('tr').find_all(['th', 'td'])][:2] == ['Familiar', 'Alignment'])
    for tr in improved.find_all('tr')[1:]:
        cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
        if len(cells) < 4 or not cells[0]:
            continue
        name, alignment, level, sources = cells
        name = name.rstrip('*').strip()
        books = [aon_book(b.split(' pg.')[0]) for b in re.split(r'\s*,\s*(?=[A-Z])', sources) if b.strip()]
        book = next((b for b in books if find_notices(notices, b)), None)
        if not book:
            skipped.append(f'{name} ({sources})')
            continue
        link = tr.find('a')
        lv = re.match(r'(\d+)', level)
        r = record('familiar', name, book, '', improved=True, min_level=int(lv.group(1)) if lv else 1, alignment=alignment or 'Any',
                   stats=stat_block(link['href']) if link and 'MonsterDisplay' in link['href'] else None)
        r['facts'] = [['Improved familiar', f'needs the Improved Familiar feat and arcane caster level {lv.group(1) if lv else "?"}'],
                      ['Alignment', alignment or 'any']]
        fid = f'familiar-{slug(name)}'
        out.append({'id': fid if all(x['id'] != fid for x in out) else f'{fid}-improved', **r, 'origin': ORIGIN})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'arcane bonds and familiars;', sum(1 for r in out if r['master_bonus']), 'with a counted bonus; skipped:', skipped)


if __name__ == '__main__':
    main()
