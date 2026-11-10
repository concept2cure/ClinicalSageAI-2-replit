/**
 * The PQ runner's live path, driven with a stubbed provider.
 *
 * The keyless run proves the runner refuses when nothing can answer. These
 * prove what it records when something does: the model the provider REPORTS
 * serving, never a captured candidate, and a record that carries its own
 * provenance. `evaluateModel` is the only thing replaced.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPq as runScopedPq, type RunPqOptions } from '../run-pq';
import { getTenantScope } from '../../../db/tenantStore';
import type { EvaluationScope } from '../../rag/qualification-corpus';
import { buildExtractionPrompt, buildGenerationPrompt, type GoldDocTask } from '../../doc-quality/doc-quality-metrics';
import goldBank from '../../doc-quality/gold-tasks.json';
import protocolJson from '../pq-protocol.json';
import { APPROVED_MODELS } from '../../../services/ai-governance/approved-models';
import type { GatewayResponse } from '../../../services/ai-gateway/types';
import { AIGateway } from '../../../services/ai-gateway/gateway';
import * as providerClients from '../../../services/ai-gateway/providers/clients';
import { setOrgPlacementResolver, resetOrgPlacementResolver } from '../../../services/ai-gateway/providers/org-placement';

const admission = vi.hoisted(() => ({ organizationUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', otherOrganizationUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  otherProgramId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', resolve: vi.fn(), verify: vi.fn() }));
const preflightFixture = vi.hoisted(() => ({ useActual: false }));
// Network-free harness cases inject ready prerequisites so the real measured verdict remains testable.
// This test seam changes neither the canonical protocol nor its ability to establish a PASS.
vi.mock('../verify-pq-record', async importOriginal => {
  const real = await importOriginal<typeof import('../verify-pq-record')>();
  return { ...real, qualificationPreflight: () => {
    const actual = real.qualificationPreflight();
    return preflightFixture.useActual ? actual : { ...actual, readyToEvaluate: true, status: 'ready_to_evaluate', blockers: [] };
  } };
});
vi.mock('../rag-phase', async importOriginal => ({ ...await importOriginal<typeof import('../rag-phase')>(),
  defaultRagDependencies: async (evaluateModel: unknown) => ({ evaluateModel, resolveOrganizationId: admission.resolve,
    verifyScope: admission.verify, readDocument: vi.fn(), retrieve: vi.fn() }) }));
beforeEach(() => {
  preflightFixture.useActual = false;
  admission.resolve.mockReset().mockImplementation(async uuid => {
    if (uuid === admission.organizationUuid) return 7;
    if (uuid === admission.otherOrganizationUuid) return 8;
    throw new Error('Unverified evaluation organization');
  });
  admission.verify.mockReset().mockImplementation(async (scope: EvaluationScope) => {
    if ((scope.organizationId === 7 && scope.organizationUuid === admission.organizationUuid && scope.programId === admission.programId) ||
      (scope.organizationId === 8 && scope.organizationUuid === admission.otherOrganizationUuid && scope.programId === admission.otherProgramId)) return;
    throw new Error('Unverified organization/programme binding');
  });
});
const runPq = (options: RunPqOptions) => runScopedPq({ organizationUuid: admission.organizationUuid, programId: admission.programId, ...options });

/**
 * The version the model under qualification is pinned to, read from the same
 * registry entry `runPq` checks the served model against. It was hard-coded
 * as 'claude-opus-5' and went stale when the flagship was re-pinned to Opus
 * 5.5 (c4eab325f, 2026-09-25): every "perfect model" case then reported a
 * model that was no longer the pinned version, so the run went INCOMPLETE
 * for attribution and the cases stopped measuring what they name. Derived,
 * a re-pin moves the stub with it; the rule it exercises does not move.
 */
const MODEL_ID = 'claude-opus-4';
const PINNED = (() => {
  const entry = APPROVED_MODELS.find((m) => m.id === MODEL_ID);
  if (!entry) throw new Error(`${MODEL_ID} is not in approved-models; these cases qualify it`);
  return entry.pinnedVersion;
})();

