// @vitest-environment jsdom
/**
 * Tests for the E5 Safety-Narrative UI surfaces:
 *   - SafetyNarrativeQcPanel    — the QC-checklist trust strip that renders the
 *                                 missing-required-fields list and the honesty
 *                                 verdict (sample / incomplete => non-sealable).
 *   - SafetyNarrativeAffordance — the guided form: live QC, honesty guard,
 *                                 single + batch submit composing the chain.
 *   - Composer flag-gating      — the "Safety narrative" chip is hidden unless
 *                                 ENABLE_ANA_DOCUMENT_STUDIO is on AND a submit
 *                                 handler is wired.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { SafetyNarrativeQcPanel } from '../SafetyNarrativeQcPanel';
import { SafetyNarrativeAffordance } from '../SafetyNarrativeAffordance';
import { Composer } from '../Composer';
import { computeNarrativeQc } from '../safetyNarrativeBatch';
import { type SafetyNarrativeSubmit } from '../SafetyNarrativeAffordance';
import { setFeatureEnabled, resetFeatureFlags } from '@/flags/featureFlags';

afterEach(() => {
  cleanup();
  resetFeatureFlags();
});

// ─────────────────────────────────────────────────────────────────────────────
// SafetyNarrativeQcPanel — QC checklist rendering + honesty verdict
// ─────────────────────────────────────────────────────────────────────────────

describe('SafetyNarrativeQcPanel', () => {
  it('renders a clear, sealable verdict with a present-count and live region', () => {
    const qc = computeNarrativeQc({
      subjectId: 'S-1',
      studyDrug: 'DRUG-X',
      medicalHistory: ['htn'],
      event: {
        term: 'rash',
        severity: 'mild',
        seriousnessCriteria: ['none'],
        actionTaken: 'none',
        outcome: 'recovered',
        causality: 'unrelated',
      },
    });
    render(<SafetyNarrativeQcPanel qc={qc} subjectId="S-1" />);
    expect(screen.getByText(/Narrative QC clear/)).toBeTruthy();
    expect(screen.getByText(/8 of 8 required fields present/)).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('verified');
  });

  it('renders the missing-required-fields list and a not-ready verdict', () => {
    const qc = computeNarrativeQc({ subjectId: 'S-2', event: { term: 'fever' } });
    render(<SafetyNarrativeQcPanel qc={qc} />);
    expect(screen.getByText(/not ready for sign-off/)).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('unverified');
    // Each required field label appears; the missing ones are marked.
    expect(screen.getByText('Study drug / investigational product')).toBeTruthy();
    expect(screen.getByText('Investigator causality')).toBeTruthy();
    // The event term IS present (supplied), so its row is marked present.
    const termRow = screen.getByText('Event term').closest('li') as HTMLLIElement;
    expect(termRow.getAttribute('data-present')).toBe('true');
    const drugRow = screen.getByText('Study drug / investigational product').closest('li') as HTMLLIElement;
    expect(drugRow.getAttribute('data-present')).toBe('false');
  });

  it('honesty guard: a complete SAMPLE case is flagged non-sealable in the UI', () => {
    const qc = computeNarrativeQc({
      subjectId: 'S-3',
      studyDrug: 'DRUG-X',
      medicalHistory: ['htn'],
      isSample: true,
      event: {
        term: 'rash',
        severity: 'mild',
        seriousnessCriteria: ['none'],
        actionTaken: 'none',
        outcome: 'recovered',
        causality: 'unrelated',
      },
    });
    render(<SafetyNarrativeQcPanel qc={qc} />);
    expect(screen.getByText(/not ready for sign-off/)).toBeTruthy();
    expect(screen.getByText(/Sample data — non-sealable\./)).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('unverified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SafetyNarrativeAffordance — guided form behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('SafetyNarrativeAffordance', () => {
  it('opens from the chip and shows the live QC checklist as facts are entered', () => {
    render(<SafetyNarrativeAffordance onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    expect(screen.getByLabelText('Guided safety narrative')).toBeTruthy();

    // QC strip appears once subject id / term has content.
    fireEvent.change(screen.getByLabelText(/Subject id/), { target: { value: 'S-9' } });
    fireEvent.change(screen.getByLabelText(/Event term/), { target: { value: 'nausea' } });
    expect(screen.getByText(/Narrative QC/)).toBeTruthy();
    expect(screen.getByText(/not ready for sign-off/)).toBeTruthy();
  });

  it('keeps submit disabled until both hard-required facts are present', () => {
    render(<SafetyNarrativeAffordance onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    const submit = screen.getByText('Draft, author & verify').closest('button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Subject id/), { target: { value: 'S-9' } });
    expect(submit.disabled).toBe(true); // term still missing
    fireEvent.change(screen.getByLabelText(/Event term/), { target: { value: 'nausea' } });
    expect(submit.disabled).toBe(false);
  });

  it('submits a single case, pinning the three tools and carrying the case set', () => {
    const onSubmit = vi.fn();
    render(<SafetyNarrativeAffordance onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    fireEvent.change(screen.getByLabelText(/Subject id/), { target: { value: 'S-9' } });
    fireEvent.change(screen.getByLabelText(/Event term/), { target: { value: 'nausea' } });
    fireEvent.click(screen.getByText('Draft, author & verify'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as SafetyNarrativeSubmit;
    expect(payload.tools).toEqual([
      'draft_safety_narrative',
      'author_docx_native',
      'verify_docx_against_source',
    ]);
    expect(payload.cases).toHaveLength(1);
    expect(payload.cases[0].subjectId).toBe('S-9');
    expect(payload.message).toContain('draft_safety_narrative');
  });

  it('honesty guard: the sample toggle marks the single case non-sealable', () => {
    const onSubmit = vi.fn();
    render(<SafetyNarrativeAffordance onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    fireEvent.change(screen.getByLabelText(/Subject id/), { target: { value: 'S-9' } });
    fireEvent.change(screen.getByLabelText(/Event term/), { target: { value: 'nausea' } });
    fireEvent.click(screen.getByText(/Sample data — narrative is illustrative/));
    fireEvent.click(screen.getByText('Draft, author & verify'));

    const payload = onSubmit.mock.calls[0][0] as SafetyNarrativeSubmit;
    expect(payload.cases[0].isSample).toBe(true);
    expect(computeNarrativeQc(payload.cases[0]).sealable).toBe(false);
    expect(payload.message).toContain('SAMPLE data');
  });

  it('batch mode parses a pasted listing and reports skipped malformed rows', () => {
    const onSubmit = vi.fn();
    render(<SafetyNarrativeAffordance onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    fireEvent.click(screen.getByText('Batch (line listing)'));
    const ta = screen.getByLabelText('Line listing (CSV / TSV / JSON)');
    // One good row, one row missing the subject id.
    fireEvent.change(ta, { target: { value: 'subject_id,term\nS-1,rash\n,fever' } });

    expect(screen.getByText(/1 case parsed/)).toBeTruthy();
    expect(screen.getByText(/1 row\(s\) skipped/)).toBeTruthy();
    expect(screen.getByText(/Row 2: Row is missing a subject id\./)).toBeTruthy();

    fireEvent.click(screen.getByText('Author 1 narratives'));
    const payload = onSubmit.mock.calls[0][0] as SafetyNarrativeSubmit;
    expect(payload.cases).toHaveLength(1);
    expect(payload.cases[0].subjectId).toBe('S-1');
    expect(payload.message).toContain('per-case QC summary');
  });

  it('does not submit when no batch rows are valid', () => {
    const onSubmit = vi.fn();
    render(<SafetyNarrativeAffordance onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('Open guided safety narrative'));
    fireEvent.click(screen.getByText('Batch (line listing)'));
    fireEvent.change(screen.getByLabelText('Line listing (CSV / TSV / JSON)'), {
      target: { value: 'subject_id,term\n,' },
    });
    const submit = screen.getByText('Author 0 narratives').closest('button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Composer flag-gating
// ─────────────────────────────────────────────────────────────────────────────

describe('Composer — Safety Narrative flag-gating', () => {
  beforeEach(() => {
    // ToolPicker fetches its catalog on mount; stub it so jsdom stays quiet.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ tools: [] }) } as unknown as Response),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
  };

  it('hides the Safety narrative chip when the flag is OFF (default)', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', false);
    render(<Composer {...baseProps} onSafetyNarrative={vi.fn()} />);
    expect(screen.queryByLabelText('Open guided safety narrative')).toBeNull();
  });

  it('shows the chip when the flag is ON and a submit handler is wired', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    render(<Composer {...baseProps} onSafetyNarrative={vi.fn()} />);
    expect(screen.getByLabelText('Open guided safety narrative')).toBeTruthy();
  });

  it('hides the chip when the flag is ON but no submit handler is wired', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    render(<Composer {...baseProps} />);
    expect(screen.queryByLabelText('Open guided safety narrative')).toBeNull();
  });
});
