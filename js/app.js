/* Harmonization Zoo — box map
 * Renders methods from data/methods.json as name-fitting boxes, either
 * grouped into flex-wrap sections (Level / Family) or laid out along a
 * horizontal timeline (Year of first commit, or GitHub stars). Color
 * always encodes Family, regardless of which grouping is active.
 */

const LEVEL_ORDER = ["feature-level", "image-level", "acquisition-level"];
const LEVEL_LABELS = {
  "feature-level": "Feature-level",
  "image-level": "Image-level",
  "acquisition-level": "Acquisition-level",
};

// Fixed order + color per family, so the same family always reads as the
// same color whether you're grouped by Level, Family, Year, or Stars.
const FAMILY_ORDER = [
  ["combat-family", "Location/Scale Models (ComBat-family)", "#f2a93b"],
  ["classical-normalization", "Classical Intensity Normalization", "#c98f5e"],
  ["deep-learning", "Deep learning-based", "#5fc9c9"],
  ["iqm-based", "IQM-based", "#9c8cf0"],
  ["normative-modeling", "Normative Modeling", "#e0708a"],
  ["interpolation-based", "Interpolation-based", "#7fd88f"],
  ["federated", "Federated Learning-compatible", "#6fa8dc"],
  ["ica-based", "ICA-based", "#e0a8f0"],
  ["optimal-transport", "Optimal transport-based", "#d8c26a"],
  ["domain-adaptation", "Domain Adaptation & Distribution Matching", "#ef7d55"],
  ["confound-removal", "Confound Removal", "#8e98a6"],
  ["acquisition-protocol", "Acquisition / Protocol Harmonization", "#a3b1c2"],
];
const FAMILY_COLOR = new Map(FAMILY_ORDER.map(([id, , color]) => [id, color]));
const FAMILY_LABEL = new Map(FAMILY_ORDER.map(([id, label]) => [id, label]));
// Extra information shown with a family (legend tooltip, method details).
const FAMILY_NOTE = {
  "confound-removal": "Removes site/scanner effects (e.g. by regression or per-site standardization) without explicitly protecting biological variability: no biological covariates are modelled, so biology that differs between sites can be removed too. Often used as a baseline.",
};
// preserves_biology flag: does the method explicitly protect biological variability
// (e.g. by modelling biological covariates)? null = not assessed.
const BIOLOGY_WARNING = "Does not explicitly preserve biological variability: site effects are removed without modelling biological covariates, so biology that differs between sites can be removed too.";
const BIOLOGY_LABEL = {
  true: "Yes — biological covariates are modelled explicitly",
  false: "No — no explicit biological preservation",
  null: "Not assessed",
};

const STAR_BUCKETS = ["0", "1–9", "10–49", "50–199", "200–999", "1000+"];

const state = {
  data: [],
  toolboxes: [],
  resources: [],
  resourceFilter: "all",
  resourceModality: "all",
  datasets: [],
  datasetCategory: "all",
  groupBy: "category",
  search: "",
  activeLevels: new Set(LEVEL_ORDER),
  fontSize: 13,
  compareMode: false,
  selectedIds: new Set(),
  activeTab: "home",
  view: "map",
  sort: { key: "citations", dir: "desc" },
  facets: {}, // facet key -> Set of selected values (OR within a facet, AND across facets)
};

async function init() {
  let json;
  try {
    const res = await fetch("data/methods.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    document.getElementById("home-root").innerHTML = `
      <div class="loading-placeholder">
        Couldn't load the database (${escapeHtml(String(e.message || e))}). Try reloading —
        if this keeps happening, data/methods.json may be missing or malformed.
      </div>`;
    return;
  }

  state.data = json.methods.map((d) => ({
    ...d,
    primary_language: d.language && d.language.length ? d.language[0] : "Unspecified",
  }));
  state.dbStatsFetchedAt = json.stats_fetched_at || null;

  try {
    const tbRes = await fetch("data/toolboxes.json");
    state.toolboxes = tbRes.ok ? (await tbRes.json()).toolboxes : [];
  } catch (e) {
    state.toolboxes = []; // supplementary data — the rest of the site works fine without it
  }
  try {
    const dsRes = await fetch("data/datasets.json");
    state.datasets = dsRes.ok ? (await dsRes.json()).datasets : [];
  } catch (e) {
    state.datasets = []; // optional
  }
  try {
    const gRes = await fetch("data/guide.json");
    state.guide = gRes.ok ? await gRes.json() : null;
  } catch (e) {
    state.guide = null; // optional
  }
  try {
    const resRes = await fetch("data/resources.json");
    state.resources = resRes.ok ? (await resRes.json()).resources : [];
  } catch (e) {
    state.resources = []; // optional, like toolboxes
  }

  document.getElementById("method-count").textContent = `${state.data.length} methods`;

  buildLevelToggles();
  buildFamilyLegend();
  bindControls();
  bindFacets();
  bindTabs();
  bindCompareBar();
  bindFetchStatsButton();
  document.getElementById("brand-home-link").addEventListener("click", () => switchTab("home"));
  const hasSharedRecommendation = loadRecommendationFromUrl();
  buildRecommender();
  buildHomeTab();
  buildToolboxesTab();
  buildResourcesTab();
  buildDatasetsTab();
  buildGuideTab();
  buildGlossaryTab();
  buildAddModelTab();
  render();

  // Deep links: #explore / #recommend / #add / #home select a tab on load
  // and respond to back/forward; ?method=<id> opens that method's drawer
  // directly (from Explore); ?rec=key:value,key:value pre-fills the
  // "Which method?" tree from a shared recommendation link.
  switchTab(hasSharedRecommendation ? "recommend" : initialTabFromUrl(), { pushHistory: false });
  window.addEventListener("popstate", (e) => {
    switchTab((e.state && e.state.tab) || initialTabFromUrl(), { pushHistory: false });
  });

  const params = new URLSearchParams(location.search);
  const wantedMethod = params.get("method");
  if (wantedMethod) {
    const match = state.data.find((d) => d.id === wantedMethod);
    if (match) {
      switchTab("explore", { pushHistory: false });
      openDrawer(match);
    }
  }
}

function buildLevelToggles() {
  const wrap = document.getElementById("level-toggles");
  wrap.innerHTML = "";
  LEVEL_ORDER.forEach((lvl) => {
    const btn = document.createElement("button");
    btn.className = "level-pill active";
    btn.textContent = LEVEL_LABELS[lvl];
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => {
      if (state.activeLevels.has(lvl)) {
        if (state.activeLevels.size === 1) return; // keep at least one level visible
        state.activeLevels.delete(lvl);
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
      } else {
        state.activeLevels.add(lvl);
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }
      render();
    });
    wrap.appendChild(btn);
  });
}

function buildFamilyLegend() {
  const legend = document.getElementById("family-legend");
  legend.innerHTML = "";
  const present = new Set(state.data.map((d) => d.category));
  FAMILY_ORDER.filter(([id]) => present.has(id)).forEach(([id, label, color]) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${escapeHtml(color)}"></span>${escapeHtml(label)}`;
    if (FAMILY_NOTE[id]) item.title = FAMILY_NOTE[id];
    legend.appendChild(item);
  });
}

/* ---------------- Home tab ---------------- */

function dbFreshnessText() {
  if (!state.dbStatsFetchedAt) {
    return `GitHub stats haven't been synced for this build yet.`;
  }
  const then = new Date(state.dbStatsFetchedAt).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  let rel;
  if (days < 1) rel = "today";
  else if (days === 1) rel = "yesterday";
  else if (days < 14) rel = `${days} days ago`;
  else rel = `on ${state.dbStatsFetchedAt.split("T")[0]}`;
  return `GitHub stats across the database were last synced ${rel}.`;
}

function buildHomeTab() {
  const root = document.getElementById("home-root");
  const familyCount = new Set(state.data.map((d) => d.category)).size;

  root.innerHTML = `
    <div class="home-wrap">
      <h2 class="home-title">A field guide to MRI harmonization methods</h2>
      <p class="home-lede">
        Harmonization Zoo maps out <strong>${state.data.length} methods</strong> for
        harmonizing multi-site / multi-scanner MRI data across
        <strong>${familyCount} families</strong> — from classical location/scale
        statistics (ComBat and its relatives) through deep-learning image-to-image
        translation, federated setups, and everything in between. It's one static
        page with one JSON file as its database, kept in sync with GitHub for stars,
        activity, and licensing, and built to grow — anyone can propose a new method.
      </p>

      <div class="home-stats">
        <button type="button" class="home-stat" data-tab="explore"><strong>${state.data.length}</strong><span>methods</span></button>
        <button type="button" class="home-stat" data-tab="explore" data-code-only="1"><strong>${state.data.filter(hasPublicCode).length}</strong><span>with public code</span></button>
        <button type="button" class="home-stat" data-tab="toolboxes"><strong>${state.toolboxes.length}</strong><span>toolboxes</span></button>
        <button type="button" class="home-stat" data-tab="resources"><strong>${state.resources.length}</strong><span>reviews &amp; benchmarks</span></button>
        <button type="button" class="home-stat" data-tab="datasets"><strong>${state.datasets.length}</strong><span>datasets</span></button>
      </div>
      <p class="home-kbd">Keyboard: <kbd>/</kbd> search methods · <kbd>1</kbd>–<kbd>${VALID_TABS.length}</kbd> switch tabs · <kbd>Esc</kbd> close panels</p>

      <div class="home-cta-grid">
        <button type="button" class="home-cta" data-tab="explore">
          <span class="home-cta-title">Explore →</span>
          <span class="home-cta-desc">Browse every method as a map, grouped by family, level, modality,
            language, year, stars, citations, validation data, or toolbox.
            Compare methods side by side.</span>
        </button>
        <button type="button" class="home-cta" data-tab="recommend">
          <span class="home-cta-title">Which method? →</span>
          <span class="home-cta-desc">Answer a short set of questions about your task, data, and
            constraints. The list narrows live, with an explanation for every method
            that gets removed.</span>
        </button>
        <button type="button" class="home-cta" data-tab="toolboxes">
          <span class="home-cta-title">Toolboxes →</span>
          <span class="home-cta-desc">Several methods aren't standalone repos — they're bundled inside
            larger packages (UniHarmony, ComBatFamily, NeuroHarm-kit, …). See what's
            implemented where, in which language.</span>
        </button>
        <button type="button" class="home-cta" data-tab="resources">
          <span class="home-cta-title">Resources →</span>
          <span class="home-cta-desc">Reviews, comparison studies and best-practice papers, each linked to the
            methods it discusses, plus notes on EEG/MEG harmonization.</span>
        </button>
        <button type="button" class="home-cta" data-tab="datasets">
          <span class="home-cta-title">Datasets →</span>
          <span class="home-cta-desc">Traveling-subject resources, harmonization benchmarks, phantoms and
            large multisite cohorts to develop and test methods on.</span>
        </button>
        <button type="button" class="home-cta" data-tab="guide">
          <span class="home-cta-title">Did harmonization work? →</span>
          <span class="home-cta-desc">A step-by-step checklist: site effects removed, biology kept,
            paired-data checks, anatomy preservation and leakage-safe evaluation.</span>
        </button>
        <button type="button" class="home-cta" data-tab="glossary">
          <span class="home-cta-title">Glossary →</span>
          <span class="home-cta-desc">Batch effect, traveling subjects, empirical Bayes, data leakage, confound
            removal… the terms used across the site, in plain language.</span>
        </button>
        <button type="button" class="home-cta" data-tab="add">
          <span class="home-cta-title">Add a model →</span>
          <span class="home-cta-desc">Know a method that's missing? Fill in a short form — paper link
            and source code link required, everything else optional — and submit it
            as a real GitHub contribution in a couple of clicks.</span>
        </button>
      </div>

      <p class="home-footnote">
        Built and maintained as an open, editable reference — see
        <a href="https://github.com/N-Nieto/HarmonizationZoo" target="_blank" rel="noopener">the repo</a>
        for the full data model and contribution guide.
        ${dbFreshnessText()}
      </p>
    </div>
  `;

  root.querySelectorAll(".home-cta, .home-stat").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.codeOnly && !(state.facets.code && state.facets.code.has("yes"))) {
        const t = document.getElementById("code-only-toggle");
        if (t) t.click();
      }
      switchTab(btn.dataset.tab);
    });
  });
}

/* ---------------- Add a model tab ---------------- */

const SUBMIT_REPO = "N-Nieto/HarmonizationZoo";
const SUBMIT_BRANCH = "main";
// Controlled modality vocabulary — keep in sync with MODALITIES in scripts/validate_methods.py.
const MODALITY_CODES = [
  "sMRI", "dMRI", "fMRI", "connectome", "EEG", "MEG", "PET", "CT", "radiomics", "omics",
  "histopathology", "general-imaging", "general", "MRI-acquisition",
];
// Legacy free-text `modality` field (used by "Group by → modality") derived from the first proposed modality.
const LEGACY_MODALITY = {
  sMRI: "Structural MRI", dMRI: "Diffusion MRI", fMRI: "Functional MRI", connectome: "Functional MRI",
  EEG: "EEG", MEG: "MEG", PET: "Medical imaging (general, not MRI-brain-specific)",
  CT: "Radiomics (CT/MRI)", radiomics: "Radiomics (CT/MRI)", omics: "Omics/Proteomics",
  histopathology: "Medical imaging (general, not MRI-brain-specific)",
  "general-imaging": "Medical imaging (general, not MRI-brain-specific)",
  general: "Modality-agnostic (general ML)", "MRI-acquisition": "Acquisition (modality-agnostic)",
};
const ARCHITECTURE_OPTIONS = [
  "VAE", "GAN", "CycleGAN", "StarGAN", "VAE-GAN", "Disentangled VAE",
  "Autoencoder", "Adversarial network", "Adversarial autoencoder",
  "Normalizing flow", "Energy-based model", "U-Net (CNN)", "Transformer",
  "Diffusion model", "Other",
];
const ENTRY_TYPE_OPTIONS = [
  ["method", "New method"], ["implementation", "Implementation of an existing method"],
  ["toolbox", "Toolbox / package"], ["protocol", "Acquisition protocol"],
];
const PUBLICATION_TYPE_OPTIONS = [
  ["article", "Journal article"], ["conference-paper", "Conference paper"],
  ["preprint", "Preprint"], ["data-paper", "Data paper"],
];

const addModelState = {
  entryType: "method", level: "feature-level",
  proposed: new Set(), tested: new Set(), extends: new Set(), toolboxes: new Set(), secondary: new Set(),
  evidence: [],
  needsGpu: null, hasPretrainedWeights: null,
  requiresSiteId: null, generalizesToNewSite: null, lowNFriendly: null,
  requiresLinearSignal: null, mlCompatible: null, longitudinal: null, requiresPairedData: null,
  idTouched: false, fetchedRepo: null, last: null,
};

/* ---------------- Toolboxes tab ---------------- */

