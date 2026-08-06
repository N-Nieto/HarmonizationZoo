#!/usr/bin/env python3
"""
Folds every file in data/submissions/*.json into data/methods.json, then
removes the submission files. This is the second half of the "Add a model"
tab's contribution pipeline:

  1. Someone fills in the form on the site. It generates a JSON entry and
     opens a pre-filled GitHub "new file" page for
     data/submissions/<id>.json. GitHub either commits it directly (repo
     collaborators) or auto-forks and opens a PR (everyone else).
  2. A maintainer reviews and merges that PR into main.
  3. This script runs (via .github/workflows/merge-submissions.yml,
     triggered on push to main touching data/submissions/**) and moves the
     entry into data/methods.json for real.
  4. The stats-refresh Action picks up the new entry on its next run,
     since a never-fetched entry always gets fetched regardless of the
     30-day freshness window.

Usage:
    python3 scripts/merge_submissions.py           # merge + report
    python3 scripts/merge_submissions.py --dry-run  # report only, don't write

Validation is intentionally light — this assumes a human already reviewed
the PR before merging. It checks for the handful of things that would
actually break the site (missing required fields, an id collision) rather
than trying to re-verify every fact.
"""
import argparse
import glob
import json
import os
import sys

REQUIRED_FIELDS = ["id", "name", "category", "level", "method_type", "paper_url"]
SUBMISSION_ONLY_FIELDS = ["_submitted_via", "_submitted_at"]


def load_submission(path):
    with open(path) as f:
        entry = json.load(f)
    problems = []
    for field in REQUIRED_FIELDS:
        if not entry.get(field):
            problems.append(f"missing required field '{field}'")
    if not entry.get("github") and not entry.get("other_url"):
        problems.append("neither 'github' nor 'other_url' is set — a source code link is required")
    return entry, problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--submissions-dir", default="data/submissions")
    parser.add_argument("--methods-path", default="data/methods.json")
    args = parser.parse_args()

    submission_paths = sorted(glob.glob(os.path.join(args.submissions_dir, "*.json")))
    if not submission_paths:
        print("No pending submissions found.")
        return 0

    with open(args.methods_path) as f:
        db = json.load(f)
    existing_ids = {m["id"] for m in db["methods"]}

    merged, rejected = [], []
    for path in submission_paths:
        entry, problems = load_submission(path)
        if problems:
            rejected.append((path, problems))
            print(f"✗ {path}: {'; '.join(problems)}", file=sys.stderr)
            continue
        if entry["id"] in existing_ids:
            rejected.append((path, [f"id '{entry['id']}' already exists in methods.json"]))
            print(f"✗ {path}: id '{entry['id']}' already exists — rename it or check for a duplicate entry", file=sys.stderr)
            continue

        for f in SUBMISSION_ONLY_FIELDS:
            entry.pop(f, None)

        db["methods"].append(entry)
        existing_ids.add(entry["id"])
        merged.append(path)
        print(f"✓ merged '{entry['id']}' ({entry['name']})")

    if merged and not args.dry_run:
        with open(args.methods_path, "w") as f:
            json.dump(db, f, indent=2)
        for path in merged:
            os.remove(path)

    print(f"\n{len(merged)} merged, {len(rejected)} rejected, {len(submission_paths)} total.")
    if rejected:
        print("\nRejected submissions were left in place for a human to fix:")
        for path, problems in rejected:
            print(f"  {path}: {'; '.join(problems)}")

    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(main())
