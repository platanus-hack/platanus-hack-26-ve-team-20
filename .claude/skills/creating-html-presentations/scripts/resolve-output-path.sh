#!/usr/bin/env bash
# Resolves where to write a generated presentation HTML file.
# Usage: resolve-output-path.sh <source.md> [explicit-output.html]
#
# Default: ~/.presentations/<basename>.html (flat — no mirrored source path)

set -euo pipefail

source_md="${1:?source .md path required}"
explicit_output="${2:-}"

if [[ -n "${explicit_output}" ]]; then
  mkdir -p "$(dirname "${explicit_output}")"
  echo "${explicit_output}"
  exit 0
fi

if [[ ! -f "${source_md}" ]]; then
  echo "Source markdown not found: ${source_md}" >&2
  exit 1
fi

md_abs="$(realpath "${source_md}")"
md_base="$(basename "${md_abs}" .md)"
output="${HOME}/.presentations/${md_base}.html"

mkdir -p "${HOME}/.presentations"
echo "${output}"
