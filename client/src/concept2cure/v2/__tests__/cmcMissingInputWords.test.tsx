// @vitest-environment jsdom
/**
 * CMC names what a section still needs in words, never as a payload field (P-122 defects, item 3, 2026-11-10).
 *
 * Found on the demo's C2C-201: the Section approvals table read "missing: formulationCompositionComplete" and
 * "missing: manufacturingProcessDev, containerClosureStudies", and the withheld approval's reason and the Module 3
 * build board printed the same keys, or a source type ("impurity_profile"). The composer reports the absent payload
 * keys (server/services/module3Composer.ts); shared/cmc/module3-input-words.ts says each in words, and every CMC
 * screen that lists them uses it.
 *
 * Evidence: docs/evidence/DESIGN/P-122/defects/3-cmc-words/.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'lead@example.test', displayName: 'R. Lead' } }),
}));

import { CmOverview } from '../surfaces/CmcModule';
import { CmModule3Build } from '../surfaces/CmcModule3Build';
import { CmcQuestionsProvider } from '../surfaces/cmcAgencyQuestions';

type CmWindow = { C2C_PROJECT?: unknown };
const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

/** A payload key as the composer names one: camelCase, or a snake_case source type. */
const FIELD_NAME = /\b[a-z]+[A-Z][A-Za-z]*\b|\b[a-z]+_[a-z_]+\b/;
/** Each piece of text a row shows, read on its own (a row's textContent runs its cells together). */
function textsOf(el: HTMLElement): string[] {
  const walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n.nodeValue ?? '');
  return out;
}
const keysShown = (el: HTMLElement) => textsOf(el).filter((t) => FIELD_NAME.test(t));

const board = {
  portfolio: [],
  sections: [
    { key: '3.2.P.1', path: 'Description and Composition', st: 'draft', completeness: 75, missingInputs: ['formulationCompositionComplete'] },
    { key: '3.2.P.2', path: 'Pharmaceutical Development', st: 'draft', completeness: 33, missingInputs: ['manufacturingProcessDev', 'containerClosureStudies'] },
  ],
  kpis: { submissions: 0, rpiAverage: null, sectionsApproved: 0, sectionsTotal: 2, readyPercent: 0 },
  meta: { projectId: 'P-1', portfolioProvisioned: true, spinePortfolioProvisioned: true, sectionsProvisioned: true,
    portfolioUnreadable: false, sectionsUnreadable: false, generatedAt: '2026-11-10T00:00:00.000Z' },
};

const buildState = {
  sections: [{
    sectionKey: '3.2.S.4', sectionLabel: 'Control of Drug Substance', buildState: 'extraction_complete',
    sourceObjectCount: 4, uploadedSourceCount: 0, sourceTypes: ['specification', 'method'], completeness: 25,
    missingInputs: ['acceptanceCriteria', 'drugSubstanceBatchAnalyses', 'impurity_profile'],
    hasContradictions: false, contradictionCount: 0, isStale: false, staleReason: null, approvalState: 'not_started',
    hasNarrative: false, artifactId: null, artifactStatus: null, lastCompiled: null, lastUpdated: null,
  }],
  summary: { totalSections: 1, readySections: 0, staleSections: 0, blockedSections: 0, buildableSections: 1, readinessPercent: 0 },
};

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as CmWindow).C2C_PROJECT = { id: 'P-1' };
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m !== 'GET') return res({ success: true });
    if (/^\/api\/cmc\/module3-board/.test(u)) return res({ success: true, data: board });
    if (u.startsWith('/api/cmc/module3-os/build-state/')) return res({ success: true, data: buildState });
    if (u.startsWith('/api/cmc/module3-os/readiness/')) return res({ success: true, data: { totalSections: 1, approvedSections: 0, exportReady: false } });
    return res({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as CmWindow).C2C_PROJECT;
});

const row = (key: string) => screen.getByText(key, { selector: 'td' }).closest('tr') as HTMLElement;

describe('the Section approvals table says what a section still needs in words', () => {
  it('names §3.2.P.1\'s and §3.2.P.2\'s missing inputs as a reader says them', async () => {
    render(<CmcQuestionsProvider><CmOverview ask={vi.fn()} /></CmcQuestionsProvider>);
    await screen.findByText('3.2.P.1', { selector: 'td' });
    const p1 = row('3.2.P.1');
    const p2 = row('3.2.P.2');
    expect(within(p1).getByText(/a current formulation with its named components/)).toBeTruthy();
    expect(within(p2).getByText(/the drug product’s manufacturing process development/)).toBeTruthy();
    expect(within(p2).getByText(/the drug product’s container closure studies/)).toBeTruthy();
    for (const r of [p1, p2]) {
      expect(keysShown(r)).toEqual([]);
      const withheld = within(r).getByRole('button', { name: /Approve section/ });
      expect(withheld.getAttribute('title')).not.toMatch(FIELD_NAME);
    }
    expect(within(p1).getByRole('button', { name: /Approve section/ }).getAttribute('title'))
      .toMatch(/Missing required inputs: a current formulation with its named components\./);
  });
});

describe('the Module 3 build board says what a section still needs in words', () => {
  it('names a missing field and a missing source record as a reader says them', async () => {
    render(<CmModule3Build ask={() => {}} />);
    const r = (await screen.findByText('3.2.S.4', { selector: 'td' })).closest('tr') as HTMLElement;
    const cell = within(r).getByText(/the specification’s acceptance criteria/);
    expect(cell.getAttribute('title')).toMatch(/batch analysis results for the drug substance; an impurity profile record/);
    expect(keysShown(r)).toEqual([]);
  });
});
