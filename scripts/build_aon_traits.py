"""Add to traits.json the Paizo traits that PSRD-Data and the d20pfsrd pages lack (Wayang Spellhunter, from the Dragon
Empires Primer...), from the Archives of Nethys trait lists and each trait's page (cached in ../../aonprd-classes/lists).
A trait whose name (letters only) is already in the file is skipped; one from a book without a known OGL notice is left
out and counted. Run after build_d20_traits.py.

Usage: python build_aon_traits.py path/to/traits.json   (adds to the file)
"""
import html, json, os, re, sys, urllib.parse
from collections import Counter
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book
from build_traits import effects_of, skill_names
from common import slug

ORIGIN = 'Archives of Nethys'
# AoN's trait types -> the categories traits.json uses.
TYPES = {'Basic (Combat)': 'Combat', 'Basic (Faith)': 'Faith', 'Basic (Magic)': 'Magic', 'Basic (Social)': 'Social',
         'Campaign': 'Campaign', 'Cosmic': 'Cosmic', 'Equipment': 'Equipment', 'Exemplar': 'Exemplar', 'Faction': 'Faction',
         'Family': 'Family', 'Mount': 'Mount', 'Race': 'Race', 'Region': 'Regional', 'Religion': 'Religion'}


def key(name):
    return re.sub(r'[^a-z0-9]', '', html.unescape(name).replace('’', "'").lower())


def trait_names(kind):
    page = aon_page('traits-type-' + re.sub(r'\W+', '-', kind).strip('-').lower(), 'https://aonprd.com/Traits.aspx?Type=' + urllib.parse.quote(kind))
    names = [html.unescape(urllib.parse.unquote(n)) for n in re.findall(r'href="TraitDisplay\.aspx\?ItemName=([^"]+)"', page)]
    return list(dict.fromkeys(names))


def parse(name, page):
    """{ source, requirement, text } from a trait page: "<name>Source <book> pg. N\\nCategory X\\nRequirement(s) Y\\n<text>"."""
    t = page_text(page)
    i = t.find(f'{name}Source ')
    if i < 0:
        return None
    body = t[i + len(name):]
    m = re.match(r'Source (.+?)(?:\n|$)', body)
    if not m:
        return None
    source = aon_book(re.sub(r'\s*pg\..*$', '', m.group(1).split(',')[0]).strip())
    rest = body[m.end():]
    rest = re.sub(r'^Category [^\n]*\n', '', rest)
    req = re.match(r'Requirements?\(?s?\)? ([^\n]*)\n', rest)
    if req:
        rest = rest[req.end():]
    text = re.split(r'\n(?:Archives of Nethys|Site Owner)', rest)[0].strip()
    return {'source': source, 'requirement': req.group(1).strip() if req else None, 'text': re.sub(r'\n{3,}', '\n\n', text)}


def main():
    out_path = sys.argv[1]
    traits = json.load(open(out_path, encoding='utf-8'))
    have = {key(t['name']) for t in traits}
    ids = {t['id'] for t in traits}
    notices = load_notices()
    skills = skill_names(os.path.dirname(os.path.abspath(out_path)))
    added, skipped = [], Counter()
    for kind, category in TYPES.items():
        for name in trait_names(kind):
            if key(name) in have:
                continue
            page = aon_page('trait-' + slug(name), 'https://aonprd.com/TraitDisplay.aspx?ItemName=' + urllib.parse.quote(name))
            info = parse(name, page)
            if not info or not info['text']:
                skipped['(no page text)'] += 1
                continue
            if not find_notices(notices, info['source']):
                skipped[info['source']] += 1
                continue
            tid = slug(name)
            while tid in ids:
                tid += '-' + slug(category)
            rec = {'id': tid, 'name': name, 'source': info['source'], 'category': category,
                   **({'requirement': info['requirement']} if info['requirement'] else {}), 'text': info['text'], 'origin': ORIGIN}
            fx = effects_of(info['text'], skills)
            if fx:
                rec['effects'] = fx
            traits.append(rec)
            ids.add(tid)
            have.add(key(name))
            added.append(name)
    json.dump(traits, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'Added {len(added)} traits from the Archives of Nethys ({len(traits)} in all).')
    if skipped:
        print(f'  left out: {sum(skipped.values())}: ' + ', '.join(f'{b} ({n})' for b, n in skipped.most_common()))


if __name__ == '__main__':
    main()
