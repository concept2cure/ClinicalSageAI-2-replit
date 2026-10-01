/**
 * Review round 1 (security, honest-state and Part 11 UX reviews of the
 * compliance reports): the catalog's words, the columns a reader relies on,
 * and the chain summary of the integrity attestation.
 */
import { describe, expect, it } from 'vitest';

import { findReport } from '../catalog';
import { summarizeIntegrityChecks } from '../queries/audit-trail-integrity';
import { VERIFY_INSTRUCTION, buildSignedReport } from '../signed-report';
import type { ReportData } from '../types';

const columnsOf = (id: string, section: string) =>
  findReport(id)!.sections.find((s) => s.key === section)!.columns.map((c) => c.key);

describe('item 2 — the integrity attestation summarises its own checks', () => {
  const row = (verdict: string) => ({ check: 'c', store: 's', verdict, rows_checked: 1, detail: 'd' });
  it('ok only when every check is intact', () => {
    expect(summarizeIntegrityChecks([row('intact'), row('intact'), row('intact')], { ok: true, rowsChecked: 9 })).toEqual({
      ok: true,
      scope: 'integrity-checks',
      rowsChecked: 9,
      checks: { total: 3, intact: 3, broken: 0, notVerified: 0 },
    });
  });
  it('false when any check is broken, whatever the others say', () => {
    const s = summarizeIntegrityChecks([row('intact'), row('broken'), row('not verified')], { ok: true, rowsChecked: 9 });
    expect(s).toMatchObject({ ok: false, checks: { total: 3, intact: 1, broken: 1, notVerified: 1 } });
    expect(s.reason).toBeTruthy();
  });
  it('null, with how many could not verify, when none is broken and not all are intact', () => {
    expect(summarizeIntegrityChecks([row('intact'), row('not verified'), row('not verified')], { ok: null })).toEqual({
      ok: null,
      scope: 'integrity-checks',
      reason: '2 of 3 checks could not verify.',
      checks: { total: 3, intact: 1, broken: 0, notVerified: 2 },
    });
  });
});

describe('item 3 — what the seal is, and who verifies it, said plainly', () => {
  it('the instruction names the HMAC key the platform holds, the verifier, the CSV case and the inspector', () => {
    expect(VERIFY_INSTRUCTION).toMatch(/HMAC-SHA256/);
    expect(VERIFY_INSTRUCTION).toMatch(/platform holds/);
    expect(VERIFY_INSTRUCTION).toMatch(/signingKeyId/);
    expect(VERIFY_INSTRUCTION).toContain('POST /api/audit/export/verify');
    expect(VERIFY_INSTRUCTION).toMatch(/signed-in member of the organisation/);
    expect(VERIFY_INSTRUCTION).toMatch(/CSV text exactly as saved/);
    expect(VERIFY_INSTRUCTION).toContain('.manifest.json');
    expect(VERIFY_INSTRUCTION).toMatch(/inspector verifies through the organisation/);
    expect(VERIFY_INSTRUCTION).not.toMatch(/independent/i);
  });

  it('the manifest does not claim independent verification', () => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = 'w'.repeat(40);
    const data: ReportData = {
      report: { id: 'access-review', title: 'User access review', version: 1 },
      organizationId: 7,
      period: { from: null, to: '2026-09-30', kind: 'as-of' },
      generatedAt: '2026-09-30T12:00:00.000Z',
      chain: { ok: null, scope: 'not-checked', reason: 'r' },
      sections: [],
      notRecorded: [],
    };
    const out = buildSignedReport(data, { format: 'json', generatedBy: 'x', generatedByRole: 'admin', basis: [], chain: data.chain });
    expect(JSON.stringify(out.manifest)).not.toMatch(/independent/i);
  });
});

describe('item 4 — the access review says what it cannot show', () => {
  const r = findReport('access-review')!;
  it('role history and the review decision are stated as not recorded', () => {
    expect(r.notRecorded).toContain("A member's role on a past date cannot be reported: role changes are not recorded.");
    expect(r.notRecorded).toContain(
      'This report records no review decision, reviewer or sign-off. POLICY-AC-002 §4a keeps those in the access-review record.',
    );
    expect(r.notRecorded.join(' ')).toMatch(/role change made by an administrator/);
  });
});

describe('item 5 — administrative changes: which settings changes are recorded, exactly', () => {
  const text = findReport('administrative-changes')!.notRecorded.join(' ');
  it('tenant configuration changes are not recorded; organisation settings are recorded by section name only', () => {
    expect(text).toMatch(/tenant configuration/);
    expect(text).toMatch(/second-factor requirement/);
    expect(text).toMatch(/session timeout/);
    expect(text).toMatch(/IP restrictions/);
    expect(text).toMatch(/audit-trail retention/);
    expect(text).toMatch(/integrations/);
    expect(text).toMatch(/organisation settings are recorded by section name only/);
  });
});

describe('item 6 — the signature register shows what was signed, as stored', () => {
  it('carries the purpose and the signed version as their own columns', () => {
    const cols = columnsOf('electronic-signatures', 'signatures');
    expect(cols).toContain('signature_purpose');
    expect(cols).toContain('signed_version');
    expect(cols).toContain('meaning');
  });
});

describe('item 7 — the controlled-document register', () => {
  it('documents carry the approving signer, meaning, the revoked count and the superseding document', () => {
    const cols = columnsOf('controlled-documents', 'documents');
    for (const c of ['approval_signer_name', 'approval_meaning', 'revoked_approval_signatures', 'superseded_by_id']) {
      expect(cols).toContain(c);
    }
  });
  it('change controls carry their description and reason', () => {
    const cols = columnsOf('controlled-documents', 'changes');
    for (const c of ['status', 'closed_at', 'description', 'reason']) expect(cols).toContain(c);
  });
  it('states what does not appear and where training lives', () => {
    const text = findReport('controlled-documents')!.notRecorded.join(' ');
    expect(text).toContain('Documents deleted before the date do not appear.');
    expect(text).toMatch(/Distribution of a controlled document/);
    expect(text).toMatch(/QMS training records/);
    expect(text).toMatch(/point of use/);
  });
});
