// @vitest-environment jsdom
/**
 * SourceTracer — verification state must be visible, not implied.
 *
 * The traceability service resolves some links on demand (AI semantic match /
 * keyword fallback) at the moment the user clicks Trace. Those links come back
 * with `isVerified: false` and are NOT settled lineage a person has confirmed.
 * The surface previously carried `isVerified` in its types but never rendered
 * it, while the surrounding copy told the user that every sentence was traced
 * and that "no untraceable number reaches a submission" — a stronger claim than
 * the pipeline enforces.
 *
 * These tests pin the distinction to the UI so an inferred match can never
 * again read as a verified one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { SourceTracer } from '../surfaces/SourceTracer';

const SECTIONS = {
  data: {
    sections: [{
      id: '11', doc: 'CSR / Efficacy', sec: '11.4.1', module: 'M5', status: 'approved', model: 'governed',
      sentences: [
        { idx: 0, sourceType: 'trial', conf: 0.94, text: 'The primary endpoint was met.', sourceTitle: 'Study 301 CSR', sourceId: 'src-1' },
      ],
    }],
    total: 1,
  },
};

function clickThrough(isVerified: boolean) {
  return {
    success: true,
    clickThrough: {
      sentence: { index: 0, text: 'The primary endpoint was met.', charStart: 0, charEnd: 29, contentHash: 'hash1' },
      sources: [{
        sourceId: 'src-1', sourceType: 'trial', title: 'Study 301 CSR', pageNumber: 12,
        excerpt: 'The primary endpoint was met (p=0.003).', relevanceScore: 0.9,
        linkType: 'supports', isVerified,
      }],
      relatedSentences: [],
      confidence: 0.9,
    },
  };
}

const props = () => ({ surface: { id: 'source-tracer', label: 'Tracer' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

function mockApi(isVerified: boolean) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/source-tracer/sections') return { ok: true, status: 200, json: async () => SECTIONS } as Response;
    if (method === 'POST' && url === '/api/audit-services/traceability/click-through') {
      return { ok: true, status: 200, json: async () => clickThrough(isVerified) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

async function trace() {
  render(<SourceTracer {...props()} />);
  await screen.findByText('The primary endpoint was met.');
  fireEvent.click(screen.getAllByRole('button', { name: /Trace/ })[0]);
}

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => { (window as any).C2C_PROJECT = { id: 'proj-uuid-1' }; });

describe('SourceTracer — verification state', () => {
  it('labels a confirmed link as verified', async () => {
    mockApi(true);
    await trace();
    expect(await screen.findByText('verified link')).toBeTruthy();
    expect(screen.queryByText('unverified match')).toBeNull();
  });

  it('labels an on-demand match as unverified rather than settled lineage', async () => {
    mockApi(false);
    await trace();
    expect(await screen.findByText('unverified match')).toBeTruthy();
    expect(screen.queryByText('verified link')).toBeNull();
  });
});

describe('SourceTracer — headline copy', () => {
  it('does not claim the surface blocks untraced claims from a submission', async () => {
    mockApi(true);
    render(<SourceTracer {...props()} />);
    await screen.findByText('The primary endpoint was met.');

    const body = document.body.textContent || '';
    // The retired overclaims. The tracer reports coverage; it is not an
    // enforcement gate, and sentences with no stored citation never appear.
    expect(body).not.toMatch(/No untraceable number reaches a submission/i);
    expect(body).not.toMatch(/an untraceable citation never reaches the submission/i);
    expect(body).not.toMatch(/Every sentence AnA writes carries a typed source/i);
  });
});
