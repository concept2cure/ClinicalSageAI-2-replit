/**
 * run-pq.ts — performance qualification of ONE model for high-risk regulatory
 * drafting, against the protocol in ./pq-protocol.json.
 *
 *   npm run pq:run -- --model claude-opus-4            # run and print the verdict
 *   npm run pq:run -- --model claude-opus-4 --record   # also write the record
 *
 * The record lands at docs/evidence/PQ/<date>/<model-id>.json. That path is
 * what a registry entry's `pq.reference` cites, and `verifyPqClaim` checks a
 * `passed` claim against it: same model id, same pinned version, an approved
 * protocol, verdict PASS.
 *
 * ── What this refuses to do, each because the harness it replaces did it ─────
 *   - It never scores a captured candidate. `server/eval/doc-quality/run-eval.ts
 *     --live` scored any task's stored `candidateContent` in preference to a
 *     live generation, so a live run counted text the model never produced.
 *   - It never lets the gateway choose. The old live mode routed
 *     `taskType: 'document_drafting'` and took whatever answered; with Opus 5
 *     down, Opus 4.8 answered and the run could not say which model it had
 *     qualified. Here every task goes to exactly one model through
 *     `AIGateway.evaluateModel`, and the model the provider REPORTS serving is
 *     checked against the pinned version.
 *   - A run that scored nothing is NOT_EXECUTED, never a pass. The old runner
 *     skipped its thresholds when nothing was scored and exited 0.
 *
 * What it measures, stated so nobody reads more into a PASS than is there: the
 * harness's generation prompt over the doc-quality gold bank. It does not
 * re-qualify each production drafting prompt; a prompt change in production is
 * not covered by a PQ run that predates it.
 *
 * RAG uses the production source/generation request, scoped reviewed sources,
 * exact candidate and independent judge, with actual provider-resolved identity.
 * Missing live tenant/programme, corpus review or attribution remains incomplete.
 *
 * Exit 0 only on PASS.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED_MODELS } from '../../services/ai-governance/approved-models.js';
import { getGateway } from '../../services/ai-gateway/gateway.js';
import {
  type GoldDocTask,
  buildExtractionPrompt,
  buildGenerationPrompt,
  parseExtraction,
  scoreExtractionTask,
  scoreGenerationTask,
} from '../doc-quality/doc-quality-metrics.js';
import {
  computeVerdict,
  servedModelMatches,
  type PqExtractionResult,
  type PqGenerationResult,
  type PqProtocol,
  type PqRagRecord,
  type PqRecord,
} from './pq-verdict.js';
import { captureIaReview, validateIaReviewBank, type IaReviewBank, type IaCaptureResult } from './ia-review.js';
import { runRagPhase, unavailableRagRecord, defaultRagDependencies } from './rag-phase.js';
import type { GoldItem } from '../rag/rag-metrics.js';
import { isCompletedProviderText, providerResponseMetadata } from './output-integrity.js';
import type { GuidanceManifest } from '../rag/qualification-corpus.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function gitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitWorkingTreeDirty(): boolean | null {
  try {
    return Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'],
      { cwd: REPO_ROOT, encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
}

/** Whether the protocol says the extraction component should run at all. */
function extractionComponentRuns(protocol: PqProtocol): boolean {
  const ext = protocol.components.extraction;
  return Boolean(ext?.required && ext.executable);
}

/**
 * The extraction component, as its own phase.
 *
 * Same rules as generation, for the same reason: the pinned model is asked
 * directly and the model the provider REPORTS serving is checked. It is
 * deliberately NOT routed through a per-document-type extraction service —
 * that would measure the service (and whichever model IT selects), which is
 * the attribution failure the rag component is still blocked on.
 */
