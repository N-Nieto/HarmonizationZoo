#!/usr/bin/env python3
"""
Fills in `citations` for every entry that has a `paper_url` pointing at a
DOI, using the free Semantic Scholar Graph API.

NOT wired into the scheduled GitHub Action, and not run automatically —
api.semanticscholar.org isn't reachable from the sandbox this project was
built in, so this script is untested here. It uses Semantic Scholar's
standard, documented DOI-lookup endpoint, so it should work as-is for a
maintainer running it locally or in their own CI, but treat it as a
starting point to verify rather than a guaranteed-working pipeline.

Usage:
    python3 scripts/fetch_citations.py

Semantic Scholar's public rate limit is low (~100 requests / 5 minutes)
without an API key; get a free one at https://www.semanticscholar.org/product/api
and set S2_API_KEY to raise it.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

API_KEY = os.environ.get("S2_API_KEY")
DOI_RE = re.compile(r"doi\.org/(10\.\d{4,9}/\S+)$")


def doi_from_url(url):
    if not url:
        return None
    m = DOI_RE.search(url)
    return m.group(1) if m else None


def fetch_citation_count(doi):
    url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=citationCount"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "harmonization-zoo-bot")
    if API_KEY:
        req.add_header("x-api-key", API_KEY)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        return data.get("citationCount"), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)


def main():
    path = "data/methods.json"
    with open(path) as f:
        db = json.load(f)

    ok, skipped, failed = 0, 0, []
    for m in db["methods"]:
        doi = doi_from_url(m.get("paper_url"))
        if not doi:
            skipped += 1
            continue
        count, err = fetch_citation_count(doi)
        if err:
            failed.append((m["id"], err))
            print(f"  ✗ {m['id']}: {err}", file=sys.stderr)
        else:
            m["citations"] = count
            ok += 1
            print(f"  ✓ {m['id']}: {count} citations")
        time.sleep(1.2)  # stay well under the unauthenticated rate limit

    with open(path, "w") as f:
        json.dump(db, f, indent=2)

    print(f"\nUpdated {ok} entries. {skipped} skipped (no DOI). {len(failed)} failed.")


if __name__ == "__main__":
    main()
