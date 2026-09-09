import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdvisory,
  isAdvisory,
  detectAdvisoryVersion,
  severityFromScore,
  worstSeverity,
} from "../js/advisory/model.js";
import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/examples/${name}`, import.meta.url)));

test("severityFromScore buckets CVSS base scores", () => {
  assert.equal(severityFromScore(9.8), "critical");
  assert.equal(severityFromScore(7.0), "high");
  assert.equal(severityFromScore(4.0), "medium");
  assert.equal(severityFromScore(0.1), "low");
  assert.equal(severityFromScore(0), "none");
  assert.equal(severityFromScore(null), null);
});

test("isAdvisory / detectAdvisoryVersion", () => {
  assert.equal(isAdvisory({ document: { csaf_version: "2.0" } }), true);
  assert.equal(isAdvisory({ $defs: {} }), false);
  assert.equal(detectAdvisoryVersion({ document: { csaf_version: "2.1" } }), "2.1");
});

test("normalizeAdvisory maps 2.0 scores to the common model", () => {
  const m = normalizeAdvisory(load("bsi-2022-0001.json"));
  assert.equal(m.version, "2.0");
  assert.ok(m.vulnerabilities.length >= 1);
  const v = m.vulnerabilities[0];
  assert.ok(v.scores.length >= 1, "expected at least one CVSS score");
  assert.ok(/^[234]/.test(String(v.scores[0].version)), `unexpected version ${v.scores[0].version}`);
  assert.ok(v.scores[0].baseScore > 0);
  assert.ok(["low", "medium", "high", "critical", "none"].includes(worstSeverity(v)));
});

test("normalizeAdvisory maps 2.1 metrics (cvss + cwes + disclosure_date)", () => {
  const m = normalizeAdvisory(load("csaf-2.1-bsi-2022-0001.json"));
  assert.equal(m.version, "2.1");
  const v = m.vulnerabilities[0];
  assert.ok(v.scores.length >= 1, "2.1 metrics should normalize to scores");
  // cwes must always be an array in the normalized model.
  assert.ok(Array.isArray(v.cwes));
});

test("normalizeAdvisory extracts document metadata + TLP", () => {
  const m = normalizeAdvisory(load("rhsa-2021_5186.json"));
  assert.ok(m.document.title.length > 0);
  assert.equal(m.document.tracking.id, "RHSA-2021:5186");
  assert.ok(m.document.tlp && typeof m.document.tlp.label === "string");
});
