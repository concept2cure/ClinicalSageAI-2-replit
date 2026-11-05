// @vitest-environment jsdom
/**
 * The Vault's "Ask AnA" row is a named group. An `aria-label` on a `<div>` with no role is ignored by assistive
 * technology, so the row's name was never announced (found by the CMC session, COORDINATION.md, 2026-11-02; CMC
 * and Biostatistics were fixed then, cmcSurfaceContext.test.tsx).
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { PID, ok, vaultPayload, props, mockVaultApi } from './_vault-surface-fixtures';

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

it('names the ask row as a group, and each starter asks AnA its prompt', async () => {
  mockVaultApi(apiRequest, () => ok(vaultPayload({})));
  const p = props();
  render(<Vault {...p} />);
  const row = await screen.findByRole('group', { name: 'Ask AnA' });
  fireEvent.click(within(row).getByRole('button', { name: /What is missing for this filing\?/ }));
  expect(p.onAsk).toHaveBeenCalledWith('Which required documents for this filing are missing or unconfirmed in the Vault?');
});
