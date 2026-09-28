// @vitest-environment jsdom
/**
 * Tests for the Part 11 governed-action client flow: the pure block extractor,
 * and the sign-off form's tiered fields + submit payload (fetch mocked).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { extractPendingSignoffs, type PendingSignoff } from '../useGovernedAction';
import { GovernedActionSignoff } from '../GovernedActionSignoff';

afterEach(cleanup);

describe('extractPendingSignoffs', () => {
  it('pulls only well-formed PART11 blocks and reads the tier flag', () => {
    const out = extractPendingSignoffs([
      { success: true, action: 'list_projects' },
      { error: 'PART11_SIGNATURE_REQUIRED', message: 'Sign required', data: { signatureRequired: true, retry: { command: 'revert_to_version', params: { v: 3 } } } },
      { error: 'PART11_SIGNATURE_REQUIRED', message: 'Reason required', data: { signatureRequired: false, retry: { command: 'update_milestone', params: {} } } },
      { error: 'PART11_SIGNATURE_REQUIRED', data: {} }, // malformed: no retry → skipped
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ command: 'revert_to_version', signatureRequired: true, params: { v: 3 } });
    expect(out[1]).toMatchObject({ command: 'update_milestone', signatureRequired: false });
  });

  it('returns [] for missing / non-array input', () => {
    expect(extractPendingSignoffs(undefined)).toEqual([]);
    expect(extractPendingSignoffs(null)).toEqual([]);
  });

  it("surfaces an agent's proposal (HUMAN_CONFIRMATION_REQUIRED) with its tier — the confirm tier asks for no reason", () => {
    // Until 2026-09-26 only PART11_SIGNATURE_REQUIRED was read here, so an
    // end-of-turn proposal never rendered (audit DP-08, P0-12).
    const out = extractPendingSignoffs([
      { error: 'HUMAN_CONFIRMATION_REQUIRED', message: 'Confirm to continue.', data: { tier: 'confirm', reasonRequired: false, signatureRequired: false, retry: { command: 'create_task', params: { title: 'Draft the SAP' } } } },
      { error: 'HUMAN_CONFIRMATION_REQUIRED', message: 'Reason recorded.', data: { tier: 'reason', signatureRequired: false, retry: { command: 'update_milestone', params: {} } } },
      { error: 'HUMAN_CONFIRMATION_REQUIRED', data: { signatureRequired: true, retry: { command: 'erase_personal_data', params: {} } } }, // older server: no tier
    ]);
    expect(out.map(o => [o.command, o.tier, o.signatureRequired])).toEqual([
      ['create_task', 'confirm', false],
      ['update_milestone', 'reason', false],
      ['erase_personal_data', 'esignature', true],
    ]);
  });
});

const reasonOnly: PendingSignoff = {
  command: 'update_milestone',
  params: {},
  signatureRequired: false,
  message: 'This action requires a reason for change.',
};
const highImpact: PendingSignoff = {
  command: 'revert_to_version',
  params: { versionId: 3 },
  signatureRequired: true,
  message: 'This action requires a reason for change and an electronic signature.',
};

const confirmOnly: PendingSignoff = {
  command: 'create_task',
  params: { projectId: 4, title: 'Draft the SAP', assigneeIds: [2, 3] },
  signatureRequired: false,
  tier: 'confirm',
  message: 'AnA proposed this action. Confirm to run it under your name.',
};

describe('GovernedActionSignoff — the confirm tier', () => {
  beforeEach(() => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true, message: 'Task created.' } }),
    });
  });

  it('asks for neither a reason nor credentials, and says what AnA proposed', () => {
    render(<GovernedActionSignoff signoff={confirmOnly} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText('Reason for change')).toBeNull();
    expect(screen.queryByLabelText('Password (electronic signature)')).toBeNull();
    expect(screen.getByText('Confirm the proposed action')).toBeTruthy();
    expect(screen.getByText('create_task')).toBeTruthy();
    expect(screen.getByText('Draft the SAP')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
  });

  it('confirming posts { confirm: true } with the command and params, and no reason or password', async () => {
    const onResolved = vi.fn();
    render(<GovernedActionSignoff signoff={confirmOnly} onResolved={onResolved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ success: true, message: 'Task created.' }));
    const body = JSON.parse(((global as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ command: 'create_task', params: confirmOnly.params, confirm: true });
    expect(body).not.toHaveProperty('reasonForChange');
    expect(body).not.toHaveProperty('password');
  });

  it('the reason tier still needs its reason before the button enables', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('button', { name: 'Confirm and run' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GovernedActionSignoff', () => {
  beforeEach(() => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true, message: 'Milestone advanced.' } }),
    });
  });

  it('reason-only tier shows no password field', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Reason for change')).toBeTruthy();
    expect(screen.queryByLabelText('Password (electronic signature)')).toBeNull();
  });

  it('high-impact tier requires a password field', () => {
    render(<GovernedActionSignoff signoff={highImpact} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Password (electronic signature)')).toBeTruthy();
  });

  it('high-impact tier presents the §11.50 meaning enum (AUTHOR/REVIEWER/APPROVER)', () => {
    render(<GovernedActionSignoff signoff={highImpact} onResolved={() => {}} onCancel={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: /Meaning of signature/i });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map(r => r.textContent)).toEqual(['Authorship', 'Review', 'Approval']);
  });

  it('high-impact tier states the 11.100(b) attestation and re-auth-at-signing', () => {
    render(<GovernedActionSignoff signoff={highImpact} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/21 CFR 11\.100\(b\) intent/)).toBeTruthy();
    expect(screen.getByText(/verified at signing and are not reused/i)).toBeTruthy();
  });

  it('renders as a modal dialog naming the action and consequence', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The consequence message is the dialog's description.
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(reasonOnly.message)).toBeTruthy();
  });

  it('Escape cancels the dialog', () => {
    const onCancel = vi.fn();
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('associates the reason error via aria-invalid + aria-describedby when too short', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    const reason = screen.getByLabelText('Reason for change') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'short' } });
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    const describedby = reason.getAttribute('aria-describedby')!;
    const err = document.getElementById(describedby);
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toMatch(/at least 10 characters/i);
  });

  it('submits the reason + command to the governed-action route and reports outcome', async () => {
    const onResolved = vi.fn();
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={onResolved} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Advancing the milestone to in-review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ success: true, message: 'Milestone advanced.' }));
    const [url, opts] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/ana-ri/governed-action');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ command: 'update_milestone', reasonForChange: 'Advancing the milestone to in-review' });
    // reason-only tier does not send a password
    expect(body.password).toBeUndefined();
  });

  it('high-impact submit requires reason + re-auth + meaning and forwards them', async () => {
    const onResolved = vi.fn();
    render(<GovernedActionSignoff signoff={highImpact} onResolved={onResolved} onCancel={() => {}} />);
    const sign = screen.getByRole('button', { name: 'Sign and run' }) as HTMLButtonElement;

    // Reason alone is not enough: meaning + password are still required.
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Reverting to the verified version' },
    });
    expect(sign.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Approval' }));
    expect(sign.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Password (electronic signature)'), {
      target: { value: 'pw-secret' },
    });
    expect(sign.disabled).toBe(false);

    fireEvent.click(sign);
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.password).toBe('pw-secret');
    expect(body.params).toMatchObject({ signatureMeaning: 'APPROVER' });
  });

  it('keeps Confirm disabled until the reason is long enough', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirm and run' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'too short' } });
    expect(confirm.disabled).toBe(true);
  });
});

/*
 * Declining. Cancel on a live prompt closed the dialog and told the server
 * nothing, so AnA held the turn until the ten-minute ceiling — and since every
 * write became a proposal (P0-12), that would be most turns. A live prompt's
 * Cancel now tells the waiting run; a prompt from a finished turn has nothing
 * waiting, so it sends nothing.
 */
describe('GovernedActionSignoff — declining', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { declined: true } }) });
    (global as any).fetch = fetchMock;
  });

  it('on a live prompt, Cancel tells the waiting run', async () => {
    const onCancel = vi.fn();
    render(
      <GovernedActionSignoff
        signoff={{ ...confirmOnly, runId: 'run-1', toolUseId: 'tu-1' }}
        onResolved={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      runId: 'run-1',
      toolUseId: 'tu-1',
      decision: 'decline',
    });
  });

  it('Escape on a live prompt declines too', async () => {
    const onCancel = vi.fn();
    render(
      <GovernedActionSignoff
        signoff={{ ...reasonOnly, runId: 'run-1', toolUseId: 'tu-2' }}
        onResolved={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ toolUseId: 'tu-2', decision: 'decline' });
  });

  it('on a finished turn there is nothing waiting, and nothing is sent', async () => {
    const onCancel = vi.fn();
    render(<GovernedActionSignoff signoff={confirmOnly} onResolved={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
