"""Add spells from the Foundry VTT Pathfinder 1e packs to data/spells.json (run after build_spells.py).

PSRD-Data stops in 2015; Foundry also has the later books (Occult Adventures, Ultimate Intrigue, Horror Adventures,
Ultimate Wilderness, Planar Adventures, Player Companions, ...). Only spells from Paizo books are used. A spell the
PSRD build already has keeps its PSRD record, but gains Foundry's spell levels for classes it doesn't list yet
(the occult classes, the unchained summoner).

Usage: python build_foundry_spells.py path/to/spells.json   (reads and rewrites that file; set FOUNDRY if needed)
"""
import json, re, sys
from collections import Counter
from common import slug
from foundry import load_pack, load_sources, load_notices, paizo_source, html_text

ORIGIN = 'Foundry VTT pf1'
SCHOOLS = {'abj': 'abjuration', 'con': 'conjuration', 'div': 'divination', 'enc': 'enchantment', 'evo': 'evocation',
           'ill': 'illusion', 'nec': 'necromancy', 'trs': 'transmutation', 'uni': 'universal'}
RANGES = {'close': 'close (25 ft. + 5 ft./2 levels)', 'medium': 'medium (100 ft. + 10 ft./level)',
          'long': 'long (400 ft. + 40 ft./level)', 'touch': 'touch', 'personal': 'personal', 'unlimited': 'unlimited',
          'seeText': 'see text'}
ACTIONS = {'standard': 'standard action', 'move': 'move action', 'swift': 'swift action', 'immediate': 'immediate action',
           'free': 'free action', 'full': 'full-round action'}
UNITS = {'round': 'round', 'minute': 'minute', 'hour': 'hour', 'day': 'day'}


def words(s):
    """'mindAffecting' -> 'mind-affecting', 'summonerUnchained' -> 'summoner-unchained'."""
    return re.sub(r'(?<=[a-z])([A-Z])', r'-\1', s).lower()


def plural(n, unit):
    return f'{n} {unit}' + ('' if str(n) == '1' else 's')


def casting_time(a):
    act = a.get('activation') or {}
    kind, cost = act.get('type'), act.get('cost')
    if kind in ACTIONS:
        return f'1 {ACTIONS[kind]}'
    if kind in UNITS:
        return plural(cost or 1, UNITS[kind])
    return 'see text'


def components(s):
    c, m = s.get('components') or {}, s.get('materials') or {}
    parts = []
    if c.get('verbal'): parts.append('V')
    if c.get('somatic'): parts.append('S')
    if c.get('thought'): parts.append('T')
    if c.get('emotion'): parts.append('E')
    if c.get('material'): parts.append(f"M ({m['value']})" if m.get('value') else 'M')
    if c.get('focus'): parts.append(f"F ({m['focus']})" if m.get('focus') else 'F')
    # divineFocus: 1 = DF, 2 = M/DF, 3 = F/DF
    df = c.get('divineFocus')
    if df == 1: parts.append('DF')
    elif df == 2: parts[-1:] = [parts[-1] + '/DF'] if parts and parts[-1].startswith('M') else parts[-1:] + ['M/DF']
    elif df == 3: parts[-1:] = [parts[-1] + '/DF'] if parts and parts[-1].startswith('F') else parts[-1:] + ['F/DF']
    return ', '.join(parts) or None


def spell_range(a):
    r = a.get('range') or {}
    units, value = r.get('units'), r.get('value')
    if units in RANGES:
        return RANGES[units]
    if units == 'ft' and value:
        return f'{value} ft.'
    if units == 'mi' and value:
        return plural(value, 'mile')
    if units == 'spec' and value:
        return str(value)
    return None


def duration(a):
    d = a.get('duration') or {}
    units, value = d.get('units'), str(d.get('value') or '').strip()
    if units == 'inst':
        out = 'instantaneous'
    elif units == 'perm':
        out = 'permanent'
    elif units in ('spec', 'seeText'):
        out = value or 'see text'
    elif units in UNITS:
        unit = UNITS[units]
        m = re.fullmatch(r'(?:(\d+)\s*\*\s*)?@cl', value)
        if m:
            out = f'{m.group(1) or 1} {unit}{"s" if m.group(1) else ""}/level'
        elif value.isdigit():
            out = plural(value, unit)
        else:
            out = f"{value.replace('@cl', 'caster level')} {unit}s" if value else f'1 {unit}'
    else:
        return None
    return out + (' (D)' if d.get('dismiss') and '(D)' not in out else '')


