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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

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

/* A governed document is created in the open project and nowhere else (PF-07,
   founder decision 2026-09-26), so every case runs with one open: without it
   the filing write is never attempted, and the BP-W2-4 cases below would pass
   or fail for that reason alone. The no-project case clears it explicitly. */
const PROGRAM = '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60';
const setProject = (p: unknown) => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = p;
};

afterEach(() => {
  cleanup();
  setProject(undefined);
});
beforeEach(() => {
  setProject({ id: PROGRAM });
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

  it('blocks submission and marks the offending field, not just a summary', async () => {
    // WCAG 2.2 SC 3.3.1 asks for the item in error to be IDENTIFIED. A single
    // toast string says something is wrong without saying which of fifteen
    // controls, so the message is rendered at the field and referenced by
    // aria-describedby, with aria-invalid marking the control itself.
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));

    await waitFor(() => expect(screen.getAllByText(/Prior SD is required/).length).toBeGreaterThan(0));
    const priorSd = screen.getByLabelText(/^Prior SD/) as HTMLInputElement;
    expect(priorSd.getAttribute('aria-invalid')).toBe('true');
    expect(priorSd.getAttribute('aria-describedby')).toContain('priorSd-err');
    // The field the user DID fill must not be marked.
    expect(screen.getByLabelText(/Prior mean effect/).getAttribute('aria-invalid')).toBeNull();
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/assurance')).toBeFalsy();
  });

  it('clears a field’s error as soon as the user acts on it', async () => {
    // Leaving the message up while they type asserts the new value is wrong too.
    render(<BiostatWorkbench {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    const priorSd = screen.getByLabelText(/^Prior SD/) as HTMLInputElement;
    await waitFor(() => expect(priorSd.getAttribute('aria-invalid')).toBe('true'));
    fireEvent.change(priorSd, { target: { value: '0.15' } });
    expect(priorSd.getAttribute('aria-invalid')).toBeNull();
  });

  it('announces the toast through a live region', async () => {
    // The toast is the only channel for "submission refused" and for results.
    // Without a live region a screen-reader user submits and is told nothing.
    // Selected by class, not role: EmptyState is a live region too, so
    // getByRole('status') is ambiguous on a surface that renders both.
    render(<BiostatWorkbench {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    const toast = await waitFor(() => {
      const el = document.querySelector('.de-toast');
      if (!el) throw new Error('no toast');
      return el as HTMLElement;
    });
    // A REFUSAL, so it is an alert rather than a polite status — and it carries
    // `data-tone="error"`, which is what stops it drawing the green success
    // tick. This assertion used to require `status` + `polite`: the surface
    // could not express failure at all, so the only live region it could
    // produce was the reassuring one, and the test pinned that as correct.
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('data-tone')).toBe('error');
  });
});

describe('BiostatWorkbench — real statistical engine, controls and errors', () => {
  it('marks the selected calculator for assistive technology, not by colour alone', () => {
    render(<BiostatWorkbench {...props()} />);
    expect(screen.getByRole('button', { name: CALCULATORS[0].title }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: CALCULATORS[1].title }).getAttribute('aria-pressed')).toBe('false');
  });

  it('the raw-response disclosure reports its expanded state', async () => {
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    const toggle = await screen.findByRole('button', { name: /raw response/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /raw response/ }).getAttribute('aria-expanded')).toBe('true');
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
      const { body, errors, fieldErrors } = buildRequestBody(calc, values);
      expect(errors).toEqual([]);
      expect(fieldErrors).toEqual({});
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
      const { errors, fieldErrors } = buildRequestBody(calc, values);
      expect(errors.length).toBe(required.length);
      // Every summary line is also attributable to the control it is about.
      expect(Object.keys(fieldErrors).sort()).toEqual(required.map(f => f.key).sort());
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

describe('BP-W2-4 — a computed result files into a governed section, stamp intact', () => {
  const FULL_HASH = 'a'.repeat(64);

  it('Insert into document writes the tabulated result plus the FULL provenance hash', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') {
        return ok({
          assurance: 0.771146,
          powerAtPriorMean: 0.872528,
          provenance: {
            engine: 'c2c-stats', engineVersion: '1.0.0', method: 'assurance-two-sample-means',
            seed: 12345, inputsSha256: FULL_HASH, reproducible: true,
          },
        });
      }
      // The authoring routes answer with a top-level envelope, not {data}.
      if (url === '/api/authoring/docs') {
        return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-1' } }) } as Response;
      }
      if (url === '/api/authoring/sections') {
        return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-1' } }) } as Response;
      }
      return ok({});
    });

    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));

    await waitFor(() => {
      const sec = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections');
      expect(sec, 'no section write happened').toBeTruthy();
      // The document is created in the open project (PF-07), never org-wide.
      const doc = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs');
      expect(doc, 'no document create happened').toBeTruthy();
      expect(doc![2]).toMatchObject({ client_program_id: PROGRAM });
      const content: string = sec![2].content;
      // A real table — the export parser turns exactly this markup into
      // w:tbl — carrying the numbers the user saw…
      expect(content).toContain('<table>');
      expect(content).toContain('0.771146');
      // …and the stamp with the FULL hash, not the 12-char display truncation.
      expect(content).toContain(`inputs ${FULL_HASH}`);
      expect(content).toContain('reproducible');
    });
  });

  it('a failed filing is toasted and nothing pretends to have saved', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') {
        return ok({ assurance: 0.7, provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', method: 'assurance', seed: 1, inputsSha256: FULL_HASH, reproducible: true } });
      }
      if (url === '/api/authoring/docs') {
        return { ok: false, status: 503, json: async () => ({ error: 'PENDING_STORE' }) } as any;
      }
      return ok({});
    });

    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t create the document/)).toBeTruthy();
    });
    // No section write was attempted after the document create failed.
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections')).toBeFalsy();
    // The create that failed was the one bound to the open project.
    const doc = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs');
    expect(doc, 'no document create was attempted').toBeTruthy();
    expect(doc![2]).toMatchObject({ client_program_id: PROGRAM });
  });

});

