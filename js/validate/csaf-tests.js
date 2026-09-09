// A subset of the CSAF mandatory conformance tests (spec section 6.1) that JSON Schema
// validation cannot express. Each finding cites its spec test number.
//
// Implemented:
//   6.1.1  Missing Definition of Product ID      (undefined product_id reference)
//   6.1.2  Multiple Definition of Product ID      (duplicate product_id)
//   6.1.3  Circular Definition of Product ID      (relationship cycle)
//   6.1.4  Missing Definition of Product Group ID (undefined group reference)
//   6.1.5  Multiple Definition of Product Group ID
//   6.1.x  Contradicting product status
//   6.1.26 Prohibited Document Category Name
//   TLP    Missing distribution/TLP label (recommended)

const AFFECTED = ["first_affected", "known_affected", "last_affected"];
const NOT_AFFECTED = ["known_not_affected"];
const FIXED = ["first_fixed", "fixed"];
const INVESTIGATING = ["under_investigation"];

export function runCsafTests(doc, version) {
  const findings = [];
  const pt = doc.product_tree || {};

  const { definedProducts, dupProducts } = collectProducts(pt);
  const { definedGroups, dupGroups } = collectGroups(pt);

  // 6.1.2 duplicate product ids
  for (const [id, ptr] of dupProducts) {
    findings.push(test("6.1.2", "error", `Product ID "${id}" is defined more than once.`, ptr));
  }
  // 6.1.5 duplicate group ids
  for (const [id, ptr] of dupGroups) {
    findings.push(test("6.1.5", "error", `Product group ID "${id}" is defined more than once.`, ptr));
  }

  // 6.1.1 / 6.1.4 undefined references
  for (const ref of collectProductRefs(doc)) {
    if (!definedProducts.has(ref.id)) {
      findings.push(
        test("6.1.1", "error", `Referenced product ID "${ref.id}" is not defined in the product tree.`, ref.pointer)
      );
    }
  }
  for (const ref of collectGroupRefs(doc)) {
    if (!definedGroups.has(ref.id)) {
      findings.push(
        test("6.1.4", "error", `Referenced product group ID "${ref.id}" is not defined in the product tree.`, ref.pointer)
      );
    }
  }

  // 6.1.3 circular relationships
  for (const cycle of findRelationshipCycles(pt)) {
    findings.push(
      test("6.1.3", "error", `Circular product definition detected: ${cycle.join(" \u2192 ")}.`, "/product_tree/relationships")
    );
  }

  // contradicting product status
  findings.push(...contradictingStatus(doc));

  // 6.1.26 prohibited document category name
  const catFinding = prohibitedCategory(doc, version);
  if (catFinding) findings.push(catFinding);

  // TLP recommendation
  const tlp = doc.document && doc.document.distribution && doc.document.distribution.tlp;
  if (!tlp || !tlp.label) {
    findings.push(
      test("TLP", "warning", "No TLP label under document/distribution/tlp. A TLP label is strongly recommended for sharing.", "/document")
    );
  }

  return findings;
}

function test(id, severity, message, pointer) {
  return { severity, source: "csaf", test: id, message: `[${id}] ${message}`, pointer };
}

function collectProducts(pt) {
  const definedProducts = new Set();
  const dupProducts = new Map();
  const seen = new Map();
  const add = (id, pointer) => {
    if (id == null) return;
    if (seen.has(id)) dupProducts.set(id, pointer);
    else seen.set(id, pointer);
    definedProducts.add(id);
  };
  (pt.full_product_names || []).forEach((p, i) =>
    add(p.product_id, `/product_tree/full_product_names/${i}`)
  );
  const walk = (branches, base) => {
    (branches || []).forEach((b, i) => {
      const ptr = `${base}/${i}`;
      if (b.product) add(b.product.product_id, `${ptr}/product`);
      if (Array.isArray(b.branches)) walk(b.branches, `${ptr}/branches`);
    });
  };
  walk(pt.branches, "/product_tree/branches");
  (pt.relationships || []).forEach((r, i) =>
    add(r.full_product_name && r.full_product_name.product_id, `/product_tree/relationships/${i}/full_product_name`)
  );
  (pt.product_paths || []).forEach((p, i) =>
    add(p.full_product_name && p.full_product_name.product_id, `/product_tree/product_paths/${i}/full_product_name`)
  );
  return { definedProducts, dupProducts };
}

function collectGroups(pt) {
  const definedGroups = new Set();
  const dupGroups = new Map();
  const seen = new Set();
  (pt.product_groups || []).forEach((g, i) => {
    if (g.group_id == null) return;
    if (seen.has(g.group_id)) dupGroups.set(g.group_id, `/product_tree/product_groups/${i}`);
    seen.add(g.group_id);
    definedGroups.add(g.group_id);
  });
  return { definedGroups, dupGroups };
}

