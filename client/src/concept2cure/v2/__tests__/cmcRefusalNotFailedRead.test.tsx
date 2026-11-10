// @vitest-environment jsdom
/**
 * The CMC work area words a refused read by what it is, not as a failed read.
 *
 * ## The rule, and why this screen
 *
 * The founder, 2026-11-05: *"A feature can be not licensed, not relevant to
 * this project, blocked by missing evidence, or unavailable to this user. Those
 * are different conditions and should not be collapsed into a generic
 * failure."* D0 put that rule in the one failure panel every v2 screen shares
 * — `ErrorState` / `EmptyState tone="error"` take the failed read's
 * `{ status, code }` as `read`, show the classifier's words, and offer no retry
 * for a refusal a retry cannot change
 * (`docs/evidence/D0/2026-11-06-refused-read-one-rule/`).
 *
 * It was handed on, one attribute per call site, and `CmcModule.tsx` carries
 * the most of any screen in the product: 13 strings in
 * `03-adoption-list.txt`. Until this change every one of them said
 * *"Couldn't load …"* with **Try again** — so a plan without the CMC module, a
 * part outside this release, a role, a project in another organization and an
 * expired session all read as an outage, and each offered a retry that changes
 * nothing.
 *
 * ## What these cases hold
 *
 * For each panel that renders a read's own failure: the six refusals are said
 * as themselves and offer no retry, and a 500 is still a failed read in the
 * caller's words. The register is never drawn as empty behind a refusal.
 *
 * ## Found, not fixed here: these panels have no retry CONTROL
 *
 * Only the register-link panel passes `retry`. The rest tell the reader to
 * "sign in to your tenant and retry" in prose and offer no control, so the
 * retryable 503 has nothing to withhold and nothing to keep — which is why the
 * retry assertion below runs only where a control exists. A real retry needs a
 * refetch on `DataState`, which `dataConnect.tsx` does not expose; that file is
 * D0's shared primitive and the coordinating session reviews changes to it, so
 * it is reported rather than taken here.
 *
 * ## Two panels this does NOT change, deliberately
 *
 * `meta.sectionsUnreadable` and `meta.portfolioUnreadable` come back on a
 * **200** board: the board read succeeded and the server reported that one of
 * its own sub-reads failed. There is no refused HTTP read to classify, so those
 * two panels keep their own words — passing the board's status there would
 * classify a success. The same holds for the audit chain, whose message is
 * composed from N per-section failures rather than one read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError, extractApiError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A. Analyst' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROJECT = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';

type Answer = { status: number; body: unknown };
const ok = (data: unknown): Answer => ({ status: 200, body: { success: true, data } });
/** Path (exact, or a regex) → what the server answers. */
const answers: Array<[string | RegExp, Answer]> = [];
const answerFor = (path: string): Answer => {
  for (const [match, answer] of answers) {
    if (typeof match === 'string' ? match === path : match.test(path)) return answer;
  }
  return ok([]);
};

/* The register-link read is guarded (`isLinkRead`), and its panel renders
   whenever that read fails — so every case must answer it with its real shape
   or the panel appears beside the one under test and its own failure words are
   on the page. */
const LINK_READ: [RegExp, Answer] = [/^\/api\/cmc\/module3-os\/register-links\//, { status: 200, body: { links: [] } }];
/* Likewise the capability read (`isCapabilityRead`): it renders on the Batch
   records tab beside the register, so a shapeless default would put its own
   failed-read words on the page next to the panel under test. */
const CAPABILITY_READ: [RegExp, Answer] = [/\/process-capability$/, {
  status: 200,
  body: { success: true, data: { projectId: PROJECT, resultsOnFile: 0, assessed: false, statement: null, sides: { drug_substance: { series: [], statements: [] }, drug_product: { series: [], statements: [] } } } },
}];

beforeEach(() => {
  answers.length = 0;
  answers.push(LINK_READ, CAPABILITY_READ);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const { status, body } = answerFor(String(rawPath));
    if (status >= 400) {
      const { message, code } = extractApiError(body, status);
      throw new ApiRequestError(message, status, body, code);
    }
    return { ok: true, status, json: async () => body } as Response;
  });
  publishShellProject({ id: PROJECT, title: 'Compound A' });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = () =>
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );

/** Land on a tab of the Study records group, as a user would: one click, since all nine are one row (P-122). */
const openRecordsTab = (label: string) => {
  fireEvent.click(screen.getByRole('tab', { name: label }));
};

const text = () => document.body.textContent ?? '';
const FAILED_READ = /couldn.t load|could not be read|didn.t respond|did not respond/i;
const retryOffered = () => Boolean(screen.queryByRole('button', { name: /try again|retry/i }));

/**
 * The six refusals and the one that a retry can change, with the sentence the
 * classifier produces for a read named `<what>`. `%s` stands in for that name.
 */
const REFUSALS: ReadonlyArray<[label: string, answer: Answer, words: string, retry: boolean]> = [
  ['a plan without the feature (403 MODULE_NOT_LICENSED)',
    { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED' } },
    'This feature is not enabled for your organization, so %s was not read.', false],
  ['a part not in this release (403 LAUNCH_SCOPE)',
    { status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } } },
    'This part of the product is not in this release, so %s was not read.', false],
  ['a role refusal (403)',
    { status: 403, body: { error: 'Insufficient permissions' } },
    'Your role cannot do this, so %s was not read.', false],
  ['a record not in this organization (404)',
    { status: 404, body: { error: 'Project not found' } },
    'This project was not found in your organization, so %s was not read.', false],
  ['an expired session (401)',
    { status: 401, body: { error: 'Unauthorized' } },
    'Sign in again to read %s.', false],
  ['an ownership check that could not run (503)',
    { status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' } },
    'The check that this project belongs to your organization was unavailable, so %s was not read.', true],
];

/**
 * One panel: where its read comes from, how to reach it, what it is called in
 * the refusal, and what it must NOT say instead.
 */
const PANELS: ReadonlyArray<{
  name: string;
  path: string | RegExp;
  open: () => void;
  what: string;
  notInstead: RegExp;
}> = [
  {
    name: 'the Module 3 board',
    path: /^\/api\/cmc\/module3-board/,
    open: () => {},
    what: 'the Module 3 board',
    notInstead: /No submissions yet|No Module 3 sections yet/,
  },
  {
    name: 'the specifications register',
    path: /^\/api\/cmc\/specifications/,
    open: () => openRecordsTab('Specifications'),
    what: 'this project’s specifications',
    notInstead: /No specifications yet/,
  },
  {
    name: 'the stability register',
    path: /^\/api\/cmc\/stability-studies/,
    open: () => openRecordsTab('Stability'),
    what: 'the stability register',
    notInstead: /No stability studies yet/,
  },
  {
    name: 'the batch register',
    path: /^\/api\/cmc\/batch-records/,
    open: () => openRecordsTab('Batch records'),
    what: 'this project’s batch records',
    notInstead: /No batch records yet/,
  },
  {
    /* Never drawn as "not capable" and never as an empty report — and now
       never as an outage when the read was refused. */
    name: 'the process-capability assessment',
    path: /\/process-capability$/,
    open: () => openRecordsTab('Batch records'),
    what: 'the capability assessment',
    notInstead: /Process capability is not assessed for this project/,
  },
  {
    name: 'the contradiction history',
    path: /^\/api\/cmc\/module3-os\/contradictions\//,
    open: () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Approvals & audit' }));
    },
    what: 'the contradiction history',
    notInstead: /No contradictions recorded/,
  },
];

for (const panel of PANELS) {
  describe(`${panel.name} says why it was not read`, () => {
    for (const [label, answer, words, retry] of REFUSALS) {
      it(`${label} is said as itself`, async () => {
        answers.unshift([panel.path, answer]);
        mount();
        panel.open();
        const sentence = words.replace('%s', panel.what);
        await waitFor(() => expect(text()).toContain(sentence));
        expect(text(), 'a refusal was also drawn as a failed read').not.toMatch(FAILED_READ);
        expect(text(), 'the register was drawn as empty behind a refusal').not.toMatch(panel.notInstead);
        if (!retry) {
          expect(retryOffered(), 'a retry was offered for a refusal it cannot change').toBe(false);
        }
      });
    }

    it('a failure to answer (500) is still a failed read, in the caller’s words', async () => {
      answers.unshift([panel.path, { status: 500, body: { error: 'Internal error' } }]);
      mount();
      panel.open();
      await waitFor(() => expect(text()).toMatch(FAILED_READ));
      expect(text(), 'a failure was worded as a refusal').not.toContain('not enabled for your organization');
    });
  });
}

