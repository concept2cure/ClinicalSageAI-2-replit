/**
 * Generate docs/ai-governance/EVIDENCE_PACK.md — an inspection-ready snapshot of
 * the AI governance posture (per-capability contracts, model pinning + drift,
 * reproducibility, groundedness gate, eval harnesses, Part-11 audit trail).
 *
 * Derived from code so it cannot drift from what actually runs. Regenerate on
 * any governance change: tsx scripts/ai-governance/generate-evidence-pack.ts
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SEED_CAPABILITIES } from '../../server/services/ana-capability-registry';
import { governanceFor } from '../../server/services/ai-governance/risk-tiers';
import { APPROVED_MODELS, detectModelDrift } from '../../server/services/ai-governance/approved-models';
import { DEFAULT_MODELS } from '../../server/services/ai-gateway/gateway';

function capabilityTable(): string {
  const byCat = new Map<string, string[]>();
  for (const cap of SEED_CAPABILITIES) {
    const g = governanceFor(cap.capabilityKey, cap.category, {
      name: cap.name,
      description: cap.description,
    });
    const row = `| \`${cap.capabilityKey}\` | ${g.riskTier} | ${g.humanOversight} | ${g.groundednessThreshold.toFixed(2)} | ${g.gxpApplicable ? 'yes' : 'no'} |`;
    const arr = byCat.get(cap.category) ?? [];
    arr.push(row);
    byCat.set(cap.category, arr);
  }
  const lines: string[] = [];
  for (const cat of [...byCat.keys()].sort()) {
    lines.push(`\n**${cat}**\n`);
    lines.push('| Capability | Risk tier | Human oversight | Groundedness floor | GxP |');
    lines.push('| --- | --- | --- | --- | --- |');
    lines.push(...(byCat.get(cat) as string[]));
  }
  return lines.join('\n');
}

function driftSection(): string {
  const registry = DEFAULT_MODELS.map(m => ({ id: m.id, model: m.model }));
  const drift = detectModelDrift(registry);
  if (drift.length === 0) {
    return `Drift gate verdict: **PASS** — all ${APPROVED_MODELS.length} pinned models match the live gateway registry (no unreviewed model swap).`;
  }
  return [
    `Drift gate verdict: **FAIL** — ${drift.length} finding(s):`,
    ...drift.map(d => `- ${d.detail}`),
  ].join('\n');
}

function approvedTable(): string {
  const lines = ['| Model id | Pinned version | Provider | Role |', '| --- | --- | --- | --- |'];
  for (const m of APPROVED_MODELS) {
    lines.push(`| \`${m.id}\` | \`${m.pinnedVersion}\` | ${m.provider} | ${m.role} |`);
  }
  return lines.join('\n');
}

function build(): string {
  const now = new Date().toISOString();
  return `# AI governance evidence pack — Concept2Cure AnA

> Generated ${now} by \`scripts/ai-governance/generate-evidence-pack.ts\`. Do not edit by hand.
> Inspection-ready snapshot derived from code. Not a substitute for executed validation protocols.

## 1. Controls summary

| Control | Status | Implementation |
| --- | --- | --- |
| Per-feature intended use + risk tier | In place | \`server/services/ai-governance/risk-tiers.ts\`; \`ana_capability_registry\` columns (migration \`20260603_ai_capability_governance.sql\`) |
| Reproducibility (model/prompt/params logged; version pinning) | In place | \`server/services/ai-gateway/audit.ts\` (model, prompt hash, prompt version, temperature, seed, fallback chain); \`approved-models.ts\` lockfile + drift gate |
| Groundedness → human-review gate | In place | \`server/services/ai-governance/{groundedness,review-policy}.ts\`; enforced at \`POST /api/c2c/actions/accept-ai-suggestion\` |
| Eval harness + model cards | In place | \`server/eval/rag/\`, \`server/eval/doc-quality/\`; \`docs/ai-governance/MODEL_CARDS.md\` |

## 2. Per-capability governance contracts

Every AnA capability carries an intended-use statement (stored on the registry), a
risk tier, a human-oversight mode, a groundedness floor, and GxP applicability.
${capabilityTable()}

## 3. Reproducibility & model governance

Every governed AI call routes through \`server/services/ai-gateway\` and its audit
log records: provider, model, **model/prompt version**, **prompt SHA-256 hash**,
**temperature**, **seed**, token usage, cost, latency, and the **fallback chain**
(\`ai.gateway_audit_log\`). New direct-client instantiations outside the gateway
are blocked by \`scripts/ci/check-gateway-bypass.mjs\`.

${driftSection()}

### Approved-model lockfile

${approvedTable()}

Full per-model intended use, limitations, and eval status: \`docs/ai-governance/MODEL_CARDS.md\`.

## 4. Groundedness gate

Generated claims are scored for groundedness (citation coverage; richer
evidence-based scoring via \`confidenceScoringEngine\`). At accept time, content
scored below its capability's threshold is blocked
(\`422 GROUNDEDNESS_REVIEW_REQUIRED\`) unless a human-review acknowledgement is
recorded; the verdict + score persist into the \`c2c_ana_actions\` ledger. Set
\`AI_GROUNDEDNESS_ENFORCE=1\` to enforce computed scores org-wide.

## 5. Evaluation

| Harness | Scope | Run |
| --- | --- | --- |
| RAG | retrieval hit/recall/MRR + LLM-judged faithfulness | \`tsx server/eval/rag/run-eval.ts --min-hit-rate X --min-faithfulness Y\` |
| Doc-quality | per-document-type extraction F1 + generation section coverage + forbidden-phrase checks | \`npm run ai:eval-doc-quality -- --min-coverage 0.85 --min-f1 0.8\` |

Per-document-type accuracy banks are seed-stage; expand + run live to publish numbers.

## 6. Audit trail (21 CFR Part 11)

- Governed actions: \`c2c_ana_actions\` ledger + \`audit_logs\` with a SHA-256 hash
  chain (\`server/services/audit/chain.ts\`), written in one transaction.
- On-demand verification: \`GET /api/c2c/actions/verify-chain\`.
- Scheduled daily tamper-evidence sweep: \`server/jobs/auditChainIntegritySweep.ts\`
  (enable with \`ENABLE_AUDIT_CHAIN_CHECK=true\`).

## 7. Related documents

- Buyer-facing answer: \`docs/ai-governance/LLM_GXP_VALIDATION.md\`
- Control → regulation mapping: \`docs/ai-governance/CONTROL_TRACEABILITY_MATRIX.md\`
- Model cards: \`docs/ai-governance/MODEL_CARDS.md\`
`;
}

const outDir = join(process.cwd(), 'docs', 'ai-governance');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'EVIDENCE_PACK.md');
writeFileSync(outFile, build(), 'utf8');
console.info(`Wrote ${outFile} (${SEED_CAPABILITIES.length} capability contracts, ${APPROVED_MODELS.length} pinned models).`);
