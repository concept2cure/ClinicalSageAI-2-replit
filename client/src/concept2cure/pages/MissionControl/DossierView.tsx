/**
 * @fileoverview Dossier / Technical File View — Structured eCTD/device/diagnostics navigation
 * @module concept2cure/pages/MissionControl/DossierView
 *
 * Left tree structure, center section/content preview,
 * right status/evidence/review metadata.
 */

import React, { useState, useMemo, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';

const SnowGlobeDossierNodeSummary = lazy(() => import('../SnowGlobe/SnowGlobeDossierNodeSummary'));
import {
  FileText,
  FolderOpen,
  Folder,
  CheckCircle2,
  Clock,
  Pencil,
  Eye,
  Lock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Sparkles,
  ArrowRight,
  BarChart2,
} from 'lucide-react';
import { useArtifacts, useReadiness } from '../../hooks/useMissionControl';

interface DossierViewProps {
  programId: number | null;
  onOpenArtifact?: (artifactId: number) => void;
  onDraftWithAI?: (artifactId: number, title: string) => void;
}

const LIFECYCLE_COLORS: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  planned: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: Clock },
  drafting: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Pencil },
  'in-review': { bg: 'bg-blue-100', text: 'text-blue-700', icon: Eye },
  'revision-needed': { bg: 'bg-orange-100', text: 'text-orange-700', icon: AlertTriangle },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  locked: { bg: 'bg-violet-100', text: 'text-violet-700', icon: Lock },
  exported: { bg: 'bg-teal-100', text: 'text-teal-700', icon: ExternalLink },
};

// Standard eCTD/CTD module structure
const DOSSIER_MODULES = [
  { id: 'module-1', label: 'Module 1 — Administrative', children: ['cover-letter', 'forms', 'labeling'] },
  { id: 'module-2', label: 'Module 2 — Summaries', children: ['overview', 'quality-summary', 'nonclinical-summary', 'clinical-summary'] },
  { id: 'module-3', label: 'Module 3 — Quality (CMC)', children: ['drug-substance', 'drug-product', 'appendices'] },
  { id: 'module-4', label: 'Module 4 — Nonclinical', children: ['pharmacology', 'pharmacokinetics', 'toxicology'] },
  { id: 'module-5', label: 'Module 5 — Clinical', children: ['clinical-pharmacology', 'efficacy', 'safety', 'references'] },
];

