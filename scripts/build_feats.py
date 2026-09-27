"""Build feats.json from PSRD-Data."""
import json, re, sys, os
from common import *

ABIL_RE = re.compile(r'^(Str|Dex|Con|Int|Wis|Cha|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)$', re.I)
BAB_RE = re.compile(r'^base attack bonus \+?(\d+)$', re.I)
CL_RE = re.compile(r'^caster level (\d+)(?:st|nd|rd|th)?$', re.I)
CHAR_RE = re.compile(r'^character level (\d+)(?:st|nd|rd|th)?$', re.I)
SKILL_RE = re.compile(r'^([A-Z][A-Za-z ]+(?:\([a-z ]+\))?) (\d+) ranks?$')
CLASS_LVL_RE = re.compile(r'^([a-z ]+?) level (\d+)(?:st|nd|rd|th)?$', re.I)


def split_prereqs(s):
    # split on commas/semicolons that are not inside parentheses
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch in ',;' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return [p.strip().rstrip('.').strip() for p in out if p.strip().rstrip('.').strip()]


RACES = {}
try:
    for r in json.load(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'races.json'))):
        RACES[r['name'].lower()] = r['id']
        if r.get('plural'):
            RACES[r['plural'].lower()] = r['id']
except Exception:
    pass
RACES.update({'half-orc': 'half-orc', 'half-elf': 'half-elf', 'elves': 'elf', 'dwarves': 'dwarf'})


FEAT_ALIASES = {'point blank shot': 'point-blank shot', 'light armor proficiency': 'armor proficiency, light',
                'medium armor proficiency': 'armor proficiency, medium', 'heavy armor proficiency': 'armor proficiency, heavy'}


def parse_one(q, feat_names):
    q = re.sub(r'^(?:and|or)\s+', '', q, flags=re.I).strip().rstrip('*').strip()
    if q.lower() in FEAT_ALIASES:
        q = FEAT_ALIASES[q.lower()]
    m = ABIL_RE.match(q)
    if m:
        return {'type': 'ability', 'ability': ABILITIES[m.group(1).lower()], 'value': int(m.group(2))}
    m = BAB_RE.match(q)
    if m:
        return {'type': 'bab', 'value': int(m.group(1))}
    m = CL_RE.match(q)
    if m:
        return {'type': 'caster_level', 'value': int(m.group(1))}
    m = CHAR_RE.match(q)
    if m:
        return {'type': 'character_level', 'value': int(m.group(1))}
    m = re.match(r'^(\d+)(?:st|nd|rd|th) mythic tier$', q, re.I) or re.match(r'^mythic tier (\d+)', q, re.I)
    if m:
        return {'type': 'mythic_tier', 'value': int(m.group(1))}
    m = SKILL_RE.match(q)
    if m:
        return {'type': 'skill', 'skill': m.group(1).strip(), 'ranks': int(m.group(2))}
    if q.lower() in RACES:
        return {'type': 'race', 'race': RACES[q.lower()]}
    base = re.sub(r'\s*\(.*\)$', '', q).strip()
    if q.lower() in feat_names or base.lower() in feat_names:
        key = q.lower() if q.lower() in feat_names else base.lower()
        e = {'type': 'feat', 'feat': feat_names[key]}
        if key != q.lower():
            e['detail'] = q[len(base):].strip()[1:-1]
        return e
    m = CLASS_LVL_RE.match(q)
    if m and len(m.group(1).split()) <= 2:
        return {'type': 'class_level', 'class': m.group(1).strip().lower(), 'value': int(m.group(2))}
    m = re.match(r'^(.+?) class feature$', q, re.I)
    if m and len(m.group(1).split()) <= 4:
        return {'type': 'class_feature', 'feature': m.group(1).strip().lower()}
    return None


def parse_prereqs(raw, feat_names):
    items = []
    for p in split_prereqs(raw):
        q = re.sub(r'^and\s+', '', p, flags=re.I).strip()
        one = parse_one(q, feat_names)
        if one:
            items.append(one); continue
        if re.search(r'\bor\b', q):
            opts = [parse_one(x, feat_names) for x in re.split(r'\s+or\s+', q)]
            if all(opts):
                items.append({'type': 'any_of', 'options': opts, 'text': q}); continue
        items.append({'type': 'other', 'text': q})
    return items


