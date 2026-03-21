/**
 * DocumentAppHub — The "Apps" grid for document-centric workflows.
 *
 * Shows all available regulatory document tools as launchable cards.
 * Every app's purpose is: create, edit, validate, or export documents.
 */

import React from 'react';
import {
  FileText,
  FlaskConical,
  Beaker,
  Layers,
  Search,
  Brain,
  Activity,
  Upload,
  MessageSquare,
  Sparkles,
  PenLine,
} from 'lucide-react';

interface AppCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  navigateTo: string;
  category: 'author' | 'analyze' | 'submit';
}

interface DocumentAppHubProps {
  submissionType?: string;
  projectName?: string;
  onNavigate: (layoutMode: string) => void;
  onStartChat?: () => void;
}

const APPS: AppCard[] = [
  // ── Author ──
  {
    id: 'editor',
    title: 'Document Editor',
    description: 'Create and edit regulatory documents with RI assistance. Export to DOCX.',
    icon: <PenLine className="w-5 h-5" />,
    navigateTo: 'editor',
    category: 'author',
  },
  {
    id: 'ectd-coauthor',
    title: 'eCTD Co-Author',
    description: 'Section-by-section CTD drafting with RI Sherpa. IND, NDA, BLA, 510(k).',
    icon: <FileText className="w-5 h-5" />,
    navigateTo: 'ectd-coauthor',
    category: 'author',
  },

  {
    id: 'ind-workspace',
    title: 'IND Workspace',
    description:
      'Full IND filing hub. Draft sections, track completeness, generate submission package.',
    icon: <FlaskConical className="w-5 h-5" />,
    navigateTo: 'ind-workspace',
    category: 'author',
  },
  // ── Analyze ──
  {
    id: 'precedent-intelligence',
    title: 'Precedent Intelligence',
    description: 'Search FDA precedents, compare submissions, predict risk, build strategy.',
    icon: <Search className="w-5 h-5" />,
    badge: 'LIVE',
    badgeColor: 'bg-violet-50 text-violet-700',
    navigateTo: 'precedent-intelligence',
    category: 'analyze',
  },
  {
    id: 'regulatory-workspace',
    title: 'Intelligence Workspace',
    description:
      'Document authoring with live regulatory intelligence: precedents, risk, strategy.',
    icon: <Brain className="w-5 h-5" />,
    badge: 'NEW',
    badgeColor: 'bg-blue-50 text-blue-700',
    navigateTo: 'regulatory-workspace',
    category: 'analyze',
  },
  {
    id: 'medtech-dashboard',
    title: 'Medical Device & Diagnostics',
    description: '510(k), PMA, De Novo, IVD/CDx workflows. eSTAR templates and CER authoring.',
    icon: <Activity className="w-5 h-5" />,
    badge: 'eSTAR',
    badgeColor: 'bg-blue-50 text-blue-700',
    navigateTo: 'medtech-dashboard',
    category: 'analyze',
  },
  // ── Submit ──
  {
    id: 'dossier',
    title: 'Dossier Navigator',
    description: 'eCTD Module 1–5 tracker. Monitor completeness and target filing readiness.',
    icon: <Layers className="w-5 h-5" />,
    navigateTo: 'dossier',
    category: 'submit',
  },
];

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  author: { label: 'Author', description: 'Create and draft regulatory documents' },
  analyze: {
    label: 'Analyze',
    description: 'Research precedents, predict outcomes, build strategy',
  },
  submit: { label: 'Submit', description: 'Track and assemble submission packages' },
};

export const DocumentAppHub: React.FC<DocumentAppHubProps> = ({
  submissionType,
  projectName,
  onNavigate,
  onStartChat,
}) => {
  const categories = ['author', 'analyze', 'submit'] as const;

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/30">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Document Tools</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Every tool builds toward your submission.
            {submissionType ? ` Working on ${submissionType}.` : ''}
            {projectName ? ` Project: ${projectName}.` : ''}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => onNavigate('editor')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PenLine className="w-4 h-4" />
            New Document
          </button>
          {onStartChat && (
            <button
              onClick={onStartChat}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Ask RI to Draft
            </button>
          )}
          <button
            onClick={() => onNavigate('ind-workspace')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors duration-150"
          >
            <Upload className="w-4 h-4" />
            Upload Source Files
          </button>
        </div>

        {/* App grid by category */}
        {categories.map(cat => {
          const apps = APPS.filter(a => a.category === cat);
          const meta = CATEGORY_LABELS[cat];
          return (
            <div key={cat} className="mb-8">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                  {meta.label}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">{meta.description}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {apps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => onNavigate(app.navigateTo)}
                    className="group text-left rounded-xl border border-zinc-200 bg-white p-4 hover:border-blue-200 hover:shadow-md transition-all duration-150"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-9 h-9 rounded-lg bg-zinc-100 group-hover:bg-blue-50 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 transition-colors duration-150">
                        {app.icon}
                      </div>
                      {app.badge && (
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${app.badgeColor || 'bg-zinc-100 text-zinc-500'}`}
                        >
                          {app.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-blue-700 transition-colors mb-1">
                      {app.title}
                    </h3>
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                      {app.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Pipeline hint */}
        <div className="mt-4 p-4 rounded-xl bg-zinc-50 border border-violet-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Everything flows to documents</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Upload files → RI harvests data → draft sections → validate claims → export DOCX →
                assemble submission
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
