// @vitest-environment jsdom
/**
 * What AnA remembers — the read-only panel beside the conversation (D2, fold
 * ana-memory into the conversation, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * The two reads of the retired `ana-memory` screen that were real carry here,
 * and only those: how AnA is tuned to the person (AnaMemory.tsx:107,208-219)
 * and the "Things I got wrong" ledger (AnaMemory.tsx:223-232), now with the
 * project-scoped profile for the project the conversation is held in, which
 * the retired screen never read although every turn does
 * (relational-profile-service.ts loadRelationalOverlay).
 *
 * The panel names no user: both reads are of the session's own notes. A read
 * that failed is an error with a way to try again, a refusal is said as one, an
 * absent store is not "no notes yet", and an empty ledger says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { stableStringify } from '@shared/canonical-json';
import { ApiRequestError } from '@/lib/queryClient';
import type { PrivateUserRuleAction, PrivateUserRuleDto, PrivateUserRuleLedgerDto } from '@shared/ana/skills';

const apiRequest = vi.hoisted(() => vi.fn());
const ruleOwner = vi.hoisted(() => ({ value: { actor: '', key: 1, sameRevision: (): boolean => true } }));
vi.mock('../editor/authoringCurrentRead', async original => ({ ...await original<typeof import('../editor/authoringCurrentRead')>(), useAuthoringReadSession: () => ruleOwner.value }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { WhatAnaRemembers } from '../WhatAnaRemembers';

const PROGRAM = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const USER_PATH = '/api/mdx/ana/memory/profile';
const PROJECT_PATH = `/api/mdx/ana/memory/profile?project_id=${PROGRAM}`;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
/* apiRequest throws on a non-2xx (assertApiResponseOk), carrying the status,
   the server's code and its sentence. */
const refusal = (status: number, code: string | undefined, message: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

const MINE = {
  interaction_count: 12,
  last_interaction_at: '2026-10-20T03:00:00Z',
  profile_summary: 'Leads with the answer and wants the source named.',
  tone_calibration: { warmth: 'medium', humor: 'rare', formality: 'formal', detail: 'concise' },
  emotional_signals: [
    { at: '2026-10-19T03:00:00Z', signal: 'An older read' },
    { at: '2026-10-20T03:00:00Z', signal: 'Deadline pressure on the IND' },
  ],
  acknowledged_mistakes: [
    { at: '2026-10-18T12:00:00Z', mistake: 'Cited a draft as the filed protocol', correction: 'Cite the filed version only' },
  ],
};
const MINE_FOR_PROJECT = {
  interaction_count: 4,
  last_interaction_at: '2026-10-20T03:00:00Z',
  profile_summary: 'On ZX-9 the CMC section is the pressure point.',
  tone_calibration: {},
  emotional_signals: [],
  acknowledged_mistakes: [
    { at: '2026-10-19T12:00:00Z', mistake: 'Called ZX-9 a biologic', correction: 'ZX-9 is a small molecule' },
  ],
};
const PROJECT_META = { scope: 'project', projectId: 11, projectRef: PROGRAM };

type Answer = () => Promise<Response>;
function serve(user: Answer, project: Answer = async () => ok({ data: MINE_FOR_PROJECT, meta: PROJECT_META })) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === USER_PATH) return user();
    if (method === 'GET' && url === PROJECT_PATH) return project();
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const mine: Answer = async () => ok({ data: MINE, meta: { scope: 'user' } });

const onClose = vi.fn();
function open(projectRef: string | number | null = PROGRAM, projectName: string | null = 'ZX-9') {
  return render(<WhatAnaRemembers projectRef={projectRef} projectName={projectName} onClose={onClose} />);
}
const yours = () => screen.getByTestId('ana-remembers-user');
const project = () => screen.getByTestId('ana-remembers-project');

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  onClose.mockReset();
  ruleOwner.value = { actor: '', key: 1, sameRevision: () => true };
});

