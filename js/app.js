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
  ["acquisition-protocol", "Acquisition / Protocol Harmonization", "#a3b1c2"],
];
const FAMILY_COLOR = new Map(FAMILY_ORDER.map(([id, , color]) => [id, color]));
const FAMILY_LABEL = new Map(FAMILY_ORDER.map(([id, label]) => [id, label]));

const STAR_BUCKETS = ["0", "1–9", "10–49", "50–199", "200–999", "1000+"];

const state = {
  data: [],
  toolboxes: [],
  groupBy: "level",
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

  root.querySelectorAll(".home-cta").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

/* ---------------- Add a model tab ---------------- */

const MODALITY_OPTIONS = [
  "Structural MRI", "Diffusion MRI", "Functional MRI", "Radiomics (CT/MRI)",
  "Omics/Proteomics", "EEG", "Medical imaging (general, not MRI-brain-specific)",
  "Modality-agnostic (general ML)", "Acquisition (modality-agnostic)", "MRI (unspecified)", "Other",
];
const ARCHITECTURE_OPTIONS = [
  "VAE", "GAN", "CycleGAN", "StarGAN", "VAE-GAN", "Disentangled VAE",
  "Autoencoder", "Adversarial network", "Adversarial autoencoder",
  "Normalizing flow", "Energy-based model", "U-Net (CNN)", "Transformer",
  "Diffusion model", "Other",
];

const addModelState = {
  name: "", paperUrl: "", codeUrl: "", paperYear: "",
  category: "combat-family", level: "feature-level", methodType: "statistical",
  modality: "", modalityOther: "", language: "", tags: "", validationData: "",
  architecture: "", architectureOther: "", framework: "",
  hasPretrainedWeights: null, pretrainedWeightsUrl: "",
  requiresSiteId: null, generalizesToNewSite: null, lowNFriendly: null,
  requiresLinearSignal: null, mlCompatible: null, needsGpu: null,
  inUniharmony: null, alsoImplementedIn: "",
  fetchedRepo: null,
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

function buildAddModelTab() {
  const root = document.getElementById("add-model-root");
  root.innerHTML = `
    <div class="addmodel-wrap">
      <p class="addmodel-intro">
        Know a harmonization method that's missing? Fill in what you know — only the
        name, paper link, and source code link are required, everything else is
        optional and helps but isn't a blocker. Submitting doesn't touch the live
        database directly (this is a static site with no backend to write to) — it
        opens a pre-filled GitHub page proposing a new file under
        <code>data/submissions/</code>, which becomes a real pull request. Once merged,
        an Action automatically folds it into the main database and refreshes GitHub
        stats — the site rebuilds and you'll need to reload after that finishes.
      </p>

      <div class="addmodel-section">
        <h3>Required</h3>
        <label class="addmodel-field">
          <span>Method name*</span>
          <input type="text" id="am-name" placeholder="e.g. My Harmonization Method">
        </label>
        <label class="addmodel-field">
          <span>Paper link*</span>
          <input type="url" id="am-paper" placeholder="https://doi.org/... or arXiv link">
        </label>
        <label class="addmodel-field">
          <span>Source code link* (GitHub or GitLab)</span>
          <input type="url" id="am-code" placeholder="https://github.com/owner/repo">
        </label>
        <div id="am-fetch-status" class="addmodel-fetch-status"></div>
      </div>

      <div class="addmodel-section">
        <h3>Classification</h3>
        <label class="addmodel-field">
          <span>Family</span>
          <select id="am-category"></select>
        </label>
        <div class="addmodel-field">
          <span>Harmonization level</span>
          <div class="rec-options" id="am-level"></div>
        </div>
        <label class="addmodel-field">
          <span>Method type</span>
          <select id="am-methodtype">
            <option value="statistical">Statistical</option>
            <option value="deep-learning">Deep learning</option>
            <option value="machine-learning">Machine learning</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="addmodel-field">
          <span>Data modality</span>
          <select id="am-modality"></select>
        </label>
        <label class="addmodel-field addmodel-field-hidden" id="am-modality-other-wrap">
          <span>Modality (other)</span>
          <input type="text" id="am-modality-other" placeholder="describe it">
        </label>
        <label class="addmodel-field">
          <span>Programming language(s)</span>
          <input type="text" id="am-language" placeholder="Python, R, MATLAB…">
        </label>
      </div>

      <div class="addmodel-section" id="am-dl-section">
        <h3>Deep learning specifics</h3>
        <label class="addmodel-field">
          <span>Architecture backbone</span>
          <select id="am-architecture"></select>
        </label>
        <label class="addmodel-field addmodel-field-hidden" id="am-architecture-other-wrap">
          <span>Architecture (other)</span>
          <input type="text" id="am-architecture-other" placeholder="describe it">
        </label>
        <label class="addmodel-field">
          <span>Framework</span>
          <input type="text" id="am-framework" placeholder="PyTorch, TensorFlow…">
        </label>
        <div class="addmodel-field">
          <span>Needs a GPU?</span>
          <div class="rec-options" id="am-needsgpu"></div>
        </div>
        <div class="addmodel-field">
          <span>Pretrained weights available?</span>
          <div class="rec-options" id="am-weights"></div>
        </div>
        <label class="addmodel-field addmodel-field-hidden" id="am-weightsurl-wrap">
          <span>Weights link</span>
          <input type="url" id="am-weightsurl" placeholder="https://…">
        </label>
      </div>

      <div class="addmodel-section">
        <h3>Compatibility <span class="addmodel-section-note">(used by the "Which method?" tab — leave anything unsure blank)</span></h3>
        <div class="addmodel-field"><span>Requires a Site ID?</span><div class="rec-options" id="am-sitereq"></div></div>
        <div class="addmodel-field"><span>Generalizes to a new, unseen site?</span><div class="rec-options" id="am-newsite"></div></div>
        <div class="addmodel-field"><span>Works well with small per-site N?</span><div class="rec-options" id="am-lown"></div></div>
        <div class="addmodel-field" id="am-linear-wrap"><span>Assumes a linear biological signal?</span><div class="rec-options" id="am-linear"></div></div>
        <div class="addmodel-field"><span>Safe to use ahead of an ML pipeline (no leakage)?</span><div class="rec-options" id="am-mlok"></div></div>
      </div>

      <div class="addmodel-section">
        <h3>Extra</h3>
        <label class="addmodel-field">
          <span>Publication year</span>
          <input type="number" id="am-year" min="1990" max="2100">
        </label>
        <label class="addmodel-field">
          <span>Validation data</span>
          <input type="text" id="am-data" placeholder="Agnostic, or e.g. ADNI, ABCD…">
        </label>
        <label class="addmodel-field">
          <span>Tags</span>
          <input type="text" id="am-tags" placeholder="comma, separated, tags">
        </label>
        <div class="addmodel-field"><span>Implemented in UniHarmony?</span><div class="rec-options" id="am-uniharmony"></div></div>
        <label class="addmodel-field">
          <span>Also implemented in (other toolkits)</span>
          <input type="text" id="am-alsoin" placeholder="e.g. UniHarmony">
        </label>
      </div>

      <div class="addmodel-submit-row">
        <button type="button" id="am-generate">Generate submission</button>
        <span id="am-validation-msg" class="addmodel-validation-msg"></span>
      </div>

      <div id="am-output" class="addmodel-output hidden">
        <h3>Preview</h3>
        <pre id="am-json-preview" class="addmodel-json"></pre>
        <div class="addmodel-output-actions">
          <button type="button" id="am-submit-github">↗ Open GitHub to submit</button>
          <button type="button" id="am-copy-json">Copy JSON</button>
        </div>
        <p class="addmodel-output-note">
          Opens a new tab with this file pre-filled. If you're not a repo collaborator,
          GitHub automatically forks the repo and proposes this as a pull request when
          you click "Propose new file" — you don't need write access.
        </p>
      </div>
    </div>
  `;

  populateSelect("am-category", FAMILY_ORDER.map(([id, label]) => [id, label]), addModelState.category);
  populateSelect("am-modality", MODALITY_OPTIONS.map((m) => [m, m]), "");
  populateSelect("am-architecture", ARCHITECTURE_OPTIONS.map((a) => [a, a]), "");

  makeToggleGroup("am-level", [["feature-level", "Feature-level"], ["image-level", "Image-level"], ["acquisition-level", "Acquisition-level"]], addModelState, "level");
  makeToggleGroup("am-needsgpu", [["yes", "Yes"], ["no", "No"]], addModelState, "needsGpu");
  makeToggleGroup("am-weights", [["yes", "Yes"], ["no", "No"]], addModelState, "hasPretrainedWeights", () => {
    document.getElementById("am-weightsurl-wrap").classList.toggle("addmodel-field-hidden", addModelState.hasPretrainedWeights !== "yes");
  });
  makeToggleGroup("am-sitereq", [["yes", "Yes"], ["no", "No"]], addModelState, "requiresSiteId");
  makeToggleGroup("am-newsite", [["yes", "Yes"], ["no", "No"]], addModelState, "generalizesToNewSite");
  makeToggleGroup("am-lown", [["yes", "Yes"], ["no", "No"]], addModelState, "lowNFriendly");
  makeToggleGroup("am-linear", [["yes", "Yes"], ["no", "No"], ["na", "N/A"]], addModelState, "requiresLinearSignal");
  makeToggleGroup("am-mlok", [["yes", "Yes"], ["no", "No"]], addModelState, "mlCompatible");
  makeToggleGroup("am-uniharmony", [["yes", "Yes"], ["no", "No"]], addModelState, "inUniharmony");

  document.getElementById("am-modality").addEventListener("change", (e) => {
    document.getElementById("am-modality-other-wrap").classList.toggle("addmodel-field-hidden", e.target.value !== "Other");
  });
  document.getElementById("am-architecture").addEventListener("change", (e) => {
    document.getElementById("am-architecture-other-wrap").classList.toggle("addmodel-field-hidden", e.target.value !== "Other");
  });
  document.getElementById("am-methodtype").addEventListener("change", (e) => {
    document.getElementById("am-dl-section").classList.toggle("addmodel-field-hidden", e.target.value !== "deep-learning");
    document.getElementById("am-linear-wrap").classList.toggle("addmodel-field-hidden", e.target.value === "deep-learning" && addModelState.level === "image-level");
  });
  document.getElementById("am-level").addEventListener("click", () => {
    document.getElementById("am-linear-wrap").classList.toggle("addmodel-field-hidden", addModelState.level === "image-level");
  });
  document.getElementById("am-dl-section").classList.toggle("addmodel-field-hidden", addModelState.methodType !== "deep-learning");

  document.getElementById("am-code").addEventListener("change", (e) => fetchRepoPreview(e.target.value));
  document.getElementById("am-generate").addEventListener("click", generateSubmission);
  document.getElementById("am-copy-json").addEventListener("click", () => {
    navigator.clipboard.writeText(document.getElementById("am-json-preview").textContent);
  });
}

function populateSelect(id, options, defaultValue) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">— select —</option>` + options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");
  if (defaultValue) sel.value = defaultValue;
}

