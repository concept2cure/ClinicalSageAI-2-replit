// @vitest-environment jsdom
/**
 * What the retired eTMF screen showed, carried in the trial master file section
 * (surfaces/VaultTrialMasterFile.tsx and its parts; founder decision P-122,
 * 2026-11-10: nothing a screen showed is removed, hidden or closed away without
 * a founder decision).
 *
 * What is pinned:
 *   - the scope: essential records or all records, in the heading row. The
 *     verdict, the figures, the records, the package and the download follow
 *     it, and the previous scope's answer is never shown under the new label;
 *   - the three figures beside the verdict (zones complete, records filed,
 *     records open with how many are filed without a verified document), and
 *     the line that says timeliness and QC are not assessed;
 *   - each record's zone and artifact code on its row;
 *   - the inspection package as a document: cover, figures and its four parts,
 *     open beneath the records, stating the section's one verdict;
 *   - the question to AnA.
 * Upload-and-file is vaultTmfUploadAndFile.test.tsx. The transport is the small
 * in-memory server of _vault-tmf-fixtures.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), canWrite: true, saved: [] as string[] }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: H.apiRequest }));
vi.mock('../surfaces/VaultViewOnly', async (original) => ({ ...(await original<typeof import('../surfaces/VaultViewOnly')>()), useVaultCanWrite: () => H.canWrite }));
vi.mock('../download', async (original) => ({
  ...(await original<typeof import('../download')>()),
  downloadBlob: (name: string) => { H.saved.push(name); return true; },
}));

import { TMF_REFERENCE_MODEL } from '@shared/constants/domain/tmf-reference-model';
import { VaultTrialMasterFile } from '../surfaces/VaultTrialMasterFile';
import { PID } from './_vault-surface-fixtures';
import {
  BASE, ESSENTIAL, EXTENSION, FAILED, NOT_RELEASED, PLAN_DOC, PROTOCOL_DOC, STUDY,
  completenessOf, filing, json, packageSha, refusal, resetTmf, tmf, tmfApi, tmfBase,
} from './_vault-tmf-fixtures';

const ALL = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => a.code));
const calls = (method: string, match: (url: string) => boolean) =>
  H.apiRequest.mock.calls.filter(([m, u]) => m === method && match(String(u)));
const section = (onAsk?: (prompt: string) => void) => render(<VaultTrialMasterFile projectId={PID} active onAsk={onAsk} />);
const verdict = () => screen.findByTestId('vault-tmf-verdict');
const scopeButton = (name: string) => within(screen.getByTestId('vault-tmf-scope')).getByRole('button', { name }) as HTMLButtonElement;
const everyEssential = (ref: (i: number) => string) => ESSENTIAL.map((code, i) => ({ ...filing(code, ref(i), 1), id: `row-${i}` }));
const text = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, ' ').trim();
/** Nothing of an assessment is on screen: no verdict, no figure, no record, no package. */
function nothingAssessed() {
  for (const id of ['vault-tmf-verdict', 'vault-tmf-figures', 'vault-tmf-package', 'vault-tmf-zone-1', 'vault-tmf-download-top']) {
    expect(screen.queryByTestId(id)).toBeNull();
  }
}

beforeEach(() => {
  H.canWrite = true; H.saved = [];
  resetTmf();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => (await tmfApi(method, url, body)) ?? json({}));
});
afterEach(cleanup);

