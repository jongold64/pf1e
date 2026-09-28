"""Build classes.json from PSRD-Data."""
import json, re, sys
from common import *

CATEGORY = {'core': 'core', 'base': 'base', 'hybrid': 'hybrid', 'prestige': 'prestige', 'npc': 'npc'}
SKILL_RE = re.compile(r"([A-Z][A-Za-z' ]+?(?: \((?:[a-z ,]+)\))?) \((Str|Dex|Con|Int|Wis|Cha)\)")
KNOWN_TOP = {'skill ranks per level', 'role', 'starting wealth', 'class skills', 'class features', 'requirements', 'parent classes', 'alignment', 'hit die'}
# Alternate classes are presented as variants of an existing class
ALTERNATE = {'Antipaladin': 'Paladin', 'Ninja': 'Rogue', 'Samurai': 'Cavalier'}
ORD = re.compile(r'^(\d+)(?:st|nd|rd|th)$')


def to_int(s):
    s = (s or '').strip().replace('—', '-').replace('–', '-')
    if s in ('-', '—', ''):
        return None
    m = re.match(r'^([+-]?\d+)', s)
    return int(m.group(1)) if m else None


def parse_bab(s):
    vals = [int(x) for x in re.findall(r'[+-]?\d+', s or '')]
    return vals or [0]


def parse_progression(tbl_html):
    headers, rows = parse_table(tbl_html)
    if len(headers) >= 5 and not any('base attack' in h.lower() for h in headers) and headers[1].lower() == 'bonus':
        headers = ['Level', 'Base Attack Bonus', 'Fort Save', 'Ref Save', 'Will Save'] + headers[5:]
    H = [h.lower() for h in headers]
    out = []
    for cells in rows:
        if len(cells) < 3:
            continue
        m = ORD.match(cells[0].strip())
        if not m:
            continue
        row = {'level': int(m.group(1))}
        spells, extra = {}, {}
        for h, raw, v in zip(H, headers, cells):
            if h == 'level':
                continue
            if 'base attack' in h:
                row['bab'] = parse_bab(v)
            elif h.startswith('fort'):
                row['fort'] = to_int(v)
            elif h.startswith('ref'):
                row['ref'] = to_int(v)
            elif h.startswith('will'):
                row['will'] = to_int(v)
            elif ('spells per day' in h or 'extracts per day' in h) and re.search(r'\+1 level of', v, re.I):
                # Prestige classes: "+1 level of existing arcane spellcasting class/+1 level of existing divine
                # spellcasting class" -> ['arcane', 'divine']; "+1 level of divine spellcasting class" -> ['divine'];
                # "+1 level of alchemist" -> ['alchemist']; 'any' when no tradition is named.
                row['caster_advance'] = [
                    'arcane' if 'arcane' in part.lower() else 'divine' if 'divine' in part.lower()
                    else 'alchemist' if re.search(r'extract|alchemist', part, re.I) else 'any'
                    for part in v.split('/') if re.search(r'\+1 level of', part, re.I)]
            elif h == 'special' or h.endswith('/ special'):
                row['special'] = [x.strip() for x in re.split(r',(?![^()]*\))', v) if x.strip() and x.strip() not in ('-', '—')]
            elif 'spells per day' in h or 'spells known' in h or re.match(r'^(0|\d+(st|nd|rd|th))$', h.split(' / ')[-1]):
                lvl = h.split(' / ')[-1]
                key = '0' if lvl == '0' else re.sub(r'\D', '', lvl)
                bucket = 'spells_known' if 'known' in h else 'spells_per_day'
                n = to_int(v)
                if key and n is not None:
                    row.setdefault(bucket, {})[key] = n
            else:
                extra[raw] = v
        if extra:
            row['other'] = extra
        out.append(row)
    return out


