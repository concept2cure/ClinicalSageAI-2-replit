// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { authService } from '@/services/portal/authService';
import { deviceDraftKey } from '@/lib/deviceDraftCache';
import { reserveSessionChange, releaseSessionChange } from '@/lib/sessionChangeGuard';
import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';
import { collectSuggestions } from '../suggestions';

interface Receipt { applicationId: string; editorInstanceId: string }
type State = 'pending' | 'settled' | 'absent' | 'unavailable';
type LifecycleHandle = RichSectionEditorHandle & {
  canProposeReplacement?: () => boolean;
  getProposalState?: (receipt: Receipt) => State;
  subscribeProposalChanges?: (listener: () => void) => () => void;
};
const TURN = 'eeeeeeee-0000-4000-8000-000000000001';
const SAVED = '<p>Stable for 18 months.</p>';
const KEY = 'proposal-lifecycle-section';
const CACHE = deviceDraftKey(7, KEY);
const ANA = { id: 'ana', name: 'AnA (proposed fix)', sourceRecord: TURN };
const EXTERNAL = { applicationId: 'aaaaaaaa-0000-4000-8000-000000000001', editorInstanceId: 'a-previous-editor-instance' };
const proposal = { quote: '18 months', replacement: '24 months' };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  proto.getClientRects ??= () => [];
  proto.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(authService, 'getUser').mockReturnValue({ id: '7', email: 'author@example.test', firstName: 'Test', lastName: 'Author',
    displayName: 'Test Author', roles: ['writer'], permissions: [], organizationId: '7', organizationName: 'Test organization',
    mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
});
afterEach(() => { cleanup(); releaseSessionChange(); localStorage.clear(); vi.restoreAllMocks(); });

function canvas(): Editor { return (document.querySelector('.rse-body .tiptap') as HTMLElement & { editor: Editor }).editor; }
function state(ref: React.RefObject<LifecycleHandle | null>, receipt: Receipt): State { return ref.current?.getProposalState?.(receipt) ?? 'unavailable'; }
function mount(value = SAVED, readOnly = false) {
  const ref = React.createRef<LifecycleHandle>();
  const save = vi.fn(async () => {});
  const view = render(<RichSectionEditor ref={ref} value={value} onSave={save} storageKey={KEY} readOnly={readOnly} />);
  return { ref, save, view };
}
async function ready() { await waitFor(() => expect(canvas().isInitialized).toBe(true)); }
function available(ref: React.RefObject<LifecycleHandle | null>): boolean { return ref.current?.canProposeReplacement?.() ?? false; }
function expectUnavailableProposal(ref: React.RefObject<LifecycleHandle | null>) {
  const before = ref.current!.getContent();
  expect(available(ref)).toBe(false);
  let result: ReturnType<RichSectionEditorHandle['proposeReplacement']> | undefined;
  act(() => { result = ref.current!.proposeReplacement(proposal, ANA); });
  expect(result).toEqual({ ok: false, reason: 'not-editable' });
  expect(ref.current!.getContent()).toBe(before);
}
async function apply(ref: React.RefObject<LifecycleHandle | null>, replacement = proposal.replacement): Promise<Receipt> {
  await waitFor(() => expect(available(ref)).toBe(true));
  let result: ReturnType<RichSectionEditorHandle['proposeReplacement']> & Partial<Receipt> = { ok: false, reason: 'not-editable' };
  act(() => { result = ref.current!.proposeReplacement({ ...proposal, replacement }, ANA); });
  expect(result.ok).toBe(true);
  // The pre-change handle creates the actual redline but cannot observe its lifecycle.
  // Fallback lets these tests expose that behavior instead of failing on a missing import.
  return { applicationId: result.applicationId ?? EXTERNAL.applicationId, editorInstanceId: result.editorInstanceId ?? EXTERNAL.editorInstanceId };
}
function resolve(kind: 'insertion' | 'deletion', decision: 'accept' | 'reject') {
  const range = collectSuggestions(canvas().state.doc).find(item => item.kind === kind);
  expect(range).toBeTruthy();
  act(() => { canvas().commands.resolveSuggestion(range!, decision); });
}

