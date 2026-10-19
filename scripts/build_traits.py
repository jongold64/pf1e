"""Build traits.json from PSRD-Data: the character traits in the Advanced Player's Guide and Ultimate Campaign.

Each trait is a section of type 'trait' under a heading naming its category ("Combat Traits", "Dwarf Race Traits",
"Regional Traits"). A trait in both books keeps the Ultimate Campaign wording (the later reprint) and lists the other
book in also_in. Simple numeric benefits are read into `effects` for the app:
  saves {fort/ref/will: n}, initiative n, skills {name: n} ("+1 trait bonus on Perception checks"),
  class_skills [name] ("... and Perception is always a class skill for you"),
  gold {to: n} / {add: n} / {times: n}: starting gold ("your starting wealth increases to 900 gp", "you begin play with
  an additional 300 gp", "twice the normal amount of starting gold"); gear worth so much ("200 gp of equipment") isn't.

Usage: python build_traits.py path/to/traits.json   (set PSRD to the PSRD-Data folder)
"""
import json, os, re, sys
from common import ALL_BOOKS, iter_books, slug, text, clean

SAVES = {'fortitude': 'fort', 'reflex': 'ref', 'will': 'will'}


def skill_names(data_dir):
    """Skill names the app knows, from the classes' class skill lists (plus Craft/Perform/Profession/Knowledge)."""
    classes = json.load(open(os.path.join(data_dir, 'classes.json'), encoding='utf-8'))
    return sorted({s['skill'] for c in classes for s in c.get('class_skills', [])}, key=len, reverse=True)


# A bonus that only applies sometimes ("While underground, ...", "... checks to gather information", "... saves against
# poison") isn't counted: nothing conditional may come before it in its clause, and nothing may follow it but the end
# of the clause. Traits offering "one of the following" bonuses are a choice, so they're skipped too.
CONDITION_BEFORE = re.compile(r'\b(while|when|whenever|against|if|during|as long as|after|once per)\b', re.I)
CLAUSE_END = re.compile(r'\s*(?:$|[,;.:)]|and\b|or\b)')


def unconditional(sentence, m):
    before = re.split(r';|, and\b', sentence[:m.start()])[-1]
    return not CONDITION_BEFORE.search(before) and CLAUSE_END.match(sentence, m.end())


# Starting gold: "...starting wealth increases to 900 gp", "...starting money is increased by 100 gp", "an additional
# 300 gp in starting wealth", "an extra 100 gp in ill-gotten gains" (not "an additional 150 gp of equipment").
GOLD_TO = re.compile(r'starting (?:wealth|money|cash|gold|funds) (?:increases|is increased) to (\d[\d,]*) gp', re.I)
GOLD_ADD = re.compile(r'starting (?:wealth|money|cash|gold|funds) (?:increases|is increased) by (\d[\d,]*) gp'
                      r'|(?:begin|start)(?: play| the campaign| the game)? with an? (?:additional|extra) (\d[\d,]*) gp(?! (?:of|worth))', re.I)
GOLD_TIMES = re.compile(r'twice the normal amount of starting (?:gold|wealth|money)', re.I)


def gold_of(body):
    t = re.sub(r'\s+', ' ', body)
    if m := GOLD_TO.search(t):
        return {'to': int(m.group(1).replace(',', ''))}
    if m := GOLD_ADD.search(t):
        return {'add': int((m.group(1) or m.group(2)).replace(',', ''))}
    if GOLD_TIMES.search(t):
        return {'times': 2}
    return None


# A skill's name in a phrase: "Knowledge (nobility)" ends in a bracket, so \b won't do after it.
def has_name(name, phrase):
    return re.search(rf'(?<!\w){re.escape(name)}(?!\w)', phrase)