export const DossierView: React.FC<DossierViewProps> = ({
  programId,
  onOpenArtifact,
  onDraftWithAI,
}) => {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(['module-2', 'module-3']));
  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null);

  const { data: artifacts = [], isLoading } = useArtifacts(programId);
  const { data: readiness } = useReadiness(programId);

  // Group artifacts by module
  const artifactsByModule = useMemo(() => {
    const groups: Record<string, any[]> = {};
    artifacts.forEach((a: any) => {
      const mod = a.dossierModule || 'unassigned';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(a);
    });
    return groups;
  }, [artifacts]);

  const selectedArtifact = useMemo(() => {
    return artifacts.find((a: any) => a.id === selectedArtifactId) || null;
  }, [artifacts, selectedArtifactId]);

  // Module completeness
  const moduleCompleteness = useMemo(() => {
    const result: Record<string, { total: number; approved: number; pct: number }> = {};
    Object.entries(artifactsByModule).forEach(([mod, arts]) => {
      const approved = arts.filter((a: any) => ['approved', 'locked', 'exported'].includes(a.lifecycleState)).length;
      result[mod] = { total: arts.length, approved, pct: arts.length > 0 ? Math.round((approved / arts.length) * 100) : 0 };
    });
    return result;
  }, [artifactsByModule]);

  const toggleModule = (modId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f5] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-emerald-500" />
          <h1 className="text-base font-semibold text-zinc-900">Dossier View</h1>
          <span className="text-xs text-zinc-500">{artifacts.length} artifacts across {Object.keys(artifactsByModule).length} modules</span>
        </div>
        {readiness && (
          <div className="flex items-center gap-2 text-xs">
            <BarChart2 className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-600">Overall Readiness:</span>
            <span className={cn(
              'font-semibold',
              (readiness.overallConfidence || 0) >= 0.7 ? 'text-emerald-600' :
              (readiness.overallConfidence || 0) >= 0.4 ? 'text-amber-600' : 'text-red-600'
            )}>
              {Math.round((readiness.overallConfidence || 0) * 100)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Dossier Tree */}
        <div className="w-80 border-r bg-white overflow-y-auto">
          <div className="p-3 border-b">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Dossier Structure</h2>
          </div>

          {DOSSIER_MODULES.map(module => {
            const isExpanded = expandedModules.has(module.id);
            const modArts = artifactsByModule[module.id] || [];
            const completeness = moduleCompleteness[module.id];

            return (
              <div key={module.id}>
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 border-b border-zinc-100"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Folder className="w-4 h-4 text-zinc-400" />
                  )}
                  <span className="text-sm font-medium text-zinc-800 flex-1">{module.label}</span>
                  {modArts.length > 0 && (
                    <span className="text-[10px] text-zinc-500">
                      {completeness?.approved || 0}/{modArts.length}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="bg-zinc-50/50">
                    {modArts.length === 0 ? (
                      <p className="px-9 py-2 text-[10px] text-zinc-400 italic">No artifacts</p>
                    ) : (
                      modArts.map((art: any) => {
                        const lc = LIFECYCLE_COLORS[art.lifecycleState] || LIFECYCLE_COLORS.planned;
                        const Icon = lc.icon;
                        const isActive = selectedArtifactId === art.id;

                        return (
                          <button
                            key={art.id}
                            onClick={() => setSelectedArtifactId(art.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-6 py-2 text-left transition-colors',
                              isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-zinc-100'
                            )}
                          >
                            <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', lc.text)} />
                            <span className="text-xs text-zinc-700 truncate flex-1">{art.title}</span>
                            <span className={cn('text-[9px] px-1 py-0.5 rounded', lc.bg, lc.text)}>
                              {art.lifecycleState}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned artifacts */}
          {(artifactsByModule['unassigned'] || []).length > 0 && (
            <div>
              <div className="px-3 py-2.5 border-b border-zinc-100">
                <span className="text-sm font-medium text-zinc-500">Unassigned</span>
              </div>
              {artifactsByModule['unassigned'].map((art: any) => {
                const lc = LIFECYCLE_COLORS[art.lifecycleState] || LIFECYCLE_COLORS.planned;
                const Icon = lc.icon;
                return (
                  <button
                    key={art.id}
                    onClick={() => setSelectedArtifactId(art.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-6 py-2 text-left hover:bg-zinc-100',
                      selectedArtifactId === art.id && 'bg-blue-50 border-l-2 border-blue-500'
                    )}
                  >
                    <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', lc.text)} />
                    <span className="text-xs text-zinc-700 truncate flex-1">{art.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Artifact Detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedArtifact ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FolderOpen className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Select an artifact from the dossier tree</p>
                <p className="text-xs text-zinc-400 mt-1">View details, evidence links, and review status</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Artifact Card */}
              <div className="bg-white rounded-xl border p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">{selectedArtifact.title}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-mono text-zinc-500">{selectedArtifact.code}</span>
                      <span className="text-xs text-zinc-400">|</span>
                      <span className="text-xs text-zinc-600 capitalize">{selectedArtifact.artifactType}</span>
                      <span className="text-xs text-zinc-400">|</span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        (LIFECYCLE_COLORS[selectedArtifact.lifecycleState] || LIFECYCLE_COLORS.planned).bg,
                        (LIFECYCLE_COLORS[selectedArtifact.lifecycleState] || LIFECYCLE_COLORS.planned).text,
                      )}>
                        {selectedArtifact.lifecycleState}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedArtifact.lifecycleState === 'planned' && onDraftWithAI && (
                      <button
                        onClick={() => onDraftWithAI(selectedArtifact.id, selectedArtifact.title)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Draft with AnA
                      </button>
                    )}
                    {onOpenArtifact && (
                      <button
                        onClick={() => onOpenArtifact(selectedArtifact.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Open
                      </button>
                    )}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-zinc-500 mb-0.5">Module</p>
                    <p className="text-zinc-800 font-medium">{selectedArtifact.dossierModule || '—'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-0.5">Requirement</p>
                    <p className="text-zinc-800 font-medium capitalize">{selectedArtifact.requirementLevel || 'required'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-0.5">Version</p>
                    <p className="text-zinc-800 font-medium">{selectedArtifact.version || '0.0'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-0.5">Owner</p>
                    <p className="text-zinc-800 font-medium">{selectedArtifact.ownerId || 'Unassigned'}</p>
                  </div>
                </div>
              </div>

              {/* Progress indicator for the module */}
              {selectedArtifact.dossierModule && moduleCompleteness[selectedArtifact.dossierModule] && (
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Module Progress</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${moduleCompleteness[selectedArtifact.dossierModule].pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-zinc-600">
                      {moduleCompleteness[selectedArtifact.dossierModule].approved}/
                      {moduleCompleteness[selectedArtifact.dossierModule].total} approved
                    </span>
                  </div>
                </div>
              )}

              {/* Placeholder for content preview */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Content Preview</h3>
                <div className="bg-zinc-50 rounded-lg p-8 text-center">
                  <FileText className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">
                    {selectedArtifact.lifecycleState === 'planned'
                      ? 'This artifact has not been drafted yet. Use "Draft with AnA" to begin.'
                      : 'Content preview will be available when the document is opened in the editor.'}
                  </p>
                </div>
              </div>

              {/* Snow Globe compliance assessment for this dossier node */}
              <Suspense fallback={null}>
                <SnowGlobeDossierNodeSummary nodeId={selectedArtifact.id} className="mt-0" />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DossierView;
