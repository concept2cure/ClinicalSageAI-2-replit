// @vitest-environment jsdom
/**
 * The device change determination in a change record's detail (P-122, 2026-11-12; reach-map row 37).
 *
 * Two rule engines decide whether a device change needs a new 510(k) or a letter to file (US) and whether it is a
 * significant change (EU). Until this change nothing in the app reached them. A change of a device project now
 * offers "Assess the regulatory impact" in its detail: the engine's questions as the existing form, the engine's
 * verdict shown as the engine's, and nothing shown as a verdict that the engine did not return.
 *
 *   - a device project's change offers it; a drug or biologic project's change does not, and says so in one
 *     sentence only in an organisation that has a device project;
 *   - the form asks the market's questions with none answered, refuses to send an unanswered one, and posts the
 *     answers (never a verdict) to POST /api/mdx/qms/changes/:id/regulatory-impact;
 *   - a recorded determination shows the verdict, the engine's rationale, the rules' version, who and when;
 *   - a refusal or a failed call says so in the drawer; something kept that is not a determination is said to be
 *     unreadable; a reply whose verdict cannot be read names none; nothing reads "not significant" by default.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), refresh: vi.fn() }));

vi.mock('../hooks', () => ({ useSopTemplates: () => ({ templates: [], loading: false, error: null }) }));
vi.mock('../changeHooks', () => ({ useChangeSummary: () => ({ summary: null, loading: false, error: null, refresh: vi.fn() }) }));
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 9, organizationId: 3, name: 'Q. Author', role: 'editor' }),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));
vi.mock('../../v2/shellProject', () => ({ useShellProject: () => null, shellProgramId: () => null }));
vi.mock('../ControlledDocumentWorkbench', () => ({ ControlledDocumentWorkbench: () => null }));

import { ChangeControl } from '../ChangeControl';
import { changeImpactRows } from '../ChangeRecordDetail';
import { regulatoryImpactOf, type ChangeControl as ChangeRow, type ImpactDetermination, type RegulatoryImpact } from '../changeData';
import { DEVICE_CHANGE_QUESTIONS } from '@shared/regulatory/change-control-taxonomy';

const NEW_510K: ImpactDetermination = {
  decision: 'new_510k',
  rationale: 'The change could significantly affect safety/effectiveness and verification has not demonstrated equivalence; a new 510(k) is indicated.',
  triggers: ['Risk assessment shows new or significantly modified risks.'],
  ruleVersion: 'fda-510k-change-2017/1',
  inputs: Object.fromEntries(DEVICE_CHANGE_QUESTIONS.us.map((q) => [q.key, q.key === 'riskAssessmentShowsNewOrModifiedRisk'])),
  byName: 'Maya Chen', at: '2026-11-12T10:15:00.000Z',
};
const NOT_SIGNIFICANT: ImpactDetermination = {
  decision: 'non_significant',
  rationale: 'No significant-change criterion is met; the change is non-significant.',
  triggers: [],
  ruleVersion: 'mdcg-2020-3/1',
  inputs: Object.fromEntries(DEVICE_CHANGE_QUESTIONS.eu.map((q) => [q.key, false])),
  byName: 'Maya Chen', at: '2026-11-12T10:20:00.000Z',
};
const DEVICE: RegulatoryImpact = { applies: 'device', productType: 'ivd', organisationHasDevices: true, assessable: true, us: null, eu: null };

function row(impact: RegulatoryImpact | null | undefined, over: Partial<ChangeRow> = {}): ChangeRow {
  return {
    id: 1, changeNumber: 'CC-2026-031', title: 'Analyzer firmware 2.4: revised result-calling threshold',
    description: 'Current: threshold 32 cycles. Proposed: 34 cycles.', changeType: 'computer_system', classification: 'minor',
    riskLevel: 'medium', status: 'under_assessment', nextStates: ['approved', 'rejected', 'cancelled'],
    reason: 'Late-crossing samples were called negative.', impactAssessment: null, implementationPlan: null,
    contentDigest: 'a'.repeat(64), targetImplementationDate: null, createdAt: null, updatedAt: null, links: [],
    regulatoryImpact: impact, ...over,
  };
}

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

function renderLog(change: ChangeRow) {
  return render(
    <ChangeControl onAsk={() => {}} stage="all" onStageChange={() => {}} openId={change.id} onOpenIdChange={() => {}}
      changes={[change]} loading={false} onRetry={H.refresh} />,
  );
}
const detail = () => document.querySelector('.qcc-detail') as HTMLElement;
const drawer = () => screen.getByRole('dialog', { name: /Assess the regulatory impact of CC-2026-031/ });
/** The writes that left the screen. (The change log reads one policy on mount; that is not a write.) */
const posted = () => H.apiRequest.mock.calls.filter(([method]) => method !== 'GET');
const answer = (d: HTMLElement, question: string, choice: 'Yes' | 'No') =>
  fireEvent.click(within(within(d).getByRole('radiogroup', { name: question })).getByRole('radio', { name: choice }));

