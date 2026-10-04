/**
 * Review round 1 (security, honest-state and Part 11 UX reviews of the
 * compliance reports): the catalog's words, the columns a reader relies on,
 * and the chain summary of the integrity attestation.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findReport } from '../catalog';
import { summarizeIntegrityChecks } from '../queries/audit-trail-integrity';
import { ADMINISTRATIVE_ACTIONS } from '../queries/administrative-changes';
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
  it('the past role and the review decision are stated as not shown; role changes are where they are recorded', () => {
    // P1-49 (2026-10-01): a role change through a SCIM group writes its chained
    // member_role_changed row in its own transaction, so it is listed too.
    expect(r.notRecorded).toContain(
      "A member's role on a past date is not reconstructed: the role shown is the current one. A role change made by an administrator in the product is listed, with the role before and after, in the administrative changes report. A role change made through a SCIM group, which is how an identity provider assigns roles, is listed there too, with no person as actor; those made before the product began recording them were not recorded.",
    );
    // P1-43 (2026-10-01): the report now names the latest signed review record; its decisions stay in the record.
    expect(r.notRecorded).toContain(
      "This report names the latest signed access review, its reviewer and its signature; it does not list the review's decisions. POLICY-AC-002 §4a keeps those in the access-review record, one per account.",
    );
    expect(r.notRecorded.join(' ')).not.toMatch(/records no review decision, reviewer or sign-off/);
  });
  it('P1-41: no longer says an administrator\'s role change or removal goes unrecorded', () => {
    const text = r.notRecorded.join(' ');
    expect(text).not.toMatch(/role changes are not recorded/);
    expect(text).not.toMatch(/not written to the audit trail/);
    expect(text).toMatch(/A removal made by an administrator in the product or through SCIM provisioning is recorded/);
    expect(text).toMatch(/A role change made by an administrator in the product is listed, with the role before and after/);
  });
  it('P1-41 fix round: no sentence says role changes in general are listed or recorded', () => {
    // Each sentence that says role changes are listed or recorded names the
    // path it is true for: an administrator in the product (P1-41), or a SCIM
    // group (P1-49, which records it). An unqualified "role changes ... are
    // listed/recorded" would also claim the paths that write no row.
    for (const line of r.notRecorded) {
      for (const sentence of line.split(/(?<=\.)\s+/)) {
        if (!/\b(are|is) (listed|recorded)\b/.test(sentence) || /\bnot recorded\b/.test(sentence)) continue;
        if (!/role change/i.test(sentence)) continue;
        expect(sentence, sentence).toMatch(/made by an administrator in the product|made through a SCIM group/);
      }
    }
  });
});

describe('P1-41 fix round — both reports disclose the SCIM-group role change while it writes no row', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const scim = readFileSync(path.join(repoRoot, 'server', 'routes', 'scim.ts'), 'utf8');
  const start = scim.indexOf("router.patch('/Groups/:id'");
  const end = scim.indexOf('\nrouter.', start + 1);
  const handler = scim.slice(start, end);
  // P1-49 (2026-10-01): the handler changes each role through the canonical
  // membership writer, changeMemberRole (services/tenant/membership-change.ts),
  // which makes the UPDATE and then writes its chained row on the same client
  // (recordMembershipChange → writeChainedAuditRow). That writer is read as well,
  // so the disclosure is required again if it stops recording.
  const membership = readFileSync(path.join(repoRoot, 'server', 'services', 'tenant', 'membership-change.ts'), 'utf8');
  const canonicalStart = membership.indexOf('export async function changeMemberRole(');
  const canonical = membership.slice(canonicalStart, membership.indexOf('\nexport ', canonicalStart + 1));
  const canonicalRecords =
    canonicalStart > -1 &&
    /UPDATE organization_users SET role/.test(canonical) &&
    /recordMembershipChange\(|writeChainedAuditRow\(/.test(canonical) &&
    /writeChainedAuditRow\(/.test(membership);
  const viaCanonical = /changeMemberRole\(/.test(handler);
  const writesRoleChange = /UPDATE organization_users SET role/.test(handler) || viaCanonical;
  const recordsIt = /auditScim\(|writeChainedAuditRow\(|INSERT INTO audit_/.test(handler) || (viaCanonical && canonicalRecords);
  const disclosure = /role change (?:made|that arrives) through a SCIM group[^.]*is not recorded/;
  it('the SCIM group handler is where the test thinks it is', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(writesRoleChange).toBe(true);
  });
  it('P1-49: the handler records each role change, through the canonical membership writer', () => {
    expect(viaCanonical, 'the handler calls changeMemberRole').toBe(true);
    expect(canonicalRecords, 'changeMemberRole writes its chained row after the UPDATE').toBe(true);
    expect(recordsIt).toBe(true);
  });
  it.each(['access-review', 'administrative-changes'])('%s states the gap while the handler writes no row, and stops once it writes one', (id) => {
    const text = findReport(id)!.notRecorded.join(' ');
    if (recordsIt) expect(text).not.toMatch(disclosure);
    else expect(text).toMatch(disclosure);
  });
  it('P1-49: the administrative changes report says how a SCIM-group role change is listed', () => {
    const text = findReport('administrative-changes')!.notRecorded.join(' ');
    expect(text).toContain(
      'A role change that arrives through a SCIM group is listed with the role before and after; it has no person as actor, and its reason names the group. Those made before the product began recording them were not recorded.',
    );
  });
});

describe('item 5 — administrative changes: which settings changes are recorded, exactly', () => {
  const text = findReport('administrative-changes')!.notRecorded.join(' ');
  it('tenant configuration is recorded by section and field name, with values only for security and audit-trail retention', () => {
    expect(text).toMatch(/Tenant configuration changes and resets are recorded by section and by the names of the fields changed/);
    expect(text).toMatch(/second-factor requirement/);
    expect(text).toMatch(/session timeout/);
    expect(text).toMatch(/IP restrictions/);
    expect(text).toMatch(/audit-trail retention/);
    expect(text).toMatch(/webhook addresses, are not recorded/);
    expect(text).toMatch(/organisation settings are recorded by section name only/);
  });
  it('P1-41: no longer says a role change, a removal or a tenant configuration change goes unrecorded', () => {
    expect(text).not.toMatch(/organisation role, and a member's removal by an administrator, are not recorded/);
    expect(text).not.toMatch(/Settings changed through the tenant configuration are not recorded/);
  });
  it('P1-41: reads the actions the membership and tenant configuration writers store', () => {
    for (const action of ['member_role_changed', 'member_removed', 'tenant_settings_changed', 'tenant_settings_reset']) {
      expect(ADMINISTRATIVE_ACTIONS).toContain(action);
    }
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
