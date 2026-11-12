// @vitest-environment jsdom
/**
 * The trial master file section (surfaces/VaultTrialMasterFile.tsx; P-74, P-75;
 * the founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere").
 *
 * The section is the one client of /api/etmf. It is a section of the Vault's
 * Required documents view since the eTMF's admission (2026-11-12); the cases
 * that need it inside the Vault are vaultTrialMasterFile.inVault.test.tsx, and
 * the `etmf` surface, the door to it, is etmfHostsTrialMasterFile.test.tsx.
 *
 * The transport is mocked by a small in-memory server (_vault-tmf-fixtures.ts).
 * What the retired screen showed and the section carries (the scope, the
 * figures, each record's code and zone, the package as a document, the question
 * to AnA) is vaultTmfRestored.test.tsx; upload-and-file is
 * vaultTmfUploadAndFile.test.tsx.
 *
 * What is pinned:
 *   - nothing is read until the view that holds the section is first opened;
 *   - which study: one is used, several are chosen between, none is said; a
 *     study chosen next never carries the last one's verdict or failed read;
 *   - the verdict in a sentence; not determined is never complete or incomplete;
 *     a read with nothing to check states no verdict;
 *   - the zones, each record by its catalog name, with the document it is filed
 *     against as the server names it;
 *   - a refusal said as itself, and a failed read never an empty trial master file;
 *   - filing: a version picked from this project's Vault, a reason of at least
 *     8 characters, and the reference the Vault returned; removing with a reason;
 *   - no write control for a role that may not write the Vault;
 *   - the inspection package: saved, or the failure with its reason; offered
 *     under the verdict and in the package document's bar, as one download.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), canWrite: true, saved: [] as Array<{ name: string; blob: Blob }> }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => H.canWrite }));
vi.mock('../download', async (original) => ({
  ...(await original<typeof import('../download')>()),
  downloadBlob: (name: string, blob: Blob) => { H.saved.push({ name, blob }); return true; },
}));

import { TMF_REFERENCE_MODEL, tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { VaultTrialMasterFile, tmfVerdict } from '../surfaces/VaultTrialMasterFile';
import { PID } from './_vault-surface-fixtures';
import {
  BASE, ESSENTIAL, EXTENSION, FAILED, NOT_LICENSED, NOT_RELEASED, NO_STUDY, PLAN_DOC, PROTOCOL_DOC, ROLE, ROUTE, STUDY,
  completenessOf, filing, filingsOf, json, packageResponse, packageSha, refusal, resetTmf, tmf, tmfApi, tmfBase,
} from './_vault-tmf-fixtures';

const calls = (method: string, match: (url: string) => boolean) =>
  H.apiRequest.mock.calls.filter(([m, u]) => m === method && match(String(u)));
const record = (code: string) => screen.getByTestId(`vault-tmf-record-${code}`);
const section = () => render(<VaultTrialMasterFile projectId={PID} active />);
const everyEssential = (ref: (i: number) => string) => ESSENTIAL.map((code, i) => ({ ...filing(code, ref(i), 1), id: `row-${i}` }));

beforeEach(() => {
  H.canWrite = true; H.saved = [];
  resetTmf();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? json({}));
});
afterEach(cleanup);

describe('which study the trial master file is of', () => {
  it('reads nothing until the view that holds it is first on screen', async () => {
    const view = render(<VaultTrialMasterFile projectId={PID} active={false} />);
    expect(screen.getByRole('heading', { name: 'Trial master file' })).toBeTruthy();
    expect(H.apiRequest).not.toHaveBeenCalled();
    view.rerender(<VaultTrialMasterFile projectId={PID} active />);
    await screen.findByTestId('vault-tmf-verdict');
    expect(calls('GET', (u) => u === `/api/study-design?program_id=${PID}`)).toHaveLength(1);
    // Kept once read: leaving the view does not drop it.
    view.rerender(<VaultTrialMasterFile projectId={PID} active={false} />);
    expect(screen.getByTestId('vault-tmf-verdict')).toBeTruthy();
  });

  it('uses the project’s one study and says which', async () => {
    section();
    await screen.findByTestId('vault-tmf-verdict');
    expect(screen.getByTestId('vault-tmf').textContent).toContain('Of BX-204 in plaque psoriasis · Phase 2');
    expect(screen.queryByTestId('vault-tmf-study')).toBeNull();
    expect(calls('GET', (u) => u === `${BASE}/completeness?scope=essential`)).toHaveLength(1);
  });

  it('asks which study when the project has several, and reads none until one is chosen', async () => {
    tmf.studies = [STUDY, EXTENSION];
    section();
    const chooser = await screen.findByTestId('vault-tmf-study');
    expect(screen.getByTestId('vault-tmf-choose').textContent).toMatch(/Choose the study to see its trial master file/);
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
    expect(calls('GET', (u) => u.startsWith('/api/etmf'))).toHaveLength(0);
    fireEvent.change(chooser, { target: { value: STUDY.studyId } });
    await screen.findByTestId('vault-tmf-verdict');
    expect(screen.getByTestId('vault-tmf').textContent).toContain('Of BX-204 in plaque psoriasis · Phase 2');
    expect(calls('GET', (u) => u.startsWith(tmfBase(EXTENSION.studyId)))).toHaveLength(0);
  });

  /* The retired screen named the trial by a typed id and, for the length of a read, said the last trial's
     "complete", or its failed read, of the trial just named (etmfHonesty.test.tsx, deleted with it). */
  it('a study chosen next carries neither the last study’s verdict nor its failed read', async () => {
    tmf.studies = [STUDY, EXTENSION];
    tmf.filings[STUDY.studyId] = everyEssential(() => `vault://${PROTOCOL_DOC}`);
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = (studyId) => (studyId === EXTENSION.studyId ? pending : json(completenessOf(studyId)));
    section();
    const chooser = await screen.findByTestId('vault-tmf-study');
    chooser.focus();
    fireEvent.change(chooser, { target: { value: STUDY.studyId } });
    expect((await screen.findByTestId('vault-tmf-verdict')).getAttribute('data-verdict')).toBe('complete');
    // The chooser is the same control throughout: choosing does not take the keyboard's place away.
    expect(screen.getByTestId('vault-tmf-study')).toBe(chooser);
    expect(document.activeElement).toBe(chooser);

    fireEvent.change(chooser, { target: { value: EXTENSION.studyId } });
    const tmfSection = screen.getByTestId('vault-tmf');
    expect(tmfSection.textContent).toContain('Of BX-204 long-term extension · Phase 3');
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
    expect(tmfSection.textContent).not.toMatch(/Every essential record is filed/);
    expect(tmfSection.textContent).toContain('Reading the trial master file…');
    await act(async () => { answer(json(completenessOf(EXTENSION.studyId))); });
    expect((await screen.findByTestId('vault-tmf-verdict')).textContent).toMatch(new RegExp(`^0 of ${ESSENTIAL.length} essential records are filed\\.`));

    // And a failed read stays with the study it failed for.
    tmf.refuseWith.completeness = (studyId) => { if (studyId === STUDY.studyId) throw refusal(500, FAILED); return new Promise<Response>(() => {}); };
    fireEvent.change(chooser, { target: { value: STUDY.studyId } });
    await screen.findByTestId('vault-tmf-error');
    fireEvent.change(chooser, { target: { value: EXTENSION.studyId } });
    expect(screen.queryByTestId('vault-tmf-error')).toBeNull();
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
  });

  it('says plainly that a project with no study has no trial master file, and where a study is created', async () => {
    tmf.studies = [];
    section();
    const none = await screen.findByTestId('vault-tmf-no-study');
    expect(none.textContent).toMatch(/This project has no study yet, so it has no trial master file\./);
    expect(none.textContent).toMatch(/created in Protocol design/);
    expect(calls('GET', (u) => u.startsWith('/api/etmf'))).toHaveLength(0);
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
  });

  it('a study list that is not a list is a failed read, never "no study"', async () => {
    tmf.refuseWith.studies = () => json({});
    section();
    const error = await screen.findByTestId('vault-tmf-error');
    expect(error.textContent).toMatch(/This project’s studies could not be read\. This does not mean the project has no study\./);
    expect(screen.queryByTestId('vault-tmf-no-study')).toBeNull();
    tmf.refuseWith = {};
    fireEvent.click(within(error).getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('vault-tmf-verdict');
  });
});

