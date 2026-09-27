"""Build races.json from PSRD-Data."""
import json, re, sys
from common import *

CATEGORY = {'core_race': 'core', 'standard_race': 'core', 'featured_race': 'featured',
            'uncommon_race': 'uncommon', 'monster_race': 'other'}
SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge']
ABIL_TRAIT = re.compile(r'^([+-]\d+ (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:,? (?:and )?)?)+$')
SKIP_TOP = {'see also'}


# Facts the PSRD text leaves implicit (checked against the Core Rulebook / Advanced Race Guide)
SUBTYPE_OVERRIDES = {'half-elf': ['elf', 'human'], 'half-orc': ['human', 'orc'], 'human': ['human']}
SPEED_OVERRIDES = {'svirfneblin': 20}
TYPE_OVERRIDES = {'gathlain': ('fey', []), 'wyrwood': ('construct', [])}


def lang_split(s):
    out, depth, cur = [], 0, ''
    s = s.replace(', and ', ', ').replace(' and ', ', ')
    for ch in s:
        depth += ch == '('
        depth -= ch == ')'
        if ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    out = [re.sub(r'^(?:or|only) ', '', x.strip()) for x in out]
    return [x for x in out if x]


def singular(trait_section_name, fallback):
    m = re.match(r'^(.*?) Racial Traits$', trait_section_name or '')
    if m:
        return m.group(1)
    return fallback


def parse_ability_mods(name):
    mods = {}
    for sign, val, ab in re.findall(r'([+-])(\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)', name):
        mods[ABILITIES[ab.lower()]] = int(val) * (1 if sign == '+' else -1)
    return mods


def trait_list(sec):
    out = []
    for ch in sec['children']:
        if ch['type'] in ('link', 'embed', 'table') or not ch['name']:
            continue
        out.append({'name': clean(ch['name']), 'text': node_text(ch)})
    return out


