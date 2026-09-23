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

type Task = { id: string; taskType: string; input?: string; requiredSections?: string[]; candidateContent?: string };
const generationTasks = (goldBank as { tasks: Task[] }).tasks.filter((t) => t.taskType === 'generation' && t.input);

/** A draft that covers every required section of whichever task it is asked about. */
function coveringDraft(prompt: string): string {
  const task = generationTasks.find((t) => t.input && prompt.includes(t.input));
  return (task?.requiredSections ?? []).map((s) => `## ${s}\nContent drawn from the source material.`).join('\n\n');
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
          model: 'claude-opus-5',
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
    const s = stub('claude-opus-5');
    await runPq({ modelId: 'claude-opus-4', gateway: s.gateway });
    expect(s.calls.length).toBe(generationTasks.length);
    expect(new Set(s.calls)).toEqual(new Set(['claude-opus-4']));
  });

  it('scores the model output — never the captured candidate stored in the gold bank', async () => {
    // Every runnable task in the seed bank carries a captured candidate with
    // full coverage. A model that answers with nothing must score zero, which it
    // can only do if the captured text is ignored.
    expect(generationTasks.every((t) => typeof t.candidateContent === 'string')).toBe(true);
    const r = await runPq({ modelId: 'claude-opus-4', gateway: stub('claude-opus-5', () => 'I cannot help with that.').gateway });
    for (const g of r.generation) expect(g.sectionCoverage, g.taskId).toBe(0);
  });

  it('a task answered by a different model is flagged, and the run cannot pass', async () => {
    const r = await runPq({
      modelId: 'claude-opus-4',
      gateway: stub((i) => (i === 0 ? 'claude-opus-4-8' : 'claude-opus-5')).gateway,
    });
    expect(r.generation[0].servedModelVerified).toBe(false);
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/claude-opus-4-8/);
  });

  it('a provider that does not say which model answered is not verified', async () => {
    const r = await runPq({ modelId: 'claude-opus-4', gateway: stub(() => undefined).gateway });
    expect(r.generation.every((g) => !g.servedModelVerified)).toBe(true);
  });

  it('on the current draft protocol and seed bank, a perfect model is INCOMPLETE — and the reasons say why', async () => {
    const r = await runPq({ modelId: 'claude-opus-4', gateway: stub('claude-opus-5').gateway });
    expect(r.verdict).toBe('INCOMPLETE');
    const why = r.reasons.join(' ');
    expect(why).toMatch(/extraction/);
    expect(why).toMatch(/rag/);
    expect(why).toMatch(/floor of 10/);
  });

  it('an overclaim is a FAIL even on the draft protocol', async () => {
    const r = await runPq({
      modelId: 'claude-opus-4',
      gateway: stub('claude-opus-5', (p) => `${coveringDraft(p)}\nThis device is guaranteed to be cleared by FDA.`).gateway,
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
    const r = await runPq({ modelId: 'claude-opus-4', record: true, outDir: out, gateway: stub('claude-opus-5').gateway });
    const rec = JSON.parse(readFileSync(r.recordPath as string, 'utf8'));
    expect(rec).toMatchObject({
      kind: 'pq-record',
      protocolId: 'PQ-DRAFT-001',
      protocolStatus: 'draft',
      modelId: 'claude-opus-4',
      pinnedVersion: 'claude-opus-5',
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
