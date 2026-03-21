/**
 * InconsistencyPanel — ARTOS-inspired cross-section change impact detection.
 *
 * When content changes in one section, this panel identifies other sections
 * in the same project that reference similar data points and may need updating.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Eye,
  Pencil,
  X,
  Loader2,
  CheckCircle,
  Link2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface AffectedSection {
  artifactId: string;
  artifactTitle: string;
  affectedText: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  dismissed?: boolean;
}

interface InconsistencyPanelProps {
  projectId?: string;
  activeArtifactId?: string;
  activeArtifactTitle?: string;
  activeContent?: string;
  onNavigateToArtifact?: (artifactId: string) => void;
  onUpdateArtifact?: (artifactId: string, suggestion: string) => void;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'medium':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'low':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    default:
      return 'text-zinc-600 bg-zinc-50 border-zinc-200';
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'high':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    case 'medium':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    case 'low':
      return <Link2 className="w-3.5 h-3.5 text-blue-500" />;
    default:
      return <Link2 className="w-3.5 h-3.5 text-zinc-500" />;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

const InconsistencyPanel: React.FC<InconsistencyPanelProps> = ({
  projectId,
  activeArtifactId,
  activeArtifactTitle,
  activeContent,
  onNavigateToArtifact,
  onUpdateArtifact,
  className,
}) => {
  const [affected, setAffected] = useState<AffectedSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheckedContent, setLastCheckedContent] = useState<string>('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentRef = useRef<string>('');

  // ── Check for inconsistencies ──────────────────────────────────────────
  const checkInconsistencies = useCallback(async () => {
    if (!projectId || !activeArtifactId || !activeContent) return;

    const plainText = activeContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Only check if content changed significantly (50+ chars)
    if (Math.abs(plainText.length - lastContentRef.current.length) < 50) return;
    lastContentRef.current = plainText;

    setLoading(true);
    try {
      const res = await fetch('/api/concept2cure/ai/check-inconsistency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          changedText: plainText.slice(0, 2000), // First 2000 chars
          changedSectionTitle: activeArtifactTitle,
          projectId,
          artifactId: activeArtifactId,
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        const sections = payload.data ?? payload.sections ?? payload;
        if (Array.isArray(sections)) {
          setAffected(sections);
          setLastCheckedContent(plainText.slice(0, 100));
        }
      }
    } catch {
      // silent - non-critical feature
    } finally {
      setLoading(false);
    }
  }, [projectId, activeArtifactId, activeArtifactTitle, activeContent]);

  // ── Debounced check on content change ──────────────────────────────────
  useEffect(() => {
    if (!activeContent) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      checkInconsistencies();
    }, 5000); // 5-second debounce

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeContent, checkInconsistencies]);

  // ── Reset on artifact change ───────────────────────────────────────────
  useEffect(() => {
    setAffected([]);
    setDismissed(new Set());
    lastContentRef.current = '';
  }, [activeArtifactId]);

  // ── Dismiss handler ────────────────────────────────────────────────────
  const handleDismiss = useCallback((artifactId: string) => {
    setDismissed((prev) => new Set(prev).add(artifactId));
  }, []);

  // ── Filtered results (excluding dismissed) ─────────────────────────────
  const visibleAffected = useMemo(
    () => affected.filter((a) => !dismissed.has(a.artifactId)),
    [affected, dismissed]
  );

  const highCount = visibleAffected.filter((a) => a.severity === 'high').length;
  const medCount = visibleAffected.filter((a) => a.severity === 'medium').length;
  const lowCount = visibleAffected.filter((a) => a.severity === 'low').length;

  return (
    <div className={cn('flex flex-col h-full bg-white border-l border-zinc-200', className)}>
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm text-zinc-900">
            Inconsistency Intelligence
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Detects cross-section impacts when content changes
        </p>
        {/* Summary badges */}
        {visibleAffected.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {highCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
                {highCount} critical
              </span>
            )}
            {medCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded-full">
                {medCount} moderate
              </span>
            )}
            {lowCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                {lowCount} minor
              </span>
            )}
          </div>
        )}
        {/* Manual re-check */}
        <button
          onClick={checkInconsistencies}
          disabled={loading}
          className="mt-2 flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {loading ? 'Analyzing...' : 'Re-check now'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && visibleAffected.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500 mb-2" />
            <p className="text-xs">Analyzing cross-section impacts...</p>
            <p className="text-xs text-zinc-400 mt-1">
              Comparing with other project documents
            </p>
          </div>
        ) : visibleAffected.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
            <p className="text-xs font-medium">No inconsistencies detected</p>
            <p className="text-xs text-zinc-400 mt-1">
              {lastCheckedContent
                ? 'All sections appear consistent'
                : 'Edit content to trigger analysis'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {/* Change summary */}
            <div className="px-3 py-2 bg-zinc-50 rounded-lg text-xs text-zinc-600">
              <span className="font-medium">Changes detected in:</span>{' '}
              {activeArtifactTitle || 'current section'}
              <br />
              <span className="text-zinc-400">
                {visibleAffected.length} section{visibleAffected.length !== 1 ? 's' : ''} may
                need updating
              </span>
            </div>

            {/* Affected sections */}
            {visibleAffected.map((section) => {
              const isExpanded = expandedItem === section.artifactId;
              return (
                <div
                  key={section.artifactId}
                  className={cn(
                    'rounded-lg border transition-colors',
                    getSeverityColor(section.severity)
                  )}
                >
                  <button
                    className="w-full flex items-start gap-2 p-2.5 text-left"
                    onClick={() =>
                      setExpandedItem(isExpanded ? null : section.artifactId)
                    }
                  >
                    {getSeverityIcon(section.severity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {section.artifactTitle}
                      </p>
                      <p className="text-xs opacity-75 mt-0.5 line-clamp-2">
                        {section.reason}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-current/10">
                      {/* Affected text preview */}
                      <div className="mt-2 px-2 py-1.5 bg-white/60 rounded text-xs font-mono">
                        "{section.affectedText}"
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => onNavigateToArtifact?.(section.artifactId)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white/60 hover:bg-white transition-colors duration-150"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                        <button
                          onClick={() =>
                            onUpdateArtifact?.(section.artifactId, section.affectedText)
                          }
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white/60 hover:bg-white transition-colors duration-150"
                        >
                          <Pencil className="w-3 h-3" />
                          Update
                        </button>
                        <button
                          onClick={() => handleDismiss(section.artifactId)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white/60 hover:bg-white transition-colors ml-auto"
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-zinc-200 bg-zinc-50">
        <p className="text-xs text-zinc-400 text-center">
          Powered by AI cross-reference analysis
        </p>
      </div>
    </div>
  );
};

export default InconsistencyPanel;
