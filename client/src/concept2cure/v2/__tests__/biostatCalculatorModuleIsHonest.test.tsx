// @vitest-environment jsdom
/**
 * A calculator result is not filed under a CTD module the filing does not have.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every one of the 29 calculator hand-offs passed `module: 'M5'`
 * (BiostatWorkbench.tsx:372, hardcoded since 2026-07-21), including the eleven
 * CLSI calculators in `biostatCalculatorsIvd.ts`, which serve 510(k), De Novo,
 * PMA and IVDR filings. **A 510(k) has no CTD Module 5.** It files an eSTAR,
 * and the placement catalog says exactly that: every device placement in
 * `server/services/biostatistics-bridge/filing-placement.ts` is an `ESTAR(...)`
 * rule whose `module` is `null`, and `BridgePlacement.module` is typed
 * `'M1' | … | 'M5' | null` for that reason.
 *
 * That catalog's own header records this as the defect it was written to end:
 * "the surface hard-coded `module: 'M5'` for everything, DSMB charter and …".
 * The sibling surface was fixed (`Biostatistics.tsx` derives `filingModule`
 * from the catalog); the calculators never were, and could not be while they
 * lived on a stateless second surface with no project in scope. The 2026-11-09
 * merge put them on the surface that holds the project, which is what makes
 * this fixable at all.
 *
 * `module` is `text('module')` whose own column comment reads "ind-wizard,
 * coauthor, cmc, etc.", and the values already in use include
 * 'Risk-based monitoring' and 'eCTD co-author' — so saying what is true is
 * within the column's declared purpose, and nothing parses it into a CTD
 * placement (the eSTAR and PMA mappers place by their own keys).
 *
 * RED before the fix: both device cases send 'M5'.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DesignCalculatorsSection } from '../surfaces/BiostatWorkbench';
import { C2CToast, useToast } from '../toast';

function Harness({ deviceProject }: { deviceProject?: boolean }) {
  const [toast, fireToast] = useToast();
  return (
    <div className="page-inner">
      <DesignCalculatorsSection fireToast={fireToast} deviceProject={deviceProject} />
      <C2CToast msg={toast} />
    </div>
  );
}

const PROGRAM = '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60';
const setProject = (p: unknown) => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = p; };

const docReceipt = (id: string, req: any) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, document: { id, title: req.title, client_program_id: req.client_program_id } }) }) as Response;
const sectionReceipt = (id: string, req: any) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, section: { id, doc_id: req.doc_id, code: req.code, title: req.title } }) }) as Response;

/** The CLSI 2×2 engine's own answer shape, enough to render rows. */
const ACCURACY = {
  sensitivity: { estimate: 0.9, lower: 0.823, upper: 0.951 },
  specificity: { estimate: 0.925, lower: 0.858, upper: 0.966 },
  provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', method: 'clsi-ep12-2x2', inputsSha256: 'a'.repeat(64), reproducible: true },
};

beforeEach(() => {
  setProject({ id: PROGRAM });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string, body?: any) => {
    if (url === '/api/diagnostics-performance/clinical/accuracy') {
      return { ok: true, status: 200, json: async () => ({ result: ACCURACY }) } as Response;
    }
    if (url === '/api/biostat/assurance') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: {
        assurance: 0.771146,
        provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', method: 'assurance-two-sample-means', inputsSha256: 'b'.repeat(64), reproducible: true },
      } }) } as Response;
    }
    if (url === '/api/authoring/docs') return docReceipt('doc-1', body);
    if (url === '/api/authoring/sections') return sectionReceipt('sec-1', body);
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
  });
});
afterEach(() => { cleanup(); setProject(undefined); });

const fill = (label: RegExp, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

/** Open the CLSI 2×2 engine, compute, and file the result. */
async function fileAccuracyResult(deviceProject?: boolean) {
  render(<Harness deviceProject={deviceProject} />);
  fireEvent.click(screen.getByRole('button', { name: 'Clinical accuracy (2×2)' }));
  fill(/True positives/, '90');
  fill(/False positives/, '8');
  fill(/False negatives/, '10');
  fill(/True negatives/, '99');
  fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));
  await waitFor(() => {
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs'), 'no document create happened').toBeTruthy();
  });
  return apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs')![2];
}

/** Open a drug design engine, compute, and file the result. */
async function fileAssuranceResult(deviceProject?: boolean) {
  render(<Harness deviceProject={deviceProject} />);
  fireEvent.click(screen.getByRole('button', { name: 'Assurance (Bayesian power)' }));
  fill(/Prior mean effect/, '0.4');
  fill(/^Prior SD/, '0.15');
  fill(/^n per arm/, '120');
  fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));
  await waitFor(() => {
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs'), 'no document create happened').toBeTruthy();
  });
  return apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs')![2];
}

/* The other direction, so the repair cannot be satisfied by never saying M5:
   a drug design engine in a drug project still files to CTD Module 5, which is
   what it has done since 2026-07-21 and what the placement catalog's own
   fallback keeps ("the authoring hand-off then keeps its historical M5"). */
describe('a drug design engine result', () => {
  it('still files to CTD Module 5 in a drug project', async () => {
    const doc = await fileAssuranceResult(false);
    expect(doc.module).toBe('M5');
  });

  it('follows the project when the project is a device one', async () => {
    const doc = await fileAssuranceResult(true);
    expect(doc.module).not.toBe('M5');
  });
});

describe('a CLSI calculator result', () => {
  it('is not filed under CTD Module 5 — a 510(k) has none', async () => {
    const doc = await fileAccuracyResult(true);
    expect(doc.module, 'a device analytical-performance result claimed CTD Module 5').not.toBe('M5');
  });

  it('says where it does belong, rather than leaving the module blank', async () => {
    const doc = await fileAccuracyResult(true);
    expect(String(doc.module)).toMatch(/\S/);
    expect(String(doc.module)).toMatch(/eSTAR/i);
  });

  it('is a device result even in a drug project: CLSI analytical performance is not a clinical study report', async () => {
    const doc = await fileAccuracyResult(false);
    expect(doc.module).not.toBe('M5');
  });

  it('still files into the open project', async () => {
    const doc = await fileAccuracyResult(true);
    expect(doc).toMatchObject({ client_program_id: PROGRAM });
  });
});
