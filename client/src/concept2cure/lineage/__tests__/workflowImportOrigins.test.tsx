// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataOriginsReport, OriginRow } from '../dataOriginsApi';
const fetchDataOrigins = vi.hoisted(() => vi.fn());
vi.mock('../dataOriginsApi', async original => ({ ...(await original<typeof import('../dataOriginsApi')>()), fetchDataOrigins }));
import { DataOriginsPanel } from '../DataOriginsPanel';

const query = { documentTable: 'authoring_sections', documentId: 'stored-copy', charStart: 0, charEnd: 20 };
function report(kind: OriginRow['provenanceKind']): DataOriginsReport {
  return { ...query, selection: { charStart: 0, charEnd: 20 }, coveragePercent: 100, uncovered: [],
    counts: { total: 1, fromSources: 0, authorAsserted: 0, machineDrafted: kind === 'accepted_machine_draft' ? 1 : 0, machineDraftedUnaccepted: kind === 'machine_draft' ? 1 : 0, stale: 0 },
    generatedAt: '2026-10-13T22:00:00Z', origins: [{ id: 'origin', ...query, provenanceKind: kind,
      referenceId: null, payloadSha256: null, sourceLocator: null, assertedBy: kind === 'accepted_machine_draft' ? 'Assigned reviewer' : null,
      assertedAt: null, machineAuthorId: 'workflow_import', machineAuthorName: 'Workflow compositor', usage: 'asserted', confidence: null }] };
}
beforeEach(() => { fetchDataOrigins.mockReset(); });
afterEach(() => { cleanup(); });

describe('saved workflow origin presentation retains the compositor distinction', () => {
  it('shows imported text awaiting review without attributing template or unknown originals to AI', async () => {
    fetchDataOrigins.mockResolvedValue(report('machine_draft'));
    render(<DataOriginsPanel query={query} onClose={() => {}} />);
    expect(await screen.findByText('Saved workflow import — awaiting review')).toBeTruthy();
    expect(screen.getByText(/Imported content awaiting human review/)).toBeTruthy();
    expect(screen.getByText('No person has accepted this text')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Drafted by the AI/i);
  });
  it('retains a recorded person’s acceptance without claiming original human authorship', async () => {
    fetchDataOrigins.mockResolvedValue(report('accepted_machine_draft'));
    render(<DataOriginsPanel query={query} onClose={() => {}} />);
    expect(await screen.findByText('Saved workflow import')).toBeTruthy();
    expect(screen.getByText(/Imported content, accepted by a person/)).toBeTruthy();
    expect(document.body.textContent).toContain('accepted by Assigned reviewer');
    expect(document.body.textContent).not.toMatch(/Asserted by the author|Drafted by the AI/i);
  });
});
