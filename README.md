# Harmonization Zoo 🧠🔬

An interactive, contributor-editable map of methods for harmonizing
multi-site / multi-scanner MRI data — location/scale (ComBat-family)
statistical methods, deep-learning approaches, and everything in between
(federated, IQM-based, normative modeling, optimal transport, classical
intensity normalization, …).

Methods are drawn as boxes sized to fit their full name (nothing gets
truncated or overlapped), grouped however you pick from "Group by":
**Harmonization level** (default), **Family**, **Data modality**, **Programming language**, **Year**
(of the repo's first commit), **GitHub stars**, **Validation data** (the
dataset/cohort a method was mainly proposed or validated on), or
**Implemented in UniHarmony**. Click a box for the paper title and link,
level, language, GitHub stars/forks/issues/license, last-maintained status,
and more.

Two other things live on the page:

- **Compare mode** — toggle it on, click 2+ boxes to select them, then hit
  "Compare" for a side-by-side table (family, level, modality, validation
  data, stars, license, UniHarmony status, and more).
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

`data/methods.json` seeds **54 methods** across nine families (the
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

Beyond the original UniHarmony-wiki seed list, this revision added methods
found by checking the actual citation lists inside the survey papers you
originally pointed at (particularly the "Applications of GANs in
Neuroimaging" review and the related-work section of the IGUANe paper),
each verified against its own DOI before being added — not just picked out
of a citation list by title:

- **WhiteStripe** (Shinohara et al., 2014) and **Nyúl–Udupa histogram
  matching** (1999) — the two classical intensity-normalization baselines
  that RAVEL and most image-level DL papers explicitly build on or compare
  against, but which weren't in UniHarmony's tables (they predate the
  "harmonization" framing and are usually cited as normalization baselines,
  not harmonization methods per se).
- **Scanner Invariant Representations** (Moyer et al., 2020) — adversarial
  invariant-representation learning for diffusion MRI.
- **Harmonization with Flow-Based Causal Inference** (Wang et al., MICCAI
  2021) — normalizing-flow-based harmonization.
- **Deep Generative (StarGAN-based) Harmonization** (Bashyam et al., 2021)
  and **Cycle-Consistent GAN Harmonization** (Modanwal et al., 2020) —
  two more GAN variants distinct from the CycleGAN/IGUANe/STGAN entries
  already in the zoo.
- **Disentangled Latent Space** (Dewey et al., MICCAI 2020) — the direct
  precursor to CALAMITI, from the same lab.

None of these five DL papers had a discoverable public code repo, so they're
listed with `github: null` — code-free entries are still useful for the
taxonomy, they just won't get GitHub stats.

Two entries from the original UniHarmony seed also had incorrect metadata,
now fixed: **BARTharm** and **Harmless** were tagged `image-level`; both
actually operate on extracted features (image quality metrics and cortical-
thickness ROIs, respectively), so they're `feature-level`. If you spot
another one, that's exactly what `CONTRIBUTING.md` is for.

### Other candidates surfaced but not yet added

A few more names turned up in citation lists during this pass but weren't
verified closely enough to add responsibly — **HarmoFL**, **DeepResBat**,
**SiMix**, **"Harmonizing Flows"** (Beizaee et al.), a **disentangled
latent energy-based style translation** framework, an **SSIM-guided
disentanglement** method, a **graph-neural-network structural-connectome**
harmonization approach, and an **unpaired multi-site latent-diffusion**
method. These are good next PRs if you (or anyone) can pin down the exact
paper and check it firsthand.

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

It's a **live filter tree**, not a form-and-submit wizard: it starts by
showing all 54 methods, and every answer immediately narrows the list on
the right — no submit button. Questions are asked in a fixed hierarchy
(`REC_STEPS` in `js/app.js`), each one only appearing once the previous one
is answered:

1. **Downstream analysis** — statistical vs. machine-learning (with a
   classification/regression sub-question if ML)
2. **Harmonization level** — feature-level vs. image-level
3. **New, unseen site?**
4. **Site ID access?**
5. **Hardware (GPU)** — only asked at all if image-level, deep-learning
   methods are still in the running after step 4; otherwise it's skipped
   automatically
6. **Signal linearity assumption**
7. **Data quantity** (min samples per site filters; total N / N classes are
   shown for reference only — no verified per-method threshold for those yet)

Every question is a genuine filter (methods that don't fit are removed, not
just re-ranked), and the elimination message for a question appears
directly above that question's own options as soon as you answer it — e.g.
picking "Machine learning" immediately shows "Removed 14 Location/Scale
methods — ..." right above the task pills, and the right-hand list updates
in the same moment. Changing an earlier answer re-derives everything below
it automatically.

The one deliberate exception: **machine-learning task** excludes the whole
Location/Scale (ComBat-family) — their harmonization model needs the same
covariate you're usually trying to predict as an ML target, which causes
data leakage. PrettYharmonize is the one method in that family built
specifically to avoid this; it's still excluded by the blanket rule, but a
separate note calls it out rather than silently dropping it.

The `recommend.*` compatibility fields (`requires_site_id`,
`generalizes_to_new_site`, `low_n_friendly`, `requires_linear_signal`,
`ml_compatible`, `needs_gpu`) that drive all of this are set per-family in
`scripts/build_seed.py`'s `CATEGORY_RECOMMEND_DEFAULTS`, with a handful of
per-method overrides where there's a specific, citable reason to deviate
(e.g. ComBat-GAM is explicitly a nonlinear/GAM extension). These are
reasoned defaults, not an independently verified fact for all 54 methods —
if you know a specific method behaves differently, override it there.

## Other maintainer tooling

- **`scripts/check_duplicates.py`** — flags likely-duplicate entries (near-
  identical `paper_title` or `name`) using stdlib `difflib`, no dependencies.
  Runs in CI on every PR that touches `data/methods.json`
  (`.github/workflows/check-duplicates.yml`) and fails the check if
  something looks like an accidental duplicate. Genuine near-duplicates
  (e.g. two implementations of the same paper) go in the `ALLOWED` set at
  the top of the script.
- **`scripts/fetch_citations.py`** — fills in `citations` via the Semantic
  Scholar API. Uses the batch DOI-lookup endpoint for the 23 entries with a
  DOI in `paper_url`, and falls back to a title-search lookup (accepted only
  above a similarity threshold, to avoid attaching the wrong paper's count)
  for the ~27 entries that have a `paper_title` but no captured DOI link —
  that second path is new; the previous version of this script silently
  skipped every entry without a `doi.org` link in `paper_url`, which is why
  citations weren't showing up for methods that clearly had a paper. Not
  wired into the scheduled Action and untested from this project's build
  environment (`api.semanticscholar.org` isn't reachable from there) — run
  with `-v` to see the raw API response per entry if it's still not working
  for you, and `--dry-run` to see what it would look up without calling
  anything.

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
