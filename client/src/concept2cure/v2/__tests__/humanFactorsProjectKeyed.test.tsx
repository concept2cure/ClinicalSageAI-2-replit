// @vitest-environment jsdom
/**
 * Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `human-factors` row): the HFE/UE file panels are not shown until the read is
 * keyed to the project.
 *
 * GET /api/human-factors returns the organization's FIRST file —
 * `listHfFiles(orgId)` then `files[0]` (server/routes/human-factors.ts:92, and
 * the element write at :457) — and `hf_engineering_files` has no program
 * column. In an organization with two device projects, a project's screen drew
 * the other project's device name, its use scenarios, its critical-task gate
 * and its IEC 62366-1 completeness, under the header "Organization-wide
 * usability records", and published the same facts to AnA as this screen's.
 *
 * Until the route reports the file keyed to the project (`meta.scope ===
 * 'program'`), the screen says why the file is not shown, and AnA is told the
 * same — the surface-context channel never carries what the screen hides.
 *
 * Audit of the first pass: the header "Add use scenario" stayed while the
 * panels were hidden. POST /api/human-factors/scenarios attaches the row to the
 * organization's OLDEST file (human-factors.ts:259, `ORDER BY created_at LIMIT
 * 1`), while the read shows the NEWEST (`listHfFiles`, `created_at DESC`), so
 * the screen took a hazard-related use scenario into a file it had just said it
 * could not tie to the project. And the add form and AnA's action said the write
 * is "audit-logged"; the route records that creating a scenario writes no audit
 * row (human-factors.ts:269).
 *
 * This file is the one that exercises TODAY's response (no `meta.scope`).
 * humanFactorsSummativeGate.test.tsx and humanFactorsHonesty.test.tsx serve
 * `scope: 'program'`, a shape the route cannot send until slice 19 keys
 * `hf_engineering_files` to a project.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { HumanFactors } from '../surfaces/HumanFactors';
import { clearShellProject, publishShellProject } from '../shellProject';

/** The open project. The screen reads its file by project, and draws a file only when the route says it is this
 *  project's (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/). */
const PROJECT = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';

/** Another project's file, as the route returns it today: no project key. */
const FILE_DATA = {
  device: 'OTHER-PROJECT pump — infusion pump',
  framework: 'IEC 62366-1',
  present: { useSpecification: true, userProfiles: true },
  scenarios: [
    {
      id: 'hfs-9',
      task: 'Other project bolus programming',
      useError: 'Decimal misplaced',
      potentialHarmSeverity: 'critical',
      mitigated: false,
    },
  ],
};
const TODAYS_READ = { data: FILE_DATA, meta: { count: 1, source: 'hf_engineering_files' } };
const KEYED_READ = { data: FILE_DATA, meta: { count: 1, source: 'hf_engineering_files', scope: 'program', programId: PROJECT } };

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const serve = (payload: unknown) =>
  apiRequest.mockImplementation(async (method: string) =>
    method === 'GET' ? ok(payload) : ok({ data: null }),
  );

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('human-factors');
  return null;
}

function mount() {
  return render(
    <>
      <HumanFactors surface={{ id: 'human-factors', label: 'Human factors' } as never}
        onAsk={vi.fn()} onNav={vi.fn()} segment="device" />
      <Probe />
    </>,
  );
}

const bodyText = () => document.body.textContent || '';
const NOT_KEYED = /Shown once this screen reads this project's records/;
const ADD_SCENARIO = { name: /Add use scenario/ };

afterEach(() => { cleanup(); clearShellProject(); });
beforeEach(() => { seen = null; apiRequest.mockReset(); publishShellProject({ id: PROJECT, title: 'Aurora' }); });

