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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      return ok({ narratives: page, next: { sequence: start + 19, subjectId: subject(start + 19), landedOffset: (start + 20) * 12345, proof: '1'.repeat(64) },
        storeDigest: new URL(url, 'http://localhost').searchParams.get('expectedStoreDigest') ?? undefined,
        landedSha256: new URL(url, 'http://localhost').searchParams.get('expectedLandedSha256') ?? undefined });
    }
    if (url === '/api/csr/jobs/41/narratives' || url.startsWith('/api/csr/jobs/41/narratives?')) {
      return ok({ subjects: [{ subjectId: subject(0), sequence: 0, status: 'composed', contentHash: 'd'.repeat(64),
        qc: { armName: 'Synthetic placebo', categories: ['serious'], events: ['Invented event'], missingFields: ['event1.grade'], prose: 'template' } }],
        storeDigest: new URL(url, 'http://localhost').searchParams.get('expectedStoreDigest') ?? undefined,
        landedSha256: new URL(url, 'http://localhost').searchParams.get('expectedLandedSha256') ?? undefined });
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
  expect(apiRequest).toHaveBeenCalledWith('GET', `/api/csr/jobs/41/narratives/text?limit=20&expectedStoreDigest=${reference.storeDigest}&expectedLandedSha256=${reference.landedSha256}&afterSequence=19&afterSubject=SYN-00020&afterLandedOffset=246900&afterProof=${'1'.repeat(64)}`, undefined);
  // The narrative whose stored text fails its SHA-256 is an alert, not hidden.
  expect(screen.getByRole('alert').textContent).toMatch(/does not match its recorded SHA-256/);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(await screen.findByText(`Narratives 1–20 of ${N}`)).toBeTruthy();
  const qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true;
  fireEvent(qc, new Event('toggle'));
  expect(await within(qc).findByText('Not recorded in the source: event1.grade')).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith('GET', `/api/csr/jobs/41/narratives?limit=20&expectedStoreDigest=${reference.storeDigest}&expectedLandedSha256=${reference.landedSha256}`, undefined);
});

it('shows a refused read as stated, never as an empty list', async () => {
  apiRequest.mockRejectedValue(refusal(403, { error: 'You no longer have access to this project.' }));
  render(<CsrNarrativeReferenceView reference={reference} />);
  expect((await screen.findByRole('alert')).textContent).toBe('You no longer have access to this project.');
  expect(screen.queryByRole('list', { name: 'Stored narratives' })).toBeNull();
});

it.each([undefined, 'e'.repeat(64)])('does not display text when the page does not acknowledge the imported store (%s)', async storeDigest => {
  apiRequest.mockResolvedValue(ok({ narratives: [{ ...narrative(0), text: 'UNVERIFIED REBUILT NARRATIVE' }], next: null, storeDigest, landedSha256: reference.landedSha256 }));
  render(<CsrNarrativeReferenceView reference={reference} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/version|store|reference/i);
  expect(screen.queryByText('UNVERIFIED REBUILT NARRATIVE')).toBeNull();
  expect(screen.queryByRole('list', { name: 'Stored narratives' })).toBeNull();
});

it.each([undefined, 'e'.repeat(64)])('does not display QC when it does not acknowledge the imported store (%s)', async storeDigest => {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.includes('/narratives/text')) return ok({ narratives: [narrative(0)], next: null, storeDigest: reference.storeDigest, landedSha256: reference.landedSha256 });
    return ok({ subjects: [{ subjectId: subject(0), sequence: 0, status: 'composed', contentHash: 'd'.repeat(64),
      qc: { armName: 'Synthetic placebo', categories: ['serious'], events: ['UNVERIFIED REBUILT QC'], missingFields: [], prose: 'template' } }], storeDigest, landedSha256: reference.landedSha256 });
  });
  render(<CsrNarrativeReferenceView reference={reference} />);
  await screen.findByText(`Narratives 1–1 of ${N}`);
  const qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true; fireEvent(qc, new Event('toggle'));
  expect((await within(qc).findByRole('alert')).textContent).toMatch(/version|store|reference/i);
  expect(within(qc).queryByText('UNVERIFIED REBUILT QC')).toBeNull();
  expect(within(qc).queryByRole('list', { name: 'Narrative QC' })).toBeNull();
});

it('keeps the imported digest on later pages and shows a changed-store refusal without newer text', async () => {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.includes('afterSequence=')) throw refusal(409, { code: 'CSR_NARRATIVE_REFERENCE_CHANGED',
      error: 'The narrative store changed after this section was imported. Reimport the section before reading the narratives.' });
    return ok({ narratives: Array.from({ length: 20 }, (_, i) => narrative(i)),
      next: { sequence: 19, subjectId: subject(19), landedOffset: 246900, proof: '1'.repeat(64) },
      storeDigest: reference.storeDigest, landedSha256: reference.landedSha256 });
  });
  render(<CsrNarrativeReferenceView reference={reference} />);
  await screen.findByText(`Narratives 1–20 of ${N}`);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/changed after this section was imported/);
  expect(screen.queryByRole('list', { name: 'Stored narratives' })).toBeNull();
  const paths = apiRequest.mock.calls.map((call: unknown[]) => String(call[1]));
  expect(paths.every((url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    return params.get('expectedStoreDigest') === reference.storeDigest && params.get('expectedLandedSha256') === reference.landedSha256;
  })).toBe(true);
});

