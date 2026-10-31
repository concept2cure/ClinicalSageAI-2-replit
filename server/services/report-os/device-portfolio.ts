/**
 * The device section of the Reporting overview (D2, fold F4, 2026-10-30;
 * decision P-61 item 3, docs/LAUNCH_DEFINITION_OF_DONE.md;
 * docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/).
 *
 * Device analytics joins Reporting & analytics at its tier, over the projects
 * the reader can open. The retired screen (mdx/surfaces/AnalyticsSurface.tsx
 * over GET /api/mdx/analytics) had three real figures, each read across every
 * program of the organization, drug programs included, whether or not the
 * reader could open them. They are computed here from the records, over the
 * device projects among the reader's accessible projects only:
 *
 *   - each recorded status (regulatory_programs.status) with its count;
 *   - the submission pace: recorded submission dates
 *     (regulatory_programs.actual_submission_date) in each of the 24 calendar
 *     months to `now`, oldest first;
 *   - the AnA draft acceptance rate: AnA-drafted 510(k) kit sections
 *     (cerv2_510k_sections.draft_source = 'ana') recorded against one of those
 *     projects through their eSTAR document (fda_510k_documents.project_id),
 *     accepted (accepted_at set) over all. A section with no document belongs to
 *     no project and is not counted.
 *
 * "Device" is the Projects MDX filter's classification
 * (workstreamSqlCase, shared/constants/domain/product-types.ts), the one
 * vocabulary, so this section and Projects' MDX filter count the same projects.
 *
 * Every figure is a count of rows and one ratio of two counts. No model is
 * asked for anything (CLAUDE.md Rule 2).
 *
 * Honesty: the programs read failing throws, so the caller says the section is
 * unavailable rather than drawing it empty; the drafts store missing a table
 * or column (42P01, 42703) withholds only the rate; any other drafts failure
 * throws. A genuine zero is zero, and with no AnA draft recorded the rate is
 * null, never 0%. The read runs on the client the caller hands it (the
 * request's own connection); nothing here reaches for a shared pool.
 *
 * @module server/services/report-os/device-portfolio
 */
import { workstreamSqlCase } from '../../../shared/constants/domain/product-types';

/** The pace window: calendar months to the current one, inclusive. */
export const DEVICE_PACE_MONTHS = 24;

export interface DeviceSqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export type DeviceAnaDrafts =
  | { state: 'computed'; accepted: number; pending: number; acceptanceRate: number | null }
  | { state: 'unavailable' };

export type DevicePortfolio =
  | { state: 'none' }
  | {
      state: 'computed';
      projectCount: number;
      byStatus: Array<{ status: string; count: number }>;
      pace: { months: string[]; counts: number[]; total: number };
      anaDrafts: DeviceAnaDrafts;
    };

/** What the overview carries: the engine's answer, or a read that failed. */
export type DevicePortfolioSection = DevicePortfolio | { state: 'unavailable' };

/** The 24 'YYYY-MM' months to `now`'s UTC month, oldest first. */
export function devicePaceMonths(now: Date): string[] {
  const months: string[] = [];
  for (let back = DEVICE_PACE_MONTHS - 1; back >= 0; back -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(month.toISOString().slice(0, 7));
  }
  return months;
}

/* The device projects among those named: the project's own row (not deleted),
   its program in the same organization (not deleted), classified MDX. */
const DEVICE_PROJECTS_SQL = `SELECT p.id AS project_id, rp.status AS status,
    to_char(date_trunc('month', rp.actual_submission_date), 'YYYY-MM') AS submitted_month
  FROM projects p
  JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
  WHERE p.organization_id = $1 AND p.id = ANY($2::int[])
    AND p.status IS DISTINCT FROM 'deleted'
    AND rp.deleted_at IS NULL
    AND ${workstreamSqlCase('rp.program_type', 'rp.product_type')} = 'MDX'`;

/* AnA-drafted kit sections recorded against those device projects. */
const DEVICE_ANA_DRAFTS_SQL = `SELECT
    count(*) FILTER (WHERE s.accepted_at IS NOT NULL)::int AS accepted,
    count(*) FILTER (WHERE s.accepted_at IS NULL)::int AS pending
  FROM cerv2_510k_sections s
  JOIN fda_510k_documents d ON d.id = s.document_id AND d.organization_id = s.organization_id
  WHERE s.organization_id = $1 AND s.draft_source = 'ana' AND d.project_id = ANY($2::int[])`;

const UNREADABLE_SOURCE = new Set(['42P01', '42703']);

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function count(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('A device count could not be read');
  return n;
}

async function readAnaDrafts(client: DeviceSqlClient, organizationId: number, deviceProjectIds: number[]): Promise<DeviceAnaDrafts> {
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await client.query(DEVICE_ANA_DRAFTS_SQL, [organizationId, deviceProjectIds]));
  } catch (error) {
    if (UNREADABLE_SOURCE.has(String((error as { code?: unknown }).code))) return { state: 'unavailable' };
    throw error;
  }
  const accepted = count(rows[0]?.accepted ?? 0);
  const pending = count(rows[0]?.pending ?? 0);
  const total = accepted + pending;
  return { state: 'computed', accepted, pending, acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : null };
}

/**
 * The device section over `projectIds`, the projects the reader can open
 * (getAccessibleReportProjectIds). Refuses an identity it cannot trust before
 * reading anything.
 */
export async function readDevicePortfolio(
  client: DeviceSqlClient,
  organizationId: number,
  projectIds: readonly number[],
  now: Date,
): Promise<DevicePortfolio> {
  if (!positiveInteger(organizationId)) throw new Error('The device section needs a verified organization');
  if (!projectIds.every(positiveInteger)) throw new Error('The device section reads project ids only');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('The device section needs a date to pace to');
  if (projectIds.length === 0) return { state: 'none' };

  const { rows } = await client.query(DEVICE_PROJECTS_SQL, [organizationId, [...projectIds]]);
  if (rows.length === 0) return { state: 'none' };

  const statusCounts = new Map<string, number>();
  const months = devicePaceMonths(now);
  const counts = new Array<number>(months.length).fill(0);
  const deviceProjectIds: number[] = [];
  for (const row of rows) {
    const projectId = Number(row.project_id);
    if (!positiveInteger(projectId)) throw new Error('A device project could not be read');
    deviceProjectIds.push(projectId);
    const status = String(row.status);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const at = typeof row.submitted_month === 'string' ? months.indexOf(row.submitted_month) : -1;
    if (at >= 0) counts[at] += 1;
  }
  const byStatus = [...statusCounts]
    .map(([status, n]) => ({ status, count: n }))
    .sort((a, b) => (a.status < b.status ? -1 : a.status > b.status ? 1 : 0));

  return {
    state: 'computed',
    projectCount: deviceProjectIds.length,
    byStatus,
    pace: { months, counts, total: counts.reduce((sum, n) => sum + n, 0) },
    anaDrafts: await readAnaDrafts(client, organizationId, deviceProjectIds),
  };
}
