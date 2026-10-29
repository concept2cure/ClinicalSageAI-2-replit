/** Canonical inbox categories shared by service contracts, tools and settings. */
export const NOTIFICATION_CATEGORIES = [
  'submission_status', 'validation_finding', 'q_sub_response', 'cdx_pairing',
  'ldt_milestone_due', 'gateway_credential_expiring', 'ana_draft_pending',
  'risk_residual_high', 'capa_due', 'study_deviation', 'enrollment_milestone',
  'admin', 'system',
  // Existing active producer spellings; keep stored notices/preferences compatible.
  'task_assigned', 'task_blocked', 'task_completed', 'task_update', 'collaboration',
  'schedule_goal_reset', 'schedule_milestone_slip', 'schedule_milestone_at_risk',
  'proactive_digest',
  // A detached AnA turn nobody was watching: it waits on an approval, or it
  // ended (docs/design/ANA_DETACH_2026-10-08.md §5.5). Server-written only, by
  // server/services/ana/run-notice.ts, and opened through the conversation
  // target (notification-record-target.ts).
  'ana_turn',
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

/**
 * Categories only the platform's own producers write (AnA detach DT3 review,
 * DP-84): never a person through POST /api/mdx/notifications, and never AnA's
 * fire_notification tool, so a notice in one of them cannot be forged into a
 * colleague's inbox. A person may still mute them (their preferences list
 * every category).
 */
/*
 * The task_* categories joined on 2026-10-29 (RR1b of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.11, finding M4): a review
 * route's members are told in them that a document waits on their signature,
 * so a forged "Review requested: <document>" would send a colleague to sign
 * what someone else chose. Their producers are the task routes and services
 * (notifyTaskEvent, task-side-effects.ts) and the review route
 * (server/services/review/review-route.ts); no person or model creates one.
 */
const SERVER_ONLY = ['ana_turn', 'task_assigned', 'task_blocked', 'task_completed', 'task_update'] as const;
export const SERVER_ONLY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = SERVER_ONLY;

/** What a person (POST /api/mdx/notifications) or AnA's fire_notification may create. */
export const CREATABLE_NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES.filter(
  (c): c is Exclude<NotificationCategory, (typeof SERVER_ONLY)[number]> => !SERVER_ONLY_NOTIFICATION_CATEGORIES.includes(c),
);
export const NOTIFICATION_CATEGORY_LABELS: Record<typeof NOTIFICATION_CATEGORIES[number], string> = {
  submission_status: 'Submission status', validation_finding: 'Validation findings',
  q_sub_response: 'Pre-submission responses', cdx_pairing: 'Companion diagnostics',
  ldt_milestone_due: 'LDT milestones', gateway_credential_expiring: 'Gateway credentials',
  ana_draft_pending: 'Drafts awaiting action', risk_residual_high: 'Residual risks',
  capa_due: 'CAPA due dates', study_deviation: 'Study deviations',
  enrollment_milestone: 'Enrollment milestones', admin: 'Administration', system: 'System notices',
  task_assigned: 'Task assignments', task_blocked: 'Blocked tasks', task_completed: 'Task completions',
  task_update: 'Task updates and reminders', collaboration: 'Collaboration messages and lock changes',
  schedule_goal_reset: 'Project goal resets', schedule_milestone_slip: 'Slipped milestones',
  schedule_milestone_at_risk: 'Milestones at risk', proactive_digest: 'AnA proactive digests',
  ana_turn: 'AnA turns that went on after the page closed',
};