type Task = {
  id: string;
  taskType: string;
  input?: string;
  requiredSections?: string[];
  expectedFields?: Record<string, string>;
  candidateContent?: string;
};
const allTasks = (goldBank as { tasks: Task[] }).tasks;
const generationTasks = allTasks.filter((t) => t.taskType === 'generation' && t.input);
const extractionTasks = allTasks.filter((t) => t.taskType === 'extraction' && t.input && t.expectedFields);

/**
 * A perfect model: it covers every required section of a generation task, and
 * returns exactly the expected fields of an extraction task.
 *
 * Both halves matter. Once the extraction component became executable, a stub
 * that answered only generation prompts would have made every "perfect model"
 * case above fail on extraction instead — the tests would still pass their
 * generation assertions while quietly measuring a model that cannot extract.
 */
function coveringDraft(prompt: string): string {
  const ext = extractionTaskOf(prompt);
  if (ext) return JSON.stringify(ext.expectedFields);
  const gen = generationTasks.find((t) => prompt === buildGenerationPrompt(t as unknown as GoldDocTask));
  if (gen) return (gen.requiredSections ?? []).map((s) => `## ${s}\nContent drawn from the source material.`).join('\n\n');
  return '';
}

/**
 * The extraction task a prompt asks, by the exact prompt run-pq builds. Since
 * 2026-11-01 one real source passage can serve both a drafting task and an
 * extraction task (module-2-clinical, module-3-quality), so a prompt is told
 * apart by what it asks, never by the passage it contains.
 */
function extractionTaskOf(prompt: string): Task | undefined {
  return extractionTasks.find((t) => prompt === buildExtractionPrompt(t as unknown as GoldDocTask));
}

function stub(served: string | ((i: number) => string | undefined), content: (prompt: string) => string = coveringDraft) {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    gateway: {
      evaluateModel: async (modelId: string, req: { messages: Array<{ content: string }> }): Promise<GatewayResponse> => {
        calls.push(modelId);
        const prompt = req.messages[0].content;
        const n = i++;
        return {
          content: content(prompt),
          provider: 'anthropic', cached: false, deterministic: false, finishReason: 'stop',
          model: PINNED,
          resolvedModel: typeof served === 'function' ? served(n) : served,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
          latencyMs: 0, requestId: `fixture-${n}`,
        };
      },
    },
  };
}

/**
 * The protocol run-pq reads, redirected for the rag cases below.
 *
 * run-pq reads ./pq-protocol.json and nothing else: it takes no protocol path,
 * so no caller can hand it an approved copy and get a PASS record out of it.
 * These cases exercise protocol changes as DATA — an approved copy with rag
 * flipped — by answering that one readFileSync with the copy's text. Every
 * other read, and every read while `protocolText` is null, is the real file.
 * The real pq-protocol.json is never edited.
 */
const fsRedirect = vi.hoisted(() => ({ protocolText: null as string | null }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof NodeFs>();
  const readFileSync = ((file: unknown, ...rest: unknown[]) => {
    if (
      fsRedirect.protocolText !== null &&
      typeof file === 'string' &&
      file.replace(/\\/g, '/').endsWith('/server/eval/pq/pq-protocol.json')
    ) {
      return fsRedirect.protocolText;
    }
    return (real.readFileSync as (...a: unknown[]) => unknown)(file, ...rest);
  }) as typeof real.readFileSync;
  return { ...real, readFileSync, default: { ...real, readFileSync } };
});

