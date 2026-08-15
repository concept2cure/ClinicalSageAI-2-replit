// @vitest-environment jsdom
/**
 * The CMC suite, at render level: the data-entry half and the Module 3 build
 * cockpit that consumes it.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * The CMC registers were bound to their GET endpoints only. Every one of those
 * endpoints has had a matching create endpoint since the CMC schema landed, and
 * each create upserts a canonical Module 3 source object that
 * POST /api/cmc/module3-os/compile/:projectId later composes §3.2.S / §3.2.P
 * from. So an analytical scientist could read the method library and not add a
 * method; a QC analyst could see the testing file and not log a result; and the
 * whole Module 3 operating system — build state, compile, contradictions,
 * readiness, the fail-closed export gate, the provenance chain — had exactly one
 * caller in this UI, the section-approve endpoint.
 *
 * ── What must be true now ─────────────────────────────────────────────────────
 * These tests mount the real surfaces, drive the real controls and assert what
 * actually happens on the wire, including every way it can fail:
 *
 *   • a create POSTs to the register's own endpoint with the mapped body;
 *   • the SERVER's row is what lands in the table, not the values that were typed;
 *   • a rejected write adds NOTHING to the table and names the rejected field;
 *   • a QC result cannot be reviewed by the analyst who recorded it;
 *   • the build cockpit reads build state / readiness / contradictions and its
 *     actions hit the operating-system endpoints;
 *   • the export gate's 409 is shown as the refusal it is, with its reason.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'analyst@example.test', displayName: 'A. Analyst' } }),
}));

import { CmMethodLibrary, CmQcTesting } from '../surfaces/cmcRegisters';
import { CmModule3Build } from '../surfaces/CmcModule3Build';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

/** Every call the surface made, as [method, url, body] triples. */
const calls = () => apiRequest.mock.calls as Array<[string, string, unknown?]>;
const callsTo = (method: string, url: string) =>
  calls().filter((c) => c[0] === method && c[1] === url);

/**
 * Type into a labelled field in the open C2CForm drawer.
 *
 * Looking the field up BY ITS LABEL is the point: it only resolves because the
 * drawer's labels are now associated with their controls. A required field's
 * label carries a trailing "*", so the match is a prefix rather than exact —
 * expressed as a matcher function rather than a `new RegExp('^' + …)`, which
 * builds a pattern out of a variable and needs the label escaped to be correct.
 */
function type(label: string, value: string) {
  const field = screen.getByLabelText((content) => content.startsWith(label));
  fireEvent.change(field, { target: { value } });
}

/** Set a `select` field by label. */
function choose(label: string, value: string) {
  type(label, value);
}

/** Press the drawer's submit button, scoped to the dialog so it is never
 *  confused with the register header control that opened it. */
function submit(label: RegExp) {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }));
}

