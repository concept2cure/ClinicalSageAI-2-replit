/**
 * Every route to every PQ verdict, and the check that a registry entry's PQ
 * claim is backed by a real record. No model is called: the verdict is pure,
 * so each rule can be seen to fire on the case it exists for.
 */
import { describe, expect, it } from 'vitest';
import {
  computeVerdict,
  servedModelMatches,
  verifyPqClaim,
  type PqGenerationResult,
  type PqProtocol,
  type PqRecord,
} from '../pq-verdict';

function protocol(over: Partial<PqProtocol> = {}): PqProtocol {
  return {
    protocolId: 'PQ-TEST',
    version: '1.0.0',
    status: 'approved',
    approvedBy: 'System owner',
    approvedOn: '2026-09-23',
    components: {
      generation: {
        required: true,
        executable: true,
        criteria: { minSectionCoverage: 0.85, maxForbiddenHits: 0, minTasksPerDocType: 2 },
        criteriaSource: 'test',
      },
    },
    ...over,
  };
}

function task(id: string, over: Partial<PqGenerationResult> = {}): PqGenerationResult {
  return {
    taskId: id,
    docType: 'ind',
    servedModel: 'claude-opus-5',
    servedModelVerified: true,
    sectionCoverage: 0.95,
    forbiddenHits: 0,
    ...over,
  };
}

describe('computeVerdict', () => {
  it('control — approved protocol, enough tasks, every criterion met, every task on the pinned model → PASS', () => {
    expect(computeVerdict(protocol(), [task('a'), task('b')]).verdict).toBe('PASS');
  });

  it('nothing scorable → NOT_EXECUTED, never a pass', () => {
    const r = computeVerdict(protocol(), [task('a', { error: 'no provider', sectionCoverage: null, forbiddenHits: null })]);
    expect(r.verdict).toBe('NOT_EXECUTED');
  });

  it('an empty run → NOT_EXECUTED', () => {
    expect(computeVerdict(protocol(), []).verdict).toBe('NOT_EXECUTED');
  });

  it('a required component that cannot run → INCOMPLETE', () => {
    const p = protocol();
    p.components.rag = { required: true, executable: false, notExecutableReason: 'no corpus', criteria: {}, criteriaSource: 'x' };
    const r = computeVerdict(p, [task('a'), task('b')]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/rag.*no corpus/);
  });

  it('fewer tasks than the sample floor → INCOMPLETE', () => {
    const r = computeVerdict(protocol(), [task('a')]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/floor of 2/);
  });

  it('a task answered by a different model → INCOMPLETE, and it does not count toward the scores', () => {
    const r = computeVerdict(protocol(), [task('a'), task('b', { servedModel: 'claude-opus-4-8', servedModelVerified: false })]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/b=claude-opus-4-8/);
  });

  it('a task that errored → INCOMPLETE, even if the rest pass', () => {
    const r = computeVerdict(protocol(), [task('a'), task('b'), task('c', { error: 'timeout', sectionCoverage: null, forbiddenHits: null })]);
    expect(r.verdict).toBe('INCOMPLETE');
  });

  it('coverage below the criterion → FAIL', () => {
    const r = computeVerdict(protocol(), [task('a', { sectionCoverage: 0.5 }), task('b', { sectionCoverage: 0.6 })]);
    expect(r.verdict).toBe('FAIL');
  });

  it('a single overclaim phrase → FAIL', () => {
    const r = computeVerdict(protocol(), [task('a'), task('b', { forbiddenHits: 1 })]);
    expect(r.verdict).toBe('FAIL');
  });

  it('criteria met against a DRAFT protocol → INCOMPLETE, never PASS', () => {
    const r = computeVerdict(protocol({ status: 'draft', approvedBy: null, approvedOn: null }), [task('a'), task('b')]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons[0]).toMatch(/not a PQ/);
  });

  it('"approved" with no approver named → INCOMPLETE', () => {
    expect(computeVerdict(protocol({ approvedBy: null }), [task('a'), task('b')]).verdict).toBe('INCOMPLETE');
  });

  it('a failure under a draft protocol is still reported as FAIL, not hidden as pending', () => {
    const r = computeVerdict(protocol({ status: 'draft', approvedBy: null, approvedOn: null }), [task('a', { forbiddenHits: 2 }), task('b')]);
    expect(r.verdict).toBe('FAIL');
  });
});

