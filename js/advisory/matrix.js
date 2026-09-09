// Product x vulnerability status matrix (the VEX view).
import { el, clear } from "../ui/dom.js";
import { severityClass, worstSeverity } from "./model.js";

// Map raw product_status categories to a display cell.
const STATUS = {
  known_affected: { code: "Affected", cls: "st-affected", prio: 5 },
  first_affected: { code: "Affected", cls: "st-affected", prio: 5 },
  last_affected: { code: "Affected", cls: "st-affected", prio: 5 },
  under_investigation: { code: "Investigating", cls: "st-investigating", prio: 4 },
  known_not_affected: { code: "Not affected", cls: "st-not-affected", prio: 3 },
  fixed: { code: "Fixed", cls: "st-fixed", prio: 2 },
  first_fixed: { code: "Fixed", cls: "st-fixed", prio: 2 },
  recommended: { code: "Recommended", cls: "st-recommended", prio: 1 },
  unknown: { code: "Unknown", cls: "st-unknown", prio: 0 },
};

const SEV_ORDER = ["none", "low", "medium", "high", "critical"];

export function renderMatrix(host, model, index, onProductClick) {
  clear(host);
  const wrap = el("div", {});
  host.appendChild(wrap);

  const vulns = model.vulnerabilities;
  if (!vulns.length) {
    wrap.appendChild(el("div", { class: "empty-state" }, el("div", { text: "No vulnerabilities to chart." })));
    return { highlight() {}, root: wrap };
  }

  // Build status[pid][vulnIndex] = statusDef
  const productIds = new Set();
  const cells = new Map(); // pid -> Map(vi -> def)
  vulns.forEach((v, vi) => {
    for (const cat of Object.keys(v.productStatus || {})) {
      const def = STATUS[cat];
      if (!def) continue;
      for (const pid of v.productStatus[cat] || []) {
        productIds.add(pid);
        if (!cells.has(pid)) cells.set(pid, new Map());
        const existing = cells.get(pid).get(vi);
        if (!existing || def.prio > existing.prio) cells.get(pid).set(vi, def);
      }
    }
  });

  const allProducts = [...productIds].sort((a, b) =>
    index.resolve(a).localeCompare(index.resolve(b))
  );

  const activeStatuses = new Set(Object.values(STATUS).map((s) => s.code));
  let minSeverity = "none";

  // Controls
  const statusToggles = el("div", { class: "matrix-controls" });
  const uniqueCodes = [...new Set(Object.values(STATUS).map((s) => s.code))];
  for (const code of uniqueCodes) {
    const cb = el("input", { type: "checkbox", checked: true });
    cb.addEventListener("change", () => {
      if (cb.checked) activeStatuses.add(code);
      else activeStatuses.delete(code);
      draw();
    });
    statusToggles.appendChild(el("label", { class: "pill" }, [cb, el("span", { text: " " + code })]));
  }

  const sevSelect = el("select", { class: "select" });
  for (const s of ["none", "low", "medium", "high", "critical"]) {
    sevSelect.appendChild(el("option", { value: s, text: s === "none" ? "All severities" : `\u2265 ${s}` }));
  }
  sevSelect.addEventListener("change", () => {
    minSeverity = sevSelect.value;
    draw();
  });

  const controls = el("div", { class: "matrix-controls" }, [
    el("span", { class: "section-label", text: "Filter status:" }),
  ]);
  controls.appendChild(statusToggles);
  controls.appendChild(el("span", { class: "section-label", text: "Severity:" }));
  controls.appendChild(sevSelect);

  const scroll = el("div", { class: "matrix-scroll" });
  const legend = el("div", { class: "matrix-legend" });
  for (const code of uniqueCodes) {
    const def = Object.values(STATUS).find((s) => s.code === code);
    const sw = el("span", { class: "sw" });
    sw.style.background = `var(--${def.cls.replace("st-", "st-")})`;
    legend.appendChild(el("span", {}, [sw, el("span", { text: code })]));
  }

  wrap.appendChild(el("h2", { class: "section-title", text: "VEX Status Matrix" }));
  wrap.appendChild(controls);
  wrap.appendChild(scroll);
  wrap.appendChild(legend);

  const rowRefs = new Map();

  function visibleVulnIndexes() {
    const minIdx = SEV_ORDER.indexOf(minSeverity);
    return vulns
      .map((v, vi) => vi)
      .filter((vi) => {
        const sev = worstSeverity(vulns[vi]) || "none";
        return SEV_ORDER.indexOf(sev) >= minIdx;
      });
  }

  function draw() {
    clear(scroll);
    rowRefs.clear();
    const cols = visibleVulnIndexes();

    const headRow = el("tr", {}, [el("th", { text: "Product \\ Vulnerability" })]);
    for (const vi of cols) {
      const v = vulns[vi];
      const sev = worstSeverity(v);
      headRow.appendChild(
        el("th", { title: v.title || "" }, [
          el("div", { text: v.cve || v.title || `vuln ${vi + 1}` }),
          sev ? el("span", { class: `badge ${severityClass(sev)}`, text: sev }) : null,
        ])
      );
    }

    const body = el("tbody", {});
    for (const pid of allProducts) {
      const rowCells = cells.get(pid) || new Map();
      // Skip rows with no visible active status.
      const hasVisible = cols.some((vi) => {
        const def = rowCells.get(vi);
        return def && activeStatuses.has(def.code);
      });
      if (!hasVisible) continue;

      const name = index.resolve(pid);
      const th = el("th", { title: pid, text: name });
      th.addEventListener("click", () => onProductClick && onProductClick(pid));
      th.style.cursor = "pointer";
      const tr = el("tr", {}, [th]);
      for (const vi of cols) {
        const def = rowCells.get(vi);
        if (def && activeStatuses.has(def.code)) {
          tr.appendChild(el("td", { class: `status-cell ${def.cls}`, title: def.code, text: shortCode(def.code) }));
        } else {
          tr.appendChild(el("td", { class: "status-cell", text: "" }));
        }
      }
      body.appendChild(tr);
      rowRefs.set(pid, tr);
    }

    scroll.appendChild(
      el("table", { class: "matrix" }, [el("thead", {}, headRow), body])
    );
  }

  draw();

  return {
    root: wrap,
    highlight(productId) {
      for (const tr of rowRefs.values()) tr.classList.remove("hl");
      const tr = rowRefs.get(productId);
      if (tr) {
        tr.classList.add("hl");
        tr.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
  };
}

function shortCode(code) {
  switch (code) {
    case "Affected": return "AFF";
    case "Not affected": return "N/A";
    case "Fixed": return "FIX";
    case "Investigating": return "INV";
    case "Recommended": return "REC";
    default: return "?";
  }
}
