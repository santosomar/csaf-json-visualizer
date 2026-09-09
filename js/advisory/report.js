// Advisory viewer: header, vulnerability cards, VEX matrix, and product tree, in tabs.
import { el, clear, append, link, text } from "../ui/dom.js";
import { normalizeAdvisory, severityClass, worstSeverity } from "./model.js";
import { buildProductIndex, buildProductTreeNodes, productTreeStats } from "./product-tree.js";
import { renderMatrix } from "./matrix.js";
import { TreeView } from "../viz/tree.js";

export function renderAdvisory(container, doc, options = {}) {
  clear(container);
  const model = normalizeAdvisory(doc);
  const index = buildProductIndex(model.productTreeRaw);

  const panels = {};
  const tabsBar = el("div", { class: "report-tabs" });
  const report = el("div", { class: "report" });
  container.appendChild(tabsBar);
  container.appendChild(report);

  const tabs = [
    ["overview", "Overview"],
    ["vulns", `Vulnerabilities (${model.vulnerabilities.length})`],
    ["matrix", "VEX Matrix"],
    ["tree", "Product Tree"],
  ];

  let productTree = null;
  let matrixApi = null;

  const showTab = (key) => {
    for (const [k] of tabs) {
      panels[k].classList.toggle("hidden", k !== key);
      tabButtons[k].classList.toggle("active", k === key);
    }
    if (key === "tree" && productTree) requestAnimationFrame(() => productTree.fit(false));
  };

  const tabButtons = {};
  for (const [key, label] of tabs) {
    tabButtons[key] = el("button", {
      class: "report-tab",
      type: "button",
      text: label,
      on: { click: () => showTab(key) },
    });
    tabsBar.appendChild(tabButtons[key]);
  }

  // Cross-highlight: clicking any product id opens the matrix and highlights the row.
  const onProductClick = (productId) => {
    showTab("matrix");
    if (matrixApi) matrixApi.highlight(productId);
  };

  panels.overview = renderOverview(model);
  panels.vulns = renderVulns(model, index, onProductClick);

  const matrixHost = el("div");
  matrixApi = renderMatrix(matrixHost, model, index, onProductClick);
  panels.matrix = matrixHost;

  const treeHost = el("div", { class: "tree-wrap" });
  panels.tree = treeHost;

  for (const [key] of tabs) report.appendChild(panels[key]);

  // Build the product tree lazily-ish (cheap enough to do now).
  const treeStats = productTreeStats(model.productTreeRaw, index);
  const stats = el("div", { class: "pt-stats" }, [
    ptStat(treeStats.products, "products"),
    ptStat(treeStats.branches, "branches"),
    ptStat(treeStats.relationships, "relationships"),
    ptStat(treeStats.productPaths, "product paths"),
    ptStat(treeStats.groups, "groups"),
  ]);
  const treeCanvas = el("div", { class: "tree-canvas" });
  treeHost.appendChild(stats);
  treeHost.appendChild(treeCanvas);

  if (model.productTreeRaw) {
    const nodes = buildProductTreeNodes(model.productTreeRaw, index);
    productTree = new TreeView(treeCanvas, {
      label: (n) => n.name,
      secondary: (n) => n.secondary || (n.kind && n.kind !== "group" && n.kind !== "root" ? n.kind : null),
      kind: (n) => (n.productId ? "string" : "object"),
      isRequired: () => false,
      isRecursive: () => false,
      initialDepth: 3,
      onSelect: (data) => {
        if (data.productId) onProductClick(data.productId);
      },
    });
    productTree.setData(nodes);
  } else {
    treeCanvas.appendChild(emptyState("No product tree in this advisory."));
  }

  showTab(options.initialTab || "overview");

  return {
    model,
    showTab,
    destroy: () => {
      if (productTree) productTree.destroy();
      clear(container);
    },
  };
}

