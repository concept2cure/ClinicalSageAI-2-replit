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
 *   - a project with no documents opens on Plan (pass 3; Evidence in pass 2);
 *     one with documents, and one whose list could not be read, on Author (a
 *     failure decides nothing);
 *   - a step a person chose is never overridden by a read landing later;
 *   - the open step offers its own question to AnA in the composer's suggestions (D3-1, 2026-11-06: the band
 *     that said "What to do now" and "Next step" is retired; the steps are one segmented control, in order);
 *   - a US drug IND offers CMC / Module 3 on Author and the IND forms on Submit,
 *     each opened on this project; other filings are not offered what does not
 *     serve them. Since slice A.1 each door carries the name Plan gives the same
 *     job ("Compose Module 3 in CMC / Module 3", "Prepare Forms 1571, 1572 and
 *     3674 in IND forms"; section 9: one job, one name), matched exactly.
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
const suggestions = () => within(screen.getByRole('group', { name: 'Suggestions' })).getAllByRole('button').map((b) => b.textContent);

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
  it('with no documents yet, on Plan: what the filing needs', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
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

describe('each step offers its own question to AnA, where the band\'s guidance went', () => {
  it('Plan asks what the filing still needs, and who has each piece', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
    expect(suggestions()).toEqual(['What does this filing still need, and who has each piece?', 'What is due this week, and who has it?']);
  });

  it('Evidence asks which sources are missing, and Author offers to draft from them', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
    fireEvent.click(tab('Evidence'));
    expect(suggestions()[0]).toBe('Which sources does this filing still need?');
    fireEvent.click(tab('Author'));
    expect(suggestions()[0]).toBe('Draft the next section from this project’s sources');
  });

  it('the steps are one control in their order, and no step shows a "What to do now" band', async () => {
    serve(US_DRUG_IND, []);
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
    const steps = Array.from(document.querySelectorAll('.pj-lc .seg .pj-lc-stage')).map((b) => b.textContent?.trim());
    expect(steps).toEqual(['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']);
    for (const label of ['Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
      fireEvent.click(tab(label));
      expect(activeLabel()).toBe(label);
      expect(screen.queryByTestId('pj-stageband')).toBeNull();
      expect(document.body.textContent).not.toMatch(/What to do now|Next step/);
    }
  });

  it('a device filing is offered a draft from its device evidence', async () => {
    serve({ ...US_DRUG_IND, program_type: '510k', product_type: 'device' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(suggestions()[0]).toBe('Draft the next section from the device evidence');
  });
});

describe('each step offers the tools that belong to it, on this project', () => {
  it('a US drug IND: CMC / Module 3 on Author, the IND forms on Submit', async () => {
    serve(US_DRUG_IND, [DOC]);
    const { onNav } = mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(await screen.findByRole('button', { name: 'Compose Module 3 in CMC / Module 3' }));
    expect(onNav).toHaveBeenCalledWith('cmc');
    fireEvent.click(tab('Submit'));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Forms 1571, 1572 and 3674 in IND forms' }));
    expect(onNav).toHaveBeenCalledWith('ind-checklist');
  });

  it('a biologic IND is offered its forms, and not CMC, which composes small-molecule Module 3 only', async () => {
    serve({ ...US_DRUG_IND, product_type: 'biologic' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(screen.queryByRole('button', { name: 'Compose Module 3 in CMC / Module 3' })).toBeNull();
    fireEvent.click(tab('Submit'));
    expect(await screen.findByRole('button', { name: 'Prepare Forms 1571, 1572 and 3674 in IND forms' })).toBeTruthy();
  });

  it('an NDA is offered neither', async () => {
    serve({ ...US_DRUG_IND, program_type: 'NDA' }, [DOC]);
    mount();
    await screen.findByTestId('pj-documents');
    expect(screen.queryByRole('button', { name: 'Compose Module 3 in CMC / Module 3' })).toBeNull();
    fireEvent.click(tab('Submit'));
    await screen.findByTestId('pj-markets');
    expect(screen.queryByRole('button', { name: 'Prepare Forms 1571, 1572 and 3674 in IND forms' })).toBeNull();
  });
});
