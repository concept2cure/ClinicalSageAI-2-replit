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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAgentBrief } from '../sub-agent-limits';
import { createHash } from 'node:crypto';
import { draftSourceIdentityForText } from '../draft-source-identity';
import type { DraftSource } from '../draft-project-sources';
import { syntheticCurrentPolicyClient } from './support/source-read-tool-fixture';

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

const sourceId = '10000000-0000-4000-8000-000000000001';
const enrollment = 'In Study DPL-301, a total of 300 patients were randomized.';
function storedSource(text = enrollment, extra: Partial<DraftSource> = {}): DraftSource {
  const span = { start: 0, end: text.length, totalChars: text.length };
  return { ...draftSourceIdentityForText(text, span), documentId: sourceId, programId: '20000000-0000-4000-8000-000000000002',
    contentHash: createHash('sha256').update(`stored:${text}`).digest('hex'), text, span, title: 'Recorded study',
    extractionMethod: 'pdf-text', extractionConfidence: null, originalFileAvailable: true, disposition: null,
    sourceAvailability: 'available', completeText: true, sensitivityTier: 2, ...extra };
}
describe('bounded independent clinical-claim comparison', () => {
  it('rejects a wrong framed number despite a correct source quotation and citation marker', () => {
    const source = storedSource(`${enrollment} The protocol defined the analysis.`);
    const result = compareStoredSourceClaims('In Study DPL-301, a total of 999 patients were randomized [1]. The source states "The protocol defined the analysis."', [source]);
    expect(result.reading.outcome).toBe('fail');
    expect(result.output.findings).toContainEqual(expect.objectContaining({ disposition: 'rejected', reason: 'NUMERIC_SOURCE_CONTRADICTION' }));
    expect(result.output).toMatchObject({ method: SOURCE_CLAIM_METHOD, qualification: 'general_prose_unverified', sources: [{ documentId: sourceId, contentHash: source.contentHash, referenceSchemaVersion: 2, extractedTextSha256: source.extractedTextSha256, spanSha256: source.spanSha256 }] });
  });
  it('rejects an arm-swapped comparison through the canonical clinical frames', () => {
    const draft = 'In the safety population of Study DX-301, serious adverse events were reported in 3.3% of Drug X patients and 4.6% of placebo patients.';
    const source = storedSource('In the safety population of Study DX-301, serious adverse events were reported in 4.6% of Drug X patients and 3.3% of placebo patients.');
    expect(compareStoredSourceClaims(draft, [source]).reading.outcome).toBe('fail');
  });
  it('rejects the existing explicit-zero denial form against a nonzero recorded count', () => {
    const text = 'In the safety population of Study DX-301, serious adverse events were reported in 14 (4.6%) Drug X-treated patients and 10 (3.3%) placebo-treated patients.';
    const draft = 'In the safety population of Study DX-301, serious adverse events were reported in 14 (4.6%) Drug X-treated patients and in no placebo-treated patients.';
    expect(compareStoredSourceClaims(draft, [storedSource(text)]).reading.outcome).toBe('fail');
  });
  it('does not promote matching numbers or generic prose to semantic verification', () => {
    for (const draft of [enrollment, 'The trial was successful and did not demonstrate a safety concern.']) {
      const result = compareStoredSourceClaims(draft, [storedSource()]);
      expect(result.reading.outcome).toBe('see_result'); expect(result.output.qualification).toBe('general_prose_unverified');
    }
  });
  it('rejects unsupported complete clinical claims only over complete non-OCR selected sources', () => {
    const draft = 'In the safety population of Study DPL-301, serious adverse events were reported in 4.6% of Drug X patients and 3.3% of placebo patients.';
    expect(compareStoredSourceClaims(draft, [storedSource()]).reading.outcome).toBe('fail');
    for (const extra of [{ completeText: false }, { extractionMethod: 'pdf-ocr' }]) {
      const result = compareStoredSourceClaims(draft, [storedSource(enrollment, extra)]);
      expect(result.reading.outcome).toBe('see_result'); expect(result.output.findings.every(f => f.disposition === 'unverified')).toBe(true);
    }
  });
  it.each([[], ['not-a-uuid'], Array(9).fill(sourceId), 'source prose', [sourceId, null]])('refuses invalid Vault source selection: %j', ids => {
    expect(parseAgentBrief({ role: 'verify', objective: 'Check figures', instructions: 'Read the recorded source', text_to_check: enrollment, source_document_ids: ids })).toMatchObject({ error: 'INVALID_AGENT_BRIEF' });
  });
  it('pins and deduplicates version IDs and refuses source-check input on a research role', () => {
    const input = { role: 'verify', objective: 'Check figures', instructions: 'Read the recorded source', text_to_check: enrollment, source_document_ids: [sourceId, sourceId] };
    expect(parseAgentBrief(input)).toMatchObject({ sourceDocumentIds: [sourceId] });
    expect(parseAgentBrief({ ...input, role: 'research' })).toMatchObject({ error: 'INVALID_AGENT_BRIEF' });
  });
});

