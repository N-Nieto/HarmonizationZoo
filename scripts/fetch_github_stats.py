#!/usr/bin/env python3
"""
Enriches data/methods.json with live data from the GitHub API, for every
entry that has a `github` field:

- stars, forks, open issues
- license (SPDX id), topics, archived flag
- repo_description (GitHub's own one-line description)
- repo_created_at (when the repo was created)
- first_commit_date (date of the repo's oldest commit on its default
  branch) — this is what the app's "Year" timeline groups by, since it's
  automatable and verifiable for every method with code, unlike paper_year
  which depends on us finding and checking the actual publication.
- last_commit (date of the most recent commit / push)

Usage:
    python3 scripts/fetch_github_stats.py

Set GITHUB_TOKEN in the environment to raise the rate limit from 60/hr
(unauthenticated) to 5000/hr — each repo now costs 2 API calls (repo info +
first-commit lookup, occasionally 3 if pagination is needed), so this
matters much sooner than it used to. Safe to re-run any time; also wired
into a scheduled GitHub Action (.github/workflows/refresh-stats.yml) so the
zoo's numbers stay current without anyone editing JSON by hand.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

API = "https://api.github.com/repos/{repo}"
TOKEN = os.environ.get("GITHUB_TOKEN")


def _request(url):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "harmonization-zoo-bot")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read()), dict(resp.headers)


def fetch_repo(repo):
    try:
        data, _ = _request(API.format(repo=repo))
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)

    pushed_at = data.get("pushed_at")
    created_at = data.get("created_at")
    return {
        "stars": data.get("stargazers_count"),
        "forks": data.get("forks_count"),
        "open_issues": data.get("open_issues_count"),
        "license": (data.get("license") or {}).get("spdx_id"),
        "topics": data.get("topics") or [],
        "archived": data.get("archived", False),
        "repo_created_at": created_at.split("T")[0] if created_at else None,
        "last_commit": pushed_at.split("T")[0] if pushed_at else None,
        "repo_description": data.get("description"),
        "_default_branch": data.get("default_branch", "main"),
    }, None


def fetch_first_commit_date(repo, default_branch):
    """
    Finds the date of the repo's oldest commit on its default branch by
    walking the `Link: rel="last"` pagination header on the commits
    endpoint (per_page=1), which GitHub sets to the final page — i.e. the
    single oldest commit — without us having to page through everything.
    """
    url = f"https://api.github.com/repos/{repo}/commits?sha={default_branch}&per_page=1"
    try:
        data, headers = _request(url)
    except Exception as e:  # noqa: BLE001
        return None, str(e)

    link = headers.get("Link") or headers.get("link")
    last_page_url = None
    if link:
        for part in link.split(","):
            m = re.search(r'<([^>]+)>;\s*rel="last"', part)
            if m:
                last_page_url = m.group(1)
                break

    if last_page_url:
        try:
            data, _ = _request(last_page_url)
        except Exception as e:  # noqa: BLE001
            return None, str(e)

    if not data:
        return None, "no commits"

    date = data[-1]["commit"]["committer"]["date"]
    return date.split("T")[0], None


def main():
    path = "data/methods.json"
    with open(path) as f:
        db = json.load(f)

    ok, failed = 0, []
    for m in db["methods"]:
        if not m.get("github"):
            continue
        repo = m["github"]

        stats, err = fetch_repo(repo)
        if not stats:
            failed.append((repo, err))
            print(f"  ✗ {repo}: {err}", file=sys.stderr)
            continue

        default_branch = stats.pop("_default_branch")
        time.sleep(0.3)
        first_commit, fc_err = fetch_first_commit_date(repo, default_branch)
        stats["first_commit_date"] = first_commit

        m.update(stats)
        ok += 1
        yr = first_commit[:4] if first_commit else "?"
        print(f"  ✓ {repo}: {stats['stars']} stars, first commit {yr}, last commit {stats['last_commit']}")
        if fc_err:
            print(f"    (first-commit lookup issue: {fc_err})", file=sys.stderr)
        time.sleep(0.3)

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
