"""Write LICENSE-OGL.txt from the OGL text and Section 15 notices shipped with PSRD-Data."""
import sys, html
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
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out).strip() + '\n')
print('wrote', sys.argv[1])