def effects(a):
    out = []
    target = (a.get('target') or {}).get('value')
    if target: out.append(['Target', str(target)])
    if a.get('area'): out.append(['Area', str(a['area'])])
    if a.get('effect'): out.append(['Effect', str(a['effect'])])
    return out


def record(doc, book, taken):
    s = doc['system']
    a = next(iter((s.get('actions') or {}).values()), {})
    save = (a.get('save') or {}).get('description')
    name = clean_name(doc['name'])
    rid = slug(name)
    if rid in taken:
        rid = f"{rid}-{slug(book)}"
    return {
        'id': rid,
        'name': name,
        'source': book,
        'school': SCHOOLS.get(s.get('school'), s.get('school')),
        'subschool': ', '.join(s.get('subschool') or []) or None,
        'descriptors': ', '.join(words(d) for d in s.get('descriptors') or []) or None,
        'levels': {words(k): v for k, v in ((s.get('learnedAt') or {}).get('class') or {}).items()},
        'casting_time': casting_time(a),
        'components': components(s),
        'range': spell_range(a),
        'effects': effects(a),
        'duration': duration(a),
        'saving_throw': save or 'none',
        'spell_resistance': 'no' if s.get('sr') is False else 'yes',
        'summary': html_text((s.get('description') or {}).get('summary')) or None,
        'description': html_text((s.get('description') or {}).get('value')),
        'origin': ORIGIN,
    }


def clean_name(name):
    """Foundry tells same-named spells apart with a book tag: 'Malediction (APG)' -> 'Malediction'."""
    return re.sub(r'\s*\([A-Z0-9]{2,5}\)$', '', name.strip())


def key(name):
    """Letters and digits only, so 'Flash Fire' matches 'Flashfire' and 'Peace Bond' matches 'Peacebond'."""
    return re.sub(r'[^a-z0-9]', '', clean_name(name).lower())


def main():
    out_path = sys.argv[1]
    spells = [s for s in json.load(open(out_path, encoding='utf-8')) if s.get('origin') != ORIGIN]
    by_key = {key(s['name']): s for s in spells}
    books = load_sources()
    # Books whose OGL notice we have: PSRD-Data's (the books its spells came from) and scripts/ogl_notices.json.
    licensed = {s['source'] for s in spells} | set(load_notices())
    added, levels_added, skipped, unlicensed = [], Counter(), Counter(), Counter()
    for doc in load_pack('spells', 'spell'):
        book = paizo_source(doc, books)
        if not book:
            skipped[str([x.get('id') for x in doc['system'].get('sources') or []])] += 1
            continue
        if book not in licensed and not by_key.get(key(doc['name'])):
            unlicensed[book] += 1
            continue
        existing = by_key.get(key(doc['name']))
        if existing:
            # Occult and unchained classes' spell levels for spells PSRD already has.
            for cls, lv in ((doc['system'].get('learnedAt') or {}).get('class') or {}).items():
                cid = words(cls)
                if cid not in existing['levels']:
                    existing['levels'][cid] = lv
                    levels_added[cid] += 1
            continue
        rec = record(doc, book, {s['id'] for s in spells})
        if not rec['levels']:
            skipped['no class spell list'] += 1  # only on a domain or bloodline list
            continue
        spells.append(rec)
        by_key[key(rec['name'])] = rec
        added.append(rec)
    spells.sort(key=lambda s: s['name'].lower())
    json.dump(spells, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(added)} spells added from Foundry ({len(spells)} in all)')
    for b, n in Counter(r['source'] for r in added).most_common():
        print(f'  {n:5} {b}')
    print('class levels added to existing spells:', dict(levels_added.most_common()))
    if skipped:
        print('left out (not a Paizo book):', sum(skipped.values()), dict(skipped.most_common(10)))
    if unlicensed:
        print(f'left out (no OGL notice for the book, see extract_ogl_notices.py): {sum(unlicensed.values())}',
              dict(unlicensed.most_common()))


if __name__ == '__main__':
    main()
