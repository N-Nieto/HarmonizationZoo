#!/usr/bin/env python3
"""
Generates one static page per method at methods/<id>/index.html, plus sitemap.xml.

Why static pages: each method gets a real, shareable URL that search engines and
citation tools can read (title, description, JSON-LD), with a BibTeX entry and a
"report an error" link — no JavaScript needed to see the content.

Run after any change to data/methods.json, data/toolboxes.json or data/resources.json:
    python3 scripts/build_pages.py

Pages for methods that no longer exist are deleted. Output is deterministic
(no timestamps), so re-running without data changes produces no diff.
"""
import html
import json
import os
import re
import shutil
import unicodedata
from urllib.parse import quote, urlparse

SITE = "https://n-nieto.github.io/HarmonizationZoo/"
REPO = "N-Nieto/HarmonizationZoo"
OUT_DIR = "methods"
RESOURCES = []  # data/resources.json, loaded in main()

FAMILY = {
    "combat-family": ("Location/Scale Models (ComBat-family)", "#f2a93b"),
    "classical-normalization": ("Classical Intensity Normalization", "#c98f5e"),
    "deep-learning": ("Deep learning-based", "#5fc9c9"),
    "iqm-based": ("IQM-based", "#9c8cf0"),
    "normative-modeling": ("Normative Modeling", "#e0708a"),
    "interpolation-based": ("Interpolation-based", "#7fd88f"),
    "federated": ("Federated Learning-compatible", "#6fa8dc"),
    "ica-based": ("ICA-based", "#e0a8f0"),
    "optimal-transport": ("Optimal transport-based", "#d8c26a"),
    "domain-adaptation": ("Domain Adaptation & Distribution Matching", "#ef7d55"),
    "acquisition-protocol": ("Acquisition / Protocol Harmonization", "#a3b1c2"),
}
LEVEL = {"feature-level": "Feature-level", "image-level": "Image-level", "acquisition-level": "Acquisition-level"}
MODALITY_LABEL = {
    "sMRI": "Structural MRI", "dMRI": "Diffusion MRI", "fMRI": "Functional MRI", "connectome": "Connectomes",
    "EEG": "EEG", "MEG": "MEG", "PET": "PET", "CT": "CT", "radiomics": "Radiomics", "omics": "Omics",
    "histopathology": "Histopathology", "general-imaging": "Medical imaging (general)",
    "general": "Modality-agnostic", "MRI-acquisition": "MRI acquisition",
}

esc = lambda s: html.escape(str(s), quote=True)  # noqa: E731


def safe_url(u):
    if not isinstance(u, str):
        return None
    p = urlparse(u)
    return u if p.scheme in ("http", "https") and p.netloc else None


def gh_slug(s):
    return s if isinstance(s, str) and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", s) else None


def ascii_fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


# ---------------------------------------------------------------- BibTeX
def bib_escape(s):
    return str(s).replace("{", "").replace("}", "").replace("&", r"\&").replace("%", r"\%")


def bib_name(full):
    """'Jean-Philippe Fortin' -> 'Fortin, Jean-Philippe'. Leaves group names braced."""
    full = full.strip()
    if "," in full:
        return full  # already 'Last, First'
    if any(w in full.lower() for w in ("initiative", "investigators", "consortium", "group")):
        return "{" + full + "}"
    parts = full.split()
    if len(parts) == 1:
        return full
    particles = {"van", "von", "de", "der", "den", "da", "del", "di", "le", "la"}
    i = len(parts) - 1
    while i > 1 and parts[i - 1].lower() in particles:
        i -= 1
    return f"{' '.join(parts[i:])}, {' '.join(parts[:i])}"


def bib_key(m):
    first = (m.get("authors") or [""])[0]
    last = bib_name(first).split(",")[0].strip("{} ") if first else m["id"]
    last = re.sub(r"[^A-Za-z]", "", ascii_fold(last)).lower() or re.sub(r"[^a-z]", "", m["id"])
    year = m.get("paper_year") or ""
    word = ""
    for w in re.findall(r"[A-Za-z]+", ascii_fold(m.get("paper_title") or m["name"])):
        if w.lower() not in {"a", "an", "the", "on", "of", "for", "to", "and", "with", "via"}:
            word = w.lower()
            break
    return f"{last}{year}{word}"


