// @vitest-environment jsdom
/** The real shell's Live Drive queue must honor the real protocol workspace's status-only guard. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers, turnControls, flush, installDriveBrowserMocks, SEARCH, START_ASSIST } from './liveDriveShell.fixtures';
import type { DriveSseEvent, DriveTurnControls } from '../../components/ana/useAnaChat';
import type { SurfaceActionOutcome } from '../surfaceActions';

const chat = vi.hoisted(() => ({
  shellOpts: null as null | { onDriveEvent?: (event: DriveSseEvent, controls?: DriveTurnControls) => void; onArtifactSaved?: (id: string) => void },
  send: vi.fn(), stop: vi.fn(), interject: vi.fn(async () => true),
  loadThread: vi.fn(async () => undefined), reset: vi.fn(), pause: vi.fn(), resume: vi.fn(),
}));
vi.mock('../../components/ana/useAnaChat', async original => ({
  ...await original<typeof import('../../components/ana/useAnaChat')>(),
  useAnaChat: (opts: Record<string, unknown>) => {
    if ('driveMode' in opts) chat.shellOpts = opts as typeof chat.shellOpts;
    return { messages: [], isStreaming: false, isLoadingThread: false, pendingSteers: [], runStatus: null, threadId: null,
      send: chat.send, stop: chat.stop, reset: chat.reset, interject: chat.interject,
      loadThread: chat.loadThread, pause: chat.pause, resume: chat.resume };
  },
}));

const bus = vi.hoisted(() => ({ deferred: [] as Array<(outcome: SurfaceActionOutcome) => void>, immediate: [] as SurfaceActionOutcome[] }));
vi.mock('../surfaceActions', async original => ({
  ...await original<typeof import('../surfaceActions')>(),
  applySurfaceAction: vi.fn((directive: { surfaceId: string }, nav: (id: string) => void, deferred?: (outcome: SurfaceActionOutcome) => void): SurfaceActionOutcome => {
    const immediate = bus.immediate.shift();
    if (immediate) return immediate;
    if (deferred) bus.deferred.push(deferred);
    // Artifact follow-through uses the same bus without a deferred outcome;
    // model its existing cross-owner navigation through the shell callback.
    else nav(directive.surfaceId);
    return { status: 'stashed' };
  }),
}));

const fixture = vi.hoisted(() => ({
  mounts: 0, unmounts: 0,
  doc: {
    id: '41', title: 'Dose-ranging study', shortTitle: 'BX-410-201', kind: 'clinical', version: '0.7', status: 'draft',
    openSection: '101', sections: [{ id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: '2026-10-30T10:00:00.000Z' }],
    content: { 101: [{ p: 'The recorded clinical protocol.' }] }, objectives: [], completenessFindings: [], studyDesign: null,
  },
}));
/* Only replace the selected-document server read with a deterministic saved
   record. The mounted workspace, shared editor, guard and V2App queue are real.
   The authoring mount exercises its declared authoringDocType parameter using
   the same status-only record, without mocking directive validation or routing. */
vi.mock('../surfaceViews', async original => {
  const real = await original<typeof import('../surfaceViews')>();
  const react = await import('react');
  const { ProtocolWorkspaceDoc } = await import('../surfaces/ProtocolDevWorkspace');
  function SavedProtocol({ onNav }: { onNav: (id: string) => void }) {
    react.useEffect(() => { fixture.mounts += 1; return () => { fixture.unmounts += 1; }; }, []);
    return react.createElement(ProtocolWorkspaceDoc, { doc: fixture.doc, onNav, onAsk: () => undefined });
  }
  return { ...real, SURFACE_VIEWS: {
    ...real.SURFACE_VIEWS,
    'protocol-dev': { ...real.SURFACE_VIEWS['protocol-dev'], component: SavedProtocol },
    'document-authoring': { ...real.SURFACE_VIEWS['document-authoring'], component: SavedProtocol },
  } };
});

import { V2App } from '../V2App';
import { locationForSurface } from '../routing';
import { applySurfaceAction, __resetSurfaceActionBus, registerSurfaceActionHandlers, registeredSurfaceId } from '../surfaceActions';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';
import { setAnaLockedScreens } from '../../components/ana/anaLockedScreens';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const OTHER = '9c9c9c9c-1111-4222-8333-444455556666';
const REFUSAL = 'Save the pending section changes before switching work.';
const OTHER_PROJECT = { id: OTHER, name: 'Another project' };
const NAV_OTHER = { actionType: 'navigate', targetId: 'vault', program: OTHER_PROJECT };
const extraGuards: Array<() => void> = [];

