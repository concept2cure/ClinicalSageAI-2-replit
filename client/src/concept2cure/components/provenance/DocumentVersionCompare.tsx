/**
 * DocumentVersionCompare — Side-by-side version comparison with real diff.
 *
 * Uses the `diff` library for accurate word-level and line-level diffs.
 * Supports side-by-side and unified view modes.
 * Shows metadata delta header: version, author, timestamp, status changes.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { diffWords, diffLines } from 'diff';
import {
  GitCompare,
  X,
  Clock,
  Hash,
  FileText,
  Loader2,
  AlertTriangle,
  ArrowLeftRight,
  Layers,
  RotateCcw,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface VersionData {
  id: number;
  version: number;
  content: string;
  contentHash: string;
  changeDescription: string | null;
  createdById: number | null;
  createdAt: string;
}

interface VersionsResponse {
  artifactId: string;
  title: string;
  currentVersion: number;
  versions: VersionData[];
}

interface DocumentVersionCompareProps {
  projectId: string;
  artifactId: string;
  onClose: () => void;
  onOpenAudit?: () => void;
  onOpenProvenance?: () => void;
  onRollbackComplete?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const truncHash = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');

/** Strip HTML tags to get plain text for diff */
const stripHtml = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ── Diff Renderer ────────────────────────────────────────────────────────────
const WordDiffView: React.FC<{ textA: string; textB: string }> = ({ textA, textB }) => {
  const changes = useMemo(() => diffWords(textA, textB), [textA, textB]);

  return (
    <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap p-4">
      {changes.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-emerald-100 text-emerald-900 rounded px-0.5">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
};

const SideBySideView: React.FC<{ textA: string; textB: string }> = ({ textA, textB }) => {
  const lineChanges = useMemo(() => diffLines(textA, textB), [textA, textB]);

  // Build paired lines for side-by-side
  const pairs: Array<{
    left: string | null;
    right: string | null;
    type: 'same' | 'changed' | 'added' | 'removed';
  }> = [];

  lineChanges.forEach(part => {
    const lines = part.value.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    lines.forEach(line => {
      if (!part.added && !part.removed) {
        pairs.push({ left: line, right: line, type: 'same' });
      } else if (part.removed) {
        pairs.push({ left: line, right: null, type: 'removed' });
      } else if (part.added) {
        pairs.push({ left: null, right: line, type: 'added' });
      }
    });
  });

  return (
    <div className="grid grid-cols-2 divide-x divide-stone-200 font-mono text-xs">
      {/* Left side */}
      <div className="overflow-y-auto max-h-[60vh]">
        <div className="px-1 py-0.5 text-xs font-semibold text-stone-400 bg-stone-50 border-b border-stone-200 sticky top-0">
          OLDER VERSION
        </div>
        {pairs.map((p, i) => (
          <div
            key={i}
            className={`px-2 py-0.5 min-h-[1.4em] ${
              p.type === 'removed'
                ? 'bg-red-50 text-red-800'
                : p.type === 'added'
                  ? 'bg-stone-50 text-stone-400'
                  : ''
            }`}
          >
            {p.left ?? ''}
          </div>
        ))}
      </div>
      {/* Right side */}
      <div className="overflow-y-auto max-h-[60vh]">
        <div className="px-1 py-0.5 text-xs font-semibold text-stone-400 bg-stone-50 border-b border-stone-200 sticky top-0">
          NEWER VERSION
        </div>
        {pairs.map((p, i) => (
          <div
            key={i}
            className={`px-2 py-0.5 min-h-[1.4em] ${
              p.type === 'added'
                ? 'bg-emerald-50 text-emerald-800'
                : p.type === 'removed'
                  ? 'bg-stone-50 text-stone-400'
                  : ''
            }`}
          >
            {p.right ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Stats ────────────────────────────────────────────────────────────────────
const DiffStats: React.FC<{ textA: string; textB: string }> = ({ textA, textB }) => {
  const changes = useMemo(() => diffWords(textA, textB), [textA, textB]);
  const added = changes.filter(c => c.added).reduce((s, c) => s + (c.count || 0), 0);
  const removed = changes.filter(c => c.removed).reduce((s, c) => s + (c.count || 0), 0);
  const unchanged = changes
    .filter(c => !c.added && !c.removed)
    .reduce((s, c) => s + (c.count || 0), 0);

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-emerald-600">+{added} added</span>
      <span className="text-red-600">−{removed} removed</span>
      <span className="text-stone-400">{unchanged} unchanged</span>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const DocumentVersionCompare: React.FC<DocumentVersionCompareProps> = ({
  projectId,
  artifactId,
  onClose,
  onOpenAudit,
  onOpenProvenance,
  onRollbackComplete,
}) => {
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [title, setTitle] = useState('');
  const [currentVersion, setCurrentVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionA, setVersionA] = useState<number | null>(null);
  const [versionB, setVersionB] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [rollingBack, setRollingBack] = useState(false);
  const [reviewingImpact, setReviewingImpact] = useState(false);
  const [impactResult, setImpactResult] = useState<{ content: string; savedId?: number } | null>(null);
  const [rollbackResult, setRollbackResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch versions
  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('GET',
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/versions`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload.success && payload.data) {
        const d = payload.data as VersionsResponse;
        setVersions(d.versions);
        setTitle(d.title);
        setCurrentVersion(d.currentVersion);
        // Auto-select last two versions
        if (d.versions.length >= 2) {
          setVersionA(d.versions[1].version);
          setVersionB(d.versions[0].version);
        } else if (d.versions.length === 1) {
          setVersionA(d.versions[0].version);
          setVersionB(d.versions[0].version);
        }
      } else {
        setError('No version data available');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [projectId, artifactId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Rollback handler
  const handleRollback = useCallback(
    async (targetVersion: number) => {
      setRollingBack(true);
      setRollbackResult(null);
      try {
        const res = await apiRequest('POST',
          `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/rollback`,
          { targetVersion }
        );
        const payload = await res.json();
        const d = payload.data ?? payload;
        if (res.ok) {
          setRollbackResult({
            success: true,
            message: `Rolled back to v${targetVersion} → created v${d.newVersion}`,
          });
          await fetchVersions();
          onRollbackComplete?.();
        } else {
          setRollbackResult({
            success: false,
            message: d.message || payload.message || 'Rollback failed',
          });
        }
      } catch {
        setRollbackResult({ success: false, message: 'Network error during rollback' });
      } finally {
        setRollingBack(false);
        setTimeout(() => setRollbackResult(null), 5000);
      }
    },
    [projectId, artifactId, fetchVersions, onRollbackComplete]
  );

  // ── Review Regulatory Impact handler ──────────────────────────────────────
  const handleReviewImpact = useCallback(async (vA: number, vB: number, save: boolean = false) => {
    setReviewingImpact(true);
    setImpactResult(null);
    try {
      const res = await apiRequest('POST', '/api/ana-ri/execute', {
          command: 'review_version_impact',
          params: {
            projectId: Number(projectId),
            artifactId: Number(artifactId),
            versionA: vA,
            versionB: vB,
            saveAsArtifact: save,
          },
      });
      const result = await res.json();
      if (result.success && result.data?.impact) {
        setImpactResult({ content: result.data.impact, savedId: result.data.savedAsArtifactId });
      } else {
        setImpactResult({ content: `Impact review failed: ${result.message || result.error || 'Unknown error'}` });
      }
    } catch (err: any) {
      setImpactResult({ content: `Impact review failed: ${err?.message || 'Network error'}` });
    } finally {
      setReviewingImpact(false);
    }
  }, [projectId, artifactId]);

  const selectedA = versions.find(v => v.version === versionA);
  const selectedB = versions.find(v => v.version === versionB);
  const textA = selectedA ? stripHtml(selectedA.content || '') : '';
  const textB = selectedB ? stripHtml(selectedB.content || '') : '';

  // Loading
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-stone-200">
        <div className="text-center">
          <Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading versions…</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || versions.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white border-l border-stone-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200">
          <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
            <GitCompare className="w-4 h-4 text-purple-500" /> Version Compare
          </span>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-xs text-stone-500">
              {error ||
                'No versions available for comparison. Save document edits to create version history for regulatory change control.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-stone-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200 bg-stone-50 shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold text-stone-900">Version Compare</span>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Version selectors */}
      <div className="px-3 py-2 border-b border-stone-200 bg-stone-50/50">
        <div className="text-xs text-stone-500 mb-1 font-medium">{title}</div>
        <div className="flex items-center gap-2">
          {/* Version A selector */}
          <div className="flex-1">
            <label className="text-xs text-stone-400 block mb-0.5">From (older)</label>
            <select
              value={versionA ?? ''}
              onChange={e => setVersionA(Number(e.target.value))}
              className="w-full text-xs border border-stone-200 rounded px-2 py-1 bg-white"
            >
              {versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {formatDate(v.createdAt)}
                </option>
              ))}
            </select>
          </div>

          <ArrowLeftRight className="w-4 h-4 text-stone-400 mt-3" />

          {/* Version B selector */}
          <div className="flex-1">
            <label className="text-xs text-stone-400 block mb-0.5">To (newer)</label>
            <select
              value={versionB ?? ''}
              onChange={e => setVersionB(Number(e.target.value))}
              className="w-full text-xs border border-stone-200 rounded px-2 py-1 bg-white"
            >
              {versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === currentVersion ? ' (current)' : ''} — {formatDate(v.createdAt)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metadata delta header */}
      {selectedA && selectedB && (
        <div className="px-3 py-2 border-b border-stone-200 bg-white">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="text-stone-400 font-medium">Version A (v{selectedA.version})</div>
              <div className="flex items-center gap-1 text-stone-500">
                <Clock className="w-3 h-3" /> {formatDate(selectedA.createdAt)}
              </div>
              <div className="flex items-center gap-1 text-stone-500">
                <Hash className="w-3 h-3" />
                <span className="font-mono">{truncHash(selectedA.contentHash)}</span>
              </div>
              {selectedA.changeDescription && (
                <div className="text-stone-600 italic">{selectedA.changeDescription}</div>
              )}
            </div>
            <div className="space-y-0.5">
              <div className="text-stone-400 font-medium">Version B (v{selectedB.version})</div>
              <div className="flex items-center gap-1 text-stone-500">
                <Clock className="w-3 h-3" /> {formatDate(selectedB.createdAt)}
              </div>
              <div className="flex items-center gap-1 text-stone-500">
                <Hash className="w-3 h-3" />
                <span className="font-mono">{truncHash(selectedB.contentHash)}</span>
              </div>
              {selectedB.changeDescription && (
                <div className="text-stone-600 italic">{selectedB.changeDescription}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-stone-200">
            <DiffStats textA={textA} textB={textB} />
            <div className="flex items-center gap-1">
              {/* Regulatory Impact Review button */}
              {versionA !== null && versionB !== null && versionA !== versionB && (
                <button
                  onClick={() => handleReviewImpact(versionA, versionB)}
                  disabled={reviewingImpact}
                  className="px-2 py-0.5 text-xs rounded bg-[#FBF0EB] text-[#D97757] hover:bg-[#F5E1D6] disabled:opacity-60 flex items-center gap-0.5 font-medium"
                >
                  {reviewingImpact ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Review Impact
                </button>
              )}
              {/* Rollback button */}
              {versionA && versionA !== currentVersion && (
                <button
                  onClick={() => handleRollback(versionA)}
                  disabled={rollingBack}
                  className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60 flex items-center gap-0.5 font-medium"
                >
                  {rollingBack ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Rollback to v{versionA}
                </button>
              )}
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`px-2 py-0.5 text-xs rounded ${
                  viewMode === 'side-by-side'
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                <Layers className="w-3 h-3 inline mr-0.5" />
                Side by Side
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-2 py-0.5 text-xs rounded ${
                  viewMode === 'unified'
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                <FileText className="w-3 h-3 inline mr-0.5" />
                Unified
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback result banner */}
      {rollbackResult && (
        <div
          className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-b ${rollbackResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}
        >
          {rollbackResult.success ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {rollbackResult.message}
        </div>
      )}

      {/* Regulatory Impact Review result */}
      {impactResult && (
        <div className="border-b border-stone-200 bg-[#FAF9F5]">
          <div className="px-3 py-2 flex items-center justify-between border-b border-[#F5F4EF]">
            <span className="text-xs font-semibold text-[#D97757] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Regulatory Impact Review
            </span>
            <div className="flex items-center gap-1">
              {versionA !== null && versionB !== null && (
                <button
                  onClick={() => handleReviewImpact(versionA, versionB, true)}
                  disabled={reviewingImpact}
                  className="px-2 py-0.5 text-xs rounded bg-[#D97757] text-white hover:bg-[#C56847] disabled:opacity-60 flex items-center gap-0.5 font-medium"
                >
                  Save as Artifact
                </button>
              )}
              <button
                onClick={() => setImpactResult(null)}
                className="text-stone-400 hover:text-stone-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="px-3 py-2 max-h-64 overflow-y-auto text-xs text-stone-700 prose prose-xs prose-stone max-w-none whitespace-pre-wrap">
            {impactResult.content}
          </div>
          {impactResult.savedId && (
            <div className="px-3 py-1.5 border-t border-[#F5F4EF] text-xs text-emerald-700 bg-emerald-50 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved as governed artifact #{impactResult.savedId}
            </div>
          )}
        </div>
      )}

      {/* Diff view */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedA && selectedB ? (
          versionA === versionB ? (
            <div className="flex items-center justify-center h-full text-stone-400 text-xs">
              Same version selected — choose different versions to compare
            </div>
          ) : viewMode === 'side-by-side' ? (
            <SideBySideView textA={textA} textB={textB} />
          ) : (
            <WordDiffView textA={textA} textB={textB} />
          )
        ) : (
          <div className="flex items-center justify-center h-full text-stone-400 text-xs">
            Select two versions above to compare
          </div>
        )}
      </div>

      {/* Cross-panel actions */}
      {(onOpenAudit || onOpenProvenance) && (
        <div className="px-3 py-1.5 border-t border-stone-200 bg-stone-50/50 flex gap-2 shrink-0">
          {onOpenProvenance && (
            <button
              onClick={onOpenProvenance}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium"
            >
              Provenance
            </button>
          )}
          {onOpenAudit && (
            <button
              onClick={onOpenAudit}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
            >
              Audit Report
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-stone-200 bg-stone-50/30 shrink-0">
        <p className="text-xs text-stone-400 text-center">
          {versions.length} version{versions.length !== 1 ? 's' : ''} · Real diff comparison ·
          SHA-256 integrity chain
        </p>
      </div>
    </div>
  );
};

export default DocumentVersionCompare;