function buildToolboxesTab() {
  const root = document.getElementById("toolboxes-root");

  if (state.toolboxes.length === 0) {
    root.innerHTML = `<div class="loading-placeholder">No toolbox data available.</div>`;
    return;
  }

  const cards = state.toolboxes.map((tb) => {
    const methods = tb.methods
      .map((id) => state.data.find((d) => d.id === id))
      .filter(Boolean);

    const methodChips = methods.map((m) => `
      <button type="button" class="toolbox-method-chip" data-id="${escapeHtml(m.id)}" style="--box-color:${FAMILY_COLOR.get(m.category) || "#888"}">
        ${escapeHtml(m.name)}
      </button>
    `).join("");

    const langChips = (tb.language || []).map((l) => `<span class="chip">${escapeHtml(l)}</span>`).join("");

    return `
      <div class="toolbox-card">
        <div class="toolbox-card-header">
          <h3>${escapeHtml(tb.name)}</h3>
          ${extLink(tb.url, `↗ ${escapeHtml(String(tb.url || "").replace(/^https?:\/\//, ""))}`, "toolbox-link")}
        </div>
        <div class="chip-row">${langChips}</div>
        <p class="toolbox-desc">${escapeHtml(tb.description)}</p>
        <p class="toolbox-methods-label">Implements ${methods.length} method${methods.length === 1 ? "" : "s"} in this database:</p>
        <div class="toolbox-methods">${methodChips}</div>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <div class="toolboxes-wrap">
      <p class="toolboxes-intro">
        Some methods aren't distributed as their own standalone repo — they're bundled inside
        a larger package alongside several others. That's why you'll sometimes see the same
        GitHub link on more than one method's page: it's the same shared implementation, not
        a data error. This page lists each such toolbox, what it actually implements, and in
        which language — the individual method pages still link to their own canonical
        repo/paper where one exists independently.
      </p>
      <div class="toolbox-grid">${cards}</div>
    </div>
  `;

  root.querySelectorAll(".toolbox-method-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const method = state.data.find((d) => d.id === chip.dataset.id);
      if (method) {
        switchTab("explore");
        openDrawer(method);
      }
    });
  });
}

/* ---------------- Resources tab ---------------- */
// Curated reviews, surveys, benchmarks and guides (data/resources.json). Each
// resource lists the zoo methods it discusses, so cards link into the
// database and each method's drawer links back ("Reviewed in").

// Resource types (data/resources.json `type`). Surveys, systematic reviews and
// overviews are all "Review"; old values still map for older forks of the data.
const RESOURCE_TYPE_LABEL = {
  "review": "Review", "benchmark": "Comparison study", "best-practice": "Best practice",
  "survey": "Review", "systematic-review": "Review", "book-chapter": "Review",
  "research": "Comparison study", "guide": "Best practice",
};
const RESOURCE_TYPE_NORMAL = { survey: "review", "systematic-review": "review", "book-chapter": "review", research: "benchmark", guide: "best-practice" };
const resourceType = (r) => RESOURCE_TYPE_NORMAL[r.type] || r.type || "review";
// Filter pills on top of the Resources tab: one per type, plus the EEG/MEG notes.
const RESOURCE_FILTERS = [
  ["all", "All"], ["review", "Reviews"], ["benchmark", "Comparison studies"],
  ["best-practice", "Best practice"], ["eeg-meg", "EEG / MEG"],
];

function resourcesCovering(methodId) {
  return state.resources.filter((r) => (r.methods || []).includes(methodId));
}

function resourceShortCite(r) {
  const first = (r.authors && r.authors[0]) || "";
  const last = first.split(/\s+/).pop();
  return `${last}${r.authors && r.authors.length > 1 ? " et al." : ""} ${r.year || ""}`.trim();
}

// Second row of Resources pills: modality.
const RESOURCE_MODALITIES = [
  ["all", "Any modality"], ["sMRI", "Structural MRI"], ["dMRI", "Diffusion MRI"], ["fMRI", "Functional MRI"],
  ["radiomics", "Radiomics / CT"], ["PET", "PET"],
];
function resourceMatchesModality(r, m) {
  if (m === "all") return true;
  const sc = r.scope || [];
  if (m === "radiomics") return sc.includes("radiomics") || sc.includes("CT");
  if (m === "fMRI") return sc.includes("fMRI") || sc.includes("connectome");
  return sc.includes(m);
}
function resourceMatchesFilter(r, f) {
  if (f === "all") return true;
  if (f === "eeg-meg") return (r.scope || []).some((x) => x === "EEG" || x === "MEG");
  return resourceType(r) === f;
}

// EEG/MEG notes (data/guide.json `eeg`), shown above the list when the EEG / MEG filter is on.
function eegNotesHtml(L) {
  const eeg = state.guide && state.guide.eeg;
  if (!eeg) return "";
  return `
    <section class="eeg-notes">
      <h2>${escapeHtml(eeg.title)}</h2>
      <p class="toolboxes-intro">${escapeHtml(eeg.intro || "")}</p>
      <div class="eeg-notes-cols">
        <div>
          <h3 class="guide-sub">Where between-site differences come from</h3>
          <ul class="guide-do">${(eeg.sources || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
          ${L.links({ datasets: eeg.datasets })}
        </div>
        <div>
          <h3 class="guide-sub">Approaches</h3>
          <div class="guide-approaches">${(eeg.approaches || []).map((a) => `
            <article class="guide-approach">
              <h4>${escapeHtml(a.title)}</h4>
              <p>${escapeHtml(a.text)}</p>
              ${L.links(a)}
            </article>`).join("")}</div>
        </div>
      </div>
      <h3 class="guide-sub">EEG / MEG papers</h3>
    </section>`;
}

function buildResourcesTab() {
  const root = document.getElementById("resources-root");
  if (!state.resources.length) {
    root.innerHTML = `<div class="loading-placeholder">No resources listed yet.</div>`;
    return;
  }
  const byId = new Map(state.data.map((d) => [d.id, d]));
  const L = makeContentLinker();
  const visible = state.resources
    .filter((r) => resourceMatchesFilter(r, state.resourceFilter) && resourceMatchesModality(r, state.resourceModality))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));

  const cards = visible.map((r) => {
    const methods = (r.methods || []).map((id) => byId.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = methods.slice(0, 14);
    const chips = shown.map((m) => `<button type="button" class="toolbox-method-chip" data-id="${escapeHtml(m.id)}" style="--box-color:${FAMILY_COLOR.get(m.category) || "#888"}">${escapeHtml(m.name)}</button>`).join("");
    const more = methods.length > shown.length
      ? `<button type="button" class="resource-more" data-res="${escapeHtml(r.id)}">+ ${methods.length - shown.length} more</button>` : "";
    const authors = (r.authors || []).length > 4 ? `${r.authors.slice(0, 3).join(", ")} et al.` : (r.authors || []).join(", ");
    const url = r.doi ? `https://doi.org/${r.doi}` : r.url;
    return `
      <article class="resource-card" id="res-${escapeHtml(r.id)}">
        <div class="resource-meta">
          <span class="resource-type resource-type-${escapeHtml(resourceType(r))}">${escapeHtml(RESOURCE_TYPE_LABEL[resourceType(r)] || "Resource")}</span>
          <span>${escapeHtml(r.year || "")}</span>
          ${r.open_access ? `<span class="resource-oa" title="Free to read">Open access</span>` : ""}
        </div>
        <h3>${extLink(url, escapeHtml(r.title), "resource-title")}</h3>
        <p class="resource-cite">${escapeHtml(authors)} · <em>${escapeHtml(r.venue || "")}</em></p>
        <p class="resource-note">${escapeHtml(r.note || "")}</p>
        <div class="chip-row">${(r.scope || []).map((s) => `<span class="chip">${escapeHtml(MODALITY_FACET_LABEL[s] || s)}</span>`).join("")}${(r.topics || []).map((t) => `<span class="chip chip-soft">${escapeHtml(t)}</span>`).join("")}</div>
        ${methods.length ? `
          <p class="toolbox-methods-label">Discusses ${methods.length} method${methods.length === 1 ? "" : "s"} in this database:</p>
          <div class="toolbox-methods resource-methods" data-res="${escapeHtml(r.id)}">${chips}${more}</div>` : ""}
      </article>`;
  }).join("");

  root.innerHTML = `
    <div class="toolboxes-wrap resources-wrap">
      <p class="toolboxes-intro">
        Papers worth reading before and while you harmonize: <strong>reviews</strong> map the field,
        <strong>comparison studies</strong> test methods against each other, and <strong>best-practice</strong>
        papers say how to use them without pitfalls. Each card links to the methods it discusses that are in
        this database, and every method's details show which of these resources cover it. Know a resource that
        belongs here? Open an issue or a pull request adding it to <code>data/resources.json</code>.
      </p>
      <div class="rec-options resource-filter" role="group" aria-label="Filter resources by type">
        ${RESOURCE_FILTERS.filter(([f]) => f === "all" || state.resources.some((r) => resourceMatchesFilter(r, f))).map(([f, label]) => {
          const n = state.resources.filter((r) => resourceMatchesFilter(r, f)).length;
          return `<button type="button" class="rec-pill${state.resourceFilter === f ? " active" : ""}" aria-pressed="${state.resourceFilter === f}" data-filter="${f}">${escapeHtml(label)} (${n})</button>`;
        }).join("")}
      </div>
      ${state.resourceFilter === "eeg-meg" ? "" : `<div class="rec-options resource-filter resource-modality" role="group" aria-label="Filter resources by modality">
        ${RESOURCE_MODALITIES.map(([m, label]) => {
          const n = state.resources.filter((r) => resourceMatchesFilter(r, state.resourceFilter) && resourceMatchesModality(r, m)).length;
          return n || m === "all" ? `<button type="button" class="rec-pill rec-pill-sm${state.resourceModality === m ? " active" : ""}" aria-pressed="${state.resourceModality === m}" data-modality="${m}">${escapeHtml(label)}${m === "all" ? "" : ` (${n})`}</button>` : "";
        }).join("")}
      </div>`}
      ${state.resourceFilter === "eeg-meg" ? eegNotesHtml(L) : ""}
      <div class="resource-list">${cards || `<p class="loading-placeholder">No resources of this type yet.</p>`}</div>
    </div>`;

  root.querySelectorAll(".resource-filter .rec-pill[data-filter]").forEach((b) => b.addEventListener("click", () => {
    state.resourceFilter = b.dataset.filter;
    if (b.dataset.filter === "eeg-meg") state.resourceModality = "all";
    buildResourcesTab();
  }));
  root.querySelectorAll(".resource-modality .rec-pill").forEach((b) => b.addEventListener("click", () => {
    state.resourceModality = b.dataset.modality;
    buildResourcesTab();
  }));
  if (state.resourceFilter === "eeg-meg") {
    const notes = root.querySelector(".eeg-notes");
    if (notes) L.bind(notes);
  }
  const bindChips = (scope) => scope.querySelectorAll(".toolbox-method-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const method = byId.get(chip.dataset.id);
      if (method) { switchTab("explore"); openDrawer(method); }
    });
  });
  bindChips(root);
  root.querySelectorAll(".resource-more").forEach((btn) => btn.addEventListener("click", () => {
    const r = state.resources.find((x) => x.id === btn.dataset.res);
    const box = btn.parentElement;
    box.innerHTML = (r.methods || []).map((id) => byId.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => `<button type="button" class="toolbox-method-chip" data-id="${escapeHtml(m.id)}" style="--box-color:${FAMILY_COLOR.get(m.category) || "#888"}">${escapeHtml(m.name)}</button>`).join("");
    bindChips(box);
  }));
}

function showResource(id) {
  const r = state.resources.find((x) => x.id === id);
  if (!(r && resourceMatchesFilter(r, state.resourceFilter) && resourceMatchesModality(r, state.resourceModality))) {
    state.resourceFilter = "all"; state.resourceModality = "all"; buildResourcesTab();
  }
  switchTab("resources");
  const el = document.getElementById(`res-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("resource-flash");
    setTimeout(() => el.classList.remove("resource-flash"), 1600);
  }
}

/* ---------------- Datasets tab ---------------- */
// Multisite datasets (data/datasets.json): traveling-subject resources and
// benchmarks built for harmonization, phantoms, and large multisite cohorts.
// Methods are linked when their `validation_data` mentions one of a dataset's
// aliases (word match), so the list grows as validation_data is filled in.

const DATASET_CATEGORIES = [
  ["all", "All"],
  ["traveling-subjects", "Traveling subjects"],
  ["harmonization-benchmark", "Harmonization benchmarks"],
  ["phantom", "Phantoms"],
  ["multisite-cohort", "Multisite cohorts"],
];
const DATASET_CATEGORY_LABEL = Object.fromEntries(DATASET_CATEGORIES);
const DATASET_ACCESS_LABEL = { open: "Open download", registration: "Free registration", application: "Data-use application", private: "Not public" };

function methodsValidatedOn(ds) {
  const names = [ds.name, ...(ds.aliases || [])].filter(Boolean);
  const res = names.map((n) => new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9])`, "i"));
  return state.data.filter((d) => d.validation_data && res.some((re) => re.test(d.validation_data)));
}

function buildDatasetsTab() {
  const root = document.getElementById("datasets-root");
  if (!state.datasets.length) {
    root.innerHTML = `<div class="loading-placeholder">No datasets listed yet.</div>`;
    return;
  }
  const visible = state.datasets.filter((d) => state.datasetCategory === "all" || d.category === state.datasetCategory);
  const order = DATASET_CATEGORIES.map(([k]) => k);
  visible.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (b.year || 0) - (a.year || 0));

  const cards = visible.map((ds) => {
    const used = methodsValidatedOn(ds).sort((a, b) => a.name.localeCompare(b.name));
    const paperUrl = ds.doi ? `https://doi.org/${ds.doi}` : null;
    const facts = [
      ["Participants", ds.participants], ["Sites / scanners", ds.sites],
      ["Vendors", (ds.vendors || []).join(", ")], ["Sessions", ds.sessions],
    ].filter(([, v]) => v);
    const extra = (ds.extra_papers || []).map((p) => extLink(p.doi ? `https://doi.org/${p.doi}` : p.url, `${escapeHtml(p.title)}${p.year ? ` (${escapeHtml(p.year)})` : ""}`, "inline-link")).join("<br>");
    return `
      <article class="dataset-card dataset-${escapeHtml(ds.category)}">
        <div class="resource-meta">
          <span class="resource-type">${escapeHtml(DATASET_CATEGORY_LABEL[ds.category] || ds.category)}</span>
          ${ds.access ? `<span class="dataset-access dataset-access-${escapeHtml(ds.access)}">${escapeHtml(DATASET_ACCESS_LABEL[ds.access] || ds.access)}</span>` : ""}
          ${ds.longitudinal ? `<span>Longitudinal</span>` : ""}
        </div>
        <h3>${escapeHtml(ds.name)}</h3>
        ${ds.full_name && ds.full_name !== ds.name ? `<p class="resource-cite">${escapeHtml(ds.full_name)}</p>` : ""}
        <p class="resource-note">${escapeHtml(ds.description || "")}</p>
        <div class="chip-row">${(ds.modalities || []).map((m) => `<span class="chip">${escapeHtml(MODALITY_FACET_LABEL[m] || m)}</span>`).join("")}</div>
        ${facts.length ? `<dl class="spec-table dataset-facts">${facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>` : ""}
        <div class="dataset-links">
          ${ds.url ? extLink(ds.url, "↗ Website / access", "inline-link") : ""}
          ${paperUrl ? extLink(paperUrl, `↗ Paper${ds.year ? ` (${escapeHtml(ds.year)})` : ""}`, "inline-link") : ""}
        </div>
        ${extra ? `<p class="dataset-extra">Also: ${extra}</p>` : ""}
        ${used.length ? `
          <p class="toolbox-methods-label">Validation data for ${used.length} method${used.length === 1 ? "" : "s"} here:</p>
          <div class="toolbox-methods">${used.map((m) => `<button type="button" class="toolbox-method-chip" data-id="${escapeHtml(m.id)}" style="--box-color:${FAMILY_COLOR.get(m.category) || "#888"}">${escapeHtml(m.name)}</button>`).join("")}</div>` : ""}
      </article>`;
  }).join("");

  root.innerHTML = `
    <div class="toolboxes-wrap resources-wrap">
      <p class="toolboxes-intro">
        Datasets for developing and testing harmonization. <strong>Traveling-subject</strong> resources
        scan the same people on several scanners, so scanner effects can be measured directly; they are what
        methods marked "needs paired data" require. <strong>Benchmarks</strong> and <strong>phantoms</strong>
        come with an evaluation set-up. <strong>Multisite cohorts</strong> are large studies whose site effects are
        the problem harmonization solves. Check each dataset's own terms before use; missing access details mean
        we haven't verified them yet. Know one that belongs here? Add it to <code>data/datasets.json</code>.
      </p>
      <div class="rec-options resource-filter" role="group" aria-label="Filter datasets by type">
        ${DATASET_CATEGORIES.filter(([c]) => c === "all" || state.datasets.some((d) => d.category === c)).map(([c, label]) => {
          const n = c === "all" ? state.datasets.length : state.datasets.filter((d) => d.category === c).length;
          return `<button type="button" class="rec-pill${state.datasetCategory === c ? " active" : ""}" aria-pressed="${state.datasetCategory === c}" data-cat="${c}">${escapeHtml(label)} (${n})</button>`;
        }).join("")}
      </div>
      <div class="dataset-grid">${cards}</div>
    </div>`;

  root.querySelectorAll(".resource-filter .rec-pill").forEach((b) => b.addEventListener("click", () => {
    state.datasetCategory = b.dataset.cat;
    buildDatasetsTab();
  }));
  root.querySelectorAll(".toolbox-method-chip").forEach((chip) => chip.addEventListener("click", () => {
    const m = state.data.find((d) => d.id === chip.dataset.id);
    if (m) { switchTab("explore"); openDrawer(m); }
  }));
}

/* ---------------- Guide tab ---------------- */
// data/guide.json: how to check that harmonization worked, EEG/MEG notes and
// a glossary. Steps link to methods, resources and datasets by id; unknown
// ids are skipped so the guide never shows broken links.

// Shared helpers for content that links to methods, resources and datasets by id
// (Guide steps, EEG/MEG notes). Unknown ids are skipped.
function makeContentLinker() {
  const byId = new Map(state.data.map((d) => [d.id, d]));
  const resById = new Map(state.resources.map((r) => [r.id, r]));
  const dsById = new Map(state.datasets.map((d) => [d.id, d]));
  const methodChips = (ids) => (ids || []).map((id) => byId.get(id)).filter(Boolean)
    .map((m) => `<button type="button" class="toolbox-method-chip" data-id="${escapeHtml(m.id)}" style="--box-color:${FAMILY_COLOR.get(m.category) || "#888"}">${escapeHtml(m.name)}</button>`).join("");
  const resLinks = (ids) => (ids || []).map((id) => resById.get(id)).filter(Boolean)
    .map((r) => `<button type="button" class="inline-link guide-res-link" data-res="${escapeHtml(r.id)}">${escapeHtml(resourceShortCite(r))}</button>`).join(", ");
  const dsLinks = (ids) => (ids || []).map((id) => dsById.get(id)).filter(Boolean)
    .map((d) => `<button type="button" class="inline-link guide-ds-link" data-cat="${escapeHtml(d.category)}">${escapeHtml(d.name)}</button>`).join(", ");
  const links = (o) => {
    const parts = [];
    const mc = methodChips(o.methods);
    if (mc) parts.push(`<div class="guide-links-row"><span class="guide-links-label">Methods</span><div class="toolbox-methods">${mc}</div></div>`);
    const rl = resLinks(o.resources);
    if (rl) parts.push(`<div class="guide-links-row"><span class="guide-links-label">Read</span><span>${rl}</span></div>`);
    if (o.datasets_category) {
      const n = state.datasets.filter((d) => d.category === o.datasets_category).length;
      if (n) parts.push(`<div class="guide-links-row"><span class="guide-links-label">Data</span><button type="button" class="inline-link guide-ds-link" data-cat="${escapeHtml(o.datasets_category)}">${n} ${escapeHtml((DATASET_CATEGORY_LABEL[o.datasets_category] || o.datasets_category).toLowerCase())} datasets</button></div>`);
    }
    const dl = dsLinks(o.datasets);
    if (dl) parts.push(`<div class="guide-links-row"><span class="guide-links-label">Data</span><span>${dl}</span></div>`);
    return parts.join("");
  };
  const bind = (root) => {
    root.querySelectorAll(".toolbox-method-chip").forEach((chip) => chip.addEventListener("click", () => {
      const m = byId.get(chip.dataset.id);
      if (m) { switchTab("explore"); openDrawer(m); }
    }));
    root.querySelectorAll(".guide-res-link").forEach((b) => b.addEventListener("click", () => showResource(b.dataset.res)));
    root.querySelectorAll(".guide-ds-link").forEach((b) => b.addEventListener("click", () => {
      state.datasetCategory = b.dataset.cat || "all";
      buildDatasetsTab();
      switchTab("datasets");
    }));
  };
  return { links, bind, byId };
}

/* "Did harmonization work?" tab (id: guide) — evaluation checklist from data/guide.json */
function buildGuideTab() {
  const root = document.getElementById("guide-root");
  const g = state.guide;
  if (!g || !g.evaluation) {
    root.innerHTML = `<div class="loading-placeholder">Guide not available.</div>`;
    return;
  }
  const L = makeContentLinker();
  const ev = g.evaluation;
  const steps = ev.steps.map((s, i) => `
    <li class="guide-step" id="guide-${escapeHtml(s.id)}">
      <h3><span class="guide-step-n">${i + 1}</span>${escapeHtml(s.title)}</h3>
      <ul class="guide-do">${(s.do || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      ${s.pitfall ? `<p class="guide-pitfall"><strong>Watch out:</strong> ${escapeHtml(s.pitfall)}</p>` : ""}
      ${L.links(s)}
    </li>`).join("");

  root.innerHTML = `
    <div class="toolboxes-wrap guide-wrap">
      <nav class="guide-toc" aria-label="Checklist steps">
        <a href="#guide-evaluation" data-jump="guide-evaluation">${escapeHtml(ev.title || "Evaluation")}</a>
        ${ev.steps.map((st, i) => `<a href="#guide-${escapeHtml(st.id)}" data-jump="guide-${escapeHtml(st.id)}" class="guide-toc-sub">${i + 1}. ${escapeHtml(st.title)}</a>`).join("")}
        <a href="#glossary" data-tab-link="glossary">Glossary →</a>
      </nav>
      <section class="guide-section" id="guide-evaluation">
        <h2>${escapeHtml(ev.title || "")}</h2>
        <p class="toolboxes-intro">${escapeHtml(ev.intro || "")}
          Unfamiliar terms are explained in the <button type="button" class="inline-link guide-tab-link" data-tab-link="glossary">Glossary</button>;
          best-practice papers are in <button type="button" class="inline-link guide-tab-link" data-tab-link="resources" data-res-filter="best-practice">Resources → Best practice</button>.</p>
        <ol class="guide-steps">${steps}</ol>
      </section>
    </div>`;

  root.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const el = document.getElementById(a.dataset.jump);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  bindTabLinks(root);
  L.bind(root);
}

// Elements with data-tab-link switch tab (optionally pre-selecting a Resources filter).
function bindTabLinks(root) {
  root.querySelectorAll("[data-tab-link]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.resFilter) { state.resourceFilter = a.dataset.resFilter; buildResourcesTab(); }
    switchTab(a.dataset.tabLink);
  }));
}

/* Glossary tab — terms from data/guide.json `glossary` */
function buildGlossaryTab() {
  const root = document.getElementById("glossary-root");
  const gloss = [...((state.guide && state.guide.glossary) || [])].sort((a, b) => a.term.localeCompare(b.term));
  if (!gloss.length) {
    root.innerHTML = `<div class="loading-placeholder">Glossary not available.</div>`;
    return;
  }
  const letterOf = (t) => t.term.replace(/^[^A-Za-z]+/, "").charAt(0).toUpperCase() || "#";
  const letters = [...new Set(gloss.map(letterOf))];
  const groups = letters.map((L) => `
      <section class="gloss-group" id="gloss-${L}" data-letter="${L}">
        <h2 class="gloss-letter">${L}</h2>
        <dl class="guide-glossary">${gloss.filter((t) => letterOf(t) === L).map((t) => `
          <div class="guide-term" id="term-${escapeHtml(t.term.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}" data-q="${escapeHtml((t.term + " " + t.def).toLowerCase())}">
            <dt>${escapeHtml(t.term)}</dt><dd>${escapeHtml(t.def)}</dd>
          </div>`).join("")}</dl>
      </section>`).join("");
  root.innerHTML = `
    <div class="toolboxes-wrap glossary-wrap">
      <p class="toolboxes-intro">The terms used across the site, in plain language. ${gloss.length} entries —
        missing one? Add it to the <code>glossary</code> list in <code>data/guide.json</code>.</p>
      <div class="gloss-bar">
        <input type="search" id="gloss-search" class="guide-gloss-search" placeholder="Filter terms…" aria-label="Filter glossary terms">
        <nav class="gloss-index" aria-label="Jump to letter">${letters.map((L) => `<a href="#gloss-${L}" data-letter="${L}">${L}</a>`).join("")}</nav>
      </div>
      <div class="gloss-groups">${groups}</div>
      <p class="gloss-empty" hidden>No term matches.</p>
    </div>`;
  root.querySelectorAll(".gloss-index a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const el = document.getElementById(`gloss-${a.dataset.letter}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  const search = root.querySelector("#gloss-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll(".gloss-group").forEach((grp) => {
      let any = false;
      grp.querySelectorAll(".guide-term").forEach((t) => { const ok = !q || t.dataset.q.includes(q); t.hidden = !ok; if (ok) { any = true; shown++; } });
      grp.hidden = !any;
    });
    root.querySelector(".gloss-empty").hidden = shown > 0;
  });
}

