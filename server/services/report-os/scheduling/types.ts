/**
 * Scheduling, subscription, and delivery types for Report-OS (Insights, Step 6).
 *
 * These types describe how reports are scheduled, who subscribes to them, and
 * the gate that governs whether a report may be delivered. They carry no DB or
 * IO concerns and are render-target agnostic.
 */

import type { ReportScope } from '../../../../shared/schema/report-os';

/**
 * Constrained cadence presets. This is intentionally NOT a full cron grammar;
 * only these three recurrence shapes are supported.
 */
export type CadencePreset = 'daily' | 'weekly' | 'monthly';

/** How a delivered report is materialized. */
export type DeliveryFormat = 'pdf' | 'in_app';

/** Where a delivered report is sent. */
export type DeliveryChannel = 'platform' | 'external';

/**
 * A constrained recurrence definition.
 *
 * - `dayOfWeek` (0=Sun..6=Sat) selects the day for `weekly` cadence.
 * - `dayOfMonth` (1..28) selects the day for `monthly` cadence (clamped to
 *   1..28 so it is valid in every month).
 * - `timeZoneOffsetMinutes` is carried for the caller; the next-run math
 *   operates in UTC and ignores it (see `computeNextRun`).
 */
export interface ReportSchedule {
  cadence: CadencePreset;
  hour: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeZoneOffsetMinutes?: number;
}

/**
 * A subscription binding a report type + scope to a schedule and recipients.
 */
export interface ReportSubscription {
  id?: number;
  organizationId: number;
  reportTypeId: string;
  scopeType: ReportScope;
  scopeId: string;
  schedule: ReportSchedule;
  recipients: string[];
  format: DeliveryFormat;
  channel: DeliveryChannel;
  persona?: string;
  enabled: boolean;
}

/**
 * The outcome of the delivery / e-signature gate.
 */
export interface DeliveryDecision {
  allowed: boolean;
  requiresESignature: boolean;
  watermark: boolean;
  reason?: string;
}

/**
 * Default schedule: weekly, Monday (dayOfWeek 1) at 07:00.
 */
export const DEFAULT_WEEKLY_SCHEDULE: ReportSchedule = {
  cadence: 'weekly',
  dayOfWeek: 1,
  hour: 7,
  minute: 0,
};
