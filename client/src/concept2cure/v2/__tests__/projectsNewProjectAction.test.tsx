// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
vi.mock('../surfaces/AnaVerbs', () => ({ RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) =>
  <button onClick={() => onChange('us_ind')}>Pick IND</button> }));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: () => ({
  id: 'us_ind', displayName: 'Investigational New Drug Application', pathwayKey: 'ind', agency: 'FDA', region: 'US',
}) }));

import { Projects } from '../surfaces/Projects';
import { __resetSurfaceActionBus, applySurfaceAction, openNewProject } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const props = () => ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const directive = () => {
  const resolved = resolveSurfaceAction('projects.new-project', {});
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.directive;
};
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
function Probe({ seen }: { seen: { ctx: SurfaceContext | null } }) { seen.ctx = useActiveSurfaceContext('projects'); return null; }
beforeEach(() => { __resetSurfaceActionBus(); apiRequest.mockReset().mockImplementation(async () => ok({ data: [] })); });
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('projects.new-project reaches the canonical wizard without writing', () => {
  it('opens the real wizard using a validated action, and never submits intake', async () => {
    const onNav = vi.fn();
    render(<Projects {...props()} onNav={onNav} />);
    act(() => { expect(applySurfaceAction(directive(), onNav).status).toBe('applied'); });
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pick IND' })).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(onNav).not.toHaveBeenCalled();
  });

  it('preserves a chosen filing and typed input when opened again', async () => {
    render(<Projects {...props()} />);
    act(() => { openNewProject(vi.fn()); });
    fireEvent.click(await screen.findByRole('button', { name: 'Pick IND' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitForIntakeWorkspace();
    const input = screen.getByRole('textbox', { name: /^Project name/ }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Preserve this project name' } });
    act(() => {
      const result = openNewProject(vi.fn());
      expect(result.status).toBe('applied');
      if (result.status === 'applied') expect(result.detail).toMatch(/already open/i);
    });
    expect(screen.getByRole('textbox', { name: /^Project name/ })).toHaveProperty('value', 'Preserve this project name');
    expect(posts()).toHaveLength(0);
  });

  it('stashes across navigation and mount and consumes the opener once', async () => {
    const onNav = vi.fn();
    expect(openNewProject(onNav).status).toBe('stashed');
    expect(onNav).toHaveBeenCalledExactlyOnceWith('projects');
    const first = render(<Projects {...props()} />);
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeTruthy();
    first.unmount();
    render(<Projects {...props()} />);
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'New project' })).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('keeps other portfolio actions guarded while the person is in intake', async () => {
    render(<Projects {...props()} />);
    act(() => { openNewProject(vi.fn()); });
    await screen.findByRole('heading', { name: 'New project' });
    const filter = resolveSurfaceAction('projects.filter', { workstream: 'MDX' });
    if (!filter.ok) throw new Error(filter.error);
    act(() => { expect(applySurfaceAction(filter.directive, vi.fn()).status).toBe('failed'); });
    expect(screen.getByRole('heading', { name: 'New project' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it('does not advertise an AnA cancellation action while the wizard owns the screen', async () => {
    const seen = { ctx: null as SurfaceContext | null };
    render(<><Projects {...props()} /><Probe seen={seen} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    await screen.findByRole('heading', { name: 'New project' });
    await waitFor(() => expect(seen.ctx?.summary).toContain('new-project wizard'));
    expect(seen.ctx?.availableActions?.join(' ')).not.toMatch(/cancel the wizard/i);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('can open intake even when the portfolio read failed', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Read failed' }) }));
    render(<Projects {...props()} />);
    await screen.findByText("Couldn't load the project portfolio");
    act(() => { expect(openNewProject(vi.fn()).status).toBe('applied'); });
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});
