// @vitest-environment jsdom
/**
 * SubmissionCenter — slice 6: real per-sequence workspaces + the governed chain.
 *
 * Follows the submissionCenterNoFixtures / submissionCenterDeviceFilings
 * idioms (apiRequest mocked at the module boundary; REAL, distinctive payloads
 * so anything rendered proves the response was adopted, not a constant).
 *
 * Pins:
 *   • the SEQUENCE SELECTOR exists and drives the per-sequence workspace
 *     fetches (switching it changes which /sequences/:seqId/... URL is read);
 *   • a lifecycle TRANSITION posts the real endpoint and surfaces the server's
 *     refusal verdict VERBATIM;
 *   • FREEZE runs only through the sign modal: the governed chain is
 *     POST /api/c2c/actions/sign (with the re-auth envelope) → POST .../freeze
 *     with the returned signatureActionId — and no freeze POST ever fires
 *     before the sign step (never bypassed; the EsignModal's own §11.200
 *     re-auth hook is mocked, not skipped);
 *   • a failed sign chain surfaces the server's words and never claims success;
 *   • the DISPATCH workspace renders the server gate's blockers VERBATIM and
 *     offers no governed button while the gate blocks;
 *   • Builder renders the sequence's REAL leaves; Validation renders the
 *     readiness findings verbatim (rule ids); Shadow review lists REAL runs +
 *     persisted findings with their acknowledged state;
 *   • no MOCK-ACTION flag survives in the surface source (scan).
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The EsignModal's §11.200 re-auth primitives (/api/esignature/verify-*) are
// react-query mutations; mock the HOOK so the modal's re-auth step resolves
// deterministically. The modal itself — and the governed chain behind it — is
// NOT mocked and NOT bypassed: the test drives the real form.
const verifyPassword = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
const verifyMfa = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword,
    verifyMfa,
    sign: vi.fn(),
    verifyingPassword: false,
    verifyingMfa: false,
    signing: false,
    signError: null,
  }),
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() });

const SUBS = [
  {
    id: 7,
    title: 'ZX-9 First-in-Human',
    productName: 'Zexanib',
    applicationType: 'ind',
    clientType: 'biotech',
    primaryRegion: 'fda',
    status: 'active',
    lifecycleStage: 'original',
  },
];

const SEQS = [
  {
    id: 21,
    sequenceNumber: '0000',
    type: 'original',
    status: 'validated',
    region: 'fda',
    validationStatus: 'passed',
  },
  {
    id: 22,
    sequenceNumber: '0001',
    type: 'amendment',
    status: 'draft',
    region: 'fda',
    validationStatus: null,
  },
];

const LEAVES_21 = [
  {
    id: 301,
    sectionCode: '2.7.3',
    title: 'Summary of Clinical Efficacy',
    granularity: 'document',
    lifecycleOp: 'new',
    documentTable: 'coauthor_documents',
    documentId: 88,
    documentType: 'summary',
  },
];
const LEAVES_22 = [
  {
    id: 302,
    sectionCode: 'm1/us/1.2',
    title: 'Cover letter amendment',
    granularity: null,
    lifecycleOp: 'replace',
    documentTable: null,
    documentId: null,
    documentType: null,
  },
];

const READINESS_CLEAR = {
  sequenceId: 21,
  region: 'fda',
  sequenceStatus: 'validated',
  validationErrors: 0,
  unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1,
  shadowReviewMissing: false,
  gate: { cleared: true, blockers: [] },
  readiness: { errors: 0, warnings: 1, infos: 0, findings: [
    { severity: 'warning', code: 'LEAF_SOURCE_UNRESOLVED', sectionCode: '2.7.3', message: 'Leaf source not materializable yet.' },
  ] },
  leafCount: 1,
};

const READINESS_BLOCKED = {
  ...READINESS_CLEAR,
  validationErrors: 2,
  unacknowledgedShadowCriticals: 1,
  gate: {
    cleared: false,
    blockers: [
      '2 open validation errors must be resolved before dispatch.',
      '1 unacknowledged critical Shadow Review finding must be acknowledged.',
    ],
  },
};

const SHADOW_RUNS = [
  {
    id: 91,
    sequenceId: 21,
    region: 'fda',
    lens: 'fda_filing',
    status: 'complete',
    rtfRiskScore: 0.42,
    crlRiskScore: 0.1,
    summary: 'One reconciliation gap a filing reviewer would query.',
    createdAt: '2026-08-01T12:00:00.000Z',
  },
];
const SHADOW_FINDINGS = [
  {
    id: 501,
    runId: 91,
    dimension: 'rtf',
    severity: 'critical',
    title: 'Efficacy claim not reconciled with locked dataset',
    detail: 'ORR 38.6% in §2.5 vs 36.9% in the CSR dataset.',
    basis: '21 CFR 314.50',
    recommendation: 'Reconcile §2.5 against CSR-201 before filing.',
    leafRef: 'm2/2.5',
    status: 'open',
  },
];

type Handler = (method: string, url: string, body?: unknown) => Partial<Response> | undefined;

/** Route-table mock: unhandled paths return an empty list envelope. */
function mockApi(extra: Handler = () => undefined) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const hit = extra(method, url, body);
    if (hit) return hit as Response;
    if (method === 'GET' && url === '/api/submissions') {
      return { ok: true, status: 200, json: async () => SUBS } as Response;
    }
    if (method === 'GET' && url === '/api/submissions/7/sequences') {
      return { ok: true, status: 200, json: async () => SEQS } as Response;
    }
    if (method === 'GET' && url === '/api/510k/estar/submissions') {
      return { ok: true, status: 200, json: async () => ({ submissions: [] }) } as Response;
    }
    if (method === 'POST' && url === '/api/510k/estar/assemble') {
      return { ok: true, status: 200, json: async () => ({ artifactKind: 'none', blockers: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
}

const openWorkspace = async (label: string) => {
  fireEvent.click(screen.getByRole('tab', { name: label }));
};

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  verifyMfa.mockClear();
});

describe('sequence selector drives the per-sequence workspaces', () => {
  beforeEach(() =>
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') {
        return { ok: true, status: 200, json: async () => LEAVES_21 };
      }
      if (method === 'GET' && url === '/api/submissions/sequences/22/leaves') {
        return { ok: true, status: 200, json: async () => LEAVES_22 };
      }
      return undefined;
    }),
  );

  it('Builder loads the SELECTED sequence leaves and switching the selector refetches', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));

    await openWorkspace('Builder');
    // Default selection = first real sequence (0000, id 21) → its real leaf.
    expect(await screen.findByText('Summary of Clinical Efficacy')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/sequences/21/leaves');
    expect(document.body.textContent).toContain('2.7.3');
    expect(document.body.textContent).toContain('Authored document #88');
    // The leaf table names its source store, never the relation behind it.
    expect(document.body.textContent).not.toContain('coauthor_documents');

    // Switch the working sequence — the OTHER sequence's URL is fetched and its
    // real leaf renders (unlinked source rendered honestly).
    fireEvent.change(screen.getByLabelText('Working sequence'), { target: { value: '22' } });
    expect(await screen.findByText('Cover letter amendment')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/sequences/22/leaves');
    expect(document.body.textContent).toContain('unlinked');
  });

  it('renders the honest empty state for a sequence with no leaves', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') {
        return { ok: true, status: 200, json: async () => [] };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Builder');
    expect(await screen.findByText('No leaves in sequence 0000 yet')).toBeTruthy();
  });
});

