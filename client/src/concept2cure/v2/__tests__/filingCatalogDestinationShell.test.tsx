/** @vitest-environment jsdom */
/** The actual URL/action owner; canvas content and network are isolated. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const observed = vi.hoisted(() => ({ opened: 0 }));
vi.mock('../surfaceViews', async () => {
  const React = await import('react');
  const { useSurfaceActionHandlers } = await import('../surfaceActions');
  function Projects({ onNav }: { onNav: (id: string) => void }) {
    const [view, setView] = React.useState('Projects destination');
    useSurfaceActionHandlers('projects', { 'projects.new-project': () => {
      observed.opened += 1; setView('New project destination'); return { ok: true };
    } });
    return <><h1>{view}</h1>
      <button onClick={() => onNav('filings-catalog')}>Open old filing catalogue</button>
      <button onClick={() => setView('Selected filing retained')}>Choose a filing</button>
      <button onClick={() => setView('Projects destination')}>Cancel wizard</button>
    </>;
  }
  return { SURFACE_VIEWS: { projects: { component: Projects } } };
});
import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { clearShellProject, publishShellProject, restoreShellProject } from '../shellProject';
import { destinationFor } from '../routing';

function mount(location: string, strict = false) {
  window.history.pushState({}, '', location); restoreShellProject();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = <QueryClientProvider client={client}><AuthProvider><TenantProvider><V2App /></TenantProvider></AuthProvider></QueryClientProvider>;
  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearShellProject(); observed.opened = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })));
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  const Observer = class { observe() {} unobserve() {} disconnect() {} };
  vi.stubGlobal('ResizeObserver', Observer); vi.stubGlobal('IntersectionObserver', Observer);
});
afterEach(() => { cleanup(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('the old filing catalogue reaches the core wizard', () => {
  it.each([false, true])('uses the same global wizard action with project-open=%s', projectOpen => {
    expect(destinationFor('filings-catalog', projectOpen)).toEqual({ surfaceId: 'projects', applies: { actionId: 'projects.new-project', params: {} } });
  });

  it('replaces a copied URL once in StrictMode and preserves query and hash', async () => {
    mount('/concept2cure/filings-catalog?view=reference#filing', true);
    expect(await screen.findByRole('heading', { name: 'New project destination' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/projects'));
    expect(window.location.search).toBe('?view=reference'); expect(window.location.hash).toBe('#filing');
    expect(observed.opened).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a filing' }));
    publishShellProject({ id: '6191805f-e83d-4327-af00-aa2c6f4d43b0', title: 'Context refresh' });
    expect(screen.getByRole('heading', { name: 'Selected filing retained' })).toBeTruthy();
    expect(observed.opened).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel wizard' }));
    expect(screen.getByRole('heading', { name: 'Projects destination' })).toBeTruthy();
  });

  it('imperative old navigation opens the wizard through one canonical history write', async () => {
    mount('/concept2cure/projects'); const before = window.history.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Open old filing catalogue' }));
    expect(await screen.findByRole('heading', { name: 'New project destination' })).toBeTruthy();
    expect(window.location.pathname).toBe('/concept2cure/projects'); expect(window.history.length).toBe(before + 1);
    expect(observed.opened).toBe(1);
  });
});
