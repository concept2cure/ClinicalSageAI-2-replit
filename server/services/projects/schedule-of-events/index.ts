/**
 * Schedule-of-Events module — AnA-managed, regulatory-aware project schedule.
 *
 * Public surface for routes, AnA tools, and the proactive sweep.
 *
 * @module server/services/projects/schedule-of-events
 */

export {
  getScheduleOfEvents,
  generateProjectSchedule,
  amendMilestone,
  resetProjectGoals,
  reviewScheduleHealth,
  listActiveSchedulePlans,
  type ScheduleOfEventsView,
  type SchedulePlanView,
  type ScheduleMilestoneView,
  type ScheduleGoalView,
  type ScheduleRevisionView,
  type GenerateScheduleParams,
  type AmendMilestoneParams,
  type ResetGoalsParams,
  type HealthReviewResult,
} from './service';

export { generateSchedule, type GeneratorGoal } from './generator';
export {
  assessScheduleHealth,
  type ScheduleHealth,
  type ScheduleStatus,
  type OverallScheduleStatus,
} from './health';
export { getScheduleTemplate, listSupportedTypes, type MilestoneCategory } from './templates';