describe('lifecycle transitions post the real endpoint; verdict verbatim', () => {
  it('surfaces the server refusal VERBATIM when the lifecycle refuses', async () => {
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/submissions/sequences/22/transition') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: 'INVALID_STATE', message: 'Cannot transition sequence from draft to assembling.' },
          }),
        };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Sequences');

    // Sequence 0001 (draft) offers the Assembling transition — scope to ITS row
    // (sequence 0000 also offers an Assembling back-transition).
    const row = (await screen.findByText('0001')).closest('.sp-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Assembling/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Transition refused — Cannot transition sequence from draft to assembling.',
      ),
    );
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submissions/sequences/22/transition', {
      status: 'assembling',
    });
  });

  it('announces success only from the server-confirmed row', async () => {
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/submissions/sequences/22/transition') {
        return { ok: true, status: 200, json: async () => ({ ...SEQS[1], status: 'assembling' }) };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Sequences');
    const row = (await screen.findByText('0001')).closest('.sp-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Assembling/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('Sequence 0001 → Assembling — server-confirmed.'),
    );
  });
});

describe('governed freeze — the real e-sign chain, never bypassed', () => {
  const signBody = { actionId: 'act_ab12', auditId: 'a-1', sha256Chain: 'deadbeef', state: 'executed' };

  it('freeze opens the Part 11 modal; sign → freeze runs in order with the actionId', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    mockApi((method, url, body) => {
      if (method === 'POST' && (url === '/api/c2c/actions/sign' || url === '/api/submissions/sequences/21/freeze')) {
        calls.push({ method, url, body });
      }
      if (method === 'POST' && url === '/api/c2c/actions/sign') {
        return { ok: true, status: 200, json: async () => signBody };
      }
      if (method === 'POST' && url === '/api/submissions/sequences/21/freeze') {
        return { ok: true, status: 200, json: async () => ({ ...SEQS[0], status: 'frozen' }) };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Sequences');

    // Sequence 0000 (validated) offers the governed Frozen target.
    fireEvent.click((await screen.findAllByRole('button', { name: /Frozen/ }))[0]);

    // The Part 11 modal is open — no freeze POST has fired yet.
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.body.textContent).toContain('Electronic signature');
    expect(document.body.textContent).toContain('Sequence 0000 · ZX-9 First-in-Human');
    expect(calls).toHaveLength(0);

    // Complete the form: reason (8+ chars) + password, then sign.
    fireEvent.change(screen.getByLabelText('Reason for this action'), {
      target: { value: 'Locking sequence 0000 for FDA filing.' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => expect(document.body.textContent).toContain('Signature applied'));

    // Chain order and payloads: sign first (re-auth envelope forwarded), then
    // freeze presenting the server-issued actionId. Never the reverse.
    expect(calls.map((c) => c.url)).toEqual([
      '/api/c2c/actions/sign',
      '/api/submissions/sequences/21/freeze',
    ]);
    expect(calls[0].body).toMatchObject({
      target: 'ectd-sequence:21',
      reason: 'Locking sequence 0000 for FDA filing.',
      reauth: { password: 'hunter22' },
    });
    expect(calls[1].body).toEqual({ signatureActionId: 'act_ab12' });
    // §11.200 re-auth ran (mocked hook, not skipped).
    expect(verifyPassword).toHaveBeenCalledWith('hunter22');
    // The verdict names the server-confirmed status + signature id.
    await waitFor(() =>
      expect(document.body.textContent).toContain('server-confirmed under signature act_ab12'),
    );
  });

  it('a blocked governed freeze surfaces the server verdict and fabricates nothing', async () => {
    let freezeCalled = 0;
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/c2c/actions/sign') {
        return { ok: true, status: 200, json: async () => signBody };
      }
      if (method === 'POST' && url === '/api/submissions/sequences/21/freeze') {
        freezeCalled += 1;
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: {
              code: 'DISPATCH_BLOCKED',
              message: 'Dispatch gate blocks frozen: 2 open validation errors must be resolved before dispatch.',
            },
          }),
        };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Sequences');
    fireEvent.click((await screen.findAllByRole('button', { name: /Frozen/ }))[0]);
    fireEvent.change(await screen.findByLabelText('Reason for this action'), {
      target: { value: 'Locking sequence 0000 for FDA filing.' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));

    // The server's words, inline in the modal alert — no "Signature applied".
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Dispatch gate blocks frozen: 2 open validation errors must be resolved before dispatch.',
    ));
    expect(freezeCalled).toBe(1);
    expect(document.body.textContent).not.toContain('Signature applied');
    expect(document.body.textContent).not.toContain('server-confirmed under signature');
  });

  it('a refused sign step stops the chain — the freeze endpoint is never called', async () => {
    let freezeCalled = 0;
    mockApi((method, url) => {
      if (method === 'POST' && url === '/api/c2c/actions/sign') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'SEPARATION_OF_DUTIES', detail: 'The signer must not be the author of the target.' }),
        };
      }
      if (method === 'POST' && url === '/api/submissions/sequences/21/freeze') {
        freezeCalled += 1;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Sequences');
    fireEvent.click((await screen.findAllByRole('button', { name: /Frozen/ }))[0]);
    fireEvent.change(await screen.findByLabelText('Reason for this action'), {
      target: { value: 'Locking sequence 0000 for FDA filing.' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('The e-signature was not recorded'),
    );
    // The REASON is what the reviewer needs, and it is in `detail`. This used to
    // assert the code instead, because the envelope reader preferred `error` and
    // put the token on screen — telling a reviewer "SEPARATION_OF_DUTIES" where
    // the answer was "you may not sign your own work". The code is still
    // available to code that must branch on it; it is no longer display copy.
    expect(screen.getByRole('alert').textContent).toContain(
      'The signer must not be the author of the target.',
    );
    expect(screen.getByRole('alert').textContent).not.toContain('SEPARATION_OF_DUTIES');
    expect(freezeCalled).toBe(0);
  });
});

