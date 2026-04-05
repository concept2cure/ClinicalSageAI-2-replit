import type { LayoutMode } from '../zen-app-constants';

/**
 * Maps demoted/legacy layout mode strings to active LayoutMode values.
 * Keys are untyped strings so the LayoutMode union stays clean.
 */
export const DEMOTED_LAYOUT_REDIRECTS: Record<string, LayoutMode> = {
  // ── Demoted modes (redirect to active destinations) ──
  'mission-control': 'projects',
  snowglobe: 'projects',
  'snowglobe-chambers': 'projects',
  rules: 'projects',
  'ectd-coauthor': 'documents',
  cmc: 'documents',
  'document-vault': 'vault',
  'clinical-trial': 'documents',
  'document-builder': 'documents',
  artifacts: 'apps',
  'artifacts-center': 'apps',
  sherpa: 'projects',
  analytics: 'projects',
  timeline: 'projects',
  audit: 'projects',
  'enablement-center': 'projects',
  'platform-admin': 'projects',
  'biologics-dashboard': 'projects',
  'ctd-onboarding': 'projects',
  'client-intelligence': 'projects',
  'collaboration-hub': 'projects',
  'user-inbox': 'projects',
  'client-branding': 'projects',
  'training-center': 'projects',
  'client-onboarding': 'projects',
  'knowledge-base': 'projects',
  'project-knowledge': 'projects',
  'ana-platform-control': 'projects',
  // ── Legacy batch-1 modes ──
  'ind-workspace': 'projects',
  'submission-workspace': 'projects',
  author: 'projects',
  'intelligence-hub': 'projects',
  'command-center': 'projects',
  'legal-center': 'projects',
  'about-training': 'projects',
  'ana-dashboard': 'projects',
  integrations: 'projects',
  // ── Compatibility redirects ──
  setup: 'settings',
  workspace: 'regulatory-workspace',
  assistant: 'projects',
  ctd: 'projects',
  'medtech-dashboard': 'projects',
  dossier: 'dossier-map',
  // ── Unused MissionControl sub-modes ──
  'intelligence-feed': 'projects',
  'gap-analysis': 'projects',
  'change-impact': 'projects',
  'ana-memory': 'projects',
  'artifact-graph': 'projects',
  'review-center': 'projects',
  'dossier-view': 'projects',
  'risk-cockpit': 'projects',
  'route-planner': 'projects',
  'evidence-manager': 'projects',
  'decision-log': 'projects',
  'authority-tracker': 'projects',
  'provenance-trail': 'projects',
  notifications: 'projects',
  'program-wizard': 'projects',
  'team-workspace': 'projects',
  'program-analytics': 'projects',
};

export const normalizeLayoutMode = (layoutMode: string): LayoutMode => {
  return (DEMOTED_LAYOUT_REDIRECTS[layoutMode] ?? layoutMode) as LayoutMode;
};
