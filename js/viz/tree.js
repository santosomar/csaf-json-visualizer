// Generic collapsible tree on d3 v7. Used for both the schema explorer and the
// advisory product tree via accessor options, so neither knows about d3.
import * as d3 from "../vendor/d3.mjs";

const DX = 26; // vertical spacing between siblings
const DY = 200; // horizontal spacing between depths

export class TreeView {
  /**
   * @param {HTMLElement} canvas - container that will hold the <svg>
   * @param {object} opts
   *   label(node)     -> string
   *   secondary(node) -> string|null   (small monospace annotation)
   *   kind(node)      -> string        (sets data-type for color)
   *   isRequired(node)-> boolean
   *   isRecursive(node)-> boolean
   *   onSelect(dataNode) -> void
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = {
      label: (n) => n.name,
      secondary: (n) => n.secondary || null,
      kind: (n) => n.kind || n.type || "any",
      isRequired: (n) => !!n.required,
      isRecursive: (n) => !!n.recursive,
      onSelect: () => {},
      initialDepth: 2,
      ...opts,
    };
    this._build();
  }

  _build() {
    this.svg = d3
      .select(this.canvas)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");
    this.viewport = this.svg.append("g");
    this.linkLayer = this.viewport.append("g").attr("fill", "none");
    this.nodeLayer = this.viewport.append("g");

    this.zoom = d3
      .zoom()
      .scaleExtent([0.15, 2.5])
      .on("zoom", (event) => this.viewport.attr("transform", event.transform));
    this.svg.call(this.zoom);
  }

  setData(dataRoot) {
    this.root = d3.hierarchy(dataRoot);
    let i = 0;
    this.root.each((d) => {
      d.id = ++i;
      d._all = d.children;
    });
    // Collapse below the initial depth.
    this.root.each((d) => {
      if (d.depth >= this.opts.initialDepth && d._all) d.children = null;
    });
    this.root.x0 = 0;
    this.root.y0 = 0;
    this.selected = null;
    this.update(this.root, false);
    this._scheduleFit();
  }

  // Defer the initial fit until the SVG has real dimensions (two rAFs), retrying briefly
  // if the container has not been laid out yet.
  _scheduleFit(attempt = 0) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!this.root || !this.canvas.isConnected) return;
        const { width, height } = this.canvas.getBoundingClientRect();
        if (width < 50 || height < 50) {
          // Container not laid out yet (e.g. still on a hidden tab). Retry a while, then
          // give up quietly; fit() will be called again when the tab is shown.
          if (attempt < 30) this._scheduleFit(attempt + 1);
        } else {
          this.fit(false);
        }
      })
    );
  }

  _layout() {
    const tree = d3.tree().nodeSize([DX, DY]);
    tree(this.root);
  }

  update(source, animate = true) {
    if (!this.root) return;
    this._layout();
    const dur = animate ? 250 : 0;
    const nodes = this.root.descendants();
    const links = this.root.links();

    // Nodes
    const node = this.nodeLayer
      .selectAll("g.node")
      .data(nodes, (d) => d.id);

    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", () => `translate(${source.y0},${source.x0})`)
      .on("click", (event, d) => {
        event.stopPropagation();
        this._select(d);
        this._toggle(d);
      });

    nodeEnter
      .append("circle")
      .attr("r", 5);

    nodeEnter
      .append("text")
      .attr("dy", "0.32em")
      .attr("class", "label-text");

    nodeEnter
      .append("text")
      .attr("dy", "1.5em")
      .attr("class", "type-label");

    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate
      .attr("data-type", (d) => this.opts.kind(d.data))
      .classed("required", (d) => this.opts.isRequired(d.data))
      .classed("selected", (d) => d === this.selected)
      .classed("match", (d) => !!d._match);

    nodeUpdate
      .transition()
      .duration(dur)
      .attr("transform", (d) => `translate(${d.y},${d.x})`);

    nodeUpdate
      .select("circle")
      .classed("collapsed", (d) => !d.children && (d._all || this.opts.isRecursive(d.data)));

    nodeUpdate
      .select("text.label-text")
      .attr("x", (d) => (d._all || this.opts.isRecursive(d.data) ? -10 : 10))
      .attr("text-anchor", (d) => (d._all || this.opts.isRecursive(d.data) ? "end" : "start"))
      .text((d) => {
        const req = this.opts.isRequired(d.data) ? " *" : "";
        const rec = this.opts.isRecursive(d.data) ? " \u21ba" : "";
        return this.opts.label(d.data) + req + rec;
      });

    nodeUpdate
      .select("text.type-label")
      .attr("x", (d) => (d._all || this.opts.isRecursive(d.data) ? -10 : 10))
      .attr("text-anchor", (d) => (d._all || this.opts.isRecursive(d.data) ? "end" : "start"))
      .text((d) => this.opts.secondary(d.data) || "");

    node
      .exit()
      .transition()
      .duration(dur)
      .attr("transform", () => `translate(${source.y},${source.x})`)
      .remove();

    // Links
    const diagonal = d3
      .linkHorizontal()
      .x((d) => d.y)
      .y((d) => d.x);

    const link = this.linkLayer
      .selectAll("path.link")
      .data(links, (d) => d.target.id);

    const linkEnter = link
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", () => {
        const o = { x: source.x0, y: source.y0 };
        return diagonal({ source: o, target: o });
      });

    linkEnter
      .merge(link)
      .classed("on-path", (d) => d.target._onPath)
      .transition()
      .duration(dur)
      .attr("d", diagonal);

    link
      .exit()
      .transition()
      .duration(dur)
      .attr("d", () => {
        const o = { x: source.x, y: source.y };
        return diagonal({ source: o, target: o });
      })
      .remove();

    this.root.each((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  _toggle(d) {
    if (d.children) {
      d.children = null;
    } else if (d._all) {
      d.children = d._all;
    } else {
      return;
    }
    this.update(d);
  }

  _select(d) {
    this.selected = d;
    this.nodeLayer.selectAll("g.node").classed("selected", (n) => n === d);
    this.opts.onSelect(d.data, d);
  }

  /** Expand every ancestor of nodes matching predicate; returns matched data nodes. */
  expandWhere(predicate) {
    if (!this.root) return [];
    const matched = [];
    const walk = (d) => {
      const kids = d.children || d._all;
      if (predicate(d.data, d)) matched.push(d);
      (kids || []).forEach(walk);
    };
    walk(this.root);
    for (const m of matched) {
      let p = m.parent;
      while (p) {
        if (!p.children && p._all) p.children = p._all;
        p = p.parent;
      }
    }
    return matched;
  }

