#!/usr/bin/env python3
"""
Validates data/methods.json and data/toolboxes.json before they reach the site.

Checks:
- required fields present, ids unique and slug-shaped
- `level`, `category`, `method_type`, `entry_type` use known values
- every URL field is http(s) (blocks javascript:, data:, etc.)
- `github` is a plain "owner/repo" slug
- numbers are numbers, dates are YYYY-MM-DD
- `extends` / `implements` / toolbox `methods` point at ids that exist
- `modalities_proposed` / `modalities_tested` use the controlled list
- data/resources.json (optional): ids, DOI/URL, type, scope, and method references
- `evidence` entries (paper showing a method tested on a modality) have a modality + DOI/URL

Exit code 1 on any error (CI fails); warnings are printed but don't fail.

Usage:
    python3 scripts/validate_methods.py
"""
import json
import re
import sys

LEVELS = {"feature-level", "image-level", "acquisition-level"}
CATEGORIES = {
    "combat-family", "classical-normalization", "deep-learning", "iqm-based", "normative-modeling",
    "interpolation-based", "federated", "ica-based", "optimal-transport", "acquisition-protocol",
    "domain-adaptation",
}
RESOURCE_TYPES = {"survey", "systematic-review", "review", "benchmark", "book-chapter", "research", "guide"}
METHOD_TYPES = {"statistical", "deep-learning", "machine-learning", "other"}
ENTRY_TYPES = {"method", "implementation", "toolbox", "protocol"}
MODALITIES = {
    "sMRI", "dMRI", "fMRI", "connectome", "EEG", "MEG", "PET", "CT", "radiomics", "omics",
    "histopathology", "general-imaging", "general", "MRI-acquisition",
}
URL_FIELDS = ["paper_url", "other_url", "pretrained_weights_url"]
INT_FIELDS = ["paper_year", "citations", "stars", "forks", "open_issues", "n_authors"]
DATE_FIELDS = ["last_commit", "first_commit_date", "repo_created_at"]
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SLUG_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_http_url(u):
    return isinstance(u, str) and re.match(r"^https?://[^\s\"'<>]+$", u) is not None


def main():
    errors, warnings = [], []
    with open("data/methods.json", encoding="utf-8") as f:
        methods = json.load(f)["methods"]
    with open("data/toolboxes.json", encoding="utf-8") as f:
        toolboxes = json.load(f)["toolboxes"]

    ids = [m.get("id") for m in methods]
    id_set = set(ids)
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        errors.append(f"duplicate id: {dup}")

    for m in methods:
        mid = m.get("id", "<missing id>")
        err = lambda msg: errors.append(f"{mid}: {msg}")  # noqa: E731

        for field in ("id", "name", "category", "level", "method_type"):
            if not m.get(field):
                err(f"missing required field `{field}`")
        if m.get("id") and not ID_RE.match(m["id"]):
            err("id must be lowercase letters, digits and hyphens")
        if m.get("level") and m["level"] not in LEVELS:
            err(f"unknown level `{m['level']}`")
        if m.get("category") and m["category"] not in CATEGORIES:
            err(f"unknown category `{m['category']}` (add it here and to FAMILY_ORDER in js/app.js)")
        for sc in m.get("secondary_categories") or []:
            if sc not in CATEGORIES:
                err(f"unknown secondary category `{sc}`")
            elif sc == m.get("category"):
                err(f"secondary category `{sc}` repeats the primary category")
        if m.get("method_type") and m["method_type"] not in METHOD_TYPES:
            err(f"unknown method_type `{m['method_type']}`")
        if m.get("entry_type") and m["entry_type"] not in ENTRY_TYPES:
            err(f"unknown entry_type `{m['entry_type']}`")

        for field in URL_FIELDS:
            if m.get(field) and not is_http_url(m[field]):
                err(f"`{field}` must be an http(s) URL, got {m[field]!r}")
        if m.get("github") and not SLUG_RE.match(m["github"]):
            err(f"`github` must be 'owner/repo', got {m['github']!r}")

        for field in INT_FIELDS:
            v = m.get(field)
            if v is not None and (not isinstance(v, int) or isinstance(v, bool)):
                err(f"`{field}` must be an integer or null, got {v!r}")
        for field in DATE_FIELDS:
            v = m.get(field)
            if v is not None and not (isinstance(v, str) and DATE_RE.match(v)):
                err(f"`{field}` must be YYYY-MM-DD or null, got {v!r}")

        for field in ("tags", "language", "topics", "authors"):
            v = m.get(field)
            if v is not None and not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                err(f"`{field}` must be a list of strings")
        for field in ("modalities_proposed", "modalities_tested"):
            for x in m.get(field) or []:
                if x not in MODALITIES:
                    err(f"`{field}` has unknown modality `{x}`")

        for ev in m.get("evidence") or []:
            if not isinstance(ev, dict) or ev.get("modality") not in MODALITIES:
                err(f"`evidence` entries need a known `modality`, got {ev!r}")
            elif not (ev.get("doi") or is_http_url(ev.get("url"))):
                err(f"`evidence` for {ev.get('modality')} needs a `doi` or an http(s) `url`")
            elif ev.get("modality") not in (m.get("modalities_tested") or []):
                warnings.append(f"{mid}: evidence for {ev['modality']} but it is not in modalities_tested")

        for ref in m.get("extends") or []:
            if ref not in id_set:
                err(f"`extends` points at unknown id `{ref}`")
        if m.get("implements") and m["implements"] not in id_set:
            err(f"`implements` points at unknown id `{m['implements']}`")
        if m.get("needs_review"):
            warnings.append(f"{mid}: needs review — {m['needs_review']}")

    for tb in toolboxes:
        tid = tb.get("id", "<toolbox>")
        if not is_http_url(tb.get("url")):
            errors.append(f"toolbox {tid}: `url` must be an http(s) URL")
        for ref in tb.get("methods", []):
            if ref not in id_set:
                errors.append(f"toolbox {tid}: lists unknown method id `{ref}`")

    # data/resources.json is optional (Resources tab)
    try:
        with open("data/resources.json", encoding="utf-8") as f:
            resources = json.load(f)["resources"]
    except FileNotFoundError:
        resources = []
    res_ids = [r.get("id") for r in resources]
    for dup in sorted({i for i in res_ids if res_ids.count(i) > 1}):
        errors.append(f"duplicate resource id: {dup}")
    for r in resources:
        rid = r.get("id", "<resource>")
        if not r.get("id") or not ID_RE.match(r["id"]):
            errors.append(f"resource {rid}: id must be lowercase letters, digits and hyphens")
        if not r.get("title"):
            errors.append(f"resource {rid}: missing title")
        if not r.get("doi") and not is_http_url(r.get("url")):
            errors.append(f"resource {rid}: needs a `doi` or an http(s) `url`")
        if r.get("url") and not is_http_url(r["url"]):
            errors.append(f"resource {rid}: `url` must be an http(s) URL")
        if r.get("type") and r["type"] not in RESOURCE_TYPES:
            errors.append(f"resource {rid}: unknown type `{r['type']}`")
        for x in r.get("scope") or []:
            if x not in MODALITIES:
                errors.append(f"resource {rid}: unknown scope modality `{x}`")
        for ref in r.get("methods") or []:
            if ref not in id_set:
                errors.append(f"resource {rid}: lists unknown method id `{ref}`")

    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    print(f"\nChecked {len(methods)} methods, {len(toolboxes)} toolboxes and {len(resources)} resources: "
          f"{len(errors)} error(s), {len(warnings)} warning(s).")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
