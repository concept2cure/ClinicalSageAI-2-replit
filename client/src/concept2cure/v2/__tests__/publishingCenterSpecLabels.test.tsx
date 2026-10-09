// @vitest-environment jsdom
/**
 * PublishingCenter — the "Qualified against" table names specifications, not
 * API keys.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * The table read "Fda Regional Ig" and "Controlled Vocab": each key of
 * GET /api/ectd/qualification/spec-versions split on capitals and title-cased
 * with CSS (`textTransform: 'capitalize'`). The v3.2.2 coded-attribute table
 * had the same split without the capitalisation ("application Type").
 *
 * SPEC_VERSIONS below is the response the dev server returned
 * (server/services/ectd/qualification/qualify.ts SPEC_VERSIONS).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { PublishingCenter } from '../surfaces/PublishingCenter';

const SPEC_VERSIONS = {
  'v3.2.2': {
    ichBackbone: 'ICH eCTD v3.2.2',
    fdaRegionalDtd: 'FDA US Regional DTD v3.3 (eCTD Backbone Files Specification for Module 1)',
    validationCriteria: 'FDA Specifications for eCTD Validation Criteria v4.5 (2025-10-01)',
    fileFormats: 'FDA Specifications for File Format Types v9.3 (2025-08-20)',
    transmission: 'FDA Transmitting eCTD Submissions v2.0 (2026-07)',
  },
  'v4.0': {
    message: 'ICH eCTD v4.0 / HL7 RPS message (PORP_IN000001UV)',
    fdaRegionalIg: 'FDA eCTD v4.0 Regional IG OID 2.16.840.1.113883.3.989.5.1.2.2.1.18.8',
    controlledVocab: 'FDA eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06)',
    validationCriteria: 'FDA Specifications for eCTD v4.0 Validation Criteria v1.5',
  },
};
const LISTING = {
  regionalIgOid: '2.16.840.1.113883.3.989.5.1.2.2.1.18.8',
  v4: [{ id: 'contextOfUse', shortName: 'contextOfUse', oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6', codeCount: 1 }],
  v3: [
    { id: 'applicationType', codeCount: 5 },
    { id: 'submissionSubType', codeCount: 7 },
    { id: 'applicantContactType', codeCount: 3 },
  ],
};
const CODES = {
  id: 'contextOfUse',
  shortName: 'contextOfUse',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6',
  codes: [{ code: 'us_1.1', description: 'm1.1 forms' }],
};

const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b } as Response);
const props = () => ({ surface: { id: 'ectd-publishing', label: 'Publishing' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

/** The first-column text of every row of the "Qualified against" table. */
function specLabels(): string[] {
  const table = Array.from(document.querySelectorAll('table.reg-tbl')).find((t) =>
    (t.querySelector('thead')?.textContent ?? '').includes('Version qualified against'),
  );
  return Array.from(table?.querySelectorAll('tbody tr td:first-child') ?? []).map((td) => td.textContent ?? '');
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/ectd/qualification/spec-versions') return ok(SPEC_VERSIONS);
    if (url === '/api/ectd/controlled-vocab') return ok(LISTING);
    if (url.startsWith('/api/ectd/controlled-vocab/')) return ok(CODES);
    return ok({});
  });
});
afterEach(() => cleanup());

describe('PublishingCenter — specification names', () => {
  it('names the v4.0 specifications, not their API keys', async () => {
    render(<PublishingCenter {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(4));
    const labels = specLabels();
    for (const raw of ['Regional Ig', 'Controlled Vocab', 'fda Regional', 'controlled Vocab']) {
      expect(labels.join(' | '), `a split API key reached the table: ${raw}`).not.toContain(raw);
    }
    expect(labels).toEqual(['Message', 'FDA regional IG', 'Controlled vocabulary', 'Validation criteria']);
    // The styling that title-cased a raw key is gone too — a label is shown as written.
    const firstCell = document.querySelector<HTMLElement>('table.reg-tbl tbody tr td:first-child');
    expect(firstCell?.style.textTransform ?? '').toBe('');
  });

  it('names the v3.2.2 specifications and coded-attribute lists in sentence case', async () => {
    render(<PublishingCenter {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(4));
    fireEvent.change(screen.getByDisplayValue(/eCTD v4\.0/), { target: { value: 'v3.2.2' } });
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    expect(specLabels()).toEqual(['ICH backbone', 'FDA regional DTD', 'Validation criteria', 'File formats', 'Transmission']);

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/application Type|submission Sub Type|applicant Contact Type/);
    expect(body).toContain('Application type');
    expect(body).toContain('Submission sub type');
    expect(body).toContain('Applicant contact type');
  });
});
