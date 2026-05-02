#!/bin/bash
# v2.10 validation matrix — runs agent-deploy across (model × hardware)
set -e

cd /Users/yingwen/claude_project/evokernel_spec_app
mkdir -p /tmp/validation-output
RESULTS_JSON="/tmp/validation-output/results.json"
echo "{ \"runs\": [" > "$RESULTS_JSON"
FIRST=1

write_config() {
  case "$1" in
    llama-4-scout) echo '{"architectures":["Llama4ForCausalLM"],"hidden_size":8192,"num_attention_heads":64,"num_key_value_heads":8,"num_hidden_layers":80,"intermediate_size":28672,"vocab_size":128256,"num_local_experts":16,"num_experts_per_tok":1,"max_position_embeddings":131072}' ;;
    llama-3.3-70b) echo '{"architectures":["LlamaForCausalLM"],"hidden_size":8192,"num_attention_heads":64,"num_key_value_heads":8,"num_hidden_layers":80,"intermediate_size":28672,"vocab_size":128256,"max_position_embeddings":131072}' ;;
    mistral-large-3) echo '{"architectures":["MistralForCausalLM"],"hidden_size":12288,"num_attention_heads":96,"num_key_value_heads":8,"num_hidden_layers":88,"intermediate_size":28672,"vocab_size":32768,"max_position_embeddings":128000}' ;;
    qwen3.6-plus) echo '{"architectures":["Qwen3MoeForCausalLM"],"hidden_size":6144,"num_attention_heads":64,"num_key_value_heads":8,"num_hidden_layers":64,"intermediate_size":2048,"vocab_size":152064,"num_local_experts":128,"num_experts_per_tok":8,"max_position_embeddings":1048576}' ;;
    deepseek-v4-pro) echo '{"architectures":["DeepseekV3ForCausalLM"],"hidden_size":7168,"num_attention_heads":128,"num_key_value_heads":128,"num_hidden_layers":61,"intermediate_size":2048,"vocab_size":129280,"num_local_experts":256,"num_experts_per_tok":8,"max_position_embeddings":131072,"q_lora_rank":1536,"kv_lora_rank":512}' ;;
    deepseek-r1) echo '{"architectures":["DeepseekV3ForCausalLM"],"hidden_size":7168,"num_attention_heads":128,"num_key_value_heads":128,"num_hidden_layers":61,"intermediate_size":2048,"vocab_size":129280,"num_local_experts":256,"num_experts_per_tok":8,"max_position_embeddings":131072,"q_lora_rank":1536,"kv_lora_rank":512}' ;;
    glm-5-reasoning) echo '{"architectures":["GLMForCausalLM"],"hidden_size":5120,"num_attention_heads":40,"num_key_value_heads":8,"num_hidden_layers":60,"intermediate_size":17920,"vocab_size":151552,"max_position_embeddings":131072}' ;;
  esac
}

hf_id() {
  case "$1" in
    llama-4-scout) echo "meta-llama/Llama-4-Scout-17B-16E" ;;
    llama-3.3-70b) echo "meta-llama/Llama-3.3-70B-Instruct" ;;
    mistral-large-3) echo "mistralai/Mistral-Large-Instruct-2407" ;;
    qwen3.6-plus) echo "Qwen/Qwen3.6-Plus" ;;
    deepseek-v4-pro) echo "deepseek-ai/DeepSeek-V3-Pro" ;;
    deepseek-r1) echo "deepseek-ai/DeepSeek-R1" ;;
    glm-5-reasoning) echo "zai-org/GLM-5-Reasoning" ;;
  esac
}

# v2.14: 7 models × 7 hardware = 49 runs (was 5×7=35)
for MODEL_KEY in llama-4-scout llama-3.3-70b mistral-large-3 qwen3.6-plus deepseek-v4-pro deepseek-r1 glm-5-reasoning; do
  MODEL_ID=$(hf_id "$MODEL_KEY")
  CONFIG_PATH="/tmp/validation-output/${MODEL_KEY}.config.json"
  write_config "$MODEL_KEY" > "$CONFIG_PATH"

  # v2.11: extended to 国产 hardware coverage (Cambricon / Hygon / Moore Threads / Biren)
  for HW in h100-sxm5 mi300x ascend-910c mlu590 dcu-z100 mtt-s4000 br104; do
    OUTDIR="/tmp/validation-output/${MODEL_KEY}__${HW}"
    mkdir -p "$OUTDIR"
    echo ""
    echo "════ ${MODEL_KEY} × ${HW} ════"

    if pnpm tsx scripts/agent-deploy/index.ts \
        --model "$MODEL_ID" --hardware "$HW" --workload chat \
        --config "$CONFIG_PATH" --api-base "http://localhost:4329/api" \
        --output "$OUTDIR" > "$OUTDIR.log" 2>&1; then
      STATUS="success"
      ENGINE=$(jq -r '.recommended.engine' "$OUTDIR/deployment_plan.json")
      QUANT=$(jq -r '.recommended.quantization' "$OUTDIR/deployment_plan.json")
      CARDS=$(jq -r '.recommended.card_count' "$OUTDIR/deployment_plan.json")
      KGAPS=$(jq '.kernel_gaps | length' "$OUTDIR/deployment_plan.json")
      ARCHETYPE=$(jq -r '.parsed_model.archetype' "$OUTDIR/deployment_plan.json")
    else
      STATUS="failed"
      ENGINE="—"; QUANT="—"; CARDS=0; KGAPS=0; ARCHETYPE="—"
    fi

    [ $FIRST -eq 0 ] && echo "  ," >> "$RESULTS_JSON"
    FIRST=0
    printf '  {"model":"%s","hf_id":"%s","hardware":"%s","status":"%s","archetype":"%s","engine":"%s","quantization":"%s","card_count":%s,"kernel_gaps":%s}' \
      "$MODEL_KEY" "$MODEL_ID" "$HW" "$STATUS" "$ARCHETYPE" "$ENGINE" "$QUANT" "$CARDS" "$KGAPS" >> "$RESULTS_JSON"
    echo "  → $STATUS · engine=$ENGINE quant=$QUANT cards=$CARDS gaps=$KGAPS"
  done
done

echo "" >> "$RESULTS_JSON"
echo "], \"generated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" >> "$RESULTS_JSON"
echo "}" >> "$RESULTS_JSON"

echo ""
echo "═══ SUMMARY ═══"
jq -r '.runs[] | "\(.model) × \(.hardware): \(.status) · \(.archetype) · engine=\(.engine), quant=\(.quantization), cards=\(.card_count), gaps=\(.kernel_gaps)"' "$RESULTS_JSON"
