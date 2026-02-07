/**
 * DOCX Factory Page — Phase 6.4.A + 6.4.B
 *
 * Full document generation lifecycle:
 *   Tab 1 "Templates" — list, create template, upload/create version
 *   Tab 2 "Renders"   — list, create render, execute, download artifact,
 *                        render event timeline, hash verification
 *
 * Reads program_id from URL search params (?program_id=UUID).
 * Falls back to a program selector if not provided.
 *
 * @phase 6.4.A — DOCX Factory UI
 * @phase 6.4.B — Status pill, event timeline, hash verification, polling cleanup
 */

import { useState, useCallback, useMemo } from 'react';
import React from 'react';
import {
  useTemplates,
  useCreateTemplate,
  useCreateTemplateVersion,
  useRenders,
  useCreateRender,
  useExecuteRender,
  useRenderEvents,
  downloadArtifact,
  computeSHA256,
  type DocxTemplate,
  type DocxRender,
  type DocxArtifact,
  type DownloadResult,
} from '@/hooks/use-docx-factory';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FileText,
  Plus,
  Play,
  Download,
  RefreshCw,
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Hash,
} from 'lucide-react';

// =============================================================================
// Helpers
// =============================================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Legacy helper — delegates to StatusPill for templates
function statusBadge(status: string) {
  return <StatusPill status={status} />;
}

// =============================================================================
// StatusPill — color-coded render/template status badge
// =============================================================================

/** Status → variant + icon mapping for the full pill */
const STATUS_CONFIG: Record<
  string,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
    className?: string;
  }
