import { test } from "node:test";
import assert from "node:assert/strict";
import { Validator } from "../js/vendor/json-schema.mjs";
import { normalizeDialect, detectSchemaVersion } from "../js/schema/registry.js";
import { buildPointerMap, normalizeInstanceLocation } from "../js/validate/json-source-map.js";
import { readFileSync, readdirSync } from "node:fs";

const dataDir = new URL("../data/", import.meta.url);
const loadSchema = (v) =>
  JSON.parse(readFileSync(new URL(`csaf-${v}.schema.json`, dataDir)));

const validators = {};
for (const v of ["2.0", "2.1"]) {
  validators[v] = new Validator(normalizeDialect(loadSchema(v)), "2020-12", false);
}

test("normalizeDialect rewrites the OASIS dialect and neutralizes external CVSS refs", () => {
  const norm = normalizeDialect(loadSchema("2.1"));
  assert.equal(norm.$schema, "https://json-schema.org/draft/2020-12/schema");
  const json = JSON.stringify(norm);
  assert.ok(!/first\.org\/cvss/.test(json.replace(/x-external-ref/g, "")) || json.includes("x-external-ref"));
  // No raw external $ref remains.
  assert.ok(!/"\$ref"\s*:\s*"https?:/.test(json));
});

test("detectSchemaVersion reads $id", () => {
  assert.equal(detectSchemaVersion(loadSchema("2.0")), "2.0");
  assert.equal(detectSchemaVersion(loadSchema("2.1")), "2.1");
});

test("every bundled example validates against its declared schema version", () => {
  const examplesDir = new URL("examples/", dataDir);
  for (const f of readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(new URL(f, examplesDir)));
    const v = doc.document && doc.document.csaf_version;
    if (!v) continue;
    const result = validators[v].validate(doc);
    assert.equal(result.valid, true, `${f} should be valid CSAF ${v}: ${JSON.stringify(result.errors?.slice(0, 3))}`);
  }
});

test("a broken advisory produces schema errors with usable pointers", () => {
  const doc = JSON.parse(readFileSync(new URL("examples/rhsa-2021_5186.json", dataDir)));
  delete doc.document.title; // required
  const result = validators["2.0"].validate(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every((e) => typeof e.instanceLocation === "string"));
});

test("buildPointerMap maps pointers to 0-based line/column", () => {
  const text = '{\n  "document": {\n    "title": "Hello"\n  }\n}';
  const map = buildPointerMap(text);
  assert.ok(map.has("/document/title"));
  assert.equal(map.get("/document/title").line, 2);
  assert.equal(normalizeInstanceLocation("#/document/title"), "/document/title");
});
