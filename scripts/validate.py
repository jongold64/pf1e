"""Sanity checks on the generated JSON. Exits non-zero if something is wrong."""
import json, os, sys, collections
d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data')
races = json.load(open(os.path.join(d, 'races.json')))
classes = json.load(open(os.path.join(d, 'classes.json')))
feats = json.load(open(os.path.join(d, 'feats.json')))
errors = []
for name, items in [('race', races), ('class', classes), ('feat', feats)]:
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
print(f'{len(races)} races, {len(classes)} classes, {len(feats)} feats')
auto = sum(1 for f in feats if all(p['type'] != 'other' for p in f.get('prerequisites', [])))
print(f'{auto} of {len(feats)} feats have fully machine-readable prerequisites')
if errors:
    print('\n'.join('ERROR: ' + e for e in errors)); sys.exit(1)
print('all checks passed')
