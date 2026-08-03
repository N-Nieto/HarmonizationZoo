#!/usr/bin/env python3
"""
Flags likely near-duplicate entries in data/methods.json — same method added
twice under different ids/names, most often by copy-pasting a citation list
without checking what's already in the database.

Compares every pair of entries on (a) paper_title and (b) name, using
difflib's SequenceMatcher (stdlib, no dependencies). Two entries are flagged
if either similarity is above the threshold, unless the pair is explicitly
allow-listed below (e.g. ComBat and neuroComBat legitimately share the exact
same paper title — they're the R and Python implementations of the same
method, that's not a duplicate).

Usage:
    python3 scripts/check_duplicates.py            # human-readable report
    python3 scripts/check_duplicates.py --ci        # same, but exits 1 if
                                                      # anything is flagged
                                                      # (for GitHub Actions)

This is intentionally conservative (high threshold, few false positives) —
it's a nudge for a human reviewer to double check, not an auto-reject.
"""
import argparse
import json
import sys
from difflib import SequenceMatcher

TITLE_THRESHOLD = 0.90
NAME_THRESHOLD = 0.92

# (id_a, id_b) pairs that are known, intentional near-duplicates — e.g. two
# repos/implementations of the literal same paper. Order doesn't matter.
ALLOWED = {
    frozenset({"combat", "neurocombat"}),   # same Fortin et al. 2018 paper, R vs Python/MATLAB implementations
    frozenset({"harmonizer", "harmonizr"}), # different tools (MRI benchmark vs. omics/proteomics), just similarly named
}


def similarity(a, b):
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ci", action="store_true", help="exit 1 if any duplicates are flagged")
    parser.add_argument("--path", default="data/methods.json")
    args = parser.parse_args()

    with open(args.path) as f:
        methods = json.load(f)["methods"]

    flags = []
    for i in range(len(methods)):
        for j in range(i + 1, len(methods)):
            a, b = methods[i], methods[j]
            pair = frozenset({a["id"], b["id"]})
            if pair in ALLOWED:
                continue

            title_sim = similarity(a.get("paper_title"), b.get("paper_title"))
            name_sim = similarity(a.get("name"), b.get("name"))

            if title_sim >= TITLE_THRESHOLD or name_sim >= NAME_THRESHOLD:
                flags.append((a["id"], b["id"], title_sim, name_sim))

    if not flags:
        print(f"No likely duplicates found among {len(methods)} methods.")
        return 0

    print(f"Possible duplicates found ({len(flags)}):\n")
    for id_a, id_b, title_sim, name_sim in flags:
        print(f"  '{id_a}'  <->  '{id_b}'   (title similarity {title_sim:.2f}, name similarity {name_sim:.2f})")
    print(
        "\nIf these are genuinely different methods (e.g. two implementations of the "
        "same paper), add the pair to ALLOWED in scripts/check_duplicates.py."
    )

    return 1 if args.ci else 0


if __name__ == "__main__":
    sys.exit(main())
