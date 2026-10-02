"""Build domains.json from PSRD-Data: cleric domains (Core Rulebook), subdomains (Advanced Player's Guide), druid domains
and inquisitions (Ultimate Magic, Ultimate Combat).

Each: { id, name, kind ('domain' | 'subdomain' | 'druid' | 'inquisition'), source, description, powers: [{ name, text,
level? }], spells: { "1": "obscuring mist", ... } } plus, for a subdomain, parents: [domain ids] (its associated domains),
replaces (the parent's power it replaces) and the spells listed are only the ones it swaps in.

Usage: python build_domains.py path/to/domains.json   (set PSRD to the PSRD-Data folder)
"""
import json, re, sys
from collections import Counter
from common import ALL_BOOKS, iter_books, slug, text, clean

KINDS = {'cleric_domain': 'domain', 'cleric_subdomain': 'subdomain', 'druid_domain': 'druid', 'inquisitor_inquisition': 'inquisition'}
ORDINAL = r'(\d+)(?:st|nd|rd|th)'


def descendants(n):
    for ch in n.get('children') or []:
        yield ch
        yield from descendants(ch)


def spell_list(body):
    """'1st—obscuring mist, 2nd—wind wall, ...' -> {'1': 'obscuring mist', '2': 'wind wall'}."""
    t = re.sub(r'\s+', ' ', body).replace('—', '-').replace('&mdash;', '-')
    return {m.group(1): m.group(2).strip().rstrip('.') for m in re.finditer(ORDINAL + r'\s*-\s*([^,]+?)(?=,\s*\d+(?:st|nd|rd|th)\s*-|\.?$)', t)}


def main():
    out_path = sys.argv[1]
    found = {}
    for db, book, abbr, c, rows in iter_books(ALL_BOOKS):
        for n in rows.values():
            kind = KINDS.get(n.get('subtype') or '')
            if not kind:
                continue
            name = re.sub(r'\s+(?:Domain|Subdomain|Inquisition)$', '', clean(n['name']))
            rec = {'id': f"{kind}-{slug(name)}" if kind != 'domain' else slug(name), 'name': name, 'kind': kind, 'source': book,
                   'description': '', 'powers': [], 'spells': {}}
            for ch in descendants(n):
                cname = clean(ch.get('name') or '')
                body = text(ch['body'] or '')
                # Wolf's first power is stored as a plain section ("Improved Trip") rather than an ability.
                if ch.get('type') == 'ability' or (cname and body and ch.get('type') == 'section' and cname not in (
                        'Granted Powers', 'Granted Power', 'Replacement Power', 'Domain Spells', 'Replacement Domain Spells',
                        'Associated Domain', 'Associated Domains', 'Deities')):
                    p = {'name': cname, 'text': body}
                    lv = re.search(r'\bat ' + ORDINAL + r' level\b', body, re.I)
                    if lv:
                        p['level'] = int(lv.group(1))
                    rec['powers'].append(p)
                elif cname in ('Granted Powers', 'Granted Power', 'Replacement Power') and body:
                    rec['description'] = body
                    m = re.search(r'replaces the (.+?) power of the (.+?) domain', body, re.I)
                    if m:
                        rec['replaces'] = m.group(1)
                elif cname in ('Domain Spells', 'Replacement Domain Spells'):
                    rec['spells'] = spell_list(body)
                elif cname in ('Associated Domain', 'Associated Domains'):
                    # "Animal." (Feather's line runs on into another sentence, so only the first is read).
                    first = body.split('.')[0]
                    rec['parents'] = [slug(x.strip()) for x in re.split(r',|\band\b|\bor\b', first) if x.strip()]
            # Archon, Azata, Demon, Devil: "replaces the holy lance power of the Good domain or the touch of law
            # power of the Law domain" (two parents, no "Associated Domain" line).
            if kind == 'subdomain' and not rec.get('parents'):
                rec['parents'] = sorted({slug(m) for m in re.findall(r'the (\w+) domain', rec['description'])})
            # Some inquisitions describe their powers in one paragraph instead of separate abilities.
            if not rec['powers'] and rec['description']:
                rec['powers'].append({'name': 'Granted powers', 'text': rec['description']})
            if rec['id'] not in found:
                found[rec['id']] = rec
    out = sorted(found.values(), key=lambda d: (d['kind'], d['name']))
    json.dump(out, open(out_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(len(out), 'domains', dict(Counter(d['kind'] for d in out)))
    print('without spells:', [d['id'] for d in out if not d['spells'] and d['kind'] != 'inquisition'][:20])
    print('without powers:', [d['id'] for d in out if not d['powers']][:20])


if __name__ == '__main__':
    main()
