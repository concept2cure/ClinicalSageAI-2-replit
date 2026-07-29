/**
 * License-status tool — a read-only window into the org's enterprise usage
 * controls so AnA can answer "are we near any weekly limit, in overage, or out
 * of seats?" and warn proactively before work is blocked.
 *
 * Wraps three deterministic services (no model input drives the org — it comes
 * from the active ToolContext): weekly-usage-limits (monitor + overage ledger)
 * and seat-licensing. The handler lives in AnaToolExecutor.ts.
 *
 * @module server/services/ana/licenseStatusTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const GET_USAGE_AND_LICENSE_STATUS: AnaTool = {
  name: 'get_usage_and_license_status',
  description:
    "Report the current organization's enterprise usage-control standing: per-metric WEEKLY usage limits (used vs limit vs overage cap, with state ok/warn/overage/blocked and % used), accrued billable overage for the current week, and SEAT licensing (purchased vs active members + pending invitations, seats available, state ok/full/over). READ-ONLY and DETERMINISTIC — the organization is taken from the active session context, not from input. Use to answer 'are we near any weekly limit / in overage / out of seats?' and to warn before an action would be blocked. If nothing is configured the limits/seats simply report as unlimited or empty — report exactly what is returned; do not infer limits that aren't present.",
  input_schema: {
    type: 'object',
    properties: {},
  },
};

/** License-status tools, spread into ALL_ANA_TOOLS. */
export const LICENSE_STATUS_TOOLS: AnaTool[] = [GET_USAGE_AND_LICENSE_STATUS];
