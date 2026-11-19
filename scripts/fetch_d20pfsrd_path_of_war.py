"""Download d20pfsrd.com's Path of War pages (Dreamscarred Press; third-party, open content) into a local cache folder,
one HTML file per page, for build_dsp_path_of_war.py.

It starts at the Path of War index and follows every link that stays under it, fetching each page once (pages already in
the cache are skipped), pausing between requests.

Usage: python fetch_d20pfsrd_path_of_war.py [cache-folder]   (default ../../d20pfsrd-path-of-war)
"""
import os, re, sys, time, urllib.error
from fetch_d20pfsrd_feats import get, DELAY

CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-path-of-war')
BASE = 'https://www.d20pfsrd.com/alternative-rule-systems/3rd-party-rules-systems/path-of-war/'


def cache_name(url):
    rest = url[len(BASE):].strip('/') or 'index'
    return re.sub(r'[^a-z0-9-]+', '_', rest.lower()) + '.html'


def main():
    os.makedirs(CACHE, exist_ok=True)
    todo, seen = [BASE], {BASE}
    fetched = failed = 0
    while todo:
        url = todo.pop(0)
        path = os.path.join(CACHE, cache_name(url))
        if os.path.exists(path):
            page = open(path, encoding='utf-8').read()
        else:
            try:
                page = get(url)
            except (urllib.error.URLError, TimeoutError) as e:
                print('failed', url, e, flush=True)
                failed += 1
                continue
            open(path, 'w', encoding='utf-8').write(page)
            fetched += 1
            time.sleep(DELAY)
        # Links in the page's own text only (not the site menu, which links every section).
        body = page.split('article-content', 1)[-1]
        for link in re.findall(r'href="(' + re.escape(BASE) + r'[^"#?]*)"', body):
            link = link if link.endswith('/') else link + '/'
            if link not in seen:
                seen.add(link)
                todo.append(link)
    print(f'{len(seen)} pages, {fetched} fetched, {failed} failed', flush=True)


if __name__ == '__main__':
    main()
