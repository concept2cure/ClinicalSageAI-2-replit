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
  type PqExtractionResult,
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

describe('an extraction criterion that cannot be applied is not a criterion', () => {
  /* FOUNDER DECISION P-31 (2026-10-13). The rag component reports every
     criterion it cannot apply — a missing minimum, a misspelt key — because
     "a criterion that cannot be applied is INCOMPLETE, never met"
     (ragCriteriaProblems). Extraction never got the same treatment: it reads
     `ext.criteria.minF1` and applies it only `if (typeof minF1 === 'number')`,
     so a protocol whose extraction minimum is missing, misspelt or a string
     has NO extraction criterion at all — and the component contributes
     nothing to `missed`, so the PQ PASSes on it. Same fail-open shape, same
     answer: say so rather than skip in silence. */
  const withExtraction = (criteria: Record<string, unknown>): PqProtocol => {
    const p = protocol();
    p.components.extraction = {
      required: true,
      executable: true,
      criteria: criteria as Record<string, number>,
      criteriaSource: 'test',
    };
    return p;
  };
  const extracted = (f1: number): PqExtractionResult[] => [
    { taskId: 'ext-0', docType: 'ind', servedModel: 'claude-opus-5', servedModelVerified: true, f1, precision: f1, recall: f1 },
  ];
  const why = (r: { reasons: string[] }) => r.reasons.join(' | ');

  it('control — a usable minimum is applied: F1 below it is a miss', () => {
    const r = computeVerdict(withExtraction({ minF1: 0.8, minTasksPerDocType: 1 }), [task('a'), task('b')], extracted(0.5));
    expect(r.verdict).toBe('FAIL');
    expect(why(r)).toMatch(/mean extraction F1 0\.500 is below 0\.8/);
  });

  it('control — a usable minimum that is met passes', () => {
    const r = computeVerdict(withExtraction({ minF1: 0.8, minTasksPerDocType: 1 }), [task('a'), task('b')], extracted(0.9));
    expect(r.verdict, why(r)).toBe('PASS');
  });

  it('a MISSING extraction minimum is INCOMPLETE, not a pass on no criterion', () => {
    const r = computeVerdict(withExtraction({}), [task('a'), task('b')], extracted(0.1));
    expect(r.verdict, 'extraction qualified a model against no criterion at all').not.toBe('PASS');
    expect(why(r)).toMatch(/minF1/);
  });

  it('a MISSPELT extraction minimum is named, not silently skipped', () => {
    /* The one a reviewer cannot see by reading the protocol: `minFI` with a
       capital I reads as the real key and measures nothing. */
    const r = computeVerdict(withExtraction({ minFI: 0.8 }), [task('a'), task('b')], extracted(0.1));
    expect(r.verdict).not.toBe('PASS');
    expect(why(r)).toMatch(/minFI/);
  });

  it('a minimum that is not a 0-1 number is named', () => {
    const r = computeVerdict(withExtraction({ minF1: '0.8' }), [task('a'), task('b')], extracted(0.1));
    expect(r.verdict).not.toBe('PASS');
    expect(why(r)).toMatch(/minF1/);
  });

  it('a NaN minimum is named, not skipped — NaN never compares below anything', () => {
    /* The hazard this file already names of the rag mean: "NaN never compares
       below a minimum, so it must never reach a mean". A bare
       `typeof minF1 === 'number'` admits NaN, and `0.1 < NaN` is false, so the
       criterion silently measures nothing. Found by a mutant that reverted the
       range check to a type check and survived every other case here. */
    const r = computeVerdict(withExtraction({ minF1: Number.NaN }), [task('a'), task('b')], extracted(0.1));
    expect(r.verdict, 'a NaN minimum qualified a model against nothing').not.toBe('PASS');
    expect(why(r)).toMatch(/minF1/);
  });

  /* P-31 condition 3 (2026-10-15): the extraction sample floor. */
  it('no extraction sample floor → INCOMPLETE, naming it, however well the one task scored', () => {
    const r = computeVerdict(withExtraction({ minF1: 0.8 }), [task('a'), task('b')], extracted(1));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/no extraction sample floor/);
  });

  it('fewer verified extraction tasks than the floor → INCOMPLETE; a fallback model\'s answer does not make up the sample', () => {
    const two = [...extracted(1), { ...extracted(1)[0], taskId: 'ext-1', servedModel: 'other', servedModelVerified: false }];
    const r = computeVerdict(withExtraction({ minF1: 0.8, minTasksPerDocType: 2 }), [task('a'), task('b')], two);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/extraction sample below the protocol floor of 2 per document type: ind=1/);
  });

  it('a floor that is not a positive whole number is named, not applied', () => {
    for (const bad of [0, 2.5, '10']) {
      const r = computeVerdict(withExtraction({ minF1: 0.8, minTasksPerDocType: bad }), [task('a'), task('b')], extracted(1));
      expect(r.verdict, String(bad)).toBe('INCOMPLETE');
      expect(why(r)).toMatch(/minTasksPerDocType is/);
    }
  });

  it('an out-of-range minimum is named rather than applied', () => {
    /* `minF1: 1.5` under a type check would make EVERY mean a miss — a
       criterion no model could meet, reported as the model's failure rather
       than the protocol's. INCOMPLETE is the honest verdict: the protocol is
       unusable, which is not the same as the model being unqualified. */
    const r = computeVerdict(withExtraction({ minF1: 1.5 }), [task('a'), task('b')], extracted(0.95));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/minF1 is 1\.5/);
    expect(why(r)).not.toMatch(/mean extraction F1/);
  });
});

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

  it('a header-only PASS does not establish execution or canonical approval', () => {
    expect(verifyPqClaim(entry, reader(good))).not.toEqual([]);
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