describe('the rich editor observes actual remedy applications', () => {
  it('reopens a completely rejected application and gives the explicit retry another receipt', async () => {
    const { ref, save } = mount(); await ready();
    const receipt = await apply(ref);
    expect(state(ref, receipt)).toBe('pending');
    act(() => { canvas().commands.resolveAllSuggestions('reject'); });
    expect(canvas().getHTML()).toBe(SAVED);
    expect(state(ref, receipt)).toBe('absent');
    const retry = await apply(ref);
    expect(retry.applicationId).not.toBe(receipt.applicationId);
    expect(retry.editorInstanceId).toBe(receipt.editorInstanceId);
    expect(state(ref, retry)).toBe('pending');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a partial rejection pending until every application mark is gone', async () => {
    const { ref } = mount(); await ready(); const receipt = await apply(ref);
    resolve('insertion', 'reject');
    expect(state(ref, receipt)).toBe('pending');
    resolve('deletion', 'reject');
    expect(state(ref, receipt)).toBe('absent');
    expect(canvas().getHTML()).toBe(SAVED);
  });

  it('keeps any accepted part settled after the remaining part is rejected', async () => {
    const { ref, save } = mount(); await ready(); const receipt = await apply(ref);
    resolve('insertion', 'accept');
    expect(state(ref, receipt)).toBe('pending');
    resolve('deletion', 'reject');
    expect(state(ref, receipt)).toBe('settled');
    expect(save).not.toHaveBeenCalled();
  });

  it('retains acceptance after all proposal marks disappear', async () => {
    const { ref } = mount(); await ready(); const receipt = await apply(ref);
    act(() => { canvas().commands.resolveAllSuggestions('accept'); });
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    expect(canvas().getHTML()).toBe('<p>Stable for 24 months.</p>');
    expect(state(ref, receipt)).toBe('settled');
  });

  it('does not treat a command capability check as an actual acceptance', async () => {
    const { ref } = mount(); await ready(); const receipt = await apply(ref);
    expect(canvas().can().resolveAllSuggestions('accept')).toBe(true);
    expect(state(ref, receipt)).toBe('pending');
    act(() => { canvas().commands.resolveAllSuggestions('reject'); });
    expect(state(ref, receipt)).toBe('absent');
  });

  it.each(['accept', 'reject'] as const)('observes a deletion-only application after %s', async decision => {
    const { ref } = mount(); await ready(); const receipt = await apply(ref, '');
    expect(collectSuggestions(canvas().state.doc).map(range => range.kind)).toEqual(['deletion']);
    expect(state(ref, receipt)).toBe('pending');
    act(() => { canvas().commands.resolveAllSuggestions(decision); });
    expect(state(ref, receipt)).toBe(decision === 'accept' ? 'settled' : 'absent');
  });

  it('notifies content and decision subscribers and honors unsubscribe', async () => {
    const { ref } = mount(); await ready();
    const listener = vi.fn();
    const unsubscribe = ref.current?.subscribeProposalChanges?.(listener) ?? (() => {});
    await apply(ref);
    expect(listener, 'a real pending proposal did not notify its remedy card').toHaveBeenCalled();
    const proposedCalls = listener.mock.calls.length;
    act(() => { canvas().commands.resolveAllSuggestions('reject'); });
    expect(listener.mock.calls.length).toBeGreaterThan(proposedCalls);
    unsubscribe();
    const unsubscribedCalls = listener.mock.calls.length;
    act(() => { canvas().commands.insertContentAt(1, 'Independent edit. '); });
    expect(listener.mock.calls.length).toBe(unsubscribedCalls);
  });

  it('does not infer absence before hydration, then notifies readiness on the clean baseline', async () => {
    const { ref } = mount();
    expect(state(ref, EXTERNAL)).toBe('unavailable');
    const listener = vi.fn(); ref.current?.subscribeProposalChanges?.(listener);
    await ready();
    await waitFor(() => expect(state(ref, EXTERNAL)).toBe('absent'));
    expect(listener).toHaveBeenCalled();
  });
});

