"""Build spells.json from PSRD-Data.

Spell details (school, components, range, ...) and class spell levels come from the spell_details, spell_lists
and spell_effects tables. Mythic spells are left out (they need mythic tiers). When a spell is in several
books, the earliest book's entry is kept and the others are listed in `also_in`.
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, node_text, clean

SMALL_WORDS = {'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'}


def title(name):
    """The source capitalizes every word ("Cloak Of Chaos"); lowercase small words after the first."""
    words = name.split(' ')
    return ' '.join([words[0]] + [w.lower() if w.lower() in SMALL_WORDS else w for w in words[1:]])


def main():
    spells = {}
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        details = {r[0]: r for r in c.execute(
            'select section_id, school, subschool_text, descriptor_text, component_text, casting_time, range, duration, '
            'saving_throw, spell_resistance from spell_details')}
        lists, effects = {}, {}
        for sid, cls, level in c.execute('select section_id, class, level from spell_lists'):
            lists.setdefault(sid, {})[slug(cls)] = level
        for sid, name, desc in c.execute('select section_id, name, description from spell_effects'):
            effects.setdefault(sid, []).append((clean(name), clean(desc)))
        mythic = {r[0] for r in c.execute('select section_id from mythic_spell_details')}

        for n in rows.values():
            sid = n['section_id']
            if n['type'] != 'spell' or not n['name'] or n['subtype'] == 'mythic_spell' or sid in mythic:
                continue
            d = details.get(sid)
            if not d:
                continue
            _, school, subschool, descriptors, components, casting_time, rng, duration, save, sr = d
            spell = {
                'id': slug(n['name']), 'name': title(clean(n['name'])), 'source': book,
                'school': clean(school) or None, 'subschool': clean(subschool) or None,
                'descriptors': clean(descriptors) or None,
                # Class id -> spell level, e.g. {"wizard": 3, "sorcerer": 3, "magus": 3}
                'levels': lists.get(sid, {}),
                'casting_time': clean(casting_time) or None, 'components': clean(components) or None,
                'range': clean(rng) or None,
                # Target / Area / Effect lines, as [label, text] pairs (labels vary, e.g. "Target or Area").
                'effects': [[name, desc] for name, desc in effects.get(sid, [])],
                'duration': clean(duration) or None, 'saving_throw': clean(save) or None,
                'spell_resistance': clean(sr) or None,
                'summary': clean(n['description']) or None,
                'description': node_text(n),
            }
            if spell['id'] in spells:
                first = spells[spell['id']]
                if book != first['source'] and book not in first.setdefault('also_in', []):
                    first['also_in'].append(book)
                # A later book can add classes to an older spell's lists.
                for cls, level in spell['levels'].items():
                    first['levels'].setdefault(cls, level)
            else:
                spells[spell['id']] = spell

    out = sorted(spells.values(), key=lambda s: s['name'].lower())
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'spells')
    print('  by book:', dict(Counter(s['source'] for s in out).most_common()))
    print('  on no class list:', sum(1 for s in out if not s['levels']))
    print('  class lists:', dict(Counter(c for s in out for c in s['levels']).most_common()))


if __name__ == '__main__':
    main()
