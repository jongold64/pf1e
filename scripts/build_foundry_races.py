"""Add races from the Foundry VTT Pathfinder 1e packs to data/races.json (run after build_races.py): races from
later Paizo books (Planar Adventures, Ultimate Wilderness, Blood of the Sea, Inner Sea Races, ...) and a few the
PSRD build doesn't have. Only races from Paizo books with an OGL notice are added (see extract_ogl_notices.py).

Foundry keeps a race's rules in its description ("<li><strong>Darkvision</strong>: ...</li>" under "Standard Racial
Traits" and similar headings) plus structured size, speed, type and ability score changes, which are used here.

Usage: python build_foundry_races.py path/to/races.json   (reads and rewrites that file; set FOUNDRY if needed)
"""
import html, json, re, sys
from bs4 import BeautifulSoup
from common import slug
from foundry import load_pack, load_sources, load_notices, paizo_source, html_text

ORIGIN = 'Foundry VTT pf1'
SIZES = {'fine': 'Fine', 'dim': 'Diminutive', 'tiny': 'Tiny', 'sm': 'Small', 'med': 'Medium', 'lg': 'Large', 'huge': 'Huge'}
ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']
ABILITY_NAMES = {'str': 'Strength', 'dex': 'Dexterity', 'con': 'Constitution', 'int': 'Intelligence', 'wis': 'Wisdom', 'cha': 'Charisma'}
# Standard traits the app treats as structured facts (see CLAUDE.md), by the name Foundry gives them.
KINDS = [(r'^ability score|^[+\-–]\d+ (strength|dexterity|constitution|intelligence|wisdom|charisma)', 'ability_scores'), (r'^type$', 'type'), (r'^size$', 'size'),
         (r'^(base |normal |slow |fast )?speed$', 'speed'), (r'^languages?$', 'languages')]
TYPES = {'monstroushumanoid': 'monstrous humanoid', 'magicalbeast': 'magical beast'}


def traits_from(desc):
    """[{'name', 'text'}] from the description's "<strong>Name</strong>: text" list items."""
    soup = BeautifulSoup(desc or '', 'html.parser')
    out = []
    for li in soup.find_all('li'):
        head = li.find(['strong', 'b'])
        if not head:
            continue
        name = head.get_text(' ', strip=True).rstrip(':').strip()
        head.extract()
        text = html_text(str(li)).lstrip(':').strip()
        if name and text:
            out.append({'name': name, 'text': text})
    return out


def language_lists(text):
    starting = re.search(r'begin play speaking ([^.]*)', text or '')
    bonus = re.search(r'(?:choose from the following|bonus languages?)[^:]*:\s*([^.]*)', text or '')
    def split(s):
        s = re.sub(r'\b(one|any) of the following:\s*', '', s)
        words = [re.sub(r'^(and|or)\s+', '', w.strip()) for w in re.split(r',\s*|\s+and\s+|\s+or\s+', s)]
        return [w for w in words if w]
    return {'starting': split(starting.group(1)) if starting else [], 'bonus': split(bonus.group(1)) if bonus else []}


def main():
    out_path = sys.argv[1]
    races = [r for r in json.load(open(out_path, encoding='utf-8')) if r.get('origin') != ORIGIN]
    have = {r['id'] for r in races} | {r['name'].lower() for r in races}
    books, notices = load_sources(), load_notices()
    licensed = {r['source'] for r in races} | {b for r in races for b in r.get('also_in', [])} | set(notices)
    added, skipped = [], []
    for doc in load_pack('races', 'race'):
        name, s = doc['name'].strip(), doc['system']
        rid = slug(name)
        if rid in have or name.lower() in have:
            continue
        book = paizo_source(doc, books)
        if not book or book not in licensed:
            skipped.append(f'{name} ({book or "not a Paizo book"})')
            continue
        mods = {}
        for ch in (s.get('changes') or {}).values():
            if ch.get('type') == 'racial' and ch.get('target') in ABILITIES and re.fullmatch(r'-?\d+', str(ch.get('formula', '')).strip()):
                mods[ch['target']] = mods.get(ch['target'], 0) + int(ch['formula'])
        desc = (s.get('description') or {}).get('value') or ''
        traits = traits_from(desc)
        for t in traits:
            kind = next((k for pattern, k in KINDS if re.search(pattern, t['name'], re.I)), None)
            # "Lashunta: Lashunta are humanoid with the lashunta subtype." is the type, under the race's name.
            if not kind and re.fullmatch(r'[^.]* (?:is|are) (?:an? )?\w+ with the \w+ subtypes?\.', t['text'].strip(), re.I):
                kind = 'type'
            if kind:
                t['kind'] = kind
            if kind == 'ability_scores' and mods:
                # Named like the PSRD traits: "+2 Dexterity, -2 Constitution, +2 Wisdom".
                t['name'] = ', '.join(f"{v:+d} {ABILITY_NAMES[a]}" for a, v in mods.items())
                t['text'] = re.sub(r'^.*?:\s*', '', t['text']) if ':' in t['text'] else t['text']
            if kind == 'size':
                t['name'] = SIZES.get(s.get('size'), 'Medium')
            # Some entries give only the number: "Natural Armor: +3".
            if re.fullmatch(r'\+\d+', t['text']) and 'natural armor' in t['name'].lower():
                t['text'] = f"{name}s have a {t['text']} natural armor bonus."
        flexible = any(t.get('kind') == 'ability_scores' and re.search(r'\+2 to one ability score', t['text'] + t['name'], re.I) for t in traits)
        intro = BeautifulSoup(desc, 'html.parser')
        first_heading = intro.find(['h2', 'h3', 'ul'])
        summary_html = desc[:desc.find(str(first_heading))] if first_heading else desc
        langs = next((t['text'] for t in traits if t.get('kind') == 'languages'), '')
        senses = [t['name'].lower() for t in traits if re.search(r'vision|scent|blindsense|tremorsense', t['name'], re.I)]
        record = {
            'id': rid, 'name': name, 'plural': f'{name}s', 'source': book, 'category': 'other',
            'summary': html_text(summary_html) or None, 'description': [],
            'ability_modifiers': mods, **({'flexible_ability_bonus': True} if flexible else {}),
            'size': SIZES.get(s.get('size'), 'Medium'), 'base_speed': (s.get('speeds') or {}).get('land'),
            'type': (lambda t: TYPES.get(t, t) or None)(((s.get('creatureTypes') or [None])[0] or '').lower()),
            'subtypes': s.get('creatureSubtypes') or [], 'senses': senses, 'languages': language_lists(langs),
            'traits': traits, 'alternate_traits': [], 'favored_class_options': [], 'origin': ORIGIN,
        }
        if not traits or not mods and not flexible:
            record['incomplete'] = True
        races.append(record)
        added.append(record)
    json.dump(races, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(added)} races added from Foundry:', ', '.join(f"{r['name']} ({r['source']})" for r in added))
    if skipped:
        print('left out:', '; '.join(skipped))


if __name__ == '__main__':
    main()
