# Harmonization Zoo 🧠🔬

An interactive, contributor-editable map of methods for harmonizing
multi-site / multi-scanner MRI data — location/scale (ComBat-family)
statistical methods, deep-learning approaches, and everything in between
(federated, IQM-based, normative modeling, optimal transport, classical
intensity normalization, …).

Methods are drawn as boxes sized to fit their full name (nothing gets
truncated or overlapped), grouped however you pick from "Group by":
**Harmonization level** (default), **Family**, **Data modality**, **Programming language**, **Year**
(of the repo's first commit), **GitHub stars**, **Citations**, **Validation data** (the
dataset/cohort a method was mainly proposed or validated on), or
**Implemented in UniHarmony**. Click a box for the paper title and link,
level, language, GitHub stars/forks/issues/license, last-maintained status,
and more.

Two other things live on the page:

- **Compare mode** — toggle it on (from either tab — it's shared state), click
  2+ boxes to select them, then hit "Compare" for a side-by-side table
  (family, level, modality, validation data, stars, license, UniHarmony
  status, GPU/ML-compatibility, and more). Works the same way in the
  "Which method?" results list as it does in Explore.
- **"Which method?" tab** — a short questionnaire (downstream task, signal
  linearity, data quantity, new-site generalization, Site ID access,
  GPU access) that filters out genuinely incompatible methods and ranks the
  rest with visible reasons, rather than just listing everything.

The whole thing is one static site with one JSON file as its database, so
it's built to grow: adding a method is a two-minute JSON edit and a pull
request (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

**No framework, no build step, no backend, no external JS dependencies.**
Plain HTML/CSS/vanilla JS, so it can be served as-is from GitHub Pages.

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

`data/methods.json` seeds **58 methods** across nine families (the
"Family" grouping) — **Location/Scale Models (ComBat-family)** /
Deep-learning / IQM / Normative Modeling / Interpolation / Federated / ICA /
Optimal-transport, plus a **Classical Intensity Normalization** family
(WhiteStripe, Nyúl–Udupa histogram matching) for the pre-"harmonization"-era
baselines that most of the survey papers still cite and compare against.
Color always encodes **Family**, no matter which "Group by" option is
active. The ComBat family is labeled "Location/Scale Models" rather than
just "ComBat-based" because that's the actual statistical model class
(adjusting per-batch location and/or scale) that ComBat, CovBat, ComBatLS,
RELIEF, etc. all belong to — "ComBat-family" is kept alongside it since
that's still how everyone refers to and searches for it.

### Two more grouping dimensions

- **Validation data** — the dataset/cohort a method was mainly proposed or
  validated on (e.g. ENIGMA, ABCD, the iSTAGING consortium), stored in a new
  `validation_data` field. Methods that were evaluated across many
  heterogeneous datasets with no single primary one, or where this hasn't
  been researched yet, default to **"Agnostic"** rather than `null` — that's
  a real, useful category here (it tells you the method wasn't built or
  tuned around one specific cohort), not a placeholder for missing data.
  Currently 11 of 53 entries have a specific, verified dataset; the rest are
  "Agnostic" and worth digging into if you know the paper.
- **Implemented in UniHarmony** — a new `in_uniharmony` boolean, splitting
  the zoo into what's already usable through
  [UniHarmony](https://github.com/N-Nieto/UniHarmony) today (11 methods:
  ComBat, neuroComBat, ComBat-GAM, harmonizer, CovBat, PrettYharmonize,
  pycombat, Inter-Site SMOTE, Intra-Site Interpolation, OTDA, BOTDA) versus
  everything else. A separate `also_implemented_in` array tracks other
  bundling toolkits — e.g. neuroComBat and CovBat are also available inside
  neuroHarmonize, alongside its own native ComBat-GAM.

### Where this round's additions came from

Beyond the original UniHarmony-wiki seed list, later revisions added methods
found by checking citation lists inside the survey papers and recent
related-work sections, each verified against its own DOI before being added:

- **WhiteStripe** (Shinohara et al., 2014) and **Nyúl–Udupa histogram
  matching** (1999) — the two classical intensity-normalization baselines
  that RAVEL and most image-level DL papers explicitly build on or compare
  against.
- **Scanner Invariant Representations** (Moyer et al., 2020), **Harmonization
  with Flow-Based Causal Inference** (Wang et al., 2021), **Deep Generative
  (StarGAN-based) Harmonization** (Bashyam et al., 2021), **Cycle-Consistent
  GAN Harmonization** (Modanwal et al., 2020), **Disentangled Latent Space**
  (Dewey et al., 2020 — CALAMITI's precursor), and **DLEST** (2025).
- **DeepResBat** (An et al., 2024) — a residual, covariate-aware deep
  learning alternative to ComBat, benchmarked directly against ComBat and
  CovBat on ADNI/AIBL/MACC.
- **Harmonizing Flows** (Beizaee et al., 2025) — unsupervised, source-free
  normalizing-flow harmonization.
- **HarmoFL** (Jiang et al., AAAI 2022) — frequency-domain federated
  harmonization; note this one is validated on general medical imaging
  (COVID CT, retinal, etc.), not MRI-brain-specific, included because the
  method is directly applicable and it's the clearest federated deep-learning
  entry in the database.
- **Dual-Projection ICA for fMRI** (Xu et al., 2023) — the functional-MRI
  sibling of ICA-DP, from an overlapping author group, validated on
  ABIDE-II.

Two entries from the original UniHarmony seed had incorrect metadata, now
fixed: **BARTharm** and **Harmless** were tagged `image-level`; both
actually operate on extracted features (image quality metrics and cortical-
thickness ROIs, respectively), so they're `feature-level`. **ICA-DP**'s
publication year and link were unverified before this round — it's a very
recent (2026) paper, now confirmed. If you spot another error, that's
exactly what `CONTRIBUTING.md` is for.

### Other candidates surfaced but not yet added

A few more names turned up in citation lists but weren't verified closely
enough to add responsibly — **SiMix**, an **SSIM-guided disentanglement**
method, a **graph-neural-network structural-connectome** harmonization
approach, an **unpaired multi-site latent-diffusion** method, and two
independently-developed normalizing-flow methods referenced alongside
Harmonizing Flows: **BlindHarmony** (Jeong et al., 2023) and
**BlindHarmonyDiff**. These are good next PRs if you (or anyone) can pin
down the exact paper and check it firsthand.

### Honest gaps — please help close these

- **`paper_year` is verified for 34 of 53 entries; `paper_url` for 21 of
  53.** The rest are `null` rather than estimated — a wrong year is worse
  than a missing one, and the Year view's "Year unknown" column exists
  for exactly this reason.
- The eight survey papers you originally listed (structural-MRI DL survey,
  site-effects overview, cross-scanner comparison study, statistical/DL
  review, radiomics harmonization strategies, systematic ML review,
  acquisition/image/feature survey, disentangled representation-learning
  overview) almost certainly describe more methods than are captured here —
  this pass checked citation lists reachable from search, not a full
  cover-to-cover read of all eight. Treat this as a solid, real, growing
  taxonomy — not an exhaustive one.

## Keeping GitHub stats current

The website itself never calls the GitHub API — the browser only ever does
a `fetch()` of the already-committed `data/methods.json`. All GitHub-derived
fields are filled in by `scripts/fetch_github_stats.py`, a separate script
that calls the GitHub API and rewrites the JSON file:

- **stars, forks, open issues**
- **license** (SPDX id) and **repo topics**
- **archived** flag (surfaced as a badge — a quiet signal that a method's
  code may no longer be maintained even if it still works)
- **repo creation date** and **first commit date** — the latter is what
  the "Year (first commit)" view groups by, in place of the researched
  paper year, since it's automatable and verifiable for every method with
  code rather than depending on us finding and checking each publication
- **last commit date**, from which the site computes "last maintained"
  (e.g. "3 months ago") and an Active / Slowing / Stale badge, entirely in
  the browser at render time — so that label never goes stale between data
  refreshes even if the underlying date does

That's why a fresh `git clone` served locally shows all of these as `null`
until you either:

- run `python3 scripts/fetch_github_stats.py` yourself once, or
- push to GitHub and let the scheduled Action
  (`.github/workflows/refresh-stats.yml`) do it — it runs weekly and commits
  the result back, so the *deployed* site stays current automatically even
  though nothing runs at page-load time.

Unauthenticated GitHub API calls are capped at 60/hour, and each repo now
costs 2 calls (repo info + first-commit lookup), so this ceiling matters
sooner than it used to — set a `GITHUB_TOKEN` env var locally, or rely on
the Action (which gets one automatically), to raise it to 5000/hour.

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

## How the "Which method?" recommender works

It's a **live filter tree** with a **compare mode** shared with Explore (the
same toggle, same selection state — select methods from the recommender's
results and hit Compare just like in Explore). It starts by showing all 54
methods, and every answer immediately narrows the list on the right — no
submit button. Questions are asked in a fixed hierarchy (`REC_STEPS` in
`js/app.js`), each one only appearing once the previous one is answered:

1. **Downstream analysis** — statistical vs. machine-learning
2. **Harmonization level** — feature-level vs. image-level
3. **Programming language** — options are computed live from what's actually
   left in the pool at that point, plus "No preference"
4. **New, unseen site?**
5. **Site ID access?**
6. **Hardware (GPU)** — only asked at all if image-level methods that need a
   GPU (`needs_gpu: true`) are still in the running; otherwise skipped
   automatically
7. **Signal linearity assumption**
8. **Federated setup** — only asked if the downstream task is
   machine-learning; asked last

Two questions from an earlier version were removed because they weren't
actually filtering anything: the classification/regression ML sub-type, and
a "data quantity" step (total N / N classes / min per site) — there's no
verified per-method threshold backing those yet, so they were decoration,
not signal. If/when there's real data to back a quantity-based filter,
it's a natural thing to add back.

Every question is a genuine filter (methods that don't fit are removed, not
just re-ranked), and the elimination message for a question appears
directly above that question's own options as soon as you answer it. Once
every visible question has been answered, a **Reset** button appears at the
bottom of the tree. Changing an earlier answer re-derives everything below
it automatically.

The one deliberate exception: **machine-learning task** excludes the whole
Location/Scale (ComBat-family) — their harmonization model needs the same
covariate you're usually trying to predict as an ML target, which causes
data leakage. PrettYharmonize is the one method in that family built
specifically to avoid this; it's still excluded by the blanket rule, but a
separate note calls it out rather than silently dropping it.

`needs_gpu` is now a real top-level field on every method (previously it was
only computed inline as "category === deep-learning"). It's still set the
same way for now — every deep-learning-family method is `true`, everything
else `false` — but having it as its own field means a future PR can override
it per-method (e.g. a deep-learning method that only needs a GPU for
training, not inference) without touching the family-level defaults.

The rest of the `recommend.*` compatibility fields (`requires_site_id`,
`generalizes_to_new_site`, `low_n_friendly`, `requires_linear_signal`,
`ml_compatible`) are set per-family in `scripts/build_seed.py`'s
`CATEGORY_RECOMMEND_DEFAULTS`, with a handful of per-method overrides where
there's a specific, citable reason to deviate (e.g. ComBat-GAM is explicitly
a nonlinear/GAM extension). These are reasoned defaults, not an
independently verified fact for all 54 methods — if you know a specific
method behaves differently, override it there.

## Other maintainer tooling

- **`scripts/check_duplicates.py`** — flags likely-duplicate entries (near-
  identical `paper_title` or `name`) using stdlib `difflib`, no dependencies.
  Runs in CI on every PR that touches `data/methods.json`
  (`.github/workflows/check-duplicates.yml`) and fails the check if
  something looks like an accidental duplicate. Genuine near-duplicates
  (e.g. two implementations of the same paper) go in the `ALLOWED` set at
  the top of the script.
- **`scripts/fetch_citations.py`** — fills in `citations` via the Semantic
  Scholar API: a batch DOI lookup for entries with a DOI in `paper_url`, a
  per-DOI fallback if the batch call fails, and a title-search fallback for
  entries with a `paper_title` but no captured DOI **and** for any DOI that
  comes back "not found." That last part matters more than it sounds: a DOI
  can be entirely correct and still return nothing from Semantic Scholar if
  it's a very recently published journal version they haven't indexed yet
  under that identifier — while an earlier arXiv preprint of the same paper
  often already has citations recorded. PrettYharmonize is a live example of
  this (2026 journal DOI, likely-indexed 2024 arXiv preprint), which is why
  the title-search retry was added specifically for DOI misses, not just for
  DOI-less entries. I verified the ComBat DOI and the batch-endpoint request
  format directly against Semantic Scholar's docs while debugging this — the
  request itself was already correct — but I still can't execute this script
  from this project's build environment (`api.semanticscholar.org` isn't
  reachable from there), so if `citations` is still empty after a run, `-v`
  will show you the actual HTTP status/body per entry rather than me
  guessing further. Not wired into the scheduled Action.

## Project layout

```
index.html                    the whole page (Explore tab + Which-method? tab)
css/style.css                 styling
js/app.js                     data loading, box layout, filters, compare mode, recommender, detail drawer
data/methods.json             the database — edit this to add/change methods
scripts/build_seed.py         (re)generates methods.json from the source tables — provenance only
scripts/fetch_github_stats.py enriches methods.json with live stars / first-commit / last-commit / etc from the GitHub API
scripts/fetch_citations.py    optional: fills in citation counts via Semantic Scholar (run manually)
scripts/check_duplicates.py   flags likely-duplicate entries; run in CI on every PR
.github/workflows/refresh-stats.yml       runs fetch_github_stats.py weekly and commits the result
.github/workflows/check-duplicates.yml    runs check_duplicates.py on PRs touching the database
CONTRIBUTING.md               schema reference + how to add a method
```

## License

MIT — see [`LICENSE`](LICENSE). Method names, paper titles, and links are
factual metadata about third-party work; no paper text or figures are
reproduced here.
