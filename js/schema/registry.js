// Loads and caches the bundled CSAF schemas, and normalizes their $schema dialect
// so any draft-2020-12 validator can compile them.

const SCHEMA_URLS = {
  "2.0": "data/csaf-2.0.schema.json",
  "2.1": "data/csaf-2.1.schema.json",
};

const DRAFT_2020 = "https://json-schema.org/draft/2020-12/schema";

const cache = new Map();

/**
 * CSAF 2.1 declares its own metaschema URI (.../v2.1/schema/meta.json) that enables the
 * format-assertion vocabulary. Generic validators don't know that URI, so we rewrite the
 * top-level $schema to plain draft-2020-12. Formats are asserted explicitly by the
 * validator instead. We clone so the original document is never mutated.
 *
 * We also neutralize external $refs to the FIRST.org CVSS schemas. Those schemas are
 * authored in three different, mutually incompatible dialects (CVSS v2.0/v3.0 use
 * draft-04, v3.1 uses draft-07, v4.0 uses FIRST's own metaschema), and the 2.1 ref target
 * ("cvss-v4.0.2.json") does not match any published file. Compiling them under draft
 * 2020-12 would raise spurious errors, so each external CVSS reference is replaced by a
 * permissive object schema. The CVSS score, vector, and version are still fully rendered
 * in the advisory report; only the internal CVSS structure is not schema-checked.
 */
export function normalizeDialect(schema) {
  const clone = structuredClone(schema);
  if (typeof clone.$schema === "string" && clone.$schema.includes("oasis-open.org")) {
    clone.$schema = DRAFT_2020;
  }
  neutralizeExternalRefs(clone);
  return clone;
}

function isExternalRefOnly(s) {
  return (
    s &&
    typeof s === "object" &&
    typeof s.$ref === "string" &&
    /^https?:\/\//.test(s.$ref) &&
    Object.keys(s).length === 1
  );
}

function neutralizeExternalRefs(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(neutralizeExternalRefs);
    return;
  }

  // Collapse combinators (e.g. cvss_v3: oneOf[cvss-v3.0, cvss-v3.1]) whose branches are
  // all external refs into a single permissive object, so oneOf/anyOf don't spuriously
  // match multiple identical placeholders.
  for (const kw of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(node[kw]) && node[kw].length && node[kw].every(isExternalRefOnly)) {
      node["x-external-ref"] = node[kw].map((s) => s.$ref);
      delete node[kw];
      node.type = node.type || "object";
      node.title = node.title || "External schema (not validated here)";
    }
  }

  if (typeof node.$ref === "string" && /^https?:\/\//.test(node.$ref)) {
    const original = node.$ref;
    delete node.$ref;
    node.type = "object";
    node.title = node.title || "External schema (not validated here)";
    node["x-external-ref"] = original;
    return;
  }

  for (const value of Object.values(node)) neutralizeExternalRefs(value);
}

/** Fetch (once) and return the CSAF schema for the given version. */
export async function loadSchema(version) {
  const url = SCHEMA_URLS[version];
  if (!url) throw new Error(`Unknown CSAF version: ${version}`);
  if (cache.has(version)) return cache.get(version);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load schema ${url} (HTTP ${res.status})`);
  const raw = await res.json();
  const entry = { raw, normalized: normalizeDialect(raw), version };
  cache.set(version, entry);
  return entry;
}

export function availableVersions() {
  return Object.keys(SCHEMA_URLS);
}

/** Detect which CSAF version a schema *document* declares (for schema-explorer mode). */
export function detectSchemaVersion(schema) {
  const id = schema && typeof schema.$id === "string" ? schema.$id : "";
  if (id.includes("/v2.1/")) return "2.1";
  if (id.includes("/v2.0/")) return "2.0";
  return null;
}
