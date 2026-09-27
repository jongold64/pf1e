import sqlite3, glob, os
DATA = os.environ.get('PSRD', '/home/claude/src/PSRD-Data')
COLS = ['section_id','type','subtype','lft','rgt','parent_id','name','abbrev','source','description','body','image','alt','url']
def load(db):
    c = sqlite3.connect(os.path.join(DATA, db)); c.row_factory = sqlite3.Row
    rows = {r['section_id']: dict(r) for r in c.execute('select * from sections order by lft')}
    for r in rows.values(): r['children'] = []
    for r in rows.values():
        p = rows.get(r['parent_id'])
        if p: p['children'].append(r)
    return c, rows
def show(n, d=0, maxd=3, w=110):
    print('  '*d, (n['type'], n['subtype'], n['name']), (n['body'] or '')[:w].replace('\n',' '))
    if d < maxd:
        for ch in n['children']: show(ch, d+1, maxd, w)