describe('What AnA remembers — the two real reads, for the caller alone', () => {
  it('reads the caller’s own notes and their notes for the open project, and names no user', async () => {
    serve(mine);
    open();

    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    expect(await within(project()).findByText('On ZX-9 the CMC section is the pressure point.')).toBeTruthy();

    const reads = apiRequest.mock.calls.map(([method, url]) => `${method} ${url}`);
    expect(reads.sort()).toEqual([`GET ${PROJECT_PATH}`, `GET ${USER_PATH}`].sort());
    for (const [, url] of apiRequest.mock.calls) expect(String(url)).not.toMatch(/user/i);
  });

  it('shows how AnA is tuned to the person: notes, the four tone settings and the latest read', async () => {
    serve(mine);
    open();
    const you = await waitFor(() => {
      const el = yours();
      expect(within(el).getByText('Leads with the answer and wants the source named.')).toBeTruthy();
      return el;
    });
    for (const [label, value] of [['Warmth', 'medium'], ['Humor', 'rare'], ['Formality', 'formal'], ['Detail', 'concise']]) {
      const cell = within(you).getByText(label).closest('.amem-tone-cell') as HTMLElement;
      expect(within(cell).getByText(value)).toBeTruthy();
    }
    expect(within(you).getByText(/Deadline pressure on the IND/)).toBeTruthy();
    expect(you.textContent).not.toContain('An older read');
  });

  it('shows the ledger of what AnA got wrong and the correction, in each scope', async () => {
    serve(mine);
    open();
    expect(await within(yours()).findByText(/Cited a draft as the filed protocol/)).toBeTruthy();
    expect(within(yours()).getByText(/Cite the filed version only/)).toBeTruthy();
    expect(await within(project()).findByText(/Called ZX-9 a biologic/)).toBeTruthy();
    expect(within(project()).getByText(/ZX-9 is a small molecule/)).toBeTruthy();
    // Each scope holds its own entries.
    expect(yours().textContent).not.toContain('Called ZX-9 a biologic');
    expect(project().textContent).not.toContain('Cited a draft as the filed protocol');
  });

  it('heads the project’s notes with the open project', async () => {
    serve(mine);
    open(PROGRAM, 'ZX-9');
    expect(await within(project()).findByRole('heading', { name: /for this project: zx-9/i })).toBeTruthy();
  });

  it('counts turns, which is what the profile counts, not conversations', async () => {
    serve(mine);
    open();
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    expect(yours().textContent).toMatch(/12 turns/);
    expect(document.body.textContent).not.toMatch(/conversations? with you|across \d+ conversations/i);
  });
});

