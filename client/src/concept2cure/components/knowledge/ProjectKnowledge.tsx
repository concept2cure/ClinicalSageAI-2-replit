/**
 * Concept2Cure - Project Knowledge Panel
 *
 * Main panel displaying project documents and custom instructions.
 * Claude.ai parity: Project Knowledge sidebar section.
 *
 * @module concept2cure/components/knowledge/ProjectKnowledge
 * @version 1.0.0
 */

import React, { useState } from 'react';
import type { Project, UploadedDocument } from '../../types';
import { useProjectKnowledge } from '../../hooks/useProjectKnowledge';
import { DocumentUploader } from './DocumentUploader';
import { CustomInstructions } from './CustomInstructions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FolderOpen,
  FileText,
  FileSpreadsheet,
  File,
  MoreHorizontal,
  Trash2,
  Download,
  Eye,
  Clock,
  Database,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectKnowledgeProps {
  project: Project | null;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const getFileIcon = (type: string) => {
  if (type === 'pdf') return FileText;
  if (['xlsx', 'xls', 'csv'].includes(type)) return FileSpreadsheet;
  if (['docx', 'doc', 'txt', 'md'].includes(type)) return FileText;
  return File;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTokenCount = (tokens: number): string => {
  if (tokens < 1000) return tokens.toString();
  return `${(tokens / 1000).toFixed(1)}K`;
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ITEM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentItemProps {
  document: UploadedDocument;
  onRemove: () => void;
}

const DocumentItem: React.FC<DocumentItemProps> = ({ document, onRemove }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const FileIcon = getFileIcon(document.type);

  return (
    <>
      <div className="group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 transition-colors duration-150">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <FileIcon className="h-4 w-4 text-blue-600" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 truncate">{document.name}</span>
            {document.status === 'processing' && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{formatFileSize(document.size)}</span>
            {document.pageCount && (
              <>
                <span>•</span>
                <span>{document.pageCount} pages</span>
              </>
            )}
            {document.tokenCount && (
              <>
                <span>•</span>
                <span>{formatTokenCount(document.tokenCount)} tokens</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{document.name}" from the project knowledge.
              AnA will no longer have access to this document's content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT METER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ContextMeterProps {
  used: number;
  max: number;
}

const ContextMeter: React.FC<ContextMeterProps> = ({ used, max }) => {
  const percentage = Math.round((used / max) * 100);
  const isNearLimit = percentage > 80;
  const isAtLimit = percentage > 95;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 flex items-center gap-1">
          <Database className="h-3 w-3" />
          Context Window
        </span>
        <span
          className={cn(
            'font-medium',
            isAtLimit && 'text-red-600',
            isNearLimit && !isAtLimit && 'text-amber-600',
            !isNearLimit && 'text-zinc-700'
          )}
        >
          {formatTokenCount(used)} / {formatTokenCount(max)}
        </span>
      </div>
      <Progress
        value={percentage}
        className={cn(
          'h-2',
          isAtLimit && '[&>div]:bg-red-500',
          isNearLimit && !isAtLimit && '[&>div]:bg-amber-500'
        )}
      />
      {isNearLimit && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          <span>
            {isAtLimit
              ? 'Context window nearly full. Remove documents to add more.'
              : 'Approaching context limit.'}
          </span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ProjectKnowledge: React.FC<ProjectKnowledgeProps> = ({ project, className }) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const {
    knowledge,
    isLoading,
    error,
    uploadDocument,
    removeDocument,
    updateCustomInstructions,
    contextTokens,
    maxContextTokens,
    isUploading,
    uploadProgress,
  } = useProjectKnowledge(project?.id || null);

  if (!project) {
    return null;
  }

  const documentCount = knowledge?.documents.length || 0;

  return (
    <div className={cn('', className)}>
      {/* Trigger Button */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between p-3 rounded-lg transition-colors duration-150',
              'hover:bg-zinc-50 text-left border border-zinc-200'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-900">Project Knowledge</div>
                <div className="text-xs text-zinc-500">
                  {isLoading
                    ? 'Loading...'
                    : documentCount === 0
                      ? 'Add documents'
                      : `${documentCount} document${documentCount !== 1 ? 's' : ''} · ${formatTokenCount(contextTokens)} tokens`}
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-blue-600" />
              Project Knowledge
            </SheetTitle>
            <SheetDescription>
              Upload documents and configure custom instructions for this project.
              AnA will use this context when assisting you.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Context Meter */}
            <ContextMeter used={contextTokens} max={maxContextTokens} />

            {/* Document Uploader */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-900">Documents</h3>
              <DocumentUploader
                onUpload={uploadDocument}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                error={error}
              />
            </div>

            {/* Document List */}
            {knowledge && knowledge.documents.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {knowledge.documents.length} document
                    {knowledge.documents.length !== 1 ? 's' : ''} uploaded
                  </span>
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1">
                    {knowledge.documents.map(doc => (
                      <DocumentItem
                        key={doc.id}
                        document={doc}
                        onRemove={() => removeDocument(doc.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Empty State */}
            {knowledge && knowledge.documents.length === 0 && !isUploading && (
              <div className="text-center py-6 text-sm text-zinc-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                <p>No documents uploaded yet.</p>
                <p className="text-xs mt-1">
                  Upload device specs, predicate summaries, test data, etc.
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-zinc-200" />

            {/* Custom Instructions */}
            <CustomInstructions
              value={knowledge?.customInstructions || ''}
              onChange={updateCustomInstructions}
              projectType={project.type}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ProjectKnowledge;