describe('D4 — structured scientific result fidelity in Authoring', () => {
  const FULL_HASH = 'a'.repeat(64);

  it('files every displayed result table, later-row columns and all rows with the full stamp', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') {
        return ok({
          assurance: 0.72,
          ocTable: Array.from({ length: 65 }, (_, i) => ({
            drift: i,
            power: i === 0 ? 0.0250000000000123 : i / 100,
            ...(i === 1 ? { stoppedEarly: false, note: '<script>not markup</script>', interval: { lower: null, upper: 3.14 } } : {}),
          })),
          provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', method: 'assurance', inputsSha256: FULL_HASH, reproducible: true },
        });
      }
      if (url === '/api/authoring/docs') return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-grid' } }) } as Response;
      if (url === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-grid' } }) } as Response;
      return ok({});
    });

    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    expect(await screen.findByText('Oc Table')).toBeTruthy();
    expect(screen.getByText(/Showing 60 of 65 rows/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Insert into document/ }));

    await waitFor(() => {
      const section = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections');
      expect(section).toBeTruthy();
      const content: string = section![2].content;
      for (const expected of ['Oc Table', 'Drift', 'Power', 'Stopped Early', '0.0250000000000123', '<td>64</td><td>0.64</td>', '&lt;script&gt;not markup&lt;/script&gt;', '{"lower":null,"upper":3.14}', `inputs ${FULL_HASH}`]) {
        expect(content).toContain(expected);
      }
      expect(content).not.toContain('<script>');
      expect(apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs')![2]).toMatchObject({ client_program_id: PROGRAM, module: 'M5' });
    });
    expect(screen.getByRole('columnheader', { name: 'Stopped Early' })).toBeTruthy();
    expect(screen.getByText('0.0250000000000123')).toBeTruthy();
  });

  it('can file a table-only result with heterogeneous and null rows', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') return ok({ grid: [{ drift: 0 }, null, { power: 0.987654321012345 }], provenance: { inputsSha256: FULL_HASH } });
      if (url === '/api/authoring/docs') return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-table' } }) } as Response;
      if (url === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-table' } }) } as Response;
      return ok({});
    });
    render(<BiostatWorkbench {...props()} />);
    fill(/Prior mean effect/, '0.4'); fill(/^Prior SD/, '0.15'); fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));
    await waitFor(() => {
      const section = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections');
      expect(section).toBeTruthy();
      expect(section![2].content).toContain('<th>Drift</th><th>Power</th>');
      expect(section![2].content).toContain('0.987654321012345');
      expect(section![2].content).toContain('<tr><td>—</td><td>—</td></tr>');
      expect(section![2].content).toContain(FULL_HASH);
    });
  });
});

describe('BP-W2-4 — with no project open, Insert into document files nothing (PF-07)', () => {
  const FULL_HASH = 'b'.repeat(64);

  it.each([
    ['no project open', undefined],
    ['a legacy numeric workspace id', { id: 42 }],
  ])('%s: posts no document, claims no filing, and says to open a project first', async (_label, project) => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/biostat/assurance') {
        return ok({ assurance: 0.7, provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', method: 'assurance', seed: 1, inputsSha256: FULL_HASH, reproducible: true } });
      }
      // Would succeed if reached — so a refusal cannot be the server's doing.
      if (url === '/api/authoring/docs') {
        return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-1' } }) } as Response;
      }
      if (url === '/api/authoring/sections') {
        return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-1' } }) } as Response;
      }
      return ok({});
    });
    setProject(project);
    const p = props();

    render(<BiostatWorkbench {...p} />);
    fill(/Prior mean effect/, '0.4');
    fill(/^Prior SD/, '0.15');
    fill(/^n per arm/, '120');
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Insert into document/ }));

    const toast = await waitFor(() => {
      const el = document.querySelector('.de-toast');
      if (!el || !/open a project first/i.test(el.textContent ?? '')) throw new Error('no refusal toast');
      return el as HTMLElement;
    });
    // Reported as a refusal, not the green success tick.
    expect(toast.getAttribute('data-tone')).toBe('error');
    expect(toast.getAttribute('role')).toBe('alert');
    // Nothing reached the authoring store.
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.includes('/api/authoring/docs'))).toBe(false);
    expect(urls.some((u) => u.includes('/api/authoring/sections'))).toBe(false);
    // No success claim and no navigation; the computed result is still on screen.
    const body = document.body.textContent ?? '';
    expect(/Saved to the authoring store/i.test(body)).toBe(false);
    expect(p.onNav).not.toHaveBeenCalled();
    expect(screen.getByText('0.7')).toBeTruthy();
  });
});
