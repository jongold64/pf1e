"""Build familiars.json: the arcane bond choices. Bonded objects (Core Rulebook, the wizard's Arcane Bond) and the familiars
(the Archives of Nethys familiar table: each familiar, what it gives its master, its books), cached in
../../aonprd-classes/lists. Only familiars from a book whose OGL notice is known are kept. The master's bonus is read into
numbers where it's a plain bonus ("+3 bonus on Stealth checks", "+2 bonus on Reflex saves", "+3 hit points", "+4 bonus on
initiative checks", "+1 natural armor bonus to AC"); conditional ones ("... in bright light") stay as text.

Each record (like class-paths.json): { id, kind ('arcane-bond' | 'familiar'), classes, name, source, text, parent: null,
facts, class_skills: [], spells: [], spells_by: 'class', powers: [], hexes: [], master_bonus: [{ target, type, value }],
origin }

Usage: python build_aon_familiars.py path/to/familiars.json
"""
import json, re, sys
from bs4 import BeautifulSoup
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, aon_book

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


def record(kind, name, source, text, **extra):
    return {'kind': kind, 'classes': CLASSES, 'name': name, 'source': source, 'text': text, 'parent': None, 'facts': [],
            'class_skills': [], 'spells': [], 'spells_by': 'class', 'powers': [], 'hexes': [], 'master_bonus': [], **extra}


def main():
    out, skipped = [], []
    wizard = next(c for c in json.load(open(sys.argv[1].replace('familiars.json', 'classes.json'), encoding='utf-8')) if c['id'] == 'wizard')
    bond = next(f['text'] for f in wizard['features'] if f['name'] == 'Arcane Bond')
    for name in BONDED_OBJECTS:
        r = record('arcane-bond', f'Bonded object: {name.lower()}', 'Core Rulebook', bond)
        r['classes'] = ['wizard']
        out.append({'id': f'bond-{slug(name)}', **r, 'origin': 'psrd'})
    notices = load_notices()
    page = aon_page('WizardFamiliars', 'https://aonprd.com/WizardFamiliars.aspx')
    table = next(t for t in BeautifulSoup(page, 'html.parser').find_all('table')
                 if [c.get_text(' ', strip=True) for c in t.find('tr').find_all(['th', 'td'])][:2] == ['Familiar', 'Special Ability'])
    for tr in table.find_all('tr')[1:]:
        cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
        if len(cells) < 3 or not cells[0]:
            continue
        name, ability, sources = cells[0], cells[1], cells[2]
        books = [aon_book(b.split(' pg.')[0]) for b in re.split(r'\s*,\s*(?=[A-Z])', sources) if b.strip()]
        # The Core Rulebook first when it's one of them (the Animal Archive repeats the core familiars).
        book = next((b for b in sorted(books, key=lambda b: b != 'Core Rulebook') if find_notices(notices, b)), None)
        if not book:
            skipped.append(f'{name} ({sources})')
            continue
        r = record('familiar', name, book, '', master_bonus=master_bonus(ability))
        r['facts'] = [['Master gains', re.sub(r'^Master gains\s*', '', ability)], ['Also in', ', '.join(b for b in books if b != book)]]
        r['facts'] = [f for f in r['facts'] if f[1]]
        out.append({'id': f'familiar-{slug(name)}', **r, 'origin': ORIGIN})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'arcane bonds and familiars;', sum(1 for r in out if r['master_bonus']), 'with a counted bonus; skipped:', skipped)


if __name__ == '__main__':
    main()
