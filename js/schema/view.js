// Schema explorer view: hosts the d3 TreeView plus search, breadcrumb, details panel,
// legend, and export controls.
import { el, clear, append, icon } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { buildSchemaTree, constraintsOf } from "./tree-model.js";
import { TreeView } from "../viz/tree.js";

const TYPE_LEGEND = [
  ["object", "--accent"],
  ["array", "--sev-medium"],
  ["string", "--st-fixed"],
  ["number", "--sev-high"],
  ["boolean", "--st-recommended"],
];

export function renderSchemaExplorer(container, schemaDoc, options = {}) {
  clear(container);
  const treeData = buildSchemaTree(schemaDoc, { name: options.name || schemaDoc.title || "root" });

  const searchInput = el("input", {
    type: "search",
    placeholder: "Search properties\u2026",
    "aria-label": "Search schema properties",
  });
  const searchCount = el("span", { class: "tree-search-count" });

  const breadcrumb = el("div", { class: "breadcrumb" });
  const canvas = el("div", { class: "tree-canvas" });
  const panel = buildDetailsPanel();
  canvas.appendChild(panel.root);

  const legend = el(
    "div",
    { id: "legend" },
    TYPE_LEGEND.map(([name, varName]) =>
      el("span", { class: "legend-item" }, [
        swatch(varName),
        el("span", { text: name }),
      ])
    ).concat(
      el("span", { class: "legend-item" }, [
        el("span", { text: "\u21ba recursive \u00b7 * required" }),
      ])
    )
  );

  const toolbar = el("div", { class: "tree-toolbar" }, [
    el("div", { class: "tree-search" }, [icon("search"), searchInput]),
    searchCount,
    toolBtn("Expand all", () => tree.expandAll()),
    toolBtn("Collapse", () => tree.collapseAll()),
    toolBtn("Fit", () => tree.fit()),
    toolBtn("Zoom +", () => tree.zoomBy(1.3)),
    toolBtn("Zoom \u2212", () => tree.zoomBy(1 / 1.3)),
    toolBtn("SVG", () => download("svg")),
    toolBtn("PNG", () => download("png")),
  ]);

  const wrap = el("div", { class: "tree-wrap" }, [toolbar, breadcrumb, canvas]);
  container.appendChild(wrap);
  container.appendChild(legend);

  const tree = new TreeView(canvas, {
    label: (n) => n.name,
    secondary: (n) => secondaryLabel(n),
    kind: (n) => baseType(n.type),
    isRequired: (n) => n.required,
    isRecursive: (n) => n.recursive,
    initialDepth: 2,
    onSelect: (dataNode) => {
      showDetails(panel, dataNode);
      renderBreadcrumb(breadcrumb, dataNode, (pathArr) => tree.selectByPath(pathArr));
      if (options.onSelect) options.onSelect(dataNode);
    },
  });

  tree.setData(treeData);

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const count = tree.search(searchInput.value);
      searchCount.textContent = searchInput.value.trim()
        ? `${count} match${count === 1 ? "" : "es"}`
        : "";
    }, 180);
  });

  if (Array.isArray(options.initialPath) && options.initialPath.length) {
    requestAnimationFrame(() => tree.selectByPath(options.initialPath));
  }

  async function download(kind) {
    try {
      const url = await tree.toDataURL(kind);
      const a = el("a", { href: url, download: `csaf-schema-tree.${kind}` });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast("Export failed: " + err.message, "err");
    }
  }

  return {
    tree,
    focusSearch: () => searchInput.focus(),
    destroy: () => {
      tree.destroy();
      clear(container);
    },
  };
}

function secondaryLabel(n) {
  if (n.recursive) return n.type ? `${n.type} (ref)` : "ref";
  if (n.label && n.label !== n.type) return `${n.type} \u00b7 ${n.label}`;
  return n.type;
}

function baseType(type) {
  return String(type || "any").split(" ")[0];
}

