"""Add to feats.json the Paizo feats that PSRD-Data and the d20pfsrd pages lack, from the Archives of Nethys feat list
and each feat's page (cached in ../../aonprd-classes/lists). A feat whose name (letters only, without a trailing "(UM)"
style tag) is already in the file, or is in ALIASES, is skipped; one from a book without a known OGL notice is left out
and counted. Mythic and caravan feats are left out, as in build_d20_feats.py. Run after build_d20_feats.py.

Usage: python build_aon_feats.py path/to/feats.json   (adds to the file)
"""
import html, json, re, sys, urllib.parse
from collections import Counter
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book
from build_feats import parse_prereqs
from build_d20_feats import TYPE_NAMES, SKIP_TYPES
from common import slug

ORIGIN = 'Archives of Nethys'
# AoN names for feats already in the file under another name (d20pfsrd drops "Aldori" from the Adventurer's Guide
# feats, and spellings differ).
ALIASES = {
    'Aldori Artistry': 'Artistry', 'Aldori Dueling Disciple': 'Dueling Disciple',
    'Aldori Dueling Mastery': 'Dueling Mastery', 'Aldori Style': 'Dueling Style', 'Aldori Style Aegis': 'Dueling Style Aegis',
    'Aldori Style Conquest': 'Dueling Style Conquest', 'Diabolic Judgement': 'Diabolic Judgment',
    'Concilator': 'Conciliator', 'Corsair of Taldor': 'Corsair', 'Acadamae Graduate': 'Acadamae Graduate (Local)',
    # d20pfsrd gives Golarion feats a setting-free name; the rules text is the same.
    'Battering Ram': 'Battering Repair', 'Dragon Discipline': 'Draconic Discipline',
    'Duelist of the Roaring Falls': 'Duelist of the Falls', 'Duelist of the Shrouded Lake': 'Duelist of the Shroud',
    'Emergency Attunement': 'Energy Attunement', "Garen's Discipline": "Duelist's Discipline",
    'Genie-Touched Companion': 'Genie-Touched Mount', 'Iomedaean Sword Oath': 'Sword Oath',
    'Overseer of the House of Truth': 'Overseer of the Two Treasuries', 'Pao-Lung Self-Improvement': 'Self-Improvement',
    'Pesh Euphoria': 'Keif Euphoria', 'Pesh Healing': 'Keif Healing', 'Pesh Rejuvenation': 'Keif Rejuvenation',
    'Polytheistic Blessing': 'Pantheistic Blessing', 'Rahadoumi Exorcist': 'Exorcist',
    "Serren's Masterstroke": "Duelist's Masterstroke", 'Shade of the Uskwood': 'Shade of the Woodlands',
    'Student of Sulunai': 'Student of Aasimar', 'Taldan Conscript': 'Imperial Conscript',
    'Unusual Heritage (Changeling)': 'Unusual Origin (Changeling)', 'Unusual Heritage (Dhampir)': 'Unusual Origin (Dhampir)',
    'Unusual Heritage (Fetchling)': 'Unusual Origin (Fetchling)', 'Unusual Heritage (Gillman)': 'Unusual Origin (Gillman)',
    'Bloody Frenzy Style': 'Blood Frenzy Style',
    # Spellings.
    'Hemorhaging Venom': 'Hemorrhaging Venom', 'Hinderance Dismissal': 'Hindrance Dismissal',
    'Modification Master': 'Modification Mastery', 'Oblivating Stare': 'Obliviating Stare',
    'Otherworldly Influence': 'Otherworldy Influence', 'Reinforced Crafting': 'Reinforce Crafting',
    'Retributive Summoning': 'Retributive Summons', 'Schooled Resolve': 'Schooled Reserve',
    'Sheltering Stubborness': 'Sheltering Stubbornness', 'Startling Shapechanger': 'Startling Shapechange',
    'Subconscious Ursurpation': 'Subconscious Usurpation', 'Superintendent': 'Superintendant',
    'Versatile Jinx': 'Versatile Jinxer',
}
# AoN list links that lead to no feat page.
BROKEN = {'vine leshy'}


def key(name):
    return re.sub(r'[^a-z0-9]', '', html.unescape(name).replace('’', "'").lower())


def loose(name):
    """The name without a trailing tag AoN or d20pfsrd adds: "(UM)", "(Mythic)", "(Monster)", or type words some d20pfsrd
    page titles run on ("Knotted Nets Combat Teamwork", "Mindful Meditation Meditation", "Deft Shootist Deed")."""
    name = re.sub(r'\s*\((?:Mythic|Monster|Local|Item Creation|Combat|[A-Z][A-Za-z]{0,4})\)\s*$', '', name)
    words = '|'.join(['Deed'] + [re.escape(t) for t in TYPE_NAMES])
    while True:
        cut = re.sub(r'(?<=\w) (?:' + words + r')$', '', name)
        if cut == name or len(cut) < 4:
            return key(name)
        name = cut


def feat_names():
    page = aon_page('feats-all', 'https://aonprd.com/Feats.aspx')
    names = [html.unescape(urllib.parse.unquote(n)) for n in re.findall(r'href="FeatDisplay\.aspx\?ItemName=([^"]+)"', page)]
    return list(dict.fromkeys(names))


