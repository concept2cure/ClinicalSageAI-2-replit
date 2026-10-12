// @vitest-environment jsdom
/**
 * "Attach to dossier" may not report an attachment it did not make.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The handler was one line:
 *
 *   const attach = () => {
 *     fireToast((docDef?.label || 'Document') + ' attached to dossier');
 *     ask('Attach the ' + ... + ' to the submission dossier statistical section');
 *   };
 *
 * The toast fired FIRST, synchronously, with `useToast`'s default 'ok' tone —
 * the green success tick — at a moment when not one byte had left the browser.
 * `attach` was not async, awaited nothing and checked nothing.
 *
 * Nothing was attached after `ask()` either. `ask` returns void; it streams a
 * natural-language sentence into the AnA conversation. The real path,
 * `attachToDossier` in server/services/ana-biostats/workflow-integrator.ts,
 * needs an artifactId and a dossierSectionId — and while this control is only
 * reachable once the document is GENERATED (`res && jud && docDef`), generated
 * is not saved: no artifactId exists until `openEditor` writes one through
 * saveToAuthoring, and this surface has no dossier-section picker at all.
 *
 * This is the sharpest class in the honest-state audit. Elsewhere a surface
 * misreports a STATE it read badly; here it reports a governed action that
 * never happened. A statistician clicks it, reads the tick, and stops thinking
 * about the SAP — believing a document is in the submission dossier when the
 * dossier has never heard of it.
 *
 * ── Why this can be behavioural ──────────────────────────────────────────────
 * The AnswerLead carrying the control renders once the STATISTICAL ENGINE has
 * sized the default design and written the document — the surface computes
 * nothing in the browser, so the engine's two calls are served below and every
 * case waits for the document before clicking. The assertions themselves still
 * drive the real handler and read the real toast; no fixture decides them.
 *
 * ── UPDATE: the control now files for real, so the contract got stronger ─────
 * The original fix made the claim honest while leaving the control inert — it
 * said "attachment requested" and nothing was filed, because this surface had
 * no artifactId and no dossier-section picker. It now calls `saveToAuthoring`,
 * the same path the "Open in document editor" button beside it already used,
 * which POSTs /api/authoring/docs with window.C2C_PROJECT.id as
 * client_program_id — the binding that files the document against the project.
 *
 * So these cases no longer assert "states a request". They assert the harder
 * property the original was protecting: NO SUCCESS IS REPORTED THAT THE SERVER
 * DID NOT CONFIRM. Success only after `r.ok`; a refusal reported as a refusal;
 * a thrown transport reported as a failure and never as a result.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

/* Loosely typed on purpose: individual cases swap in refusals and throws with
   different body shapes, and a narrow inferred signature makes each of those a
   type error rather than a test. */
const apiRequest = vi.hoisted(() =>
  vi.fn(async (..._a: unknown[]): Promise<any> => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  })),
);
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';

const ATTACH = /File it to the dossier/i;

/* The deterministic statistical engine. POST /api/ana-biostats/compute sizes
   and judges the design; POST /api/ana-biostats/document generates the governed
   document from that same result. The content is a stand-in for the engine's
   generator (pinned server-side in tests/services/ana-biostats.test.ts) — what
   this file needs is a document on screen, so that a refused FILING is the only
   thing a case can be failing on. */
const ENGINE_COMPUTE = {
  validation: {
    valid: true,
    normalizedInput: {
      clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
      objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.9,
      effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2,
    },
    warnings: [], errors: [], prefilled: [],
  },
  computation: {
    method: 'Log-rank test (Schoenfeld formula)',
    sampleSize: { perGroup: 311, total: 622, groups: 2 },
    power: 0.8423, effectSize: 0.38, alpha: 0.05,
    adjustedSampleSize: 366, adjustedTotal: 733, attritionAdjusted: true,
    formula: 'Events = (z_a + z_b)^2 * (1+r)^2 / (r * ln(HR)^2), HR=0.620, events=247',
    assumptions: [],
  },
  judgment: {
    overallVerdict: 'adequate', overallRisk: 'low', actionRecommendation: 'proceed',
    confidence: { level: 'high', score: 88, factors: [], limitations: [] },
    dimensions: [], fragility: { fragilityIndex: 22, category: 'robust', sensitiveParameters: [], narrative: '' },
    endpointMethodFit: { fit: 'strong', suggestedMethod: 'Cox model', currentMethod: 'Log-rank', rationale: '', alternatives: [] },
    escalationReasons: [], roleExplanations: { technical: '', clinical: '', regulatory: '', executive: '' },
  },
  domain: { track: 'biotech_pharma', methodSuggestions: [], designConsiderations: [], endpointGuidance: [], regulatoryNotes: [], riskFactors: [] },
};

