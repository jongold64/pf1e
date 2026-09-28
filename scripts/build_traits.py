"""Build traits.json from PSRD-Data: the character traits in the Advanced Player's Guide and Ultimate Campaign.

Each trait is a section of type 'trait' under a heading naming its category ("Combat Traits", "Dwarf Race Traits",
"Regional Traits"). A trait in both books keeps the Ultimate Campaign wording (the later reprint) and lists the other
book in also_in. Simple numeric benefits are read into `effects` for the app:
  saves {fort/ref/will: n}, initiative n, skills {name: n} ("+1 trait bonus on Perception checks"),
  class_skills [name] ("... and Perception is always a class skill for you").

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


def effects_of(body, skills):
    out = {}
    if re.search(r'one of the following', body, re.I):
        return out
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
            names = [n for n in skills if re.search(rf'\b{re.escape(n)}\b', m.group(2))]
            # Craft / Perform / Profession bonuses are for one specialty (Craft (alchemy)); left out rather than misapplied.
            for n in names:
                if n not in ('Craft', 'Perform', 'Profession'):
                    out.setdefault('skills', {})[n] = int(m.group(1))
        # "... and Perception is always a class skill for you"; "one of these (your choice)" is left to the player.
        for m in re.finditer(r'(?:and|,|^)\s*([A-Z][A-Za-z ()]+?) (?:is|are) (?:always )?(?:a )?class skills? for you', sentence):
            names = [n for n in skills if re.search(rf'\b{re.escape(n)}\b', m.group(1))]
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
