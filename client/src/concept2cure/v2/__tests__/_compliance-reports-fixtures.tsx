/**
 * Fixtures and mount helpers shared by the two compliance-reports suites
 * (complianceReports.test.tsx, complianceReportsReview.test.tsx). Every body
 * here is in the shape GET /api/audit/reports and GET /api/audit/reports/:id
 * answer (server/services/audit/compliance-reports/types.ts). The mocks
 * themselves stay in each test file, because `vi.mock` is hoisted per file.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ComplianceReports } from '../surfaces/ComplianceReports';

export const READERS = 'organisation owners, admins and managers, and platform administrators';

export const CATALOG = {
  success: true,
  canRun: true,
  readers: READERS,
  reports: [
    {
      id: 'access-review',
      title: 'User access review',
      purpose: 'Every member who can sign in, with their role and second factor.',
      basis: ['21 CFR 11.10(d)', 'SOC 2 CC6.2'],
      period: 'as-of',
      sections: [{ key: 'members', title: 'Members' }],
      notRecorded: ['Removed members leave no membership row.'],
    },
    {
      id: 'authentication-events',
      title: 'Sign-in and session events',
      purpose: 'Every sign-in, sign-out and second-factor event in the period.',
      basis: ['21 CFR 11.300(d)', 'HIPAA 164.312(b)'],
      period: 'range',
      sections: [
        { key: 'events', title: 'Events' },
        { key: 'summary', title: 'Summary' },
      ],
      notRecorded: ['Catalog-level note about session ends.'],
    },
    {
      id: 'audit-trail-integrity',
      title: 'Audit trail integrity attestation',
      purpose: 'What each integrity check found when the report was run.',
      basis: ['21 CFR 11.10(e)'],
      period: 'range',
      sections: [
        { key: 'stores', title: 'Audit stores' },
        { key: 'verdicts', title: 'Integrity checks' },
      ],
      notRecorded: [],
    },
    {
      id: 'audit-trail',
      title: 'Full audit trail',
      purpose: 'Every recorded event, as the signed export.',
      basis: ['21 CFR 11.10(e)'],
      period: 'range',
      sections: [],
      notRecorded: [],
      endpoint: '/api/audit/export/signed',
    },
  ],
};

export const NOT_CHECKED = {
  ok: null,
  scope: 'not-checked',
  reason: 'This report does not walk the audit chain.',
};

export const SECTIONED = {
  report: { id: 'authentication-events', title: 'Sign-in and session events', version: 1 },
  organizationId: 7,
  period: { from: '2026-07-03', to: '2026-10-01', kind: 'range' },
  generatedAt: '2026-10-01T09:00:00Z',
  chain: NOT_CHECKED,
  sections: [
    {
      key: 'events',
      title: 'Events',
      columns: [
        { key: 'occurred_at', label: 'When' },
        { key: 'action', label: 'Action' },
        { key: 'outcome', label: 'Outcome' },
      ],
      rows: [{ occurred_at: '2026-09-30T10:00:00Z', action: 'user_login', outcome: 'success' }],
      rowCount: 1,
      truncated: false,
      notes: ['Times are UTC.'],
    },
    {
      key: 'summary',
      title: 'Summary',
      columns: [
        { key: 'action', label: 'Action' },
        { key: 'count', label: 'Count' },
      ],
      rows: [],
      rowCount: 0,
      truncated: false,
    },
  ],
  notRecorded: ['Idle-timeout session ends are not recorded.'],
};

export const HASH = 'ab12cd34ef56' + '0'.repeat(52);
export const MANIFEST = {
  manifestVersion: 2,
  exportId: 'CR-EXPORT-1',
  kind: 'compliance-report',
  generatedAt: '2026-10-01T09:00:00Z',
  generatedBy: 'Ada Lovelace',
  generatedByRole: 'admin',
  sections: [
    { key: 'events', rowCount: 1, truncated: false },
    { key: 'summary', rowCount: 0, truncated: false },
  ],
  dataHash: HASH,
  hashAlgorithm: 'SHA-256',
  signingKeyId: 'k1',
  chainAtGeneration: NOT_CHECKED,
};
export const VERIFICATION = { algorithm: 'HMAC-SHA256', signingKeyId: 'k1', instruction: 'Verify the HMAC.' };

export function exportBody(data: unknown, manifest: Record<string, unknown> = MANIFEST) {
  return {
    success: true,
    export: {
      data: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      manifest,
      signature: 'f'.repeat(64),
      filename: 'report.json',
      contentType: 'application/json',
      verification: VERIFICATION,
    },
  };
}

/** The integrity attestation's data, with its verdict rows and chain statement. */
export function integrityData(chain: Record<string, unknown>, verdicts: Record<string, unknown>[]) {
  return {
    report: { id: 'audit-trail-integrity', title: 'Audit trail integrity attestation', version: 1 },
    organizationId: 7,
    period: { from: '2026-07-03', to: '2026-10-01', kind: 'range' },
    generatedAt: '2026-10-01T09:00:00Z',
    chain,
    sections: [
      {
        key: 'verdicts',
        title: 'Integrity checks',
        columns: [
          { key: 'check', label: 'Check' },
          { key: 'verdict', label: 'Verdict' },
          { key: 'rows_checked', label: 'Rows checked' },
          { key: 'detail', label: 'Detail' },
        ],
        rows: verdicts,
        rowCount: verdicts.length,
        truncated: false,
      },
    ],
    notRecorded: [],
  };
}

export const ok = (body: unknown) => ({ ok: true, status: 200, body, networkError: false });
export const fail = (status: number, body: unknown) => ({ ok: false, status, body, networkError: false });

const noop = () => {};
export function mount() {
  return render(
    <ComplianceReports
      {...({ surface: { id: 'compliance-reports' }, onAsk: noop, onNav: noop, segment: 'biotech' } as unknown as React.ComponentProps<
        typeof ComplianceReports
      >)}
    />,
  );
}

export async function selectReport(name: RegExp) {
  const card = await screen.findByRole('button', { name });
  fireEvent.click(card);
}

/** Click inside act so the run's resolution lands before the next assertion. */
export async function runSelected() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  });
}

/** Click inside act, for a control whose handler awaits a request. */
export async function clickAndSettle(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}
