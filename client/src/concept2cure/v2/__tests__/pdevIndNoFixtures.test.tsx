// @vitest-environment jsdom
/**
 * PDEV → IND surface — the fixture-free contract, pinned.
 *
 * The legacy v2 `surfaces/PdevInd.tsx` (381 LOC of fixtures: a PDEV_VIEW program
 * view and a PDEV_DRAFT AI-draft result whose `preview.sections[].preview` prose
 * the server NEVER produced) was retired in d97fd398. The v2 rail now redirects
 * to the Phase 7 PDEV kit at client/src/concept2cure/pdev/, which is the real
 * source of truth for PDEV → IND. These tests pin the guarantee on that kit:
 *
 *   - the program dashboard renders the org's REAL program from the live
 *     /api/pdev/programs/:id read (PdevApp → PdevOverview);
 *   - an org with no IND programs sees an honest empty state, not a seed program;
 *   - a failed program read is an honest error, not a cached sample;
 *   - the AI-drafting workbench renders ONLY the real metadata the governed
 *     service returns (quality grade, word count, title, document code, target
 *     eCTD section, artifact id) and NEVER the retired fabricated section-by-
 *     section preview prose;
 *   - no "Sample data" pill / SampleTag survives anywhere.
 *
 * The real ai-draft response is metadata only — see
 * server/services/pdev/pdev-ai-drafting.ts → PdevAiDraftResult
 * ({ activityStateId, artifactId, documentCode, ectdSection, qualityGrade,
 *    title, wordCount }); it carries no section preview of prose.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import { PdevApp } from '../../pdev/App';
import { PdevAiDraftWorkbench } from '../../pdev/surfaces/AiDraftWorkbench';
import type { PdevActivityView, PdevProgramView } from '../../pdev/data/types';

// ── A tiny per-URL fetch router (real reads, no fixtures) ────────────────────
interface MockReply {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}
type Handler = (url: string, init?: RequestInit) => MockReply;

let handler: Handler = () => ({ ok: false, status: 404, body: { data: null } });

function toResponse(r: MockReply): Response {
  const status = r.status ?? (r.ok === false ? 404 : 200);
  return {
    ok: r.ok ?? status < 400,
    status,
    json: async () => r.body ?? { data: null },
    text: async () => r.text ?? JSON.stringify(r.body ?? { data: null }),
  } as Response;
}

beforeEach(() => {
  handler = () => ({ ok: false, status: 404, body: { data: null } });
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(toResponse(handler(String(input), init))),
  ) as unknown as typeof fetch;
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
});

// ── Test-local, real-shaped data (never importable by the surface) ───────────
const PROGRAM_ID = '11111111-2222-4333-8444-555555555555';

const PROGRAM_VIEW: PdevProgramView = {
  program: {
    id: PROGRAM_ID,
    name: 'BX-42 first-in-human IND',
    code: 'BX-42',
    productName: 'Bexlaparib',
    programType: 'IND',
    primaryAgency: 'FDA',
    status: 'active',
    phase: 'Phase 1',
    targetSubmissionDate: '2026-11-01T00:00:00.000Z',
    progressPercent: 61,
    metadata: { projectId: 7, blocker: 'GLP tox report pending QA sign-off' },
    updatedAt: '2026-07-30T00:00:00.000Z',
  },
  workstreams: [
    { workstream: 'cmc', totalActivities: 6, completedActivities: 2, inFlightActivities: 2, blockedActivities: 1, notStartedActivities: 1, blockingActivities: 2, blockingResolved: 1, readinessScore: 48 },
    { workstream: 'nonclinical', totalActivities: 5, completedActivities: 3, inFlightActivities: 1, blockedActivities: 0, notStartedActivities: 1, blockingActivities: 1, blockingResolved: 1, readinessScore: 72 },
    { workstream: 'clinical', totalActivities: 4, completedActivities: 1, inFlightActivities: 1, blockedActivities: 0, notStartedActivities: 2, blockingActivities: 1, blockingResolved: 0, readinessScore: 35 },
    { workstream: 'regulatory', totalActivities: 3, completedActivities: 2, inFlightActivities: 1, blockedActivities: 0, notStartedActivities: 0, blockingActivities: 0, blockingResolved: 0, readinessScore: 80 },
  ],
  activities: [],
  latestSnapshots: [
    { id: 'snap-1', programId: PROGRAM_ID, workstream: 'overall', readinessScore: 61, computedAt: '2026-07-30T12:00:00.000Z', triggeredBy: 'manual' },
  ],
  qSubmissionCount: 3,
  fdaCorrespondenceCount: 5,
};

const IND_PROGRAM_ROW = {
  id: PROGRAM_ID,
  code: 'BX-42',
  productName: 'Bexlaparib',
  name: 'BX-42 first-in-human IND',
  programType: 'IND',
  status: 'active',
  metadata: { projectId: 7 },
};

const ACTIVITY_VIEW: PdevActivityView = {
  registry: {
    key: 'nonclinical.glp_tox',
    workstream: 'nonclinical',
    stage: 'ind_package',
    title: 'GLP toxicology',
    description: 'Pivotal GLP toxicology package supporting first-in-human dosing.',
    requiredDocuments: [
      { code: 'm4.glp_tox_summary', title: 'GLP toxicology summary', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: true },
    ],
    dependsOn: [],
    blocksIndAssembly: true,
  },
  state: null,
};

/** The exact metadata-only record the governed service returns (mirrors
 *  server PdevAiDraftResult). NO `preview`, `sections`, `model`, `citations`,
 *  or `grade` — those were the fabricated fields. */