describe('What AnA remembers — honest states', () => {
  it('an empty ledger says so, in each scope', async () => {
    serve(
      async () => ok({ data: { ...MINE, acknowledged_mistakes: [] }, meta: { scope: 'user' } }),
      async () => ok({ data: { ...MINE_FOR_PROJECT, acknowledged_mistakes: [] }, meta: PROJECT_META }),
    );
    open();
    expect(await within(yours()).findByText('Nothing on the ledger yet.')).toBeTruthy();
    expect(await within(project()).findByText('Nothing on the ledger yet.')).toBeTruthy();
  });

  it('no notes yet is said as that, not as an error, and the ledger is still said to be empty', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user' } }), async () => ok({ data: null, meta: PROJECT_META }));
    open();
    expect(await within(yours()).findByText(/has not kept notes about working with you yet/i)).toBeTruthy();
    expect(await within(project()).findByText(/has not kept notes for this project yet/i)).toBeTruthy();
    expect(within(yours()).getByText('Nothing on the ledger yet.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a row AnA has not yet written notes into is not shown as blank notes', async () => {
    serve(async () => ok({ data: { ...MINE, profile_summary: null, tone_calibration: {}, emotional_signals: [], acknowledged_mistakes: [] }, meta: { scope: 'user' } }));
    open(null, null);
    expect(await within(yours()).findByText(/has not written notes about working with you yet/i)).toBeTruthy();
    expect(within(yours()).getAllByText('Not set yet')).toHaveLength(4);
  });

  it('a failed read of the caller’s notes is an error with Try again, never an empty memory; Try again reads again', async () => {
    let calls = 0;
    serve(async () => {
      calls += 1;
      if (calls === 1) throw refusal(500, undefined, 'Internal server error');
      return ok({ data: MINE, meta: { scope: 'user' } });
    });
    open();
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/i);
    expect(alert.textContent).toMatch(/not an empty memory/i);
    expect(yours().textContent).not.toMatch(/has not kept notes/i);
    fireEvent.click(within(yours()).getByRole('button', { name: /try again/i }));
    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('a refused read is said as a refusal, with nothing to retry', async () => {
    serve(async () => { throw refusal(403, undefined, 'Organization context required'); });
    open();
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/were not read/i);
    expect(within(yours()).queryByRole('button', { name: /try again/i })).toBeNull();
    expect(yours().textContent).not.toMatch(/has not kept notes|could not be read/i);
  });

  it('an absent store is said, not shown as no notes yet', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user', pendingStore: true } }));
    open(null, null);
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/not kept on this server/i);
    expect(yours().textContent).not.toMatch(/has not kept notes|Nothing on the ledger yet/i);
  });

  it('a project the caller cannot open is refused in the server’s terms; their own notes still show', async () => {
    serve(mine, async () => { throw refusal(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.'); });
    open();
    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/do not have current access to this project/i);
    expect(within(project()).queryByRole('button', { name: /try again/i })).toBeNull();
    expect(project().textContent).not.toMatch(/has not kept notes for this project/i);
  });

  it('a project access check that could not run offers Try again, and says nothing about the project', async () => {
    let calls = 0;
    serve(mine, async () => {
      calls += 1;
      if (calls === 1) throw refusal(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. AnA has not read its sources.');
      return ok({ data: MINE_FOR_PROJECT, meta: PROJECT_META });
    });
    open();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be checked/i);
    fireEvent.click(within(project()).getByRole('button', { name: /try again/i }));
    expect(await within(project()).findByText('On ZX-9 the CMC section is the pressure point.')).toBeTruthy();
  });

  it('an answer that does not say it is this project’s is not shown as the project’s', async () => {
    serve(mine, async () => ok({ data: MINE, meta: { scope: 'user' } }));
    open();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/did not say it was this project/i);
    expect(project().textContent).not.toContain('Leads with the answer and wants the source named.');
  });

  it('with no project open, nothing is read for a project, and the panel says only the notes above are read', async () => {
    serve(mine);
    open(null, null);
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    expect(project().textContent).toMatch(/no project is open/i);
    expect(apiRequest.mock.calls.map(([, url]) => url)).toEqual([USER_PATH]);
  });

  it('speaks in words: no table or column name reaches the screen', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user' } }), async () => ok({ data: null, meta: PROJECT_META }));
    open();
    await within(yours()).findByText(/has not kept notes about working with you yet/i);
    expect(document.body.textContent).not.toMatch(/\b[a-z]+(?:_[a-z]+)+\b/);
  });
});

