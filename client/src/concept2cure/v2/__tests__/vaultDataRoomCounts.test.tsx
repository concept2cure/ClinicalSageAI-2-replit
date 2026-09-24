// @vitest-environment jsdom
/**
 * The Vault's data-room lane: a full window says it is full, and a source the
 * classifier refused reads "Needs review", not "Classified".
 * Server half: server/routes/__tests__/vault-data-room-counts.test.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, ok, vaultPayload, props, mockVaultApi } from './_vault-surface-fixtures';

const row = (id: number, stage: string, over: Record<string, unknown> = {}) => ({
  id, title: `Source ${id}`, kind: 'PDF', sizeLabel: '2 KB', addedAt: '1d ago', stage, readState: 'Read',
  suggestedFolder: null, suggestedFolderLabel: '—', evidenceKind: null, confidence: null,
  needsReview: stage === 'needs_review', ...over,
});

function Probe({ onCtx }: { onCtx: (c: SurfaceContext | null) => void }) {
  onCtx(useActiveSurfaceContext('vault'));
  return null;
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('Vault data room lane', () => {
  it('a full window reads as a floor, says so, and AnA is told', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload({
      dataRoom: {
        captured: 200, classified: 150, filed: 90, needsReview: 12,
        sources: [row(1, 'filed'), row(2, 'classified')],
        window: { shown: 200, truncated: true },
      },
    })));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><Vault {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    const lane = await screen.findByTestId('vault-data-room');
    await waitFor(() => expect(lane.textContent).toContain('Captured 200+'));
    expect(lane.textContent).toMatch(/newest 200 sources/);
    expect(lane.textContent).toContain('12 need review');
    await waitFor(() => expect((seen.ctx?.facts as any)?.dataRoom?.truncated).toBe(true));
    expect((seen.ctx?.facts as any).dataRoom.needsReview).toBe(12);
  });

  it('a refused source is shown as needing review, not as classified', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload({
      dataRoom: {
        captured: 1, classified: 0, filed: 0, needsReview: 1,
        sources: [row(7, 'needs_review')],
        window: { shown: 1, truncated: false },
      },
    })));
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByText('Show 1 source'));
    const lane = screen.getByTestId('vault-data-room');
    expect(lane.textContent).toContain('Needs review');
    expect(lane.textContent).not.toMatch(/newest \d+ sources/);
    expect(lane.textContent).toContain('Captured 1');
    expect(lane.textContent).not.toContain('Captured 1+');
  });
});
