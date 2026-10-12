/**
 * The number a sponsor types under "hazard ratio" is the number sized
 * (2026-10-12).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The engine reads `effectSize` for a time-to-event design as the hazard-ratio
 * REDUCTION: HR = 1 − effectSize (computation-engine.ts `hazardRatio`). That
 * convention is deliberate, documented at the function, and named in its own
 * refusal message.
 *
 * The workbench's defensibility panel labelled that field "Hazard ratio", with
 * the placeholder "e.g. 0.7". So an oncologist typing the hazard ratio their
 * protocol states — 0.7, the commonest phase 3 assumption there is — was
 * sizing for HR 0.300:
 *
 *     effectSize 0.7  →  HR 0.300  →   22 events/group  →  50 subjects total
 *     effectSize 0.3  →  HR 0.700  →  247 events/group  → 550 subjects total
 *
 * Eleven times under-sized, shown as a computed total with a verdict chip
 * beside it. Nothing on screen contradicted the label, because the
 * `assessed` payload carried only sampleSize, power and the judgment — it
 * dropped `method`, `formula` (which prints "HR=0.300") and `assumptions`,
 * every one of which the sibling surface renders. The sibling surface also
 * labels the same field correctly, as "HR reduction", so the two surfaces
 * disagreed about what one engine input means.
 *
 * This is not a reachability gap and not an engine defect. It is a wrong
 * number under a correct-looking label, which is worse than a missing one: a
 * missing figure sends the sponsor to SAS, and this one sends a 50-patient
 * oncology trial to an ethics committee.
 *
 * ── What these cases hold ────────────────────────────────────────────────────
 * The engine's convention (unchanged), and the three things that must travel
 * with it: the figures the engine states about its own computation, the tool
 * schema a model reads, and — in the client suite — the label itself.
 */
import { describe, expect, it } from 'vitest';
import { computationEngine } from '../../server/services/ana-biostats/computation-engine.js';
import { statisticalDefensibilityService } from '../../server/services/statistical-defensibility-service.js';
import { COMPUTE_SAMPLE_SIZE } from '../../server/services/ana/document-intake-tool-defs.js';
import type { StatisticalInput } from '../../server/services/ana-biostats/types.js';

const SURVIVAL = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'time_to_event',
  alpha: 0.05,
  powerTarget: 0.8,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
} as unknown as StatisticalInput;

describe('the engine reads effectSize as the hazard-ratio reduction', () => {
  it('sizes 0.3 as HR 0.700 — 550 subjects, the figure an HR of 0.7 needs', () => {
    const r = computationEngine.compute({ ...SURVIVAL, effectSize: 0.3 } as StatisticalInput);
    expect(r.formula).toMatch(/HR=0\.700/);
    expect(r.adjustedTotal).toBe(550);
  });

  it('sizes 0.7 as HR 0.300 — 50 subjects, which is what the old label invited', () => {
    const r = computationEngine.compute({ ...SURVIVAL, effectSize: 0.7 } as StatisticalInput);
    expect(r.formula).toMatch(/HR=0\.300/);
    expect(r.adjustedTotal).toBe(50);
  });

  it('states the convention in its refusal rather than guessing', () => {
    expect(() => computationEngine.compute({ ...SURVIVAL, effectSize: 1.4 } as StatisticalInput))
      .toThrow(/hazard-ratio reduction/i);
  });
});

describe('the defensibility assessment carries what the engine said it computed', () => {
  it('reports the method, the formula and the assumptions, not only the N', async () => {
    const a = await statisticalDefensibilityService.assessDefensibility({
      ...SURVIVAL, effectSize: 0.3,
    } as Record<string, unknown>);

    expect(a.status).toBe('assessed');
    if (a.status !== 'assessed') return;

    expect(a.sampleSize).toBe(550);
    /* The three fields that would have exposed the mislabelling: the formula
       prints the hazard ratio the engine actually used, so a reader can check
       the number against the design in front of them. */
    expect(a.method).toMatch(/log-rank|Schoenfeld/i);
    expect(a.formula).toMatch(/HR=0\.700/);
    expect(Array.isArray(a.assumptions)).toBe(true);
  });

  it('discloses the event rate it defaulted, which drives subjects from events', async () => {
    const a = await statisticalDefensibilityService.assessDefensibility({
      ...SURVIVAL, effectSize: 0.3,
    } as Record<string, unknown>);
    if (a.status !== 'assessed') throw new Error('expected an assessment');

    // No event rate was supplied, so the engine used 0.5 and says so. Without
    // this the subject count looks like a property of the design rather than
    // of an assumption nobody made.
    expect(JSON.stringify(a.assumptions)).toMatch(/event_rate/);
  });

  it('still refuses, with the engine’s own sentence, when the design cannot be sized', async () => {
    const a = await statisticalDefensibilityService.assessDefensibility({
      ...SURVIVAL, effectSize: 1.4,
    } as Record<string, unknown>);
    expect(a.status).toBe('needs_parameters');
  });
});

describe('the tool schema a model reads states the convention', () => {
  it('says what effectSize means for a time-to-event endpoint', () => {
    const effectSize = (COMPUTE_SAMPLE_SIZE.input_schema.properties as Record<string, { description: string }>)
      .effectSize;
    /* A model told only "Cohen's d for continuous" has no way to know that a
       sponsor saying "hazard ratio 0.7" must be sent 0.3, and will make
       exactly the substitution the workbench label invited. */
    expect(effectSize.description).toMatch(/hazard[- ]ratio reduction|1 . HR/i);
    expect(effectSize.description).toMatch(/time[_ ]to[_ ]event/i);
  });
});