function makeToggleGroup(containerId, options, targetState, key, onChange) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill";
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      targetState[key] = targetState[key] === value ? null : value;
      wrap.querySelectorAll(".rec-pill").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      if (targetState[key] === value) { btn.classList.add("active"); btn.setAttribute("aria-pressed", "true"); }
      if (onChange) onChange();
    });
    wrap.appendChild(btn);
  });
}

async function fetchRepoPreview(url) {
  const status = document.getElementById("am-fetch-status");
  const m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)\/?$/);
  if (!m) {
    status.textContent = url.includes("gitlab.com") || url.includes("gitlab.")
      ? "GitLab link noted — auto-fetch only works for github.com links, that's fine, just fill in language/etc. manually."
      : "";
    addModelState.fetchedRepo = null;
    return;
  }
  const repo = `${m[1]}/${m[2]}`;
  status.textContent = `Fetching ${repo}…`;
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!resp.ok) {
      status.textContent = resp.status === 403 ? "Rate limited by GitHub — fill in details manually." : `Repo not found (HTTP ${resp.status}) — check the link.`;
      return;
    }
    const data = await resp.json();
    addModelState.fetchedRepo = repo;
    status.textContent = `✓ Found: ${data.stargazers_count} ★, ${data.language || "language unknown"}, ${data.license ? data.license.spdx_id : "no license"}${data.archived ? " (archived)" : ""}`;
    if (data.language && !document.getElementById("am-language").value) {
      document.getElementById("am-language").value = data.language;
    }
  } catch (e) {
    status.textContent = "Couldn't reach GitHub from here — fill in details manually.";
  }
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "new-method";
}