async function runExtractionPhase(
  protocol: PqProtocol,
  tasks: GoldDocTask[],
  gateway: Pick<ReturnType<typeof getGateway>, 'evaluateModel'>,
  entry: { id: string; pinnedVersion: string; provider: string },
): Promise<PqExtractionResult[]> {
  if (!extractionComponentRuns(protocol)) return [];
  const minF1 = protocol.components.extraction?.criteria.minF1 ?? 0.8;
  const runnable = tasks.filter(
    (t) =>
      t.taskType === 'extraction' &&
      typeof t.input === 'string' &&
      t.input.trim() &&
      t.expectedFields &&
      Object.keys(t.expectedFields).length > 0,
  );

  const out: PqExtractionResult[] = [];
  for (const task of runnable) {
    let serving = { servedModel: null as string | null, servedProvider: null as string | null, finishReason: null as string | null, cached: null as boolean | null, deterministic: null as boolean | null };
    try {
      const response = await gateway.evaluateModel(entry.id, {
        taskType: 'document_drafting',
        messages: [{ role: 'user', content: buildExtractionPrompt(task) }],
        temperature: 0,
        callerModule: 'pq-runner',
      });
      const served = response.resolvedModel ?? null;
      serving = providerResponseMetadata(response);
      if (!isCompletedProviderText(response)) throw new Error('INCOMPLETE_PROVIDER_OUTPUT');
      const fields = parseExtraction(response.content);
      if (!fields) {
        // Not a score of zero: a reply that does not parse is a task that
        // produced no scorable output, and scoring it zero would be
        // indistinguishable from a model that extracted every field wrongly.
        throw new Error('the reply contained no JSON object');
      }
      const score = scoreExtractionTask(task, fields, minF1);
      const verified = servedModelMatches(served, entry.pinnedVersion) && response.provider === entry.provider;
      out.push({
        taskId: task.id,
        docType: task.docType,
        ...serving,
        servedModelVerified: verified,
        f1: score.f1,
        precision: score.precision,
        recall: score.recall,
      });
      console.info(
        `  ${task.id.padEnd(34)} [${task.docType}] F1=${score.f1.toFixed(2)} ` +
          `(P=${score.precision.toFixed(2)} R=${score.recall.toFixed(2)}) served=${served ?? 'unreported'}` +
          `${verified ? '' : '  ← NOT the pinned version'}`,
      );
    } catch {
      const message = 'QUALIFICATION_STEP_FAILED: provider text did not complete or could not be scored';
      out.push({
        taskId: task.id,
        docType: task.docType,
        ...serving,
        servedModelVerified: false,
        f1: null,
        precision: null,
        recall: null,
        error: message.slice(0, 300),
      });
      console.info(`  ${task.id.padEnd(34)} [${task.docType}] NOT EXECUTED — ${message.slice(0, 120)}`);
    }
  }
  return out;
}

/** The canonical RAG bank/manifest are fixed; operational prerequisites are explicit. */
async function runRequiredRag(protocol: PqProtocol, opts: RunPqOptions, entry: typeof APPROVED_MODELS[number], gateway: Pick<ReturnType<typeof getGateway>, 'evaluateModel'>): Promise<PqRagRecord> {
  const goldText = readFileSync(path.join(HERE, '..', 'rag', 'gold-dataset.json'), 'utf8');
  const manifestText = readFileSync(path.join(HERE, '..', 'rag', 'guidance-corpus-manifest.json'), 'utf8');
  const gold = JSON.parse(goldText) as { items: GoldItem[] };
  const generator = { modelId: entry.id, pinnedVersion: entry.pinnedVersion, provider: entry.provider };
  const judgeEntry = APPROVED_MODELS.find(m => m.id === opts.judgeModelId);
  const judge = judgeEntry ? { modelId: judgeEntry.id, pinnedVersion: judgeEntry.pinnedVersion, provider: judgeEntry.provider } : null;
  if (!protocol.components.rag?.required || !protocol.components.rag.executable) return unavailableRagRecord(gold.items, 'Canonical protocol does not require an executable RAG phase');
  if (!opts.organizationUuid || !opts.programId || !judge) return unavailableRagRecord(gold.items, 'Verified tenant/programme scope and a registry-pinned independent judge are required (--org-uuid, --program-id, --judge-model)');
  try {
    const deps = await defaultRagDependencies(gateway.evaluateModel.bind(gateway));
    const organizationId = await deps.resolveOrganizationId(opts.organizationUuid);
    return runRagPhase({ items: gold.items, manifest: JSON.parse(manifestText) as GuidanceManifest,
      scope: { organizationId, organizationUuid: opts.organizationUuid, programId: opts.programId },
      generator, judge, goldBankSha256: sha256(goldText), corpusManifestSha256: sha256(manifestText) }, deps);
  } catch {
    return unavailableRagRecord(gold.items, 'TENANT_BOOTSTRAP_FAILED: verified live organization/programme and database access are required', { generator, judge });
  }
}

