import { describe, expect, it } from 'vitest';
// These exports already existed in S4, so the isolated old-helper check below
// fails on duplicated dose advice rather than on a missing new export.
import { statedInputResult, STATED_DOSE_NOTE } from '../stated-input-result';

describe('stated-input result contract', () => {
  it('nested S4 dose cautions are idempotent', async () => {
    const raw = JSON.stringify({ status: 'computed', engine: 'deterministic', result: { mrsd: 1.6216 }, instruction: 'Report the returned dose verbatim.' });
    const once = statedInputResult(raw, STATED_DOSE_NOTE);
    const twice = statedInputResult(once, STATED_DOSE_NOTE);
    expect(twice).toBe(once);
    const { STATED_BASIS } = await import('../stated-input-result');
    const out = JSON.parse(twice);
    expect(out.instruction.split(STATED_BASIS)).toHaveLength(2);
    expect(out.instruction.split(STATED_DOSE_NOTE)).toHaveLength(2);
    expect(out.instruction).toContain('Report the returned dose verbatim.');
  });

  it('preserves numerical precision, seeded method and opaque provenance references', async () => {
    const { statedInputEnvelope } = await import('../stated-input-result');
    const result = Object.freeze({
      estimate: 0.123456789123,
      lower: 0,
      upper: 0.987654321987,
      seed: 0xC0FFEE,
      provenance: { method: 'seeded Monte Carlo', citations: ['method-reference'], inputRefs: ['stated/table-a'] },
    });
    const raw = { status: 'computed', engine: 'seeded-monte-carlo', result, instruction: 'Keep all returned decimals.' };
    const out = statedInputEnvelope(raw);
    expect(out.result).toBe(result);
    expect(out.engine).toBe(raw.engine);
    expect(out.result).toEqual(result);
    expect(out.instruction).toContain(raw.instruction);
    expect(raw).not.toHaveProperty('basis');
  });

  it('keeps an explicit list-only scope when adding the worksheet basis', async () => {
    const { statedInputEnvelope } = await import('../stated-input-result');
    const out = statedInputEnvelope({ status: 'assessed', adequate: null, gaps: [], appliesTo: 'the studies you listed' });
    expect(out).toMatchObject({ basis: 'stated', appliesTo: 'the studies you listed', adequate: null, gaps: [] });
  });

  it.each([
    { name: 'parameter refusal', out: { status: 'needs_parameters', field: 'n', message: 'n must be positive' } },
    { name: 'data refusal', out: { status: 'needs_data', message: 'No record was read.' } },
    { name: 'engine fault', out: { error: 'Synthetic engine fault.' } },
    { name: 'fault alongside a computed status', out: { status: 'computed', error: 'Synthetic engine fault.' } },
    { name: 'ok:false refusal alongside an assessed status', out: { status: 'assessed', ok: false, message: 'Source unavailable.' } },
  ])('does not relabel or reformat a $name', async ({ out }) => {
    const { statedInputEnvelope } = await import('../stated-input-result');
    expect(statedInputEnvelope(out, STATED_DOSE_NOTE)).toBe(out);
    const raw = ` \n${JSON.stringify(out, null, 2)}\n `;
    expect(statedInputResult(raw, STATED_DOSE_NOTE)).toBe(raw);
  });
});