function buildAddModelTab() {
  const root = document.getElementById("add-model-root");
  const methodOptions = [...state.data]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `<option value="${escapeHtml(m.name)}"></option>`).join("");
  root.innerHTML = `
    <div class="addmodel-layout">
    <div class="addmodel-wrap">
      <p class="addmodel-intro">
        Know a harmonization method that's missing? Only the name, paper link and source
        code link are required — everything else helps but isn't a blocker; leave anything
        you're unsure about blank. This is a static site with no backend, so nothing is
        written directly: the form builds a small JSON file that you upload to
        <code>data/submissions/</code> on GitHub, which opens a pull request (GitHub forks
        the repo for you if you don't have write access). Once a maintainer merges it, an
        Action folds it into the database, validates it, and fetches its GitHub stats.
      </p>

      <div class="addmodel-section">
        <h3>1 · Required</h3>
        <label class="addmodel-field">
          <span>Method name*</span>
          <input type="text" id="am-name" placeholder="e.g. My Harmonization Method" maxlength="120">
        </label>
        <label class="addmodel-field">
          <span>Paper link* <em class="addmodel-hint">DOI link preferred — https://doi.org/10.…, or an arXiv/bioRxiv URL</em></span>
          <input type="url" id="am-paper" placeholder="https://doi.org/10.xxxx/…">
        </label>
        <label class="addmodel-field">
          <span>Source code link* <em class="addmodel-hint">GitHub, GitLab, or a project page</em></span>
          <input type="url" id="am-code" placeholder="https://github.com/owner/repo">
        </label>
        <div id="am-fetch-status" class="addmodel-fetch-status" aria-live="polite"></div>
        <div id="am-dup-status" class="addmodel-dup-status" aria-live="polite"></div>
      </div>

      <div class="addmodel-section">
        <h3>2 · Paper details <span class="addmodel-section-note">(optional — the citation job fills gaps later)</span></h3>
        <label class="addmodel-field">
          <span>Paper title</span>
          <input type="text" id="am-title" placeholder="Full title as published">
        </label>
        <div class="addmodel-row">
          <label class="addmodel-field">
            <span>Year <em class="addmodel-hint">print/issue year</em></span>
            <input type="number" id="am-year" min="1950" max="2100" placeholder="2025">
          </label>
          <label class="addmodel-field">
            <span>Publication type</span>
            <select id="am-pubtype"></select>
          </label>
        </div>
        <label class="addmodel-field">
          <span>Venue</span>
          <input type="text" id="am-venue" placeholder="e.g. NeuroImage, MICCAI 2025 (LNCS)">
        </label>
        <label class="addmodel-field">
          <span>Authors <em class="addmodel-hint">separate with semicolons</em></span>
          <input type="text" id="am-authors" placeholder="Ada Lovelace; Alan Turing">
        </label>
      </div>

      <div class="addmodel-section">
        <h3>3 · What kind of entry is it?</h3>
        <div class="addmodel-field">
          <span>Entry type</span>
          <div class="rec-options" id="am-entrytype"></div>
        </div>
        <label class="addmodel-field addmodel-field-hidden" id="am-implements-wrap">
          <span>Implements which method in the database?</span>
          <select id="am-implements"></select>
        </label>
        <div class="addmodel-field">
          <span>Builds on / extends <em class="addmodel-hint">methods already in the database — draws the Lineage view</em></span>
          <div class="addmodel-inline">
            <input type="text" id="am-extends-input" list="am-method-list" placeholder="Start typing a method name…">
            <button type="button" id="am-extends-add" class="addmodel-small-btn">Add</button>
          </div>
          <datalist id="am-method-list">${methodOptions}</datalist>
          <div class="chip-row" id="am-extends-chips"></div>
        </div>
        <div class="addmodel-row">
          <label class="addmodel-field">
            <span>Family</span>
            <select id="am-category"></select>
          </label>
          <label class="addmodel-field">
            <span>Method type</span>
            <select id="am-methodtype">
              <option value="statistical">Statistical</option>
              <option value="deep-learning">Deep learning</option>
              <option value="machine-learning">Machine learning</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <div class="addmodel-field">
          <span>Also fits these families <em class="addmodel-hint">optional — families overlap (e.g. an optimal-transport method that is also domain adaptation)</em></span>
          <div class="rec-options" id="am-secondary"></div>
        </div>
        <label class="addmodel-field">
          <span>Does it explicitly preserve biological variability? <em class="addmodel-hint">e.g. biological covariates (age, sex, diagnosis) are modelled so they are not removed with the site effect</em></span>
          <select id="am-biology">
            <option value="">Not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No (confound removal)</option>
          </select>
        </label>
        <div class="addmodel-field">
          <span>Harmonization level</span>
          <div class="rec-options" id="am-level"></div>
        </div>
        <label class="addmodel-field">
          <span>Programming language(s) <em class="addmodel-hint">comma-separated</em></span>
          <input type="text" id="am-language" placeholder="Python, R, MATLAB…">
        </label>
        <label class="addmodel-field">
          <span>ID <em class="addmodel-hint">URL slug — generated from the name, edit if it clashes</em></span>
          <input type="text" id="am-id" placeholder="my-harmonization-method" maxlength="60">
        </label>
      </div>

      <div class="addmodel-section">
        <h3>4 · Modalities &amp; evidence <span class="addmodel-section-note">(powers the "Tested on" filter)</span></h3>
        <div class="addmodel-field">
          <span>Designed for <em class="addmodel-hint">what the original paper proposed it for</em></span>
          <div class="rec-options" id="am-proposed"></div>
        </div>
        <div class="addmodel-field">
          <span>Also tested on <em class="addmodel-hint">"designed for" and evidence modalities are included automatically</em></span>
          <div class="rec-options" id="am-tested"></div>
        </div>
        <div class="addmodel-field">
          <span>Evidence papers <em class="addmodel-hint">one row per paper that applied it to a modality (the original paper counts too)</em></span>
          <div id="am-evidence"></div>
          <button type="button" id="am-evidence-add" class="addmodel-small-btn">+ Add evidence paper</button>
        </div>
      </div>

      <div class="addmodel-section" id="am-dl-section">
        <h3>5 · Deep learning specifics</h3>
        <div class="addmodel-row">
          <label class="addmodel-field">
            <span>Architecture backbone</span>
            <select id="am-architecture"></select>
          </label>
          <label class="addmodel-field">
            <span>Framework</span>
            <input type="text" id="am-framework" placeholder="PyTorch, TensorFlow…">
          </label>
        </div>
        <label class="addmodel-field addmodel-field-hidden" id="am-architecture-other-wrap">
          <span>Architecture (other)</span>
          <input type="text" id="am-architecture-other" placeholder="describe it">
        </label>
        <div class="addmodel-field"><span>Needs a GPU?</span><div class="rec-options" id="am-needsgpu"></div></div>
        <div class="addmodel-field"><span>Pretrained weights available?</span><div class="rec-options" id="am-weights"></div></div>
        <label class="addmodel-field addmodel-field-hidden" id="am-weightsurl-wrap">
          <span>Weights link</span>
          <input type="url" id="am-weightsurl" placeholder="https://…">
        </label>
      </div>

      <div class="addmodel-section">
        <h3>6 · Data &amp; study fit <span class="addmodel-section-note">(used by the "Which method?" tab — leave unsure ones blank)</span></h3>
        <div class="addmodel-field"><span>Designed for longitudinal data (repeated scans per subject)?</span><div class="rec-options" id="am-longitudinal"></div></div>
        <div class="addmodel-field"><span>Requires paired / traveling-subject data?</span><div class="rec-options" id="am-paired"></div></div>
        <div class="addmodel-field"><span>Requires a site/scanner label for every sample?</span><div class="rec-options" id="am-sitereq"></div></div>
        <div class="addmodel-field"><span>Can harmonize data from a new, unseen site without refitting?</span><div class="rec-options" id="am-newsite"></div></div>
        <div class="addmodel-field"><span>Works with small per-site samples (≲ 30)?</span><div class="rec-options" id="am-lown"></div></div>
        <div class="addmodel-field" id="am-linear-wrap"><span>Assumes biological effects are linear?</span><div class="rec-options" id="am-linear"></div></div>
        <div class="addmodel-field"><span>Safe ahead of an ML pipeline (fit on train, apply to test — no leakage)?</span><div class="rec-options" id="am-mlok"></div></div>
      </div>

      <div class="addmodel-section">
        <h3>7 · Extra</h3>
        <label class="addmodel-field">
          <span>Validation data</span>
          <input type="text" id="am-data" placeholder="e.g. ADNI, ABCD, UK Biobank — or Agnostic">
        </label>
        <label class="addmodel-field">
          <span>Tags <em class="addmodel-hint">comma-separated</em></span>
          <input type="text" id="am-tags" placeholder="empirical-bayes, disentanglement…">
        </label>
        <div class="addmodel-field addmodel-field-hidden" id="am-toolboxes-wrap">
          <span>Also available in these toolboxes</span>
          <div class="rec-options" id="am-toolboxes"></div>
        </div>
        <label class="addmodel-field">
          <span>Other implementations <em class="addmodel-hint">packages not listed above, comma-separated</em></span>
          <input type="text" id="am-alsoin" placeholder="e.g. neuroHarmonize">
        </label>
        <label class="addmodel-field">
          <span>Note for the maintainers <em class="addmodel-hint">not published — anything worth knowing when reviewing</em></span>
          <textarea id="am-notes" rows="3" maxlength="1000"></textarea>
        </label>
      </div>

      <div class="addmodel-submit-row">
        <button type="button" id="am-generate">Check &amp; generate submission</button>
      </div>
      <div id="am-validation-msg" class="addmodel-validation-msg" aria-live="polite"></div>

      <div id="am-output" class="addmodel-output hidden">
        <h3>Submit in two steps</h3>
        <ol class="addmodel-steps">
          <li>
            <button type="button" id="am-download" class="addmodel-primary-btn">⬇ Download <span id="am-filename"></span></button>
          </li>
          <li>
            <button type="button" id="am-upload" class="addmodel-primary-btn">↗ Open GitHub upload page</button>
            <p class="addmodel-output-note">
              Drag the downloaded file onto the page, then choose
              <em>"Create a new branch for this commit and start a pull request"</em> and click
              <em>Propose changes</em>. Without write access GitHub forks the repo and opens the
              pull request for you. You need to be signed in to GitHub.
            </p>
          </li>
        </ol>
        <details class="addmodel-alt">
          <summary>Can't upload files? Paste instead</summary>
          <p class="addmodel-output-note">
            Copy the JSON, open GitHub's new-file page (the file name is pre-filled), paste it into
            the editor and propose the change.
          </p>
          <div class="addmodel-output-actions">
            <button type="button" id="am-copy-json">Copy JSON</button>
            <button type="button" id="am-newfile">↗ Open new-file page</button>
            <span id="am-copy-status" class="addmodel-copy-status"></span>
          </div>
        </details>
        <h3 class="addmodel-preview-h">Preview</h3>
        <pre id="am-json-preview" class="addmodel-json"></pre>
      </div>
    </div>
    <aside class="addmodel-aside" aria-label="Form outline">
      <h4>Required</h4>
      <ul id="am-req-list"></ul>
      <h4>Sections</h4>
      <ol id="am-toc"></ol>
      <button type="button" id="am-generate-aside">Check &amp; generate submission</button>
    </aside>
    </div>
  `;

  populateSelect("am-category", FAMILY_ORDER.map(([id, label]) => [id, label]), "combat-family");
  populateSelect("am-architecture", ARCHITECTURE_OPTIONS.map((a) => [a, a]), "");
  populateSelect("am-pubtype", PUBLICATION_TYPE_OPTIONS, "");
  populateSelect("am-implements", [...state.data].sort((a, b) => a.name.localeCompare(b.name)).map((m) => [m.id, m.name]), "");

  const S = addModelState;
  makeToggleGroup("am-entrytype", ENTRY_TYPE_OPTIONS, S, "entryType", () => {
    if (!S.entryType) S.entryType = "method";
    document.getElementById("am-implements-wrap").classList.toggle("addmodel-field-hidden", S.entryType !== "implementation");
  }, { required: true, initial: S.entryType });
  makeToggleGroup("am-level", [["feature-level", "Feature-level"], ["image-level", "Image-level"], ["acquisition-level", "Acquisition-level"]], S, "level", () => {
    document.getElementById("am-linear-wrap").classList.toggle("addmodel-field-hidden", S.level !== "feature-level");
  }, { required: true, initial: S.level });
  const yn = [["yes", "Yes"], ["no", "No"]];
  makeToggleGroup("am-needsgpu", yn, S, "needsGpu");
  makeToggleGroup("am-weights", yn, S, "hasPretrainedWeights", () => {
    document.getElementById("am-weightsurl-wrap").classList.toggle("addmodel-field-hidden", S.hasPretrainedWeights !== "yes");
  });
  makeToggleGroup("am-longitudinal", yn, S, "longitudinal");
  makeToggleGroup("am-paired", yn, S, "requiresPairedData");
  makeToggleGroup("am-sitereq", yn, S, "requiresSiteId");
  makeToggleGroup("am-newsite", yn, S, "generalizesToNewSite");
  makeToggleGroup("am-lown", yn, S, "lowNFriendly");
  makeToggleGroup("am-linear", [["yes", "Yes"], ["no", "No"], ["na", "N/A"]], S, "requiresLinearSignal");
  makeToggleGroup("am-mlok", yn, S, "mlCompatible");

  makeChipSet("am-secondary", FAMILY_ORDER.map(([id]) => [id, FAMILY_SHORT[id] || id]), S.secondary, null,
    () => new Set());
  const modalityOpts = MODALITY_CODES.map((c) => [c, MODALITY_FACET_LABEL[c] || c]);
  makeChipSet("am-proposed", modalityOpts, S.proposed, () => syncChipSet("am-tested"));
  makeChipSet("am-tested", modalityOpts, S.tested, null, () => impliedTested());

  if (state.toolboxes.length) {
    document.getElementById("am-toolboxes-wrap").classList.remove("addmodel-field-hidden");
    makeChipSet("am-toolboxes", state.toolboxes.map((t) => [t.id, t.name]), S.toolboxes);
  }

  renderExtendsChips();
  renderEvidenceRows();

  const addExtends = () => {
    const input = document.getElementById("am-extends-input");
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    const hit = state.data.find((m) => m.name.toLowerCase() === q || m.id === q);
    if (!hit) {
      document.getElementById("am-validation-msg").textContent = `"${input.value.trim()}" isn't in the database — pick a name from the suggestions (add the parent method first if it's missing).`;
      return;
    }
    document.getElementById("am-validation-msg").textContent = "";
    S.extends.add(hit.id);
    input.value = "";
    renderExtendsChips();
  };
  document.getElementById("am-extends-add").addEventListener("click", addExtends);
  document.getElementById("am-extends-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addExtends(); }
  });
  document.getElementById("am-evidence-add").addEventListener("click", () => {
    S.evidence.push({ modality: [...S.proposed][0] || "", ref: "", title: "", year: "" });
    renderEvidenceRows();
  });

  document.getElementById("am-architecture").addEventListener("change", (e) => {
    document.getElementById("am-architecture-other-wrap").classList.toggle("addmodel-field-hidden", e.target.value !== "Other");
  });
  const methodTypeSel = document.getElementById("am-methodtype");
  const syncMethodType = () => document.getElementById("am-dl-section").classList.toggle("addmodel-field-hidden", methodTypeSel.value !== "deep-learning");
  methodTypeSel.addEventListener("change", syncMethodType);
  document.getElementById("am-category").addEventListener("change", (e) => {
    if (e.target.value === "deep-learning" && methodTypeSel.value === "statistical") { methodTypeSel.value = "deep-learning"; syncMethodType(); }
  });
  syncMethodType();

  const nameInput = document.getElementById("am-name");
  const idInput = document.getElementById("am-id");
  nameInput.addEventListener("input", () => { if (!S.idTouched) idInput.value = slugify(nameInput.value); });
  idInput.addEventListener("input", () => { S.idTouched = idInput.value.trim() !== ""; });
  nameInput.addEventListener("change", updateDuplicateStatus);
  document.getElementById("am-paper").addEventListener("change", updateDuplicateStatus);
  document.getElementById("am-code").addEventListener("change", (e) => { fetchRepoPreview(e.target.value.trim()); updateDuplicateStatus(); });

  document.getElementById("am-generate").addEventListener("click", generateSubmission);
  // Desktop outline: section links + live required-field checklist.
  document.getElementById("am-generate-aside").addEventListener("click", generateSubmission);
  const toc = document.getElementById("am-toc");
  root.querySelectorAll(".addmodel-section > h3").forEach((h, i) => {
    h.id = h.id || `am-sec-${i + 1}`;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.childNodes[0].textContent.replace(/^\s*\d+\s*·\s*/, "").trim();
    a.addEventListener("click", (e) => { e.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); });
    li.appendChild(a);
    toc.appendChild(li);
  });
  const REQ = [["am-name", "Method name"], ["am-paper", "Paper link"], ["am-code", "Source code link"]];
  const updateReq = () => {
    document.getElementById("am-req-list").innerHTML = REQ.map(([id, label]) => {
      const ok = !!document.getElementById(id).value.trim();
      return `<li class="${ok ? "req-ok" : "req-miss"}">${ok ? "✓" : "○"} ${escapeHtml(label)}</li>`;
    }).join("");
  };
  REQ.forEach(([id]) => document.getElementById(id).addEventListener("input", updateReq));
  updateReq();
  document.getElementById("am-download").addEventListener("click", () => {
    if (S.last) downloadJsonFile(S.last.filename, S.last.json);
  });
  document.getElementById("am-upload").addEventListener("click", () => openGithubUpload("data/submissions"));
  document.getElementById("am-newfile").addEventListener("click", () => {
    if (S.last) window.open(`https://github.com/${SUBMIT_REPO}/new/${SUBMIT_BRANCH}?filename=${encodeURIComponent(`data/submissions/${S.last.filename}`)}`, "_blank", "noopener");
  });
  document.getElementById("am-copy-json").addEventListener("click", async () => {
    const status = document.getElementById("am-copy-status");
    try {
      await navigator.clipboard.writeText(document.getElementById("am-json-preview").textContent);
      status.textContent = "Copied ✓";
    } catch (e) {
      status.textContent = "Couldn't copy — select the preview text manually.";
    }
  });
}

function populateSelect(id, options, defaultValue) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">— select —</option>` + options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");
  if (defaultValue) sel.value = defaultValue;
}

// Single-choice pill group. With {required:true} a click on the active pill keeps it selected.
function makeToggleGroup(containerId, options, targetState, key, onChange, { required = false, initial = null } = {}) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  const paint = () => wrap.querySelectorAll(".rec-pill").forEach((b) => {
    const on = targetState[key] === b.dataset.value;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill";
    btn.dataset.value = value;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      targetState[key] = targetState[key] === value && !required ? null : value;
      paint();
      if (onChange) onChange();
    });
    wrap.appendChild(btn);
  });
  if (initial !== null) targetState[key] = initial;
  paint();
  if (onChange) onChange();
}

// Multi-choice pill group bound to a Set. `locked()` returns values shown as on and not clickable.
function makeChipSet(containerId, options, set, onChange, locked) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  wrap._locked = locked || (() => new Set());
  wrap._set = set;
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill";
    btn.dataset.value = value;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (wrap._locked().has(value)) return;
      if (set.has(value)) set.delete(value); else set.add(value);
      syncChipSet(containerId);
      if (onChange) onChange(value);
    });
    wrap.appendChild(btn);
  });
  syncChipSet(containerId);
}

function syncChipSet(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const locked = wrap._locked();
  wrap.querySelectorAll(".rec-pill").forEach((b) => {
    const isLocked = locked.has(b.dataset.value);
    const on = isLocked || wrap._set.has(b.dataset.value);
    b.classList.toggle("active", on);
    b.classList.toggle("locked", isLocked);
    b.setAttribute("aria-pressed", String(on));
    b.title = isLocked ? "Included automatically (designed for, or has an evidence paper)" : "";
  });
}

// Modalities implied by "designed for" + evidence rows: always part of modalities_tested.
function impliedTested() {
  const s = new Set(addModelState.proposed);
  addModelState.evidence.forEach((ev) => { if (ev.modality) s.add(ev.modality); });
  return s;
}

