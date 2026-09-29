/**
 * The PQ runner's live path, driven with a stubbed provider.
 *
 * The keyless run proves the runner refuses when nothing can answer. These
 * prove what it records when something does: the model the provider REPORTS
 * serving, never a captured candidate, and a record that carries its own
 * provenance. `evaluateModel` is the only thing replaced.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runPq } from '../run-pq';
import goldBank from '../../doc-quality/gold-tasks.json';
import { APPROVED_MODELS } from '../../../services/ai-governance/approved-models';

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
  const gen = generationTasks.find((t) => t.input && prompt.includes(t.input));
  if (gen) return (gen.requiredSections ?? []).map((s) => `## ${s}\nContent drawn from the source material.`).join('\n\n');
  const ext = extractionTasks.find((t) => t.input && prompt.includes(t.input));
  if (ext) return JSON.stringify(ext.expectedFields);
  return '';
}

function stub(served: string | ((i: number) => string | undefined), content: (prompt: string) => string = coveringDraft) {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    gateway: {
      evaluateModel: async (modelId: string, req: { messages: Array<{ content: string }> }) => {
        calls.push(modelId);
        const prompt = req.messages[0].content;
        const n = i++;
        return {
          content: content(prompt),
          provider: 'anthropic',
          model: PINNED,
          resolvedModel: typeof served === 'function' ? served(n) : served,
        } as never;
      },
    },
  };
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('run-pq live path', () => {
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

  it('on the current draft protocol, a perfect model is INCOMPLETE — and the reasons say why', async () => {
    const r = await runPq({ modelId: MODEL_ID, gateway: stub(PINNED).gateway });
    expect(r.verdict).toBe('INCOMPLETE');
    const why = r.reasons.join(' ');
    // What still blocks a PASS: rag cannot execute (ragQuery cannot pin a
    // model), and the protocol is a draft nobody has approved.
    expect(why).toMatch(/rag/);
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
      gateway: stub(PINNED, (p) => (extractionTasks.some((t) => t.input && p.includes(t.input)) ? '{}' : coveringDraft(p))).gateway,
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
      gateway: stub(PINNED, (p) => (extractionTasks.some((t) => t.input && p.includes(t.input)) ? 'I cannot help with that.' : coveringDraft(p))).gateway,
    });
    expect(r.extraction.every((e) => e.f1 === null && e.error)).toBe(true);
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/produced no scorable output|produced no output/);
  });

  it('reads JSON the model wrapped in a fenced block or prose', async () => {
    const r = await runPq({
      modelId: MODEL_ID,
      gateway: stub(PINNED, (p) => {
        const t = extractionTasks.find((x) => x.input && p.includes(x.input));
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
      protocolStatus: 'draft',
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
