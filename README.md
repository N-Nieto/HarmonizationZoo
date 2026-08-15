# Harmonization Zoo 🧠🔬

An interactive, contributor-editable map of methods for harmonizing
multi-site / multi-scanner MRI data — location/scale (ComBat-family)
statistical methods, deep-learning approaches, and everything in between
(federated, IQM-based, normative modeling, optimal transport, classical
intensity normalization, …).

**No framework, no build step, no backend.** One static page, one JSON
file as its database — so it's built to grow.

## Live site

`https://n-nieto.github.io/HarmonizationZoo/`

## What's here

- **Home** — quick orientation, with buttons into the other tabs.
- **Explore** — every method as a box you can group by family, level,
  modality, language, year, stars, citations, validation data, or toolbox,
  search, and compare side-by-side.
- **Which method?** — answer a few questions about your task and
  constraints; the method list narrows live, with a reason given for
  everything removed.
- **Toolboxes** — packages (UniHarmony, ComBatFamily, …) that bundle
  several methods behind one interface, and what each one implements.
- **Add a model** — a short form that turns into a real GitHub pull
  request proposing a new method, no git required.

## Running it locally

```bash
git clone <this-repo>
cd harmonization-zoo
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source**: choose "Deploy from a branch",
   branch `main`, folder `/ (root)`.
3. Give it a minute — your site will be live at
   `https://<you>.github.io/<repo>/`.

Having trouble? See [Troubleshooting GitHub Pages](MAINTAINERS.md#troubleshooting-github-pages)
in `MAINTAINERS.md`.

## Contributing

Two ways to add or fix a method:

- **Use the "Add a model" tab on the site** — fill in a form, it opens a
  pre-filled GitHub page proposing the change as a PR.
- **Edit `data/methods.json` directly** and open a PR — GitHub's web
  editor is enough, no clone needed.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full field reference and
schema. For how the site's automation, data pipelines, and internals work
— GitHub-stats refreshing, the recommender's filter logic, the toolbox
registry, repository protection, deployment troubleshooting — see
[`MAINTAINERS.md`](MAINTAINERS.md).

## Project layout

```
index.html                    the whole page (Home / Explore / Which-method? / Toolboxes / Add-a-model tabs)
css/style.css                 styling
js/app.js                     data loading, box layout, filters, compare mode, recommender, add-model form, detail drawer
data/methods.json             the database — edit this to add/change methods
data/toolboxes.json           registry of packages bundling multiple methods
data/submissions/             pending method submissions, awaiting merge
data/submissions-stats/       pending stats/citation updates, awaiting merge
scripts/                      data pipeline — see MAINTAINERS.md for what each script does
.github/workflows/            scheduled/CI automation — see MAINTAINERS.md
CONTRIBUTING.md               schema reference + how to add a method
MAINTAINERS.md                how the site's automation and internals work
```

## License

MIT — see [`LICENSE`](LICENSE). Method names, paper titles, and links are
factual metadata about third-party work; no paper text or figures are
reproduced here.
