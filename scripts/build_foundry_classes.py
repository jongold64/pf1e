"""Add classes from the Foundry VTT Pathfinder 1e packs to data/classes.json (run after build_classes.py):
the occult classes, the shifter, the vigilante and the unchained classes, which PSRD-Data doesn't have.
Only classes from Paizo books with an OGL notice (see extract_ogl_notices.py) are added.

Foundry describes a class by its progressions ("high"/"med"/"low" BAB, saves and spellcasting) and links to its
class abilities at the level each is gained, so the level-by-level table is rebuilt here: BAB and saves from the
Core Rulebook formulas, spells per day and known from Foundry's casterProgression tables (checked to match the
PSRD tables for the classes both have), and each level's features from the linked abilities.

Usage: python build_foundry_classes.py path/to/classes.json   (reads and rewrites that file; set FOUNDRY if needed)
"""
import json, os, re, sys
from bs4 import BeautifulSoup
from common import slug
from foundry import load_pack, load_sources, load_notices, paizo_source, html_text, read_files

ORIGIN = 'Foundry VTT pf1'
# Foundry lists no source for the vigilante.
SOURCE_FIXES = {'Vigilante': 'Ultimate Intrigue'}
# Features Foundry links once but that come again at later levels, where the app needs every level (bonus feat slots).
REPEATS = {'monk-unchained': {'Bonus feat': [1, 2, 6, 10, 14, 18]}}
# The class pages saved from the Archives of Nethys (Kineticist.html, Barbarian_Unchained.html...): their level table
# gives the later steps Foundry links only once (elemental overflow +2, rage power at 4th, sneak attack +3d6...).
AON_CLASSES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'aonprd-classes')


def feature_key(s):
    """'Elemental overflow +2', 'metakinesis (maximize)', 'Rage powers' -> 'elemental overflow', 'metakinesis', 'rage power'."""
    s = re.sub(r'\s*\(.*?\)\s*$', '', s.lower().strip())
    return re.sub(r's$', '', re.sub(r'[\s+\-]*\d.*$', '', s).strip())


def book_table_repeats(cid, by_level):
    """{level: [entry]} for the book table's entries that repeat a feature Foundry gives at an earlier level."""
    path = os.path.join(AON_CLASSES, '_'.join(p.capitalize() for p in cid.split('-')) + '.html')
    if not os.path.exists(path):
        return {}
    table = None
    for t in BeautifulSoup(open(path, encoding='utf-8').read(), 'html.parser').find_all('table'):
        rows = [[c.get_text(' ', strip=True) for c in tr.find_all(['td', 'th'])] for tr in t.find_all('tr')]
        if rows and rows[0] and rows[0][0] == 'Level' and rows[0][-1] == 'Special':
            table = rows[1:]
            break
    first = {}  # feature key -> (level first gained, Foundry's name)
    for lv in sorted(by_level):
        for n in by_level[lv]:
            first.setdefault(feature_key(n), (lv, n))
    out = {}
    for r in table or []:
        m = re.match(r'\d+', r[0] or '')
        if not m:
            continue
        lv = int(m.group())
        for e in re.split(r',(?![^()]*\))', r[-1]):
            e = e.strip()
            k = feature_key(e)
            if not k:
                continue
            # The same name with its step ('elemental overflow +2'), or a wording around it ('utility wild talent' for
            # Wild Talents), which keeps Foundry's name so the app sees one feature.
            if k in first:
                at, label = first[k][0], e[0].upper() + e[1:]
            else:
                hit = next((v for f, v in first.items() if f and (f in k or k in f)), None)
                if not hit:
                    continue
                at, label = hit
            if at < lv:
                out.setdefault(lv, []).append(label)
    return out


# Columns the app reads from a class table ("other"), copied from a class with the same table.
OTHER_FROM = {'monk-unchained': ('monk', ['Unarmed Damage', 'AC Bonus', 'Fast Movement'])}
ARMOR = {'lgt': 'light armor', 'med': 'medium armor', 'hvy': 'heavy armor'}


