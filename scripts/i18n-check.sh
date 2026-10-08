#!/usr/bin/env bash
# Copiar a scripts/i18n-check.sh. No descarga paquetes de un registro público.
set -euo pipefail
if [ ! -f messages/es.json ]; then
  echo "Sin catálogo español: i18n no aplica todavía."
  exit 0
fi
if [ -x node_modules/.bin/cis-i18n ]; then
  exec node_modules/.bin/cis-i18n check messages
fi
if command -v cis-i18n >/dev/null 2>&1; then
  exec cis-i18n check messages
fi
# La CLI pertenece al paquete Node, incluso en proyectos Python.
archive="${CIS_I18N_ARCHIVE:-vendor/cis-i18n-0.2.0.tgz}"
if [ ! -f "$archive" ]; then
  echo "Falta la CLI: instala @cis/i18n o guarda $archive." >&2
  exit 1
fi
archive="$(realpath "$archive")"
tools_dir="$(mktemp -d)"
trap 'rm -rf "$tools_dir"' EXIT
npm install --prefix "$tools_dir" --ignore-scripts --legacy-peer-deps --no-audit --no-fund "$archive"
"$tools_dir/node_modules/.bin/cis-i18n" check messages
