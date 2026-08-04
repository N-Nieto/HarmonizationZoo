#!/usr/bin/env python3
"""
Fills in `citations` for methods.json entries, using the free Semantic
Scholar Graph API — https://api.semanticscholar.org/graph/v1/.

Two lookup paths:
1. Entries with a DOI in `paper_url` (https://doi.org/...) are looked up in
   one batch call via POST /graph/v1/paper/batch — this is the primary,
   most reliable path.
2. Entries with a `paper_title` but no DOI (e.g. arXiv-only papers) fall
   back to GET /graph/v1/paper/search by title, one call each, and are only
   accepted if the returned title is a close match (to avoid attaching the
   wrong paper's citation count).

NOT wired into the scheduled GitHub Action, and NOT run automatically —
api.semanticscholar.org isn't reachable from the sandbox this project was
built and maintained in, so **this script cannot be tested from here**.
It's written against Semantic Scholar's documented, stable API, but if it's
still not working for you, run with `-v` and share the printed HTTP status
+ response body for the failing entries — that'll show the actual reason
(not-yet-indexed DOI, rate limiting, a malformed request, etc.) rather than
guessing.

Usage:
    python3 scripts/fetch_citations.py            # normal run
    python3 scripts/fetch_citations.py -v          # verbose: print raw
                                                     # API responses too
    python3 scripts/fetch_citations.py --dry-run   # print what would be
                                                     # looked up, don't call
                                                     # the API or write the file

Semantic Scholar's public rate limit is low (~100 requests / 5 minutes)
without an API key; get a free one at
https://www.semanticscholar.org/product/api and set S2_API_KEY to raise it.
"""
import argparse
import difflib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_KEY = None
DOI_RE = re.compile(r"doi\.org/(.+)$")
BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,citationCount,externalIds"
SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
TITLE_MATCH_THRESHOLD = 0.85


def _headers():
    h = {"User-Agent": "harmonization-zoo-bot", "Content-Type": "application/json"}
    if API_KEY:
        h["x-api-key"] = API_KEY
    return h


def _request(url, data=None, verbose=False):
    req = urllib.request.Request(url, data=data, headers=_headers(), method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            if verbose:
                print(f"    [{resp.status}] {url}\n    {body[:500]!r}")
            return json.loads(body), resp.status, None
    except urllib.error.HTTPError as e:
        body = e.read()
        if verbose:
            print(f"    [{e.code}] {url}\n    {body[:500]!r}")
        return None, e.code, body.decode("utf-8", errors="replace")
    except Exception as e:  # noqa: BLE001
        return None, None, str(e)


def doi_from_url(url):
    if not url or "doi.org/" not in url:
        return None
    m = DOI_RE.search(url)
    return m.group(1) if m else None


def fetch_single(doi, verbose=False):
    url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{urllib.parse.quote(doi, safe='')}?fields=title,citationCount"
    data, status, err = _request(url, verbose=verbose)
    if data is None:
        return None, f"HTTP {status} — {err}"
    return data.get("citationCount"), None


def fetch_batch(doi_entries, verbose=False, retries=3):
    """doi_entries: list of (method_id, doi). Returns {method_id: citationCount}."""
    ids = [f"DOI:{doi}" for _, doi in doi_entries]
    payload = json.dumps({"ids": ids}).encode("utf-8")

    data = None
    for attempt in range(retries):
        data, status, err = _request(BATCH_URL, data=payload, verbose=verbose)
        if status == 429:
            wait = 5 * (attempt + 1)
            print(f"  rate limited (429), waiting {wait}s before retry {attempt + 1}/{retries}...")
            time.sleep(wait)
            continue
        break

    if data is None or not isinstance(data, list) or len(data) != len(doi_entries):
        print(f"  ✗ batch request didn't return a usable result (HTTP {status}: {err}) — "
              f"falling back to one-by-one lookups. This is slower but more likely to surface "
              f"the actual per-DOI error.", file=sys.stderr)
        out = {}
        for method_id, doi in doi_entries:
            count, err2 = fetch_single(doi, verbose=verbose)
            if count is not None:
                out[method_id] = count
                print(f"  ✓ {method_id}: {count} citations")
            else:
                print(f"  ✗ {method_id} (DOI {doi}): {err2}", file=sys.stderr)
            time.sleep(1.1)
        return out

    out = {}
    for (method_id, doi), paper in zip(doi_entries, data):
        if paper is None:
            print(f"  ✗ {method_id}: DOI {doi} not found in Semantic Scholar")
            continue
        count = paper.get("citationCount")
        out[method_id] = count
        print(f"  ✓ {method_id}: {count} citations")
    return out


def fetch_by_title(method_id, title, verbose=False):
    query = urllib.parse.urlencode({"query": title, "fields": "title,citationCount", "limit": 1})
    data, status, err = _request(f"{SEARCH_URL}?{query}", verbose=verbose)
    if data is None:
        print(f"  ✗ {method_id}: title search failed: HTTP {status} — {err}", file=sys.stderr)
        return None
    results = data.get("data") or []
    if not results:
        print(f"  ✗ {method_id}: no title-search results for '{title}'")
        return None
    top = results[0]
    match = difflib.SequenceMatcher(None, title.lower(), (top.get("title") or "").lower()).ratio()
    if match < TITLE_MATCH_THRESHOLD:
        print(f"  ✗ {method_id}: best title match too weak ({match:.2f}) — '{top.get('title')}' vs '{title}', skipping")
        return None
    print(f"  ✓ {method_id}: {top.get('citationCount')} citations (matched by title, similarity {match:.2f})")
    return top.get("citationCount")


def main():
    global API_KEY
    parser = argparse.ArgumentParser()
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--path", default="data/methods.json")
    args = parser.parse_args()
    import os
    API_KEY = os.environ.get("S2_API_KEY")

    with open(args.path) as f:
        db = json.load(f)
    methods = db["methods"]

    doi_entries = []       # (id, doi) — via paper_url
    title_only_entries = []  # (id, title) — no doi.org link, but has a title
    for m in methods:
        doi = doi_from_url(m.get("paper_url"))
        if doi:
            doi_entries.append((m["id"], doi))
        elif m.get("paper_title"):
            title_only_entries.append((m["id"], m["paper_title"]))

    print(f"{len(doi_entries)} entries with a DOI, {len(title_only_entries)} with a title but no DOI, "
          f"{len(methods) - len(doi_entries) - len(title_only_entries)} with neither (skipped).")

    if args.dry_run:
        print("\nDOI batch would include:")
        for mid, doi in doi_entries:
            print(f"  {mid}: DOI:{doi}")
        print("\nTitle search would include:")
        for mid, title in title_only_entries:
            print(f"  {mid}: '{title}'")
        return

    results = {}
    if doi_entries:
        print(f"\nBatch-fetching {len(doi_entries)} DOIs...")
        results.update(fetch_batch(doi_entries, verbose=args.verbose))

    if title_only_entries:
        print(f"\nSearching by title for {len(title_only_entries)} entries...")
        for mid, title in title_only_entries:
            count = fetch_by_title(mid, title, verbose=args.verbose)
            if count is not None:
                results[mid] = count
            time.sleep(1.1)

    for m in methods:
        if m["id"] in results:
            m["citations"] = results[m["id"]]

    with open(args.path, "w") as f:
        json.dump(db, f, indent=2)

    print(f"\nUpdated {len(results)} / {len(methods)} entries with a citation count.")


if __name__ == "__main__":
    main()