describe('dispatch workspace — the server gate, verbatim', () => {
  it('renders the gate blockers verbatim and offers NO governed button while blocked', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
        return { ok: true, status: 200, json: async () => READINESS_BLOCKED };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Dispatch');

    await waitFor(() => expect(document.body.textContent).toContain('Dispatch blocked — 2 blockers'));
    // Blockers exactly as the server said them.
    expect(document.body.textContent).toContain('2 open validation errors must be resolved before dispatch.');
    expect(document.body.textContent).toContain(
      '1 unacknowledged critical Shadow Review finding must be acknowledged.',
    );
    // No governed action is offered while the gate blocks.
    expect(screen.queryByRole('button', { name: /Part 11 e-signature/ })).toBeNull();
  });

  it('offers the governed freeze only when the gate is clear and the sequence is validated', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
        return { ok: true, status: 200, json: async () => READINESS_CLEAR };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Dispatch');

    await waitFor(() => expect(document.body.textContent).toContain('Dispatch gate clear'));
    const governed = await screen.findByRole('button', { name: /Freeze sequence \(Part 11 e-signature\)/ });
    fireEvent.click(governed);
    // It opens the real sign modal — not a toast, not a fabricated event.
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.body.textContent).toContain('Electronic signature');
  });

  it('fails closed when the readiness read fails — no gate, no governed buttons', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
        return { ok: false, status: 503, json: async () => ({ error: { code: 'OVERLOADED' } }) };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Dispatch');
    expect(await screen.findByText("Couldn't compute the dispatch gate")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Part 11 e-signature/ })).toBeNull();
  });
});

