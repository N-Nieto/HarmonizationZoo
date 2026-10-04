#!/usr/bin/env python3
"""
Folds every file in data/submissions/*.json into data/methods.json, then
removes the submission files. This is the second half of the "Add a model"
tab's contribution pipeline:

  1. Someone fills in the form on the site. It generates a JSON entry, the
     browser downloads it as <id>.json, and the form opens GitHub's upload
     page for data/submissions/. GitHub either commits it (collaborators) or
     forks the repo and opens a PR (everyone else).
  2. A maintainer reviews and merges that PR into main.
  3. This script runs (via .github/workflows/merge-submissions.yml,
     triggered on push to main touching data/submissions/**) and moves the
     entry into data/methods.json for real:
       - fills every schema-v2 field that's missing with its default, so
         older/hand-written submissions still produce complete entries;
       - derives doi / arxiv_id from paper_url, makes modalities_tested a
         superset of modalities_proposed and the evidence modalities;
       - adds the id to any toolbox listed in `_toolboxes`
         (data/toolboxes.json);
       - drops submission-only fields (`_submitted_via`, `_notes`, ...).
  4. scripts/validate_methods.py then checks the whole database, and the
     stats-refresh Action picks up the new entry on its next run.

Usage:
    python3 scripts/merge_submissions.py           # merge + report
    python3 scripts/merge_submissions.py --dry-run  # report only, don't write

Validation here covers what would break the site or the validator (missing
required fields, id collisions, unknown enum values or references, bad
URLs); a human is still expected to review facts in the PR.
"""
import argparse
import copy
import glob
import json
import os
import re
import sys
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_methods import (  # noqa: E402
    CATEGORIES, ENTRY_TYPES, ID_RE, LEVELS, METHOD_TYPES, MODALITIES, SLUG_RE, is_http_url,
)

REQUIRED_FIELDS = ["id", "name", "category", "level", "method_type", "paper_url"]

# Every key an entry in methods.json has, in canonical order, with its default.
DEFAULTS = {
    "id": None, "name": None, "category": None, "method_type": None, "level": None,
    "tags": [], "paper_title": None, "paper_year": None, "paper_url": None, "github": None,
    "language": [], "other_url": None, "abstract": None, "citations": None,
    "stars": None, "forks": None, "open_issues": None, "license": None, "topics": None,
    "archived": None, "repo_created_at": None, "first_commit_date": None, "last_commit": None,
    "repo_description": None, "stats_fetched_at": None, "category_label": None,
    "in_uniharmony": False, "also_implemented_in": [], "validation_data": "Agnostic",
    "modality": "MRI (unspecified)", "needs_gpu": False, "architecture_backbone": None,
    "framework": None, "has_pretrained_weights": None, "pretrained_weights_url": None,
    "recommend": None,  # filled separately below
    "doi": None, "arxiv_id": None, "authors": [], "n_authors": None, "venue": None,
    "publication_type": None, "modalities_proposed": [], "modalities_tested": [],
    "modalities_verified": False, "entry_type": "method", "implements": None,
    "extends": [], "evidence": [], "secondary_categories": [],
}
RECOMMEND_DEFAULTS = {
    "requires_site_id": True, "generalizes_to_new_site": False, "low_n_friendly": False,
    "requires_linear_signal": None, "ml_compatible": True, "needs_gpu": False,
    "longitudinal": False, "requires_paired_data": False,
}
LEGACY_MODALITY = {
    "sMRI": "Structural MRI", "dMRI": "Diffusion MRI", "fMRI": "Functional MRI",
    "connectome": "Functional MRI", "EEG": "EEG", "MEG": "MEG",
    "PET": "Medical imaging (general, not MRI-brain-specific)",
    "CT": "Radiomics (CT/MRI)", "radiomics": "Radiomics (CT/MRI)", "omics": "Omics/Proteomics",
    "histopathology": "Medical imaging (general, not MRI-brain-specific)",
    "general-imaging": "Medical imaging (general, not MRI-brain-specific)",
    "general": "Modality-agnostic (general ML)", "MRI-acquisition": "Acquisition (modality-agnostic)",
}
MODALITY_ORDER = [
    "sMRI", "dMRI", "fMRI", "connectome", "EEG", "MEG", "PET", "CT", "radiomics", "omics",
    "histopathology", "general-imaging", "general", "MRI-acquisition",
]
DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")


