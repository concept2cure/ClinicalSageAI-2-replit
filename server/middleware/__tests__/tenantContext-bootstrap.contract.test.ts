import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('server/middleware/tenantContext.ts', 'utf8');

describe('requireTenantContext bootstrap scope contract', () => {
  it('establishes JWT-claimed tenant scope around tenant and membership lookups', () => {
    expect(source).toContain('const { tenant, membership } = await runWithTenantScope(bootstrap');
    expect(source).toContain('tenantId: organizationId');
    expect(source).toContain("role: null");
    expect(source).toContain('.from(organizations)');
    expect(source).toContain('.from(organizationUsers)');
  });

  it('does not treat the bootstrap claim as authorization', () => {
    const bootstrapIndex = source.indexOf('runWithTenantScope(bootstrap');
    const membershipDecision = source.indexOf('if (!membership.length)', bootstrapIndex);
    const resolvedRole = source.indexOf('const resolvedRole = membership[0].role', membershipDecision);
    const downstreamScope = source.indexOf('role: resolvedRole || null', resolvedRole);

    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(membershipDecision).toBeGreaterThan(bootstrapIndex);
    expect(resolvedRole).toBeGreaterThan(membershipDecision);
    expect(downstreamScope).toBeGreaterThan(resolvedRole);
  });
});
