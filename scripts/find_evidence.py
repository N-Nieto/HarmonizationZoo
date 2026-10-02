#!/usr/bin/env python3
"""
Suggests "tested on" evidence for methods, for a human to review.

For every method with a distinctive name, searches Europe PMC for papers whose
title/abstract mention the method name, a modality the method isn't listed for
yet, and a harmonization term. Prints candidates (most-cited first) as a
Markdown checklist; it never edits data/methods.json. Copy the ones that hold
up after reading the abstract into the method's `evidence` list, then run
validate_methods.py and build_pages.py.

Usage:
    python3 scripts/find_evidence.py                 # all methods
    python3 scripts/find_evidence.py --ids covbat    # one or more ids
    python3 scripts/find_evidence.py > candidates.md

Generic names (e.g. "RELIEF", "unlearning", "normative") return mostly noise,
which is why NAMES below lists the search terms per method explicitly.
"""
import argparse
import json
import time
import urllib.parse
import urllib.request

API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
NAMES = {
    "combat": ["ComBat"], "combat-gam": ["ComBat-GAM", "neuroHarmonize"], "covbat": ["CovBat"],
    "longcombat": ["longitudinal ComBat", "longComBat"], "combatls": ["ComBatLS"], "deepcombat": ["DeepComBat"],
    "nested-gmm-combat": ["Nested ComBat", "GMM ComBat"], "opnestedcombat": ["OPNested"], "autocombat": ["AutoComBat"],
    "d-combat": ["d-ComBat", "distributed ComBat"], "combat-seq": ["ComBat-seq"], "whitestripe": ["WhiteStripe"],
    "nyul": ["Nyul", "Nyúl"], "ravel": ["RAVEL harmonization"], "deepharmony": ["DeepHarmony"], "calamiti": ["CALAMITI"],
    "haca3": ["HACA3"], "imunity": ["ImUnity"], "iguane": ["IGUANe"], "neuroharmony": ["Neuroharmony"],
    "harmofl": ["HarmoFL"], "rish": ["RISH harmonization", "rotation invariant spherical harmonic"],
    "hbr": ["hierarchical Bayesian regression", "PCNtoolkit"], "synthsr": ["SynthSR"],
}
MODALITIES = {
    "sMRI": ["cortical thickness", "structural MRI", "gray matter volume", "T1-weighted"],
    "dMRI": ["diffusion MRI", "diffusion tensor", "fractional anisotropy"],
    "fMRI": ["fMRI", "functional connectivity", "resting-state"],
    "EEG": ["EEG", "electroencephalography"],
    "MEG": ["magnetoencephalography"],
    "PET": ["positron emission tomography", "PET"],
    "CT": ["computed tomography"],
    "radiomics": ["radiomics", "radiomic"],
    "omics": ["gene expression", "transcriptomic", "proteomic", "RNA-seq", "methylation"],
    "histopathology": ["histopathology", "whole slide"],
}
HARM = '(harmonization OR harmonisation OR "batch effect" OR "site effect" OR "scanner effect" OR multicenter OR multisite)'


def ta(term):
    return f'(TITLE:"{term}" OR ABSTRACT:"{term}")'


def search(query, size=5):
    params = urllib.parse.urlencode({"query": query, "format": "json", "pageSize": size,
                                     "sort": "CITED desc", "resultType": "lite"})
    req = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": "harmonization-zoo-evidence"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*")
    args = ap.parse_args()
    with open("data/methods.json", encoding="utf-8") as f:
        methods = {m["id"]: m for m in json.load(f)["methods"]}
    for mid, names in NAMES.items():
        if args.ids and mid not in args.ids or mid not in methods:
            continue
        m = methods[mid]
        known = set(m.get("modalities_tested") or []) | set(m.get("modalities_proposed") or [])
        known_dois = {(e.get("doi") or "").lower() for e in m.get("evidence") or []}
        lines = []
        for mod, terms in MODALITIES.items():
            if mod in known:
                continue
            q = "(" + " OR ".join(ta(n) for n in names) + ") AND (" + " OR ".join(ta(t) for t in terms) + f") AND {HARM}"
            try:
                res = search(q).get("resultList", {}).get("result", [])
            except Exception as e:  # noqa: BLE001
                lines.append(f"- {mod}: search failed ({e})")
                continue
            for r in res:
                doi = (r.get("doi") or "").lower()
                if doi and doi in known_dois:
                    continue
                lines.append(f'- [ ] **{mod}** — {r.get("title")} ({r.get("pubYear")}, {r.get("citedByCount", 0)} cit.) '
                             + (f"https://doi.org/{doi}" if doi else f'PMID {r.get("pmid")}'))
            time.sleep(0.2)
        if lines:
            print(f"\n## {m['name']} (`{mid}`)\n")
            print("\n".join(lines))


if __name__ == "__main__":
    main()
