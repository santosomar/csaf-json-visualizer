// Convert a JSON Schema document into a hierarchical node tree for d3.
// Cycles (e.g. CSAF branches_t -> items -> branches_t) are broken by detecting when a
// $ref reappears on the current ancestor path and emitting a "recursive" leaf.

import { deref, resolvePointer } from "./deref.js";

let uid = 0;

function typeOf(schema) {
  if (!schema || typeof schema !== "object") return "any";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type) return schema.type;
  if (schema.properties || schema.additionalProperties) return "object";
  if (schema.items || schema.prefixItems) return "array";
  if (schema.enum) return "enum";
  if (schema.oneOf || schema.anyOf || schema.allOf) return "composite";
  return "any";
}

/**
 * @param {object} root - full schema document
 * @param {object} [opts] - { name }
 * @returns {object} tree root node
 */
export function buildSchemaTree(root, opts = {}) {
  uid = 0;
  const rootNode = makeNode({
    root,
    schema: root,
    name: opts.name || root.title || "root",
    path: [],
    required: false,
    refStack: new Set(),
  });
  return rootNode;
}

function makeNode({ root, schema, name, path, required, refStack, label }) {
  const { schema: resolved, ref, cycle } = deref(root, schema);
  const node = {
    id: `n${uid++}`,
    name,
    label,
    path,
    plainName: path.join(" / ") || name,
    schema: resolved || schema,
    ref,
    required: !!required,
    type: typeOf(resolved),
    title: resolved && resolved.title,
    description: resolved && resolved.description,
    children: [],
  };

  if (cycle || (resolved && resolved.$ref)) {
    node.recursive = true;
    node.type = typeOf(resolved) || "ref";
    return node;
  }
  if (!resolved || typeof resolved !== "object") return node;

  // Track refs on the path to break cycles.
  const nextStack = new Set(refStack);
  if (ref) {
    if (refStack.has(ref)) {
      node.recursive = true;
      return node;
    }
    nextStack.add(ref);
  }

  node.children = childrenOf(root, resolved, path, nextStack);
  return node;
}

function childrenOf(root, schema, path, refStack) {
  const children = [];
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);

  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, sub] of Object.entries(schema.properties)) {
      children.push(
        makeNode({
          root,
          schema: sub,
          name: key,
          path: [...path, key],
          required: requiredSet.has(key),
          refStack,
        })
      );
    }
  }

  // draft 2020-12: items is a single schema; prefixItems is the tuple form.
  if (Array.isArray(schema.prefixItems)) {
    schema.prefixItems.forEach((sub, i) => {
      children.push(
        makeNode({ root, schema: sub, name: `[${i}]`, path: [...path, i], required: false, refStack, label: "tuple" })
      );
    });
  }
  if (schema.items && typeof schema.items === "object") {
    children.push(
      makeNode({ root, schema: schema.items, name: "items", path: [...path, "items"], required: false, refStack, label: "array items" })
    );
  }

  for (const kw of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[kw])) {
      schema[kw].forEach((sub, i) => {
        children.push(
          makeNode({
            root,
            schema: sub,
            name: `${kw}[${i}]`,
            path: [...path, kw, i],
            required: false,
            refStack,
            label: kw,
          })
        );
      });
    }
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    children.push(
      makeNode({ root, schema: schema.additionalProperties, name: "*", path: [...path, "*"], required: false, refStack, label: "additionalProperties" })
    );
  }

  return children;
}

/** Extract a compact constraints object for the details panel. */
export function constraintsOf(schema) {
  if (!schema || typeof schema !== "object") return {};
  const keys = [
    "type", "format", "pattern", "minLength", "maxLength", "minimum", "maximum",
    "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems", "uniqueItems",
    "minProperties", "maxProperties", "const", "default", "multipleOf",
  ];
  const out = {};
  for (const k of keys) if (schema[k] !== undefined) out[k] = schema[k];
  return out;
}

export { resolvePointer };