function renderExtendsChips() {
  const wrap = document.getElementById("am-extends-chips");
  wrap.innerHTML = "";
  addModelState.extends.forEach((id) => {
    const m = state.data.find((d) => d.id === id);
    const chip = document.createElement("span");
    chip.className = "chip addmodel-removable";
    chip.textContent = m ? m.name : id;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "addmodel-chip-x";
    x.setAttribute("aria-label", `Remove ${m ? m.name : id}`);
    x.textContent = "×";
    x.addEventListener("click", () => { addModelState.extends.delete(id); renderExtendsChips(); });
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}

function renderEvidenceRows() {
  const wrap = document.getElementById("am-evidence");
  wrap.innerHTML = "";
  if (!addModelState.evidence.length) {
    wrap.innerHTML = `<p class="addmodel-empty">No evidence papers yet.</p>`;
  }
  addModelState.evidence.forEach((ev, i) => {
    const row = document.createElement("div");
    row.className = "addmodel-evidence-row";
    row.innerHTML = `
      <select data-k="modality" aria-label="Modality">
        <option value="">modality…</option>
        ${MODALITY_CODES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(MODALITY_FACET_LABEL[c] || c)}</option>`).join("")}
      </select>
      <input type="text" data-k="ref" placeholder="DOI (10.…) or URL" aria-label="DOI or URL">
      <input type="text" data-k="title" placeholder="Paper title" aria-label="Paper title">
      <input type="number" data-k="year" placeholder="Year" min="1950" max="2100" aria-label="Year">
      <button type="button" class="addmodel-chip-x" aria-label="Remove evidence paper">×</button>`;
    row.querySelectorAll("[data-k]").forEach((el) => {
      el.value = ev[el.dataset.k] || "";
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
        ev[el.dataset.k] = el.value;
        if (el.dataset.k === "modality") syncChipSet("am-tested");
      });
    });
    row.querySelector("button").addEventListener("click", () => {
      addModelState.evidence.splice(i, 1);
      renderEvidenceRows();
      syncChipSet("am-tested");
    });
    wrap.appendChild(row);
  });
}

function normalizeGithubSlug(url) {
  const m = String(url || "").trim().match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[#?].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function normalizeDoi(s) {
  if (!s) return null;
  let v = String(s).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  try { v = decodeURIComponent(v); } catch (e) { /* keep as-is */ }
  return /^10\.\d{4,9}\/\S+$/.test(v) ? v : null;
}

function arxivFromUrl(url) {
  const m = String(url || "").match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i);
  return m ? m[1] : null;
}

function normName(s) {
  return String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "");
}

// Possible duplicates already in the database (same repo, same DOI, or same normalized name).
function findDuplicates({ name, paperUrl, codeUrl }) {
  const slug = normalizeGithubSlug(codeUrl);
  const doi = normalizeDoi(paperUrl) || doiFromUrl(paperUrl);
  const n = normName(name);
  const hits = [];
  state.data.forEach((m) => {
    const why = [];
    if (slug && m.github && m.github.toLowerCase() === slug.toLowerCase()) why.push("same repository");
    if (doi && m.doi && m.doi.toLowerCase() === doi.toLowerCase()) why.push("same paper DOI");
    if (n && n.length > 2 && normName(m.name) === n) why.push("same name");
    if (why.length) hits.push({ m, why });
  });
  return hits;
}

function updateDuplicateStatus() {
  const box = document.getElementById("am-dup-status");
  const hits = findDuplicates({
    name: document.getElementById("am-name").value,
    paperUrl: document.getElementById("am-paper").value,
    codeUrl: document.getElementById("am-code").value,
  });
  if (!hits.length) { box.innerHTML = ""; return; }
  box.innerHTML = `⚠ Possibly already listed: ` + hits.map(({ m, why }) =>
    `<button type="button" class="inline-link addmodel-dup-link" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</button> (${escapeHtml(why.join(", "))})`
  ).join("; ") + `. Shared repositories are normal for toolboxes — otherwise consider reporting an error on that page instead.`;
  box.querySelectorAll(".addmodel-dup-link").forEach((b) => b.addEventListener("click", () => {
    const m = state.data.find((d) => d.id === b.dataset.id);
    if (m) { switchTab("explore"); openDrawer(m); }
  }));
}

async function fetchRepoPreview(url) {
  const status = document.getElementById("am-fetch-status");
  const repo = normalizeGithubSlug(url);
  if (!repo) {
    status.textContent = /gitlab\./.test(url)
      ? "GitLab link noted — auto-fetch only works for github.com links; fill in language etc. manually."
      : "";
    addModelState.fetchedRepo = null;
    return;
  }
  status.textContent = `Fetching ${repo}…`;
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!resp.ok) {
      status.textContent = resp.status === 403 ? "Rate limited by GitHub — fill in details manually." : `Repo not found (HTTP ${resp.status}) — check the link.`;
      return;
    }
    const data = await resp.json();
    addModelState.fetchedRepo = repo;
    status.textContent = `✓ Found: ${Number(data.stargazers_count) || 0} ★, ${data.language || "language unknown"}, ${data.license ? data.license.spdx_id : "no license"}${data.archived ? " (archived)" : ""}`;
    if (data.language && !document.getElementById("am-language").value) {
      document.getElementById("am-language").value = data.language;
    }
  } catch (e) {
    status.textContent = "Couldn't reach GitHub from here — fill in details manually.";
  }
}

function slugify(name) {
  return String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function toBool(v) {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null; // covers null and "na"
}

const isHttpUrl = (u) => /^https?:\/\/[^\s"'<>]+$/.test(u);
const splitList = (s, sep = ",") => String(s || "").split(sep).map((x) => x.trim()).filter(Boolean);

function generateSubmission() {
  const S = addModelState;
  const val = (id) => document.getElementById(id).value.trim();
  const msg = document.getElementById("am-validation-msg");
  const errors = [], warnings = [];

  const name = val("am-name");
  const paperUrl = val("am-paper");
  const codeUrl = val("am-code");
  const id = val("am-id") || slugify(name);

  if (!name) errors.push("Method name is required.");
  if (!paperUrl) errors.push("Paper link is required.");
  else if (!isHttpUrl(paperUrl)) errors.push("Paper link must start with http:// or https:// (no spaces or quotes).");
  if (!codeUrl) errors.push("Source code link is required.");
  else if (!isHttpUrl(codeUrl)) errors.push("Source code link must start with http:// or https://.");
  if (!name && !id) { /* covered by the name error */ }
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push("ID must use lowercase letters, digits and hyphens.");
  else if (state.data.some((m) => m.id === id)) errors.push(`ID "${id}" is already used by another entry — edit the ID field.`);

  const yearVal = val("am-year");
  const year = yearVal ? Number(yearVal) : null;
  const maxYear = new Date().getFullYear() + 1;
  if (year !== null && !(Number.isInteger(year) && year >= 1950 && year <= maxYear)) errors.push(`Year must be between 1950 and ${maxYear}.`);

  const weightsUrl = toBool(S.hasPretrainedWeights) ? val("am-weightsurl") : "";
  if (weightsUrl && !isHttpUrl(weightsUrl)) errors.push("Weights link must be an http(s) URL.");

  const implementsId = S.entryType === "implementation" ? (val("am-implements") || null) : null;
  if (S.entryType === "implementation" && !implementsId) warnings.push("Pick which method this implements, so it's grouped under its parent.");

  const evidence = [];
  S.evidence.forEach((ev, i) => {
    const ref = String(ev.ref || "").trim();
    if (!ref && !ev.title) return;
    const doi = normalizeDoi(ref);
    const out = { modality: ev.modality || null, title: String(ev.title || "").trim() || null, year: ev.year ? Number(ev.year) : null };
    if (doi) out.doi = doi;
    else if (isHttpUrl(ref)) out.url = ref;
    else errors.push(`Evidence row ${i + 1}: give a DOI (10.…) or an http(s) link.`);
    if (!ev.modality) errors.push(`Evidence row ${i + 1}: pick the modality it was tested on.`);
    if (out.year !== null && !(Number.isInteger(out.year) && out.year >= 1950 && out.year <= maxYear)) errors.push(`Evidence row ${i + 1}: year looks wrong.`);
    evidence.push(out);
  });

  if (!S.proposed.size) warnings.push(`No "designed for" modality selected — choose Modality-agnostic if it isn't tied to one.`);
  const dups = findDuplicates({ name, paperUrl, codeUrl });
  if (dups.length) warnings.push(`Possible duplicate of ${dups.map(({ m }) => m.name).join(", ")} — double-check before submitting.`);
  updateDuplicateStatus();

  if (errors.length) {
    msg.innerHTML = `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
    msg.className = "addmodel-validation-msg is-error";
    document.getElementById("am-output").classList.add("hidden");
    msg.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  msg.className = "addmodel-validation-msg is-warning";
  msg.innerHTML = warnings.length ? `<ul>${warnings.map((w) => `<li>⚠ ${escapeHtml(w)}</li>`).join("")}</ul>` : "";

  const category = val("am-category") || "deep-learning";
  const level = S.level || "feature-level";
  const methodType = val("am-methodtype");
  const isDL = methodType === "deep-learning";
  let architecture = null, framework = null;
  if (isDL) {
    architecture = val("am-architecture") || null;
    if (architecture === "Other") architecture = val("am-architecture-other") || null;
    framework = val("am-framework") || null;
  }
  const github = normalizeGithubSlug(codeUrl);
  const doi = normalizeDoi(paperUrl) || doiFromUrl(paperUrl);
  const arxivId = arxivFromUrl(paperUrl);
  const isPreprintHost = /arxiv\.org|biorxiv\.org|medrxiv\.org/i.test(paperUrl);
  const authorsRaw = val("am-authors");
  const authors = splitList(authorsRaw, authorsRaw.includes(";") ? ";" : ",");
  const proposed = MODALITY_CODES.filter((c) => S.proposed.has(c));
  const testedSet = new Set([...S.tested, ...impliedTested()]);
  const tested = MODALITY_CODES.filter((c) => testedSet.has(c));
  const toolboxes = [...S.toolboxes];
  const familyLabel = (FAMILY_ORDER.find(([fid]) => fid === category) || [, category])[1];
  const needsGpu = isDL ? (toBool(S.needsGpu) ?? true) : false;

  // Key order mirrors existing entries in data/methods.json.
  const entry = {
    id,
    name,
    category,
    method_type: methodType,
    level,
    tags: splitList(val("am-tags")),
    paper_title: val("am-title") || null,
    paper_year: year,
    paper_url: paperUrl,
    github,
    language: splitList(val("am-language")),
    other_url: github ? null : codeUrl,
    abstract: null,
    citations: null,
    stars: null, forks: null, open_issues: null, license: null, topics: null,
    archived: null, repo_created_at: null, first_commit_date: null,
    last_commit: null, repo_description: null, stats_fetched_at: null,
    category_label: familyLabel,
    in_uniharmony: toolboxes.includes("uniharmony"),
    also_implemented_in: splitList(val("am-alsoin")),
    validation_data: val("am-data") || "Agnostic",
    modality: LEGACY_MODALITY[proposed[0]] || "MRI (unspecified)",
    needs_gpu: needsGpu,
    architecture_backbone: architecture,
    framework,
    has_pretrained_weights: toBool(S.hasPretrainedWeights),
    pretrained_weights_url: weightsUrl || null,
    recommend: {
      requires_site_id: toBool(S.requiresSiteId) ?? true,
      generalizes_to_new_site: toBool(S.generalizesToNewSite) ?? false,
      low_n_friendly: toBool(S.lowNFriendly) ?? false,
      requires_linear_signal: S.requiresLinearSignal === "na" ? null : toBool(S.requiresLinearSignal),
      ml_compatible: toBool(S.mlCompatible) ?? (category !== "combat-family"),
      needs_gpu: needsGpu,
      longitudinal: toBool(S.longitudinal) ?? false,
      requires_paired_data: toBool(S.requiresPairedData) ?? false,
    },
    doi: doi || null,
    arxiv_id: arxivId,
    authors,
    n_authors: authors.length || null,
    venue: val("am-venue") || (arxivId ? "arXiv" : null),
    publication_type: val("am-pubtype") || (isPreprintHost ? "preprint" : null),
    modalities_proposed: proposed,
    modalities_tested: tested,
    modalities_verified: false,
    entry_type: S.entryType || "method",
    implements: implementsId,
    extends: [...S.extends],
    evidence,
    secondary_categories: [...S.secondary].filter((c) => c !== category),
    preserves_biology: val("am-biology") === "yes" ? true : val("am-biology") === "no" ? false : null,
    _toolboxes: toolboxes,
    _notes: val("am-notes") || null,
    _submitted_via: "add-a-model form",
    _submitted_at: new Date().toISOString(),
  };

  const json = JSON.stringify(entry, null, 2) + "\n";
  S.last = { filename: `${id}.json`, json };
  document.getElementById("am-filename").textContent = `${id}.json`;
  document.getElementById("am-json-preview").textContent = json;
  document.getElementById("am-copy-status").textContent = "";
  document.getElementById("am-output").classList.remove("hidden");
  document.getElementById("am-output").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Save a JSON string as a file via a Blob URL (no network; allowed by the page CSP).
function downloadJsonFile(filename, json) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// GitHub's "Upload files" page for a folder: short URL, works for non-collaborators via fork + PR.
function openGithubUpload(folder) {
  window.open(`https://github.com/${SUBMIT_REPO}/upload/${SUBMIT_BRANCH}/${folder}`, "_blank", "noopener");
}


/* ---------------- On-demand data fetch (client-side, session-only) + PR flow ----------------
 * The scheduled Actions + scripts/fetch_github_stats.py / fetch_citations.py
 * are the source of truth and persist back to data/methods.json. The
 * "⟳ Fetch missing GitHub stats" button is a lightweight, session-only
 * supplement for browsing between refreshes: it calls the GitHub REST API
 * (CORS-enabled for unauthenticated GET) directly from the browser for
 * whichever methods are still missing stats.
 *
 * Citations are NOT fetched here — confirmed (not just suspected) that
 * Semantic Scholar's API doesn't support cross-origin browser requests the
 * way GitHub's does, so a browser-side attempt fails every time regardless
 * of how it's written. .github/workflows/refresh-citations.yml runs
 * scripts/fetch_citations.py server-side on a schedule instead, which was
 * never subject to that restriction.
 *
 * What gets fetched this session is tracked in sessionUpdates, keyed by
 * method id. "Open PR with fetched data" turns that into a small JSON file
 * under data/submissions-stats/, downloads it and opens GitHub's upload page
 * for that folder — same pattern as the "Add a model" tab. A
 * maintainer merges the PR, and scripts/merge_stats_updates.py (run by
 * .github/workflows/merge-stats-updates.yml) folds each file's fields into
 * the matching entry in methods.json for real.
 */

const sessionUpdates = {}; // { [method_id]: { field: value, ... } }

function recordSessionUpdate(id, fields) {
  sessionUpdates[id] = { ...(sessionUpdates[id] || {}), ...fields };
  document.getElementById("fetch-pr-btn").classList.toggle("hidden", Object.keys(sessionUpdates).length === 0);
}

function doiFromUrl(url) {
  if (!url) return null;
  const m = url.match(/doi\.org\/(.+)$/);
  return m ? m[1] : null;
}

function bindFetchStatsButton() {
  document.getElementById("fetch-stats-btn").addEventListener("click", fetchMissingData);
  document.getElementById("fetch-pr-btn").addEventListener("click", openStatsUpdatePR);
}

async function fetchMissingData() {
  const btn = document.getElementById("fetch-stats-btn");
  const status = document.getElementById("fetch-stats-status");

  const statsTargets = state.data.filter((d) => d.github && d.stars == null);
  const citationsMissing = state.data.filter((d) => d.citations == null && doiFromUrl(d.paper_url)).length;

  if (statsTargets.length === 0) {
    status.textContent = citationsMissing
      ? `GitHub stats are all up to date. Citations (${citationsMissing} missing) aren't fetchable from the ` +
        `browser — Semantic Scholar doesn't support cross-origin requests the way GitHub does. They're refreshed ` +
        `by a scheduled job instead (see .github/workflows/refresh-citations.yml).`
      : "Nothing missing — everything already has stats and citations.";
    return;
  }

  btn.disabled = true;
  let done = 0, statsOk = 0, statsFailed = 0;

  for (const method of statsTargets) {
    status.textContent = `GitHub stats: ${done}/${statsTargets.length}…`;
    try {
      const resp = await fetch(`https://api.github.com/repos/${method.github}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (resp.status === 403) {
        status.textContent = `Rate limited by GitHub after ${statsOk} — try again later, or use scripts/fetch_github_stats.py with a token.`;
        break;
      }
      if (!resp.ok) {
        statsFailed++;
      } else {
        const repo = await resp.json();
        const fields = {
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          open_issues: repo.open_issues_count,
          license: repo.license ? repo.license.spdx_id : null,
          topics: repo.topics || [],
          archived: repo.archived || false,
          repo_created_at: repo.created_at ? repo.created_at.split("T")[0] : null,
          last_commit: repo.pushed_at ? repo.pushed_at.split("T")[0] : null,
          repo_description: repo.description,
        };
        Object.assign(method, fields);
        recordSessionUpdate(method.id, fields);
        statsOk++;
      }
    } catch (e) {
      statsFailed++;
    }
    done++;
  }

  btn.disabled = false;
  const citationsNote = citationsMissing
    ? ` Citations (${citationsMissing} missing) aren't browser-fetchable — see .github/workflows/refresh-citations.yml.`
    : "";
  status.textContent = `Fetched ${statsOk}/${statsTargets.length} GitHub stats this session.${citationsNote} ` +
    (Object.keys(sessionUpdates).length ? `Use "Open PR with fetched data" to save it.` : "");

  render();
  if (state.activeTab === "recommend") renderRecommenderTree();
}

function openStatsUpdatePR() {
  const ids = Object.keys(sessionUpdates);
  if (ids.length === 0) return;

  // Download the update file and open GitHub's upload page for the folder — the old
  // "new file?value=<json>" URL grew past GitHub's URL length limit with many updates.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = JSON.stringify({ updates: sessionUpdates, fetched_at: new Date().toISOString() }, null, 2) + "\n";
  downloadJsonFile(`stats-${stamp}.json`, payload);
  openGithubUpload("data/submissions-stats");
  document.getElementById("fetch-stats-status").textContent =
    `Downloaded stats-${stamp}.json (${ids.length} method${ids.length === 1 ? "" : "s"}). Drag it onto the GitHub upload page that just opened and choose "start a pull request".`;
}

function bindControls() {
  document.getElementById("group-by").addEventListener("change", (e) => {
    state.groupBy = e.target.value;
    render();
  });
  document.getElementById("font-size").addEventListener("input", (e) => {
    state.fontSize = Number(e.target.value);
    document.getElementById("stage").style.setProperty("--label-size", `${state.fontSize}px`);
  });
  document.getElementById("search").addEventListener("input", debounce((e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  }, 120));
  document.getElementById("clear-search-btn").addEventListener("click", () => {
    document.getElementById("search").value = "";
    state.search = "";
    state.facets = {};
    facetsToUrl();
    render();
  });
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDrawer(); closeComparePanel(); return; }
    // Desktop shortcuts, ignored while typing or with modifier keys.
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
    if (e.key === "/") {
      e.preventDefault();
      switchTab("explore");
      const search = document.getElementById("search");
      if (search) { search.focus(); search.select(); }
    } else if (/^[1-9]$/.test(e.key) && VALID_TABS[Number(e.key) - 1]) {
      switchTab(VALID_TABS[Number(e.key) - 1]);
    }
  });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const i = VALID_TABS.indexOf(b.dataset.tab);
    if (i >= 0 && i < 9) b.title = `Shortcut: ${i + 1}`;
  });

  document.getElementById("compare-toggle").addEventListener("click", toggleCompareMode);

  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.getElementById("csv-btn").addEventListener("click", downloadTableCsv);
  const initialView = new URLSearchParams(location.search).get("view");
  if (["table", "lineage", "impact"].includes(initialView)) setView(initialView, { silent: true });
}

function setView(view, { silent = false } = {}) {
  state.view = ["table", "lineage", "impact"].includes(view) ? view : "map";
  document.querySelectorAll(".view-btn").forEach((b) => {
    const on = b.dataset.view === state.view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const isTable = state.view === "table";
  const isMap = state.view === "map";
  document.getElementById("group-by-group").classList.toggle("hidden", !isMap);
  document.getElementById("csv-group").classList.toggle("hidden", !isTable);
  document.querySelector(".legend-row").classList.toggle("hidden", isTable || state.view === "impact");
  document.querySelector(".label-size-control").classList.toggle("hidden", !isMap);
  const url = new URL(location.href);
  if (!isMap) url.searchParams.set("view", state.view); else url.searchParams.delete("view");
  history.replaceState(history.state, "", url);
  if (!silent) render();
}

function toggleCompareMode() {
  state.compareMode = !state.compareMode;
  document.querySelectorAll("#compare-toggle, #compare-toggle-rec").forEach((btn) => {
    btn.classList.toggle("active", state.compareMode);
    btn.textContent = `Compare mode: ${state.compareMode ? "on" : "off"}`;
  });
  if (!state.compareMode) {
    state.selectedIds.clear();
    updateCompareBar();
  }
  if (state.activeTab === "explore") {
    render();
  } else if (state.activeTab === "recommend") {
    renderRecommenderTree();
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab, { pushHistory = true } = {}) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tab}`);
  });
  if (pushHistory && location.hash.slice(1) !== tab) {
    history.pushState({ tab }, "", `#${tab}`);
  }
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

const VALID_TABS = ["home", "explore", "recommend", "toolboxes", "resources", "datasets", "guide", "glossary", "add"];

function initialTabFromUrl() {
  const fromHash = location.hash.slice(1);
  return VALID_TABS.includes(fromHash) ? fromHash : "home";
}

function bindCompareBar() {
  document.getElementById("compare-clear-btn").addEventListener("click", () => {
    state.selectedIds.clear();
    updateCompareBar();
    render();
  });
  document.getElementById("compare-view-btn").addEventListener("click", openComparePanel);
  document.getElementById("compare-close").addEventListener("click", closeComparePanel);
  document.getElementById("compare-scrim").addEventListener("click", closeComparePanel);
}

function updateCompareBar() {
  const bar = document.getElementById("compare-bar");
  const n = state.selectedIds.size;
  bar.classList.toggle("hidden", !state.compareMode || n === 0);
  document.getElementById("compare-count").textContent = `${n} selected`;
  document.getElementById("compare-view-btn").disabled = n < 2;
}

function visibleMethods() {
  return state.data.filter((d) => passesSearchAndLevel(d) && passesFacets(d));
}

function render() {
  const stage = document.getElementById("stage");
  stage.style.setProperty("--label-size", `${state.fontSize}px`);
  stage.innerHTML = "";

  const methods = visibleMethods();
  renderFacetPanel();
  renderActiveFilters();
  document.getElementById("empty-state").classList.toggle("hidden", methods.length > 0);
  if (methods.length === 0) return;

  if (state.view === "table") {
    stage.appendChild(renderTable(methods));
    return;
  }
  if (state.view === "lineage") {
    stage.appendChild(renderLineage(methods));
    return;
  }
  if (state.view === "impact") {
    stage.appendChild(renderImpact(methods));
    return;
  }

  if (state.groupBy === "year") {
    stage.appendChild(renderYearTimeline(methods));
  } else if (state.groupBy === "stars") {
    stage.appendChild(renderStarsTimeline(methods));
  } else if (state.groupBy === "citations") {
    stage.appendChild(renderCitationsTimeline(methods));
  } else {
    // level / category / data / uniharmony all use the flex-wrap cluster layout
    stage.appendChild(renderClusters(methods, state.groupBy));
  }
}

function makeBox(d) {
  const box = document.createElement("div");
  box.className = "method-box";
  box.tabIndex = 0;
  box.setAttribute("role", "button");
  box.style.setProperty("--box-color", FAMILY_COLOR.get(d.category) || "#888");
  box.textContent = d.name;
  if (d.stars != null) {
    const badge = document.createElement("span");
    badge.className = "star-badge";
    badge.textContent = `★${d.stars}`;
    box.appendChild(badge);
  }

  if (state.compareMode) {
    box.classList.add("selectable");
    box.classList.toggle("selected", state.selectedIds.has(d.id));
  }

  const activate = () => {
    if (state.compareMode) {
      if (state.selectedIds.has(d.id)) {
        state.selectedIds.delete(d.id);
      } else {
        state.selectedIds.add(d.id);
      }
      box.classList.toggle("selected", state.selectedIds.has(d.id));
      updateCompareBar();
    } else {
      openDrawer(d);
    }
  };

  box.addEventListener("click", activate);
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });
  return box;
}

