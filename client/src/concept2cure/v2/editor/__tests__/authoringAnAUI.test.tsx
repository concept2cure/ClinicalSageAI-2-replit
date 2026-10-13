// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { AnaTurnRecordStatus } from '../../../components/ana/useAnaChat.types';
import { AuthoringOversightActions } from '../AuthoringOversightActions';
import { AuthoringRemedies } from '../AuthoringRemedies';

const SECTION = 'aaaaaaaa-0000-4000-8000-000000000001';
const TURN = 'eeeeeeee-0000-4000-8000-000000000001';
const record: AnaTurnRecordStatus = {
  status: 'recorded', id: TURN, sha256: 'b'.repeat(64),
  servedBy: [{ provider: 'anthropic', model: 'qualified-test-model', qualified: true, approvedForHighRisk: true, pq: 'pending' }],
};
const remedy = {
  sectionId: SECTION, baseUpdatedAt: '2026-10-13T10:00:00Z', quote: '18 months',
  replacement: '24 months', reason: 'Align the duration with the cited stability report.',
};
const answer = (replacement = remedy.replacement) => `Review findings.\n\n\`\`\`authoring-remedy\n${JSON.stringify({ ...remedy, replacement })}\n\`\`\``;
afterEach(cleanup);

describe('compact AnA oversight disclosure', () => {
  it('keeps the saved-record caveat visible and routes every disclosed option through the existing handler', async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    render(<AuthoringOversightActions projectOpen sectionOpen documentOpen dirty={false} onAsk={onAsk} />);
    const toggle = screen.getByText('Review with AnA');
    const options = toggle.closest('details')!;
    const caveat = screen.getByText(/AnA reads saved documents and project evidence/);
    expect(options.open).toBe(false);
    expect(caveat).toBeVisible();
    expect(toggle).toHaveAttribute('aria-describedby', caveat.id);
    expect(screen.getByText('Review section')).not.toBeVisible();
    await user.click(toggle);
    expect(options.open).toBe(true);
    for (const label of ['Review section', 'Review document', 'Reconcile project evidence', 'Prepare targeted fixes']) {
      await user.click(screen.getByRole('button', { name: label }));
    }
    expect(onAsk).toHaveBeenCalledTimes(4);
    expect(onAsk.mock.calls.every(([prompt]) => prompt.includes('unsaved editor changes are not included'))).toBe(true);
    await user.click(toggle);
    expect(options.open).toBe(false);
    expect(caveat).toBeVisible();
  });

  it('explains unavailable project scope outside the closed disclosure and keeps every review disabled', async () => {
    const onAsk = vi.fn();
    render(<AuthoringOversightActions projectOpen={false} sectionOpen={false} documentOpen={false} dirty={false} onAsk={onAsk} />);
    const caveat = screen.getByText(/Open a project so AnA can read/);
    expect(caveat).toBeVisible();
    await userEvent.click(screen.getByText('Review with AnA'));
    for (const action of screen.getAllByRole('button')) {
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute('aria-describedby', caveat.id);
      await userEvent.click(action);
    }
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('preserves selection gates and exposes the unsaved-record warning before expanding options', async () => {
    render(<AuthoringOversightActions projectOpen sectionOpen={false} documentOpen dirty onAsk={vi.fn()} />);
    expect(screen.getByText(/Your unsaved changes are not included/)).toBeVisible();
    await userEvent.click(screen.getByText('Review with AnA'));
    expect(screen.getByRole('button', { name: 'Review section' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prepare targeted fixes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review document' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reconcile project evidence' })).toBeEnabled();
  });
});

describe('AnA remedy reading and action disclosure', () => {
  it('keeps the reason, guarded action and status visible while exact semantic redline text is disclosed', async () => {
    const propose = vi.fn().mockResolvedValue({ ok: true });
    render(<AuthoringRemedies text={answer()} settled record={record} unfinished={false} target={{ editable: true, sectionId: SECTION, sectionCode: '3.2.P.8.1', propose }} />);
    expect(screen.getByRole('article')).toHaveAccessibleName('Proposed fix · 3.2.P.8.1');
    expect(screen.getByText(remedy.reason)).toBeVisible();
    const apply = screen.getByRole('button', { name: 'Apply as tracked suggestion' });
    const status = screen.getByRole('status');
    expect(apply).toBeVisible();
    expect(status).toBeVisible();
    expect(apply).toHaveAttribute('aria-describedby', status.id);
    expect(screen.getByText('18 months')).not.toBeVisible();
    await userEvent.click(screen.getByText('What changed'));
    const original = screen.getByText('18 months');
    const replacement = screen.getByText('24 months');
    expect(original).toBeVisible();
    expect(original.tagName).toBe('DEL');
    expect(original).toHaveClass('rdl-del');
    expect(replacement.tagName).toBe('INS');
    expect(replacement).toHaveClass('rdl-ins');
    await userEvent.click(screen.getByText('What changed'));
    await userEvent.click(apply);
    expect(propose).toHaveBeenCalledWith(remedy, { id: 'ana', name: 'AnA (proposed fix)', sourceRecord: TURN }, record, false);
    expect(await screen.findByRole('button', { name: 'Added as tracked suggestion' })).toBeDisabled();
    expect(screen.getByText(/This fix has not been saved or approved/)).toBeVisible();
  });

  it('does not hide a frozen-document refusal inside the passage disclosure', async () => {
    const propose = vi.fn();
    render(<AuthoringRemedies text={answer()} settled record={record} unfinished={false} target={{ editable: false, sectionCode: '3.2.P.8.1', propose }} />);
    const action = screen.getByRole('button', { name: 'Apply as tracked suggestion' });
    expect(action).toBeDisabled();
    expect(screen.getByText('This document is read-only or frozen.')).toBeVisible();
    expect(screen.getByText('18 months')).not.toBeVisible();
    await userEvent.click(action);
    expect(propose).not.toHaveBeenCalled();
  });

  it('identifies a deletion explicitly when its original passage is opened', async () => {
    render(<AuthoringRemedies text={answer('')} settled record={record} unfinished={false} />);
    expect(screen.getByText(/Open this document in the editor to apply the fix/)).toBeVisible();
    await userEvent.click(screen.getByText('What changed'));
    expect(screen.getByText('(delete this passage)', { exact: false })).toBeVisible();
    expect(screen.getByText('18 months').tagName).toBe('DEL');
    expect(document.querySelector('ins')).toBeNull();
  });
});
