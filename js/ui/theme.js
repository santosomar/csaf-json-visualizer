// Theme management: persist choice, toggle, and notify listeners (e.g. the editor).
const KEY = "csaf-viz-theme";
const listeners = new Set();

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") {
    document.documentElement.dataset.theme = saved;
  } else {
    delete document.documentElement.dataset.theme; // follow prefers-color-scheme
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme || null;
}

export function toggleTheme() {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const current = currentTheme() || (prefersDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(KEY, next);
  for (const fn of listeners) fn(next);
  return next;
}

export function onThemeChange(fn) {
  listeners.add(fn);
}
