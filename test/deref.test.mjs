import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePointer, deref } from "../js/schema/deref.js";
import { buildSchemaTree } from "../js/schema/tree-model.js";
import { readFileSync } from "node:fs";

test("resolvePointer resolves local $defs pointers", () => {
  const root = { $defs: { notes_t: { type: "array", title: "Notes" } } };
  assert.equal(resolvePointer(root, "#/$defs/notes_t").title, "Notes");
  assert.equal(resolvePointer(root, "#"), root);
  assert.equal(resolvePointer(root, "#/nope"), undefined);
});

test("resolvePointer unescapes ~1 and ~0", () => {
  const root = { "a/b": { "~x": 1 } };
  assert.equal(resolvePointer(root, "#/a~1b/~0x"), 1);
});

test("deref follows a ref chain and flags cycles", () => {
  const root = {
    $defs: {
      a: { $ref: "#/$defs/b" },
      b: { $ref: "#/$defs/a" }, // cycle
      c: { type: "string" },
    },
  };
  const chain = deref(root, { $ref: "#/$defs/c" });
  assert.equal(chain.schema.type, "string");
  assert.equal(chain.cycle, false);

  const cyc = deref(root, { $ref: "#/$defs/a" });
  assert.equal(cyc.cycle, true);
});

test("buildSchemaTree terminates on recursive CSAF schemas", () => {
  for (const v of ["2.0", "2.1"]) {
    const schema = JSON.parse(
      readFileSync(new URL(`../data/csaf-${v}.schema.json`, import.meta.url))
    );
    const tree = buildSchemaTree(schema, { name: v });
    let count = 0;
    (function walk(n) {
      count++;
      assert.ok(count < 5000, "tree should be finite");
      for (const c of n.children) walk(c);
    })(tree);
    assert.ok(count > 50, "should have a meaningful number of nodes");
    assert.ok(tree.children.some((c) => c.name === "document"));
  }
});
