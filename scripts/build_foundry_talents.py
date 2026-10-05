"""Build talents.json: the options classes pick from at set levels (rage powers, rogue talents, ninja tricks, hexes,
alchemist discoveries, magus arcana, revelations, investigator and slayer talents, arcanist exploits, vigilante talents,
kineticist wild talents and infusions, oracle curses), from the Foundry VTT Pathfinder 1e class-abilities pack, where
each is tagged with its kind. Only options from Paizo books with an OGL notice are kept.

Each record: { id, name, kind, classes: [class ids], source, text, level (the minimum class level the text names, or
null), repeatable (the text says it can be taken more than once), mystery (revelations: the oracle mystery), origin }

Usage: python build_foundry_talents.py path/to/talents.json   (set FOUNDRY if needed; reads classes.json beside it)
"""
import json, os, re, sys
from collections import Counter
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
# Foundry tag -> the app's kind of choice.
KINDS = {
    'Rage Power': 'rage-power', 'Rage Power, Totem': 'rage-power', 'Rage Power, Blood': 'rage-power',
    'Rogue Talent': 'rogue-talent', 'Rogue Talent, Advanced': 'advanced-rogue-talent',
    'Ninja Trick': 'ninja-trick', 'Ninja Trick, Master': 'master-ninja-trick',
    'Alchemist Discovery': 'discovery', 'Bomb Discovery': 'discovery',
    'Hex': 'hex', 'Major Hex': 'major-hex', 'Grand Hex': 'grand-hex', 'Shaman Spirit Hex': 'hex',
    'Magus Arcana': 'magus-arcana', 'Revelation': 'revelation', 'Curse': 'oracle-curse',
    'Investigator Talent': 'investigator-talent', 'Slayer Talent': 'slayer-talent', 'Slayer Talent, Advanced': 'advanced-slayer-talent',
    'Arcanist Exploit': 'arcanist-exploit', 'Arcanist Exploit, Greater': 'greater-arcanist-exploit',
    'Vigilante Talent': 'vigilante-talent', 'Vigilante Talents': 'vigilante-talent', 'Vigilante Social Talent': 'social-talent',
    'Utility Wild Talent': 'wild-talent', 'Substance Infusion': 'infusion', 'Form Infusion': 'infusion',
}
ORDINAL = r'(\d+)(?:st|nd|rd|th)'


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