function drive(event: DriveSseEvent, controls: DriveTurnControls) {
  act(() => chat.shellOpts!.onDriveEvent!(event, controls));
}
async function mountShell(surface = 'protocol-dev') {
  window.history.replaceState({}, '', locationForSurface(surface));
  publishShellProject({ id: PID, title: 'BX-410' });
  render(<Providers><V2App /></Providers>);
  const canvas = await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
  expect(chat.shellOpts?.onDriveEvent).toBeTypeOf('function');
  return canvas;
}
function statusOnlyPending() {
  fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
  expect(surfaceLeaveRefusal()).toBe(REFUSAL);
  const beforeUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(false);
}
function snapshot() {
  const params = { surfaceId: 'vault', params: { source: 'existing handoff' }, setAt: Date.now() };
  window.C2C_NAV_PARAMS = params;
  return { params, url: window.location.href, project: readShellProject(), mounts: fixture.mounts };
}
function expectRetained(before: ReturnType<typeof snapshot>, canvas: HTMLElement) {
  expect(window.location.href).toBe(before.url);
  expect(readShellProject()).toBe(before.project);
  expect(window.C2C_NAV_PARAMS).toBe(before.params);
  expect(fixture.mounts).toBe(before.mounts);
  expect(fixture.unmounts).toBe(0);
  expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
  expect((screen.getByLabelText(/Section status/) as HTMLSelectElement).value).toBe('complete');
}

beforeEach(() => {
  localStorage.clear();
  chat.shellOpts = null;
  Object.values(chat).forEach(value => { if (vi.isMockFunction(value)) value.mockClear(); });
  bus.deferred.length = 0;
  bus.immediate.length = 0;
  fixture.mounts = 0; fixture.unmounts = 0;
  vi.mocked(applySurfaceAction).mockClear();
  installDriveBrowserMocks();
});

