import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { PathwayManifestResponse, DeliverableSourceRef } from '@shared/types/submission-api';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';

export const PROGRAM_A = '40000000-0000-4000-8000-000000000001';
export const PROGRAM_B = '40000000-0000-4000-8000-000000000002';
export const DOCUMENT_A = '50000000-0000-4000-8000-000000000001';
export const SUB_A = { id: 41, title: 'Recorded trial dossier A', productName: null, applicationType: 'cta', clientType: 'biotech', primaryRegion: 'eu', status: 'active', lifecycleStage: 'original', programId: PROGRAM_A };
export const SUB_B = { ...SUB_A, id: 42, title: 'Recorded trial dossier B', programId: PROGRAM_B };
export const SEQ_A = { id: 21, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'eu', validationStatus: null, deliverables: { available: true, compatiblePathways: ['ctis'], recordedPathway: 'ctis', reasonCode: null } };
export const SEQ_B = { ...SEQ_A, id: 22 };
export const SOURCE: DeliverableSourceRef = { leafId: 301, sequenceId: 21, submissionId: 41, programId: PROGRAM_A, projectId: 101, document: { table: 'coauthor_documents', keyKind: 'integer', id: 88 }, section: { id: 'source-section-id', code: 'SOURCE-PROTOCOL' }, editor: { kind: 'authoring-document', documentId: DOCUMENT_A, programId: PROGRAM_A, sectionCode: 'SOURCE-PROTOCOL' }, evidence: { content: 'substantive', pin: 'match', lifecycle: 'finalized', reasonCode: null } };

export function manifest(overrides: Partial<PathwayManifestResponse> = {}): PathwayManifestResponse {
  return {
    pathway: 'ctis', framework: 'Recorded CTIS structural coverage', generatedFrom: 'canonical-core', ready: false,
    totals: { sections: 5, requiredPresent: 1, requiredMissing: 1, undetermined: 1 },
    scope: { organizationId: 1, programId: PROGRAM_A, projectId: 101, submissionId: 41, sequenceId: 21, sequenceRegion: 'eu', recordedApplicationType: 'cta', recordedPathway: 'ctis', evaluatedPathway: 'ctis', memberStates: [], regulation: null, inputOrigin: 'recorded', evaluation: 'retained-placement-content-coverage', dispatchReadiness: 'separate-governed-assessment' },
    entries: [
      { path: '01/protocol', id: 'protocol', label: 'Retained protocol evidence', group: 'Part I', required: true, status: 'present', sources: ['filing-code-is-not-source-code'], sourceRefs: [SOURCE] },
      { path: '02/missing', id: 'missing', label: 'Missing retained document', group: 'Part I', required: true, status: 'missing', sources: [], sourceRefs: [] },
      { path: '03/unknown', id: 'unknown', label: 'Unanswered applicability', group: 'Part II', required: false, status: 'undetermined', sources: [], sourceRefs: [], checkApplicability: true },
      { path: '04/optional', id: 'optional', label: 'Optional unplaced material', group: 'Part II', required: false, status: 'optional-absent', sources: [], sourceRefs: [] },
      { path: '05/na', id: 'na', label: 'Known excluded requirement', group: 'Part II', required: false, status: 'not-applicable', sources: [], sourceRefs: [] },
    ],
    sourceIssues: [], ...overrides,
  };
}

export const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve: (value: T) => resolve(value), reject: (reason: Error) => reject(reason) };
};
export const requestUrl = (calls: unknown[][], part: string) => calls.filter(c => String(c[1]).includes(part));

export function fixtureRoute(url: string): Response {
  if (url === `/api/submissions?programId=${PROGRAM_A}`) return response({ data: [SUB_A] });
  if (url === `/api/submissions?programId=${PROGRAM_B}`) return response({ data: [SUB_B] });
  if (url === '/api/submissions') return response([SUB_A, SUB_B]);
  if (url === '/api/submissions/41/sequences') return response([SEQ_A]);
  if (url === '/api/submissions/42/sequences') return response([SEQ_B]);
  if (url === '/api/c2c/projects') return response({ data: [{ id: PROGRAM_A, title: 'Program A', code: 'A' }, { id: PROGRAM_B, title: 'Program B', code: 'B' }] });
  if (url === '/api/510k/estar/submissions') return response({ submissions: [] });
  if (url === '/api/510k/estar/assemble') return response({ artifactKind: 'none', blockers: [] });
  if (url.includes('/pathway-manifest')) return response(manifest());
  if (url === '/api/submissions/sequences/21/leaves') return response([{ id: 301, sectionCode: 'FILING-LEAF', title: 'Retained A leaf', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 88 }]);
  if (url === '/api/submissions/sequences/22/leaves') return response([{ id: 302, sectionCode: 'FILING-B', title: 'Retained B leaf', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 89 }]);
  return response({ data: [] });
}

export async function openRequired(onNav = vi.fn()) {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
  await screen.findByRole('combobox', { name: 'Submission to work on' });
  fireEvent.click(screen.getByRole('tab', { name: 'Required deliverables' }));
  await screen.findByRole('combobox', { name: 'Working sequence' });
  return onNav;
}

export async function waitForManifest(calls: unknown[][]) {
  await waitFor(() => expect(requestUrl(calls, '/pathway-manifest')).toHaveLength(1));
}
