"""Write LICENSE-OGL.txt from the OGL text and Section 15 notices shipped with PSRD-Data."""
import sys, html
from psrd_tree import load
from common import text

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
open(sys.argv[1], 'w').write('\n'.join(out).strip() + '\n')
print('wrote', sys.argv[1])
