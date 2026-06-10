/**
 * Insert-zod schema tests for the IND master-data registries.
 *
 * Pure schema validation — no DB. Verifies each insert schema accepts a
 * well-formed payload and rejects payloads that violate the field rules.
 */

import { describe, it, expect } from 'vitest';
import {
  insertSponsorSchema,
  insertRegulatoryAgentSchema,
  insertInvestigatorSchema,
  subInvestigatorSchema,
} from '../../../../shared/schema/ind-master-data';

describe('insertSponsorSchema', () => {
  it('accepts a valid sponsor', () => {
    const result = insertSponsorSchema.safeParse({
      organizationId: 1,
      name: 'Acme Therapeutics, Inc.',
      duns: '123456789',
      contactEmail: 'reg@acme.example',
      signatoryName: 'Jane Roe',
      signatoryTitle: 'VP Regulatory',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = insertSponsorSchema.safeParse({ organizationId: 1, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed contact email', () => {
    const result = insertSponsorSchema.safeParse({
      organizationId: 1,
      name: 'Acme',
      contactEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('insertRegulatoryAgentSchema', () => {
  it('accepts a valid US agent', () => {
    const result = insertRegulatoryAgentSchema.safeParse({
      organizationId: 1,
      name: 'US Agent Services LLC',
      isUsAgent: true,
      contactEmail: 'agent@usagent.example',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = insertRegulatoryAgentSchema.safeParse({ organizationId: 1 });
    expect(result.success).toBe(false);
  });
});

describe('insertInvestigatorSchema', () => {
  it('accepts a valid investigator with sub-investigators', () => {
    const result = insertInvestigatorSchema.safeParse({
      organizationId: 1,
      firstName: 'John',
      lastName: 'Smith',
      credentials: 'MD',
      siteName: 'Mercy Research Center',
      email: 'jsmith@mercy.example',
      subInvestigators: [{ name: 'Amy Lee', role: 'Sub-I', credentials: 'DO' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty last name', () => {
    const result = insertInvestigatorSchema.safeParse({
      organizationId: 1,
      firstName: 'John',
      lastName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a sub-investigator entry without a name', () => {
    const result = insertInvestigatorSchema.safeParse({
      organizationId: 1,
      firstName: 'John',
      lastName: 'Smith',
      subInvestigators: [{ role: 'Sub-I' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('subInvestigatorSchema', () => {
  it('requires a non-empty name', () => {
    expect(subInvestigatorSchema.safeParse({ name: 'A' }).success).toBe(true);
    expect(subInvestigatorSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