const ENGINE_DOCUMENT = {
  type: 'sample_size_rationale',
  title: 'Sample Size Rationale',
  content: '# Sample Size Rationale\n\n## Sample Size Determination\n\n- **Total (adjusted)**: 733\n',
  version: 1,
  status: 'draft',
  provenance: { engineVersion: '1.0.0' },
};

const blank = () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });

/** Serve the engine, plus whatever the case under test wants to override. */
function serve(over: (m: string, u: string) => any = () => null) {
  apiRequest.mockImplementation(async (..._a: unknown[]) => {
    const m = String(_a[0]);
    const u = String(_a[1]);
    const o = over(m, u);
    if (o) return o;
    if (m === 'POST' && u === '/api/ana-biostats/compute') return { ok: true, status: 200, json: async () => ENGINE_COMPUTE };
    if (m === 'POST' && u === '/api/ana-biostats/document') return { ok: true, status: 200, json: async () => ENGINE_DOCUMENT };
    return blank();
  });
}

function mount(onAsk = vi.fn()) {
  render(<Biostatistics {...({ surface: { id: 'biostatistics' }, onAsk, onNav: vi.fn() } as any)} />);
  return onAsk;
}

/** The engine's document is on screen, so there is something to file. */
const docOnScreen = () =>
  waitFor(() =>
    expect(document.querySelector('.bs-doc-render')?.textContent ?? '').toContain('Sample Size Rationale'),
  );

/* A document is filed in the open project and nowhere else (PF-07), so every
   case but the last opens one: without it the filing write is never attempted,
   and the refusal and transport cases below would pass for that reason alone. */
const PROGRAM = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const setProject = (p: unknown) => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = p;
};
afterEach(() => {
  cleanup();
  setProject(undefined);
});
beforeEach(() => {
  apiRequest.mockReset();
  serve();
  setProject({ id: PROGRAM });
});

/** Resolve after the click's awaits settle, so the toast has been written. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Biostatistics — the attach control reports only what the server confirmed', () => {
  it('files the document through the real authoring path', async () => {
    mount();
    await docOnScreen();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));
    await settle();

    // The binding write, not a sentence into the conversation — in the project.
    const create = apiRequest.mock.calls.find((c: unknown[]) => String(c[1]).includes('/api/authoring/docs'));
    expect(create).toBeDefined();
    expect(create?.[2]).toMatchObject({ client_program_id: PROGRAM });
  });

  it('with no project open, files nothing, reports no filing, and says why (PF-07)', async () => {
    setProject(undefined);
    mount();
    await docOnScreen();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));
    await settle();

    const urls = apiRequest.mock.calls.map((c: unknown[]) => String(c[1]));
    expect(urls.some((u) => u.includes('/api/authoring/docs'))).toBe(false);
    const body = document.body.textContent ?? '';
    expect(/filed to the dossier/i.test(body)).toBe(false);
    expect(body).toMatch(/open a project first/i);
  });

  it('does not report a filing when the server refuses it', async () => {
    serve((_m, u) =>
      u.includes('/api/authoring/docs')
        ? { ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN', message: 'Not permitted.' }) }
        : null,
    );
    mount();
    await docOnScreen();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));
    await settle();

    const body = document.body.textContent ?? '';
    // The exact class of claim this file exists to prevent: a completed-action
    // report for an action that did not complete.
    expect(/filed to the dossier/i.test(body), 'a refused write must not report a filing').toBe(false);
  });

  it('does not report a filing when the transport throws', async () => {
    // Scoped to the filing write only. Throwing for EVERY apiRequest also
    // breaks the surface's mount reads and the statistical engine's two calls,
    // which is a different failure and would pass this assertion for the wrong
    // reason.
    serve((_m, u) => {
      if (u.includes('/api/authoring/docs')) throw new Error('transport down');
      return null;
    });
    mount();
    await docOnScreen();

    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', swallow);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fireEvent.click(screen.getByRole('button', { name: ATTACH }));
      await settle();
    } finally {
      window.removeEventListener('error', swallow);
      quiet.mockRestore();
    }

    const body = document.body.textContent ?? '';
    expect(/filed to the dossier/i.test(body), 'a thrown write must not report a filing').toBe(false);
  });
});