def doi_from_url(url):
    m = re.search(r"doi\.org/(.+)$", url or "", re.I)
    if not m:
        return None
    doi = unquote(m.group(1)).strip()
    return doi if DOI_RE.match(doi) else None


def arxiv_from_url(url):
    m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", url or "", re.I)
    return m.group(1) if m else None


def normalize(entry, category_labels):
    """Return (normalized entry, toolboxes to join, problems)."""
    problems = []
    toolboxes = entry.pop("_toolboxes", None) or []
    for k in [k for k in entry if k.startswith("_")]:
        entry.pop(k)

    for field in REQUIRED_FIELDS:
        if not entry.get(field):
            problems.append(f"missing required field '{field}'")
    if not entry.get("github") and not entry.get("other_url"):
        problems.append("neither 'github' nor 'other_url' is set — a source code link is required")
    if entry.get("id") and not ID_RE.match(entry["id"]):
        problems.append("id must be lowercase letters, digits and hyphens")
    for field, allowed in (("level", LEVELS), ("category", CATEGORIES),
                           ("method_type", METHOD_TYPES), ("entry_type", ENTRY_TYPES)):
        if entry.get(field) and entry[field] not in allowed:
            problems.append(f"unknown {field} '{entry[field]}'")
    for sc in entry.get("secondary_categories") or []:
        if sc not in CATEGORIES:
            problems.append(f"unknown secondary category '{sc}'")
    for field in ("paper_url", "other_url", "pretrained_weights_url"):
        if entry.get(field) and not is_http_url(entry[field]):
            problems.append(f"'{field}' must be an http(s) URL")
    if entry.get("github") and not SLUG_RE.match(entry["github"]):
        problems.append("'github' must be 'owner/repo'")

    out = {}
    for key, default in DEFAULTS.items():
        out[key] = entry.pop(key) if key in entry else copy.deepcopy(default)
    out.update(entry)  # keep any extra keys a maintainer added by hand, after the canonical ones

    rec = dict(RECOMMEND_DEFAULTS)
    if out["category"] == "combat-family":
        rec["ml_compatible"] = False
    rec["needs_gpu"] = bool(out.get("needs_gpu"))
    rec.update(out.get("recommend") or {})
    out["recommend"] = rec

    if not out["doi"]:
        out["doi"] = doi_from_url(out["paper_url"])
    if not out["arxiv_id"]:
        out["arxiv_id"] = arxiv_from_url(out["paper_url"])
    if not out["category_label"]:
        out["category_label"] = category_labels.get(out["category"])
    if out["authors"] and not out["n_authors"]:
        out["n_authors"] = len(out["authors"])

    bad = [m for m in out["modalities_proposed"] + out["modalities_tested"] if m not in MODALITIES]
    bad += [ev.get("modality") for ev in out["evidence"] if ev.get("modality") not in MODALITIES]
    if bad:
        problems.append(f"unknown modality value(s): {sorted(set(map(str, bad)))}")
    tested = set(out["modalities_tested"]) | set(out["modalities_proposed"])
    tested |= {ev["modality"] for ev in out["evidence"] if ev.get("modality") in MODALITIES}
    out["modalities_tested"] = [m for m in MODALITY_ORDER if m in tested]
    if out["modality"] == DEFAULTS["modality"] and out["modalities_proposed"]:
        out["modality"] = LEGACY_MODALITY.get(out["modalities_proposed"][0], out["modality"])

    for i, ev in enumerate(out["evidence"], 1):
        if ev.get("doi") and not DOI_RE.match(ev["doi"]):
            problems.append(f"evidence #{i}: malformed DOI '{ev['doi']}'")
        if ev.get("url") and not is_http_url(ev["url"]):
            problems.append(f"evidence #{i}: url must be http(s)")
        if not ev.get("doi") and not ev.get("url"):
            problems.append(f"evidence #{i}: needs a doi or url")

    if "uniharmony" in toolboxes:
        out["in_uniharmony"] = True
    return out, toolboxes, problems


