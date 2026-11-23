"""Build ages.json: Paizo's Random Starting Ages tables, by race (Advanced Race Guide, Appendix 2: core, featured and
uncommon races; the Core Rulebook's Table 7-1 has the same core rows).

A character's starting age is the race's adulthood plus dice chosen by the character's class: intuitive, self-taught or
trained. The table's footnotes name the classes in each group (classes it doesn't name aren't in any group).

{ groups: { intuitive: [class ids], self_taught: [...], trained: [...] },
  races: [{ race (the race's id in races.json), adulthood (years), intuitive ('1d4'), self_taught, trained, source }] }

    python build_ages.py ../data/ages.json   (PSRD set as for the other builders)
"""
import html, json, os, re, sqlite3, sys

PSRD = os.environ.get('PSRD') or os.path.join(os.path.dirname(__file__), '..', '..', 'PSRD-Data')
TABLES = ['Core Race Random Starting Ages', 'Featured Race Random Starting Ages', 'Uncommon Race Random Starting Ages']
GROUPS = ['intuitive', 'self_taught', 'trained']
# Class names in the footnotes that differ from the class's id in classes.json.
CLASS_IDS = {'magi': 'magus'}


def cells(row):
    return [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]


def class_id(word):
    w = word.strip().lower()
    if w in CLASS_IDS:
        return CLASS_IDS[w]
    return w[:-2] if w.endswith('ches') else w[:-1] if w.endswith('s') else w


def main():
    here = os.path.dirname(__file__)
    races = {r['id'] for r in json.load(open(os.path.join(here, '..', 'data', 'races.json'), encoding='utf-8'))}
    classes = {c['id'] for c in json.load(open(os.path.join(here, '..', 'data', 'classes.json'), encoding='utf-8'))}
    c = sqlite3.connect(os.path.join(PSRD, 'book-arg.db'))
    # The footnotes: "1 This category includes barbarians, oracles, rogues, and sorcerers.2 This category includes ..."
    note = next(html.unescape(re.sub(r'<[^>]+>', '', b)) for (b,) in c.execute(
        "SELECT body FROM sections WHERE body LIKE '%This category includes barbarians%'"))
    groups = {}
    for n, g in enumerate(GROUPS, 1):
        names = re.search(rf'{n}\s*This category includes (.*?)\.', note).group(1)
        ids = [class_id(x) for x in re.split(r',\s*(?:and\s+)?|\s+and\s+', names) if x.strip()]
        missing = [i for i in ids if i not in classes]
        if missing:
            sys.exit(f'classes not in classes.json: {missing}')
        groups[g] = ids
    out, unknown = [], []
    for name in TABLES:
        body = c.execute('SELECT body FROM sections WHERE name = ? AND type = ?', (name, 'table')).fetchone()[0]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
            cols = cells(row)
            if len(cols) != 5 or cols[0] == 'Race':
                continue
            race, adult, *dice = cols
            rid = re.sub(r'[^a-z0-9]+', '-', race.lower()).strip('-')
            if rid not in races:
                unknown.append(race)
                continue
            rec = {'race': rid, 'adulthood': int(re.search(r'\d+', adult).group())}
            rec.update({g: d.replace('+', '').strip() for g, d in zip(GROUPS, dice)})
            rec['source'] = 'Advanced Race Guide'
            out.append(rec)
    json.dump({'groups': groups, 'races': out}, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(out)} races' + (f'; not in races.json: {", ".join(sorted(set(unknown)))}' if unknown else ''))


if __name__ == '__main__':
    main()