/* ---------------- Overview ---------------- */
function renderOverview(model) {
  const d = model.document;
  const badges = el("div", { class: "adv-badges" });
  badges.appendChild(el("span", { class: "badge version", text: "CSAF " + model.version }));
  if (d.tracking.status) badges.appendChild(el("span", { class: "badge", text: d.tracking.status }));
  if (d.category) badges.appendChild(el("span", { class: "badge", text: d.category }));
  if (d.tlp && d.tlp.label) badges.appendChild(tlpBadge(d.tlp.label));
  const aggSev = d.aggregateSeverity && d.aggregateSeverity.text;
  if (aggSev) badges.appendChild(severityBadge(aggSev, aggSev));

  const meta = el("div", { class: "adv-meta" }, [
    metaItem("Tracking ID", d.tracking.id),
    metaItem("Publisher", d.publisher.name),
    metaItem("Publisher type", d.publisher.category),
    metaItem("Version", d.tracking.version),
    metaItem("Initial release", fmtDate(d.tracking.initialReleaseDate)),
    metaItem("Current release", fmtDate(d.tracking.currentReleaseDate)),
    metaItem("Language", d.lang),
    metaItem("License", d.licenseExpression),
  ]);

  const header = el("div", { class: "adv-header" }, [
    el("h1", { class: "adv-title", text: d.title || "(untitled advisory)" }),
    badges,
    meta,
  ]);

  const sections = [header];

  if (d.publisher && d.publisher.namespace) {
    sections.push(
      section("Publisher namespace", el("div", {}, [link(d.publisher.namespace)]))
    );
  }
  if (d.notes.length) sections.push(section("Notes", notesBlock(d.notes)));
  if (d.references.length) sections.push(section("References", refsBlock(d.references)));
  if (d.tracking.revisionHistory.length) {
    sections.push(section("Revision history", revisionTable(d.tracking.revisionHistory)));
  }

  return el("div", { class: "hidden" }, sections);
}

function revisionTable(history) {
  const rows = history
    .slice()
    .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }))
    .map((r) =>
      el("tr", {}, [
        el("td", { text: r.number }),
        el("td", { text: fmtDate(r.date) }),
        el("td", { text: r.summary }),
      ])
    );
  return el("div", { class: "matrix-scroll" }, [
    el("table", { class: "matrix" }, [
      el("thead", {}, el("tr", {}, [th("Version"), th("Date"), th("Summary")])),
      el("tbody", {}, rows),
    ]),
  ]);
}

/* ---------------- Vulnerabilities ---------------- */
function renderVulns(model, index, onProductClick) {
  const wrap = el("div", { class: "hidden" });
  if (!model.vulnerabilities.length) {
    wrap.appendChild(emptyState("No vulnerabilities in this advisory."));
    return wrap;
  }
  for (const v of model.vulnerabilities) {
    wrap.appendChild(vulnCard(v, index, onProductClick));
  }
  return wrap;
}

function vulnCard(v, index, onProductClick) {
  const worst = worstSeverity(v);
  const head = el("div", { class: "vuln-head" }, [
    v.cve ? el("span", { class: "vuln-cve", text: v.cve }) : null,
    worst ? severityBadge(worst) : null,
    el("span", { class: "vuln-title", text: v.title || "" }),
  ]);

  const body = el("div", { class: "vuln-body" });

  if (v.scores.length) body.appendChild(vulnSection("Scores", scoreGrid(v.scores)));
  if (v.epss.length) body.appendChild(vulnSection("EPSS", epssBlock(v.epss)));
  if (v.ssvc.length) body.appendChild(vulnSection("SSVC", ssvcBlock(v.ssvc)));
  if (v.cwes.length) body.appendChild(vulnSection("Weaknesses (CWE)", cweBlock(v.cwes)));
  if (v.ids.length) body.appendChild(vulnSection("IDs", idsBlock(v.ids)));

  const statusBlock = productStatusBlock(v.productStatus, index, onProductClick);
  if (statusBlock) body.appendChild(vulnSection("Product status", statusBlock));

  if (v.remediations.length)
    body.appendChild(vulnSection("Remediations", remediationsBlock(v.remediations, index, onProductClick)));
  if (v.threats.length) body.appendChild(vulnSection("Threats", threatsBlock(v.threats)));
  if (v.flags.length) body.appendChild(vulnSection("Flags", flagsBlock(v.flags)));
  if (v.notes.length) body.appendChild(vulnSection("Notes", notesBlock(v.notes)));
  if (v.references.length) body.appendChild(vulnSection("References", refsBlock(v.references)));

  return el("div", { class: "vuln-card" }, [head, body]);
}

