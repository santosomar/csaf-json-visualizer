// Application bootstrap and orchestration.
import { createEditor } from "./ui/editor.js";
import { initTheme, toggleTheme, onThemeChange } from "./ui/theme.js";
import { initDropzone } from "./ui/dropzone.js";
import { createFindingsPanel } from "./ui/findings.js";
import { toast } from "./ui/toast.js";
import { el, clear } from "./ui/dom.js";
import { readState, writeState, onHashChange, encodePath, decodePath } from "./state.js";
import { renderSchemaExplorer } from "./schema/view.js";
import { renderAdvisory } from "./advisory/report.js";
import { detectSchemaVersion } from "./schema/registry.js";
import { isAdvisory, detectAdvisoryVersion } from "./advisory/model.js";
import { validateAdvisory } from "./validate/validator.js";

const EXAMPLES = [
  { group: "Schemas", items: [
    { id: "schema-2.0", label: "CSAF 2.0 schema", url: "data/csaf-2.0.schema.json", mode: "schema", v: "2.0" },
    { id: "schema-2.1", label: "CSAF 2.1 schema", url: "data/csaf-2.1.schema.json", mode: "schema", v: "2.1" },
  ]},
  { group: "Advisories (2.0)", items: [
    { id: "rhsa", label: "Red Hat RHSA-2021:5186", url: "data/examples/rhsa-2021_5186.json", mode: "advisory", v: "2.0" },
    { id: "vex", label: "VEX (sec-vex-2022-0001)", url: "data/examples/sec-vex-2022-0001.json", mode: "advisory", v: "2.0" },
    { id: "bsi", label: "BSI-2022-0001", url: "data/examples/bsi-2022-0001.json", mode: "advisory", v: "2.0" },
    { id: "cisco", label: "Cisco SA (large)", url: "data/examples/cisco-sa-20180328-smi2.json", mode: "advisory", v: "2.0" },
  ]},
  { group: "Advisories (2.1)", items: [
    { id: "bsi21", label: "BSI-2022-0001 (CSAF 2.1)", url: "data/examples/csaf-2.1-bsi-2022-0001.json", mode: "advisory", v: "2.1" },
  ]},
];

const dom = {};
let editor;
let findings;
let currentView = null;
let forcedMode = null; // "schema" | "advisory" | null (auto)
let detectedKind = "unknown";
let processTimer;
let validateToken = 0;
// When true, the "Validate as" version follows the loaded document; a manual change
// pins it until the next document is loaded, so the dropdown stops fighting the user.
let autoVersion = true;

async function main() {
  cache();
  initTheme();
  await waitForAce();
  editor = createEditor("editor");
  onThemeChange((t) => editor.setTheme(t));

  findings = createFindingsPanel(document.querySelector(".app"), dom.statusbar, (f) => {
    if (f.location) editor.gotoLocation(f.location.line, f.location.column);
  });

  wireToolbar();
  wireGutter();
  populateExamples();
  initDropzone(dom.dropzone, (text) => loadText(text));

  editor.onChange(() => {
    clearTimeout(processTimer);
    processTimer = setTimeout(() => process(), 350);
  });

  onHashChange((s) => applyHashNavigation(s));

  await initialLoad();
}

function cache() {
  dom.main = document.getElementById("main");
  dom.paneEditor = document.getElementById("pane-editor");
  dom.paneView = document.getElementById("pane-view");
  dom.gutter = document.getElementById("gutter");
  dom.statusbar = document.getElementById("statusbar");
  dom.statusMode = document.getElementById("status-mode");
  dom.statusValid = document.getElementById("status-valid");
  dom.statusDetected = document.getElementById("status-detected");
  dom.findingsToggle = document.getElementById("findings-toggle");
  dom.modeSchema = document.getElementById("mode-schema");
  dom.modeAdvisory = document.getElementById("mode-advisory");
  dom.versionSelect = document.getElementById("version-select");
  dom.exampleSelect = document.getElementById("example-select");
  dom.openBtn = document.getElementById("open-btn");
  dom.fileInput = document.getElementById("file-input");
  dom.editorToggle = document.getElementById("editor-toggle");
  dom.themeToggle = document.getElementById("theme-toggle");
  dom.dropzone = document.getElementById("dropzone");
}

function wireToolbar() {
  dom.modeSchema.addEventListener("click", () => setMode("schema"));
  dom.modeAdvisory.addEventListener("click", () => setMode("advisory"));
  dom.versionSelect.addEventListener("change", () => {
    autoVersion = false; // user pinned a version; stop auto-following the document
    const v = dom.versionSelect.value;
    // If the user is viewing a bundled CSAF schema, switching version swaps the schema.
    // Otherwise (their own advisory/schema) we just re-validate against the chosen version.
    if (viewingBundledSchema()) {
      loadExample({ url: `data/csaf-${v}.schema.json`, mode: "schema", v });
    } else {
      process();
    }
  });
  dom.openBtn.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", async () => {
    const file = dom.fileInput.files[0];
    if (file) loadText(await file.text(), file.name);
    dom.fileInput.value = "";
  });
  dom.editorToggle.addEventListener("click", () => {
    dom.main.classList.toggle("editor-collapsed");
    editor.resize();
  });
  dom.themeToggle.addEventListener("click", () => toggleTheme());
  dom.findingsToggle.addEventListener("click", () => findings.toggle());
  dom.exampleSelect.addEventListener("focus", dismissHint);
  dom.exampleSelect.addEventListener("change", () => {
    dismissHint();
    const sel = dom.exampleSelect.value;
    if (!sel) return;
    const item = allExamples().find((e) => e.id === sel);
    if (item) loadExample(item);
    dom.exampleSelect.value = "";
  });
}

