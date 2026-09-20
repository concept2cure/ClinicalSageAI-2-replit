// @vitest-environment jsdom
/**
 * WO-16C finding 124 (client half) — the AnA Command "Next best actions" column
 * painted a confidence percentage for recommendations that carry no confidence.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every recommendation from POST /api/orchestration/recommendations is produced
 * by a deterministic rule (server/services/orchestration/recommendation-engine.ts).
 * The engine used to stamp each one with a per-rule literal — 0.95, 0.9, 0.7 —
 * and this surface rendered it as an unlabeled "95%" chip in the card's top row:
 *
 *     <span className="ac-rec-conf">{Math.round((r.confidence || 0) * 100)}%</span>
 *
 * The engine now reports `confidence: null` with `sourceType: 'rules_based'`,
 * which makes that expression WORSE rather than better: `(null || 0) * 100`
 * renders a confident-looking "0%" on every card — a fabricated score of zero
 * where nothing computed a score at all.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * At the DEPENDENCY: `apiRequest` is mocked at the module boundary and answers
 * the surface's real endpoints, with the recommendations endpoint returning the
 * payload the fixed engine actually sends — one rules-based recommendation with
 * `confidence: null`. Nothing inside AnaCommand is mocked; the whole surface
 * mounts and renders.
 *
 * RED on the pre-fix client: the rules-based card rendered `0%`.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 *  - A recommendation with no confidence renders no percentage chip at all.
 *  - A recommendation that DOES carry a computed confidence still renders one,
 *    labelled — the chip is reserved for a real number, not deleted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { AnaCommand } from '../surfaces/AnaCommand';

const PID = 301;

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** What the rules engine sends today: a real finding, and no score. */
const RULES_BASED = {
  id: 'rec-rules',
  recommendationType: 'unvalidated_content',
  severity: 'high',
  sourceType: 'rules_based',
  targetObjectType: 'document',
  targetObjectId: 101,
  targetObjectTitle: 'Investigator Brochure',
  // The surface's role lens filters on `module`; 'clinical' is in the default
  // "All work" lens, so the card reaches the column.
  module: 'clinical',
  reason: '"Investigator Brochure" is in in_review status but has never been validated.',
  evidence: ['Document status: in_review', 'No validation records found for document ID 101'],
  suggestedAction: 'Run validation on this document',
  confidence: null,
};

/** A recommendation whose score something actually computed. */
const AI_INFERRED = {
  ...RULES_BASED,
  id: 'rec-ai',
  sourceType: 'ai_inferred',
  targetObjectTitle: 'Module 2 Summary',
  reason: 'Module 2 Summary is likely to need a cross-reference pass.',
  evidence: ['Model reviewed 14 linked sections'],
  suggestedAction: 'Review cross-references',
  confidence: 0.42,
};

let recommendations: unknown[] = [RULES_BASED];

function route(method: string, url: string) {
  if (url === '/api/report-os/portfolio/org') {
    return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  }
  if (method === 'POST' && url === '/api/orchestration/recommendations') {
    return ok({ recommendations });
  }
  if (method === 'POST' && url === '/api/orchestration/continuity') {
    return ok({
      trajectory: 'stable',
      metrics: { readinessScore: 70, documentCount: 1, validatedCount: 0, blockerCount: 0, taskCompletionPercent: 50 },
      changes: [], newlyReady: [], needsAttention: [],
    });
  }
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  return { ok: false, status: 404, json: async () => ({ error: 'not routed: ' + url }), text: async () => '' };
}

function mount() {
  return render(
    <AnaCommand
      surface={'ana-command' as never}
      onAsk={() => {}}
      onNav={() => {}}
      segment=""
    />,
  );
}

/** The card's top row — severity chip, title, module, and (only sometimes) a score. */
async function cardTop(title: string) {
  const tt = await screen.findByText(title);
  return tt.parentElement as HTMLElement;
}

describe('AnaCommand — confidence chip', () => {
  beforeEach(() => {
    recommendations = [RULES_BASED];
    apiRequest.mockImplementation(async (method: string, url: string) => route(method, url));
  });
  afterEach(() => {
    cleanup();
    apiRequest.mockReset();
  });

  it('renders no percentage for a rules-based recommendation', async () => {
    mount();
    const top = await cardTop('Investigator Brochure');
    await waitFor(() => expect(top.textContent).toContain('Investigator Brochure'));

    expect(top.querySelector('.ac-rec-conf')).toBeNull();
    expect(top.textContent).not.toMatch(/%/);
    // Specifically not the "(null || 0) * 100" reading.
    expect(top.textContent).not.toContain('0%');
  });

  it('still renders a chip for a recommendation that carries a computed confidence', async () => {
    recommendations = [AI_INFERRED];
    mount();
    const top = await cardTop('Module 2 Summary');
    const chip = top.querySelector('.ac-rec-conf');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('42%');
  });
});
