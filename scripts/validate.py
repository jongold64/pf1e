"""Sanity checks on the generated JSON. Exits non-zero if something is wrong."""
import json, os, sys, collections
d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data')
load = lambda name: json.load(open(os.path.join(d, name), encoding='utf-8'))
races, classes, feats = load('races.json'), load('classes.json'), load('feats.json')
armor, magic_items, spells = load('armor.json'), load('magic-items.json'), load('spells.json')
equipment, weapons = load('equipment.json'), load('weapons.json')
errors = []
for name, items in [('race', races), ('class', classes), ('feat', feats), ('armor', armor),
                    ('magic item', magic_items), ('spell', spells), ('equipment', equipment), ('weapon', weapons)]:
    dup = [i for i, n in collections.Counter(x['id'] for x in items).items() if n > 1]
    if dup:
        errors.append(f'duplicate {name} ids: {dup}')
for r in races:
    if not r.get('incomplete') and (not r.get('base_speed') or not r.get('traits')):
        errors.append(f"race {r['id']} missing speed/traits")
    if not r['ability_modifiers'] and not r.get('flexible_ability_bonus') and not r.get('incomplete'):
        errors.append(f"race {r['id']} has no ability modifiers")
for k in classes:
    n = 10 if k['category'] == 'prestige' else 20
    lv = [p['level'] for p in k.get('progression', [])]
    if lv != list(range(1, n + 1)):
        errors.append(f"class {k['id']} progression levels {lv}")
    for f in ('hit_die', 'skill_ranks_per_level'):
        if not k.get(f):
            errors.append(f"class {k['id']} missing {f}")
    if not k.get('class_skills') and not k.get('class_skills_note'):
        errors.append(f"class {k['id']} missing class skills")
names = {f['name'] for f in feats}
for f in feats:
    for p in f.get('prerequisites', []):
        for q in p.get('options', [p]):
            if q['type'] == 'feat' and q['feat'] not in names:
                errors.append(f"feat {f['id']} requires unknown feat {q['feat']}")
    if not f.get('benefit') and not f.get('goal'):
        print('note: no benefit text for', f['name'])
for a in armor:
    if a['category'] not in ('light', 'medium', 'heavy', 'shield') or not a.get('bonus'):
        errors.append(f"armor {a['id']} has category {a['category']!r} and bonus {a.get('bonus')!r}")
    if a['check_penalty'] > 0 or not 0 <= a['spell_failure'] <= 100:
        errors.append(f"armor {a['id']} has check penalty {a['check_penalty']} / spell failure {a['spell_failure']}")
for i in magic_items:
    if not i.get('category') or not i.get('aura') or not i.get('description'):
        print('note: magic item', i['name'], 'is missing', [f for f in ('category', 'aura', 'description') if not i.get(f)])
for e in equipment:
    for v in [e, *e.get('variants', [])]:
        if (v.get('price_gp') is not None and v['price_gp'] < 0) or (v.get('weight_lbs') is not None and v['weight_lbs'] < 0):
            errors.append(f"equipment {e['id']} has a negative price or weight")
    if not e.get('category'):
        errors.append(f"equipment {e['id']} has no category")
for w in weapons:
    if w['proficiency'] not in ('simple', 'martial', 'exotic') or w['group'] not in ('unarmed', 'light', 'one-handed', 'two-handed', 'ranged'):
        errors.append(f"weapon {w['id']} has proficiency {w['proficiency']!r} and group {w['group']!r}")
    if w['category'] != 'Technological Weapons' and not w['damage']['m']:
        print('note: weapon', w['name'], 'has no Medium damage')
class_ids = {k['id'] for k in classes}
for s in spells:
    if not s['levels'] or not s.get('school'):
        errors.append(f"spell {s['id']} has no class list or school")
unknown_lists = {c for s in spells for c in s['levels'] if c not in class_ids}
if unknown_lists - {'elementalist-wizard'}:
    errors.append(f'spell lists for unknown classes: {sorted(unknown_lists)}')
print(f'{len(races)} races, {len(classes)} classes, {len(feats)} feats, {len(armor)} armor, '
      f'{len(magic_items)} magic items, {len(spells)} spells, {len(equipment)} pieces of equipment, {len(weapons)} weapons')
auto = sum(1 for f in feats if all(p['type'] != 'other' for p in f.get('prerequisites', [])))
print(f'{auto} of {len(feats)} feats have fully machine-readable prerequisites')
if errors:
    print('\n'.join('ERROR: ' + e for e in errors)); sys.exit(1)
print('all checks passed')
