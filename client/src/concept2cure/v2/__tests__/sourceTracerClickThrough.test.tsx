// @vitest-environment jsdom
/**
 * SourceTracer click-through — the marquee "verify any sentence" interaction.
 * Proves a sentence's Trace action calls the REAL traceability service
 * (POST /api/audit-services/traceability/click-through with the section content
 * + an offset inside the clicked sentence) and renders the server's resolved
 * source spans; a null resolution renders honestly, never a fabricated source.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { SourceTracer } from '../surfaces/SourceTracer';

const SECTIONS = {
  data: {
    sections: [{
      id: '11', doc: 'CSR / Efficacy', sec: '11.4.1', module: 'M5', status: 'approved', model: 'governed',
      sentences: [
        { idx: 0, sourceType: 'trial', conf: 0.94, text: 'The primary endpoint was met.', sourceTitle: 'Study 301 CSR', sourceId: 'src-1' },
        { idx: 1, sourceType: 'literature', conf: 0.88, text: 'Response rates align with published data.', sourceTitle: 'Smith 2024', sourceId: 'src-2', pmid: '12345' },
      ],
    }],
    total: 1,
  },
};
const CLICK_THROUGH = {
  success: true,
  clickThrough: {
    sentence: { index: 1, text: 'Response rates align with published data.', charStart: 30, charEnd: 71, contentHash: 'abc123def456' },
    sources: [{ sourceId: 'src-2', sourceType: 'literature', title: 'Smith 2024 — Oncology', pageNumber: 4, excerpt: 'ORR was 42% (95% CI 35–49).', relevanceScore: 0.91, linkType: 'supports', isVerified: true, accessUrl: '/api/evidence/src-2' }],
    relatedSentences: [],
    confidence: 0.91,
  },
};

const props = () => ({ surface: { id: 'source-tracer', label: 'Tracer' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/source-tracer/sections') return { ok: true, status: 200, json: async () => SECTIONS } as Response;
    if (method === 'POST' && url === '/api/audit-services/traceability/click-through') return { ok: true, status: 200, json: async () => CLICK_THROUGH } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
});

describe('SourceTracer — sentence click-through', () => {
  it('traces a sentence via the real service and renders the resolved source span', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-uuid-1' };
    render(<SourceTracer {...props()} />);
    await screen.findByText('The primary endpoint was met.');

    // Trace the SECOND sentence — the offset must land inside it.
    fireEvent.click(screen.getAllByRole('button', { name: /Trace/ })[1]);

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/audit-services/traceability/click-through');
      expect(call).toBeTruthy();
      const body = call![2] as { content: string; charOffset: number; projectId: string };
      expect(body.projectId).toBe('proj-uuid-1');
      expect(body.content).toBe('The primary endpoint was met. Response rates align with published data.');
      // Offset falls inside the second sentence (which starts at index 30).
      expect(body.charOffset).toBeGreaterThanOrEqual(30);
      expect(body.charOffset).toBeLessThan(body.content.length);
    });
    // The server's resolved source span renders — title, page, excerpt.
    expect(await screen.findByText('Smith 2024 — Oncology')).toBeTruthy();
    expect(screen.getByText(/ORR was 42%/)).toBeTruthy();
    expect(screen.getByText(/abc123def456/)).toBeTruthy(); // server sentence hash
  });

  it('renders an honest no-resolution state when the service returns null', async () => {
    (window as any).C2C_PROJECT = { id: 'proj-uuid-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/source-tracer/sections') return { ok: true, status: 200, json: async () => SECTIONS } as Response;
      if (method === 'POST' && url === '/api/audit-services/traceability/click-through') return { ok: true, status: 200, json: async () => ({ success: true, clickThrough: null }) } as Response;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    render(<SourceTracer {...props()} />);
    await screen.findByText('The primary endpoint was met.');
    fireEvent.click(screen.getAllByRole('button', { name: /Trace/ })[0]);
    expect(await screen.findByText(/No source span resolved/)).toBeTruthy();
  });

  it('asks for a program honestly when no project is open (no network call)', async () => {
    render(<SourceTracer {...props()} />);
    await screen.findByText('The primary endpoint was met.');
    fireEvent.click(screen.getAllByRole('button', { name: /Trace/ })[0]);
    expect(await screen.findByText(/Open a program first/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/audit-services/traceability/click-through')).toBe(false);
  });
});
