import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { getCachedAuthToken, getCachedOrgId } from '@/lib/queryClient';
import { Upload, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface DocumentUploadZoneProps {
  scope: 'company' | 'project';
  scopeId?: string | number;
  onUploadComplete?: (result: { fileName: string; memoryEntriesGenerated: number }) => void;
  compact?: boolean;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  fileName?: string;
  memoryEntriesGenerated?: number;
  errorMessage?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.pptx'];

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Helpers ─────────────────────────────────────────────────────────────────

function getUploadUrl(scope: 'company' | 'project', scopeId?: string | number): string {
  if (scope === 'project') {
    if (!scopeId) throw new Error('scopeId is required for project-scoped uploads');
    return `/api/client-intelligence/project/${scopeId}/documents/upload`;
  }
  return '/api/client-intelligence/documents/upload';
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function DocumentUploadZone({
  scope,
  scopeId,
  onUploadComplete,
  compact = false,
}: DocumentUploadZoneProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
  });

  const resetState = useCallback(() => {
    setUploadState({ status: 'idle', progress: 0 });
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      // Validate file type
      if (!isAcceptedFile(file)) {
        const msg = `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
        setUploadState({ status: 'error', progress: 0, errorMessage: msg });
        toast({ title: 'Invalid file type', description: msg, variant: 'destructive' });
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const msg = `File too large (${formatFileSize(file.size)}). Maximum size is 50 MB.`;
        setUploadState({ status: 'error', progress: 0, errorMessage: msg });
        toast({ title: 'File too large', description: msg, variant: 'destructive' });
        return;
      }

      setUploadState({ status: 'uploading', progress: 10, fileName: file.name });

      try {
        const url = getUploadUrl(scope, scopeId);
        const formData = new FormData();
        formData.append('file', file);

        // Reuse the cached auth helpers from queryClient.ts (single source of truth)
        const authToken = getCachedAuthToken();
        const organizationId = getCachedOrgId();

        const headers: Record<string, string> = {
          'x-organization-id': organizationId,
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Simulate progress (XHR would give real progress, fetch does not)
        const progressInterval = setInterval(() => {
          setUploadState((prev) => ({
            ...prev,
            progress: Math.min(prev.progress + 8, 85),
          }));
        }, 300);

        // NOTE: Do not set Content-Type — browser sets multipart boundary automatically
        const response = await fetch(url, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const contentType = response.headers.get('Content-Type') || '';
          let errorMsg = `Upload failed (${response.status})`;
          if (contentType.includes('application/json')) {
            const payload = await response.json().catch(() => ({}));
            errorMsg = payload?.error?.message || payload?.error || payload?.message || errorMsg;
          }
          throw new Error(errorMsg);
        }

        const result = await response.json();
        const memoryEntriesGenerated: number =
          result?.memoryEntriesGenerated ?? result?.knowledgeAtoms ?? result?.entriesCreated ?? 0;

        setUploadState({
          status: 'success',
          progress: 100,
          fileName: file.name,
          memoryEntriesGenerated,
        });

        toast({
          title: 'Document uploaded',
          description: `${file.name} processed — ${memoryEntriesGenerated} knowledge atom${memoryEntriesGenerated !== 1 ? 's' : ''} extracted.`,
        });

        // Invalidate relevant caches
        queryClient.invalidateQueries({
          queryKey: queryKeys.anaIntelligence.documents(scope, scope === 'project' ? scopeId : undefined),
        });
        if (scope === 'project' && scopeId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.anaIntelligence.projectMemory(scopeId),
          });
        } else {
          queryClient.invalidateQueries({
            queryKey: queryKeys.anaIntelligence.clientMemory,
          });
        }

        onUploadComplete?.({ fileName: file.name, memoryEntriesGenerated });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
        setUploadState({ status: 'error', progress: 0, fileName: file.name, errorMessage });
        toast({ title: 'Upload failed', description: errorMessage, variant: 'destructive' });
      }
    },
    [scope, scopeId, onUploadComplete, queryClient, toast],
  );

  // ── Event Handlers ──────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile],
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const isUploading = uploadState.status === 'uploading';

  // Success state
  if (uploadState.status === 'success') {
    return (
      <Card
        className={`relative flex items-center gap-3 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 ${compact ? 'p-3' : 'p-4'}`}
        data-testid="upload-zone-success"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-green-800 dark:text-green-200">
            {uploadState.fileName}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            {uploadState.memoryEntriesGenerated} knowledge atom
            {uploadState.memoryEntriesGenerated !== 1 ? 's' : ''} extracted
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetState}
          className="h-7 w-7 p-0 text-green-600 hover:text-green-800"
          aria-label="Dismiss success message"
        >
          <X className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  // Error state
  if (uploadState.status === 'error') {
    return (
      <Card
        className={`relative flex items-center gap-3 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 ${compact ? 'p-3' : 'p-4'}`}
        data-testid="upload-zone-error"
      >
        <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-red-800 dark:text-red-200">
            {uploadState.fileName ?? 'Upload failed'}
          </p>
          <p className="text-xs text-red-600 dark:text-red-400">{uploadState.errorMessage}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetState}
          className="h-7 w-7 p-0 text-red-600 hover:text-red-800"
          aria-label="Dismiss error and retry"
        >
          <X className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  return (
    <div data-testid="upload-zone">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        aria-label="Upload document"
      />

      <Card
        role="button"
        tabIndex={0}
        aria-label="Drag and drop a document here, or click to browse"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={isUploading ? undefined : handleBrowseClick}
        onKeyDown={(e) => {
          if (!isUploading && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleBrowseClick();
          }
        }}
        className={`
          flex flex-col items-center justify-center border-2 border-dashed transition-colors
          ${dragOver ? 'border-stone-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
          ${isUploading ? 'pointer-events-none opacity-70' : 'cursor-pointer'}
          ${compact ? 'gap-2 p-4' : 'gap-3 p-8'}
        `}
      >
        {isUploading ? (
          <>
            <FileText className={`text-muted-foreground ${compact ? 'h-5 w-5' : 'h-8 w-8'}`} />
            <div className="w-full max-w-xs space-y-1.5">
              <p className="truncate text-center text-sm font-medium text-muted-foreground">
                Uploading {uploadState.fileName}...
              </p>
              {/* Progress bar */}
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={uploadState.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Upload progress: ${uploadState.progress}%`}
              >
                <div
                  className="h-full rounded-full bg-stone-600 transition-all duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {uploadState.progress}%
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload
              className={`text-muted-foreground ${compact ? 'h-5 w-5' : 'h-8 w-8'} ${dragOver ? 'text-blue-500' : ''}`}
            />
            {!compact && (
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop a document here
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  or click to browse
                </p>
              </div>
            )}
            {compact && (
              <p className="text-xs text-muted-foreground">
                Drop file or <span className="underline">browse</span>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              PDF, DOCX, XLSX, CSV, TXT, MD, PPTX &mdash; up to 50 MB
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export default DocumentUploadZone;