describe("HumanFactors — the organization's first file is not shown as this project's (slice 0)", () => {
  it("shows none of the file's records when the read is not keyed to the project", async () => {
    serve(TODAYS_READ);
    mount();
    await waitFor(() => expect(bodyText()).not.toMatch(/Loading the HFE\/UE file/));

    expect(bodyText()).not.toMatch(/OTHER-PROJECT pump/);
    expect(bodyText()).not.toMatch(/Other project bolus programming/);
    expect(bodyText()).not.toMatch(/complete against IEC 62366-1/);
    expect(bodyText()).not.toMatch(/critical-task gate/i);
    expect(screen.queryByRole('button', { name: /Use environments/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mitigate' })).toBeNull();
  });

  it('says why the file is not shown, in one spelling', async () => {
    serve(TODAYS_READ);
    mount();

    const note = await screen.findByTestId('hf-not-keyed');
    expect(note.textContent ?? '').toMatch(NOT_KEYED);
    expect(note.textContent ?? '').toMatch(/organization's first HFE\/UE file/);
    expect(note.textContent ?? '').not.toMatch(/organisation/);
  });

  it('offers no use-scenario write into a file it cannot tie to the project', async () => {
    serve(TODAYS_READ);
    mount();
    await waitFor(() => expect(bodyText()).not.toMatch(/Loading the HFE\/UE file/));

    expect(screen.queryByRole('button', ADD_SCENARIO)).toBeNull();
    expect(screen.queryByRole('button', { name: /Record a hazard-related use scenario/ })).toBeNull();
  });

  it('does not hand AnA the hidden file as this screen’s', async () => {
    serve(TODAYS_READ);
    mount();
    // Settled: the read answered and the loading context was replaced.
    await waitFor(() => expect(seen?.summary ?? 'still loading').not.toMatch(/still loading/));

    const published = JSON.stringify(seen);
    expect(published).not.toMatch(/OTHER-PROJECT pump/);
    expect(published).not.toMatch(/Other project bolus programming/);
    expect(seen?.facts).toBeUndefined();
    expect(published).not.toMatch(/Add a use scenario/);
  });

  it('renders the file, and the add control, once the route reports it keyed to the project', async () => {
    // Over-correction guard: slice 19 keys the read, and the panels come back
    // with no further client change.
    serve(KEYED_READ);
    mount();

    await waitFor(() => expect(bodyText()).toMatch(/must be mitigated before summative testing/));
    expect(bodyText()).toMatch(/OTHER-PROJECT pump/);
    expect(screen.queryByTestId('hf-not-keyed')).toBeNull();
    expect(screen.getByRole('button', ADD_SCENARIO)).toBeTruthy();
  });

  /* Audit 2 of slice 0: the empty branch runs before the keyed check, so an
     organization with no file read "… appear here" — and a file recorded next
     would not appear, it would be hidden behind the not-keyed note. AnA was
     also offered "Create the HFE/UE file for this device", which no AnA tool
     and no control on this screen performs. */
  const EMPTY_READ = { data: null, meta: { count: 0, source: 'hf_engineering_files' } };
  const EMPTY_KEYED_READ = { data: null, meta: { count: 0, source: 'hf_engineering_files', scope: 'program', programId: PROJECT } };

  it('does not promise that a recorded file appears here while the read is not keyed', async () => {
    serve(EMPTY_READ);
    mount();
    await screen.findByText('No HFE/UE file yet');

    expect(bodyText()).not.toMatch(/appear here/);
    expect(bodyText()).toMatch(/No IEC 62366-1 HFE\/UE file is recorded for the organization\./);
    expect(bodyText()).toMatch(/A file is shown here once this screen reads this project's records\./);
  });

  it('does not offer AnA a file-creation action nothing performs', async () => {
    serve(EMPTY_READ);
    mount();
    await waitFor(() => expect(seen?.summary ?? '').toMatch(/no HFE\/UE file yet/));

    expect(JSON.stringify(seen)).not.toMatch(/Create the HFE\/UE file/);
    expect(seen?.summary ?? '').not.toMatch(/appear/);
  });

  it('keeps the original empty hint once the route reports the read keyed to the project', async () => {
    // Over-correction guard: once keyed, a recorded file does appear here.
    serve(EMPTY_KEYED_READ);
    mount();
    await screen.findByText('No HFE/UE file yet');

    expect(bodyText()).toMatch(/use-related risk analysis — the gate before summative usability testing — appear here\./);
    expect(bodyText()).not.toMatch(/recorded for the organization/);
    expect(JSON.stringify(seen)).not.toMatch(/Create the HFE\/UE file/);
  });

  it('does not say adding a use scenario is audit-logged, which the route does not record', async () => {
    serve(KEYED_READ);
    mount();
    fireEvent.click(await screen.findByRole('button', ADD_SCENARIO));

    const form = await screen.findByRole('button', { name: /Add scenario/ });
    expect(form).toBeTruthy();
    expect(bodyText()).not.toMatch(/audit-logged/);

    const actions = (seen?.availableActions ?? []).join('\n');
    expect(actions).toMatch(/Add a use scenario/);
    expect(actions).not.toMatch(/Add a use scenario[^\n]*audit-logged/);
    // Over-correction guard: the element write does record an audit row
    // (human-factors.ts, PATCH /elements), and keeps saying so.
    expect(actions).toMatch(/HFE\/UE file element[^\n]*audit-logged/);
  });
});
