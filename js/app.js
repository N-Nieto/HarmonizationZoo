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
];
const FAMILY_COLOR = new Map(FAMILY_ORDER.map(([id, , color]) => [id, color]));
const FAMILY_LABEL = new Map(FAMILY_ORDER.map(([id, label]) => [id, label]));

const STAR_BUCKETS = ["0", "1–9", "10–49", "50–199", "200–999", "1000+"];

const state = {
  data: [],
  groupBy: "level",
  search: "",
  activeLevels: new Set(LEVEL_ORDER),
  fontSize: 13,
  compareMode: false,
  selectedIds: new Set(),
  activeTab: "home",
};

async function init() {
  const res = await fetch("data/methods.json");
  const json = await res.json();

  state.data = json.methods.map((d) => ({
    ...d,
    primary_language: d.language && d.language.length ? d.language[0] : "Unspecified",
  }));

  document.getElementById("method-count").textContent = `${state.data.length} methods`;

  buildLevelToggles();
  buildFamilyLegend();
  bindControls();
  bindTabs();
  bindCompareBar();
  bindFetchStatsButton();
  buildRecommender();
  buildHomeTab();
  buildAddModelTab();
  render();
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
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${label}`;
    legend.appendChild(item);
  });
}

/* ---------------- Home tab ---------------- */

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
            language, year, stars, citations, validation data, or UniHarmony availability.
            Compare methods side by side.</span>
        </button>
        <button type="button" class="home-cta" data-tab="recommend">
          <span class="home-cta-title">Which method? →</span>
          <span class="home-cta-desc">Answer a short set of questions about your task, data, and
            constraints. The list narrows live, with an explanation for every method
            that gets removed.</span>
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
          <input type="text" id="am-alsoin" placeholder="e.g. neuroHarmonize">
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
  sel.innerHTML = `<option value="">— select —</option>` + options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  if (defaultValue) sel.value = defaultValue;
}

function makeToggleGroup(containerId, options, targetState, key, onChange) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      targetState[key] = targetState[key] === value ? null : value;
      wrap.querySelectorAll(".rec-pill").forEach((b) => b.classList.remove("active"));
      if (targetState[key] === value) btn.classList.add("active");
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


/* ---------------- On-demand GitHub stats (client-side, session-only) ----------------
 * The scheduled Action + scripts/fetch_github_stats.py are the source of
 * truth and persist back to data/methods.json. This button is a
 * lightweight supplement for browsing between refreshes: it calls the
 * public GitHub REST API directly from the browser (CORS-enabled for
 * unauthenticated GET requests) for whichever methods are still missing
 * stats, and updates the current session's view only. It does NOT write
 * back to the repo — a page reload reverts to whatever's actually
 * committed. Subject to GitHub's unauthenticated rate limit (60/hr per
 * IP), so it only fetches what's missing, not everything.
 */

function bindFetchStatsButton() {
  document.getElementById("fetch-stats-btn").addEventListener("click", fetchMissingGithubStats);
}

async function fetchMissingGithubStats() {
  const btn = document.getElementById("fetch-stats-btn");
  const status = document.getElementById("fetch-stats-status");
  const targets = state.data.filter((d) => d.github && d.stars == null);

  if (targets.length === 0) {
    status.textContent = "Nothing missing — everything already has stats.";
    return;
  }

  btn.disabled = true;
  let done = 0, ok = 0, failed = 0;
  status.textContent = `Fetching 0/${targets.length}…`;

  for (const method of targets) {
    try {
      const resp = await fetch(`https://api.github.com/repos/${method.github}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (resp.status === 403) {
        status.textContent = `Rate limited by GitHub after ${ok} of ${targets.length} — try again in a bit, or use scripts/fetch_github_stats.py with a token.`;
        break;
      }
      if (!resp.ok) {
        failed++;
      } else {
        const repo = await resp.json();
        method.stars = repo.stargazers_count;
        method.forks = repo.forks_count;
        method.open_issues = repo.open_issues_count;
        method.license = repo.license ? repo.license.spdx_id : null;
        method.topics = repo.topics || [];
        method.archived = repo.archived || false;
        method.repo_created_at = repo.created_at ? repo.created_at.split("T")[0] : null;
        method.last_commit = repo.pushed_at ? repo.pushed_at.split("T")[0] : null;
        method.repo_description = repo.description;
        method._fetched_this_session = true; // first_commit_date is intentionally not fetched here — see module note
        ok++;
      }
    } catch (e) {
      failed++;
    }
    done++;
    status.textContent = `Fetching ${done}/${targets.length}…`;
  }

  btn.disabled = false;
  status.textContent = `Done: ${ok} fetched${failed ? `, ${failed} failed` : ""} this session (not saved — re-run scripts/fetch_github_stats.py to persist).`;
  render();
  if (state.activeTab === "recommend") renderRecommenderTree();
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
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("clear-search-btn").addEventListener("click", () => {
    document.getElementById("search").value = "";
    state.search = "";
    render();
  });
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDrawer(); closeComparePanel(); }
  });

  document.getElementById("compare-toggle").addEventListener("click", toggleCompareMode);
}

