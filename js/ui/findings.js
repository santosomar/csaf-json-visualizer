// Collapsible findings panel (validation + CSAF conformance), docked above the status bar.
import { el, clear } from "./dom.js";

export function createFindingsPanel(appEl, statusbarEl, onSelectFinding) {
  const list = el("div", { class: "findings-list" });
  const titleEl = el("span", { text: "Findings" });
  const chevron = el("span", { text: "\u25be" });
  const head = el("div", { class: "findings-head" }, [chevron, titleEl]);
  const panel = el("div", { class: "findings hidden" }, [head, list]);
  appEl.insertBefore(panel, statusbarEl);

  let collapsed = false;
  const setCollapsed = (c) => {
    collapsed = c;
    list.classList.toggle("hidden", c);
    chevron.textContent = c ? "\u25b8" : "\u25be";
  };
  head.addEventListener("click", () => setCollapsed(!collapsed));

  return {
    setFindings(findings) {
      clear(list);
      const errors = findings.filter((f) => f.severity === "error").length;
      const warnings = findings.filter((f) => f.severity === "warning").length;
      clear(titleEl);
      titleEl.appendChild(document.createTextNode("Findings "));
      if (errors) titleEl.appendChild(el("span", { class: "badge-count err", text: String(errors) }));
      if (warnings) titleEl.appendChild(el("span", { class: "badge-count warn", text: String(warnings) }));
      if (!errors && !warnings)
        titleEl.appendChild(el("span", { class: "badge-count ok", text: "0" }));

      if (!findings.length) {
        list.appendChild(el("div", { class: "finding info" }, [
          el("span", { class: "sev", text: "ok" }),
          el("span", { text: "No problems found." }),
          el("span", { text: "" }),
        ]));
        return;
      }

      for (const f of findings) {
        const row = el("div", {
          class: `finding ${f.severity}`,
          on: { click: () => onSelectFinding(f) },
        }, [
          el("span", { class: "sev", text: f.severity }),
          el("span", { text: f.message }),
          el("span", { class: "loc", text: f.pointer || "" }),
        ]);
        list.appendChild(row);
      }
    },
    show() {
      panel.classList.remove("hidden");
    },
    hide() {
      panel.classList.add("hidden");
    },
    toggle() {
      panel.classList.toggle("hidden");
    },
    setCollapsed,
    isVisible: () => !panel.classList.contains("hidden"),
  };
}
