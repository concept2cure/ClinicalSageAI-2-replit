// @vitest-environment jsdom
/**
 * AnA sees the wave-5 screens — publisher wiring proof through the REAL
 * delivery path (useActiveSurfaceContext, the same hook V2App folds into
 * module_context). Each case renders the real surface plus a probe and pins
 * the honest branch that matters most: a ready summary with real counts, and
 * the failure branch published as a failure — never as an empty screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { ReportGovernance } from '../surfaces/ReportGovernance';
import { IdentityConsole } from '../surfaces/IdentityConsole';
import { Orchestration } from '../surfaces/Orchestration';
import { BiopharmaJourney } from '../surfaces/BiopharmaJourney';
import { AccessRequests } from '../surfaces/AccessRequests';
import { TaskBoard } from '../surfaces/TaskBoard';
import { DocJourney } from '../surfaces/DocJourney';
import { Projects } from '../surfaces/Projects';
import { AuditTrail } from '../surfaces/AdminSurfaces';
import { ReviewThreadsPane } from '../surfaces/ReviewThreads';
import { ClinicalOps } from '../surfaces/ClinicalOps';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({ error: 'nope' }) } as Response;
}

/** Reads the published context exactly the way the shell does. */
function Probe({ id, seen }: { id: string; seen: { current: SurfaceContext | null } }) {
  const ctx = useActiveSurfaceContext(id);
  React.useEffect(() => {
    seen.current = ctx;
  });
  return null;
}

afterEach(cleanup);

describe('ReportGovernance — the register publishes itself honestly', () => {
  beforeEach(() => apiRequest.mockReset());

  const props = () =>
    ({ surface: { id: 'report-governance', label: 'Report governance' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('a loaded register publishes real seal counts', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/intelligent-reports/list/0')
        return ok({
          data: [
            { id: 1, reportCode: 'IR-001', title: 'Q2 safety report', domain: 'safety', sealStatus: 'sealed' },
            { id: 2, reportCode: 'IR-002', title: 'CMC summary', domain: 'cmc', sealStatus: null },
          ],
        });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ReportGovernance {...props()} />
        <Probe id="report-governance" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('2 governed report(s) — 1 sealed, 0 revoked, 1 draft');
    });
    expect(seen.current?.facts).toMatchObject({ reportCount: 2, sealed: 1, draft: 1 });
  });

  it('a FAILED register read publishes the failure, never an empty org', async () => {
    apiRequest.mockImplementation(async () => fail(500));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ReportGovernance {...props()} />
        <Probe id="report-governance" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('could not be read');
      expect(seen.current?.summary).toContain('not an organization with no governed reports');
    });
  });
});

describe('IdentityConsole — the forbidden state grounds AnA without a single secret', () => {
  beforeEach(() => apiRequest.mockReset());

  it('a 403 publishes "cannot administer" — and no token, CIDR or org id ever enters facts', async () => {
    apiRequest.mockImplementation(async () => fail(403));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <IdentityConsole
          surface={{ id: 'identity-console', label: 'Identity' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biopharma"
        />
        <Probe id="identity-console" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('cannot administer enterprise identity');
      expect(seen.current?.summary).toContain('super_admin or platform_admin');
    });
    const payload = JSON.stringify(seen.current);
    expect(payload).not.toMatch(/cidr|token"|organizationId/i);
  });
});

describe('Orchestration — a dead checkpoint store is NEVER "zero gates pending"', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the gates failure in the reviewer-protecting words', async () => {
    // Every read fails: the program discovery, the checkpoint store, all of
    // it — the branch under test is what the context claims about the gates.
    apiRequest.mockImplementation(async () => fail(500));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <Orchestration
          surface={{ id: 'orchestration', label: 'Orchestration' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biopharma"
        />
        <Probe id="orchestration" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('NOT a report that zero human-in-the-loop gates are pending');
    });
    expect((seen.current?.facts as Record<string, unknown>)?.pendingGateCount ?? null).toBeNull();
  });
});

describe('BiopharmaJourney — the journey publishes real program identity', () => {
  beforeEach(() => apiRequest.mockReset());

  it('a loaded journey names the program, its stage count and readiness', async () => {
    const ROW = {
      code: 'ZX-9', name: 'Zexanib', app: 'BLA', modality: 'small molecule',
      indication: 'relapsed disease', pathway: 'accelerated', sponsor: 'ZenBio',
      agency: 'FDA', readiness: 42, current: 'IND filed',
      target: { label: 'BLA submission', v: 'Q4 2027', agency: 'FDA' },
      seg: 'biotech', overlay: {}, modules: [], clock: [], haqs: [],
      contra: { t: 'none', tag: 'ok', d: 'No contradictions on file.' }, blockers: [],
    };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/program-journey') return ok({ data: [ROW] });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <BiopharmaJourney
          surface={{ id: 'program-journey', label: 'Journey' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biotech"
        />
        <Probe id="program-journey" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('ZX-9');
      expect(seen.current?.summary).toContain('of 9 stages complete');
      expect(seen.current?.summary).toContain('42% ready');
    });
  });
});

