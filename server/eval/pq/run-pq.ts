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
  type PqRecord,
} from './pq-verdict.js';

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
  entry: { id: string; pinnedVersion: string },
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
    try {
      const response = await gateway.evaluateModel(entry.id, {
        taskType: 'document_drafting',
        messages: [{ role: 'user', content: buildExtractionPrompt(task) }],
        temperature: 0,
        callerModule: 'pq-runner',
      });
      const served = response.resolvedModel ?? null;
      const fields = parseExtraction(response.content);
      if (!fields) {
        // Not a score of zero: a reply that does not parse is a task that
        // produced no scorable output, and scoring it zero would be
        // indistinguishable from a model that extracted every field wrongly.
        throw new Error('the reply contained no JSON object');
      }
      const score = scoreExtractionTask(task, fields, minF1);
      const verified = servedModelMatches(served, entry.pinnedVersion);
      out.push({
        taskId: task.id,
        docType: task.docType,
        servedModel: served,
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
    } catch (err) {
      const message = (err as Error).message;
      out.push({
        taskId: task.id,
        docType: task.docType,
        servedModel: null,
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

export interface RunPqOptions {
  modelId: string;
  /** Write the record. The CLI's --record. */
  record?: boolean;
  /** Where the record goes. Defaults to docs/evidence/PQ/<date>/. */
  outDir?: string;
  /** Injected in tests; the CLI uses the process gateway. */
  gateway?: Pick<ReturnType<typeof getGateway>, 'evaluateModel'>;
}

export interface RunPqResult {
  verdict: PqRecord['verdict'];
  reasons: string[];
  generation: PqGenerationResult[];
  extraction: PqExtractionResult[];
  recordPath: string | null;
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
    try {
      const response = await gateway.evaluateModel(entry.id, {
        taskType: 'document_drafting',
        messages: [{ role: 'user', content: buildGenerationPrompt(task) }],
        temperature: 0,
        callerModule: 'pq-runner',
      });
      const served = response.resolvedModel ?? null;
      const score = scoreGenerationTask(task, response.content, minCov);
      const verified = servedModelMatches(served, entry.pinnedVersion);
      generation.push({
        taskId: task.id,
        docType: task.docType,
        servedModel: served,
        servedModelVerified: verified,
        sectionCoverage: score.sectionCoverage,
        forbiddenHits: score.forbiddenHits,
      });
      console.info(
        `  ${task.id.padEnd(34)} [${task.docType}] coverage=${score.sectionCoverage.toFixed(2)} ` +
          `forbidden=${score.forbiddenHits} served=${served ?? 'unreported'}${verified ? '' : '  ← NOT the pinned version'}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      generation.push({
        taskId: task.id,
        docType: task.docType,
        servedModel: null,
        servedModelVerified: false,
        sectionCoverage: null,
        forbiddenHits: null,
        error: message.slice(0, 300),
      });
      console.info(`  ${task.id.padEnd(34)} [${task.docType}] NOT EXECUTED — ${message.slice(0, 120)}`);
    }
  }

  const extraction = await runExtractionPhase(protocol, bank.tasks, gateway, entry);

  const { verdict, reasons } = computeVerdict(protocol, generation, extraction);
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
      verdict,
      reasons,
    };
    const dir = opts.outDir ?? path.join(REPO_ROOT, 'docs', 'evidence', 'PQ', startedAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    recordPath = path.join(dir, `${entry.id}.json`);
    writeFileSync(recordPath, `${JSON.stringify(rec, null, 2)}\n`);
    console.info(`\nrecord: ${path.relative(REPO_ROOT, recordPath)}`);
  }
  return { verdict, reasons, generation, extraction, recordPath };
}

/* CLI. Only when invoked directly — the tests import runPq. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modelId = arg('--model');
  if (!modelId) {
    console.error('usage: run-pq --model <approved-models id> [--record]');
    process.exitCode = 2;
  } else {
    runPq({ modelId, record: process.argv.includes('--record') })
      .then((r) => {
        process.exitCode = r.verdict === 'PASS' ? 0 : 1;
      })
      .catch((err) => {
        console.error('run-pq failed:', (err as Error).message);
        process.exitCode = 2;
      });
  }
}
