#!/usr/bin/env bash
# v3.26 -- per-vendor remote build script (NVIDIA / CUDA).
#
# Invoked by remote-target.ts after scp'ing the kernel sources + this
# script to <work_dir> on the remote machine. Produces a single binary
# named `bench` that the test-harness step invokes.
#
# Convention: this script expects to find ONE .cu file in the current
# directory (the generated kernel from Layer G). It compiles + links into
# `./bench`.
#
# Future deepening (v3.27+): handle multi-file kernels, link against
# cuBLAS/cuDNN/CUTLASS, support different SM targets per --hardware.

set -euo pipefail

echo "[remote-build/nvidia] cwd: $(pwd)"
echo "[remote-build/nvidia] CUDA: $(nvcc --version 2>/dev/null | tail -1 || echo NOT FOUND)"

CU_FILES=(*.cu)
if [[ ${#CU_FILES[@]} -eq 0 ]] || [[ ! -e "${CU_FILES[0]}" ]]; then
  echo "[remote-build/nvidia] no .cu files in $(pwd) — abort"
  exit 1
fi

# Auto-detect compute capability from the first available GPU. Falls back
# to sm_90 (Hopper) since that's the most common v3.x deploy target.
ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d '.' 2>/dev/null || echo "90")
SMARG="-arch=sm_${ARCH}"

echo "[remote-build/nvidia] detected sm_${ARCH}; compiling ${CU_FILES[*]}"

nvcc \
  -O3 -Xptxas=-O3 \
  ${SMARG} \
  -std=c++17 \
  -o bench \
  "${CU_FILES[@]}" \
  -lcublas -lcudart

echo "[remote-build/nvidia] built ./bench ($(du -h bench | cut -f1))"