def bibtex(m):
    title = m.get("paper_title")
    if not title:
        slug = gh_slug(m.get("github"))
        url = f"https://github.com/{slug}" if slug else safe_url(m.get("other_url"))
        if not url:
            return None
        lines = [f"@misc{{{re.sub(r'[^a-z0-9]', '', m['id'])}_software,",
                 f"  title        = {{{{{bib_escape(m['name'])}}}}},",
                 f"  howpublished = {{\\url{{{url}}}}},",
                 "  note         = {Software repository}"]
        return "\n".join(lines) + "\n}"

    ptype = m.get("publication_type") or ""
    venue = m.get("venue")
    if venue in ("arXiv", "bioRxiv") or ptype in ("preprint", "software"):
        kind = "misc"
    elif ptype in ("conference-paper", "proceedings-article"):
        kind = "inproceedings"
    else:
        kind = "article"

    authors = m.get("authors") or []
    author_str = " and ".join(bib_name(a) for a in authors)
    if authors and (m.get("n_authors") or 0) > len(authors):
        author_str += " and others"

    fields = [("title", "{" + bib_escape(title) + "}")]
    if author_str:
        fields.append(("author", bib_escape(author_str)))
    if venue and kind == "article":
        fields.append(("journal", bib_escape(venue)))
    elif venue and kind == "inproceedings":
        fields.append(("booktitle", bib_escape(venue)))
    elif venue and kind == "misc":
        fields.append(("howpublished", bib_escape(venue)))
    if m.get("paper_year"):
        fields.append(("year", str(m["paper_year"])))
    if m.get("doi"):
        fields.append(("doi", m["doi"]))
    if m.get("arxiv_id"):
        fields.append(("eprint", m["arxiv_id"]))
        fields.append(("archivePrefix", "arXiv"))
    if not m.get("doi") and safe_url(m.get("paper_url")):
        fields.append(("url", m["paper_url"]))
    width = max(len(k) for k, _ in fields)
    body = ",\n".join(f"  {k.ljust(width)} = {{{v}}}" for k, v in fields)
    return f"@{kind}{{{bib_key(m)},\n{body}\n}}"


# ---------------------------------------------------------------- page parts
def days_since(date_str, today):
    from datetime import date
    y, mo, d = map(int, date_str.split("-"))
    return (today - date(y, mo, d)).days


def code_health(m, today):
    """0-100 score for the method's own repo. Same constants as codeHealth() in js/app.js."""
    import math
    from datetime import date
    if not m.get("github") or not isinstance(m.get("stars"), int) or not m.get("last_commit"):
        return None
    d = lambda s: date(*map(int, s.split("-")))  # noqa: E731
    age = max(0, (today - d(m["last_commit"])).days)
    recency = 40 if age <= 90 else max(0.0, 40 * (1 - (age - 90) / (1095 - 90)))
    start = m.get("first_commit_date") or m.get("repo_created_at")
    span = max(0.0, (d(m["last_commit"]) - d(start)).days / 365.25) if start else 0.0
    longevity = 15 * min(1.0, span / 3)
    lic = m.get("license")
    license_pts = 0 if not lic else 7 if lic == "NOASSERTION" else 15
    adoption = 20 * min(1.0, math.log10(m["stars"] + 1) / math.log10(501))
    community = 10 * min(1.0, math.log10((m.get("forks") or 0) + 1) / math.log10(101))
    score = recency + longevity + license_pts + adoption + community
    if m.get("archived"):
        score = min(score, 20)
    # JS Math.round rounds .5 up; mirror that
    score = int(math.floor(score + 0.5))
    grade = next(g for t, g in [(80, "A"), (60, "B"), (40, "C"), (20, "D"), (0, "E")] if score >= t)
    parts = [("Recency", recency, 40, f"last commit {m['last_commit']}"),
             ("Longevity", longevity, 15, f"{span:.1f} years of commits" if start else "unknown start"),
             ("License", license_pts, 15, (lic if lic != "NOASSERTION" else "licence unclear") if lic else "no licence"),
             ("Adoption", adoption, 20, f"{m['stars']:,} stars"),
             ("Community", community, 10, f"{(m.get('forks') or 0):,} forks")]
    return {"score": score, "grade": grade, "archived": bool(m.get("archived")),
            "parts": [(k, int(math.floor(v + 0.5)), mx, note) for k, v, mx, note in parts]}


