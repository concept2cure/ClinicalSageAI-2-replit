/**
 * The pathway question asks the governed catalogue, not its own list
 * (founder's directive, 2026-10-12).
 *
 * `project-setup` wrote its own seven options for `device_submission_pathway`:
 * they mixed the three 510(k) flavours — which the 510(k) flow asks about
 * itself — with distinct pathways, left out exemption and the 513(g) that
 * clears nothing, carried no authority, and said nothing about what choosing
 * one commits the programme to. A person answering therefore saw a list that
 * matched neither the registry the platform files against nor the frame it
 * reasons with.
 *
 * It now draws `shared/regulatory/pathway-positions`, which is the registry's
 * own filings annotated with their commitment and authority. This holds that
 * it keeps doing so, that the client's own domain decides the list, and that
 * the person can still take a position the list does not hold.
 */
import { describe, expect, it } from 'vitest';

import { pathwayOptions } from '@shared/regulatory/pathway-positions';
import type { FlowEngineContext } from '../types.js';
import { createProjectSetupFlow } from '../flows/project-setup.js';

const ctx = (clientType: FlowEngineContext['clientType']): FlowEngineContext => ({
  organizationId: 7,
  userId: 3,
  projectId: null,
  clientType,
});

const pathwayField = (clientType: FlowEngineContext['clientType']) => {
  const flow = createProjectSetupFlow(ctx(clientType));
  const node = flow.nodes.find(n => n.id === 'medtech_regulatory')!;
  return node.fields.find(f => f.id === 'device_submission_pathway')!;
};

describe('the pathway question', () => {
  it('offers exactly the catalogue’s positions for a device programme', () => {
    const field = pathwayField('medtech');
    expect(field.options).toEqual(pathwayOptions({ domain: 'medical_devices', region: 'US' }));
    expect(field.options!.length).toBeGreaterThan(5);
  });

  it('offers a diagnostics programme the IVD positions instead', () => {
    const ivd = pathwayField('ivd').options!.map(o => o.value);
    expect(ivd).toEqual(pathwayOptions({ domain: 'diagnostics_ivd', region: 'US' }).map(o => o.value));
    expect(ivd, 'an IVD is not asked about a plain 510(k)').toContain('US_510K_IVD');
    expect(ivd).toContain('US_CDX_PMA');
    expect(ivd).not.toEqual(pathwayField('medtech').options!.map(o => o.value));
  });

  it('says what each position commits the programme to, and its authority', () => {
    for (const option of pathwayField('medtech').options!) {
      expect(option.commits, option.value).toBeTruthy();
      expect(option.authority, option.value).toBeTruthy();
    }
    const deNovo = pathwayField('medtech').options!.find(o => o.value === 'US_DE_NOVO')!;
    expect(deNovo.commits).toMatch(/special controls/i);
    expect(deNovo.authority).toMatch(/513\(f\)\(2\)/);
  });

  it('no longer offers the 510(k) flavours as if they were pathways', () => {
    const values = pathwayField('medtech').options!.map(o => o.value);
    expect(values).not.toContain('510k_special');
    expect(values).not.toContain('510k_abbreviated');
    // And the ones it used to omit are present.
    expect(values).toContain('US_513G');
  });

  it('still lets the person take a position the list does not hold', () => {
    expect(pathwayField('medtech').allowOther).toBeDefined();
  });

  it('asks for the predicate on any 510(k), which is what names one', () => {
    const flow = createProjectSetupFlow(ctx('medtech'));
    const node = flow.nodes.find(n => n.id === 'medtech_regulatory')!;
    const predicate = node.fields.find(f => f.id === 'predicate_device')!;
    expect(predicate.visibleWhen).toEqual({ field: 'device_submission_pathway', operator: 'eq', value: 'US_510K' });
  });
});

/**
 * Which flows a client can reach at all (founder's directive, 2026-10-12).
 *
 * `getFlowDefinition` withholds a flow whose `clientTypes` exclude the client
 * (flows/index.ts), and the segment was derived as
 * `projectType === 'medtech' ? 'medtech' : … : 'pharma'` — but `projectType`
 * is the SUBMISSION type ('IND', '510k'), never 'medtech'. So every interview
 * ran as 'pharma' and the 510(k), PMA and CER flows were unreachable by the
 * very clients they are written for. A diagnostics programme had no segment
 * at all, so it was read as pharma too.
 */
describe('the client segment an interview runs under', () => {
  const definitionFor = async (clientType: FlowEngineContext['clientType'], category: string) => {
    const { getFlowDefinition } = await import('../flows/index.js');
    return getFlowDefinition(category as never, { organizationId: 7, userId: 3, projectId: null, clientType });
  };

  it('lets a device client reach the 510(k) interview', async () => {
    expect(await definitionFor('medtech', 'device_510k')).not.toBeNull();
  });

  it('lets a diagnostics client reach the 510(k) and PMA interviews', async () => {
    expect(await definitionFor('ivd', 'device_510k'), 'an IVD files a 510(k)').not.toBeNull();
    expect(await definitionFor('ivd', 'device_pma'), 'a Class III assay files a PMA').not.toBeNull();
  });

  it('withholds a device flow from a pharma client, which is the restriction working', async () => {
    expect(await definitionFor('pharma', 'device_510k')).toBeNull();
  });

  it('withholds nothing when the segment is unknown, rather than guessing pharma', async () => {
    expect(await definitionFor(null, 'device_510k'), 'not knowing must not hide the flow').not.toBeNull();
    expect(await definitionFor(null, 'ind_submission')).not.toBeNull();
  });

  it('reads a submission type as the segment it implies, and says nothing when it implies none', async () => {
    const { interviewClientType } = await import('../client-segment.js');
    // A segment passed directly, in any of the vocabularies in use.
    expect(interviewClientType('medtech')).toBe('medtech');
    expect(interviewClientType('mdx')).toBe('medtech');
    expect(interviewClientType('ivd')).toBe('ivd');
    expect(interviewClientType('biotech')).toBe('biotech');
    // A submission type implies the segment that files it.
    expect(interviewClientType('510k')).toBe('medtech');
    expect(interviewClientType('PMA')).toBe('medtech');
    expect(interviewClientType('IND')).toBe('pharma');
    expect(interviewClientType('bla')).toBe('pharma');
    // And where it says nothing, it says nothing — rather than 'pharma'.
    expect(interviewClientType('nonclinical_overview')).toBeNull();
    expect(interviewClientType('')).toBeNull();
    expect(interviewClientType(null)).toBeNull();
    expect(interviewClientType(undefined)).toBeNull();
  });
});
