/**
 * assess_device_cybersecurity reads an omitted input as not stated
 * (Rule 2 audit S3, 2026-10-26).
 *
 * assessDeviceCybersecurity read every yes/no input `!== false`. So `({})` was
 * a cyber device to which Section 524B applied, every artifact came back
 * present ("Threat model provided."), and the overall verdict was pass. A
 * missing SBOM was critical because of that invented 524B determination, and
 * `sbomProvided: 'no'` was read as provided.
 *
 * Now true is present, false is missing, and omitted is not stated: it counts
 * as a gap and is named in notStated, so the verdict is never pass while an
 * input is unstated. The cyber-device status is undetermined until a criterion
 * decides it, and a missing 524B artifact then says it is critical only if 524B
 * applies. A yes/no input that is not a boolean is refused, not read.
 */
import { describe, it, expect } from 'vitest';
import {
  assessDeviceCybersecurity,
  type AssessDeviceCybersecurityParams,
  type AssessDeviceCybersecurityResult,
} from '../../digital-health/digital-health-knowledge';
import { ASSESS_DEVICE_CYBERSECURITY } from '../digitalHealthTools';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';

const ARTIFACTS = [
  'threatModelProvided',
  'sbomProvided',
  'securityRiskManagementProvided',
  'vulnerabilityHandlingProcess',
  'postMarketUpdatePlan',
] as const;
const ARTIFACT_ROWS = ['CY-TM', 'CY-SBOM', 'CY-SRM', 'CY-VULN', 'CY-PATCH'];
const UNDETERMINED_CRITICALITY = 'It is a critical gap if Section 524B applies, which is undetermined.';
const ALL_STATED: AssessDeviceCybersecurityParams = {
  includesSoftware: true,
  networkConnected: true,
  threatModelProvided: true,
  sbomProvided: true,
  securityRiskManagementProvided: true,
  vulnerabilityHandlingProcess: true,
  postMarketUpdatePlan: true,
};

function without(key: string, input: AssessDeviceCybersecurityParams = ALL_STATED): AssessDeviceCybersecurityParams {
  const copy: Record<string, unknown> = { ...input };
  delete copy[key];
  return copy as AssessDeviceCybersecurityParams;
}

function row(out: AssessDeviceCybersecurityResult, id: string) {
  return out.requirements.find((r) => r.id === id);
}

async function run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler('assess_device_cybersecurity');
  expect(handler, 'assess_device_cybersecurity has a handler').toBeTypeOf('function');
  return JSON.parse(await handler!(input)) as Record<string, unknown>;
}

describe('assessDeviceCybersecurity with nothing stated', () => {
  it('does not pass, and reads no artifact as provided', () => {
    const out = assessDeviceCybersecurity({});
    expect(out.overallVerdict).toBe('gap');
    expect(out.criticalGapCount).toBe(0);
    for (const id of ARTIFACT_ROWS) {
      expect(row(out, id), id).toMatchObject({ status: 'not_stated', severity: 'gap' });
    }
    expect(JSON.stringify(out.requirements)).not.toMatch(/Threat model provided|SBOM provided/);
    expect(out.notStated).toEqual(['includesSoftware', 'networkConnected', ...ARTIFACTS]);
  });

  it('leaves the cyber-device status undetermined instead of applying 524B', () => {
    const out = assessDeviceCybersecurity({});
    expect(out.isCyberDevice).toBeNull();
    expect(out.section524B).toMatchObject({ applies: null, obligations: [] });
    expect(out.section524B.rationale).toMatch(/^Undetermined\./);
    expect(out.section524B.rationale).toContain('includesSoftware and networkConnected');
  });
});

describe('assessDeviceCybersecurity with stated inputs', () => {
  it('reads true as present and false as missing', () => {
    const out = assessDeviceCybersecurity({ ...ALL_STATED, sbomProvided: false });
    expect(row(out, 'CY-TM')).toMatchObject({ status: 'present', severity: 'pass' });
    expect(row(out, 'CY-SBOM')).toMatchObject({ status: 'missing', severity: 'critical-gap' });
    expect(row(out, 'CY-SBOM')?.detail).not.toContain(UNDETERMINED_CRITICALITY);
    expect(out).toMatchObject({ isCyberDevice: true, overallVerdict: 'critical-gap', criticalGapCount: 1, notStated: [] });
    expect(out.section524B.applies).toBe(true);
  });

  it('passes only when every criterion and artifact is stated', () => {
    expect(assessDeviceCybersecurity(ALL_STATED)).toMatchObject({ overallVerdict: 'pass', notStated: [] });
    for (const omitted of Object.keys(ALL_STATED)) {
      const out = assessDeviceCybersecurity(without(omitted));
      expect(out.overallVerdict, omitted).toBe('gap');
      expect(out.notStated, omitted).toEqual([omitted]);
    }
  });

  it('decides "not a cyber device" from one criterion stated false', () => {
    const out = assessDeviceCybersecurity(without('includesSoftware', { ...ALL_STATED, networkConnected: false }));
    expect(out).toMatchObject({ isCyberDevice: false, overallVerdict: 'pass', notStated: [] });
    expect(out.section524B).toMatchObject({ applies: false, obligations: [] });
  });

  it('says a missing SBOM is critical only if 524B applies while that is undetermined', () => {
    const out = assessDeviceCybersecurity({ sbomProvided: false });
    expect(row(out, 'CY-SBOM')).toMatchObject({ status: 'missing', severity: 'gap' });
    expect(row(out, 'CY-SBOM')?.detail).toContain(UNDETERMINED_CRITICALITY);
    expect(out.criticalGapCount).toBe(0);
  });
});

describe('assess_device_cybersecurity tool', () => {
  it('relays the not-stated reading', async () => {
    const out = await run({});
    expect(out.status).toBe('computed');
    expect(out.result).toMatchObject({ overallVerdict: 'gap', isCyberDevice: null });
    expect(JSON.stringify(out.result)).not.toMatch(/Threat model provided|Section 524B applies/);
  });

  it('refuses a yes/no answer that is not a boolean instead of reading it', async () => {
    for (const field of ['sbomProvided', 'includesSoftware', 'submissionUnder524B', 'handlesSensitiveData']) {
      expect(await run({ [field]: 'no' }), field).toMatchObject({ status: 'needs_parameters', field });
    }
  });

  it('does not tell AnA that an omitted input is true or provided', () => {
    const describes = (name: string): string =>
      (ASSESS_DEVICE_CYBERSECURITY.input_schema.properties[name] as { description: string }).description;
    for (const name of ['includesSoftware', 'networkConnected']) {
      expect(describes(name), name).not.toMatch(/Default true/);
      expect(describes(name), name).toContain('it is not assumed');
    }
    for (const name of ARTIFACTS) {
      expect(describes(name), name).toContain('counts as a gap, never as provided');
    }
  });
});
