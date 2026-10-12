// @vitest-environment jsdom
/**
 * The workbench's time-to-event field says what the engine reads (2026-10-12).
 *
 * The engine reads `effectSize` for a time-to-event design as the hazard-ratio
 * REDUCTION — HR = 1 − effectSize — documented at
 * `computation-engine.ts hazardRatio` and named in its own refusal. This panel
 * labelled that field "Hazard ratio", placeholder "e.g. 0.7".
 *
 * So an oncologist typing the hazard ratio their protocol states, 0.7, was
 * sizing for HR 0.300: 50 subjects where 550 is right at 80% power. Eleven
 * times under-sized, rendered as a computed total with a verdict chip beside
 * it, and nothing on screen contradicted the label — the assessment payload
 * carried only sampleSize, power and the judgment.
 *
 * The sibling surface (`Biostatistics.tsx`) labels the same engine field "HR
 * reduction". Two surfaces disagreed about what one engine input means, and
 * the one that was wrong is the one with the verdict chip.
 *
 * RED before the fix: the field reads "Hazard ratio", the placeholder is 0.7,
 * and no hint anywhere names the convention.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';

const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const ASSESS = '/api/statistical-defensibility/assess';

/** The engine's real answer for the HR 0.700 design (effectSize 0.3). */
const ASSESSED = {
  status: 'assessed',
  engine: 'deterministic',
  sampleSize: 550,
  power: 0.8,
  method: 'Log-rank test (Schoenfeld formula)',
  formula: 'Events = (z_a + z_b)^2 * (1+r)^2 / (r * ln(HR)^2), HR=0.700, events=247',
  assumptions: [
    { parameter: 'event_rate', value: 0.5, source: 'default', sensitivity: 'high' },
    { parameter: 'alpha', value: 0.05, source: 'default', sensitivity: 'moderate' },
  ],
  judgment: {
    overallVerdict: 'adequate', overallRisk: 'low', actionRecommendation: 'proceed',
    confidence: { level: 'high', score: 88, factors: [], limitations: [] },
    dimensions: [], fragility: { fragilityIndex: 20, category: 'robust', sensitiveParameters: [], narrative: 'Robust.' },
    endpointMethodFit: { fit: 'strong', suggestedMethod: 'Cox', currentMethod: 'Log-rank', rationale: 'Standard.', alternatives: [] },
    escalationReasons: [],
  },
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, u: string) => {
    if (u === ASSESS) return { ok: true, status: 200, json: async () => ({ success: true, data: ASSESSED }) } as Response;
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
  });
});
afterEach(() => cleanup());

/** Open the defensibility panel on a time-to-event design. */
function openSurvivalAssessment() {
  render(<BiostatWorkbench {...props()} />);
  const endpoint = screen.getByText(/Endpoint type/i).closest('label')!.querySelector('select') as HTMLSelectElement;
  fireEvent.change(endpoint, { target: { value: 'time_to_event' } });
}

describe('the time-to-event effect field', () => {
  it('is not labelled "Hazard ratio", which the engine does not read', () => {
    openSurvivalAssessment();
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent ?? '');
    const effectLabel = labels.find((t) => /hazard/i.test(t));
    expect(effectLabel, 'no hazard-related field was rendered at all').toBeTruthy();
    expect(
      /^Hazard ratio/.test(effectLabel!.trim()),
      `the field still reads "Hazard ratio": ${effectLabel}`,
    ).toBe(false);
  });

  it('names the reduction, and the HR = 1 − x relationship', () => {
    openSurvivalAssessment();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/reduction/i);
    expect(text).toMatch(/1\s*[−-]\s*(HR|hazard)|HR\s*=\s*1/i);
  });

  it('does not invite 0.7, the figure that sizes for HR 0.300', () => {
    openSurvivalAssessment();
    const inputs = Array.from(document.querySelectorAll('input'));
    const placeholders = inputs.map((i) => i.getAttribute('placeholder') ?? '');
    const effectInput = Array.from(document.querySelectorAll('label'))
      .find((l) => /hazard/i.test(l.textContent ?? ''))!
      .querySelector('input')!;
    expect(effectInput.getAttribute('placeholder')).not.toMatch(/0\.7/);
    expect(placeholders.join(' ')).toBeTruthy();
  });

  it('reverts to the standardized-effect label for a continuous endpoint', () => {
    render(<BiostatWorkbench {...props()} />);
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent ?? '');
    expect(labels.some((t) => /Effect size \(standardized\)/.test(t))).toBe(true);
    expect(labels.some((t) => /hazard/i.test(t))).toBe(false);
  });
});

describe('the assessment states what the engine computed', () => {
  it('shows the method and the formula, so the hazard ratio used is on screen', async () => {
    openSurvivalAssessment();
    const effectInput = Array.from(document.querySelectorAll('label'))
      .find((l) => /hazard/i.test(l.textContent ?? ''))!
      .querySelector('input')!;
    fireEvent.change(effectInput, { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: /assess/i }));

    await waitFor(() => expect(screen.getByText(/550/)).toBeTruthy());
    // The line that would have caught the mislabelling.
    expect(await screen.findByText(/HR=0\.700/)).toBeTruthy();
    expect(screen.getByText(/Schoenfeld/)).toBeTruthy();
  });

  it('shows the event rate it defaulted, which turns events into subjects', async () => {
    openSurvivalAssessment();
    fireEvent.click(screen.getByRole('button', { name: /assess/i }));
    await waitFor(() => expect(screen.getByText(/550/)).toBeTruthy());
    expect(screen.getByText(/event.rate/i)).toBeTruthy();
  });
});