def _old_parse_prereqs(raw, feat_names):
    items = []
    for p in split_prereqs(raw):
        q = re.sub(r'^and\s+', '', p, flags=re.I).strip()
        m = ABIL_RE.match(q)
        if m:
            items.append({'type': 'ability', 'ability': ABILITIES[m.group(1).lower()], 'value': int(m.group(2))}); continue
        m = BAB_RE.match(q)
        if m:
            items.append({'type': 'bab', 'value': int(m.group(1))}); continue
        m = CL_RE.match(q)
        if m:
            items.append({'type': 'caster_level', 'value': int(m.group(1))}); continue
        m = CHAR_RE.match(q)
        if m:
            items.append({'type': 'character_level', 'value': int(m.group(1))}); continue
        m = SKILL_RE.match(q)
        if m:
            items.append({'type': 'skill', 'skill': m.group(1).strip(), 'ranks': int(m.group(2))}); continue
        base = re.sub(r'\s*\(.*\)$', '', q).strip()
        if q.lower() in feat_names or base.lower() in feat_names:
            key = q.lower() if q.lower() in feat_names else base.lower()
            e = {'type': 'feat', 'feat': feat_names[key]}
            if key != q.lower():
                e['detail'] = q[len(base):].strip()[1:-1]
            items.append(e); continue
        m = CLASS_LVL_RE.match(q)
        if m and len(m.group(1).split()) <= 2:
            items.append({'type': 'class_level', 'class': m.group(1).strip().lower(), 'value': int(m.group(2))}); continue
        items.append({'type': 'other', 'text': q})
    return items


def main():
    raw = []
    for db, book, abbr, c, rows in iter_books():
        types = {}
        for sid, ft in c.execute('select section_id, feat_type from feat_types'):
            types.setdefault(sid, []).append(ft)
        for n in rows.values():
            if n['type'] != 'feat' or not n['name']:
                continue
            f = {'name': clean(n['name']), 'source': book, 'types': types.get(n['section_id'], []),
                 'description': clean(n['description'] or n['body'])}
            prereq, sections = '', {}
            for ch in n['children']:
                key = (ch['name'] or '').strip().lower()
                val = node_text(ch)
                if key in ('prerequisite', 'prerequisites'):
                    prereq = val
                elif key in ('benefit', 'benefits'):
                    sections['benefit'] = val
                elif key in ('normal', 'special', 'goal', 'note'):
                    sections[key] = val
                elif key == 'completion benefit':
                    sections['completion_benefit'] = val
                elif val:
                    sections['benefit'] = (sections.get('benefit', '') + '\n\n' + (clean(ch['name']) + ': ' if ch['name'] else '') + val).strip()
            f['prerequisites_text'] = prereq
            f.update(sections)
            # PSRD sometimes stores the type in the name, e.g. "Deadly Stroke (Combat)"
            m = re.match(r'^(.*?)\s*\((Combat|Critical|Teamwork|Metamagic|Item Creation|Style|Grit|Panache|Performance|Story|Mythic|Achievement|Betrayal|Called Shot|Monster)\)$', f['name'])
            if m:
                f['name'] = m.group(1)
                if m.group(2) not in f['types']:
                    f['types'].append(m.group(2))
            mm = re.match(r'^(.*?),? \(?Mythic\)?$', f['name'])
            if mm and book == 'Mythic Adventures':
                f['name'] = mm.group(1)
            if book == 'Mythic Adventures':
                if 'Mythic' not in f['types']:
                    f['types'].append('Mythic')
            if 'goal' in f and 'Story' not in f['types']:
                f['types'].append('Story')
            if not f['types']:
                f['types'] = ['General']
            raw.append(f)

    # de-duplicate: same name & same mythic-ness -> keep earliest book
    seen, feats = {}, []
    for f in raw:
        mythic = 'Mythic' in f['types']
        key = (f['name'].lower(), mythic)
        if key in seen:
            seen[key].setdefault('also_in', []).append(f['source'])
            continue
        f['id'] = slug(f['name']) + ('-mythic' if mythic else '')
        seen[key] = f
        feats.append(f)

    names = {f['name'].lower(): f['name'] for f in feats if 'Mythic' not in f['types']}
    for f in feats:
        f['prerequisites'] = parse_prereqs(f['prerequisites_text'], names) if f['prerequisites_text'] else []
        if 'Mythic' in f['types'] and f['name'].lower() in names:
            f['mythic_of'] = names[f['name'].lower()]
            f['name'] = f['name'] + ' (Mythic)'

    order = ['id', 'name', 'source', 'also_in', 'types', 'mythic_of', 'description', 'prerequisites_text', 'prerequisites',
             'benefit', 'normal', 'special', 'goal', 'completion_benefit', 'note']
    feats = [{k: f[k] for k in order if k in f and f[k] not in (None, '')} for f in feats]
    feats.sort(key=lambda f: (f['name'].lower(), f['id']))
    json.dump(feats, open(sys.argv[1], 'w'), indent=2, ensure_ascii=False)
    print(len(feats), 'feats')


if __name__ == '__main__':
    main()