beforeEach(() => {
  H.apiRequest.mockReset();
  H.refresh.mockReset();
});
afterEach(cleanup);

describe('where the determination is offered', () => {
  it('a device project\'s change offers it, with no verdict before the engine has run', () => {
    renderLog(row(DEVICE));
    const d = detail();
    expect(within(d).getByRole('heading', { name: 'Regulatory impact' })).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Assess the regulatory impact' })).toBeTruthy();
    const facts = within(d).getByTestId('change-impact');
    expect(within(facts).getByText('United States').closest('div')?.textContent).toContain('Not assessed yet.');
    expect(within(facts).getByText('European Union').closest('div')?.textContent).toContain('Not assessed yet.');
    expect(d.textContent).not.toMatch(/Letter to file|New 510\(k\)$|Not a significant change|Significant change$/);
  });

  it('a biologic project\'s change does not offer it, and says so in one sentence', () => {
    renderLog(row({ applies: 'not_device', productType: 'biologic', organisationHasDevices: true, assessable: false, us: null, eu: null }));
    const d = detail();
    expect(within(d).queryByRole('button', { name: 'Assess the regulatory impact' })).toBeNull();
    const note = within(d).getByTestId('change-impact-not-offered');
    expect(note.textContent).toBe('The device determination (new 510(k) or letter to file; significant change in the EU) is not offered here: this change is filed under a biologic project.');
    expect(d.querySelectorAll('[data-testid="change-impact-not-offered"]')).toHaveLength(1);
    expect(d.textContent).not.toContain('Not assessed yet.');
  });

  it('a drug project\'s change says the same of a drug project', () => {
    renderLog(row({ applies: 'not_device', productType: 'drug', organisationHasDevices: true, assessable: false, us: null, eu: null }));
    expect(within(detail()).getByTestId('change-impact-not-offered').textContent).toContain('this change is filed under a drug project.');
  });

  it('an organisation-wide change says where it is offered', () => {
    renderLog(row({ applies: 'no_project', productType: null, organisationHasDevices: true, assessable: false, us: null, eu: null }));
    const d = detail();
    expect(within(d).getByTestId('change-impact-not-offered').textContent)
      .toBe('The device determination (new 510(k) or letter to file; significant change in the EU) is offered on a change filed under a device project; this change is organisation-wide.');
    expect(within(d).queryByRole('button', { name: 'Assess the regulatory impact' })).toBeNull();
  });

  it('says nothing about it where nobody would look: an organisation with no device project', () => {
    renderLog(row({ applies: 'not_device', productType: 'drug', organisationHasDevices: false, assessable: false, us: null, eu: null }));
    const d = detail();
    expect(d.textContent).not.toMatch(/510\(k\)|Regulatory impact/);
    expect(within(d).getByText('Linked records')).toBeTruthy();
  });

  it('a row that carries no answer from the server neither offers nor describes it', () => {
    renderLog(row(undefined));
    expect(detail().textContent).not.toMatch(/510\(k\)|Regulatory impact/);
  });

  it('an approved device change is not assessed any more, and says why', () => {
    renderLog(row({ ...DEVICE, assessable: false }, { status: 'approved', nextStates: ['in_implementation', 'cancelled'] }));
    const d = detail();
    expect(within(d).queryByRole('button', { name: 'Assess the regulatory impact' })).toBeNull();
    expect(d.textContent).toContain('This change is approved, so its content is fixed: a determination can no longer be recorded on it.');
  });
});