import {
  HARNESS_CHECKS,
  agentResultSummary,
  agentTraceStatus,
  aggregateVerdict,
  compareStoredSourceClaims,
  SOURCE_CLAIM_METHOD,
  dossierCheckSkipped,
  readDossierCheck,
  readGroundingCheck,
  readIntegrityCheck,
  type CheckReading,
} from '../sub-agent-result';

const CTX = { organizationId: 7, userId: 3, sqlClient: syntheticCurrentPolicyClient } as never;
async function run(tool: string, input: Record<string, unknown>): Promise<string> {
  const { getToolHandler } = await import('../AnaToolExecutor');
  return getToolHandler(tool)!(input, CTX);
}
const PAD = ' The analysis followed the prespecified statistical analysis plan for the study.';
const artifact = (id: number, content: string) => ({ id, artifactId: `a-${id}`, title: `Doc ${id}`, content, ctdSection: null, status: 'draft' });

/* The first getToolHandler pulls in the whole executor (21k lines and its
   transitive modules), which takes about 10 s on a 4-CPU box — right on the
   default per-test timeout, so whichever case ran first failed under load.
   Paid once here, and attributed to what actually costs it. */
beforeAll(async () => {
  await import('../AnaToolExecutor');
}, 120_000);

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

/**
 * What an agent's one-line summary says (review 2026-10-11). It is the line the
 * person's row carries and the line the NEXT turn's context carries, so a word
 * that overstates or understates is read twice.
 */
describe('agentResultSummary', () => {
  const summary = (r: object) => agentResultSummary(JSON.stringify(r));
  const agent = { runId: 'a', role: 'research', objective: 'trials' };

  it('a failure after the agent had started says it did not finish, not that it never ran', () => {
    expect(summary({ error: 'AGENT_FAILED', code: 'ERROR', started: true, agent })).toBe('agent: did not finish (AGENT_FAILED, ERROR)');
  });
  it('a refusal before anything started says it did not run', () => {
    expect(summary({ error: 'AGENT_LIMIT_REACHED', agent })).toBe('agent: did not run (AGENT_LIMIT_REACHED)');
  });
  it('a stop with no budget names what stopped it', () => {
    expect(summary({ agent, status: 'incomplete', stoppedReason: 'duplicate_thrash' })).toBe(
      'agent: incomplete (a step it kept repeating)',
    );
  });
  it('a budget stop names the budget', () => {
    expect(summary({ agent, status: 'incomplete', budget: 'tokens' })).toBe('agent: incomplete (token budget)');
  });
  it("a verify verdict says how many checks compared anything, so a bare verdict cannot overstate", () => {
    const checks = [
      { check: 'check_grounding', outcome: 'see_result', statement: '' },
      { check: 'check_numerical_integrity', outcome: 'pass', statement: '' },
      { check: 'check_dossier_consistency', outcome: 'not_assessed', statement: '' },
    ];
    expect(summary({ agent: { ...agent, role: 'verify' }, status: 'completed', verdict: 'no_issues_found', checks })).toBe(
      'verification agent: completed, no_issues_found (2 of 3 checks compared anything)',
    );
  });
});


describe('source span reference bounds', () => {
  const span = { artifact_id: 'source-1', source_start: 7, source_end: 23, draft_start: 0, draft_end: 16 };
  it.each([
    [],
    [{ ...span, source_start: -1 }],
    [{ ...span, source_end: 30_001 }],
    [{ ...span, source_start: 7.5 }],
    [{ ...span, draft_end: 17 }],
    Array.from({ length: 9 }, () => span),
  ].map(refs => ({ refs })))('refuses malformed or unbounded source references before starting: %j', ({ refs }) => {
    expect(parseAgentBrief({ role: 'verify', objective: 'Check quote', instructions: 'Compare exact source spans.', text_to_check: 'Response was 42%.', source_spans: refs })).toMatchObject({ error: 'INVALID_AGENT_BRIEF' });
  });
});
