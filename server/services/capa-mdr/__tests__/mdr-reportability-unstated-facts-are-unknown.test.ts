/**
 * An MDR reportability fact nobody stated is unknown, never false (Rule 2 audit
 * S3, docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md).
 *
 * classify read an omitted isMalfunction, anticipatesCorrection and
 * trendThresholdCrossed as false and an omitted country as outside the EU, so
 * { patientHarm: 'serious_injury' } was a 30-day FDA report with no EU report
 * and no 806 notice. createComplaint stored that as the complaint's
 * preliminary_classification, and assess_mdr_reportability returned it as
 * computed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[] }));

// The governed transaction, reduced to what createComplaint does inside it:
// read the next code, then insert the complaint and its vigilance event.
vi.mock('../governed-context', () => {
  class CapaAccessError extends Error {}
  class CapaPersistenceError extends Error {}
  const active = {
    organizationId: 3,
    caller: { userId: 7 },
    role: 'member',
    write: true,
    auditWrites: 0,
    recovery: undefined as unknown,
    q: { query: async () => ({ rows: [] }) },
    db: {
      select: () => ({ from: () => ({ where: async () => [{ maxSeq: 0 }] }) }),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            H.inserted.push(values);
            return [{ id: `row-${H.inserted.length}`, ...values }];
          },
        }),
      }),
    },
  };
  const run = async (_org: number, _caller: unknown, action: () => Promise<unknown>) => action();
  return {
    CapaAccessError,
    CapaPersistenceError,
    capaContext: () => active,
    authorizeCapaProgram: async () => undefined,
    visibleCapaPrograms: async () => [],
    readCapa: run,
    mutateCapa: run,
  };
});
vi.mock('../../auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auditService')>()),
  writeChainedAuditRow: async () => ({}),
}));

import { classify } from '../triageEngine';
import { createComplaint, ComplaintAssessmentRequired } from '../capaMdr.service';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../../ana/AnaToolExecutor';

const STATED = { isMalfunction: false, eventLocationCountry: 'US', anticipatesCorrection: false, trendThresholdCrossed: false };
const without = (fact: string) => Object.fromEntries(Object.entries(STATED).filter(([key]) => key !== fact));
const INTAKE = {
  programId: '11111111-1111-4111-8111-111111111111',
  source: 'customer',
  channel: 'email',
  receivedAt: new Date('2026-10-15T09:00:00Z'),
  eventNarrative: 'Patient hospitalised after the pump over-delivered',
  patientHarm: 'serious_injury',
  severityAssessment: 'serious',
} as const;
const CALLER = { userId: 7 };

const factNames = (missingFacts: string[]) => missingFacts.map((f) => f.split(' ')[0]);
const storedClassification = () =>
  H.inserted.find((row) => 'preliminaryClassification' in row)?.preliminaryClassification;

beforeEach(() => {
  H.inserted.length = 0;
});

describe('classify: an unstated fact is unknown, never false', () => {
  it.each(['none', 'injury'] as const)('%s does not suppress an FDA-reportable malfunction', (patientHarm) => {
    const result = classify({ patientHarm, ...STATED, isMalfunction: true });
    expect(result).toMatchObject({ fdaReportable: true, suggestedFdaReportType: 'initial_30day' });
    expect(result.rationale).toMatch(/Malfunction/);
    expect(result.rationale).not.toMatch(/no FDA MDR|no MDR/);
  });

  it.each(['none', 'injury'] as const)('%s leaves FDA reportability unknown when malfunction risk was not stated', (patientHarm) => {
    const result = classify({ patientHarm, ...STATED, isMalfunction: undefined });
    expect(result).toMatchObject({ fdaReportable: null, determinationComplete: false });
    expect(factNames(result.missingFacts)).toContain('isMalfunction');
  });

  it('no actual harm does not settle an EU malfunction serious-incident determination', () => {
    const result = classify({ patientHarm: 'none', ...STATED, isMalfunction: true, eventLocationCountry: 'FR' });
    expect(result).toMatchObject({ fdaReportable: true, mdrEuReportable: null, determinationComplete: false });
    expect(result.rationale).toMatch(/not assessed/);
  });

  it('a serious injury with nothing else stated is FDA reportable, and the rest is not determined', () => {
    const result = classify({ patientHarm: 'serious_injury' });
    expect(result).toMatchObject({
      fdaReportable: true,
      suggestedFdaReportType: null,
      mdrEuReportable: null,
      suggestedEuSeverity: null,
      requires806Notice: null,
      suggestedJurisdiction: null,
      determinationComplete: false,
    });
    expect(factNames(result.missingFacts)).toEqual(['eventLocationCountry', 'anticipatesCorrection', 'trendThresholdCrossed']);
    expect(result.rationale).not.toMatch(/FDA 30-day/);
  });

  it('a malfunction whose recurrence risk is not stated is not "not reportable"', () => {
    const result = classify({ patientHarm: 'malfunction' });
    expect(result).toMatchObject({ fdaReportable: null, suggestedJurisdiction: null, determinationComplete: false });
    expect(factNames(result.missingFacts)).toEqual(['isMalfunction', 'eventLocationCountry']);
  });

  // S3 review of the plan (residual a): the engine does not model whether a
  // malfunction is an EU MDR serious incident (Article 2(65), 87), so in the
  // EU it may not answer "not reportable" and call the determination complete.
  it('a malfunction in the EU leaves EU vigilance not assessed, not "not reportable"', () => {
    const result = classify({ patientHarm: 'malfunction', ...STATED, isMalfunction: true, eventLocationCountry: 'FR' });
    expect(result).toMatchObject({ fdaReportable: true, mdrEuReportable: null, suggestedJurisdiction: null, determinationComplete: false });
    expect(result.rationale).toMatch(/not assessed/);
    expect(classify({ patientHarm: 'malfunction', ...STATED, isMalfunction: true })).toMatchObject({
      mdrEuReportable: false,
      determinationComplete: true,
    });
  });

  it('a country stated as unknown leaves EU vigilance undetermined, not "outside the EU"', () => {
    const result = classify({ patientHarm: 'death', ...STATED, eventLocationCountry: 'unknown' });
    expect(result).toMatchObject({
      fdaReportable: true,
      suggestedFdaReportType: 'initial_30day',
      mdrEuReportable: null,
      determinationComplete: false,
    });
    expect(factNames(result.missingFacts)).toEqual(['eventLocationCountry']);
  });

  it('records the facts it used, and is complete when every one it turns on is stated', () => {
    expect(
      classify({ patientHarm: 'serious_injury', ...STATED, eventLocationCountry: 'de', trendThresholdCrossed: true }),
    ).toMatchObject({
      fdaReportable: true,
      suggestedFdaReportType: 'initial_30day',
      mdrEuReportable: true,
      suggestedEuSeverity: 'life_threatening_2day',
      requires806Notice: false,
      suggestedJurisdiction: 'both',
      facts: { isMalfunction: false, eventLocationCountry: 'DE', anticipatesCorrection: false, trendThresholdCrossed: true },
      missingFacts: [],
      determinationComplete: true,
    });
    // No actual harm and a stated absence of a reportable malfunction.
    expect(classify({ patientHarm: 'none', ...STATED })).toMatchObject({
      fdaReportable: false,
      mdrEuReportable: false,
      determinationComplete: true,
    });
  });
});

describe('createComplaint stores no classification computed from an unstated fact', () => {
  it.each([
    ['       de       ', 'DE'],
    ['  UnKnOwN  ', 'unknown'],
  ])('stores the normalized country for %j, within the varchar(8) limit', async (eventLocationCountry, storedCountry) => {
    await createComplaint(3, { ...INTAKE, ...STATED, eventLocationCountry } as never, CALLER);
    const stored = H.inserted.find((row) => 'preliminaryClassification' in row);
    expect(stored?.eventLocationCountry).toBe(storedCountry);
  });

  it('refuses a complaint without anticipatesCorrection, and stores nothing', async () => {
    const outcome = await createComplaint(3, { ...INTAKE, ...without('anticipatesCorrection') } as never, CALLER).then(
      () => 'stored',
      (e: unknown) => e,
    );
    // On trunk the complaint was stored, classified with anticipatesCorrection read as false.
    expect(storedClassification()).toBeUndefined();
    expect(outcome).toBeInstanceOf(ComplaintAssessmentRequired);
    expect((outcome as Error).message).toMatch(/^anticipatesCorrection is required at intake/);
    expect(H.inserted).toEqual([]);
  });

  it.each(['isMalfunction', 'eventLocationCountry', 'trendThresholdCrossed'])(
    'refuses a complaint without %s',
    async (fact) => {
      await expect(createComplaint(3, { ...INTAKE, ...without(fact) } as never, CALLER)).rejects.toThrow(
        new RegExp(`^${fact} is required at intake`),
      );
      expect(H.inserted).toEqual([]);
    },
  );

  it('refuses a country it cannot read rather than read it as outside the EU', async () => {
    await expect(
      createComplaint(3, { ...INTAKE, ...STATED, eventLocationCountry: 'Germany' } as never, CALLER),
    ).rejects.toBeInstanceOf(ComplaintAssessmentRequired);
    expect(H.inserted).toEqual([]);
  });

  it('stores the facts as stated; a country stated as unknown leaves EU vigilance undetermined', async () => {
    await createComplaint(3, { ...INTAKE, ...STATED, eventLocationCountry: 'unknown' } as never, CALLER);
    expect(storedClassification()).toMatchObject({
      fdaReportable: true,
      suggestedFdaReportType: 'initial_30day',
      mdrEuReportable: null,
      determinationComplete: false,
      facts: { isMalfunction: false, eventLocationCountry: null, anticipatesCorrection: false, trendThresholdCrossed: false },
    });
  });
});

describe('assess_mdr_reportability asks for each omitted fact', () => {
  const run = async (input: Record<string, unknown>) => {
    const handler = getToolHandler('assess_mdr_reportability');
    expect(handler, 'assess_mdr_reportability handler registered').toBeTypeOf('function');
    return JSON.parse(await handler!(input, { organizationId: 1, userId: 1 }));
  };

  it('{ patientHarm: "serious_injury" } is not a 30-day report: it names each fact it was not given', async () => {
    const out = await run({ patientHarm: 'serious_injury' });
    // On trunk: status 'computed', suggestedFdaReportType 'initial_30day', mdrEuReportable false.
    expect(out.result).toBeUndefined();
    expect(out.status).toBe('needs_parameters');
    expect(out.missing).toEqual(['isMalfunction', 'eventLocationCountry', 'anticipatesCorrection', 'trendThresholdCrossed']);
  });

  it('computes from stated facts, and says what a country stated as unknown leaves undetermined', async () => {
    const out = await run({ patientHarm: 'serious_injury', ...STATED, eventLocationCountry: 'unknown' });
    expect(out.status).toBe('computed');
    expect(out.result).toMatchObject({ fdaReportable: true, mdrEuReportable: null, determinationComplete: false });
    expect(out.instruction).toMatch(/missingFacts/);
  });
});