  search(term) {
    if (!this.root) return 0;
    const q = (term || "").trim().toLowerCase();
    this.root.each((d) => (d._match = false));
    if (!q) {
      this.update(this.root, false);
      return 0;
    }
    const matched = this.expandWhere((data) =>
      String(this.opts.label(data)).toLowerCase().includes(q)
    );
    matched.forEach((d) => (d._match = true));
    this.update(this.root, false);
    if (matched[0]) this.centerNode(matched[0]);
    return matched.length;
  }

  selectByPath(pathArr) {
    if (!this.root || !Array.isArray(pathArr)) return null;
    const target = JSON.stringify(pathArr);
    const matched = this.expandWhere((data) => JSON.stringify(data.path || []) === target);
    if (matched[0]) {
      this.update(this.root, false);
      this._select(matched[0]);
      this.centerNode(matched[0]);
      return matched[0];
    }
    return null;
  }

  expandAll() {
    this.root.each((d) => {
      if (d._all) d.children = d._all;
    });
    this.update(this.root, false);
  }

  collapseAll() {
    this.root.each((d) => {
      if (d.depth >= 1 && d._all) d.children = null;
    });
    this.update(this.root, false);
  }

  centerNode(d) {
    if (!this.canvas.isConnected) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const scale = d3.zoomTransform(this.svg.node()).k || 1;
    const t = d3.zoomIdentity
      .translate(width / 3 - d.y * scale, height / 2 - d.x * scale)
      .scale(scale);
    this.svg.transition().duration(300).call(this.zoom.transform, t);
  }

  fit(animate = true) {
    if (!this.root || !this.canvas.isConnected) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    // The <svg> is sized at 100%; if the container isn't laid out (hidden tab, detached),
    // width/height are 0 and d3's zoom would throw "Could not resolve relative length".
    if (width < 1 || height < 1) return;
    const nodes = this.root.descendants();
    const xs = nodes.map((d) => d.x);
    const ys = nodes.map((d) => d.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxY - minY + DY;
    const h = maxX - minX + DX * 2;
    let scale = Math.min(1.1, 0.9 * Math.min(width / w, height / h));
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    const tx = width / 2 - ((minY + maxY) / 2) * scale;
    const ty = height / 2 - ((minX + maxX) / 2) * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    const sel = animate ? this.svg.transition().duration(300) : this.svg;
    sel.call(this.zoom.transform, t);
  }

  zoomBy(factor) {
    this.svg.transition().duration(150).call(this.zoom.scaleBy, factor);
  }

  exportSVG() {
    const clone = this.svg.node().cloneNode(true);
    const { width, height } = this._contentBounds();
    clone.setAttribute("width", width);
    clone.setAttribute("height", height);
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
    // Reset the pan/zoom transform so the whole tree is visible.
    const g = clone.querySelector("g");
    if (g) g.setAttribute("transform", `translate(${DY},${height / 2})`);
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = this._exportStyles();
    clone.insertBefore(style, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }

  _contentBounds() {
    const nodes = this.root.descendants();
    const xs = nodes.map((d) => d.x);
    const ys = nodes.map((d) => d.y);
    return {
      width: Math.ceil(Math.max(...ys) - Math.min(...ys) + DY * 2),
      height: Math.ceil(Math.max(...xs) - Math.min(...xs) + DX * 4),
    };
  }

  _exportStyles() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim();
    return `
      svg { background: ${v("--bg", "#fff")}; font-family: sans-serif; }
      path.link { fill: none; stroke: ${v("--border-strong", "#999")}; stroke-width: 1.5px; }
      .node circle { fill: ${v("--bg-elevated", "#fff")}; stroke: ${v("--accent", "#2f6feb")}; stroke-width: 1.5px; }
      .node circle.collapsed { fill: ${v("--accent", "#2f6feb")}; }
      .node text.label-text { font-size: 12px; fill: ${v("--text", "#000")}; }
      .node text.type-label { font-size: 10px; fill: ${v("--text-faint", "#888")}; font-family: monospace; }
    `;
  }

  toDataURL(kind = "svg") {
    const svgString = this.exportSVG();
    const svgData = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
    if (kind === "svg") return Promise.resolve(svgData);
    return new Promise((resolve, reject) => {
      const { width, height } = this._contentBounds();
      const scale = 2;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = svgData;
    });
  }

  destroy() {
    d3.select(this.canvas).selectAll("*").remove();
  }
}
