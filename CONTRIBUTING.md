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
  "category_label": "ComBat-based",
  "method_type": "statistical",
  "level": "feature-level",
  "tags": ["empirical-bayes", "longitudinal"],
  "paper_title": "Exact title of the paper",
  "paper_year": 2023,
  "abstract": null,
  "github": "owner/repo",
  "other_url": null,
  "language": ["Python"],
  "citations": null,
  "stars": null,
  "last_commit": null,
  "repo_description": null
}
```

3. Add it to the `methods` array in `data/methods.json` (order doesn't matter).
4. Open a pull request. A maintainer (or the scheduled Action) will run
   `scripts/fetch_github_stats.py` to fill in `stars` / `last_commit`
   automatically — you don't need to look those up yourself.

## Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase, hyphenated, unique. Used as the chart's key — don't change an existing one, or the bubble will reset its animation state. |
| `name` | yes | Shown on the bubble and in the detail panel. |
| `category` | yes | One of `combat-family`, `deep-learning`, `alternative`, or propose a new one (also add it to `CATEGORY_LABELS` in `scripts/build_seed.py` and to `GROUPERS` handling in `js/app.js` if it's a genuinely new family). |
| `category_label` | yes | Human-readable version of `category`, shown as a cluster label. |
| `method_type` | yes | `statistical`, `deep-learning`, `machine-learning`, or `other`. |
| `level` | yes | `feature-level` (harmonizes extracted features/ROIs), `image-level` (harmonizes voxel data directly), or `acquisition-level` (harmonizes scanner protocol/sequence). |
| `tags` | no | Free-form keywords (GAN, federated-learning, diffusion-MRI, …). These feed the search box. |
| `paper_title` | no | Use the exact published title. Leave `null` if the method has no associated paper yet. |
| `paper_year` | no | Publication year. **Please don't guess** — leave `null` if unsure rather than adding a wrong year. |
| `abstract` | no | Write **your own short paraphrase** (2–3 sentences) of what the method does — never paste the paper's actual abstract text verbatim; that's a copyright problem, not just a style preference. |
| `github` | no | `"owner/repo"` only, not a full URL — the site builds the link. Leave `null` if there's no public repo. |
| `other_url` | no | Use this instead of `github` when the implementation lives somewhere that isn't a GitHub repo (Zenodo, a lab wiki, ENIGMA, etc). |
| `language` | no | Array of languages, primary one first. |
| `citations`, `stars`, `last_commit`, `repo_description` | no | Leave these `null` — they're meant to be filled automatically, not by hand. See below. |

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

Groupings (the "Group by" dropdown) are defined in `GROUPERS` near the top of
`js/app.js`. Each entry just needs a label and a function that reads the
grouping key off a method record — e.g. data modality (structural / diffusion
/ functional MRI) would be a good next dimension once enough entries are
tagged with it in `tags`.

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
