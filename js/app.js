/* Harmonization Zoo — bubble map
 * Renders methods from data/methods.json as a force-clustered bubble chart.
 * Group-by, size-by, search, and level filters are all driven by the same
 * `state` object below, so adding a new grouping dimension only means
 * adding one entry to GROUPERS.
 */

const COLORS = ["#f2a93b", "#5fc9c9", "#9c8cf0", "#e0708a", "#7fd88f", "#6fa8dc", "#e0a8f0", "#d8c26a"];

const LEVEL_ORDER = ["feature-level", "image-level", "acquisition-level"];
const LEVEL_LABELS = {
  "feature-level": "Feature-level",
  "image-level": "Image-level",
  "acquisition-level": "Acquisition-level",
};

const GROUPERS = {
  category: {
    label: "Family",
    fn: (d) => d.category_label,
  },
  level: {
    label: "Level",
    fn: (d) => LEVEL_LABELS[d.level] || "Unspecified",
  },
  method_type: {
    label: "Method type",
    fn: (d) => (d.method_type ? d.method_type.replace("-", " ") : "other"),
  },
  primary_language: {
    label: "Language",
    fn: (d) => d.primary_language,
  },
};

const state = {
  data: [],
  groupBy: "category",
  sizeBy: "stars",
  search: "",
  activeLevels: new Set(LEVEL_ORDER),
};

let svg, width, height, simulation, colorScale;

async function init() {
  const res = await fetch("data/methods.json");
  const json = await res.json();

  state.data = json.methods.map((d) => ({
    ...d,
    primary_language: d.language && d.language.length ? d.language[0] : "Unspecified",
  }));

  document.getElementById("method-count").textContent = `${state.data.length} methods`;

  buildLevelToggles();
  bindControls();
  setupStage();
  render();

  window.addEventListener("resize", debounce(() => {
    setupStage();
    render();
  }, 200));
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

function bindControls() {
  document.getElementById("group-by").addEventListener("change", (e) => {
    state.groupBy = e.target.value;
    render();
  });
  document.getElementById("size-by").addEventListener("change", (e) => {
    state.sizeBy = e.target.value;
    render();
  });
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    applySearchDimming();
  });
  document.getElementById("clear-search-btn").addEventListener("click", () => {
    document.getElementById("search").value = "";
    state.search = "";
    applySearchDimming();
  });
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

function setupStage() {
  const stageWrap = document.querySelector(".stage-wrap");
  width = stageWrap.clientWidth;
  height = stageWrap.clientHeight;

  svg = d3.select("#stage")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  svg.selectAll("*").remove();
  svg.append("g").attr("class", "cluster-labels-layer");
  svg.append("g").attr("class", "nodes-layer");
}

function methodMatches(d) {
  if (!state.activeLevels.has(d.level)) return false;
  return true;
}

function searchMatches(d) {
  if (!state.search) return true;
  const haystack = [
    d.name, d.category_label, d.method_type, d.level,
    ...(d.tags || []), ...(d.language || []),
  ].join(" ").toLowerCase();
  return haystack.includes(state.search);
}

function render() {
  const grouper = GROUPERS[state.groupBy];
  const visible = state.data.filter(methodMatches);

  const groupNames = Array.from(new Set(visible.map(grouper.fn))).sort();
  colorScale = d3.scaleOrdinal().domain(groupNames).range(COLORS);

  const centers = clusterCenters(groupNames.length, width, height);
  const centerByGroup = new Map(groupNames.map((g, i) => [g, centers[i]]));

  const maxStars = d3.max(visible, (d) => d.stars || 0) || 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxStars]).range([18, 50]);

  const nodes = visible.map((d) => ({
    ...d,
    group: grouper.fn(d),
    // Unknown star counts (stats not fetched yet) get a neutral mid-size
    // bubble rather than collapsing to the scale's minimum.
    r: state.sizeBy === "stars"
      ? (d.stars != null ? Math.max(18, radiusScale(d.stars)) : 24)
      : 22,
  }));

  drawClusterLabels(groupNames, centerByGroup);

  const nodeSel = svg.select(".nodes-layer")
    .selectAll("g.node")
    .data(nodes, (d) => d.id);

  nodeSel.exit().remove();

  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .attr("tabindex", 0)
    .attr("role", "button")
    .on("click", (event, d) => openDrawer(d))
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDrawer(d);
      }
    });

  nodeEnter.append("circle").attr("class", "core");
  nodeEnter.append("text").attr("class", "label");

  const merged = nodeEnter.merge(nodeSel);

  merged.select("circle.core")
    .attr("r", (d) => d.r)
    .attr("fill", (d) => colorScale(d.group))
    .attr("fill-opacity", 0.85)
    .attr("stroke", (d) => colorScale(d.group))
    .attr("aria-label", (d) => d.name);

  merged.select("text.label")
    .attr("font-size", (d) => Math.min(12.5, Math.max(8.5, d.r / 3.1)))
    .text((d) => truncateLabel(d.name, d.r))
    .each(function (d) { fitLabel(this, d.r); });

  merged.append("title").text((d) => d.name);

  if (simulation) simulation.stop();
  simulation = d3.forceSimulation(nodes)
    .force("x", d3.forceX((d) => centerByGroup.get(d.group).x).strength(0.12))
    .force("y", d3.forceY((d) => centerByGroup.get(d.group).y).strength(0.12))
    .force("collide", d3.forceCollide((d) => d.r + 2.5).iterations(2))
    .force("charge", d3.forceManyBody().strength(1))
    .alpha(0.9)
    .on("tick", () => {
      merged.attr("transform", (d) => `translate(${clamp(d.x, d.r, width - d.r)},${clamp(d.y, d.r + 26, height - d.r)})`);
    });

  buildLegend(groupNames);
  applySearchDimming();

  document.getElementById("empty-state").classList.toggle("hidden", nodes.length > 0);
}

