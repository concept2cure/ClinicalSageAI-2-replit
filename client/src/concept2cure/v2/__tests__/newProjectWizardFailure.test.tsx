// @vitest-environment jsdom
/**
 * The New Project wizard's failure surface.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * `POST /api/c2c/projects` answered 503 with `{ error: 'PENDING_STORE', … }`
 * when a store was unprovisioned. The wizard rendered the literal token
 * `PENDING_STORE` in its error banner — an internal enum presented as the
 * product's user-facing copy, on the first screen an evaluating customer
 * reaches. The banner was a bare `div`: no `role="alert"`, so a screen-reader
 * user was told nothing at all, and no recovery control, so the only way
 * forward was to close the modal and start the wizard again from step one.
 *
 * The same `error` state also carried the opposite outcome — "project created,
 * but no dossier was scaffolded" — so a SUCCESS was rendered in the failure
 * banner. Offering "Try again" there would have created a second copy of a
 * program that already existed.
 *
 * ── What must be true now ─────────────────────────────────────────────────────
 *   • a failed create shows the server's human sentence, never the enum;
 *   • it is announced assertively, and offers a retry that re-runs the create;
 *   • it shows the correlation id — the support handle that replaced the
 *     table name the API used to disclose;
 *   • the created-but-not-scaffolded advisory is a polite status with NO retry;
 *   • nothing internal (SQL, relation, route, env var) can reach the banner.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* Only `apiRequest` is stubbed. `ApiRequestError` must stay the REAL class —
   the wizard now branches on `e instanceof ApiRequestError` to decide whether a
   thrown message is safe to render, and a look-alike stub would make that
   branch untestable (and would pass while production failed). */
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/**
 * Step 1 of the wizard is the global regulatory-registry picker. It is stubbed
 * to a single deterministic choice so these tests exercise the FAILURE SURFACE
 * rather than the registry loader — the picker has its own coverage, and
 * driving the real one here would make a banner test fail whenever the registry
 * changed.
 */
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('510k')}>
      Pick 510(k)
    </button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => ({
    id: '510k',
    displayName: 'Traditional 510(k)',
    pathwayKey: 'estar',
    agency: 'FDA',
    region: 'US',
    submissionFormat: 'eSTAR',
  }),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { NewProjectWizard } from '../surfaces/Projects';

function ok(body: unknown) {
  return { ok: true, status: 201, json: async () => body };
}

/** Step 3 of the wizard is where Create lives; steps 1 and 2 are the template
 *  picker and the configuration form, neither of which this test exercises. */
async function advanceToCreate() {
  fireEvent.click(screen.getByRole('button', { name: /pick 510/i }));
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
  return screen.findByRole('button', { name: /create project/i });
}

/** The permanent live regions. They are mounted empty and stay mounted, so a
 *  screen reader is watching them before any text arrives — the point of
 *  separating announcement from the visual banner. */