describe('the engine\'s questions, as a form', () => {
  it('asks the US engine\'s questions in plain words, with none answered', () => {
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    expect(within(within(d).getByRole('radiogroup', { name: 'Assess for' })).getByRole('radio', { name: 'United States' }).getAttribute('aria-checked')).toBe('true');
    for (const q of DEVICE_CHANGE_QUESTIONS.us) {
      const group = within(d).getByRole('radiogroup', { name: q.question });
      expect(within(group).getAllByRole('radio').map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['Yes', 'false'], ['No', 'false']]);
    }
    expect(within(d).queryByRole('radiogroup', { name: DEVICE_CHANGE_QUESTIONS.eu[0].question })).toBeNull();
  });

  it('does not send while a question is unanswered', () => {
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    for (const q of DEVICE_CHANGE_QUESTIONS.us.slice(1)) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    expect(within(d).getByRole('alert').textContent).toContain(DEVICE_CHANGE_QUESTIONS.us[0].question);
    expect(posted()).toEqual([]);
  });

  it('posts the answers, never a verdict, and reports the engine\'s determination', async () => {
    H.apiRequest.mockResolvedValue(json(200, { data: { id: 1, change_number: 'CC-2026-031', regulatory_impact: {
      applies: 'device', productType: 'ivd', organisationHasDevices: true, assessable: true, eu: null,
      us: { engine: 'fda-510k-change', ruleVersion: NEW_510K.ruleVersion, inputs: NEW_510K.inputs,
        result: { decision: 'new_510k', rationale: NEW_510K.rationale, triggers: NEW_510K.triggers }, by: { id: 9, name: 'Maya Chen' }, at: NEW_510K.at },
    } } }));
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    for (const q of DEVICE_CHANGE_QUESTIONS.us) answer(d, q.question, q.key === 'riskAssessmentShowsNewOrModifiedRisk' ? 'Yes' : 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes/1/regulatory-impact', {
      market: 'us', answers: NEW_510K.inputs,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Assess the regulatory impact/ })).toBeNull());
    expect(screen.getByText('CC-2026-031: the engine\'s determination for the United States is New 510(k). It is kept on the change.')).toBeTruthy();
    expect(H.refresh).toHaveBeenCalled();
  });

  it('asks the EU engine\'s questions when the European Union is chosen, and posts those answers', async () => {
    H.apiRequest.mockResolvedValue(json(200, { data: { id: 1, regulatory_impact: {
      applies: 'device', productType: 'ivd', organisationHasDevices: true, assessable: true, us: null,
      eu: { engine: 'eu-significant-change', ruleVersion: 'mdcg-2020-3/1', inputs: NOT_SIGNIFICANT.inputs,
        result: { significant: false, rationale: NOT_SIGNIFICANT.rationale, triggers: [] }, by: { id: 9, name: 'Maya Chen' }, at: NOT_SIGNIFICANT.at },
    } } }));
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    fireEvent.click(within(within(d).getByRole('radiogroup', { name: 'Assess for' })).getByRole('radio', { name: 'European Union' }));
    expect(within(d).queryByRole('radiogroup', { name: DEVICE_CHANGE_QUESTIONS.us[0].question })).toBeNull();
    for (const q of DEVICE_CHANGE_QUESTIONS.eu) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes/1/regulatory-impact', {
      market: 'eu', answers: NOT_SIGNIFICANT.inputs,
    }));
    expect(await screen.findByText('CC-2026-031: the engine\'s determination for the European Union is Not a significant change. It is kept on the change.')).toBeTruthy();
  });

  it('assessing again shows the recorded answer beside each question, answers none for the person, and states why', async () => {
    H.apiRequest.mockResolvedValue(json(200, { data: { id: 1, regulatory_impact: null } }));
    renderLog(row({ ...DEVICE, us: NEW_510K }));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    // The first market still to assess is the one the form opens on; the United States is recorded here.
    expect(within(within(d).getByRole('radiogroup', { name: 'Assess for' })).getByRole('radio', { name: 'European Union' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(within(d).getByRole('radiogroup', { name: 'Assess for' })).getByRole('radio', { name: 'United States' }));
    const risk = within(d).getByRole('radiogroup', { name: 'Did the risk assessment find new risks, or existing risks significantly modified?' });
    expect(risk.closest('.de-field')?.textContent).toContain('Recorded answer: Yes.');
    expect(within(risk).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    for (const q of DEVICE_CHANGE_QUESTIONS.us) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    expect(within(d).getByRole('alert').textContent).toContain('Reason for assessing again');
    expect(posted()).toEqual([]);
    fireEvent.change(within(d).getByLabelText(/Reason for assessing again/), { target: { value: 'Verification report VR-12 now shows equivalence.' } });
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes/1/regulatory-impact', {
      market: 'us', answers: Object.fromEntries(DEVICE_CHANGE_QUESTIONS.us.map((q) => [q.key, false])),
      reason: 'Verification report VR-12 now shows equivalence.',
    }));
  });
});

