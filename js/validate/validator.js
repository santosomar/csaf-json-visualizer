// Schema validation via @cfworker/json-schema (draft 2020-12, no code generation → CSP-safe).
import { Validator } from "../vendor/json-schema.mjs";
import { loadSchema } from "../schema/registry.js";
import { buildPointerMap, normalizeInstanceLocation } from "./json-source-map.js";
import { runCsafTests } from "./csaf-tests.js";

const validatorCache = new Map();

async function getValidator(version) {
  if (validatorCache.has(version)) return validatorCache.get(version);
  const { normalized } = await loadSchema(version);
  // shortCircuit=false → collect ALL errors, not just the first.
  const v = new Validator(normalized, "2020-12", false);
  validatorCache.set(version, v);
  return v;
}

/**
 * Validate an advisory instance against the CSAF schema of `version`, and run the
 * additional CSAF conformance tests that JSON Schema alone cannot express.
 *
 * @param {object} instance - parsed JSON
 * @param {string} version - "2.0" | "2.1"
 * @param {string} sourceText - raw editor text, for pointer→line mapping
 * @returns {Promise<{valid:boolean, findings:Array}>}
 */
export async function validateAdvisory(instance, version, sourceText) {
  const validator = await getValidator(version);
  const result = validator.validate(instance);
  const pointerMap = buildPointerMap(sourceText || "");

  const findings = [];
  if (!result.valid) {
    for (const err of result.errors || []) {
      const pointer = normalizeInstanceLocation(err.instanceLocation);
      // Skip the noisy top-level "does not match schema" roll-ups when a more specific
      // error exists for a deeper pointer.
      findings.push({
        severity: "error",
        source: "schema",
        message: err.error || "Schema violation",
        keyword: err.keyword,
        pointer,
        location: locate(pointerMap, pointer),
      });
    }
  }

  // Conformance tests (undefined product references, duplicates, TLP, etc.).
  const testFindings = runCsafTests(instance, version);
  for (const f of testFindings) {
    findings.push({ ...f, location: locate(pointerMap, f.pointer) });
  }

  // De-noise: drop generic parent errors that duplicate a child error.
  const deduped = dedupe(findings);
  return { valid: deduped.every((f) => f.severity !== "error"), findings: deduped };
}

function locate(map, pointer) {
  if (map.has(pointer)) return map.get(pointer);
  // Walk up to the nearest known ancestor.
  const parts = pointer.split("/");
  while (parts.length > 1) {
    parts.pop();
    const p = parts.join("/");
    if (map.has(p)) return map.get(p);
  }
  return map.get("") || { line: 0, column: 0, pointer };
}

function dedupe(findings) {
  const seen = new Set();
  const bySpecificity = [...findings].sort(
    (a, b) => b.pointer.length - a.pointer.length
  );
  const covered = new Set();
  // Mark generic "properties"/"required" roll-ups whose child already reported.
  const specificPointers = new Set(
    findings.filter((f) => f.keyword !== "properties").map((f) => f.pointer)
  );
  const out = [];
  for (const f of findings) {
    const key = `${f.severity}|${f.pointer}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      f.keyword === "properties" &&
      [...specificPointers].some((p) => p.startsWith(f.pointer + "/"))
    ) {
      continue; // a deeper, more useful error exists
    }
    out.push(f);
  }
  // Sort by source line for display.
  out.sort((a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0));
  return out;
}