describe('which records are checked: the essential ones, or all', () => {
  it('offers the two scopes in the heading row, essential first, and everything follows the one chosen', async () => {
    section();
    expect((await verdict()).textContent).toBe(`1 of ${ESSENTIAL.length} essential records are filed. ${ESSENTIAL.length - 1} are missing.`);
    const group = screen.getByRole('group', { name: 'Records checked' });
    expect(group.closest('.pj-sec-h')).not.toBeNull();
    expect(within(group).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['Essential records', 'true'], ['All records', 'false']]);
    expect(screen.queryByTestId('vault-tmf-record-recruitment_plan')).toBeNull();

    fireEvent.click(scopeButton('All records'));
    await waitFor(() => expect(screen.getByTestId('vault-tmf-verdict').textContent).toBe(`1 of ${ALL.length} records are filed. ${ALL.length - 1} are missing.`));
    expect(scopeButton('All records').getAttribute('aria-pressed')).toBe('true');
    expect(scopeButton('Essential records').getAttribute('aria-pressed')).toBe('false');
    expect(calls('GET', (u) => u === `${BASE}/completeness?scope=all`)).toHaveLength(1);
    // The figures, the records, what is said about the scope and the package are the chosen scope's.
    expect(text('vault-tmf-figures')).toContain(`Records filed 1 of ${ALL.length}`);
    expect(screen.getByTestId('vault-tmf-record-recruitment_plan').getAttribute('data-state')).toBe('missing');
    expect(screen.getByTestId('vault-tmf-zone-2').textContent).toContain('1 of 5 filed');
    expect(text('vault-tmf-basis')).toMatch(/^All records are every record of the DIA TMF Reference Model filed here, essential or not\./);
    const pkg = screen.getByTestId('vault-tmf-package');
    expect(pkg.getAttribute('aria-label')).toBe('Inspection package, all records');
    expect(within(pkg).getByTestId('vault-tmf-package-cover').textContent).toContain('Scope: all records');
    expect(within(pkg).getByTestId('vault-tmf-package-figures').textContent).toBe(screen.getByTestId('vault-tmf-figures').textContent);
  });

  /* The retired screen showed the last scope's "complete" under the scope just chosen for the length of a read,
     and correlated the payload by hand to stop it (its lines 141-176). Here the scope is part of the read. */
  it('while the scope just chosen is being read, nothing of the previous scope is shown under it', async () => {
    tmf.filings[STUDY.studyId] = everyEssential(() => `vault://${PROTOCOL_DOC}`);
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = (studyId, scope) => (scope === 'all' ? pending : json(completenessOf(studyId, scope)));
    section();
    expect((await verdict()).getAttribute('data-verdict')).toBe('complete');
    fireEvent.click(scopeButton('All records'));
    // In the same commit: the control says "All records" and no figure of the essential scope is under it.
    expect(scopeButton('All records').getAttribute('aria-pressed')).toBe('true');
    nothingAssessed();
    expect(screen.getByTestId('vault-tmf').textContent).not.toMatch(/Every essential record is filed|Inspection-ready/);
    expect(screen.getByTestId('vault-tmf-reading').textContent).toBe('Reading the trial master file…');
    await act(async () => { answer(json(completenessOf(STUDY.studyId, 'all'))); });
    expect((await verdict()).getAttribute('data-verdict')).toBe('incomplete');
    expect(screen.getByTestId('vault-tmf-verdict').textContent).toMatch(new RegExp(`^${ESSENTIAL.length} of ${ALL.length} records are filed\\.`));
  });

  it('an answer for another scope is a failed read, never figures under the scope chosen', async () => {
    tmf.refuseWith.completeness = (studyId) => json(completenessOf(studyId, 'essential'));
    section();
    await verdict();
    fireEvent.click(scopeButton('All records'));
    expect((await screen.findByTestId('vault-tmf-error')).textContent).toMatch(/The trial master file could not be read\. This is not an empty trial master file\./);
    nothingAssessed();
  });

  it.each([
    ['refused', 403, NOT_RELEASED, /This part of the product is not in this release, so the trial master file was not read\./, false],
    ['failed', 500, FAILED, /The trial master file could not be read\. This is not an empty trial master file\./, true],
  ])('a %s read of the scope chosen is said as that, and the other scope is read again when asked', async (_name, status, payload, words, retry) => {
    tmf.refuseWith.completeness = (studyId, scope) => { if (scope === 'all') throw refusal(status, payload); return json(completenessOf(studyId, scope)); };
    section();
    await verdict();
    fireEvent.click(scopeButton('All records'));
    const error = await screen.findByTestId('vault-tmf-error');
    expect(error.textContent).toMatch(words);
    expect(within(error).queryAllByRole('button', { name: 'Try again' })).toHaveLength(retry ? 1 : 0);
    nothingAssessed();
    expect(scopeButton('All records').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(scopeButton('Essential records'));
    expect((await verdict()).textContent).toMatch(/essential records are filed/);
    expect(screen.queryByTestId('vault-tmf-error')).toBeNull();
  });

  it('the download is of the scope on screen, and says which', async () => {
    section();
    await verdict();
    fireEvent.click(scopeButton('All records'));
    await waitFor(() => expect(screen.getByTestId('vault-tmf-verdict').textContent).toMatch(/ records are filed/));
    fireEvent.click(screen.getByTestId('vault-tmf-download'));
    const note = await screen.findByTestId('vault-tmf-package-note');
    expect(calls('GET', (u) => u.includes('/inspection-package')).map(([, u]) => u)).toEqual([`${BASE}/inspection-package?scope=all`]);
    expect(note.textContent?.trim()).toBe(
      'Inspection package saved (all records): the index of filings and the completeness record, not the documents themselves. ' +
      `It says records are still missing. Its SHA-256, checked on receipt: ${packageSha}.`,
    );
    expect(H.saved).toEqual(['tmf-inspection-BX-204-201.zip']);
  });

});