def health_html(h):
    rows = "".join(
        f'<li><span>{esc(k)}</span><span class="health-bar"><span style="width:{v / mx * 100:.0f}%"></span></span>'
        f'<span class="health-num">{v}/{mx}</span><span class="health-note">{esc(note)}</span></li>'
        for k, v, mx, note in h["parts"])
    archived = '<p class="health-archived">Archived repository: score capped at 20.</p>' if h["archived"] else ""
    return f'<ul class="health-parts">{rows}</ul>{archived}'


def maintenance(m, today):
    lc = m.get("last_commit")
    if not lc:
        return None, None
    days = days_since(lc, today)
    status = "active" if days < 182 else "slowing" if days < 730 else "stale"
    return status, lc


def row(label, value_html):
    return f"<dt>{esc(label)}</dt><dd>{value_html}</dd>" if value_html else ""


def chips(items, labels=None):
    if not items:
        return ""
    return '<div class="chip-row">' + "".join(
        f'<span class="chip">{esc((labels or {}).get(x, x))}</span>' for x in items) + "</div>"


def evidence_html(evidence):
    """Papers showing the method validated on a given modality."""
    items = []
    for ev in evidence or []:
        url = f"https://doi.org/{ev['doi']}" if ev.get("doi") else safe_url(ev.get("url"))
        if not url:
            continue
        label = MODALITY_LABEL.get(ev.get("modality"), ev.get("modality"))
        year = f" ({esc(ev['year'])})" if ev.get("year") else ""
        items.append(f'<li><span class="chip">{esc(label)}</span> <a href="{esc(url)}" rel="noopener noreferrer">{esc(ev.get("title") or url)}</a>{year}</li>')
    return f'<ul class="mp-evidence">{"".join(items)}</ul>' if items else ""


def method_link(other):
    return f'<a href="../{esc(other["id"])}/">{esc(other["name"])}</a>'


def describe(m):
    fam = FAMILY.get(m["category"], (m.get("category_label") or m["category"], ""))[0]
    bits = [f"{m['name']}: a {LEVEL.get(m['level'], m['level']).lower()} {fam} harmonization method"]
    if m.get("paper_year"):
        bits.append(f"published {m['paper_year']}" + (f" in {m['venue']}" if m.get("venue") else ""))
    if isinstance(m.get("citations"), int):
        bits.append(f"{m['citations']} citations")
    mods = [MODALITY_LABEL.get(x, x) for x in (m.get("modalities_tested") or [])]
    if mods:
        bits.append("tested on " + ", ".join(mods))
    return ". ".join([bits[0], ", ".join(bits[1:])]).rstrip(". ") + "." if len(bits) > 1 else bits[0] + "."


def json_ld(m, page_url):
    data = {"@context": "https://schema.org", "@type": "SoftwareSourceCode" if m.get("github") else "CreativeWork",
            "name": m["name"], "url": page_url, "description": describe(m)}
    slug = gh_slug(m.get("github"))
    if slug:
        data["codeRepository"] = f"https://github.com/{slug}"
    if m.get("language"):
        data["programmingLanguage"] = m["language"]
    if m.get("license") and m["license"] != "NOASSERTION":
        data["license"] = f"https://spdx.org/licenses/{m['license']}.html"
    if m.get("paper_title"):
        art = {"@type": "ScholarlyArticle", "headline": m["paper_title"]}
        if m.get("authors"):
            art["author"] = [{"@type": "Person", "name": a} for a in m["authors"]]
        if m.get("paper_year"):
            art["datePublished"] = str(m["paper_year"])
        if m.get("venue"):
            art["isPartOf"] = {"@type": "Periodical", "name": m["venue"]}
        if m.get("doi"):
            art["identifier"] = {"@type": "PropertyValue", "propertyID": "DOI", "value": m["doi"]}
            art["sameAs"] = f"https://doi.org/{m['doi']}"
        data["citation"] = art
    # '</' can't appear inside a <script> block
    return json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")


