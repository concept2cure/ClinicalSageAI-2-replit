/**
 * Phase 3 Projects — data barrel.
 * Closed-enum constants (filter options, config lists) are static values.
 * Real data is fetched via the use* hooks below.
 */
export { PR_PROJECTS } from './projects';
export { PINSTR_TEMPLATES } from './templates';
export {
  PCP_TABS, PCP_SUBMISSION_TYPES, PCP_AGENCIES, PCP_STATUSES, PCP_SSO_GROUPS,
} from './config';
export type { PcpTab, PcpRole, PcpMember, PcpSsoGroup } from './config';

export {
  PLF_TYPES, PLF_STATUSES, PLF_AGENCIES, PLF_OWNERS, PLF_ACTIVITY,
  PLF_SAVED_VIEWS,
} from './filters';
export {
  NPD_REGIONS, NPD_TYPES, NPD_FAMILY_LABELS, NPD_PREVIEWS,
  NPD_DEFAULT_PREVIEW,
} from './regions';
export type {
  NpdRegion, NpdType, NpdFamily, NpdSection, NpdMilestone, NpdPreview,
} from './regions';

export { useProjectsApi } from './useProjectsApi';
export type { UseProjectsApiOptions, UseProjectsApiReturn } from './useProjectsApi';

export { useProjectsMutations } from './useProjectsMutations';
export type { UseProjectsMutations } from './useProjectsMutations';

export { useProjectMemory } from './useProjectMemory';
export { useProjectSharing } from './useProjectSharing';
export type { ProjectMember, TeamUser } from './useProjectSharing';
export { useProjectNotifications } from './useProjectNotifications';
