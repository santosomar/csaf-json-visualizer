import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductIndex,
  expandGroups,
  buildProductTreeNodes,
  productTreeStats,
} from "../js/advisory/product-tree.js";
import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/examples/${name}`, import.meta.url)));

test("buildProductIndex resolves ids from branches and relationships", () => {
  const doc = load("rhsa-2021_5186.json");
  const idx = buildProductIndex(doc.product_tree);
  assert.ok(idx.nameById.size > 0);
  // resolve() returns the id unchanged when unknown.
  assert.equal(idx.resolve("does-not-exist"), "does-not-exist");
  // Every known id resolves to a non-empty display string.
  for (const [id, name] of idx.nameById) {
    assert.ok(typeof name === "string" && name.length > 0, `name for ${id}`);
  }
});

test("expandGroups expands product group ids", () => {
  const groups = [{ group_id: "g1", product_ids: ["p1", "p2"] }];
  assert.deepEqual(expandGroups(groups, ["g1"]), ["p1", "p2"]);
  assert.deepEqual(expandGroups(groups, ["missing"]), []);
});

test("buildProductTreeNodes produces a finite tree with resolved names", () => {
  const doc = load("rhsa-2021_5186.json");
  const idx = buildProductIndex(doc.product_tree);
  const root = buildProductTreeNodes(doc.product_tree, idx);
  let count = 0;
  (function walk(n) {
    count++;
    assert.ok(count < 10000);
    for (const c of n.children) walk(c);
  })(root);
  assert.ok(root.children.length >= 1);

  const stats = productTreeStats(doc.product_tree, idx);
  assert.equal(stats.products, idx.nameById.size);
  assert.ok(stats.relationships >= 0);
});

test("handles a null product tree gracefully", () => {
  const idx = buildProductIndex(null);
  assert.equal(idx.nameById.size, 0);
  const root = buildProductTreeNodes(null, idx);
  assert.equal(root.children.length, 0);
});