/* ── Security regression guard ────────────────────────────────────────────
 * The admin publishers are the ones that sit next to credentials, member PII,
 * and cross-tenant data. Their facts were audited by hand to carry only
 * counts, booleans and the org's own non-PII fields — but a property held only
 * by review regresses the first time someone adds a field. These tests feed
 * each surface REAL-shaped data whose forbidden fields carry sentinel values,
 * render it to its ready state, and assert those sentinels never reach the
 * published context (which the shell folds verbatim into the model prompt).
 * Each also asserts an ALLOWED value DID reach the context, so a green is a
 * real scan of a populated payload, not an empty one.
 */
describe('security: identity-console never leaks a SCIM token, CIDR or org id', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes counts from a populated directory — and no label, CIDR or org id', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/admin/scim-tenants')
        return ok({
          tenants: [
            { id: 1, organizationId: 424242, label: 'IDP-LABEL-SENTINEL', enabled: true },
            { id: 2, organizationId: 424242, label: 'IDP-LABEL-SENTINEL-2', enabled: false },
          ],
        });
      if (url === '/api/admin/scim-ip-allowlist')
        return ok({ rules: [{ id: 1, organizationId: 424242, cidr: '10.66.66.0/24', label: 'RULE-SENTINEL', enabled: true }] });
      return ok({});
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <IdentityConsole
          surface={{ id: 'identity-console', label: 'Identity' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biopharma"
        />
        <Probe id="identity-console" seen={seen} />
      </>,
    );
    // Ready state reached: the counts are published (2 tokens, 1 enabled).
    await waitFor(() =>
      expect((seen.current?.facts as Record<string, unknown>)?.scimTenantCount).toBe(2),
    );
    expect((seen.current?.facts as Record<string, unknown>)?.scimTenantsEnabled).toBe(1);
    // And not one forbidden value rode along.
    const payload = JSON.stringify(seen.current);
    for (const leak of ['IDP-LABEL-SENTINEL', '10.66.66.0/24', 'RULE-SENTINEL', '424242']) {
      expect(payload, `identity-console leaked ${leak}`).not.toContain(leak);
    }
  });
});

describe('security: access-requests never leaks a requester email, name, note or reason', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the requested module (allowed) but no third-party PII or free text', async () => {
    apiRequest.mockImplementation(async () =>
      ok({
        scope: 'organization',
        requests: [
          {
            id: 1,
            organizationId: 7,
            organizationName: 'Acme',
            moduleId: 'submission-gateway',
            moduleName: 'Submission Gateway',
            requestedBy: 99,
            requesterEmail: 'leak@sentinel.test',
            requesterName: 'PII-NAME-SENTINEL',
            note: 'NOTE-SENTINEL third-party free text',
            status: 'open',
            decidedByEmail: null,
            decidedAt: null,
            decisionReason: 'REASON-SENTINEL',
            createdAt: null,
            updatedAt: null,
          },
        ],
      }),
    );
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <AccessRequests />
        <Probe id="access-requests" seen={seen} />
      </>,
    );
    // Ready state reached: the module id (an allowed fact) is published.
    await waitFor(() => expect(JSON.stringify(seen.current)).toContain('submission-gateway'));
    // But nothing a person typed, and no address, rode along.
    const payload = JSON.stringify(seen.current);
    for (const leak of ['leak@sentinel.test', 'PII-NAME-SENTINEL', 'NOTE-SENTINEL', 'REASON-SENTINEL']) {
      expect(payload, `access-requests leaked ${leak}`).not.toContain(leak);
    }
  });
});

/* ── Audit-driven regression guards (2026-08-31 adversarial audit) ─────────
 * The subsystem audit confirmed four defects the hand review missed — two of
 * them server-side COALESCE(name, email) projections the client cannot tell
 * from a plain name. These guards pin the fixes: a failed read is a failure
 * not an empty board, and no email-capable person field or user free-text
 * reaches the published context. Each asserts an ALLOWED value did reach it,
 * so a green is a scan of a populated payload.
 */
const svProps = (id: string) =>
  ({ surface: { id, label: id } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

describe('audit: task board — a failed read is a failure, never a clean empty board', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes "could not be read", not "0 tasks", when the board read fails', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/task-management/board') return fail(500);
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <TaskBoard {...svProps('tasks')} />
        <Probe id="tasks" seen={seen} />
      </>,
    );
    await waitFor(() => expect(seen.current?.summary).toContain('could not be read'));
    expect(seen.current?.summary).not.toContain('0 tasks');
    expect(seen.current?.summary).not.toContain('0 open');
    expect((seen.current?.facts as Record<string, unknown>)?.readFailure).toBeTruthy();
  });
});

describe('audit: doc-journey never publishes the actor name/email', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the active stage label but not its who (a name-or-email field)', async () => {
    const STAGE = {
      id: 'drafted', label: 'Drafted', ic: 'edit', when: '2h ago',
      who: 'author@sentinel.test', ver: 'v3', done: true, active: true, sub: '', kind: 'authorship',
    };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/doc-journey') return ok({ data: [STAGE] });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <DocJourney {...svProps('doc-journey')} />
        <Probe id="doc-journey" seen={seen} />
      </>,
    );
    // Ready state reached: the active stage is published by label.
    await waitFor(() => expect(JSON.stringify(seen.current)).toContain('Drafted'));
    expect(JSON.stringify(seen.current), 'doc-journey leaked the actor who').not.toContain('author@sentinel.test');
  });
});

