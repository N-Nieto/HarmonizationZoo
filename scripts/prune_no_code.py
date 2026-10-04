#!/usr/bin/env python3
"""
List — and optionally remove — methods that have no public code.

"No public code" means: no `github`, no `other_url`, and not listed in any
toolbox in data/toolboxes.json (the same rule as the site's "Code only"
toggle and the "Code" filter).

Removal is reversible: removed entries are appended to
data/archive/no_code_methods.json (with the date), and every reference to
them is cleaned up so the database stays valid:
  - `extends` / `implements` of other methods,
  - `methods` lists in data/resources.json and data/toolboxes.json.
Use --restore to move archived entries back.

Usage:
    python3 scripts/prune_no_code.py                     # list only (default)
    python3 scripts/prune_no_code.py --family deep-learning --since 2015
    python3 scripts/prune_no_code.py --apply             # remove + archive
    python3 scripts/prune_no_code.py --apply --ids a,b   # remove only these ids
    python3 scripts/prune_no_code.py --restore a,b       # bring archived ids back ("all" = everything)

Then run scripts/validate_methods.py and scripts/build_pages.py (build_pages
deletes the static pages of removed methods).
"""
import argparse
import json
import os
from datetime import date

METHODS = "data/methods.json"
TOOLBOXES = "data/toolboxes.json"
RESOURCES = "data/resources.json"
ARCHIVE = "data/archive/no_code_methods.json"


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def save_toolboxes(tb):
    try:  # keep the hand-edited one-line-array style
        from merge_submissions import dump_toolboxes
        with open(TOOLBOXES, "w", encoding="utf-8") as f:
            dump_toolboxes(tb, f)
    except ImportError:
        save(TOOLBOXES, tb)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="remove the listed methods (default: list only)")
    ap.add_argument("--ids", help="comma-separated ids to restrict to")
    ap.add_argument("--family", help="only methods whose primary category is this")
    ap.add_argument("--since", type=int, help="only methods with paper_year >= this")
    ap.add_argument("--before", type=int, help="only methods with paper_year < this")
    ap.add_argument("--restore", help="comma-separated archived ids to restore, or 'all'")
    args = ap.parse_args()

    db = load(METHODS)
    tb = load(TOOLBOXES, {"toolboxes": []})
    res = load(RESOURCES, {"resources": []})
    archive = load(ARCHIVE, {"removed": []})

    if args.restore:
        want = None if args.restore == "all" else set(args.restore.split(","))
        back = [a for a in archive["removed"] if want is None or a["entry"]["id"] in want]
        existing = {m["id"] for m in db["methods"]}
        for a in back:
            if a["entry"]["id"] in existing:
                print(f"skip {a['entry']['id']}: already in methods.json")
                continue
            db["methods"].append(a["entry"])
            for rid in a.get("resources", []):
                for r in res["resources"]:
                    if r["id"] == rid and a["entry"]["id"] not in r.setdefault("methods", []):
                        r["methods"].append(a["entry"]["id"])
                        r["methods"].sort()
            print(f"restored {a['entry']['id']}")
        by_id = {m["id"]: m for m in db["methods"]}
        for a in back:
            mid = a["entry"]["id"]
            for child in a.get("links", {}).get("extended_by", []):
                if child in by_id and mid not in (by_id[child].get("extends") or []):
                    by_id[child].setdefault("extends", []).append(mid)
            for child in a.get("links", {}).get("implemented_by", []):
                if child in by_id and not by_id[child].get("implements"):
                    by_id[child]["implements"] = mid
        archive["removed"] = [a for a in archive["removed"] if a not in back]
        save(METHODS, db)
        save(RESOURCES, res)
        save(ARCHIVE, archive)
        return

    in_toolbox = {mid for t in tb["toolboxes"] for mid in t.get("methods", [])}
    ids = set(args.ids.split(",")) if args.ids else None
    targets = []
    for m in db["methods"]:
        if m.get("github") or m.get("other_url") or m["id"] in in_toolbox:
            continue
        if ids is not None and m["id"] not in ids:
            continue
        if args.family and m.get("category") != args.family:
            continue
        y = m.get("paper_year")
        if args.since and (y is None or y < args.since):
            continue
        if args.before and (y is None or y >= args.before):
            continue
        targets.append(m)

    print(f"{len(targets)} method(s) without public code"
          f"{' (filtered)' if (ids or args.family or args.since or args.before) else ''}:")
    for m in sorted(targets, key=lambda x: (x.get("category", ""), x["name"].lower())):
        print(f"  {m['id']:<45} {m.get('category', ''):<24} {m.get('paper_year') or '----'}  {m['name']}")
    if not args.apply:
        print("\nList only. Re-run with --apply to remove (entries are archived and can be restored).")
        return

    gone = {m["id"] for m in targets}
    today = date.today().isoformat()
    for m in targets:
        links = {"extended_by": [o["id"] for o in db["methods"] if m["id"] in (o.get("extends") or [])],
                 "implemented_by": [o["id"] for o in db["methods"] if o.get("implements") == m["id"]]}
        archive["removed"].append({"removed_on": today, "entry": m, "links": links,
                                   "resources": [r["id"] for r in res["resources"] if m["id"] in (r.get("methods") or [])]})
    db["methods"] = [m for m in db["methods"] if m["id"] not in gone]
    for m in db["methods"]:
        if m.get("extends"):
            m["extends"] = [x for x in m["extends"] if x not in gone]
        if m.get("implements") in gone:
            m["implements"] = None
    for r in res["resources"]:
        r["methods"] = [x for x in r.get("methods", []) if x not in gone]
    for t in tb["toolboxes"]:
        t["methods"] = [x for x in t.get("methods", []) if x not in gone]

    save(METHODS, db)
    if res["resources"]:
        save(RESOURCES, res)
    save_toolboxes(tb)
    save(ARCHIVE, archive)
    print(f"\nRemoved {len(gone)} method(s); archived in {ARCHIVE}. Now run validate_methods.py and build_pages.py.")


if __name__ == "__main__":
    main()
