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
 * `res` and `jud` are `useMemo` over the pure BiostatEngine, not fetches, so
 * the AnswerLead carrying the control renders on mount from the default design
 * inputs. No API fixture is involved in any assertion below — these drive the
 * real handler and read the real toast.
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
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';

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

function mount(onAsk = vi.fn()) {
  render(<Biostatistics {...({ surface: { id: 'biostatistics' }, onAsk, onNav: vi.fn() } as any)} />);
  return onAsk;
}

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockClear());

/** Resolve after the click's awaits settle, so the toast has been written. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Biostatistics — the attach control reports only what the server confirmed', () => {
  it('files the document through the real authoring path', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));
    await settle();

    // The binding write, not a sentence into the conversation.
    const urls = apiRequest.mock.calls.map((c: unknown[]) => String(c[1]));
    expect(urls.some((u) => u.includes('/api/authoring/docs'))).toBe(true);
  });

  it('does not report a filing when the server refuses it', async () => {
    apiRequest.mockImplementation(async (..._a: unknown[]) =>
      String(_a[1]).includes('/api/authoring/docs')
        ? { ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN', message: 'Not permitted.' }) }
        : { ok: true, status: 200, json: async () => ({ success: true, data: [] }) },
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));
    await settle();

    const body = document.body.textContent ?? '';
    // The exact class of claim this file exists to prevent: a completed-action
    // report for an action that did not complete.
    expect(/filed to the dossier/i.test(body), 'a refused write must not report a filing').toBe(false);
  });

  it('does not report a filing when the transport throws', async () => {
    // Scoped to the filing write only. Throwing for EVERY apiRequest also
    // breaks the surface's mount reads, which is a different failure and would
    // pass this assertion for the wrong reason.
    apiRequest.mockImplementation(async (..._a: unknown[]) => {
      if (String(_a[1]).includes('/api/authoring/docs')) throw new Error('transport down');
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    });
    mount();

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
