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
  activeTab: "explore",
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
  buildRecommender();
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

  document.getElementById("compare-toggle").addEventListener("click", () => {
    state.compareMode = !state.compareMode;
    const btn = document.getElementById("compare-toggle");
    btn.classList.toggle("active", state.compareMode);
    btn.textContent = `Compare mode: ${state.compareMode ? "on" : "off"}`;
    if (!state.compareMode) {
      state.selectedIds.clear();
      updateCompareBar();
    }
    render();
  });
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.classList.toggle("active", p.id === `tab-${state.activeTab}`);
      });
    });
  });
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

  const missingNote = (d.stars == null && d.github)
    ? `<p class="no-data-note">Live GitHub stats haven't been fetched in this build — run <code>scripts/fetch_github_stats.py</code> (or the scheduled Action) to populate this.</p>`
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
      <dt>Stars</dt><dd>${starsLine}</dd>
      <dt>Forks</dt><dd>${forksLine}</dd>
      <dt>Open issues</dt><dd>${issuesLine}</dd>
      <dt>License</dt><dd>${licenseLine}</dd>
      <dt>Citations</dt><dd>${d.citations != null ? d.citations : "—"}</dd>
      ${tags ? `<dt>Tags</dt><dd><div class="chip-row">${tags}</div></dd>` : ""}
      ${topics ? `<dt>Repo topics</dt><dd><div class="chip-row">${topics}</div></dd>` : ""}
    </dl>

    ${missingNote}

    <div class="links">
      ${paperLink}
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
  mlType: null,        // "classification_binary" | "classification_multiclass" | "regression"
  level: null,          // "feature-level" | "image-level"
  newSite: null,        // "yes" | "no"
  hasSiteId: null,      // "yes" | "no"
  hasGpu: null,          // "yes" | "no"
  linear: null,          // "yes" | "no" | "unsure"
  minPerSite: null,
  totalN: null,
  nClasses: null,
};

// Steps after "task" (which is special-cased for its ML sub-question).
// Each filter() receives the pool as narrowed by every earlier step, and
// returns {pool, message}. message is only used once the step has an
// answer; it renders directly above that step's own options.
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
      return rs.level === "image-level" && pool.some((d) => d.method_type === "deep-learning");
    },
    filter(pool, value) {
      if (value !== "no") return { pool, message: null };
      const after = pool.filter((d) => !(d.recommend && d.recommend.needs_gpu));
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
    key: "minPerSite",
    legend: "Data quantity",
    help: "Minimum samples per site. Total N and N classes below are shown for reference only — they don't currently filter results, since we don't have a verified per-method threshold for them.",
    type: "quantity",
    filter(pool, value) {
      if (value == null || value >= 15) return { pool, message: null };
      const after = pool.filter((d) => d.recommend && d.recommend.low_n_friendly === true);
      const removed = pool.length - after.length;
      return {
        pool: after,
        message: removed > 0
          ? `Removed ${removed} method${removed === 1 ? "" : "s"} not well-suited to very small per-site samples.`
          : null,
      };
    },
  },
];

function buildRecommender() {
  const root = document.getElementById("recommend-root");
  root.innerHTML = `
    <div class="recommend-wrap">
      <p class="recommend-intro">
        Answer each question and the method list on the right narrows live. These are
        reasoned defaults per method family (documented in the README), not a paper-verified
        fact for every one of the 54 methods — treat this as a shortlist to investigate, not
        a final answer.
      </p>
      <div class="rec-columns">
        <div id="rec-tree" class="rec-tree"></div>
        <div id="rec-methods-panel" class="rec-methods-panel"></div>
      </div>
    </div>
  `;
  renderRecommenderTree();
}

