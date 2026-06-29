// @vitest-environment jsdom
/**
 * Tests for GsprConformityAffordance (E7) — the flag-gated GSPR conformity
 * matrix authoring affordance:
 *   - renders nothing when ENABLE_ANA_DOCUMENT_STUDIO is off;
 *   - renders the matrix affordance when the flag is on;
 *   - disables "Author" and surfaces the reason when not assessed / sample
 *     (honesty contract — non-exportable);
 *   - emits the authoring plan (markdown + the 23 required strings) on click.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GsprConformityAffordance } from '../GsprConformityAffordance';
import { setFeatureEnabled, resetFeatureFlags } from '@/flags/featureFlags';
import {
  MDR_ANNEX_I_GSPR_CHECKLIST,
  type GsprMatrixInput,
} from '../gsprConformityMatrix';

afterEach(() => {
  cleanup();
  resetFeatureFlags();
});

function fullyAssessed(): GsprMatrixInput {
  return {
    deviceName: 'AcmeMonitor X1',
    rows: MDR_ANNEX_I_GSPR_CHECKLIST.map(item => ({
      id: item.id,
      applicability: 'applicable' as const,
      method: 'EN ISO 14971:2019',
      evidenceRefs: ['DOC-1'],
    })),
  };
}

describe('GsprConformityAffordance flag gating', () => {
  it('renders nothing when the Document Studio flag is off', () => {
    resetFeatureFlags(); // default: ENABLE_ANA_DOCUMENT_STUDIO = false
    const { container } = render(
      <GsprConformityAffordance input={fullyAssessed()} onAuthor={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/GSPR conformity matrix/i)).toBeNull();
  });

  it('renders the affordance when the flag is on', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    render(<GsprConformityAffordance input={fullyAssessed()} onAuthor={() => {}} />);
    expect(screen.getByText('GSPR conformity matrix — EU MDR Annex I')).toBeTruthy();
    expect(screen.getByText(/23 of 23 requirements assessed/)).toBeTruthy();
  });
});

describe('GsprConformityAffordance authoring', () => {
  it('emits an authoring plan with markdown and the 23 required strings on click', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const onAuthor = vi.fn();
    render(<GsprConformityAffordance input={fullyAssessed()} onAuthor={onAuthor} />);
    fireEvent.click(screen.getByText('Author GSPR conformity matrix'));
    expect(onAuthor).toHaveBeenCalledTimes(1);
    const plan = onAuthor.mock.calls[0][0];
    expect(plan.requiredStrings).toHaveLength(23);
    expect(plan.matrixMarkdown).toContain('GSPR-1');
    expect(plan.export.exportable).toBe(true);
  });
});

describe('GsprConformityAffordance honesty contract (non-exportable)', () => {
  it('disables Author and lists the not-assessed clauses', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const onAuthor = vi.fn();
    const partial: GsprMatrixInput = {
      deviceName: 'Partial device',
      rows: [{ id: 'GSPR-1', applicability: 'applicable', method: 'm', evidenceRefs: ['E'] }],
    };
    render(<GsprConformityAffordance input={partial} onAuthor={onAuthor} />);
    const btn = screen.getByText('Author GSPR conformity matrix').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/22 requirements not assessed/)).toBeTruthy();
    // listed missing clause anchors
    expect(screen.getByText('GSPR-2')).toBeTruthy();
    // clicking the disabled action does not emit a plan
    fireEvent.click(btn);
    expect(onAuthor).not.toHaveBeenCalled();
  });

  it('disables Author for a sample matrix even when fully assessed', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const onAuthor = vi.fn();
    render(
      <GsprConformityAffordance
        input={{ ...fullyAssessed(), isSample: true }}
        onAuthor={onAuthor}
      />,
    );
    const btn = screen.getByText('Author GSPR conformity matrix').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Sample matrix/)).toBeTruthy();
    fireEvent.click(btn);
    expect(onAuthor).not.toHaveBeenCalled();
  });
});
