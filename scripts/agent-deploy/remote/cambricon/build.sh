#!/usr/bin/env bash
# v3.26 -- per-vendor remote build script (Cambricon MLU / BANG-C).
#
# Compiles a generated BANG-C kernel into ./bench using the Cambricon
# Neuware compiler (cncc). v3.26 scaffold; v3.27 will integrate with
# CNNL when available.

set -euo pipefail

echo "[remote-build/cambricon] cwd: $(pwd)"
echo "[remote-build/cambricon] NEUWARE_HOME: ${NEUWARE_HOME:-/usr/local/neuware}"

if [[ -z "${NEUWARE_HOME:-}" ]]; then
  NEUWARE_HOME="/usr/local/neuware"
fi
if [[ ! -d "${NEUWARE_HOME}" ]]; then
  echo "[remote-build/cambricon] NEUWARE_HOME (${NEUWARE_HOME}) not found — abort"
  exit 1
fi

export PATH="${NEUWARE_HOME}/bin:${PATH}"
export LD_LIBRARY_PATH="${NEUWARE_HOME}/lib64:${LD_LIBRARY_PATH:-}"

MLU_FILES=(*.mlu *.cpp)
MLU_FILES=( "${MLU_FILES[@]/\*.mlu}" )
MLU_FILES=( "${MLU_FILES[@]/\*.cpp}" )

if [[ ${#MLU_FILES[@]} -eq 0 ]]; then
  echo "[remote-build/cambricon] no .mlu / .cpp files in $(pwd) — abort"
  exit 1
fi

# Auto-detect MLU SKU. cnmon returns "MLU290" / "MLU370-X8" / "MLU590".
SKU=$(cnmon info 2>/dev/null | grep -oE "MLU[0-9]+(-[A-Z0-9]+)?" | head -1 || echo "MLU590")

# Map SKU to BANG-C arch flag.
case "${SKU}" in
  MLU220*) ARCH="MLU220" ;;
  MLU270*) ARCH="MLU270" ;;
  MLU290*) ARCH="MLU290" ;;
  MLU370*) ARCH="MLU370" ;;
  MLU590*) ARCH="MLU590" ;;
  *)       ARCH="MLU590" ;;
esac

echo "[remote-build/cambricon] detected ${SKU}; compiling ${MLU_FILES[*]} for ${ARCH}"

cncc \
  -O3 \
  --bang-mlu-arch=${ARCH} \
  -o bench \
  "${MLU_FILES[@]}" \
  -lcnnl -lcnrt

echo "[remote-build/cambricon] built ./bench"