describe('the scope and the study', () => {
  it('the scope is offered once a study is on screen, and stays as chosen when another study is', async () => {
    tmf.studies = [STUDY, EXTENSION];
    section();
    const chooser = await screen.findByTestId('vault-tmf-study');
    expect(screen.queryByTestId('vault-tmf-scope')).toBeNull();
    chooser.focus();
    fireEvent.change(chooser, { target: { value: STUDY.studyId } });
    await verdict();
    // The chooser is the same control, with the keyboard still on it, when the scope appears beside it.
    expect(screen.getByTestId('vault-tmf-study')).toBe(chooser);
    expect(document.activeElement).toBe(chooser);
    fireEvent.click(scopeButton('All records'));
    await waitFor(() => expect(screen.getByTestId('vault-tmf-verdict').textContent).toMatch(new RegExp(`of ${ALL.length} records`)));
    fireEvent.change(chooser, { target: { value: EXTENSION.studyId } });
    await waitFor(() => expect(screen.getByTestId('vault-tmf-verdict').textContent).toBe(`0 of ${ALL.length} records are filed. ${ALL.length} are missing.`));
    expect(scopeButton('All records').getAttribute('aria-pressed')).toBe('true');
    expect(calls('GET', (u) => u.startsWith(`${tmfBase(EXTENSION.studyId)}/completeness`)).map(([, u]) => u)).toEqual([`${tmfBase(EXTENSION.studyId)}/completeness?scope=all`]);
  });

  it('the scope is not offered where there is no study to check', async () => {
    tmf.studies = [];
    section();
    await screen.findByTestId('vault-tmf-no-study');
    expect(screen.queryByTestId('vault-tmf-scope')).toBeNull();
  });
});

describe('the three figures beside the verdict', () => {
  it('zones complete, records filed and records open, with how many are filed without a verified document', async () => {
    tmf.filings[STUDY.studyId] = [filing('protocol', `vault://${PROTOCOL_DOC}`, 1), filing('tmf_plan', null, 2), filing('monitoring_plan', `vault://${PLAN_DOC}`, 3)];
    section();
    await verdict();
    expect(text('vault-tmf-figures')).toBe(
      `Zones complete 0 of 11 · Essential records filed 2 of ${ESSENTIAL.length} · Open records ${ESSENTIAL.length - 2}, 1 filed with no verified document`,
    );
    // Shown by default, in the open, as plain figures: not a tile and not behind a disclosure.
    const figures = screen.getByTestId('vault-tmf-figures');
    expect(figures.className).toBe('vd-dr-stages');
    expect(figures.closest('details')).toBeNull();
    expect(screen.getByTestId('vault-tmf-verdict').compareDocumentPosition(figures) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a complete trial master file has no open record, and says nothing about unverified ones', async () => {
    tmf.filings[STUDY.studyId] = everyEssential(() => `vault://${PROTOCOL_DOC}`);
    section();
    await verdict();
    expect(text('vault-tmf-figures')).toBe(`Zones complete 11 of 11 · Essential records filed ${ESSENTIAL.length} of ${ESSENTIAL.length} · Open records 0`);
  });

  it('a count the server did not report is said as not reported, never as none', async () => {
    const answer = completenessOf();
    tmf.refuseWith.completeness = () => json({ ...answer, summary: { ...answer.summary, totalUnverified: undefined } });
    section();
    await verdict();
    expect(text('vault-tmf-figures')).toMatch(/Open records 25, how many are filed with no verified document was not reported$/);
    expect(text('vault-tmf-figures')).not.toMatch(/0 filed with no verified document/);
  });

  it('an answer that does not state how many zones are complete is a failed read, not a figure made up', async () => {
    const answer = completenessOf();
    tmf.refuseWith.completeness = () => json({ ...answer, summary: { ...answer.summary, zonesComplete: undefined } });
    section();
    expect((await screen.findByTestId('vault-tmf-error')).textContent).toMatch(/The trial master file could not be read\./);
    nothingAssessed();
  });

  it('no figure is shown where nothing was assessed: a read that checked nothing, a read in flight, a refusal', async () => {
    tmf.refuseWith.completeness = () => json({ ...completenessOf(), ready: true, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0 } });
    section();
    expect((await verdict()).getAttribute('data-verdict')).toBe('not-assessed');
    expect(screen.queryByTestId('vault-tmf-figures')).toBeNull();
    expect(screen.queryByTestId('vault-tmf-package-figures')).toBeNull();
    cleanup();
    tmf.refuseWith.completeness = () => new Promise<Response>(() => {});
    section();
    await screen.findByTestId('vault-tmf-reading');
    nothingAssessed();
    cleanup();
    tmf.refuseWith.completeness = () => { throw refusal(403, NOT_RELEASED); };
    section();
    await screen.findByTestId('vault-tmf-error');
    nothingAssessed();
  });

  it('says in one visible line that timeliness and quality control are not assessed, and why', async () => {
    section();
    await verdict();
    const line = screen.getByTestId('vault-tmf-not-assessed');
    expect(line.textContent).toBe('Timeliness and quality control are not assessed: no filing lag and no QC state is recorded for trial master file records.');
    expect(line.closest('details')).toBeNull();
    // Said in words, not as two "not yet available" tiles.
    expect(screen.getByTestId('vault-tmf').textContent).not.toMatch(/Not yet available/i);
    expect(document.querySelector('details')).toBeNull();
  });
});

