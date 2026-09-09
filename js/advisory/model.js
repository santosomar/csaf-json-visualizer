// Normalize a CSAF 2.0 or 2.1 advisory into a single 2.1-shaped view model, so the
// report/matrix renderers have one code path.
//
// Key differences absorbed here (diffed from the live OASIS schemas):
//   2.0 vulnerabilities[].scores      -> 2.1 vulnerabilities[].metrics[].content.cvss_v*
//   2.0 cwe (single)                  -> 2.1 cwes (array)
//   2.0 release_date                  -> 2.1 disclosure_date
//   new in 2.1: epss, ssvc_v2, first_known_exploitation_dates, license_expression

export function isAdvisory(doc) {
  return !!(doc && typeof doc === "object" && doc.document && doc.document.csaf_version);
}

export function detectAdvisoryVersion(doc) {
  const v = doc && doc.document && doc.document.csaf_version;
  return v === "2.1" ? "2.1" : v === "2.0" ? "2.0" : null;
}

/** Map a CVSS base score to a qualitative severity bucket. */
export function severityFromScore(score) {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score > 0.0) return "low";
  return "none";
}

export function severityClass(sev) {
  return "sev-" + String(sev || "none").toLowerCase();
}

function cvssFromContent(cvss, version) {
  if (!cvss || typeof cvss !== "object") return null;
  const base = cvss.baseScore ?? cvss.base_score;
  const severity =
    (cvss.baseSeverity || cvss.base_severity || "").toLowerCase() ||
    severityFromScore(typeof base === "number" ? base : parseFloat(base));
  return {
    version: version || cvss.version || "",
    baseScore: typeof base === "number" ? base : base != null ? parseFloat(base) : null,
    severity: severity || "none",
    vector: cvss.vectorString || cvss.vector_string || "",
  };
}

function normalizeMetrics2_1(vuln) {
  const metrics = Array.isArray(vuln.metrics) ? vuln.metrics : [];
  const scores = [];
  const epss = [];
  const ssvc = [];
  const qualitative = [];
  for (const m of metrics) {
    const products = Array.isArray(m.products) ? m.products : [];
    const c = m.content || {};
    for (const key of ["cvss_v4", "cvss_v3", "cvss_v2"]) {
      if (c[key]) {
        const ver = key === "cvss_v4" ? "4" : key === "cvss_v3" ? "3" : "2";
        const parsed = cvssFromContent(c[key], c[key].version || ver);
        if (parsed) scores.push({ ...parsed, products, source: m.source });
      }
    }
    if (c.epss) epss.push({ ...c.epss, products });
    if (c.ssvc_v2) ssvc.push({ value: c.ssvc_v2, products });
    if (c.qualitative_severity_rating)
      qualitative.push({ value: c.qualitative_severity_rating, products });
  }
  return { scores, epss, ssvc, qualitative };
}

function normalizeScores2_0(vuln) {
  const raw = Array.isArray(vuln.scores) ? vuln.scores : [];
  const scores = [];
  for (const s of raw) {
    const products = Array.isArray(s.products) ? s.products : [];
    for (const key of ["cvss_v3", "cvss_v2"]) {
      if (s[key]) {
        const ver = key === "cvss_v3" ? "3" : "2";
        const parsed = cvssFromContent(s[key], s[key].version || ver);
        if (parsed) scores.push({ ...parsed, products });
      }
    }
  }
  return { scores, epss: [], ssvc: [], qualitative: [] };
}

function normalizeCwes(vuln, version) {
  if (version === "2.1") {
    const list = Array.isArray(vuln.cwes) ? vuln.cwes : vuln.cwe ? [vuln.cwe] : [];
    return list.map((c) => ({ id: c.id, name: c.name, version: c.version }));
  }
  return vuln.cwe ? [{ id: vuln.cwe.id, name: vuln.cwe.name }] : [];
}

function normalizeVuln(vuln, version) {
  const metrics = version === "2.1" ? normalizeMetrics2_1(vuln) : normalizeScores2_0(vuln);
  return {
    title: vuln.title,
    cve: vuln.cve,
    cwes: normalizeCwes(vuln, version),
    ids: Array.isArray(vuln.ids) ? vuln.ids : [],
    notes: Array.isArray(vuln.notes) ? vuln.notes : [],
    references: Array.isArray(vuln.references) ? vuln.references : [],
    disclosureDate: version === "2.1" ? vuln.disclosure_date : vuln.release_date,
    discoveryDate: vuln.discovery_date,
    firstKnownExploitationDates: Array.isArray(vuln.first_known_exploitation_dates)
      ? vuln.first_known_exploitation_dates
      : [],
    scores: metrics.scores,
    epss: metrics.epss,
    ssvc: metrics.ssvc,
    qualitative: metrics.qualitative,
    productStatus: vuln.product_status || {},
    remediations: Array.isArray(vuln.remediations) ? vuln.remediations : [],
    threats: Array.isArray(vuln.threats) ? vuln.threats : [],
    flags: Array.isArray(vuln.flags) ? vuln.flags : [],
    involvements: Array.isArray(vuln.involvements) ? vuln.involvements : [],
  };
}

/** Worst CVSS severity across a vulnerability's scores. */
export function worstSeverity(vuln) {
  const order = ["none", "low", "medium", "high", "critical"];
  let worst = null;
  for (const s of vuln.scores || []) {
    const idx = order.indexOf(s.severity);
    if (idx > (worst == null ? -1 : order.indexOf(worst))) worst = s.severity;
  }
  return worst;
}

export function normalizeAdvisory(doc) {
  const version = detectAdvisoryVersion(doc) || "2.0";
  const d = doc.document || {};
  const tracking = d.tracking || {};
  return {
    version,
    raw: doc,
    document: {
      title: d.title,
      category: d.category,
      lang: d.lang,
      sourceLang: d.source_lang,
      publisher: d.publisher || {},
      tlp: (d.distribution && d.distribution.tlp) || null,
      distributionText: d.distribution && d.distribution.text,
      aggregateSeverity: d.aggregate_severity || null,
      licenseExpression: d.license_expression || null,
      notes: Array.isArray(d.notes) ? d.notes : [],
      references: Array.isArray(d.references) ? d.references : [],
      tracking: {
        id: tracking.id,
        status: tracking.status,
        version: tracking.version,
        initialReleaseDate: tracking.initial_release_date,
        currentReleaseDate: tracking.current_release_date,
        revisionHistory: Array.isArray(tracking.revision_history) ? tracking.revision_history : [],
        generator: tracking.generator,
      },
    },
    vulnerabilities: (Array.isArray(doc.vulnerabilities) ? doc.vulnerabilities : []).map((v) =>
      normalizeVuln(v, version)
    ),
    productTreeRaw: doc.product_tree || null,
  };
}
