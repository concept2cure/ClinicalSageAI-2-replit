/** @vitest-environment jsdom */
/** The actual shell, history and action bus; network and canvas contents stubbed. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const observed = vi.hoisted(() => ({ calls: 0, filterCalls: 0, visits: [] as string[] }));
vi.mock('../surfaceViews', async () => {
  const React = await import('react');
  const { useSurfaceActionHandlers } = await import('../surfaceActions');
  const { readShellProject, updateShellProject } = await import('../shellProject');
  function Projects({ onNav }: { onNav: (id: string) => void }) {
    observed.visits.push('projects');
    const [workstream, setWorkstream] = React.useState('all');
    const [, rerender] = React.useState(0);
    useSurfaceActionHandlers('projects', {
      'projects.filter': params => {
        observed.filterCalls += 1;
        setWorkstream(params.workstream);
        return { ok: true };
      },
    });
    return <>
      <h1>Projects destination</h1><p>Selected workstream: {workstream}</p>
      <button onClick={() => onNav('dossier')}>Open legacy dossier</button>
      <button onClick={() => onNav('mdx')}>Open legacy MDX</button>
      <button onClick={() => setWorkstream('Biotech')}>Choose Biotech</button>
      <button onClick={() => rerender(value => value + 1)}>Refresh portfolio view</button>
    </>;
  }
  function Author({ onNav }: { onNav: (id: string) => void }) {
    observed.visits.push('project-home');
    const [stage, setStage] = React.useState(readShellProject()?.step ?? 'plan');
    useSurfaceActionHandlers('project-home', {
      'project-home.set-stage': params => {
        observed.calls += 1;
        setStage(params.stage);
        updateShellProject({ step: params.stage });
        return { ok: true };
      },
    });
    return <>
      <h1>Project destination: {stage}</h1>
      <button onClick={() => { setStage('evidence'); updateShellProject({ step: 'evidence' }); }}>Choose Evidence</button>
      <button onClick={() => updateShellProject({ title: 'Refreshed project details' })}>Refresh project details</button>
      <button onClick={() => onNav('projects')}>Projects index</button>
    </>;
  }
  return { SURFACE_VIEWS: {
    projects: { component: Projects }, 'project-home': { component: Author },
    apps: { component: () => <h1>Features destination</h1> },
  } };
});
import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { clearShellProject, publishShellProject, restoreShellProject } from '../shellProject';

const PROGRAM = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
function mount(location: string, strict = false) {
  window.history.pushState({}, '', location);
  // V2App's actual browser boot calls this before rendering the component.
  restoreShellProject();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = <QueryClientProvider client={client}><AuthProvider><TenantProvider><V2App /></TenantProvider></AuthProvider></QueryClientProvider>;
  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearShellProject();
  observed.calls = 0; observed.filterCalls = 0; observed.visits = [];
  __resetSurfaceActionBus();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })));
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  const Observer = class { observe() {} unobserve() {} disconnect() {} };
  vi.stubGlobal('ResizeObserver', Observer); vi.stubGlobal('IntersectionObserver', Observer);
});
afterEach(() => {
  cleanup(); __resetSurfaceActionBus(); clearShellProject(); localStorage.clear(); sessionStorage.clear();
  vi.unstubAllGlobals(); window.history.replaceState({}, '', '/');
});

describe('project destination in the real shell', () => {
  it('replaces a no-project dossier URL with Projects and no pending Author action', async () => {
    mount('/concept2cure/dossier-map?view=compact#section');
    expect(await screen.findByRole('heading', { name: 'Projects destination' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/projects'));
    expect(window.location.search).toBe('?view=compact');
    expect(window.location.hash).toBe('#section');
    expect(observed.calls).toBe(0);
    expect(observed.visits).not.toContain('project-home');
  });

  it('hydrates a copied project URL before deciding scope, then applies Author once', async () => {
    mount(`/concept2cure/dossier-map?program=${PROGRAM}&view=compact#section`, true);
    expect(await screen.findByRole('heading', { name: 'Project destination: author' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/project-home'));
    expect(window.location.search).toContain(`program=${PROGRAM}`);
    expect(window.location.search).toContain('view=compact');
    expect(window.location.hash).toBe('#section');
    expect(observed.visits).not.toContain('projects');
    expect(observed.calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Evidence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh project details' }));
    expect(screen.getByRole('heading', { name: 'Project destination: evidence' })).toBeTruthy();
    expect(observed.calls).toBe(1);
  });

  it('applies imperative legacy navigation once and writes one canonical history entry', async () => {
    publishShellProject({ id: PROGRAM });
    mount('/concept2cure/projects');
    const before = window.history.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Open legacy dossier' }));
    expect(await screen.findByRole('heading', { name: 'Project destination: author' })).toBeTruthy();
    expect(window.location.pathname).toBe('/concept2cure/project-home');
    expect(window.history.length).toBe(before + 1);
    expect(observed.calls).toBe(1);
  });

  it('keeps the features address without a project or alias action', async () => {
    mount('/concept2cure/features');
    expect(await screen.findByRole('heading', { name: 'Features destination' })).toBeTruthy();
    expect(window.location.pathname).toBe('/concept2cure/features');
    expect(observed.calls).toBe(0);
  });

  it('browser Back returns to Projects rather than an alias history entry', async () => {
    publishShellProject({ id: PROGRAM });
    mount('/concept2cure/projects');
    fireEvent.click(await screen.findByRole('button', { name: 'Open legacy dossier' }));
    await screen.findByRole('heading', { name: 'Project destination: author' });
    const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    await act(async () => { window.history.back(); await popped; });
    expect(await screen.findByRole('heading', { name: 'Projects destination' })).toBeTruthy();
    expect(window.location.pathname).toBe('/concept2cure/projects');
    expect(observed.calls).toBe(1);
  });

  it('a reload on the canonical URL restores the chosen step without replaying the alias', async () => {
    mount(`/concept2cure/dossier?program=${PROGRAM}`);
    await screen.findByRole('heading', { name: 'Project destination: author' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose Evidence' }));
    const url = window.location.pathname + window.location.search;
    expect(url).toMatch(/^\/concept2cure\/project-home/);
    cleanup();
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    mount(url);
    expect(await screen.findByRole('heading', { name: 'Project destination: evidence' })).toBeTruthy();
    expect(observed.calls).toBe(1);
  });
});


describe('MDX entry reaches the global Projects filter', () => {
  it.each([false, true])('copies a legacy link in StrictMode with project=%s and applies MDX once', async projectOpen => {
    const query = projectOpen ? `?program=${PROGRAM}&view=compact` : '?view=compact';
    mount(`/concept2cure/mdx${query}#devices`, true);
    expect(await screen.findByRole('heading', { name: 'Projects destination' })).toBeTruthy();
    expect(await screen.findByText('Selected workstream: MDX')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/projects'));
    expect(window.location.search).toBe(query);
    expect(window.location.hash).toBe('#devices');
    expect(observed.filterCalls).toBe(1);
    expect(observed.visits).not.toContain('project-home');
    fireEvent.click(screen.getByRole('button', { name: 'Choose Biotech' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh portfolio view' }));
    expect(screen.getByText('Selected workstream: Biotech')).toBeTruthy();
    expect(observed.filterCalls).toBe(1);
  });

  it('imperative MDX navigation filters the already mounted Projects view once', async () => {
    mount('/concept2cure/projects');
    await screen.findByRole('heading', { name: 'Projects destination' });
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Open legacy MDX' }));
    expect(await screen.findByText('Selected workstream: MDX')).toBeTruthy();
    expect(window.location.pathname).toBe('/concept2cure/projects');
    expect(window.history.length).toBe(before + 1);
    expect(observed.filterCalls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Biotech' }));
    expect(screen.getByText('Selected workstream: Biotech')).toBeTruthy();
    expect(observed.filterCalls).toBe(1);
  });
});