/**
 * There is deliberately no protocol option: run-pq reads ./pq-protocol.json and
 * nothing else. An injectable protocol path would let a caller write a
 * genuine-looking PASS record — the right model, gold-bank hash and git sha —
 * against an approved copy of its own making (one with rag not required, say),
 * and verifyPqClaim does not compare a record's protocolSha256 with the repo's.
 * Tests exercise protocol changes as data by redirecting that one read
 * (server/eval/pq/__tests__/run-pq.test.ts), not through a seam here.
 */
export interface RunPqOptions {
  modelId: string;
  /** Write the record. The CLI's --record. */
  record?: boolean;
  /** Where the record goes. Defaults to docs/evidence/PQ/<date>/. */
  outDir?: string;
  /** Injected in tests; the CLI uses the process gateway. */
  gateway?: Pick<ReturnType<typeof getGateway>, 'evaluateModel'>;
  organizationUuid?: string;
  programId?: string;
  judgeModelId?: string;
}

export interface RunPqResult {
  verdict: PqRecord['verdict'];
  reasons: string[];
  generation: PqGenerationResult[];
  extraction: PqExtractionResult[];
  rag: PqRagRecord;
  recordPath: string | null;
}

/** Independent reviewer capture; it does not contribute a score or a PQ PASS. */
export async function runIaReview(opts: RunPqOptions): Promise<IaCaptureResult & { recordPath: string | null }> {
  const entry = APPROVED_MODELS.find(m => m.id === opts.modelId);
  if (!entry) throw new Error(`IA review refused: "${opts.modelId}" is not in approved-models`);
  const bankText = readFileSync(path.join(HERE, 'ia-review-cases.json'), 'utf8');
  const bank = JSON.parse(bankText) as IaReviewBank;
  const startedAt = new Date().toISOString();
  const result = await captureIaReview(bank, entry, opts.gateway ?? getGateway());
  let recordPath: string | null = null;
  if (opts.record) {
    const dir = opts.outDir ?? path.join(REPO_ROOT, 'docs', 'evidence', 'PQ', startedAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    recordPath = path.join(dir, `${entry.id}-ia-review.json`);
    writeFileSync(recordPath, `${JSON.stringify({
      kind: 'ia-review-capture', purpose: 'supplemental-ia-policy-review',
      modelId: entry.id, pinnedVersion: entry.pinnedVersion, provider: entry.provider,
      bankVersion: bank.version, bankStatus: bank.status, bankSha256: sha256(bankText),
      gitSha: gitSha(), gitWorkingTreeDirty: gitWorkingTreeDirty(),
      harnessSha256: sha256(readFileSync(path.join(HERE, 'ia-review.ts'), 'utf8')),
      runnerSha256: sha256(readFileSync(path.join(HERE, 'run-pq.ts'), 'utf8')),
      startedAt, finishedAt: new Date().toISOString(),
      limitations: [
        'Reviewer-draft expectations are not approved PQ gold or acceptance criteria.',
        'This captures the canonical IA policy with bounded official-source summaries; it does not execute production conversation orchestration, retrieval, or tools.',
        'Responses and expertise require qualified human review; no automatic IA accuracy score or PASS is emitted.',
        'This record cannot be cited as a passed model PQ or authorize governed regulatory drafting.',
      ],
      sources: bank.sources, ...result,
    }, null, 2)}\n`);
  }
  console.info(`IA review: ${result.status}; ${result.attributableTurns}/${result.plannedTurns} attributable turns; reviewer pending`);
  if (recordPath) console.info(`record: ${path.relative(REPO_ROOT, recordPath)}`);
  return { ...result, recordPath };
}

/** Read-only preparation check. Credentials are represented by presence only. */
export function preflightIaReview() {
  const bankText = readFileSync(path.join(HERE, 'ia-review-cases.json'), 'utf8');
  const bank = JSON.parse(bankText) as IaReviewBank;
  const protocol = JSON.parse(readFileSync(path.join(HERE, 'pq-protocol.json'), 'utf8')) as PqProtocol;
  const gold = JSON.parse(readFileSync(path.join(HERE, '..', 'doc-quality', 'gold-tasks.json'), 'utf8')) as { tasks: GoldDocTask[] };
  const countTasks = (taskType: GoldDocTask['taskType']) => {
    const counts: Record<string, number> = {};
    for (const task of gold.tasks) {
      if (task.taskType !== taskType || typeof task.input !== 'string' || !task.input.trim() ||
          (taskType === 'extraction' && !Object.keys(task.expectedFields ?? {}).length)) continue;
      counts[task.docType] = (counts[task.docType] ?? 0) + 1;
    }
    return counts;
  };
  const issues = validateIaReviewBank(bank);
  const credentialPresence = Object.fromEntries(
    ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'GOOGLE_API_KEY']
      .map(name => [name, Boolean(process.env[name]?.trim())]),
  );
  return {
    kind: 'ia-review-preflight', status: issues.length ? 'INVALID_PREPARATION' : 'PREPARED_NOT_QUALIFIED',
    gitSha: gitSha(), gitWorkingTreeDirty: gitWorkingTreeDirty(),
    harnessSha256: sha256(readFileSync(path.join(HERE, 'ia-review.ts'), 'utf8')),
    runnerSha256: sha256(readFileSync(path.join(HERE, 'run-pq.ts'), 'utf8')),
    bankVersion: bank.version, bankSha256: sha256(bankText), bankStatus: bank.status,
    caseCount: bank.cases.length, plannedTurns: bank.cases.reduce((sum, c) => sum + 1 + (c.followUpUserMessages?.length ?? 0), 0),
    sourceCount: bank.sources.length, issues, credentialPresence,
    modelCounts: { registryEntries: APPROVED_MODELS.length,
      approvedForHighRiskRole: APPROVED_MODELS.filter(m => m.approvedForHighRisk).length,
      passedPq: APPROVED_MODELS.filter(m => m.pq.status === 'passed').length,
      highRiskRoleWithPassedPq: APPROVED_MODELS.filter(m => m.approvedForHighRisk && m.pq.status === 'passed').length },
    existingGold: { generationByDocType: countTasks('generation'), extractionByDocType: countTasks('extraction'),
      requiredGenerationFloor: protocol.components.generation?.criteria.minTasksPerDocType ?? null },
    protocol: { protocolId: protocol.protocolId, status: protocol.status, approvedBy: protocol.approvedBy, approvedOn: protocol.approvedOn },
    models: APPROVED_MODELS.map(m => ({ id: m.id, pinnedVersion: m.pinnedVersion, provider: m.provider, pqStatus: m.pq.status })),
    remaining: [
      'Provision an authorized provider for the chosen registry model; presence alone does not verify credentials or provider identity.',
      'Run IA capture and have qualified domain/market reviewers adjudicate the real transcripts and draft expectations.',
      'Approve the canonical PQ protocol and acceptance criteria through the responsible system-owner process.',
      'Populate and verify a tenant-scoped RAG evaluation corpus, resolve gold-source documents, and execute attributable RAG qualification.',
      'Execute production-route acceptance and staging validation separately; this policy probe does not test them.',
    ],
  };
}

