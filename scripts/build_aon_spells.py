"""Add to spells.json the Paizo spells that PSRD-Data and the Foundry packs lack (Companion Transportation, Languid
Venom...), from the Archives of Nethys spell list and each spell's page (cached in ../../aonprd-classes/lists). Run after
build_foundry_spells.py.

A spell already in the file is skipped: names are compared by letters only, without a trailing "(Garundi)" style tag,
with "Summon Monster 1" read as "Summon Monster I" and "Status, Greater" as "Greater Status". One from a book without a
known OGL notice is left out and counted, and so is one on no class list the app has (fey blight; the Sahir-Afiyun's
pesh spells).

Usage: python build_aon_spells.py path/to/spells.json   (adds to the file; reads classes.json beside it)
"""
import html, json, os, re, sys, urllib.parse
from collections import Counter
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book
from build_foundry_spells import actions
from common import slug

ORIGIN = 'Archives of Nethys'
ROMAN = {'1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX'}
# AoN names for spells already in the file under another spelling.
ALIASES = {'Phantasmal Asphixiation': 'Phantasmal Asphyxiation'}
SAVES = {'fortitude': 'fort', 'reflex': 'ref', 'will': 'will'}


def key(name):
    return re.sub(r'[^a-z0-9]', '', html.unescape(name).replace('’', "'").lower())


def match_key(name):
    """"Ablative Sphere (Garundi)" -> ablativesphere, "Summon Monster 1" -> summonmonsteri, "Status, Greater" -> greaterstatus."""
    n = re.sub(r'\s*\([^)]*\)\s*$', '', name)
    n = re.sub(r' (\d)$', lambda m: ' ' + ROMAN[m.group(1)], n)
    m = re.match(r'(.+), (Greater|Lesser|Mass|Instant|Slow)$', n)
    return key(f'{m.group(2)} {m.group(1)}' if m else n)


def spell_names():
    page = aon_page('spells-all', 'https://aonprd.com/Spells.aspx?Class=All')
    names = [html.unescape(urllib.parse.unquote(n)).strip() for n in re.findall(r'href="SpellDisplay\.aspx\?ItemName=([^"]+)"', page)]
    return list(dict.fromkeys(names))


def field(body, label, stop):
    # A field can run straight into the next heading ("Duration 10 min./levelDescription ..."): stop there too.
    m = re.search(rf'{label} (.+?)(?={stop}|Description|\n|$)', body)
    return m.group(1).strip() if m else None


def parse(name, page):
    """The spell's record fields from its page ("<name>Source <book> pg. N\\nSchool x (sub) [desc]; Level a 1, b 2Casting...").
    A page can hold two spells (Suffocation, Instant and Slow): the text stops at the next "<name>Source"."""
    t = page_text(page)
    i = t.find(f'{name}Source ')
    if i < 0:
        return None
    body = t[i + len(name):]
    body = re.split(r'\n(?:Archives of Nethys|Site Owner)', body)[0]
    source = aon_book(re.split(r'\s+pg\.', re.match(r'Source (.+?)(?:\n|$)', body).group(1))[0].strip())
    school_line = field(body, 'School', r'Casting')
    m = re.match(r'(\w+)(?: \(([^)]+)\))?(?: \[([^\]]+)\])?(?:; Level (.+))?$', school_line or '')
    if not m:
        return None
    levels = {}
    for part in (m.group(4) or '').split(','):
        lm = re.match(r'\s*([a-z][a-z ]*?) (\d)', part.strip().lower())
        if lm:
            levels[lm.group(1).replace(' ', '-')] = int(lm.group(2))
    desc = body.split('Description', 1)[1] if 'Description' in body else ''
    # A second spell on the page starts with its own "<Name>Source": cut it off.
    desc = re.split(r'(?<=[.”)])[A-Z][^\n.]{2,40}Source [^\n]+ pg\. ', desc)[0].strip()
    effects = [[lab, val] for lab in ('Area', 'Effect', 'Target', 'Targets') if (val := field(body, lab, r'\n'))]
    save_sr = field(body, 'Saving Throw', r'Description') or ''
    save, _, sr = save_sr.partition('; Spell Resistance ')
    return {'source': source, 'school': m.group(1), 'subschool': m.group(2), 'descriptors': m.group(3), 'levels': levels,
            'casting_time': field(body, 'Casting Time', r'\n'), 'components': field(body, 'Components', r'Effect'),
            'range': field(body, 'Range', r'\n'), 'effects': effects, 'duration': field(body, 'Duration', r'\n'),
            'saving_throw': save.strip() or None, 'spell_resistance': sr.strip() or None,
            'description': re.sub(r'\n{3,}', '\n\n', desc)}


def main():
    out_path = sys.argv[1]
    spells = json.load(open(out_path, encoding='utf-8'))
    class_ids = {c['id'] for c in json.load(open(os.path.join(os.path.dirname(os.path.abspath(out_path)), 'classes.json'), encoding='utf-8'))}
    have = {key(s['name']) for s in spells} | {match_key(s['name']) for s in spells}
    ids = {s['id'] for s in spells}
    notices = load_notices()
    added, skipped = [], Counter()
    for name in spell_names():
        if key(name) in have or match_key(name) in have or key(ALIASES.get(name, '')) in have:
            continue
        info = parse(name, aon_page('spell-' + slug(name), 'https://aonprd.com/SpellDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
        if not info or not info['description']:
            skipped['(no page text)'] += 1
            continue
        if not find_notices(notices, info['source']):
            skipped[info['source']] += 1
            continue
        levels = {c: lv for c, lv in info['levels'].items() if c in class_ids}
        if not levels:
            skipped['(on no class list the app has)'] += 1
            continue
        sid = slug(name)
        while sid in ids:
            sid += '-aon'
        first = re.match(r'(.+?[.!?])(?:\s|$)', info['description'])
        rec = {'id': sid, 'name': name, **{k: info[k] for k in ('source', 'school', 'subschool', 'descriptors')}, 'levels': levels,
               **{k: info[k] for k in ('casting_time', 'components', 'range', 'effects', 'duration', 'saving_throw', 'spell_resistance')},
               'summary': first.group(1) if first else None, 'description': info['description'], 'origin': ORIGIN}
        acts = actions({'system': {}}, rec['summary'], rec['description'])
        save = re.match(r'(Fortitude|Reflex|Will)\b', rec['saving_throw'] or '')
        if save and not any(a.get('save') for a in acts):
            act = acts[0] if acts else {'name': 'Use', 'kind': 'save'}
            act.update({'save': SAVES[save.group(1).lower()], 'save_text': rec['saving_throw']})
            if 'harmless' in rec['saving_throw'].lower():
                act['harmless'] = True
            acts = acts or [act]
        if acts:
            rec['actions'] = acts
        spells.append(rec)
        ids.add(sid)
        have.add(key(name))
        added.append(name)
    json.dump(spells, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'Added {len(added)} spells from the Archives of Nethys ({len(spells)} in all): {", ".join(added)}')
    if skipped:
        print(f'  left out: {sum(skipped.values())}: ' + ', '.join(f'{b} ({n})' for b, n in skipped.most_common()))


if __name__ == '__main__':
    main()