/** Choose a segmented-control option by its visible label (role=radio). */
function seg(label: string) {
  fireEvent.click(screen.getByRole('radio', { name: label }));
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

/* ══════════════════ Analytical method library ══════════════════ */

describe('CmMethodLibrary — the write half of the register', () => {
  const persisted = {
    id: 31,
    methodCode: 'AM-014',
    title: 'Charge variants by icIEF',
    technique: 'icIEF',
    analyte: 'Acidic variants',
    matrix: 'Drug substance',
    purpose: 'Charge variants',
    status: 'validated',
    validationDate: '2026-05-04T00:00:00.000Z',
    ichQ2Parameters: { characteristics: ['Specificity'] },
  };

  it('opens a drawer and POSTs the mapped body to the register endpoint', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/analytical-methods') return res({ success: true, data: [] });
      if (m === 'POST' && u === '/api/cmc/analytical-methods') return res({ success: true, data: persisted });
      return res({});
    });
    render(<CmMethodLibrary />);
    await screen.findByText('No analytical methods yet');

    fireEvent.click(screen.getByRole('button', { name: /Add method/i }));
    type('Method code', 'AM-014');
    type('Method title', 'Charge variants by icIEF');
    type('Analyte', 'Acidic variants');
    choose('Technique', 'icIEF');
    choose('Purpose', 'Charge variants');
    submit(/Add method$/);

    await waitFor(() => expect(callsTo('POST', '/api/cmc/analytical-methods')).toHaveLength(1));
    const body = callsTo('POST', '/api/cmc/analytical-methods')[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({
      methodCode: 'AM-014',
      title: 'Charge variants by icIEF',
      analyte: 'Acidic variants',
      technique: 'icIEF',
      purpose: 'Charge variants',
      matrix: 'Drug substance',
      // The project in context travels so the write-through can key the
      // canonical Module 3 source object to it.
      projectId: PROJECT,
    });
  });

  it('shows the SERVER’s row, not the values that were typed', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/analytical-methods') return res({ success: true, data: [] });
      // The server normalises the code; the table must show what was persisted.
      if (m === 'POST') return res({ success: true, data: { ...persisted, methodCode: 'AM-0014' } });
      return res({});
    });
    render(<CmMethodLibrary />);
    await screen.findByText('No analytical methods yet');
    fireEvent.click(screen.getByRole('button', { name: /Add method/i }));
    type('Method code', 'am-14');
    type('Method title', 'x');
    type('Analyte', 'y');
    choose('Technique', 'HPLC');
    choose('Purpose', 'Assay / content');
    submit(/Add method$/);

    expect(await screen.findByText('AM-0014')).toBeTruthy();
    expect(screen.queryByText('am-14')).toBeNull();
  });

  it('a rejected write adds nothing and names the rejected field', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/analytical-methods') return res({ success: true, data: [] });
      if (m === 'POST') {
        return res(
          { success: false, error: 'Invalid payload', details: [{ path: ['matrix'], message: 'Required' }] },
          400,
        );
      }
      return res({});
    });
    render(<CmMethodLibrary />);
    await screen.findByText('No analytical methods yet');
    fireEvent.click(screen.getByRole('button', { name: /Add method/i }));
    type('Method code', 'AM-1');
    type('Method title', 'x');
    type('Analyte', 'y');
    choose('Technique', 'HPLC');
    choose('Purpose', 'Assay / content');
    submit(/Add method$/);

    // The rejected field is named, and the honest empty state is still on screen.
    expect(await screen.findByText(/matrix: Required/)).toBeTruthy();
    expect(await screen.findByText(/Nothing was persisted/)).toBeTruthy();
    expect(screen.getByText('No analytical methods yet')).toBeTruthy();
  });

  it('an edit PUTs against the row and keeps the validation record it was seeded with', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/analytical-methods') return res({ success: true, data: [persisted] });
      if (m === 'PUT') return res({ success: true, data: { ...persisted, status: 'retired' } });
      return res({});
    });
    render(<CmMethodLibrary />);
    await screen.findByText('AM-014');
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    choose('Status', 'retired');
    submit(/Save method/);

    await waitFor(() => expect(callsTo('PUT', '/api/cmc/analytical-methods/31')).toHaveLength(1));
    const body = callsTo('PUT', '/api/cmc/analytical-methods/31')[0][2] as {
      ichQ2Parameters: { characteristics: string[] };
      status: string;
    };
    expect(body.status).toBe('retired');
    // The ICH Q2 record on file is carried back, not blanked by the edit.
    expect(body.ichQ2Parameters.characteristics).toEqual(['Specificity']);
  });
});

/* ══════════════════ QC testing — the two-person rule ══════════════════ */

describe('CmQcTesting — recording and second-person review', () => {
  const byMe = {
    id: 90, sampleId: 'S-1', sampleType: 'finished-product', testMethod: 'AM-014',
    passFailStatus: 'pending', testDate: '2026-05-04T00:00:00.000Z', releaseDate: null,
    analyst: 7, reviewedBy: null,
  };
  const bySomeoneElse = { ...byMe, id: 91, sampleId: 'S-2', analyst: 12 };

  it('records the signed-in user as the analyst on a new result', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/qc-testing') return res({ success: true, data: [] });
      if (m === 'POST') return res({ success: true, data: byMe });
      return res({});
    });
    render(<CmQcTesting />);
    await screen.findByText('No QC testing records yet');
    fireEvent.click(screen.getByRole('button', { name: /Log result/i }));
    type('Sample ID', 'S-1');
    type('Test method', 'AM-014');
    type('Test date', '2026-05-04');
    submit(/Record result/);

    await waitFor(() => expect(callsTo('POST', '/api/cmc/qc-testing')).toHaveLength(1));
    const body = callsTo('POST', '/api/cmc/qc-testing')[0][2] as Record<string, unknown>;
    expect(body.analyst).toBe(7);
    // The date crosses the JSON boundary as an ISO instant, which is what the
    // route now coerces onto the z.date() drizzle-zod generates.
    expect(body.testDate).toBe(new Date('2026-05-04').toISOString());
  });

  it('refuses to let the analyst review their own result, and says why', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/qc-testing') return res({ success: true, data: [byMe, bySomeoneElse] });
      return res({});
    });
    render(<CmQcTesting />);
    await screen.findByText('S-1');

    const mine = screen.getByText('S-1').closest('tr')!;
    const mineReview = within(mine).getByRole('button', { name: /Review/i }) as HTMLButtonElement;
    expect(mineReview.disabled).toBe(true);
    expect(mineReview.getAttribute('title')).toMatch(/second person/i);

    const theirs = screen.getByText('S-2').closest('tr')!;
    expect((within(theirs).getByRole('button', { name: /Review/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a review PUTs the disposition and the reviewer, never the analyst', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === '/api/cmc/qc-testing') return res({ success: true, data: [bySomeoneElse] });
      if (m === 'PUT') return res({ success: true, data: { ...bySomeoneElse, passFailStatus: 'pass', reviewedBy: 7 } });
      return res({});
    });
    render(<CmQcTesting />);
    await screen.findByText('S-2');
    fireEvent.click(screen.getByRole('button', { name: /Review/i }));
    seg('pass');
    submit(/Record review/);

    await waitFor(() => expect(callsTo('PUT', '/api/cmc/qc-testing/91')).toHaveLength(1));
    const body = callsTo('PUT', '/api/cmc/qc-testing/91')[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({ passFailStatus: 'pass', reviewedBy: 7 });
    expect('analyst' in body).toBe(false);
    expect(await screen.findByText('verified')).toBeTruthy();
  });
});

