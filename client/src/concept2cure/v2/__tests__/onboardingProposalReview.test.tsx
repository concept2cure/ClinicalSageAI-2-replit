// @vitest-environment jsdom
/**
 * OnboardingProposalReview — the human approval gate (P3 UI).
 * Locks the honesty contract: only human-APPROVED, non-empty fields are
 * committed, edits flow through, and nothing commits with zero approvals.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingProposalReview } from '../surfaces/OnboardingProposalReview';
import type { OnboardingProposalGroup } from '@shared/types/onboarding-ingest';

const groups: OnboardingProposalGroup[] = [
  {
    entity: 'org_profile',
    label: 'Organization profile',
    fields: [
      { id: 'name', entity: 'org_profile', targetField: 'org_profile.name', label: 'Organization name', value: 'Meridian Therapeutics', extractedValue: 'Meridian Therapeutics', provenance: { file: 'profile.pdf', page: 1 }, confidence: 0.94, status: 'proposed' },
      { id: 'area', entity: 'org_profile', targetField: 'org_profile.therapeuticArea', label: 'Therapeutic area', value: 'Oncology', extractedValue: 'Oncology', provenance: { file: 'profile.pdf', page: 2 }, confidence: 0.55, status: 'needs_review' },
    ],
  },
];

describe('OnboardingProposalReview — approval gate', () => {
  it('commits ONLY approved, non-empty fields (with edits), never on zero approvals', () => {
    const onCommit = vi.fn();
    render(<OnboardingProposalReview groups={groups} onCommit={onCommit} />);

    // Nothing approved yet → Apply is disabled and reports 0.
    const applyBtn = screen.getByRole('button', { name: /Apply 0 approved/i }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    fireEvent.click(applyBtn);
    expect(onCommit).not.toHaveBeenCalled();

    // Approve just the org name.
    const approveButtons = screen.getAllByRole('button', { name: /Approve$/i });
    fireEvent.click(approveButtons[0]);

    // Still blocked: a Part 11 reason-for-change is the human's own words and is
    // never synthesized for them.
    const apply1 = screen.getByRole('button', { name: /Apply 1 approved field/i }) as HTMLButtonElement;
    expect(apply1.disabled).toBe(true);
    fireEvent.click(apply1);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Reason for change/i), {
      target: { value: 'Confirmed against the uploaded company profile.' },
    });
    expect((screen.getByRole('button', { name: /Apply 1 approved field/i }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Apply 1 approved field/i }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [approved, reason] = onCommit.mock.calls[0];
    expect(approved).toHaveLength(1);
    expect(approved[0].targetField).toBe('org_profile.name');
    expect(approved[0].status).toBe('approved');
    // The human's own rationale, verbatim — not a generated sentence.
    expect(reason).toBe('Confirmed against the uploaded company profile.');
  });

  it('never fabricates a reason: a blank/too-short reason blocks Apply', () => {
    const onCommit = vi.fn();
    render(<OnboardingProposalReview groups={groups} onCommit={onCommit} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Approve$/i })[0]);
    fireEvent.change(screen.getByLabelText(/Reason for change/i), { target: { value: 'too short' } });
    const apply = screen.getByRole('button', { name: /Apply 1 approved field/i }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('surfaces low-confidence fields as "needs review"', () => {
    render(<OnboardingProposalReview groups={groups} onCommit={vi.fn()} />);
    // getByText throws if absent — presence IS the assertion.
    expect(screen.getByText(/needs review/i)).toBeTruthy();
  });

  it('shows provenance for each proposed value', () => {
    render(<OnboardingProposalReview groups={groups} onCommit={vi.fn()} />);
    expect(screen.getByText(/profile\.pdf · p\.1/)).toBeTruthy();
  });
});
