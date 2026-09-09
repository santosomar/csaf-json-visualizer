// Whole-window drag & drop for loading a CSAF JSON file.
export function initDropzone(overlayEl, onFileText) {
  let depth = 0;

  const show = () => overlayEl.classList.add("visible");
  const hide = () => overlayEl.classList.remove("visible");

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    show();
  });

  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) hide();
  });

  window.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    hide();
    const file = e.dataTransfer.files[0];
    if (file) {
      const text = await file.text();
      onFileText(text, file.name);
    }
  });
}

function hasFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}
