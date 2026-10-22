import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: q.query }, db: {} }));
import { computeDomainReport } from '../research-compliance-report-providers';

let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE grant_awards (id integer PRIMARY KEY, organization_id integer, project_id integer, status text, total_amount numeric, cost_share_committed numeric, deleted_at timestamp);
    CREATE TABLE grant_proposals (id integer PRIMARY KEY, organization_id integer, project_id integer, status text, deleted_at timestamp);
    CREATE TABLE grant_invoices (id integer PRIMARY KEY, organization_id integer, award_id integer, status text, deleted_at timestamp);
    CREATE TABLE grant_closeout_records (id integer PRIMARY KEY, organization_id integer, award_id integer, status text, closeout_due_date date, deleted_at timestamp);
    CREATE TABLE grant_subawards (id integer PRIMARY KEY, organization_id integer, award_id integer, status text, screen_status text, deleted_at timestamp);
    CREATE TABLE grant_budget_lines (id integer PRIMARY KEY, organization_id integer, award_id integer, budgeted_amount numeric, deleted_at timestamp);
    CREATE TABLE grant_expenditures (id integer PRIMARY KEY, organization_id integer, award_id integer, amount numeric, deleted_at timestamp);
    CREATE TABLE grant_cost_share_contributions (id integer PRIMARY KEY, organization_id integer, award_id integer, amount numeric, deleted_at timestamp);
    CREATE TABLE grant_nce_records (id integer PRIMARY KEY, organization_id integer, award_id integer, status text, deleted_at timestamp);
    INSERT INTO grant_awards VALUES (1,7,11,'active',100,50,NULL),(2,7,12,'active',200,100,NULL),(3,8,11,'active',1000,200,NULL),(4,7,11,'active',1000,200,CURRENT_TIMESTAMP);
    INSERT INTO grant_proposals VALUES (1,7,11,'submitted',NULL),(2,7,12,'draft',NULL),(3,8,11,'draft',NULL);
    INSERT INTO grant_invoices VALUES (1,7,1,'paid',NULL),(2,7,2,'draft',NULL),(3,8,3,'draft',NULL),(4,7,4,'draft',NULL);
    INSERT INTO grant_closeout_records VALUES (1,7,1,'pending',CURRENT_DATE-1,NULL),(2,7,2,'pending',CURRENT_DATE-1,NULL),(3,8,3,'pending',CURRENT_DATE-1,NULL),(4,7,4,'pending',CURRENT_DATE-1,NULL);
    INSERT INTO grant_subawards VALUES (1,7,1,'executed','pending',NULL),(2,7,2,'executed','pending',NULL),(3,8,3,'executed','pending',NULL),(4,7,4,'executed','pending',NULL);
    INSERT INTO grant_budget_lines VALUES (1,7,1,200,NULL),(2,7,2,1000,NULL),(3,8,3,10000,NULL),(4,7,4,10000,NULL);
    INSERT INTO grant_expenditures VALUES (1,7,1,150,NULL),(2,7,2,1000,NULL),(3,8,3,10000,NULL),(4,7,4,10000,NULL),(5,8,1,100000,NULL);
    INSERT INTO grant_cost_share_contributions VALUES (1,7,1,20,NULL),(2,7,2,80,NULL),(3,8,3,10000,NULL),(4,7,4,10000,NULL);
    INSERT INTO grant_nce_records VALUES (1,7,1,'requested',NULL),(2,7,2,'requested',NULL),(3,8,3,'requested',NULL),(4,7,4,'requested',NULL);
  `);
  q.query.mockImplementation((text: string, params: unknown[]) => database.query(text, params));
});
afterAll(async () => { await database?.close(); });

describe('project grants reporting in PostgreSQL', () => {
  it('isolates every aggregate to the project and its non-deleted awards within the organization', async () => {
    const report = await computeDomainReport('grants.portfolio_register', 7, { scopeType: 'project', scopeId: '11' });
    expect(report?.computedScope).toBe('project');
    expect(report?.summary).toMatchObject({
      awards: 1, proposals: 1, invoicesByStatus: { paid: 1 }, closeoutsByStatus: { pending: 1 }, overdueCloseouts: 1,
      subawards: 1, unscreenedExecuted: 1, totalBudgeted: 200, totalExpended: 150, overspentAwards: 1,
      costShareCommitted: 50, costShareContributed: 20, costShareShortfall: 30, ncesByStatus: { requested: 1 },
    });
    expect(report?.provenance.queries).toHaveLength(13);
  });
  it('returns a real empty project aggregate rather than organization totals for an unrepresented project', async () => {
    const report = await computeDomainReport('grants.portfolio_register', 7, { scopeType: 'project', scopeId: '99' });
    expect(report?.summary).toMatchObject({ awards: 0, proposals: 0, totalBudgeted: 0, totalExpended: 0, overspentAwards: 0 });
    expect(report?.provider.status).toBe('missing');
  });
});
