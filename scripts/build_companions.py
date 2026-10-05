"""Build companions.json from PSRD-Data: the animal companion rules and table (Core Rulebook) and every animal companion
choice (Core Rulebook, Ultimate Magic vermin, Bestiaries, Monster Codex).

{ progression: [{ level, hd, bab, fort, ref, will, skills, feats, natural_armor, str_dex, tricks, special: [..] }] (class
  levels 1-20),
  rules: { "Link": text, "Share Spells": text, ... } (the table's columns and special abilities, and Animal Skills/Feats),
  animals: [{ id, name, kind ('animal' | 'vermin'), source, size, speed, natural_armor, attacks, abilities: { str: 13, ... }
    (null for vermin Int), special_qualities, special_attacks, special_abilities, cmd_note, bonus_feat,
    advancement: { level, size, natural_armor, attacks, abilities: { str: 8, dex: -2, ... }, special_qualities,
    special_attacks, special_abilities, bonus_feat } }] }

Usage: python build_companions.py path/to/companions.json   (set PSRD to the PSRD-Data folder)
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, text, clean, parse_table

ABIL = {'Str': 'str', 'Dex': 'dex', 'Con': 'con', 'Int': 'int', 'Wis': 'wis', 'Cha': 'cha'}


def signed_int(s):
    s = (s or '').replace('—', '').replace('–', '-').strip()
    m = re.match(r'([+-]?\d+)', s)
    return int(m.group(1)) if m else 0


def abilities(s):
    """'Str 13, Dex 17, Con 10, Int 2...' or 'Str +8, Dex -2, Con +4.' -> {'str': 13, ...} (Int '-' -> None)."""
    out = {}
    for m in re.finditer(r'\b(Str|Dex|Con|Int|Wis|Cha)\s*([+\-–]?\s*\d+|[-—–])', s or ''):
        v = m.group(2).replace('–', '-').replace(' ', '')
        out[ABIL[m.group(1)]] = int(v) if re.search(r'\d', v) else None
    return out


def natural_armor(s):
    m = re.search(r'([+-]?\d+)\s*natural armor', s or '')
    return int(m.group(1)) if m else 0


def tidy(s):
    s = clean(text(s)) if s and '<' in s else clean(s or '')
    # Horse: "low-light vision, scent. *This is a secondary natural attack..." (the * stays on the attack).
    s = re.sub(r'\.?\s*\*\s*This is a secondary natural attack.*$', '', s)
    return s.rstrip('.').strip() or None


def descendants(n):
    for ch in n.get('children') or []:
        yield ch
        yield from descendants(ch)


def main():
    out_path = sys.argv[1]
    animals, progression, rules, tricks = {}, [], {}, []
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        details = {r[0]: dict(zip(['section_id', 'ac', 'attack', 'cmd', 'ability_scores', 'special_abilities', 'special_qualities',
                                   'special_attacks', 'size', 'speed', 'bonus_feat', 'level'], r))
                   for r in c.execute('select section_id, ac, attack, cmd, ability_scores, special_abilities, special_qualities, '
                                      'special_attacks, size, speed, bonus_feat, level from animal_companion_details')} \
            if c.execute("select count(*) from sqlite_master where name='animal_companion_details'").fetchone()[0] else {}
        for n in rows.values():
            # The Core Rulebook table and the rules text around it.
            if not progression and n.get('type') == 'table' and clean(n.get('name') or '') == 'Table: Animal Companion Base Statistics':
                headers, trs = parse_table(n['body'])
                for r in trs:
                    v = dict(zip(headers, r))
                    progression.append({
                        'level': signed_int(v['Class Level']), 'hd': signed_int(v['HD']), 'bab': signed_int(v['BAB']),
                        'fort': signed_int(v['Fort']), 'ref': signed_int(v['Ref']), 'will': signed_int(v['Will']),
                        'skills': signed_int(v['Skills']), 'feats': signed_int(v['Feats']),
                        'natural_armor': signed_int(v['Natural Armor Bonus']), 'str_dex': signed_int(v['Str/Dex Bonus']),
                        'tricks': signed_int(v['Bonus Tricks']),
                        'special': [s.strip() for s in re.split(r',', v['Special']) if s.strip() not in ('', '-')]})
                parent = rows.get(n.get('parent_id'))
                for ch in descendants(parent) if parent else []:
                    name = clean(ch.get('name') or '')
                    if name and ch.get('body') and ch.get('type') != 'table' and name not in rules:
                        rules[name] = text(ch['body'])
                # Animal Skills / Animal Feats sit elsewhere in the same chapter.
                for x in rows.values():
                    name = clean(x.get('name') or '')
                    if name in ('Animal Skills', 'Animal Feats') and x.get('body') and name not in rules:
                        rules[name] = text(x['body'])
            # The tricks an animal can learn: "Attack (DC 20): The animal attacks ..." in the Handle Animal skill's
            # "Teach an Animal a Trick" section (Core Rulebook).
            if not tricks and clean(n.get('name') or '') == 'Teach an Animal a Trick' and n.get('body'):
                t = re.sub(r'\s+', ' ', text(n['body']))
                for m in re.finditer(r"([A-Z][a-z]+) \(DC (\d+)\): (.*?)(?= [A-Z][a-z]+ \(DC \d+\):|$)", t):
                    tricks.append({'name': m.group(1), 'dc': int(m.group(2)), 'text': m.group(3).strip()})
                rules['Teach an Animal a Trick'] = t[:t.find('Attack (DC')].strip() if 'Attack (DC' in t else t
            if n.get('type') != 'animal_companion' or n.get('subtype') != 'base':
                continue
            d = details.get(n['section_id'])
            if not d:
                continue
            parent = rows.get(n.get('parent_id')) or {}
            name = clean(n['name'])
            kind = 'vermin' if 'Vermin' in clean(parent.get('name') or '') else 'animal'
            rec = {'id': slug(name), 'name': name, 'kind': kind, 'source': book, 'size': d['size'], 'speed': tidy(d['speed']),
                   'natural_armor': natural_armor(d['ac']), 'attacks': tidy(d['attack']), 'abilities': abilities(d['ability_scores']),
                   'special_qualities': tidy(d['special_qualities']), 'special_attacks': tidy(d['special_attacks']),
                   'special_abilities': tidy(d['special_abilities']), 'cmd_note': tidy(d['cmd']), 'bonus_feat': tidy(d['bonus_feat'])}
            adv = next((ch for ch in n.get('children') or [] if ch.get('type') == 'animal_companion' and ch.get('subtype') == 'advancement'), None)
            a = details.get(adv['section_id']) if adv else None
            if a:
                rec['advancement'] = {
                    'level': signed_int(a['level']), 'size': a['size'], 'natural_armor': natural_armor(a['ac']),
                    'attacks': tidy(a['attack']), 'abilities': abilities(a['ability_scores']),
                    'special_qualities': tidy(a['special_qualities']), 'special_attacks': tidy(a['special_attacks']),
                    'special_abilities': tidy(a['special_abilities']), 'bonus_feat': tidy(a['bonus_feat'])}
            if rec['id'] not in animals:
                animals[rec['id']] = rec
    out = {'progression': progression, 'rules': rules, 'tricks': tricks, 'animals': sorted(animals.values(), key=lambda a: a['name'])}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(progression), 'table rows;', len(out['animals']), 'companions', dict(Counter(a['source'] for a in out['animals'])))
    print('rules:', list(rules))
    print('tricks:', [(t['name'], t['dc']) for t in tricks])
    print('no advancement:', [a['id'] for a in out['animals'] if 'advancement' not in a])
    print('odd scores:', [a['id'] for a in out['animals'] if len(a['abilities']) != 6])


if __name__ == '__main__':
    main()
