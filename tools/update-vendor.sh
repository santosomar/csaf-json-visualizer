#!/usr/bin/env bash
# Refresh the self-hosted, vendored front-end dependencies. Everything is pinned so the
# app has no runtime CDN dependency and can ship under a strict CSP.
# Usage: tools/update-vendor.sh
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p js/vendor/ace

# Pinned versions.
D3_VERSION="7.9.0"
AJV_UNUSED=""           # validation uses @cfworker/json-schema (no codegen → CSP-safe)
CFWORKER_VERSION="4.1.1"
ACE_VERSION="1.43.4"

echo "d3 ${D3_VERSION} (self-contained ESM bundle)"
curl -fsSL "https://esm.sh/d3@${D3_VERSION}/es2022/d3.bundle.mjs" -o js/vendor/d3.mjs

echo "@cfworker/json-schema ${CFWORKER_VERSION} (draft 2020-12, no code generation)"
curl -fsSL "https://esm.sh/@cfworker/json-schema@${CFWORKER_VERSION}/es2022/json-schema.bundle.mjs" -o js/vendor/json-schema.mjs

echo "ace-builds ${ACE_VERSION}"
ACE_BASE="https://cdn.jsdelivr.net/npm/ace-builds@${ACE_VERSION}/src-min-noconflict"
for f in ace.js mode-json.js worker-json.js theme-chrome.js theme-github_dark.js ext-searchbox.js; do
  curl -fsSL "${ACE_BASE}/${f}" -o "js/vendor/ace/${f}"
done

echo "Verifying bundles are self-contained (no external imports)..."
if grep -Eq 'from"https?://' js/vendor/d3.mjs js/vendor/json-schema.mjs; then
  echo "WARNING: a vendored bundle references an external URL; investigate before shipping." >&2
fi

echo "Done. Sizes:"
du -h js/vendor/d3.mjs js/vendor/json-schema.mjs js/vendor/ace/*.js
