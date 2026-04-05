/**
 * SourceCitationsPanel — Sentence-level source traceability display.
 *
 * Fetches source citations from /api/documents/:id/sources and displays
 * them organized by sentence, showing the evidence source, confidence,
 * and type for each claim. Supports auto-analysis to discover new citations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Loader2,
  X,
  RefreshCw,
  ExternalLink,
  Shield,
  AlertTriangle,
  CheckCircle,
  FileText,
  BookOpen,
  Microscope,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

// ── Types ───────────────────────────────────────────────────────────────────

interface SourceLink {
  id: number;
  documentId: number;
  sentenceIndex: number;
  sentenceText: string;
  sourceType: 'trial_data' | 'literature' | 'regulatory_guidance' | 'internal_data';
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  confidence: number;
  createdAt?: string;
}

interface SourceCitationsPanelProps {
  artifactId?: string | number;
  onClose: () => void;
}

const SOURCE_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  trial_data: { label: 'Clinical Trial', icon: <Microscope className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50' },
  literature: { label: 'Literature', icon: <BookOpen className="w-3 h-3" />, color: 'text-emerald-600 bg-emerald-50' },
  regulatory_guidance: { label: 'Regulatory', icon: <Building2 className="w-3 h-3" />, color: 'text-stone-600 bg-stone-100' },
  internal_data: { label: 'Internal Data', icon: <Database className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50' },
};

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.8) return { text: 'High', color: 'text-emerald-600' };
  if (confidence >= 0.6) return { text: 'Medium', color: 'text-amber-600' };
  return { text: 'Low', color: 'text-red-500' };
}

// ── Component ───────────────────────────────────────────────────────────────

const SourceCitationsPanel: React.FC<SourceCitationsPanelProps> = ({ artifactId, onClose }) => {
  const [sources, setSources] = useState<SourceLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchSources = useCallback(async () => {
    if (!artifactId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/documents/${artifactId}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
        setTotal(data.total || 0);
      }
    } catch {
      // Source fetch failed
    } finally {
      setLoading(false);
    }
  }, [artifactId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleAnalyze = useCallback(async () => {
    if (!artifactId) return;
    setAnalyzing(true);
    try {
      const res = await apiRequest('POST', `/api/documents/${artifactId}/sources/analyze`, {
        autoSave: true,
      });
      if (res.ok) {
        // Refresh sources after analysis
        await fetchSources();
      }
    } catch {
      // Analysis failed
    } finally {
      setAnalyzing(false);
    }
  }, [artifactId, fetchSources]);

  // Group sources by sentence
  const groupedBySentence = sources.reduce<Map<number, SourceLink[]>>((acc, src) => {
    const existing = acc.get(src.sentenceIndex) || [];
    existing.push(src);
    acc.set(src.sentenceIndex, existing);
    return acc;
  }, new Map());

  const supportedCount = sources.filter(s => s.confidence >= 0.7).length;
  const weakCount = sources.filter(s => s.confidence >= 0.4 && s.confidence < 0.7).length;
  const unsupportedCount = sources.filter(s => s.confidence < 0.4).length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-800">Source Traceability</h3>
            <p className="text-[11px] text-stone-500">Sentence-level evidence citations</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !artifactId}
            className="px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {analyzing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Analyze
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {total > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/50">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-stone-600">{supportedCount} supported</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-stone-600">{weakCount} weak</span>
          </div>
          {unsupportedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-stone-600">{unsupportedCount} unsupported</span>
            </div>
          )}
          <span className="text-[10px] text-stone-400 ml-auto">
            {groupedBySentence.size} sentence{groupedBySentence.size !== 1 ? 's' : ''} with citations
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border border-stone-100 p-3 space-y-2">
                <div className="h-3 bg-stone-100 rounded animate-pulse w-full" />
                <div className="h-3 bg-stone-50 rounded animate-pulse w-4/5" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 w-16 bg-blue-50 rounded animate-pulse" />
                  <div className="h-5 bg-stone-50 rounded animate-pulse flex-1" />
                  <div className="h-5 w-8 bg-stone-50 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !artifactId ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <FileText className="w-8 h-8 text-stone-300 mb-3" />
            <p className="text-sm text-stone-500">Select a document to view source citations</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Shield className="w-8 h-8 text-stone-300 mb-3" />
            <p className="text-sm font-medium text-stone-600 mb-1">No citations yet</p>
            <p className="text-xs text-stone-500 max-w-[260px] leading-relaxed">
              Citations are automatically extracted when you use AI to edit or generate content.
              You can also click "Analyze" to scan existing content for verifiable claims.
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {Array.from(groupedBySentence.entries())
              .sort(([a], [b]) => a - b)
              .map(([sentenceIndex, links]) => (
                <div
                  key={sentenceIndex}
                  className="rounded-lg border border-stone-150 p-3 hover:border-blue-200 transition-colors"
                >
                  {/* Sentence text */}
                  <p className="text-[13px] text-stone-700 leading-relaxed mb-2">
                    <span className="text-[10px] font-mono text-stone-400 mr-1.5">
                      S{sentenceIndex + 1}
                    </span>
                    {links[0].sentenceText.length > 200
                      ? links[0].sentenceText.substring(0, 200) + '…'
                      : links[0].sentenceText}
                  </p>

                  {/* Source links */}
                  <div className="space-y-1.5">
                    {links.map(link => {
                      const meta = SOURCE_TYPE_META[link.sourceType] || SOURCE_TYPE_META.internal_data;
                      const conf = confidenceLabel(link.confidence);
                      return (
                        <div
                          key={link.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded', meta.color)}>
                            {meta.icon}
                            {meta.label}
                          </span>
                          <span className="text-stone-600 truncate flex-1" title={link.sourceTitle}>
                            {link.sourceTitle}
                          </span>
                          <span className={cn('font-medium', conf.color)}>
                            {Math.round(link.confidence * 100)}%
                          </span>
                          {link.sourceUrl && (
                            <a
                              href={link.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-stone-400 hover:text-blue-500"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SourceCitationsPanel;
