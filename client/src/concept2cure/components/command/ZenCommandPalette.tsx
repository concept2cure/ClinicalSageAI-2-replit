/**
 * @fileoverview Zen Command Palette
 * @module concept2cure/components/command/ZenCommandPalette
 * @version 3.0.0
 *
 * @description
 * Spotlight/Raycast/ChatGPT-style command palette for quick navigation and actions.
 * Keyboard-first experience with ⌘K shortcut.
 *
 * Features:
 * - Quick project switching
 * - Start new submissions
 * - Navigate to tools/modules
 * - Search conversations
 * - AI quick actions
 *
 * @compliance
 * - FDA 21 CFR Part 11: All actions logged
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  FileText,
  MessageSquare,
  Plus,
  Settings,
  User,
  History,
  Sparkles,
  ArrowRight,
  Hash,
  Folder,
  ChevronRight,
  Command,
  Beaker,
  Pill,
  Activity,
  Shield,
  ClipboardList,
  BarChart2,
  BookOpen,
  Globe,
  AlertTriangle,
  CheckSquare,
  Microscope,
  Building2,
  FileCheck,
  Brain,
  Target,
  GitBranch,
  Eye,
  FolderOpen,
  Compass,
  FlaskConical,
  Scale,
  Fingerprint,
  Bell,
  LayoutGrid,
  Users,
  BarChart3,
  Snowflake,
  Clock,
} from 'lucide-react';
import { getRecentDocuments, type RecentDocument } from '../../hooks/useRecentDocuments';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: CommandCategory;
  action: () => void;
  keywords?: string[];
}

type CommandCategory = 'recent' | 'submissions' | 'tools' | 'projects' | 'settings' | 'ai';

interface CommandGroup {
  category: CommandCategory;
  label: string;
  items: CommandItem[];
}

interface ZenCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction?: (actionId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const createCommands = (onAction: (id: string) => void): CommandItem[] => [
  // Recent
  {
    id: 'new-chat',
    title: 'New Chat',
    subtitle: 'Start a new conversation with RI',
    icon: <MessageSquare className="w-4 h-4" />,
    shortcut: '⌘N',
    category: 'recent',
    action: () => onAction('new-chat'),
    keywords: ['conversation', 'message', 'talk'],
  },
  {
    id: 'search-conversations',
    title: 'Search Conversations',
    subtitle: 'Find past chats and documents',
    icon: <Search className="w-4 h-4" />,
    shortcut: '⌘F',
    category: 'recent',
    action: () => onAction('search-conversations'),
    keywords: ['find', 'history', 'lookup'],
  },

  // Submissions
  {
    id: 'new-510k',
    title: 'New 510(k) Submission',
    subtitle: 'Start a premarket notification',
    icon: <FileText className="w-4 h-4 text-blue-600" />,
    category: 'submissions',
    action: () => onAction('new-510k'),
    keywords: ['device', 'clearance', 'premarket'],
  },
  {
    id: 'new-ind',
    title: 'New IND Application',
    subtitle: 'Investigational New Drug',
    icon: <Beaker className="w-4 h-4 text-purple-600" />,
    category: 'submissions',
    action: () => onAction('new-ind'),
    keywords: ['investigational', 'drug', 'clinical'],
  },
  {
    id: 'new-nda',
    title: 'New NDA Submission',
    subtitle: 'New Drug Application',
    icon: <Pill className="w-4 h-4 text-green-600" />,
    category: 'submissions',
    action: () => onAction('new-nda'),
    keywords: ['drug', 'approval', 'marketing'],
  },
  {
    id: 'new-bla',
    title: 'New BLA Submission',
    subtitle: 'Biologics License Application',
    icon: <Activity className="w-4 h-4 text-orange-600" />,
    category: 'submissions',
    action: () => onAction('new-bla'),
    keywords: ['biologics', 'vaccine', 'blood'],
  },
  {
    id: 'new-pma',
    title: 'New PMA Submission',
    subtitle: 'Premarket Approval',
    icon: <Shield className="w-4 h-4 text-red-600" />,
    category: 'submissions',
    action: () => onAction('new-pma'),
    keywords: ['class3', 'device', 'high-risk'],
  },

  // Tools
  {
    id: 'tool-ectd',
    title: 'eCTD Navigator',
    subtitle: 'Manage submission structure',
    icon: <Folder className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-ectd'),
    keywords: ['module', 'structure', 'document'],
  },
  {
    id: 'tool-protocol',
    title: 'Protocol Designer',
    subtitle: 'Design clinical study protocols',
    icon: <ClipboardList className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-protocol'),
    keywords: ['clinical', 'trial', 'study'],
  },
  {
    id: 'tool-sop',
    title: 'SOP Management',
    subtitle: 'Standard Operating Procedures',
    icon: <BookOpen className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-sop'),
    keywords: ['quality', 'procedure', 'training'],
  },
  {
    id: 'tool-capa',
    title: 'CAPA Management',
    subtitle: 'Corrective & Preventive Actions',
    icon: <AlertTriangle className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-capa'),
    keywords: ['quality', 'corrective', 'preventive'],
  },
  {
    id: 'tool-pms',
    title: 'Post-Market Surveillance',
    subtitle: 'Safety monitoring & vigilance',
    icon: <BarChart2 className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-pms'),
    keywords: ['safety', 'vigilance', 'psur'],
  },
  {
    id: 'tool-inspection',
    title: 'Inspection Readiness',
    subtitle: 'Audit preparation & findings',
    icon: <CheckSquare className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-inspection'),
    keywords: ['audit', 'fda', 'inspection'],
  },
  {
    id: 'tool-intelligence',
    title: 'Regulatory Intelligence',
    subtitle: 'Guidance & competitive analysis',
    icon: <Globe className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-intelligence'),
    keywords: ['guidance', 'news', 'competitive'],
  },

  // AnA Intelligence Features
  {
    id: 'tool-ri-feed',
    title: 'Regulatory Intelligence Feed',
    subtitle: 'Live FDA/EMA guidance updates & alerts',
    icon: <Globe className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-intelligence-feed'),
    keywords: ['feed', 'guidance', 'alert', 'fda', 'ema', 'news', 'live'],
  },
  {
    id: 'tool-gap-analysis',
    title: 'Submission Gap Analysis',
    subtitle: 'eCTD readiness scoring & gap detection',
    icon: <CheckSquare className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('nav-gap-analysis'),
    keywords: ['gap', 'readiness', 'ectd', 'missing', 'requirements', 'score'],
  },
  {
    id: 'tool-change-impact',
    title: 'Document Change Impact',
    subtitle: 'How guidance changes affect your submission',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    category: 'tools',
    action: () => onAction('nav-change-impact'),
    keywords: ['change', 'impact', 'rework', 'guidance', 'revision'],
  },
  {
    id: 'tool-ana-memory',
    title: 'AnA Memory',
    subtitle: 'Project context & persistent memory',
    icon: <Brain className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('nav-ana-memory'),
    keywords: ['memory', 'context', 'remember', 'ana', 'project', 'preferences'],
  },

  // Mission Control Ecosystem
  {
    id: 'nav-mission-control',
    title: 'Mission Control',
    subtitle: 'Portfolio command center & program dashboard',
    icon: <Target className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-mission-control'),
    keywords: ['mission', 'control', 'dashboard', 'portfolio', 'program', 'os'],
  },
  {
    id: 'nav-artifact-graph',
    title: 'Artifact Graph',
    subtitle: 'Visualize artifact dependencies & lifecycle',
    icon: <GitBranch className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-artifact-graph'),
    keywords: ['artifact', 'graph', 'dependency', 'lifecycle', 'document', 'dossier'],
  },
  {
    id: 'nav-review-center',
    title: 'Review Center',
    subtitle: 'Manage review cycles & approvals',
    icon: <Eye className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('nav-review-center'),
    keywords: ['review', 'approve', 'reject', 'feedback', 'cycle', 'reviewer'],
  },
  {
    id: 'nav-dossier-view',
    title: 'Dossier View',
    subtitle: 'Navigate eCTD modules & artifact completeness',
    icon: <FolderOpen className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('nav-dossier-view'),
    keywords: ['dossier', 'ectd', 'ctd', 'module', 'completeness', 'structure'],
  },
  {
    id: 'nav-risk-cockpit',
    title: 'Risk Cockpit',
    subtitle: 'Monitor & mitigate program risks',
    icon: <Shield className="w-4 h-4 text-red-600" />,
    category: 'tools',
    action: () => onAction('nav-risk-cockpit'),
    keywords: ['risk', 'cockpit', 'signal', 'mitigation', 'severity', 'critical'],
  },
  {
    id: 'nav-route-planner',
    title: 'Route Planner',
    subtitle: 'Plan regulatory submission pathways & timelines',
    icon: <Compass className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-route-planner'),
    keywords: ['route', 'plan', 'pathway', 'submission', 'timeline', 'destination'],
  },
  {
    id: 'nav-evidence-manager',
    title: 'Evidence Manager',
    subtitle: 'Manage evidence nodes & link to artifacts',
    icon: <FlaskConical className="w-4 h-4 text-teal-600" />,
    category: 'tools',
    action: () => onAction('nav-evidence-manager'),
    keywords: ['evidence', 'source', 'publication', 'clinical', 'link', 'strength'],
  },
  {
    id: 'nav-decision-log',
    title: 'Decision Log',
    subtitle: 'Track decisions, rationale & impact',
    icon: <Scale className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('nav-decision-log'),
    keywords: ['decision', 'rationale', 'impact', 'governance', 'record', 'log'],
  },
  {
    id: 'nav-authority-tracker',
    title: 'Authority Tracker',
    subtitle: 'Track regulatory meetings, RFIs & commitments',
    icon: <Building2 className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-authority-tracker'),
    keywords: ['authority', 'fda', 'ema', 'meeting', 'rfi', 'pre-submission', 'commitment'],
  },
  {
    id: 'nav-provenance-trail',
    title: 'Provenance Trail',
    subtitle: '21 CFR Part 11 audit trail with hash verification',
    icon: <Fingerprint className="w-4 h-4 text-zinc-600" />,
    category: 'tools',
    action: () => onAction('nav-provenance-trail'),
    keywords: ['provenance', 'audit', 'trail', 'cfr', 'part11', 'compliance', 'hash'],
  },
  {
    id: 'nav-notifications',
    title: 'Notification Center',
    subtitle: 'Alerts, mentions & action items',
    icon: <Bell className="w-4 h-4 text-amber-600" />,
    category: 'tools',
    action: () => onAction('nav-notifications'),
    keywords: ['notification', 'alert', 'mention', 'inbox', 'action', 'bell'],
  },
  {
    id: 'nav-collaboration-hub',
    title: 'Collaboration Hub',
    subtitle: 'Threaded discussions, mentions & escalation',
    icon: <MessageSquare className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-collaboration-hub'),
    keywords: ['collaboration', 'comment', 'thread', 'discuss', 'mention', 'escalate'],
  },
  {
    id: 'nav-task-board',
    title: 'Task Board',
    subtitle: 'Kanban board with drag-and-drop task management',
    icon: <LayoutGrid className="w-4 h-4 text-amber-600" />,
    category: 'tools',
    action: () => onAction('nav-task-board'),
    keywords: ['task', 'kanban', 'board', 'sprint', 'todo', 'backlog', 'drag'],
  },
  {
    id: 'nav-team-workspace',
    title: 'Team Workspace',
    subtitle: 'Manage team members, roles & workload',
    icon: <Users className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('nav-team-workspace'),
    keywords: ['team', 'member', 'role', 'permission', 'invite', 'workspace', 'workload'],
  },
  {
    id: 'nav-program-analytics',
    title: 'Program Analytics',
    subtitle: 'Readiness trends, risk analysis & activity metrics',
    icon: <BarChart3 className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-program-analytics'),
    keywords: ['analytics', 'metrics', 'trend', 'burndown', 'readiness', 'report', 'chart'],
  },
  {
    id: 'nav-snowglobe',
    title: 'AnA Predictions',
    subtitle: 'AnA RI prediction engine — stress tests, simulations, forecasts',
    icon: <Snowflake className="w-4 h-4 text-cyan-600" />,
    category: 'tools',
    action: () => onAction('nav-snowglobe'),
    keywords: ['snowglobe', 'prediction', 'stress', 'test', 'scan', 'agency', 'reviewer', 'attack', 'audit', 'intelligence', 'simulation'],
  },
  {
    id: 'nav-snowglobe-chambers',
    title: 'AnA Prediction Chambers',
    subtitle: 'Deep-dive into individual AnA RI prediction engines',
    icon: <Snowflake className="w-4 h-4 text-cyan-600" />,
    category: 'tools',
    action: () => onAction('nav-snowglobe-chambers'),
    keywords: ['chambers', 'engine', 'agency', 'reviewer', 'audit', 'route', 'evidence', 'collaboration', 'deep dive'],
  },

  // AI
  {
    id: 'ai-analyze',
    title: 'Analyze Document',
    subtitle: 'RI-powered document analysis',
    icon: <Brain className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-analyze'),
    keywords: ['analyze', 'review', 'ai'],
  },
  {
    id: 'ai-draft',
    title: 'Draft with RI',
    subtitle: 'Generate regulatory content',
    icon: <Sparkles className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-draft'),
    keywords: ['generate', 'write', 'create'],
  },
  {
    id: 'ai-compare',
    title: 'Compare Documents',
    subtitle: 'Side-by-side comparison',
    icon: <FileCheck className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-compare'),
    keywords: ['diff', 'compare', 'review'],
  },

  // ── Navigate to modules ──────────────────────────────────────────────────
  {
    id: 'go-copilot',
    title: 'Go to Copilot',
    subtitle: 'AI-powered regulatory intelligence workspace',
    icon: <Brain className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-copilot'),
    keywords: ['copilot', 'workspace', 'ri', 'intelligence', 'home'],
  },
  {
    id: 'go-author',
    title: 'Go to Author',
    subtitle: 'Dossier, eCTD, and CMC authoring',
    icon: <Compass className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-author'),
    keywords: ['author', 'write', 'dossier', 'ectd', 'cmc', 'document'],
  },
  {
    id: 'go-agents',
    title: 'Go to AI Agents',
    subtitle: 'AnA RI automated agents',
    icon: <Target className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('go-agents'),
    keywords: ['agent', 'swarm', 'drafter', 'reviewer', 'compliance', 'coordinator'],
  },
  {
    id: 'go-collaboration',
    title: 'Go to Collaboration Hub',
    subtitle: 'Threads, reviews, decisions',
    icon: <Users className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-collaboration'),
    keywords: ['collaborate', 'thread', 'review', 'team', 'discuss'],
  },
  {
    id: 'go-document-sherpa',
    title: 'Go to Guided Authoring',
    subtitle: 'AnA RI guided document authoring',
    icon: <Compass className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('go-document-sherpa'),
    keywords: ['sherpa', 'guide', 'authoring', 'proactive'],
  },
  {
    id: 'go-review-pulse',
    title: 'Go to Review Pulse',
    subtitle: 'PM signals, readiness, risk tracking',
    icon: <Activity className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-review-pulse'),
    keywords: ['pulse', 'review', 'signal', 'readiness', 'risk', 'pm'],
  },
  {
    id: 'go-intelligence',
    title: 'Go to Intelligence Hub',
    subtitle: 'Evidence, precedents, regulatory alerts',
    icon: <Search className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-intelligence'),
    keywords: ['intelligence', 'evidence', 'precedent', 'alert', 'research'],
  },
  {
    id: 'go-biostatistics',
    title: 'Go to Biostatistics',
    subtitle: 'Power calculations, endpoints, study design',
    icon: <FlaskConical className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('go-biostatistics'),
    keywords: ['biostat', 'statistics', 'power', 'endpoint', 'sample size'],
  },
  {
    id: 'go-review-readiness',
    title: 'Go to Review & Readiness',
    subtitle: 'Quality, compliance, audit',
    icon: <CheckSquare className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('go-review-readiness'),
    keywords: ['review', 'readiness', 'quality', 'compliance', 'audit'],
  },
  {
    id: 'go-legal',
    title: 'Go to Legal Center',
    subtitle: 'IP, contracts, regulatory law',
    icon: <Scale className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-legal'),
    keywords: ['legal', 'ip', 'patent', 'contract', 'law'],
  },
  {
    id: 'go-knowledge-base',
    title: 'Go to Knowledge Base',
    subtitle: 'Upload skills, .MD files, materials',
    icon: <FolderOpen className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('go-knowledge-base'),
    keywords: ['knowledge', 'upload', 'skills', 'md', 'materials', 'ingest'],
  },
  {
    id: 'go-project-knowledge',
    title: 'Go to Project Knowledge',
    subtitle: 'Project-level context, uploads, sources',
    icon: <Folder className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-project-knowledge'),
    keywords: ['project', 'knowledge', 'context', 'upload', 'source'],
  },
  {
    id: 'go-client-intelligence',
    title: 'Go to Client Intelligence',
    subtitle: 'Persona, memory, context',
    icon: <Building2 className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('go-client-intelligence'),
    keywords: ['client', 'persona', 'memory', 'context', 'company'],
  },
  {
    id: 'go-command-center',
    title: 'Go to Command Center',
    subtitle: 'Submissions, workflows, operations',
    icon: <BarChart3 className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-command-center'),
    keywords: ['command', 'center', 'operations', 'workflow', 'submission'],
  },
  {
    id: 'go-academy',
    title: 'Go to Academy',
    subtitle: 'Dr. Sage, learning paths, guides',
    icon: <Brain className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('go-academy'),
    keywords: ['academy', 'learn', 'sage', 'guide', 'enablement'],
  },
  {
    id: 'go-training',
    title: 'Go to Training Center',
    subtitle: 'Courses, certifications, onboarding',
    icon: <BookOpen className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('go-training'),
    keywords: ['training', 'course', 'certification', 'learn'],
  },
  {
    id: 'go-onboarding',
    title: 'Go to Client Onboarding',
    subtitle: 'Setup wizard, configuration',
    icon: <Fingerprint className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('go-onboarding'),
    keywords: ['onboard', 'setup', 'wizard', 'configure', 'first run'],
  },
  {
    id: 'go-home',
    title: 'Go to Home',
    subtitle: 'Platform dashboard',
    icon: <LayoutGrid className="w-4 h-4" />,
    shortcut: '⌘H',
    category: 'recent',
    action: () => onAction('go-home'),
    keywords: ['home', 'dashboard', 'main', 'start'],
  },

  // Settings
  {
    id: 'settings-account',
    title: 'Account Settings',
    subtitle: 'Manage your account',
    icon: <User className="w-4 h-4" />,
    shortcut: '⌘,',
    category: 'settings',
    action: () => onAction('settings-account'),
    keywords: ['profile', 'user', 'account'],
  },
  {
    id: 'settings-org',
    title: 'Organization Settings',
    subtitle: 'Team & workspace settings',
    icon: <Building2 className="w-4 h-4" />,
    category: 'settings',
    action: () => onAction('settings-org'),
    keywords: ['team', 'org', 'workspace'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY LABELS
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  recent: 'Quick Actions',
  submissions: 'New Submission',
  tools: 'Tools & Modules',
  projects: 'Projects',
  settings: 'Settings',
  ai: 'AnA RI Actions',
};

const CATEGORY_ORDER: CommandCategory[] = ['recent', 'submissions', 'tools', 'ai', 'settings'];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenCommandPalette: React.FC<ZenCommandPaletteProps> = ({
  isOpen,
  onClose,
  onAction = () => {},
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get commands (static + dynamic recent documents)
  const commands = useMemo(() => {
    const handler = (id: string) => {
      onAction(id);
      onClose();
    };
    const staticCmds = createCommands(handler);

    // Inject recent documents at the top of the 'recent' category
    const recentDocs = getRecentDocuments(5);
    const recentDocCmds: CommandItem[] = recentDocs.map(doc => ({
      id: `recent-doc-${doc.id}`,
      title: doc.title,
      subtitle: doc.ctdSection ? `CTD ${doc.ctdSection}` : doc.projectName || 'Recent document',
      icon: <Clock className="w-4 h-4 text-zinc-500" />,
      category: 'recent' as CommandCategory,
      action: () => handler(`open-document:${doc.id}:${doc.projectId}`),
      keywords: ['recent', 'document', doc.title.toLowerCase(), doc.ctdSection || ''].filter(Boolean),
    }));

    // Place recent doc commands before the static ones
    return [...recentDocCmds, ...staticCmds];
  }, [onAction, onClose]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd => {
      const searchText = [cmd.title, cmd.subtitle, ...(cmd.keywords || [])].join(' ').toLowerCase();
      return searchText.includes(lowerQuery);
    });
  }, [commands, query]);

  // Group filtered commands by category
  const groupedCommands = useMemo(() => {
    const groups: CommandGroup[] = [];

    CATEGORY_ORDER.forEach(category => {
      const items = filteredCommands.filter(cmd => cmd.category === category);
      if (items.length > 0) {
        groups.push({
          category,
          label: CATEGORY_LABELS[category],
          items,
        });
      }
    });

    return groups;
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => groupedCommands.flatMap(g => g.items), [groupedCommands]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedItem = document.querySelector(`[data-command-index="${selectedIndex}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatList[selectedIndex]) {
            flatList[selectedIndex].action();
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    },
    [flatList, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  // Pre-compute category start indices for absolute item indexing
  const categoryOffsets = new Map<CommandCategory, number>();
  let offset = 0;
  for (const group of groupedCommands) {
    categoryOffsets.set(group.category, offset);
    offset += group.items.length;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-200">
          <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <span id="command-palette-title" className="sr-only">
            Command Palette
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, tools, submissions..."
            className="flex-1 text-base bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 bg-zinc-100 rounded-md">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2 zen-scroll"
          role="listbox"
          aria-label="Command results"
        >
          {flatList.length === 0 ? (
            <div className="px-4 py-12 text-center" role="status">
              <Search className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No commands found for "{query}"</p>
            </div>
          ) : (
            groupedCommands.map(group => {
              const groupStart = categoryOffsets.get(group.category) ?? 0;

              return (
                <div key={group.category} className="mb-2">
                  {/* Group header */}
                  <div className="px-4 py-2">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>

                  {/* Items */}
                  {group.items.map((item, itemIndex) => {
                    const absoluteIndex = groupStart + itemIndex;
                    const isSelected = absoluteIndex === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        data-command-index={absoluteIndex}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
                          isSelected ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                        )}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                            isSelected ? 'bg-white shadow-sm' : 'bg-zinc-100'
                          )}
                        >
                          {item.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-zinc-500 truncate">{item.subtitle}</div>
                          )}
                        </div>

                        {/* Shortcut */}
                        {item.shortcut && (
                          <kbd className="flex-shrink-0 text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded">
                            {item.shortcut}
                          </kbd>
                        )}

                        {/* Arrow */}
                        <ChevronRight
                          className={cn(
                            'w-4 h-4 flex-shrink-0 transition-opacity',
                            isSelected ? 'opacity-100 text-zinc-600' : 'opacity-0'
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↵</kbd>
              <span>Select</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Command className="w-3 h-3" />
            <span>K to open</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ZenCommandPalette;
