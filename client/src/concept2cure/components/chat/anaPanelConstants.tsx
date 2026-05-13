/**
 * Static lookup data for the AnA persistent chat panel.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * Lives separately so subcomponents share the same configuration
 * without re-importing it from the monolithic panel file.
 *
 * @module client/src/concept2cure/components/chat/anaPanelConstants
 */

import React from 'react';
import {
  Sparkles,
  Search,
  PenTool,
  AlertTriangle,
  Target,
  GitCompare,
  Shield,
  FileSearch,
  HelpCircle,
  FileEdit,
  FolderPlus,
} from 'lucide-react';

import type {
  AIProviderOption,
  IntentLensOption,
  DecisionStatusRailState,
  DocumentActionConfig,
  SlashCommand,
} from './anaPanelTypes';

export const THINKING_STATUS_PHASES = [
  'Reading project context',
  'Checking prior thread memory',
  'Drafting recommendation',
] as const;

export const EMPTY_DECISION_STATUS: DecisionStatusRailState = {
  loading: false,
  error: null,
  summary: 'No pending decisions',
  pendingApprovals: 0,
  pendingConfirmations: 0,
  unresolvedContradictions: false,
  provisional: false,
  needsReapproval: false,
  needsEscalation: false,
  blockedCount: 0,
  count: 0,
  details: [],
};

export const AI_PROVIDERS: AIProviderOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Best model for the task',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#D97757]',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    description: 'Anthropic Claude Sonnet 4',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#CC785C]',
  },
  {
    id: 'openai',
    label: 'GPT-4o',
    description: 'OpenAI GPT-4o',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#10A37F]',
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    description: 'Moonshot Kimi K2',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#6366F1]',
  },
];

export const INTENT_LENSES: IntentLensOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'AnA detects intent automatically',
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
  {
    id: 'audit',
    label: 'Audit',
    description: 'Review like a regulator',
    icon: <Search className="w-3.5 h-3.5" />,
  },
  {
    id: 'improve',
    label: 'Improve',
    description: 'Strengthen writing and structure',
    icon: <PenTool className="w-3.5 h-3.5" />,
  },
  {
    id: 'risk',
    label: 'Risk',
    description: 'Predict deficiencies and rejections',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  {
    id: 'strategy',
    label: 'Strategy',
    description: 'Regulatory pathway analysis',
    icon: <Target className="w-3.5 h-3.5" />,
  },
  {
    id: 'compare',
    label: 'Compare',
    description: 'Side-by-side analysis',
    icon: <GitCompare className="w-3.5 h-3.5" />,
  },
];

