/**
 * VaultPage — Project-scoped Data Room with Browse + Ask tabs.
 *
 * Browse: file and artifact browser grouped by folder
 * Ask: semantic Q&A over project evidence with grounded sources
 * Upload: evidence document upload to project intelligence
 *
 * Closes Weave parity gap: "Data Room / Ask"
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import {
  Archive,
  Search,
  FileText,
  Upload,
  MessageSquareText,
  Database,
  Paperclip,
  ArrowRight,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VaultItem {
  id: string;
  title: string;
  type?: string;
  status?: string;
  folder?: string;
  ctdSection?: string;
  version?: number;
  updatedAt?: string;
}

interface AskSource {
  docId?: string;
  docTitle?: string;
  excerpt?: string;
  relevanceScore?: number;
}

interface ProjectDocument {
  id?: string;
  fileName?: string;
  originalName?: string;
  title?: string;
  createdAt?: string;
}

const FOLDER_LABELS: Record<string, string> = {
  drafts: 'Drafts',
  generated: 'Generated',
  dossier: 'Dossier',
  evidence: 'Evidence Packs',
  cmc: 'CMC',
  ind: 'IND',
  ectd: 'eCTD',
  clinical: 'Clinical / CSR Evidence',
  audit: 'Audit / Provenance',
  final: 'Submitted / Final',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-stone-400' },
  review: { label: 'In Review', color: 'text-amber-600' },
  approved: { label: 'Approved', color: 'text-emerald-600' },
  locked: { label: 'Ready', color: 'text-blue-600' },
};

interface VaultPageProps {
  projectId?: string;
  projectName?: string;
  onOpenDocument?: (docId: string) => void;
  onDraftFromSource?: (sourceTitle: string, sourceId: string) => void;
}

type VaultTab = 'browse' | 'ask';

// ─── Component ──────────────────────────────────────────────────────────────

export const VaultPage: React.FC<VaultPageProps> = ({ projectId, projectName, onOpenDocument, onDraftFromSource }) => {
  const [activeTab, setActiveTab] = useState<VaultTab>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // ── Browse state ──
  const { data: artifacts, isLoading, error } = useQuery<VaultItem[]>({
    queryKey: queryKeys.projects.vaultArtifacts(projectId || 'none'),
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      if (!res.ok) throw new Error('Failed to load vault items');
      const json = await res.json();
      return json.data ?? json.artifacts ?? json ?? [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── Ask state ──
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<AskSource[]>([]);
  const [asking, setAsking] = useState(false);
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadProjectDocs = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest('GET', `/api/client-intelligence/project/${projectId}/documents`);
      const json = await res.json();
      setProjectDocs(json.documents || []);
    } catch {
      setProjectDocs([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectDocs();
  }, [loadProjectDocs]);

  const suggestedQuestions = useMemo(() => [
    'What are the highest-risk evidence gaps in this project?',
    'Which uploaded documents best support the submission package?',
    'Summarize the strongest source-backed claims across all sections.',
  ], []);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || question.trim().length < 3 || !projectId) return;
    setAsking(true);
    try {
      const docContext = projectDocs.length > 0
        ? `Prefer these project documents: ${projectDocs.slice(0, 8).map(d => d.fileName || d.originalName || d.title).filter(Boolean).join(', ')}`
        : undefined;
      const res = await apiRequest('POST', '/api/evidence/ask', {
        question: question.trim(),
        projectId,
        context: docContext,
      });
      const json = await res.json();
      const payload = json.data || json;
      setAnswer(payload.answer || 'No answer returned.');
      setSources(payload.sources || []);
    } catch {
      setAnswer('Evidence Q&A is temporarily unavailable.');
      setSources([]);
    } finally {
      setAsking(false);
    }
  }, [question, projectId, projectDocs]);

  const handleUpload = useCallback(async (file?: File | null) => {
    if (!projectId || !file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token') || '';
      const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
      await fetch(`/api/client-intelligence/project/${projectId}/documents/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-organization-id': organizationId,
        },
      });
      await loadProjectDocs();
      toast({ title: 'Document uploaded successfully' });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [projectId, loadProjectDocs, toast]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    const items = artifacts ?? [];
    const q = searchQuery.trim().toLowerCase();
    return q
      ? items.filter(a =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.ctdSection || '').toLowerCase().includes(q) ||
          (a.type || '').toLowerCase().includes(q) ||
          (a.folder || '').toLowerCase().includes(q)
        )
      : items;
  }, [artifacts, searchQuery]);

  // Group filtered items by folder
  const grouped = useMemo(() => {
    const groups = new Map<string, VaultItem[]>();
    for (const item of filteredItems) {
      const folder = item.folder || 'drafts';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  if (!projectId) {
    return (
      <WorkspaceCanvas maxWidth="4xl" testId="vault-page">
        <div className="flex flex-col items-center justify-center py-20">
          <Archive className="w-10 h-10 text-stone-300 mb-3" />
          <p className="text-sm text-stone-500">Select a project to view its data room</p>
        </div>
      </WorkspaceCanvas>
    );
  }

  return (
    <WorkspaceCanvas maxWidth="5xl" testId="vault-page">
      <PageTitleHeader
        title="References"
        subtitle={`Evidence and files for ${projectName || 'project'}`}
      />

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 mt-4 mb-4 border-b border-stone-200" role="tablist" aria-label="References tabs">
        {([
          { id: 'browse' as const, label: 'Browse', icon: <Archive className="w-3.5 h-3.5" /> },
          { id: 'ask' as const, label: 'Ask', icon: <MessageSquareText className="w-3.5 h-3.5" /> },
        ]).map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-600'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* Upload button */}
        <div className="ml-auto">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 rounded-md hover:bg-stone-200 transition-colors cursor-pointer">
            {uploading ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading...' : 'Upload Evidence'}
            <input
              type="file"
              className="hidden"
              onChange={e => handleUpload(e.target.files?.[0])}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* ── Browse tab ── */}
      {activeTab === 'browse' && (
        <>
          {/* Search */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search files and artifacts..."
                className="w-full pl-10 pr-4 text-sm"
              />
            </div>
          </div>

          {/* File tree grouped by folder */}
          <DataStateWrapper
            data={filteredItems}
            isLoading={isLoading}
            error={error}
            emptyTitle={searchQuery ? 'No matching files' : 'No files or artifacts yet'}
            emptyDescription={searchQuery ? 'Try a different search term' : 'Upload evidence documents or create artifacts from the Tools workbench'}
          >
            {() => (
              <div className="space-y-4">
                {Array.from(grouped.entries()).map(([folder, items]) => (
                  <div key={folder}>
                    <div className="flex items-center gap-2 px-2 py-2 mb-0.5">
                      <span className="text-xs font-medium text-stone-500">
                        {FOLDER_LABELS[folder] || folder}
                      </span>
                      <span className="text-[10px] text-stone-300">{items.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.map(item => {
                        const statusCfg = STATUS_LABEL[item.status || 'draft'] ?? STATUS_LABEL.draft;
                        const meta = [
                          item.ctdSection,
                          item.version ? `v${item.version}` : null,
                          statusCfg.label,
                        ].filter(Boolean).join(' · ');
                        return (
                          <div
                            key={item.id}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors group"
                          >
                            <button
                              onClick={() => onOpenDocument?.(item.id)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                            >
                              <FileText className="w-4 h-4 text-stone-300 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-stone-700 truncate block">{item.title}</span>
                                {meta && <span className="text-[11px] text-stone-400 truncate block mt-0.5">{meta}</span>}
                              </div>
                            </button>
                            {onDraftFromSource && (
                              <button
                                onClick={() => onDraftFromSource(item.title, item.id)}
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-stone-400 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 transition-all flex items-center gap-1 shrink-0"
                                title="Draft from this source"
                              >
                                <ArrowRight className="w-3 h-3" />
                                Draft
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DataStateWrapper>
        </>
      )}

      {/* ── Ask tab ── */}
      {activeTab === 'ask' && (
        <div className="space-y-4" role="region" aria-label="Ask over project evidence">
          {/* Suggested questions */}
          <div>
            <p className="text-xs font-medium text-stone-500 mb-2">Suggested questions</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedQuestions.map(sq => (
                <button
                  key={sq}
                  type="button"
                  onClick={() => setQuestion(sq)}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>

          {/* Question input */}
          <div className="flex gap-2">
            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask a question about your project evidence..."
              className="min-h-[60px] text-sm flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
            />
            <Button
              onClick={handleAsk}
              disabled={!question.trim() || question.trim().length < 3 || asking}
              className="shrink-0 self-end"
            >
              {asking ? <Spinner size="sm" className="mr-1.5" /> : <MessageSquareText className="w-4 h-4 mr-1.5" />}
              Ask
            </Button>
          </div>

          {/* Answer */}
          {answer && (
            <div className="rounded-lg border border-stone-200 bg-white p-4" data-testid="vault-ask-answer">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-medium text-stone-500">Grounded Answer</span>
              </div>
              <div className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{answer}</div>
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-2">Sources ({sources.length})</p>
              <div className="space-y-1.5">
                {sources.map((source, idx) => (
                  <div key={`${source.docTitle || 'src'}-${idx}`} className="rounded-lg border border-stone-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-sm font-medium text-stone-700">{source.docTitle || `Source ${idx + 1}`}</span>
                      {source.relevanceScore != null && (
                        <span className="ml-auto text-[10px] text-stone-400">
                          {Math.round(source.relevanceScore * 100)}% relevant
                        </span>
                      )}
                    </div>
                    {source.excerpt && (
                      <p className="text-xs text-stone-500 mt-1.5 line-clamp-3 leading-relaxed">{source.excerpt}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project documents list */}
          {projectDocs.length > 0 && (
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs font-medium text-stone-500 mb-2">Project documents ({projectDocs.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {projectDocs.map((doc, idx) => (
                  <span
                    key={doc.id || doc.fileName || `doc-${idx}`}
                    className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] text-stone-500"
                  >
                    <Paperclip className="w-2.5 h-2.5" />
                    {doc.fileName || doc.originalName || doc.title || `Document ${idx + 1}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Upload CTA when no docs */}
          {projectDocs.length === 0 && !answer && (
            <div className="flex flex-col items-center py-8 text-center">
              <Upload className="w-8 h-8 text-stone-300 mb-2" />
              <p className="text-sm text-stone-500 mb-1">Upload evidence to get grounded answers</p>
              <p className="text-xs text-stone-400">Upload source documents, clinical data, or literature above</p>
            </div>
          )}
        </div>
      )}
    </WorkspaceCanvas>
  );
};

export default VaultPage;
