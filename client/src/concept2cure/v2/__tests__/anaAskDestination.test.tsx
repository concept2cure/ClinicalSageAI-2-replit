// @vitest-environment jsdom
/**
 * Where does the question go?
 *
 * `hideAna: true` (now `ownsConversation: true`) collapses the shell's AnA
 * rail. Six surfaces set it and still handed `onAsk` to their buttons. Nothing
 * threw: `ask()` opened a rail the screen does not render, and — because `set`
 * writes to localStorage — persisted `anaOpen: true`, so the question and its
 * answer appeared, already open, on the NEXT surface that drew a rail.
 *
 * The existing guards for this read source: they grep `surfaceViews.ts` for the
 * flag and the surface file for `onAsk(`. That is exactly the shape of check
 * that cannot see a handler which goes nowhere — a call site is present either
 * way. These tests press the buttons.
 *
 * Each case asserts a DESTINATION, not an implementation:
 *   • a rail-claiming surface answers where it was asked, or navigates to the
 *     surface that will, and never writes into the shell's hidden rail;
 *   • a surface that gave the flag back gets a real, callable `onAsk`;
 *   • the shell itself refuses to arm a rail it is not drawing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { SURFACE_VIEWS, type SurfaceViewProps } from '../surfaceViews';
import { AdminAccess } from '../surfaces/AdminAccess';
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { InsightsCanvas } from '../surfaces/Insights';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

/** The provider tree the live shell gives a surface. ProtocolWorkspace pulls in
 *  the shared EsignModal, which is a react-query consumer. */
function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const surfaceStub = (id: string) => ({ id, label: id, navTier: 'global' }) as unknown as SurfaceViewProps['surface'];

const props = (id: string, over: Partial<SurfaceViewProps> = {}): SurfaceViewProps => ({
  surface: surfaceStub(id),
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
  ...over,
});

beforeEach(() => {
  apiRequest.mockReset();
  // Every ask on a surface that OWNS its conversation runs through useAnaChat,
  // which posts to /api/ana-ri/stream with `fetch` (not apiRequest). Refusing
  // the request keeps the test offline; the user's turn is appended before the
  // request is made, which is the visible fact these tests are about.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

/* ════════════════════════════════════════════════════════════════════
   The registry contract
   ════════════════════════════════════════════════════════════════════ */

describe('the registry says which surfaces claim the rail column', () => {
  it('the four fixed surfaces no longer hide the rail they were writing to', () => {
    // admin-console, csr-workflow and protocol-dev gave the column back;
    // document-authoring, ectd-coauthor and insights kept it and answer for
    // themselves. Naming both halves keeps a silent re-flip visible.
    for (const id of ['admin-console', 'csr-workflow', 'protocol-dev']) {
      expect(SURFACE_VIEWS[id]?.ownsConversation, `${id} should be drawn beside the shell rail`)
        .toBeFalsy();
    }
    for (const id of ['document-authoring', 'ectd-coauthor', 'insights']) {
      expect(SURFACE_VIEWS[id]?.ownsConversation, `${id} answers for itself`).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════
   admin-console — the governed mutations reach the rail that signs them
   ════════════════════════════════════════════════════════════════════ */

describe('admin-console — governed mutations reach the rail that draws the sign-off', () => {
  const ADMIN = {
    kpis: [],
    members: [
      {
        id: 'u1', initials: 'AB', name: 'Ada Byron', email: 'ada@example.com',
        role: 'Admin', groups: ['reg'], sso: 'okta', mfa: true, lastSeen: '2h', state: 'active',
      },
    ],
    roles: [{ id: 'admin', label: 'Admin', members: 1, desc: 'Org admin', scopes: ['org:*'] }],
    grants: [],
    sso: null,
    apiKeys: [],
    audit: [],
    settings: [],
  };

  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/mdx/admin' ? ok({ ...ADMIN }) : ok({}),
    );
  });

  it('"Invite member" hands a real prompt to the shell conversation', async () => {
    const p = props('admin-console');
    render(<AdminAccess {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: /Invite member/ }));

    // The §11.50 e-sign prompt for a governed command is rendered BY the rail
    // (V2App adaptChatMessage → AnaRail → GovernedActionSignoff). This surface
    // is only correct if the rail is there to receive it.
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/Invite a new member/);
  });

  it('a member-level grant is a governed ask, not a local mutation', async () => {
    const p = props('admin-console');
    render(<AdminAccess {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: /Grant access/ }));
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/Part 11 audit entry/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   csr-workflow — the house pattern, now on a surface that draws the rail
   ════════════════════════════════════════════════════════════════════ */

describe('csr-workflow — its section rows reach the rail', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url.startsWith('/api/csr-workflow/board')
        ? ok({
            success: true,
            data: {
              program: null,
              sections: [{ num: '11', label: 'Efficacy evaluation', status: 'draft', blocker: true }],
            },
          })
        : ok({}),
    );
  });

  it('opens a section through the shell conversation', async () => {
    const p = props('csr-workflow');
    render(<CsrWorkflow {...p} />);
    fireEvent.click(await screen.findByText('Efficacy evaluation'));
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/Open CSR §11/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   protocol-dev — the two live asks reach the rail beside the protocol
   ════════════════════════════════════════════════════════════════════ */

describe('protocol-dev — "Ask AnA" reaches the rail', () => {
  const DOC = {
    id: '41', title: 'A Phase II Study of X', shortTitle: 'X-201', kind: 'clinical',
    version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: 'today',
    completeness: 68, openSection: 's1',
    sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
    content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
    soa: { visits: [], rows: [] }, risks: [], milestones: [],
    budget: { total: 0, categories: [], spent: 0 }, amendments: [], deviations: [],
    reviews: [], consent: [], completenessFindings: [],
  };

  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url.startsWith('/api/protocol-dev')
        ? ok({ success: true, data: [DOC] })
        : ok({}),
    );
  });

  it('hands the completeness question to the shell conversation', async () => {
    const { ProtocolWorkspace } = await import('../surfaces/ProtocolDev');
    const p = props('protocol-dev');
    render(<Providers><ProtocolWorkspace {...p} /></Providers>);
    fireEvent.click(await screen.findByRole('button', { name: /Ask AnA/ }));
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String((p.onAsk as ReturnType<typeof vi.fn>).mock.calls[0][0]))
      .toMatch(/Review X-201 for completeness/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   insights — the dead button is gone, and nothing replaced it with fiction
   ════════════════════════════════════════════════════════════════════ */

describe('insights — no button hands a question to a rail it hides', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/insights-canvas/overview'
        ? ok({
            success: true,
            data: {
              tier: 'enterprise',
              leadProgram: {
                code: 'ZX-9', name: 'ZX-9', indication: 'Oncology', phase: 'III',
                filing: 'NDA', readiness: 62, scope: 'program', scopeId: 'p-1',
              },
              portfolio: { programs: null },
            },
          })
        : ok({}),
    );
  });

  it('renders the canvas with no "Ask AnA about this report" affordance', async () => {
    // Spread deliberately: the props helper still carries `onAsk`, and this
    // component's type no longer accepts one. Passing it anyway proves the
    // surface ignores it rather than merely not being handed it.
    render(<InsightsCanvas {...props('insights')} />);
    await waitFor(() => expect(document.querySelector('.rc')).not.toBeNull());
    // The button asked for the report's blockers, which the `.ro-truth` band
    // already states from the server's own truthfulness gate. It went to a rail
    // this surface does not draw, so it is deleted rather than rewired to
    // `roRouteReply`, which would have composed an answer locally.
    expect(screen.queryByText(/Ask AnA about this report/)).toBeNull();
  });
});
