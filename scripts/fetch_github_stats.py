#!/usr/bin/env python3
"""
Enriches data/methods.json with live data from the GitHub API, for every
entry that has a `github` field:

- stars, forks, open issues
- license (SPDX id), topics, archived flag
- repo_description (GitHub's own one-line description)
- repo_created_at (when the repo was created)
- first_commit_date (date of the repo's oldest commit on its default
  branch) — this is what the app's "Year" timeline groups by.
- last_commit (date of the most recent commit / push)
- for method_type == "deep-learning" entries only: `framework`
  (PyTorch / TensorFlow / detected from the repo's own dependency files)
  and `has_pretrained_weights` / `pretrained_weights_url` (detected from
  GitHub Releases — a release with an asset that looks like a weights file).

Freshness: each entry gets its own `stats_fetched_at` timestamp. A repo is
skipped on a normal run if it was already fetched within the last 30 days —
there's no need to re-hit the API for 50+ repos on every commit if nothing
about them has changed. Anything that's never been fetched (a brand new
entry, or one that previously failed) is always fetched regardless of that
window, so a new method never has to wait a month for its first stats.
Use --force to ignore the freshness window and refetch everything.

Usage:
    python3 scripts/fetch_github_stats.py            # normal: fresh + new/missing only
    python3 scripts/fetch_github_stats.py --force     # refetch every entry regardless of age
    python3 scripts/fetch_github_stats.py --ids combat,ravel   # just these entries

Set GITHUB_TOKEN in the environment to raise the rate limit from 60/hr
(unauthenticated) to 5000/hr — each repo costs 2-4 API calls (repo info,
first-commit lookup, and for deep-learning entries, a dependency-file fetch
and a releases lookup), so this matters quickly. Safe to re-run any time;
also wired into a scheduled GitHub Action (.github/workflows/refresh-stats.yml).
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://api.github.com/repos/{repo}"
TOKEN = os.environ.get("GITHUB_TOKEN")
FRESHNESS_DAYS = 30
DEP_FILES = ["requirements.txt", "environment.yml", "environment.yaml", "setup.py", "pyproject.toml", "Pipfile"]
WEIGHT_EXTENSIONS = (".pth", ".pt", ".h5", ".ckpt", ".safetensors", ".bin", ".onnx", ".weights")


def _request(url):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "harmonization-zoo-bot")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read()), dict(resp.headers)


def is_stale(entry):
    ts = entry.get("stats_fetched_at")
    if not ts:
        return True  # never fetched — always do it
    try:
        fetched = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    age_days = (datetime.now(timezone.utc) - fetched).days
    return age_days >= FRESHNESS_DAYS


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
    """Walks the `Link: rel="last"` pagination header on the commits
    endpoint (per_page=1) to find the oldest commit without paging through
    the whole history."""
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


def detect_framework(repo):
    """Looks for a known dependency file at the repo root and greps it for
    torch/tensorflow/keras mentions. Best-effort: only checks the root
    directory, not nested source files, so this can miss frameworks
    declared unusually (e.g. only imported in code, never listed as a
    dependency) — treat a `None` result as "not detected", not "confirmed
    absent"."""
    try:
        root, _ = _request(f"https://api.github.com/repos/{repo}/contents/")
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(root, list):
        return None

    names = {item["name"]: item for item in root if isinstance(item, dict)}
    for fname in DEP_FILES:
        if fname not in names:
            continue
        try:
            file_data, _ = _request(names[fname]["url"])
            content = base64.b64decode(file_data.get("content", "")).decode("utf-8", errors="replace").lower()
        except Exception:  # noqa: BLE001
            continue
        has_torch = "torch" in content
        has_tf = "tensorflow" in content or "keras" in content
        if has_torch and has_tf:
            return "PyTorch + TensorFlow"
        if has_torch:
            return "PyTorch"
        if has_tf:
            return "TensorFlow"
    return None


def detect_pretrained_weights(repo):
    """Checks GitHub Releases for an asset that looks like a weights file
    by extension. Returns (has_weights, url)."""
    try:
        releases, _ = _request(f"https://api.github.com/repos/{repo}/releases")
    except Exception:  # noqa: BLE001
        return None, None
    if not isinstance(releases, list):
        return None, None

    for release in releases:
        for asset in release.get("assets", []):
            name = asset.get("name", "")
            if name.lower().endswith(WEIGHT_EXTENSIONS):
                return True, asset.get("browser_download_url")
    return (False, None) if releases else (None, None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="ignore the 30-day freshness window, refetch everyone")
    parser.add_argument("--ids", help="comma-separated method ids to fetch, ignoring freshness")
    parser.add_argument("--path", default="data/methods.json")
    args = parser.parse_args()
    only_ids = set(args.ids.split(",")) if args.ids else None

    with open(args.path) as f:
        db = json.load(f)

    ok, failed, skipped = 0, [], 0
    for m in db["methods"]:
        if not m.get("github"):
            continue
        if only_ids and m["id"] not in only_ids:
            continue
        if not args.force and not only_ids and not is_stale(m):
            skipped += 1
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
        time.sleep(0.3)

        if m.get("method_type") == "deep-learning":
            stats["framework"] = detect_framework(repo)
            time.sleep(0.3)
            has_weights, weights_url = detect_pretrained_weights(repo)
            stats["has_pretrained_weights"] = has_weights
            stats["pretrained_weights_url"] = weights_url
            time.sleep(0.3)

        stats["stats_fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        m.update(stats)
        ok += 1
        yr = first_commit[:4] if first_commit else "?"
        extra = f", framework={stats.get('framework')}" if m.get("method_type") == "deep-learning" else ""
        print(f"  ✓ {repo}: {stats['stars']} stars, first commit {yr}, last commit {stats['last_commit']}{extra}")
        if fc_err:
            print(f"    (first-commit lookup issue: {fc_err})", file=sys.stderr)

    db["stats_fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(args.path, "w") as f:
        json.dump(db, f, indent=2)

    print(f"\nUpdated {ok} repos. {skipped} skipped (fetched within the last {FRESHNESS_DAYS} days — use --force to override). {len(failed)} failed.")
    if failed:
        print("Failed repos (check the slug in data/methods.json — repo may have moved/renamed, or not be on GitHub at all):")
        for repo, err in failed:
            print(f"  - {repo}: {err}")


if __name__ == "__main__":
    main()
