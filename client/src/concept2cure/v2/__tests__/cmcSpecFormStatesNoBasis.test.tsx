// @vitest-environment jsdom
/**
 * The new-specification form states no regulatory basis the person did not.
 *
 * What it used to do (until 2026-11-13): a new specification's "ICH reference"
 * was pre-filled "ICH Q6B", the guideline for biotechnological products, and
 * the form's examples were an antibody's ("Charge variants", "SE-HPLC"). The
 * release composes small-molecule Module 3, whose specifications are set under
 * ICH Q6A. A specification created without touching the field was recorded,
 * and listed on the register, under a guideline that does not govern it.
 * The basis is recorded as the person states it and is never defaulted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) }) as Response);
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

async function openNewSpecification() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Specifications' }));
  fireEvent.click(await screen.findByRole('button', { name: /New specification/ }));
  return within(await screen.findByRole('dialog'));
}

describe('the new-specification form', () => {
  it('leaves the ICH reference for the person to state, and names both guidelines', async () => {
    const form = await openNewSpecification();
    const ich = form.getByLabelText((label) => label.startsWith('ICH reference')) as HTMLInputElement;
    expect(ich.value).toBe('');
    expect(ich.placeholder).toContain('ICH Q6A');
    expect(ich.placeholder).toContain('ICH Q6B');
  });

  it('gives examples a small-molecule programme records', async () => {
    const form = await openNewSpecification();
    const placeholders = Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea'))
      .map((el) => (el as HTMLInputElement).placeholder);
    expect(placeholders).toContain('e.g. Assay');
    expect(placeholders.join(' | ')).not.toMatch(/Charge variants|SE-HPLC/);
    expect(form.getByLabelText((label) => label.startsWith('Quality attribute'))).toBeTruthy();
  });
});
