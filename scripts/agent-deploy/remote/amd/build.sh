#!/usr/bin/env bash
# v3.26 -- per-vendor remote build script (AMD / HIP).
#
# Invoked by remote-target.ts. Compiles a generated HIP kernel into
# `./bench` for the test-harness + profiler steps.

set -euo pipefail

echo "[remote-build/amd] cwd: $(pwd)"
echo "[remote-build/amd] hipcc: $(hipcc --version 2>/dev/null | head -1 || echo NOT FOUND)"

HIP_FILES=(*.hip *.cpp)
HIP_FILES=( "${HIP_FILES[@]/\*.hip}" )    # remove unmatched glob entries
HIP_FILES=( "${HIP_FILES[@]/\*.cpp}" )

if [[ ${#HIP_FILES[@]} -eq 0 ]]; then
  echo "[remote-build/amd] no .hip / .cpp files in $(pwd) — abort"
  exit 1
fi

# Auto-detect arch via rocminfo. Falls back to gfx942 (CDNA3 / MI300) since
# that's the most common AMD datacenter target as of v3.x.
ARCH=$(rocminfo 2>/dev/null | grep -m1 "gfx" | grep -oE "gfx[0-9a-f]+" || echo "gfx942")

echo "[remote-build/amd] detected ${ARCH}; compiling ${HIP_FILES[*]}"

hipcc \
  -O3 \
  --offload-arch=${ARCH} \
  -std=c++17 \
  -o bench \
  "${HIP_FILES[@]}" \
  -lrocblas

echo "[remote-build/amd] built ./bench"
