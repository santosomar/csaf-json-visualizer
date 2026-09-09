// Safe DOM construction helpers.
//
// Security (codeguard-0-client-side-web-security): the whole app renders
// attacker-controlled advisory JSON. We NEVER use innerHTML/outerHTML/insertAdjacentHTML
// with such data. All text goes through textContent, and every URL is scheme-checked
// before it becomes an href, to block javascript:/data: injection via references[].url.

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [attrs] - class, id, title, dataset:{}, on:{event:fn}, and plain attrs.
 * @param {(Node|string|null|undefined|Array)} [children]
 */
export function el(tag, attrs = {}, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv != null) node.dataset[dk] = String(dv);
      }
    } else if (key === "on") {
      for (const [evt, fn] of Object.entries(value)) node.addEventListener(evt, fn);
    } else if (key === "html") {
      // Intentionally unsupported to prevent accidental XSS sinks.
      throw new Error("el(): 'html' is not allowed; use text/children");
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  if (children == null) return parent;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function text(value) {
  return document.createTextNode(value == null ? "" : String(value));
}

/** Only http(s) URLs are allowed to become links; everything else renders as plain text. */
export function safeHref(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    /* not a valid URL */
  }
  return null;
}

/** Build an external anchor, or a plain text node if the URL is not safe. */
export function link(url, label) {
  const href = safeHref(url);
  const display = label != null ? label : url;
  if (!href) return text(display);
  return el("a", { href, target: "_blank", rel: "noopener noreferrer", text: display });
}

const ICONS = {
  search:
    "M11 11l4 4M3 8a5 5 0 1 0 10 0A5 5 0 0 0 3 8Z",
  close: "M5 5l10 10M15 5 5 15",
};

export function icon(name, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 18 18");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name] || "");
  svg.appendChild(path);
  return svg;
}
