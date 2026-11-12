// @vitest-environment jsdom
/**
 * Quality tolerance limits that bite at or below a value, or at either end of a range (2026-11-12).
 *
 * The engine and the routes have kept all three kinds since migrations/20260930_rbm_qtl_direction.sql: `upper`
 * (a dropout rate), `lower` (endpoint data completeness) and `two_sided` (a randomisation ratio). The screen could
 * set only the first, drew every limit as an upper one, and said "lower-bound and two-sided QTLs are not supported
 * yet". The board did not send the direction at all, so a lower limit set through AnA or the API was drawn upside
 * down: a completeness of 82 against a floor of 90 filled most of a bar whose red zone was to its right.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));

import { RbmQtls } from '../surfaces/RbmSurfacesA';
import { ThresholdGauge, toleranceWords } from '../surfaces/RbmSurfaces';
import type { RbmBoard, RbmBoardQtl } from '../surfaces/rbmBoard';

const PROGRAM = '11111111-2222-3333-4444-555555555555';
const qtl = (over: Partial<RbmBoardQtl>): RbmBoardQtl => ({ id: 1, parameter: 'Dropout rate', rationale: 'Power', unit: null, secondary: 15, threshold: 20, current: 12, status: 'within', breachActionTaken: null, ...over });
const board = (qtls: RbmBoardQtl[]) => ({ programId: PROGRAM, qtls } as unknown as RbmBoard);
const ok = (data: unknown) => ({ ok: true, status: 201, json: async () => ({ data }) });

beforeEach(() => { h.request.mockReset().mockResolvedValue(ok({})); });
afterEach(() => cleanup());

describe('a limit in words', () => {
  it('says each kind the way a monitor would', () => {
    expect(toleranceWords({ threshold: 20, secondary: 15 })).toBe('warn 15 — limit 20');
    expect(toleranceWords({ direction: 'lower', threshold: 90, secondary: 93 })).toBe('limit 90 or below — warn at 93');
    expect(toleranceWords({ direction: 'lower', threshold: 90, secondary: null })).toBe('limit 90 or below');
    expect(toleranceWords({ direction: 'two_sided', threshold: 1.2, secondary: 1.1, thresholdLower: 0.8, secondaryLower: 0.9 })).toBe('range 0.8 to 1.2 — warn below 0.9 or above 1.1');
  });
});

describe('the bar for a lower limit and for a range', () => {
  it('puts a lower limit’s breach zone at the low end and marks the value with the engine’s status', () => {
    const { container } = render(<ThresholdGauge current={82} secondary={93} threshold={90} unit="%" direction="lower" status="breached" />);
    const err = container.querySelector('.rbm-gauge-band.err') as HTMLElement;
    const mark = container.querySelector('.rbm-gauge-mark') as HTMLElement;
    expect(err.style.left).toBe('0%');
    // The value sits inside the breach zone, which ends at the limit.
    expect(parseFloat(mark.style.left)).toBeLessThan(parseFloat(err.style.width));
    expect(mark.getAttribute('data-tone')).toBe('err');
    expect(container.querySelector('.rbm-gauge-fill')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Current 82%; limit 90% or below — warn at 93%');
  });

  it('never tones the mark from the numbers: the status is the engine’s', () => {
    // 95 is above a floor of 90. If the engine says approaching, the mark is amber, whatever the arithmetic.
    const { container } = render(<ThresholdGauge current={95} secondary={93} threshold={90} unit="" direction="lower" status="approaching" />);
    expect(container.querySelector('.rbm-gauge-mark')!.getAttribute('data-tone')).toBe('warn');
  });

  it('draws a range with a breach zone at each end', () => {
    const { container } = render(<ThresholdGauge current={1} secondary={1.1} threshold={1.2} unit="" direction="two_sided" thresholdLower={0.8} secondaryLower={0.9} status="within" />);
    expect(container.querySelectorAll('.rbm-gauge-band.err')).toHaveLength(2);
    expect(container.querySelectorAll('.rbm-gauge-band.warn')).toHaveLength(2);
    expect(container.querySelector('.rbm-gauge-mark')!.getAttribute('data-tone')).toBe('ok');
    expect(screen.getByText('range 0.8 to 1.2 — warn below 0.9 or above 1.1')).toBeTruthy();
  });

  it('leaves an upper limit drawn as it always was', () => {
    const { container } = render(<ThresholdGauge current={12} secondary={15} threshold={20} unit="" />);
    expect(container.querySelector('.rbm-gauge-fill')).toBeTruthy();
    expect(container.querySelector('.rbm-gauge-mark')).toBeNull();
    expect(screen.getByText('warn 15 — limit 20')).toBeTruthy();
  });
});

describe('the quality tolerance limits tab', () => {
  it('draws each limit in its own direction', () => {
    const { container } = render(<RbmQtls board={board([
      qtl({ id: 1 }),
      qtl({ id: 2, parameter: 'Primary endpoint completeness', direction: 'lower', threshold: 90, secondary: 93, current: 82, status: 'breached' }),
      qtl({ id: 3, parameter: 'Randomisation ratio', direction: 'two_sided', threshold: 1.2, secondary: 1.1, thresholdLower: 0.8, secondaryLower: 0.9, current: null, status: 'not_evaluated' }),
    ])} onReload={vi.fn()} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows[0].querySelector('.rbm-gauge-fill')).toBeTruthy();
    expect(rows[1].querySelector('.rbm-gauge-mark')!.getAttribute('data-tone')).toBe('err');
    // Not measured yet: the limits are still said, and nothing is drawn as within.
    expect(rows[2].textContent).toContain('Not yet measured — range 0.8 to 1.2 — warn below 0.9 or above 1.1');
    expect(rows[2].querySelector('.rbm-gauge')).toBeNull();
  });

  it('no longer says lower-bound and two-sided limits are unsupported', () => {
    const { container } = render(<RbmQtls board={board([qtl({})])} onReload={vi.fn()} />);
    expect(container.textContent).not.toMatch(/not supported yet|upper-bound only/);
    expect(container.textContent).toMatch(/at or below it \(endpoint data completeness\), or at either end of a range/);
  });

  it('creates a lower limit', async () => {
    render(<RbmQtls board={board([])} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New QTL/ }));
    fireEvent.change(screen.getByLabelText('Parameter'), { target: { value: 'Primary endpoint completeness' } });
    fireEvent.change(screen.getByLabelText(/^Rationale/), { target: { value: 'Estimand' } });
    fireEvent.change(screen.getByLabelText('The limit is breached when the value is'), { target: { value: 'lower' } });
    fireEvent.change(screen.getByLabelText(/^Primary tolerance limit/), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Secondary (early-warning) limit'), { target: { value: '93' } });
    // A lower bound typed for a one-sided limit is not sent: it belongs to a range only.
    fireEvent.change(screen.getByLabelText('Lower bound (a range only)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create QTL' }));
    await waitFor(() => expect(h.request).toHaveBeenCalled());
    expect(h.request).toHaveBeenCalledWith('POST', '/api/mdx/rbm-qtls', {
      programId: PROGRAM, parameter: 'Primary endpoint completeness', rationale: 'Estimand', direction: 'lower',
      secondaryLimit: 93, threshold: 90, thresholdLower: null, secondaryLimitLower: null, currentValue: null,
    });
  });

  it('opens a range for editing with all four of its limits, and saves them', async () => {
    render(<RbmQtls board={board([qtl({ id: 3, parameter: 'Randomisation ratio', direction: 'two_sided', threshold: 1.2, secondary: 1.1, thresholdLower: 0.8, secondaryLower: 0.9, current: 1 })])} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect((screen.getByLabelText('The limit is breached when the value is') as HTMLSelectElement).value).toBe('two_sided');
    expect((screen.getByLabelText('Lower bound (a range only)') as HTMLInputElement).value).toBe('0.8');
    expect((screen.getByLabelText('Lower early-warning limit (a range only)') as HTMLInputElement).value).toBe('0.9');
    fireEvent.change(screen.getByLabelText('Lower bound (a range only)'), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await waitFor(() => expect(h.request).toHaveBeenCalled());
    expect(h.request).toHaveBeenCalledWith('PATCH', '/api/mdx/rbm-qtls/3', expect.objectContaining({ direction: 'two_sided', threshold: 1.2, thresholdLower: 0.75, secondaryLimitLower: 0.9, secondaryLimit: 1.1 }));
  });

  it('shows the server’s refusal of a range that is not one, and keeps the form open', async () => {
    h.request.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'A two-sided limit needs a lower bound below its upper bound.' }) });
    render(<RbmQtls board={board([])} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New QTL/ }));
    fireEvent.change(screen.getByLabelText('Parameter'), { target: { value: 'Ratio' } });
    fireEvent.change(screen.getByLabelText(/^Rationale/), { target: { value: 'Balance' } });
    fireEvent.change(screen.getByLabelText('The limit is breached when the value is'), { target: { value: 'two_sided' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create QTL' }));
    expect((await screen.findAllByText('A two-sided limit needs a lower bound below its upper bound.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'New quality tolerance limit' })).toBeTruthy();
  });
});
