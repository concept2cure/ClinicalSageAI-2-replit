// @vitest-environment jsdom
/**
 * Every design the engine sizes can be asked for from the surface.
 *
 * ── The defect this file pins shut ───────────────────────────────────────────
 * The engine sizes NINE endpoint types and the 2×2 crossover design. This
 * surface's Endpoint selector offered FOUR — continuous, binary, time_to_event,
 * sensitivity_specificity — and had no crossover control at all. Ordinal, count
 * and composite (sized by the disclosed continuous approximation), AUC/ROC
 * (Hanley–McNeil) and agreement (refused, with the published methods named)
 * could not be requested from the product, although
 * `server/services/ana-biostats/request-input.ts` and `input-normalizer.ts`
 * have carried `aucTarget`, `aucNull`, `crossoverPeriods`,
 * `withinSubjectCorrelation` and `agreementTarget` on the wire the whole time.
 *
 * The accuracy controls had the second half of the same defect: sensitivity,
 * specificity and prevalence were gated on `clientTrack === 'diagnostics_ivd'`,
 * so a pharma sponsor running a diagnostic sub-study could not enter them —
 * even though the engine sizes an accuracy endpoint by the accuracy method on
 * every track (computation-engine.ts, `computeStandard`).
 *
 * RED on the pre-fix head: the selector has 4 options, there is no Expected AUC
 * / Target kappa / Crossover periods control anywhere, the ROC and crossover
 * presets do not exist, and Sensitivity is absent on the pharma track.
 *
 * These cases assert what the surface ASKS FOR. What the engine answers is
 * pinned server-side (tests/biostat/design-dispatch-reaches-its-method.test.ts)
 * and what the surface renders is pinned in biostatServerEngine.test.tsx.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* The mock spreads the real module, so this is the real error class — the one
   `apiRequest` throws for every non-OK status but 401. */
import { ApiRequestError } from '@/lib/queryClient';
import { Biostatistics } from '../surfaces/Biostatistics';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;
const COMPUTE = '/api/ana-biostats/compute';

const res = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

/** The engine's own sentence for a design it will not size. */
const REFUSAL = 'Agreement (kappa) sample size is not supported: the published methods need the null kappa and the marginal rating prevalence.';

/* The engine is not under test here — only what the surface sends it — so one
   refusal for every compute keeps the screen free of figures and the cases
   honest about what they check. */
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m === 'POST' && u === COMPUTE) {
      throw new ApiRequestError(REFUSAL, 422, { error: 'VALIDATION_FAILED', message: REFUSAL }, 'VALIDATION_FAILED');
    }
    return res({ data: [] });
  });
});
afterEach(() => cleanup());

const mount = () => render(<Surface surface={{ id: 'biostatistics' }} onAsk={vi.fn()} onNav={vi.fn()} />);

const endpointSelect = () =>
  screen.getByText('Endpoint').parentElement!.querySelector('select') as HTMLSelectElement;

const trackSelect = () =>
  screen.getByText('Track').parentElement!.querySelector('select') as HTMLSelectElement;

const computeBodies = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === COMPUTE).map((c) => c[2]);

const lastBody = async (match: (b: any) => boolean) => {
  await waitFor(() => expect(computeBodies().some(match)).toBe(true));
  return computeBodies().filter(match).at(-1);
};

/** The engine's own endpointType enum (ana-biostats/types.ts). */
const ENGINE_ENDPOINTS = [
  'continuous', 'binary', 'time_to_event',
  'ordinal', 'count', 'composite',
  'sensitivity_specificity', 'auc_roc', 'agreement',
];

describe('the Endpoint selector offers every type the engine sizes', () => {
  it('offers all nine, not the four it used to', () => {
    mount();
    const values = Array.from(endpointSelect().options).map((o) => o.value);
    expect(values).toEqual(ENGINE_ENDPOINTS);
  });

  it.each(ENGINE_ENDPOINTS)('sends %s to the engine when it is chosen', async (endpointType) => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: endpointType } });
    const body = await lastBody((b) => b?.endpointType === endpointType);
    expect(body.endpointType).toBe(endpointType);
  });
});