const assertiveRegion = () => document.querySelector('[role="alert"][aria-live="assertive"]');
const politeRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('New Project wizard — dialog semantics', () => {
  /**
   * The wizard shipped as a plain pair of divs: no role, no keyboard exit, no
   * focus hand-off — while `useDialog` sat unused in the same directory. That
   * matters more now than it did, because a failed create has to announce into
   * this container.
   */
  it('is a labelled modal dialog that closes on Escape', () => {
    const onClose = vi.fn();
    render(<NewProjectWizard onClose={onClose} onNav={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Named, so AT announces what opened rather than a bare "dialog".
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('New project');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('gives every icon-only control an accessible name', () => {
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    // The header close button rendered an aria-hidden icon and nothing else,
    // so it had no accessible name at all.
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('New Project wizard — failed create', () => {
  it('shows the human sentence and never the enum token', async () => {
    apiRequest.mockRejectedValue(
      new ApiRequestError(
        'This environment is not fully set up, so creating the project cannot complete. ' +
          'Contact your administrator with the reference below.',
        503,
        { error: 'PENDING_STORE' },
        'PENDING_STORE',
        '9f2c1ba47d3e40518c6ad0b2e7f45391',
      ),
    );

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    const create = await advanceToCreate();
    fireEvent.click(create);

    const banner = await screen.findByTestId('new-project-outcome');
    expect(banner.textContent).toMatch(/not fully set up/i);
    // The defect, asserted directly.
    expect(banner.textContent).not.toContain('PENDING_STORE');
    // Announced, not silent — and announced from a region that already existed
    // before the text arrived, not one mounted alongside it.
    expect(assertiveRegion()?.textContent).toMatch(/not fully set up/i);
    expect(politeRegion()?.textContent).toBe('');
  });

  it('offers a retry that re-runs the create', async () => {
    apiRequest.mockRejectedValue(
      new ApiRequestError('That service is temporarily unavailable. Try again shortly.', 503),
    );

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(await advanceToCreate());
    await screen.findByTestId('new-project-outcome');

    const attemptsAfterFirst = apiRequest.mock.calls.length;
    expect(attemptsAfterFirst).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(apiRequest.mock.calls.length).toBe(attemptsAfterFirst + 1));
  });

  it('shows the correlation id as the support handle', async () => {
    apiRequest.mockRejectedValue(
      new ApiRequestError('Something went wrong on our side. Try again.', 500, {}, undefined, '9f2c1ba47d3e40518c6ad0b2e7f45391'),
    );

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(await advanceToCreate());

    const banner = await screen.findByTestId('new-project-outcome');
    expect(banner.textContent).toMatch(/9f2c1ba47d3e40518c6ad0b2e7f45391/);
    expect(banner.textContent).toMatch(/reference/i);
  });

  it('renders nothing internal even if an internal string reaches it', async () => {
    // Defence in depth. `extractApiError` already strips these upstream; this
    // asserts the banner is not a second place one could re-enter the UI.
    apiRequest.mockRejectedValue(
      new ApiRequestError('That request could not be completed.', 500, {
        error: 'relation "software_lifecycle_items" does not exist',
      }),
    );

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(await advanceToCreate());

    const banner = await screen.findByTestId('new-project-outcome');
    expect(banner.textContent).not.toMatch(/relation |software_lifecycle_items|\/api\/|select "/i);
  });

  it('does not render a browser-native fetch message', async () => {
    // The regression this guards. `fetch` rejecting offline throws a TypeError
    // whose `.message` is "Failed to fetch" / "Load failed" / "NetworkError
    // when attempting to fetch resource" — non-empty, so a bare
    // `e instanceof Error && e.message` check would put engineer text on screen.
    // It reaches the wizard by a path the server-envelope filter cannot see,
    // because no server envelope was involved.
    apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(await advanceToCreate());

    const banner = await screen.findByTestId('new-project-outcome');
    expect(banner.textContent).not.toMatch(/failed to fetch/i);
    expect(banner.textContent).toMatch(/could not be created/i);
    expect(banner.textContent).toMatch(/check your connection/i);
  });
});

describe('New Project wizard — created but not scaffolded', () => {
  it('is a polite status with no retry, because the project exists', async () => {
    apiRequest.mockResolvedValue(
      ok({
        data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05', title: 'Probe', code: 'PR' },
        meta: {
          created: true,
          scaffoldSkipped: 'NO_RULE_PACK',
          scaffoldDetail: 'No dossier outline is defined for this filing type.',
        },
      }),
    );

    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(await advanceToCreate());

    const banner = await screen.findByTestId('new-project-outcome');
    // The server's `detail` already states that the project was created and
    // nothing was scaffolded, so the client does NOT prepend its own sentence
    // saying the same — that read as two systems' text pasted together.
    expect(banner.textContent).toMatch(/No dossier outline is defined for this filing type\./);
    expect(banner.textContent).toMatch(/add documents manually/i);
    expect(banner.textContent).not.toMatch(/dossier was started.*No dossier outline/);
    // A success must not interrupt: it goes to the polite region, and the
    // assertive one stays silent.
    expect(politeRegion()?.textContent).toMatch(/No dossier outline/);
    expect(assertiveRegion()?.textContent).toBe('');
    // …and must not offer to create the same program a second time.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
