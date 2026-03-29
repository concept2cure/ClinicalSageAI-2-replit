/**
 * Automation Module
 *
 * Three pillars of the automation system:
 * 1. Rewrite Dispatcher — auto-rewrite sections when upstream data changes
 * 2. Webhook Notifications — Slack/Teams/generic webhook event delivery
 * 3. Scheduled Jobs — cron-based recurring automation tasks
 */

export {
  dispatchRewrites,
  buildAffectedSections,
  buildRewritePrompt,
  type ChangeEvent,
  type ChangeSource,
  type AffectedSection,
  type RewriteJob,
  type DispatchResult,
  type AutomationConfig,
} from './rewrite-dispatcher.js';

export {
  notifyWebhooks,
  notifyRewriteDispatched,
  notifyRewriteCompleted,
  notifyDataChange,
  registerChannel,
  removeChannel,
  getChannels,
  getChannel,
  type WebhookChannel,
  type WebhookEvent,
  type WebhookDelivery,
  type WebhookPlatform,
} from './webhook-notifications.js';

export {
  initScheduledJobs,
  scheduleJob,
  removeScheduledJob,
  listScheduledJobs,
  registerDefaultSchedules,
  registerJobHandler,
  shutdownScheduledJobs,
  type ScheduledJobConfig,
  type ScheduledJobRun,
  type ScheduledJobType,
} from './scheduled-jobs.js';
