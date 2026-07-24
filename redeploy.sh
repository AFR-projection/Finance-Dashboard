#!/usr/bin/env bash
# Backward-compatible alias → ./update.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/update.sh" "$@"
