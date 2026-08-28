/**
 * FDA MedWatch 3500A export — data-integrity regressions.
 *
 * These reports are filed to FDA and ingested by regulators, so a wrong code
 * system or a date shifted by a day is a defect in a filed safety report. This
 * suite pins two such defects:
 *
 *   (a) administrativeGenderCode must carry a code DEFINED by its codeSystem
 *       2.16.840.1.113883.5.1 (HL7 AdministrativeGender = M / F / UN), never the
 *       ICH E2B numeric sex codes (1/2/0), which belong to the bare E2B
 *       <patientsex> element instead.
 *   (b) A date-only field (e.g. reaction onset) stored as 2026-03-15 must file as
 *       20260315 in every runtime timezone — the previous UTC round-trip could
 *       shift it to 20260314.
 *
 * TZ is forced to a positive-offset zone (UTC+9) so the pre-fix toISOString()
 * behaviour would deterministically shift the Date-valued receiveDate back a day;
 * this makes the date assertions fail against the old implementation rather than
 * only on some CI machines.
 */

process.env.TZ = 'Asia/Tokyo';

import { describe, it, expect } from 'vitest';
import { generateFDA3500AXML } from '../fdaAE3500A';
import type { CanonicalAdverseEvent } from '../../types';

const GENDER_OID = '2.16.840.1.113883.5.1';

function buildEvent(overrides: Record<string, any> = {}): CanonicalAdverseEvent {
  const base: Record<string, any> = {
    id: 'evt-1',
    tenantId: 'tenant-1',
    caseNumber: 'CASE-001',
    caseVersion: 1,
    reportType: 'initial',
    // Date-valued field, local midnight of the boundary date. Under the old
    // UTC round-trip in a UTC+ zone this rendered as the previous day.
    receiveDate: new Date(2026, 2, 15), // 2026-03-15 local
    eventDate: new Date(2026, 2, 15),
    isSerious: false,
    patient: {
      patient_initials: 'AB',
      sex: 'male',
    },
    reactions: [
      {
        meddra_pt_code: '10012345',
        reaction_term: 'Headache',
        outcome: 'recovered',
        // String date-only field carrying a local-midnight time component, the
        // shape most exposed to a UTC shift.
        onset_date: '2026-03-15T00:00:00',
      },
    ],
    suspectProducts: [{ product_name: 'TestDrug' }],
    reporter: { qualification: '1' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

describe('generateFDA3500AXML — administrativeGenderCode (finding a)', () => {
  it('emits an HL7 AdministrativeGender code (M) for the gender OID, never the E2B numeric 1', () => {
    const result = generateFDA3500AXML(buildEvent({ patient: { sex: 'male' } }), {} as any, {});
    expect(result.success).toBe(true);
    expect(result.content).toContain(
      `<administrativeGenderCode code="M" codeSystem="${GENDER_OID}"/>`
    );
    // The old mapping emitted code="1" against the same OID — a code the code
    // system does not define.
    expect(result.content).not.toContain(`<administrativeGenderCode code="1"`);
    expect(result.content).not.toMatch(/administrativeGenderCode code="[0-9]"/);
  });

  it('maps the canonical PatientInfo.sex letters (F) straight through', () => {
    const result = generateFDA3500AXML(buildEvent({ patient: { sex: 'F' } }), {} as any, {});
    expect(result.success).toBe(true);
    expect(result.content).toContain(
      `<administrativeGenderCode code="F" codeSystem="${GENDER_OID}"/>`
    );
  });

  it('falls back to UN (defined by the code system), not 0, when sex is absent', () => {
    const result = generateFDA3500AXML(buildEvent({ patient: { patient_initials: 'CD' } }), {} as any, {});
    expect(result.success).toBe(true);
    expect(result.content).toContain(
      `<administrativeGenderCode code="UN" codeSystem="${GENDER_OID}"/>`
    );
    expect(result.content).not.toContain(`<administrativeGenderCode code="0"`);
  });
});

describe('generateFDA3500AXML — date-only fields do not shift (finding b)', () => {
  it('files a boundary onset date (string) as the stored calendar day in a UTC+ zone', () => {
    const result = generateFDA3500AXML(buildEvent(), {} as any, {});
    expect(result.success).toBe(true);
    // Reaction onset low + receiveDate activityTime both carry 2026-03-15.
    expect(result.content).toContain('value="20260315"');
    // The pre-fix UTC round-trip produced the previous calendar day.
    expect(result.content).not.toContain('value="20260314"');
  });

  it('files a Date-valued receiveDate as its local calendar day', () => {
    const result = generateFDA3500AXML(
      buildEvent({ receiveDate: new Date(2026, 2, 15) }),
      {} as any,
      {}
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('<activityTime value="20260315"/>');
    expect(result.content).not.toContain('value="20260314"');
  });
});