describe('the engine\'s verdict, shown as the engine\'s', () => {
  it('shows the US verdict with the engine\'s rationale and what it found, the rules\' version, who and when', () => {
    renderLog(row({ ...DEVICE, us: NEW_510K, eu: NOT_SIGNIFICANT }));
    const facts = within(detail()).getByTestId('change-impact');
    const us = within(facts).getByText('United States').closest('div') as HTMLElement;
    expect(within(us).getByText('New 510(k)')).toBeTruthy();
    expect(us.textContent).toContain(NEW_510K.rationale);
    expect(within(us).getByRole('list').textContent).toContain('Risk assessment shows new or significantly modified risks.');
    expect(us.textContent).toContain('Rules fda-510k-change-2017/1. Assessed by Maya Chen on 2026-11-12.');
    const eu = within(facts).getByText('European Union').closest('div') as HTMLElement;
    expect(within(eu).getByText('Not a significant change')).toBeTruthy();
    expect(eu.textContent).toContain(NOT_SIGNIFICANT.rationale);
    expect(eu.textContent).toContain('Rules mdcg-2020-3/1.');
    expect(within(eu).queryByRole('list')).toBeNull();
  });

  it('says it is the engine\'s determination, and that a person classifies the change', () => {
    renderLog(row({ ...DEVICE, us: NEW_510K }));
    expect(detail().textContent).toContain('The rules engine\'s determination from the answers recorded. It does not classify the change: its classification, assessment and approval are a person\'s.');
    // The change's own classification is as the person recorded it.
    expect(screen.getByText('Minor')).toBeTruthy();
  });

  it('the approval reads the determination among what it signs', () => {
    const rows = changeImpactRows(row({ ...DEVICE, us: NEW_510K, eu: null }));
    expect(rows).toEqual([
      { label: 'Regulatory impact, United States (the rules engine\'s determination)', value: `New 510(k). ${NEW_510K.rationale} Rules fda-510k-change-2017/1. Assessed by Maya Chen on 2026-11-12.` },
      { label: 'Regulatory impact, European Union (the rules engine\'s determination)', value: 'Not assessed yet.' },
    ]);
    expect(changeImpactRows(row({ applies: 'not_device', productType: 'drug', organisationHasDevices: true, assessable: false, us: null, eu: null }))).toEqual([]);
    expect(changeImpactRows(row(undefined))).toEqual([]);
  });
});