describe('validation workspace — findings verbatim with rule ids', () => {
  it('renders the readiness findings with their rule codes', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
        return { ok: true, status: 200, json: async () => READINESS_CLEAR };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Validation');
    await waitFor(() =>
      expect(document.body.textContent).toContain('LEAF_SOURCE_UNRESOLVED'),
    );
    expect(document.body.textContent).toContain('Leaf source not materializable yet.');
  });

  it('shows the honest clean state when the server reports zero findings', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...READINESS_CLEAR,
            readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
          }),
        };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Validation');
    expect(await screen.findByText('No validation findings for sequence 0000')).toBeTruthy();
  });
});

describe('shadow review — real runs and persisted findings', () => {
  beforeEach(() =>
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/shadow-review') {
        return { ok: true, status: 200, json: async () => SHADOW_RUNS };
      }
      if (method === 'GET' && url === '/api/submissions/shadow-review/91/findings') {
        return { ok: true, status: 200, json: async () => SHADOW_FINDINGS };
      }
      return undefined;
    }),
  );

  it('lists the sequence runs and the selected run findings with acknowledged state', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Shadow review');

    await waitFor(() => expect(document.body.textContent).toContain('#91'));
    expect(document.body.textContent).toContain('One reconciliation gap a filing reviewer would query.');
    // The persisted finding, verbatim, with severity + the acknowledged state.
    expect(await screen.findByText('Efficacy claim not reconciled with locked dataset')).toBeTruthy();
    expect(document.body.textContent).toContain('Basis: 21 CFR 314.50');
    expect(document.body.textContent).toContain('Critical');
    expect(document.body.textContent).toContain('Open');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/shadow-review/91/findings');
  });

  it('a failed run POST surfaces the server error and records nothing locally', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions/sequences/21/shadow-review') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === 'POST' && url === '/api/submissions/sequences/21/shadow-review') {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'The review model is unavailable.' } }),
        };
      }
      return undefined;
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    await openWorkspace('Shadow review');
    fireEvent.click(await screen.findByRole('button', { name: /Run shadow review/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'The shadow review did not complete — The review model is unavailable.',
      ),
    );
    // Still the honest empty run list — no fabricated run row.
    expect(document.body.textContent).toContain('No shadow reviews for sequence 0000 yet');
  });
});

describe('no MOCK-ACTION flag survives in the surface source', () => {
  const files = [
    'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx',
    'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx',
  ];
  it.each(files)('%s carries no MOCK-ACTION marker', (rel) => {
    const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
    expect(src).not.toContain('MOCK-ACTION');
  });
});
