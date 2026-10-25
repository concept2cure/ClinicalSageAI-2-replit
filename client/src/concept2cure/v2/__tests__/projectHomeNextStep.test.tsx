// @vitest-environment jsdom
/**
 * Each project step says what to do now, leads to the next, and offers the
 * tools that belong to it.
 *
 * docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 2. The founder tested the
 * product as a client: a new project opened on Author, the second of its five
 * steps, over an empty document list; no step said what to do on it or what
 * came after; and CMC / Module 3 and the IND forms were reached from the rail
 * or from inside a Submission Center sequence, never from the project.
 *
 * This pins:
 *   - a project with no documents opens on Evidence; one with documents, and
 *     one whose list could not be read, on Author (a failure decides nothing);
 *   - a step a person chose is never overridden by a read landing later;
 *   - the open step says what to do now, and offers the next step;
 *   - a US drug IND offers CMC / Module 3 on Author and the IND forms on Submit,
 *     each opened on this project; other filings are not offered what does not
 *     serve them.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* Production's verdicts: every surface outside the launch scope is locked. */
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        isLaunchSurface(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const US_DRUG_IND = { id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', primary_agency: 'FDA', product_type: 'drug', status: 'active' };
const DOC = { id: 'doc-1', title: 'Clinical protocol', status: 'DRAFT', updated_at: '2026-10-24T09:00:00Z', program_id: PID };

type Docs = unknown[] | 'fail' | Promise<unknown[]>;
function serve(program: Record<string, unknown> = US_DRUG_IND, docs: Docs = []) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(program);
    if (url.startsWith('/api/authoring/docs')) {
      if (docs === 'fail') throw new Error('The authoring store could not be reached.');
      return ok({ documents: await docs });
    }
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
}

const activeLabel = () => document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent?.trim() ?? null;
const tab = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === label)!;
const band = () => screen.getByTestId('pj-stageband');

function mount() {
  const onNav = vi.fn();
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />);
  return { onNav };
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('a project opens on its first step with work to do', () => {
  it('with no documents yet, on Evidence', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Evidence'));
  });

  it('with documents, on Author', async () => {
    serve(US_DRUG_IND, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(activeLabel()).toBe('Author');
  });

  it('when the list could not be read, on Author: a failure decides nothing', async () => {
    serve(US_DRUG_IND, 'fail');
    mount();
    await screen.findByText(/Couldn’t list this project’s documents/);
    expect(activeLabel()).toBe('Author');
  });

  it('a step the person chose is kept when the empty list lands afterwards', async () => {
    let land!: (rows: unknown[]) => void;
    serve(US_DRUG_IND, new Promise<unknown[]>((resolve) => { land = resolve; }));
    mount();
    fireEvent.click(tab('Review'));
    expect(activeLabel()).toBe('Review');
    land([]);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', expect.stringContaining('/api/authoring/docs')));
    await new Promise((r) => setTimeout(r, 20));
    expect(activeLabel()).toBe('Review');
  });
});

describe('each step says what to do now, and leads to the next', () => {
  it('Evidence says what to add, and its next step is Author', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Evidence'));
    expect(band().textContent).toMatch(/What to do now: Add the documents this filing is written from/);
    fireEvent.click(within(band()).getByRole('button', { name: /Next step.*Author/ }));
    expect(activeLabel()).toBe('Author');
    expect(band().textContent).toMatch(/What to do now: Draft the filing’s documents/);
  });

  it('the steps follow in order to Respond, which has no next step', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Evidence'));
    for (const next of ['Author', 'Review', 'Submit', 'Respond']) {
      fireEvent.click(within(band()).getByRole('button', { name: new RegExp(`Next step.*${next}`) }));
      expect(activeLabel()).toBe(next);
    }
    expect(within(band()).queryByRole('button', { name: /Next step/ })).toBeNull();
  });

  it('a device filing is told to draft from its device evidence', async () => {
    serve({ ...US_DRUG_IND, program_type: '510k', product_type: 'device' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(band().textContent).toMatch(/from the device or diagnostic evidence/);
  });
});

describe('each step offers the tools that belong to it, on this project', () => {
  it('a US drug IND: CMC / Module 3 on Author, the IND forms on Submit', async () => {
    serve(US_DRUG_IND, [DOC]);
    const { onNav } = mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(await screen.findByRole('button', { name: /CMC \/ Module 3/ }));
    expect(onNav).toHaveBeenCalledWith('cmc');
    fireEvent.click(tab('Submit'));
    fireEvent.click(await screen.findByRole('button', { name: /IND forms/ }));
    expect(onNav).toHaveBeenCalledWith('ind-checklist');
  });

  it('a biologic IND is offered its forms, and not CMC, which composes small-molecule Module 3 only', async () => {
    serve({ ...US_DRUG_IND, product_type: 'biologic' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(screen.queryByRole('button', { name: /CMC \/ Module 3/ })).toBeNull();
    fireEvent.click(tab('Submit'));
    expect(await screen.findByRole('button', { name: /IND forms/ })).toBeTruthy();
  });

  it('an NDA is offered neither', async () => {
    serve({ ...US_DRUG_IND, program_type: 'NDA' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(screen.queryByRole('button', { name: /CMC \/ Module 3/ })).toBeNull();
    fireEvent.click(tab('Submit'));
    await screen.findByTestId('pj-markets');
    expect(screen.queryByRole('button', { name: /IND forms/ })).toBeNull();
  });
});