# Combat bonuses ("+1 trait bonus on attack rolls and weapon damage rolls against giants", "+1 trait bonus to AC when
# wearing medium or heavy armor"): nearly all apply only sometimes, so each sentence with them is kept with its text,
# for a switch in the app's Active effects; `always` when nothing limits it; `weapon` when only the weapon does
# (WEAPON_RULES). Left out: a choice ("choose one"), and bonuses to confirm critical hits, to spells, save DCs and
# sneak attack damage, which the targets can't say, and an ally's bonus.
COMBAT_BONUS = re.compile(r'\+(\d+) trait bonus (?:on|to) ((?:(?:all |your |weapon |melee |ranged )*'
                          r'(?:attack rolls|damage rolls|armor class|AC\b|combat maneuver checks|combat maneuver defense|CMB|CMD)'
                          r'(?:,? (?:and|&) (?:on |to )?)?)+)', re.I)
COMBAT_SKIP = re.compile(r'choose one|confirm(?:ing)?(?: an?)? critical|\bspells?\b|save DCs?|sneak attack|attacks? of opportunity'
                         r'|\ball(?:y|ies)\b[^.]{0,60}\bgains?\b', re.I)


# Combat bonuses that depend only on the weapon used, counted on that weapon's row in the app instead of a switch:
# (the trait's words, which weapons). ids: data/weapons.json ids; name: a word in the weapon's name; materials: the
# weapon's special material (materials.js ids; Ancestral Weapon's chosen one is cold iron or silver); oversized: a
# weapon made for a larger creature; chosen: the one picked for the trait in the app (of that kind). Improvised weapons
# and bombs have no weapon row, so they stay switches.
WEAPON_RULES = [
    (r'damage rolls with a dagger', {'ids': ['dagger']}),
    (r'damage rolls with the following weapons: bastard sword, battleaxe, greataxe, greatsword, handaxe, light hammer, '
     r'longbow, longsword, shortbow, short sword, throwing axe, and warhammer',
     {'ids': ['bastard-sword', 'battleaxe', 'greataxe', 'greatsword', 'handaxe', 'light-hammer', 'longbow', 'composite-longbow',
              'longsword', 'shortbow', 'composite-shortbow', 'shortsword', 'throwing-axe', 'warhammer']}),
    (r'damage rolls (?:made with unarmed attacks|when using unarmed strikes)\.', {'ids': ['unarmed-strike']}),
    (r'damage rolls with brass knuckles and improvised weapons', {'ids': ['brass-knuckles']}),
    (r'damage rolls when using any weapon with the word .dwarven. in its name', {'name': 'dwarven'}),
    (r'damage rolls when using weapons intended for creatures of a larger size', {'oversized': True}),
    (r'attack rolls with weapons made of the selected material', {'materials': ['cold-iron', 'silver']}),
    # Monk Weapon Skill: the monk weapon you choose for it (chosen: the app asks which).
    (r'damage rolls with this weapon\.', {'chosen': 'monk'}),
]


def combat_targets(phrase):
    out = []
    for m in re.finditer(r'((?:melee |ranged )?)(attack rolls|damage rolls|armor class|\bAC\b|combat maneuver checks|combat maneuver defense|CMB|CMD)', phrase, re.I):
        kind, what = m.group(1).strip().lower(), m.group(2).lower()
        t = {'attack rolls': 'attack', 'damage rolls': 'damage', 'armor class': 'ac', 'ac': 'ac', 'combat maneuver checks': 'cmb',
             'combat maneuver defense': 'cmd', 'cmb': 'cmb', 'cmd': 'cmd'}[what]
        if kind and t in ('attack', 'damage'):
            t = f'{kind}-{t}'
        if t == 'ranged-damage':
            t = 'damage'
        if t not in out:
            out.append(t)
    return out


def combat_of(body):
    out = []
    for sentence in re.split(r'(?<=[.!?])\s+', re.sub(r'\s+', ' ', body)):
        if COMBAT_SKIP.search(sentence):
            continue
        bonuses, always = [], True
        for m in COMBAT_BONUS.finditer(sentence):
            for t in combat_targets(m.group(2)):
                bonuses.append({'target': t, 'value': int(m.group(1))})
            always = always and bool(unconditional(sentence, m))
        if bonuses:
            weapon = next((w for pat, w in WEAPON_RULES if re.search(pat, sentence, re.I)), None)
            out.append({'bonuses': bonuses, 'text': sentence.strip(), **({'weapon': weapon} if weapon else {}),
                        **({'always': True} if always and not weapon else {})})
    return out


