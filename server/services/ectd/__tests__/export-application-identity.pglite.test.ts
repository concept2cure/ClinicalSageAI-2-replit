/**
 * The exported package names the application the program RECORDS.
 * 2026-09-29 (W5/D7, WO-9 Click 6).
 *
 * The compile surface packaged BX-512 as IND 000512 (the program's recorded
 * application number). Its "Download package (.zip)" — assembleSubmissionEctd
 * — packaged the same sequence as `UNASSIGNED-SEQ-6`, because it took the
 * number only from the request, and the surface sends none. The package handed
 * to the agency validator, and the one a transmit would carry, disagreed with
 * the recorded compile and with the record. A request could also name any
 * number it liked — unvalidated, into a filename and the backbone.
 *
 * The record is authoritative, as it already is for the region. A supplied
 * number must be a usable identifier and must not contradict the recorded one.
 *
 * 2026-10-08 (QA j6): the inspection copy of PLR-606 sequence 0000 named the
 * applicant "UNASSIGNED (organization 1)" although the organisation is
 * Concept2Cure Therapeutics, and wrote the program code PLR-606 as the FDA
 * application number. Now the package names the organisation's recorded name
 * as the applicant and ONLY the recorded application number as the
 * application; with either missing it is refused by name, never built with a
 * placeholder and never with the program code.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { assembleSubmissionEctd, assembleSequence } from '../assemble-from-core';
import { PackageIdentityMissingError, readRecordedPackageIdentity, recordedPackageIdentitySnapshot, fdaContactsForPackageIdentity } from '../package-identity';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const NAMELESS_ORG = 8;
const RECORDED = '11111111-1111-4111-8111-111111111111';
const CODE_ONLY = '22222222-2222-4222-8222-222222222222';
const NAMELESS = '33333333-3333-4333-8333-333333333333';
const SPONSOR = '44444444-4444-4444-8444-444444444444';
const NAMELESS_SPONSOR = '55555555-5555-4555-8555-555555555555';

async function regionalOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return (await zip.file('m1/us/us-regional.xml')?.async('string')) ?? '';
}
async function applicationNumberIn(buffer: Buffer): Promise<string | undefined> {
  return /<application-number[^>]*>([^<]*)</.exec(await regionalOf(buffer))?.[1];
}

const exportOf = (submissionId: number, applicationNumber?: string, organizationId = ORG) =>
  assembleSubmissionEctd({
    submissionId, organizationId, userId: USER, sequenceNumber: '0000',
    ...(applicationNumber !== undefined ? { applicationNumber } : {}),
  });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    -- The organisation is the sponsor of record (as Form FDA 1571 names it); the
    -- second one's record carries no usable name.
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure Therapeutics'), (${NAMELESS_ORG}, '   ');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number) VALUES
      ('${RECORDED}', ${ORG}, 'Vorelinib (IND)', 'BX-512', 'IND', 'Vorelinib', '000512'),
      ('${CODE_ONLY}', ${ORG}, 'Pre-IND program', 'BX-900', 'IND', 'Compound 900', NULL),
      ('${NAMELESS}', ${NAMELESS_ORG}, 'Nameless sponsor IND', 'NN-1', 'IND', 'Compound N', '000777');
    INSERT INTO ind_sponsors (id, organization_id, name, duns, contact_name, contact_phone, contact_email) VALUES
      ('${SPONSOR}', ${ORG}, 'Concept2Cure Therapeutics', '123456789', 'Regulatory Contact', '+1 212 555 0100', 'ra@example.test'),
      ('${NAMELESS_SPONSOR}', ${NAMELESS_ORG}, '   ', '987654321', 'Regulatory Contact', '+1 212 555 0100', 'ra@example.test');
    UPDATE regulatory_programs SET applicant_sponsor_id = '${SPONSOR}' WHERE organization_id = ${ORG};
    UPDATE regulatory_programs SET applicant_sponsor_id = '${NAMELESS_SPONSOR}' WHERE organization_id = ${NAMELESS_ORG};
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (1, 'recorded number', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${RECORDED}'),
      (2, 'code only', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${CODE_ONLY}'),
      (3, 'no program', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (4, 'nameless sponsor', 'ind', 'biotech', 'fda', ${NAMELESS_ORG}, ${USER}, '${NAMELESS}');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (11, 1, 'fda', '0000', ${ORG}, ${USER}), (12, 2, 'fda', '0000', ${ORG}, ${USER}), (13, 3, 'fda', '0000', ${ORG}, ${USER}),
      (14, 4, 'fda', '0000', ${NAMELESS_ORG}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (300, ${ORG}, 'Drug Substance General', '<p>general</p>', '3.2', 'approved'),
      (301, ${NAMELESS_ORG}, 'Drug Substance General', '<p>general</p>', '3.2', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (11, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (12, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (13, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (14, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 301, ${NAMELESS_ORG}, ${USER});
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('the application number an exported package carries', () => {
  it('is the number the program records, when the export supplies none', async () => {
    const r = await exportOf(1);
    expect(await applicationNumberIn(r.buffer)).toBe('000512');
    expect(r.filename).toContain('000512');
  });

  it('with no agency number recorded, is refused by name — the program code is never an application number', async () => {
    const refused = await exportOf(2).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused).toMatchObject({ code: 'PACKAGE_IDENTITY_MISSING', missing: ['applicationNumber'] });
    expect(refused.message).toMatch(/records no agency application number/);
    expect(refused.message).toMatch(/program code is not one/);
    expect(refused.message).toMatch(/Nothing was built\.$/);
    expect(refused.message).not.toMatch(/BX-900/);
  });

  it('for a submission with no program, is refused by name: no number is recorded for it', async () => {
    const refused = await exportOf(3).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused.message).toMatch(/not anchored to a project/);
  });

  it('a supplied number that agrees with the record is used', async () => {
    expect(await applicationNumberIn((await exportOf(1, '000512')).buffer)).toBe('000512');
  });

  it('a supplied number that contradicts the recorded one is refused', async () => {
    await expect(exportOf(1, '999999')).rejects.toThrow(/does not match the program's recorded application number/);
  });

  it('a supplied value that is not a usable identifier is refused, never written into a filename', async () => {
    await expect(exportOf(3, '../../evil')).rejects.toThrow(/is not a usable application number/);
  });
});

describe('the applicant an exported package names', () => {
  it('is the organisation the record names, not a placeholder', async () => {
    const regional = await regionalOf((await exportOf(1)).buffer);
    expect(regional).toMatch(/<company-name>Concept2Cure Therapeutics<\/company-name>/);
    expect(regional).not.toMatch(/UNASSIGNED \(organization/);
    expect(regional).not.toMatch(/BX-512/);
    expect(regional).toContain('<id>123456789</id>');
    expect(regional).toContain('<applicant-contacts>');
    expect(regional).toContain('<applicant-contact-name applicant-contact-type="fdaact1">Regulatory Contact</applicant-contact-name>');
    expect(regional).toContain('<telephone>+1 212 555 0100</telephone>');
    expect(regional).toContain('<email>ra@example.test</email>');
    expect(regional).not.toMatch(/UNASSIGNED-ORG-/);
  });

  it('an organisation whose record has no usable name is refused by name', async () => {
    const refused = await exportOf(4, undefined, NAMELESS_ORG).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused).toMatchObject({ missing: ['applicantName'] });
    expect(refused.message).toMatch(/bound sponsor record has no usable applicant name/);
  });
});


describe('recorded FDA sponsor facts remain authoritative at export', () => {
  it('refuses an unbound sponsor even when the organization name is present', async () => {
    await harness.pglite.query('UPDATE regulatory_programs SET applicant_sponsor_id = NULL WHERE id = $1', [RECORDED]);
    try {
      const refused = await exportOf(1).catch((e) => e);
      expect(refused).toMatchObject({ code: 'PACKAGE_IDENTITY_MISSING', missing: expect.arrayContaining(['applicantSponsorId', 'applicantId', 'contact']) });
    } finally {
      await harness.pglite.query('UPDATE regulatory_programs SET applicant_sponsor_id = $1 WHERE id = $2', [SPONSOR, RECORDED]);
    }
  });
  it('refuses a caller-supplied DUNS that differs from the bound sponsor', async () => {
    await expect(assembleSubmissionEctd({ submissionId: 1, organizationId: ORG, userId: USER,
      sequenceNumber: '0000', applicantId: '999999999' })).rejects.toThrow(/does not match the recorded sponsor/);
  });
  it('refuses incomplete contact facts instead of producing a placeholder', async () => {
    await harness.pglite.query('UPDATE ind_sponsors SET contact_email = NULL WHERE id = $1', [SPONSOR]);
    try {
      const refused = await exportOf(1).catch((e) => e);
      expect(refused).toMatchObject({ code: 'PACKAGE_IDENTITY_MISSING', missing: ['contact.email'] });
    } finally {
      await harness.pglite.query("UPDATE ind_sponsors SET contact_email = 'ra@example.test' WHERE id = $1", [SPONSOR]);
    }
  });
  it('keeps telephone vocabulary and agency DTD qualification gaps visible', async () => {
    const result = await exportOf(1);
    const xml = await regionalOf(result.buffer);
    expect(xml).not.toContain('telephone-number-type=');
    // This integration fills recorded facts; it does not invent agency codes.
    expect(xml).toContain('<applicant-contacts>');
  });
});


describe('assembly returns the exact supplied identity capture', () => {
  it('ships the capture by value even when the caller later mutates its input object', async () => {
    const identity = await readRecordedPackageIdentity(harness.pglite, ORG, RECORDED);
    const snapshot = recordedPackageIdentitySnapshot(identity);
    const assembling = assembleSequence({ sequenceId: 11, organizationId: ORG, userId: USER,
      applicationId: '000512', sponsorId: '123456789', sponsorName: 'Concept2Cure Therapeutics',
      contacts: fdaContactsForPackageIdentity(identity), recordedPackageIdentity: snapshot });
    snapshot.identity.contact.email = 'changed-after-capture@example.test';
    const result = await assembling;
    try {
      expect(result.recordedPackageIdentity?.identity.contact.email).toBe('ra@example.test');
      const xml = await regionalOf(await (await import('node:fs/promises')).readFile(result.bundle.path));
      expect(xml).toContain('<email>ra@example.test</email>');
      expect(xml).not.toContain('changed-after-capture');
    } finally { await result.cleanup(); }
  });
  it('refuses packaging inputs that disagree with the claimed FDA identity', async () => {
    const identity = await readRecordedPackageIdentity(harness.pglite, ORG, RECORDED);
    await expect(assembleSequence({ sequenceId: 11, organizationId: ORG, userId: USER,
      applicationId: '000512', sponsorId: '999999999', sponsorName: 'Concept2Cure Therapeutics',
      contacts: fdaContactsForPackageIdentity(identity), recordedPackageIdentity: recordedPackageIdentitySnapshot(identity),
    })).rejects.toThrow(/do not match the captured recorded applicant identity/);
  });
});


describe('non-FDA identifiers retain their regional meaning', () => {
  it('does not substitute FDA DUNS for an absent or explicitly supplied EMA identifier', async () => {
    await harness.pglite.query("UPDATE ectd_sequences SET region = 'ema' WHERE id = 11");
    try {
      for (const applicantId of [undefined, 'EMA-ORG-42']) {
        const result = await assembleSubmissionEctd({ submissionId: 1, organizationId: ORG, userId: USER,
          sequenceNumber: '0000', ...(applicantId === undefined ? {} : { applicantId }) });
        const zip = await JSZip.loadAsync(result.buffer);
        const xml = await zip.file('m1/eu/eu-regional.xml')!.async('string');
        expect(xml).toContain(`<id>${applicantId ?? ''}</id>`);
        expect(xml).not.toContain('<id>123456789</id>');
        expect(xml).not.toContain('UNASSIGNED-ORG-');
        expect(xml).not.toContain('<applicant-contacts>');
      }
    } finally { await harness.pglite.query("UPDATE ectd_sequences SET region = 'fda' WHERE id = 11"); }
  });
});
