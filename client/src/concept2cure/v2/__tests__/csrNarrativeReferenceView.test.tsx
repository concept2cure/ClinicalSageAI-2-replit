// @vitest-environment jsdom
/**
 * §14.3.3 by reference (2026-10-30): an Authoring copy of a saved CSR holds the
 * narratives as a reference to the build's narrative store. The editor shows
 * that section read-only with the reference's narrative count, the stored
 * narratives a page at a time (Previous returns exactly), a stored narrative
 * that fails its SHA-256 as an alert, and the QC list. A read error is shown as
 * stated, never as an empty list. SYNTHETIC data.
 */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrNarrativeReferenceView, narrativeReferenceFor } from '../editor/CsrNarrativeReferenceView';
import type { DocumentProvenance } from '../editor/provenance';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
afterEach(() => { cleanup(); apiRequest.mockReset(); });

const N = 1_500;
const reference = { schema: 'c2c.csr-narrative-reference.v1' as const, jobId: 41, sectionNumber: '14.3.3' as const, narratives: N,
  storeDigest: 'a'.repeat(64), landedSha256: 'b'.repeat(64), landedLength: 2_150_000, openingSha256: 'c'.repeat(64) };
const subject = (i: number) => `SYN-${String(i + 1).padStart(5, '0')}`;
const narrative = (i: number) => ({ subjectId: subject(i), sequence: i, armName: 'Synthetic placebo', events: ['Invented event'], categories: ['serious'],
  text: `Invented narrative of subject ${subject(i)}.`, contentHash: 'd'.repeat(64), verified: i !== 21 });

function serve() {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/csr/jobs/41/narratives/text')) {
      const after = /afterSequence=(\d+)/.exec(url);
      const start = after ? Number(after[1]) + 1 : 0;
      const page = Array.from({ length: 20 }, (_, k) => narrative(start + k));
      return ok({ narratives: page, next: { sequence: start + 19, subjectId: subject(start + 19) } });
    }
    if (url === '/api/csr/jobs/41/narratives') {
      return ok({ subjects: [{ subjectId: subject(0), sequence: 0, status: 'composed', contentHash: 'd'.repeat(64),
        qc: { armName: 'Synthetic placebo', categories: ['serious'], events: ['Invented event'], missingFields: ['event1.grade'], prose: 'template' } }] });
    }
    return ok({});
  });
}

it('shows the reference with its narrative count, the stored narratives a page at a time, and the QC list', async () => {
  serve();
  render(<CsrNarrativeReferenceView reference={reference} />);
  expect(screen.getByText(`${N} patient narratives`)).toBeTruthy();
  expect(screen.getByText(/held in the narrative store of CSR build 41, not copied into this document/)).toBeTruthy();
  expect(await screen.findByText(`Narratives 1–20 of ${N}`)).toBeTruthy();
  expect(within(screen.getByRole('list', { name: 'Stored narratives' })).getAllByRole('listitem')).toHaveLength(20);
  expect(screen.getByText('Invented narrative of subject SYN-00001.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText(`Narratives 21–40 of ${N}`)).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith('GET', '/api/csr/jobs/41/narratives/text?limit=20&afterSequence=19&afterSubject=SYN-00020', undefined);
  // The narrative whose stored text fails its SHA-256 is an alert, not hidden.
  expect(screen.getByRole('alert').textContent).toMatch(/does not match its recorded SHA-256/);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(await screen.findByText(`Narratives 1–20 of ${N}`)).toBeTruthy();
  const qc = screen.getByText('Narrative QC list').closest('details')!;
  qc.open = true;
  fireEvent(qc, new Event('toggle'));
  expect(await within(qc).findByText('Not recorded in the source: event1.grade')).toBeTruthy();
});

it('shows a refused read as stated, never as an empty list', async () => {
  apiRequest.mockRejectedValue(refusal(403, { error: 'You no longer have access to this project.' }));
  render(<CsrNarrativeReferenceView reference={reference} />);
  expect((await screen.findByRole('alert')).textContent).toBe('You no longer have access to this project.');
  expect(screen.queryByRole('list', { name: 'Stored narratives' })).toBeNull();
});

it('finds the reference only on the section the import holds by reference', () => {
  const source = { kind: 'csr', id: '41', programId: '11111111-1111-4111-8111-111111111111', title: 'T', documentType: null, sectionCode: null, fingerprint: 'e'.repeat(64),
    selection: { kind: 'csr', jobId: 41 }, gaps: [], version: null, conversion: 'ich-e3-sections', sourceScope: { level: 'project', programId: null, projectId: 11 },
    association: { mode: 'recorded', reason: null }, warnings: [], reason: 'Import the saved CSR',
    sectionOrigins: [{ code: '13', sourceRowId: 'csr_section_outputs:1', contentSha256: 'f'.repeat(64), originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' },
      { code: '14.3.3', sourceRowId: 'csr_section_outputs:2', contentSha256: 'c'.repeat(64), originalAuthorship: 'template', model: null, modelEvidence: 'unrecorded', narrativeReference: reference }],
  } as unknown as DocumentProvenance['importSource'];
  expect(narrativeReferenceFor(source, '14.3.3')).toEqual(reference);
  expect(narrativeReferenceFor(source, '13')).toBeNull();
  // A malformed reference is not shown as one.
  const forged = { ...source!, sectionOrigins: [{ code: '14.3.3', narrativeReference: { ...reference, storeDigest: 'not a digest' } }] } as unknown as DocumentProvenance['importSource'];
  expect(narrativeReferenceFor(forged, '14.3.3')).toBeNull();
});