it('resets the page and retires old text when the imported reference changes for the same build', async () => {
  serve();
  const view = render(<CsrNarrativeReferenceView reference={reference} />);
  await screen.findByText(`Narratives 1–20 of ${N}`);
  const qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true; fireEvent(qc, new Event('toggle'));
  await within(qc).findByText('Not recorded in the source: event1.grade');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText(`Narratives 21–40 of ${N}`);
  const replacement = { ...reference, storeDigest: 'f'.repeat(64) };
  view.rerender(<CsrNarrativeReferenceView reference={replacement} />);
  expect(screen.queryByText(`Narratives 21–40 of ${N}`)).toBeNull();
  expect(screen.queryByText('Not recorded in the source: event1.grade')).toBeNull();
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET',
    `/api/csr/jobs/41/narratives/text?limit=20&expectedStoreDigest=${replacement.storeDigest}&expectedLandedSha256=${replacement.landedSha256}`, undefined));
  expect(await screen.findByText(`Narratives 1–20 of ${N}`)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([undefined, 'e'.repeat(64)])('does not display text without the imported landed-section acknowledgment (%s)', async landedSha256 => {
  apiRequest.mockResolvedValue(ok({ narratives: [{ ...narrative(0), text: 'UNVERIFIED LANDED TEXT' }], next: null,
    storeDigest: reference.storeDigest, landedSha256 }));
  render(<CsrNarrativeReferenceView reference={reference} />);
  expect((await screen.findByRole('alert')).textContent).toMatch(/version|store|reference/i);
  expect(screen.queryByText('UNVERIFIED LANDED TEXT')).toBeNull();
});

it.each([undefined, 'e'.repeat(64)])('does not display QC without the imported landed-section acknowledgment (%s)', async landedSha256 => {
  apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/narratives/text')
    ? ok({ narratives: [narrative(0)], next: null, storeDigest: reference.storeDigest, landedSha256: reference.landedSha256 })
    : ok({ subjects: [{ subjectId: subject(0), sequence: 0, status: 'composed', contentHash: 'd'.repeat(64),
      qc: { armName: 'Synthetic placebo', categories: ['serious'], events: ['UNVERIFIED LANDED QC'], missingFields: [], prose: 'template' } }],
    storeDigest: reference.storeDigest, landedSha256 }));
  render(<CsrNarrativeReferenceView reference={reference} />);
  await screen.findByText(`Narratives 1–1 of ${N}`);
  const qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true; fireEvent(qc, new Event('toggle'));
  expect((await within(qc).findByRole('alert')).textContent).toMatch(/version|store|reference/i);
  expect(within(qc).queryByText('UNVERIFIED LANDED QC')).toBeNull();
});

it('reads only visible-page QC with the same sealed cursor and clears the preceding page QC', async () => {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    const start = Number(params.get('afterSequence') ?? -1) + 1;
    const pins = { storeDigest: reference.storeDigest, landedSha256: reference.landedSha256 };
    if (url.includes('/narratives/text')) return ok({ ...pins, narratives: Array.from({ length: 20 }, (_, k) => narrative(start + k)),
      next: { sequence: start + 19, subjectId: subject(start + 19), landedOffset: (start + 20) * 12345, proof: '1'.repeat(64) } });
    return ok({ ...pins, subjects: Array.from({ length: 20 }, (_, k) => ({ subjectId: subject(start + k), sequence: start + k, status: 'composed',
      contentHash: 'd'.repeat(64), qc: { armName: 'Synthetic placebo', categories: ['serious'], events: [`Visible page QC ${start + k}`], missingFields: [], prose: 'template' } })) });
  });
  render(<CsrNarrativeReferenceView reference={reference} />);
  await screen.findByText(`Narratives 1–20 of ${N}`);
  let qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true; fireEvent(qc, new Event('toggle'));
  await within(qc).findByText('Visible page QC 0');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText(`Narratives 21–40 of ${N}`);
  expect(screen.queryByText('Visible page QC 0')).toBeNull();
  qc = screen.getByText(/^Narrative QC list/).closest('details')!;
  qc.open = true; fireEvent(qc, new Event('toggle'));
  await within(qc).findByText('Visible page QC 20');
  expect(within(qc).getAllByRole('listitem')).toHaveLength(20);
  expect(apiRequest).toHaveBeenCalledWith('GET', `/api/csr/jobs/41/narratives?limit=20&expectedStoreDigest=${reference.storeDigest}&expectedLandedSha256=${reference.landedSha256}&afterSequence=19&afterSubject=SYN-00020&afterLandedOffset=246900&afterProof=${'1'.repeat(64)}`, undefined);
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