def dump_toolboxes(tb_db, f):
    """Write toolboxes.json in its hand-edited style: lists of plain strings stay on one line."""
    text = json.dumps(tb_db, indent=2, ensure_ascii=False)
    text = re.sub(
        r"\[\s*((?:\"(?:[^\"\\]|\\.)*\"\s*,?\s*)+)\]",
        lambda m: "[" + ", ".join(x.strip() for x in m.group(1).split(",\n") if x.strip()).rstrip(",") + "]",
        text,
    )
    f.write(text + "\n")


def load_category_labels(methods):
    labels = {}
    for m in methods:
        if m.get("category") and m.get("category_label"):
            labels.setdefault(m["category"], m["category_label"])
    return labels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--submissions-dir", default="data/submissions")
    parser.add_argument("--methods-path", default="data/methods.json")
    parser.add_argument("--toolboxes-path", default="data/toolboxes.json")
    args = parser.parse_args()

    submission_paths = sorted(glob.glob(os.path.join(args.submissions_dir, "*.json")))
    if not submission_paths:
        print("No pending submissions found.")
        return 0

    with open(args.methods_path, encoding="utf-8") as f:
        db = json.load(f)
    tb_db = None
    if os.path.exists(args.toolboxes_path):
        with open(args.toolboxes_path, encoding="utf-8") as f:
            tb_db = json.load(f)
    toolbox_by_id = {t["id"]: t for t in (tb_db or {}).get("toolboxes", [])}
    existing_ids = {m["id"] for m in db["methods"]}
    category_labels = load_category_labels(db["methods"])

    # Ids arriving in this same batch may reference each other via extends/implements.
    batch_ids = set()
    for path in submission_paths:
        try:
            with open(path, encoding="utf-8") as f:
                batch_ids.add(json.load(f).get("id"))
        except (OSError, ValueError):
            pass

    merged, rejected, toolboxes_changed = [], [], False
    for path in submission_paths:
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
        except ValueError as e:
            rejected.append((path, [f"not valid JSON: {e}"]))
            print(f"✗ {path}: not valid JSON: {e}", file=sys.stderr)
            continue
        if not isinstance(raw, dict):
            rejected.append((path, ["top level must be a JSON object (one method per file)"]))
            continue

        entry, toolboxes, problems = normalize(raw, category_labels)
        if entry.get("id") in existing_ids:
            problems.append(f"id '{entry['id']}' already exists in methods.json — rename it or check for a duplicate")
        known = existing_ids | batch_ids
        for ref in entry["extends"]:
            if ref not in known:
                problems.append(f"'extends' points at unknown id '{ref}'")
        if entry["implements"] and entry["implements"] not in known:
            problems.append(f"'implements' points at unknown id '{entry['implements']}'")
        for tid in toolboxes:
            if tid not in toolbox_by_id:
                problems.append(f"unknown toolbox '{tid}'")

        if problems:
            rejected.append((path, problems))
            print(f"✗ {path}: {'; '.join(problems)}", file=sys.stderr)
            continue

        db["methods"].append(entry)
        existing_ids.add(entry["id"])
        for tid in toolboxes:
            members = toolbox_by_id[tid].setdefault("methods", [])
            if entry["id"] not in members:
                members.append(entry["id"])
                toolboxes_changed = True
        merged.append(path)
        extra = f" + toolbox(es) {', '.join(toolboxes)}" if toolboxes else ""
        print(f"✓ merged '{entry['id']}' ({entry['name']}){extra}")

    if merged and not args.dry_run:
        with open(args.methods_path, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2, ensure_ascii=False)
        if toolboxes_changed:
            with open(args.toolboxes_path, "w", encoding="utf-8") as f:
                dump_toolboxes(tb_db, f)
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
