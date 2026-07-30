#!/usr/bin/env bash
# ./scripts/logs.sh [service]
# service: app | postgres | redis | telegram-worker
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
SVC="${1:-app}"
compose logs -f --tail=100 "$SVC"
