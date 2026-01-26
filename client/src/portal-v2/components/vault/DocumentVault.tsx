/**
 * TrialSage Client Portal V2 - Document Vault
 *
 * Enterprise document management system with version control,
 * smart folders, compliance tracking, and AI-powered search.
 *
 * @version 2.0.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Unlock,
} from 'lucide-react';
import type {
  DocumentSummary,
  DocumentStatus,
  DocumentCategory,
  CTDModule,
} from '../../core/portalTypes';
import { usePortal, usePermission } from '../../core/portalContext';

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
}

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'updatedAt' | 'status' | 'size';
type SortOrder = 'asc' | 'desc';

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  in_review: { label: 'In Review', color: 'bg-blue-100 text-blue-700', icon: Clock },
  pending_approval: {
    label: 'Pending Approval',
    color: 'bg-amber-100 text-amber-700',
    icon: Clock,
  },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  superseded: { label: 'Superseded', color: 'bg-gray-100 text-gray-500', icon: History },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500', icon: FileText },
  effective: { label: 'Effective', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; color: string }> = {
  protocol: { label: 'Protocol', color: 'bg-blue-50 text-blue-700' },
  investigator_brochure: { label: 'IB', color: 'bg-purple-50 text-purple-700' },
  csr: { label: 'CSR', color: 'bg-green-50 text-green-700' },
  cmc: { label: 'CMC', color: 'bg-amber-50 text-amber-700' },
  nonclinical: { label: 'Nonclinical', color: 'bg-red-50 text-red-700' },
  clinical: { label: 'Clinical', color: 'bg-teal-50 text-teal-700' },
  regulatory: { label: 'Regulatory', color: 'bg-indigo-50 text-indigo-700' },
  quality: { label: 'Quality', color: 'bg-pink-50 text-pink-700' },
  safety: { label: 'Safety', color: 'bg-orange-50 text-orange-700' },
  administrative: { label: 'Admin', color: 'bg-gray-50 text-gray-700' },
  labeling: { label: 'Labeling', color: 'bg-cyan-50 text-cyan-700' },
  correspondence: { label: 'Correspondence', color: 'bg-slate-50 text-slate-700' },
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE ICON HELPER
// ─────────────────────────────────────────────────────────────────────────────

const getFileIcon = (fileType: string) => {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return <FileText className="h-5 w-5 text-red-500" />;
    case 'docx':
    case 'doc':
      return <FileText className="h-5 w-5 text-blue-500" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
      return <FileImage className="h-5 w-5 text-purple-500" />;
    default:
      return <File className="h-5 w-5 text-gray-500" />;
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
        <button
          onClick={() => onSelectFolder(folder.id)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleExpand(folder.id);
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
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
            <FolderOpen className="h-4 w-4 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500" />
          )}
          <span className="flex-1 text-left truncate">{folder.name}</span>
          {folder.isLocked && <Lock className="h-3 w-3 text-gray-400" />}
          <Badge variant="secondary" className="text-xs px-1.5">
            {folder.documentCount}
          </Badge>
        </button>
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
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <FolderLock className="h-4 w-4 text-blue-600" />
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
  onToggleFavorite: (doc: VaultDocument) => void;
}

const DocumentListItem: React.FC<DocumentListItemProps> = ({
  document,
  viewMode,
  onView,
  onEdit,
  onToggleFavorite,
}) => {
  const statusConfig = STATUS_CONFIG[document.status];
  const categoryConfig = CATEGORY_CONFIG[document.category];
  const canWrite = usePermission('documents:write');

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
              <DropdownMenuItem>
                <Download className="h-4 w-4 mr-2" /> Download
              </DropdownMenuItem>
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
            {document.isFavorite && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            {document.isLocked && <Lock className="h-3 w-3 text-gray-400" />}
            <h3 className="font-medium text-sm truncate flex-1" title={document.name}>
              {document.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
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
      className="group flex items-center gap-4 rounded-lg border p-3 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => onView(document)}
    >
      <div className="flex-shrink-0">{getFileIcon(document.fileType)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {document.isFavorite && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
          {document.isLocked && <Lock className="h-3 w-3 text-gray-400" />}
          <span className="font-medium text-sm truncate">{document.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge className={`text-xs ${categoryConfig.color}`}>{categoryConfig.label}</Badge>
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
            <DropdownMenuItem>
              <Download className="h-4 w-4 mr-2" /> Download
            </DropdownMenuItem>
            <DropdownMenuItem>
              <History className="h-4 w-4 mr-2" /> Version History
            </DropdownMenuItem>
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

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');

  // Mock data - in production, this would come from API
  const [folders, setFolders] = useState<VaultFolder[]>([
    {
      id: 'ctd',
      name: 'CTD Modules',
      parentId: null,
      documentCount: 156,
      isExpanded: true,
      children: [
        { id: 'm1', name: 'Module 1 - Administrative', parentId: 'ctd', documentCount: 24 },
        { id: 'm2', name: 'Module 2 - CTD Summaries', parentId: 'ctd', documentCount: 18 },
        { id: 'm3', name: 'Module 3 - Quality', parentId: 'ctd', documentCount: 45 },
        { id: 'm4', name: 'Module 4 - Nonclinical', parentId: 'ctd', documentCount: 32 },
        { id: 'm5', name: 'Module 5 - Clinical', parentId: 'ctd', documentCount: 37 },
      ],
    },
    { id: 'protocols', name: 'Protocols', parentId: null, documentCount: 12 },
    { id: 'ibs', name: 'Investigator Brochures', parentId: null, documentCount: 8 },
    { id: 'csrs', name: 'Clinical Study Reports', parentId: null, documentCount: 15 },
    {
      id: 'correspondence',
      name: 'Agency Correspondence',
      parentId: null,
      documentCount: 42,
      isLocked: true,
    },
  ]);

  const [documents, setDocuments] = useState<VaultDocument[]>([
    {
      id: '1',
      name: 'Clinical Overview v2.3.docx',
      category: 'clinical',
      ctdModule: 'm2',
      status: 'pending_approval',
      version: '2.3',
      author: 'Sarah Johnson',
      createdAt: new Date('2025-12-15'),
      updatedAt: new Date('2026-01-20'),
      size: 2400000,
      fileType: 'docx',
      tags: ['M2', 'Clinical'],
      isFavorite: true,
    },
    {
      id: '2',
      name: 'Protocol BTX-331-001 v3.0.pdf',
      category: 'protocol',
      status: 'effective',
      version: '3.0',
      author: 'Michael Chen',
      createdAt: new Date('2025-10-01'),
      updatedAt: new Date('2026-01-15'),
      size: 1800000,
      fileType: 'pdf',
      tags: ['Protocol', 'Phase 1'],
      isFavorite: true,
    },
    {
      id: '3',
      name: 'Quality Overall Summary.docx',
      category: 'cmc',
      ctdModule: 'm2',
      status: 'in_review',
      version: '1.2',
      author: 'Emily Davis',
      createdAt: new Date('2025-11-20'),
      updatedAt: new Date('2026-01-18'),
      size: 3200000,
      fileType: 'docx',
      tags: ['M2', 'QOS'],
    },
    {
      id: '4',
      name: 'Investigator Brochure v5.0.pdf',
      category: 'investigator_brochure',
      status: 'approved',
      version: '5.0',
      author: 'Robert Wilson',
      createdAt: new Date('2025-08-10'),
      updatedAt: new Date('2026-01-10'),
      size: 4500000,
      fileType: 'pdf',
      tags: ['IB'],
      isLocked: true,
      lockOwner: 'R. Wilson',
    },
    {
      id: '5',
      name: 'CMC Module 3.2.P.pdf',
      category: 'cmc',
      ctdModule: 'm3',
      status: 'draft',
      version: '0.9',
      author: 'Amanda Kumar',
      createdAt: new Date('2026-01-05'),
      updatedAt: new Date('2026-01-22'),
      size: 8900000,
      fileType: 'pdf',
      tags: ['M3', 'Drug Product'],
    },
    {
      id: '6',
      name: 'Nonclinical Overview.docx',
      category: 'nonclinical',
      ctdModule: 'm2',
      status: 'approved',
      version: '1.0',
      author: 'David Lee',
      createdAt: new Date('2025-09-15'),
      updatedAt: new Date('2025-12-20'),
      size: 1200000,
      fileType: 'docx',
      tags: ['M2', 'Nonclinical'],
    },
    {
      id: '7',
      name: 'Statistical Analysis Plan.docx',
      category: 'clinical',
      status: 'effective',
      version: '2.1',
      author: 'Jennifer Park',
      createdAt: new Date('2025-11-01'),
      updatedAt: new Date('2026-01-08'),
      size: 980000,
      fileType: 'docx',
      tags: ['SAP', 'Statistics'],
    },
    {
      id: '8',
      name: 'FDA Type B Meeting Request.pdf',
      category: 'correspondence',
      status: 'approved',
      version: '1.0',
      author: 'Sarah Johnson',
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-15'),
      size: 420000,
      fileType: 'pdf',
      tags: ['FDA', 'Meeting'],
    },
  ]);

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

  // Toggle favorite
  const toggleFavorite = useCallback((doc: VaultDocument) => {
    setDocuments(prev =>
      prev.map(d => (d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d))
    );
  }, []);

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        doc =>
          doc.name.toLowerCase().includes(query) ||
          doc.author.toLowerCase().includes(query) ||
          doc.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(doc => doc.status === statusFilter);
    }

    // Folder filter
    if (selectedFolderId) {
      if (selectedFolderId.startsWith('m')) {
        result = result.filter(doc => doc.ctdModule === selectedFolderId);
      } else {
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
  }, [documents, searchQuery, statusFilter, selectedFolderId, sortField, sortOrder]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderLock className="h-6 w-6 text-blue-600" />
            Document Vault
          </h1>
          <p className="text-muted-foreground">Secure document repository with version control</p>
        </div>
        <div className="flex items-center gap-2">
          {canUpload && (
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          )}
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Folders</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <FolderTree
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onToggleExpand={toggleFolderExpand}
              />
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
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

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
            {filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No documents found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredDocuments.map(doc => (
                  <DocumentListItem
                    key={doc.id}
                    document={doc}
                    viewMode={viewMode}
                    onView={() => {}}
                    onEdit={() => {}}
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
                    onView={() => {}}
                    onEdit={() => {}}
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
      </div>
    </div>
  );
};

export default DocumentVault;