function toBool(v) {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null; // covers null and "na"
}

function generateSubmission() {
  const name = document.getElementById("am-name").value.trim();
  const paperUrl = document.getElementById("am-paper").value.trim();
  const codeUrl = document.getElementById("am-code").value.trim();
  const msg = document.getElementById("am-validation-msg");

  if (!name || !paperUrl || !codeUrl) {
    msg.textContent = "Name, paper link, and source code link are all required.";
    return;
  }
  msg.textContent = "";

  const category = document.getElementById("am-category").value || "deep-learning";
  const level = addModelState.level || "feature-level";
  const methodType = document.getElementById("am-methodtype").value;
  let modality = document.getElementById("am-modality").value;
  if (modality === "Other") modality = document.getElementById("am-modality-other").value.trim() || "MRI (unspecified)";
  const language = document.getElementById("am-language").value.split(",").map((s) => s.trim()).filter(Boolean);
  const tags = document.getElementById("am-tags").value.split(",").map((s) => s.trim()).filter(Boolean);
  const validationData = document.getElementById("am-data").value.trim() || "Agnostic";
  const yearVal = document.getElementById("am-year").value;
  const alsoIn = document.getElementById("am-alsoin").value.split(",").map((s) => s.trim()).filter(Boolean);

  const isGithub = /^https?:\/\/github\.com\//.test(codeUrl);
  let architecture = null, framework = null;
  if (methodType === "deep-learning") {
    architecture = document.getElementById("am-architecture").value;
    if (architecture === "Other") architecture = document.getElementById("am-architecture-other").value.trim() || null;
    framework = document.getElementById("am-framework").value.trim() || null;
  }

  const id = slugify(name);
  const familyLabel = (FAMILY_ORDER.find(([fid]) => fid === category) || [, category])[1];

  const entry = {
    id,
    name,
    category,
    category_label: familyLabel,
    method_type: methodType,
    level,
    tags,
    paper_title: null,
    paper_year: yearVal ? Number(yearVal) : null,
    paper_url: paperUrl,
    abstract: null,
    github: isGithub ? codeUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") : null,
    other_url: isGithub ? null : codeUrl,
    language,
    citations: null,
    stars: null, forks: null, open_issues: null, license: null, topics: null,
    archived: null, repo_created_at: null, first_commit_date: null,
    last_commit: null, repo_description: null, stats_fetched_at: null,
    validation_data: validationData,
    modality: modality || "MRI (unspecified)",
    in_uniharmony: toBool(addModelState.inUniharmony) === true,
    also_implemented_in: alsoIn,
    needs_gpu: methodType === "deep-learning" ? (toBool(addModelState.needsGpu) ?? true) : false,
    architecture_backbone: architecture,
    framework,
    has_pretrained_weights: toBool(addModelState.hasPretrainedWeights),
    pretrained_weights_url: toBool(addModelState.hasPretrainedWeights) ? (document.getElementById("am-weightsurl").value.trim() || null) : null,
    recommend: {
      requires_site_id: toBool(addModelState.requiresSiteId) ?? true,
      generalizes_to_new_site: toBool(addModelState.generalizesToNewSite) ?? false,
      low_n_friendly: toBool(addModelState.lowNFriendly) ?? false,
      requires_linear_signal: addModelState.requiresLinearSignal === "na" ? null : toBool(addModelState.requiresLinearSignal),
      ml_compatible: toBool(addModelState.mlCompatible) ?? (category !== "combat-family"),
      needs_gpu: methodType === "deep-learning" ? (toBool(addModelState.needsGpu) ?? true) : false,
    },
    _submitted_via: "add-a-model form",
    _submitted_at: new Date().toISOString(),
  };

  const json = JSON.stringify(entry, null, 2);
  document.getElementById("am-json-preview").textContent = json;
  document.getElementById("am-output").classList.remove("hidden");

  document.getElementById("am-submit-github").onclick = () => {
    const filename = `data/submissions/${id}.json`;
    const url = `https://github.com/N-Nieto/HarmonizationZoo/new/main?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(json)}`;
    window.open(url, "_blank");
  };

  document.getElementById("am-output").scrollIntoView({ behavior: "smooth", block: "start" });
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
 * under data/submissions-stats/<id>.json and opens GitHub's pre-filled
 * new-file page for it — same pattern as the "Add a model" tab. A
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

  const filename = `data/submissions-stats/${Date.now()}.json`;
  const payload = JSON.stringify({ updates: sessionUpdates, fetched_at: new Date().toISOString() }, null, 2);
  const url = `https://github.com/N-Nieto/HarmonizationZoo/new/main?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(payload)}`;
  window.open(url, "_blank");
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
    if (e.key === "Escape") { closeDrawer(); closeComparePanel(); }
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

const VALID_TABS = ["home", "explore", "recommend", "toolboxes", "add"];

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
  if (d.publication_type === "preprint" || d.venue === "arXiv" || d.venue === "bioRxiv") return ["preprint"];
  return ["peer-reviewed"];
}
const FACETS = [
  { key: "modality", label: "Tested on", values: (d) => d.modalities_tested || [],
    labelOf: (v) => MODALITY_FACET_LABEL[v] || v },
  { key: "family", label: "Family", values: (d) => [d.category],
    labelOf: (v) => FAMILY_SHORT[v] || FAMILY_LABEL.get(v) || v },
  { key: "language", label: "Language", values: (d) => (d.language && d.language.length ? d.language : ["none"]),
    labelOf: (v) => (v === "none" ? "No code listed" : v) },
  { key: "code", label: "Code", values: (d) => [d.github || d.other_url || isToolboxMember(d.id) ? "yes" : "no"],
    labelOf: (v) => (v === "yes" ? "Has public code" : "No public code"), order: ["yes", "no"] },
  { key: "maintenance", label: "Maintenance", values: maintenanceFacet,
    labelOf: (v) => ({ active: "Active (< 6 mo)", slowing: "Slowing (< 2 y)", stale: "Stale (2 y+)", toolbox: "Via a toolbox", unknown: "Unknown" })[v] || v,
    order: ["active", "slowing", "stale", "toolbox", "unknown"] },
  { key: "publication", label: "Paper", values: publicationFacet,
    labelOf: (v) => ({ "peer-reviewed": "Peer-reviewed", preprint: "Preprint", none: "No paper" })[v] || v,
    order: ["peer-reviewed", "preprint", "none"] },
  { key: "gpu", label: "Hardware", values: (d) => [d.recommend && d.recommend.needs_gpu ? "gpu" : "cpu"],
    labelOf: (v) => (v === "gpu" ? "Needs a GPU" : "Runs on CPU"), order: ["cpu", "gpu"] },
];

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
  const haystack = [
    d.name, d.category_label, d.method_type, d.level, d.venue || "",
    ...(d.tags || []), ...(d.language || []), ...(d.authors || []),
    ...(d.modalities_tested || []),
  ].join(" ").toLowerCase();
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
}