/* ---------------- Code health score ---------------- */
// A transparent 0–100 score for a method's own GitHub repository, computed from
// fields already in methods.json. Same constants as scripts/build_pages.py.
//   Recency    40  last commit: full marks < 3 months, 0 at 3 years
//   Longevity  15  first → last commit span: full marks at 3+ years
//   License    15  OSI/SPDX license 15, unclear licence 7, none 0
//   Adoption   20  stars on a log scale, full marks at 500
//   Community  10  forks on a log scale, full marks at 100
// Archived repos are capped at 20. Methods without their own repo get no score
// (toolbox-maintained ones say so instead). Dates are measured against the
// database's last stats refresh, so the score doesn't drift between refreshes.
const HEALTH_GRADES = [[80, "A"], [60, "B"], [40, "C"], [20, "D"], [0, "E"]];
function healthReferenceTime() {
  return state.dbStatsFetchedAt ? new Date(state.dbStatsFetchedAt).getTime() : Date.now();
}
function codeHealth(d) {
  if (!d.github || typeof d.stars !== "number" || !d.last_commit) return null;
  const day = 86400000, ref = healthReferenceTime();
  const ageDays = Math.max(0, (ref - new Date(`${d.last_commit}T00:00:00Z`).getTime()) / day);
  const recency = ageDays <= 90 ? 40 : Math.max(0, 40 * (1 - (ageDays - 90) / (1095 - 90)));
  const start = d.first_commit_date || d.repo_created_at;
  const spanYears = start ? Math.max(0, (new Date(`${d.last_commit}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / (365.25 * day)) : 0;
  const longevity = 15 * Math.min(1, spanYears / 3);
  const license = !d.license ? 0 : d.license === "NOASSERTION" ? 7 : 15;
  const adoption = 20 * Math.min(1, Math.log10(d.stars + 1) / Math.log10(501));
  const community = 10 * Math.min(1, Math.log10((d.forks || 0) + 1) / Math.log10(101));
  let score = recency + longevity + license + adoption + community;
  if (d.archived) score = Math.min(score, 20);
  score = Math.round(score);
  const grade = HEALTH_GRADES.find(([min]) => score >= min)[1];
  return {
    score, grade, archived: !!d.archived,
    parts: [
      ["Recency", recency, 40, d.last_commit ? `last commit ${d.last_commit}` : ""],
      ["Longevity", longevity, 15, start ? `${spanYears.toFixed(1)} years of commits` : "unknown start"],
      ["License", license, 15, d.license ? (d.license === "NOASSERTION" ? "licence unclear" : d.license) : "no licence"],
      ["Adoption", adoption, 20, `${d.stars.toLocaleString()} stars`],
      ["Community", community, 10, `${(d.forks || 0).toLocaleString()} forks`],
    ].map(([k, v, max, note]) => ({ k, v: Math.round(v), max, note })),
  };
}
function healthBadge(h) {
  if (!h) return "";
  return `<span class="health-badge health-${h.grade}" title="Code health ${h.score}/100">${h.grade} · ${h.score}</span>`;
}
function healthBreakdownHtml(h) {
  return `<ul class="health-parts">${h.parts.map((p) => `<li><span>${escapeHtml(p.k)}</span><span class="health-bar"><span style="width:${(p.v / p.max) * 100}%"></span></span><span class="health-num">${p.v}/${p.max}</span><span class="health-note">${escapeHtml(p.note)}</span></li>`).join("")}</ul>${h.archived ? `<p class="health-archived">Archived repository: score capped at 20.</p>` : ""}`;
}

/* ---------------- Facet filters ---------------- */
// Each facet maps a method to the list of values it has for that facet.
// Selecting values: OR within a facet, AND across facets. Counts next to each
// option show how many methods you'd get if you added it (given the other facets).
const MODALITY_FACET_LABEL = {
  sMRI: "Structural MRI", dMRI: "Diffusion MRI", fMRI: "Functional MRI", connectome: "Connectomes",
  EEG: "EEG", MEG: "MEG", PET: "PET", CT: "CT", radiomics: "Radiomics", omics: "Omics",
  histopathology: "Histopathology", "general-imaging": "Medical imaging (general)",
  general: "Modality-agnostic", "MRI-acquisition": "MRI acquisition",
};
function maintenanceFacet(d) {
  if (d.last_commit) return [formatMaintenance(d.last_commit).status];
  if (isToolboxMember(d.id)) return ["toolbox"];
  return ["unknown"];
}
function publicationFacet(d) {
  if (!d.paper_title && !d.paper_url) return ["none"];
  if (d.publication_type === "preprint" || ["arXiv", "bioRxiv", "medRxiv", "Research Square"].includes(d.venue)) return ["preprint"];
  if (d.publication_type === "software") return ["software"];
  return ["peer-reviewed"];
}
const FACETS = [
  { key: "modality", label: "Tested on", values: (d) => d.modalities_tested || [],
    labelOf: (v) => MODALITY_FACET_LABEL[v] || v },
  { key: "family", label: "Family (incl. overlaps)", values: (d) => [d.category, ...(d.secondary_categories || [])],
    labelOf: (v) => FAMILY_SHORT[v] || FAMILY_LABEL.get(v) || v },
  { key: "language", label: "Language", values: (d) => (d.language && d.language.length ? d.language : ["none"]),
    labelOf: (v) => (v === "none" ? "No code listed" : v) },
  { key: "code", label: "Code", values: (d) => [hasPublicCode(d) ? "yes" : "no"],
    labelOf: (v) => (v === "yes" ? "Has public code" : "No public code"), order: ["yes", "no"] },
  { key: "maintenance", label: "Maintenance", values: maintenanceFacet,
    labelOf: (v) => ({ active: "Active (< 6 mo)", slowing: "Slowing (< 2 y)", stale: "Stale (2 y+)", toolbox: "Via a toolbox", unknown: "Unknown" })[v] || v,
    order: ["active", "slowing", "stale", "toolbox", "unknown"] },
  { key: "publication", label: "Paper", values: publicationFacet,
    labelOf: (v) => ({ "peer-reviewed": "Peer-reviewed", preprint: "Preprint", software: "Software release only", none: "No paper" })[v] || v,
    order: ["peer-reviewed", "preprint", "software", "none"] },
  { key: "health", label: "Code health", values: (d) => { const h = codeHealth(d); return [h ? h.grade : (isToolboxMember(d.id) ? "toolbox" : "none")]; },
    labelOf: (v) => ({ A: "A (80+)", B: "B (60–79)", C: "C (40–59)", D: "D (20–39)", E: "E (< 20)", toolbox: "Via a toolbox", none: "No repo data" })[v] || v,
    order: ["A", "B", "C", "D", "E", "toolbox", "none"] },
  { key: "biology", label: "Preserves biology", values: (d) => [d.preserves_biology === true ? "yes" : d.preserves_biology === false ? "no" : "unknown"],
    labelOf: (v) => ({ yes: "Yes (explicit)", no: "No explicit preservation", unknown: "Not assessed" })[v] || v,
    order: ["yes", "no", "unknown"] },
  { key: "gpu", label: "Hardware", values: (d) => [d.recommend && d.recommend.needs_gpu ? "gpu" : "cpu"],
    labelOf: (v) => (v === "gpu" ? "Needs a GPU" : "Runs on CPU"), order: ["cpu", "gpu"] },
];

function hasPublicCode(d) {
  return !!(d.github || d.other_url || isToolboxMember(d.id));
}

function passesFacets(d, skipKey = null) {
  for (const f of FACETS) {
    if (f.key === skipKey) continue;
    const sel = state.facets[f.key];
    if (!sel || sel.size === 0) continue;
    if (!f.values(d).some((v) => sel.has(v))) return false;
  }
  return true;
}

function passesSearchAndLevel(d) {
  if (!state.activeLevels.has(d.level)) return false;
  if (!state.search) return true;
  if (d._hay === undefined) {
    d._hay = [
      d.name, d.category_label, d.method_type, d.level, d.venue || "",
      d.paper_title || "", d.repo_description || "", d.abstract || "",
      ...(d.tags || []), ...(d.language || []), ...(d.authors || []),
      ...(d.modalities_tested || []),
    ].join(" ").toLowerCase();
  }
  const haystack = d._hay;
  return haystack.includes(state.search);
}

function activeFacetCount() {
  return Object.values(state.facets).reduce((n, s) => n + (s ? s.size : 0), 0);
}

function facetsToUrl() {
  const url = new URL(location.href);
  const parts = [];
  FACETS.forEach((f) => (state.facets[f.key] || new Set()).forEach((v) => parts.push(`${f.key}:${v}`)));
  if (parts.length) url.searchParams.set("f", parts.join(",")); else url.searchParams.delete("f");
  history.replaceState(history.state, "", url);
}

function facetsFromUrl() {
  const raw = new URLSearchParams(location.search).get("f");
  if (!raw) return;
  const known = new Set(FACETS.map((f) => f.key));
  raw.split(",").forEach((pair) => {
    const i = pair.indexOf(":");
    if (i < 1) return;
    const key = pair.slice(0, i), val = pair.slice(i + 1);
    if (!known.has(key) || !val) return;
    (state.facets[key] ||= new Set()).add(val);
  });
}

function toggleFacet(key, value) {
  const set = (state.facets[key] ||= new Set());
  if (set.has(value)) set.delete(value); else set.add(value);
  facetsToUrl();
  render();
}

function clearFacets() {
  state.facets = {};
  facetsToUrl();
  render();
}

function renderFacetPanel() {
  const panel = document.getElementById("facet-panel");
  const base = state.data.filter(passesSearchAndLevel);
  panel.innerHTML = "";
  FACETS.forEach((f) => {
    // counts for this facet's options = methods passing every *other* facet
    const pool = base.filter((d) => passesFacets(d, f.key));
    const counts = new Map();
    base.forEach((d) => f.values(d).forEach((v) => { if (!counts.has(v)) counts.set(v, 0); }));
    pool.forEach((d) => f.values(d).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    let values = [...counts.keys()];
    if (f.order) values = f.order.filter((v) => counts.has(v)).concat(values.filter((v) => !f.order.includes(v)));
    else values.sort((a, b) => (counts.get(b) - counts.get(a)) || String(f.labelOf(a)).localeCompare(String(f.labelOf(b))));
    const sel = state.facets[f.key] || new Set();

    const group = document.createElement("fieldset");
    group.className = "facet-group";
    const legend = document.createElement("legend");
    legend.textContent = f.label;
    group.appendChild(legend);
    const opts = document.createElement("div");
    opts.className = "facet-options";
    values.forEach((v) => {
      const n = counts.get(v) || 0;
      const on = sel.has(v);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "facet-pill" + (on ? " active" : "") + (!on && n === 0 ? " empty" : "");
      btn.setAttribute("aria-pressed", String(on));
      btn.disabled = !on && n === 0;
      btn.textContent = f.labelOf(v);
      const c = document.createElement("span");
      c.className = "facet-count";
      c.textContent = n;
      btn.appendChild(c);
      btn.addEventListener("click", () => toggleFacet(f.key, v));
      opts.appendChild(btn);
    });
    group.appendChild(opts);
    panel.appendChild(group);
  });
  const foot = document.createElement("div");
  foot.className = "facet-foot";
  foot.innerHTML = `<span>Within a group, any selected option matches; across groups, all must match.</span>`;
  if (activeFacetCount()) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "facet-clear";
    clear.textContent = "Clear all filters";
    clear.addEventListener("click", clearFacets);
    foot.appendChild(clear);
  }
  panel.appendChild(foot);
}

function renderActiveFilters() {
  const bar = document.getElementById("active-filters");
  const n = activeFacetCount();
  const btn = document.getElementById("filters-toggle");
  btn.textContent = n ? `⚲ Filters (${n})` : "⚲ Filters";
  const codeOnly = !!(state.facets.code && state.facets.code.has("yes") && state.facets.code.size === 1);
  const noCode = state.data.filter((d) => !hasPublicCode(d)).length;
  const codeBtn = document.getElementById("code-only-toggle");
  codeBtn.classList.toggle("active", codeOnly);
  codeBtn.setAttribute("aria-pressed", String(codeOnly));
  codeBtn.textContent = codeOnly ? `</> Code only (hiding ${noCode})` : "</> Code only";
  codeBtn.title = codeOnly ? "Show paper-only methods again" : `Hide the ${noCode} methods that have no public code`;
  btn.classList.toggle("active", n > 0);
  bar.classList.toggle("hidden", n === 0);
  bar.innerHTML = "";
  if (!n) return;
  FACETS.forEach((f) => (state.facets[f.key] || new Set()).forEach((v) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "active-filter-chip";
    chip.title = "Remove this filter";
    chip.textContent = `${f.label}: ${f.labelOf(v)} ✕`;
    chip.addEventListener("click", () => toggleFacet(f.key, v));
    bar.appendChild(chip);
  }));
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "facet-clear";
  clear.textContent = "Clear all";
  clear.addEventListener("click", clearFacets);
  bar.appendChild(clear);
}

function bindFacets() {
  facetsFromUrl();
  const btn = document.getElementById("filters-toggle");
  const panel = document.getElementById("facet-panel");
  btn.addEventListener("click", () => {
    const open = panel.classList.toggle("hidden") === false;
    btn.setAttribute("aria-expanded", String(open));
  });
  if (activeFacetCount()) { panel.classList.remove("hidden"); btn.setAttribute("aria-expanded", "true"); }
  document.getElementById("code-only-toggle").addEventListener("click", () => {
    const set = state.facets.code;
    const on = set && set.has("yes") && set.size === 1;
    state.facets.code = on ? new Set() : new Set(["yes"]);
    facetsToUrl();
    render();
  });
}

/* ---------------- Impact view (citations × maintenance) ---------------- */
// One dot per method with both a citation count and a last-commit date.
// x = time since the last commit (today left → older right, sqrt scale), y = citations (log).
// Background bands reuse the Active / Slowing / Stale thresholds of the badges.
// Dots are coloured by (primary) family, with a legend above the chart.

function timeAgo(ms) {
  const days = Math.round(ms / 86400000);
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 730) return `${Math.round(days / 30.44)} months ago`;
  return `${(days / 365.25).toFixed(1)} years ago`;
}

function renderImpact(visible) {
  const wrap = document.createElement("div");
  wrap.className = "impact-wrap";
  const plotted = visible.filter((d) => typeof d.citations === "number" && d.last_commit);
  const missing = visible.length - plotted.length;

  const W = 1100, H = 560, m = { l: 64, r: 28, t: 28, b: 52 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const DAY = 86400000;
  const now = Date.now();
  const YEAR = 365.25 * DAY;
  // x = time since the last commit (0 = today, older to the right)
  const age = (d) => Math.max(0, now - new Date(`${d.last_commit}T00:00:00Z`).getTime());
  const ageMaxData = plotted.length ? Math.max(...plotted.map(age)) : 5 * YEAR;
  const ageMax = Math.max(2, Math.ceil(ageMaxData / YEAR + 0.05)) * YEAR;
  // square-root scale: spreads out the crowded first months, compresses the long stale tail
  const xOf = (a) => m.l + Math.sqrt(Math.min(a, ageMax) / ageMax) * pw;
  const cMax = Math.max(10, ...plotted.map((d) => d.citations));
  const logMax = Math.ceil(Math.log10(cMax + 1));
  const yOf = (c) => m.t + ph - (Math.log10(c + 1) / logMax) * ph;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "impact-svg", role: "img",
    "aria-label": "Citations versus time since the last commit, one dot per method, coloured by family" });

  // maintenance bands
  const bands = [
    { from: 0, to: 182 * DAY, cls: "active", label: "Active" },
    { from: 182 * DAY, to: 730 * DAY, cls: "slowing", label: "Slowing" },
    { from: 730 * DAY, to: ageMax, cls: "stale", label: "Stale · no commit in 2+ years" },
  ];
  const bandG = svgEl("g", { class: "imp-bands" });
  bands.forEach((b) => {
    const x1 = xOf(b.from), x2 = xOf(Math.min(b.to, ageMax));
    if (x2 <= x1) return;
    bandG.appendChild(svgEl("rect", { x: x1, y: m.t, width: x2 - x1, height: ph, class: `imp-band imp-band-${b.cls}` }));
    const lab = svgEl("text", { x: x1 + 8, y: m.t + 16, class: `imp-band-label imp-band-label-${b.cls}` });
    lab.textContent = b.label;
    bandG.appendChild(lab);
  });
  svg.appendChild(bandG);

  // grid + axes
  const grid = svgEl("g", { class: "imp-grid" });
  for (let k = 0; k <= logMax; k++) {
    const v = k === 0 ? 0 : 10 ** k;
    const y = yOf(v);
    grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y, y2: y }));
    const tx = svgEl("text", { x: m.l - 10, y: y + 4, "text-anchor": "end" });
    tx.textContent = v.toLocaleString();
    grid.appendChild(tx);
  }
  const nYears = Math.round(ageMax / YEAR);
  const ticks = [[0, "today"], [0.5, "6 mo"]];
  for (let yr = 1; yr <= nYears; yr++) ticks.push([yr, `${yr} yr`]);
  ticks.forEach(([yr, label]) => {
    const x = xOf(yr * YEAR);
    grid.appendChild(svgEl("line", { x1: x, x2: x, y1: m.t + ph, y2: m.t + ph + 5 }));
    const tx = svgEl("text", { x, y: m.t + ph + 20, "text-anchor": yr === 0 ? "start" : "middle" });
    tx.textContent = label;
    grid.appendChild(tx);
  });
  grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, class: "imp-axis" }));
  const xl = svgEl("text", { x: m.l + pw / 2, y: H - 10, "text-anchor": "middle", class: "imp-axis-title" });
  xl.textContent = "Time since the last commit to the repository (square-root scale)  →  less maintained";
  grid.appendChild(xl);
  const yl = svgEl("text", { x: 16, y: m.t + ph / 2, "text-anchor": "middle", class: "imp-axis-title",
    transform: `rotate(-90 16 ${m.t + ph / 2})` });
  yl.textContent = "Citations (log scale)";
  grid.appendChild(yl);
  svg.appendChild(grid);

  // dots
  const pts = plotted.map((d) => ({ d, x: xOf(age(d)), y: yOf(d.citations) }));
  const dotG = svgEl("g", { class: "imp-dots" });
  pts.forEach((p) => {
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: 5, class: "imp-dot" });
    c.style.fill = FAMILY_COLOR.get(p.d.category) || "#888";
    if (state.compareMode && state.selectedIds.has(p.d.id)) c.classList.add("selected");
    p.el = c;
    dotG.appendChild(c);
  });
  svg.appendChild(dotG);

  // selective labels: the most-cited methods, skipping any that would collide
  const labelG = svgEl("g", { class: "imp-labels" });
  const placed = [];
  [...pts].sort((a, b) => b.d.citations - a.d.citations).slice(0, 10).forEach((p) => {
    const text = p.d.name.length > 28 ? `${p.d.name.slice(0, 26)}…` : p.d.name;
    const w = text.length * 6.6, h = 14;
    const right = p.x + 10 + w < W - m.r;
    const box = { x: right ? p.x + 9 : p.x - 9 - w, y: p.y - 10, w, h };
    if (placed.some((q) => !(box.x + box.w < q.x || q.x + q.w < box.x || box.y + box.h < q.y || q.y + q.h < box.y))) return;
    placed.push(box);
    const lab = svgEl("text", { x: right ? p.x + 9 : p.x - 9, y: p.y + 1, "text-anchor": right ? "start" : "end" });
    lab.textContent = text;
    labelG.appendChild(lab);
  });
  svg.appendChild(labelG);

  // hover: nearest point within 24px (no pinpoint targets)
  const focusRing = svgEl("circle", { r: 9, class: "imp-focus hidden" });
  svg.appendChild(focusRing);
  const overlay = svgEl("rect", { x: m.l, y: m.t, width: pw, height: ph, class: "imp-overlay" });
  svg.appendChild(overlay);
  const tip = document.createElement("div");
  tip.className = "imp-tooltip hidden";
  tip.setAttribute("role", "status");

  let current = null;
  const toSvg = (evt) => {
    const r = svg.getBoundingClientRect();
    return { x: ((evt.clientX - r.left) / r.width) * W, y: ((evt.clientY - r.top) / r.height) * H, scale: r.width / W };
  };
  function show(p, clientX, clientY) {
    current = p;
    focusRing.setAttribute("cx", p.x); focusRing.setAttribute("cy", p.y);
    focusRing.classList.remove("hidden");
    const maint = formatMaintenance(p.d.last_commit);
    tip.innerHTML = `
      <strong>${escapeHtml(p.d.name)}</strong>
      <span class="imp-tip-family"><span class="tbl-dot" style="background:${FAMILY_COLOR.get(p.d.category) || "#888"}"></span>${escapeHtml(familyShort(p.d))}</span>
      <span>${p.d.citations.toLocaleString()} citations${typeof p.d.stars === "number" ? ` · ${p.d.stars.toLocaleString()} ★` : ""}</span>
      <span><span class="maint-badge maint-${maint.status}">${STATUS_LABEL[maint.status]}</span> last commit ${escapeHtml(p.d.last_commit)} (${escapeHtml(timeAgo(age(p.d)))})</span>
      ${codeHealth(p.d) ? `<span>Code health ${healthBadge(codeHealth(p.d))}</span>` : ""}
      <em>Click for details</em>`;
    tip.classList.remove("hidden");
    const box = wrap.getBoundingClientRect();
    let left = clientX - box.left + 14, top = clientY - box.top + 14;
    if (left + 240 > box.width) left = clientX - box.left - 254;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${top}px`;
  }
  function hide() { current = null; focusRing.classList.add("hidden"); tip.classList.add("hidden"); }
  overlay.addEventListener("mousemove", (evt) => {
    const q = toSvg(evt);
    let best = null, bestD = (24 / q.scale) ** 2;
    pts.forEach((p) => { const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (dd < bestD) { bestD = dd; best = p; } });
    if (best) show(best, evt.clientX, evt.clientY); else hide();
    overlay.style.cursor = best ? "pointer" : "default";
  });
  overlay.addEventListener("mouseleave", hide);
  overlay.addEventListener("click", () => {
    if (!current) return;
    const d = current.d;
    if (state.compareMode) {
      if (state.selectedIds.has(d.id)) state.selectedIds.delete(d.id); else state.selectedIds.add(d.id);
      current.el.classList.toggle("selected", state.selectedIds.has(d.id));
      updateCompareBar();
    } else {
      openDrawer(d);
    }
  });

  const famPresent = FAMILY_ORDER.filter(([id]) => plotted.some((d) => d.category === id));
  wrap.innerHTML = `<p class="tbl-caption">${plotted.length} methods with both a citation count and a repository · ${missing ? `${missing} more in the current filter have no repo or no citation data yet · ` : ""}hover a dot for details</p>
    <div class="imp-legend" aria-label="Family colours">${famPresent.map(([id]) => `<span><span class="tbl-dot" style="background:${FAMILY_COLOR.get(id) || "#888"}"></span>${escapeHtml(FAMILY_SHORT[id] || id)}</span>`).join("")}</div>`;
  const scroller = document.createElement("div");
  scroller.className = "impact-scroll";
  scroller.appendChild(svg);
  wrap.appendChild(scroller);
  wrap.appendChild(tip);
  const note = document.createElement("p");
  note.className = "imp-note";
  note.textContent = "Top-left: well cited and still maintained. Bottom-left: new or niche but active. Top-right: influential but no longer maintained — check forks or toolboxes before relying on it. Exact numbers for every method are in the Table view.";
  wrap.appendChild(note);
  return wrap;
}

/* ---------------- Lineage view ---------------- */
// A family tree of methods drawn from the `extends` / `implements` fields:
// x = publication year, one row per method, each child under its parent.
// Search and level filters dim non-matching nodes instead of removing them,
// so the tree never breaks apart.

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function lineageYear(d, byId, seen = new Set()) {
  if (d.paper_year) return d.paper_year;
  if (d.first_commit_date) return Number(d.first_commit_date.slice(0, 4));
  if (seen.has(d.id)) return null;
  seen.add(d.id);
  const parentId = d.implements || (d.extends || [])[0];
  return parentId && byId.has(parentId) ? lineageYear(byId.get(parentId), byId, seen) : null;
}

function buildLineageForest() {
  const byId = new Map(state.data.map((d) => [d.id, d]));
  const parentsOf = new Map(); // id -> [{id, kind}]
  const childrenOf = new Map(); // primary-parent id -> [child]
  state.data.forEach((d) => {
    const ps = [];
    (d.extends || []).forEach((p) => byId.has(p) && ps.push({ id: p, kind: "extends" }));
    if (d.implements && byId.has(d.implements)) ps.push({ id: d.implements, kind: "implements" });
    if (ps.length) parentsOf.set(d.id, ps);
  });
  const year = (d) => lineageYear(d, byId) ?? 9999;
  // Primary parent = the most recent one (Fed-ComBat sits under d-ComBat, with a second link to ComBat).
  const primary = new Map();
  parentsOf.forEach((ps, id) => {
    const best = [...ps].sort((a, b) => year(byId.get(b.id)) - year(byId.get(a.id)))[0];
    primary.set(id, best);
    if (!childrenOf.has(best.id)) childrenOf.set(best.id, []);
    childrenOf.get(best.id).push(byId.get(id));
  });
  const inLineage = new Set([...parentsOf.keys(), ...[...parentsOf.values()].flat().map((p) => p.id)]);
  const roots = state.data.filter((d) => inLineage.has(d.id) && !primary.has(d.id));
  const subtreeSize = (d) => 1 + (childrenOf.get(d.id) || []).reduce((n, c) => n + subtreeSize(c), 0);
  roots.sort((a, b) => subtreeSize(b) - subtreeSize(a) || year(a) - year(b));

  const rows = []; // {d, depth, tree}
  roots.forEach((r, tree) => {
    const walk = (d, depth) => {
      rows.push({ d, depth, tree });
      (childrenOf.get(d.id) || [])
        .sort((a, b) => year(a) - year(b) || a.name.localeCompare(b.name))
        .forEach((c) => walk(c, depth + 1));
    };
    walk(r, 0);
  });
  const others = state.data.filter((d) => !inLineage.has(d.id));
  return { byId, rows, parentsOf, primary, others, year: (d) => lineageYear(d, byId) };
}

function renderLineage(visible) {
  const visibleIds = new Set(visible.map((d) => d.id));
  const { byId, rows, parentsOf, others, year } = buildLineageForest();
  const wrap = document.createElement("div");
  wrap.className = "lineage-wrap";

  const years = rows.map((r) => year(r.d)).filter(Boolean);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const left = 24, labelRoom = 300, rowH = 30, topPad = 44, treeGap = 18;
  const width = 1100, plotW = width - left - labelRoom;
  const xOf = (yr) => left + ((yr - y0) / Math.max(1, y1 - y0)) * plotW;

  let cursor = topPad;
  let lastTree = -1;
  const pos = new Map();
  rows.forEach((r) => {
    if (r.tree !== lastTree && lastTree !== -1) cursor += treeGap;
    lastTree = r.tree;
    pos.set(r.d.id, { x: xOf(year(r.d) ?? y0), y: cursor });
    cursor += rowH;
  });
  const height = cursor + 10;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "lineage-svg", role: "img",
    "aria-label": "Lineage of harmonization methods: which method builds on which, by publication year" });

  // year grid
  const grid = svgEl("g", { class: "lin-grid" });
  for (let yr = y0; yr <= y1; yr++) {
    const x = xOf(yr);
    grid.appendChild(svgEl("line", { x1: x, x2: x, y1: 28, y2: height - 6 }));
    const t = svgEl("text", { x, y: 18, "text-anchor": "middle" });
    t.textContent = String(yr);
    grid.appendChild(t);
  }
  svg.appendChild(grid);

  // edges (parent -> child), drawn first so nodes sit on top
  const edges = svgEl("g", { class: "lin-edges" });
  const edgeEls = [];
  parentsOf.forEach((ps, childId) => {
    ps.forEach((p) => {
      const a = pos.get(p.id), b = pos.get(childId);
      if (!a || !b) return;
      const midX = Math.max(a.x + 10, b.x - 14);
      const path = svgEl("path", {
        d: `M${a.x},${a.y} C${a.x},${b.y} ${midX - 20},${b.y} ${b.x},${b.y}`,
        class: `lin-edge lin-${p.kind}`,
      });
      path.dataset.from = p.id;
      path.dataset.to = childId;
      edges.appendChild(path);
      edgeEls.push(path);
    });
  });
  svg.appendChild(edges);

  // nodes
  const nodes = svgEl("g", { class: "lin-nodes" });
  const nodeEls = new Map();
  rows.forEach(({ d }) => {
    const { x, y } = pos.get(d.id);
    const g = svgEl("g", { class: "lin-node", transform: `translate(${x},${y})`, tabindex: "0", role: "button" });
    g.dataset.id = d.id;
    if (!visibleIds.has(d.id)) g.classList.add("filtered-out");
    const color = FAMILY_COLOR.get(d.category) || "#888";
    g.appendChild(svgEl("circle", { r: d.implements ? 4.5 : 6.5, fill: d.implements ? "var(--ink)" : color, stroke: color, "stroke-width": 2 }));
    const label = svgEl("text", { x: 12, y: 4.5 });
    label.textContent = d.name;
    const yr = year(d);
    const meta = svgEl("tspan", { class: "lin-meta", dx: 8 });
    meta.textContent = [yr, typeof d.citations === "number" ? `${d.citations.toLocaleString()} cit.` : null, d.implements ? "implementation" : null]
      .filter(Boolean).join(" · ");
    label.appendChild(meta);
    g.appendChild(label);
    const title = svgEl("title");
    title.textContent = `${d.name} — click for details`;
    g.appendChild(title);
    const open = () => {
      if (state.compareMode) {
        if (state.selectedIds.has(d.id)) state.selectedIds.delete(d.id); else state.selectedIds.add(d.id);
        g.classList.toggle("selected", state.selectedIds.has(d.id));
        updateCompareBar();
      } else {
        openDrawer(d);
      }
    };
    g.addEventListener("click", open);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    g.addEventListener("mouseenter", () => highlight(d.id));
    g.addEventListener("focus", () => highlight(d.id));
    g.addEventListener("mouseleave", () => highlight(null));
    g.addEventListener("blur", () => highlight(null));
    if (state.compareMode && state.selectedIds.has(d.id)) g.classList.add("selected");
    nodes.appendChild(g);
    nodeEls.set(d.id, g);
  });
  svg.appendChild(nodes);

  // hover: light up the path from the roots down to this node (its ancestry only —
  // methods that build on it are not highlighted)
  function related(id) {
    const out = new Set([id]);
    const up = [id];
    while (up.length) (parentsOf.get(up.pop()) || []).forEach((p) => { if (!out.has(p.id)) { out.add(p.id); up.push(p.id); } });
    return out;
  }
  function highlight(id) {
    svg.classList.toggle("has-focus", !!id);
    const rel = id ? related(id) : null;
    nodeEls.forEach((el, nid) => el.classList.toggle("on", !!rel && rel.has(nid)));
    edgeEls.forEach((el) => el.classList.toggle("on", !!rel && rel.has(el.dataset.from) && rel.has(el.dataset.to)));
  }

  const n = rows.length;
  wrap.innerHTML = `
    <p class="tbl-caption">${n} methods with a recorded lineage · ${rows.filter((r) => r.depth === 0).length} roots · hover to trace a method's ancestry, click for details</p>
    <div class="lineage-legend">
      <span><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" class="lin-edge lin-extends"/></svg>builds on</span>
      <span><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" class="lin-edge lin-implements"/></svg>implementation of</span>
      <span class="lin-legend-note">Lineage comes from each entry's <code>extends</code> / <code>implements</code> fields. Know a missing link? Report it on the method's page.</span>
    </div>`;
  const scroller = document.createElement("div");
  scroller.className = "lineage-scroll";
  scroller.appendChild(svg);
  wrap.appendChild(scroller);

  if (others.length) {
    const rest = document.createElement("details");
    rest.className = "lineage-others";
    rest.innerHTML = `<summary>${others.length} methods with no recorded lineage yet</summary>`;
    const flow = document.createElement("div");
    flow.className = "box-flow";
    others.filter((d) => visibleIds.has(d.id)).forEach((d) => flow.appendChild(makeBox(d)));
    rest.appendChild(flow);
    wrap.appendChild(rest);
  }
  return wrap;
}