describe('each record’s zone and artifact code on its row', () => {
  it('quiet and monospaced, after the record’s name, for every record of the scope', async () => {
    section();
    await verdict();
    for (const zone of TMF_REFERENCE_MODEL) {
      for (const artifact of zone.artifacts.filter((a) => a.essential)) {
        const row = screen.getByTestId(`vault-tmf-record-${artifact.code}`);
        const code = within(row).getByTestId(`vault-tmf-code-${artifact.code}`);
        expect(code.textContent).toBe(`Zone ${zone.number} · ${artifact.code}`);
        expect(code.className).toBe('vd-dr-kind mono');
        expect(within(row).getByTitle(artifact.name).compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
    fireEvent.click(scopeButton('All records'));
    await waitFor(() => expect(screen.getByTestId('vault-tmf-code-recruitment_plan').textContent).toMatch(/^Zone \d+ · recruitment_plan$/));
  });
});

const pkg = () => within(screen.getByTestId('vault-tmf-package'));

describe('the inspection package, shown as a document', () => {
  it('is an open part of the section beneath the records: cover, figures and its four parts', async () => {
    tmf.filings[STUDY.studyId] = [filing('protocol', `vault://${PROTOCOL_DOC}`, 1), filing('tmf_plan', null, 2)];
    section();
    const line = await verdict();
    const doc = screen.getByTestId('vault-tmf-package');
    expect(doc.closest('details')).toBeNull();
    expect(screen.getByTestId('vault-tmf-zone-11').compareDocumentPosition(doc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The download is in its bar.
    expect(screen.getByTestId('vault-tmf-download').closest('.cm-doc-bar')).not.toBeNull();
    // Cover: the verdict's label, the study, the reference model, the scope and the date.
    expect(pkg().getByTestId('vault-tmf-package-verdict').textContent).toBe('Not inspection-ready');
    expect(pkg().getByTestId('vault-tmf-package-verdict').getAttribute('data-verdict')).toBe(line.getAttribute('data-verdict'));
    const cover = pkg().getByTestId('vault-tmf-package-cover').textContent ?? '';
    expect(cover).toContain('BX-204 in plaque psoriasis (BX-204-201) · DIA TMF Reference Model (ICH E6(R3) Appendix C) · Scope: essential records · As read on ');
    expect(cover).toContain(String(new Date().getFullYear()));
    expect(pkg().getByTestId('vault-tmf-package-figures').textContent).toBe(screen.getByTestId('vault-tmf-figures').textContent);
    // Under the section's heading: a title, then four numbered parts.
    expect(pkg().getByRole('heading', { level: 3 }).textContent).toBe('Trial master file inspection package');
    expect(pkg().getAllByRole('heading', { level: 4 }).map((h) => h.textContent))
      .toEqual(['1 Readiness verdict', '2 Zone index', '3 Open records', '4 What this package is']);
    // 1: the verdict line's own sentence, then what it means for an inspection.
    expect(pkg().getByTestId('vault-tmf-package-readiness').textContent).toBe(`${line.textContent} It is not yet inspection-ready. The open records are listed in part 3.`);
    // 2: every zone the read lists.
    const zones = within(pkg().getByTestId('vault-tmf-package-zones')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(zones).toHaveLength(11);
    expect(zones[0]).toEqual(['1', 'Trial Management', '0 of 2', '2 open']);
    expect(zones[1]).toEqual(['2', 'Central Trial Documents', '1 of 4', '3 open']);
    // 3: each open record with its zone, name, code and whether it has a filing that does not count.
    const open = within(pkg().getByTestId('vault-tmf-package-open')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(open).toHaveLength(ESSENTIAL.length - 1);
    expect(open).toContainEqual(['1', 'Trial Master File Plan', 'tmf_plan', 'Filed with no document']);
    expect(open).toContainEqual(['1', 'Monitoring Plan', 'monitoring_plan', 'Not filed']);
    // 4: the index and the readiness picture, not the documents.
    const what = pkg().getByTestId('vault-tmf-package-what').textContent ?? '';
    expect(what).toMatch(/^The index and the readiness picture of this study’s trial master file/);
    expect(what).toContain('It is not the documents.');
    expect(what).toContain('Timeliness and quality control are not assessed');
  });

  /* One verdict for the section: the retired screen's cover badge, lens and headline read one variable so they
     could not disagree (its lines 534-536). A cover that says ready over a line that does not is the defect. */
  it.each([
    ['complete', () => everyEssential(() => `vault://${PROTOCOL_DOC}`), 'Inspection-ready, on completeness', /On a completeness basis it is inspection-ready\.$/],
    ['undetermined', () => everyEssential((i) => (i < 2 ? 'https://archive.example.org/tmf/box-14' : `vault://${PROTOCOL_DOC}`)), 'Readiness not determined', /neither ready nor not ready/],
    ['incomplete', () => [filing('protocol', `vault://${PROTOCOL_DOC}`, 1)], 'Not inspection-ready', /It is not yet inspection-ready\./],
  ])('states the verdict the verdict line states (%s), and no other', async (name, filings, label, readiness) => {
    tmf.filings[STUDY.studyId] = filings();
    section();
    const line = await verdict();
    expect(line.getAttribute('data-verdict')).toBe(name);
    const cover = pkg().getByTestId('vault-tmf-package-verdict');
    expect(cover.getAttribute('data-verdict')).toBe(name);
    expect(cover.textContent).toBe(label);
    const said = pkg().getByTestId('vault-tmf-package-readiness').textContent ?? '';
    expect(said.startsWith(line.textContent ?? 'no verdict line')).toBe(true);
    expect(said).toMatch(readiness);
    // Only a complete trial master file is called inspection-ready, anywhere in the document.
    const ready = /(?<!not |not yet )inspection-ready/i.test(screen.getByTestId('vault-tmf-package').textContent ?? '');
    expect(ready).toBe(name === 'complete');
    if (name === 'complete') expect(pkg().getByTestId('vault-tmf-package-open').textContent).toBe('None. Every essential record is filed.');
    if (name === 'undetermined') {
      expect(within(pkg().getByTestId('vault-tmf-package-open')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[3].textContent))
        .toEqual(['Filed against a reference outside the Vault', 'Filed against a reference outside the Vault']);
    }
  });

  it('states no verdict, and no figure, over a read that checked nothing', async () => {
    tmf.refuseWith.completeness = () => json({ ...completenessOf(), ready: true, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0 } });
    section();
    await verdict();
    expect(pkg().getByTestId('vault-tmf-package-verdict').textContent).toBe('No verdict');
    expect(pkg().getByTestId('vault-tmf-package-readiness').textContent).toMatch(/^No verdict\. .* No readiness is stated\.$/);
    expect(pkg().getByTestId('vault-tmf-package-zones').textContent).toBe('The read listed no zone.');
    expect(pkg().getByTestId('vault-tmf-package-open').textContent).toBe('The read listed no open record by name.');
    expect(screen.getByTestId('vault-tmf-package').textContent).not.toMatch(/Every essential record is filed|Inspection-ready/);
  });

});

describe('the inspection package, after a write and for a view-only role', () => {
  it('is not shown as current while the trial master file is read again after a write', async () => {
    let reads = 0;
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => { answer = resolve; });
    tmf.refuseWith.completeness = (studyId) => { reads += 1; return reads === 1 ? json(completenessOf(studyId)) : pending; };
    section();
    await verdict();
    const open = await screen.findByRole('button', { name: 'Remove the filing of Protocol and amendments' });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    const form = screen.getByTestId('vault-tmf-remove-protocol');
    fireEvent.change(within(form).getByLabelText(/^Reason for removing/), { target: { value: 'Filed against the wrong study' } });
    /* Every commit from the write on is looked at, not only the last: the read is marked as in flight one commit
       after it is asked for, and in that commit the answer of before the write must not stand beside its outcome. */
    const beside: string[] = [];
    const watch = new MutationObserver(() => {
      if (!screen.queryByTestId('vault-tmf-note')) return;
      beside.push(`${screen.queryByTestId('vault-tmf-verdict')?.textContent ?? 'no verdict'} | ${screen.queryByTestId('vault-tmf-package-verdict')?.textContent ?? 'no cover'}`);
    });
    watch.observe(screen.getByTestId('vault-tmf'), { childList: true, subtree: true, characterData: true });
    fireEvent.click(within(form).getByRole('button', { name: 'Remove the filing' }));
    await screen.findByTestId('vault-tmf-note');
    await waitFor(() => expect(beside.length).toBeGreaterThan(0));
    expect(beside.filter((seen) => seen !== 'no verdict | no cover')).toEqual([]);
    watch.disconnect();
    // The document's frame and its download stay; its pages wait for the read.
    expect(screen.queryByTestId('vault-tmf-verdict')).toBeNull();
    expect(screen.queryByTestId('vault-tmf-figures')).toBeNull();
    expect(pkg().queryByTestId('vault-tmf-package-verdict')).toBeNull();
    expect(pkg().getByRole('status').textContent).toBe('Reading the trial master file again…');
    expect(pkg().getByTestId('vault-tmf-download')).toBeTruthy();
    await act(async () => { answer(json(completenessOf())); });
    await waitFor(() => expect(pkg().getByTestId('vault-tmf-package-readiness').textContent).toMatch(/^0 of /));
  });

  it('a view-only role reads the document and may download it', async () => {
    H.canWrite = false;
    section();
    await verdict();
    expect(pkg().getByRole('heading', { level: 3 })).toBeTruthy();
    expect((pkg().getByTestId('vault-tmf-download') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('asking AnA which gaps an inspector would raise', () => {
  const PROMPT = 'Which trial master file gaps would an inspector raise for BX-204 in plaque psoriasis, and how do I close them?';

  it('asks in the host’s conversation, naming the study on screen', async () => {
    const onAsk = vi.fn();
    section(onAsk);
    await verdict();
    const ask = screen.getByRole('button', { name: /Ask AnA which gaps an inspector would raise/ });
    fireEvent.click(ask);
    expect(onAsk.mock.calls).toEqual([[PROMPT]]);
  });

  it('is offered for the study on screen whatever its read came to, and to a view-only role', async () => {
    const onAsk = vi.fn();
    H.canWrite = false;
    tmf.refuseWith.completeness = () => { throw refusal(500, FAILED); };
    section(onAsk);
    await screen.findByTestId('vault-tmf-error');
    fireEvent.click(screen.getByTestId('vault-tmf-ask'));
    expect(onAsk.mock.calls).toEqual([[PROMPT]]);
    cleanup();
    tmf.refuseWith.completeness = () => new Promise<Response>(() => {});
    section(onAsk);
    await screen.findByTestId('vault-tmf-reading');
    expect(screen.getByTestId('vault-tmf-ask')).toBeTruthy();
  });

  it('is not offered without a conversation to ask in, or before a study is on screen', async () => {
    section();
    await verdict();
    expect(screen.queryByTestId('vault-tmf-ask')).toBeNull();
    cleanup();
    tmf.studies = [STUDY, EXTENSION];
    section(vi.fn());
    await screen.findByTestId('vault-tmf-choose');
    expect(screen.queryByTestId('vault-tmf-ask')).toBeNull();
    cleanup();
    tmf.studies = [];
    section(vi.fn());
    await screen.findByTestId('vault-tmf-no-study');
    expect(screen.queryByTestId('vault-tmf-ask')).toBeNull();
  });
});
