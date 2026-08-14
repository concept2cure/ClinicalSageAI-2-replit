// @vitest-environment jsdom
/**
 * BiostatWorkbench — proves the surface drives the REAL statistical engines.
 *
 * ── What changed, and why the tests changed shape ────────────────────────────
 * The workbench used to hold two hand-written forms and reach one of the fifteen
 * design-stats engines mounted under `/api/biostat`. It now renders every engine
 * from a declarative registry, so the interesting property is no longer "the
 * assurance form posts to the assurance endpoint" — it is that EVERY calculator
 * posts to its declared endpoint with a body the server will actually accept.
 *
 * The old tests selected inputs by position (`textboxes[length - 3]`), which
 * could only ever describe one fixed layout and would silently start asserting
 * about a different field the moment one was added. These select by label.
 *
 * ── The test that carries the most weight ────────────────────────────────────
 * `buildRequestBody` is exercised against the whole registry with a synthetic
 * filled-in form, and every calculator must produce a body with no missing
 * required fields. That is what stops a registry entry from shipping with a
 * typo'd key that the server silently ignores — the failure mode a screenshot
 * would never reveal, because the form looks right and the server returns 200
 * using its own defaults.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';
import {
  CALCULATORS,
  buildRequestBody,
  initialValues,
  isFieldVisible,
  parseNumberList,
  parseRowLines,
  setPath,
} from '../surfaces/biostatCalculators';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
function fail(status: number, error?: string) {
  return { ok: false, status, json: async () => ({ success: false, error }) } as Response;
}
const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string, body?: any) => {
    if (url === '/api/statistical-defensibility/assess') {
      return ok({ overallScore: 78, overallRating: 'Moderate', reviewerRiskLevel: 'Medium', criticalIssues: ['No multiplicity adjustment for the key secondary'], majorIssues: [], recommendations: ['Pre-specify the estimand per ICH E9(R1)'] });
    }
    if (url === '/api/biostat/assurance') return ok({ assurance: 0.72, powerAtPriorMean: 0.9, nPerArm: body.nPerArm });
    return ok({});
  });
});

/** Fill a labeled input. Labels are unique within a rendered calculator panel. */
function fill(label: RegExp | string, value: string) {
  const el = screen.getByLabelText(label);
  fireEvent.change(el, { target: { value } });
}
function selectCalculator(title: string) {
  fireEvent.click(screen.getByRole('button', { name: title }));
}

