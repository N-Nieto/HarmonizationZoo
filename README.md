# Harmonization Zoo 🧠🔬

An interactive, contributor-editable map of methods for harmonizing
multi-site / multi-scanner MRI data — ComBat-family statistical methods,
deep-learning approaches, and everything in between (federated, IQM-based,
normative modeling, optimal transport, …).

Methods are drawn as bubbles, clustered by whichever keyword you pick
(family, harmonization level, method type, or language). Click a bubble for
the paper title, level, language, GitHub stars, and last-commit date. The
whole thing is one static site with one JSON file as its database, so it's
built to grow: adding a method is a two-minute JSON edit and a pull request
(see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

**No framework, no build step, no backend.** Plain HTML/CSS/JS + [D3](https://d3js.org/),
so it can be served as-is from GitHub Pages.

## Live site

`https://n-nieto.github.io/HarmonizationZoo/`

## Running it locally

```bash
git clone <this-repo>
cd harmonization-zoo
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works — the site only ever does a `fetch()` of
`data/methods.json`.

## Deploying to GitHub Pages

1. Push this repo to `github.com/N-Nieto/HarmonizationZoo`.
2. Repo **Settings → Pages → Build and deployment → Source**: choose
   "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Give it a minute — your site will be live at
   `https://n-nieto.github.io/HarmonizationZoo/`.
4. Optional but recommended: repo **Settings → Actions → General →
   Workflow permissions**, set to "Read and write permissions" so the
   scheduled stats-refresh workflow (`.github/workflows/refresh-stats.yml`)
   can commit updated star counts back to the repo.

See [Troubleshooting GitHub Pages](#troubleshooting-github-pages) below if
the page doesn't render after enabling it.

## What's in the database right now

`data/methods.json` seeds **46 methods**, sourced from the
[UniHarmony reference list](https://github.com/N-Nieto/UniHarmony/wiki/References)
and grouped into eight families (the "Family" grouping):

- **ComBat-based** (14) — ComBat, neuroComBat, ComBat-GAM, CovBat, LongComBat,
  RAVEL, RELIEF, ComBatLS, OPNestedComBat, and related empirical-Bayes methods.
- **Deep-learning-based** (20) — DeepHarmony, ImUnity, CycleGAN-based
  approaches, MISPEL, disentanglement methods (CALAMITI, DISARM, DISARM++,
  HACA3, Xcov), unlearning methods, diffusion-MRI harmonization tools, and more.
- **IQM-based** (3) — NeuroHarmony, BARTharm, AutoComBat/ComScan — methods that
  use image quality metrics instead of (or alongside) explicit scanner IDs.
- **Normative Modeling** (1) — hierarchical Bayesian site-variation models.
- **Interpolation-based** (2) — ISMI, ISI.
- **Federated Learning-compatible** (3) — FedHarmony, Fed-ComBat, d-ComBat.
- **ICA-based** (1) — ICA-DP.
- **Optimal transport-based** (2) — OTDA, BOTDA.

Color always encodes **Family**, no matter which "Group by" option is
active, so you can see the family mix within a level or a year at a glance.

### Honest gaps — please help close these

This seed list was built from the reference tables in a well-curated GitHub
wiki plus the paper titles it links to — **not** from reading all eight
survey papers cover to cover. That means:

- **`paper_year` is verified (not guessed) for 23 of 46 entries** — found by
  checking the actual journal/arXiv/bioRxiv listing for each paper. The rest
  are `null` rather than estimated, because a wrong year is worse than a
  missing one. The "Year (timeline)" view groups those into an "Year unknown"
  column at the end. If you know a missing year, it's a very welcome PR.
- **`abstract` and `citations` are `null` for almost every entry** for the
  same reason.
- **`stars` and `last_commit` are populated automatically**, not manually —
  see [Keeping stats current](#keeping-github-stats-current) below.
- The eight survey papers you originally pointed at (structural-MRI DL
  survey, site-effects overview, cross-scanner comparison study,
  statistical/DL review, radiomics harmonization strategies, systematic ML
  review, acquisition/image/feature survey, disentangled representation-
  learning overview) almost certainly describe more methods than are
  captured here. Treat this as a solid, real starting taxonomy — not an
  exhaustive one — and use `CONTRIBUTING.md` to extend it.

## Keeping GitHub stats current

`stars` and `last_commit` are **not** fetched by the website itself — the
browser only ever does a `fetch()` of the already-committed
`data/methods.json`. They're filled in by running
`scripts/fetch_github_stats.py`, which is a separate, one-off Python script
that calls the GitHub API and rewrites the JSON file. That's why a fresh
`git clone` served locally shows `stars: null` until you either:

- run `python3 scripts/fetch_github_stats.py` yourself once, or
- push to GitHub and let the scheduled Action
  (`.github/workflows/refresh-stats.yml`) do it — it runs weekly and commits
  the result back, so the *deployed* site stays current automatically even
  though nothing runs at page-load time.

Unauthenticated GitHub API calls are capped at 60/hour, which can get eaten
up by other traffic sharing the same egress IP (this happened while building
the seed data). Set a `GITHUB_TOKEN` env var locally, or rely on the Action
(which gets one automatically), to avoid that.

## Troubleshooting GitHub Pages

If Pages shows a blank page after enabling it:

1. **`.nojekyll`** — this repo includes an empty `.nojekyll` file at the
   root. Without it, GitHub's default Jekyll build can behave unpredictably
   with plain static sites; this disables that processing entirely.
2. Confirm **Settings → Pages** shows a green "Your site is live at..."
   banner with the URL `https://n-nieto.github.io/HarmonizationZoo/`
   (case-sensitive — it must match the repo name exactly).
3. Confirm the source is "Deploy from a branch" → `main` → `/ (root)`, and
   that `index.html` is committed at the repo root (not inside a subfolder).
4. Open the deployed URL, open the browser console, and check for a 404 on
   `data/methods.json` — if you see one, hard-refresh (Pages' CDN caches
   aggressively for a minute or two after a push).
5. Check the **Actions** tab for a failed "pages build and deployment" run —
   it'll show the actual build error if there is one.

## Project layout

```
index.html                    the whole page
css/style.css                 styling
js/app.js                     data loading, force-directed bubble layout, filters, detail drawer
data/methods.json             the database — edit this to add/change methods
scripts/build_seed.py         (re)generates methods.json from the source tables — provenance only
scripts/fetch_github_stats.py enriches methods.json with live stars / last-commit from the GitHub API
.github/workflows/refresh-stats.yml   runs fetch_github_stats.py weekly and commits the result
CONTRIBUTING.md               schema reference + how to add a method
```

## License

MIT — see [`LICENSE`](LICENSE). Method names, paper titles, and links are
factual metadata about third-party work; no paper text or figures are
reproduced here.
