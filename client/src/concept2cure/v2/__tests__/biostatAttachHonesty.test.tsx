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
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) })));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';

const ATTACH = /Ask AnA to attach it to the dossier/i;

function mount(onAsk = vi.fn()) {
  render(<Biostatistics {...({ surface: { id: 'biostatistics' }, onAsk, onNav: vi.fn() } as any)} />);
  return onAsk;
}

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockClear());

describe('Biostatistics — the attach control states a request, not a result', () => {
  it('never claims the document was attached', () => {
    const onAsk = mount();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));

    const body = document.body.textContent ?? '';
    // The exact claim that was false. Any tense of "attached to dossier" is a
    // completed-action report and nothing here completes an action.
    expect(/attached to (the )?dossier/i.test(body), 'must not report an attachment').toBe(false);
    // And it must still say something — silence would be its own defect.
    expect(/attachment requested/i.test(body)).toBe(true);
    expect(/nothing is attached until/i.test(body)).toBe(true);
  });

  it('still sends the request — the fix is the claim, not the feature', () => {
    const onAsk = mount();
    fireEvent.click(screen.getByRole('button', { name: ATTACH }));

    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(String(onAsk.mock.calls[0]?.[0])).toMatch(/attach .* to the submission dossier/i);
  });

  /**
   * The ordering proof, and the one that pins the specific defect.
   *
   * The original fired the toast BEFORE `ask`, so a request that never left
   * still painted a success tick. Making `ask` throw separates the two orders
   * behaviourally: toast-first still shows the message, toast-after cannot.
   */
  it('does not announce anything when the request itself fails', () => {
    const onAsk = vi.fn(() => { throw new Error('ana transport down'); });
    mount(onAsk as never);

    // React re-raises a handler throw as a global error event; the throw is the
    // point of the test, so it is contained here rather than left to surface as
    // an unhandled rejection in CI.
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', swallow);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { fireEvent.click(screen.getByRole('button', { name: ATTACH })); } catch { /* thrown by design */ }
    finally { window.removeEventListener('error', swallow); quiet.mockRestore(); }

    expect(onAsk).toHaveBeenCalled();
    const body = document.body.textContent ?? '';
    expect(/attached to (the )?dossier/i.test(body), 'a failed request must not report success').toBe(false);
    expect(/attachment requested/i.test(body), 'nor report that a request was made').toBe(false);
  });
});