const REAL_DRAFT_META = {
  activityStateId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  artifactId: 'artifact-9f3c21',
  documentCode: 'm4.glp_tox_summary',
  ectdSection: '4.2.3',
  qualityGrade: 'B',
  title: 'GLP toxicology summary — draft',
  wordCount: 1840,
};

describe('PDEV program dashboard renders real org data (no fixture)', () => {
  it('renders the org program from the live /api/pdev/programs read', async () => {
    handler = (url) => {
      if (url.includes('/api/regulatory-programs')) return { body: { data: [IND_PROGRAM_ROW] } };
      if (url.endsWith(`/programs/${PROGRAM_ID}`)) return { body: { data: PROGRAM_VIEW } };
      return { ok: false, status: 404, body: { data: null } };
    };

    render(<PdevApp />);

    // The Overview surface has painted from the real read.
    expect(await screen.findByText('Workstream rollup')).toBeTruthy();

    // Real program identity, straight from the org's PdevProgramView.
    expect(document.querySelector('.pdev-page-title')?.textContent).toBe('BX-42 · Bexlaparib');
    expect(screen.getAllByText(/Bexlaparib/).length).toBeGreaterThan(0);

    // Real readiness derived from the real snapshot / rollups.
    expect(document.querySelector('.pdev-readiness-num')?.textContent).toContain('61');

    // Real workstream rollup counts (CMC: 2 of 6 complete).
    expect(screen.getByText('2/6')).toBeTruthy();

    // Real blocker text from program metadata (surfaced in the header card
    // and echoed in the AnA dock — both from the live read).
    expect(screen.getAllByText('GLP tox report pending QA sign-off').length).toBeGreaterThan(0);

    // No fixture / sample affordance anywhere.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });
});

describe('PDEV program dashboard — honest empty & error, not a seed/cached sample', () => {
  it('shows an honest empty state when the org has no IND programs', async () => {
    handler = (url) => {
      if (url.includes('/api/regulatory-programs')) return { body: { data: [] } };
      return { ok: false, status: 404, body: { data: null } };
    };

    render(<PdevApp />);

    expect(await screen.findByText('No IND programs yet')).toBeTruthy();
    // No fabricated program leaks in as a fallback.
    expect(screen.queryByText('BX-42 · Bexlaparib')).toBeNull();
    expect(screen.queryByText('Workstream rollup')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  });

  it('shows an honest error (not a cached sample) when the program read fails', async () => {
    handler = (url) => {
      if (url.includes('/api/regulatory-programs')) return { body: { data: [IND_PROGRAM_ROW] } };
      if (url.endsWith(`/programs/${PROGRAM_ID}`)) return { ok: false, status: 503, text: 'boom', body: { data: null } };
      return { ok: false, status: 404, body: { data: null } };
    };

    render(<PdevApp />);

    expect(await screen.findByText(/Couldn.t load this program/)).toBeTruthy();
    // No fabricated program is shown as a fallback for the failed read.
    expect(screen.queryByText('Workstream rollup')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  });
});

describe('PDEV AI-drafting workbench renders real metadata, never fabricated prose', () => {
  it('renders the governed record metadata the service returns — and no section prose', async () => {
    handler = (url) => {
      if (url.includes('/ai-draft')) return { status: 201, body: { data: REAL_DRAFT_META } };
      return { ok: false, status: 404, body: { data: null } };
    };

    const { container } = render(
      <PdevAiDraftWorkbench
        programId={PROGRAM_ID}
        projectId={7}
        activity={ACTIVITY_VIEW}
        documentCode="m4.glp_tox_summary"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }));

    // Honest governed-lifecycle confirmation with the REAL metadata.
    expect(await screen.findByText('Draft generated')).toBeTruthy();
    expect(screen.getByText(/entered\s+the\s+governed\s+lifecycle/i)).toBeTruthy();
    expect(screen.getByText('Quality gate: B')).toBeTruthy();
    expect(screen.getByText('1840 words')).toBeTruthy();
    expect(screen.getByText('GLP toxicology summary — draft')).toBeTruthy();
    expect(screen.getAllByText('m4.glp_tox_summary').length).toBeGreaterThan(0);
    expect(screen.getByText('4.2.3')).toBeTruthy();
    expect(screen.getByText('artifact-9f3c21')).toBeTruthy();
    // Honest affordance to open the REAL artifact — not fabricated body text.
    expect(screen.getByText(/Provenance tab/i)).toBeTruthy();

    // The retired fabricated section-by-section prose renders NOWHERE.
    expect(container.querySelector('.pdev-aidraft-section')).toBeNull();
    expect(container.querySelector('.pdev-aidraft-section-preview')).toBeNull();
    expect(container.querySelector('.pdev-aidraft-title')).toBeNull();
    expect(screen.queryByText(/§/)).toBeNull();

    // No fixture / sample affordance.
    expect(container.querySelector('.c2c-sample-tag')).toBeNull();
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });
});

/** Strip block + line comments so the scan asserts on CODE only — the doc
 *  comments deliberately name the retired shape to document the removal, and
 *  must not themselves trip the fixture guard. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('PDEV AI-draft source carries no fabricated-preview symbols', () => {
  const wb = stripComments(
    fs.readFileSync(
      path.resolve(__dirname, '../../pdev/surfaces/AiDraftWorkbench.tsx'),
      'utf8',
    ),
  );
  const types = stripComments(
    fs.readFileSync(
      path.resolve(__dirname, '../../pdev/data/types.ts'),
      'utf8',
    ),
  );

  it('the workbench renders real metadata fields, not the retired preview prose', () => {
    // Real, metadata-only fields are what get rendered.
    expect(wb).toMatch(/result\.qualityGrade/);
    expect(wb).toMatch(/result\.wordCount/);
    expect(wb).toMatch(/result\.artifactId/);
    expect(wb).toMatch(/result\.ectdSection/);
    expect(wb).toMatch(/result\.documentCode/);
    // The fabricated shape is gone for good.
    expect(wb).not.toMatch(/result\.preview/);
    expect(wb).not.toMatch(/preview\.sections/);
    expect(wb).not.toMatch(/\.sections\.map/);
    expect(wb).not.toMatch(/result\.model/);
    expect(wb).not.toMatch(/result\.citations/);
    expect(wb).not.toMatch(/result\.grade\b/);
    expect(wb).not.toMatch(/SampleTag/);
  });

  it('the PdevAiDraftResult type is the metadata-only server shape', () => {
    expect(types).toMatch(/activityStateId/);
    expect(types).toMatch(/qualityGrade/);
    expect(types).toMatch(/wordCount/);
    // No fabricated preview / sections structure survives in the type.
    expect(types).not.toMatch(/preview:\s*\{/);
    expect(types).not.toMatch(/sections:\s*Array/);
  });
});