describe('audit: projects never publishes the lead email', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the program code but not its lead (a COALESCE(name,email) field)', async () => {
    const PROG = {
      id: 'p1', title: 'ZX-9 IND', ws: 'Pharma', code: 'ZX-9', stage: 'author',
      readiness: 40, status: 'active', lead: 'lead@sentinel.test', blocker: null, due: 'Q4',
    };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/c2c/projects') return ok({ data: [PROG] });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <Projects {...svProps('projects')} />
        <Probe id="projects" seen={seen} />
      </>,
    );
    await waitFor(() => expect(JSON.stringify(seen.current)).toContain('ZX-9'));
    expect(JSON.stringify(seen.current), 'projects leaked the lead email').not.toContain('lead@sentinel.test');
  });
});

describe('audit: audit-trail never publishes an actor name or a reason free-text', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the event meaning and hasReason boolean, not the actor or the reason text', async () => {
    const ENTRY = {
      id: 'AE-1', when: '1h ago', actor: 'ACTOR-NAME-SENTINEL', event: 'Document approved',
      target: 'CSR §2.5', kind: 'approval', sig: true, hash: 'h1', prevHash: 'h0',
      ip: '10.0.0.9', reason: 'REASON-FREETEXT-SENTINEL', meaning: 'APPROVAL',
    };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/audit-trail/ledger') return ok({ data: [ENTRY] });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <AuditTrail {...svProps('audit-trail')} />
        <Probe id="audit-trail" seen={seen} />
      </>,
    );
    // Ready state reached: the entry is published by id, with its meaning enum.
    await waitFor(() => expect(JSON.stringify(seen.current)).toContain('AE-1'));
    const payload = JSON.stringify(seen.current);
    expect(payload, 'audit-trail leaked the actor name').not.toContain('ACTOR-NAME-SENTINEL');
    expect(payload, 'audit-trail leaked the reason free-text').not.toContain('REASON-FREETEXT-SENTINEL');
    expect(payload, 'audit-trail leaked the ip').not.toContain('10.0.0.9');
  });
});

/* ── Coverage-completion audit guards (2026-08-31, publisher-only sweep) ────
 * The second audit pass read the 53 publisher-only surfaces the first workflow
 * did not reach. These pin its two highest-severity fixes: ReviewThreads'
 * primary-queue fail-open, and ClinicalOps' subject-scoped deviation narrative
 * leak. (The pharmacovigilance manufactured-all-clear fix is pinned server-side
 * in pharmacovigilance-board-failclosed.test.ts.)
 */
describe('audit2: review queue — a dead my-queue read is a failure, not "0 threads"', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes "could not be read", not "0 open threads", when the queue read fails', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (String(url).includes('/api/concept2cure/reviews/my-queue')) return fail(500);
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ReviewThreadsPane onNotice={vi.fn()} board={null} />
        <Probe id="review" seen={seen} />
      </>,
    );
    await waitFor(() => expect(seen.current?.summary).toContain('could not be read'));
    expect(seen.current?.summary).not.toContain('0 open thread');
    expect((seen.current?.facts as Record<string, unknown>)?.queueState).toBe('error');
  });
});

describe('audit2: clinical-ops never publishes a subject-scoped deviation narrative', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the deviation category/study but not its free-text description or CAPA', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      const u = String(url);
      if (u === '/api/clinical-operations/studies') {
        return ok({ data: [{ studyId: 'ST-1', id: 'PROTO-1', phase: 'Phase 2', status: 'active' }] });
      }
      if (u.includes('/api/clinical-operations/studies/ST-1/deviations')) {
        return ok({
          data: [
            {
              id: 'DV-1', category: 'protocol', status: 'open', detected_date: '2026-07-01',
              description: 'SUBJECT-NARRATIVE-SENTINEL patient 004 missed a visit',
              corrective_action: 'CAPA-FREETEXT-SENTINEL retrain the site',
            },
          ],
        });
      }
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ClinicalOps {...svProps('clinical-ops')} />
        <Probe id="clinical-ops" seen={seen} />
      </>,
    );
    // Ready state reached: the deviation is published by its structured category.
    await waitFor(() => {
      const f = seen.current?.facts as Record<string, unknown> | undefined;
      const devs = (f?.deviations as Array<Record<string, unknown>> | null) ?? null;
      expect(Array.isArray(devs) && devs.length > 0).toBe(true);
    });
    const payload = JSON.stringify(seen.current);
    expect(payload, 'clinical-ops leaked the deviation narrative').not.toContain('SUBJECT-NARRATIVE-SENTINEL');
    expect(payload, 'clinical-ops leaked the CAPA free-text').not.toContain('CAPA-FREETEXT-SENTINEL');
  });
});