/* ══════════════════ Module 3 build cockpit ══════════════════ */

describe('CmModule3Build — the operating system, finally reachable', () => {
  const buildState = {
    sections: [
      {
        sectionKey: '3.2.S.4', sectionLabel: 'Control of Drug Substance',
        buildState: 'extraction_complete', sourceObjectCount: 4, uploadedSourceCount: 0,
        sourceTypes: ['specification', 'method'], completeness: 60, missingInputs: ['impurity_profile'],
        hasContradictions: false, contradictionCount: 0, isStale: false, staleReason: null,
        approvalState: 'not_started', hasNarrative: false, artifactId: null, artifactStatus: null,
        lastCompiled: null, lastUpdated: null,
      },
      {
        sectionKey: '3.2.S.7', sectionLabel: 'Stability (Drug Substance)',
        buildState: 'no_sources', sourceObjectCount: 0, uploadedSourceCount: 0,
        sourceTypes: ['stability'], completeness: 0, missingInputs: ['stability'],
        hasContradictions: false, contradictionCount: 0, isStale: false, staleReason: null,
        approvalState: 'not_started', hasNarrative: false, artifactId: null, artifactStatus: null,
        lastCompiled: null, lastUpdated: null,
      },
    ],
    summary: { totalSections: 2, readySections: 0, staleSections: 0, blockedSections: 0, buildableSections: 1, readinessPercent: 0 },
  };

  const wire = (over: (m: string, u: string) => Response | null = () => null) => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      const o = over(m, u);
      if (o) return o;
      if (m === 'GET' && u.startsWith('/api/cmc/module3-os/build-state/')) return res({ success: true, data: buildState });
      if (m === 'GET' && u.startsWith('/api/cmc/module3-os/readiness/')) {
        return res({ success: true, data: { totalSections: 2, approvedSections: 0, staleSections: 0, openCriticalContradictions: 1, exportReady: false } });
      }
      if (m === 'GET' && u.startsWith('/api/cmc/module3-os/contradictions/')) {
        return res({
          success: true,
          data: [{
            id: 'c-1', severity: 'critical', contradictionType: 'spec_without_method',
            details: 'Aggregates has no validated method', impactedSections: ['3.2.S.4'],
            requiredReviewers: [], status: 'open', updatedAt: '2026-05-04T00:00:00.000Z',
          }],
        });
      }
      return res({ success: true });
    });
  };

  it('renders the per-section build state the endpoint returns', async () => {
    wire();
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('Control of Drug Substance')).toBeTruthy();
    expect(screen.getByText('Stability (Drug Substance)')).toBeTruthy();
    expect(screen.getByText('ready to compile')).toBeTruthy();
    expect(screen.getByText('no sources')).toBeTruthy();
    // The missing input is named, not summarised away.
    expect(screen.getAllByText(/impurity_profile/).length).toBeGreaterThan(0);
  });

  it('refuses to build a section that no source data feeds, and says why', async () => {
    wire();
    render(<CmModule3Build ask={() => {}} />);
    await screen.findByText('Stability (Drug Substance)');
    const noSources = screen.getByText('3.2.S.7').closest('tr')!;
    const btn = within(noSources).getByRole('button', { name: /Build/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/No canonical source data/i);
  });

  it('compiles the whole module against the operating-system endpoint', async () => {
    wire((m, u) =>
      m === 'POST' && u.startsWith('/api/cmc/module3-os/compile/')
        ? res({ success: true, compiledCount: 17, sections: [], bridgedArtifacts: [{ sectionKey: '3.2.S.4' }] })
        : null,
    );
    render(<CmModule3Build ask={() => {}} />);
    await screen.findByText('Control of Drug Substance');
    fireEvent.click(screen.getByRole('button', { name: /Compile Module 3/i }));

    await waitFor(() =>
      expect(callsTo('POST', '/api/cmc/module3-os/compile/' + PROJECT)).toHaveLength(1),
    );
    expect(await screen.findByText(/Compiled 17 §3.2 sections/)).toBeTruthy();
  });

  it('a compile that is refused reports the server’s reason and changes nothing', async () => {
    wire((m, u) =>
      m === 'POST' && u.startsWith('/api/cmc/module3-os/compile/')
        ? res({ success: false, error: 'No canonical source objects for this project — nothing to compile.' }, 409)
        : null,
    );
    render(<CmModule3Build ask={() => {}} />);
    await screen.findByText('Control of Drug Substance');
    fireEvent.click(screen.getByRole('button', { name: /Compile Module 3/i }));
    expect(await screen.findByText(/nothing to compile/)).toBeTruthy();
  });

  it('resolves a contradiction through the governed endpoint with its note', async () => {
    wire((m, u) =>
      m === 'PATCH' && u === '/api/cmc/module3-os/contradictions/c-1/resolve'
        ? res({ success: true, data: { id: 'c-1', status: 'resolved' } })
        : null,
    );
    render(<CmModule3Build ask={() => {}} />);
    const finding = (await screen.findByText('Aggregates has no validated method')).closest('tr')!;
    fireEvent.click(within(finding).getByRole('button', { name: /Resolve/i }));
    type('Resolution', 'Method AM-021 validated and linked to the specification.');
    submit(/Record resolution/);

    await waitFor(() =>
      expect(callsTo('PATCH', '/api/cmc/module3-os/contradictions/c-1/resolve')).toHaveLength(1),
    );
    expect(callsTo('PATCH', '/api/cmc/module3-os/contradictions/c-1/resolve')[0][2]).toEqual({
      resolutionNote: 'Method AM-021 validated and linked to the specification.',
    });
  });

  it('shows the export gate’s refusal as the verdict it is, with the reason', async () => {
    wire((m, u) =>
      m === 'POST' && u.startsWith('/api/cmc/module3-os/guard/final-export/')
        ? res({ success: false, error: '2 section(s) went stale after approval and must be re-approved before final export' }, 409)
        : null,
    );
    render(<CmModule3Build ask={() => {}} />);
    await screen.findByText('Control of Drug Substance');
    fireEvent.click(screen.getByRole('button', { name: /Check export gate/i }));

    expect(await screen.findByText('Final export refused')).toBeTruthy();
    expect(screen.getByText(/went stale after approval/)).toBeTruthy();
  });

  it('shows the pass verdict when the gate allows the export', async () => {
    wire((m, u) =>
      m === 'POST' && u.startsWith('/api/cmc/module3-os/guard/final-export/')
        ? res({ success: true, message: 'Final export gate passed' })
        : null,
    );
    render(<CmModule3Build ask={() => {}} />);
    await screen.findByText('Control of Drug Substance');
    fireEvent.click(screen.getByRole('button', { name: /Check export gate/i }));
    // The verdict banner carries the title; the server's message sits under it,
    // so both nodes match the same words and the title is asserted by its class.
    const verdict = await screen.findByText('Final export gate passed', { selector: '.pj-con-t' });
    expect(verdict.closest('.pj-con')?.classList.contains('is-ok')).toBe(true);
  });

  it('asks for a project rather than guessing one', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    wire();
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('Open a program to build its Module 3')).toBeTruthy();
    // Nothing is fetched without a project — a per-project board must not be
    // requested org-wide.
    expect(calls().filter((c) => String(c[1]).includes('module3-os'))).toHaveLength(0);
  });

  it('reports a failed board read as a failure, never as "nothing here yet"', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (u.startsWith('/api/cmc/module3-os/build-state/')) {
        const err = Object.assign(new Error('service unavailable'), { status: 503 });
        throw err;
      }
      return res({ success: true, data: null });
    });
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('Couldn’t load the Module 3 build state')).toBeTruthy();
  });
});
