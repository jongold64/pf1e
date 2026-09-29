"""Build archetypes.json from PSRD-Data: class archetypes (Advanced Player's Guide, Ultimate Magic, Ultimate Combat,
Advanced Class Guide, Technology Guide), racial archetypes (Advanced Race Guide) and the Monster Codex ones.

Each archetype: { id, name, class (class id), source, race?, description, features: [{ name, text, level?,
replaces: [phrase], alters: [phrase] }] }. `replaces`/`alters` are the class features a feature's text says it
replaces or changes ("This ability replaces bravery." -> ["bravery"]); the app matches them to the class table.

Usage: python build_archetypes.py path/to/archetypes.json   (set PSRD to the PSRD-Data folder)
"""
import json, os, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, text, clean

# Monster Codex archetypes sit under "Goblin Archetype" headings with no class named; their classes by name. The
# other entries under those headings (a curse, a hex, equipment, spells) aren't archetypes. Troll Fury is left out:
# its class can't be told from the text.
MC_CLASSES = {'Fearmonger': 'antipaladin', 'Bouda': 'witch', 'Pack Rager': 'barbarian', 'Winged Marauder': 'alchemist',
              'Grenadier': 'alchemist', 'Alchemical Trapper': 'alchemist', 'Dragon Yapper': 'bard',
              'Ancient Guardian': 'druid'}
ORDINAL = r'(\d+)(?:st|nd|rd|th)'
# Sections PSRD types as archetypes that aren't: the antipaladin (its own class) is "Class Features".
NOT_ARCHETYPES = {'Class Features'}


def phrases(clause):
    """'defensive training and hatred' -> ['defensive training', 'hatred']; 'the bonus feats gained at 1st, 2nd, ...'
    stays whole (the app matches it with its level words)."""
    clause = re.sub(r'^(?:the|a|an)\s+', '', clause.strip().rstrip('.').strip(), flags=re.I)
    clause = re.sub(r'\s+(?:class )?(?:features?|abilit(?:y|ies))$', '', clause, flags=re.I)
    parts = re.split(r',\s*(?:and\s+|or\s+)?|\s+and\s+(?!\d)', clause)
    out = []
    for p in parts:
        p = re.sub(r'^(?:the|a|an)\s+', '', p.strip(), flags=re.I)
        p = re.sub(r'\s+(?:class )?(?:features?|abilit(?:y|ies))$', '', p, flags=re.I).strip(' .')
        # "armor training 2, 3, and 4": a bare number or ordinal belongs to the feature named just before it.
        if out and re.fullmatch(r'[+]?\d+(?:st|nd|rd|th)?(?: levels?)?', p, re.I):
            prev = re.sub(r'\s*[+]?\d+(?:st|nd|rd|th)?(?: levels?)?$', '', out[-1])
            p = f'{prev} {p}'
        if p and len(p) < 80:
            out.append(p.lower())
    return out


def replace_info(body):
    """What a feature replaces and what it alters, from its text."""
    t = re.sub(r'\s+', ' ', body)
    replaces, alters = [], []
    for m in re.finditer(r'(?:This (?:ability|class feature|feature)?\s*)?(?:replaces?|in place of)\s+([^.;]+)', t, re.I):
        clause = m.group(1)
        if re.match(r'(?:it|this|that|them)\b', clause, re.I):
            continue
        replaces += phrases(re.split(r'\s+(?:but|except|while|when|and (?:is|functions|works))\b', clause)[0])
    for m in re.finditer(r'This (?:ability |class feature |feature )?(?:alters|modifies|changes)\s+([^.;]+)', t, re.I):
        alters += phrases(m.group(1))
    return list(dict.fromkeys(replaces)), list(dict.fromkeys(a for a in alters if a not in replaces))


ABILITY_TAG = r'\s*\(?(?:Str|Dex|Con|Int|Wis|Cha)\)'


def skill_list(s):
    """'Acrobatics (Dex), Knowledge (local) (Int), and Swim (Str)' -> ['Acrobatics', 'Knowledge (local)', 'Swim']."""
    s = re.sub(ABILITY_TAG, '', s)
    items = re.split(r',\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+', s)
    out = []
    for i in items:
        i = re.sub(r'^(?:the|his|her|their)\s+', '', i.strip(' .;'), flags=re.I)
        if re.fullmatch(r"[A-Z][A-Za-z' ]+(?: \([a-z ,]+\))?", i):
            out.append(i)
    return out


def class_skill_changes(body):
    """A "Class Skills" feature -> { set } for a whole new list, or { add, remove }."""
    t = re.sub(r'\s+', ' ', body)
    add, remove = [], []
    # "does not gain Handle Animal, ... as class skills; instead, she gains Diplomacy, ..."
    m = re.search(r'does not gain ([^;.]+?) as (?:a )?class skills?[;,.]? ?instead,? (?:he|she|it|they) gains? ([^.]+?)(?: as class skills?)?\.', t)
    if m:
        return {'add': skill_list(m.group(2)), 'remove': skill_list(m.group(1))}
    m = re.search(r"class skills are ([^.]+)", t) or re.search(r"^([^.]+?) are class skills for", t)
    if m or re.match(r"[A-Z][A-Za-z' ]+(?: \([a-z ]+\))? \((?:Str|Dex|Con|Int|Wis|Cha)\),", t):
        return {'set': list(dict.fromkeys(skill_list(m.group(1) if m else t)))}
    for m in re.finditer(r'(?:adds?|gains?) ([^.;]+?) (?:to (?:his|her|their) list of class skills|as (?:a )?class skills?)', t):
        add += skill_list(re.sub(r'^(?:proficiency|the)\s+', '', m.group(1)))
    for m in re.finditer(r'(?:removes?|does not gain|loses) ([^.;]+?) (?:from (?:his|her|their) list of class skills|as (?:a )?class skills?)', t):
        remove += skill_list(m.group(1))
    for m in re.finditer(r'These replace ([^.;]+?) as class skills', t):
        remove += skill_list(m.group(1))
    add = [x for x in add if x not in remove]
    return {k: v for k, v in (('add', add), ('remove', remove)) if v}


