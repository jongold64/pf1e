"""Add to races.json the alternate racial traits and favored class options from Paizo books PSRD-Data and d20pfsrd lack
(Player Companions: Blood of Shadows' blended view...), from each race's Archives of Nethys page (cached in
../../aonprd-classes/lists). The page groups alternate traits under "Replaces Keen Senses, Multitalented" headings: that
heading is kept as the trait's `replaces` (race-options.js reads it before the text, since a trait's text can name what
it replaces for several races). Each new trait and option gets its book in `source`; a book without a known OGL notice
is left out. The race's `aon_sources` lists the books used, for build_license.py.

Usage: python build_aon_race_traits.py path/to/races.json   (run after build_d20_races.py; adds to the file)
"""
import html, json, re, sys
from bs4 import BeautifulSoup
from foundry import load_notices, find_notices
from build_foundry_talents import aon_page, aon_book

LISTS = [('Races_Core', 'Races.aspx?Category=Core'), ('Races_NonCore', 'Races.aspx?Category=NonCore')]
# Race names in races.json -> AoN's.
NAMES = {'Lashunta (Female)': 'Lashunta', 'Lashunta (Male)': 'Lashunta'}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', html.unescape(s).replace('’', "'").lower())


def text_of(fragment):
    soup = BeautifulSoup(fragment, 'html.parser')
    for sup in soup.find_all('sup'):
        sup.decompose()
    for br in soup.find_all('br'):
        br.replace_with('\n')
    t = '\n'.join(re.sub(r'[ \t]+', ' ', line).strip() for line in soup.get_text('').split('\n'))
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    return re.sub(r'\s+([,;.:)])', r'\1', t)


def sources(fragment):
    """The books in a source list: '<i>Blood of Shadows pg. 5</i>, <i>...</i>' -> ['Blood of Shadows', ...]."""
    return [aon_book(re.sub(r'\s*pg\..*$', '', html.unescape(b)).strip()) for b in re.findall(r'<i>(.*?)</i>', fragment)]


def section(page, title_end):
    """The HTML of the section whose h1 ends with title_end, up to the next h1."""
    m = re.search(rf'<h1[^>]*>[^<]*{title_end}\s*(?:</h1>)?(.*?)(?=<h1|$)', page, re.S)
    return m.group(1) if m else ''


def alternates(page):
    """[(name, replaces, [books], text)] from the Alternate Racial Traits section."""
    out = []
    for heading, body in re.findall(r'<h2[^>]*>\s*Replaces ([^<]*)</h2>(.*?)(?=<h2|$)', section(page, 'Alternate Racial Traits?'), re.S):
        starts = list(re.finditer(r'<b>(?:<img[^>]*>)?\s*([^<]+?)\s*</b>\s*<br\s*/?>\s*<b>Source</b>(.*?)<br\s*/?>', body, re.S))
        for k, m in enumerate(starts):
            end = starts[k + 1].start() if k + 1 < len(starts) else len(body)
            out.append((html.unescape(m.group(1)).strip(), html.unescape(heading).strip(), sources(m.group(2)), text_of(body[m.end():end])))
    return out


def favored_options(page):
    """[(class, [books], text)] from the Favored Class Options section."""
    body = section(page, 'Favored Class Options')
    starts = list(re.finditer(r'<b>(?:<img[^>]*>)?\s*([^<]+?)\s*</b>\s*\(((?:[^()]|\([^()]*\))*?)\):', body, re.S))
    out = []
    for k, m in enumerate(starts):
        end = starts[k + 1].start() if k + 1 < len(starts) else len(body)
        out.append((html.unescape(m.group(1)).strip(), sources(m.group(2)), text_of(body[m.end():end])))
    return out


def main():
    path = sys.argv[1]
    races = json.load(open(path, encoding='utf-8'))
    notices = load_notices()
    links = {}
    for name, url in LISTS:
        for x in re.findall(r'RacesDisplay\.aspx\?ItemName=([^"&]+)"', aon_page(name, 'https://aonprd.com/' + url)):
            links[norm(x)] = html.unescape(x)
    added_alts = added_fcos = 0
    skipped = {}
    for race in races:
        aon = links.get(norm(NAMES.get(race['name'], race['name'])))
        if not aon:
            continue
        page = aon_page('Race_' + re.sub(r'[^A-Za-z]', '', aon), 'https://aonprd.com/RacesDisplay.aspx?ItemName=' + aon.replace(' ', '%20'))
        have = {norm(a['name']) for a in race.get('alternate_traits') or []}
        books = set(race.get('aon_sources') or [])
        known = lambda bs: next((b for b in bs if find_notices(notices, b)), None)
        for name, replaces, bs, text in alternates(page):
            if norm(name) in have:
                continue
            book = known(bs)
            if not book:
                skipped[bs[0] if bs else '(no source)'] = skipped.get(bs[0] if bs else '(no source)', 0) + 1
                continue
            race.setdefault('alternate_traits', []).append({'name': name, 'text': text, 'replaces': replaces, 'source': book, 'origin': 'aonprd'})
            have.add(norm(name))
            books.add(book)
            added_alts += 1
        texts = {norm(f['text'])[:80] for f in race.get('favored_class_options') or []}
        for cls, bs, text in favored_options(page):
            if norm(text)[:80] in texts:
                continue
            book = known(bs)
            if not book:
                skipped[bs[0] if bs else '(no source)'] = skipped.get(bs[0] if bs else '(no source)', 0) + 1
                continue
            race.setdefault('favored_class_options', []).append({'class': cls, 'text': text, 'source': book, 'origin': 'aonprd'})
            texts.add(norm(text)[:80])
            books.add(book)
            added_fcos += 1
        if books:
            race['aon_sources'] = sorted(books)
    json.dump(races, open(path, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
    print(f'races.json: added {added_alts} alternate racial traits and {added_fcos} favored class options from Archives of Nethys')
    if skipped:
        print('  left out (no OGL notice for the book): ' + ', '.join(f'{b} ({n})' for b, n in sorted(skipped.items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    main()