const dirs: string[] = [];
afterEach(() => {
  fsRedirect.protocolText = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('qualification tenant admission', () => {
  it('reports canonical prerequisite blockers before any tenant bootstrap or provider call', async () => {
    preflightFixture.useActual = true;
    const s = stub(PINNED);
    const result = await runPq({ modelId: MODEL_ID, gateway: s.gateway });
    expect(result).toMatchObject({ verdict: 'INCOMPLETE', generation: [], extraction: [], recordPath: null,
      preflight: { readyToEvaluate: false, qualifiesModel: false } });
    // The protocol is approved (P-118). What blocks the run now is what it measures: a required component that cannot
    // be executed yet, and the retrieval bank.
    const codes = result.preflight?.blockers.map(blocker => blocker.code);
    expect(codes).toEqual(expect.arrayContaining(['REQUIRED_COMPONENT_UNAVAILABLE', 'RAG_SAMPLE_SHORTFALL', 'SOURCE_REVIEW_INCOMPLETE']));
    expect(codes).not.toContain('PROTOCOL_NOT_APPROVED');
    expect(s.calls).toEqual([]);
    expect(admission.resolve).not.toHaveBeenCalled();
  });
  it('refuses missing identity or an invalid live project binding before any provider call', async () => {
    const s = stub(PINNED);
    await expect(runScopedPq({ modelId: MODEL_ID, gateway: s.gateway })).rejects.toThrow(/organization UUID and programme/);
    expect(admission.resolve).not.toHaveBeenCalled();
    admission.verify.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_SCOPE_ERROR'));
    const error = await runPq({ modelId: MODEL_ID, gateway: s.gateway }).catch(e => e);
    expect(error.message).toContain('QUALIFICATION_SCOPE_UNAVAILABLE');
    expect(error.message).not.toContain('PRIVATE_DATABASE_SCOPE_ERROR');
    expect(s.calls).toEqual([]);
  });

  it('uses the same verified identity in RAG and records it alongside generation and extraction', async () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'pq-scoped-record-'));
    dirs.push(out);
    const result = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway, judgeModelId: 'gpt-4o', record: true, outDir: out });
    const expected = { organizationId: 7, organizationUuid: admission.organizationUuid, programId: admission.programId };
    expect(result.rag.scope).toEqual(expected);
    expect(result.rag.scopeVerified).toBe(true);
    expect(JSON.parse(readFileSync(result.recordPath!, 'utf8')).evaluationScope).toEqual(expected);
    expect(admission.resolve).toHaveBeenCalledOnce();
  });

  it('isolates two tenants through the real evaluation gateway, credential factory and placement path', async () => {
    const calls: Array<{ credentialOrg: number; tenant: string | undefined; uuid: string | null | undefined }> = [];
    const placementOrgs: number[] = [];
    vi.spyOn(providerClients, 'resolveTenantModelCredentialAvailability').mockResolvedValue({ mode: 'customer_owned', providers: ['anthropic'] });
    vi.spyOn(providerClients, 'createTenantProviderClient').mockImplementation(async (_provider, organizationId) => {
      calls.push({ credentialOrg: organizationId, tenant: getTenantScope()?.tenantId, uuid: getTenantScope()?.orgUuid });
      return { messages: { create: async (params: { model: string; messages: Array<{ content: string }> }) => ({
        model: params.model, content: [{ type: 'text', text: coveringDraft(params.messages[0].content) }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      }) } };
    });
    setOrgPlacementResolver({ resolve: async organizationId => {
      placementOrgs.push(Number(organizationId)); return { allowedProviders: ['anthropic'] };
    } });
    const gateway = new AIGateway({ providers: [], auditEnabled: false, deterministicMode: false,
      policy: { maxTokensPerRequest: 16000, maxRequestsPerMinutePerOrg: 10000, maxRequestsPerMinutePerUser: 10000,
        blockedPatterns: [], contentFilters: false, piiDetection: false } });
    try {
      const results = await Promise.all([
        runPq({ modelId: MODEL_ID, gateway }),
        runScopedPq({ modelId: MODEL_ID, gateway, organizationUuid: admission.otherOrganizationUuid, programId: admission.otherProgramId }),
      ]);
      expect(results.every(result => result.generation.every(row => row.servedModelVerified) && result.extraction.every(row => row.servedModelVerified))).toBe(true);
      expect(new Set(placementOrgs)).toEqual(new Set([7, 8]));
      expect(calls).toHaveLength(2 * (generationTasks.length + extractionTasks.length));
      expect(calls.every(call => call.tenant === String(call.credentialOrg) &&
        call.uuid === (call.credentialOrg === 7 ? admission.organizationUuid : admission.otherOrganizationUuid))).toBe(true);
    } finally { resetOrgPlacementResolver(); vi.restoreAllMocks(); }
  });
});

