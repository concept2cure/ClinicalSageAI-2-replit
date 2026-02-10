/**
 * Phase 6.6.C-V2 — SEMatrixV2Panel Tests
 *
 * Validates:
 *   1. Panel renders with title and form fields
 *   2. K-Number input updates state
 *   3. Subject device fields render (all 9 SE characteristics)
 *   4. Generate button is disabled when K-Number is empty
 *   5. Generate button fires mutation on click
 *   6. Results table renders after generation
 *   7. Evidence tasks render with severity badges
 *   8. Download DOCX button appears after generation
 *   9. Readiness gauge displays score
 *
 * @phase 6.6.C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SEMatrixV2Panel } from './SEMatrixV2Panel';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock hooks
// ═══════════════════════════════════════════════════════════════════════════════

const mockGenerate = vi.fn();
const mockRenderDocx = vi.fn();

vi.mock('@/hooks/use-predicate-intelligence', () => ({
  useGenerateSEMatrixV2: () => ({
    mutate: mockGenerate,
    isPending: false,
    isError: false,
    error: null,
  }),
  useRenderSEDocxV2: () => ({
    mutate: mockRenderDocx,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeSEMatrixV2Response() {
  return {
    se_matrix_payload: {
      template_id: '510k_se_matrix_v2',
      version: '6.6.0',
      device_name: 'Test Device',
      predicate_k_number: 'K123456',
      predicate_device_name: 'Predicate Device',
      comparison_rows: [
        {
          sort_order: 1,
          characteristic: 'Intended Use',
          category: 'intended_use',
          subject_value: 'Blood glucose monitoring',
          predicate_value: 'Blood glucose monitoring',
          diff_flag: 'EQUIVALENT' as const,
          discussion_text: 'Identical',
          risk_code: null,
          evidence_task_ids: [],
          requires_citation: false,
          suggested_tests: [],
          diff_severity: 'none',
          subject_evidence_ids: [],
          predicate_evidence_ids: ['FDA_510k_K123456'],
          subject_confidence: 0.5,
          predicate_confidence: 0.9,
        },
        {
          sort_order: 2,
          characteristic: 'Materials',
          category: 'materials',
          subject_value: 'Titanium alloy',
          predicate_value: 'Stainless steel',
          diff_flag: 'DISCUSSION_REQUIRED' as const,
          discussion_text: 'Material change detected',
          risk_code: 'MATERIAL_CHANGE' as const,
          evidence_task_ids: ['abc123def456'],
          requires_citation: true,
          suggested_tests: ['ISO 10993-1'],
          diff_severity: 'high',
          subject_evidence_ids: [],
          predicate_evidence_ids: ['FDA_510k_K123456'],
          subject_confidence: 0.5,
          predicate_confidence: 0.9,
        },
      ],
      evidence_tasks: [
        {
          task_id: 'abc123def456',
          category: 'Biocompatibility',
          risk_code: 'MATERIAL_CHANGE',
          label: 'Material Change',
          severity: 'HIGH',
          recommended_artifacts: [
            'ISO 10993-1 Biological Evaluation Plan',
            'Chemical Characterization Report',
          ],
          mapping: {
            truth_machine_placeholder: true,
            se_matrix_linkable: true,
            ectd_section: 'Module 5, Section 5.3.4',
          },
        },
      ],
      defense_readiness_score: 65,
      generated_at: '2026-02-10T00:00:00Z',
      risk_code_map_version: '1.0.0',
      evidence_linkage: true,
      regulatory_standard: 'FDA_510k_SE',
    },
    defense_readiness_score: 65,
    row_count: 2,
    discussion_required_count: 1,
    significant_count: 0,
    evidence_task_count: 1,
    risk_code_map_version: '1.0.0',
    generation_timestamp: '2026-02-10T00:00:00Z',
  };
}

function renderPanel(props: Partial<Parameters<typeof SEMatrixV2Panel>[0]> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SEMatrixV2Panel programId="test-program-id" {...props} />
    </QueryClientProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SEMatrixV2Panel', () => {
  it('renders the panel title and description', () => {
    renderPanel();
    expect(screen.getByText('Evidence-Linked SE Matrix (V2)')).toBeInTheDocument();
    expect(screen.getByText(/Deterministic risk_code analysis/)).toBeInTheDocument();
  });

  it('renders K-Number input field', () => {
    renderPanel();
    expect(screen.getByLabelText('Predicate K-Number')).toBeInTheDocument();
  });

  it('pre-fills K-Number from props', () => {
    renderPanel({ predicateKNumber: 'K999999' });
    expect(screen.getByLabelText('Predicate K-Number')).toHaveValue('K999999');
  });

  it('renders all 9 subject device fields', () => {
    renderPanel();
    const expectedLabels = [
      'Intended Use',
      'Technology',
      'Materials',
      'Energy Source',
      'Sterilization',
      'Biocompatibility',
      'Software/Firmware',
      'Performance',
      'Labeling / General',
    ];
    for (const label of expectedLabels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('generate button is disabled when K-Number is empty', () => {
    renderPanel();
    const btn = screen.getByRole('button', { name: /Generate SE Matrix V2/i });
    expect(btn).toBeDisabled();
  });

  it('generate button is enabled when K-Number is provided', () => {
    renderPanel({ predicateKNumber: 'K123456' });
    const btn = screen.getByRole('button', { name: /Generate SE Matrix V2/i });
    expect(btn).toBeEnabled();
  });

  it('fires generate mutation when button is clicked', async () => {
    renderPanel({ predicateKNumber: 'K123456' });
    const btn = screen.getByRole('button', { name: /Generate SE Matrix V2/i });
    await userEvent.click(btn);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        program_id: 'test-program-id',
        selected_predicate_k_number: 'K123456',
        subject_device: expect.any(Object),
      }),
      expect.any(Object)
    );
  });

  it('does not show results before generation', () => {
    renderPanel({ predicateKNumber: 'K123456' });
    expect(screen.queryByText('Comparison Matrix')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidence Tasks')).not.toBeInTheDocument();
    expect(screen.queryByText(/Download V2 DOCX/)).not.toBeInTheDocument();
  });

  describe('after successful generation', () => {
    beforeEach(async () => {
      // Simulate successful generation by calling onSuccess callback
      mockGenerate.mockImplementation((params: any, opts: any) => {
        opts.onSuccess(makeSEMatrixV2Response());
      });
      renderPanel({ predicateKNumber: 'K123456' });
      const btn = screen.getByRole('button', { name: /Generate SE Matrix V2/i });
      await userEvent.click(btn);
    });

    it('shows comparison matrix table', () => {
      expect(screen.getByText('Comparison Matrix')).toBeInTheDocument();
    });

    it('renders comparison row data', () => {
      expect(screen.getByText('Intended Use')).toBeInTheDocument();
      expect(screen.getByText('Materials')).toBeInTheDocument();
    });

    it('shows diff flag badges', () => {
      expect(screen.getByText('EQUIVALENT')).toBeInTheDocument();
      expect(screen.getByText('DISCUSSION REQUIRED')).toBeInTheDocument();
    });

    it('shows risk code badge for material change', () => {
      expect(screen.getByText('MATERIAL_CHANGE')).toBeInTheDocument();
    });

    it('shows evidence tasks section', () => {
      expect(screen.getByText('Evidence Tasks')).toBeInTheDocument();
    });

    it('renders evidence task with severity badge', () => {
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('Material Change')).toBeInTheDocument();
    });

    it('shows recommended artifacts', () => {
      expect(screen.getByText('ISO 10993-1 Biological Evaluation Plan')).toBeInTheDocument();
      expect(screen.getByText('Chemical Characterization Report')).toBeInTheDocument();
    });

    it('shows summary stats', () => {
      // Row count
      expect(screen.getByText('2')).toBeInTheDocument();
      // Discussion required count
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('shows defense readiness score (65)', () => {
      expect(screen.getByText('65')).toBeInTheDocument();
      expect(screen.getByText('Defense Readiness')).toBeInTheDocument();
    });

    it('shows download DOCX button after generation', () => {
      expect(screen.getByRole('button', { name: /Download V2 DOCX/i })).toBeInTheDocument();
    });

    it('fires render DOCX mutation on download click', async () => {
      const btn = screen.getByRole('button', { name: /Download V2 DOCX/i });
      await userEvent.click(btn);

      expect(mockRenderDocx).toHaveBeenCalledTimes(1);
      expect(mockRenderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          program_id: 'test-program-id',
          selected_predicate_k_number: 'K123456',
        }),
        expect.any(Object)
      );
    });

    it('shows metadata footer', () => {
      expect(screen.getByText(/Version: 6.6.0/)).toBeInTheDocument();
      expect(screen.getByText(/Risk Map: 1.0.0/)).toBeInTheDocument();
      expect(screen.getByText(/Standard: FDA_510k_SE/)).toBeInTheDocument();
    });

    it('shows predicate info in table header', () => {
      expect(screen.getByText(/K123456/)).toBeInTheDocument();
    });
  });
});