describe('whether the essential records are all filed', () => {
  it('says what is filed and what is missing in a sentence, then each zone by the record’s name', async () => {
    tmf.filings[STUDY.studyId] = [filing('protocol', `vault://${PROTOCOL_DOC}`, 1), filing('tmf_plan', null, 2)];
    section();
    const verdict = await screen.findByTestId('vault-tmf-verdict');
    expect(verdict.getAttribute('data-verdict')).toBe('incomplete');
    expect(verdict.textContent).toBe(
      `1 of ${ESSENTIAL.length} essential records are filed. ${ESSENTIAL.length - 1} are missing. 1 of them is filed, but not against a Vault document that exists now.`,
    );
    // The eleven zones of the catalog, by number and name, each with its count.
    expect(screen.getAllByTestId(/^vault-tmf-zone-/)).toHaveLength(11);
    for (const z of TMF_REFERENCE_MODEL) {
      expect(screen.getByTestId(`vault-tmf-zone-${z.number}`).textContent).toContain(`Zone ${z.number}${z.name}`);
    }
    expect(screen.getByTestId('vault-tmf-zone-2').textContent).toContain('1 of 4 filed');
    // Every essential record, named by its catalog name.
    for (const code of ESSENTIAL) expect(within(record(code)).getByTitle(tmfArtifactName(code)).textContent).toBe(tmfArtifactName(code));
    expect(record('protocol').getAttribute('data-state')).toBe('filed');
    await waitFor(() => expect(record('protocol').textContent).toContain('Filed against “Protocol BX-204-201”, version 1.0 on 2026-11-02.'));
    expect(record('monitoring_plan').getAttribute('data-state')).toBe('missing');
    expect(record('monitoring_plan').textContent).toContain('Not filed.');
    // A filing with no document is said, and is not counted as filed.
    expect(record('tmf_plan').getAttribute('data-state')).toBe('no_document');
    expect(record('tmf_plan').textContent).toContain('Filed with no document, so it does not count as filed.');
    // Records that are not essential are not in this list.
    expect(screen.queryByTestId('vault-tmf-record-recruitment_plan')).toBeNull();
    // What "filed" rests on is stated, in the open: not behind a closed disclosure (P-122).
    const basis = screen.getByTestId('vault-tmf-basis');
    expect(basis.textContent).toMatch(/A record counts as filed only when its filing names a Vault document that existed when this was read\./);
    expect(basis.closest('details')).toBeNull();
  });

  it('names the document a record is filed against as the server names it', async () => {
    tmf.vaultDocs.set(PLAN_DOC, { title: 'Monitoring plan', version: '1', current: false });
    tmf.vaultDocs.set('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { title: null, version: null, current: true });
    tmf.filings[STUDY.studyId] = [
      filing('protocol', 'vault://99999999-9999-4999-8999-999999999999', 1),
      filing('monitoring_plan', `vault://${PLAN_DOC}`, 2),
      filing('sap', `vault://${PROTOCOL_DOC}`, 3),
      filing('tmf_plan', 'vault://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4),
    ];
    // The server names no document for one filing it counts as filed.
    tmf.refuseWith.filings = () => json(filingsOf().map((f) => (f.artifactCode === 'sap' ? { ...f, document: null } : f)));
    const view = section();
    await screen.findByTestId('vault-tmf-verdict');
    expect(record('protocol').getAttribute('data-state')).toBe('unresolved');
    expect(record('protocol').textContent).toContain('Filed against a Vault document that no longer exists, so it does not count as filed.');
    // Title and version; a version a later one has replaced is said to be an earlier one.
    await waitFor(() => expect(record('monitoring_plan').textContent).toContain('Filed against “Monitoring plan”, version 1, an earlier version on 2026-11-02.'));
    expect(record('tmf_plan').textContent).toContain('Filed against a Vault document with no title on 2026-11-02.');
    // The reference's id only where the server names no document.
    expect(record('sap').textContent).toContain('Filed against Vault document 33333333… on 2026-11-02.');
    // A host that holds the project's Vault list can name it (the Vault, once the section is in it).
    view.rerender(<VaultTrialMasterFile projectId={PID} active documents={[{ docId: PROTOCOL_DOC, title: 'Protocol, as the Vault lists it' }]} />);
    expect(record('sap').textContent).toContain('Filed against “Protocol, as the Vault lists it” on 2026-11-02.');
  });

  it('says complete only when every essential record is filed against a document', async () => {
    tmf.filings[STUDY.studyId] = everyEssential(() => `vault://${PROTOCOL_DOC}`);
    section();
    const verdict = await screen.findByTestId('vault-tmf-verdict');
    expect(verdict.getAttribute('data-verdict')).toBe('complete');
    expect(verdict.textContent).toBe(`Every essential record is filed: all ${ESSENTIAL.length}, each against a Vault document that exists now.`);
  });

  it('says not determined when the server could not determine it, never complete and never incomplete', async () => {
    // Every essential record is filed; two against a reference outside the Vault, which the server cannot check.
    tmf.filings[STUDY.studyId] = everyEssential((i) => (i < 2 ? 'https://archive.example.org/tmf/box-14' : `vault://${PROTOCOL_DOC}`));
    expect(completenessOf().ready).toBeNull();
    section();
    const verdict = await screen.findByTestId('vault-tmf-verdict');
    expect(verdict.getAttribute('data-verdict')).toBe('undetermined');
    expect(verdict.textContent).toMatch(/^Not determined\. /);
    expect(verdict.textContent).toMatch(/so this is neither complete nor incomplete\.$/);
    expect(verdict.textContent).not.toMatch(/Every essential record is filed|are missing/);
    await waitFor(() => expect(record(ESSENTIAL[0]).textContent)
      .toContain('Filed against a reference outside the Vault (https://archive.example.org/tmf/box-14), which cannot be checked here.'));
  });

  it('states no verdict over a read that checked nothing, even one the server called ready', async () => {
    const nothing = { ...completenessOf(), ready: true, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0, totalNotApplicable: 0 } };
    expect(tmfVerdict(nothing)).toBe('not-assessed');
    // And an answer that calls itself ready while listing a missing record is not complete.
    expect(tmfVerdict({ ...completenessOf(), ready: true })).toBe('incomplete');
    tmf.refuseWith.completeness = () => json(nothing);
    section();
    const verdict = await screen.findByTestId('vault-tmf-verdict');
    expect(verdict.getAttribute('data-verdict')).toBe('not-assessed');
    expect(verdict.textContent).toMatch(/^No verdict\./);
  });

  it('an answer about another study is not shown as this study’s', async () => {
    tmf.refuseWith.completeness = () => json(completenessOf(EXTENSION.studyId));
    section();
    expect((await screen.findByTestId('vault-tmf-error')).textContent).toMatch(/The trial master file could not be read\./);
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
  });

  it('a completeness answer with no stated verdict is a failed read', async () => {
    tmf.refuseWith.completeness = () => json({ ...completenessOf(), ready: undefined });
    section();
    expect((await screen.findByTestId('vault-tmf-error')).textContent).toMatch(/The trial master file could not be read\. This is not an empty trial master file\./);
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
  });
});

describe('a refusal is said as itself, and a failed read is never an empty trial master file', () => {
  it.each([
    ['not in this release (403 LAUNCH_SCOPE)', 403, NOT_RELEASED, 'This part of the product is not in this release, so the trial master file was not read.'],
    ['not enabled for the organization (403 MODULE_NOT_LICENSED)', 403, NOT_LICENSED, 'This feature is not enabled for your organization, so the trial master file was not read.'],
    ['the person’s role (403, no code)', 403, ROLE, 'Your role cannot do this, so the trial master file was not read.'],
    ['not found (404 STUDY_NOT_FOUND)', 404, NO_STUDY, 'This study was not found in your organization, so the trial master file was not read.'],
  ])('%s', async (_name, status, payload, words) => {
    tmf.refuseWith.completeness = () => { throw refusal(status, payload); };
    section();
    const error = await screen.findByTestId('vault-tmf-error');
    expect(error.textContent?.trim()).toBe(words);
    // A refusal is an answer: trying again cannot change it, so it is not offered.
    expect(within(error).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
    expect(screen.queryByTestId('vault-tmf-zone-1')).toBeNull();
    expect(screen.queryByTestId('vault-tmf-download')).toBeNull();
  });

  it('a failed read says so, offers another try, and shows no record as missing', async () => {
    tmf.refuseWith.completeness = () => { throw refusal(500, FAILED); };
    section();
    const error = await screen.findByTestId('vault-tmf-error');
    expect(error.textContent).toMatch(/The trial master file could not be read\. This is not an empty trial master file\./);
    expect(screen.queryByText('Not filed.')).toBeNull();
    tmf.refuseWith = {};
    fireEvent.click(within(error).getByRole('button', { name: 'Try again' }));
    expect((await screen.findByTestId('vault-tmf-verdict')).getAttribute('data-verdict')).toBe('incomplete');
  });

  it('when only the list of filings cannot be read, the verdict stands and no document or removal is shown', async () => {
    tmf.refuseWith.filings = () => { throw refusal(500, FAILED); };
    section();
    await screen.findByTestId('vault-tmf-verdict');
    const error = await screen.findByTestId('vault-tmf-filings-error');
    expect(error.textContent).toMatch(/The list of filings could not be read\. The document each record is filed against is not shown, and a filing cannot be removed here\./);
    expect(record('protocol').textContent).toContain('Filed against a Vault document.');
    expect(screen.queryByRole('button', { name: /^Remove the filing of/ })).toBeNull();
  });
});

describe('filing a document against a missing record', () => {
  const openForm = async () => {
    section();
    await screen.findByTestId('vault-tmf-verdict');
    const open = await screen.findByRole('button', { name: 'File a document as Monitoring Plan' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    return screen.getByTestId('vault-tmf-file-monitoring_plan');
  };
  const pick = async (form: HTMLElement) => {
    fireEvent.change(within(form).getByLabelText('Search this project’s Vault for the document to file as Monitoring Plan'), { target: { value: 'plan' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Search Vault' }));
    fireEvent.click(await within(form).findByRole('button', { name: 'Select document' }));
  };
  const reason = (form: HTMLElement, text: string) =>
    fireEvent.change(within(form).getByLabelText(/^Reason for filing it\./), { target: { value: text } });
  const submit = (form: HTMLElement) => within(form).getByRole('button', { name: 'File as Monitoring Plan' }) as HTMLButtonElement;
  const fileIt = async () => {
    const form = await openForm();
    await pick(form);
    reason(form, 'Signed monitoring plan, version 2');
    fireEvent.click(submit(form));
    return form;
  };

  it('files the version picked from this project’s Vault, with the reason, against the reference the Vault gave', async () => {
    const form = await openForm();
    // Nothing can be filed until a document is chosen and a reason of at least 8 characters is given.
    expect(submit(form).disabled).toBe(true);
    reason(form, 'Signed monitoring plan, version 2');
    expect(submit(form).disabled).toBe(true);
    await pick(form);
    expect(calls('GET', (u) => u === `/api/c2c/project-vault/${PID}/search?q=plan&limit=25`)).toHaveLength(1);
    expect(form.textContent).toContain('Document: Monitoring plan, version 2.');
    reason(form, 'short');
    expect(submit(form).disabled).toBe(true);
    reason(form, '  Signed monitoring plan, version 2  ');
    expect(submit(form).disabled).toBe(false);
    fireEvent.click(submit(form));

    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.textContent).toBe('Monitoring Plan is filed against “Monitoring plan”, version 2. Your reason is recorded with the filing.');
    expect(note.getAttribute('role')).toBe('status');
    expect(calls('POST', () => true)).toEqual([
      ['POST', `${BASE}/artifacts`, { artifactCode: 'monitoring_plan', documentRef: `vault://${PLAN_DOC}`, reason: 'Signed monitoring plan, version 2' }],
    ]);
    // What is shown next is what the server holds: both reads are made again.
    await waitFor(() => expect(record('monitoring_plan').getAttribute('data-state')).toBe('filed'));
    await waitFor(() => expect(record('monitoring_plan').textContent).toContain('Filed against “Monitoring plan”, version 2'));
    expect(screen.getByTestId('vault-tmf-verdict').textContent).toMatch(/^2 of /);
    expect(calls('GET', (u) => u === `${BASE}/completeness?scope=essential`)).toHaveLength(2);
    expect(calls('GET', (u) => u === `${BASE}/artifacts`)).toHaveLength(2);
    expect(screen.queryByTestId('vault-tmf-file-monitoring_plan')).toBeNull();
  });

  it('a refused filing says the server’s reason, files nothing and keeps the form', async () => {
    tmf.refuseWith.file = () => { throw refusal(409, ROUTE('DOCUMENT_NOT_IN_PROJECT', 'That Vault document is not held in this study’s project, so the artifact cannot be recorded as filed against it.')); };
    const form = await fileIt();
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toBe('Nothing was filed. That Vault document is not held in this study’s project, so the artifact cannot be recorded as filed against it.');
    expect(record('monitoring_plan').getAttribute('data-state')).toBe('missing');
    expect(screen.queryByTestId('vault-tmf-note')).toBeNull();
  });

  it.each([
    ['not in this release', 403, NOT_RELEASED, 'Nothing was filed. Not in this release.'],
    ['not enabled for the organization', 403, NOT_LICENSED, 'Nothing was filed. Not enabled for your organization.'],
    ['the person’s role', 403, ROLE, 'Nothing was filed. Your role cannot do this.'],
    ['the study not found', 404, NO_STUDY, 'Nothing was filed. This study was not found in your organization.'],
  ])('a filing refused as %s is said as that refusal', async (_name, status, payload, words) => {
    tmf.refuseWith.file = () => { throw refusal(status, payload); };
    const form = await fileIt();
    expect((await within(form).findByRole('alert')).textContent).toBe(words);
  });

  it('keeps what was filed on screen when the read after it fails', async () => {
    let reads = 0;
    tmf.refuseWith.completeness = (studyId) => { reads += 1; if (reads > 1) throw refusal(500, FAILED); return json(completenessOf(studyId)); };
    await fileIt();
    expect((await screen.findByTestId('vault-tmf-error')).textContent).toMatch(/The trial master file could not be read\./);
    expect(screen.getByTestId('vault-tmf-note').textContent).toMatch(/^Monitoring Plan is filed against “Monitoring plan”/);
  });

  it('when the server does not confirm the filing, it is not called filed or refused, and the list is read again', async () => {
    tmf.refuseWith.file = () => { throw new TypeError('Failed to fetch'); };
    await fileIt();
    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toMatch(/^The server did not confirm the filing, so it is not known whether it was recorded\./);
    await waitFor(() => expect(calls('GET', (u) => u === `${BASE}/completeness?scope=essential`)).toHaveLength(2));
  });
});

describe('removing a filing', () => {
  const openForm = async () => {
    section();
    await screen.findByTestId('vault-tmf-verdict');
    const open = await screen.findByRole('button', { name: 'Remove the filing of Protocol and amendments' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    return screen.getByTestId('vault-tmf-remove-protocol');
  };

  it('removes it with a reason of at least 8 characters, and reads the trial master file again', async () => {
    const form = await openForm();
    const remove = within(form).getByRole('button', { name: 'Remove the filing' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/^Reason for removing the filing of Protocol and amendments\./), { target: { value: 'Filed against the wrong study' } });
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    const note = await screen.findByTestId('vault-tmf-note');
    expect(note.textContent).toMatch(/^The filing of Protocol and amendments was removed from this study’s trial master file\./);
    expect(calls('DELETE', () => true)).toEqual([['DELETE', '/api/etmf/artifacts/f1f1f1f1-0000-4000-8000-000000000001', { reason: 'Filed against the wrong study' }]]);
    await waitFor(() => expect(record('protocol').getAttribute('data-state')).toBe('missing'));
    expect(screen.getByTestId('vault-tmf-verdict').textContent).toMatch(/^0 of /);
  });

  it('a refused removal says why and removes nothing', async () => {
    tmf.refuseWith.remove = () => { throw refusal(404, ROUTE('NOT_FOUND', 'TMF artifact not found.')); };
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/^Reason for removing/), { target: { value: 'Filed against the wrong study' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Remove the filing' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Nothing was removed. TMF artifact not found.');
    expect(record('protocol').getAttribute('data-state')).toBe('filed');
  });
});

describe('a role that may not write the Vault', () => {
  it('reads the trial master file and is offered no filing or removal', async () => {
    H.canWrite = false;
    section();
    await screen.findByTestId('vault-tmf-verdict');
    await waitFor(() => expect(record('protocol').textContent).toContain('Protocol BX-204-201'));
    expect(screen.queryByRole('button', { name: /^File a document/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByTestId('vault-tmf-view-only').textContent).toMatch(/^View only\./);
    expect(screen.getByTestId('vault-tmf-download')).toBeTruthy();
  });
});

describe('the inspection package', () => {
  const download = async () => {
    section();
    fireEvent.click(await screen.findByTestId('vault-tmf-download'));
    // Said beside the button, in the package's own part of the section.
    return within(screen.getByTestId('vault-tmf-package')).findByTestId('vault-tmf-package-note');
  };

  it('downloads it for the study and says what it is, and its SHA-256 checked on receipt', async () => {
    const note = await download();
    expect(calls('GET', (u) => u === `${BASE}/inspection-package?scope=essential`)).toHaveLength(1);
    expect(H.saved.map((s) => s.name)).toEqual(['tmf-inspection-BX-204-201.zip']);
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent?.trim()).toBe(
      'Inspection package saved (essential records): the index of filings and the completeness record, not the documents themselves. ' +
      `It says essential records are still missing. Its SHA-256, checked on receipt: ${packageSha}.`,
    );
  });

  /* The retired screen offered the package from its lead and from the document's bar. The section has had it under
     the verdict since it was built; it stays there, above the records, and is one download with the bar's. */
  it('is also offered under the verdict, above the records, and its outcome is said where it was asked for', async () => {
    let answer!: (r: Response) => void;
    tmf.refuseWith.package = () => new Promise<Response>((resolve) => { answer = resolve; });
    section();
    const top = await screen.findByTestId('vault-tmf-download-top') as HTMLButtonElement;
    const inBar = screen.getByTestId('vault-tmf-download') as HTMLButtonElement;
    expect(top.compareDocumentPosition(screen.getByTestId('vault-tmf-zone-1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(top.closest('details')).toBeNull();
    fireEvent.click(top);
    // One download: both buttons wait on it, and it is asked for once.
    await waitFor(() => expect(top.textContent).toContain('Building the package…'));
    expect([top.disabled, inBar.disabled, inBar.textContent?.includes('Building the package…')]).toEqual([true, true, true]);
    await act(async () => { answer(packageResponse(packageSha)); });
    const note = await screen.findByTestId('vault-tmf-download-note');
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toContain(`Its SHA-256, checked on receipt: ${packageSha}.`);
    expect(note.compareDocumentPosition(screen.getByTestId('vault-tmf-zone-1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Said once, beside the button that asked: not again in the document below.
    expect(screen.queryByTestId('vault-tmf-package-note')).toBeNull();
    expect(calls('GET', (u) => u.includes('/inspection-package'))).toHaveLength(1);
    expect(H.saved).toHaveLength(1);
    // And asked for from the bar, it is said in the document, and no longer above.
    tmf.refuseWith = {};
    fireEvent.click(inBar);
    await screen.findByTestId('vault-tmf-package-note');
    expect(screen.queryByTestId('vault-tmf-download-note')).toBeNull();
  });

  /* The retired screen toasted `X-TMF-Ready: undetermined` as "gaps remain" until 2026-10-15
     (etmfReadinessNotDeterminedIsNotNotReady.test.tsx, deleted with it). */
  it('says a package the server marked not determined as not determined, never as missing records', async () => {
    tmf.refuseWith.package = () => packageResponse(packageSha, 'undetermined');
    const note = await download();
    expect(note.textContent).toContain('It says the verdict is not determined.');
    expect(note.textContent).not.toMatch(/still missing|every essential record is filed/);
  });

  it('does not save a file that does not match the SHA-256 the server stated', async () => {
    tmf.refuseWith.package = () => packageResponse('b'.repeat(64));
    const note = await download();
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toMatch(/^The inspection package was not downloaded\. The file received does not match the SHA-256/);
    expect(H.saved).toHaveLength(0);
  });

  /* The retired screen built a report in the browser when the ZIP failed: an export with no record. The server's
     download is recorded, and refused when its record cannot be written. The failure is said; nothing is saved. */
  const UNRECORDED = ROUTE('UNAUDITED_EXPORT_REFUSED', 'The inspection package was not delivered because its record could not be written. Nothing was sent. Try again.');
  it.each([
    ['the person’s role', 403, ROLE, 'The inspection package was not downloaded. Your role cannot do this.', false],
    ['not in this release', 403, NOT_RELEASED, 'The inspection package was not downloaded. Not in this release.', false],
    ['a server error', 500, FAILED, 'The inspection package was not downloaded. eTMF request failed.', true],
    ['a download the server could not record', 503, UNRECORDED, `The inspection package was not downloaded. ${UNRECORDED.message}`, true],
  ])('a failure (%s) is said with its reason, and nothing is saved', async (_name, status, payload, words, retry) => {
    tmf.refuseWith.package = () => { throw refusal(status, payload); };
    const note = await download();
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent?.trim()).toBe(retry ? `${words} Try again` : words);
    // Another try where one can change the outcome; a refusal is an answer, so none is offered after it.
    expect(within(note).queryAllByRole('button', { name: 'Try again' })).toHaveLength(retry ? 1 : 0);
    expect(H.saved).toHaveLength(0);
    if (!retry) return;
    tmf.refuseWith = {};
    fireEvent.click(within(note).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(H.saved).toHaveLength(1));
    expect(screen.getByTestId('vault-tmf-package-note').getAttribute('role')).toBe('status');
  });
});
