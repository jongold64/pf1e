"""Write LICENSE-OGL.txt from the OGL text and Section 15 notices shipped with PSRD-Data."""
import sys, html, json, os, re
from psrd_tree import load
from common import text
from foundry import load_notices, find_notices, book_key

# Section 15 notices missing from PSRD-Data's OGL list for books whose content we use.
# Wording copied from the official Pathfinder Reference Document (legacy.aonprd.com/openGameLicense.html).
MISSING_NOTICES = [
    'Pathfinder Roleplaying Game Mythic Adventures © 2013, Paizo Publishing, LLC; Authors: Jason Bulmahn, '
    'Stephen Radney-MacFarland, Sean K Reynolds, Dennis Baker, Jesse Benner, Ben Bruck, Jim Groves, Tim Hitchcock, '
    'Tracy Hurley, Jonathan Keith, Jason Nelson, Tom Phillips, Ryan Macklin, F. Wesley Schneider, Amber Scott, '
    'Tork Shaw, Russ Taylor, and Ray Vallese.',
    # The Flaws house rule's list (js/flaws.js) is from the d20 SRD's Unearthed Arcana variant rules.
    'Unearthed Arcana Copyright 2004, Wizards of the Coast, Inc.; Andy Collins, Jesse Decker, David Noonan, Rich Redman.',
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

# Books whose content came from the Foundry VTT data or d20pfsrd (records with "origin"): their notices from
# scripts/ogl_notices.json and scripts/d20_feat_notices.json, skipping any already listed.
data_dir = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'data')
used = set()
for name in sorted(os.listdir(data_dir)):
    if name.endswith('.json'):
        records = [r for r in json.load(open(os.path.join(data_dir, name), encoding='utf-8')) if isinstance(r, dict)]
        used |= {r['source'] for r in records if r.get('origin')}
        # Races whose alternate traits / favored class options came from d20pfsrd pages list those books.
        used |= {b for r in records for b in r.get('d20_sources', [])}
        # Alternate racial traits and favored class options from Archives of Nethys (build_aon_race_traits.py).
        used |= {b for r in records for b in r.get('aon_sources', [])}
notices = load_notices()  # ogl_notices.json + d20_feat_notices.json
have = {re.sub(r'\W', '', n.lower()) for n in out}
# A book PSRD's own notices already cover, worded differently ("Advanced Player's Guide. Copyright 2010" vs
# "Pathfinder RPG Advanced Player's Guide © 2010"), isn't listed again: same title and year.
def title_year(n):
    year = re.search(r'(?:©|Copyright)\s*(\d{4})', n)
    return book_key(re.split(r'\s*(?:©|\.? Copyright|, Copyright)', n)[0].strip().rstrip('.')), year and year.group(1)


psrd_books = {title_year(n) for n in out}
added = 0
for book in sorted(used):
    for n in find_notices(notices, book):
        k = re.sub(r'\W', '', n.lower())
        if k not in have and title_year(n) not in psrd_books:
            have.add(k)
            out.append(n)
            added += 1
print(f'{added} notices added for {len(used)} books from the Foundry data')
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out).strip() + '\n')
print('wrote', sys.argv[1])