def effects_of(body, skills):
    out = {}
    if re.search(r'one of the following', body, re.I):
        return out
    if gold := gold_of(body):
        out['gold'] = gold
    if combat := combat_of(body):
        out['combat'] = combat
    for sentence in re.split(r'(?<=[.!?])\s+', re.sub(r'\s+', ' ', body)):
        for m in re.finditer(r'\+(\d+) trait bonus on (?:all )?(Fortitude|Reflex|Will) sav(?:es|ing throws)\b', sentence, re.I):
            if unconditional(sentence, m):
                out.setdefault('saves', {})[SAVES[m.group(2).lower()]] = int(m.group(1))
        m = re.search(r'\+(\d+) trait bonus on initiative checks', sentence, re.I)
        if m and unconditional(sentence, m):
            out['initiative'] = int(m.group(1))
        # "+1 trait bonus on Bluff and Intimidate checks"
        for m in re.finditer(r'\+(\d+) trait bonus on ([A-Z][A-Za-z ,()]+?) checks', sentence):
            if not unconditional(sentence, m):
                continue
            names = [n for n in skills if has_name(n, m.group(2))]
            # Craft / Perform / Profession bonuses are for one specialty (Craft (alchemy)); left out rather than misapplied.
            for n in names:
                if n not in ('Craft', 'Perform', 'Profession'):
                    out.setdefault('skills', {})[n] = int(m.group(1))
        # "... and Perception is always a class skill for you"; "one of these (your choice)" is left to the player.
        for m in re.finditer(r'(?:and|,|^)\s*([A-Z][A-Za-z ()]+?) (?:is|are) (?:always )?(?:a )?class skills? for you', sentence):
            names = [n for n in skills if has_name(n, m.group(1))]
            if not names and re.search(r'\b(?:it|that skill|this skill)\b', m.group(1), re.I):
                names = list(out.get('skills', {}))
            for n in [x for x in names if x not in ('Craft', 'Perform', 'Profession')]:
                out.setdefault('class_skills', [])
                if n not in out['class_skills']:
                    out['class_skills'].append(n)
    return out


def main():
    out_path = sys.argv[1]
    skills = skill_names(os.path.dirname(os.path.abspath(out_path)))
    found = {}
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        for n in rows.values():
            if n['type'] != 'trait' or not n['name']:
                continue
            parent = rows.get(n['parent_id'])
            heading = clean(parent['name']) if parent else ''
            m = re.match(r'^(.*?) (Race )?Traits?$', heading)
            group = m.group(1) if m else heading
            category, requirement = (('Race', group) if m and m.group(2) else (group or (n.get('subtype') or '').title(), None))
            body = text(n['body'] or '') or clean(n['description'] or '')
            rec = {'id': slug(n['name']), 'name': clean(n['name']), 'source': book, 'category': category,
                   **({'requirement': requirement} if requirement else {}), 'text': body}
            key = re.sub(r'[^a-z0-9]', '', rec['name'].lower())  # "Fast Talker" (UC) = "Fast-Talker" (APG)
            if key in found:
                earlier = found[key]
                if book == 'Ultimate Campaign':  # prefer the later reprint's wording
                    rec['also_in'] = sorted(set(earlier.get('also_in', [])) | {earlier['source']})
                    found[key] = rec
                else:
                    earlier.setdefault('also_in', []).append(book)
                continue
            found[key] = rec
    traits = sorted(found.values(), key=lambda r: r['name'].lower())
    ids = {}
    for r in traits:
        ids[r['id']] = ids.get(r['id'], 0) + 1
    for r in traits:
        if ids[r['id']] > 1:
            r['id'] = f"{r['id']}-{slug(r['category'])}"
        eff = effects_of(r['text'], skills)
        if eff:
            r['effects'] = eff
    json.dump(traits, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    from collections import Counter
    print(len(traits), 'traits', dict(Counter(r['category'] for r in traits)))
    print(sum(1 for r in traits if r.get('effects')), 'with numeric effects')


if __name__ == '__main__':
    main()
