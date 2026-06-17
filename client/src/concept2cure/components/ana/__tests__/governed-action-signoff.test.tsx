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

  it('submits the reason + command to the governed-action route and reports outcome', async () => {
    const onResolved = vi.fn();
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={onResolved} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Advancing the milestone to in-review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & run' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ success: true, message: 'Milestone advanced.' }));
    const [url, opts] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/ana-ri/governed-action');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ command: 'update_milestone', reasonForChange: 'Advancing the milestone to in-review' });
    // reason-only tier does not send a password
    expect(body.password).toBeUndefined();
  });

  it('keeps Confirm disabled until the reason is long enough', () => {
    render(<GovernedActionSignoff signoff={reasonOnly} onResolved={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirm & run' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'too short' } });
    expect(confirm.disabled).toBe(true);
  });
});
