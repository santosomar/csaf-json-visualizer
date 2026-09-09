# CSAF Visualizer

An interactive, browser-based **viewer and validator** for the [Common Security Advisory Framework (CSAF)](https://oasis-open.github.io/csaf-documentation/). It works in two modes:

- **Schema Explorer** — render the CSAF 2.0 or 2.1 JSON Schema (or any JSON Schema) as a navigable, searchable tree with types, constraints, required fields, enums, and examples.
- **Advisory Viewer** — load a real CSAF advisory and get a readable report: document header with TLP and severity badges, per-vulnerability cards (CVSS v2/v3/v4, EPSS, SSVC, CWE, remediations, threats, flags, notes, references), a filterable **product × vulnerability VEX matrix**, and a **product-tree** visualization.

Every advisory is validated against the official CSAF JSON Schema **plus** a set of the CSAF mandatory conformance tests that schema validation alone cannot express (undefined product references, duplicate IDs, circular product relationships, contradicting product statuses, prohibited category names, missing TLP). Findings link straight to the offending line in the editor.

**Live site: [json.csaf.io](https://json.csaf.io)**

## Highlights

- **Zero build step.** Plain ES modules + an import-free vendor directory. Deploy by copying the files to any static host (GitHub Pages included).
- **Fully self-hosted.** No CDN, no runtime network calls except an optional user-initiated `?url=` fetch. Ships under a strict Content-Security-Policy with **no `unsafe-eval`**.
- **CSAF 2.0 and 2.1**, switchable, with a normalization layer so both render through one code path.
- **Safe by construction.** All advisory-derived content is rendered with `textContent`/`createElement` (never `innerHTML`), and every link is scheme-checked to `http(s):` with `rel="noopener noreferrer"`.
- **Light/dark themes**, resizable split layout, permalinks via the URL hash, and SVG/PNG export of trees.

## Using it

Open [json.csaf.io](https://json.csaf.io) (or run locally — see below) and load content any of these ways:

- **"Load an example"** — the highlighted **Start here** dropdown in the toolbar. It offers the CSAF 2.0/2.1 schemas plus real advisories (Red Hat RHSA, a VEX document, a large Cisco advisory, and a native CSAF 2.1 advisory). This is the quickest way to see the tool in action.
- **Open file** — load a `.json` file from your computer.
- **Paste** JSON directly into the left editor pane.
- **Drag & drop** a `.json` file anywhere on the page.
- **`?url=https://…`** — append to the address to fetch a remote advisory (https only; the target must allow cross-origin requests).

### The toolbar, left to right

- **Schema / Advisory** — the view mode. The tool auto-detects which one fits the content (`document.csaf_version` ⇒ advisory; `$defs`/`properties`/`$schema` ⇒ schema), so you rarely need to touch this; it doubles as a status indicator.
- **Start here → Load an example / Open file** — the primary way to get content in.
- **Validate as: CSAF 2.0 / 2.1** — which schema version advisories are validated against. It follows the loaded document automatically, but if you pick a version manually it stays pinned (handy for checking a 2.0 advisory against the 2.1 schema to preview migration issues). In Schema mode, switching it swaps the displayed bundled schema.
- **Editor toggle / Theme toggle / GitHub** — show-or-hide the editor pane, switch light/dark, and link to the source.

Findings (schema violations + CSAF conformance tests) appear in the bottom **Findings** panel; click one to jump to the offending line in the editor. Deep links are preserved in the URL hash (mode, version, selected schema path, active advisory tab).

> **Note:** the app must be served over `http(s)://`, not opened as a `file://` path. Browsers block ES modules and `fetch()` on `file://`, so a double-clicked `index.html` will render an empty page. Use a local server (below) or the hosted site.

## Running locally

Static site, no build. Serve the directory over HTTP:

```bash
git clone https://github.com/santosomar/csaf-json-visualizer.git
cd csaf-json-visualizer
npm run serve   # or: python3 -m http.server 8080
```

Then browse to the printed URL.

## Development

```bash
npm test                 # node --test unit tests (deref, model, product-tree, csaf-tests, validation)
npm run update:schemas   # refresh data/csaf-2.0|2.1.schema.json from OASIS
npm run update:vendor    # refresh js/vendor/* (d3, @cfworker/json-schema, ace-builds)
```

### Project layout

```
index.html                    shell: CSP, mount points (no inline app logic)
css/    tokens.css app.css tree.css report.css
data/   csaf-2.0.schema.json  csaf-2.1.schema.json  examples/*.json
js/
  main.js state.js            bootstrap + URL-hash deep links
  ui/     editor, theme, dropzone, findings, toast, dom (safe DOM helpers)
  schema/ registry, deref, tree-model, view
  advisory/ model, product-tree, report, matrix
  validate/ validator, csaf-tests, json-source-map
  viz/    tree.js              generic d3 v7 collapsible tree
  vendor/ d3.mjs json-schema.mjs ace/
tools/  serve.mjs update-schemas.sh update-vendor.sh
test/   *.test.mjs             node --test (not deployed)
```

## Design notes

- **Validation** uses [`@cfworker/json-schema`](https://github.com/cfworker/cfworker) (draft 2020-12). It *interprets* schemas at runtime instead of generating code with `new Function`, which is why the app can ship a CSP with no `unsafe-eval` (Ajv would have required it).
- **CSAF 2.1** declares a custom metaschema URI (`…/v2.1/schema/meta.json`) for the format-assertion vocabulary. The loader rewrites the top-level `$schema` to standard draft 2020-12 so any validator can compile it.
- **External CVSS `$ref`s.** The CSAF schemas reference the FIRST.org CVSS schemas, which are authored in three mutually incompatible dialects (v2.0/v3.0 draft-04, v3.1 draft-07, v4.0 FIRST's own metaschema). To avoid spurious errors these external references are neutralized to a permissive object for schema validation; the CVSS score, vector, and version are still fully parsed and shown in the report.
- **`$ref` resolution** is a small cycle-aware resolver (CSAF only uses local `#/$defs/…` pointers), replacing the old `json-schema-ref-parser` bundle. The recursive `branches_t` type is handled by detecting repeated refs on the path.

### CSAF 2.0 → 2.1 normalization

The internal view model is 2.1-shaped; 2.0 documents are upgraded on load:

| CSAF 2.0 | CSAF 2.1 |
| --- | --- |
| `vulnerabilities[].scores` (`cvss_v2`/`v3`) | `vulnerabilities[].metrics[].content` (adds `cvss_v4`, `epss`, `ssvc_v2`, `qualitative_severity_rating`) |
| `cwe` (single) | `cwes` (array) |
| `release_date` | `disclosure_date` |
| `product_tree.relationships` | `product_tree.product_paths` (with `subpaths`) |
| — | `document.license_expression`, `x_extensions`, `product_status.unknown`, top-level `$schema` (required) |

## About CSAF

CSAF is the OASIS standard for machine-readable security advisories in JSON, succeeding the XML-based CVRF. **CSAF 2.0** became an OASIS Standard on 18 November 2022 and defines the `document` / `product_tree` / `vulnerabilities` structure and five profiles (Base, Security Incident Response, Informational Advisory, Security Advisory, and VEX). **CSAF 2.1** is in development (Committee Specification Draft 02, 25 February 2026), adding CVSS v4.0, EPSS, SSVC, an extension mechanism, and additional profiles; treat it as not-yet-stable.

## Resources

- [CSAF 2.0 OASIS Standard](https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html)
- [CSAF 2.1 (latest stage)](https://docs.oasis-open.org/csaf/csaf/v2.1/csaf-v2.1.html)
- [OASIS CSAF TC GitHub repository](https://github.com/oasis-tcs/csaf)
- [CSAF documentation and tutorials](https://oasis-open.github.io/csaf-documentation/)

## Contributing

This visualizer is an independent community project and is not an OASIS deliverable. To contribute to the specification itself, use the [OASIS CSAF TC repository](https://github.com/oasis-tcs/csaf). Contributions to this tool are welcome via pull request.

## License

MIT. See [LICENSE](LICENSE). The CSAF schemas bundled under `data/` are published by OASIS under their own terms.
