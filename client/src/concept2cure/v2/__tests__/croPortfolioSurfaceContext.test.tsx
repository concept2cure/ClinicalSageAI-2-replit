// @vitest-environment jsdom
/**
 * What the CRO portfolio tells AnA — and what it must NOT.
 *
 * The published facts channel is documented as counts/booleans/enums/status,
 * with user-authored free text (sowNote) deliberately withheld. `lead` is a CRO
 * staff member's real name (assembled from users.name via cro_team_assignments),
 * and it was being folded into `facts.sponsors[]` and `facts.selectedSponsor` on
 * every turn — an employee's identity into the model prompt (and whatever the
 * provider logs). This pins that a person's name never travels; only its
 * presence (`hasLead`) does, like the adjacent `hasSowNote`.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { CroPortfolio } from '../surfaces/CroPortfolio';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) } as Response;
}

const LEAD_NAME = 'Dr. Jane Whitfield';
const SPONSOR = {
  id: 's1', name: 'Acme CRO', type: 'full-service',
  lead: LEAD_NAME, sow: 'on-track', sowNote: 'quarterly review pending',
  studies: [{ code: 'ST-1', phase: '3', status: 'active', n: 120 }],
  subs: [{ id: 'sub-1', type: 'ind', region: 'fda', state: 'in-progress' }],
};

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('cro-portfolio');
  return null;
}

const props = () => ({
  surface: { id: 'cro-portfolio', label: 'CRO portfolio' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function renderCp() {
  return render(
    <>
      <CroPortfolio {...props()} />
      <Probe />
    </>,
  );
}

beforeEach(() => { seen = null; apiRequest.mockReset(); apiRequest.mockImplementation(async () => ok([SPONSOR])); });
afterEach(cleanup);

const settled = () => waitFor(() => expect(seen?.summary).toMatch(/sponsor client/i));

describe('CRO portfolio never publishes a staff member’s name to AnA', () => {
  it('does not leak the lead’s real name anywhere in the published context', async () => {
    renderCp();
    await settled();
    // The whole context — summary + every fact — must not carry the name.
    expect(JSON.stringify(seen)).not.toContain(LEAD_NAME);
  });

  it('publishes only the PRESENCE of a lead (hasLead), never a `lead` field', async () => {
    renderCp();
    await settled();
    const facts = seen!.facts as any;
    const s0 = facts.sponsors[0];
    expect(s0.hasLead).toBe(true);
    expect('lead' in s0).toBe(false);
    const sel = facts.selectedSponsor;
    expect(sel.hasLead).toBe(true);
    expect('lead' in sel).toBe(false);
  });
});