describe('BiostatWorkbench — real statistical engine', () => {
  it('runs a reviewer-risk defensibility assessment and renders the server result', async () => {
    render(<BiostatWorkbench {...props()} />);
    fill(/^Indication$/, 'NSCLC');
    fill(/^Study design$/, 'randomized double-blind');
    fill(/^Primary endpoint$/, 'PFS');
    fireEvent.click(screen.getByRole('button', { name: /Assess defensibility/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/statistical-defensibility/assess');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ indication: 'NSCLC', studyDesign: 'randomized double-blind', primaryEndpoint: 'PFS' });
    });
    expect(await screen.findByText('78')).toBeTruthy();
    expect(screen.getByText(/No multiplicity adjustment/)).toBeTruthy();
    expect(screen.getByText(/Pre-specify the estimand/)).toBeTruthy();
  });

  it('computes assurance from the real design-stats endpoint and renders only the response', async () => {
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/assurance');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ priorMean: 0.4, priorSd: 0.15, nPerArm: 120 });
    });
    // Rendered from the server's response — the browser computes nothing.
    expect(await screen.findByText('0.72')).toBeTruthy();
    expect(screen.getByText('Power At Prior Mean')).toBeTruthy();
  });

  it('omits a blank optional field rather than sending a placeholder value', async () => {
    // The handlers branch on `typeof x === 'number'`, so sending 0 for a blank
    // alpha would silently opt into a different code path than leaving it out.
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/assurance');
      expect(call).toBeTruthy();
      expect('alpha' in call![2]).toBe(false);
    });
  });

  it('blocks submission with a named field instead of posting an incomplete body', async () => {
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    expect(await screen.findByText(/Prior SD is required/)).toBeTruthy();
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/assurance')).toBeFalsy();
  });

  it('surfaces the server’s own error text, not a generic failure', async () => {
    // The usual cause of a rejection is a domain constraint the form cannot
    // check locally — an information fraction that does not end at 1, a
    // covariance ordering violation. Replacing that with "Calculation failed"
    // throws away the only thing that tells the user what to change.
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/biostat/assurance'
        ? fail(400, 'priorSd must be positive')
        : ok({})
    );
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    expect(await screen.findByText('priorSd must be positive')).toBeTruthy();
  });

  it('says to sign in on a 401 rather than showing an empty result', async () => {
    apiRequest.mockImplementation(async () => fail(401));
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    expect(await screen.findByText(/Sign in to your tenant/)).toBeTruthy();
  });

  it('offers every registered engine, and switching clears the previous form', async () => {
    render(<BiostatWorkbench {...props()} />);
    for (const calc of CALCULATORS) {
      expect(screen.getByRole('button', { name: calc.title }), calc.id).toBeTruthy();
    }

    fill(/Prior mean effect/, '0.4');
    selectCalculator('Restricted mean survival time');
    // A leftover value under a key the next engine also uses would be sent
    // silently, so the panel is remounted per calculator.
    expect(screen.queryByLabelText(/Prior mean effect/)).toBeNull();
    expect(screen.getByLabelText(/Restriction time/)).toBeTruthy();

    selectCalculator('Assurance (Bayesian power)');
    expect((screen.getByLabelText(/Prior mean effect/) as HTMLInputElement).value).toBe('');
  });

  it('posts nested and row-shaped bodies correctly — RMST arms', async () => {
    render(<BiostatWorkbench {...props()} />);
    selectCalculator('Restricted mean survival time');
    fill(/Restriction time/, '24');
    fill(/Treatment — times/, '4, 9, 12');
    fill(/Treatment — event flags/, '1, 1, 0');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/survival/rmst');
      expect(call).toBeTruthy();
      // Dotted keys must have become a nested object, which is what the handler reads.
      expect(call![2]).toMatchObject({ tau: 24, treatment: { times: [4, 9, 12], events: [1, 1, 0] } });
      expect('control' in call![2]).toBe(false);
    });
  });

  it('sends a calculator’s fixed mode discriminator', async () => {
    render(<BiostatWorkbench {...props()} />);
    selectCalculator('Diagnostic study sizing — co-primary');
    for (const [label, v] of [
      [/Sensitivity goal/, '0.85'], [/Sensitivity expected/, '0.92'],
      [/Specificity goal/, '0.9'], [/Specificity expected/, '0.96'],
      [/Prevalence/, '0.2'],
    ] as Array<[RegExp, string]>) fill(label, v);
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/diagnostic/sizing');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ mode: 'co-primary', sensitivityGoal: 0.85, prevalence: 0.2 });
    });
  });

  it('shows only the fields that apply to the selected mode', async () => {
    render(<BiostatWorkbench {...props()} />);
    selectCalculator('Bayesian device study sizing');
    // Default mode is sizing.
    expect(screen.getByLabelText(/Expected rate/)).toBeTruthy();
    expect(screen.queryByLabelText(/Successes at interim/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Mode$/), { target: { value: 'predictive' } });
    expect(screen.getByLabelText(/Successes at interim/)).toBeTruthy();
    expect(screen.queryByLabelText(/Expected rate/)).toBeNull();
  });
});