function toggleCompareMode() {
  state.compareMode = !state.compareMode;
  document.querySelectorAll(".compare-toggle-btn").forEach((btn) => {
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

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tab}`);
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
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
  return state.data.filter((d) => {
    if (!state.activeLevels.has(d.level)) return false;
    if (!state.search) return true;
    const haystack = [
      d.name, d.category_label, d.method_type, d.level,
      ...(d.tags || []), ...(d.language || []),
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
  });
}

function render() {
  const stage = document.getElementById("stage");
  stage.style.setProperty("--label-size", `${state.fontSize}px`);
  stage.innerHTML = "";

  const methods = visibleMethods();
  document.getElementById("empty-state").classList.toggle("hidden", methods.length > 0);
  if (methods.length === 0) return;

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

/* ---------------- Cluster view (Level / Family) ---------------- */

function renderClusters(methods, groupBy) {
  const wrap = document.createElement("div");
  wrap.className = "cluster-wrap";

  let groupFn, groupOrder, groupLabel;

  if (groupBy === "category") {
    groupFn = (d) => d.category;
    groupOrder = FAMILY_ORDER.map(([id]) => id);
    groupLabel = (id) => FAMILY_LABEL.get(id) || id;
  } else if (groupBy === "uniharmony") {
    groupFn = (d) => (d.in_uniharmony ? "yes" : "no");
    groupOrder = ["yes", "no"];
    groupLabel = (id) => (id === "yes" ? "Implemented in UniHarmony" : "Not (yet) in UniHarmony");
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
    header.innerHTML = `${groupLabel(g)} <span class="cluster-count">${items.length}</span>`;
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

  const languages = (d.language || []).map((l) => `<span class="chip">${l}</span>`).join("") || `<span class="chip">unspecified</span>`;
  const tags = (d.tags || []).map((t) => `<span class="chip">${t}</span>`).join("");
  const topics = (d.topics || []).map((t) => `<span class="chip">${t}</span>`).join("");

  const repoLink = d.github
    ? `<a href="https://github.com/${d.github}" target="_blank" rel="noopener">↗ ${d.github}</a>`
    : (d.other_url ? `<a href="${d.other_url}" target="_blank" rel="noopener">↗ Project page</a>` : "");
  const paperLink = d.paper_url
    ? `<a href="${d.paper_url}" target="_blank" rel="noopener">↗ Paper</a>` : "";

  const starsLine = d.stars != null ? `${d.stars.toLocaleString()} ★` : "not fetched yet";
  const forksLine = d.forks != null ? d.forks.toLocaleString() : "not fetched yet";
  const issuesLine = d.open_issues != null ? d.open_issues.toLocaleString() : "not fetched yet";
  const licenseLine = d.license || (d.github ? "none / not fetched" : "—");
  const firstCommitLine = d.first_commit_date || "not fetched yet";

  const maint = formatMaintenance(d.last_commit);
  const maintLine = d.github
    ? `${maint.text}${maint.status ? ` <span class="maint-badge maint-${maint.status}">${STATUS_LABEL[maint.status]}</span>` : ""}${d.last_commit ? ` <span class="maint-date">(${d.last_commit})</span>` : ""}`
    : "—";

  const archivedBadge = d.archived ? `<span class="chip chip-warning">archived</span>` : "";

  const uniharmonyLine = d.in_uniharmony
    ? `Yes <a href="https://github.com/N-Nieto/UniHarmony" target="_blank" rel="noopener" class="inline-link">↗</a>`
    : "No";
  const alsoIn = (d.also_implemented_in || []);
  const alsoInLine = alsoIn.length ? ` · also in ${alsoIn.join(", ")}` : "";

  const isDL = d.method_type === "deep-learning";
  const frameworkLine = d.framework || (d.github ? "not fetched yet" : "—");
  const weightsLine = d.has_pretrained_weights === true
    ? `Yes <a href="${d.pretrained_weights_url}" target="_blank" rel="noopener" class="inline-link">↗ weights</a>`
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
    <div class="drawer-eyebrow" style="--eyebrow-color:${FAMILY_COLOR.get(d.category) || "#888"}">${d.category_label} · ${LEVEL_LABELS[d.level] || d.level}</div>
    <h2>${d.name} ${archivedBadge}</h2>
    ${d.paper_title ? `<p class="paper-title">"${escapeHtml(d.paper_title)}"</p>` : ""}
    ${d.abstract ? `<p>${escapeHtml(d.abstract)}</p>` : ""}
    ${d.repo_description ? `<p class="repo-description">${escapeHtml(d.repo_description)}</p>` : ""}
    ${noPaperNote}

    <dl class="spec-table">
      <dt>Paper year</dt><dd>${d.paper_year || "—"}</dd>
      <dt>First commit</dt><dd>${firstCommitLine}</dd>
      <dt>Last maintained</dt><dd>${maintLine}</dd>
      <dt>Validation data</dt><dd>${escapeHtml(d.validation_data || "Agnostic")}</dd>
      <dt>UniHarmony</dt><dd>${uniharmonyLine}${alsoInLine}</dd>
      <dt>Language</dt><dd><div class="chip-row">${languages}</div></dd>
      ${dlRows}
      <dt>Stars</dt><dd>${starsLine}</dd>
      <dt>Forks</dt><dd>${forksLine}</dd>
      <dt>Open issues</dt><dd>${issuesLine}</dd>
      <dt>License</dt><dd>${licenseLine}</dd>
      <dt>Citations</dt><dd>${d.citations != null ? d.citations : "—"}</dd>
      ${tags ? `<dt>Tags</dt><dd><div class="chip-row">${tags}</div></dd>` : ""}
      ${topics ? `<dt>Repo topics</dt><dd><div class="chip-row">${topics}</div></dd>` : ""}
    </dl>

    ${missingNote}

    <div class="links">      ${paperLink}
      ${repoLink}
    </div>
  `;

  drawer.classList.add("open");
  scrim.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
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
  ["UniHarmony", (d) => (d.in_uniharmony ? "Yes" : "No")],
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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
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
          fact for every one of the 54 methods — treat this as a shortlist to investigate, not
          a final answer.
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

  // Every visible step has been answered — offer a reset.
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.id = "rec-reset";
  resetBtn.textContent = "↺ Reset all questions";
  resetBtn.addEventListener("click", resetRecommender);
  treeEl.appendChild(resetBtn);

  renderMethodsPanel(methodsEl, pool);
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
