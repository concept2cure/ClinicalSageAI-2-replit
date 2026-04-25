/**
 * Claude Design — Phase 3 eCTD co-authoring workbench.
 *
 * Bundle source: docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/. Production mirror — Claude Code is the implementer; do
 * not diverge from the bundle visuals.
 */
export { ClaudeEctdCoauthor } from './ClaudeEctdCoauthor';
export type { ClaudeEctdCoauthorProps } from './ClaudeEctdCoauthor';
export type {
  ArtifactSection,
  EctdTreeModule,
  EctdTreeChild,
  EctdStatus,
  ParagraphBlock,
  HeadingBlock,
  TableBlockSpec,
  DocBlock,
  ProvenanceInfo,
} from './data';
export type { IntelligenceMessage } from './Intelligence';
export { useEctdAuthoringData } from './useEctdAuthoringData';
export type {
  UseEctdAuthoringDataOptions,
  UseEctdAuthoringDataReturn,
} from './useEctdAuthoringData';
