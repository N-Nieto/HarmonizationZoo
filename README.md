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

Once deployed (see below), this will be at:
`https://<your-username>.github.io/<repo-name>/`

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

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source**: choose
   "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Give it a minute — your site will be live at
   `https://<username>.github.io/<repo>/`.
4. Optional but recommended: repo **Settings → Actions → General →
   Workflow permissions**, set to "Read and write permissions" so the
   scheduled stats-refresh workflow (`.github/workflows/refresh-stats.yml`)
   can commit updated star counts back to the repo.
5. Update the "View on GitHub" link in `index.html` (`#repo-link`) to point
   at your repo.

## What's in the database right now

`data/methods.json` seeds **45 methods**, sourced from the
[UniHarmony reference list](https://github.com/N-Nieto/UniHarmony/wiki/References)
and grouped into the three families used there:

- **ComBat-based** (14) — ComBat, neuroComBat, ComBat-GAM, CovBat, LongComBat,
  RAVEL, RELIEF, ComBatLS, OPNestedComBat, and related empirical-Bayes methods.
- **Deep-learning-based** (20) — DeepHarmony, ImUnity, CycleGAN-based
  approaches, MISPEL, disentanglement methods (CALAMITI, DISARM, DISARM++,
  HACA3, Xcov), federated/unlearning methods, diffusion-MRI harmonization
  tools, and more.
- **Alternative** (11) — IQM-based (BARTharm, NeuroHarmony), normative
  modeling, interpolation-based, federated (FedHarmony, Fed-ComBat,
  d-ComBat), ICA-based, and optimal-transport methods.

### Honest gaps — please help close these

This seed list was built from the reference tables you get to a well-curated
GitHub wiki plus the paper titles it links to — **not** from reading all
eight survey papers cover to cover. That means:

- **`paper_year`, `abstract`, and `citations` are `null` for almost every
  entry.** Filling in a wrong year or a fabricated abstract would be worse
  than leaving it blank, so the seed data doesn't guess. If you know these
  for a method, it's a very welcome PR.
- **`stars` and `last_commit` are populated automatically**, not manually —
  see `scripts/fetch_github_stats.py` and the scheduled Action. They may
  read `null` in a fresh checkout until that script has run once (it needs
  network access to `api.github.com`).
- The eight survey papers you listed (structural-MRI DL survey, site-effects
  overview, cross-scanner comparison study, statistical/DL review, radiomics
  harmonization strategies, systematic ML review, acquisition/image/feature
  survey, disentangled representation-learning overview) almost certainly
  describe more methods than are captured here, especially older statistical
  techniques and modality-specific variants (diffusion, fMRI, spectroscopy).
  Treat this as a solid, real starting taxonomy — not an exhaustive one —
  and use `CONTRIBUTING.md` to extend it as you work through those papers.

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
