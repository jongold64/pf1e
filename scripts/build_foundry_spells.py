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


ACTION_KINDS = {'rsak': 'ranged touch', 'msak': 'melee touch', 'rwak': 'ranged', 'twak': 'ranged', 'mwak': 'melee',
                'rcman': 'maneuver', 'mcman': 'maneuver', 'heal': 'heal', 'spellsave': 'save', 'save': 'save'}
# "1d6 points of fire damage per caster level", "1d8/two levels damage", "1d6 damage per two levels".
PER_LEVEL = [re.compile(r'\b1d(?P<die>\d+)\s+(?:points? of\s+)?(?:(?P<type>[a-z]+)\s+)?damage\s*(?:/|per)\s*'
                        r'(?P<per>two |three |four )?(?:caster\s+)?levels?', re.I),
             re.compile(r'\b1d(?P<die>\d+)\s*(?:/|per)\s*(?P<per>two |three |four )?(?:caster\s+)?levels?\s+'
                        r'(?:(?P<type>[a-z]+)\s+)?damage', re.I)]


def damage_from_text(summary, description):
    """A damage formula from wording like "1d6 points of fire damage per caster level (maximum 10d6)", or None.
    The maximum must be stated (in the summary or the full text)."""
    for text in (summary or '', description or ''):
        for pattern in PER_LEVEL:
            m = pattern.search(text)
            if not m:
                continue
            cap = re.search(rf"max(?:imum)?(?: of)?\.?\s*(\d+)d{m.group('die')}\b", (summary or '') + ' ' + (description or ''), re.I)
            if not cap:
                return None
            per = {'two ': 2, 'three ': 3, 'four ': 4}.get((m.group('per') or '').lower(), 1)
            cl = '@cl' if per == 1 else f'floor(@cl / {per})'
            kind = (m.group('type') or '').lower()
            return {'formula': f"(min({cap.group(1)}, {cl}))d{m.group('die')}",
                    'types': [kind] if kind and kind not in ('of', 'points', 'point') else []}
    return None


HEAL_WORD = r'(?:heals?|healed|healing|cures?|cured|restores?|restored)'
# "4d8 damage +1/level (max +25)", "1d8 points of damage + 1 point per caster level (maximum +10)", "3d8 + 1 per caster
# level (maximum +20)": dice plus caster level with a cap.
HEAL_PLUS_CL = re.compile(HEAL_WORD + r'[^.]{0,60}?\b(\d+d\d+)\s*(?:points?|hp|hit points)?(?:\s*of)?(?:\s*damage)?(?:\s+to the target)?\s*'
                          r'\+\s*1\s*(?:point|hit point|hp)?(?:\s+of damage)?\s*(?:/|per)\s*(?:caster\s+)?level\s*'
                          r'\(max(?:imum)?\.?\s*(?:of\s*)?(?:\d+d\d+\s*\+\s*)?\+?(\d+)', re.I)
# "1d8 points per 2 caster levels (maximum 5d8)"
HEAL_PER_LEVELS = re.compile(HEAL_WORD + r'[^.]{0,60}?\b1d(\d+)\s*(?:points?|hit points)?(?:\s+of damage)?\s*per\s*(2|two|3|three)\s*'
                             r'(?:caster\s+)?levels\s*\(max(?:imum)?\.?\s*(\d+)d\1\)', re.I)
# "heals you of 2d10 points of damage": a fixed number of dice (not ability damage).
HEAL_FLAT = re.compile(HEAL_WORD + r'\s+(?:you\s+|it\s+|them\s+|the target\s+|a touched creature\s+)?(?:of\s+|for\s+)?(\d+d\d+)\s*'
                       r'(?:points? of damage|hit points|hp)\b(?!\s*(?:per|/|for each))', re.I)
# Spells that heal the same as another one.
HEAL_AS = {'Heal Mount': 'Heal'}


