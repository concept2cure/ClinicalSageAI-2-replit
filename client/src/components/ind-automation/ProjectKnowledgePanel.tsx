/**
 * ProjectKnowledgePanel
 *
 * UI for the project knowledge base:
 *   1. Set a project ID and upload source documents (PDF, DOCX, XLSX, TXT…)
 *   2. View indexed documents and synthesised context keywords
 *   3. Generate a full IND CTD package as a .docx download
 *   4. Generate a single IND section as JSON
 *
 * All API calls go through the Express BFF at /api/knowledge-base/*
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Database,
  Sparkles,
  Trash2,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface IndexedDocument {
  id: string;
  title: string;
  type: string;
  excerpt: string;
  word_count?: number;
  char_count?: number;
}

interface ProjectContext {
  project_id: string;
  document_count: number;
  documents: IndexedDocument[];
  keywords: string[];
  last_updated?: string;
}

interface StatusMsg {
  type: 'success' | 'error' | 'info' | null;
  message: string;
}

const DOCUMENT_TYPES = [
  { value: 'ind_package', label: 'Full IND Package (all CTD modules)' },
  { value: 'clinical_overview', label: 'Module 2.5 — Clinical Overview' },
  { value: 'quality_summary', label: 'Module 2.3 — Quality Overall Summary' },
  { value: 'safety_summary', label: 'Module 2.4 — Nonclinical Overview' },
  { value: 'investigator_brochure', label: 'Investigator Brochure (full)' },
];

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="h-4 w-4 text-red-400" />;
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv')
    return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
  if (ext === 'docx' || ext === 'doc') return <FileText className="h-4 w-4 text-blue-400" />;
  return <FileIcon className="h-4 w-4 text-slate-400" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook — file drag-and-drop
// ─────────────────────────────────────────────────────────────────────────────

function useDrop(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDropEvent = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onDrop(files);
    },
    [onDrop]
  );

  return { dragging, onDragOver, onDragLeave, onDropEvent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectKnowledgePanel() {
  // ── project setup
  const [projectId, setProjectId] = useState('');

  // ── upload state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── indexed documents / context
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // ── IND generation
  const [drugName, setDrugName] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [indication, setIndication] = useState('');
  const [docType, setDocType] = useState('ind_package');
  const [generating, setGenerating] = useState(false);

  // ── status messages
  const [status, setStatus] = useState<StatusMsg>({ type: null, message: '' });

  // ── drag-and-drop
  const { dragging, onDragOver, onDragLeave, onDropEvent } = useDrop(files => {
    setPendingFiles(prev => [...prev, ...files]);
  });

  // Auto-load context when projectId changes (debounced)
  useEffect(() => {
    if (!projectId.trim()) {
      setContext(null);
      return;
    }
    const t = setTimeout(() => loadContext(), 600);
    return () => clearTimeout(t);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function loadContext() {
    if (!projectId.trim()) return;
    setLoadingContext(true);
    try {
      const res = await fetch(
        `/api/knowledge-base/context/${encodeURIComponent(projectId.trim())}`
      );
      if (res.ok) {
        setContext(await res.json());
      } else if (res.status === 404) {
        setContext(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus({ type: 'error', message: err.detail || 'Failed to load project context' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Network error: ${e.message}` });
    } finally {
      setLoadingContext(false);
    }
  }

  async function handleUpload() {
    if (!projectId.trim()) {
      setStatus({ type: 'error', message: 'Enter a Project ID before uploading.' });
      return;
    }
    if (pendingFiles.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one file.' });
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setStatus({ type: 'info', message: `Uploading ${pendingFiles.length} file(s)…` });

    try {
      const form = new FormData();
      form.append('project_id', projectId.trim());
      for (const f of pendingFiles) form.append('files', f);

      setUploadProgress(40);
      const res = await fetch('/api/knowledge-base/upload', { method: 'POST', body: form });
      setUploadProgress(90);
      const data = await res.json();

      if (res.ok) {
        const ok = data.ingested?.length ?? 0;
        const bad = data.failed?.length ?? 0;
        setStatus({
          type: 'success',
          message: `Indexed ${ok} file(s)${bad > 0 ? `; ${bad} failed` : ''}.`,
        });
        setPendingFiles([]);
        await loadContext();
      } else {
        setStatus({ type: 'error', message: data.detail || data.error || 'Upload failed' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Upload error: ${e.message}` });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleGenerateIND() {
    if (!projectId.trim()) {
      setStatus({ type: 'error', message: 'Enter a Project ID.' });
      return;
    }
    setGenerating(true);
    setStatus({ type: 'info', message: 'Generating document — this may take 1–3 minutes…' });

    try {
      const res = await fetch('/api/knowledge-base/generate-ind-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId.trim(),
          drug_name: drugName || 'Investigational Drug',
          sponsor: sponsor || '',
          indication: indication || '',
          document_type: docType,
          compliance_region: 'FDA',
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition') || '';
        const match = cd.match(/filename="([^"]+)"/);
        const filename = match ? match[1] : 'IND_Package.docx';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        const ng = res.headers.get('x-sections-generated') || '?';
        setStatus({
          type: 'success',
          message: `Downloaded ${filename} (${ng} sections generated).`,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus({
          type: 'error',
          message: err.detail?.message || err.detail || 'Generation failed',
        });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Generation error: ${e.message}` });
    } finally {
      setGenerating(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasProject = projectId.trim().length > 0;
  const docCount = context?.document_count ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Status alert ─────────────────────────────────────────────────── */}
      {status.type && (
        <Alert
          variant={status.type === 'error' ? 'destructive' : 'default'}
          className={
            status.type === 'success'
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : status.type === 'info'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : ''
          }
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : status.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          )}
          <AlertTitle className="capitalize">{status.type}</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      {/* ── Step 1: Project ID ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-indigo-500" />
            Step 1 — Project Knowledge Base
          </CardTitle>
          <CardDescription>
            Give your project a unique ID. All uploaded files will be indexed under this ID and used
            as context for AI document generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="kb-project-id">Project ID</Label>
              <Input
                id="kb-project-id"
                placeholder="e.g. my-drug-ind-2026"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasProject || loadingContext}
                onClick={loadContext}
              >
                {loadingContext ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Document count badge */}
          {hasProject && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={docCount > 0 ? 'default' : 'secondary'}>
                {loadingContext ? '…' : docCount} document{docCount !== 1 ? 's' : ''} indexed
              </Badge>
              {context?.last_updated && (
                <span>· last updated {new Date(context.last_updated).toLocaleString()}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Upload files ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5 text-indigo-500" />
            Step 2 — Upload Source Documents
          </CardTitle>
          <CardDescription>
            PDF, DOCX, XLSX, TXT, CSV, and Markdown files are all supported. Drop files below or
            click to browse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer
              ${dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-muted-foreground/30 hover:border-indigo-400'}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvent}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF · DOCX · XLSX · TXT · CSV · MD (max 100 MB each)
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.md"
            className="hidden"
            onChange={e => setPendingFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
          />

          {/* Pending file list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-1">
              {pendingFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
                >
                  {fileIcon(f.name)}
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      setPendingFiles(prev => prev.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && <Progress value={uploadProgress} className="h-2" />}

          <Button
            onClick={handleUpload}
            disabled={uploading || pendingFiles.length === 0 || !hasProject}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Indexing files…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Index {pendingFiles.length > 0 ? `${pendingFiles.length} file(s)` : 'files'} into
                project
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Indexed documents (collapsible) ──────────────────────────────── */}
      {context && context.document_count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-green-500" />
              Indexed Documents ({context.document_count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Keywords */}
            {context.keywords?.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Extracted Keywords
                </p>
                <div className="flex flex-wrap gap-1">
                  {context.keywords.slice(0, 30).map(kw => (
                    <Badge key={kw} variant="outline" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator className="my-3" />

            {/* Document list */}
            <Accordion type="multiple" className="space-y-1">
              {context.documents.map(doc => (
                <AccordionItem key={doc.id} value={doc.id} className="border rounded-md px-3">
                  <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                    <div className="flex items-center gap-2 text-left">
                      <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
                      <span className="truncate">{doc.title}</span>
                      <Badge variant="secondary" className="ml-2 text-xs shrink-0">
                        {doc.type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 pt-1 text-xs text-muted-foreground">
                    {doc.word_count && (
                      <p className="mb-1 font-medium">{doc.word_count.toLocaleString()} words</p>
                    )}
                    <p className="whitespace-pre-wrap line-clamp-6">{doc.excerpt}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Generate IND Package ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Step 3 — Generate AI Document
          </CardTitle>
          <CardDescription>
            AI will synthesise all indexed documents and draft the selected regulatory document. A
            formatted .docx file is downloaded when complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kb-drug-name">Drug / Device Name</Label>
              <Input
                id="kb-drug-name"
                placeholder="e.g. XYZ-001 (benzolamide)"
                value={drugName}
                onChange={e => setDrugName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kb-sponsor">Sponsor / Organisation</Label>
              <Input
                id="kb-sponsor"
                placeholder="e.g. Concept2Cure Inc."
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="kb-indication">Indication</Label>
              <Input
                id="kb-indication"
                placeholder="e.g. Treatment of relapsed/refractory multiple myeloma"
                value={indication}
                onChange={e => setIndication(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="kb-doc-type">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="kb-doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(d => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {docCount === 0 && hasProject && !loadingContext && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No documents indexed yet. Upload source files first (Step 2).
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={generating || !hasProject}
            onClick={handleGenerateIND}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating — please wait…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate &amp; Download .docx
              </>
            )}
          </Button>

          {generating && (
            <p className="text-center text-xs text-muted-foreground">
              AI is drafting each CTD section using your project documents. This typically takes 1–3
              minutes depending on the number of sections.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ProjectKnowledgePanel;
