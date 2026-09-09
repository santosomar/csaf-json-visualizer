// URL-hash-backed app state, for shareable deep links.
// Example: #mode=advisory&v=2.1&tab=matrix   or   #mode=schema&v=2.0&path=document/title

const listeners = new Set();
let suppress = false;

export function readState() {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const state = {};
  for (const [k, v] of params) state[k] = v;
  return state;
}

export function writeState(patch, { replace = true } = {}) {
  const state = { ...readState(), ...patch };
  for (const k of Object.keys(state)) {
    if (state[k] == null || state[k] === "") delete state[k];
  }
  const params = new URLSearchParams(state);
  const hash = "#" + params.toString();
  suppress = true;
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  suppress = false;
}

export function onHashChange(fn) {
  listeners.add(fn);
  window.addEventListener("hashchange", () => {
    if (suppress) return;
    fn(readState());
  });
}

/** Encode/decode a schema path array to/from the hash. */
export function encodePath(pathArr) {
  return (pathArr || []).map(encodeURIComponent).join("/");
}

export function decodePath(str) {
  if (!str) return [];
  return str.split("/").map((s) => {
    const dec = decodeURIComponent(s);
    return /^\d+$/.test(dec) ? Number(dec) : dec;
  });
}
