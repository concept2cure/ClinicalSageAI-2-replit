import type { LayoutMode } from '../zen-app-constants';

export const DEMOTED_LAYOUT_REDIRECTS: Partial<Record<LayoutMode, LayoutMode>> = {
  'mission-control': 'projects',
  snowglobe: 'projects',
  'snowglobe-chambers': 'projects',
  rules: 'projects',
  'ectd-coauthor': 'documents',
  'document-vault': 'vault',
  'vault-workspace': 'vault',
  'review-readiness': 'review',
  'clinical-trial': 'documents',
  'document-builder': 'documents',
  artifacts: 'artifacts-center',
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
};

export const normalizeLayoutMode = (layoutMode: LayoutMode): LayoutMode => {
  return DEMOTED_LAYOUT_REDIRECTS[layoutMode] ?? layoutMode;
};
