import { describe, expect, it } from 'vitest';
import { extractRequestContext, isPositiveIntegerId } from '../../server/routes/ana-ri/shared';

describe('AnA request identity extraction', () => {
  it('normalizes verified positive integer identities', () => {
    expect(extractRequestContext({ userId: 7, tenantId: 9 } as any)).toEqual({
      orgId: 9,
      userId: 7,
      numericOrgId: 9,
    });
  });

  it('does not manufacture actor zero when identity is absent', () => {
    expect(extractRequestContext({} as any)).toEqual({
      orgId: null,
      userId: null,
      numericOrgId: null,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '7', null])(
    'rejects %p as a positive integer identity',
    value => {
      expect(isPositiveIntegerId(value)).toBe(false);
    },
  );
});