describe('the first proposal waits for an available editor', () => {
  it('refuses before hydration without creating pending marks or saving', async () => {
    const { ref, save } = mount();
    expectUnavailableProposal(ref);
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    await ready();
    await waitFor(() => expect(available(ref)).toBe(true));
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['Discard it', 'Restore the device draft'])('waits for the cache choice, then becomes available after %s', async choice => {
    const cached = '<p>Stable for 18 months. Device-only evidence note.</p>';
    localStorage.setItem(CACHE, cached);
    const { ref, save } = mount(); await ready();
    await screen.findByText(/A draft cached on this device/);
    expectUnavailableProposal(ref);
    expect(canvas().getHTML()).toBe(SAVED);
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: choice }));
    await waitFor(() => expect(available(ref)).toBe(true));
    expect(canvas().getHTML()).toBe(choice === 'Discard it' ? SAVED : cached);
    const receipt = await apply(ref);
    expect(state(ref, receipt)).toBe('pending');
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses on a read-only editor and after its rich editor is destroyed', async () => {
    const frozen = mount(SAVED, true); await ready();
    expectUnavailableProposal(frozen.ref);
    expect(frozen.save).not.toHaveBeenCalled();
    frozen.view.unmount(); localStorage.clear();
    const writable = mount(); await ready();
    await waitFor(() => expect(available(writable.ref)).toBe(true));
    const detached = writable.ref.current!;
    writable.view.unmount();
    expect(detached.canProposeReplacement?.() ?? false).toBe(false);
    expect(detached.proposeReplacement(proposal, ANA)).toEqual({ ok: false, reason: 'not-editable' });
    expect(writable.save).not.toHaveBeenCalled();
  });

  it('refuses source mode without changing the authored source or saving', async () => {
    const source = mount('<p>One two three four five.</p><figure><img src="x.png" alt="" /></figure>');
    await waitFor(() => expect(document.querySelector('.rse-body textarea')).toBeTruthy());
    expectUnavailableProposal(source.ref);
    expect(source.save).not.toHaveBeenCalled();
  });
});

