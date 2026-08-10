#!/usr/bin/env python3
"""
Folds every file in data/submissions-stats/*.json into data/methods.json,
then removes the files. This is the persistence half of the "Fetch missing
data" / "Open PR with fetched data" flow in the header:

  1. Someone clicks "Fetch missing data" on the live site. It calls the
     GitHub and Semantic Scholar APIs directly from their browser for
     whatever's currently missing, and holds the results in memory for
     that session only.
  2. "Open PR with fetched data" bundles exactly what was freshly fetched
     into data/submissions-stats/<timestamp>.json — a map of
     {method_id: {field: value, ...}} — and opens a pre-filled GitHub page
     for that new file. Same auto-fork-and-PR behavior as the "Add a
     model" submissions pipeline.
  3. A maintainer reviews and merges the PR.
  4. This script runs (via .github/workflows/merge-stats-updates.yml,
     triggered on push to data/submissions-stats/**) and applies each
     file's field updates to the matching id in methods.json, sets that
     entry's stats_fetched_at to now (so the scheduled refresh script's
     30-day freshness check treats it as fresh, not stale), and deletes
     the update files.

Usage:
    python3 scripts/merge_stats_updates.py           # merge + report
    python3 scripts/merge_stats_updates.py --dry-run  # report only

Unknown method ids (one that doesn't exist in methods.json, e.g. because
the entry was renamed or removed between the fetch and the merge) are
skipped with a warning rather than silently dropped or erroring the whole
run.
"""
import argparse
import glob
import json
import os
import sys
import time

# Only these fields are allowed through — this file's job is to update
# GitHub/citation stats, not to let a stats-update submission smuggle in a
# change to the method's name, category, etc.
ALLOWED_FIELDS = {
    "stars", "forks", "open_issues", "license", "topics", "archived",
    "repo_created_at", "last_commit", "repo_description", "citations",
    "first_commit_date", "framework", "has_pretrained_weights", "pretrained_weights_url",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--updates-dir", default="data/submissions-stats")
    parser.add_argument("--methods-path", default="data/methods.json")
    args = parser.parse_args()

    update_paths = sorted(glob.glob(os.path.join(args.updates_dir, "*.json")))
    if not update_paths:
        print("No pending stats updates found.")
        return 0

    with open(args.methods_path) as f:
        db = json.load(f)
    by_id = {m["id"]: m for m in db["methods"]}

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    applied, skipped_ids, bad_fields = 0, [], []

    for path in update_paths:
        with open(path) as f:
            payload = json.load(f)
        updates = payload.get("updates", {})

        for method_id, fields in updates.items():
            if method_id not in by_id:
                skipped_ids.append((path, method_id))
                print(f"✗ {path}: unknown method id '{method_id}', skipping", file=sys.stderr)
                continue

            clean_fields = {k: v for k, v in fields.items() if k in ALLOWED_FIELDS}
            rejected = set(fields) - ALLOWED_FIELDS
            if rejected:
                bad_fields.append((path, method_id, rejected))
                print(f"  ({path}: ignored disallowed field(s) {rejected} for '{method_id}')", file=sys.stderr)

            by_id[method_id].update(clean_fields)
            by_id[method_id]["stats_fetched_at"] = now
            applied += 1
            print(f"✓ updated '{method_id}' with {list(clean_fields.keys())}")

    if applied and not args.dry_run:
        with open(args.methods_path, "w") as f:
            json.dump(db, f, indent=2)
        for path in update_paths:
            os.remove(path)

    print(f"\n{applied} field update(s) applied across {len(update_paths)} file(s). "
          f"{len(skipped_ids)} unknown id(s) skipped.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