function renderRecommenderTree() {
  const treeEl = document.getElementById("rec-tree");
  const methodsEl = document.getElementById("rec-methods-panel");
  treeEl.innerHTML = "";

  let pool = state.data.slice();

  pool = renderTaskStep(treeEl, pool);
  if (recState.task == null) {
    renderMethodsPanel(methodsEl, pool, []);
    return;
  }

  const excludedNotes = [];
  if (recState.task === "ml") {
    const before = pool.length;
    pool = pool.filter((d) => d.category !== "combat-family");
    if (pool.length < before) {
      excludedNotes.push(
        `Removed ${before - pool.length} Location/Scale (ComBat-family) methods — the covariate they need ` +
        `to fit the harmonization model is typically the same variable you're trying to predict, causing data leakage.`
      );
    }
    const pretty = state.data.find((d) => d.id === "prettyharmonize");
    if (pretty) {
      excludedNotes.push(
        `Note: PrettYharmonize is a Location/Scale method built specifically to be leakage-free in ML ` +
        `pipelines. It's excluded above by that same rule, but if you want ComBat-style harmonization for ` +
        `an ML pipeline specifically, it's worth a direct look.`
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
      renderMethodsPanel(methodsEl, pool, []);
      return;
    }
  }

  renderMethodsPanel(methodsEl, pool, []);
}

function renderTaskStep(container, pool) {
  const fs = document.createElement("fieldset");
  fs.className = "rec-question";
  fs.innerHTML = `
    <legend>Downstream analysis</legend>
    <p class="rec-help">Will you use the harmonized data for statistical analysis or as input to a machine-learning model?</p>
    <div class="rec-step-message" id="rec-msg-task"></div>
    <div class="rec-options" id="rec-opts-task"></div>
    <div class="rec-subquestion hidden" id="rec-mltype-wrap">
      <div class="rec-options" id="rec-opts-mltype"></div>
    </div>
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
      if (recState.task !== "ml") recState.mlType = null;
      renderRecommenderTree();
    });
    optsWrap.appendChild(btn);
  });

  const mlWrap = fs.querySelector("#rec-mltype-wrap");
  mlWrap.classList.toggle("hidden", recState.task !== "ml");
  const mlOptsWrap = fs.querySelector("#rec-opts-mltype");
  [
    ["classification_binary", "Classification (binary)"],
    ["classification_multiclass", "Classification (multiclass)"],
    ["regression", "Regression"],
  ].forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rec-pill" + (recState.mlType === value ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      recState.mlType = recState.mlType === value ? null : value;
      renderRecommenderTree();
    });
    mlOptsWrap.appendChild(btn);
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

  if (step.type === "pills") {
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

    const optsWrap = fs.querySelector(".rec-options");
    step.options.forEach(([value, label]) => {
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
  } else if (step.type === "quantity") {
    fs.innerHTML = `
      <legend>${step.legend}</legend>
      <p class="rec-help">${step.help}</p>
      <div class="rec-step-message"></div>
      <div class="rec-numbers">
        <label>Total N <input type="number" min="0" id="rn-totalN" value="${recState.totalN ?? ""}"></label>
        <label>Total N classes <input type="number" min="0" id="rn-nClasses" value="${recState.nClasses ?? ""}"></label>
        <label>Min samples per site <input type="number" min="0" id="rn-minPerSite" value="${recState.minPerSite ?? ""}"></label>
      </div>
    `;
    container.appendChild(fs);

    if (message) {
      fs.querySelector(".rec-step-message").innerHTML = `<p class="rec-excluded-note">✕ ${escapeHtml(message)}</p>`;
    }

    fs.querySelector("#rn-totalN").addEventListener("change", (e) => {
      recState.totalN = e.target.value ? Number(e.target.value) : null;
      renderRecommenderTree();
    });
    fs.querySelector("#rn-nClasses").addEventListener("change", (e) => {
      recState.nClasses = e.target.value ? Number(e.target.value) : null;
      renderRecommenderTree();
    });
    fs.querySelector("#rn-minPerSite").addEventListener("change", (e) => {
      recState.minPerSite = e.target.value ? Number(e.target.value) : null;
      renderRecommenderTree();
    });
  }

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