def healing_from_text(summary, description):
    """A healing formula from the spell's wording, or None (see the patterns above)."""
    for text in (summary or '', description or ''):
        m = HEAL_PLUS_CL.search(text)
        if m:
            return f"{m.group(1)} + min({m.group(2)}, @cl)"
        m = HEAL_PER_LEVELS.search(text)
        if m:
            per = 2 if m.group(2).lower() in ('2', 'two') else 3
            return f"(min({m.group(3)}, floor(@cl / {per})))d{m.group(1)}"
    for text in (summary or '', description or ''):
        m = HEAL_FLAT.search(text)
        if m:
            return m.group(1)
    return None


def actions(doc, summary=None, description=None):
    """What a spell does that the app can put numbers on: [{name, kind, damage: [{formula, types}], extra_attacks,
    auto_hit, save, save_text, harmless}]. Formulas are Foundry's (roll formulas using @cl for caster level); a spell
    with no damage formula gets one read from its summary when it says "1d6 damage per level (max 10d6)"."""
    out = []
    for a in (doc['system'].get('actions') or {}).values():
        kind = ACTION_KINDS.get(a.get('actionType'))
        parts = [{'formula': str(p['formula']).strip(), 'types': [t for t in p.get('types') or [] if t != 'untyped']}
                 for p in (a.get('damage') or {}).get('parts') or [] if str(p.get('formula') or '').strip()]
        save = a.get('save') or {}
        if not parts and not save.get('type') and kind in (None, 'save'):
            continue
        act = {'name': a.get('name') or 'Use', 'kind': kind or 'other'}
        if parts:
            act['damage'] = parts
        extra = ((a.get('extraAttacks') or {}).get('formula') or {}).get('count')
        if extra:
            act['extra_attacks'] = str(extra)
        if str(a.get('attackBonus') or '').strip() == '100':
            act['auto_hit'] = True  # magic missile
        if save.get('type'):
            act.update({'save': save['type'], 'save_text': save.get('description') or ''})
            if save.get('harmless'):
                act['harmless'] = True
        out.append(act)
    # Healing the Foundry data has no formula for: read it from the spell's text.
    if not any(a.get('kind') == 'heal' and a.get('damage') for a in out):
        heal = healing_from_text(summary, description)
        if heal:
            out.insert(0, {'name': 'Heal', 'kind': 'heal', 'damage': [{'formula': heal, 'types': []}]})
    if not any(a.get('damage') for a in out):
        dmg = damage_from_text(summary, description)
        if dmg:
            if out:
                out[0]['damage'] = [dmg]
            else:
                out.append({'name': 'Use', 'kind': 'other', 'damage': [dmg]})
    return out


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
            acts = actions(doc, existing.get('summary'), existing.get('description'))
            if acts:
                existing['actions'] = acts
            else:
                existing.pop('actions', None)
            # Occult and unchained classes' spell levels for spells PSRD already has.
            for cls, lv in ((doc['system'].get('learnedAt') or {}).get('class') or {}).items():
                cid = words(cls)
                if cid not in existing['levels']:
                    existing['levels'][cid] = lv
                    levels_added[cid] += 1
            continue
        rec = record(doc, book, {s['id'] for s in spells})
        acts = actions(doc, rec['summary'], rec['description'])
        if acts:
            rec['actions'] = acts
        if not rec['levels']:
            skipped['no class spell list'] += 1  # only on a domain or bloodline list
            continue
        spells.append(rec)
        by_key[key(rec['name'])] = rec
        added.append(rec)
    by_name = {x['name']: x for x in spells}
    for name, like in HEAL_AS.items():
        if name in by_name and like in by_name:
            heals = [a for a in by_name[like].get('actions', []) if a.get('kind') == 'heal' and a.get('damage')]
            own = by_name[name].get('actions', [])
            if heals and not any(a.get('kind') == 'heal' and a.get('damage') for a in own):
                by_name[name]['actions'] = heals + [a for a in own if a.get('kind') != 'heal']
    spells.sort(key=lambda s: s['name'].lower())
    json.dump(spells, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(added)} spells added from Foundry ({len(spells)} in all); '
          f"{sum(1 for s in spells if s.get('actions'))} with attack/damage/save details, "
          f"{sum(1 for s in spells if any(a.get('damage') for a in s.get('actions', [])))} with damage or healing formulas")
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
