"""Write kineticist-elements.json: the kineticist's elements (aether, air, earth, fire, water, void, wood) as class paths,
from the Archives of Nethys element list and wild talent pages (cached in ../../aonprd-classes/lists). Each element:
its book, introduction, class skills, simple and composite blasts (with blast type and damage), defense wild talent
and the wild talents of each level. Only elements from a book whose OGL notice is known are written.

Record shape (like class-paths.json, kind "element"): { id, kind, classes, name, source, text, facts, class_skills,
powers: [{ name, level, text }], blasts: [{ name, type: 'physical' | 'energy', damage, source, text }],
composites: [{ name, type, damage, source, text }], defense: { name, source, text }, talents: { "1": [names] } }.

Usage: python build_aon_kineticist.py path/to/kineticist-elements.json
"""
import json, re, sys, urllib.parse
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book


def proper(name):
    """'shroud of water' -> 'Shroud of Water' (AoN's page names keep small words lower case)."""
    small = {'of', 'the', 'and', 'a', 'an', 'to', 'in'}
    words = name.strip().split()
    return ' '.join(w if i and w.lower() in small else w[:1].upper() + w[1:] for i, w in enumerate(words))


def talent_page(name):
    """A wild talent's AoN page: { source, element, kind, burn, blast_type, damage, text }."""
    text = page_text(aon_page('KT_' + re.sub(r'[^A-Za-z]', '', name),
                              'https://aonprd.com/KineticistTalentsDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
    i = text.lower().find(name.lower() + 'source')
    if i < 0:
        return None
    body = text[i + len(name):]
    src = re.match(r'Source\s*(.*?)\s*pg\.', body)
    head = re.search(r'Element ([^;]*); Type ([^;]*);.*?Burn ([^\n]*)', body)
    blast = re.search(r'Blast Type (\w+); Damage ([^\n]*)', body)
    # The description: after the stat lines, up to the site footer.
    lines = body.split('\n')
    start = next((k for k, l in enumerate(lines) if l.startswith('Blast Type')), next((k for k, l in enumerate(lines) if l.startswith('Element')), 0)) + 1
    desc = '\n'.join(lines[start:]).strip()
    desc = re.split(r'\n(?:Associated Blasts|Prerequisite)|\Z', desc)[0] if not blast else desc
    return {'source': aon_book(src.group(1)) if src else '', 'element': head.group(1).strip() if head else '',
            'kind': head.group(2).strip() if head else '', 'blast_type': blast.group(1) if blast else None,
            'damage': blast.group(2).strip() if blast else None, 'text': re.sub(r'\n{3,}', '\n\n', desc).strip()}


def main():
    out_path = sys.argv[1]
    notices = load_notices()
    text = page_text(aon_page('KineticistElements', 'https://aonprd.com/KineticistElements.aspx'))
    blocks = re.split(r'\n(?=(?:Aether|Air|Earth|Fire|Water|Void|Wood)Source )', '\n' + text)
    elements = []
    for block in blocks:
        m = re.match(r'(Aether|Air|Earth|Fire|Water|Void|Wood)Source (.*?) pg\.[^\n]*\n(.*?)\nClass Skills:\s*(.*?)\n', block, re.S)
        if not m:
            continue
        name, book, intro, skills = m.group(1), aon_book(m.group(2)), m.group(3).strip(), m.group(4)
        if not find_notices(notices, book):
            print(f'  skipped {name}: no OGL notice for {book}')
            continue
        class_skills = [s.strip() for s in re.split(r',| and ', re.sub(r'^.*? adds | to (?:her|his|their) list of class skills\.?$', '', skills)) if s.strip()]
        # (The last element's block runs on into the universal talents: the first line of each kind is the element's.)
        table = {}
        for k, v in re.findall(r'\n(Simple Blasts?|Composite Blasts?|Defense|\d+(?:st|nd|rd|th)) - ([^\n]*)', block):
            table.setdefault(k, v)
        # "magnetism, greater" is one talent (Greater Magnetism): a comma before "greater" or "lesser" joins it.
        names = lambda key: [n.strip() for n in re.split(r',\s*(?![^()]*\))(?!\s*(?:greater|lesser|improved|reactive)\b)', table.get(key, ''))
                             if n.strip() and n.strip() not in ('—', 'N/A')]
        blasts, composites = [], []
        for n in names('Simple Blast') + names('Simple Blasts'):
            t = talent_page(proper(n))
            if t:
                blasts.append({'name': proper(n), 'type': t['blast_type'], 'damage': t['damage'], 'source': t['source'], 'text': t['text'], 'origin': 'aonprd'})
        for n in names('Composite Blasts') + names('Composite Blast'):
            t = talent_page(proper(n))
            if t and find_notices(notices, t['source']):
                composites.append({'name': proper(n), 'type': t['blast_type'], 'damage': t['damage'], 'source': t['source'], 'text': t['text'], 'origin': 'aonprd'})
        defense = None
        for n in names('Defense'):
            t = talent_page(proper(n))
            if t:
                defense = {'name': proper(n), 'source': t['source'], 'text': t['text'], 'origin': 'aonprd'}
        talents = {re.match(r'\d+', k).group(0): [x.replace('†', '').strip() for x in names(k)] for k in table if re.match(r'\d', k)}
        powers = [{'name': f"{b['name']} (simple blast, {b['type']}: {b['damage']})", 'level': 1, 'text': b['text']} for b in blasts]
        if defense:
            powers.append({'name': f"{defense['name']} (defense)", 'level': 2, 'text': defense['text']})
        elements.append({
            'id': f'element-{name.lower()}', 'kind': 'element', 'classes': ['kineticist'], 'name': name, 'source': book,
            'text': intro, 'parent': None,
            'facts': [['Simple blast', ', '.join(f"{b['name'].lower()} ({b['type']}, {b['damage']})" for b in blasts)],
                      ['Defense', defense['name'].lower() if defense else '—'],
                      ['Composite blasts', ', '.join(c['name'].lower() for c in composites) or '—']],
            'class_skills': class_skills, 'spells': [], 'spells_by': 'class', 'powers': powers, 'hexes': [],
            'blasts': blasts, 'composites': composites, 'defense': defense, 'talents': talents, 'origin': 'aonprd',
        })
    json.dump(elements, open(out_path, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'kineticist-elements.json: {len(elements)} elements ({", ".join(e["name"] for e in elements)}), '
          f'{sum(len(e["blasts"]) for e in elements)} simple and {sum(len(e["composites"]) for e in elements)} composite blasts')


if __name__ == '__main__':
    main()
