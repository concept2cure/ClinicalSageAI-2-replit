/**
 * composeE2bR3Icsr emits only what the case states. An element it does not
 * state is blank, and a blank tracked element is a gap.
 *
 * Until 2026-10-15 (audit report_ind_ivd_irb finding 27):
 *  - C.2.r.4 (reporter qualification) was inferred from reporterType: an
 *    investigator became "1 (Physician)" and a sponsor "3 (Other health
 *    professional)" — an investigator need not be a physician, and a sponsor is
 *    no health professional;
 *  - C.1.8.2 (first sender of this case) defaulted to "2 (Other)" when no ICSR
 *    envelope was supplied.
 * A stated qualification now travels in the envelope as
 * `icsr.reporterQualification` (the E2B code, 1-5).
 *
 * E.i.4 is blank for an onset that is not recorded. The 1970-01-01 the audit
 * saw was made upstream, by the adverse-event row mapper reading a NULL
 * onset_date as new Date(null); the composer itself never printed it.
 */
import { describe, it, expect } from 'vitest';
import { composeE2bR3Icsr } from '../e2b-icsr-composer';
import type { AdverseEvent, ICSR } from '../../compliance/pharmacovigilanceService';

const event: AdverseEvent = {
  id: 'ae-9',
  organizationId: 'org-1',
  projectId: 'C2C-001',
  eventType: 'SAE',
  patientId: 'subj-009',
  eventDescription: 'Acute hepatic failure',
  onsetDate: new Date('2026-01-05T00:00:00.000Z'),
  reportDate: new Date('2026-01-06T00:00:00.000Z'),
  seriousnessCriteria: 'life_threatening',
  causality: 'probable',
  outcome: 'not_recovered',
  reporterType: 'investigator',
  countryOfOccurrence: 'US',
  regulatoryReportingDeadline: new Date('2026-01-13T00:00:00.000Z'),
  reportedToAuthorities: false,
  expeditedReportRequired: true,
  reactionPt: 'Hepatic failure',
  suspectProduct: 'C2C-001',
  createdAt: new Date('2026-01-06T00:00:00.000Z'),
};

const envelope: ICSR & { studyRegistrationNumber: string } = {
  id: 'icsr-9',
  adverseEventId: 'ae-9',
  icsrType: 'initial',
  senderType: 'sponsor',
  receiverType: 'regulatory_authority',
  transmissionDate: new Date('2026-01-07T00:00:00.000Z'),
  e2bVersion: 'R3',
  worldwideUniqueId: 'US-C2C-2026-000009',
  reportType: 'study',
  studyRegistrationNumber: 'IND 123456',
  seriousness: 'life_threatening',
  organizationId: 'org-1',
};

type Composed = ReturnType<typeof composeE2bR3Icsr>;
const valueOf = (r: Composed, id: string) =>
  [...r.icsr.caseAdmin, ...r.icsr.primarySource, ...r.icsr.reaction].find((e) => e.id === id)?.value;
const gapIds = (r: Composed) => r.gaps.map((g) => g.id);

describe('C.2.r.4 reporter qualification is stated, never inferred from the reporter type', () => {
  it.each(['investigator', 'sponsor', 'healthcare_provider', 'patient'] as const)(
    'a %s reporter with no stated qualification leaves C.2.r.4 blank, and it is a gap',
    (reporterType) => {
      const r = composeE2bR3Icsr({ ...event, reporterType }, { icsr: envelope });
      expect(valueOf(r, 'C.2.r.4'), `qualification inferred from reporterType '${reporterType}'`).toBe('');
      expect(gapIds(r)).toContain('C.2.r.4');
      expect(r.xml).not.toContain('id="C.2.r.4"');
    },
  );

  it('a stated qualification is emitted with its E2B meaning, and is not a gap', () => {
    const r = composeE2bR3Icsr(event, { icsr: { ...envelope, reporterQualification: '2' } });
    expect(valueOf(r, 'C.2.r.4')).toBe('2 (Pharmacist)');
    expect(gapIds(r)).not.toContain('C.2.r.4');
  });

  it('a stated value that is not an E2B qualification code is blank and a gap', () => {
    const r = composeE2bR3Icsr(event, { icsr: { ...envelope, reporterQualification: 'physician' } });
    expect(valueOf(r, 'C.2.r.4')).toBe('');
    expect(gapIds(r)).toContain('C.2.r.4');
  });
});

describe('C.1.8.2 first sender comes from the envelope, never a default', () => {
  it('with no ICSR envelope, C.1.8.2 is blank and a gap — not "2 (Other)"', () => {
    const r = composeE2bR3Icsr(event, { icsr: null });
    expect(valueOf(r, 'C.1.8.2'), 'first sender defaulted with no envelope').toBe('');
    expect(gapIds(r)).toContain('C.1.8.2');
  });

  it('a stated sender type is mapped', () => {
    expect(valueOf(composeE2bR3Icsr(event, { icsr: envelope }), 'C.1.8.2')).toBe('2 (Other)');
    expect(valueOf(composeE2bR3Icsr(event, { icsr: { ...envelope, senderType: 'regulatory_authority' } }), 'C.1.8.2')).toBe('1 (Regulator)');
  });
});

describe('E.i.4 onset', () => {
  it('an onset that is not recorded leaves E.i.4 blank (no epoch date)', () => {
    const r = composeE2bR3Icsr({ ...event, onsetDate: null as unknown as Date }, { icsr: envelope });
    expect(valueOf(r, 'E.i.4')).toBe('');
    expect(r.xml).not.toContain('1970-01-01');
  });
});

describe('a case that states everything tracked is complete', () => {
  it('has no gaps', () => {
    const r = composeE2bR3Icsr(event, { icsr: { ...envelope, reporterQualification: '1' } });
    expect(r.gaps).toEqual([]);
    expect(r.completeness).toBe(1);
    expect(valueOf(r, 'C.2.r.4')).toBe('1 (Physician)');
  });
});