function scoreGrid(scores) {
  return el(
    "div",
    { class: "score-grid" },
    scores.map((s) => {
      const cls = severityClass(s.severity);
      return el("div", { class: "score-box" }, [
        el("div", { class: `score-num ${cls}`, text: s.baseScore != null ? String(s.baseScore) : "\u2013" }),
        el("div", { class: "score-meta" }, [
          el("div", { class: "ver", text: `CVSS v${s.version} \u00b7 ${s.severity}` }),
          s.vector ? el("div", { class: "vec", text: s.vector }) : null,
        ]),
      ]);
    })
  );
}

function epssBlock(epss) {
  return el(
    "div",
    { class: "pill-row" },
    epss.map((e) =>
      el("span", { class: "pill" }, [
        el("span", { class: "k", text: "probability" }),
        text(pct(e.probability)),
        el("span", { class: "k", text: "percentile" }),
        text(pct(e.percentile)),
      ])
    )
  );
}

function ssvcBlock(ssvc) {
  return el(
    "div",
    { class: "pill-row" },
    ssvc.map((s) => {
      const val = s.value || {};
      const parts = [];
      if (Array.isArray(val.selections)) {
        for (const sel of val.selections) parts.push(`${sel.name}: ${(sel.values || []).join("/")}`);
      }
      return el("span", { class: "pill", text: parts.join(" \u00b7 ") || (val.role || "SSVC") });
    })
  );
}

function cweBlock(cwes) {
  return el(
    "div",
    { class: "pill-row" },
    cwes.map((c) =>
      el("span", { class: "pill" }, [el("span", { class: "k", text: c.id || "CWE" }), text(c.name || "")])
    )
  );
}

function idsBlock(ids) {
  return el(
    "div",
    { class: "pill-row" },
    ids.map((i) =>
      el("span", { class: "pill" }, [el("span", { class: "k", text: i.system_name || "id" }), text(i.text || "")])
    )
  );
}

function productStatusBlock(status, index, onProductClick) {
  const cats = Object.keys(status || {}).filter((c) => Array.isArray(status[c]) && status[c].length);
  if (!cats.length) return null;
  const wrap = el("div", {});
  for (const cat of cats) {
    const group = el("div", { class: "rem-group" });
    group.appendChild(el("span", { class: "rem-cat", text: labelize(cat) + ` (${status[cat].length})` }));
    group.appendChild(
      el(
        "div",
        { class: "pill-row" },
        status[cat].map((pid) => productLink(pid, index, onProductClick))
      )
    );
    wrap.appendChild(group);
  }
  return wrap;
}

function remediationsBlock(rems, index, onProductClick) {
  const byCat = new Map();
  for (const r of rems) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }
  const wrap = el("div", {});
  for (const [cat, list] of byCat) {
    const group = el("div", { class: "rem-group" });
    group.appendChild(el("span", { class: "rem-cat", text: labelize(cat) }));
    for (const r of list) {
      const item = el("div", { class: "rem-item" });
      if (r.details) item.appendChild(el("div", { text: r.details }));
      const metaBits = [];
      if (r.date) metaBits.push(el("span", { class: "pill", text: fmtDate(r.date) }));
      if (r.restart_required && r.restart_required.category)
        metaBits.push(el("span", { class: "pill", text: "restart: " + r.restart_required.category }));
      if (r.url) metaBits.push(el("span", { class: "pill" }, [link(r.url, "advisory link")]));
      if (metaBits.length) item.appendChild(el("div", { class: "pill-row" }, metaBits));
      const targets = productTargets(r, index, onProductClick);
      if (targets) item.appendChild(targets);
      group.appendChild(item);
    }
    wrap.appendChild(group);
  }
  return wrap;
}