SECTIONS = {'Prerequisite': 'prerequisites_text', 'Prerequisites': 'prerequisites_text', 'Benefit': 'benefit',
            'Benefits': 'benefit', 'Normal': 'normal', 'Special': 'special', 'Goal': 'goal',
            'Completion Benefit': 'completion_benefit', 'Note': 'note'}


def parse(name, page):
    """{ source, types, description, prerequisites_text, benefit, ... } from a feat page:
    "<name> (Combat, Style)Source <book> pg. N, ...\\n<description>\\n\\nPrerequisites: ...\\nBenefit: ..."."""
    # Book tags after a linked name ("Improved Dirty Trick<sup>APG</sup>") would run into the name.
    t = page_text(re.sub(r'<sup>.*?</sup>', '', page, flags=re.S))
    m = re.search(re.escape(name) + r'(?: \(([^)\n]*)\))?Source (.+?)(?:\n|$)', t)
    if not m:
        return None
    # The first book: "Andoran, Spirit of Liberty pg. 18, ..." (a book's name can have a comma, so cut at " pg.").
    rec = {'source': aon_book(re.split(r'\s+pg\.', m.group(2))[0].strip()),
           'types': [x for p in re.split(r'[,/]\s*', m.group(1) or '') for x in TYPE_NAMES if x.lower() == p.strip().lower()]}
    body = re.split(r'\n(?:Archives of Nethys|Site Owner)', t[m.end():])[0].strip()
    # A stamina combat trick follows as its own block: "Combat Trick (from the Combat Stamina feat)Source <book>\n<text>".
    body, *trick = re.split(r'\s*Combat Trick \(from the Combat Stamina feat\)Source [^\n]*\n', body, maxsplit=1)
    if trick and trick[0].strip():
        rec['note'] = 'Combat Trick: ' + trick[0].strip()
    # Other headed blocks ("Boot TricksSource Dirty Tactics Toolbox pg. 18") keep their heading, not the book.
    body = re.sub(r'(?<=\S) *([A-Z][^\n.]{0,60}?)Source [^\n]*?pg\. [^\n]*\n', r'\n\n\1\n', body)
    labels = '|'.join(sorted(map(re.escape, SECTIONS), key=len, reverse=True))
    parts = re.split(r'(?m)^(' + labels + r')\s*:\s*', body)
    rec['description'] = parts[0].strip()
    for label, text in zip(parts[1::2], parts[2::2]):
        field = SECTIONS[label]
        text = re.sub(r'\n{3,}', '\n\n', text.strip())
        rec[field] = (rec[field] + '\n\n' + text) if field in rec else text
    return rec


def main():
    out_path = sys.argv[1]
    feats = [f for f in json.load(open(out_path, encoding='utf-8')) if f.get('origin') != ORIGIN]
    have = {key(f['name']) for f in feats} | {loose(f['name']) for f in feats}
    notices = load_notices()
    new, skipped = [], Counter()
    for name in feat_names():
        if key(name) in have or loose(name) in have or name in ALIASES or name in BROKEN:
            continue
        page = aon_page('feat-' + slug(name), 'https://aonprd.com/FeatDisplay.aspx?ItemName=' + urllib.parse.quote(name))
        rec = parse(name, page)
        if not rec or not (rec.get('benefit') or rec.get('goal')):
            skipped['(no page text)'] += 1
            continue
        if SKIP_TYPES & set(rec['types']):
            skipped['(mythic or caravan)'] += 1
            continue
        if not find_notices(notices, rec['source']):
            skipped[rec['source']] += 1
            continue
        rec['name'] = name
        new.append(rec)
        have.add(key(name))
    names = {f['name'].lower(): f['name'] for f in feats if 'Mythic' not in f.get('types', [])}
    names.update({r['name'].lower(): r['name'] for r in new})
    ids = {f['id'] for f in feats}
    order = ['id', 'name', 'source', 'types', 'description', 'prerequisites_text', 'prerequisites', 'benefit', 'normal',
             'special', 'goal', 'completion_benefit', 'note', 'origin']
    for r in new:
        r['id'] = slug(r['name']) if slug(r['name']) not in ids else f"{slug(r['name'])}-{slug(r['source'])}"
        ids.add(r['id'])
        r['types'] = r['types'] or ['General']
        r['prerequisites'] = parse_prereqs(r['prerequisites_text'], names) if r.get('prerequisites_text') else []
        r['origin'] = ORIGIN
        feats.append({k: r[k] for k in order if k in r and r[k] not in (None, '')})
    feats.sort(key=lambda f: (f['name'].lower(), f['id']))
    json.dump(feats, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f'Added {len(new)} feats from the Archives of Nethys ({len(feats)} in all).')
    for b, n in Counter(r['source'] for r in new).most_common():
        print(f'  {n:4} {b}')
    if skipped:
        print(f'  left out: {sum(skipped.values())}: ' + ', '.join(f'{b} ({n})' for b, n in skipped.most_common()))


if __name__ == '__main__':
    main()
