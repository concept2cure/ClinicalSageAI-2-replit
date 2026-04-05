/**
 * Concept2Cure Client Portal V2 - Document Vault
 *
 * Enterprise document management system with version control,
 * smart folders, compliance tracking, and AI-powered search.
 *
 * @version 2.0.0
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderLock,
  Search,
  Filter,
  Upload,
  MoreHorizontal,
  FileText,
  File,
  FileImage,
  FileSpreadsheet,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Download,
  Eye,
  Pencil,
  Trash2,
  Share2,
  Copy,
  Star,
  StarOff,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Plus,
  Lock,
} from 'lucide-react';
import type {
  DocumentSummary,
  DocumentStatus,
  DocumentCategory,
  CTDModule,
} from '../../core/portalTypes';
import { usePortal, usePermission } from '../../core/portalContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface VaultFolder {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  documentCount: number;
  children?: VaultFolder[];
  isExpanded?: boolean;
  isLocked?: boolean;
}

interface VaultDocument extends DocumentSummary {
  isFavorite?: boolean;
  isLocked?: boolean;
  lockOwner?: string;
  ctdSection?: string;
  isTemplate?: boolean;
  folderId?: string;
}

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'updatedAt' | 'status' | 'size';
type SortOrder = 'asc' | 'desc';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'json', 'md'];

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: { label: 'Draft', color: 'bg-stone-100 text-stone-700', icon: FileText },
  in_review: { label: 'In Review', color: 'bg-stone-100 text-stone-700', icon: Clock },
  pending_approval: {
    label: 'Pending Approval',
    color: 'bg-stone-100 text-stone-700',
    icon: Clock,
  },
  approved: { label: 'Approved', color: 'bg-stone-100 text-stone-800', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-stone-100 text-stone-800', icon: AlertTriangle },
  superseded: { label: 'Superseded', color: 'bg-stone-100 text-stone-500', icon: History },
  archived: { label: 'Archived', color: 'bg-stone-100 text-stone-500', icon: FileText },
  effective: { label: 'Effective', color: 'bg-stone-100 text-stone-800', icon: CheckCircle2 },
};

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; color: string }> = {
  protocol: { label: 'Protocol', color: 'bg-stone-100 text-stone-700' },
  investigator_brochure: { label: 'IB', color: 'bg-stone-100 text-stone-700' },
  csr: { label: 'CSR', color: 'bg-stone-100 text-stone-800' },
  cmc: { label: 'CMC', color: 'bg-stone-100 text-stone-700' },
  nonclinical: { label: 'Nonclinical', color: 'bg-stone-100 text-stone-800' },
  clinical: { label: 'Clinical', color: 'bg-stone-100 text-stone-700' },
  regulatory: { label: 'Regulatory', color: 'bg-stone-100 text-stone-700' },
  quality: { label: 'Quality', color: 'bg-stone-100 text-stone-700' },
  safety: { label: 'Safety', color: 'bg-stone-100 text-stone-700' },
  administrative: { label: 'Admin', color: 'bg-stone-50 text-stone-700' },
  labeling: { label: 'Labeling', color: 'bg-stone-100 text-stone-700' },
  correspondence: { label: 'Correspondence', color: 'bg-slate-50 text-slate-700' },
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE ICON HELPER
// ─────────────────────────────────────────────────────────────────────────────

const getFileIcon = (fileType: string) => {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return <FileText className="h-5 w-5 text-stone-1000" />;
    case 'docx':
    case 'doc':
      return <FileText className="h-5 w-5 text-stone-1000" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-5 w-5 text-stone-1000" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
      return <FileImage className="h-5 w-5 text-stone-1000" />;
    default:
      return <File className="h-5 w-5 text-stone-500" />;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FOLDER TREE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface FolderTreeProps {
  folders: VaultFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onToggleExpand,
}) => {
  const renderFolder = (folder: VaultFolder, depth: number = 0) => {
    const isSelected = folder.id === selectedFolderId;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectFolder(folder.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectFolder(folder.id);
            }
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            isSelected ? 'bg-stone-100 text-stone-700 font-medium' : 'text-stone-700 hover:bg-stone-50'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleExpand(folder.id);
              }}
              className="p-0.5 hover:bg-stone-200 rounded"
            >
              {folder.isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {folder.isExpanded ? (
            <FolderOpen className="h-4 w-4 text-stone-1000" />
          ) : (
            <Folder className="h-4 w-4 text-stone-1000" />
          )}
          <span className="flex-1 text-left truncate">{folder.name}</span>
          {folder.isLocked && <Lock className="h-3 w-3 text-stone-400" />}
          <Badge variant="secondary" className="text-xs px-1.5">
            {folder.documentCount}
          </Badge>
        </div>
        {hasChildren && folder.isExpanded && (
          <div>{folder.children!.map(child => renderFolder(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
          selectedFolderId === null
            ? 'bg-stone-100 text-stone-700 font-medium'
            : 'text-stone-700 hover:bg-stone-50'
        }`}
      >
        <FolderLock className="h-4 w-4 text-stone-600" />
        <span className="flex-1 text-left">All Documents</span>
      </button>
      {folders.map(folder => renderFolder(folder))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT LIST ITEM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentListItemProps {
  document: VaultDocument;
  viewMode: ViewMode;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDownload: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  onAppendVersion: (doc: VaultDocument) => void;
  onToggleFavorite: (doc: VaultDocument) => void;
}

const DocumentListItem: React.FC<DocumentListItemProps> = ({
  document,
  viewMode,
  onView,
  onEdit,
  onDownload,
  onDelete,
  onAppendVersion,
  onToggleFavorite,
}) => {
  const statusConfig = STATUS_CONFIG[document.status];
  const categoryConfig = CATEGORY_CONFIG[document.category];
  const canWrite = usePermission('documents:write');
  const canDelete = usePermission('documents:delete');

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  if (viewMode === 'grid') {
    return (
      <div
        className="group rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer bg-white"
        onClick={() => onView(document)}
      >
        <div className="flex items-start justify-between mb-3">
          {getFileIcon(document.fileType)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(document)}>
                <Eye className="h-4 w-4 mr-2" /> View
              </DropdownMenuItem>
              {canWrite && (
                <DropdownMenuItem onClick={() => onEdit(document)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDownload(document)}>
                <Download className="h-4 w-4 mr-2" /> Download
              </DropdownMenuItem>
              {canWrite && !document.isTemplate && (
                <DropdownMenuItem onClick={() => onAppendVersion(document)}>
                  <Copy className="h-4 w-4 mr-2" /> Append Version
                </DropdownMenuItem>
              )}
              {canDelete && !document.isTemplate && (
                <DropdownMenuItem className="text-stone-700" onClick={() => onDelete(document)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleFavorite(document)}>
                {document.isFavorite ? (
                  <>
                    <StarOff className="h-4 w-4 mr-2" /> Remove from favorites
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" /> Add to favorites
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {document.isFavorite && <Star className="h-3 w-3 text-stone-1000 fill-stone-1000" />}
            {document.isLocked && <Lock className="h-3 w-3 text-stone-400" />}
            <h3 className="font-medium text-sm truncate flex-1" title={document.name}>
              {document.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
            {document.isTemplate && <Badge variant="secondary" className="text-xs">Template</Badge>}
            <span className="text-xs text-muted-foreground">v{document.version}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(document.updatedAt)} • {formatSize(document.size)}
          </p>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      className="group flex items-center gap-4 rounded-lg border p-3 hover:bg-stone-50 transition-colors cursor-pointer"
      onClick={() => onView(document)}
    >
      <div className="flex-shrink-0">{getFileIcon(document.fileType)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {document.isFavorite && <Star className="h-3 w-3 text-stone-1000 fill-stone-1000" />}
          {document.isLocked && <Lock className="h-3 w-3 text-stone-400" />}
          <span className="font-medium text-sm truncate">{document.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge className={`text-xs ${categoryConfig.color}`}>{categoryConfig.label}</Badge>
          {document.isTemplate && <Badge variant="secondary" className="text-xs">Template</Badge>}
          <span>v{document.version}</span>
          <span>•</span>
          <span>{document.author}</span>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-3">
        <Badge className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
        <span className="text-xs text-muted-foreground w-20 text-right">
          {formatDate(document.updatedAt)}
        </span>
        <span className="text-xs text-muted-foreground w-16 text-right">
          {formatSize(document.size)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(document)}>
              <Eye className="h-4 w-4 mr-2" /> View
            </DropdownMenuItem>
            {canWrite && (
              <DropdownMenuItem onClick={() => onEdit(document)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDownload(document)}>
              <Download className="h-4 w-4 mr-2" /> Download
            </DropdownMenuItem>
            {canWrite && !document.isTemplate && (
              <DropdownMenuItem onClick={() => onAppendVersion(document)}>
                <Copy className="h-4 w-4 mr-2" /> Append Version
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <History className="h-4 w-4 mr-2" /> Version History
            </DropdownMenuItem>
            {canDelete && !document.isTemplate && (
              <DropdownMenuItem className="text-stone-700" onClick={() => onDelete(document)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Share2 className="h-4 w-4 mr-2" /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleFavorite(document)}>
              {document.isFavorite ? (
                <>
                  <StarOff className="h-4 w-4 mr-2" /> Remove from favorites
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" /> Add to favorites
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DOCUMENT VAULT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DocumentVault: React.FC = () => {
  const { can } = usePortal();
  const canUpload = can('documents:write');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [appendTargetDoc, setAppendTargetDoc] = useState<VaultDocument | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uiNotice, setUiNotice] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fetch documents from API
  const { data: vaultDocuments = [], isLoading, error, refetch } = useQuery({
    queryKey: ['vault-documents', searchQuery, statusFilter],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/vault/search/${encodeURIComponent(searchQuery)}`
        : '/api/vault/';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      return (data.documents || data || []).map((doc: any) => ({
        id: String(doc.id),
        name: doc.title || doc.fileName || 'Untitled',
        category: doc.category || 'regulatory',
        ctdModule: doc.metadata?.ctdModule,
        status: doc.status || 'draft',
        version: doc.version || '1.0',
        author: doc.uploadedBy || doc.createdBy || 'Unknown',
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt || doc.createdAt),
        size: doc.fileSize || 0,
        fileType: doc.fileType || (doc.fileName?.split('.').pop()) || 'pdf',
        tags: doc.tags || [],
        isFavorite: false,
        isLocked: doc.status === 'approved' || doc.status === 'effective',
        lockOwner: doc.status === 'approved' ? doc.uploadedBy : undefined,
        ctdSection: doc.metadata?.ctdSection,
      })) as VaultDocument[];
    },
    staleTime: 30000,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/vault/', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-documents'] });
      setUiNotice('Upload complete.');
      setUiError(null);
    },
    onError: (error: Error) => setUiError(error.message || 'Upload failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/vault/document/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-documents'] });
      setUiNotice('Document deleted.');
      setUiError(null);
    },
    onError: (error: Error) => setUiError(error.message || 'Delete failed.'),
  });

  const appendVersionMutation = useMutation({
    mutationFn: async ({ docId, file }: { docId: string; file: File }) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('version', new Date().toISOString());
      const res = await fetch(`/api/vault/documents/${docId}/save-version`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Append version failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-documents'] });
      setUiNotice('New version appended.');
      setUiError(null);
    },
    onError: (error: Error) => setUiError(error.message || 'Append version failed.'),
  });

  // Upload handler — field name must match server's multer config ('document')
  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.size > MAX_UPLOAD_SIZE) {
      setUiError('File exceeds 50MB upload limit.');
      return;
    }
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setUiError(`Unsupported file type: .${ext || 'unknown'}`);
      return;
    }
    const formData = new FormData();
    formData.append('document', file); // Server expects 'document', not 'file'
    formData.append('title', file.name);
    formData.append('category', 'regulatory');
    uploadMutation.mutate(formData);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadMutation]);

  const uploadFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.size > MAX_UPLOAD_SIZE) {
      setUiError(`"${file.name}" exceeds 50MB upload limit.`);
      return;
    }
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setUiError(`"${file.name}" has an unsupported file type.`);
      return;
    }
    const formData = new FormData();
    formData.append('document', file);
    formData.append('title', file.name);
    formData.append('category', 'regulatory');
    uploadMutation.mutate(formData);
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    files.forEach(file => uploadFile(file));
    setUiNotice(`${files.length} file${files.length === 1 ? '' : 's'} queued for upload.`);
  }, [uploadFile]);

  // Download handler — use fetch with credentials instead of anchor tag
  const handleDownload = useCallback(async (doc: VaultDocument) => {
    try {
      const res = await fetch(`/api/vault/documents/${doc.id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  }, []);

  const handleDelete = useCallback((doc: VaultDocument) => {
    if (!window.confirm(`Delete "${doc.name}" from vault?`)) return;
    deleteMutation.mutate(doc.id);
  }, [deleteMutation]);

  const handleAppendVersion = useCallback((doc: VaultDocument) => {
    setAppendTargetDoc(doc);
    appendInputRef.current?.click();
  }, []);

  const handleAppendUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appendTargetDoc) return;
    appendVersionMutation.mutate({ docId: appendTargetDoc.id, file });
    setAppendTargetDoc(null);
    if (appendInputRef.current) appendInputRef.current.value = '';
  }, [appendTargetDoc, appendVersionMutation]);

  // View handler — show document in a detail panel (sets selected doc state)
  const [viewingDoc, setViewingDoc] = useState<VaultDocument | null>(null);
  const handleView = useCallback((doc: VaultDocument) => {
    setViewingDoc(doc);
  }, []);

  // Edit handler — navigate to document editor with the ID preserved
  const handleEdit = useCallback((doc: VaultDocument) => {
    setLocation(`/editor/${doc.id}`);
  }, [setLocation]);

  // Compute document counts for folders dynamically
  const getDocCountForFolder = useCallback((folderId: string): number => {
    if (folderId === 'ctd') {
      return vaultDocuments.filter(d => d.ctdModule?.startsWith('m')).length;
    }
    if (folderId.startsWith('m')) {
      return vaultDocuments.filter(d => d.ctdModule === folderId).length;
    }
    const folderCategoryMap: Record<string, DocumentCategory> = {
      protocols: 'protocol',
      ibs: 'investigator_brochure',
      csrs: 'csr',
      correspondence: 'correspondence',
    };
    const category = folderCategoryMap[folderId];
    if (category) return vaultDocuments.filter(d => d.category === category).length;
    return 0;
  }, [vaultDocuments]);

  // Package-mode-aware folder structures
  const [packageMode, setPackageMode] = useState<string>('ind');
  const [showTemplates, setShowTemplates] = useState(true);

  const FOLDER_STRUCTURES: Record<string, VaultFolder[]> = useMemo(() => ({
    ind: [
      { id: 'pre-ind', name: 'Pre-IND Strategy', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'briefing-book', name: 'Pre-IND Briefing Package', parentId: 'pre-ind', documentCount: 0 },
        { id: 'meeting-minutes', name: 'FDA Meeting Minutes', parentId: 'pre-ind', documentCount: 0 },
      ]},
      { id: 'ctd', name: 'CTD Modules', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'm1', name: 'Module 1 - Administrative', parentId: 'ctd', documentCount: 0 },
        { id: 'm2', name: 'Module 2 - CTD Summaries', parentId: 'ctd', documentCount: 0 },
        { id: 'm3', name: 'Module 3 - Quality (CMC)', parentId: 'ctd', documentCount: 0 },
        { id: 'm4', name: 'Module 4 - Nonclinical', parentId: 'ctd', documentCount: 0 },
        { id: 'm5', name: 'Module 5 - Clinical', parentId: 'ctd', documentCount: 0 },
      ]},
      { id: 'protocols', name: 'Protocols', parentId: null, documentCount: 0 },
      { id: 'ibs', name: 'Investigator Brochures', parentId: null, documentCount: 0 },
      { id: 'csrs', name: 'Clinical Study Reports', parentId: null, documentCount: 0 },
      { id: 'correspondence', name: 'Agency Correspondence', parentId: null, documentCount: 0, isLocked: true },
    ],
    '510k': [
      { id: '510k-admin', name: '510(k) Administrative', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'cover', name: 'Cover Letter', parentId: '510k-admin', documentCount: 0 },
        { id: 'ifu-stmt', name: 'Indications for Use Statement', parentId: '510k-admin', documentCount: 0 },
        { id: '510k-summary', name: '510(k) Summary', parentId: '510k-admin', documentCount: 0 },
        { id: 'truthful', name: 'Truthful & Accuracy Statement', parentId: '510k-admin', documentCount: 0 },
      ]},
      { id: '510k-tech', name: 'Technical Sections', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'device-desc', name: 'Device Description', parentId: '510k-tech', documentCount: 0 },
        { id: 'sub-equiv', name: 'Substantial Equivalence', parentId: '510k-tech', documentCount: 0 },
        { id: 'perf-bench', name: 'Performance Data - Bench', parentId: '510k-tech', documentCount: 0 },
        { id: 'perf-clinical', name: 'Performance Data - Clinical', parentId: '510k-tech', documentCount: 0 },
        { id: 'biocompat', name: 'Biocompatibility', parentId: '510k-tech', documentCount: 0 },
        { id: 'software', name: 'Software Documentation', parentId: '510k-tech', documentCount: 0 },
        { id: 'sterilization', name: 'Sterilization', parentId: '510k-tech', documentCount: 0 },
        { id: 'electrical', name: 'Electrical Safety', parentId: '510k-tech', documentCount: 0 },
      ]},
      { id: 'labeling', name: 'Labeling', parentId: null, documentCount: 0 },
      { id: 'standards', name: 'Standards & Guidance', parentId: null, documentCount: 0 },
      { id: 'correspondence', name: 'Agency Correspondence', parentId: null, documentCount: 0, isLocked: true },
    ],
    pma: [
      { id: 'pma-admin', name: 'PMA Administrative', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'pma-cover', name: 'Cover Letter', parentId: 'pma-admin', documentCount: 0 },
        { id: 'pma-toc', name: 'Table of Contents', parentId: 'pma-admin', documentCount: 0 },
        { id: 'pma-summary', name: 'Summary of S&E', parentId: 'pma-admin', documentCount: 0 },
      ]},
      { id: 'pma-tech', name: 'Device & Manufacturing', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'pma-device', name: 'Device Description', parentId: 'pma-tech', documentCount: 0 },
        { id: 'pma-mfg', name: 'Manufacturing Information', parentId: 'pma-tech', documentCount: 0 },
        { id: 'pma-risk', name: 'Risk Analysis / FMEA', parentId: 'pma-tech', documentCount: 0 },
      ]},
      { id: 'pma-nonclinical', name: 'Nonclinical Studies', parentId: null, documentCount: 0 },
      { id: 'pma-clinical', name: 'Clinical Investigations', parentId: null, documentCount: 0 },
      { id: 'labeling', name: 'Labeling', parentId: null, documentCount: 0 },
      { id: 'correspondence', name: 'Agency Correspondence', parentId: null, documentCount: 0, isLocked: true },
    ],
    cer: [
      { id: 'cer-main', name: 'Clinical Evaluation', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'cer-report', name: 'Clinical Evaluation Report', parentId: 'cer-main', documentCount: 0 },
        { id: 'cer-lit', name: 'Literature Review', parentId: 'cer-main', documentCount: 0 },
        { id: 'cer-equiv', name: 'Equivalence Analysis', parentId: 'cer-main', documentCount: 0 },
        { id: 'cer-data', name: 'Clinical Data Appraisal', parentId: 'cer-main', documentCount: 0 },
      ]},
      { id: 'pmcf', name: 'Post-Market Clinical Follow-up', parentId: null, documentCount: 0, children: [
        { id: 'pmcf-plan', name: 'PMCF Plan', parentId: 'pmcf', documentCount: 0 },
        { id: 'pmcf-report', name: 'PMCF Report', parentId: 'pmcf', documentCount: 0 },
      ]},
      { id: 'sscp', name: 'SSCP', parentId: null, documentCount: 0 },
      { id: 'risk-mgmt', name: 'Risk Management', parentId: null, documentCount: 0 },
      { id: 'tech-doc', name: 'Technical Documentation', parentId: null, documentCount: 0 },
      { id: 'correspondence', name: 'Notified Body Correspondence', parentId: null, documentCount: 0, isLocked: true },
    ],
    nda: [
      { id: 'ctd', name: 'CTD Modules', parentId: null, documentCount: 0, isExpanded: true, children: [
        { id: 'm1', name: 'Module 1 - Administrative', parentId: 'ctd', documentCount: 0 },
        { id: 'm2', name: 'Module 2 - CTD Summaries', parentId: 'ctd', documentCount: 0 },
        { id: 'm3', name: 'Module 3 - Quality', parentId: 'ctd', documentCount: 0 },
        { id: 'm4', name: 'Module 4 - Nonclinical', parentId: 'ctd', documentCount: 0 },
        { id: 'm5', name: 'Module 5 - Clinical', parentId: 'ctd', documentCount: 0 },
      ]},
      { id: 'labeling', name: 'Labeling (USPI / MedGuide)', parentId: null, documentCount: 0 },
      { id: 'rems', name: 'REMS', parentId: null, documentCount: 0 },
      { id: 'correspondence', name: 'Agency Correspondence', parentId: null, documentCount: 0, isLocked: true },
    ],
  }), []);

  const [folders, setFolders] = useState<VaultFolder[]>(FOLDER_STRUCTURES['ind']);

  // Update folder counts when documents change
  const foldersWithCounts = useMemo(() => {
    const updateCounts = (folders: VaultFolder[]): VaultFolder[] =>
      folders.map(folder => ({
        ...folder,
        documentCount: getDocCountForFolder(folder.id),
        children: folder.children ? updateCounts(folder.children) : undefined,
      }));
    return updateCounts(folders);
  }, [folders, getDocCountForFolder]);

  // Toggle folder expansion
  const toggleFolderExpand = useCallback((id: string) => {
    setFolders(prev => {
      const updateFolder = (folders: VaultFolder[]): VaultFolder[] => {
        return folders.map(folder => {
          if (folder.id === id) {
            return { ...folder, isExpanded: !folder.isExpanded };
          }
          if (folder.children) {
            return { ...folder, children: updateFolder(folder.children) };
          }
          return folder;
        });
      };
      return updateFolder(prev);
    });
  }, []);

  // Toggle favorite (client-side only)
  const toggleFavorite = useCallback((doc: VaultDocument) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(doc.id)) {
        next.delete(doc.id);
      } else {
        next.add(doc.id);
      }
      return next;
    });
  }, []);

  // Apply favorites to documents
  const templateDocuments = useMemo(() => {
    const templateMap: Record<string, Array<Partial<VaultDocument> & { id: string; name: string }>> = {
      ind: [
        { id: 'tpl-ind-cover-letter', name: 'Template - IND Cover Letter', folderId: 'm1', category: 'regulatory' },
        { id: 'tpl-ind-1571', name: 'Template - FDA Form 1571 Narrative', folderId: 'm1', category: 'administrative' },
        { id: 'tpl-ind-clin-protocol', name: 'Template - Clinical Protocol', folderId: 'protocols', category: 'protocol' },
        { id: 'tpl-ind-cmc-qos', name: 'Template - Quality Overall Summary', folderId: 'm3', category: 'cmc' },
      ],
      '510k': [
        { id: 'tpl-510k-cover', name: 'Template - 510(k) Cover Letter', folderId: 'cover', category: 'administrative' },
        { id: 'tpl-510k-summary', name: 'Template - 510(k) Summary', folderId: '510k-summary', category: 'regulatory' },
        { id: 'tpl-510k-device-desc', name: 'Template - Device Description', folderId: 'device-desc', category: 'regulatory' },
        { id: 'tpl-510k-se', name: 'Template - Substantial Equivalence', folderId: 'sub-equiv', category: 'regulatory' },
      ],
      nda: [
        { id: 'tpl-nda-uspi', name: 'Template - USPI Labeling', folderId: 'labeling', category: 'labeling' },
      ],
    };

    return (templateMap[packageMode] || []).map((template, index) => ({
      id: template.id,
      name: template.name,
      category: template.category || 'regulatory',
      status: 'draft',
      version: 'template',
      author: 'System',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 0,
      fileType: 'docx',
      tags: ['template', packageMode],
      isFavorite: false,
      isLocked: false,
      isTemplate: true,
      folderId: template.folderId,
      ctdModule: template.folderId?.startsWith('m') ? template.folderId as CTDModule : undefined,
      ctdSection: `template-${index + 1}`,
    } as VaultDocument));
  }, [packageMode]);

  const documentsWithFavorites = useMemo(() =>
    (showTemplates ? [...templateDocuments, ...vaultDocuments] : vaultDocuments).map(doc => ({
      ...doc,
      isFavorite: favoriteIds.has(doc.id),
    })),
    [showTemplates, templateDocuments, vaultDocuments, favoriteIds]
  );

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let result = [...documentsWithFavorites];

    // Status filter (search is already handled by the API query)
    if (statusFilter !== 'all') {
      result = result.filter(doc => doc.status === statusFilter);
    }

    // Folder filter
    if (selectedFolderId) {
      if (selectedFolderId.startsWith('m')) {
        result = result.filter(doc => doc.ctdModule === selectedFolderId);
      } else {
        result = result.filter(doc => (doc.folderId ? doc.folderId === selectedFolderId : true));
        // Map folder to category
        const folderCategoryMap: Record<string, DocumentCategory> = {
          protocols: 'protocol',
          ibs: 'investigator_brochure',
          csrs: 'csr',
          correspondence: 'correspondence',
        };
        const category = folderCategoryMap[selectedFolderId];
        if (category) {
          result = result.filter(doc => doc.category === category);
        }
      }
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [documentsWithFavorites, statusFilter, selectedFolderId, sortField, sortOrder]);

  const recentActivityDocs = useMemo(() => {
    return [...vaultDocuments]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [vaultDocuments]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === 'INPUT') return;
      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key.toLowerCase() === 'u' && canUpload) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUpload]);

  useEffect(() => {
    if (!previewDoc) {
      setPreviewText(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const textLikeTypes = ['txt', 'md', 'json', 'csv'];
    const docType = (previewDoc.fileType || '').toLowerCase();
    const isTextPreview = textLikeTypes.some(type => docType.includes(type));
    if (!isTextPreview) {
      setPreviewText(null);
      setPreviewError(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);
    fetch(`/api/vault/documents/${previewDoc.id}/view`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('Preview failed');
        return res.text();
      })
      .then(text => {
        if (!active) return;
        setPreviewText(text.slice(0, 10000));
      })
      .catch(err => {
        if (!active) return;
        setPreviewError(String(err));
      })
      .finally(() => {
        if (!active) return;
        setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [previewDoc]);

  useEffect(() => {
    if (!uiNotice) return;
    const timeout = setTimeout(() => setUiNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [uiNotice]);

  useEffect(() => {
    if (!uiError) return;
    const timeout = setTimeout(() => setUiError(null), 5000);
    return () => clearTimeout(timeout);
  }, [uiError]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderLock className="h-6 w-6 text-stone-600" />
            Document Vault
          </h1>
          <p className="text-muted-foreground">Secure document repository with version control</p>
        </div>
        <div className="flex items-center gap-2">
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
              <input
                ref={appendInputRef}
                type="file"
                className="hidden"
                onChange={handleAppendUpload}
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(prev => !prev)}>
            <Plus className="h-4 w-4 mr-2" />
            {showTemplates ? 'Hide Templates' : 'Show Templates'}
          </Button>
          {/* Package mode selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Folder className="h-4 w-4 mr-2" />
                {packageMode === 'ind' ? 'IND / eCTD' :
                 packageMode === '510k' ? '510(k)' :
                 packageMode === 'pma' ? 'PMA' :
                 packageMode === 'cer' ? 'EU MDR CER' :
                 packageMode === 'nda' ? 'NDA' : packageMode.toUpperCase()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.keys(FOLDER_STRUCTURES).map(mode => (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => {
                    setPackageMode(mode);
                    setFolders(FOLDER_STRUCTURES[mode]);
                    setSelectedFolderId(null);
                  }}
                >
                  {mode === 'ind' ? 'IND / eCTD' :
                   mode === '510k' ? '510(k)' :
                   mode === 'pma' ? 'PMA' :
                   mode === 'cer' ? 'EU MDR CER' :
                   mode === 'nda' ? 'NDA' : mode.toUpperCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="pt-4 text-sm">
            <p className="font-medium mb-1">Quick Start</p>
            <p className="text-muted-foreground">
              1) Choose a package mode, 2) enable templates, 3) upload or drag files, 4) append versions during review.
            </p>
          </CardContent>
        </Card>
        <div
          className={`rounded-lg border-2 border-dashed p-3 text-sm transition-colors ${
            dragActive ? 'border-stone-1000 bg-stone-100' : 'border-slate-300 bg-white'
          }`}
          onDragOver={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <p className="font-medium">Drag & drop upload</p>
          <p className="text-muted-foreground">Drop one file here to upload to the active vault view.</p>
        </div>
      </div>

      {uiNotice && (
        <div className="mb-4 rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-800">
          {uiNotice}
        </div>
      )}
      {uiError && (
        <div className="mb-4 rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-800">
          {uiError}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Folders</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <FolderTree
                folders={foldersWithCounts}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onToggleExpand={toggleFolderExpand}
              />
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {recentActivityDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent document activity yet.</p>
                ) : (
                  recentActivityDocs.map(doc => (
                    <button
                      key={`recent-${doc.id}`}
                      className="w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50"
                      onClick={() => setViewingDoc(doc)}
                    >
                      <p className="text-xs font-medium truncate">{doc.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                          new Date(doc.updatedAt)
                        )}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Document List */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-xs text-muted-foreground hidden xl:inline">
              Shortcuts: <kbd className="px-1 border rounded">/</kbd> search •{' '}
              <kbd className="px-1 border rounded">U</kbd> upload
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  {statusFilter === 'all' ? 'All Status' : STATUS_CONFIG[statusFilter].label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                  All Status
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setStatusFilter(status as DocumentStatus)}
                  >
                    <Badge className={`mr-2 ${config.color}`}>{config.label}</Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
            >
              {sortOrder === 'asc' ? (
                <SortAsc className="h-4 w-4" />
              ) : (
                <SortDesc className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Document Grid/List */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <div className="h-8 w-8 border-4 border-stone-200 border-t-stone-600 rounded-full animate-spin mb-4" />
                <p className="text-sm">Loading documents...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mb-4 text-stone-400" />
                <p className="text-lg font-medium">Failed to load documents</p>
                <p className="text-sm mb-4">{(error as Error).message}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No documents found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
                <div className="mt-4 flex items-center gap-2">
                  {canUpload && (
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload first document
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowTemplates(true)}>
                    Show starter templates
                  </Button>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredDocuments.map(doc => (
                      <DocumentListItem
                        key={doc.id}
                        document={doc}
                        viewMode={viewMode}
                        onView={handleView}
                        onEdit={handleEdit}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        onAppendVersion={handleAppendVersion}
                        onToggleFavorite={toggleFavorite}
                      />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map(doc => (
                  <DocumentListItem
                    key={doc.id}
                    document={doc}
                    viewMode={viewMode}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    onAppendVersion={handleAppendVersion}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
            </span>
            <span>
              {filteredDocuments.filter(d => d.isFavorite).length} favorites •{' '}
              {filteredDocuments.filter(d => d.isLocked).length} locked
            </span>
          </div>
        </div>

        {/* Document Detail Panel — slides in when viewing a document */}
        {viewingDoc && (
          <div className="w-96 flex-shrink-0 border-l bg-white overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm truncate">{viewingDoc.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => setViewingDoc(null)} className="h-7 w-7 p-0">
                <span className="sr-only">Close</span>×
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                <Badge className={STATUS_CONFIG[viewingDoc.status]?.color}>
                  {STATUS_CONFIG[viewingDoc.status]?.label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Version</p>
                <p className="text-sm">v{viewingDoc.version}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Author</p>
                <p className="text-sm">{viewingDoc.author}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Category</p>
                <Badge className={CATEGORY_CONFIG[viewingDoc.category]?.color}>
                  {CATEGORY_CONFIG[viewingDoc.category]?.label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Last Updated</p>
                <p className="text-sm">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(viewingDoc.updatedAt))}</p>
              </div>
              {viewingDoc.tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {viewingDoc.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-3 space-y-2 border-t">
                <Button className="w-full" size="sm" onClick={() => handleEdit(viewingDoc)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Open in Editor
                </Button>
                <Button variant="outline" className="w-full" size="sm" onClick={() => handleDownload(viewingDoc)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                {!viewingDoc.isTemplate && (
                  <Button variant="outline" className="w-full" size="sm" onClick={() => setPreviewDoc(viewingDoc)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Quick Preview
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[80vh] flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <h4 className="text-sm font-semibold truncate">{previewDoc.name}</h4>
              <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)}>Close</Button>
            </div>
            <div className="w-full h-full rounded-b-lg overflow-auto">
              {previewDoc.fileType?.toLowerCase().includes('pdf') ? (
                <iframe
                  title={`preview-${previewDoc.id}`}
                  src={`/api/vault/documents/${previewDoc.id}/view`}
                  className="w-full h-full rounded-b-lg"
                />
              ) : previewLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Loading preview…
                </div>
              ) : previewText ? (
                <pre className="p-4 text-xs whitespace-pre-wrap">{previewText}</pre>
              ) : (
                <div className="p-6 text-sm text-muted-foreground space-y-2">
                  <p>{previewError ? 'Unable to preview this document inline.' : 'Preview not available for this file type yet.'}</p>
                  <Button size="sm" variant="outline" onClick={() => handleDownload(previewDoc)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentVault;