/* ---------------- Table view ---------------- */

// Each column: key, header label, how to get a sortable value, how to render a cell.
// Numeric columns sort descending first; missing values always sort last.
// Compact family names for the table, where the full legend labels would wrap.
const FAMILY_SHORT = {
  "combat-family": "ComBat-family", "classical-normalization": "Classical normalization",
  "deep-learning": "Deep learning", "iqm-based": "IQM-based", "normative-modeling": "Normative modeling",
  "interpolation-based": "Interpolation", "federated": "Federated", "ica-based": "ICA",
  "optimal-transport": "Optimal transport", "domain-adaptation": "Domain adaptation", "confound-removal": "Confound removal", "acquisition-protocol": "Acquisition",
};
const familyShort = (d) => FAMILY_SHORT[d.category] || FAMILY_LABEL.get(d.category) || d.category_label || "";

const TABLE_COLUMNS = [
  { key: "name", label: "Method", type: "text", value: (d) => d.name,
    cell: (d) => `<span class="tbl-dot" style="background:${FAMILY_COLOR.get(d.category) || "#888"}"></span>${escapeHtml(d.name)}` },
  { key: "family", label: "Family", type: "text", value: familyShort,
    cell: (d) => `<span title="${escapeHtml(FAMILY_LABEL.get(d.category) || "")}">${escapeHtml(familyShort(d) || "—")}</span>` },
  { key: "level", label: "Level", type: "text", value: (d) => LEVEL_LABELS[d.level] || d.level,
    cell: (d) => escapeHtml((LEVEL_LABELS[d.level] || d.level || "—").replace("-level", "")) },
  { key: "year", label: "Year", type: "num", value: (d) => d.paper_year ?? null,
    cell: (d) => escapeHtml(d.paper_year || "—") },
  { key: "citations", label: "Citations", type: "num", value: (d) => d.citations ?? null,
    cell: (d) => (typeof d.citations === "number" ? d.citations.toLocaleString() : escapeHtml(d.citations ?? "—")) },
  { key: "stars", label: "Stars", type: "num", value: (d) => d.stars ?? null,
    cell: (d) => (typeof d.stars === "number" ? d.stars.toLocaleString() : (d.github ? "—" : `<span class="tbl-muted">no repo</span>`)) },
  { key: "maintenance", label: "Last commit", type: "num",
    // sort by recency: more recent = larger number
    value: (d) => (d.last_commit ? -daysSince(d.last_commit) : null),
    cell: (d) => {
      if (!d.last_commit) {
        return isToolboxMember(d.id) && !d.github ? `<span class="maint-badge maint-toolbox">toolbox</span>` : "—";
      }
      const m = formatMaintenance(d.last_commit);
      return `<span class="maint-badge maint-${m.status}">${STATUS_LABEL[m.status]}</span> <span class="tbl-muted">${escapeHtml(d.last_commit)}</span>`;
    } },
  { key: "health", label: "Health", type: "num", value: (d) => { const h = codeHealth(d); return h ? h.score : null; },
    cell: (d) => { const h = codeHealth(d); return h ? healthBadge(h) : (isToolboxMember(d.id) && !d.github ? `<span class="tbl-muted">toolbox</span>` : "—"); } },
  { key: "language", label: "Language", type: "text", value: (d) => (d.language && d.language[0]) || "",
    cell: (d) => escapeHtml((d.language || []).join(", ") || "—") },
  { key: "venue", label: "Published in", type: "text", value: (d) => d.venue || "",
    cell: (d) => escapeHtml(d.venue || "—") },
  { key: "license", label: "License", type: "text", value: (d) => d.license || "",
    cell: (d) => escapeHtml(d.license && d.license !== "NOASSERTION" ? d.license : (d.license ? "other" : "—")) },
];

function sortedForTable(methods) {
  const col = TABLE_COLUMNS.find((c) => c.key === state.sort.key) || TABLE_COLUMNS[0];
  const dir = state.sort.dir === "asc" ? 1 : -1;
  return [...methods].sort((a, b) => {
    const va = col.value(a), vb = col.value(b);
    const emptyA = va == null || va === "", emptyB = vb == null || vb === "";
    if (emptyA && emptyB) return a.name.localeCompare(b.name);
    if (emptyA) return 1;   // missing values always last, whichever direction
    if (emptyB) return -1;
    const cmp = col.type === "num" ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
    return cmp * dir || a.name.localeCompare(b.name);
  });
}

