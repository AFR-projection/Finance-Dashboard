#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
SERVICE="${1:-}"
if [[ -n "$SERVICE" ]]; then
  compose logs -f --tail=100 "$SERVICE"
else
  compose logs -f --tail=50
fi
