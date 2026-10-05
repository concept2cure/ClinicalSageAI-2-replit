/**
 * The CMC compliance engine cites what the CMC regulatory record says is
 * current, and judges analytical validation at the program's stage
 * (discovery map 2026-10-04, cmc-engines-phase-agnostic-stale-ich).
 *
 *   1. Every guideline the engine reports against is a final, unsuperseded
 *      ICH guideline in the record. It reported against Q2(R1) and Q9, which
 *      Q2(R2) (2023-11-01) and Q9(R1) (2023-01-18) replaced.
 *   2. Every record citation the Q2 rule makes resolves in the record.
 *   3. A first-in-human IND whose methods are shown suitable passes; the same
 *      methods fail a marketing application; a recorded phase 2 or 3 is a
 *      warning; an IND with no recorded phase is told so, never failed as if
 *      it were a marketing application.
 */
import { describe, expect, it } from 'vitest';
import { CMC_RECORD } from '../knowledge';
import { checkQ2, q2Expectation } from '../ich-compliance-q2';
import { ICH_GUIDELINES_CHECKED, type ProgramStage, type ProjectInputs } from '../ich-compliance-rules';
import {
  checkQ1A, checkQ3AandQ3B, checkQ3D, checkQ6AandQ6B, checkQ8, checkQ9, checkQ10,
} from '../ich-compliance-checker';
import { phaseNumber } from '../program-stage';

const empty = (): ProjectInputs => ({
  specs: [], methods: [], stability: [], drugSubs: [], processes: [], sourceObjects: [], sections: [],
});

const ICH_CURRENT = new Map(
  CMC_RECORD.sources.filter((s) => s.authority === 'ICH').map((s) => [s.code, s.status]),
);

describe('the compliance engine cites current ICH revisions', () => {
  it('reports only against final, unsuperseded ICH guidelines in the record', () => {
    const stale = ICH_GUIDELINES_CHECKED
      .filter((g) => ICH_CURRENT.get(g) !== 'final')
      .map((g) => `${g}: ${ICH_CURRENT.get(g) ?? 'not in the record'}`);
    expect(stale).toEqual([]);
  });

  it('every finding a rule makes is against a guideline in that list', () => {
    const outage: ProjectInputs = {
      ...empty(),
      unavailable: { specs: 'x', methods: 'x', stability: 'x', drugSubs: 'x', processes: 'x', sourceObjects: 'x', sections: 'x', stage: 'x' },
    };
    const rules = [checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D, checkQ6AandQ6B, checkQ8, checkQ9, checkQ10];
    const reported = new Set(rules.flatMap((rule) => [...rule(empty()), ...rule(outage)]).map((f) => f.guideline));
    expect([...reported].filter((g) => !(ICH_GUIDELINES_CHECKED as readonly string[]).includes(g))).toEqual([]);
  });

  it('every Q2 citation is a source the record holds', () => {
    for (const stage of [null, { application: 'marketing' }, { application: 'clinical_trial', phase: 1 }, { application: 'clinical_trial', phase: 2 }, { application: 'clinical_trial', phase: null }]) {
      const citation = q2Expectation(stage as ProgramStage | null).citation;
      for (const part of citation.split('; ')) expect(part, part).toMatch(/^[A-Za-z /]+ .+ \(\d{4}/);
    }
  });
});

const SUITABLE_METHOD = { methodName: 'HPLC assay', purpose: 'assay', validationStatus: 'qualified' };
const stage = (application: ProgramStage['application'], phase: ProgramStage['phase']): ProgramStage => ({
  application, phase, basis: `program type "${application === 'marketing' ? 'nda' : 'ind'}"; phase ${phase ?? 'not recorded'}`,
});

describe('analytical validation is judged at the program’s stage', () => {
  it('a first-in-human IND whose methods are shown suitable passes', () => {
    const inp = { ...empty(), methods: [SUITABLE_METHOD], stage: stage('clinical_trial', 1) };
    const f = checkQ2(inp);
    expect(f.map((x) => [x.ruleId, x.status])).toEqual([['Q2_OK', 'pass']]);
    expect(f[0].citation).toMatch(/FDA .*2026/);
    expect(f[0].citation).toMatch(/EMA\/CHMP\/QWP\/545525\/2017 Rev\. 2/);
  });

  it('the same methods fail a marketing application, citing Q2(R2)', () => {
    const f = checkQ2({ ...empty(), methods: [SUITABLE_METHOD], stage: stage('marketing', null) });
    const short = f.find((x) => x.ruleId === 'Q2_SUITABLE_NOT_VALIDATED');
    expect(short?.status).toBe('fail');
    expect(short?.citation).toMatch(/^ICH Q2\(R2\) \(2023-11-01\)/);
  });

  it('a recorded phase 2 or 3 is a warning that names the expectation', () => {
    for (const phase of [2, 3] as const) {
      const short = checkQ2({ ...empty(), methods: [SUITABLE_METHOD], stage: stage('clinical_trial', phase) })
        .find((x) => x.ruleId === 'Q2_SUITABLE_NOT_VALIDATED');
      expect(short?.status).toBe('warning');
      expect(short?.message).toContain(`At phase ${phase} a summary of validation results is expected`);
    }
  });

  it('an IND with no recorded phase is told so, never failed as a marketing application', () => {
    const f = checkQ2({ ...empty(), methods: [{ ...SUITABLE_METHOD, validationStatus: 'draft' }], stage: stage('clinical_trial', null) });
    const short = f.find((x) => x.ruleId === 'Q2_UNVALIDATED_METHODS');
    expect(short?.status).toBe('warning');
    expect(short?.message).toMatch(/records no clinical phase/);
    expect(short?.evidence).toContain('stage: program type "ind"; phase not recorded');
  });

  it('a phase 1 method that is neither validated nor shown suitable is a warning, not a pass', () => {
    const f = checkQ2({ ...empty(), methods: [{ ...SUITABLE_METHOD, validationStatus: 'draft' }], stage: stage('clinical_trial', 1) });
    expect(f.find((x) => x.ruleId === 'Q2_UNVALIDATED_METHODS')?.status).toBe('warning');
  });

  it('a stage that could not be read is not evaluated, never judged at a guessed stage', () => {
    const f = checkQ2({ ...empty(), methods: [SUITABLE_METHOD], unavailable: { stage: 'timeout' } });
    expect(f.map((x) => [x.ruleId, x.status])).toEqual([['Q2_NOT_EVALUATED', 'not_evaluated']]);
  });
});

describe('reading a recorded phase', () => {
  it.each([
    ['Phase 1', 1], ['I', 1], ['phase_1', 1], ['Phase 1/2', 2], ['Phase IIb', 2], ['Phase III', 3], ['3', 3],
    ['Phase 4', null], ['', null], [null, null], ['Phase 0', null],
  ])('%s → %s', (text, n) => {
    expect(phaseNumber(text)).toBe(n);
  });
});
