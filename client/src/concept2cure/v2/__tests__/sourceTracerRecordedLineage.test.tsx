// @vitest-environment jsdom
/**
 * SourceTracer — recorded lineage only.
 *
 * The surface reads GET /api/source-tracer/sections, which serves RECORDED
 * canonical-source citations (authoring_citations → cre_evidence_sources).
 * Every state shown is computed server-side from stored checksums.
 *
 * What these tests pin, in order of consequence:
 *   - the surface renders recorded citations and their server-computed standing,
 *     and computes nothing itself;
 *   - a changed source is REPORTED with both checksums, and the offered action
 *     asks what changed — it does not redraft;
 *   - a citation whose source no longer resolves stays visible, because "cites
 *     something unavailable" must not read as "cites nothing";
 *   - no confidence percentage is rendered anywhere — nothing here is a
 *     similarity guess, so there is nothing to be confident about;
 *   - a failed read is a failed read, never an empty library.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SourceTracer } from '../surfaces/SourceTracer';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

function citedSource(over: Record<string, unknown> = {}) {
  return {
    citationId: 'cite-1',
    state: 'current',
    citedAt: '2026-07-20T00:00:00Z',
    citationText: null,
    citedChecksum: 'aaaa1111bbbb2222cccc',
    sourceId: 5,
    sourceTitle: 'protocol-v2.pdf',
    currentChecksum: 'aaaa1111bbbb2222cccc',
    extractionStatus: 'extracted',
    mimeType: 'application/pdf',
    ...over,
  };
}

function section(over: Record<string, unknown> = {}) {
  return {
    id: 'sec-1',
    doc: 'CTD 3.2.P',
    sec: 'P.1',
    sectionTitle: 'Composition',
    module: 'M3',
    status: 'draft',
    sources: [citedSource()],
    ...over,
  };
}

const props = () => ({ surface: { id: 'source-tracer', label: 'Tracer' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

function mockSections(sections: unknown[], status = 200) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/source-tracer/sections') {
      return status < 400
        ? ok({ success: true, data: { sections, total: (sections as unknown[]).length } })
        : ok({ success: false, error: 'CITATION_STORE_MISSING' }, status);
    }
    return ok({});
  });
}

afterEach(() => cleanup());

describe('SourceTracer — recorded lineage', () => {
  it('renders recorded citations with their server-computed standing', async () => {
    mockSections([section()]);
    render(<SourceTracer {...props()} />);

    expect(await screen.findByText('protocol-v2.pdf')).toBeTruthy();
    expect(screen.getByText('matches the source record as stored')).toBeTruthy();
    // The recorded content identity is shown, truncated.
    expect(screen.getByText(/aaaa1111bbbb/)).toBeTruthy();
  });

  it('reports a changed source with both checksums, and asks — never redrafts', async () => {
    mockSections([
      section({
        sources: [citedSource({ state: 'changed', citedChecksum: 'oldsum1234567890', currentChecksum: 'newsum0987654321' })],
      }),
    ]);
    const p = props();
    render(<SourceTracer {...p} />);

    expect(await screen.findByText('source changed since cited')).toBeTruthy();
    expect(screen.getByText(/oldsum123456/)).toBeTruthy();
    expect(screen.getByText(/newsum098765/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Ask what changed/));
    const prompt = String(p.onAsk.mock.calls[0][0]);
    expect(prompt).toMatch(/no longer matches/);
    expect(prompt).toMatch(/Do not rewrite it yet/);
  });

  it('keeps a citation visible when its source no longer resolves', async () => {
    // Dropping it would silently turn "cites something unavailable" into
    // "cites nothing" — the more dangerous of the two on a Part 11 surface.
    mockSections([section({ sources: [citedSource({ state: 'unresolved', sourceId: null, sourceTitle: null, currentChecksum: null })] })]);
    render(<SourceTracer {...props()} />);

    expect(await screen.findByText('source no longer available')).toBeTruthy();
    expect(screen.getByText('Source no longer resolvable')).toBeTruthy();
  });

  it('makes no claim for a citation that was never checked', async () => {
    mockSections([section({ sources: [citedSource({ state: 'unverified', citedChecksum: null })] })]);
    render(<SourceTracer {...props()} />);
    expect(await screen.findByText('not checked against content')).toBeTruthy();
    expect(screen.queryByText('matches the source record as stored')).toBeNull();
  });

  it('renders no confidence percentage anywhere — recorded facts are not guesses', async () => {
    // The retired read-model attached a model-similarity score to every row and
    // the surface rendered it as "confidence". A recorded citation either holds
    // or it does not; presenting a percentage would re-smuggle inference in.
    mockSections([section(), section({ id: 'sec-2', sec: 'P.2', sources: [citedSource({ citationId: 'c2', state: 'changed' })] })]);
    render(<SourceTracer {...props()} />);
    await screen.findByText(/Sections with recorded sources/);
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
    expect(document.body.textContent).not.toMatch(/confidence/i);
  });

  it('states the contract honestly when nothing is recorded yet', async () => {
    mockSections([]);
    render(<SourceTracer {...props()} />);
    expect(await screen.findByText('No recorded source citations yet')).toBeTruthy();
    expect(screen.getByText(/nothing is inferred from text similarity/i)).toBeTruthy();
  });

  it('distinguishes a failed read from an empty library', async () => {
    mockSections([], 503);
    render(<SourceTracer {...props()} />);
    expect(await screen.findByText(/Couldn't load source lineage/)).toBeTruthy();
    expect(screen.queryByText('No recorded source citations yet')).toBeNull();
  });

  it('hands unrecorded-claim analysis to AnA without inventing citations', async () => {
    mockSections([section()]);
    const p = props();
    render(<SourceTracer {...p} />);
    await screen.findByText('protocol-v2.pdf');

    // The label appears both as the AnswerLead action and in the section
    // pushbar; the pushbar one carries the no-invention instruction.
    const buttons = screen.getAllByText(/Analyze for unrecorded claims/);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(String(p.onAsk.mock.calls[0][0])).toMatch(/Do not invent citations/);
  });
});
