import { test } from "node:test";
import assert from "node:assert/strict";
import { runCsafTests } from "../js/validate/csaf-tests.js";
import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/examples/${name}`, import.meta.url)));

const has = (findings, testId) => findings.some((f) => f.test === testId);

test("official examples pass the conformance tests (no errors)", () => {
  for (const f of ["rhsa-2021_5186.json", "sec-vex-2022-0001.json", "csaf-2.1-bsi-2022-0001.json"]) {
    const doc = load(f);
    const findings = runCsafTests(doc, doc.document.csaf_version);
    const errors = findings.filter((x) => x.severity === "error");
    assert.equal(errors.length, 0, `${f} should have no conformance errors, got: ${JSON.stringify(errors)}`);
  }
});

test("6.1.1 detects an undefined product reference", () => {
  const doc = {
    document: { csaf_version: "2.0", distribution: { tlp: { label: "WHITE" } } },
    product_tree: { full_product_names: [{ product_id: "P1", name: "Prod 1" }] },
    vulnerabilities: [{ product_status: { known_affected: ["P1", "GHOST"] } }],
  };
  const findings = runCsafTests(doc, "2.0");
  assert.ok(has(findings, "6.1.1"));
  assert.ok(findings.find((f) => f.test === "6.1.1").pointer.includes("known_affected"));
});

test("6.1.2 detects a duplicate product id", () => {
  const doc = {
    document: { csaf_version: "2.0", distribution: { tlp: { label: "WHITE" } } },
    product_tree: {
      full_product_names: [
        { product_id: "P1", name: "A" },
        { product_id: "P1", name: "B" },
      ],
    },
  };
  assert.ok(has(runCsafTests(doc, "2.0"), "6.1.2"));
});

test("6.1.3 detects a circular relationship", () => {
  const doc = {
    document: { csaf_version: "2.0", distribution: { tlp: { label: "WHITE" } } },
    product_tree: {
      relationships: [
        { category: "installed_on", product_reference: "X", relates_to_product_reference: "Y", full_product_name: { product_id: "X", name: "x on y" } },
      ],
    },
  };
  assert.ok(has(runCsafTests(doc, "2.0"), "6.1.3"));
});

test("contradicting product status is flagged", () => {
  const doc = {
    document: { csaf_version: "2.0", distribution: { tlp: { label: "WHITE" } } },
    product_tree: { full_product_names: [{ product_id: "P1", name: "A" }] },
    vulnerabilities: [{ product_status: { known_affected: ["P1"], known_not_affected: ["P1"] } }],
  };
  assert.ok(has(runCsafTests(doc, "2.0"), "6.1.x"));
});

test("missing TLP produces a warning; prohibited category an error", () => {
  const doc = {
    document: { csaf_version: "2.0", category: "Security_Advisory" },
    product_tree: {},
    vulnerabilities: [],
  };
  const findings = runCsafTests(doc, "2.0");
  assert.ok(findings.some((f) => f.test === "TLP" && f.severity === "warning"));
  assert.ok(findings.some((f) => f.test === "6.1.26" && f.severity === "error"));
});