describe('honest states', () => {
  it('a refusal stays in the drawer in the server\'s words, and no verdict appears', async () => {
    H.apiRequest.mockRejectedValue(new Error('The rules engine refused these answers. Nothing was recorded.'));
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    for (const q of DEVICE_CHANGE_QUESTIONS.us) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    await waitFor(() => expect(within(drawer()).getByRole('status').textContent).toBe('Not recorded — The rules engine refused these answers. Nothing was recorded.'));
    expect(H.refresh).not.toHaveBeenCalled();
    expect(detail().textContent).not.toMatch(/Letter to file|Not a significant change/);
    expect(within(detail()).getByTestId('change-impact').textContent).toContain('Not assessed yet.');
  });

  /* Found in the running app (2026-11-12): with the connection down the drawer read "Not recorded — Failed to
     fetch". That is the browser's own throw (a TypeError), not a sentence anyone wrote. */
  it('a call that never reached the server says so in plain words, not in the browser\'s', async () => {
    H.apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    for (const q of DEVICE_CHANGE_QUESTIONS.us) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    await waitFor(() => expect(within(drawer()).getByRole('status').textContent).toBe(
      'Not recorded — the server could not be reached, so nothing was sent. Check your connection and try again.'));
    expect(drawer().textContent).not.toContain('Failed to fetch');
    expect(H.refresh).not.toHaveBeenCalled();
    expect(within(detail()).getByTestId('change-impact').textContent).toContain('Not assessed yet.');
  });

  /* The server answered, so the write stands; what cannot be read is the verdict. It is not called "not recorded",
     and no verdict is named: the log is re-read and the change shows what is kept. */
  it('a reply whose determination cannot be read names no verdict, and the log is read again', async () => {
    H.apiRequest.mockResolvedValue(json(200, { data: { id: 1, regulatory_impact: { applies: 'device', us: null, eu: null } } }));
    renderLog(row(DEVICE));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Assess the regulatory impact' }));
    const d = drawer();
    for (const q of DEVICE_CHANGE_QUESTIONS.us) answer(d, q.question, 'No');
    fireEvent.click(within(d).getByRole('button', { name: /Run the assessment/ }));
    expect(await screen.findByText('CC-2026-031: the assessment for the United States was recorded. Its determination could not be read from the reply; read it on the change.')).toBeTruthy();
    expect(H.refresh).toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/is Letter to file|is New 510|Not recorded —/);
  });

  it('something kept that is not a determination is said to be unreadable, not shown as a verdict or as none', () => {
    renderLog(row({ ...DEVICE, us: 'unreadable' }));
    const us = within(within(detail()).getByTestId('change-impact')).getByText('United States').closest('div') as HTMLElement;
    expect(us.textContent).toContain('A determination is kept for this market and could not be read, so no verdict is shown. Assess again to replace it.');
    expect(us.textContent).not.toMatch(/Not assessed yet|Letter to file|New 510/);
  });

  it('reads the server\'s row: an outcome it does not know is unreadable, a missing answer is no answer', () => {
    const us = { engine: 'fda-510k-change', ruleVersion: 'fda-510k-change-2017/1', inputs: NEW_510K.inputs,
      result: { decision: 'new_510k', rationale: NEW_510K.rationale, triggers: NEW_510K.triggers }, by: { id: 9, name: 'Maya Chen' }, at: NEW_510K.at };
    const view = { applies: 'device', productType: 'ivd', organisationHasDevices: true, assessable: true };
    expect(regulatoryImpactOf({ ...view, us, eu: null })).toEqual({ ...DEVICE, us: NEW_510K });
    expect(regulatoryImpactOf({ ...view, us: { ...us, result: { ...us.result, decision: 'harmless' } }, eu: { unreadable: true } }))
      .toEqual({ ...DEVICE, us: 'unreadable', eu: 'unreadable' });
    // EU: "significant" must be a yes or a no; anything else is not read as "not significant".
    expect(regulatoryImpactOf({ ...view, us: null, eu: { ...us, result: { rationale: 'r', triggers: [] } } })?.eu).toBe('unreadable');
    expect(regulatoryImpactOf({ ...view, us: null, eu: { ...us, result: { significant: false, rationale: 'r', triggers: [] } } })?.eu)
      .toMatchObject({ decision: 'non_significant' });
    expect(regulatoryImpactOf(undefined)).toBeNull();
    expect(regulatoryImpactOf({ applies: 'somewhere', us: null, eu: null })).toBeNull();
  });
});
