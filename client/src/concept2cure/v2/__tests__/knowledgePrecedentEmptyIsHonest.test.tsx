// @vitest-environment jsdom
/**
 * A precedent view that holds nothing says so about THIS PLATFORM.
 *
 * `method_regulatory_outcomes` has no writer anywhere in the repository — three
 * read sites, zero inserts — and `csr_reports` carries no agency-acceptance
 * datum, so the method landscape, the endpoint–method matrix and the trend are
 * empty for every tenant and every indication. The difference that matters to a
 * sponsor:
 *
 *   "No precedent found for type 2 diabetes"   ← a claim about the regulatory
 *                                                record. False, and the kind of
 *                                                thing that reaches a regulator.
 *   "Nothing in Concept2Cure records a         ← a claim about us. True.
 *    regulatory outcome yet"
 *
 * An honest empty state is not a nicety here; the first sentence is a
 * fabrication with a percentage column next to it.
 *
 * Also pinned: a failed read never renders as an empty one, and a query whose
 * parser did not run says so rather than passing a short result off as the
 * graph's answer.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatKnowledgePanel } from '../surfaces/biostatKnowledge';

const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as unknown as Response;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

/** Type an indication and load the landscape. */
async function loadLandscape(answer: () => Response | Promise<Response>) {
  apiRequest.mockImplementation(async () => answer());
  render(<BiostatKnowledgePanel />);
  fireEvent.change(screen.getByPlaceholderText('e.g. type 2 diabetes'), { target: { value: 'type 2 diabetes' } });
  fireEvent.click(screen.getAllByRole('button', { name: /Load$/ })[0]);
}

describe('the precedent views', () => {
  it('an empty landscape blames the platform, not the regulatory record', async () => {
    await loadLandscape(() => ok([]));
    await waitFor(() => {
      expect(screen.getByText(/Nothing in Concept2Cure records a regulatory outcome/i)).toBeTruthy();
    });
  });

  it('an empty landscape never says no precedent was found', async () => {
    await loadLandscape(() => ok([]));
    await waitFor(() => expect(screen.getByText(/Nothing in Concept2Cure records/i)).toBeTruthy());
    expect(screen.queryByText(/no precedent (was )?found/i)).toBeNull();
    expect(screen.queryByText(/no regulatory examples/i)).toBeNull();
  });

  it('says plainly that a CSR does not carry the datum these views aggregate', async () => {
    await loadLandscape(() => ok([]));
    await waitFor(() => {
      expect(screen.getByText(/a CSR does not state whether an agency accepted the method/i)).toBeTruthy();
    });
  });

  it('a failed read is a failure, not an empty precedent store', async () => {
    await loadLandscape(() => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, message: 'relation does not exist' }),
    }) as unknown as Response);
    await waitFor(() => expect(screen.getByText(/was not read/i)).toBeTruthy());
    // The precedent sentence must NOT appear: nothing was read, so nothing is known.
    expect(screen.queryByText(/Nothing in Concept2Cure records/i)).toBeNull();
  });

  it('real rows render as rows, so the empty state is not the only path', async () => {
    await loadLandscape(() =>
      ok([
        {
          methodName: 'MMRM',
          methodNodeId: 7,
          totalUses: 4,
          acceptedCount: 3,
          rejectedCount: 1,
          successRate: 0.75,
          agencies: ['FDA'],
          phases: ['Phase 3'],
        },
      ]),
    );
    await waitFor(() => expect(screen.getByText('MMRM')).toBeTruthy());
    expect(screen.getByText('75.0%')).toBeTruthy();
    expect(screen.queryByText(/Nothing in Concept2Cure records/i)).toBeNull();
  });
});

describe('the graph query', () => {
  const RESULT = {
    answer: 'MMRM appears in four of your reports.',
    answerIsNarration: true as const,
    answerUnavailableReason: null,
    nodes: [{ id: 7, nodeType: 'statistical_method', name: 'MMRM', description: null, sourceCount: 4 }],
    edges: [],
    matchedNodeCount: 1,
    matchedEdgeCount: 0,
    parsedByModel: true,
    parseNote: null,
  };

  async function ask(data: unknown) {
    apiRequest.mockImplementation(async () => ok(data));
    render(<BiostatKnowledgePanel />);
    fireEvent.change(screen.getByPlaceholderText(/which methods have we used/i), { target: { value: 'methods for HbA1c' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));
  }

  it('labels the prose as narration over the rows', async () => {
    await ask(RESULT);
    await waitFor(() => expect(screen.getByText(/MMRM appears in four of your reports/)).toBeTruthy());
    expect(screen.getByText(/Narration over the rows below/i)).toBeTruthy();
    expect(screen.getByText(/derives no figure/i)).toBeTruthy();
  });

  it('shows the matched counts, and no confidence', async () => {
    await ask(RESULT);
    await waitFor(() => expect(screen.getByText(/1 node\(s\) and 0 edge\(s\) matched/i)).toBeTruthy());
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it('a parser that did not run is reported, not disguised as a thin result', async () => {
    await ask({
      ...RESULT,
      nodes: [],
      matchedNodeCount: 0,
      parsedByModel: false,
      parseNote: 'The question was not parsed into search terms — that model did not answer.',
    });
    await waitFor(() => expect(screen.getByText(/was not parsed into search terms/i)).toBeTruthy());
  });

  it('a missing summary says why, and keeps the rows', async () => {
    await ask({
      ...RESULT,
      answer: null,
      answerUnavailableReason: 'The summary could not be generated — that model did not answer.',
    });
    await waitFor(() => expect(screen.getByText(/summary could not be generated/i)).toBeTruthy());
    expect(screen.getByText('MMRM')).toBeTruthy();
  });
});
