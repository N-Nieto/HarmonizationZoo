# Contributing to Harmonization Zoo

The whole site is driven by one file: [`data/methods.json`](data/methods.json).
There's no build step and no database — add a method by editing that file and
opening a pull request. GitHub's web editor is enough; you don't need to clone
the repo.

## Add a method in ~2 minutes

1. Open `data/methods.json`.
2. Copy this block and fill it in (delete any comments — JSON doesn't allow them):

```json
{
  "id": "short-unique-slug",
  "name": "Method Name",
  "category": "combat-family",
  "category_label": "Location/Scale Models (ComBat-family)",
  "method_type": "statistical",
  "level": "feature-level",
  "tags": ["empirical-bayes", "longitudinal"],
  "paper_title": "Exact title of the paper",
  "paper_year": 2023,
  "paper_url": "https://doi.org/10.xxxx/...",
  "abstract": null,
  "github": "owner/repo",
  "other_url": null,
  "language": ["Python"],
  "citations": null,
  "stars": null,
  "last_commit": null,
  "repo_description": null,
  "validation_data": "Agnostic",
  "in_uniharmony": false,
  "also_implemented_in": []
}
```

3. Add it to the `methods` array in `data/methods.json` (order doesn't matter).
4. Open a pull request. A maintainer (or the scheduled Action) will run
   `scripts/fetch_github_stats.py` to fill in `stars` / `last_commit`
   automatically — you don't need to look those up yourself.

## Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase, hyphenated, unique. Used as the box's key — don't change an existing one. |
| `name` | yes | Shown on the box and in the detail panel. |
| `category` | yes | One of `combat-family`, `deep-learning`, `iqm-based`, `normative-modeling`, `interpolation-based`, `federated`, `ica-based`, `optimal-transport`, or propose a new one — add it to `FAMILY_ORDER` in `js/app.js` (id, label, color) so it gets a legend entry and a color. |
| `category_label` | yes | Human-readable version of `category`, shown as a cluster label. |
| `method_type` | yes | `statistical`, `deep-learning`, `machine-learning`, or `other`. |
| `level` | yes | `feature-level` (harmonizes extracted features/ROIs), `image-level` (harmonizes voxel data directly), or `acquisition-level` (harmonizes scanner protocol/sequence). |
| `tags` | no | Free-form keywords (GAN, federated-learning, diffusion-MRI, …). These feed the search box. |
| `paper_title` | no | Use the exact published title. Leave `null` if the method has no associated paper yet. |
| `paper_year` | no | Publication year. **Please don't guess** — leave `null` if unsure rather than adding a wrong year. Note: the "Year" view in the app groups by the repo's **first commit** where available, falling back to this field only when there's no repo (or stats haven't been fetched) — so this field is still worth filling in, but it's no longer the only source of a timeline date. |
| `paper_url` | no | A link to the paper — DOI link preferred (`https://doi.org/...`), arXiv otherwise. Same rule as the year: leave `null` rather than guessing or linking to the wrong paper. |
| `abstract` | no | Write **your own short paraphrase** (2–3 sentences) of what the method does — never paste the paper's actual abstract text verbatim; that's a copyright problem, not just a style preference. |
| `github` | no | `"owner/repo"` only, not a full URL — the site builds the link. Leave `null` if there's no public repo. |
| `other_url` | no | Use this instead of `github` when the implementation lives somewhere that isn't a GitHub repo (Zenodo, a lab wiki, ENIGMA, etc). |
| `language` | no | Array of languages, primary one first. |
| `citations`, `stars`, `forks`, `open_issues`, `license`, `topics`, `archived`, `repo_created_at`, `first_commit_date`, `last_commit`, `repo_description` | no | Leave these `null` — they're meant to be filled automatically by `scripts/fetch_github_stats.py` (GitHub-derived fields) or by hand only for `citations` if you have a real number, not by guessing. See below. |
| `validation_data` | no | The dataset/cohort the method was mainly proposed or validated on (e.g. `"ENIGMA consortium"`, `"ABCD"`). If the paper doesn't anchor to one specific dataset — evaluated across several with no clear primary one, or you just don't know — use the literal string `"Agnostic"` (this is the default; it's a real category here, not a stand-in for missing data). |
| `in_uniharmony` | no | `true` if the method has a working implementation in [UniHarmony](https://github.com/N-Nieto/UniHarmony), else `false`. |
| `also_implemented_in` | no | Array of other toolkits/packages that also bundle this method (e.g. `["neuroHarmonize"]`), beyond its own dedicated repo. Empty array if none. |

## Keeping stats current

`scripts/fetch_github_stats.py` calls the public GitHub API for every entry
that has a `github` field and fills in `stars`, `last_commit`, and the repo's
own `description`. It's wired up as a scheduled GitHub Action
(`.github/workflows/refresh-stats.yml`) that runs weekly and on every push to
`data/methods.json`, so in normal use you never need to run it yourself.

To run it locally:

```bash
python3 scripts/fetch_github_stats.py
```

Unauthenticated requests are capped at 60/hour by GitHub, which is enough for
the current database but may not be once it grows — set a `GITHUB_TOKEN`
environment variable (a plain classic token with no scopes is enough) to raise
that to 5000/hour.

## Adding a new grouping dimension

The six "Group by" options are handled in `render()` in `js/app.js`: Level,
Family, Validation data, and Implemented-in-UniHarmony all go through
`renderClusters()` (flex-wrap sections); Year and GitHub stars go through
`renderYearTimeline()` / `renderStarsTimeline()` (both built on the shared
`buildTimelineColumn()` helper). Adding another cluster-style dimension —
e.g. data modality (structural / diffusion / functional MRI) once enough
entries are tagged with it — means adding an `<option>` to the `#group-by`
select in `index.html` and a branch in `renderClusters()`'s
`groupFn`/`groupOrder`/`groupLabel` logic.

## Regenerating the seed file from scratch

`scripts/build_seed.py` is what originally produced `data/methods.json` from
the harmonization-methods survey tables. You generally don't need to touch
it — it's kept for provenance and in case the JSON ever needs to be rebuilt
from that source list. New methods should be added directly to
`data/methods.json`, not to the seed script.

## Scope

The seed database covers ComBat-family, deep-learning, and "alternative"
(IQM-based, normative-modeling, interpolation, federated, ICA, optimal
transport) methods for **MRI harmonization**, pulled from the UniHarmony
reference list and recent survey papers. PRs that add methods from those same
surveys, or genuinely new published methods, are very welcome — including
methods for modalities beyond MRI, if you think they belong in the zoo.