function clusterCenters(n, w, h) {
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n * (w / h)));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = (h - 40) / rows;
  const out = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push({
      x: cellW * col + cellW / 2,
      y: 40 + cellH * row + cellH / 2,
    });
  }
  return out;
}

function drawClusterLabels(groupNames, centerByGroup) {
  const layer = svg.select(".cluster-labels-layer");
  const sel = layer.selectAll("text.cluster-label").data(groupNames, (d) => d);
  sel.exit().remove();
  sel.enter()
    .append("text")
    .attr("class", "cluster-label")
    .merge(sel)
    .attr("x", (d) => centerByGroup.get(d).x)
    .attr("y", (d) => Math.max(16, centerByGroup.get(d).y - 90))
    .attr("text-anchor", "middle")
    .text((d) => d);
}

function buildLegend(groupNames) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  groupNames.forEach((g) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${colorScale(g)}"></span>${g}`;
    legend.appendChild(item);
  });
}

function applySearchDimming() {
  const nodeSel = svg.selectAll("g.node");
  let anyMatch = false;
  nodeSel.each(function (d) {
    const match = searchMatches(d);
    if (match) anyMatch = true;
    d3.select(this).classed("dim", state.search && !match);
  });
  document.getElementById("empty-state").classList.toggle("hidden", anyMatch || !state.search);
}

function truncateLabel(name, r) {
  const maxChars = Math.max(3, Math.floor(r / 3.4));
  return name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;
}

function fitLabel(textEl, r) {
  // Shrinks font further if the truncated label still overflows the bubble.
  let size = parseFloat(d3.select(textEl).attr("font-size"));
  const maxWidth = r * 1.7;
  let guard = 0;
  while (textEl.getComputedTextLength && textEl.getComputedTextLength() > maxWidth && size > 7 && guard < 8) {
    size -= 0.6;
    d3.select(textEl).attr("font-size", size);
    guard++;
  }
}

function clamp(v, lo, hi) {
  if (Number.isNaN(v)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------------- Drawer ---------------- */

function openDrawer(d) {
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");
  const scrim = document.getElementById("drawer-scrim");

  const languages = (d.language || []).map((l) => `<span class="chip">${l}</span>`).join("") || `<span class="chip">unspecified</span>`;
  const tags = (d.tags || []).map((t) => `<span class="chip">${t}</span>`).join("");

  const repoLink = d.github
    ? `<a href="https://github.com/${d.github}" target="_blank" rel="noopener">↗ ${d.github}</a>`
    : (d.other_url ? `<a href="${d.other_url}" target="_blank" rel="noopener">↗ Project page</a>` : "");

  const starsLine = d.stars != null ? `${d.stars.toLocaleString()} ★` : "not fetched yet";
  const commitLine = d.last_commit || "not fetched yet";

  const missingNote = (d.stars == null && d.github)
    ? `<p class="no-data-note">Live GitHub stats haven't been fetched in this build — run <code>scripts/fetch_github_stats.py</code> (or the scheduled Action) to populate stars &amp; last commit.</p>`
    : "";
  const noPaperNote = !d.paper_title
    ? `<p class="no-data-note">No paper is listed for this entry yet — if you know the reference, please contribute it.</p>`
    : "";

  content.innerHTML = `
    <div class="drawer-eyebrow">${d.category_label} · ${LEVEL_LABELS[d.level] || d.level}</div>
    <h2>${d.name}</h2>
    ${d.paper_title ? `<p class="paper-title">"${escapeHtml(d.paper_title)}"</p>` : ""}
    ${d.abstract ? `<p>${escapeHtml(d.abstract)}</p>` : ""}
    ${noPaperNote}

    <dl class="spec-table">
      <dt>Year</dt><dd>${d.paper_year || "—"}</dd>
      <dt>Language</dt><dd><div class="chip-row">${languages}</div></dd>
      <dt>Stars</dt><dd>${starsLine}</dd>
      <dt>Last commit</dt><dd>${commitLine}</dd>
      <dt>Citations</dt><dd>${d.citations != null ? d.citations : "—"}</dd>
      ${tags ? `<dt>Tags</dt><dd><div class="chip-row">${tags}</div></dd>` : ""}
    </dl>

    ${missingNote}

    <div class="links">
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
