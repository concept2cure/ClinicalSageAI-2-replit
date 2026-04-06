/**
 * DataRoomPanel — Weave-inspired centralized source data management panel.
 *
 * Smart repository for all source files with AI-extracted metadata,
 * semantic search, and drag-to-editor citation linking.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import {
  Database,
  Search,
  Upload,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Clock,
  Tag,
  ExternalLink,
  GripVertical,
  Sparkles,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import DossierUploadClassifier from './DossierUploadClassifier';

// ── Types ────────────────────────────────────────────────────────────────────

interface SourceFile {
  id: string;
  title: string;
  type: string;
  category: string;
  fileType?: string;
  uploadedAt: string;
  size?: number;
  metadata?: {
    studyType?: string;
    endpoints?: string[];
    sampleSize?: string;
    keyFindings?: string[];
    pValues?: string[];
    therapeuticArea?: string;
    phase?: string;
    dossierClassification?: {
      submissionTrack?: string;
      moduleCode?: string;
      ctdSection?: string;
      documentFamily?: string;
      sourceType?: string;
      tags?: string[];
      feedsModule3?: boolean;
    };
  };
  status?: 'processing' | 'ready' | 'error';
  excerpt?: string;
  ctdSection?: string;
}

interface DataRoomPanelProps {
  projectId?: string;
  onSourceSelect?: (source: SourceFile) => void;
  onSourceDrag?: (source: SourceFile) => void;
  onUpload?: () => void;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  const t = type?.toLowerCase() || '';
  if (t.includes('pdf') || t.includes('document'))
    return <FileText className="w-4 h-4 text-stone-900" />;
  if (t.includes('spreadsheet') || t.includes('excel') || t.includes('csv'))
    return <FileSpreadsheet className="w-4 h-4 text-stone-900" />;
  if (t.includes('image') || t.includes('jpeg') || t.includes('png'))
    return <FileImage className="w-4 h-4 text-stone-900" />;
  return <File className="w-4 h-4 text-stone-500" />;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

const DataRoomPanel: React.FC<DataRoomPanelProps> = ({
  projectId,
  onSourceSelect,
  onSourceDrag,
  onUpload,
  className,
}) => {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);

  // ── Load source files ────────────────────────────────────────────────────
  const loadSources = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      if (res.ok) {
        const payload = await res.json();
        const all = payload.data ?? payload;
        // Show ALL project documents — source files, authored documents, evidence
        // Every document in the project is accessible from the Data Room
        const sourceFiles: SourceFile[] = (Array.isArray(all) ? all : []).map(
          (a: Record<string, unknown>) => {
            const cat = ((a.category as string) || '').toLowerCase();
            const typ = ((a.type as string) || '').toLowerCase();
            const isSource =
              cat === 'source' ||
              cat === 'evidence' ||
              cat === 'upload' ||
              typ === 'source_document' ||
              typ.includes('upload');
            return {
              id: a.id as string,
              title: (a.title as string) || 'Untitled',
              type: (a.type as string) || 'document',
              category: isSource
                ? (a.category as string) || 'source'
                : (a.category as string) || 'document',
              uploadedAt: (a.createdAt as string) || new Date().toISOString(),
              status: 'ready' as const,
              excerpt:
                typeof a.content === 'string'
                  ? (a.content as string).replace(/<[^>]+>/g, '').slice(0, 200)
                  : undefined,
              metadata: (a.metadata as SourceFile['metadata']) || undefined,
              ctdSection: a.ctdSection as string | undefined,
            };
          }
        );
        setSources(sourceFiles);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // ── Extract metadata via AI ──────────────────────────────────────────────
  const handleExtractMetadata = useCallback(
    async (sourceId: string) => {
      if (!projectId) return;
      setExtracting(sourceId);
      try {
        const res = await apiRequest('POST', '/api/concept2cure/ai/extract-metadata', {
          projectId,
          artifactId: sourceId,
        });
        if (res.ok) {
          const payload = await res.json();
          const metadata = payload.data ?? payload;
          setSources(prev => prev.map(s => (s.id === sourceId ? { ...s, metadata } : s)));
        }
      } catch {
        // silent
      } finally {
        setExtracting(null);
      }
    },
    [projectId]
  );

  // ── Filter sources ────────────────────────────────────────────────────────
  const filteredSources = useMemo(() => {
    let filtered = sources;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.type.toLowerCase().includes(q) ||
          s.excerpt?.toLowerCase().includes(q)
      );
    }
    if (filterType === 'sources') {
      filtered = filtered.filter(s => {
        const cat = s.category.toLowerCase();
        const typ = s.type.toLowerCase();
        return (
          cat === 'source' ||
          cat === 'evidence' ||
          cat === 'upload' ||
          typ === 'source_document' ||
          typ.includes('upload')
        );
      });
    } else if (filterType === 'authored') {
      filtered = filtered.filter(s => {
        const cat = s.category.toLowerCase();
        return cat === 'document' || cat === 'interactive' || cat === 'visualization';
      });
    } else if (filterType === 'feedsM3') {
      filtered = filtered.filter(s => s.metadata?.dossierClassification?.feedsModule3 === true);
    } else if (filterType !== 'all') {
      filtered = filtered.filter(s => s.type === filterType || s.category === filterType);
    }
    return filtered;
  }, [sources, search, filterType]);

  const typeOptions = useMemo(() => {
    const types = new Set(sources.map(s => s.type));
    return Array.from(types);
  }, [sources]);

  const sourceDocCount = useMemo(
    () =>
      sources.filter(s => {
        const cat = s.category.toLowerCase();
        const typ = s.type.toLowerCase();
        return cat === 'source' || cat === 'evidence' || typ === 'source_document';
      }).length,
    [sources]
  );

  const authoredCount = useMemo(
    () =>
      sources.filter(s => {
        const cat = s.category.toLowerCase();
        return cat === 'document' || cat === 'interactive' || cat === 'visualization';
      }).length,
    [sources]
  );

  const feedsM3Count = useMemo(
    () => sources.filter(s => s.metadata?.dossierClassification?.feedsModule3 === true).length,
    [sources]
  );

  return (
    <div className={cn('flex flex-col h-full bg-white border-l border-stone-200', className)}>
      {/* Header */}
      <div className="p-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-stone-700" />
          <span className="font-semibold text-sm text-stone-900">Data Room</span>
          <span className="ml-auto text-xs text-stone-500">
            {sources.length} file{sources.length !== 1 ? 's' : ''}
            {sourceDocCount > 0 && ` · ${sourceDocCount} source${sourceDocCount !== 1 ? 's' : ''}`}
            {authoredCount > 0 && ` · ${authoredCount} authored`}
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sources..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus-visible:ring-2 outline-none focus:ring-stone-900"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-3 h-3 text-stone-400" />
            </button>
          )}
        </div>
        {/* Filter + Upload row */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors duration-150',
              showFilters
                ? 'bg-stone-100 border-stone-200 text-stone-800'
                : 'border-stone-200 text-stone-600 hover:bg-stone-50'
            )}
          >
            <Filter className="w-3 h-3" />
            Filter
          </button>
          <label className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-stone-200 text-stone-600 hover:bg-stone-50 ml-auto cursor-pointer">
            <Upload className="w-3 h-3" />
            Upload
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !projectId) return;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('projectId', projectId);
                try {
                  const headers: Record<string, string> = getAuthHeaders();
                  delete headers['Content-Type']; // let browser set multipart boundary
                  const res = await fetch('/api/concept2cure/documents/upload', {
                    method: 'POST',
                    body: formData,
                    headers,
                    credentials: 'include',
                  });
                  if (res.ok) {
                    loadSources();
                  }
                } catch {
                  // Upload failed
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {/* Filter chips */}
        {showFilters && (
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              { key: 'all', label: 'All Files' },
              { key: 'sources', label: `Sources (${sourceDocCount})` },
              { key: 'authored', label: `Authored (${authoredCount})` },
              ...(feedsM3Count > 0 ? [{ key: 'feedsM3', label: `Feeds M3 (${feedsM3Count})` }] : []),
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-full border transition-colors',
                  filterType === key
                    ? 'bg-stone-100 border-stone-300 text-stone-800'
                    : 'border-stone-200 text-stone-500 hover:bg-stone-50'
                )}
              >
                {label}
              </button>
            ))}
            {typeOptions
              .filter(t => !['source_document', 'document'].includes(t))
              .map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded-full border transition-colors',
                    filterType === t
                      ? 'bg-stone-100 border-stone-300 text-stone-800'
                      : 'border-stone-200 text-stone-500 hover:bg-stone-50'
                  )}
                >
                  {t}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Dossier-Aware Upload Classifier (Phase 1 — Module 3 Workflow Convergence) */}
      {projectId && (
        <div className="px-2 pt-2">
          <DossierUploadClassifier
            projectId={projectId}
            onUploadComplete={loadSources}
          />
        </div>
      )}

      {/* Source list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border border-stone-100 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-stone-100 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-stone-100 rounded animate-pulse w-3/4" />
                    <div className="h-2 bg-stone-50 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-stone-500">
            <Database className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">
              {sources.length === 0 ? 'No files in this project yet' : 'No files match your search'}
            </p>
            {sources.length === 0 && (
              <button onClick={onUpload} className="mt-2 text-xs text-stone-700 hover:underline">
                Upload your first source
              </button>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {filteredSources.map(source => {
              const isExpanded = expandedSource === source.id;
              return (
                <div
                  key={source.id}
                  className="border border-stone-200 rounded-lg bg-white hover:border-stone-300 transition-colors duration-150"
                  draggable
                  onDragStart={() => onSourceDrag?.(source)}
                >
                  {/* Main row */}
                  <button
                    className="w-full flex items-start gap-2 p-2.5 text-left"
                    onClick={() => {
                      setExpandedSource(isExpanded ? null : source.id);
                      onSourceSelect?.(source);
                    }}
                  >
                    <GripVertical className="w-3 h-3 text-stone-400 mt-0.5 flex-shrink-0 cursor-grab" />
                    {getFileIcon(source.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{source.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {source.ctdSection && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 rounded text-stone-600 font-medium">
                            {source.ctdSection}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            source.category === 'source' || source.type === 'source_document'
                              ? 'bg-stone-100 text-stone-700'
                              : 'bg-stone-100 text-stone-500'
                          )}
                        >
                          {source.category === 'source' || source.type === 'source_document'
                            ? 'Source'
                            : source.type === 'document'
                              ? 'Authored'
                              : source.type}
                        </span>
                        <span className="text-xs text-stone-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(source.uploadedAt)}
                        </span>
                        {source.size && (
                          <span className="text-xs text-stone-400">
                            {formatFileSize(source.size)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {source.status === 'processing' && (
                        <Loader2 className="w-3 h-3 animate-spin text-stone-900" />
                      )}
                      {source.status === 'error' && (
                        <AlertCircle className="w-3 h-3 text-stone-900" />
                      )}
                      {source.status === 'ready' && (
                        <CheckCircle className="w-3 h-3 text-stone-900" />
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-stone-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded metadata */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-stone-200">
                      {source.excerpt && (
                        <p className="text-xs text-stone-500 mt-2 line-clamp-3">{source.excerpt}</p>
                      )}
                      {/* AI Metadata */}
                      {source.metadata ? (
                        <div className="mt-2 space-y-1.5">
                          {source.metadata.studyType && (
                            <div className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-stone-400" />
                              <span className="text-xs text-stone-600">
                                {source.metadata.studyType}
                              </span>
                            </div>
                          )}
                          {source.metadata.endpoints && source.metadata.endpoints.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-stone-600">Endpoints:</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {source.metadata.endpoints.map((ep, i) => (
                                  <span
                                    key={i}
                                    className="text-xs px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded"
                                  >
                                    {ep}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {source.metadata.keyFindings &&
                            source.metadata.keyFindings.length > 0 && (
                              <div>
                                <span className="text-xs font-medium text-stone-600">
                                  Key Findings:
                                </span>
                                {source.metadata.keyFindings.map((f, i) => (
                                  <p key={i} className="text-xs text-stone-500 ml-2">
                                    {f}
                                  </p>
                                ))}
                              </div>
                            )}
                          {source.metadata.sampleSize && (
                            <div className="text-xs text-stone-600">
                              N = {source.metadata.sampleSize}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleExtractMetadata(source.id);
                          }}
                          disabled={extracting === source.id}
                          className="mt-2 flex items-center gap-1 text-xs text-stone-600 hover:text-stone-700"
                        >
                          {extracting === source.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Extract metadata with AI
                        </button>
                      )}
                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-200">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSourceSelect?.(source);
                          }}
                          className="text-xs text-stone-600 hover:text-stone-600 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </button>
                        <span className="text-xs text-stone-400">Drag into editor to cite</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataRoomPanel;
