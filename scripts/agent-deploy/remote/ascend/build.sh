#!/usr/bin/env bash
# v3.26 -- per-vendor remote build script (Huawei Ascend / CANN / Ascend-C).
#
# This is the script the v3.27 SageAttention/CogVideoX/910B north-star
# scenario invokes. CANN's build flow is more involved than NVIDIA's
# nvcc one-liner — Ascend-C kernels typically use cmake + the CANN
# Ascend-C compiler (via ascend-cl or msopgen for op-level workflows).
#
# This v3.26 scaffold targets the simpler "raw .cce/.cpp Ascend-C kernel"
# path. v3.27 will expand to cover the full op-package workflow when
# integrating with CogVideoX inference.

set -euo pipefail

echo "[remote-build/ascend] cwd: $(pwd)"
echo "[remote-build/ascend] CANN: ${ASCEND_HOME:-/usr/local/Ascend/ascend-toolkit/latest}"

if [[ -z "${ASCEND_HOME:-}" ]]; then
  ASCEND_HOME="/usr/local/Ascend/ascend-toolkit/latest"
fi
if [[ ! -d "${ASCEND_HOME}" ]]; then
  echo "[remote-build/ascend] ASCEND_HOME (${ASCEND_HOME}) not found — abort"
  exit 1
fi

# Pull in CANN env (sets PATH for ccec, msprof, etc.)
# shellcheck disable=SC1091
source "${ASCEND_HOME}/bin/setenv.bash" 2>/dev/null || \
  source "${ASCEND_HOME}/set_env.sh" 2>/dev/null || \
  echo "[remote-build/ascend] warn: could not source CANN env; assuming PATH already set"

CCE_FILES=(*.cce *.cpp)
CCE_FILES=( "${CCE_FILES[@]/\*.cce}" )
CCE_FILES=( "${CCE_FILES[@]/\*.cpp}" )

if [[ ${#CCE_FILES[@]} -eq 0 ]]; then
  echo "[remote-build/ascend] no .cce / .cpp files in $(pwd) — abort"
  exit 1
fi

# Auto-detect Ascend chip series (910B / 910C / 910D / 950).
# npu-smi info typically returns names like "Ascend910B".
NPU_SERIES=$(npu-smi info 2>/dev/null | grep -oE "Ascend910[BCD]?|Ascend950" | head -1 || echo "Ascend910B")

echo "[remote-build/ascend] detected ${NPU_SERIES}; compiling ${CCE_FILES[*]}"

# ccec is the Ascend-C compiler (ccel for older CANN). For v3.26 scaffold
# we use the simpler ccec invocation; v3.27 will switch to msopgen for
# real op packaging.
ccec \
  -O2 \
  --target ${NPU_SERIES} \
  -o bench \
  "${CCE_FILES[@]}" 2>&1 || {
    echo "[remote-build/ascend] ccec failed — trying ccel fallback"
    ccel -O2 --target ${NPU_SERIES} -o bench "${CCE_FILES[@]}"
  }

echo "[remote-build/ascend] built ./bench"