function toolBtn(label, onClick) {
  return el("button", { class: "btn btn-outline", type: "button", text: label, on: { click: onClick } });
}

function swatch(varName) {
  const s = el("span", { class: "legend-swatch" });
  s.style.borderColor = `var(${varName})`;
  return s;
}

function buildDetailsPanel() {
  const title = el("div", { class: "details-title" });
  const body = el("div", { class: "details-body" });
  const closeBtn = el("button", {
    class: "btn btn-icon",
    type: "button",
    title: "Close",
    on: { click: () => root.classList.add("hidden") },
  });
  closeBtn.appendChild(icon("close"));
  const root = el("div", { class: "details-panel hidden" }, [
    el("div", { class: "details-head" }, [title, closeBtn]),
    body,
  ]);
  return { root, title, body };
}

function showDetails(panel, node) {
  panel.root.classList.remove("hidden");
  panel.title.textContent = node.title || node.name;
  const body = clear(panel.body);

  if (node.path && node.path.length) {
    body.appendChild(
      el("div", { class: "section-label", text: "/" + node.path.join("/") })
    );
  }
  if (node.description) {
    body.appendChild(el("div", { class: "desc", text: node.description }));
  }

  const constraints = constraintsOf(node.schema);
  const kv = [];
  kv.push(["type", node.type]);
  if (node.ref) kv.push(["$ref", node.ref]);
  for (const [k, val] of Object.entries(constraints)) {
    if (k === "type" || k === "const" || k === "default") {
      if (k !== "type") kv.push([k, format(val)]);
      continue;
    }
    kv.push([k, format(val)]);
  }
  if (kv.length) {
    const dl = el("dl", { class: "kv" });
    for (const [k, val] of kv) {
      dl.appendChild(el("dt", { text: k }));
      dl.appendChild(el("dd", { text: val }));
    }
    body.appendChild(dl);
  }

  if (Array.isArray(node.schema && node.schema.enum)) {
    body.appendChild(el("div", { class: "section-label", text: "enum" }));
    body.appendChild(
      el(
        "div",
        { class: "chips" },
        node.schema.enum.map((e) => el("span", { class: "chip", text: String(e) }))
      )
    );
  }

  const examples = node.schema && node.schema.examples;
  if (Array.isArray(examples) && examples.length) {
    body.appendChild(el("div", { class: "section-label", text: "examples" }));
    body.appendChild(
      el(
        "div",
        { class: "chips" },
        examples.slice(0, 8).map((e) => el("span", { class: "chip", text: format(e) }))
      )
    );
  }

  body.appendChild(el("div", { class: "section-label", text: "subschema" }));
  body.appendChild(el("pre", { class: "raw-schema", text: rawSchema(node.schema) }));
}

function renderBreadcrumb(container, node, onCrumb) {
  clear(container);
  const path = node.path || [];
  const rootCrumb = el("span", { class: "crumb", text: "root", on: { click: () => onCrumb([]) } });
  container.appendChild(rootCrumb);
  path.forEach((seg, i) => {
    container.appendChild(el("span", { class: "sep", text: " / " }));
    const sub = path.slice(0, i + 1);
    container.appendChild(
      el("span", { class: "crumb", text: String(seg), on: { click: () => onCrumb(sub) } })
    );
  });
}

function format(val) {
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function rawSchema(schema) {
  if (!schema) return "{}";
  // Shallow-ish copy: replace deep nested objects with placeholders to keep it readable.
  const shallow = (obj, depth) => {
    if (obj == null || typeof obj !== "object") return obj;
    if (depth <= 0) return Array.isArray(obj) ? ["\u2026"] : { "\u2026": "" };
    if (Array.isArray(obj)) return obj.slice(0, 20).map((v) => shallow(v, depth - 1));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = shallow(v, depth - 1);
    return out;
  };
  const text = JSON.stringify(shallow(schema, 3), null, 2);
  return text.length > 6000 ? text.slice(0, 6000) + "\n\u2026" : text;
}