/* ---------------- Impact view (citations × maintenance) ---------------- */
// One dot per method with both a citation count and a last-commit date.
// x = last commit (older left → recent right), y = citations on a log scale.
// Background bands reuse the Active / Slowing / Stale thresholds of the badges.
// Dots are one neutral hue: the chart's question is "cited and maintained?",
// family is in the tooltip (10 family colours would not be distinguishable here).

function renderImpact(visible) {
  const wrap = document.createElement("div");
  wrap.className = "impact-wrap";
  const plotted = visible.filter((d) => typeof d.citations === "number" && d.last_commit);
  const missing = visible.length - plotted.length;

  const W = 1100, H = 560, m = { l: 64, r: 28, t: 28, b: 52 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const DAY = 86400000;
  const now = Date.now();
  const t = (d) => new Date(`${d.last_commit}T00:00:00Z`).getTime();
  const tMinData = plotted.length ? Math.min(...plotted.map(t)) : now - 5 * 365 * DAY;
  const startYear = new Date(tMinData).getUTCFullYear();
  const tMin = Date.UTC(startYear, 0, 1), tMax = now + 20 * DAY;
  const xOf = (ms) => m.l + ((ms - tMin) / (tMax - tMin)) * pw;
  const cMax = Math.max(10, ...plotted.map((d) => d.citations));
  const logMax = Math.ceil(Math.log10(cMax + 1));
  const yOf = (c) => m.t + ph - (Math.log10(c + 1) / logMax) * ph;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "impact-svg", role: "img",
    "aria-label": "Citations versus last commit date for each method" });

  // maintenance bands
  const bands = [
    { from: tMin, to: now - 730 * DAY, cls: "stale", label: "Stale · no commit in 2+ years" },
    { from: now - 730 * DAY, to: now - 182 * DAY, cls: "slowing", label: "Slowing" },
    { from: now - 182 * DAY, to: tMax, cls: "active", label: "Active" },
  ];
  const bandG = svgEl("g", { class: "imp-bands" });
  bands.forEach((b) => {
    const x1 = xOf(Math.max(b.from, tMin)), x2 = xOf(Math.min(b.to, tMax));
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
  const endYear = new Date(tMax).getUTCFullYear();
  for (let yr = startYear; yr <= endYear; yr++) {
    const x = xOf(Date.UTC(yr, 0, 1));
    if (x < m.l || x > W - m.r) continue;
    grid.appendChild(svgEl("line", { x1: x, x2: x, y1: m.t + ph, y2: m.t + ph + 5 }));
    const tx = svgEl("text", { x, y: m.t + ph + 20, "text-anchor": "middle" });
    tx.textContent = String(yr);
    grid.appendChild(tx);
  }
  grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, class: "imp-axis" }));
  const xl = svgEl("text", { x: m.l + pw / 2, y: H - 10, "text-anchor": "middle", class: "imp-axis-title" });
  xl.textContent = "Last commit to the repository →  more recent";
  grid.appendChild(xl);
  const yl = svgEl("text", { x: 16, y: m.t + ph / 2, "text-anchor": "middle", class: "imp-axis-title",
    transform: `rotate(-90 16 ${m.t + ph / 2})` });
  yl.textContent = "Citations (log scale)";
  grid.appendChild(yl);
  svg.appendChild(grid);

  // dots
  const pts = plotted.map((d) => ({ d, x: xOf(t(d)), y: yOf(d.citations) }));
  const dotG = svgEl("g", { class: "imp-dots" });
  pts.forEach((p) => {
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: 5, class: "imp-dot" });
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
      <span><span class="maint-badge maint-${maint.status}">${STATUS_LABEL[maint.status]}</span> last commit ${escapeHtml(p.d.last_commit)}</span>
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

  wrap.innerHTML = `<p class="tbl-caption">${plotted.length} methods with both a citation count and a repository · ${missing ? `${missing} more in the current filter have no repo or no citation data yet · ` : ""}hover a dot for details</p>`;
  const scroller = document.createElement("div");
  scroller.className = "impact-scroll";
  scroller.appendChild(svg);
  wrap.appendChild(scroller);
  wrap.appendChild(tip);
  const note = document.createElement("p");
  note.className = "imp-note";
  note.textContent = "Top-right: well cited and still maintained. Bottom-right: new or niche but active. Top-left: influential but no longer maintained — check forks or toolboxes before relying on it. Exact numbers for every method are in the Table view.";
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

  // hover: light up the whole ancestry + descendants of a node
  const childIds = new Map();
  parentsOf.forEach((ps, c) => ps.forEach((p) => { if (!childIds.has(p.id)) childIds.set(p.id, []); childIds.get(p.id).push(c); }));
  function related(id) {
    const out = new Set([id]);
    const up = [id], down = [id];
    while (up.length) (parentsOf.get(up.pop()) || []).forEach((p) => { if (!out.has(p.id)) { out.add(p.id); up.push(p.id); } });
    while (down.length) (childIds.get(down.pop()) || []).forEach((c) => { if (!out.has(c)) { out.add(c); down.push(c); } });
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
    <p class="tbl-caption">${n} methods with a recorded lineage · ${rows.filter((r) => r.depth === 0).length} roots · hover to trace a branch, click for details</p>
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
  "optimal-transport": "Optimal transport", "acquisition-protocol": "Acquisition",
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
    ["stars", (d) => d.stars], ["forks", (d) => d.forks], ["last_commit", (d) => d.last_commit],
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
    ${d.paper_title ? `<p class="paper-title">"${escapeHtml(d.paper_title)}"</p>` : ""}
    ${d.abstract ? `<p>${escapeHtml(d.abstract)}</p>` : ""}
    ${d.repo_description ? `<p class="repo-description">${escapeHtml(d.repo_description)}</p>` : ""}
    ${noPaperNote}

    <dl class="spec-table">
      <dt>Paper year</dt><dd>${escapeHtml(d.paper_year || "—")}</dd>
      ${d.venue ? `<dt>Published in</dt><dd>${escapeHtml(d.venue)}</dd>` : ""}
      ${d.authors && d.authors.length ? `<dt>Authors</dt><dd>${escapeHtml(d.authors.slice(0, 3).join(", "))}${d.n_authors > 3 ? " et al." : ""}</dd>` : ""}
      ${d.modalities_tested && d.modalities_tested.length ? `<dt>Tested on</dt><dd><div class="chip-row">${d.modalities_tested.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}</div></dd>` : ""}
      ${(d.evidence || []).length ? `<dt>Evidence</dt><dd><ul class="evidence-list">${d.evidence.map((ev) => `<li><span class="chip">${escapeHtml(MODALITY_FACET_LABEL[ev.modality] || ev.modality)}</span> ${extLink(ev.doi ? `https://doi.org/${ev.doi}` : ev.url, `${escapeHtml(ev.title || "paper")}${ev.year ? ` (${escapeHtml(ev.year)})` : ""}`, "inline-link")}</li>`).join("")}</ul></dd>` : ""}
      <dt>First commit</dt><dd>${escapeHtml(firstCommitLine)}</dd>
      <dt>Last maintained</dt><dd>${maintLine}</dd>
      <dt>Validation data</dt><dd>${escapeHtml(d.validation_data || "Agnostic")}</dd>
      <dt>Toolboxes</dt><dd>${toolboxLine}</dd>
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
  `;

  drawer.classList.add("open");
  scrim.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");

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

/* ---------------- "Which method?" recommender (live filter tree) ---------------- */

const recState = {
  task: null,          // "statistical" | "ml"
  level: null,          // "feature-level" | "image-level"
  newSite: null,        // "yes" | "no"
  hasSiteId: null,      // "yes" | "no"
  language: null,        // e.g. "Python" | "R" | ... | "no-preference"
  hasGpu: null,          // "yes" | "no"
  linear: null,          // "yes" | "no" | "unsure"
  federated: null,        // "yes" | "no" — only asked when task === "ml"
};

const REC_KEYS = ["task", "level", "newSite", "hasSiteId", "language", "hasGpu", "linear", "federated"];

function resetRecommender() {
  REC_KEYS.forEach((k) => { recState[k] = null; });
  renderRecommenderTree();
}

// Steps after "task" (which is special-cased, since it has the ML-family
// exclusion + PrettYharmonize note rather than a plain filter). Each
// filter() receives the pool as narrowed by every earlier step, and
// returns {pool, message}. message only renders once the step has an
// answer, directly above that step's own options.
const REC_STEPS = [
  {
    key: "level",
    legend: "Harmonization level",
    help: "Does this need to operate on extracted features (ROI volumes, cortical thickness, radiomics, …) or directly on images?",
    type: "pills",
    options: [["feature-level", "Feature-level"], ["image-level", "Image-level"]],
    filter(pool, value) {
      const after = pool.filter((d) => d.level === value);
      const removed = pool.length - after.length;
      const label = value === "feature-level" ? "feature-level" : "image-level";
      return {
        pool: after,
        message: removed > 0 ? `Kept only ${label} methods — removed ${removed} operating at a different level.` : null,
      };
    },
  },
  {
    key: "language",
    legend: "Programming language",
    help: "Any preference for the implementation's language? Methods with no public code are removed by any choice here.",
    type: "pills",
    // options are computed live from what's actually in the pool at render time — see renderStep's dynamicOptions
    dynamicOptions(pool) {
      const langs = new Set();
      pool.forEach((d) => (d.language || []).forEach((l) => langs.add(l)));
      return [["no-preference", "No preference"], ...Array.from(langs).sort().map((l) => [l, l])];
    },
    filter(pool, value) {
      if (value === "no-preference") return { pool, message: null };
      const after = pool.filter((d) => (d.language || []).includes(value));
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} method${removed === 1 ? "" : "s"} with no ${value} implementation.`
          : null,
      };
    },
  },
  {
    key: "newSite",
    legend: "New, unseen site",
    help: "Will this be applied to a new site that wasn't part of the original harmonized batch?",
    type: "pills",
    options: [["yes", "Yes"], ["no", "No"]],
    filter(pool, value) {
      if (value !== "yes") return { pool, message: null };
      const after = pool.filter((d) => d.recommend && d.recommend.generalizes_to_new_site === true);
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} method${removed === 1 ? "" : "s"} that assume a fixed, known batch of sites rather than generalizing to a new one.`
          : null,
      };
    },
  },
  {
    key: "hasSiteId",
    legend: "Site ID",
    help: "Do you have access to the Site ID? IQM-based methods can be applied without knowing site membership.",
    type: "pills",
    options: [["yes", "Yes"], ["no", "No"]],
    filter(pool, value) {
      if (value !== "no") return { pool, message: null };
      const after = pool.filter((d) => d.recommend && d.recommend.requires_site_id === false);
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} method${removed === 1 ? "" : "s"} that require an explicit Site ID.`
          : null,
      };
    },
  },
  {
    key: "hasGpu",
    legend: "Hardware",
    help: "Do you have access to a GPU? (Only asked when deep-learning, image-level methods are still in the running.)",
    type: "pills",
    options: [["yes", "Yes"], ["no", "No"]],
    visibleIf(pool, rs) {
      return rs.level === "image-level" && pool.some((d) => d.needs_gpu);
    },
    filter(pool, value) {
      if (value !== "no") return { pool, message: null };
      const after = pool.filter((d) => !d.needs_gpu);
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} deep-learning method${removed === 1 ? "" : "s"} that need a GPU to be practical.`
          : null,
      };
    },
  },
  {
    key: "linear",
    legend: "Signal assumptions",
    help: "Can you assume your biological signal is linear (in the covariates you'd harmonize for)?",
    type: "pills",
    options: [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]],
    visibleIf(pool, rs) { return rs.level !== "image-level"; },
    filter(pool, value) {
      if (value !== "no") return { pool, message: null };
      const after = pool.filter((d) => !(d.recommend && d.recommend.requires_linear_signal === true));
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} method${removed === 1 ? "" : "s"} that assume a linear signal.`
          : null,
      };
    },
  },
  {
    key: "federated",
    legend: "Federated setup",
    help: "Do you need a federated / distributed / privacy-preserving setup (raw data never leaves each site)?",
    type: "pills",
    options: [["yes", "Yes"], ["no", "No"]],
    visibleIf(pool, rs) { return rs.task === "ml"; },
    filter(pool, value) {
      if (value !== "yes") return { pool, message: null };
      const after = pool.filter((d) => d.category === "federated");
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Kept only Federated-family methods — removed ${removed} that assume centralized data access.`
          : null,
      };
    },
  },
];

function buildRecommender() {
  const root = document.getElementById("recommend-root");
  root.innerHTML = `
    <div class="recommend-wrap">
      <div class="recommend-toolbar">
        <p class="recommend-intro">
          Answer each question and the method list on the right narrows live. These are
          reasoned defaults per method family (documented in the README), not a paper-verified
          fact for every one of the ${state.data.length} methods — treat this as a shortlist to
          investigate, not a final answer.
        </p>
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

function renderRecommenderTree() {
  const treeEl = document.getElementById("rec-tree");
  const methodsEl = document.getElementById("rec-methods-panel");
  treeEl.innerHTML = "";

  let pool = state.data.slice();

  pool = renderTaskStep(treeEl, pool);
  if (recState.task == null) {
    renderMethodsPanel(methodsEl, pool);
    return;
  }

  const excludedNotes = [];
  if (recState.task === "ml") {
    const before = pool.length;
    pool = pool.filter((d) => d.category !== "combat-family" || (d.recommend && d.recommend.ml_compatible === true));
    const removed = before - pool.length;
    if (removed > 0) {
      excludedNotes.push(
        `Removed ${removed} Location/Scale (ComBat-family) method${removed === 1 ? "" : "s"} — the covariate they ` +
        `need to fit the harmonization model is typically the same variable you're trying to predict, causing data ` +
        `leakage. PrettYharmonize is the one exception: it's a Location/Scale method built specifically to be ` +
        `leakage-free in ML pipelines, so it's still in the list below.`
      );
    }
  }
  renderTaskExcludedNotes(treeEl, excludedNotes);

  for (const step of REC_STEPS) {
    if (step.visibleIf && !step.visibleIf(pool, recState)) continue;

    const answer = recState[step.key];
    const { pool: nextPool, message } = answer != null
      ? step.filter(pool, answer)
      : { pool, message: null };

    renderStep(treeEl, step, pool, answer, message);
    pool = nextPool;

    if (answer == null) {
      renderMethodsPanel(methodsEl, pool);
      return;
    }
  }

  // Every visible step has been answered — offer a reset, and a way to
  // share this exact combination of answers.
  const actionsRow = document.createElement("div");
  actionsRow.className = "rec-actions-row";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.id = "rec-reset";
  resetBtn.textContent = "↺ Reset all questions";
  resetBtn.addEventListener("click", resetRecommender);
  actionsRow.appendChild(resetBtn);

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.id = "rec-share";
  shareBtn.textContent = "⧉ Share recommendation";
  shareBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(shareableRecommendationUrl()).then(() => {
      shareBtn.textContent = "✓ Link copied";
      setTimeout(() => { shareBtn.textContent = "⧉ Share recommendation"; }, 1600);
    });
  });
  actionsRow.appendChild(shareBtn);

  treeEl.appendChild(actionsRow);

  renderMethodsPanel(methodsEl, pool);
}

