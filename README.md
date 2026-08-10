# Harmonization Zoo 🧠🔬

An interactive, contributor-editable map of methods for harmonizing
multi-site / multi-scanner MRI data — location/scale (ComBat-family)
statistical methods, deep-learning approaches, and everything in between
(federated, IQM-based, normative modeling, optimal transport, classical
intensity normalization, …).

The site has five tabs:

The site has five tabs:

- **Home** — what this is, and four big buttons into the other four tabs.
- **Explore** — methods drawn as boxes sized to fit their full name (nothing
  gets truncated or overlapped), grouped however you pick from "Group by":
  **Harmonization level** (default), **Family**, **Data modality**,
  **Programming language**, **Year** (of the repo's first commit),
  **GitHub stars**, **Citations**, **Validation data** (the dataset/cohort a
  method was mainly proposed or validated on), or **Toolbox** (which
  package(s), if any, bundle this method alongside others — see
  [Toolboxes](#toolboxes) below). Click a box for the paper title and link,
  level, language, architecture/framework/pretrained-weights (deep-learning
  methods), GitHub stars/forks/issues/license, last-maintained status, and
  more.
- **Which method?** — a short questionnaire (downstream task, harmonization
  level, programming language, new-site generalization, Site ID access,
  hardware, signal linearity, federated setup) that filters the method list
  live as you answer, explaining exactly what got removed and why at each
  step.
- **Toolboxes** — see [Toolboxes](#toolboxes) below.
- **Add a model** — a form for proposing a new method, which turns into a
  real GitHub pull request in a couple of clicks. See
  [Adding a method through the site](#adding-a-method-through-the-site)
  below.

Two other things live on the page:

- **Compare mode** — toggle it on (from either tab — it's shared state), click
  2+ boxes to select them, then hit "Compare" for a side-by-side table
  (family, level, modality, validation data, stars, license, UniHarmony
  status, GPU/ML-compatibility, and more). Works the same way in the
  "Which method?" results list as it does in Explore.
- **"⟳ Fetch missing data" button** — an on-demand, session-only preview of
  GitHub stats and citations for whatever's currently missing them, with
  an "Open PR with fetched data" follow-up to make it permanent (see
  [Keeping GitHub stats current](#keeping-github-stats-current)).

Every tab is a real, bookmarkable URL (`#explore`, `#recommend`, `#add`,
`#home` — back/forward navigates between them), and every method has a
shareable direct link: open its drawer and hit "⧉ Copy link to this
method" for a URL that opens straight to that method's detail panel
(`?method=<id>#explore`).

The whole thing is one static site with one JSON file as its database, so
it's built to grow: adding a method is either a two-minute JSON edit and a
pull request, or filling in the "Add a model" form on the site itself (see
[`CONTRIBUTING.md`](CONTRIBUTING.md) and
[Adding a method through the site](#adding-a-method-through-the-site) below).

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

`data/methods.json` seeds **70 methods** across nine families (the
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
  Currently 14 of 70 entries have a specific, verified dataset; the rest are
  "Agnostic" and worth digging into if you know the paper.
- **Toolbox membership** — which package(s), if any, bundle a method
  alongside several others (UniHarmony, neuroHarmonize, ComBatFamily (R),
  Intensity Normalization, NeuroHarm-kit, currently) is tracked in a
  separate registry, `data/toolboxes.json`, rather than as a field on each
  method. See [Toolboxes](#toolboxes) below for why, and for what's in
  each one.

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
- **SiMix** (Xu et al., NeuroImage 2024) — domain generalization for
  brain MRI harmonization via cross-site training-image mixing plus
  test-time perturbation; explicitly designed and validated for
  generalizing to a genuinely unseen site.
- **SSIMH** (Guan et al., MLMI 2022) — a fast, non-learning, spectrum-
  swapping image-level method; notable as one of the only *statistical*
  (not deep-learning) image-level entries in the database, validated on ABCD.
- **Conditioned Diffusion Autoencoder Harmonization** (Scholz et al.,
  MICCAI 2025) and **Style-Guided Latent Diffusion** (MICCAI 2025) — two
  2025 diffusion-model approaches to image-level harmonization, reflecting
  where the field has moved most recently.
- **Attention-Guided Deep Domain Adaptation** (Guan et al., 2021) —
  feature-level domain adaptation aimed at downstream disease
  classification rather than harmonization for its own sake.
- **BlindHarmony** (Jeong et al., ICCV 2023) and **BlindHarmonyDiff**
  (2025) — a normalizing-flow, then diffusion-based, pair of methods built
  around "blind" harmonization: trained only on target-domain data, applied
  to genuinely unseen source domains by construction.
- **TgtFreeHarmony** (Kim, Mun et al., 2026) — goes a step further than
  "blind": needs neither source nor target domain data shared between
  sites at all, aimed at deployments where cross-institution data sharing
  itself is the blocker. Very recent (2026) and has real, working code
  (`SNU-LIST/TgtFreeHarmony`).
- **GNN Structural Connectome Harmonization** (2025) and **Structural
  Connectivity Harmonization via Distribution Matching** (Human Brain
  Mapping, 2025) — the first two entries in the database that harmonize
  structural *connectomes* (diffusion-MRI-derived connectivity matrices)
  rather than voxel images or ROI-level scalar features; a genuinely
  different `modality` value from everything else here.
- **SSIM-Guided Disentanglement** (Caldera et al., 2025) and **DIST-CLIP**
  (2025) — two more late-2025 image-level disentanglement approaches,
  the latter notable for CLIP-based text-guided harmonization and
  zero-shot generalization to an external cohort (OASIS-3).

Two entries from the original UniHarmony seed had incorrect metadata, now
fixed: **BARTharm** and **Harmless** were tagged `image-level`; both
actually operate on extracted features (image quality metrics and cortical-
thickness ROIs, respectively), so they're `feature-level`. **ICA-DP**'s
publication year and link were unverified before this round — it's a very
recent (2026) paper, now confirmed. If you spot another error, that's
exactly what `CONTRIBUTING.md` is for.

### Other candidates surfaced but not yet added

Nothing outstanding right now — the two candidates previously listed here
(SSIM-guided disentanglement, GNN structural-connectome harmonization)
were both tracked down and verified this round; see the additions above.
This section is where the next round of "found in a citation list, not
yet checked firsthand" candidates will go.

### Two real bugs, not just missing data

- **BOTDA** had no dedicated repo captured — fixed with the correct one
  (`vpeterson/otda-mibci`), which also gave a verified year and paper link.
- **Fed-ComBat** was never populating GitHub stats, and the reason wasn't a
  fetch-script bug: its `github` field pointed at `greguig/fedcombat`, but
  that project is actually hosted on **GitLab**
  (`gitlab.inria.fr/greguig/fedcombat`), not GitHub — `api.github.com` was
  never going to resolve it. Moved to `other_url`, which is exactly the
  field that exists for this case. If another entry silently shows "not
  fetched" after a run, this is the first thing worth checking — a wrong or
  non-GitHub host, not a scraper problem.
- **ComBat-GAM** had an incorrect `generalizes_to_new_site: true` override
  in the recommender data — it can't actually be applied to a genuinely new,
  unseen site without refitting, same limitation as standard ComBat. Fixed
  to the family default (`false`).

### Honest gaps — please help close these

- **`paper_year` is verified for 55 of 70 entries; `paper_url` for 43 of
  70.** The rest are `null` rather than estimated — a wrong year is worse
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

The website itself never calls the GitHub API on page load — the browser
only ever does a `fetch()` of the already-committed `data/methods.json`.
All GitHub-derived fields are filled in by `scripts/fetch_github_stats.py`,
a separate script that calls the GitHub API and rewrites the JSON file:

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
- for `method_type == "deep-learning"` entries only: **framework**
  (PyTorch / TensorFlow, auto-detected by fetching the repo's own
  `requirements.txt` / `environment.yml` / `setup.py` / `pyproject.toml`
  and checking which one is mentioned) and **pretrained weights**
  (auto-detected by checking GitHub Releases for an asset that looks like a
  weights file — `.pth`, `.pt`, `.h5`, `.ckpt`, `.safetensors`, etc.). Both
  are best-effort: a `null`/"not detected" result means the check didn't
  find evidence, not that it's confirmed absent — e.g. a repo that only
  `import`s torch in source files without ever listing it in a dependency
  file would be missed.
- **`architecture_backbone`** (VAE, GAN, CycleGAN, StarGAN, Normalizing
  Flow, Disentangled VAE, U-Net, etc.) is the one deep-learning field that
  *isn't* fetched — there's no reliable way to auto-detect "which GAN
  variant" from a repo the way framework/weights can be, so it's hand-set
  per method in `scripts/build_seed.py`'s `ARCHITECTURE_BACKBONE` dict.

### Smart refresh — not everything, every time

Each entry now carries its own `stats_fetched_at` timestamp. A normal run
of `fetch_github_stats.py` **skips any entry fetched within the last 30
days** — there's no need to re-hit the API for 50+ repos every time
someone pushes a small data fix. Anything that's never been fetched (a
brand-new method, or one whose last fetch failed) is always fetched
regardless of that window, so a newly-added method never has to wait a
month for its first stats. `--force` ignores the window and refetches
everyone; `--ids combat,ravel` fetches just specific entries.

This means the scheduled Action (`.github/workflows/refresh-stats.yml`)
can safely keep running on every push to `data/methods.json` *and* weekly
on a cron, without wastefully re-fetching repos that haven't changed. Use
the "force" checkbox when triggering it manually from the Actions tab for
a full refresh.

### On-demand data from the page itself, and turning it into a real PR

The **"⟳ Fetch missing data"** button in the header now covers two things,
sequentially:

- **GitHub stats** — calls the public GitHub REST API directly from your
  browser (CORS-enabled for unauthenticated GET requests) for whichever
  methods are missing them.
- **Citations** — calls the Semantic Scholar Graph API directly from your
  browser for whichever methods have a DOI in `paper_url` but no
  `citations` yet.

**On the citations problem specifically**: if this has genuinely never
worked for you, the most likely explanation is that **Semantic Scholar's
API doesn't support cross-origin browser requests the way GitHub's does**
— GitHub explicitly documents CORS support for its REST API; Semantic
Scholar's docs make no such guarantee. If that's the case, the button will
now say so directly ("citations blocked — Semantic Scholar unreachable
from the browser") instead of silently doing nothing, which is the
difference between a real diagnosis and another guess. If it's *not*
blocked, it should now genuinely fetch citations live from any browser —
worth trying again before falling back to the script. Either way,
`scripts/fetch_citations.py` calls the same API from a plain Python
process, which was never subject to a browser's CORS restrictions in the
first place — if the browser button reports being blocked, the script is
the actual workaround, not a redundant alternative.

Both of these are session-only — reloading the page reverts to whatever's
actually committed. **"↗ Open PR with fetched data"** (appears once
something's been fetched) is what makes it permanent: it bundles exactly
what was fetched this session into `data/submissions-stats/<timestamp>.json`
and opens GitHub's pre-filled new-file page for it, the same
fork-and-PR flow as "Add a model". A maintainer reviews and merges it, and
`.github/workflows/merge-stats-updates.yml` runs
`scripts/merge_stats_updates.py`, which applies each field to the matching
method by id (an explicit field allowlist — a stats update can't smuggle
in a change to a method's name or category) and stamps that entry's
`stats_fetched_at` so the scheduled refresh doesn't immediately re-fetch
it as stale.

Both on-demand fetches are subject to their respective API's
unauthenticated rate limits (GitHub: 60 requests/hour per IP; Semantic
Scholar: no published browser-specific limit, but assume it's not
generous), so they only fetch what's missing, not everything, and stop
with a clear message if rate-limited. For a full, scheduled refresh of
everything, `scripts/fetch_github_stats.py` / `scripts/fetch_citations.py`
(or the Actions that run them) remain the source of truth.

That's why a fresh `git clone` served locally shows all of the above as
`null` until you either run a script yourself once, use the on-demand
button for a session-only look (optionally turning it into a real PR), or
push to GitHub and let the scheduled Actions do it for real.

Unauthenticated GitHub API calls are capped at 60/hour, and a deep-learning
repo now costs up to 4 calls (repo info, first-commit lookup, dependency
file, releases), so this ceiling matters quickly — set a `GITHUB_TOKEN` env
var locally, or rely on the Action (which gets one automatically), to raise
it to 5000/hour.

## Toolboxes

Several methods aren't distributed as their own standalone repo — they're
one option among several bundled inside a larger package. This is why
you'll sometimes see the exact same GitHub link on more than one method's
page: e.g. WhiteStripe, Nyúl–Udupa histogram matching, and RAVEL-in-Python
all point at `jcreinhold/intensity-normalization`, because that's the same
shared toolbox implementing all three, not three separate copies of the
same link by mistake. Similarly, `andy1764/ComBatFamily` (R) implements
ComBat, CovBat, and ComBatLS as one package rather than three scripts, and
`N-Nieto/UniHarmony` bundles eleven methods across three different
statistical families.

`data/toolboxes.json` is a small, separate registry for this — each entry
has an `id`, `name`, `url`, `language` array, a human-written `description`,
and a `methods` array of method ids it implements. It's intentionally kept
separate from `data/methods.json`: a method's own `github`/`other_url`
field still points at its **canonical, original** implementation (the
repo from the paper itself, where one exists independently); the toolbox
registry is *additional* information about *other* places the same
algorithm is also available; a method can legitimately appear in more than
one toolbox's `methods` list (neuroComBat, for instance, is in both
UniHarmony and neuroHarmonize).

The **Toolboxes tab** renders this registry directly — one card per
toolbox, with its description, languages, and every method it implements
as a clickable chip that opens that method's Explore drawer. The Explore
tab's **"Group by: Toolbox"** option renders the same underlying data as
clustered sections instead, with a "Standalone (not bundled in a toolbox)"
group for the ~70% of the database that isn't in any toolbox — because a
method can belong to more than one toolbox, it can legitimately appear in
more than one section there, unlike every other grouping dimension on the
site.

Adding a new toolbox is a small, direct edit to `data/toolboxes.json` — no
form for this yet (it's rare enough, and touches the source-of-truth
registry directly enough, that a plain PR is the right weight for it).

## Adding a method through the site

The "Add a model" tab is a full form — only the name, paper link, and
source code link are required, everything else (family, level, modality,
language, architecture, framework, and every "Which method?" compatibility
question as a toggle) is optional. Pasting a `github.com/owner/repo` link
into the source code field triggers a live preview fetch (stars, primary
language, license) using the same on-demand, browser-side GitHub call as
the "Fetch missing data" button — GitLab and other links are noted
but not auto-fetched.

**This is a static site with no backend to write to**, so "Generate
submission" doesn't call an API — it builds the full JSON entry client-side
and opens a pre-filled GitHub page for a new file at
`data/submissions/<id>.json`. What happens next depends on whether you have
write access to the repo: collaborators can commit it directly; everyone
else gets GitHub's standard "fork this repo and open a pull request" flow
automatically, with no extra setup needed. Either way, the change lands as
a real, reviewable diff — never a direct, unreviewed write to the live
database.

From there:

1. A maintainer reviews and merges the PR into `main`.
2. `.github/workflows/merge-submissions.yml` runs
   `scripts/merge_submissions.py`, which folds every file under
   `data/submissions/` into `data/methods.json` (light validation — required
   fields present, no id collision — since a human already reviewed the
   PR) and deletes the submission files.
3. The stats-refresh Action picks up the newly-added method on its next
   run — a never-before-fetched entry always gets fetched regardless of the
   30-day freshness window (see above), so a brand-new method doesn't have
   to wait a month for its stars/license/etc.
4. GitHub Pages rebuilds automatically on the push from step 2. **You'll
   need to reload the site after that finishes** to see the new method —
   there's no live-push mechanism to an already-open tab.

One honest caveat: by default, GitHub Actions' built-in `GITHUB_TOKEN`
doesn't trigger *other* workflows when it pushes — so the push in step 2
won't automatically kick off the stats-refresh Action in step 3 unless the
repo is set up with a personal access token instead of the default token
for that job. Until/unless that's configured, trigger the stats-refresh
Action manually from the Actions tab after merging a submission, or just
wait for its weekly schedule.

`scripts/build_seed.py` is non-destructive with respect to this pipeline:
re-running it (e.g. to fix a typo in one of the originally-seeded entries)
preserves any method already in `data/methods.json` that isn't one of its
own hardcoded entries, rather than wiping the file back to just the seed
list. Community-submitted methods survive a seed rebuild.

## Repository protection

Every PR — from the "Add a model" form or otherwise — should require
approval from a core team member before it can merge. GitHub calls this a
**ruleset** (the modern replacement for classic branch protection rules).
This repo includes [`.github/CODEOWNERS`](.github/CODEOWNERS), which is a
prerequisite for one specific option below; the ruleset itself has to be
turned on in the repo's settings, since that's account-level configuration
this codebase can't set for you:

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset.**
2. **Target branches**: add `main` (or use the default branch pattern).
3. Under **Branch rules**, enable **Require a pull request before
   merging**, and set **Required approvals** to at least `1`.
4. Still under that same rule, enable **Require review from Code Owners**
   — this is what makes `.github/CODEOWNERS` matter; without it, that file
   is just documentation. Edit `.github/CODEOWNERS` first to list the
   actual reviewer(s) — it currently just has a placeholder.
5. Optionally enable **Dismiss stale pull request approvals when new
   commits are pushed**, so an approved PR can't be silently amended after
   the fact.
6. Set **Enforcement status** to `Active` and save.

With this on, every PR — including ones the merge-submissions pipeline
above depends on — needs a code owner's explicit approval before it can be
merged, regardless of who opened it or whether other checks (like the
duplicate-detection Action) pass.

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

### "The job is queued" and never runs

This is a different symptom from a blank page — it means Pages hasn't
built at all yet, not that it built wrong. With **"Deploy from a branch"**
(confirmed as this repo's setup, not the alternative Actions-based
deployment), the build runs on GitHub's own managed pipeline, entirely
separate from any of this repo's custom workflows — so this isn't
something the repo's Actions setup can cause or fix. In rough order of
likelihood:

1. **GitHub Pages has a documented soft limit of ~10 builds per hour.**
   Pushing to `main` repeatedly in a short window (common while actively
   iterating on the site) can queue builds faster than that limit clears —
   they'll usually catch up within the hour rather than being lost, so if
   you've been pushing a lot, this is the most likely explanation and the
   fix is just to wait a bit.
2. **A stuck/wedged deployment is a known, sometimes GitHub-side issue**,
   not unique to this repo — there are open GitHub Community discussions
   describing a deployment sitting in "queued" for many hours with no
   error, where re-running or cancelling from the UI doesn't help and
   toggling Pages' source off and back on doesn't clear it either. If a
   build has been queued for an unusually long time (well over the normal
   ~1–20 minutes), that's the likely explanation, not a repo
   misconfiguration.
3. **Check GitHub's own status page** —
   [githubstatus.com](https://www.githubstatus.com/) shows active
   incidents, including ones specifically affecting Pages — this is
   unusual traffic/an incident on GitHub's end, not something in the repo.
4. If it's still stuck after a while: try a trivial no-op push to `main`
   to trigger a fresh build attempt, or as a last resort, open a support
   ticket with GitHub — the community reports above indicate this
   sometimes needs GitHub staff to manually clear.

## How the "Which method?" recommender works

It's a **live filter tree** with a **compare mode** shared with Explore (the
same toggle, same selection state — select methods from the recommender's
results and hit Compare just like in Explore). It starts by showing all 58
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
7. **Signal linearity assumption** — only asked for feature-level methods;
   skipped for image-level ones, since "is the biological signal linear in
   these covariates" isn't a meaningful question for a method that operates
   directly on raw images rather than a fitted covariate model
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
Location/Scale (ComBat-family) except **PrettYharmonize**, which survives
the filter — it's the one method in that family built specifically to be
leakage-free in ML pipelines (`recommend.ml_compatible: true` overrides the
family default), so it's the only Location/Scale method that shows up in
ML-task results.

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
independently verified fact for all 70 methods — if you know a specific
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
index.html                    the whole page (Home / Explore / Which-method? / Add-a-model tabs)
css/style.css                 styling
js/app.js                     data loading, box layout, filters, compare mode, recommender, add-model form, detail drawer
data/methods.json             the database — edit this to add/change methods
data/toolboxes.json           registry of packages bundling multiple methods — see "Toolboxes"
data/submissions/             pending method submissions land here as data/submissions/<id>.json, awaiting merge
data/submissions-stats/       pending GitHub-stats/citation updates from the "Open PR with fetched data" button, awaiting merge
scripts/build_seed.py         (re)generates the seed portion of methods.json — non-destructive, preserves other entries
scripts/fetch_github_stats.py enriches methods.json with live stars / first-commit / last-commit / framework / etc from the GitHub API
scripts/fetch_citations.py    optional: fills in citation counts via Semantic Scholar (run manually)
scripts/check_duplicates.py   flags likely-duplicate entries; run in CI on every PR
scripts/merge_submissions.py  folds data/submissions/*.json into methods.json after a submission PR is merged
scripts/merge_stats_updates.py folds data/submissions-stats/*.json field updates into methods.json after that PR is merged
.github/workflows/refresh-stats.yml       runs fetch_github_stats.py weekly + on push to methods.json, and commits the result
.github/workflows/check-duplicates.yml    runs check_duplicates.py on PRs touching the database
.github/workflows/merge-submissions.yml   runs merge_submissions.py on push to data/submissions/
.github/workflows/merge-stats-updates.yml runs merge_stats_updates.py on push to data/submissions-stats/
.github/CODEOWNERS             required-reviewer list for the branch ruleset — see "Repository protection"
CONTRIBUTING.md               schema reference + how to add a method
```

## License

MIT — see [`LICENSE`](LICENSE). Method names, paper titles, and links are
factual metadata about third-party work; no paper text or figures are
reproduced here.