function collectProductRefs(doc) {
  const refs = [];
  const push = (id, pointer) => id != null && refs.push({ id, pointer });

  // product_groups reference product ids
  (doc.product_tree?.product_groups || []).forEach((g, gi) => {
    (g.product_ids || []).forEach((pid, i) =>
      push(pid, `/product_tree/product_groups/${gi}/product_ids/${i}`)
    );
  });

  (doc.vulnerabilities || []).forEach((v, vi) => {
    const base = `/vulnerabilities/${vi}`;
    const ps = v.product_status || {};
    for (const cat of Object.keys(ps)) {
      (ps[cat] || []).forEach((pid, i) => push(pid, `${base}/product_status/${cat}/${i}`));
    }
    (v.remediations || []).forEach((r, ri) =>
      (r.product_ids || []).forEach((pid, i) => push(pid, `${base}/remediations/${ri}/product_ids/${i}`))
    );
    (v.threats || []).forEach((t, ti) =>
      (t.product_ids || []).forEach((pid, i) => push(pid, `${base}/threats/${ti}/product_ids/${i}`))
    );
    (v.flags || []).forEach((f, fi) =>
      (f.product_ids || []).forEach((pid, i) => push(pid, `${base}/flags/${fi}/product_ids/${i}`))
    );
    (v.scores || []).forEach((s, si) =>
      (s.products || []).forEach((pid, i) => push(pid, `${base}/scores/${si}/products/${i}`))
    );
    (v.metrics || []).forEach((m, mi) =>
      (m.products || []).forEach((pid, i) => push(pid, `${base}/metrics/${mi}/products/${i}`))
    );
  });
  return refs;
}

function collectGroupRefs(doc) {
  const refs = [];
  const push = (id, pointer) => id != null && refs.push({ id, pointer });
  (doc.vulnerabilities || []).forEach((v, vi) => {
    const base = `/vulnerabilities/${vi}`;
    (v.remediations || []).forEach((r, ri) =>
      (r.group_ids || []).forEach((gid, i) => push(gid, `${base}/remediations/${ri}/group_ids/${i}`))
    );
    (v.flags || []).forEach((f, fi) =>
      (f.group_ids || []).forEach((gid, i) => push(gid, `${base}/flags/${fi}/group_ids/${i}`))
    );
    (v.threats || []).forEach((t, ti) =>
      (t.group_ids || []).forEach((gid, i) => push(gid, `${base}/threats/${ti}/group_ids/${i}`))
    );
  });
  return refs;
}

function findRelationshipCycles(pt) {
  // Edges: full_product_name.product_id depends on product_reference & relates_to_product_reference.
  const edges = new Map();
  (pt.relationships || []).forEach((r) => {
    const from = r.full_product_name && r.full_product_name.product_id;
    if (!from) return;
    const deps = [r.product_reference, r.relates_to_product_reference].filter(Boolean);
    edges.set(from, (edges.get(from) || []).concat(deps));
  });
  const cycles = [];
  const state = new Map(); // 0=visiting,1=done
  const stack = [];
  const visit = (node) => {
    if (state.get(node) === 1) return;
    if (state.get(node) === 0) {
      const idx = stack.indexOf(node);
      cycles.push(stack.slice(idx).concat(node));
      return;
    }
    state.set(node, 0);
    stack.push(node);
    for (const dep of edges.get(node) || []) visit(dep);
    stack.pop();
    state.set(node, 1);
  };
  for (const node of edges.keys()) visit(node);
  return cycles;
}

function contradictingStatus(doc) {
  const findings = [];
  (doc.vulnerabilities || []).forEach((v, vi) => {
    const ps = v.product_status || {};
    const buckets = new Map(); // product_id -> Set(bucketName)
    const tag = (cats, bucket) => {
      for (const cat of cats) {
        (ps[cat] || []).forEach((pid) => {
          if (!buckets.has(pid)) buckets.set(pid, new Set());
          buckets.get(pid).add(bucket);
        });
      }
    };
    tag(AFFECTED, "affected");
    tag(NOT_AFFECTED, "not_affected");
    tag(FIXED, "fixed");
    tag(INVESTIGATING, "under_investigation");
    for (const [pid, set] of buckets) {
      const contradictory =
        (set.has("affected") && set.has("not_affected")) ||
        (set.has("not_affected") && set.has("fixed")) ||
        (set.has("under_investigation") && set.size > 1);
      if (contradictory) {
        findings.push(
          test(
            "6.1.x",
            "error",
            `Product "${pid}" has contradicting statuses (${[...set].join(", ")}) in this vulnerability.`,
            `/vulnerabilities/${vi}/product_status`
          )
        );
      }
    }
  });
  return findings;
}

const RESERVED_CATEGORIES = [
  "csaf_base",
  "csaf_security_incident_response",
  "csaf_informational_advisory",
  "csaf_security_advisory",
  "csaf_vex",
  "csaf_withdrawn",
  "csaf_deprecated_security_advisory",
  "csaf_superseded",
];

function prohibitedCategory(doc, version) {
  const cat = doc.document && doc.document.category;
  if (typeof cat !== "string") return null;
  if (RESERVED_CATEGORIES.includes(cat)) return null; // exact reserved profile is fine
  const normalized = cat.toLowerCase().replace(/[\s\-_.]/g, "");
  for (const reserved of RESERVED_CATEGORIES) {
    const rn = reserved.toLowerCase().replace(/[\s\-_.]/g, "");
    if (normalized === rn || normalized === rn.replace(/^csaf/, "")) {
      return test(
        "6.1.26",
        "error",
        `Document category "${cat}" is a prohibited variant of the reserved profile "${reserved}".`,
        "/document/category"
      );
    }
  }
  return null;
}
