import React from 'react';
import { vi } from 'vitest';
import { act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import type { DriveTurnControls, DriveSseEvent } from '../../components/ana/useAnaChat';

export function turnControls(): DriveTurnControls & {
  interject: ReturnType<typeof vi.fn>;
  reportScreen: ReturnType<typeof vi.fn>;
  moveLanded: ReturnType<typeof vi.fn>;
} {
  return {
    stop: vi.fn(),
    interject: vi.fn(async () => true),
    reportScreen: vi.fn(async () => true),
    moveLanded: vi.fn(async () => true),
  };
}

export function strip(): HTMLElement | null {
  return document.querySelector('.ana-drive-strip');
}

export function stepText(): string | null {
  return strip()?.querySelector('.ana-drive-step')?.textContent ?? null;
}

export async function flush(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TenantProvider>{children}</TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function installDriveBrowserMocks() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
  );
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const NoopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= NoopObserver;
  (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ??= NoopObserver;
}

export const SEARCH = { actionType: 'surface_action', actionId: 'vault.search', params: { query: 'stability' } };
export const FILTER = { actionType: 'surface_action', actionId: 'vault.search', params: { query: 'second' } };
export const START_ASSIST: DriveSseEvent = { type: 'drive_state', enabled: true, mode: 'assist' };
export const PROMOTED: DriveSseEvent = { type: 'drive_state', enabled: true, mode: 'demo', promoted: true };
