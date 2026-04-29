/**
 * Phase 3 Projects — data barrel.
 * All seed tables are mock fixtures lifted verbatim from the prototype.
 * Per HANDOFF.md, replace with live API responses while keeping shapes.
 */
export { PHASE_PRESETS, buildPhases } from './phases';
export type { Preset } from './phases';

export { PR_PROJECTS } from './projects';
export { PMEM_LEARNINGS } from './learnings';
export { PINSTR_TEMPLATES } from './templates';
export {
  PCP_TABS, PCP_SUBMISSION_TYPES, PCP_AGENCIES, PCP_STATUSES,
  PCP_ROLES, PCP_MEMBERS, PCP_SSO_GROUPS,
} from './config';
export type { PcpTab, PcpRole, PcpMember, PcpSsoGroup } from './config';

export { PACT_EVENTS, PACT_KIND_LABEL } from './activity';
export { PLNK_LINKS, PLNK_KIND_META } from './links';
export {
  PLF_TYPES, PLF_STATUSES, PLF_AGENCIES, PLF_OWNERS, PLF_ACTIVITY,
  PLF_SAVED_VIEWS,
} from './filters';
export { PNOT_NOTIFS } from './notifications';
export {
  NPD_REGIONS, NPD_TYPES, NPD_FAMILY_LABELS, NPD_PREVIEWS,
  NPD_DEFAULT_PREVIEW,
} from './regions';
export type {
  NpdRegion, NpdType, NpdFamily, NpdSection, NpdMilestone, NpdPreview,
} from './regions';

export { useProjectsApi } from './useProjectsApi';
export type { UseProjectsApiOptions, UseProjectsApiReturn } from './useProjectsApi';
