/**
 * Editor Components Index
 *
 * Phase 5: Intelligent Document System
 * Phase 6: Competitive Enhancement (ARTOS/Weave parity)
 */

export { UnifiedDocumentEditor } from './UnifiedDocumentEditor';
export type {
  UnifiedDocumentEditorProps,
  DocumentSource,
  TraceabilityLink,
  ComplianceIssue,
  DocumentVersion,
  TemplateSection,
  Collaborator,
} from './UnifiedDocumentEditor';

// Sprint 1-6 feature components
export { DocumentHealth, DocumentHealthBadge } from './DocumentHealth';
export { VersionTimeline } from './VersionTimeline';
export { BatchAIPanel } from './BatchAIPanel';
export { DocumentDiff } from './DocumentDiff';
export { CrossReferencePanel } from './CrossReferencePanel';
export { KeyboardShortcutsOverlay, useKeyboardShortcuts } from './KeyboardShortcuts';
export { CommentThreadPanel } from './CommentThread';
export { ReviewModePanel } from './ReviewMode';

// Extensions
export { AIAutocomplete } from './extensions/AIAutocomplete';
export { CommentMark } from './extensions/CommentMark';
export { SearchAndReplace } from './extensions/SearchAndReplace';
export { GlossaryTooltip } from './extensions/GlossaryTooltip';
export { CitationPlugin, CitationMark, CitationSearchPanel } from './extensions/CitationPlugin';
