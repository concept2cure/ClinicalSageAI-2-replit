// @vitest-environment jsdom
/**
 * The protocol's Consent tab reads the project's informed consent document
 * and the editor's gate on its text (P-102, P-130).
 *
 * It printed "% complete" from the old consent-form rows' `present` ticks,
 * then (2026-11-11) that store's gate. P-130 retires that store: the consent
 * document in the one editor is the record, so the tab shows the verdict the
 * editor's Check and approval run, and opens the document in the editor.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const setEditorTarget = vi.hoisted(() => vi.fn());
vi.mock('../editorTarget', async (orig) => ({ ...(await orig<typeof import('../editorTarget')>()), setEditorTarget }));
const shell = vi.hoisted(() => ({ current: { id: 'eee4d7be-af0d-4d7c-8bf5-b180d1a6439a' } as { id: string } | null, publish: vi.fn() }));
vi.mock('../shellProject', async (orig) => ({ ...(await orig<typeof import('../shellProject')>()),
  readShellProject: () => shell.current, publishShellProject: (p: { id: string }) => { shell.publish(p); shell.current = p; } }));

import { ConsentTab } from '../surfaces/ProtocolDevReviews';

afterEach(() => { cleanup(); setEditorTarget.mockReset(); shell.publish.mockReset(); shell.current = { id: 'eee4d7be-af0d-4d7c-8bf5-b180d1a6439a' }; });

const DOC = '997f8a1b-1bca-498f-aced-06121e8b382e';
const PROJECT = 'd96fbfd8-de07-4253-bb1b-a48e6bbdeaa3';
const form = (status = 'draft', formsLinked = 1) => ({ id: DOC, documentId: DOC, programId: PROJECT, title: 'LUM-201 ICF', version: '', status, formsLinked });
const rows = [
  { id: 'risks', el: 'Reasonably foreseeable risks or discomforts', key: 'risks', required: true, present: true, complete: true, section: '3' },
  { id: 'confidentiality', el: 'Extent of confidentiality of records', key: 'confidentiality', required: true, present: false, complete: false, section: '6' },
];
const refused = { requiredTotal: 11, requiredComplete: 1, pct: 9, readyToApprove: false,
  findings: ['"Extent of confidentiality of records" does not state that the Food and Drug Administration may inspect the records (21 CFR 50.25(a)(5)).'] };

describe('the consent tab', () => {
  it('shows the editor gate\'s count and reasons, and where each element is drafted', () => {
    const { container } = render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form(), consentGate: refused }} />);
    const text = container.textContent ?? '';
    expect(text).toContain('1 of 11 required elements complete');
    expect(text).toContain('9% complete');
    expect(text).toContain('This consent document cannot be approved yet.');
    expect(text).toContain('Food and Drug Administration may inspect');
    expect(text).toContain('Extent of confidentiality of records (section 6)');
    expect(text).not.toMatch(/optional/);
  });

  /* Found in the running app: the shell had another project open, and the
     editor refused the document as "it belongs to a different project". */
  it('opens the consent document in the editor, in its own project', () => {
    const onNav = vi.fn();
    render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form(), consentGate: refused }} onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open in the editor' }));
    expect(shell.publish).toHaveBeenCalledWith({ id: PROJECT });
    expect(setEditorTarget).toHaveBeenCalledWith({ docType: null, docId: DOC, programId: PROJECT });
    expect(onNav).toHaveBeenCalledWith('document-authoring');
  });

  it('does not re-open the project when it is already the open one', () => {
    shell.current = { id: PROJECT };
    render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form(), consentGate: refused }} onNav={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open in the editor' }));
    expect(shell.publish).not.toHaveBeenCalled();
    expect(setEditorTarget).toHaveBeenCalled();
  });

  it('says a complete document can be approved in the editor, and an approved one is approved', () => {
    const done = { ...refused, requiredComplete: 11, pct: 100, readyToApprove: true, findings: [] };
    expect(render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form(), consentGate: done }} />).container.textContent)
      .toContain('Every required element is complete, so the document can be approved in the editor.');
    cleanup();
    const text = render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form('APPROVED'), consentGate: refused }} />).container.textContent ?? '';
    expect(text).toContain('This consent document is approved in the editor.');
    expect(text).not.toContain('cannot be approved yet');
  });

  it('names how many consent documents the project has when it has more than one', () => {
    expect(render(<ConsentTab doc={{ programId: PROJECT, consent: rows, consentForm: form('draft', 2), consentGate: refused }} />).container.textContent)
      .toContain('2 consent documents in this project, the most recently updated is shown');
  });

  it('with no consent document, says so, prints no percentage, and says where one starts', () => {
    let text = render(<ConsentTab doc={{ programId: PROJECT, consent: [], consentForm: null, consentGate: null }} />).container.textContent ?? '';
    expect(text).toContain('This project has no informed consent document.');
    expect(text).not.toMatch(/% complete/);
    cleanup();
    text = render(<ConsentTab doc={{ programId: null, consent: [], consentForm: null, consentGate: null }} />).container.textContent ?? '';
    expect(text).toContain('This protocol belongs to no project');
  });
});