function dismissHint() {
  dom.exampleSelect.classList.remove("attn");
}

// True when the editor holds one of the official OASIS CSAF schema documents (so the
// version selector can safely swap it), false for a user's own pasted content.
function viewingBundledSchema() {
  try {
    const obj = JSON.parse(editor.getValue());
    return !!(obj && typeof obj.$id === "string" && /oasis-open\.org\/csaf/.test(obj.$id));
  } catch {
    return false;
  }
}

function populateExamples() {
  for (const grp of EXAMPLES) {
    const og = el("optgroup", { label: grp.group });
    for (const item of grp.items) og.appendChild(el("option", { value: item.id, text: item.label }));
    dom.exampleSelect.appendChild(og);
  }
}

function allExamples() {
  return EXAMPLES.flatMap((g) => g.items);
}

async function loadExample(item) {
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (item.v) dom.versionSelect.value = item.v;
    forcedMode = item.mode;
    loadText(text, item.label);
  } catch (err) {
    toast("Failed to load example: " + err.message, "err");
  }
}

function loadText(text, name) {
  autoVersion = true; // a fresh document may be a different CSAF version
  dismissHint();
  editor.setValue(text);
  if (name) toast("Loaded " + name, "ok", 2500);
  process();
}

function setMode(mode) {
  forcedMode = mode;
  process();
}

function wireGutter() {
  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = dom.main.getBoundingClientRect();
    const pct = Math.min(85, Math.max(15, ((e.clientX - rect.left) / rect.width) * 100));
    dom.main.style.setProperty("--editor-w", pct + "%");
    editor.resize();
  };
  const stop = () => {
    dragging = false;
    dom.gutter.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stop);
  };
  dom.gutter.addEventListener("mousedown", (e) => {
    dragging = true;
    e.preventDefault();
    dom.gutter.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stop);
  });
}

async function initialLoad() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url");
  const state = readState();
  if (state.v && (state.v === "2.0" || state.v === "2.1")) dom.versionSelect.value = state.v;
  if (state.mode === "schema" || state.mode === "advisory") forcedMode = state.mode;

  if (url) {
    await loadFromUrl(url);
    return;
  }
  // Default: load the CSAF 2.0 schema so schema mode has content immediately.
  const version = dom.versionSelect.value || "2.0";
  try {
    const res = await fetch(`data/csaf-${version}.schema.json`);
    const text = await res.text();
    editor.setValue(text);
    if (!forcedMode) forcedMode = "schema";
    process();
  } catch (err) {
    process();
  }
  showOnboarding();
}

function showOnboarding() {
  // Draw the eye to the loader, and explain the flow once per browser.
  dom.exampleSelect.classList.add("attn");
  if (!localStorage.getItem("csaf-viz-onboarded")) {
    toast(
      'Showing the CSAF schema. To view a real advisory, pick one from "Load an example" \u2014 or paste/drop your own CSAF JSON.',
      "info",
      10000
    );
    try {
      localStorage.setItem("csaf-viz-onboarded", "1");
    } catch {
      /* storage may be unavailable */
    }
  }
}

async function loadFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    toast("Invalid ?url= value", "err");
    return;
  }
  if (parsed.protocol !== "https:") {
    toast("Only https:// URLs can be loaded via ?url=", "err");
    return;
  }
  try {
    const res = await fetch(parsed.href);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    loadText(text, parsed.hostname);
  } catch (err) {
    toast(
      "Could not fetch that URL (it may block cross-origin requests): " + err.message,
      "err",
      8000
    );
  }
}

async function process() {
  const text = editor.getValue();
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    setValidStatus("err", "Invalid JSON");
    const loc = errorLocation(e, text);
    findings.setFindings([
      { severity: "error", message: "JSON parse error: " + e.message, pointer: "", location: loc },
    ]);
    findings.show();
    editor.setAnnotations([{ row: loc.line, column: loc.column, text: e.message, type: "error" }]);
    renderEmpty("Fix the JSON syntax to visualize.");
    return;
  }

  editor.clearAnnotations();
  const advisory = isAdvisory(obj);
  // A CSAF 2.1 advisory carries a top-level $schema, so advisory detection wins.
  const schemaDoc = !advisory && isSchemaDoc(obj);
  detectedKind = advisory ? "advisory" : schemaDoc ? "schema" : "unknown";

  const advVer = advisory ? detectAdvisoryVersion(obj) : null;
  dom.statusDetected.textContent =
    "Detected: " + detectedKind + (advVer ? ` \u00b7 CSAF ${advVer}` : "");

  if (autoVersion && advisory && advVer) dom.versionSelect.value = advVer;

  // Detection is authoritative; a forced mode is only honored when it is compatible
  // with the actual content (an advisory is never a schema and vice versa).
  const forcedCompatible =
    (forcedMode === "advisory" && advisory) || (forcedMode === "schema" && schemaDoc);
  let mode = forcedCompatible ? forcedMode : detectedKind;

  if (mode === "unknown") {
    renderEmpty("This does not look like a JSON Schema or CSAF advisory (no document.csaf_version, $defs, or properties).");
    return;
  }

  if (mode === "advisory") {
    renderAdvisoryView(obj);
  } else {
    renderSchemaView(obj);
  }
}

