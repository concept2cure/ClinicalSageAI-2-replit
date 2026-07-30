import { describe, it, expect } from 'vitest';
import { RLS_ALLOWLIST, rlsAllowlistSqlArray } from '../rlsAllowlist';

describe('RLS_ALLOWLIST', () => {
  it('contains the load-bearing entries the rollout depends on', () => {
    // organization_users remains temporarily allowlisted while the rollout
    // migration is reconciled. requireTenantContext now establishes a
    // JWT-claimed bootstrap scope before this lookup, so removing this entry
    // is tracked remediation rather than a production authentication outage.
    expect(RLS_ALLOWLIST).toContain('organization_users');
  });

  it('has no duplicate entries', () => {
    const set = new Set(RLS_ALLOWLIST);
    expect(set.size).toBe(RLS_ALLOWLIST.length);
  });

  it('contains only safe SQL identifiers', () => {
    for (const t of RLS_ALLOWLIST) {
      expect(t, `entry ${t} must be a bare identifier`).toMatch(/^[a-z_][a-z0-9_]*$/i);
    }
  });
});

describe('rlsAllowlistSqlArray', () => {
  it('renders a quoted SQL array literal', () => {
    const sql = rlsAllowlistSqlArray();
    expect(sql.startsWith('ARRAY[')).toBe(true);
    expect(sql.endsWith(']::text[]')).toBe(true);
    for (const t of RLS_ALLOWLIST) {
      expect(sql).toContain(`'${t}'`);
    }
  });
});
