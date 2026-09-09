// Thin wrapper around the self-hosted Ace editor (loaded as window.ace).
// The built-in JSON worker is disabled: we run our own draft-2020-12 + CSAF validation.

let editor;

export function createEditor(elementId) {
  const ace = window.ace;
  if (!ace) throw new Error("Ace editor failed to load");
  ace.config.set("basePath", "js/vendor/ace");
  ace.config.set("loadWorkerFromBlob", false);

  editor = ace.edit(elementId);
  editor.session.setMode("ace/mode/json");
  editor.session.setUseWorker(false);
  editor.setOptions({
    fontSize: "13px",
    showPrintMargin: false,
    tabSize: 2,
    useSoftTabs: true,
    wrap: true,
    highlightActiveLine: true,
  });
  applyTheme(document.documentElement.dataset.theme);
  return api;
}

function applyTheme(theme) {
  if (!editor) return;
  const dark =
    theme === "dark" ||
    (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  editor.setTheme(dark ? "ace/theme/github_dark" : "ace/theme/chrome");
}

const api = {
  getValue: () => (editor ? editor.getValue() : ""),
  setValue(text) {
    editor.setValue(text, -1);
    editor.clearSelection();
  },
  onChange(fn) {
    editor.session.on("change", fn);
  },
  gotoLocation(line, column) {
    editor.gotoLine((line || 0) + 1, column || 0, true);
    editor.scrollToLine((line || 0) + 1, true, true, () => {});
    editor.focus();
  },
  setAnnotations(annotations) {
    editor.session.setAnnotations(annotations || []);
  },
  clearAnnotations() {
    editor.session.clearAnnotations();
  },
  setTheme: applyTheme,
  focus: () => editor && editor.focus(),
  resize: () => editor && editor.resize(),
};
