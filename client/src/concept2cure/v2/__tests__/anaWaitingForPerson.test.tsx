// @vitest-environment jsdom
/**
 * While AnA waits for a person, every surface says so (row 74, end-to-end
 * finding F2).
 *
 * The capture found that during a Manual hold or an approval wait the Live
 * Drive strip still said "AnA is driving", and during an approval wait the
 * work panel said "Still working": the run is held, nothing is being done,
 * and the person is the one who has to act. One rule now decides whether she
 * is waiting (waitingForPerson), and both surfaces read it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { LiveDriveOverlay } from '../LiveDriveOverlay';
import { INITIAL_DRIVE_STATE, driveReducer } from '../liveDrive';
import { stateLineFor, waitingForPerson } from '../anaWorkModel';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

afterEach(cleanup);

const turn = (over: Partial<AnaChatMessage> = {}) =>
  ({ id: 'a1', role: 'assistant', text: '', streaming: true, sentAt: 1_000, ...over }) as AnaChatMessage;
const signoff = { toolUseId: 'tu_1', command: 'save_document_to_vault' } as unknown as NonNullable<AnaChatMessage['pendingSignoffs']>[number];

describe('waitingForPerson', () => {
  it('is an approval when an action waits for a person', () => {
    expect(waitingForPerson(turn({ pendingSignoffs: [signoff] }), 'running', null)).toBe('approval');
  });
  it("is a hold under Manual", () => {
    expect(waitingForPerson(turn(), 'paused', { reason: 'manual', next: ['Search the literature'] } as never)).toBe('manual');
  });
  it('is nothing while she is working, or once the turn has settled', () => {
    expect(waitingForPerson(turn(), 'running', null)).toBeNull();
    expect(waitingForPerson(turn({ streaming: false, pendingSignoffs: [signoff] }), null, null)).toBeNull();
  });
});

describe('the work panel line', () => {
  it('says she is waiting for your approval, not "Still working"', () => {
    const line = stateLineFor(turn({ pendingSignoffs: [signoff] }), true, 'running', '0:42', null);
    expect(line).toBe('Waiting for your approval · 0:42');
  });
  it('control: working is still working', () => {
    expect(stateLineFor(turn(), true, 'running', '0:42', null)).toBe('Still working · 0:42');
  });
});

describe('the Live Drive strip', () => {
  const driving = driveReducer(INITIAL_DRIVE_STATE, { kind: 'drive_state', enabled: true, mode: 'assist' });
  const title = () => document.querySelector('.ana-drive-title')?.textContent;

  it('says AnA is waiting for you while she is held', () => {
    render(<LiveDriveOverlay state={driving} waiting="approval" onTakeOver={vi.fn()} onStop={vi.fn()} />);
    expect(title()).toBe('AnA is waiting for you');
  });
  it('control: says she is driving when she is', () => {
    render(<LiveDriveOverlay state={driving} onTakeOver={vi.fn()} onStop={vi.fn()} />);
    expect(title()).toBe('AnA is driving');
  });
});
