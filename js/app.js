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
  ["combat-family", "ComBat-based", "#f2a93b"],
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
    if (e.key === "Escape") closeDrawer();
  });
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
  box.addEventListener("click", () => openDrawer(d));
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDrawer(d);
    }
  });
  return box;
}

/* ---------------- Cluster view (Level / Family) ---------------- */

function renderClusters(methods, groupBy) {
  const wrap = document.createElement("div");
  wrap.className = "cluster-wrap";

  const groupFn = groupBy === "category"
    ? (d) => d.category
    : (d) => d.level;
  const groupOrder = groupBy === "category"
    ? FAMILY_ORDER.map(([id]) => id)
    : LEVEL_ORDER;
  const groupLabel = groupBy === "category"
    ? (id) => FAMILY_LABEL.get(id) || id
    : (id) => LEVEL_LABELS[id] || id;

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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

init();
