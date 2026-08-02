#!/usr/bin/env python3
"""
Enriches data/methods.json with live data from the GitHub API:
stars, last commit date, and the repo's own description.

Usage:
    python3 scripts/fetch_github_stats.py

Set GITHUB_TOKEN in the environment to raise the rate limit from 60/hr
(unauthenticated) to 5000/hr. Safe to re-run any time to refresh stats —
this is also meant to be wired into a scheduled GitHub Action (see
.github/workflows/refresh-stats.yml) so the zoo's numbers stay current
without anyone editing JSON by hand.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com/repos/{repo}"
TOKEN = os.environ.get("GITHUB_TOKEN")


def fetch(repo):
    req = urllib.request.Request(API.format(repo=repo))
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "harmonization-zoo-bot")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)

    pushed_at = data.get("pushed_at")  # ISO date of last commit push
    return {
        "stars": data.get("stargazers_count"),
        "last_commit": pushed_at.split("T")[0] if pushed_at else None,
        "repo_description": data.get("description"),
        "language_detected": data.get("language"),
    }, None


def main():
    path = "data/methods.json"
    with open(path) as f:
        db = json.load(f)

    ok, failed = 0, []
    for m in db["methods"]:
        if not m.get("github"):
            continue
        repo = m["github"]
        stats, err = fetch(repo)
        if stats:
            m.update(stats)
            ok += 1
            print(f"  ✓ {repo}: {stats['stars']} stars, last commit {stats['last_commit']}")
        else:
            failed.append((repo, err))
            print(f"  ✗ {repo}: {err}", file=sys.stderr)
        time.sleep(0.5)  # be polite to the unauthenticated rate limit

    db["stats_fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(path, "w") as f:
        json.dump(db, f, indent=2)

    print(f"\nUpdated {ok} repos. {len(failed)} failed.")
    if failed:
        print("Failed repos (check the slug in data/methods.json — repo may have moved/renamed):")
        for repo, err in failed:
            print(f"  - {repo}: {err}")


if __name__ == "__main__":
    main()
