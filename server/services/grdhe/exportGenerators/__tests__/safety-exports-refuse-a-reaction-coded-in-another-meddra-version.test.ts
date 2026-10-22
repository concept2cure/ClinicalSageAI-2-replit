/**
 * Both safety exports refuse a reaction coded in a MedDRA version other than
 * the one the export job locked, naming the reaction and both versions
 * (GRDHE follow-up 7, 2026-10-15).
 *
 * What the generators used to do: every MedDRA code was written under the
 * job's locked version (reactionmeddraversionpt / codeSystemVersion), and a
 * reaction's recorded term_version was never read. So a reaction coded in
 * MedDRA 25.0 was filed as a MedDRA 26.1 code, and the export succeeded.
 * A reaction that records no version is filed under the lock, and the export
 * now says that the version was not checked.
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

function codedCase(reaction: Record<string, unknown>): CanonicalAdverseEvent {
  return {
    id: 'evt-1',
    tenantId: '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f',
    caseNumber: 'CASE-001',
    caseVersion: 1,
    caseType: 'spontaneous',
    reportType: 'initial',
    eventDate: '2026-03-10',
    receiveDate: '2026-03-15',
    createdAt: new Date('2026-03-15T09:00:00Z'),
    isSerious: false,
    patient: { initials: 'AB', sex: 'F' },
    reactions: [
      { term: 'Nausea', term_code: '10028813', term_system: 'MEDDRA', term_version: '26.1', outcome: 'recovered' },
      { term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', outcome: 'recovered', ...reaction },
    ],
    suspectProducts: [{ name: 'Examplamab' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' },
  } as unknown as CanonicalAdverseEvent;
}

const GENERATORS = [
  ['E2B', generateE2BR3XML],
  ['FDA', generateFDA3500AXML],
] as const;

describe('a reaction coded in another MedDRA version than the job locks', () => {
  it.each(GENERATORS)('%s refuses it, naming the reaction and both versions', (_name, generate) => {
    const r = generate(codedCase({ term_version: '25.0' }), JOB, LOCKED);
    expect(r.success, 'a MedDRA 25.0 code filed as a 26.1 code').toBe(false);
    const error = (r.errors ?? []).find(e => e.field === 'reactions[1].term_version');
    expect(error, JSON.stringify(r.errors)).toBeDefined();
    expect(error?.message).toContain('Headache');
    expect(error?.message).toContain('25.0');
    expect(error?.message).toContain('26.1');
  });

  it.each(GENERATORS)('%s files a reaction coded in the locked version', (_name, generate) => {
    const r = generate(codedCase({ term_version: '26.1' }), JOB, LOCKED);
    expect(r.errors ?? []).toEqual([]);
    expect(r.success).toBe(true);
    expect(r.warnings.map(w => w.field)).not.toContain('reactions[1].term_version');
  });

  it.each(GENERATORS)('%s files a reaction that records no version under the lock, and says it was not checked', (_name, generate) => {
    const r = generate(codedCase({}), JOB, LOCKED);
    expect(r.success).toBe(true);
    const warning = r.warnings.find(w => w.field === 'reactions[1].term_version');
    expect(warning?.message).toMatch(/Headache.*no MedDRA version.*26\.1/);
  });
});
