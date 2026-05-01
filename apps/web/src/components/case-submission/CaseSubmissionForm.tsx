import { useMemo, useState } from 'react';

/**
 * Case Submission Form — generates a PR-ready case YAML from form inputs.
 *
 * Removes the "fork + clone + vim" friction for new contributors. Users fill
 * a form with measured numbers from their deployment, the form generates a
 * YAML that validates against schemas/case.ts, and gives copy-paste-to-PR
 * instructions.
 *
 * Design principle: every required field is a form input; every optional
 * field has a "(optional)" hint. The generated YAML matches the catalog's
 * existing case format so PR review is mechanical.
 */

interface ModelOption {
  id: string;
  name: string;
}

interface HardwareOption {
  id: string;
  name: string;
  vendor: string;
}

interface CaseSubmissionFormProps {
  models: ModelOption[];
  hardware: HardwareOption[];
  engines: string[];
  quantizations: string[];
}

type Bottleneck = 'compute' | 'memory-bandwidth' | 'interconnect' | 'software' | 'mixed' | 'unknown';

const BOTTLENECK_OPTIONS: Bottleneck[] = ['compute', 'memory-bandwidth', 'interconnect', 'software', 'mixed', 'unknown'];

interface FormState {
  // Identity
  caseSlug: string;
  title: string;
  submitterGithub: string;
  submitterAffiliation: string;

  // Stack
  modelId: string;
  hardwareId: string;
  hardwareCount: number;
  topology: string;
  engine: string;
  engineVersion: string;
  quantization: string;
  weightFormat: string;
  intraNode: string;
  interNode: string;

  // Parallel
  tp: number;
  pp: number;
  ep: number;
  sp: number;
  disaggregated: boolean;

  // Driver/OS
  driver: string;
  os: string;

  // Scenario
  prefillSeqLen: number;
  decodeSeqLen: number;
  batchSize: number;
  maxConcurrent: number;

  // Results
  decodeTokS: number;
  prefillTokS: number;
  ttftP50: number;
  ttftP99: number;
  tbtP50: number;
  tbtP99: number;
  memoryGB: number;
  powerW: number;
  computePct: number;
  memoryBwPct: number;
  bottleneck: Bottleneck;

  // Reproduction
  startupCommand: string;
  benchmarkTool: string;
  notesMd: string;
  issuesEncountered: string; // newline-separated

  // Patterns
  patterns: string; // comma-separated

