/**
 * Phase 3 Projects — TypeScript types.
 *
 * Mirrors the data shapes from
 * design-system/ui_kits/home/Projects.jsx + ProjectsExtras.jsx, with
 * field names kept verbatim. The HANDOFF.md "Data shapes" section lists
 * these as the contract; v2 must conform when wiring real API calls.
 */

export type SubmissionType =
  | '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA' | 'IVDR' | 'CER';

export type ProjectStatus =
  | 'draft' | 'active' | 'in_review' | 'submitted' | 'archived';

export type Agency = 'FDA' | 'EMA' | 'PMDA' | 'MHRA' | 'HC' | 'Health Canada' | 'Swissmedic' | string;

export type PhaseStatus = 'completed' | 'current' | 'pending' | 'upcoming' | 'in_progress';

export interface ProjectChat {
  id: string;
  title: string;
  last: string;
}

export interface ProjectFile {
  name: string;
  lines?: number;
  kind: string;
  author?: string;
  uploaded?: string;
  size?: string;
}

export interface ProjectPhase {
  id: string;
  name: string;
  status: PhaseStatus;
  progress: number;
}

export interface ProjectMemory {
  enabled: boolean;
  summary: string;
  updated: string;
}

export interface Project {
  id: string;
  name: string;
  desc: string;
  starred: boolean;
  chats: ProjectChat[];
  memory: ProjectMemory;
  instructions: string;
  /** Per HANDOFF item 8: whether instructions are currently active. */
  instructionsActive?: boolean;
  files: ProjectFile[];
  /** Per HANDOFF item 13: field is deprecated — keep optional for seed
   *  data compatibility, do not reference in new UI code. */
  capacityPct?: number;
  /** Per HANDOFF item 12: denormalized counts (replaces full arrays in
   *  the list-row when using real API data). */
  chatCount?: number;
  fileCount?: number;
  submissionType: SubmissionType;
  submissionTypeLabel: string;
  product: string;
  sponsor: string;
  targetAgency: Agency;
  /** ISO 8601 YYYY-MM-DD. Per HANDOFF item 11. */
  targetDate: string;
  status: ProjectStatus;
  phases: ProjectPhase[];
  /** Per HANDOFF item 6: derived at render — null when no targetDate.
   *  Still present on seed rows for legacy compatibility; components
   *  MUST recompute from targetDate at render, not trust this value. */
  daysToTarget: number | null;
}

export interface MemoryLearning {
  when: string;
  kind: string;
  text: string;
}

export interface InstructionTemplate {
  id: string;
  label: string;
  hint: string;
  body: string;
}

export interface ActivityEvent {
  ts: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  kind: 'export' | 'file' | 'memory' | 'instr' | 'esig' | 'comment' | 'lifecycle' | 'access' | string;
  ip: string;
  sig: string;
  e?: boolean;
}

export type LinkKind = 'predicate' | 'parent_ind' | 'parent_510k' | 'sister' | 'reference';

export interface ProjectLink {
  id: string;
  kind: LinkKind;
  dir: 'in' | 'out';
  otherName: string;
  otherType: string;
  status: string;
  via: string;
  date: string;
}

export type FilterKey = 'type' | 'status' | 'agency' | 'owner' | 'activity';
export type ProjectsFilters = Record<FilterKey, string[]>;

export interface SavedView {
  id: string;
  label: string;
  filters: Partial<ProjectsFilters>;
}

export interface Notification {
  id: string;
  when: string;
  unread: boolean;
  kind: 'agency' | 'predicate' | 'supplier' | 'review' | 'lifecycle' | string;
  icon: string;
  title: string;
  sub: string;
  project: string;
}

export type ConfigPanelTab = 'general' | 'instructions' | 'team' | 'compliance' | 'settings';

export type ArchiveMode = 'archive' | 'restore' | 'delete';

export type DetailTab = 'chats' | 'memory' | 'instructions' | 'files' | 'linked' | 'activity';