function renderTable(methods) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const rows = sortedForTable(methods);

  const head = TABLE_COLUMNS.map((c) => {
    const active = state.sort.key === c.key;
    const aria = active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none";
    const arrow = active ? (state.sort.dir === "asc" ? "▲" : "▼") : "";
    return `<th scope="col" class="tbl-${c.type}" aria-sort="${aria}"><button type="button" data-sort="${c.key}">${c.label}<span class="tbl-arrow">${arrow}</span></button></th>`;
  }).join("");

  const body = rows.map((d) => {
    const selected = state.compareMode && state.selectedIds.has(d.id);
    const cells = TABLE_COLUMNS.map((c, i) =>
      i === 0 ? `<th scope="row">${c.cell(d)}</th>` : `<td class="tbl-${c.type}">${c.cell(d)}</td>`).join("");
    return `<tr tabindex="0" data-id="${escapeHtml(d.id)}" class="${selected ? "selected" : ""}">${cells}</tr>`;
  }).join("");

  wrap.innerHTML = `
    <p class="tbl-caption">${rows.length} method${rows.length === 1 ? "" : "s"} · click a column to sort · click a row for details${state.compareMode ? " (compare mode: click rows to select)" : ""}</p>
    <div class="table-scroll">
      <table class="methods-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  wrap.querySelectorAll("th button[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      const col = TABLE_COLUMNS.find((c) => c.key === key);
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort = { key, dir: col.type === "num" ? "desc" : "asc" };
      }
      render();
    });
  });

  const byId = new Map(state.data.map((d) => [d.id, d]));
  wrap.querySelectorAll("tbody tr").forEach((tr) => {
    const d = byId.get(tr.dataset.id);
    const activate = () => {
      if (state.compareMode) {
        if (state.selectedIds.has(d.id)) state.selectedIds.delete(d.id); else state.selectedIds.add(d.id);
        tr.classList.toggle("selected", state.selectedIds.has(d.id));
        updateCompareBar();
      } else {
        openDrawer(d);
      }
    };
    tr.addEventListener("click", activate);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
  });
  return wrap;
}

function csvCell(v) {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadTableCsv() {
  const rows = sortedForTable(visibleMethods());
  const fields = [
    ["id", (d) => d.id], ["name", (d) => d.name], ["family", (d) => FAMILY_LABEL.get(d.category) || d.category],
    ["level", (d) => d.level], ["method_type", (d) => d.method_type], ["paper_year", (d) => d.paper_year],
    ["paper_title", (d) => d.paper_title], ["venue", (d) => d.venue], ["doi", (d) => d.doi], ["paper_url", (d) => d.paper_url],
    ["citations", (d) => d.citations], ["github", (d) => (d.github ? `https://github.com/${d.github}` : d.other_url)],
    ["stars", (d) => d.stars], ["forks", (d) => d.forks], ["last_commit", (d) => d.last_commit], ["code_health", (d) => { const h = codeHealth(d); return h ? h.score : null; }],
    ["license", (d) => d.license], ["language", (d) => d.language], ["modalities_tested", (d) => d.modalities_tested],
  ];
  const lines = [fields.map(([k]) => k).join(",")]
    .concat(rows.map((d) => fields.map(([, get]) => csvCell(get(d))).join(",")));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `harmonization-zoo-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- Cluster view (Level / Family) ---------------- */

function renderClusters(methods, groupBy) {
  const wrap = document.createElement("div");
  wrap.className = "cluster-wrap";

  if (groupBy === "toolbox") {
    return renderToolboxClusters(methods, wrap);
  }

  let groupFn, groupOrder, groupLabel;

  if (groupBy === "category") {
    groupFn = (d) => d.category;
    groupOrder = FAMILY_ORDER.map(([id]) => id);
    groupLabel = (id) => FAMILY_LABEL.get(id) || id;
  } else if (groupBy === "modality") {
    groupFn = (d) => d.modality || "MRI (unspecified)";
    const present = Array.from(new Set(methods.map(groupFn)));
    groupOrder = present.sort();
    groupLabel = (id) => id;
  } else if (groupBy === "language") {
    groupFn = (d) => d.primary_language;
    const present = Array.from(new Set(methods.map(groupFn)));
    groupOrder = present.sort();
    groupLabel = (id) => id;
  } else if (groupBy === "maintenance") {
    groupFn = (d) => {
      if (!d.github) return isToolboxMember(d.id) ? "toolbox-maintained" : "no-repo";
      const status = formatMaintenance(d.last_commit).status;
      return status || "not-fetched";
    };
    groupOrder = ["active", "slowing", "stale", "not-fetched", "toolbox-maintained", "no-repo"];
    groupLabel = (id) => ({
      active: "Active (commit within 6 months)",
      slowing: "Slowing (6 months – 2 years)",
      stale: "Stale (2+ years since last commit)",
      "not-fetched": "Not fetched yet",
      "toolbox-maintained": "Maintained as part of a Toolbox",
      "no-repo": "No GitHub repo",
    }[id] || id);
  } else if (groupBy === "data") {
    groupFn = (d) => d.validation_data || "Agnostic";
    // Agnostic last; everything else alphabetical, so named cohorts stand out.
    const present = Array.from(new Set(methods.map(groupFn)));
    groupOrder = present.filter((g) => g !== "Agnostic").sort().concat(
      present.includes("Agnostic") ? ["Agnostic"] : []
    );
    groupLabel = (id) => id;
  } else {
    groupFn = (d) => d.level;
    groupOrder = LEVEL_ORDER;
    groupLabel = (id) => LEVEL_LABELS[id] || id;
  }

  const byGroup = new Map(groupOrder.map((g) => [g, []]));
  methods.forEach((d) => {
    const g = groupFn(d);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(d);
  });

  byGroup.forEach((items, g) => {
    if (items.length === 0) return;
    const section = document.createElement("section");
    section.className = "cluster-section";

    const header = document.createElement("h3");
    header.className = "cluster-heading";
    header.innerHTML = `${escapeHtml(groupLabel(g))} <span class="cluster-count">${items.length}</span>`;
    section.appendChild(header);

    const flow = document.createElement("div");
    flow.className = "box-flow";
    items
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((d) => flow.appendChild(makeBox(d)));
    section.appendChild(flow);

    wrap.appendChild(section);
  });

  return wrap;
}

function renderToolboxClusters(methods, wrap) {
  const visibleIds = new Set(methods.map((d) => d.id));
  const claimed = new Set();

  state.toolboxes.forEach((tb) => {
    const items = tb.methods
      .map((id) => methods.find((d) => d.id === id))
      .filter(Boolean);
    items.forEach((d) => claimed.add(d.id));
    if (items.length === 0) return;

    const section = document.createElement("section");
    section.className = "cluster-section";
    const header = document.createElement("h3");
    header.className = "cluster-heading";
    header.innerHTML = `${escapeHtml(tb.name)} <span class="cluster-count">${items.length}</span>`;
    section.appendChild(header);

    const flow = document.createElement("div");
    flow.className = "box-flow";
    items.sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => flow.appendChild(makeBox(d)));
    section.appendChild(flow);
    wrap.appendChild(section);
  });

  const standalone = methods.filter((d) => visibleIds.has(d.id) && !claimed.has(d.id));
  if (standalone.length > 0) {
    const section = document.createElement("section");
    section.className = "cluster-section";
    const header = document.createElement("h3");
    header.className = "cluster-heading";
    header.innerHTML = `Standalone (not bundled in a toolbox) <span class="cluster-count">${standalone.length}</span>`;
    section.appendChild(header);

    const flow = document.createElement("div");
    flow.className = "box-flow";
    standalone.sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => flow.appendChild(makeBox(d)));
    section.appendChild(flow);
    wrap.appendChild(section);
  }

  return wrap;
}

/* ---------------- Timeline scaffolding (shared by Year / Stars) ---------------- */

function buildTimelineColumn(items, tickLabel, extraClass) {
  const col = document.createElement("div");
  col.className = "timeline-col" + (extraClass ? ` ${extraClass}` : "") + (items.length ? "" : " timeline-col-empty");

  const boxes = document.createElement("div");
  boxes.className = "timeline-boxes";
  items
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((d) => boxes.appendChild(makeBox(d)));
  col.appendChild(boxes);

  const tick = document.createElement("div");
  tick.className = "timeline-tick";
  const label = document.createElement("span");
  label.className = "timeline-year-label";
  label.textContent = tickLabel;
  tick.appendChild(label);
  col.appendChild(tick);

  return col;
}

/* ---------------- Timeline view (Year of first commit) ---------------- */

// Prefers the repo's first-commit year (automatable, verifiable); falls
// back to the researched paper year for entries where stats haven't been
// fetched yet or there's no repo at all.
function timelineYear(d) {
  if (d.first_commit_date) return Number(d.first_commit_date.slice(0, 4));
  if (d.paper_year) return d.paper_year;
  return null;
}

function renderYearTimeline(methods) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-wrap";

  const known = methods.filter((d) => timelineYear(d));
  const unknown = methods.filter((d) => !timelineYear(d));

  const minYear = known.length ? Math.min(...known.map(timelineYear)) : new Date().getFullYear();
  const maxYear = new Date().getFullYear();

  const byYear = new Map();
  for (let y = minYear; y <= maxYear; y++) byYear.set(y, []);
  known.forEach((d) => byYear.get(timelineYear(d)).push(d));

  const track = document.createElement("div");
  track.className = "timeline-track";

  byYear.forEach((items, year) => {
    track.appendChild(buildTimelineColumn(items, String(year)));
  });

  if (unknown.length) {
    track.appendChild(buildTimelineColumn(unknown, "Year unknown", "timeline-col-unknown"));
  }

  wrap.appendChild(track);

  const note = document.createElement("p");
  note.className = "timeline-note";
  note.textContent = "Year = the repo's first commit where available, else the paper's publication year.";
  wrap.appendChild(note);

  return wrap;
}

/* ---------------- Timeline view (GitHub stars) ---------------- */

function starsBucket(stars) {
  if (stars == null) return null;
  if (stars === 0) return "0";
  if (stars < 10) return "1–9";
  if (stars < 50) return "10–49";
  if (stars < 200) return "50–199";
  if (stars < 1000) return "200–999";
  return "1000+";
}

function renderStarsTimeline(methods) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-wrap";

  const known = methods.filter((d) => starsBucket(d.stars));
  const unknown = methods.filter((d) => !starsBucket(d.stars));

  const byBucket = new Map(STAR_BUCKETS.map((b) => [b, []]));
  known.forEach((d) => byBucket.get(starsBucket(d.stars)).push(d));

  const track = document.createElement("div");
  track.className = "timeline-track";

  byBucket.forEach((items, bucket) => {
    track.appendChild(buildTimelineColumn(items, `${bucket} ★`));
  });

  if (unknown.length) {
    track.appendChild(buildTimelineColumn(unknown, "Not fetched", "timeline-col-unknown"));
  }

  wrap.appendChild(track);

  const note = document.createElement("p");
  note.className = "timeline-note";
  note.textContent = "Star counts are fetched from the GitHub API — see scripts/fetch_github_stats.py.";
  wrap.appendChild(note);

  return wrap;
}

const CITATION_BUCKETS = ["0", "1–9", "10–49", "50–199", "200–999", "1000+"];

function citationsBucket(citations) {
  if (citations == null) return null;
  if (citations === 0) return "0";
  if (citations < 10) return "1–9";
  if (citations < 50) return "10–49";
  if (citations < 200) return "50–199";
  if (citations < 1000) return "200–999";
  return "1000+";
}

function renderCitationsTimeline(methods) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-wrap";

  const known = methods.filter((d) => citationsBucket(d.citations));
  const unknown = methods.filter((d) => !citationsBucket(d.citations));

  const byBucket = new Map(CITATION_BUCKETS.map((b) => [b, []]));
  known.forEach((d) => byBucket.get(citationsBucket(d.citations)).push(d));

  const track = document.createElement("div");
  track.className = "timeline-track";

  byBucket.forEach((items, bucket) => {
    track.appendChild(buildTimelineColumn(items, `${bucket} cit.`));
  });

  if (unknown.length) {
    track.appendChild(buildTimelineColumn(unknown, "Not fetched", "timeline-col-unknown"));
  }

  wrap.appendChild(track);

  const note = document.createElement("p");
  note.className = "timeline-note";
  note.textContent = "Citation counts are fetched from Semantic Scholar — see scripts/fetch_citations.py (run manually, not on a schedule).";
  wrap.appendChild(note);

  return wrap;
}

/* ---------------- Drawer ---------------- */

function daysSince(dateStr) {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

function isToolboxMember(methodId) {
  return state.toolboxes.some((tb) => tb.methods.includes(methodId));
}

function formatMaintenance(dateStr) {
  if (!dateStr) return { text: "not fetched yet", status: null };
  const days = daysSince(dateStr);
  let text;
  if (days < 1) text = "today";
  else if (days < 30) text = `${days} day${days === 1 ? "" : "s"} ago`;
  else if (days < 365) {
    const months = Math.round(days / 30.44);
    text = `${months} month${months === 1 ? "" : "s"} ago`;
  } else {
    const years = Math.round((days / 365.25) * 10) / 10;
    text = `${years} year${years === 1 ? "" : "s"} ago`;
  }
  const status = days < 182 ? "active" : days < 730 ? "slowing" : "stale";
  return { text, status, days };
}

const STATUS_LABEL = { active: "Active", slowing: "Slowing", stale: "Stale" };

// "Get started" snippets: install commands and a first usage example taken
// from the method's README (data field `get_started`, filled by maintainers).
function getStartedHtml(d) {
  const g = d.get_started;
  if (!g || !(g.install || g.usage)) return "";
  const block = (label, code, lang) => code ? `
      <div class="gs-block">
        <div class="gs-head"><span>${escapeHtml(label)}${lang ? ` <em>${escapeHtml(lang === "r" ? "R" : lang)}</em>` : ""}</span>
          <button type="button" class="gs-copy" aria-label="Copy ${escapeHtml(label.toLowerCase())} code">⧉ Copy</button></div>
        <pre class="gs-code"><code>${escapeHtml(code)}</code></pre>
      </div>` : "";
  return `
    <section class="drawer-get-started">
      <h3>Get started</h3>
      ${block("Install", g.install, g.install_lang)}
      ${block("Usage", g.usage, g.usage_lang)}
      <p class="gs-source">Taken from the ${g.source ? extLink(g.source, "project README", "inline-link") : "project README"}${g.fetched ? ` (${escapeHtml(g.fetched)})` : ""}; check it for requirements and the current version.</p>
    </section>`;
}

function bindCopyButtons(root) {
  root.querySelectorAll(".gs-copy").forEach((b) => b.addEventListener("click", () => {
    const code = b.closest(".gs-block").querySelector("code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      b.textContent = "✓ Copied";
      setTimeout(() => { b.textContent = "⧉ Copy"; }, 1400);
    });
  }));
}

function openDrawer(d) {
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");
  const scrim = document.getElementById("drawer-scrim");

  const languages = (d.language || []).map((l) => `<span class="chip">${escapeHtml(l)}</span>`).join("") || `<span class="chip">unspecified</span>`;
  const tags = (d.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
  const topics = (d.topics || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");

  const slug = ghSlug(d.github);
  const repoLink = slug
    ? extLink(`https://github.com/${slug}`, `↗ ${escapeHtml(slug)}`)
    : extLink(d.other_url, "↗ Project page");
  const paperLink = d.paper_url
    ? extLink(d.paper_url, "↗ Paper") : "";

  const starsLine = typeof d.stars === "number" ? `${d.stars.toLocaleString()} ★` : "not fetched yet";
  const forksLine = typeof d.forks === "number" ? d.forks.toLocaleString() : "not fetched yet";
  const issuesLine = typeof d.open_issues === "number" ? d.open_issues.toLocaleString() : "not fetched yet";
  const licenseLine = d.license || (d.github ? "none / not fetched" : "—");
  const firstCommitLine = d.first_commit_date || "not fetched yet";

  const maint = formatMaintenance(d.last_commit);
  let maintLine;
  if (d.github) {
    maintLine = `${maint.text}${maint.status ? ` <span class="maint-badge maint-${maint.status}">${STATUS_LABEL[maint.status]}</span>` : ""}${d.last_commit ? ` <span class="maint-date">(${escapeHtml(d.last_commit)})</span>` : ""}`;
  } else {
    const memberOf = state.toolboxes.filter((tb) => tb.methods.includes(d.id));
    maintLine = memberOf.length
      ? `<span class="maint-badge maint-toolbox">Maintained as part of a Toolbox</span> — ` +
        memberOf.map((tb) => extLink(tb.url, `${escapeHtml(tb.name)} ↗`, "inline-link")).join(", ")
      : "—";
  }

  const archivedBadge = d.archived ? `<span class="chip chip-warning">archived</span>` : "";

  const memberToolboxes = state.toolboxes.filter((tb) => tb.methods.includes(d.id));
  const toolboxLine = memberToolboxes.length
    ? memberToolboxes.map((tb) => extLink(tb.url, `${escapeHtml(tb.name)} ↗`, "inline-link")).join(", ")
    : "Not bundled in a toolbox — see Explore → Group by Toolbox for what's available.";

  const isDL = d.method_type === "deep-learning";
  const frameworkLine = d.framework || (d.github ? "not fetched yet" : "—");
  const weightsLine = d.has_pretrained_weights === true
    ? `Yes ${extLink(d.pretrained_weights_url, "↗ weights", "inline-link")}`
    : d.has_pretrained_weights === false
      ? "No"
      : (d.github ? "not fetched yet" : "—");
  const dlRows = isDL ? `
      <dt>Architecture</dt><dd>${d.architecture_backbone ? escapeHtml(d.architecture_backbone) : "—"}</dd>
      <dt>Framework</dt><dd>${escapeHtml(frameworkLine)}</dd>
      <dt>Pretrained weights</dt><dd>${weightsLine}</dd>
  ` : "";

  const missingNote = (d.stars == null && d.github)
    ? `<p class="no-data-note">Live GitHub stats haven't been fetched in this build — use the "⟳ Fetch missing GitHub stats" button at the top of the page for a session-only preview, or run <code>scripts/fetch_github_stats.py</code> (or the scheduled Action) to actually save it.</p>`
    : "";
  const noPaperNote = !d.paper_title
    ? `<p class="no-data-note">No paper is listed for this entry yet — if you know the reference, please contribute it.</p>`
    : (!d.paper_year ? `<p class="no-data-note">Publication year not yet verified for this entry — contributions welcome.</p>` : "");

  content.innerHTML = `
    <div class="drawer-eyebrow" style="--eyebrow-color:${FAMILY_COLOR.get(d.category) || "#888"}">${escapeHtml(d.category_label)} · ${escapeHtml(LEVEL_LABELS[d.level] || d.level)}</div>
    <h2>${escapeHtml(d.name)} ${archivedBadge}</h2>
    ${FAMILY_NOTE[d.category] ? `<p class="drawer-family-note">${escapeHtml(FAMILY_NOTE[d.category])}</p>` : ""}
    ${(d.secondary_categories || []).length ? `<p class="drawer-also-fits">Also fits: ${d.secondary_categories.map((c) => `<span class="chip" style="border-color:${FAMILY_COLOR.get(c) || "#888"}">${escapeHtml(FAMILY_SHORT[c] || FAMILY_LABEL.get(c) || c)}</span>`).join(" ")}</p>` : ""}
    ${d.paper_title ? `<p class="paper-title">"${escapeHtml(d.paper_title)}"</p>` : ""}
    ${d.abstract ? `<details class="drawer-abstract"><summary>Abstract <span>${d.abstract_source ? `via ${escapeHtml(d.abstract_source)}` : ""}</span></summary><p>${escapeHtml(d.abstract)}</p></details>` : ""}
    ${d.repo_description ? `<p class="repo-description">${escapeHtml(d.repo_description)}</p>` : ""}
    ${noPaperNote}

    <dl class="spec-table">
      <dt>Paper year</dt><dd>${escapeHtml(d.paper_year || "—")}</dd>
      ${d.venue ? `<dt>Published in</dt><dd>${escapeHtml(d.venue)}</dd>` : ""}
      ${d.authors && d.authors.length ? `<dt>Authors</dt><dd>${escapeHtml(d.authors.slice(0, 3).join(", "))}${d.n_authors > 3 ? " et al." : ""}</dd>` : ""}
      ${d.modalities_tested && d.modalities_tested.length ? `<dt>Tested on</dt><dd><div class="chip-row">${d.modalities_tested.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}</div></dd>` : ""}
      <dt>First commit</dt><dd>${escapeHtml(firstCommitLine)}</dd>
      <dt>Last maintained</dt><dd>${maintLine}</dd>
      ${(() => { const h = codeHealth(d); return h ? `<dt>Code health</dt><dd>${healthBadge(h)}${healthBreakdownHtml(h)}</dd>` : ""; })()}
      <dt>Preserves biology</dt><dd>${escapeHtml(BIOLOGY_LABEL[d.preserves_biology === true ? "true" : d.preserves_biology === false ? "false" : "null"])}</dd>
      <dt>Validation data</dt><dd>${escapeHtml(d.validation_data || "Agnostic")}</dd>
      <dt>Toolboxes</dt><dd>${toolboxLine}</dd>
      ${(() => { const rs = resourcesCovering(d.id); return rs.length ? `<dt>Reviewed in</dt><dd>${rs.map((r) => `<button type="button" class="inline-link drawer-resource-link" data-res="${escapeHtml(r.id)}">${escapeHtml(resourceShortCite(r))}</button>`).join(", ")}</dd>` : ""; })()}
      <dt>Language</dt><dd><div class="chip-row">${languages}</div></dd>
      ${dlRows}
      <dt>Stars</dt><dd>${starsLine}</dd>
      <dt>Forks</dt><dd>${escapeHtml(forksLine)}</dd>
      <dt>Open issues</dt><dd>${escapeHtml(issuesLine)}</dd>
      <dt>License</dt><dd>${escapeHtml(licenseLine)}</dd>
      <dt>Citations</dt><dd>${escapeHtml(d.citations != null ? d.citations : "—")}</dd>
      ${tags ? `<dt>Tags</dt><dd><div class="chip-row">${tags}</div></dd>` : ""}
      ${topics ? `<dt>Repo topics</dt><dd><div class="chip-row">${topics}</div></dd>` : ""}
    </dl>

    ${missingNote}

    <div class="links">      ${paperLink}
      ${repoLink}
      <a href="methods/${encodeURIComponent(d.id)}/">▤ Full page, BibTeX &amp; corrections</a>
      <button type="button" id="drawer-copy-link" class="drawer-share-btn">⧉ Copy link to this method</button>
    </div>
    ${getStartedHtml(d)}
    ${(d.evidence || []).length ? `
    <section class="drawer-evidence">
      <h3>Evidence <span class="drawer-evidence-count">${d.evidence.length} paper${d.evidence.length === 1 ? "" : "s"} applying it per modality</span></h3>
      <ul class="evidence-list">${d.evidence.map((ev) => `<li><span class="chip">${escapeHtml(MODALITY_FACET_LABEL[ev.modality] || ev.modality)}</span> ${extLink(ev.doi ? `https://doi.org/${ev.doi}` : ev.url, `${escapeHtml(ev.title || "paper")}${ev.year ? ` (${escapeHtml(ev.year)})` : ""}`, "inline-link")}</li>`).join("")}</ul>
    </section>` : ""}
  `;

  drawer.classList.add("open");
  scrim.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");

  bindCopyButtons(content);
  content.querySelectorAll(".drawer-resource-link").forEach((b) => b.addEventListener("click", () => {
    closeDrawer();
    showResource(b.dataset.res);
  }));

  document.getElementById("drawer-copy-link").addEventListener("click", (e) => {
    const shareUrl = new URL(`methods/${encodeURIComponent(d.id)}/`, location.href.split(/[?#]/)[0]).href;
    navigator.clipboard.writeText(shareUrl).then(() => {
      e.target.textContent = "✓ Copied";
      setTimeout(() => { e.target.textContent = "⧉ Copy link to this method"; }, 1600);
    });
  });
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-scrim").classList.remove("open");
  document.getElementById("drawer").setAttribute("aria-hidden", "true");
}

/* ---------------- Compare panel ---------------- */

const COMPARE_ROWS = [
  ["Family", (d) => d.category_label],
  ["Level", (d) => LEVEL_LABELS[d.level] || d.level],
  ["Modality", (d) => d.modality || "—"],
  ["Method type", (d) => d.method_type],
  ["Validation data", (d) => d.validation_data || "Agnostic"],
  ["Paper year", (d) => d.paper_year || "—"],
  ["First commit", (d) => d.first_commit_date || "not fetched yet"],
  ["Last maintained", (d) => formatMaintenance(d.last_commit).text],
  ["Stars", (d) => (d.stars != null ? d.stars.toLocaleString() : "not fetched yet")],
  ["License", (d) => d.license || "—"],
  ["Language", (d) => (d.language || []).join(", ") || "—"],
  ["Toolboxes", (d) => {
    const names = state.toolboxes.filter((tb) => tb.methods.includes(d.id)).map((tb) => tb.name);
    return names.length ? names.join(", ") : "Standalone";
  }],
  ["GPU needed", (d) => (d.recommend && d.recommend.needs_gpu ? "Yes" : "No")],
  ["ML-compatible", (d) => (d.recommend && d.recommend.ml_compatible ? "Yes" : "No")],
];

function openComparePanel() {
  const selected = state.data.filter((d) => state.selectedIds.has(d.id));
  if (selected.length < 2) return;

  const content = document.getElementById("compare-content");
  const headerRow = selected.map((d) => `<th style="--box-color:${FAMILY_COLOR.get(d.category)}">${escapeHtml(d.name)}</th>`).join("");
  const bodyRows = COMPARE_ROWS.map(([label, fn]) => {
    const cells = selected.map((d) => `<td>${escapeHtml(String(fn(d)))}</td>`).join("");
    return `<tr><th class="row-label">${label}</th>${cells}</tr>`;
  }).join("");

  content.innerHTML = `
    <h2 style="font-family:var(--font-display);margin:0 0 16px;">Comparing ${selected.length} methods</h2>
    <div style="overflow-x:auto;">
      <table class="compare-table">
        <thead><tr><th></th>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;

  document.getElementById("compare-panel").classList.add("open");
  document.getElementById("compare-scrim").classList.add("open");
  document.getElementById("compare-panel").setAttribute("aria-hidden", "false");
}

function closeComparePanel() {
  document.getElementById("compare-panel").classList.remove("open");
  document.getElementById("compare-scrim").classList.remove("open");
  document.getElementById("compare-panel").setAttribute("aria-hidden", "true");
}

// Everything that comes from data files (methods.json, toolboxes.json, submissions)
// is contributor-supplied, so it is escaped before it goes into any HTML string —
// including quotes, since several values land inside attributes.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Only http(s) links are rendered; anything else (javascript:, data:, …) is dropped.
function safeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(String(u), location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch (e) {
    return null;
  }
}

// GitHub "owner/repo" slugs: letters, digits, '-', '_', '.' only.
function ghSlug(s) {
  return typeof s === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) ? s : null;
}

// <a> for an external link, or "" if the URL isn't a safe http(s) URL.
function extLink(u, text, cls = "") {
  const href = safeUrl(u);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${cls ? ` class="${cls}"` : ""}>${text}</a>` : "";
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------------- "Which method?" recommender (guided, ranked) ---------------- */
// Questions follow the order a harmonization expert would ask them:
//   1. What data?  2. In what form?  3. For what analysis?  4. What study design?
//   5–9. Sites, sample size, covariates, paired scans, data sharing.
//   10–13. Practical constraints (hardware, pretrained models, language, maintenance).
// Two kinds of question:
//   • hard filters remove methods that cannot work (each removal is explained);
//   • soft preferences keep everything but re-rank, adding a ✓ reason or a ⚠ caution.
// Every question can be skipped. Remaining methods are ranked by how well they fit
// your answers, then by evidence (citations) and maintenance.

const recState = {};
const REC_STEPS = [];
const REC_SKIP = "skip";
const REC_GROUPS = {
  data: { n: 1, title: "Your data", desc: "What you have: modality, form, design and how it was collected." },
  analysis: { n: 2, title: "Your analysis", desc: "What you'll do with the harmonized data." },
  setting: { n: 3, title: "Your setting", desc: "Where the data lives and the compute you have." },
  software: { n: 4, title: "Software", desc: "Implementation constraints." },
};

function recFamilyIsFederated(d) {
  return d.category === "federated" || (d.tags || []).includes("federated-capable");
}
function recHasPretrained(d) {
  if (d.has_pretrained_weights === true) return true;
  return state.toolboxes.some((tb) => tb.id === "neuroharm-kit" && tb.methods.includes(d.id));
}
function recMaintained(d) {
  if (d.last_commit) return formatMaintenance(d.last_commit).status !== "stale";
  return isToolboxMember(d.id);
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

REC_STEPS.push(
  {
    key: "modality", group: "data", legend: "What kind of data are you harmonizing?",
    help: "Methods designed for your modality rank first; methods only validated on it (via a published evaluation) are kept but flagged.",
    dynamicOptions(pool) {
      const counts = new Map();
      pool.forEach((d) => (d.modalities_tested || []).forEach((m) => counts.set(m, (counts.get(m) || 0) + 1)));
      const order = ["sMRI", "dMRI", "fMRI", "connectome", "EEG", "MEG", "PET", "CT", "radiomics", "omics", "histopathology"];
      return order.filter((m) => counts.has(m)).map((m) => [m, `${MODALITY_FACET_LABEL[m] || m}`]);
    },
    apply(pool, v, ctx) {
      const agnostic = (d) => (d.modalities_proposed || []).some((m) => m === "general" || m === "general-imaging");
      const after = pool.filter((d) => (d.modalities_tested || []).includes(v) || agnostic(d));
      after.forEach((d) => {
        const label = MODALITY_FACET_LABEL[v] || v;
        if ((d.modalities_proposed || []).includes(v)) ctx.boost(d, 3, `Designed for ${label}`);
        else if ((d.modalities_tested || []).includes(v)) {
          ctx.boost(d, 1.5, `Validated on ${label}`);
          ctx.caution(d, `Not originally designed for ${label}; see the evidence paper on its page`);
        } else {
          ctx.caution(d, "Modality-agnostic method; not specifically validated on this data");
        }
      });
      return { pool: after, message: `Kept ${plural(after.length, "method")} designed for, validated on, or agnostic to ${MODALITY_FACET_LABEL[v] || v}; removed ${pool.length - after.length}.` };
    },
  },
  {
    key: "level", group: "data", legend: "What exactly will you harmonize?",
    help: "This is the biggest split between method families.",
    options: [
      ["feature-level", "Derived features (ROI volumes, cortical thickness, connectivity, radiomic or EEG features)"],
      ["image-level", "Images or raw signals (voxels, time series)"],
      ["acquisition-level", "Nothing yet: I'm planning data collection"],
    ],
    apply(pool, v) {
      const after = pool.filter((d) => d.level === v);
      const what = { "feature-level": "feature-level", "image-level": "image-level", "acquisition-level": "acquisition/protocol" }[v];
      return { pool: after, message: pool.length > after.length ? `Kept ${what} methods; removed ${pool.length - after.length} working at a different level.` : null };
    },
  },
  {
    key: "design", group: "data", legend: "Is your data cross-sectional or longitudinal?",
    help: "Longitudinal = repeated scans of the same people over time. Feature-level statistical models must then account for within-subject correlation; per-image methods are unaffected.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["cross", "Cross-sectional (one scan per person)"], ["longitudinal", "Longitudinal (repeated scans over time)"]],
    apply(pool, v, ctx) {
      if (v !== "longitudinal") return { pool, message: null };
      const after = pool.filter((d) => d.level !== "feature-level" || (d.recommend && d.recommend.longitudinal === true));
      after.forEach((d) => {
        if (d.recommend && d.recommend.longitudinal === true) ctx.boost(d, 3, "Designed for longitudinal data");
        else ctx.caution(d, "Harmonizes each scan independently; check that within-subject change is preserved");
      });
      const removed = pool.length - after.length;
      return { pool: after, message: removed ? `Removed ${plural(removed, "feature-level method")} that assume independent samples (one per subject). Methods built for repeated measures, and per-image methods, stay.` : null };
    },
  },
  {
    key: "paired", group: "data", legend: "Do you have traveling subjects (the same people scanned at several sites)?",
    help: "Paired scans let some methods learn the site mapping directly; a few require them.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["yes", "Yes"], ["no", "No"]],
    apply(pool, v, ctx) {
      if (v === "yes") {
        pool.forEach((d) => { if (d.recommend && d.recommend.requires_paired_data === true) ctx.boost(d, 2, "Uses your traveling-subject scans"); });
        return { pool, message: null };
      }
      const after = pool.filter((d) => !(d.recommend && d.recommend.requires_paired_data === true));
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} that need paired or traveling-subject scans.` : null };
    },
  },
  {
    key: "hasSiteId", group: "data", legend: "Is every sample labelled with its site or scanner?",
    help: "Most methods need a batch label. Some (IQM-based, blind or reference-free) infer it.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["yes", "Yes"], ["no", "No or only partially"]],
    apply(pool, v) {
      if (v !== "no") return { pool, message: null };
      const after = pool.filter((d) => d.recommend && d.recommend.requires_site_id === false);
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} that need a site label for every sample.` : null };
    },
  },
  {
    key: "sampleSize", group: "data", legend: "How many samples does your smallest site have?",
    help: "Site effects are estimated per site; very small sites make those estimates unstable.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["small", "Fewer than ~30 samples"], ["large", "30 or more"]],
    soft: true,
    apply(pool, v, ctx) {
      if (v !== "small") return { pool, message: null };
      pool.forEach((d) => {
        if (d.recommend && d.recommend.low_n_friendly === true) ctx.boost(d, 2, "Works with small sites");
        else ctx.caution(d, "May be unstable with very small sites");
      });
      return { pool, message: "Kept every method; those robust to small sites now rank first." };
    },
  },
  {
    key: "task", group: "analysis", legend: "What will you do with the harmonized data?",
    help: "In prediction pipelines, harmonization must be fitted on training data only. Methods that need the outcome as a covariate leak it into the test set.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["statistical", "Statistical analysis (group differences, associations)"], ["ml", "Machine-learning prediction"]],
    apply(pool, v, ctx) {
      if (v !== "ml") return { pool, message: null };
      const after = pool.filter((d) => !(d.recommend && d.recommend.ml_compatible === false));
      after.forEach((d) => { if (d.category === "combat-family") ctx.boost(d, 1, "Leakage-safe in ML pipelines"); });
      const removed = pool.length - after.length;
      return { pool: after, message: removed ? `Removed ${plural(removed, "method")} (mostly ComBat-family) that use covariates, often your prediction target, to fit the model. That leaks test information. Leakage-safe variants such as PrettYharmonize stay.` : null };
    },
  },
  {
    key: "nonlinear", group: "analysis", legend: "Do your biological covariates have nonlinear effects?",
    help: "For example, age across the lifespan. Linear-only models then misattribute part of the biology to site.",
    visibleIf: (pool, rs) => rs.level === "feature-level" && pool.some((d) => d.recommend && d.recommend.requires_linear_signal === true),
    options: [["yes", "Yes (e.g. wide age range)"], ["no", "No, roughly linear"]],
    apply(pool, v) {
      if (v !== "yes") return { pool, message: null };
      const after = pool.filter((d) => !(d.recommend && d.recommend.requires_linear_signal === true));
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} that assume linear covariate effects.` : null };
    },
  },
  {
    key: "newSite", group: "analysis", legend: "Will new sites or scanners need harmonizing later?",
    help: "For example, applying a trained classifier to data from a hospital that wasn't in your training set.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["yes", "Yes, unseen sites will come later"], ["no", "No, all sites are known now"]],
    apply(pool, v, ctx) {
      if (v !== "yes") return { pool, message: null };
      const after = pool.filter((d) => d.recommend && d.recommend.generalizes_to_new_site === true);
      after.forEach((d) => ctx.boost(d, 1, "Can be applied to unseen sites"));
      const removed = pool.length - after.length;
      return { pool: after, message: removed ? `Removed ${plural(removed, "method")} that must be refitted with every site present.` : null };
    },
  },
  {
    key: "pooling", group: "setting", legend: "Can all sites' data be brought together in one place?",
    help: "If data can't leave each site (privacy, regulation), you need a federated or distributed method.",
    visibleIf: (pool, rs) => rs.level !== "acquisition-level",
    options: [["yes", "Yes, data can be centralized"], ["no", "No, data must stay at each site"]],
    apply(pool, v, ctx) {
      if (v !== "no") return { pool, message: null };
      const after = pool.filter(recFamilyIsFederated);
      after.forEach((d) => ctx.boost(d, 1, "Works without pooling data"));
      return { pool: after, message: pool.length > after.length ? `Kept only federated or distributed methods; removed ${pool.length - after.length} that need centralized data.` : null };
    },
  },
  {
    key: "hasGpu", group: "setting", legend: "Do you have access to a GPU?",
    help: "Asked only because deep-learning methods are still in the list.",
    visibleIf: (pool) => pool.some((d) => d.needs_gpu),
    options: [["yes", "Yes"], ["no", "No, CPU only"]],
    apply(pool, v) {
      if (v !== "no") return { pool, message: null };
      const after = pool.filter((d) => !d.needs_gpu);
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} that need a GPU to be practical.` : null };
    },
  },
  {
    key: "pretrained", group: "setting", legend: "Do you need something that works without training?",
    help: "Pretrained models (or bundles like NeuroHarm-kit) can be applied directly.",
    visibleIf: (pool) => pool.some(recHasPretrained),
    options: [["yes", "Yes, prefer ready-to-use models"], ["no", "No, I can train"]],
    soft: true,
    apply(pool, v, ctx) {
      if (v !== "yes") return { pool, message: null };
      pool.forEach((d) => { if (recHasPretrained(d)) ctx.boost(d, 2, "Pretrained weights available"); else if (d.method_type === "deep-learning") ctx.caution(d, "You'd need to train it on your data"); });
      return { pool, message: "Kept every method; ready-to-use models now rank first." };
    },
  },
  {
    key: "code", group: "software", legend: "Do you need a public implementation?",
    help: "Many methods in the database are paper-only. Say yes to keep only methods with a public repository, package or toolbox.",
    options: [["yes", "Yes, only methods with public code"], ["no", "No, a paper is enough"]],
    apply(pool, v) {
      if (v !== "yes") return { pool, message: null };
      const after = pool.filter(hasPublicCode);
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} with no public code.` : null };
    },
  },
  {
    key: "language", group: "software", legend: "Which language do you need the implementation in?",
    help: "All languages in the database are listed, with how many of your current matches have code in each. If none do, you'll see the best matches in other languages instead.",
    dynamicOptions(pool) {
      const all = new Map();
      state.data.forEach((d) => (d.language || []).forEach((l) => all.set(l, 0)));
      pool.forEach((d) => (d.language || []).forEach((l) => all.set(l, (all.get(l) || 0) + 1)));
      return [...all.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l, n]) => [l, `${l} (${n})`]);
    },
    apply(pool, v, ctx) {
      const after = pool.filter((d) => (d.language || []).includes(v));
      if (after.length === 0) {
        pool.forEach((d) => ctx.caution(d, `No ${v} implementation; you'd need to port it or call it from ${v}`));
        return { pool, message: `None of the matching methods has a ${v} implementation, so nothing was removed. They are shown ranked as before, flagged as needing a port.`, soft: true };
      }
      after.forEach((d) => ctx.boost(d, 0.5, `${v} implementation available`));
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} with no ${v} implementation.` : null };
    },
  },
  {
    key: "maintained", group: "software", legend: "Do you need actively maintained code?",
    help: "\"Maintained\" means a commit in the last 2 years, or upkeep through a toolbox.",
    options: [["yes", "Yes, maintained code only"], ["no", "No, I can work with older code"]],
    apply(pool, v) {
      if (v !== "yes") return { pool, message: null };
      const after = pool.filter(recMaintained);
      return { pool: after, message: pool.length > after.length ? `Removed ${plural(pool.length - after.length, "method")} with no maintained code.` : null };
    },
  },
);
const REC_KEYS = REC_STEPS.map((s) => s.key);
// Old share links used different keys/values; map them onto the new questions.
const REC_LEGACY = { linear: (v) => ["nonlinear", v === "no" ? "yes" : v === "yes" ? "no" : REC_SKIP],
  federated: (v) => ["pooling", v === "yes" ? "no" : "yes"] };

function resetRecommender() {
  REC_KEYS.forEach((k) => { delete recState[k]; });
  renderRecommenderTree();
}

function buildRecommender() {
  const root = document.getElementById("recommend-root");
  root.innerHTML = `
    <div class="recommend-wrap">
      <div class="recommend-toolbar">
        <div class="recommend-intro">
          <p>Answer as many questions as you like: each one narrows or re-ranks the list on the right.
          <strong>Filters</strong> remove methods that can't work for you (each removal is explained);
          <strong>preferences</strong> only re-rank. Skip any question you're unsure about.</p>
          <p class="rec-intro-note">Answers rely on per-method flags and published evidence in the database. Treat the result as a shortlist to read about, not a verdict.</p>
        </div>
        <button id="compare-toggle-rec" type="button" class="compare-toggle-btn">Compare mode: off</button>
      </div>
      <div class="rec-columns">
        <div id="rec-tree" class="rec-tree"></div>
        <div id="rec-methods-panel" class="rec-methods-panel"></div>
      </div>
    </div>
  `;
  document.getElementById("compare-toggle-rec").addEventListener("click", toggleCompareMode);
  renderRecommenderTree();
}

function recContext() {
  const boosts = new Map(), cautions = new Map();
  return {
    boosts, cautions,
    boost(d, pts, why) { if (!boosts.has(d.id)) boosts.set(d.id, []); boosts.get(d.id).push({ pts, why }); },
    caution(d, why) { if (!cautions.has(d.id)) cautions.set(d.id, []); cautions.get(d.id).push(why); },
  };
}

function renderRecommenderTree() {
  const treeEl = document.getElementById("rec-tree");
  const methodsEl = document.getElementById("rec-methods-panel");
  treeEl.innerHTML = "";
  let pool = state.data.slice();
  const ctx = recContext();
  const visibleSteps = [];
  let current = null;
  let lastGroup = null;
  let groupEl = null;

  for (const step of REC_STEPS) {
    if (step.visibleIf && !step.visibleIf(pool, recState)) continue;
    visibleSteps.push(step);
    const answer = recState[step.key];
    let message = null;
    let softMsg = false;
    if (answer != null && answer !== REC_SKIP) {
      const res = step.apply(pool, answer, ctx);
      pool = res.pool;
      message = res.message;
      softMsg = !!res.soft;
    }
    if (step.group !== lastGroup) {
      const g = REC_GROUPS[step.group];
      groupEl = document.createElement("section");
      groupEl.className = "rec-section";
      groupEl.innerHTML = `<header class="rec-section-head"><span class="rec-section-n">${g.n}</span><div><h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.desc)}</p></div></header>`;
      treeEl.appendChild(groupEl);
      lastGroup = step.group;
    }
    renderStep(groupEl, step, answer, message, visibleSteps.length, softMsg);
    if (answer == null) { current = step; break; }
  }

  const answered = REC_KEYS.filter((k) => recState[k] != null).length;
  const actionsRow = document.createElement("div");
  actionsRow.className = "rec-actions-row";
  if (answered) {
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.id = "rec-reset";
    resetBtn.textContent = "↺ Start over";
    resetBtn.addEventListener("click", resetRecommender);
    actionsRow.appendChild(resetBtn);
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.id = "rec-share";
    shareBtn.textContent = "⧉ Share these answers";
    shareBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(shareableRecommendationUrl()).then(() => {
        shareBtn.textContent = "✓ Link copied";
        setTimeout(() => { shareBtn.textContent = "⧉ Share these answers"; }, 1600);
      });
    });
    actionsRow.appendChild(shareBtn);
  }
  if (!current) {
    const done = document.createElement("p");
    done.className = "rec-done";
    done.textContent = "All questions answered. Click a method for details, or switch on compare mode to put a few side by side.";
    treeEl.appendChild(done);
  }
  treeEl.appendChild(actionsRow);
  renderMethodsPanel(methodsEl, pool, ctx, !current);
}

function shareableRecommendationUrl() {
  const parts = REC_KEYS.filter((k) => recState[k] != null).map((k) => `${k}:${recState[k]}`);
  const params = new URLSearchParams({ rec: parts.join(",") });
  return `${location.origin}${location.pathname}?${params.toString()}#recommend`;
}