  // Evidence
  evidenceTier: 'official' | 'measured' | 'estimated';
  evidenceSourceType: string;
  evidenceUrl: string;
  evidenceCitation: string;
  contributorAttestation: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

function buildYaml(s: FormState): string {
  const lines: string[] = [];
  lines.push(`id: ${s.caseSlug}`);
  lines.push(`title: ${quote(s.title)}`);
  lines.push(`submitted_at: '${TODAY}'`);
  lines.push(`submitter:`);
  lines.push(`  github: '${s.submitterGithub}'`);
  if (s.submitterAffiliation) lines.push(`  affiliation: ${quote(s.submitterAffiliation)}`);
  lines.push(`stack:`);
  lines.push(`  hardware: { id: ${s.hardwareId}, count: ${s.hardwareCount}, topology: ${quote(s.topology)} }`);
  lines.push(`  interconnect: { intra_node: ${quote(s.intraNode)}, inter_node: ${quote(s.interNode || 'none')} }`);
  lines.push(`  model: { id: ${s.modelId}, weight_format: ${s.weightFormat} }`);
  lines.push(`  engine: { id: ${s.engine}, version: ${quote(s.engineVersion)} }`);
  lines.push(`  quantization: ${s.quantization}`);
  lines.push(`  parallel: { tp: ${s.tp}, pp: ${s.pp}, ep: ${s.ep}, sp: ${s.sp}, disaggregated: ${s.disaggregated} }`);
  lines.push(`  driver: ${quote(s.driver)}`);
  lines.push(`  os: ${quote(s.os)}`);
  lines.push(`scenario:`);
  lines.push(`  prefill_seq_len: ${s.prefillSeqLen}`);
  lines.push(`  decode_seq_len: ${s.decodeSeqLen}`);
  lines.push(`  batch_size: ${s.batchSize}`);
  lines.push(`  max_concurrent_requests: ${s.maxConcurrent}`);
  lines.push(`results:`);
  lines.push(`  throughput_tokens_per_sec: { decode: ${s.decodeTokS}, prefill: ${s.prefillTokS} }`);
  lines.push(
    `  latency_ms: { ttft_p50: ${s.ttftP50}, ttft_p99: ${s.ttftP99}, tbt_p50: ${s.tbtP50}, tbt_p99: ${s.tbtP99} }`
  );
  lines.push(`  memory_per_card_gb: ${s.memoryGB}`);
  lines.push(`  power_per_card_w: ${s.powerW}`);
  lines.push(`  utilization: { compute_pct: ${s.computePct}, memory_bw_pct: ${s.memoryBwPct} }`);
  lines.push(`bottleneck: ${s.bottleneck}`);
  lines.push(`reproduction:`);
  lines.push(`  startup_command: ${quote(s.startupCommand)}`);
  lines.push(`  benchmark_tool: ${quote(s.benchmarkTool)}`);
  if (s.notesMd) {
    lines.push(`  notes_md: |`);
    for (const ln of s.notesMd.split('\n')) lines.push(`    ${ln}`);
  }
  const issues = s.issuesEncountered.split('\n').map((x) => x.trim()).filter(Boolean);
  if (issues.length) {
    lines.push(`issues_encountered:`);
    for (const issue of issues) lines.push(`  - ${quote(issue)}`);
  }
  const patterns = s.patterns.split(',').map((x) => x.trim()).filter(Boolean);
  if (patterns.length) {
    lines.push(`patterns: [${patterns.join(', ')}]`);
  }
  lines.push(`evidence:`);
  const evId = `ev-${s.caseSlug.replace(/^case-/, '')}`;
  lines.push(`  - id: ${evId}`);
  lines.push(`    tier: ${s.evidenceTier}`);
  lines.push(`    source_type: ${s.evidenceSourceType}`);
  lines.push(`    url: ${s.evidenceUrl}`);
  lines.push(`    accessed: '${TODAY}'`);
  lines.push(`    citation: ${quote(s.evidenceCitation)}`);
  if (s.contributorAttestation) {
    lines.push(`    contributor_attestation: ${quote(s.contributorAttestation)}`);
  }
  return lines.join('\n');
}

function quote(s: string): string {
  // Use double quotes if string has special chars; else single
  if (/[:#&*!|>'"%@`]/.test(s) || s.includes('\n') || s.startsWith('-') || s.startsWith(' ') || s.endsWith(' ')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `'${s.replace(/'/g, "''")}'`;
}

const DEFAULT_STATE: FormState = {
  caseSlug: 'case-mymodel-h200x8-vllm-fp8-001',
  title: 'My Model 70B on 8× H200 SXM with vLLM 0.7 FP8',
  submitterGithub: '@your-handle',
  submitterAffiliation: '',
  modelId: '',
  hardwareId: '',
  hardwareCount: 8,
  topology: 'single-node-hgx',
  engine: 'vllm',
  engineVersion: '0.7.5',
  quantization: 'fp8-e4m3',
  weightFormat: 'bf16',
  intraNode: 'nvlink-4',
  interNode: 'none',
  tp: 8,
  pp: 1,
  ep: 1,
  sp: 1,
  disaggregated: false,
  driver: 'CUDA 12.6',
  os: 'Ubuntu 24.04',
  prefillSeqLen: 2048,
  decodeSeqLen: 512,
  batchSize: 32,
  maxConcurrent: 128,
  decodeTokS: 3500,
  prefillTokS: 38000,
  ttftP50: 180,
  ttftP99: 320,
  tbtP50: 14,
  tbtP99: 28,
  memoryGB: 88,
  powerW: 690,
  computePct: 56,
  memoryBwPct: 79,
  bottleneck: 'memory-bandwidth',
  startupCommand: 'vllm serve <hf-model-id> --tensor-parallel-size 8 --quantization fp8',
  benchmarkTool: 'vllm benchmark_serving.py',
  notesMd: '',
  issuesEncountered: '',
  patterns: 'flashattention-v3, paged-attention, continuous-batching',
  evidenceTier: 'measured',
  evidenceSourceType: 'third-party-review',
  evidenceUrl: 'https://example.com/your-benchmark',
  evidenceCitation: 'Internal benchmark on 8x H200 cluster; reproduced 3 runs.',
  contributorAttestation: 'Reproduced on hardware; numbers within 5% across 3 runs.'
};

export default function CaseSubmissionForm({ models, hardware, engines, quantizations }: CaseSubmissionFormProps) {
  const [state, setState] = useState<FormState>(() => ({
    ...DEFAULT_STATE,
    modelId: models[0]?.id ?? 'unknown-model',
    hardwareId: hardware[0]?.id ?? 'unknown-hw'
  }));
  const [copied, setCopied] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  const yaml = useMemo(() => buildYaml(state), [state]);

  function copyYaml() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(yaml).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  function downloadYaml() {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const year = TODAY.slice(0, 4);
    const month = TODAY.slice(5, 7);
    a.download = `${state.caseSlug}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="csf-grid">
      <div className="csf-form">
        <Section title="1. 标识 / Identity">
          <Field label="Case slug (id)" hint="必须以 'case-' 开头, 全小写, 用 '-' 分隔">
            <input
              type="text"
              value={state.caseSlug}
              onChange={(e) => update('caseSlug', e.target.value)}
              className="csf-input csf-mono"
            />
          </Field>
          <Field label="Title" hint="人类可读的简短描述">
            <input type="text" value={state.title} onChange={(e) => update('title', e.target.value)} className="csf-input" />
          </Field>
          <Row>
            <Field label="GitHub handle" hint="@your-handle">
              <input
                type="text"
                value={state.submitterGithub}
                onChange={(e) => update('submitterGithub', e.target.value)}
                className="csf-input csf-mono"
              />
            </Field>
            <Field label="Affiliation" hint="(optional)">
              <input
                type="text"
                value={state.submitterAffiliation}
                onChange={(e) => update('submitterAffiliation', e.target.value)}
                className="csf-input"
              />
            </Field>
          </Row>
        </Section>

        <Section title="2. Stack">
          <Row>
            <Field label="Model" hint="必须是 catalog 已有模型 (or PR 新模型 first)">
              <select value={state.modelId} onChange={(e) => update('modelId', e.target.value)} className="csf-input">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weight format">
              <select value={state.weightFormat} onChange={(e) => update('weightFormat', e.target.value)} className="csf-input">
                {['bf16', 'fp16', 'fp32', 'mixed'].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Hardware" hint="catalog 已有卡">
              <select value={state.hardwareId} onChange={(e) => update('hardwareId', e.target.value)} className="csf-input">
                {hardware.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Card count">
              <input
                type="number"
                min={1}
                value={state.hardwareCount}
                onChange={(e) => update('hardwareCount', Number(e.target.value))}
                className="csf-input"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Topology" hint="例: single-node-hgx, 2-node-roce, super-pod-nvl72">
              <input type="text" value={state.topology} onChange={(e) => update('topology', e.target.value)} className="csf-input csf-mono" />
            </Field>
            <Field label="Quantization">
              <select value={state.quantization} onChange={(e) => update('quantization', e.target.value)} className="csf-input">
                {quantizations.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Engine">
              <select value={state.engine} onChange={(e) => update('engine', e.target.value)} className="csf-input">
                {engines.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </Field>
            <Field label="Engine version">
              <input type="text" value={state.engineVersion} onChange={(e) => update('engineVersion', e.target.value)} className="csf-input csf-mono" />
            </Field>
          </Row>
          <Row>
            <Field label="Intra-node interconnect" hint="例: nvlink-4, hccs-v2, infinity-fabric">
              <input type="text" value={state.intraNode} onChange={(e) => update('intraNode', e.target.value)} className="csf-input csf-mono" />
            </Field>
            <Field label="Inter-node interconnect" hint="'none' if single-node">
              <input type="text" value={state.interNode} onChange={(e) => update('interNode', e.target.value)} className="csf-input csf-mono" />
            </Field>
          </Row>
        </Section>

        <Section title="3. Parallelism">
          <div className="csf-row-5">
            <Field label="TP">
              <input type="number" min={1} value={state.tp} onChange={(e) => update('tp', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="PP">
              <input type="number" min={1} value={state.pp} onChange={(e) => update('pp', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="EP">
              <input type="number" min={1} value={state.ep} onChange={(e) => update('ep', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="SP">
              <input type="number" min={1} value={state.sp} onChange={(e) => update('sp', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="Disaggregated">
              <select
                value={String(state.disaggregated)}
                onChange={(e) => update('disaggregated', e.target.value === 'true')}
                className="csf-input"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </Field>
          </div>
          <Row>
            <Field label="Driver" hint="例: CUDA 12.6, ROCm 6.2, CANN 9.0">
              <input type="text" value={state.driver} onChange={(e) => update('driver', e.target.value)} className="csf-input csf-mono" />
            </Field>
            <Field label="OS">
              <input type="text" value={state.os} onChange={(e) => update('os', e.target.value)} className="csf-input csf-mono" />
            </Field>
          </Row>
        </Section>

        <Section title="4. Scenario">
          <Row>
            <Field label="Prefill seq len">
              <input type="number" min={1} value={state.prefillSeqLen} onChange={(e) => update('prefillSeqLen', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="Decode seq len">
              <input type="number" min={1} value={state.decodeSeqLen} onChange={(e) => update('decodeSeqLen', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
          <Row>
            <Field label="Batch size">
              <input type="number" min={1} value={state.batchSize} onChange={(e) => update('batchSize', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="Max concurrent requests">
              <input type="number" min={1} value={state.maxConcurrent} onChange={(e) => update('maxConcurrent', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
        </Section>

        <Section title="5. Results">
          <Row>
            <Field label="Decode tok/s (total)" hint="sum across all cards">
              <input type="number" min={0} value={state.decodeTokS} onChange={(e) => update('decodeTokS', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="Prefill tok/s">
              <input type="number" min={0} value={state.prefillTokS} onChange={(e) => update('prefillTokS', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
          <Row>
            <Field label="TTFT P50 (ms)">
              <input type="number" min={0} value={state.ttftP50} onChange={(e) => update('ttftP50', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="TTFT P99 (ms)">
              <input type="number" min={0} value={state.ttftP99} onChange={(e) => update('ttftP99', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
          <Row>
            <Field label="TBT P50 (ms)">
              <input type="number" min={0} value={state.tbtP50} onChange={(e) => update('tbtP50', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="TBT P99 (ms)">
              <input type="number" min={0} value={state.tbtP99} onChange={(e) => update('tbtP99', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
          <Row>
            <Field label="Memory per card (GB)">
              <input type="number" min={0} value={state.memoryGB} onChange={(e) => update('memoryGB', Number(e.target.value))} className="csf-input" />
            </Field>
            <Field label="Power per card (W)">
              <input type="number" min={0} value={state.powerW} onChange={(e) => update('powerW', Number(e.target.value))} className="csf-input" />
            </Field>
          </Row>
          <Row>
            <Field label="Compute utilization (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={state.computePct}
                onChange={(e) => update('computePct', Math.max(0, Math.min(100, Number(e.target.value))))}
                className="csf-input"
              />
            </Field>
            <Field label="Memory bandwidth utilization (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={state.memoryBwPct}
                onChange={(e) => update('memoryBwPct', Math.max(0, Math.min(100, Number(e.target.value))))}
                className="csf-input"
              />
            </Field>
          </Row>
          <Field label="Primary bottleneck">
            <select
              value={state.bottleneck}
              onChange={(e) => update('bottleneck', e.target.value as Bottleneck)}
              className="csf-input"
            >
              {BOTTLENECK_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="6. Reproduction & Patterns">
          <Field label="Startup command" hint="copy-pasteable">
            <input
              type="text"
              value={state.startupCommand}
              onChange={(e) => update('startupCommand', e.target.value)}
              className="csf-input csf-mono"
            />
          </Field>
          <Field label="Benchmark tool">
            <input
              type="text"
              value={state.benchmarkTool}
              onChange={(e) => update('benchmarkTool', e.target.value)}
              className="csf-input csf-mono"
            />
          </Field>
          <Field label="Notes (markdown, optional)">
            <textarea
              value={state.notesMd}
              onChange={(e) => update('notesMd', e.target.value)}
              className="csf-textarea"
              rows={4}
              placeholder="可选: 部署细节, 量化策略, scaling laws 等"
            />
          </Field>
          <Field label="Issues encountered (one per line)">
            <textarea
              value={state.issuesEncountered}
              onChange={(e) => update('issuesEncountered', e.target.value)}
              className="csf-textarea"
              rows={4}
              placeholder="每行一条: 'FP8 calibration 30 min cold start' / 'NCCL hang on cross-node TP=8 with old NCCL 2.18' …"
            />
          </Field>
          <Field label="Patterns (comma-separated)" hint="from data/patterns/, e.g. flashattention-v3, paged-attention">
            <input
              type="text"
              value={state.patterns}
              onChange={(e) => update('patterns', e.target.value)}
              className="csf-input csf-mono"
            />
          </Field>
        </Section>

        <Section title="7. Evidence">
          <Row>
            <Field label="Tier">
              <select
                value={state.evidenceTier}
                onChange={(e) => update('evidenceTier', e.target.value as FormState['evidenceTier'])}
                className="csf-input"
              >
                <option value="measured">measured (你跑出来的)</option>
                <option value="official">official (vendor 官方)</option>
                <option value="estimated">estimated (推算)</option>
              </select>
            </Field>
            <Field label="Source type">
              <select
                value={state.evidenceSourceType}
                onChange={(e) => update('evidenceSourceType', e.target.value)}
                className="csf-input"
              >
                <option value="third-party-review">third-party-review</option>
                <option value="vendor-press-release">vendor-press-release</option>
                <option value="vendor-product-page">vendor-product-page</option>
                <option value="vendor-whitepaper">vendor-whitepaper</option>
                <option value="vendor-datasheet">vendor-datasheet</option>
                <option value="mlperf-submission">mlperf-submission</option>
                <option value="community-benchmark">community-benchmark</option>
                <option value="paper">paper</option>
                <option value="conference-talk">conference-talk</option>
                <option value="other">other</option>
              </select>
            </Field>
          </Row>
          <Field label="Source URL">
            <input
              type="url"
              value={state.evidenceUrl}
              onChange={(e) => update('evidenceUrl', e.target.value)}
              className="csf-input csf-mono"
            />
          </Field>
          <Field label="Citation (1-2 sentence summary)">
            <input
              type="text"
              value={state.evidenceCitation}
              onChange={(e) => update('evidenceCitation', e.target.value)}
              className="csf-input"
            />
          </Field>
          <Field label="Contributor attestation (optional)" hint="如果是 measured: 'reproduced on hardware, N runs'">
            <input
              type="text"
              value={state.contributorAttestation}
              onChange={(e) => update('contributorAttestation', e.target.value)}
              className="csf-input"
            />
          </Field>
        </Section>
      </div>

      <div className="csf-output" data-testid="csf-output">
        <div className="csf-output-header">
          <h3 className="csf-output-title">生成的 YAML</h3>
          <div className="csf-output-actions">
            <button type="button" onClick={copyYaml} className="csf-btn csf-btn-primary" data-testid="csf-copy-btn">
              {copied ? '✓ 已复制' : '📋 复制'}
            </button>
            <button type="button" onClick={downloadYaml} className="csf-btn">⬇️ 下载</button>
          </div>
        </div>
        <pre className="csf-yaml" data-testid="csf-yaml-output">{yaml}</pre>

        <div className="csf-pr-instructions">
          <h4>提交 PR 步骤 / How to submit</h4>
          <ol>
            <li>
              复制上面的 YAML 内容 (或下载文件)
            </li>
            <li>
              在 GitHub 仓库
              <a href="https://github.com/ying-wen/evokernel-spec/new/main/data/cases/2026/05/" target="_blank" rel="noopener noreferrer">
                {' '}data/cases/&lt;year&gt;/&lt;month&gt;/
              </a>
              点 "Add file → Create new file"
            </li>
            <li>
              文件名: <code>{state.caseSlug}.yaml</code>
            </li>
            <li>粘贴 YAML 内容, commit 到新分支 (GitHub 会自动 fork)</li>
            <li>
              CI 跑 <code>pnpm validate</code>; 如果有 schema 错会显示红 ❌, 改完再 commit
            </li>
            <li>合并后会自动出现在 /cases/ 列表 + /pricing/ 排行榜 + 各种统计页</li>
          </ol>
          <p className="csf-pr-note">
            💡 <strong>建议</strong>: 部署前先用
            <a href="/evokernel-spec/learn/capacity-planning/"> 容量规划指南</a> +
            <a href="/evokernel-spec/calculator/capacity-planner/"> 计算器</a> sizing,
            部署后用 <a href="/evokernel-spec/learn/observability/">可观测性指南</a> 测 SLO,
            然后回来这里把数字记录下来 — 闭环.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="csf-section">
      <h3 className="csf-section-title">{title}</h3>
      <div className="csf-section-body">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="csf-field">
      <span className="csf-label">
        {label}
        {hint && <span className="csf-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="csf-row">{children}</div>;
}
