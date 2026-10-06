"""Build bloodlines.json: the sorcerer and bloodrager bloodlines, from the Archives of Nethys bloodline pages (cached in
../../aonprd-classes/lists, downloaded once). Each page names its book ("Source Core Rulebook pg. 72"), the class skill
(sorcerers only), bonus spells, bonus feats, the bloodline arcana (sorcerers only) and the bloodline powers
("Name (Su): Starting at 1st level, ..."). Only bloodlines from a book whose OGL notice is known are kept.

Each record: { id, cls, name, source, text, class_skill, bonus_spells: [{ level, name }], bonus_feats: [names], arcana,
               powers: [{ name, level, text }], origin }

Usage: python build_aon_bloodlines.py path/to/bloodlines.json
"""
import json, re, sys, urllib.parse
from common import slug
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, page_text, aon_book

ORIGIN = 'aonprd'
# Where each class's bloodline list and pages are, and the levels its powers come at (in page order, used when a
# power's text doesn't say "At Nth level").
CLASSES = {
    'sorcerer': ('SorcererBloodlines', 'https://aonprd.com/SorcererBloodlines.aspx', 'BloodlineDisplay', 'Bloodline_',
                 [1, 3, 9, 15, 20]),
    'bloodrager': ('BloodragerBloodlines', 'https://aonprd.com/BloodragerBloodlines.aspx', 'BloodragerBloodlineDisplay',
                   'BloodragerBloodline_', [1, 4, 8, 12, 16, 20]),
}
# A power starts a line: "Acidic Ray (Sp): ", "Sudden Sting (Ex, Sp): ", "Aquatic Adaptation\n(Ex): " or a plain
# "Spontaneous Generation: " (a capital, then up to six words: "One with Abaddon", "One Body, Two Minds").
POWER = re.compile(r"(?:^|\n)([A-Z][A-Za-z'’\-]*(?:,? [A-Za-z'’\-]+){0,6})"
                   r"(?:\s+\((?:Su|Ex|Sp)(?:,\s*(?:Su|Ex|Sp))*\))?(?: \(\s*[^()]{3,80}? pg\. ?\d+\s*\))?:\s*")
LEVEL = re.compile(r'\b(?:At|Starting at|Beginning at|When you reach) (\d+)(?:st|nd|rd|th) level', re.I)


# Bonus feats the pages name differently from the feat list.
FEAT_NAMES = {'Self Sufficient': 'Self-Sufficient', 'Light Armor Proficiency': 'Armor Proficiency, Light'}


def clean_feat(name):
    """'Fast Healer*' -> 'Fast Healer' (the * marks feats that count bloodrager levels as fighter levels), 'Ectoplasmic
    SpellAPG' -> 'Ectoplasmic Spell' (a book code run into the name), 'and Toughness' -> 'Toughness'."""
    name = re.sub(r'^and\s+', '', name.strip()).rstrip('.*').strip()
    name = re.sub(r'(?<=[a-z])(?:APG|ISWG|UM|UC|OA|ARG|ACG|UE|UI|UW|ISG|ISM)$', '', name)
    return FEAT_NAMES.get(name, name)


def field(text, label):
    m = re.search(r'\n' + label + r':\s*(.+)', text)
    return m.group(1).strip() if m else ''


def bloodline_names(cls):
    index, url, display, _, _ = CLASSES[cls]
    page = aon_page(index, url)
    return sorted({n.replace('&#39;', "'") for n in re.findall(display + r'\.aspx\?ItemName=([^"&]+)', page)})


def bloodline_page(cls, name):
    _, _, display, prefix, _ = CLASSES[cls]
    url = f'https://aonprd.com/{display}.aspx?ItemName=' + urllib.parse.quote(name)
    text = page_text(aon_page(prefix + re.sub(r'[^A-Za-z_]', '', name.replace(' ', '_')), url))
    head = re.search(re.escape(name) + r'(?: Bloodline)?\s*Source (.+?) pg\.', text)
    if not head:
        return None
    # The intro: the paragraph after the "Source ... pg. N" line.
    intro = text[head.end():].split('\n', 1)[-1].strip().split('\n\n')[0].strip()
    text = text[head.start():]
    # Bonus spells: "enlarge person (3rd), see invisibility (5th), ..."
    spells = []
    for part in re.split(r',\s*(?![^()]*\))', field(text, 'Bonus Spells').rstrip('.')):
        m = re.match(r'(.+?)\s*\((\d+)(?:st|nd|rd|th)\)$', part.strip())
        if m:
            spells.append({'level': int(m.group(2)), 'name': m.group(1).replace('*', '').strip()})
    # Bonus feats: commas, but not those inside "Skill Focus (Knowledge [arcana], ...)".
    feats = [clean_feat(f) for f in re.split(r',\s*(?![^()]*\))', re.sub(r'\.\s*\(.*$', '', field(text, 'Bonus Feats')).rstrip('.'))
             if f.strip()]
    body = text.split('\nBloodline Powers:', 1)[-1].split('\n', 1)[-1]
    # The page can go on with another section ("Expanded BloodlinesSource Legacy of Dragons pg. 4"): stop there.
    body = re.split(r"[A-Z][A-Za-z'’ ]{2,40}Source [^\n]{3,80}? pg\. ?\d+", body)[0]
    ms = list(POWER.finditer(body))
    powers = []
    for i, m in enumerate(ms):
        # A power runs to the next one (its later-level lines included).
        ptext = re.sub(r'\n{2,}', '\n\n', body[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(body)]).strip()
        # Its level is the one its first two sentences name ("When tensions run high... At 8th level, ..."); with none
        # there, it's a 1st-level power.
        lv = LEVEL.search(' '.join(re.split(r'(?<=\.)\s', ptext, maxsplit=2)[:2]))
        powers.append({'name': m.group(1).strip(), 'level': int(lv.group(1)) if lv else 1, 'text': ptext})
    return {'name': name, 'source': aon_book(head.group(1)), 'text': intro, 'class_skill': field(text, 'Class Skill').rstrip('.'),
            'bonus_spells': spells, 'bonus_feats': feats, 'arcana': field(text, 'Bloodline Arcana'), 'powers': powers}


def main():
    notices = load_notices()
    out, skipped = [], []
    for cls in CLASSES:
        for name in bloodline_names(cls):
            b = bloodline_page(cls, name)
            if not b or not b['source'] or not find_notices(notices, b['source']):
                skipped.append(f"{cls} {name} ({b['source'] if b else 'no page'})")
                continue
            if not b['powers']:
                skipped.append(f'{cls} {name} (no powers found)')
                continue
            out.append({'id': f'{cls}-{slug(name)}', 'cls': cls, **b, 'origin': ORIGIN})
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'bloodlines; skipped:', skipped)


if __name__ == '__main__':
    main()