describe('actions use the mounted owner rather than bypassing the pending-work guard', () => {
  it('refuses a cross-owner action before the action bus can navigate or stash it', async () => {
    const canvas = await mountShell();
    statusOnlyPending();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'cross-owner-search' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining(REFUSAL), 'cross-owner-search');
    expect(applySurfaceAction).not.toHaveBeenCalled();
    expect(run.moveLanded).not.toHaveBeenCalled();
    expectRetained(before, canvas);
  });

  it('still hands a same-owner action to its handler even when the owner is nested inside another route', async () => {
    const canvas = await mountShell('document-authoring');
    statusOnlyPending();
    const before = snapshot();
    expect(registeredSurfaceId()).toBe('protocol-dev');
    const run = turnControls();
    drive(START_ASSIST, run);
    bus.immediate.push({ status: 'failed', reason: 'The protocol section handler kept its pending editor.' });
    drive({ type: 'drive_action', directive: { actionType: 'surface_action', actionId: 'protocol-dev.open-section', params: { section: '1' } }, moveId: 'same-owner-action' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(applySurfaceAction).toHaveBeenCalledOnce();
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining('The protocol section handler kept its pending editor.'), 'same-owner-action');
    expectRetained(before, canvas);
  });

  it('resolves a declared action-owner alias before comparing it with the registered canonical owner', async () => {
    const canvas = await mountShell();
    statusOnlyPending();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    // The real authoring actions name owner "authoring"; the mounted editor
    // registers its canonical "document-authoring" id. Keep that alias valid.
    extraGuards.push(registerSurfaceActionHandlers('document-authoring', {}));
    bus.immediate.push({ status: 'failed', reason: 'The canonical editor handler owns this refusal.' });
    drive({ type: 'drive_action', directive: { actionType: 'surface_action', actionId: 'authoring.open-section', params: { sectionCode: '1' } }, moveId: 'alias-owner-action' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(applySurfaceAction).toHaveBeenCalledOnce();
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining('The canonical editor handler owns this refusal.'), 'alias-owner-action');
    expectRetained(before, canvas);
  });
});

describe('saved-artifact follow-through preserves pending protocol work', () => {
  it('consumes blocked artifact focus without replaying it after the guard clears, and allows a fresh artifact', async () => {
    const canvas = await mountShell();
    statusOnlyPending();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    act(() => chat.shellOpts!.onArtifactSaved!('artifact-blocked'));
    expect(applySurfaceAction).not.toHaveBeenCalled();
    expectRetained(before, canvas);
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'draft' } });
    expect(surfaceLeaveRefusal()).toBeNull();
    act(() => chat.shellOpts!.onArtifactSaved!('artifact-blocked'));
    await flush();
    expect(applySurfaceAction).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before.url);
    expect(window.C2C_NAV_PARAMS).toBe(before.params);
    act(() => chat.shellOpts!.onArtifactSaved!('artifact-fresh'));
    await waitFor(() => expect(window.location.pathname).toBe(locationForSurface('vault')));
    expect(applySurfaceAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ actionId: 'vault.focus-document', params: { artifactId: 'artifact-fresh' } }), expect.any(Function));
    expect(readShellProject()).toBe(before.project);
  });
});
afterEach(() => {
  cleanup();
  extraGuards.splice(0).forEach(unregister => unregister());
  __resetSurfaceActionBus();
  clearNavParams(); clearShellProject(); setAnaLockedScreens([]);
  vi.unstubAllGlobals(); localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('AnA navigation honors the protocol workspace leave refusal', () => {
  it('preserves surface, project identity, handoff and pane and reports the actual reason to the driving run once', async () => {
    const canvas = await mountShell();
    statusOnlyPending();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    drive({ type: 'drive_navigation', directive: NAV_OTHER, moveId: 'pending-protocol' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining(REFUSAL), 'pending-protocol');
    expect(run.moveLanded).not.toHaveBeenCalled();
    expect(run.interject).not.toHaveBeenCalled();
    expect(chat.interject).not.toHaveBeenCalled();
    expectRetained(before, canvas);
    await flush(350);
    expect(run.reportScreen).toHaveBeenCalledOnce();
  });

  it('refuses a validated same-surface parameter handoff before it can remount pending work', async () => {
    const canvas = await mountShell('document-authoring');
    statusOnlyPending();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    drive({ type: 'drive_navigation', directive: { actionType: 'navigate', targetId: 'authoring', params: { authoringDocType: 'protocol' } }, moveId: 'same-surface' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining(REFUSAL), 'same-surface');
    expect(run.moveLanded).not.toHaveBeenCalled();
    expectRetained(before, canvas);
  });
});

describe('queued navigation rechecks current work without replaying a refused move', () => {
  it('refuses a previously queued move when section status becomes pending, and requires a fresh request after it is reverted', async () => {
    const canvas = await mountShell();
    const before = snapshot();
    const run = turnControls();
    drive(START_ASSIST, run);
    drive({ type: 'drive_action', directive: SEARCH, moveId: 'running-operation' }, run);
    drive({ type: 'drive_navigation', directive: { actionType: 'navigate', targetId: 'protocol-dev', program: OTHER_PROJECT }, moveId: 'queued-project' }, run);
    await waitFor(() => expect(bus.deferred).toHaveLength(1));
    statusOnlyPending();
    act(() => bus.deferred[0]({ status: 'applied' }));
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining(REFUSAL), 'queued-project');
    expect(run.moveLanded.mock.calls).toEqual([['running-operation']]);
    expectRetained(before, canvas);
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'draft' } });
    expect(surfaceLeaveRefusal()).toBeNull();
    await flush(350);
    expect(readShellProject()).toBe(before.project);
    expect(window.C2C_NAV_PARAMS).toBe(before.params);
    expect(fixture.mounts).toBe(before.mounts);
    expect(run.moveLanded.mock.calls).toEqual([['running-operation']]);
    drive({ type: 'drive_navigation', directive: { actionType: 'navigate', targetId: 'protocol-dev', program: OTHER_PROJECT }, moveId: 'fresh-project' }, run);
    await waitFor(() => expect(run.moveLanded).toHaveBeenCalledWith('fresh-project'));
    expect(readShellProject()?.id).toBe(OTHER);
    expect(fixture.mounts).toBe(before.mounts + 1);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
    expect(run.reportScreen).toHaveBeenCalledOnce();
  });

  it('fails closed when a registered guard cannot determine whether leaving is safe', async () => {
    await mountShell();
    const before = snapshot();
    extraGuards.push(registerSurfaceLeaveGuard(() => { throw new Error('guard read unavailable'); }));
    const run = turnControls();
    drive(START_ASSIST, run);
    drive({ type: 'drive_navigation', directive: NAV_OTHER, moveId: 'failed-guard' }, run);
    await waitFor(() => expect(run.reportScreen).toHaveBeenCalledOnce());
    expect(run.reportScreen).toHaveBeenCalledWith(expect.stringContaining('Finish or close the work on this screen before navigating.'), 'failed-guard');
    expect(window.location.href).toBe(before.url);
    expect(readShellProject()).toBe(before.project);
    expect(window.C2C_NAV_PARAMS).toBe(before.params);
    expect(run.moveLanded).not.toHaveBeenCalled();
  });
});