function loadRecommendationFromUrl() {
  const raw = new URLSearchParams(location.search).get("rec");
  if (!raw) return false;
  raw.split(",").forEach((pair) => {
    const i = pair.indexOf(":");
    if (i < 1) return;
    let key = pair.slice(0, i), value = pair.slice(i + 1);
    if (REC_LEGACY[key]) [key, value] = REC_LEGACY[key](value);
    if (key === "language" && value === "no-preference") value = REC_SKIP;
    if (REC_KEYS.includes(key) && value) recState[key] = value;
  });
  // Questions before the last shared answer that weren't answered count as skipped,
  // so the whole shared path is applied instead of stopping at the first gap.
  const last = Math.max(-1, ...REC_KEYS.map((k, i) => (recState[k] != null ? i : -1)));
  REC_KEYS.slice(0, last).forEach((k) => { if (recState[k] == null) recState[k] = REC_SKIP; });
  return true;
}

function renderStep(container, step, answer, message, number, softMsg = false) {
  const fs = document.createElement("fieldset");
  fs.className = "rec-question" + (answer == null ? " current" : " answered");
  fs.innerHTML = `
    <legend><span class="rec-num">${number}</span>${escapeHtml(step.legend)}${step.soft ? ' <span class="rec-kind">preference</span>' : ""}</legend>
    <p class="rec-help">${escapeHtml(step.help)}</p>
    <div class="rec-step-message"></div>
    <div class="rec-options"></div>
  `;
  container.appendChild(fs);
  if (message) {
    fs.querySelector(".rec-step-message").innerHTML = `<p class="${step.soft || softMsg ? "rec-special-note" : "rec-excluded-note"}">${step.soft ? "Re-ranked:" : softMsg ? "Note:" : "✕"} ${escapeHtml(message)}</p>`;
  }
  const options = (step.dynamicOptions ? step.dynamicOptions(recPoolBefore(step)) : step.options).concat([[REC_SKIP, "Skip / not sure"]]);
  const optsWrap = fs.querySelector(".rec-options");
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill" + (answer === value ? " active" : "") + (value === REC_SKIP ? " rec-skip" : "");
    btn.setAttribute("aria-pressed", String(answer === value));
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (recState[step.key] === value) delete recState[step.key]; else recState[step.key] = value;
      // changing an earlier answer can hide later questions; drop answers that no longer apply
      renderRecommenderTree();
    });
    optsWrap.appendChild(btn);
  });
}

// pool as it stands right before `step` (for dynamic options like modality/language)
function recPoolBefore(target) {
  let pool = state.data.slice();
  const ctx = recContext();
  for (const step of REC_STEPS) {
    if (step === target) return pool;
    if (step.visibleIf && !step.visibleIf(pool, recState)) continue;
    const a = recState[step.key];
    if (a != null && a !== REC_SKIP) pool = step.apply(pool, a, ctx).pool;
  }
  return pool;
}

function recScore(d, ctx) {
  const fit = (ctx.boosts.get(d.id) || []).reduce((s, b) => s + b.pts, 0);
  const evidence = typeof d.citations === "number" ? Math.log10(d.citations + 1) * 0.8 : 0;
  let upkeep = 0;
  const h = codeHealth(d);
  if (h) upkeep = (h.score / 100) * 1.5;
  else if (d.last_commit) upkeep = { active: 1.2, slowing: 0.6, stale: 0 }[formatMaintenance(d.last_commit).status];
  else if (isToolboxMember(d.id)) upkeep = 0.8;
  const code = d.github || d.other_url || isToolboxMember(d.id) ? 0.5 : 0;
  return { total: fit + evidence + upkeep + code, fit };
}

function renderMethodsPanel(container, pool, ctx = recContext(), finished = false) {
  container.innerHTML = "";
  const head = document.createElement("h3");
  head.className = "rec-methods-heading";
  head.textContent = `${plural(pool.length, "method")} ${finished ? "match" : "still in the running"}`;
  container.appendChild(head);
  if (pool.length === 0) {
    container.insertAdjacentHTML("beforeend", `<p class="rec-excluded-note">Nothing satisfies every answer. Try "Skip / not sure" on the most recent filter.</p>`);
    return;
  }
  // A caution shared by every remaining method says nothing about the choice between
  // them — show it once above the list instead of on every card.
  const shared = [...new Set(pool.flatMap((d) => ctx.cautions.get(d.id) || []))]
    .filter((c) => pool.every((d) => (ctx.cautions.get(d.id) || []).includes(c)));
  if (shared.length) {
    pool.forEach((d) => ctx.cautions.set(d.id, (ctx.cautions.get(d.id) || []).filter((c) => !shared.includes(c))));
    container.insertAdjacentHTML("beforeend", `<ul class="rec-caution rec-shared">${shared.map((c) => `<li>⚠ Applies to all of these: ${escapeHtml(c.charAt(0).toLowerCase() + c.slice(1))}</li>`).join("")}</ul>`);
  }
  const ranked = pool.map((d) => ({ d, ...recScore(d, ctx) })).sort((a, b) => b.total - a.total || a.d.name.localeCompare(b.d.name));
  const top = ranked.slice(0, 8);
  const rest = ranked.slice(8);
  const list = document.createElement("ol");
  list.className = "rec-ranked";
  top.forEach(({ d }, i) => list.appendChild(recCard(d, ctx, i + 1)));
  container.appendChild(list);
  if (rest.length) {
    const more = document.createElement("details");
    more.className = "rec-more";
    more.innerHTML = `<summary>${plural(rest.length, "more method")} in the running</summary>`;
    const flow = document.createElement("div");
    flow.className = "box-flow";
    rest.forEach(({ d }) => {
      const box = makeBox(d);
      if (d.preserves_biology === false) {
        box.classList.add("box-bio-warn");
        box.title = `${d.name}: ${BIOLOGY_WARNING}`;
        const w = document.createElement("span");
        w.className = "box-bio-flag";
        w.setAttribute("aria-label", BIOLOGY_WARNING);
        w.textContent = "⚠";
        box.appendChild(w);
      }
      flow.appendChild(box);
    });
    more.appendChild(flow);
    container.appendChild(more);
  }
  const how = document.createElement("p");
  how.className = "rec-how";
  how.textContent = "Ranked by how well each method fits your answers, then by citations and code health.";
  container.appendChild(how);
}

function recCard(d, ctx, rank) {
  const li = document.createElement("li");
  li.className = "rec-card" + (state.compareMode && state.selectedIds.has(d.id) ? " selected" : "");
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  const reasons = (ctx.boosts.get(d.id) || []).map((b) => b.why);
  const cautions = [...(ctx.cautions.get(d.id) || [])];
  if (d.preserves_biology === false) cautions.unshift(BIOLOGY_WARNING);
  const maint = d.last_commit ? formatMaintenance(d.last_commit) : null;
  const meta = [
    d.paper_year ? String(d.paper_year) : null,
    typeof d.citations === "number" ? `${d.citations.toLocaleString()} citations` : null,
    (d.language || []).join(", ") || null,
  ].filter(Boolean).map(escapeHtml).join(" · ");
  li.innerHTML = `
    <div class="rec-card-head">
      <span class="rec-rank">${rank}</span>
      <span class="tbl-dot" style="background:${FAMILY_COLOR.get(d.category) || "#888"}"></span>
      <strong>${escapeHtml(d.name)}</strong>
      ${maint ? `<span class="maint-badge maint-${maint.status}">${STATUS_LABEL[maint.status]}</span>` : (isToolboxMember(d.id) ? `<span class="maint-badge maint-toolbox">toolbox</span>` : "")}
      ${healthBadge(codeHealth(d))}
    </div>
    <p class="rec-card-meta">${escapeHtml(familyShort(d))}${meta ? ` · ${meta}` : ""}</p>
    ${reasons.length ? `<ul class="rec-why">${reasons.map((r) => `<li>✓ ${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
    ${cautions.length ? `<ul class="rec-caution">${cautions.map((r) => `<li>⚠ ${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
    <a class="rec-card-link" href="methods/${encodeURIComponent(d.id)}/">Full page &amp; BibTeX →</a>`;
  const activate = (e) => {
    if (e.target.closest("a")) return;
    if (state.compareMode) {
      if (state.selectedIds.has(d.id)) state.selectedIds.delete(d.id); else state.selectedIds.add(d.id);
      li.classList.toggle("selected", state.selectedIds.has(d.id));
      updateCompareBar();
    } else {
      openDrawer(d);
    }
  };
  li.addEventListener("click", activate);
  li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(e); } });
  return li;
}


init();
