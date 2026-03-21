/**
 * @fileoverview Artifact Graph — Living map of governed outputs
 * @module concept2cure/pages/MissionControl/ArtifactGraph
 *
 * Shows what exists, what is missing, what is stale, what is blocked,
 * what depends on what, and what can be auto-drafted next.
 */

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';

const SnowGlobeArtifactSummary = lazy(() => import('../SnowGlobe/SnowGlobeArtifactSummary'));
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Pencil,
  Eye,
  GitBranch,
  Filter,
  ArrowRight,
  Sparkles,
  ChevronDown,
  X,
  ExternalLink,
} from 'lucide-react';
import { useArtifacts, useDependencies, useStaleDependencies } from '../../hooks/useMissionControl';

interface ArtifactGraphProps {
  programId: number | null;
  onOpenArtifact?: (artifactId: number) => void;
  onDraftWithAI?: (artifactId: number, title: string) => void;
}

const LIFECYCLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  planned: { bg: 'bg-zinc-50', text: 'text-zinc-600', dot: 'bg-zinc-300' },
  drafting: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  'in-review': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'revision-needed': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  locked: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  exported: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  superseded: { bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-400' },
};

const LIFECYCLE_ICONS: Record<string, typeof Clock> = {
  planned: Clock,
  drafting: Pencil,
  'in-review': Eye,
  'revision-needed': AlertTriangle,
  approved: CheckCircle2,
  locked: Lock,
  exported: ExternalLink,
};

export const ArtifactGraph: React.FC<ArtifactGraphProps> = ({
  programId,
  onOpenArtifact,
  onDraftWithAI,
}) => {
  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);

  const { data: artifacts = [], isLoading } = useArtifacts(programId);
  const { data: dependencies = [] } = useDependencies(programId);
  const { data: staleDeps = [] } = useStaleDependencies(programId);

  // Group by dossier module
  const moduleGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    let filtered = artifacts;
    if (filterState) filtered = filtered.filter((a: any) => a.lifecycleState === filterState);
    if (filterModule) filtered = filtered.filter((a: any) => a.dossierModule === filterModule);

    filtered.forEach((a: any) => {
      const mod = a.dossierModule || 'unassigned';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(a);
    });
    return groups;
  }, [artifacts, filterModule, filterState]);

  // Available modules for filter
  const modules = useMemo(() => {
    const mods = new Set(artifacts.map((a: any) => a.dossierModule).filter(Boolean));
    return Array.from(mods);
  }, [artifacts]);

  // Stale artifact IDs
  const staleArtifactIds = useMemo(() => {
    const ids = new Set<number>();
    staleDeps.forEach((d: any) => {
      if (d.targetType === 'artifact') ids.add(d.targetId);
    });
    return ids;
  }, [staleDeps]);

  // Stats
  const stats = useMemo(() => {
    const total = artifacts.length;
    const states: Record<string, number> = {};
    artifacts.forEach((a: any) => {
      states[a.lifecycleState] = (states[a.lifecycleState] || 0) + 1;
    });
    return { total, states, stale: staleArtifactIds.size };
  }, [artifacts, staleArtifactIds]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-violet-500" />
          <h1 className="text-base font-semibold text-zinc-900">Artifact Graph</h1>
          <span className="text-xs text-zinc-500">{stats.total} artifacts</span>
          {stats.stale > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              {stats.stale} stale
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Module filter */}
          <select
            value={filterModule || ''}
            onChange={e => setFilterModule(e.target.value || null)}
            className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
          >
            <option value="">All Modules</option>
            {modules.map(m => (
              <option key={m as string} value={m as string}>{(m as string).replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>

          {/* State filter */}
          <select
            value={filterState || ''}
            onChange={e => setFilterState(e.target.value || null)}
            className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
          >
            <option value="">All States</option>
            <option value="planned">Planned</option>
            <option value="drafting">Drafting</option>
            <option value="in-review">In Review</option>
            <option value="approved">Approved</option>
            <option value="locked">Locked</option>
          </select>
        </div>
      </div>

      {/* Lifecycle summary bar */}
      <div className="bg-white border-b px-6 py-2 flex items-center gap-4">
        {Object.entries(stats.states).map(([state, count]) => {
          const colors = LIFECYCLE_COLORS[state] || LIFECYCLE_COLORS.planned;
          return (
            <button
              key={state}
              onClick={() => setFilterState(filterState === state ? null : state)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors',
                filterState === state ? `${colors.bg} ${colors.text} font-semibold` : 'text-zinc-500 hover:bg-zinc-50'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', colors.dot)} />
              {state.replace('-', ' ')} ({count})
            </button>
          );
        })}
      </div>

      {/* Graph Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {Object.entries(moduleGroups).map(([module, arts]) => (
            <div key={module} className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                {module.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                <span className="text-xs text-zinc-500 font-normal">({arts.length} artifacts)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {arts.map((artifact: any) => {
                  const colors = LIFECYCLE_COLORS[artifact.lifecycleState] || LIFECYCLE_COLORS.planned;
                  const Icon = LIFECYCLE_ICONS[artifact.lifecycleState] || Clock;
                  const isStale = staleArtifactIds.has(artifact.id);
                  const isSelected = selectedArtifact?.id === artifact.id;

                  return (
                    <div
                      key={artifact.id}
                      onClick={() => setSelectedArtifact(isSelected ? null : artifact)}
                      className={cn(
                        'relative p-3 rounded-lg border cursor-pointer transition-all',
                        isSelected ? 'ring-2 ring-violet-400 border-violet-300' : 'hover:border-zinc-300',
                        isStale ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200',
                      )}
                    >
                      {isStale && (
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <AlertTriangle className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', colors.text)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{artifact.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-zinc-500">{artifact.code}</span>
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', colors.bg, colors.text)}>
                              {artifact.lifecycleState}
                            </span>
                            {artifact.requirementLevel === 'required' && (
                              <span className="text-xs text-red-600 font-medium">required</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(moduleGroups).length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <GitBranch className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-zinc-700">No artifacts yet</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Create a program and use auto-scaffold to generate the artifact tree for your destination type.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedArtifact && (
        <div className="border-t bg-white px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-zinc-900">{selectedArtifact.title}</h3>
                <button onClick={() => setSelectedArtifact(null)} className="ml-auto text-zinc-400 hover:text-zinc-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-zinc-500 mb-0.5">Code</p>
                  <p className="font-mono text-zinc-900">{selectedArtifact.code}</p>
                </div>
                <div>
                  <p className="text-zinc-500 mb-0.5">Type</p>
                  <p className="text-zinc-900 capitalize">{selectedArtifact.artifactType}</p>
                </div>
                <div>
                  <p className="text-zinc-500 mb-0.5">Module</p>
                  <p className="text-zinc-900">{selectedArtifact.dossierModule || '—'}</p>
                </div>
                <div>
                  <p className="text-zinc-500 mb-0.5">Requirement</p>
                  <p className="text-zinc-900 capitalize">{selectedArtifact.requirementLevel || 'required'}</p>
                </div>
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
          {/* Snow Globe risk assessment for this artifact */}
          <Suspense fallback={null}>
            <SnowGlobeArtifactSummary artifactId={selectedArtifact.id} className="mt-3 mx-auto max-w-5xl" />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default ArtifactGraph;