function shareableRecommendationUrl() {
  const parts = REC_KEYS
    .filter((k) => recState[k] != null)
    .map((k) => `${k}:${recState[k]}`);
  const params = new URLSearchParams({ rec: parts.join(",") });
  return `${location.origin}${location.pathname}?${params.toString()}#recommend`;
}

function loadRecommendationFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("rec");
  if (!raw) return false;
  raw.split(",").forEach((pair) => {
    const [key, value] = pair.split(":");
    if (REC_KEYS.includes(key) && value) recState[key] = value;
  });
  return true;
}

function renderTaskStep(container, pool) {
  const fs = document.createElement("fieldset");
  fs.className = "rec-question";
  fs.innerHTML = `
    <legend>Downstream analysis</legend>
    <p class="rec-help">Will you use the harmonized data for statistical analysis or as input to a machine-learning model?</p>
    <div class="rec-step-message" id="rec-msg-task"></div>
    <div class="rec-options" id="rec-opts-task"></div>
  `;
  container.appendChild(fs);

  const optsWrap = fs.querySelector("#rec-opts-task");
  [["statistical", "Statistical analysis"], ["ml", "Machine learning prediction"]].forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill" + (recState.task === value ? " active" : "");
    btn.setAttribute("aria-pressed", String(recState.task === value));
    btn.textContent = label;
    btn.addEventListener("click", () => {
      recState.task = recState.task === value ? null : value;
      renderRecommenderTree();
    });
    optsWrap.appendChild(btn);
  });

  return pool; // task's own filter is applied by the caller (needs the special-case note)
}