describe('the calculator registry builds bodies the server will accept', () => {
  /** A plausible value for a field, good enough to prove the body is well formed. */
  function sampleFor(kind: string, placeholder?: string): string {
    if (placeholder) return placeholder;
    return kind === 'rows' ? '1, 2' : kind === 'numlist' ? '1, 2' : kind === 'text' ? 'x' : '1';
  }

  it.each(CALCULATORS.map(c => [c.title, c] as const))(
    '%s produces a complete body from a filled form',
    (_title, calc) => {
      const values = initialValues(calc);
      for (const f of calc.fields) {
        if (isFieldVisible(f, values)) values[f.key] = sampleFor(f.kind, f.placeholder);
      }
      const { body, errors } = buildRequestBody(calc, values);
      expect(errors).toEqual([]);
      // Every fixed discriminator survives into the body.
      for (const [k, v] of Object.entries(calc.fixedBody ?? {})) {
        expect((body as any)[k]).toBe(v);
      }
      // And every visible field left a mark somewhere in it.
      for (const f of calc.fields) {
        if (!isFieldVisible(f, values)) continue;
        const root = f.key.split('.')[0];
        expect(body, `${calc.id}: ${f.key}`).toHaveProperty(root);
      }
    }
  );

  it.each(CALCULATORS.map(c => [c.title, c] as const))(
    '%s reports every missing required field when the form is empty',
    (_title, calc) => {
      const values = initialValues(calc);
      const required = calc.fields.filter(f => !f.optional && isFieldVisible(f, values) && f.kind !== 'select');
      const { errors } = buildRequestBody(calc, values);
      expect(errors.length).toBe(required.length);
    }
  );

  it('every calculator has a distinct id and a path under /api/biostat', () => {
    const ids = CALCULATORS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CALCULATORS) {
      expect(c.path.startsWith('/'), c.id).toBe(true);
      expect(c.about.length, c.id).toBeGreaterThan(60);
    }
  });

  it('a select field always starts on a real option', () => {
    // A select initialized to '' would post an empty discriminator, and the
    // handlers compare it by equality — the request would fall through to a
    // branch the user did not choose.
    for (const calc of CALCULATORS) {
      const values = initialValues(calc);
      for (const f of calc.fields) {
        if (f.kind !== 'select') continue;
        expect(f.options?.length, `${calc.id}.${f.key}`).toBeGreaterThan(0);
        expect(f.options!.map(o => o.value)).toContain(values[f.key]);
      }
    }
  });
});

describe('the request-body helpers', () => {
  it('setPath builds nested objects for dotted keys', () => {
    const o: Record<string, any> = {};
    setPath(o, 'prior.alpha', 2);
    setPath(o, 'prior.beta', 3);
    setPath(o, 'goal', 0.9);
    expect(o).toEqual({ prior: { alpha: 2, beta: 3 }, goal: 0.9 });
  });

  it('parseNumberList accepts commas or whitespace and rejects anything else', () => {
    expect(parseNumberList('1, 2,3')).toEqual([1, 2, 3]);
    expect(parseNumberList('0.5 1')).toEqual([0.5, 1]);
    expect(parseNumberList('-1, 2e-3')).toEqual([-1, 0.002]);
    expect(parseNumberList('1, x')).toBeNull();
    expect(parseNumberList('  ')).toBeNull();
  });

  it('parseRowLines returns one list per non-empty line', () => {
    expect(parseRowLines('1, 2\n3, 4')).toEqual([[1, 2], [3, 4]]);
    expect(parseRowLines('1, 2\n\n 3, 4 \n')).toEqual([[1, 2], [3, 4]]);
    expect(parseRowLines('1, 2\nbad')).toBeNull();
  });

  it('rejects a non-integer where the engine requires a whole number', () => {
    const calc = CALCULATORS.find(c => c.id === 'assurance')!;
    const { errors } = buildRequestBody(calc, { priorMean: '0.4', priorSd: '0.15', nPerArm: '12.5' });
    expect(errors.join(' ')).toMatch(/whole number/);
  });

  it('shapes win-ratio rows into the subject/hierarchy structures the engine expects', () => {
    const calc = CALCULATORS.find(c => c.id === 'win-ratio')!;
    const { body, errors } = buildRequestBody(calc, {
      treatment: '12, 4\n8, 2',
      control: '6, 1\n9, 3',
      hierarchy: '1\n0',
      confLevel: '',
    });
    expect(errors).toEqual([]);
    expect(body).toMatchObject({
      treatment: [
        { levels: [{ value: 12 }, { value: 4 }] },
        { levels: [{ value: 8 }, { value: 2 }] },
      ],
      hierarchy: [
        { type: 'continuous', direction: 'higher-better' },
        { type: 'continuous', direction: 'lower-better' },
      ],
    });
    expect('confLevel' in body).toBe(false);
  });

  it('shapes enrollment rows into SiteConfig objects, dropping absent trailing fields', () => {
    const calc = CALCULATORS.find(c => c.id === 'enrollment')!;
    const { body } = buildRequestBody(calc, { sites: '0.8, 0.3, 0\n1.2', targetN: '300', time: '', seed: '', nSim: '' });
    expect(body.sites).toEqual([
      { meanRate: 0.8, rateCv: 0.3, activationTime: 0 },
      { meanRate: 1.2 },
    ]);
    expect(body).toMatchObject({ targetN: 300 });
  });
});
