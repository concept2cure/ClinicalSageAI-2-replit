// @vitest-environment jsdom
/**
 * AnA drives the wave-3 screens — wiring proof against the REAL Risk,
 * TemplateLibrary, and ArtifactsCenter surfaces: registration under the
 * identity-mapped ids, genuine DOM effects through the surfaces' own state,
 * honest refusals on misses and empty cells, and the retry-hold across a
 * loading read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Risk } from '../surfaces/Risk';
import { TemplateLibrary } from '../surfaces/TemplateLibrary';
import { ArtifactsCenter } from '../surfaces/AdminSurfaces';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function directive(actionId: string, params: Record<string, unknown> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
const props = () =>
  ({ surface: { id: 'x', label: 'X' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' });

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

/* ── Risk ────────────────────────────────────────────────────────────────── */

const RISK_ROWS = [
  {
    id: 1, ref_code: 'HZ-01', hazard: 'Electrical shock', hazardous_situation: 'Damaged insulation',
    harm: 'Burn injury', sequence_of_events: null, severity: 4, probability: 3,
    detectability: 2, residual_probability: 1, control_strategy: 'design_reduce',
    source: 'fmea', status: 'open', acceptable: null,
  },
  {
    id: 2, ref_code: 'HZ-02', hazard: 'Software freeze mid-procedure', hazardous_situation: null,
    harm: 'Delayed therapy', sequence_of_events: null, severity: 3, probability: 2,
    detectability: 3, residual_probability: 2, control_strategy: 'protective_measure',
    source: 'complaint', status: 'mitigating', acceptable: null,
  },
];

describe('Risk — AnA operates the real risk file', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/mdx/risk-items') return ok({ data: RISK_ROWS });
      return ok({ data: [] });
    });
  });

  it('registers under "risk"; select-hazard opens the named hazard; set-matrix-view switches bands', async () => {
    render(<Risk {...props()} />);
    await screen.findAllByText(/Electrical shock/);
    await waitFor(() => expect(registeredSurfaceId()).toBe('risk'));

    let outcome: { status: string; detail?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('risk.select-hazard', { hazard: 'software freeze' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('HZ-02');

    act(() => {
      outcome = applySurfaceAction(
        directive('risk.set-matrix-view', { view: 'residual' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Showing the residual matrix' });
  });

  it('focus-cell opens the hazard sitting at a band pair, and an empty cell is an honest miss', async () => {
    render(<Risk {...props()} />);
    await screen.findAllByText(/Electrical shock/);
    await waitFor(() => expect(registeredSurfaceId()).toBe('risk'));

    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('risk.focus-cell', { severity: 'Critical', probability: 'Occasional' }),
        vi.fn(),
      ) as typeof outcome;
    });
    // HZ-01: severity 4 → 'Critical', probability 3 → 'Occasional' (initial view).
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('HZ-01');

    act(() => {
      outcome = applySurfaceAction(
        directive('risk.focus-cell', { severity: 'Catastrophic', probability: 'Frequent' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No hazard sits at Catastrophic × Frequent');
  });
});

/* ── TemplateLibrary ─────────────────────────────────────────────────────── */

const SPEC = {
  specVersion: 1,
  page: { size: 'Letter', orientation: 'portrait', marginsInches: { top: 1, bottom: 1, left: 1, right: 1 } },
  typography: { bodyFont: 'Calibri', headingFont: 'Calibri', monoFont: 'Consolas', bodySizePt: 11, heading1SizePt: 16, heading2SizePt: 13, heading3SizePt: 12, lineSpacing: 1.15, paragraphSpaceAfterPt: 6 },
  colors: { text: '#111', muted: '#667085', accent: '#0d6efd', tableHeaderBg: '#f2f4f7', tableBorder: '#d0d5dd' },
  brand: { organizationName: 'ACME', confidentialityNotice: 'Confidential', logo: { present: false, placement: 'header-left' } },
  header: { text: 'ACME', showLogo: false, alignment: 'left' },
  footer: { text: '', showPageNumbers: true, pageNumberFormat: 'Page X of Y' },
  table: { headerBold: true, borderSizePt: 0.5 },
  formFields: [], namedStyles: [],
};
const TEMPLATES = {
  data: [
    { id: 'tpl-1', name: 'CSR shell', description: '', sourceFileName: 'csr.docx', sourceFileType: 'docx', verified: true, extractionConfidence: 0.92, extractionWarnings: [], docTypes: ['CSR'], updatedAt: 'today', spec: SPEC },
    { id: 'tpl-2', name: 'Protocol shell', description: '', sourceFileName: null, sourceFileType: null, verified: false, extractionConfidence: null, extractionWarnings: [], docTypes: ['Protocol'], updatedAt: 'today', spec: SPEC },
  ],
};

describe('TemplateLibrary — AnA operates the real library', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/c2c/templates') return ok(TEMPLATES);
      return ok({ data: [] });
    });
  });

  it('registers under "template-library"; select-template + open-tab drive the real selection', async () => {
    render(<TemplateLibrary {...props()} />);
    await screen.findAllByText('CSR shell');
    await waitFor(() => expect(registeredSurfaceId()).toBe('template-library'));

    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('template-library.select-template', { template: 'protocol' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('Protocol shell');

    act(() => {
      outcome = applySurfaceAction(
        directive('template-library.open-tab', { tab: 'styles' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Opened the styles tab' });

    act(() => {
      outcome = applySurfaceAction(
        directive('template-library.select-template', { template: 'nonexistent shell' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No template named');
  });
});

/* ── ArtifactsCenter ─────────────────────────────────────────────────────── */

const ARTIFACTS = {
  data: [
    { id: 'a-1', name: 'SAP v2 draft', kind: 'document', fmt: 'docx', size: '48 KB', model: 'AnA', when: '2h ago', ver: 'v2', sig: 'unsigned', prog: 'BX-204' },
    { id: 'a-2', name: 'CRL response memo', kind: 'document', fmt: 'pdf', size: '112 KB', model: 'AnA', when: '1d ago', ver: 'v1', sig: 'signed', prog: 'BX-204' },
  ],
};

describe('ArtifactsCenter — AnA focuses artifacts by name', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/artifacts-center') return ok(ARTIFACTS);
      return ok({ data: [] });
    });
  });

  it('registers under "artifacts-center"; focus drives the SAME highlight the follow-the-work hand-off drives', async () => {
    const { container } = render(<ArtifactsCenter {...props()} />);
    await screen.findByText('SAP v2 draft');
    await waitFor(() => expect(registeredSurfaceId()).toBe('artifacts-center'));

    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('artifacts-center.focus-artifact', { artifact: 'crl response' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Focused CRL response memo' });
    await waitFor(() => expect(container.querySelector('.is-focus')).not.toBeNull());

    act(() => {
      outcome = applySurfaceAction(
        directive('artifacts-center.focus-artifact', { artifact: 'ghost doc' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No artifact named');
  });
});