def caster_tables():
    """Foundry's casterProgression (module/config.mjs) as Python: {castsPerDay|spellsPreparedPerDay: {type: {scale: rows}}}."""
    src = read_files(['module/config.mjs'])['module/config.mjs']
    start = src.index('export const casterProgression')
    js = src[src.index('({', start) + 1: src.index('\n});', start) + 2]
    js = re.sub(r'/\*.*?\*/', '', re.sub(r'//.*', '', js), flags=re.S).replace('Infinity', 'null')
    js = re.sub(r',(\s*[\]}])', r'\1', re.sub(r'(\w+):', r'"\1":', js))
    return json.loads(js)


def bab_value(scale, lv):
    return {'high': lv, 'med': lv * 3 // 4, 'low': lv // 2}[scale]


def save_value(scale, lv):
    return 2 + lv // 2 if scale == 'high' else lv // 3


def iteratives(total):
    out = [total]
    while out[-1] - 5 > 0 and len(out) < 4:
        out.append(out[-1] - 5)
    return out


def clean_name(n):
    """'Flurry of Blows (UC)' -> 'Flurry of Blows'; Foundry tags repeated names with the book or class."""
    return re.sub(r'\s*\([^)]*\)$', '', n.strip())


def spell_rows(casting, tables):
    """Per level: (spells_per_day, spells_known) in the app's format, or (None, None) before spells start."""
    t, p, cantrips = casting.get('type'), casting.get('progression'), casting.get('cantrips')
    per = tables['castsPerDay'].get(t, {}).get(p)
    known = tables['spellsPreparedPerDay'].get(t, {}).get(p)
    rows = []
    for lv in range(20):
        day = {str(i): v for i, v in enumerate(per[lv]) if v is not None} if per else {}
        kn = {str(i): v for i, v in enumerate(known[lv]) if v is not None} if known else {}
        if not cantrips:
            kn.pop('0', None)
        if t == 'prepared':
            # Prepared casters' level-0 spells: the app keeps how many are prepared under "per day".
            if cantrips and '0' in kn:
                day['0'] = kn['0']
            kn = {}
        if not any(k != '0' for k in day):
            # Before 1st-level spells: only known 0-level spells (a medium knows two at 1st level).
            day, kn = {}, ({'0': kn['0']} if '0' in kn else {})
        rows.append((day or None, kn or None))
    return rows


def proficiency_text(name, s):
    plural = f"{name.split(' (')[0]}s" if '(' not in name else f"Unchained {name.split(' (')[0].lower()}s"
    weapons = s.get('weaponProf') or []
    kinds = [w for w in weapons if w in ('simple', 'martial')]
    named = [w for w in weapons if w not in ('simple', 'martial') and 'quality' not in w.lower()]
    parts = []
    if kinds:
        parts.append(f"all {' and '.join(kinds)} weapons")
    if named:
        parts.append('the ' + ', '.join(n.lower() for n in named[:-1]) + (', and ' if len(named) > 1 else '') + named[-1].lower())
    armor = [ARMOR[a] for a in ('lgt', 'med', 'hvy') if a in (s.get('armorProf') or [])]
    shields = 'shl' in (s.get('armorProf') or [])
    tower = 'twr' in (s.get('armorProf') or [])
    text = f"{plural} are proficient with {' and with '.join(parts) or 'no weapons'}."
    if armor:
        text += f" They are proficient with {' and '.join(armor)}"
        text += (', and with shields (including tower shields).' if tower else ', and with shields (except tower shields).') if shields else ', but not with shields.'
    else:
        text += ' They are not proficient with any type of armor or shield.'
    return text


def description_parts(html):
    """(summary, role) from the class description."""
    paras = [p for p in html_text(html).split('\n\n') if p.strip()]
    role = next((p for p in paras if p.startswith('Role:')), None)
    summary = '\n\n'.join(p for p in paras if not p.startswith(('Role:', 'Alignment:', 'Hit Die:', 'Starting Wealth:')))
    return summary or None, role[len('Role:'):].strip() if role else None


def wealth(w):
    m = re.fullmatch(r'\s*(\d+)d(\d+)\s*\*\s*(\d+)\s*', w or '')
    if not m:
        return None
    n, d, mult = map(int, m.groups())
    return {'dice': f'{n}d{d} x {mult} gp', 'average_gp': round(n * (d + 1) / 2 * mult)}


def main():
    out_path = sys.argv[1]
    classes = [c for c in json.load(open(out_path, encoding='utf-8')) if c.get('origin') != ORIGIN]
    have = {c['id'] for c in classes} | {slug(c['name']) for c in classes}
    skill_ability = {s['skill']: s['ability'] for c in classes for s in c.get('class_skills', [])}
    books, notices = load_sources(), load_notices()
    licensed = {c['source'] for c in classes} | set(notices)
    tables = caster_tables()
    abilities = {d['_id']: d for d in load_pack('class-abilities')}
    by_id = {c['id']: c for c in classes}
    added, skipped = [], []
    for doc in load_pack('classes', 'class'):
        name, s = doc['name'].strip(), doc['system']
        cid = slug(name)
        if s.get('subType') != 'base' or cid in have:
            continue
        book = paizo_source(doc, books) or SOURCE_FIXES.get(name)
        if not book or book not in licensed:
            skipped.append(f'{name} ({book or "no Paizo source"})')
            continue
        # Features by level, from the linked class abilities.
        by_level, features = {}, [{'name': 'Weapon and Armor Proficiency', 'text': proficiency_text(name, s)}]
        for link in (s.get('links') or {}).get('supplements', []):
            a = abilities.get(link['uuid'].split('.')[-1])
            if not a:
                continue
            fname = clean_name(a['name'])
            if cid in REPEATS and fname.lower() in (k.lower() for k in REPEATS[cid]):
                continue
            by_level.setdefault(link['level'], []).append(fname)
            if fname not in (f['name'] for f in features):
                features.append({'name': fname, 'text': html_text((a['system'].get('description') or {}).get('value'))})
        for fname, levels in REPEATS.get(cid, {}).items():
            for lv in levels:
                by_level.setdefault(lv, []).insert(0, fname)
        if cid not in REPEATS:
            for lv, entries in book_table_repeats(cid, by_level).items():
                by_level.setdefault(lv, []).extend(entries)
        spells = spell_rows(s['casting'], tables) if s.get('casting') else [(None, None)] * 20
        other_src = OTHER_FROM.get(cid)
        progression = []
        for lv in range(1, 21):
            row = {
                'level': lv, 'bab': iteratives(bab_value(s['bab'], lv)),
                'fort': save_value(s['savingThrows']['fort']['value'], lv),
                'ref': save_value(s['savingThrows']['ref']['value'], lv),
                'will': save_value(s['savingThrows']['will']['value'], lv),
                'special': by_level.get(lv, []),
            }
            day, known = spells[lv - 1]
            if day: row['spells_per_day'] = day
            if known: row['spells_known'] = known
            if other_src:
                src_row = by_id[other_src[0]]['progression'][lv - 1].get('other') or {}
                row['other'] = {k: src_row[k] for k in other_src[1] if k in src_row}
            progression.append(row)
        skills = []
        for key in s.get('classSkills') or []:
            if key.startswith('knowledge.'):
                sname = f"Knowledge ({key.split('.')[1]})"
            else:
                sname = ' '.join(w.capitalize() if w not in ('of',) else w for w in re.sub(r'([A-Z])', r' \1', key).lower().split())
            if sname in skill_ability:
                skills.append({'skill': sname, 'ability': skill_ability[sname]})
        summary, role = description_parts((s.get('description') or {}).get('value'))
        record = {
            'id': cid, 'name': name, 'source': book,
            'category': 'unchained' if '(Unchained)' in name else 'occult' if book == 'Occult Adventures' else 'base',
            'summary': summary, 'hit_die': f"d{s['hd']}", 'alignment': s.get('alignment') or 'Any.', 'role': role,
            'class_skills': skills, 'skill_ranks_per_level': s['skillsPerLevel'],
            'starting_wealth': wealth(s.get('wealth')), 'progression': progression, 'features': features,
            'additional_rules': [], 'origin': ORIGIN,
        }
        classes.append(record)
        added.append(record)
    json.dump(classes, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(added)} classes added from Foundry:', ', '.join(f"{c['name']} ({c['source']})" for c in added))
    if skipped:
        print('left out:', '; '.join(skipped))


if __name__ == '__main__':
    main()