describe('run-pq live path', () => {
  it.each(['max_tokens', 'tool_use', 'unknown', 'aborted'])('generation and extraction never score a partial provider output: %s', async finishReason => {
    const s = stub(PINNED);
    const gateway = { evaluateModel: async (id: string, req: { messages: Array<{ content: string }> }) => ({ ...await s.gateway.evaluateModel(id, req), finishReason }) };
    const result = await runPq({ modelId: MODEL_ID, gateway });
    expect(result.verdict).toBe('NOT_EXECUTED');
    expect(result.generation.every(g => g.sectionCoverage === null && g.error && g.servedModel === PINNED)).toBe(true);
    expect(result.extraction.every(e => e.f1 === null && e.error && e.servedModel === PINNED)).toBe(true);
  });
  it('raw provider errors are sanitized in drafting records and console findings', async () => {
    const gateway = { evaluateModel: async () => { throw new Error('PRIVATE_API_KEY_123'); } };
    const result = await runPq({ modelId: MODEL_ID, gateway });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_API_KEY_123');
    expect(result.verdict).toBe('NOT_EXECUTED');
  });
  it('sends every task to exactly the model under qualification', async () => {
    const s = stub(PINNED);
    await runPq({ modelId: MODEL_ID, gateway: s.gateway });
    // Generation AND extraction: both components ask the pinned model directly.
    expect(s.calls.length).toBe(generationTasks.length + extractionTasks.length);
    expect(new Set(s.calls)).toEqual(new Set([MODEL_ID]));
  });

  it('scores the model output — never the captured candidate stored in the gold bank', async () => {
    // Some runnable tasks carry a captured candidate with full coverage. (Most
    // no longer do: the tasks added to reach the protocol's sample floor carry
    // none, because no output had been captured for them.) A model that answers
    // with nothing must score zero on EVERY task — including the ones whose
    // captured text would have scored full marks, which is what proves the
    // captured text is ignored rather than merely absent.
    expect(generationTasks.some((t) => typeof t.candidateContent === 'string')).toBe(true);
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED, () => 'I cannot help with that.').gateway });
    for (const g of r.generation) expect(g.sectionCoverage, g.taskId).toBe(0);
  });

  it('a task answered by a different model is flagged, and the run cannot pass', async () => {
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub((i) => (i === 0 ? 'claude-opus-4-8' : PINNED)).gateway,
    });
    expect(r.generation[0].servedModelVerified).toBe(false);
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/claude-opus-4-8/);
  });

  it('a provider that does not say which model answered is not verified', async () => {
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(() => undefined).gateway });
    expect(r.generation.every((g) => !g.servedModelVerified)).toBe(true);
  });

  it('on the current protocol, approved (P-118), a perfect model is INCOMPLETE — and the reasons say why', async () => {
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway });
    expect(r.verdict).toBe('INCOMPLETE');
    const why = r.reasons.join(' ');
    // What still blocks a PASS: rag was not run here, and the CSR drafting
    // component the approved protocol requires cannot be executed yet.
    expect(why).toMatch(/rag/);
    expect(why).toMatch(/required component "csrDrafting" cannot be executed yet/);
    // Extraction used to be named here too, as a component that could not be
    // executed. It executes now and a perfect model passes it, so its absence
    // from the reasons is the evidence — the same shape as the sample-floor
    // check above.
    expect(why).not.toMatch(/extraction/);
  });

  it('the sample floor is no longer one of those reasons — the bank reaches it', async () => {
    // The bank sat at 1/1/2 generation tasks against a floor of 10, so every
    // run was INCOMPLETE for that reason alone. It now reaches the floor, and
    // this is the guard that it stays there: a run is expensive (a product
    // provider key, real tokens against every task) and must not be spent
    // discovering that someone trimmed the bank.
    // server/eval/pq/__tests__/gold-bank-floor.test.ts checks the same property
    // statically; this one proves the runner agrees.
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway });
    expect(r.reasons.join(' ')).not.toMatch(/floor of/);
  });
});