describe('each design gets the controls its own method needs', () => {
  it('an ROC design asks for the AUC and its null, and sends both', async () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'auc_roc' } });

    const auc = screen.getByText('Expected AUC').parentElement!.querySelector('input')!;
    const nul = screen.getByText('Null AUC').parentElement!.querySelector('input')!;
    fireEvent.change(auc, { target: { value: '0.85' } });
    fireEvent.change(nul, { target: { value: '0.5' } });

    const body = await lastBody((b) => b?.aucTarget === 0.85 && b?.aucNull === 0.5);
    expect(body.endpointType).toBe('auc_roc');
  });

  it('an agreement design asks for the target kappa — the engine refuses it, and says why', async () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'agreement' } });

    const kappa = screen.getByText('Target kappa').parentElement!.querySelector('input')!;
    fireEvent.change(kappa, { target: { value: '0.8' } });

    const body = await lastBody((b) => b?.agreementTarget === 0.8);
    expect(body.endpointType).toBe('agreement');
    // A design the engine will refuse is still worth being able to express:
    // the refusal names the published methods and the inputs they need.
    expect(await screen.findByText(REFUSAL)).toBeTruthy();
  });

  it('a continuous design can be declared a crossover, and sends the periods and ρ', async () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'continuous' } });

    const periods = screen.getByText('Crossover periods').parentElement!.querySelector('input')!;
    fireEvent.change(periods, { target: { value: '2' } });
    const rho = screen.getByText('Within-subject ρ').parentElement!.querySelector('input')!;
    fireEvent.change(rho, { target: { value: '0.5' } });

    const body = await lastBody((b) => b?.crossoverPeriods === 2 && b?.withinSubjectCorrelation === 0.5);
    expect(body.endpointType).toBe('continuous');
  });

  it('asks for ρ only once a crossover has been declared', () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'continuous' } });
    expect(screen.queryByText('Within-subject ρ')).toBeNull();
    expect(screen.getByText('Crossover periods')).toBeTruthy();
  });

  it('offers no crossover control for an endpoint its formula does not cover', () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'time_to_event' } });
    expect(screen.queryByText('Crossover periods')).toBeNull();
  });
});

describe('the controls follow the endpoint, not the sponsor’s track', () => {
  it('offers the accuracy targets for an accuracy endpoint on the PHARMA track', async () => {
    mount();
    fireEvent.change(trackSelect(), { target: { value: 'biotech_pharma' } });
    fireEvent.change(endpointSelect(), { target: { value: 'sensitivity_specificity' } });

    // Before this change these three appeared on the diagnostics_ivd track
    // only, so this design could not be stated at all.
    const sens = screen.getByText('Sensitivity').parentElement!.querySelector('input')!;
    fireEvent.change(sens, { target: { value: '0.9' } });
    const spec = screen.getByText('Specificity').parentElement!.querySelector('input')!;
    fireEvent.change(spec, { target: { value: '0.9' } });
    const prev = screen.getByText('Prevalence').parentElement!.querySelector('input')!;
    fireEvent.change(prev, { target: { value: '0.3' } });

    const body = await lastBody((b) => b?.sensitivity === 0.9 && b?.specificity === 0.9 && b?.prevalence === 0.3);
    expect(body.clientTrack).toBe('biotech_pharma');
    expect(body.endpointType).toBe('sensitivity_specificity');
  });

  it.each(['sensitivity_specificity', 'auc_roc', 'agreement'] as const)(
    'hides the effect size for a %s design, which does not use one',
    (endpointType) => {
      mount();
      fireEvent.change(endpointSelect(), { target: { value: endpointType } });
      expect(screen.queryByText('Effect (d)')).toBeNull();
      expect(screen.queryByText('Delta rate')).toBeNull();
      expect(screen.queryByText('HR reduction')).toBeNull();
    },
  );

  it('still offers the effect size for a design that is sized on one', () => {
    mount();
    fireEvent.change(endpointSelect(), { target: { value: 'continuous' } });
    expect(screen.getByText('Effect (d)')).toBeTruthy();
  });
});

describe('the two designs that had no way in have a preset', () => {
  it('ROC / AUC sends a complete AUC design', async () => {
    mount();
    fireEvent.click(screen.getByText(/ROC \/ AUC/));
    const body = await lastBody((b) => b?.endpointType === 'auc_roc');
    expect(body.aucTarget).toBe(0.85);
    expect(body.aucNull).toBe(0.5);
  });

  it('2×2 crossover sends a complete crossover design', async () => {
    mount();
    fireEvent.click(screen.getByText(/2×2 crossover/));
    const body = await lastBody((b) => b?.crossoverPeriods === 2);
    expect(body.withinSubjectCorrelation).toBe(0.5);
    expect(body.endpointType).toBe('continuous');
    expect(body.effectSize).toBe(0.5);
  });
});
