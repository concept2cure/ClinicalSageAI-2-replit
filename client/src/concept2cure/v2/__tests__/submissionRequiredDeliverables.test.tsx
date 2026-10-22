// @vitest-environment jsdom
/** Actual SubmissionCenter interactions over the reviewed server-owned coverage contract. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DeliverableSourceRef, Pathway } from '@shared/types/submission-api';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { publishShellProject } from '../shellProject';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { PROGRAM_A, PROGRAM_B, DOCUMENT_A, SOURCE, SUB_A, SEQ_A, fixtureRoute, response, manifest, deferred, requestUrl, openRequired, waitForManifest } from './_submission-deliverables-fixture';

beforeEach(() => {
  authService.setToken('fixture-deliverables-a', { id: '7', organizationId: '1' }, 'fixture-refresh-a', 3600);
  publishShellProject({ id: PROGRAM_A, title: 'Program A' });
  clearEditorTarget();
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => fixtureRoute(url));
});
afterEach(() => { cleanup(); authService.endSession(null); clearEditorTarget(); delete window.C2C_PROJECT; vi.unstubAllGlobals(); });

describe('required deliverables — native coverage and scope', () => {
  it('opens through the existing tab and one SeqPicker, reading the exact selected records once', async () => {
    await openRequired();
    await screen.findByText('Retained protocol evidence');
    expect(screen.getAllByRole('combobox', { name: 'Working sequence' })).toHaveLength(1);
    const calls = requestUrl(apiRequest.mock.calls, '/pathway-manifest');
    expect(calls).toHaveLength(1);
    const url = new URL(String(calls[0][1]), 'https://fixture.invalid');
    expect(url.pathname).toBe('/api/submissions/sequences/21/pathway-manifest');
    expect(Object.fromEntries(url.searchParams)).toEqual({ programId: PROGRAM_A, submissionId: '41' });
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toEqual([['POST', '/api/510k/estar/assemble', { pathway: '510k', variant: 'device' }]]);
  });

  it('shows all five structural states and keeps coverage separate from governed dispatch', async () => {
    await openRequired();
    const protocol = (await screen.findByText('Retained protocol evidence')).closest('tr')!;
    expect(within(protocol).getByText('Present')).toBeTruthy();
    expect(within(screen.getByText('Missing retained document').closest('tr')!).getByText('Missing')).toBeTruthy();
    expect(within(screen.getByText('Unanswered applicability').closest('tr')!).getByText('Undetermined')).toBeTruthy();
    expect(within(screen.getByText('Optional unplaced material').closest('tr')!).getByText('Optional absent')).toBeTruthy();
    expect(within(screen.getByText('Known excluded requirement').closest('tr')!).getByText('Not applicable')).toBeTruthy();
    expect(screen.getByText(/does not approve.*clear.*dispatch/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /freeze|dispatch|transmit/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/full CTD complete|100%|filing ready/i);
  });

  it.each(['ind', 'nda', 'bla'])('keeps %s coverage explicitly unsupported and offers the existing Validation workspace', async applicationType => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === `/api/submissions?programId=${PROGRAM_A}`) return response([{ ...SUB_A, applicationType }]);
      if (url === '/api/submissions/41/sequences') return response([{ ...SEQ_A, deliverables: { available: false, compatiblePathways: [], recordedPathway: null, reasonCode: 'UNSUPPORTED_FRAMEWORK' } }]);
      return fixtureRoute(url);
    });
    await openRequired();
    expect(await screen.findByText(/coverage catalogue.*not available/i)).toBeTruthy();
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open Validation' }));
    expect(screen.getByRole('tab', { name: 'Validation' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByText("Couldn't load the validation findings");
  });

  it('requires an explicit compatible framework when none is recorded, without selecting the first option', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/submissions/41/sequences') return response([{ ...SEQ_A, deliverables: { available: true, compatiblePathways: ['ctis'], recordedPathway: null, reasonCode: null } }]);
      if (url.includes('/pathway-manifest')) return response(manifest({ scope: { ...manifest().scope, recordedPathway: null, inputOrigin: 'explicit-compatible' } }));
      return fixtureRoute(url);
    });
    await openRequired();
    const picker = await screen.findByRole('combobox', { name: 'Coverage framework' }) as HTMLSelectElement;
    expect(picker.value).toBe('');
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(0);
    fireEvent.change(picker, { target: { value: 'ctis' } });
    await screen.findByText('Retained protocol evidence');
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(1);
    expect(new URL(String(requestUrl(apiRequest.mock.calls, '/pathway-manifest')[0][1]), 'https://fixture.invalid').searchParams.get('pathway')).toBe('ctis');
  });

  it('does not treat missing availability metadata as a supported catalogue', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/submissions/41/sequences') { const { deliverables, ...seq } = SEQ_A; expect(deliverables.available).toBe(true); return response([seq]); }
      return fixtureRoute(url);
    });
    await openRequired();
    expect(await screen.findByText(/coverage.*could not be verified/i)).toBeTruthy();
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(0);
  });

  it.each(['program', 'submission', 'sequence', 'organization', 'framework', 'member-state'] as const)('refuses a success envelope with the wrong %s identity before rendering source metadata', async mismatch => {
    const current = manifest();
    const changes = { program: { programId: PROGRAM_B }, submission: { submissionId: 42 }, sequence: { sequenceId: 22 }, organization: { organizationId: 2 }, framework: { evaluatedPathway: 'mdr' }, 'member-state': { memberStates: ['DE'] } };
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response({ ...current, scope: { ...current.scope, ...changes[mismatch] } }) : fixtureRoute(url));
    await openRequired();
    expect(await screen.findByText(/couldn't load.*deliverables/i)).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open saved document' })).toBeNull();
  });

  it('surfaces a backend refusal without displaying the last result as success or empty coverage', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest')
      ? response({ error: { code: 'FRAMEWORK_CONFLICT', message: 'The recorded filing framework conflicts with this selection.' } }, 409) : fixtureRoute(url));
    await openRequired();
    expect(await screen.findByText(/recorded filing framework conflicts/i)).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
    expect(document.body.textContent).not.toMatch(/nothing is required|zero missing/i);
  });

  it('shows pin-change/content/lifecycle facts beside their source without relabeling them dispatch approval', async () => {
    const changed: DeliverableSourceRef = { ...SOURCE, evidence: { content: 'undetermined', pin: 'mismatch', lifecycle: 'draft', reasonCode: 'CONTENT_CHANGED' } };
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response(manifest({ entries: [{ ...manifest().entries[0], status: 'undetermined', sourceRefs: [changed] }], sourceIssues: [{ leafId: SOURCE.leafId, code: 'CONTENT_CHANGED', message: 'The retained source pin no longer matches the verified content.' }] })) : fixtureRoute(url));
    await openRequired();
    const row = (await screen.findByText('Retained protocol evidence')).closest('tr')!;
    expect(within(row).getByText('Undetermined')).toBeTruthy();
    expect(within(row).getByText('Source content changed')).toBeTruthy();
    expect(within(row).getByText('Content undetermined')).toBeTruthy();
    expect(within(row).getByText('Draft')).toBeTruthy();
    expect(screen.getByText(/retained source pin no longer matches/)).toBeTruthy();
  });

});

describe('required deliverables — canonical frameworks and malformed envelopes', () => {
  const frameworks: Array<[Pathway, string, string]> = [
    ['ctis', 'cta', 'eu'], ['mdr', 'mdr_td', 'eu'], ['ivdr', 'ivdr_td', 'eu'],
    ['estar_510k', '510k', 'fda'], ['estar_de_novo', 'de_novo', 'fda'], ['pmda_shonin', 'jnda', 'jp'],
    ['pma', 'pma', 'fda'], ['prestar_q_sub', 'q_sub', 'fda'], ['prestar_ide', 'ide', 'fda'], ['prestar_513g', '513g', 'fda'],
  ];
  it.each(frameworks)('renders a positively recorded %s framework with its actual compatible filing and regulation', async (pathway, applicationType, region) => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === `/api/submissions?programId=${PROGRAM_A}`) return response([{ ...SUB_A, applicationType, primaryRegion: region }]);
      if (url === '/api/submissions/41/sequences') return response([{ ...SEQ_A, region, deliverables: { available: true, compatiblePathways: [pathway], recordedPathway: pathway, reasonCode: null } }]);
      if (url.includes('/pathway-manifest')) return response(manifest({ pathway, framework: `Qualified ${pathway} envelope`, scope: { ...manifest().scope, recordedApplicationType: applicationType, sequenceRegion: region, recordedPathway: pathway, evaluatedPathway: pathway, regulation: pathway === 'mdr' || pathway === 'ivdr' ? pathway : null } }));
      return fixtureRoute(url);
    });
    await openRequired();
    await screen.findByText('Retained protocol evidence');
    expect((screen.getByRole('combobox', { name: 'Coverage framework' }) as HTMLSelectElement).value).toBe(pathway);
    expect(screen.queryByText(/Couldn't load the deliverables/)).toBeNull();
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(1);
  });

  it.each([
    ['status', '__proto__'], ['status', 'toString'], ['status', 'constructor'],
    ['content', '__proto__'], ['content', 'toString'], ['content', 'constructor'],
    ['pin', '__proto__'], ['pin', 'toString'], ['pin', 'constructor'],
    ['lifecycle', '__proto__'], ['lifecycle', 'toString'], ['lifecycle', 'constructor'],
  ])('refuses a malformed 200 %s dictionary value %s without admitting source metadata', async (axis, invalid) => {
    const current = manifest();
    const entry = current.entries[0];
    const invalidEntry = axis === 'status' ? { ...entry, status: invalid }
      : { ...entry, sourceRefs: [{ ...SOURCE, evidence: { ...SOURCE.evidence, [axis]: invalid } }] };
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response({ ...current, entries: [invalidEntry] }) : fixtureRoute(url));
    await openRequired();
    expect(await screen.findByText(/Couldn't load the deliverables/)).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open saved document' })).toBeNull();
  });

  it('normalizes explicit CTIS state codes without rewriting the actual Greek ISO code or inferring titles', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/pathway-manifest')) return fixtureRoute(url);
      const states = new URL(url, 'https://fixture.invalid').searchParams.get('memberStates')?.split(',') ?? [];
      return response(manifest({ scope: { ...manifest().scope, memberStates: states }, entries: [{ ...manifest().entries[0], label: `State scope ${states.join(' / ') || 'unanswered'}` }] }));
    });
    await openRequired();
    await screen.findByText('State scope unanswered');
    fireEvent.change(screen.getByLabelText('CTIS member-state codes'), { target: { value: ' gr, de, GR ' } });
    await screen.findByText('State scope DE / GR');
    const last = requestUrl(apiRequest.mock.calls, '/pathway-manifest').at(-1)!;
    expect(new URL(String(last[1]), 'https://fixture.invalid').searchParams.get('memberStates')).toBe('DE,GR');
    expect(document.body.textContent).not.toContain('DE / EL');
  });

  it('keeps an unsupported CTIS code as an input warning without issuing a new coverage read', async () => {
    await openRequired();
    await screen.findByText('Retained protocol evidence');
    fireEvent.change(screen.getByLabelText('CTIS member-state codes'), { target: { value: 'ZZ' } });
    expect(await screen.findByText(/Use supported two-letter EU member-state codes/)).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
    expect(requestUrl(apiRequest.mock.calls, '/pathway-manifest')).toHaveLength(1);
  });
});

describe('required deliverables — admitted optional display labels', () => {
  it('shows recorded program/source names before trace identifiers while preserving the exact saved target', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response(manifest({ scope: { ...manifest().scope, programCode: 'REC-A', programTitle: 'Retained program title' }, entries: [{ ...manifest().entries[0], sourceRefs: [{ ...SOURCE, label: 'Retained saved trial protocol' }] }] })) : fixtureRoute(url));
    const onNav = await openRequired();
    await screen.findByText('Retained saved trial protocol');
    expect(screen.getByText(/REC-A · Retained program title/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open saved document' }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith('document-authoring');
    expect(peekEditorTarget()).toMatchObject({ docId: DOCUMENT_A, programId: PROGRAM_A });
  });

  it.each(['programCode', 'programTitle', 'label'] as const)('rejects an invalid present optional %s type without requiring labels from an older response', async field => {
    const current = manifest();
    const invalid = field === 'label' ? { ...current, entries: [{ ...current.entries[0], sourceRefs: [{ ...SOURCE, label: 44 }] }] } : { ...current, scope: { ...current.scope, [field]: 44 } };
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response(invalid) : fixtureRoute(url));
    await openRequired();
    expect(await screen.findByText(/Couldn't load the deliverables/)).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
  });
});

describe('Builder source evidence — current admitted pointer outcomes', () => {
  it.each([
    ['undetermined', 'Source evidence undetermined'],
    ['missing', 'not found in this organization'],
    ['content_changed', 'content changed since filing'],
  ] as const)('displays the actual %s result without converting it into another source verdict', async (status, label) => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.split('?')[0] === '/api/submissions/sequences/21/leaves'
      ? response([{ id: 301, sectionCode: 'FILING-A', title: 'Exact admitted source outcome', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 88, sourceDocument: { status, keyKind: 'integer', pinnedSha256: null, storedSha256: null, pin: 'unverifiable', reason: 'Recorded source outcome from the current reader.' } }]) : fixtureRoute(url));
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Submission to work on' });
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    expect(await screen.findByText(label)).toBeTruthy();
    expect(document.body.textContent).not.toContain('source verified');
  });
});

describe('required deliverables — exact saved sources and late reads', () => {
  it('hands the exact authoring UUID/program and actual source section to the canonical editor once', async () => {
    const onNav = await openRequired();
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved document' }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith('document-authoring');
    expect(peekEditorTarget()).toMatchObject({ docType: null, docId: DOCUMENT_A, programId: PROGRAM_A, sectionCode: 'SOURCE-PROTOCOL', sectionLabel: null });
    expect(peekEditorTarget()?.sectionCode).not.toBe('filing-code-is-not-source-code');
  });

  it('keeps unverified/unsupported stores as references instead of guessing an authoring document', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? response(manifest({ entries: [{ ...manifest().entries[0], sourceRefs: [{ ...SOURCE, editor: null, document: { table: 'vault_documents', keyKind: 'uuid', id: DOCUMENT_A } }] }] })) : fixtureRoute(url));
    const onNav = await openRequired();
    await screen.findByText('Retained protocol evidence');
    expect(screen.queryByRole('button', { name: 'Open saved document' })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
  });

  it('ignores a delayed response from the old working sequence after the new one settles', async () => {
    const old = deferred<Response>();
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/submissions/41/sequences') return response([SEQ_A, { ...SEQ_A, id: 22, sequenceNumber: '0001' }]);
      if (url.startsWith('/api/submissions/sequences/21/pathway-manifest')) return old.promise;
      if (url.startsWith('/api/submissions/sequences/22/pathway-manifest')) return response(manifest({ scope: { ...manifest().scope, sequenceId: 22 }, entries: [{ ...manifest().entries[1], label: 'Current sequence evidence' }] }));
      return fixtureRoute(url);
    });
    await openRequired();
    await waitForManifest(apiRequest.mock.calls);
    fireEvent.change(screen.getByRole('combobox', { name: 'Working sequence' }), { target: { value: '22' } });
    await screen.findByText('Current sequence evidence');
    await act(async () => { old.resolve(response(manifest())); await old.promise; });
    expect(screen.getByText('Current sequence evidence')).toBeTruthy();
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
  });

  it('discards a delayed body after the reactive program changes, without painting old source controls', async () => {
    const oldBody = deferred<unknown>();
    apiRequest.mockImplementation(async (_method: string, url: string) => url.startsWith('/api/submissions/sequences/21/pathway-manifest')
      ? { ok: true, status: 200, json: () => oldBody.promise } as unknown as Response
      : fixtureRoute(url));
    await openRequired();
    await waitForManifest(apiRequest.mock.calls);
    act(() => publishShellProject({ id: PROGRAM_B, title: 'Program B' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(c => c[1] === `/api/submissions?programId=${PROGRAM_B}`)).toBe(true));
    await act(async () => { oldBody.resolve(manifest()); await oldBody.promise; });
    expect(screen.queryByText('Retained protocol evidence')).toBeNull();
    expect(peekEditorTarget()).toBeNull();
  });
});