describe('servedModelMatches', () => {
  it('the exact pinned version matches', () => {
    expect(servedModelMatches('claude-opus-5', 'claude-opus-5')).toBe(true);
  });
  it('a dated snapshot of the pinned version matches', () => {
    expect(servedModelMatches('gpt-4o-2024-08-06', 'gpt-4o')).toBe(true);
    expect(servedModelMatches('claude-haiku-4-5-20251001', 'claude-haiku-4-5')).toBe(true);
  });
  it('a different model sharing a prefix does NOT match — gpt-4o-mini is not gpt-4o', () => {
    expect(servedModelMatches('gpt-4o-mini', 'gpt-4o')).toBe(false);
    expect(servedModelMatches('gpt-4o-mini-2024-07-18', 'gpt-4o')).toBe(false);
  });
  it('the previous generation does not match — Opus 4.8 is not Opus 5', () => {
    expect(servedModelMatches('claude-opus-4-8', 'claude-opus-5')).toBe(false);
  });
  it('an unreported model does not match', () => {
    expect(servedModelMatches(null, 'claude-opus-5')).toBe(false);
    expect(servedModelMatches(undefined, 'claude-opus-5')).toBe(false);
  });
});

describe('verifyPqClaim', () => {
  const good: PqRecord = {
    kind: 'pq-record',
    protocolId: 'PQ-DRAFT-001',
    protocolVersion: '1.0.0',
    protocolStatus: 'approved',
    protocolSha256: 'x',
    modelId: 'claude-opus-4',
    pinnedVersion: 'claude-opus-5',
    provider: 'anthropic',
    goldBankVersion: '1',
    goldBankSha256: 'y',
    gitSha: 'z',
    startedAt: '2026-09-23T00:00:00Z',
    finishedAt: '2026-09-23T00:01:00Z',
    generation: [],
    verdict: 'PASS',
    reasons: [],
  };
  const entry = { id: 'claude-opus-4', pinnedVersion: 'claude-opus-5', pq: { status: 'passed' as const, reference: 'r.json' } };
  const reader = (rec: unknown) => () => rec;

  it('control — a passed claim citing a PASS record for this id and version, on an approved protocol', () => {
    expect(verifyPqClaim(entry, reader(good))).toEqual([]);
  });
  it('control — pending with no reference', () => {
    expect(verifyPqClaim({ ...entry, pq: { status: 'pending', reference: null } }, reader(good))).toEqual([]);
  });
  it('passed with nothing to point at', () => {
    expect(verifyPqClaim({ ...entry, pq: { status: 'passed', reference: null } }, reader(good))).not.toEqual([]);
  });
  it('a reference that cannot be read', () => {
    const r = verifyPqClaim(entry, () => {
      throw new Error('ENOENT');
    });
    expect(r.join(' ')).toMatch(/cannot read/);
  });
  it('a record for a different model', () => {
    expect(verifyPqClaim(entry, reader({ ...good, modelId: 'gpt-4o' })).join(' ')).toMatch(/record is for "gpt-4o"/);
  });
  it('the registry bumped the pinned version after the PQ — the claim no longer holds', () => {
    expect(verifyPqClaim(entry, reader({ ...good, pinnedVersion: 'claude-opus-4-8' })).join(' ')).toMatch(/re-qualification is owed/);
  });
  it('a record that says INCOMPLETE cannot support "passed"', () => {
    expect(verifyPqClaim(entry, reader({ ...good, verdict: 'INCOMPLETE' })).join(' ')).toMatch(/says INCOMPLETE/);
  });
  it('a PASS against a draft protocol cannot support "passed"', () => {
    expect(verifyPqClaim(entry, reader({ ...good, protocolStatus: 'draft' })).join(' ')).toMatch(/draft protocol/);
  });
  it('a file that is not a PQ record', () => {
    expect(verifyPqClaim(entry, reader({ verdict: 'PASS' })).join(' ')).toMatch(/not a PQ record/);
  });
});
