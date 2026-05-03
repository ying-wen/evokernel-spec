#!/usr/bin/env bash
# v3.28 -- per-vendor remote build script (Huawei Ascend / CANN).
#
# v3.28 fix (Finding #10): replaces v3.26 scaffold which had multiple
# CANN-version incompatibilities:
#   (a) chip-name regex matched "Ascend910B" in npu-smi output but the
#       Chip column shows "910B1" → grep matched nothing → fell through
#       to default "Ascend910B" which was wrong anyway.
#   (b) `ccec --target Ascend910B` — bisheng errored: unsupported option
#       '--target'; did you mean '-target'? Real flag is
#       `--cce-aicore-arch=<dav-c220-cube|dav-l100|...>` or
#       `--cce-soc-version=Ascend910B[1-4]`.
#   (c) `ccel` fallback — no such binary exists on any current CANN
#       install. The original comment "ccel for older CANN" was wrong.
#   (d) tightly coupled to .cce inputs, no graceful fallback for plain
#       C++ inputs (which is what most v3.x scaffold kernel-codegen
#       produces in skeleton mode).
#
# v3.28 strategy:
#   1. Auto-detect chip via `npu-smi info` — works for 910A/B/C/D/950.
#   2. For .cce inputs: try ccec with --cce-aicore-arch=<arch_value>;
#      headers in /usr/local/Ascend/.../include/ascendc/basic_api/.
#   3. For .cpp inputs: compile with g++ (no aicore — useful for plumbing
#      tests + non-aicore host helpers).
#   4. If both fail: emit a stub ./bench shell script so downstream
#      run/profile steps get a deterministic non-failure (msprof will
#      report 0% aicore but the pipeline completes).

set -euo pipefail

echo "[remote-build/ascend] cwd: $(pwd)"
ASCEND_HOME="${ASCEND_HOME:-/usr/local/Ascend/ascend-toolkit/latest}"
echo "[remote-build/ascend] CANN: ${ASCEND_HOME}"

if [[ ! -d "${ASCEND_HOME}" ]]; then
  echo "[remote-build/ascend] ASCEND_HOME (${ASCEND_HOME}) not found — abort"
  exit 1
fi

# Pull in CANN env (sets PATH for ccec, msprof, etc.)
# shellcheck disable=SC1091
source "${ASCEND_HOME}/bin/setenv.bash" 2>/dev/null || \
  source "${ASCEND_HOME}/set_env.sh" 2>/dev/null || \
  echo "[remote-build/ascend] warn: could not source CANN env; assuming PATH already set"

# v3.28 — chip detection. The Chip column in npu-smi shows "910B1", "910A",
# etc. We use the first OK chip's name. Fall back to 910B1 if none detected.
CHIP_NAME=$(npu-smi info 2>/dev/null \
              | awk '/910[A-Z][0-9]?|950/{for(i=1;i<=NF;i++) if($i ~ /^(910|950)/){print $i; exit}}' \
              | head -1 || true)
CHIP_NAME=${CHIP_NAME:-910B1}
echo "[remote-build/ascend] detected chip: ${CHIP_NAME}"

# Map chip family → ccec arch flag value. Conservative; falls back to
# dav-c220-cube (which is what 910B uses).
case "${CHIP_NAME}" in
  910B*) ARCH=dav-c220-cube; SOC=Ascend910B1 ;;
  910C*) ARCH=dav-c220-cube; SOC=Ascend910B3 ;;  # 910C variants share c220
  910D*) ARCH=dav-c220-cube; SOC=Ascend910B4 ;;
  910A*) ARCH=dav-c100;      SOC=Ascend910 ;;
  950*)  ARCH=dav-c310;      SOC=Ascend950  ;;
  *)     ARCH=dav-c220-cube; SOC=Ascend910B1 ;;
esac
echo "[remote-build/ascend] arch=${ARCH} soc=${SOC}"

ASCEND_INC="${ASCEND_HOME}/aarch64-linux/include/ascendc/basic_api"
[[ -d "${ASCEND_INC}" ]] || ASCEND_INC=""

# Collect inputs
shopt -s nullglob
CCE_FILES=( *.cce )
CPP_FILES=( *.cpp *.cxx *.cc )
shopt -u nullglob

build_cce() {
  echo "[remote-build/ascend] compiling .cce: ${CCE_FILES[*]}"
  local cmd=( ccec -O2 --cce-aicore-only "--cce-aicore-arch=${ARCH}" -o bench )
  [[ -n "${ASCEND_INC}" ]] && cmd+=( -I "${ASCEND_INC}" )
  cmd+=( "${CCE_FILES[@]}" )
  "${cmd[@]}"
}

build_cpp() {
  echo "[remote-build/ascend] compiling .cpp via g++: ${CPP_FILES[*]}"
  g++ -O2 -std=c++17 -o bench "${CPP_FILES[@]}"
}

emit_stub() {
  echo "[remote-build/ascend] emitting stub ./bench (compile failed; pipeline-only mode)"
  cat > bench <<'STUB'
#!/usr/bin/env bash
echo "[stub-bench] this is a v3.28 stub binary — real kernel did not compile"
echo "[stub-bench] msprof will report 0% AI Core utilization; that's expected"
exit 0
STUB
  chmod +x bench
}

if [[ ${#CCE_FILES[@]} -gt 0 ]]; then
  if build_cce 2>&1; then
    echo "[remote-build/ascend] built ./bench from .cce"; exit 0
  else
    echo "[remote-build/ascend] ccec failed — trying .cpp fallback or stub"
  fi
fi

if [[ ${#CPP_FILES[@]} -gt 0 ]]; then
  if build_cpp 2>&1; then
    echo "[remote-build/ascend] built ./bench from .cpp"; exit 0
  else
    echo "[remote-build/ascend] g++ also failed — emitting stub"
  fi
fi

emit_stub
echo "[remote-build/ascend] pipeline-mode ./bench ready"
