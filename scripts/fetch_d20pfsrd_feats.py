"""Download d20pfsrd.com feat (or trait) pages into a local cache folder (one HTML file per page), for
build_d20_feats.py / build_d20_traits.py.

Paizo feats from books after 2015 aren't in PSRD-Data and Foundry has few, so they come from d20pfsrd. Its
sitemap lists every page; this keeps the ones under /feats/ except the third-party section, and fetches each page
once (pages already in the cache are skipped), pausing between requests.

Usage: python fetch_d20pfsrd_feats.py [cache-folder] [section]   (default ../../d20pfsrd-feats and "feats";
       for traits: python fetch_d20pfsrd_feats.py ../../d20pfsrd-traits traits)
"""
import os, re, sys, time, urllib.error, urllib.request

CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'd20pfsrd-feats')
SECTION = sys.argv[2] if len(sys.argv) > 2 else 'feats'
# Parts of a section that aren't what the app uses (third-party material, trait drawbacks and tools).
SKIP = ('3rd-party', 'drawbacks', '/tools/')
# Optional third argument: fetch only pages whose address has this in it (e.g. "drawbacks", which SKIP otherwise leaves
# out): python fetch_d20pfsrd_feats.py ../../d20pfsrd-drawbacks traits drawbacks
ONLY = sys.argv[3] if len(sys.argv) > 3 else None
HEADERS = {'User-Agent': 'pf1e-builder personal character builder (feat import)', 'Accept': 'text/html,application/xml'}
DELAY = 0.5  # seconds between requests


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        # The site answers some pages (e.g. sitemaps) with status 404 but the real content.
        body = e.read().decode('utf-8', 'replace')
        if '<urlset' in body or 'article-content' in body:
            return body
        raise


def feat_urls():
    urls = []
    for i in range(1, 100):
        try:
            xml = get(f'https://www.d20pfsrd.com/wp-sitemap-posts-page-{i}.xml')
        except urllib.error.HTTPError:
            break
        found = re.findall(r'<loc>([^<]+)</loc>', xml)
        if not found:
            break
        urls += found
        time.sleep(DELAY)
    # A page is at least /<section>/<category>/<name>/; category index pages and the skipped parts are left out.
    if ONLY:
        return [u for u in urls if re.search(rf'd20pfsrd\.com/{SECTION}/[^/]+/[^/]+/', u) and ONLY in u and '3rd-party' not in u]
    return [u for u in urls if re.search(rf'd20pfsrd\.com/{SECTION}/[^/]+/[^/]+/', u) and not any(x in u for x in SKIP)]


def main():
    os.makedirs(CACHE, exist_ok=True)
    urls = feat_urls()
    print(len(urls), f'{SECTION} pages', flush=True)
    fetched = failed = 0
    for n, url in enumerate(urls, 1):
        name = re.sub(r'[^a-z0-9-]+', '_', url.split(f'/{SECTION}/')[1].strip('/').lower()) + '.html'
        path = os.path.join(CACHE, name)
        if os.path.exists(path):
            continue
        try:
            html = get(url)
        except Exception as e:  # keep going; a rerun retries what's missing
            failed += 1
            print('failed', url, e, flush=True)
            time.sleep(DELAY * 4)
            continue
        with open(path, 'w', encoding='utf-8') as f:
            f.write(f'<!-- {url} -->\n' + html)
        fetched += 1
        if fetched % 200 == 0:
            print(f'{n}/{len(urls)} ...', flush=True)
        time.sleep(DELAY)
    print(f'done: {fetched} fetched, {failed} failed, cache {CACHE}', flush=True)


if __name__ == '__main__':
    main()
