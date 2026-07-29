/**
 * Protocol-portfolio analytics service (Capability C2C-16)
 *
 * Read-only, org-scoped: loads IACUC protocols + IRB submissions and returns the
 * deterministic portfolio summary (expiration buckets, overdue/expiring lists,
 * prioritized needs-attention list) from protocol-portfolio-logic.ts. Dates are
 * cast to text so the pure logic receives ISO strings.
 *
 * @module server/services/protocols/protocol-portfolio-service
 */

import { pool } from '../../db';
import { summarizePortfolio, type PortfolioSummary, type PortfolioProtocolRow } from './protocol-portfolio-logic';

export async function getPortfolioAnalytics(orgId: number, today?: string): Promise<PortfolioSummary> {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const iacuc = await pool.query(
    `SELECT id, protocol_number, title, status, review_type, pain_category,
            approval_date::text AS approval_date, expiration_date::text AS expiration_date
       FROM iacuc_protocols WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  const irb = await pool.query(
    `SELECT id, protocol_number, title, status, review_type, risk_level,
            approval_date::text AS approval_date, expiration_date::text AS expiration_date
       FROM irb_submissions WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  return summarizePortfolio(iacuc.rows as PortfolioProtocolRow[], irb.rows as PortfolioProtocolRow[], day);
}
