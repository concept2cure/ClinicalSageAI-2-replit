/**
 * A verification agent's verdict comes only from deterministic checks, and
 * "nothing was checked" is never "clean" (row 74, S5; ADR-0015 §7).
 *
 * The readers are pinned to the real handlers' JSON: each case below runs the
 * registered handler and reads what it actually returned, so a renamed key in
 * a handler turns this red instead of turning every reading into a pass or an
 * error unnoticed. Forged inputs cover what a handler cannot be made to send
 * today but a reader must still refuse.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('../../../db.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async (n: number) => dbState.rows.slice(0, n),
  };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import {
  HARNESS_CHECKS,
  agentTraceStatus,
  aggregateVerdict,
  dossierCheckSkipped,
  readDossierCheck,
  readGroundingCheck,
  readIntegrityCheck,
  type CheckReading,
} from '../sub-agent-result';

const CTX = { organizationId: 7, userId: 3 } as never;
async function run(tool: string, input: Record<string, unknown>): Promise<string> {
  const { getToolHandler } = await import('../AnaToolExecutor');
  return getToolHandler(tool)!(input, CTX);
}
const PAD = ' The analysis followed the prespecified statistical analysis plan for the study.';
const artifact = (id: number, content: string) => ({ id, artifactId: `a-${id}`, title: `Doc ${id}`, content, ctdSection: null, status: 'draft' });

beforeEach(() => {
  dbState.rows = [];
});

describe('check_grounding reader (real handler output)', () => {
  it('never passes: every claim marked is still see_result, sources unopened', async () => {
    const r = readGroundingCheck(await run('check_grounding', { text: 'Response was 42% in the treated arm [1].' }));
    expect(r.outcome).toBe('see_result');
    expect(r.statement).toMatch(/^Citation markers: .*not opened/);
  });
  it('an unmarked figure fails (ungroundedClaims is an array, not a count)', async () => {
    const r = readGroundingCheck(await run('check_grounding', { text: 'Response was 42% in the treated arm.' }));
    expect(r.outcome).toBe('fail');
    expect(r.statement).toBe('Citation markers: 1 of 1 quantitative claims carry no citation marker.');
  });
  it('no quantitative claim is not assessed', async () => {
    const r = readGroundingCheck(await run('check_grounding', { text: 'The protocol describes the design.' }));
    expect(r.outcome).toBe('not_assessed');
  });
  it('a handler error is an error', async () => {
    expect(readGroundingCheck(await run('check_grounding', { text: '  ' })).outcome).toBe('error');
  });
  it('forged: claims counted but no claim list is an error, not a pass', () => {
    expect(readGroundingCheck(JSON.stringify({ totalClaims: 3, ungroundedClaims: 0 })).outcome).toBe('error');
    expect(readGroundingCheck('not json').outcome).toBe('error');
  });
});

describe('check_numerical_integrity reader (real handler output)', () => {
  const read = async (content: string) => readIntegrityCheck(await run('check_numerical_integrity', { content }));
  it('every figure stated once is not assessed, though the handler says clean', async () => {
    const raw = JSON.parse(await run('check_numerical_integrity', { content: 'Patients ages 18 to 65 years were enrolled.' + PAD }));
    expect(raw.verdict).toBe('clean');
    expect((await read('Patients ages 18 to 65 years were enrolled.' + PAD)).outcome).toBe('not_assessed');
  });
  it('a figure stated twice with one value passes', async () => {
    const r = await read('Patients ages 18 to 65 years were enrolled. The synopsis says ages 18 to 65 years.');
    expect(r.outcome).toBe('pass');
    expect(r.statement).toBe('Internal consistency: 1 labelled figure is stated more than once; none has two different values.');
  });
  it('a figure stated twice with two values needs a reader', async () => {
    expect((await read('Patients ages 18 to 65 years were enrolled. The synopsis says ages 18 to 75 years.')).outcome).toBe('see_result');
  });
  it('no labelled figure is not assessed', async () => {
    expect((await read('Only words about the design and its rationale.')).outcome).toBe('not_assessed');
  });
  it('forged: clean with no labelsCompared, or an unknown verdict, is never a pass', () => {
    expect(readIntegrityCheck(JSON.stringify({ verdict: 'clean', factsExtracted: 4 })).outcome).toBe('not_assessed');
    expect(readIntegrityCheck(JSON.stringify({ verdict: 'fine', factsExtracted: 4, labelsCompared: 2 })).outcome).toBe('error');
    expect(readIntegrityCheck(JSON.stringify({ verdict: 'likely_inconsistency' })).outcome).toBe('fail');
  });
});

describe('check_dossier_consistency reader (real handler output)', () => {
  const read = async (draft: string) =>
    readDossierCheck(await run('check_dossier_consistency', { draft_content: draft, project_id: 12 }));
  const DRAFT = 'The safety population was n=305 patients who received at least one dose.' + PAD;

  it('a matching figure in another document passes, in the handler\'s own words', async () => {
    dbState.rows = [artifact(1, 'The safety population was n=305 patients who received at least one dose.' + PAD)];
    const r = await read(DRAFT);
    expect(r.outcome).toBe('pass');
    expect(r.statement).toBe('Project records: No consistency issues detected against the documents compared.');
  });
  it('no other documents is not assessed, though the handler says clean', async () => {
    const raw = JSON.parse(await run('check_dossier_consistency', { draft_content: DRAFT, project_id: 12 }));
    expect(raw.verdict).toBe('clean');
    expect((await read(DRAFT)).outcome).toBe('not_assessed');
  });
  it('a short draft is not assessed (notCompared), not an error', async () => {
    expect((await read('n=305')).outcome).toBe('not_assessed');
  });
  it('a differing figure in another document is not a pass', async () => {
    dbState.rows = [artifact(1, 'The safety population was n=290 patients who received at least one dose.' + PAD)];
    expect(['fail', 'see_result']).toContain((await read(DRAFT)).outcome);
  });
  it('forged: blocker and needs_review fail, minor_issues needs a reader', () => {
    const at = (verdict: string) => readDossierCheck(JSON.stringify({ verdict, artifactsCompared: 2, draftFactsExtracted: 3, recommendation: 'x' })).outcome;
    expect(at('blocker')).toBe('fail');
    expect(at('needs_review')).toBe('fail');
    expect(at('minor_issues')).toBe('see_result');
    expect(at('not_assessed')).toBe('not_assessed');
    expect(at('looks_fine')).toBe('error');
  });
  it('forged: clean with no draft figures, or over a truncated set, is not a pass', () => {
    const clean = (extra: object) => readDossierCheck(JSON.stringify({ verdict: 'clean', recommendation: 'x', ...extra })).outcome;
    expect(clean({ artifactsCompared: 3, draftFactsExtracted: 0 })).toBe('not_assessed');
    expect(clean({ artifactsCompared: 3, draftFactsExtracted: 2, truncated: true })).toBe('see_result');
    expect(clean({ artifactsCompared: 3 })).toBe('error');
    expect(readDossierCheck(JSON.stringify({ verdict: 7 })).outcome).toBe('error');
  });
  it('a failed read is an error', () => {
    expect(readDossierCheck(JSON.stringify({ error: 'unreadable', unavailable: true })).outcome).toBe('error');
  });
  it('a skipped check says why, and is not assessed', () => {
    expect(dossierCheckSkipped(true).statement).toMatch(/no numeric project id/);
    expect(dossierCheckSkipped(false).statement).toMatch(/No project is open/);
    expect(dossierCheckSkipped(true).outcome).toBe('not_assessed');
  });
});

describe('aggregateVerdict', () => {
  const r = (...outcomes: CheckReading['outcome'][]) =>
    aggregateVerdict(outcomes.map(outcome => ({ check: 'check_grounding', outcome, statement: '' })));
  it('any fail is issues_found', () => expect(r('pass', 'error', 'fail')).toBe('issues_found'));
  it('an error or a result needing a reader is inconclusive', () => {
    expect(r('pass', 'error')).toBe('inconclusive');
    expect(r('pass', 'see_result', 'not_assessed')).toBe('inconclusive');
  });
  it('a pass with nothing worse is no_issues_found', () => expect(r('pass', 'not_assessed')).toBe('no_issues_found'));
  it('nothing compared is nothing_checkable, never clean', () => {
    expect(r('not_assessed', 'not_assessed', 'not_assessed')).toBe('nothing_checkable');
    expect(r()).toBe('nothing_checkable');
  });
});

describe('agentTraceStatus', () => {
  it('keeps every mechanical status but success', () => {
    expect(agentTraceStatus('cancelled', JSON.stringify({ cancelled: true }))).toBe('cancelled');
    expect(agentTraceStatus('error', '{}')).toBe('error');
    expect(agentTraceStatus('not_found', '{}')).toBe('not_found');
  });
  it('a completed agent succeeded whatever its verdict', () => {
    expect(agentTraceStatus('success', JSON.stringify({ status: 'completed', verdict: 'inconclusive' }))).toBe('success');
  });
  it('a budget stop is incomplete; a refusal is an error; a cancelled child is cancelled', () => {
    expect(agentTraceStatus('success', JSON.stringify({ status: 'incomplete' }))).toBe('incomplete');
    expect(agentTraceStatus('success', JSON.stringify({ error: 'AGENT_FAILED' }))).toBe('error');
    expect(agentTraceStatus('success', JSON.stringify({ status: 'cancelled' }))).toBe('cancelled');
  });
  it('an unreadable or unknown result is never success', () => {
    expect(agentTraceStatus('success', 'nope')).toBe('incomplete');
    expect(agentTraceStatus('success', JSON.stringify({ status: 'done' }))).toBe('incomplete');
  });
});

describe('HARNESS_CHECKS', () => {
  it('each is a registered tool', async () => {
    const { getToolHandler } = await import('../AnaToolExecutor');
    for (const name of HARNESS_CHECKS) expect(getToolHandler(name), name).toBeTypeOf('function');
  });
});