export const DOCUMENT_ACTION_CONFIGS: DocumentActionConfig[] = [
  {
    type: 'revised_artifact',
    label: 'Revise Document',
    icon: <FileEdit className="w-3.5 h-3.5" />,
  },
  { type: 'risk_memo', label: 'Create Risk Memo', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  {
    type: 'deficiency_preemption_memo',
    label: 'Deficiency Preemption',
    icon: <Shield className="w-3.5 h-3.5" />,
  },
  {
    type: 'rewritten_section',
    label: 'Rewrite Section',
    icon: <PenTool className="w-3.5 h-3.5" />,
  },
  { type: 'strategy_note', label: 'Strategy Note', icon: <Target className="w-3.5 h-3.5" /> },
  { type: 'evidence_memo', label: 'Evidence Memo', icon: <FileSearch className="w-3.5 h-3.5" /> },
  {
    type: 'reviewer_question_brief',
    label: 'Reviewer Brief',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
  },
  {
    type: 'attach_to_dossier',
    label: 'Attach to Dossier',
    icon: <FolderPlus className="w-3.5 h-3.5" />,
  },
];

// 45 AnA 1.0 RI slash commands.
export const SLASH_COMMANDS: SlashCommand[] = [
  // Intelligence
  { command: '/assess', description: 'Full project assessment', category: 'Intelligence' },
  {
    command: '/readiness',
    description: 'Readiness score + dimensions + gaps',
    category: 'Intelligence',
  },
  { command: '/risk', description: 'Risk profile with predictions', category: 'Intelligence' },
  { command: '/recommend', description: 'Prioritized action list', category: 'Intelligence' },
  { command: '/next', description: 'What should I do next?', category: 'Intelligence' },
  {
    command: '/signals',
    description: 'Accumulated intelligence signals',
    category: 'Intelligence',
  },
  { command: '/status', description: 'Quick 5-line project briefing', category: 'Intelligence' },
  // Analysis
  { command: '/twin', description: 'Submission twin analysis', category: 'Analysis' },
  { command: '/consistency', description: 'Cross-module consistency check', category: 'Analysis' },
  { command: '/claims', description: 'Evidence chain strength + confidence', category: 'Analysis' },
  { command: '/deficiencies', description: 'Known deficiency patterns', category: 'Analysis' },
  { command: '/simulate', description: 'Simulate reviewer challenges', category: 'Analysis' },
  { command: '/precedent', description: 'Similar products / predicates', category: 'Analysis' },
  // Biostatistics
  { command: '/sap', description: 'Generate Statistical Analysis Plan', category: 'Biostatistics' },
  {
    command: '/power',
    description: 'Sample size and power calculation',
    category: 'Biostatistics',
  },
  { command: '/dose', description: 'Dose escalation design', category: 'Biostatistics' },
  {
    command: '/defensibility',
    description: 'Statistical defensibility audit',
    category: 'Biostatistics',
  },
  { command: '/design', description: 'Clinical trial design', category: 'Biostatistics' },
  // Subspecialties
  {
    command: '/safety',
    description: 'TEAE, SAE, benefit-risk analysis',
    category: 'Subspecialties',
  },
  { command: '/cmc', description: 'Manufacturing / Module 3', category: 'Subspecialties' },
  { command: '/csr', description: 'Clinical study report analysis', category: 'Subspecialties' },
  {
    command: '/device',
    description: '510(k), PMA, De Novo intelligence',
    category: 'Subspecialties',
  },
  {
    command: '/diagnostics',
    description: 'Diagnostics/IVD validation and strategy',
    category: 'Subspecialties',
  },
  {
    command: '/cms',
    description: 'CMS coverage and reimbursement strategy',
    category: 'Subspecialties',
  },
  {
    command: '/ectd',
    description: 'Module structure / artifact placement',
    category: 'Subspecialties',
  },
  // Document Authoring
  { command: '/draft', description: 'Draft submission-ready CTD section', category: 'Authoring' },
  { command: '/audit', description: 'Hostile reviewer audit', category: 'Authoring' },
  { command: '/amend', description: 'Change tracking with impact analysis', category: 'Authoring' },
  {
    command: '/review',
    description: 'Regulatory review from reviewer perspective',
    category: 'Authoring',
  },
  { command: '/scan', description: 'Deficiency scanning', category: 'Authoring' },
  { command: '/memo', description: 'Risk assessment memo (go/no-go)', category: 'Authoring' },
  { command: '/brief', description: 'Reviewer question anticipation brief', category: 'Authoring' },
  { command: '/strategy', description: 'Regulatory strategy note', category: 'Authoring' },
  // Document Lifecycle
  { command: '/checklist', description: 'Compliance checklist generation', category: 'Lifecycle' },
  {
    command: '/freeze',
    description: 'Freeze document (immutable snapshot)',
    category: 'Lifecycle',
  },
  { command: '/sign', description: 'Electronic signature (21 CFR Part 11)', category: 'Lifecycle' },
  { command: '/submit', description: 'Submit to regulatory workflow', category: 'Lifecycle' },
  { command: '/preflight', description: 'Section/module/dossier preflight', category: 'Lifecycle' },
  // HAQ & Data Room
  {
    command: '/haq',
    description: 'Draft Health Authority Question response',
    category: 'Authoring',
  },
  { command: '/ask', description: 'Query project data room with AI', category: 'Analysis' },
  // Navigation & Meta
  {
    command: '/workflow',
    description: 'Full submission workflow progress',
    category: 'Navigation',
  },
  { command: '/knowledge', description: 'Search knowledge base', category: 'Navigation' },
  { command: '/decisions', description: 'Decision audit trail', category: 'Navigation' },
  { command: '/help', description: 'Show all capabilities', category: 'Navigation' },
  { command: '/export', description: 'Download conversation as markdown', category: 'Navigation' },
];

export const SLASH_CATEGORY_COLORS: Record<string, string> = {
  Intelligence: 'text-violet-600',
  Analysis: 'text-blue-600',
  Biostatistics: 'text-emerald-600',
  Subspecialties: 'text-amber-600',
  Authoring: 'text-rose-600',
  Lifecycle: 'text-teal-600',
  Navigation: 'text-zinc-500',
};

// Surviving first-class + specialist surface labels (trimmed in BATCH 4).
export const SCREEN_LABELS: Record<string, string> = {
  projects: 'Home',
  'project-home': 'Project Home',
  'dossier-map': 'Dossier',
  documents: 'Documents',
  review: 'Review',
  submissions: 'Submissions',
  'section-workspace': 'Section Workspace',
  'regulatory-workspace': 'Workspace',
  'review-readiness': 'Review & Readiness',
  biostatistics: 'Biostatistics',
  'deep-research': 'Deep Research',
  'precedent-intelligence': 'Precedent Intelligence',
  'report-engine': 'Report Engine',
  'safety-narrative': 'Safety Narrative',
};