function productTargets(obj, index, onProductClick) {
  const ids = obj.product_ids || [];
  const groups = obj.group_ids || [];
  if (!ids.length && !groups.length) return null;
  const row = el("div", { class: "pill-row" });
  ids.forEach((pid) => row.appendChild(productLink(pid, index, onProductClick)));
  groups.forEach((gid) => row.appendChild(el("span", { class: "pill", text: "group: " + gid })));
  return row;
}

function threatsBlock(threats) {
  return el(
    "div",
    {},
    threats.map((t) =>
      el("div", { class: "note-block" }, [
        el("span", { class: "note-cat", text: labelize(t.category || "") }),
        el("p", { text: t.details || "" }),
      ])
    )
  );
}

function flagsBlock(flags) {
  return el(
    "div",
    { class: "pill-row" },
    flags.map((f) => el("span", { class: "pill", text: labelize(f.label || "flag") }))
  );
}

function productLink(pid, index, onProductClick) {
  const name = index.resolve(pid);
  const node = el("span", {
    class: "product-link",
    title: pid,
    text: name === pid ? pid : `${name}`,
    on: { click: () => onProductClick && onProductClick(pid) },
  });
  return node;
}

/* ---------------- Shared bits ---------------- */
function notesBlock(notes) {
  return el(
    "div",
    {},
    notes.map((n) =>
      el("div", { class: "note-block" }, [
        n.title ? el("div", { class: "note-title", text: n.title }) : null,
        el("span", { class: "note-cat", text: labelize(n.category || "") }),
        el("p", { text: n.text || "" }),
      ])
    )
  );
}

function refsBlock(refs) {
  return el(
    "ul",
    { class: "ref-list" },
    refs.map((r) =>
      el("li", {}, [
        r.category ? el("span", { class: "pill", text: r.category }) : null,
        text(" "),
        link(r.url, r.summary || r.url),
      ])
    )
  );
}

function vulnSection(title, content) {
  return el("div", { class: "vuln-section" }, [el("h4", { text: title }), content]);
}

function section(title, content) {
  return el("div", { class: "vuln-card" }, [
    el("div", { class: "vuln-head" }, el("span", { class: "section-title", text: title })),
    el("div", { class: "vuln-body" }, content),
  ]);
}

function metaItem(label, value) {
  if (value == null || value === "") return null;
  return el("div", { class: "meta-item" }, [
    el("span", { class: "label", text: label }),
    el("span", { class: "value", text: String(value) }),
  ]);
}

function tlpBadge(label) {
  const l = String(label).toLowerCase();
  return el("span", { class: `badge tlp-${l}`, text: "TLP:" + String(label).toUpperCase() });
}

function severityBadge(sev, textLabel) {
  const cls = severityClass(sev);
  return el("span", { class: `badge ${cls}`, text: (textLabel || sev) });
}

function ptStat(n, label) {
  return el("div", { class: "pt-stat" }, [
    el("div", { class: "n", text: String(n) }),
    el("div", { class: "l", text: label }),
  ]);
}

function th(t) {
  return el("th", { text: t });
}

function emptyState(msg) {
  return el("div", { class: "empty-state" }, el("div", { text: msg }));
}

function labelize(s) {
  return String(s).replace(/_/g, " ");
}

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function pct(v) {
  const num = typeof v === "string" ? parseFloat(v) : v;
  if (num == null || Number.isNaN(num)) return "\u2013";
  return (num <= 1 ? (num * 100).toFixed(2) : num.toFixed(2)) + "%";
}
