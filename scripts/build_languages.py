"""Build languages.json: every Pathfinder (Golarion) language a character might speak.

Sources: the Foundry VTT pf1 system's language list (module/config.mjs, with the English names from lang/en.json), and
the languages in PSRD-Data's stat blocks (Bestiaries, NPC Codex...) that list lacks. Each record:
{ name, secret (true: can't be learned with bonus languages or Linguistics), source }.

    python build_languages.py ../data/languages.json   (PSRD and FOUNDRY set as for the other builders)
"""
import json, os, re, sqlite3, sys
from common import ALL_BOOKS
from foundry import read_files

PSRD = os.environ.get('PSRD') or os.path.join(os.path.dirname(__file__), '..', '..', 'PSRD-Data')
# Secret languages (Core Rulebook): only members of the group may learn them.
SECRET = {'Druidic'}
# Stat-block spellings of a language already listed, and phrases that aren't one language.
ALIASES = {'Dwarf', 'Elf', 'Kellish', 'Abyssal or Infernal'}


def foundry_languages():
    files = read_files(['module/config.mjs', 'lang/en.json'])
    block = re.search(r'export const languages = [^{]*\{(.*?)\n\}\);', files['module/config.mjs'], re.S).group(1)
    keys = re.findall(r'^\s*(\w+):\s*"PF1\.Language\.\w+"', block, re.M)
    names = json.loads(files['lang/en.json'])['PF1']['Language']
    return [names[k] for k in keys if k in names]


def stat_block_languages():
    """Languages named in creature stat blocks: 'Common, Draconic; telepathy 100 ft.' -> Common, Draconic."""
    found = {}
    for db, book, _ in ALL_BOOKS:
        path = os.path.join(PSRD, db)
        if not os.path.exists(path):
            continue
        c = sqlite3.connect(path)
        try:
            rows = c.execute('SELECT languages FROM creature_details WHERE languages IS NOT NULL').fetchall()
        except sqlite3.OperationalError:
            continue
        for (langs,) in rows:
            for part in re.split(r'[,;]', re.sub(r'\([^)]*\)', '', langs)):
                name = re.sub(r'^(?:and|plus|or)\s+', '', part.strip(), flags=re.I)
                if re.match(r"^[A-Z][A-Za-z' -]{1,25}$", name) and name not in ALIASES:
                    found.setdefault(name, book)
    return found


def main():
    out = {n: {'name': n, 'secret': n in SECRET, 'source': 'Foundry VTT pf1'} for n in foundry_languages()}
    lower = {n.lower(): n for n in out}
    added = []
    for name, book in stat_block_languages().items():
        if name.lower() not in lower:
            out[name] = {'name': name, 'secret': name in SECRET, 'source': book}
            lower[name.lower()] = name
            added.append(name)
    langs = sorted(out.values(), key=lambda x: x['name'].lower())
    json.dump(langs, open(sys.argv[1], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'{len(langs)} languages ({len(added)} from stat blocks: {", ".join(sorted(added))})')


if __name__ == '__main__':
    main()
