#!/usr/bin/env bash
# Refresh the bundled CSAF JSON schemas from OASIS (latest stage).
# Usage: tools/update-schemas.sh
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data

fetch() {
  local url="$1" out="$2"
  echo "Fetching $url"
  curl -fsSL "$url" -o "$out"
  # Sanity check: must be valid JSON with a $id.
  node -e "const s=require('./$out'); if(!s['\$id']) throw new Error('no \$id in $out');"
  echo "  -> $out ($(wc -c < "$out") bytes)"
}

fetch "https://docs.oasis-open.org/csaf/csaf/v2.0/csaf_json_schema.json" "data/csaf-2.0.schema.json"
fetch "https://docs.oasis-open.org/csaf/csaf/v2.1/schema/csaf.json"       "data/csaf-2.1.schema.json"

echo "Done. Review the diff before committing."