def issue_url(m, page_url):
    title = f"Data issue: {m['name']} ({m['id']})"
    body = (f"Method page: {page_url}\n\n"
            "**What is wrong or missing?**\n\n\n"
            "**Correct value and a source (DOI, paper section, repo link):**\n\n")
    return f"https://github.com/{REPO}/issues/new?title={quote(title)}&body={quote(body)}&labels=data"


def render_page(m, by_id, extended_by, toolboxes, today):
    page_url = f"{SITE}{OUT_DIR}/{m['id']}/"
    fam_label, fam_color = FAMILY.get(m["category"], (m.get("category_label") or m["category"], "#888"))
    desc = describe(m)

    # paper block
    paper_bits = []
    if m.get("paper_title"):
        paper_bits.append(f'<p class="mp-paper-title">{esc(m["paper_title"])}</p>')
        authors = m.get("authors") or []
        if authors:
            more = " et al." if (m.get("n_authors") or 0) > len(authors) else ""
            paper_bits.append(f'<p class="mp-authors">{esc(", ".join(authors))}{more}</p>')
        where = " · ".join(esc(x) for x in [m.get("venue"), m.get("paper_year")] if x)
        if where:
            paper_bits.append(f'<p class="mp-venue">{where}</p>')
    else:
        paper_bits.append('<p class="mp-muted">No paper is listed for this entry yet. If you know the reference, please report it below.</p>')

    links = []
    if safe_url(m.get("paper_url")):
        label = f"doi:{m['doi']}" if m.get("doi") else "Paper"
        links.append(f'<a class="mp-btn" href="{esc(m["paper_url"])}" rel="noopener noreferrer">↗ {esc(label)}</a>')
    slug = gh_slug(m.get("github"))
    if slug:
        links.append(f'<a class="mp-btn" href="https://github.com/{esc(slug)}" rel="noopener noreferrer">↗ {esc(slug)}</a>')
    elif safe_url(m.get("other_url")):
        links.append(f'<a class="mp-btn" href="{esc(m["other_url"])}" rel="noopener noreferrer">↗ Project page</a>')

    # numbers
    stats = []
    if isinstance(m.get("citations"), int):
        stats.append(("Citations", f"{m['citations']:,}"))
    if isinstance(m.get("stars"), int):
        stats.append(("GitHub stars", f"{m['stars']:,}"))
    status, lc = maintenance(m, today)
    if status:
        stats.append(("Last commit", f'<span class="maint-badge maint-{status}">{status.title()}</span> {esc(lc)}'))
    health = code_health(m, today)
    if health:
        stats.append(("Code health", f'<span class="health-badge health-{health["grade"]}">{health["grade"]}</span> {health["score"]}/100'))
    stat_html = "".join(f'<div class="mp-stat"><span>{esc(k)}</span><strong>{v if k in ("Last commit", "Code health") else esc(v)}</strong></div>'
                        for k, v in stats)

    rs = [r for r in RESOURCES if m["id"] in (r.get("methods") or [])]
    res_html = ", ".join(
        f'<a href="{esc("https://doi.org/" + r["doi"] if r.get("doi") else r.get("url", ""))}" rel="noopener noreferrer">{esc(r["title"])}</a> ({esc(r.get("year", ""))})'
        for r in rs if r.get("doi") or safe_url(r.get("url")))
    tbs = [tb for tb in toolboxes if m["id"] in tb.get("methods", [])]
    tb_html = ", ".join(f'<a href="{esc(tb["url"])}" rel="noopener noreferrer">{esc(tb["name"])}</a>'
                        for tb in tbs if safe_url(tb.get("url")))

    lineage = []
    if m.get("implements") and m["implements"] in by_id:
        lineage.append(row("Implements", method_link(by_id[m["implements"]])))
    ext = [by_id[x] for x in (m.get("extends") or []) if x in by_id]
    if ext:
        lineage.append(row("Builds on", ", ".join(method_link(o) for o in ext)))
    kids = sorted(extended_by.get(m["id"], []), key=lambda o: o["name"].lower())
    if kids:
        lineage.append(row("Extended by", ", ".join(method_link(o) for o in kids)))

    details = "".join([
        row("Family", esc(fam_label)),
        row("Also fits", esc(", ".join(FAMILY.get(c, (c, ""))[0] for c in (m.get("secondary_categories") or [])))),
        row("Level", esc(LEVEL.get(m["level"], m["level"]))),
        row("Method type", esc(m.get("method_type", "").replace("-", " "))),
        row("Proposed for", chips(m.get("modalities_proposed"), MODALITY_LABEL)),
        row("Tested on", chips(m.get("modalities_tested"), MODALITY_LABEL)),
        row("Evidence", evidence_html(m.get("evidence"))),
        row("Validation data", esc(m["validation_data"]) if m.get("validation_data") else ""),
        row("Language", chips(m.get("language"))),
        row("Architecture", esc(m["architecture_backbone"]) if m.get("architecture_backbone") else ""),
        row("License", esc(m["license"]) if m.get("license") and m["license"] != "NOASSERTION" else ""),
        row("First commit", esc(m["first_commit_date"]) if m.get("first_commit_date") else ""),
        row("Code health", health_html(health) if health else ""),
        row("Toolboxes", tb_html),
        row("Reviewed in", res_html),
        "".join(lineage),
        row("Tags", chips(m.get("tags"))),
    ])

    bib = bibtex(m)
    bib_html = (f'''
    <section class="mp-section">
      <div class="mp-section-head"><h2>Cite</h2>
        <button type="button" class="mp-btn" data-copy="#bibtex">⧉ Copy BibTeX</button></div>
      <pre class="mp-bibtex" id="bibtex">{esc(bib)}</pre>
      {'<p class="mp-muted">Author list truncated; check the publisher page for the full list.</p>' if (m.get("n_authors") or 0) > len(m.get("authors") or []) else ""}
    </section>''' if bib else "")

    gs = m.get("get_started") or {}
    gs_blocks = []
    for key, label in (("install", "Install"), ("usage", "Usage")):
        if gs.get(key):
            lang = gs.get(key + "_lang") or ""
            lang = "R" if lang == "r" else lang
            gs_blocks.append(f'''
      <div class="mp-section-head"><h3>{label}{f' <em class="mp-muted">{esc(lang)}</em>' if lang else ""}</h3>
        <button type="button" class="mp-btn" data-copy="#gs-{key}">⧉ Copy</button></div>
      <pre class="mp-bibtex" id="gs-{key}">{esc(gs[key])}</pre>''')
    gs_html = (f'''
    <section class="mp-section">
      <h2>Get started</h2>{"".join(gs_blocks)}
      <p class="mp-muted">Taken from the <a href="{esc(gs.get("source", ""))}" rel="noopener noreferrer">project README</a>{f" ({esc(gs['fetched'])})" if gs.get("fetched") else ""}; check it for requirements and the current version.</p>
    </section>''' if gs_blocks and safe_url(gs.get("source")) else "")

    review = (f'<p class="mp-review">Under review: {esc(m["needs_review"])}</p>' if m.get("needs_review") else "")

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'">
<title>{esc(m["name"])} — Harmonization Zoo</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(page_url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="{esc(m["name"])} — Harmonization Zoo">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(page_url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0a0e13">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='18' fill='none' stroke='%23f2a93b' stroke-width='2.2' opacity='0.55'/%3E%3Ccircle cx='20' cy='20' r='12' fill='none' stroke='%23f2a93b' stroke-width='2.2' opacity='0.75'/%3E%3Ccircle cx='20' cy='20' r='5.5' fill='%23f2a93b'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../css/style.css">
<link rel="stylesheet" href="../../css/method-page.css">
<script type="application/ld+json">
{json_ld(m, page_url)}
</script>
</head>
<body>
<header class="mp-top">
  <a class="mp-home" href="../../">Harmonization <em>Zoo</em></a>
  <nav class="mp-nav" aria-label="Site">
    <a href="../../?method={esc(quote(m["id"]))}#explore">Open in the map</a>
    <a href="../../?view=table#explore">All methods</a>
  </nav>
</header>
<main class="mp-main">
  <p class="mp-eyebrow" style="--eyebrow-color:{fam_color}">{esc(fam_label)} · {esc(LEVEL.get(m["level"], m["level"]))}</p>
  <h1>{esc(m["name"])}{' <span class="chip chip-warning">archived</span>' if m.get("archived") else ""}</h1>
  {review}
  <section class="mp-section mp-paper">
    {"".join(paper_bits)}
    <div class="mp-links">{"".join(links)}</div>
  </section>
  {f'<section class="mp-stats">{stat_html}</section>' if stat_html else ""}
  {f'<p class="mp-repo-desc">{esc(m["repo_description"])}</p>' if m.get("repo_description") else ""}
  <section class="mp-section">
    <h2>Details</h2>
    <dl class="spec-table">{details}</dl>
  </section>
  {gs_html}
  {bib_html}
  <section class="mp-section mp-report">
    <h2>Something wrong or missing?</h2>
    <p>Corrections are reviewed in the open on GitHub.</p>
    <div class="mp-links">
      <a class="mp-btn" href="{esc(issue_url(m, page_url))}" rel="noopener noreferrer">⚑ Report an error</a>
      <a class="mp-btn" href="https://github.com/{REPO}/blob/main/data/methods.json" rel="noopener noreferrer">✎ Edit the data</a>
    </div>
  </section>
</main>
<footer class="site-footer"><p>Stats refresh automatically from GitHub and OpenAlex. <a href="../../">Back to the Harmonization Zoo</a></p></footer>
<script src="../../js/method-page.js"></script>
</body>
</html>
'''


def main():
    from datetime import date
    with open("data/methods.json", encoding="utf-8") as f:
        db = json.load(f)
    with open("data/toolboxes.json", encoding="utf-8") as f:
        toolboxes = json.load(f)["toolboxes"]
    try:
        with open("data/resources.json", encoding="utf-8") as f:
            RESOURCES[:] = json.load(f)["resources"]
    except FileNotFoundError:
        RESOURCES[:] = []
    methods = db["methods"]
    by_id = {m["id"]: m for m in methods}
    extended_by = {}
    for m in methods:
        for parent in (m.get("extends") or []) + ([m["implements"]] if m.get("implements") else []):
            extended_by.setdefault(parent, []).append(m)

    # Maintenance badges are relative to the data's own fetch date (not "now"),
    # so rebuilding without new data never changes the output.
    fetched = (db.get("stats_fetched_at") or "")[:10]
    today = date(*map(int, fetched.split("-"))) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fetched) else date.today()

    os.makedirs(OUT_DIR, exist_ok=True)
    wanted = set()
    for m in methods:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", m["id"]):
            raise SystemExit(f"refusing to build page for unsafe id {m['id']!r}")
        wanted.add(m["id"])
        d = os.path.join(OUT_DIR, m["id"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_page(m, by_id, extended_by, toolboxes, today))
    for name in os.listdir(OUT_DIR):
        if name not in wanted and os.path.isdir(os.path.join(OUT_DIR, name)):
            shutil.rmtree(os.path.join(OUT_DIR, name))

    urls = [SITE] + [f"{SITE}{OUT_DIR}/{m['id']}/" for m in sorted(methods, key=lambda x: x["id"])]
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for u in urls:
            f.write(f"  <url><loc>{esc(u)}</loc></url>\n")
        f.write("</urlset>\n")
    print(f"Built {len(methods)} method pages in {OUT_DIR}/ and a sitemap with {len(urls)} URLs.")


if __name__ == "__main__":
    main()