def build_race(n, book):
    name = clean(n['name'])
    trait_sec = None
    for ch in n['children']:
        nm = ch['name'] or ''
        if nm.endswith('Racial Traits') and not nm.startswith('Alternate'):
            trait_sec = ch
            break
    if trait_sec is not None:
        traits = trait_list(trait_sec)
        single = singular(trait_sec['name'], name)
        desc_nodes = [ch for ch in n['children'] if ch['name'] in ('Description',)] or \
                     [ch for ch in n['children'] if ch['name'] in ('Physical Description', 'Society', 'Relations',
                                                                     'Alignment and Religion', 'Adventurers')]
    else:  # Bestiary-style: traits are direct children
        traits = [t for t in trait_list(n) if t['name'].lower() not in SKIP_TOP]
        single = name
        desc_nodes = []

    r = {'id': slug(single), 'name': single, 'plural': name if name != single else None, 'source': book,
         'category': CATEGORY.get(n['subtype'], 'other'), 'summary': clean(n['body']).split('\n\n')[0]}

    # description sections
    desc = []
    for d in desc_nodes:
        if d['name'] == 'Description':
            if d['body']:
                desc.append({'name': 'Overview', 'text': clean(d['body'])})
            for ch in d['children']:
                desc.append({'name': clean(ch['name']), 'text': node_text(ch)})
        else:
            desc.append({'name': clean(d['name']), 'text': node_text(d)})
    r['description'] = [d for d in desc if d['text']]

    # derived stats
    mods, flexible = {}, False
    size, speed, rtype, subtypes, senses = None, None, None, [], []
    languages = {}
    for t in traits:
        tn, tt = t['name'], t['text']
        if ABIL_TRAIT.match(tn):
            mods = parse_ability_mods(tn)
            t['kind'] = 'ability_scores'
        elif re.match(r'^\+2 to One Ability Score', tn, re.I):
            flexible = True
            t['kind'] = 'ability_scores'
        elif tn in SIZES:
            size = tn
            t['kind'] = 'size'
        elif tn == 'Languages':
            t['kind'] = 'languages'
            m = re.search(r'(?:begin play speaking|speak) ([^.]+)\.', tt)
            if m:
                languages['starting'] = lang_split(m.group(1))
            m = re.search(r'cho?o?se (?:from )?(?:any of )?the following(?: bonus)?(?: languages)?: ([^.]+)\.', tt)
            if m:
                languages['bonus'] = lang_split(m.group(1))
            elif re.search(r'choose any languages? they want', tt):
                languages['bonus'] = ['Any (except secret languages)']
        m = re.search(r'base (?:land )?speed of (\d+) feet', tt)
        if m and speed is None:
            speed = int(m.group(1)); t.setdefault('kind', 'speed')
        m = re.search(r'are (humanoids|outsiders|fey|monstrous humanoids|dragons|aberrations|magical beasts)(?: with the ([a-z, ]+?) subtypes?)?\.', tt, re.I)
        if m and rtype is None:
            rtype = {'humanoids': 'humanoid', 'outsiders': 'outsider', 'fey': 'fey', 'monstrous humanoids': 'monstrous humanoid',
                     'dragons': 'dragon', 'aberrations': 'aberration', 'magical beasts': 'magical beast'}[m.group(1).lower()]
            if m.group(2):
                subtypes = [s.strip() for s in re.split(r',| and ', m.group(2)) if s.strip()]
            t.setdefault('kind', 'type')
        if re.match(r'^(Superior )?Darkvision|^Senses|^Low-Light', tn):
            mm = re.search(r'darkvision (?:up to |to a range of )?(\d+) (?:feet|ft)', tt, re.I) or \
                 re.search(r'in the dark (?:for )?up to (\d+) feet', tt)
            if mm:
                senses.append(f'darkvision {mm.group(1)} ft.')
            elif tn.startswith('Superior Darkvision'):
                senses.append('darkvision 120 ft.')
            if re.search(r'low-light vision|twice as far as (?:a )?humans?', tt, re.I):
                senses.append('low-light vision')
    if rtype is None and any(t.get('kind') for t in traits):
        rtype = 'humanoid'  # PRD default; races with other types say so explicitly
    if r['id'] in TYPE_OVERRIDES:
        rtype, subtypes = TYPE_OVERRIDES[r['id']]
    if r['id'] in SUBTYPE_OVERRIDES:
        subtypes = SUBTYPE_OVERRIDES[r['id']]
    if speed is None and r['id'] in SPEED_OVERRIDES:
        speed = SPEED_OVERRIDES[r['id']]
    if not subtypes and rtype == 'humanoid' and r['id'] not in TYPE_OVERRIDES:
        subtypes = [r['id'].replace('half-', '')] if r['id'] != 'human' else ['human']
    r.update({'ability_modifiers': mods, 'flexible_ability_bonus': flexible or None, 'size': size or 'Medium',
              'base_speed': speed, 'type': rtype, 'subtypes': subtypes, 'senses': senses, 'languages': languages,
              'traits': traits})

    # alternate traits, favored class options
    alts, fco = [], []
    for x in walk(n):
        if x['type'] == 'racial_trait' and (trait_sec is None or not any(x is y for y in walk(trait_sec))):
            alts.append({'name': clean(x['name']), 'text': node_text(x)})
        if (x['name'] or '') == 'Favored Class Options':
            for ch in x['children']:
                if ch['name']:
                    fco.append({'class': clean(ch['name']), 'text': node_text(ch)})
    if not traits or any('See the stat block' in t['text'] for t in traits) or speed is None:
        r['incomplete'] = True  # some Bestiary write-ups defer to a monster stat block
    r['alternate_traits'] = alts
    r['favored_class_options'] = fco
    return {k: v for k, v in r.items() if v not in (None, '', [], {})} | {'ability_modifiers': mods}


def main():
    races = {}
    for db, book, abbr, c, rows in iter_books():
        for n in rows.values():
            if n['type'] != 'race' or not n['name']:
                continue
            r = build_race(n, book)
            if not r.get('traits'):
                continue  # e.g. 'Lycanthropic Player Characters' is rules text, not a race
            prev = races.get(r['id'])
            # Prefer the Advanced Race Guide write-up (it has alternate traits & favored class options)
            if prev is None or (book == 'Advanced Race Guide'):
                if prev:
                    r['also_in'] = sorted(set(prev.get('also_in', []) + [prev['source']]))
                races[r['id']] = r
            else:
                prev.setdefault('also_in', []).append(book)
    out = sorted(races.values(), key=lambda r: (['core', 'featured', 'uncommon', 'other'].index(r['category']), r['name']))
    json.dump(out, open(sys.argv[1], 'w'), indent=2, ensure_ascii=False)
    print(len(out), 'races')


if __name__ == '__main__':
    main()