describe('run-pq live path', () => {
  it('the extraction component runs, and every task goes to the pinned model', async () => {
    // It could not run at all before: no extraction task carried an input, so
    // there was nothing to give a model, and the protocol recorded the
    // component as not executable.
    expect(extractionTasks.length).toBeGreaterThan(0);
    const s = stub(PINNED);
    const r = await runPq({ modelId: MODEL_ID, gateway: s.gateway });
    expect(r.extraction.length).toBe(extractionTasks.length);
    expect(s.calls.length).toBe(generationTasks.length + extractionTasks.length);
    expect(new Set(s.calls)).toEqual(new Set([MODEL_ID]));
    for (const e of r.extraction) expect(e.f1, e.taskId).toBe(1);
  });

  it('scores the model\'s extraction — never the captured candidateExtraction', async () => {
    // Two tasks ship a captured candidateExtraction that would score well. A
    // model that answers with an empty object must score zero on them.
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub(PINNED, (p) => (extractionTaskOf(p) ? '{}' : coveringDraft(p))).gateway,
    });
    for (const e of r.extraction) expect(e.f1, e.taskId).toBe(0);
    expect(r.verdict).toBe('FAIL');
    expect(r.reasons.join(' ')).toMatch(/mean extraction F1/);
  });

  it('an extraction task answered by a different model is flagged, and the run cannot pass', async () => {
    // Attribution matters as much here as for generation: a fallback model's
    // extraction score must not count toward qualifying the pinned one.
    const genCount = generationTasks.length;
    const r = await runPq({
      modelId: MODEL_ID,
      // Every generation call is the pinned model; the first extraction call is not.
      gateway: stub((i) => (i === genCount ? 'claude-opus-4-8' : PINNED)).gateway,
    });
    expect(r.extraction[0].servedModelVerified).toBe(false);
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/extraction task\(s\) were answered by a model that is not the pinned version/);
  });

  it('a reply with no JSON is NOT EXECUTED, not a score of zero', async () => {
    // Scoring an unparseable reply as zero would be indistinguishable from a
    // model that extracted every field wrongly, and the second is a real
    // failure while the first is a harness problem.
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub(PINNED, (p) => (extractionTaskOf(p) ? 'I cannot help with that.' : coveringDraft(p))).gateway,
    });
    expect(r.extraction.every((e) => e.f1 === null && e.error)).toBe(true);
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/produced no scorable output|produced no output/);
  });

  it('reads JSON the model wrapped in a fenced block or prose', async () => {
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub(PINNED, (p) => {
        const t = extractionTaskOf(p);
        return t ? `Here are the fields:\n\n\u0060\u0060\u0060json\n${JSON.stringify(t.expectedFields)}\n\u0060\u0060\u0060\n` : coveringDraft(p);
      }).gateway,
    });
    for (const e of r.extraction) expect(e.f1, e.taskId).toBe(1);
  });

  it('an overclaim is a FAIL even on the draft protocol', async () => {
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub(PINNED, (p) => `${coveringDraft(p)}\nThis device is guaranteed to be cleared by FDA.`).gateway,
    });
    // Every runnable task in the bank forbids "guaranteed"; asserted so that
    // if the bank ever stops forbidding it, this case fails loudly instead of
    // quietly testing nothing.
    const runnable = (goldBank as { tasks: Array<{ taskType: string; input?: string; forbiddenPatterns?: string[] }> }).tasks
      .filter((t) => t.taskType === 'generation' && t.input);
    expect(runnable.every((t) => (t.forbiddenPatterns ?? []).includes('guaranteed'))).toBe(true);
    expect(r.verdict).toBe('FAIL');
    expect(r.reasons.join(' ')).toMatch(/forbidden \/ overclaim/);
  });

  it('the record carries its provenance and is what verifyPqClaim reads', async () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'pq-record-'));
    dirs.push(out);
    const r = await runPq({ modelId: MODEL_ID, record: true, outDir: out, gateway: stub(PINNED).gateway });
    const rec = JSON.parse(readFileSync(r.recordPath as string, 'utf8'));
    expect(rec).toMatchObject({
      kind: 'pq-record',
      protocolId: 'PQ-DRAFT-001',
      protocolStatus: 'approved',
      modelId: MODEL_ID,
      pinnedVersion: PINNED,
      verdict: 'INCOMPLETE',
    });
    expect(rec.protocolSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.goldBankSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.generation).toHaveLength(generationTasks.length);
  });

  it('an unknown model id is refused before anything runs', async () => {
    const s = stub('x');
    await expect(runPq({ modelId: 'not-in-the-registry', gateway: s.gateway })).rejects.toThrow(/not an entry/);
    expect(s.calls).toEqual([]);
  });
});