describe('What AnA remembers — a dialog beside the conversation', () => {
  it('is named, read-only, and closes on Close and on Escape', async () => {
    serve(mine);
    open();
    const dialog = screen.getByRole('dialog', { name: 'What AnA remembers' });
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    // Read-only: nothing in it writes.
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    const buttons = within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent);
    expect(buttons).toEqual(['Close']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});

const PRIVATE_PATH = '/api/client-intelligence/ana/user-profile';
const RULE_ID = '776388f1-3c29-4ab2-9a7f-82b8e42bb624';
const PERSONAL: PrivateUserRuleDto = { ruleId: RULE_ID, version: 1, scope: 'user', state: 'active', level: 'standing',
  name: 'Show sources first', instructions: 'Put the exact source before a proposed conclusion.', conflictKey: 'writing.sources', policyBindings: [], supersedes: [],
  source: { correctionId: '0a88165f-6e56-4f6b-a365-297fd011caba', sourceAuditEventId: 'actual-correction-receipt', correctionSha256: 'a'.repeat(64) },
  createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' };
const personalLedger = (rules: PrivateUserRuleDto[] = []): PrivateUserRuleLedgerDto => ({ schemaVersion: 1, organizationId: 7, userId: 1,
  revision: 1, promptUse: 'held_privacy_boundary', rules, conflicts: [], receipts: [] });
type PersonalPost = (body: PrivateUserRuleAction) => Promise<Response>;
function servePersonal(read: () => Promise<unknown>, post?: PersonalPost) {
  ruleOwner.value = { actor: '7:1', key: 2, sameRevision: () => true };
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', NodeTextEncoder);
  apiRequest.mockImplementation(async (method: string, url: string, body: PrivateUserRuleAction) => {
    if (method === 'GET' && url === PRIVATE_PATH) return ok({ success: true, privateRules: await read() });
    if (method === 'POST' && url === PRIVATE_PATH && post) return post(body);
    if (url === USER_PATH) return mine();
    if (url === PROJECT_PATH) return ok({ data: MINE_FOR_PROJECT, meta: PROJECT_META });
    throw new Error('Unexpected personal-rule request');
  });
}
function acknowledged(action: PrivateUserRuleAction, ledger = personalLedger([PERSONAL])) {
  ledger.receipts.push({ intentId: action.intentId, payloadSha256: createHash('sha256').update(stableStringify(action)).digest('hex'),
    ruleId: RULE_ID, version: 1, revision: ledger.revision });
  return { success: true, audited: true, replayed: false, intentId: action.intentId, privateRules: ledger };
}
const privatePosts = () => apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === PRIVATE_PATH);
async function newPersonalRule(level = 'standing') {
  fireEvent.click(await screen.findByRole('button', { name: 'Add a personal rule' }));
  const form = within(screen.getByRole('dialog', { name: 'Add personal rule' }));
  for (const [label, value] of [['Rule name', 'Show sources first'], ['How AnA should work', PERSONAL.instructions], ['Rule topic', PERSONAL.conflictKey],
    ['The correction behind this rule', 'You previously omitted the exact source.'], ['Reason for change', 'Keep future conclusions attributable.']]) {
    fireEvent.change(form.getByRole('textbox', { name: label }), { target: { value } });
  }
  fireEvent.change(form.getByRole('combobox', { name: 'How this applies' }), { target: { value: level } });
  return form;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('owner-private personal rule controls', () => {
  it('shows the real source/date/version and leaves revoked rules read-only', async () => {
    servePersonal(async () => personalLedger([PERSONAL, { ...PERSONAL, ruleId: '30985f5e-d0bb-4c18-9f9b-34ee95de65ff', name: 'Retired preference', state: 'revoked', version: 2 }]));
    open();
    expect(await screen.findAllByText(PERSONAL.instructions)).toHaveLength(2);
    expect(screen.getAllByText(/From your recorded correction/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Edit Show sources first' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Retired preference' })).toBeNull();
    expect(screen.getByText(/not yet loaded into model prompts/)).toBeTruthy();
  });
  it('describes protected-turn use as a restriction without claiming qualification or completed model use', async () => {
    servePersonal(async () => ({ ...personalLedger([PERSONAL]), promptUse: 'protected_turns_only' })); open();
    expect(await screen.findByText(/Personal instructions are limited to protected conversations/)).toBeTruthy();
    expect(screen.getByText(/AnA pauses if privacy or model approval cannot be verified/)).toBeTruthy();
    expect(screen.queryByText(/not yet loaded into model prompts/)).toBeNull();
  });
  it.each([personalLedger([{ ...PERSONAL, instructions: 'FOREIGN_PRIVATE_CANARY' }]), { ...personalLedger(), receipts: undefined }])('refuses foreign or malformed personal ledgers', async candidate => {
    const answer = candidate.rules.length ? { ...candidate, userId: 2 } : candidate;
    servePersonal(async () => answer); open();
    expect(await screen.findByText(/personal rules could not be read/)).toBeTruthy();
    expect(screen.queryByText('FOREIGN_PRIVATE_CANARY')).toBeNull(); expect(screen.queryByText('No personal rules recorded.')).toBeNull();
  });
  it('records one typed hard rule with actual exact-payload receipt; double submit does not duplicate', async () => {
    servePersonal(async () => personalLedger(), async action => ok(acknowledged(action)));
    open(); const form = await newPersonalRule('hard_gate');
    const submit = form.getByRole('button', { name: 'Record rule' }); fireEvent.click(submit); fireEvent.click(submit);
    expect(await screen.findByText('Personal rule change recorded.')).toBeTruthy(); expect(privatePosts()).toHaveLength(1);
    const action = privatePosts()[0][2] as PrivateUserRuleAction;
    expect(action).toMatchObject({ action: 'create_rule', rule: { level: 'hard_gate', policyBindings: [{ toolName: 'check_dossier_consistency', enforcement: 'mandatory' }] } });
    expect(action).not.toHaveProperty('userId'); expect(action).not.toHaveProperty('organizationId');
    expect(Object.values(localStorage).join('')).not.toContain('You previously omitted the exact source.');
  });
  it('reconciles an uncertain committed save from a fresh matching intent and payload hash without resubmitting', async () => {
    let ledger = personalLedger();
    servePersonal(async () => ledger, async action => { ledger = acknowledged(action).privateRules; throw new Error('Lost acknowledgement'); });
    open(); fireEvent.click((await newPersonalRule()).getByRole('button', { name: 'Record rule' }));
    await screen.findByText(/save could not be confirmed/);
    expect(screen.queryByRole('button', { name: 'Retry the same personal rule change' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Re-read personal rules' }));
    expect(await screen.findByText(/change confirmed from the current ledger/)).toBeTruthy(); expect(privatePosts()).toHaveLength(1);
  });
  it('allows an explicit identical-intent retry only after a fresh authoritative read has no receipt', async () => {
    let count = 0;
    servePersonal(async () => personalLedger(), async action => { if (++count === 1) throw new Error('Unknown commit'); return ok(acknowledged(action)); });
    open(); fireEvent.click((await newPersonalRule()).getByRole('button', { name: 'Record rule' }));
    await screen.findByText(/save could not be confirmed/); fireEvent.click(screen.getByRole('button', { name: 'Re-read personal rules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry the same personal rule change' }));
    await screen.findByText('Personal rule change recorded.'); expect(privatePosts()).toHaveLength(2);
    expect(privatePosts()[1][2]).toEqual(privatePosts()[0][2]);
  });
  it('does not soften an existing hard rule and revokes only its current saved version', async () => {
    const hard = { ...PERSONAL, level: 'hard_gate' as const, version: 4,
      policyBindings: [{ policyType: 'requires_approval' as const, enforcement: 'mandatory' as const, toolName: 'check_dossier_consistency', description: 'My approval is required for this check.' }] };
    servePersonal(async () => personalLedger([hard]), async action => ok(acknowledged(action)));
    open(); fireEvent.click(await screen.findByRole('button', { name: 'Edit Show sources first' }));
    const form = within(screen.getByRole('dialog', { name: 'Edit personal rule' }));
    expect((form.getByRole('option', { name: 'Preference' }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Show sources first' }));
    const revoke = within(screen.getByRole('dialog', { name: 'Revoke personal rule' }));
    fireEvent.change(revoke.getByRole('textbox', { name: 'Reason for change' }), { target: { value: 'I am retiring this personal rule.' } });
    fireEvent.click(revoke.getByRole('button', { name: 'Revoke rule' })); await screen.findByText('Personal rule change recorded.');
    expect(privatePosts()[0][2]).toMatchObject({ action: 'revoke_rule', ruleId: RULE_ID, expectedVersion: 4 });
  });
  it('clears cached rule content and blocks new edits after authoritative access refusal', async () => {
    servePersonal(async () => personalLedger([PERSONAL]), async () => { throw new ApiRequestError('Unavailable', 403); });
    open(); fireEvent.click(await screen.findByRole('button', { name: 'Revoke Show sources first' }));
    const form = within(screen.getByRole('dialog', { name: 'Revoke personal rule' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Reason for change' }), { target: { value: 'Retire this rule after reviewing it.' } });
    fireEvent.click(form.getByRole('button', { name: 'Revoke rule' }));
    await screen.findByText(/change was refused/);
    expect(screen.queryByText(PERSONAL.instructions)).toBeNull(); expect(screen.queryByRole('button', { name: 'Add a personal rule' })).toBeNull();
  });
  it('discards a late foreign-session response before it can display private instructions', async () => {
    const deliveries: Array<(value: unknown) => void> = [];
    servePersonal(() => new Promise(resolve => { deliveries.push(resolve); })); const view = open();
    const original = deliveries[0];
    if (!original) throw new Error('Original owner read did not start');
    ruleOwner.value = { actor: '7:2', key: 3, sameRevision: () => true };
    view.rerender(<WhatAnaRemembers projectRef={PROGRAM} projectName="ZX-9" onClose={onClose} />);
    original(personalLedger([{ ...PERSONAL, instructions: 'OLD_OWNER_PRIVATE_CANARY' }]));
    await waitFor(() => expect(screen.queryByText('OLD_OWNER_PRIVATE_CANARY')).toBeNull()); expect(privatePosts()).toHaveLength(0);
  });
});
