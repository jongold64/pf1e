"""Write LICENSE-OGL.txt from the OGL text and Section 15 notices shipped with PSRD-Data."""
import sys, html, json, os, re
from psrd_tree import load
from common import text

# Section 15 notices missing from PSRD-Data's OGL list for books whose content we use.
# Wording copied from the official Pathfinder Reference Document (legacy.aonprd.com/openGameLicense.html).
MISSING_NOTICES = [
    'Pathfinder Roleplaying Game Mythic Adventures © 2013, Paizo Publishing, LLC; Authors: Jason Bulmahn, '
    'Stephen Radney-MacFarland, Sean K Reynolds, Dennis Baker, Jesse Benner, Ben Bruck, Jim Groves, Tim Hitchcock, '
    'Tracy Hurley, Jonathan Keith, Jason Nelson, Tom Phillips, Ryan Macklin, F. Wesley Schneider, Amber Scott, '
    'Tork Shaw, Russ Taylor, and Ray Vallese.',
]

c, rows = load('book-ogl.db')
ogl = next(r for r in rows.values() if r['name'] == 'OGL')
out = []
for ch in ogl['children']:
    name = html.unescape(ch['name'] or '')
    body = text(ch['body'])
    if name in ('Product Identity', 'Open Content'):
        out.append(f'{name}\n{body}\n')
    else:
        out.append(f'{name}{body if body.startswith((",", ".", " ")) else " " + body}')
    # Keep the Paizo books together: the missing notices go right after the last one.
    if name.startswith('Pathfinder Campaign Setting: Technology Guide'):
        out.extend(MISSING_NOTICES)
if not all(n in out for n in MISSING_NOTICES):
    out.extend(MISSING_NOTICES)

# Books whose content came from the Foundry VTT data (records with "origin"): their notices from
# scripts/ogl_notices.json, skipping any already listed.
data_dir = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'data')
used = set()
for name in sorted(os.listdir(data_dir)):
    if name.endswith('.json'):
        used |= {r['source'] for r in json.load(open(os.path.join(data_dir, name), encoding='utf-8'))
                 if isinstance(r, dict) and r.get('origin') == 'Foundry VTT pf1'}
notices = json.load(open(os.path.join(os.path.dirname(__file__), 'ogl_notices.json'), encoding='utf-8'))
have = {re.sub(r'\W', '', n.lower()) for n in out}
added = 0
for book in sorted(used):
    for n in notices.get(book, []):
        k = re.sub(r'\W', '', n.lower())
        if k not in have:
            have.add(k)
            out.append(n)
            added += 1
print(f'{added} notices added for {len(used)} books from the Foundry data')
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out).strip() + '\n')
print('wrote', sys.argv[1])