> = {
  queued: {
    variant: 'secondary',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  running: {
    variant: 'outline',
    icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
    className: 'animate-pulse border-blue-400 text-blue-600',
  },
  completed: {
    variant: 'default',
    icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
    className: 'bg-green-600 hover:bg-green-700',
  },
  failed: {
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3 mr-1" />,
  },
  active: { variant: 'default', icon: null },
  draft: { variant: 'outline', icon: null },
  archived: { variant: 'secondary', icon: null },
};

export function StatusPill({
  status,
  errorMessage,
}: {
  status: string;
  errorMessage?: string | null;
}) {
  const config = STATUS_CONFIG[status] || { variant: 'secondary' as const, icon: null };

  const pill = (
    <Badge variant={config.variant} className={config.className}>
      {config.icon}
      {status}
    </Badge>
  );

  if (status === 'failed' && errorMessage) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{pill}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs break-words">{errorMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return pill;
}

// =============================================================================
// RenderEventTimeline — chronological audit trail
// =============================================================================

function RenderEventTimeline({ programId, renderId }: { programId: string; renderId: string }) {
  const { data: events, isLoading, error } = useRenderEvents(programId, renderId);
  const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());

  const togglePayload = useCallback((eventId: string) => {
    setExpandedPayloads(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-destructive py-2 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Failed to load events: {error.message}
      </p>
    );
  }

  if (!events?.length) {
    return <p className="text-xs text-muted-foreground py-2 italic">No events recorded yet.</p>;
  }

  return (
    <div className="space-y-0 border-l-2 border-muted ml-3 mt-2">
      {events.map(evt => {
        const hasPayload = evt.payload_json && Object.keys(evt.payload_json).length > 0;
        const isExpanded = expandedPayloads.has(evt.id);

        return (
          <div key={evt.id} className="relative pl-6 pb-3">
            {/* Timeline dot */}
            <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />

            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{evt.event_type}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(evt.created_at)}
                  </span>
                </div>
                {hasPayload && (
                  <button
                    onClick={() => togglePayload(evt.id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-0.5"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    {isExpanded ? 'hide payload' : 'show payload'}
                  </button>
                )}
                {isExpanded && hasPayload && (
                  <pre className="mt-1 text-[10px] bg-muted rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                    {JSON.stringify(evt.payload_json, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// HashVerificationPanel — SHA-256 match/mismatch after download
// =============================================================================

export type HashVerifyState =
  | { phase: 'idle' }
  | { phase: 'downloading' }
  | { phase: 'hashing' }
  | { phase: 'done'; serverSha: string; clientSha: string; match: boolean }
  | { phase: 'error'; message: string };

function HashVerificationPanel({ state }: { state: HashVerifyState }) {
  if (state.phase === 'idle') return null;

  if (state.phase === 'downloading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Downloading artifact…
      </div>
    );
  }

  if (state.phase === 'hashing') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
        <Hash className="h-3 w-3 animate-pulse" />
        Computing SHA-256…
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive mt-2">
        <AlertCircle className="h-3 w-3" />
        {state.message}
      </div>
    );
  }

  // phase === 'done'
  return (
    <Card className={`mt-2 ${state.match ? 'border-green-500' : 'border-destructive'}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          {state.match ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          )}
          <span
            className={`text-sm font-semibold ${state.match ? 'text-green-600' : 'text-destructive'}`}
          >
            {state.match ? 'INTEGRITY MATCH' : 'INTEGRITY MISMATCH'}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-start gap-2 text-[10px]">
            <span className="text-muted-foreground w-14 shrink-0 font-medium">Server:</span>
            <code className="break-all font-mono">{state.serverSha}</code>
          </div>
          <div className="flex items-start gap-2 text-[10px]">
            <span className="text-muted-foreground w-14 shrink-0 font-medium">Browser:</span>
            <code className="break-all font-mono">{state.clientSha}</code>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

// ── Create Template Dialog ──────────────────────────────────────────────────

function CreateTemplateDialog({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('generic');
  const createTemplate = useCreateTemplate(programId);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    createTemplate.mutate(
      { name: name.trim(), doc_type: docType },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setDocType('generic');
        },
      }
    );
  }, [name, docType, createTemplate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>Register a new document template for this program.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template Name</label>
            <Input
              placeholder="e.g. IND Module 2.5 Clinical Overview"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Document Type</label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic</SelectItem>
                <SelectItem value="ind_clinical_overview">IND Clinical Overview</SelectItem>
                <SelectItem value="ind_nonclinical_overview">IND Nonclinical Overview</SelectItem>
                <SelectItem value="ind_quality_overview">IND Quality Overview</SelectItem>
                <SelectItem value="csr_synopsis">CSR Synopsis</SelectItem>
                <SelectItem value="protocol_summary">Protocol Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createTemplate.isPending}>
            {createTemplate.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Upload Version Dialog ───────────────────────────────────────────────────

function UploadVersionDialog({ templateId, programId }: { templateId: string; programId: string }) {
  const [open, setOpen] = useState(false);
  const [storageKey, setStorageKey] = useState('');
  const [sha256, setSha256] = useState('');
  const createVersion = useCreateTemplateVersion(templateId, programId);

  const handleSubmit = useCallback(() => {
    if (!storageKey.trim() || sha256.length !== 64) return;
    createVersion.mutate(
      { storage_key: storageKey.trim(), sha256 },
      {
        onSuccess: () => {
          setOpen(false);
          setStorageKey('');
          setSha256('');
        },
      }
    );
  }, [storageKey, sha256, createVersion]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Upload className="h-3 w-3 mr-1" />
          Version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Template Version</DialogTitle>
          <DialogDescription>
            Register a new version of this template with its blob store key and SHA-256 hash.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Storage Key</label>
            <Input
              placeholder="e.g. templates/my-template-v2.docx"
              value={storageKey}
              onChange={e => setStorageKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">SHA-256 Hash</label>
            <Input
              placeholder="64-character hex digest"
              value={sha256}
              onChange={e => setSha256(e.target.value)}
              maxLength={64}
            />
            {sha256 && sha256.length !== 64 && (
              <p className="text-xs text-destructive">
                Must be exactly 64 characters ({sha256.length}/64)
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!storageKey.trim() || sha256.length !== 64 || createVersion.isPending}
          >
            {createVersion.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Render Dialog ────────────────────────────────────────────────────

function CreateRenderDialog({
  programId,
  templates: _templates,
}: {
  programId: string;
  templates: DocxTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [templateVersionId, setTemplateVersionId] = useState('');
  const [inputsRaw, setInputsRaw] = useState('{}');
  const createRender = useCreateRender(programId);

  const handleSubmit = useCallback(() => {
    if (!templateVersionId) return;
    let inputs: Record<string, unknown> = {};
    try {
      inputs = JSON.parse(inputsRaw);
    } catch {
      return; // invalid JSON
    }
    createRender.mutate(
      { template_version_id: templateVersionId, inputs_json: inputs },
      {
        onSuccess: () => {
          setOpen(false);
          setTemplateVersionId('');
          setInputsRaw('{}');
        },
      }
    );
  }, [templateVersionId, inputsRaw, createRender]);

  let jsonValid = true;
  try {
    JSON.parse(inputsRaw);
  } catch {
    jsonValid = false;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Render
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Render Job</DialogTitle>
          <DialogDescription>
            Queue a document render from a template version with input data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template Version ID</label>
            <Input
              placeholder="UUID of the template version"
              value={templateVersionId}
              onChange={e => setTemplateVersionId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste the version UUID from the Templates tab.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Inputs JSON</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder='{"drug_name": "Axolotinib", "protocol_id": "PROTO-001"}'
              value={inputsRaw}
              onChange={e => setInputsRaw(e.target.value)}
              rows={4}
            />
            {!jsonValid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Invalid JSON
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!templateVersionId || !jsonValid || createRender.isPending}
          >
            {createRender.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Templates Tab
// =============================================================================

function TemplatesTab({ programId }: { programId: string }) {
  const { data, isLoading, error, refetch } = useTemplates(programId);
  const templates = data?.items || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <CreateTemplateDialog programId={programId} />
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No templates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a template to get started with document generation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.doc_type}</code>
                </TableCell>
                <TableCell>{statusBadge(t.status)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {timeAgo(t.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <UploadVersionDialog templateId={t.id} programId={programId} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(t.id)}
                      title="Copy template ID"
                    >
                      <code className="text-[10px] text-muted-foreground">{t.id.slice(0, 8)}…</code>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// =============================================================================
// Renders Tab
// =============================================================================

function RendersTab({ programId }: { programId: string }) {
  const { data: templatesData } = useTemplates(programId);
  const { data, isLoading, error, refetch } = useRenders(programId);
  const executeRender = useExecuteRender(programId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedRenderId, setExpandedRenderId] = useState<string | null>(null);
  const [hashStates, setHashStates] = useState<Record<string, HashVerifyState>>({});

  const renders = data?.items || [];
  const templates = templatesData?.items || [];

  const handleExecute = useCallback(
    (renderId: string) => {
      executeRender.mutate(renderId);
    },
    [executeRender]
  );

  const handleDownloadWithHash = useCallback(
    async (artifactId: string) => {
      setDownloadingId(artifactId);
      setHashStates(prev => ({ ...prev, [artifactId]: { phase: 'downloading' } }));
      try {
        const result: DownloadResult = await downloadArtifact(artifactId, programId);

        if (result.serverSha256) {
          setHashStates(prev => ({ ...prev, [artifactId]: { phase: 'hashing' } }));
          const clientSha = await computeSHA256(result.blob);
          if (clientSha === null) {
            // SubtleCrypto unavailable (locked-down browser / non-HTTPS)
            setHashStates(prev => ({
              ...prev,
              [artifactId]: {
                phase: 'error',
                message:
                  'Local hash verification unavailable in this browser. Server SHA-256: ' +
                  result.serverSha256,
              },
            }));
          } else {
            setHashStates(prev => ({
              ...prev,
              [artifactId]: {
                phase: 'done',
                serverSha: result.serverSha256!,
                clientSha: clientSha,
                match: result.serverSha256!.toLowerCase() === clientSha.toLowerCase(),
              },
            }));
          }
        } else {
          setHashStates(prev => ({
            ...prev,
            [artifactId]: {
              phase: 'error',
              message: 'Server did not provide SHA-256 header for verification.',
            },
          }));
        }
      } catch (err: any) {
        console.error('Download failed:', err);
        setHashStates(prev => ({
          ...prev,
          [artifactId]: { phase: 'error', message: err.message || 'Download failed' },
        }));
      } finally {
        setDownloadingId(null);
      }
    },
    [programId]
  );

  const toggleTimeline = useCallback((renderId: string) => {
    setExpandedRenderId(prev => (prev === renderId ? null : renderId));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Polling indicator
  const hasPending = renders.some(r => r.status === 'queued' || r.status === 'running');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {renders.length} render{renders.length !== 1 ? 's' : ''}
          </p>
          {hasPending && (
            <Badge variant="outline" className="text-[10px] animate-pulse">
              <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
              polling
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <CreateRenderDialog programId={programId} templates={templates} />
        </div>
      </div>

      {renders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Play className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No renders yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a render job from a template version to generate documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Render ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Template Version</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renders.map(r => {
                // Use artifact from execute response if available, otherwise look at render data
                const execArtifact =
                  executeRender.isSuccess && executeRender.variables === r.id
                    ? (executeRender.data as DocxArtifact)
                    : undefined;
                const artifactForDownload = execArtifact;

                return (
                  <RenderRow
                    key={r.id}
                    render={r}
                    programId={programId}
                    onExecute={handleExecute}
                    onDownload={handleDownloadWithHash}
                    onToggleTimeline={toggleTimeline}
                    isExecuting={executeRender.isPending && executeRender.variables === r.id}
                    downloadingId={downloadingId}
                    lastArtifact={artifactForDownload}
                    isTimelineExpanded={expandedRenderId === r.id}
                    hashState={
                      artifactForDownload
                        ? hashStates[artifactForDownload.id] || { phase: 'idle' as const }
                        : { phase: 'idle' as const }
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {executeRender.isError && (
        <Card className="border-destructive">
          <CardContent className="py-3">
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Execute failed: {executeRender.error.message}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Render Row ──────────────────────────────────────────────────────────────

function RenderRow({
  render: r,
  programId,
  onExecute,
  onDownload,
  onToggleTimeline,
  isExecuting,
  downloadingId,
  lastArtifact,
  isTimelineExpanded,
  hashState,
}: {
  render: DocxRender;
  programId: string;
  onExecute: (id: string) => void;
  onDownload: (artifactId: string) => void;
  onToggleTimeline: (renderId: string) => void;
  isExecuting: boolean;
  downloadingId: string | null;
  lastArtifact?: DocxArtifact;
  isTimelineExpanded: boolean;
  hashState: HashVerifyState;
}) {
  return (
    <>
      <TableRow className={isTimelineExpanded ? 'border-b-0' : ''}>
        <TableCell>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.id.slice(0, 8)}…</code>
        </TableCell>
        <TableCell>
          <StatusPill status={r.status} errorMessage={r.error} />
        </TableCell>
        <TableCell>
          <code className="text-xs text-muted-foreground">
            {r.template_version_id.slice(0, 8)}…
          </code>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{timeAgo(r.created_at)}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {/* Timeline toggle — always visible */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleTimeline(r.id)}
              title="Show event timeline"
            >
              <Clock className="h-3 w-3" />
            </Button>

            {r.status === 'queued' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExecute(r.id)}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Execute
              </Button>
            )}
            {r.status === 'completed' && lastArtifact && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(lastArtifact.id)}
                disabled={downloadingId === lastArtifact.id}
              >
                {downloadingId === lastArtifact.id ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                Download
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {/* Expanded row — event timeline + hash verification */}
      {isTimelineExpanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30 pt-0 pb-4 px-6">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Audit Trail
                </p>
                <RenderEventTimeline programId={programId} renderId={r.id} />
              </div>
              {lastArtifact && hashState.phase !== 'idle' && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Integrity Verification
                  </p>
                  <HashVerificationPanel state={hashState} />
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

interface DocxFactoryWrapperProps {
  programId?: string;
}

export default function DocxFactoryPage({ programId: propProgramId }: DocxFactoryWrapperProps) {
  // Read program_id from URL search params if not passed as prop
  const urlProgramId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('program_id') || '';
  }, []);

  const [inputProgramId, setInputProgramId] = useState('');
  const programId = propProgramId || urlProgramId || inputProgramId;

  if (!programId) {
    return (
      <div className="space-y-6 p-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Document Factory
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate submit-ready regulatory documents from templates.
          </p>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter a program ID to get started, or navigate here from a program page.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Program UUID"
                  value={inputProgramId}
                  onChange={e => setInputProgramId(e.target.value)}
                />
                <Button
                  disabled={!inputProgramId.trim()}
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('program_id', inputProgramId.trim());
                    window.history.replaceState({}, '', url.toString());
                  }}
                >
                  Load
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Document Factory
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate submit-ready regulatory documents from templates.
        </p>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">
            <FileText className="h-4 w-4 mr-1" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="renders">
            <Play className="h-4 w-4 mr-1" />
            Renders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab programId={programId} />
        </TabsContent>

        <TabsContent value="renders" className="mt-4">
          <RendersTab programId={programId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