function renderAdvisoryView(obj) {
  destroyView();
  setModeButtons("advisory");
  dom.statusMode.textContent = "Advisory mode";
  const state = readState();
  currentView = renderAdvisory(dom.paneView, obj, { initialTab: state.tab || "overview" });
  writeState({ mode: "advisory", v: dom.versionSelect.value }, { replace: true });
  runValidation(obj);
}

function renderSchemaView(obj) {
  destroyView();
  setModeButtons("schema");
  dom.statusMode.textContent = "Schema mode";
  const detected = detectSchemaVersion(obj);
  if (autoVersion && detected) dom.versionSelect.value = detected;
  const state = readState();
  currentView = renderSchemaExplorer(dom.paneView, obj, {
    name: obj.title,
    initialPath: decodePath(state.path),
    onSelect: (node) => {
      writeState({ mode: "schema", v: dom.versionSelect.value, path: encodePath(node.path) }, { replace: true });
    },
  });
  writeState({ mode: "schema", v: dom.versionSelect.value }, { replace: true });
  setValidStatus("", "Schema view");
  findings.setFindings([]);
}

async function runValidation(obj) {
  const version = dom.versionSelect.value || "2.0";
  const text = editor.getValue();
  setValidStatus("", "Validating\u2026");
  const token = ++validateToken;
  try {
    const { valid, findings: list } = await validateAdvisory(obj, version, text);
    if (token !== validateToken) return; // superseded
    findings.setFindings(list);
    const errors = list.filter((f) => f.severity === "error").length;
    const warnings = list.filter((f) => f.severity === "warning").length;
    if (valid && !warnings) setValidStatus("ok", `Valid CSAF ${version}`);
    else if (valid) setValidStatus("warn", `Valid \u00b7 ${warnings} warning(s)`);
    else setValidStatus("err", `${errors} error(s), ${warnings} warning(s)`);
    editor.setAnnotations(
      list.map((f) => ({
        row: f.location ? f.location.line : 0,
        column: f.location ? f.location.column : 0,
        text: f.message,
        type: f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "info",
      }))
    );
  } catch (err) {
    if (token !== validateToken) return;
    setValidStatus("err", "Validation error");
    toast("Validation failed: " + err.message, "err");
  }
}

function renderEmpty(msg) {
  destroyView();
  clear(dom.paneView);
  dom.paneView.appendChild(
    el("div", { class: "empty-state" }, [
      el("div", { text: msg }),
      el("div", { class: "pill-row" },
        allExamples().slice(0, 5).map((ex) =>
          el("span", { class: "example-chip", text: ex.label, on: { click: () => loadExample(ex) } })
        )
      ),
    ])
  );
}

function destroyView() {
  if (currentView && currentView.destroy) currentView.destroy();
  currentView = null;
}

function setModeButtons(mode) {
  dom.modeSchema.classList.toggle("active", mode === "schema");
  dom.modeAdvisory.classList.toggle("active", mode === "advisory");
}

function setValidStatus(kind, label) {
  dom.statusValid.className = "status-dot" + (kind ? " " + kind : "");
  dom.statusValid.textContent = label;
}

function applyHashNavigation(state) {
  if (state.tab && currentView && currentView.showTab) currentView.showTab(state.tab);
}

function isSchemaDoc(obj) {
  if (!obj || typeof obj !== "object") return false;
  return (
    typeof obj.$schema === "string" ||
    typeof obj.$defs === "object" ||
    typeof obj.definitions === "object" ||
    (typeof obj.properties === "object" && (obj.type === "object" || obj.type === undefined))
  );
}

function errorLocation(error, text) {
  // Extract "position N" from V8/SpiderMonkey JSON error messages.
  const m = /position (\d+)/.exec(error.message || "");
  if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos);
    const line = (before.match(/\n/g) || []).length;
    const column = pos - (before.lastIndexOf("\n") + 1);
    return { line, column };
  }
  const lm = /line (\d+)/.exec(error.message || "");
  if (lm) return { line: Number(lm[1]) - 1, column: 0 };
  return { line: 0, column: 0 };
}

function waitForAce(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.ace) return resolve();
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.ace) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(iv);
        reject(new Error("Ace editor did not load"));
      }
    }, 50);
  });
}

main().catch((err) => {
  console.error(err);
  toast("Startup error: " + err.message, "err", 0);
});