describe('the register-link panel, a CMC surface of its own', () => {
  const LINKS = /^\/api\/cmc\/module3-os\/register-links\//;

  it('a plan without the feature is said as itself', async () => {
    answers.unshift([LINKS, { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED' } }]);
    mount();
    await waitFor(() =>
      expect(text()).toContain('This feature is not enabled for your organization, so the Module 3 link record was not read.'),
    );
    expect(text()).not.toContain('Couldn’t verify the saved records’ Module 3 links');
    expect(retryOffered()).toBe(false);
  });

  it('a failure to answer keeps the words that matter — saves recorded, linkage unknown', async () => {
    answers.unshift([LINKS, { status: 500, body: { error: 'Internal error' } }]);
    mount();
    await waitFor(() => expect(text()).toContain('Couldn’t verify the saved records’ Module 3 links'));
    expect(text()).toContain('Register saves remain recorded; dossier linkage is unknown');
    expect(retryOffered()).toBe(true);
  });
});

describe('the export-readiness chip, which is not a panel', () => {
  /* `readRefusalWords` is exported for exactly this: a chip cannot render
     ErrorState, and "Export readiness could not be read" over a 403 says the
     gate failed when the truth is that the feature is not licensed. */
  const SECTIONS = [
    { key: '3.2.S.1', path: 'General Information', st: 'approved', completeness: 100, missingInputs: [] },
  ];
  const boardWithSections = () =>
    ok({
      portfolio: [],
      sections: SECTIONS,
      kpis: { submissions: 0, rpiAverage: null, sectionsApproved: 1, sectionsTotal: 1, readyPercent: 100 },
      meta: { projectId: PROJECT, sectionsProvisioned: true, portfolioProvisioned: true, sectionsUnreadable: false, portfolioUnreadable: false },
    });

  it('a plan without the feature is said as itself, not as a failed verdict', async () => {
    answers.push([/^\/api\/cmc\/module3-os\/readiness\//, { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED' } }]);
    answers.push([/^\/api\/cmc\/module3-board/, boardWithSections()]);
    mount();
    await waitFor(() =>
      expect(text()).toContain('This feature is not enabled for your organization, so the export gate’s verdict was not read.'),
    );
    expect(text()).not.toContain('Export readiness could not be read');
  });

  it('a failure to answer still says the verdict could not be read', async () => {
    answers.push([/^\/api\/cmc\/module3-os\/readiness\//, { status: 500, body: { error: 'Internal error' } }]);
    answers.push([/^\/api\/cmc\/module3-board/, boardWithSections()]);
    mount();
    await waitFor(() => expect(text()).toContain('Export readiness could not be read'));
    expect(text()).toContain('this is a failed read, not a pass');
  });
});

describe('what a 200 board reports about its own sub-reads is not a refusal', () => {
  /* The board answered. The server told us one of ITS reads failed. Classifying
     the board's 200 would say "not licensed" over a successful read, so these
     two panels keep their own words — and must keep saying it is a failed read
     rather than an empty register. */
  it('an unreadable section store is still a failed read, in the board’s own words', async () => {
    answers.push([/^\/api\/cmc\/module3-board/, ok({
      portfolio: [],
      sections: [],
      kpis: { submissions: 0, rpiAverage: null, sectionsApproved: 0, sectionsTotal: 0, readyPercent: 0 },
      meta: { projectId: PROJECT, sectionsProvisioned: true, portfolioProvisioned: true, sectionsUnreadable: true, portfolioUnreadable: false },
    })]);
    mount();
    await waitFor(() => expect(screen.queryByTestId('cmc-sections-unreadable')).toBeTruthy());
    expect(text()).toContain('The Module 3 sections could not be read');
    expect(text()).not.toMatch(/No Module 3 sections yet/);
    expect(text()).not.toContain('not enabled for your organization');
  });
});
