"""Build heights.json: Paizo's Random Height & Weight tables, by race and gender (Advanced Race Guide, Appendix 2:
core, featured and uncommon races; the Core Rulebook's Table 7-3 has the same core rows).

A character's height is the base height plus the modifier dice in inches; the weight is the base weight plus that same
roll times the weight multiplier. Each record:
{ race (the race's id in races.json), gender ('male' | 'female'), base_height (inches), base_weight (lbs.),
  dice ('2d4'), weight_multiplier (lbs. per inch rolled), source }.

    python build_heights.py ../data/heights.json   (PSRD set as for the other builders)
"""
import html, json, os, re, sqlite3, sys

PSRD = os.environ.get('PSRD') or os.path.join(os.path.dirname(__file__), '..', '..', 'PSRD-Data')
TABLES = ['Core Race Random Height and Weight', 'Featured Race Random Height and Weight', 'Uncommon Race Random Height and Weight']
# Table names that differ from the race's id in races.json.
RACE_IDS = {}


def cells(row):
    return [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]


def inches(text):
    m = re.match(r'(\d+)\s*ft\.?\s*(\d+)?\s*in', text)
    return int(m.group(1)) * 12 + int(m.group(2) or 0)


def main():
    races = {r['id'] for r in json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'races.json'), encoding='utf-8'))}
    c = sqlite3.connect(os.path.join(PSRD, 'book-arg.db'))
    out, unknown = [], []
    for name in TABLES:
        body = c.execute('SELECT body FROM sections WHERE name = ? AND type = ?', (name, 'table')).fetchone()[0]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
            cols = cells(row)
            if len(cols) != 5 or cols[0] == 'Race':
                continue
            who, base_h, base_w, dice, mult = cols
            race, gender = [x.strip() for x in who.rsplit(',', 1)]
            rid = RACE_IDS.get(race, re.sub(r'[^a-z0-9]+', '-', race.lower()).strip('-'))
            if rid not in races:
                unknown.append(race)
                continue
            out.append({'race': rid, 'gender': gender.lower(), 'base_height': inches(base_h),
                        'base_weight': int(re.search(r'\d+', base_w).group()), 'dice': dice.replace(' ', ''),
                        'weight_multiplier': int(re.search(r'\d+', mult).group()), 'source': 'Advanced Race Guide'})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(out)} rows for {len({r["race"] for r in out})} races' + (f'; not in races.json: {", ".join(sorted(set(unknown)))}' if unknown else ''))


if __name__ == '__main__':
    main()
