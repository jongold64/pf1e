"""Build drawbacks.json from the d20pfsrd.com drawback pages (Ultimate Campaign and later Paizo books), downloaded by
fetch_d20pfsrd_feats.py into ../../d20pfsrd-drawbacks:

    python fetch_d20pfsrd_feats.py ../../d20pfsrd-drawbacks traits drawbacks

A drawback is a trait-like weakness; by Paizo's rule (Ultimate Campaign) a character who takes one gains an extra trait.
Only drawbacks whose page names a Paizo book in its "Section 15" box are kept; the notices go into
scripts/d20_feat_notices.json for build_license.py.

Each record: { id, name, source, text, origin: 'd20pfsrd' }

Usage: python build_d20_drawbacks.py path/to/drawbacks.json [cache-folder]
"""
import json, os, re, sys
from common import slug
from build_d20_feats import book_name
from build_d20_traits import parse_page

ORIGIN = 'd20pfsrd'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-drawbacks')
NOTICES = os.path.join(os.path.dirname(__file__), 'd20_feat_notices.json')


def main():
    out_path = sys.argv[1]
    notices = json.load(open(NOTICES, encoding='utf-8')) if os.path.exists(NOTICES) else {}
    out, skipped = {}, []
    for name in sorted(os.listdir(CACHE)):
        rec = parse_page(open(os.path.join(CACHE, name), encoding='utf-8').read())
        if not rec or len(rec['text']) < 40:
            skipped.append(name)
            continue
        paizo = [n for n in rec['notices'] if re.search(r'Paizo,? (?:Publishing|Inc)', n)]
        if not paizo:
            skipped.append(f'{rec["name"]} (no Paizo notice)')
            continue
        source = book_name(paizo[-1])
        for n in rec['notices']:
            notices.setdefault(source, [])
            if n not in notices[source]:
                notices[source].append(n)
        out.setdefault(slug(rec['name']), {'id': slug(rec['name']), 'name': rec['name'], 'source': source,
                                           'text': rec['text'].strip(), 'origin': ORIGIN})
    drawbacks = sorted(out.values(), key=lambda d: d['name'].lower())
    json.dump(drawbacks, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    json.dump(notices, open(NOTICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(drawbacks), 'drawbacks; skipped', skipped)


if __name__ == '__main__':
    main()
