// Resolve CSAF product identifiers to full names and build a tree for visualization.
// Handles both the 2.0 `relationships` model and the 2.1 `product_paths` model.

let uid = 0;

/**
 * Build an index of product_id -> display name plus product groups.
 * @param {object|null} pt - raw product_tree
 */
export function buildProductIndex(pt) {
  const nameById = new Map();
  const groups = [];
  if (!pt || typeof pt !== "object") {
    return { nameById, groups, resolve: (id) => id };
  }

  const record = (product) => {
    if (product && product.product_id) nameById.set(product.product_id, product.name || product.product_id);
  };

  (pt.full_product_names || []).forEach(record);

  const walkBranches = (branches) => {
    for (const b of branches || []) {
      if (b.product) record(b.product);
      if (Array.isArray(b.branches)) walkBranches(b.branches);
    }
  };
  walkBranches(pt.branches);

  // 2.0 relationships each define a new full_product_name.
  (pt.relationships || []).forEach((rel) => record(rel.full_product_name));

  // 2.1 product_paths.
  (pt.product_paths || []).forEach((p) => {
    record(p.full_product_name);
  });

  (pt.product_groups || []).forEach((g) => {
    groups.push({ group_id: g.group_id, product_ids: g.product_ids || [], summary: g.summary });
  });

  const resolve = (id) => nameById.get(id) || id;
  return { nameById, groups, resolve };
}

/** Convenience: expand a product group id to its product ids. */
export function expandGroups(groups, groupIds) {
  const map = new Map(groups.map((g) => [g.group_id, g.product_ids]));
  const out = [];
  for (const gid of groupIds || []) out.push(...(map.get(gid) || []));
  return out;
}

/**
 * Build a viz tree node (generic shape consumed by viz/tree.js) from the product tree.
 */
export function buildProductTreeNodes(pt, index) {
  uid = 0;
  const root = node("Product Tree", "root", { productId: null });
  if (!pt || typeof pt !== "object") return root;

  if (Array.isArray(pt.branches) && pt.branches.length) {
    const branchesNode = node("branches", "group");
    pt.branches.forEach((b) => branchesNode.children.push(branchNode(b, index)));
    root.children.push(branchesNode);
  }

  if (Array.isArray(pt.full_product_names) && pt.full_product_names.length) {
    const fpn = node("full_product_names", "group");
    pt.full_product_names.forEach((p) =>
      fpn.children.push(node(p.name || p.product_id, "product_name", { productId: p.product_id }))
    );
    root.children.push(fpn);
  }

  if (Array.isArray(pt.relationships) && pt.relationships.length) {
    const rel = node("relationships", "group");
    pt.relationships.forEach((r) => {
      const label = `${index.resolve(r.product_reference)} ${arrow(r.category)} ${index.resolve(
        r.relates_to_product_reference
      )}`;
      const n = node(label, r.category, { productId: r.full_product_name && r.full_product_name.product_id });
      n.secondary = r.full_product_name && r.full_product_name.name;
      rel.children.push(n);
    });
    root.children.push(rel);
  }

  if (Array.isArray(pt.product_paths) && pt.product_paths.length) {
    const paths = node("product_paths", "group");
    pt.product_paths.forEach((p) => {
      const n = node(
        (p.full_product_name && p.full_product_name.name) ||
          index.resolve(p.beginning_product_reference) ||
          "path",
        "product_path",
        { productId: p.full_product_name && p.full_product_name.product_id }
      );
      (p.subpaths || []).forEach((sp) => {
        n.children.push(
          node(`${arrow(sp.category)} ${index.resolve(sp.next_product_reference)}`, sp.category, {
            productId: sp.next_product_reference,
          })
        );
      });
      paths.children.push(n);
    });
    root.children.push(paths);
  }

  if (Array.isArray(pt.product_groups) && pt.product_groups.length) {
    const grp = node("product_groups", "group");
    pt.product_groups.forEach((g) => {
      const n = node(g.group_id, "product_group", {});
      n.secondary = g.summary;
      (g.product_ids || []).forEach((pid) =>
        n.children.push(node(index.resolve(pid), "product_name", { productId: pid }))
      );
      grp.children.push(n);
    });
    root.children.push(grp);
  }

  return root;
}

function branchNode(b, index) {
  const n = node(b.name || b.category, b.category);
  if (b.product) {
    n.productId = b.product.product_id;
    n.secondary = b.product.product_id;
  }
  if (Array.isArray(b.branches)) b.branches.forEach((c) => n.children.push(branchNode(c, index)));
  return n;
}

function node(name, kind, extra = {}) {
  return { id: `p${uid++}`, name, kind, secondary: null, productId: null, children: [], ...extra };
}

function arrow(category) {
  return "\u2192"; // → ; category itself is shown as node kind
}

export function productTreeStats(pt, index) {
  return {
    products: index.nameById.size,
    branches: countBranches(pt && pt.branches),
    relationships: (pt && pt.relationships ? pt.relationships.length : 0),
    productPaths: (pt && pt.product_paths ? pt.product_paths.length : 0),
    groups: index.groups.length,
  };
}

function countBranches(branches) {
  let n = 0;
  for (const b of branches || []) {
    n += 1;
    if (Array.isArray(b.branches)) n += countBranches(b.branches);
  }
  return n;
}