/**
 * The rag component in the runner (D4 evidence
 * docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, finding E6;
 * docs/evidence/D4/2026-09-28-pq-rag-fail-closed/code/).
 *
 * run-pq has no rag phase. Until one lands, the record has to SAY so, and an
 * executable rag has to come out INCOMPLETE — never PASS — or flipping
 * `components.rag.executable` would qualify a model on a component nothing ran.
 */
describe('run-pq rag component', () => {
  const REAL_PROTOCOL_PATH = path.resolve(__dirname, '..', 'pq-protocol.json');
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

  /** An approved copy of the real protocol, changed as the case needs. */
  function approvedCopy(mutate: (p: typeof protocolJson) => void): string {
    const p = JSON.parse(JSON.stringify(protocolJson)) as typeof protocolJson;
    p.status = 'approved';
    (p as { approvedBy: string | null }).approvedBy = 'System owner (test copy)';
    (p as { approvedOn: string | null }).approvedOn = '2026-09-28';
    // The CSR drafting component (P-118) cannot be executed yet; these cases are about rag.
    delete (p.components as Partial<typeof p.components>).csrDrafting;
    mutate(p);
    return `${JSON.stringify(p, null, 2)}\n`;
  }

  it('the record says rag was not run, and why', async () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'pq-record-'));
    dirs.push(out);
    const r = await runPq({ modelId: MODEL_ID, record: true, outDir: out, gateway: stub(PINNED).gateway });
    expect(r.rag).toMatchObject({ ran: false, itemsScored: 0 });
    expect(r.rag.items).toHaveLength(20);
    expect(r.rag.plannedItemIds).toHaveLength(20);
    expect(r.rag.notRunReason).toMatch(/tenant\/programme scope/);
    const rec = JSON.parse(readFileSync(r.recordPath as string, 'utf8'));
    expect(rec.rag).toEqual(r.rag);
  });

  it('control — the redirect works: an approved copy with rag not required lets a perfect model PASS', async () => {
    // The real protocol requires a component that cannot be executed yet and so
    // cannot PASS, so a PASS here proves the copy was what run-pq read — and that the stub is otherwise passing, so the
    // E6 case below is INCOMPLETE because of rag and nothing else.
    fsRedirect.protocolText = approvedCopy((p) => {
      p.components.rag.required = false;
    });
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway });
    expect(r.reasons).toEqual(['every required component executed and met approved criteria']);
    expect(r.verdict).toBe('PASS');
  });

  it('E6 — an approved copy with rag flipped executable: a perfect model is NOT a PASS; it is INCOMPLETE naming rag', async () => {
    fsRedirect.protocolText = approvedCopy((p) => {
      p.components.rag.executable = true;
    });
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway });
    // The fail-open, as it was: rag never ran, and the verdict said PASS.
    expect(r.verdict).not.toBe('PASS');
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/"rag".*not run.*tenant\/programme scope/);
  });

  it('a caller cannot hand run-pq another protocol: a protocolPath is ignored, and the record hashes the real file', async () => {
    // An injectable protocol path would let a programmatic caller write a
    // genuine-looking PASS record against an approved copy with rag not
    // required — a route to PASS with rag never run.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pq-protocol-'));
    dirs.push(dir);
    const copy = path.join(dir, 'pq-protocol.json');
    writeFileSync(copy, approvedCopy((p) => {
      p.components.rag.required = false;
    }));
    const out = mkdtempSync(path.join(os.tmpdir(), 'pq-record-'));
    dirs.push(out);
    const r = await runPq({
      modelId: MODEL_ID,
      record: true,
      outDir: out,
      gateway: stub(PINNED).gateway,
      protocolPath: copy,
    } as RunPqOptions);
    expect(r.verdict).not.toBe('PASS');
    const rec = JSON.parse(readFileSync(r.recordPath as string, 'utf8'));
    // The copy handed in would PASS (see the control above). The real file cannot, and the record is of the real file.
    expect(r.reasons.join(' ')).toMatch(/required component "csrDrafting" cannot be executed yet/);
    expect(rec.protocolSha256).toBe(sha256(readFileSync(REAL_PROTOCOL_PATH, 'utf8')));
  });
});