export async function runPq(opts: RunPqOptions): Promise<RunPqResult> {
  const entry = APPROVED_MODELS.find((m) => m.id === opts.modelId);
  if (!entry) {
    throw new Error(
      `"${opts.modelId}" is not an entry in server/services/ai-governance/approved-models.ts. ` +
        `Known: ${APPROVED_MODELS.map((m) => m.id).join(', ')}`,
    );
  }

  const protocolText = readFileSync(path.join(HERE, 'pq-protocol.json'), 'utf8');
  const protocol = JSON.parse(protocolText) as PqProtocol;
  const bankText = readFileSync(path.join(HERE, '..', 'doc-quality', 'gold-tasks.json'), 'utf8');
  const bank = JSON.parse(bankText) as { version: string; tasks: GoldDocTask[] };
  // Only tasks the model can be given: generation, with source input. Captured
  // candidates on those tasks are ignored — they are not this model's output.
  const tasks = bank.tasks.filter((t) => t.taskType === 'generation' && typeof t.input === 'string' && t.input.trim());
  const minCov = protocol.components.generation?.criteria.minSectionCoverage ?? 0.85;

  const startedAt = new Date().toISOString();
  console.info(
    `\nPQ ${protocol.protocolId} v${protocol.version} (${protocol.status}) — ${entry.id} → ${entry.pinnedVersion} ` +
      `[${entry.provider}], ${tasks.length} generation task(s), gold bank ${bank.version}\n${'─'.repeat(72)}`,
  );

  const gateway = opts.gateway ?? getGateway();
  const generation: PqGenerationResult[] = [];
  for (const task of tasks) {
    let serving = { servedModel: null as string | null, servedProvider: null as string | null, finishReason: null as string | null, cached: null as boolean | null, deterministic: null as boolean | null };
    try {
      const response = await gateway.evaluateModel(entry.id, {
        taskType: 'document_drafting',
        messages: [{ role: 'user', content: buildGenerationPrompt(task) }],
        temperature: 0,
        callerModule: 'pq-runner',
      });
      const served = response.resolvedModel ?? null;
      serving = providerResponseMetadata(response);
      if (!isCompletedProviderText(response)) throw new Error('INCOMPLETE_PROVIDER_OUTPUT');
      const score = scoreGenerationTask(task, response.content, minCov);
      const verified = servedModelMatches(served, entry.pinnedVersion) && response.provider === entry.provider;
      generation.push({
        taskId: task.id,
        docType: task.docType,
        ...serving,
        servedModelVerified: verified,
        sectionCoverage: score.sectionCoverage,
        forbiddenHits: score.forbiddenHits,
      });
      console.info(
        `  ${task.id.padEnd(34)} [${task.docType}] coverage=${score.sectionCoverage.toFixed(2)} ` +
          `forbidden=${score.forbiddenHits} served=${served ?? 'unreported'}${verified ? '' : '  ← NOT the pinned version'}`,
      );
    } catch {
      const message = 'QUALIFICATION_STEP_FAILED: provider text did not complete or could not be scored';
      generation.push({
        taskId: task.id,
        docType: task.docType,
        ...serving,
        servedModelVerified: false,
        sectionCoverage: null,
        forbiddenHits: null,
        error: message.slice(0, 300),
      });
      console.info(`  ${task.id.padEnd(34)} [${task.docType}] NOT EXECUTED — ${message.slice(0, 120)}`);
    }
  }

  const extraction = await runExtractionPhase(protocol, bank.tasks, gateway, entry);
  const rag = await runRequiredRag(protocol, opts, entry, gateway);

  const { verdict, reasons } = computeVerdict(protocol, generation, extraction, rag);
  console.info(`${'─'.repeat(72)}\nVerdict: ${verdict}`);
  for (const r of reasons) console.info(`  - ${r}`);

  let recordPath: string | null = null;
  if (opts.record) {
    const rec: PqRecord = {
      kind: 'pq-record',
      protocolId: protocol.protocolId,
      protocolVersion: protocol.version,
      protocolStatus: protocol.status,
      protocolSha256: sha256(protocolText),
      modelId: entry.id,
      pinnedVersion: entry.pinnedVersion,
      provider: entry.provider,
      goldBankVersion: bank.version,
      goldBankSha256: sha256(bankText),
      gitSha: gitSha(),
      startedAt,
      finishedAt: new Date().toISOString(),
      generation,
      extraction,
      rag,
      verdict,
      reasons,
    };
    const dir = opts.outDir ?? path.join(REPO_ROOT, 'docs', 'evidence', 'PQ', startedAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    recordPath = path.join(dir, `${entry.id}.json`);
    writeFileSync(recordPath, `${JSON.stringify(rec, null, 2)}\n`);
    console.info(`\nrecord: ${path.relative(REPO_ROOT, recordPath)}`);
  }
  return { verdict, reasons, generation, extraction, rag, recordPath };
}

/* CLI. Only when invoked directly — the tests import runPq. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modelId = arg('--model');
  if (process.argv.includes('--ia-preflight')) {
    try {
      const result = preflightIaReview();
      console.info(JSON.stringify(result, null, 2));
      process.exitCode = result.issues.length ? 1 : 0;
    } catch (err) {
      console.error('IA preflight failed:', (err as Error).message);
      process.exitCode = 2;
    }
  } else if (!modelId) {
    console.error('usage: run-pq --model <approved-models id> [--record] [--ia-review-only] | run-pq --ia-preflight');
    process.exitCode = 2;
  } else if (process.argv.includes('--ia-review-only')) {
    runIaReview({ modelId, record: process.argv.includes('--record') })
      .then(() => { process.exitCode = 1; }) // Capture is always unqualified and awaiting reviewer adjudication.
      .catch(() => { console.error('IA review failed before capture; no qualification was established'); process.exitCode = 2; });
  } else {
    runPq({ modelId, record: process.argv.includes('--record'), organizationUuid: arg('--org-uuid') ?? undefined,
      programId: arg('--program-id') ?? undefined, judgeModelId: arg('--judge-model') ?? undefined })
      .then((r) => {
        process.exitCode = r.verdict === 'PASS' ? 0 : 1;
      })
      .catch((err) => {
        console.error('run-pq failed:', (err as Error).message);
        process.exitCode = 2;
      });
  }
}
