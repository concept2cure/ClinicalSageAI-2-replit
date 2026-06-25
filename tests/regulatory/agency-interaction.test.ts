import { describe, it, expect } from 'vitest';
import {
  registrationStatusForDeficiency,
  registrationStatusForDecision,
  canAdvanceCommitment,
  isBindingCommitment,
  meetingsForSegment,
  COMMITMENT_TRANSITIONS,
} from '../../shared/regulatory/agency-interaction';

describe('interaction → registration effect', () => {
  it('marketing deficiencies put the registration into deficiency', () => {
    expect(registrationStatusForDeficiency('complete_response')).toBe('deficiency');
    expect(registrationStatusForDeficiency('refuse_to_file')).toBe('deficiency');
    expect(registrationStatusForDeficiency('not_substantially_equivalent')).toBe('deficiency');
  });

  it('a clinical hold acts on the IND, not a marketing registration', () => {
    expect(registrationStatusForDeficiency('clinical_hold')).toBeNull();
  });

  it('decisions drive approved / withdrawn', () => {
    expect(registrationStatusForDecision('approved')).toBe('approved');
    expect(registrationStatusForDecision('refused')).toBe('withdrawn');
    expect(registrationStatusForDecision('withdrawn')).toBe('withdrawn');
  });
});

describe('commitment lifecycle + binding classification', () => {
  it('advances open → in_progress → fulfilled, and overdue can recover', () => {
    expect(canAdvanceCommitment('open', 'in_progress')).toBe(true);
    expect(canAdvanceCommitment('in_progress', 'fulfilled')).toBe(true);
    expect(canAdvanceCommitment('in_progress', 'overdue')).toBe(true);
    expect(canAdvanceCommitment('overdue', 'fulfilled')).toBe(true);
    // terminal states don't advance
    expect(canAdvanceCommitment('fulfilled', 'open')).toBe(false);
    expect(COMMITMENT_TRANSITIONS.released).toEqual([]);
  });

  it('classifies binding vs agreed commitments correctly', () => {
    expect(isBindingCommitment('pmr')).toBe(true);            // statutory
    expect(isBindingCommitment('rems')).toBe(true);
    expect(isBindingCommitment('specific_obligation')).toBe(true); // EU conditional MA
    expect(isBindingCommitment('pmc')).toBe(false);           // agreed, non-statutory
    expect(isBindingCommitment('annual_reportable')).toBe(false);
  });
});

describe('meetings by segment', () => {
  it('drug/biologic programs get pre-IND / EOP2 / pre-NDA', () => {
    const m = meetingsForSegment('pharma');
    expect(m).toContain('pre_ind');
    expect(m).toContain('end_of_phase_2');
    expect(m).toContain('pre_nda_bla');
  });

  it('device/IVD programs get Q-Sub / pre-sub instead', () => {
    const m = meetingsForSegment('device');
    expect(m).toContain('q_submission');
    expect(m).not.toContain('pre_ind');
  });
});
