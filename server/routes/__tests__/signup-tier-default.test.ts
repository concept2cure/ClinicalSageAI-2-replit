/**
 * A self-serve signup must not be handed a paid tier.
 *
 * `organizations.tier` defaults to 'standard' in shared/schema.ts — the $499/mo
 * tier. The signup path inserted an org without naming a tier, so every account
 * created for free received it permanently, and the cost model at
 * server/routes/admin/business/cost-model.ts then priced those orgs as revenue.
 *
 * A source assertion because the alternative is standing up Postgres, bcrypt and
 * a transaction to observe one column. The property is narrow and exact: the
 * insert must name the tier rather than inherit it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('signup tier', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/auth.ts'), 'utf8');
  const insert = src.slice(src.indexOf('.insert(organizations)'), src.indexOf('.insert(organizations)') + 1200);

  it('the org insert names a tier explicitly', () => {
    expect(insert, 'the signup insert inherits the column default — currently the paid tier').toMatch(/tier:/);
  });

  it('and that tier is free', () => {
    expect(insert).toMatch(/tier:\s*'free'/);
  });

  it('the column default is still the thing being defended against', () => {
    // If someone changes the default to 'free', this test should be revisited
    // rather than silently becoming redundant.
    const schema = fs.readFileSync(path.resolve(process.cwd(), 'shared/schema.ts'), 'utf8');
    expect(schema).toMatch(/tier:\s*text\('tier'\)\.default\('standard'\)/);
  });
});
