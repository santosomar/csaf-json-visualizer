// Cycle-aware JSON Schema $ref resolution for local pointers.
//
// Replaces the old json-schema-ref-parser (@apidevtools) bundle. CSAF schemas only
// use local pointers of the form "#/$defs/...", so we resolve those in-process and
// mark cycles instead of recursing forever (the CSAF product-tree branches_t is
// recursive). The result is a lazily-dereferenced view suitable for building a tree.

/** Resolve a JSON Pointer fragment (e.g. "#/$defs/notes_t") against the root document. */
export function resolvePointer(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#")) return undefined;
  const path = ref.slice(1).replace(/^\//, "");
  if (path === "") return root;
  const parts = path.split("/").map(unescapePointer);
  let node = root;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

function unescapePointer(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Build a dereferenced tree of "schema nodes". Each node keeps a reference to its
 * source subschema plus resolved children, and flags recursion via `.cycle`.
 * We do NOT mutate the input document.
 *
 * @param {object} root - the full schema document
 * @returns {{root: object, resolve: (ref:string)=>object|undefined}}
 */
export function createResolver(root) {
  const cache = new Map();
  function resolve(ref) {
    if (cache.has(ref)) return cache.get(ref);
    const target = resolvePointer(root, ref);
    cache.set(ref, target);
    return target;
  }
  return { root, resolve };
}

/**
 * Follow a chain of `$ref`s until reaching a concrete subschema.
 * Returns { schema, ref } where ref is the final pointer followed (or null).
 */
export function deref(root, schema, seen = new Set()) {
  let current = schema;
  let lastRef = null;
  while (current && typeof current === "object" && typeof current.$ref === "string") {
    if (seen.has(current.$ref)) {
      // Cycle: hand back the ref target but flag it so the tree builder can stop.
      return { schema: resolvePointer(root, current.$ref), ref: current.$ref, cycle: true };
    }
    seen.add(current.$ref);
    lastRef = current.$ref;
    const next = resolvePointer(root, current.$ref);
    if (next === undefined) return { schema: current, ref: lastRef, unresolved: true };
    current = next;
  }
  return { schema: current, ref: lastRef, cycle: false };
}