GROUPS = ['light armor', 'medium armor', 'heavy armor', 'tower shields', 'shields', 'martial weapons', 'bucklers']


def proficiency_changes(body):
    """A "Weapon and Armor Proficiency" feature -> { replace: text } when it gives the whole list (its first sentence
    says what the character "is proficient with"), else { add: text, remove: [armor/shield/weapon groups] }."""
    t = re.sub(r'\s+', ' ', body)
    first = re.split(r'(?<=\.)\s', t)[0]
    if re.search(r'\b(?:is|are) proficient (?:with|in)\b', first) and not re.search(r'\b(?:also|in addition|additionally)\b', first):
        return {'replace': t}
    remove = []
    for m in re.finditer(r'(?:not proficient with|does not gain proficiency (?:with|in)|loses? (?:all |her |his )?(?:proficiency (?:with|in) )?)([^.]+)', t, re.I):
        part = m.group(1).lower()
        for g in GROUPS:
            if re.search(rf'\b{g.rstrip("s")}s?\b(?: proficienc)?', part) and not (g == 'shields' and 'tower shields' in part and part.count('shield') == 1):
                remove.append(g)
    out = {'add': t}
    if remove:
        out['remove'] = list(dict.fromkeys(remove))
    return out


def feature(n):
    body = text(n['body'] or '') or clean(n.get('description') or '')
    for ch in n.get('children') or []:  # tables or sub-sections inside a feature
        sub = text(ch['body'] or '')
        if sub:
            body += '\n\n' + (f"{clean(ch['name'])}: " if ch.get('name') else '') + sub
    rec = {'name': clean(n['name']), 'text': body.strip()}
    lv = re.search(r'\bat ' + ORDINAL + r' level\b', body, re.I)
    if lv:
        rec['level'] = int(lv.group(1))
    rep, alt = replace_info(body)
    if rep:
        rec['replaces'] = rep
    if alt:
        rec['alters'] = alt
    if re.fullmatch(r'class skills?|skills', rec['name'], re.I):
        rec['class_skills'] = class_skill_changes(body)
    elif re.fullmatch(r'(?:weapon and armor |armor and weapon |weapon |armor )?proficienc(?:y|ies)', rec['name'], re.I):
        rec['proficiency'] = proficiency_changes(body)
    return rec


def archetype(n, cls, book, race=None, name=None):
    name = name or clean(n['name'])
    feats = [feature(ch) for ch in n.get('children') or [] if ch.get('name')]
    return {'id': f'{cls}-{slug(name)}', 'name': name, 'class': cls, 'source': book,
            **({'race': race} if race else {}), 'description': text(n['body'] or '').strip(), 'features': feats}


def main():
    out_path = sys.argv[1]
    data_dir = os.path.dirname(os.path.abspath(out_path))
    classes = {c['id'] for c in json.load(open(os.path.join(data_dir, 'classes.json'), encoding='utf-8'))}
    races = json.load(open(os.path.join(data_dir, 'races.json'), encoding='utf-8'))
    race_by_plural = {r.get('plural', r['name']).lower(): r['name'] for r in races} | {r['name'].lower(): r['name'] for r in races}
    found, skipped = {}, Counter()
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        for n in rows.values():
            parent = rows.get(n['parent_id']) or {}
            rec = None
            if n['type'] == 'class_archetype' and n.get('subtype'):
                cls = slug(n['subtype'])
                rec = archetype(n, cls, book) if cls in classes else None
                if not rec:
                    skipped[f'unknown class {n["subtype"]}'] += 1
            elif clean(parent.get('name') or '') == 'Racial Archetypes':
                m = re.match(r'^(.*?)\s*\(([^)]+)\)$', clean(n['name']))
                grand = rows.get(parent.get('parent_id')) or {}
                race = race_by_plural.get(clean(grand.get('name') or '').lower(), clean(grand.get('name') or ''))
                if m and slug(m.group(2)) in classes:
                    rec = archetype(n, slug(m.group(2)), book, race=race, name=m.group(1))
                else:
                    skipped['racial archetype with unknown class'] += bool(m)
            elif re.search(r'Archetypes?$', clean(parent.get('name') or '')) and clean(n['name']) in MC_CLASSES:
                rec = archetype(n, MC_CLASSES[clean(n['name'])], book)
            if rec and rec['name'] in NOT_ARCHETYPES:
                continue
            if rec:
                if rec['id'] in found:  # an earlier book already has it (reprints)
                    skipped['duplicate'] += 1
                    continue
                found[rec['id']] = rec
    arch = sorted(found.values(), key=lambda a: (a['class'], a['name'].lower()))
    json.dump(arch, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    feats = [f for a in arch for f in a['features']]
    print(len(arch), 'archetypes;', Counter(a['source'] for a in arch).most_common())
    print(f"{len(feats)} features, {sum(1 for f in feats if f.get('replaces'))} replace something, "
          f"{sum(1 for f in feats if f.get('alters'))} alter something; skipped {dict(skipped)}")


if __name__ == '__main__':
    main()
