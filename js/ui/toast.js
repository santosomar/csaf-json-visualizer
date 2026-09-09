// Lightweight, non-blocking notifications (replaces the old alert() calls).
import { el, clear } from "./dom.js";

let stack;

function ensureStack() {
  if (!stack) stack = document.getElementById("toasts");
  return stack;
}

/**
 * @param {string} message
 * @param {"info"|"ok"|"warn"|"err"} [kind]
 * @param {number} [ms] - auto-dismiss delay; 0 keeps it until clicked.
 */
export function toast(message, kind = "info", ms = 5000) {
  const container = ensureStack();
  if (!container) return;
  const node = el("div", {
    class: `toast ${kind}`,
    text: message,
    on: {
      click() {
        node.remove();
      },
    },
  });
  container.appendChild(node);
  if (ms > 0) {
    setTimeout(() => {
      node.style.opacity = "0";
      setTimeout(() => node.remove(), 200);
    }, ms);
  }
  return node;
}

export function clearToasts() {
  const container = ensureStack();
  if (container) clear(container);
}