describe('proposal availability follows the existing session-change guard', () => {
  it('refuses through a retained handle synchronously while a clean editor is held', async () => {
    const { ref, save } = mount(); await ready();
    await waitFor(() => expect(available(ref)).toBe(true));
    const retained = ref.current!;
    let release!: () => void;
    act(() => {
      const reservation = reserveSessionChange();
      expect(reservation).not.toBeNull();
      if (!reservation) throw new Error('The clean editor did not reserve a session change');
      release = reservation;
      // These reads precede React's held-state render and use the old handle.
      expect(retained.canProposeReplacement()).toBe(false);
      expect(retained.proposeReplacement(proposal, ANA)).toEqual({ ok: false, reason: 'not-editable' });
      expect(retained.getContent()).toBe(SAVED);
    });
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    act(() => { release(); });
    await waitFor(() => expect(available(ref)).toBe(true));
    const receipt = await apply(ref);
    expect(state(ref, receipt)).toBe('pending');
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a session reservation immediately after a real proposal dirties the editor', async () => {
    const { ref, save } = mount(); await ready();
    await waitFor(() => expect(available(ref)).toBe(true));
    act(() => {
      expect(ref.current!.proposeReplacement(proposal, ANA).ok).toBe(true);
      // The synchronous dirty guard must see the proposal before React commits.
      expect(reserveSessionChange()).toBeNull();
    });
    expect(collectSuggestions(canvas().state.doc).map(range => range.kind)).toEqual(['deletion', 'insertion']);
    expect(available(ref)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('device drafts cannot fabricate a missing application', () => {
  it('observes a known application when the device cache cannot be read', async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === CACHE) throw new Error('Device cache reads are unavailable');
      return getItem.call(this, key);
    });
    const { ref, save } = mount(); await ready();
    expect(screen.queryByText(/A draft cached on this device/)).toBeNull();
    const receipt = await apply(ref);
    expect(state(ref, receipt), 'actual pending marks became unobservable after a best-effort cache read failed').toBe('pending');
    act(() => { canvas().commands.resolveAllSuggestions('reject'); });
    expect(canvas().getHTML()).toBe(SAVED);
    expect(state(ref, receipt)).toBe('absent');
    const retry = await apply(ref);
    expect(retry.applicationId).not.toBe(receipt.applicationId);
    expect(state(ref, retry)).toBe('pending');
    expect(save).not.toHaveBeenCalled();
  });

  it('waits for explicit Discard before an older-instance receipt becomes absent', async () => {
    localStorage.setItem(CACHE, '<p>Independent cached correction.</p>');
    const { ref, save } = mount(); await ready();
    await screen.findByText(/A draft cached on this device/);
    expect(state(ref, EXTERNAL)).toBe('unavailable');
    const listener = vi.fn(); ref.current?.subscribeProposalChanges?.(listener);
    fireEvent.click(screen.getByRole('button', { name: 'Discard it' }));
    await waitFor(() => expect(state(ref, EXTERNAL)).toBe('absent'));
    expect(listener).toHaveBeenCalled();
    expect(canvas().getHTML()).toBe(SAVED);
    expect(localStorage.getItem(CACHE)).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('cannot infer rejection from a restored modified draft without its marks', async () => {
    const first = mount(); await ready(); const receipt = await apply(first.ref);
    act(() => { canvas().commands.resolveAllSuggestions('accept'); });
    expect(localStorage.getItem(CACHE)).toContain('24 months');
    first.view.unmount();
    const reopened = mount(); await ready();
    await screen.findByText(/A draft cached on this device/);
    expect(state(reopened.ref, receipt)).toBe('unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Restore the device draft' }));
    await waitFor(() => expect(canvas().getHTML()).toContain('24 months'));
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    expect(state(reopened.ref, receipt)).toBe('unavailable');
    expect(reopened.save).not.toHaveBeenCalled();
  });

  it('reads restored application marks as pending and complete rejection as absent', async () => {
    const first = mount(); await ready(); const receipt = await apply(first.ref);
    first.view.unmount();
    const reopened = mount(); await ready();
    await screen.findByText(/A draft cached on this device/);
    const listener = vi.fn(); reopened.ref.current?.subscribeProposalChanges?.(listener);
    fireEvent.click(screen.getByRole('button', { name: 'Restore the device draft' }));
    await waitFor(() => expect(state(reopened.ref, receipt)).toBe('pending'));
    expect(listener).toHaveBeenCalled();
    act(() => { canvas().commands.resolveAllSuggestions('reject'); });
    expect(state(reopened.ref, receipt)).toBe('absent');
    expect(canvas().getHTML()).toBe(SAVED);
  });

  it('reads application marks from a saved redline after remount without enabling a duplicate', async () => {
    const first = mount(); await ready(); const receipt = await apply(first.ref);
    const stored = first.ref.current!.getContent();
    first.view.unmount(); localStorage.clear();
    const reopened = mount(stored); await ready();
    expect(state(reopened.ref, receipt)).toBe('pending');
    expect(reopened.save).not.toHaveBeenCalled();
  });

  it('keeps source-mode and destroyed editor receipts unavailable', async () => {
    const first = mount(); await ready(); const receipt = await apply(first.ref);
    const detached = first.ref.current;
    first.view.unmount();
    expect(detached?.getProposalState?.(receipt) ?? 'unavailable').toBe('unavailable');
    localStorage.clear();
    const source = mount('<p>One two three four five.</p><figure><img src="x.png" alt="" /></figure>');
    await waitFor(() => expect(document.querySelector('.rse-body textarea')).toBeTruthy());
    expect(state(source.ref, receipt)).toBe('unavailable');
    expect(source.save).not.toHaveBeenCalled();
  });
});