def main():
    classes = []
    for db, book, abbr, c, rows in iter_books():
        details = {sid: (al, hd) for sid, al, hd in c.execute('select section_id, alignment, hit_die from class_details')}
        for n in rows.values():
            if n['type'] != 'class' or not n['name']:
                continue
            al, hd = details.get(n['section_id'], (None, None))
            # Some write-ups (e.g. Antipaladin) put Hit Die / Alignment in sections instead of class_details
            for x in walk(n):
                if (x['name'] or '') == 'Hit Die' and not hd:
                    hd = clean(x['body']).rstrip('.')
                if (x['name'] or '') == 'Alignment' and not al:
                    al = x['body']
            k = {'id': slug(n['name']), 'name': clean(n['name']), 'source': book,
                 'category': 'alternate' if n['name'] in ALTERNATE else CATEGORY.get(n['subtype'], n['subtype']),
                 'alternate_of': ALTERNATE.get(n['name']), 'summary': clean(n['body']),
                 'hit_die': hd, 'alignment': clean(al) if al else None}
            by_name = {}
            for x in walk(n):
                if x['name']:
                    by_name.setdefault(x['name'].strip().lower(), x)
            role = by_name.get('role')
            if role:
                k['role'] = node_text(role)
            parents = by_name.get('parent classes')
            if parents:
                k['parent_classes'] = [p.strip().capitalize() for p in re.split(r',| and ', clean(parents['body']).rstrip('.')) if p.strip()]
            # skills
            cs = by_name.get('class skills')
            if cs:
                skills = []
                cst = re.sub(r"^.*?class skills.*? are ", '', node_text(cs), count=1, flags=re.S)
                for name, ab in SKILL_RE.findall(cst):
                    name = re.sub(r"^(?:The|and|[A-Za-z' ]+ class skills (?:\(and the key ability for each skill\) )?are)\s+", '', name).strip()
                    name = re.sub(r'^and ', '', name)
                    skills.append({'skill': name, 'ability': ab.lower()})
                k['class_skills'] = skills
            for key in ('skill ranks per level', 'skill ranks at each level', 'skill ranks'):
                if key in by_name:
                    m = re.search(r'(\d+)\s*\+\s*Int', clean(by_name[key]['body']))
                    if m:
                        k['skill_ranks_per_level'] = int(m.group(1))
                    break
            # starting wealth
            sw = by_name.get('starting wealth')
            if sw:
                t = node_text(sw)
                m = re.search(r'(\d+d\d+)\s*(?:×|x|×)\s*10 gp', t)
                a = re.search(r'(\d+) gp\)?\s*$', t.split('\n')[-1]) or re.search(r'average (\d+) gp', t)
                if m:
                    k['starting_wealth'] = {'dice': m.group(1) + ' x 10 gp', 'average_gp': int(a.group(1)) if a else None}
            # requirements (prestige)
            req = by_name.get('requirements')
            if req:
                k['requirements'] = [{'name': clean(ch['name']), 'text': node_text(ch)} for ch in req['children'] if ch['name']]
            # progression table
            tbl = find(n, lambda x: x['type'] == 'table' and 'Base Attack Bonus' in (x['body'] or '') and 'Level' in (x['body'] or '')) or \
                  find(n, lambda x: x['type'] == 'table' and 'progression-table' in (x['body'] or ''))
            if tbl:
                k['progression'] = parse_progression(tbl['body'])
            # separate "Spells Known" tables (bard, sorcerer, oracle, ...)
            known = find(n, lambda x: x['type'] == 'table' and 'Spells Known' in (x['name'] or ''))
            if known and k.get('progression'):
                hdr, krows = parse_table(known['body'])
                by_lvl = {r['level']: r for r in k['progression']}
                for cells in krows:
                    m = ORD.match(cells[0].strip())
                    if not m or int(m.group(1)) not in by_lvl:
                        continue
                    sk = {}
                    for h, v in zip(hdr[1:], cells[1:]):
                        key = h.split(' / ')[-1].strip()
                        key = '0' if key == '0' else re.sub(r'\D', '', key)
                        val = to_int(v)
                        if key and val is not None:
                            sk[key] = val
                    if sk:
                        by_lvl[int(m.group(1))]['spells_known'] = sk
            if cs and not k.get('class_skills'):
                k['class_skills_note'] = node_text(cs).split('\n\n')[0]
            # class features
            cf = by_name.get('class features')
            feats = []
            if cf:
                for ch in cf['children']:
                    if ch['type'] in ('link', 'embed', 'table') or not ch['name']:
                        continue
                    nm = clean(ch['name'])
                    m = re.match(r'^(.*?)\s*\((Ex|Su|Sp)\)$', nm)
                    f = {'name': m.group(1) if m else nm}
                    if m:
                        f['ability_type'] = m.group(2)
                    lv = re.search(r'\b(?:At|Starting at|Beginning at) (\d+)(?:st|nd|rd|th) level', clean(ch['body']))
                    if lv:
                        f['level'] = int(lv.group(1))
                    f['text'] = node_text(ch)
                    feats.append(f)
            k['features'] = feats
            # other rules sections (arcane schools, bloodlines, ex-class rules, etc.)
            extra = []
            for ch in n['children']:
                nm = (ch['name'] or '').strip()
                if ch['type'] in ('link', 'embed', 'table') or not nm or nm.lower() in KNOWN_TOP:
                    continue
                if ch is cf or ch is cs or ch is sw:
                    continue
                if nm.lower().endswith('archetypes') and not ch['body']:
                    continue
                entry = {'name': clean(nm)}
                if ch['body']:
                    entry['text'] = clean(ch['body'])
                opts = [{'name': clean(o['name']), 'text': node_text(o)} for o in ch['children']
                        if o['name'] and o['type'] not in ('link', 'embed')]
                if opts:
                    entry['entries'] = opts
                extra.append(entry)
            if extra:
                k['additional_rules'] = extra
            classes.append({kk: v for kk, v in k.items() if v not in (None, '', [], {})})
    order = ['core', 'base', 'hybrid', 'alternate', 'prestige', 'npc']
    classes.sort(key=lambda k: (order.index(k['category']) if k['category'] in order else 9, k['name']))
    json.dump(classes, open(sys.argv[1], 'w'), indent=2, ensure_ascii=False)
    print(len(classes), 'classes')


if __name__ == '__main__':
    main()