function renderTaskExcludedNotes(container, notes) {
  if (!notes.length) return;
  const msgHost = document.getElementById("rec-msg-task");
  msgHost.innerHTML = notes
    .map((n, i) => `<p class="${i === 0 ? "rec-excluded-note" : "rec-special-note"}">${i === 0 ? "✕ " : ""}${escapeHtml(n)}</p>`)
    .join("");
}

function renderStep(container, step, poolBefore, answer, message) {
  const fs = document.createElement("fieldset");
  fs.className = "rec-question";

  fs.innerHTML = `
    <legend>${step.legend}</legend>
    <p class="rec-help">${step.help}</p>
    <div class="rec-step-message"></div>
    <div class="rec-options"></div>
  `;
  container.appendChild(fs);

  if (message) {
    fs.querySelector(".rec-step-message").innerHTML = `<p class="rec-excluded-note">✕ ${escapeHtml(message)}</p>`;
  }

  const options = step.dynamicOptions ? step.dynamicOptions(poolBefore) : step.options;
  const optsWrap = fs.querySelector(".rec-options");
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill" + (answer === value ? " active" : "");
    btn.setAttribute("aria-pressed", String(answer === value));
    btn.textContent = label;
    btn.addEventListener("click", () => {
      recState[step.key] = recState[step.key] === value ? null : value;
      renderRecommenderTree();
    });
    optsWrap.appendChild(btn);
  });

  return fs;
}

function renderMethodsPanel(container, pool) {
  container.innerHTML = `<h3 class="rec-methods-heading">${pool.length} method${pool.length === 1 ? "" : "s"} remaining</h3>`;
  if (pool.length === 0) {
    container.innerHTML += `<p class="rec-excluded-note">Nothing satisfies every answer so far — try relaxing the most recent one.</p>`;
    return;
  }
  const flow = document.createElement("div");
  flow.className = "box-flow";
  pool
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((d) => flow.appendChild(makeBox(d)));
  container.appendChild(flow);
}


init();
