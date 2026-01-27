/**
 * Evidence Library V3
 *
 * A beautiful, searchable document library for regulatory evidence.
 * Grid & list views, powerful filtering, and AI-powered insights.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  Filter,
  Grid3X3,
  List,
  Plus,
  Upload,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Star,
  StarOff,
  MoreVertical,
  Download,
  Trash2,
  Edit3,
  Share2,
  Clock,
  Calendar,
  User,
  Tag,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  FileClock,
  FileX,
  X,
  SlidersHorizontal,
  Sparkles,
  FileSearch,
  ArrowUpDown,
  Eye,
  ExternalLink,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type DocumentStatus = 'draft' | 'review' | 'approved' | 'expired' | 'archived';
type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'date' | 'size' | 'status';

interface Document {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  version: string;
  size: string;
  createdAt: Date;
  modifiedAt: Date;
  author: string;
  tags: string[];
  starred: boolean;
  thumbnailColor?: string;
  description?: string;
  program?: string;
}

interface Folder {
  id: string;
  name: string;
  documentCount: number;
  icon: string;
}

interface FilterState {
  status: DocumentStatus[];
  type: string[];
  tags: string[];
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  starred: boolean | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_FOLDERS: Folder[] = [
  { id: '1', name: 'IND Submissions', documentCount: 24, icon: 'ind' },
  { id: '2', name: 'Clinical Protocols', documentCount: 18, icon: 'protocol' },
  { id: '3', name: 'CMC Documents', documentCount: 42, icon: 'cmc' },
  { id: '4', name: 'Safety Reports', documentCount: 15, icon: 'safety' },
  { id: '5', name: 'Regulatory Correspondence', documentCount: 31, icon: 'correspondence' },
];

const MOCK_DOCUMENTS: Document[] = [
  {
    id: '1',
    name: 'TSG-201 Phase 2b Protocol v3.2',
    type: 'Protocol',
    status: 'approved',
    version: '3.2',
    size: '2.4 MB',
    createdAt: new Date('2025-10-15'),
    modifiedAt: new Date('2026-01-10'),
    author: 'Dr. Sarah Chen',
    tags: ['Phase 2', 'Melanoma', 'FDA'],
    starred: true,
    thumbnailColor: 'bg-primary-500',
    description: 'Clinical protocol for Phase 2b melanoma study',
    program: 'TSG-201',
  },
  {
    id: '2',
    name: 'IND Cover Letter - TSG-305',
    type: 'Cover Letter',
    status: 'review',
    version: '1.0',
    size: '156 KB',
    createdAt: new Date('2026-01-15'),
    modifiedAt: new Date('2026-01-20'),
    author: 'James Wilson',
    tags: ['IND', 'NSCLC'],
    starred: false,
    thumbnailColor: 'bg-amber-500',
    program: 'TSG-305',
  },
  {
    id: '3',
    name: 'Module 3.2.P Drug Product Specification',
    type: 'CMC',
    status: 'draft',
    version: '2.1',
    size: '4.8 MB',
    createdAt: new Date('2026-01-05'),
    modifiedAt: new Date('2026-01-22'),
    author: 'Michael Park',
    tags: ['CMC', 'Manufacturing'],
    starred: true,
    thumbnailColor: 'bg-success-500',
    program: 'TSG-305',
  },
  {
    id: '4',
    name: 'Investigator Brochure v8.0',
    type: 'IB',
    status: 'approved',
    version: '8.0',
    size: '12.3 MB',
    createdAt: new Date('2025-06-01'),
    modifiedAt: new Date('2025-12-15'),
    author: 'Emma Rodriguez',
    tags: ['IB', 'Safety', 'Efficacy'],
    starred: false,
    thumbnailColor: 'bg-info-500',
    program: 'TSG-201',
  },
  {
    id: '5',
    name: 'Annual Safety Report 2025',
    type: 'Safety Report',
    status: 'approved',
    version: '1.0',
    size: '8.7 MB',
    createdAt: new Date('2026-01-02'),
    modifiedAt: new Date('2026-01-15'),
    author: 'Dr. Sarah Chen',
    tags: ['Safety', 'Annual'],
    starred: false,
    thumbnailColor: 'bg-error-500',
    program: 'TSG-201',
  },
  {
    id: '6',
    name: 'FDA Meeting Request - Pre-NDA',
    type: 'Correspondence',
    status: 'review',
    version: '1.2',
    size: '245 KB',
    createdAt: new Date('2026-01-18'),
    modifiedAt: new Date('2026-01-21'),
    author: 'James Wilson',
    tags: ['FDA', 'Meeting', 'NDA'],
    starred: true,
    thumbnailColor: 'bg-purple-500',
    program: 'TSG-108',
  },
];

const DOCUMENT_TYPES = [
  'Protocol',
  'Cover Letter',
  'CMC',
  'IB',
  'Safety Report',
  'Correspondence',
  'CSR',
];
const TAGS = [
  'Phase 2',
  'Phase 3',
  'IND',
  'NDA',
  'FDA',
  'CMC',
  'Safety',
  'Efficacy',
  'Manufacturing',
];

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════════

interface StatusBadgeProps {
  status: DocumentStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = memo(({ status }) => {
  const config: Record<
    DocumentStatus,
    { label: string; className: string; icon: React.ComponentType<any> }
  > = {
    draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-600', icon: FileClock },
    review: { label: 'In Review', className: 'bg-amber-100 text-amber-700', icon: FileSearch },
    approved: { label: 'Approved', className: 'bg-success-100 text-success-700', icon: FileCheck },
    expired: { label: 'Expired', className: 'bg-error-100 text-error-700', icon: FileX },
    archived: { label: 'Archived', className: 'bg-neutral-100 text-neutral-500', icon: FileText },
  };

  const { label, className, icon: Icon } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH INPUT
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchInput: React.FC<SearchInputProps> = memo(
  ({ value, onChange, placeholder = 'Search documents...' }) => (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full pl-10 pr-4 py-2 rounded-lg',
          'bg-neutral-100 border border-transparent',
          'text-neutral-900 placeholder-neutral-400',
          'focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100',
          'transition-all duration-200'
        )}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
);

SearchInput.displayName = 'SearchInput';

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = memo(({ value, onChange }) => (
  <div className="flex items-center bg-neutral-100 rounded-lg p-1">
    <button
      onClick={() => onChange('grid')}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-md transition-all',
        value === 'grid'
          ? 'bg-white text-primary-600 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-700'
      )}
    >
      <Grid3X3 className="w-4 h-4" />
    </button>
    <button
      onClick={() => onChange('list')}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-md transition-all',
        value === 'list'
          ? 'bg-white text-primary-600 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-700'
      )}
    >
      <List className="w-4 h-4" />
    </button>
  </div>
));

ViewToggle.displayName = 'ViewToggle';

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClose: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = memo(({ filters, onFiltersChange, onClose }) => {
  const toggleStatus = (status: DocumentStatus) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatus });
  };

  const toggleType = (type: string) => {
    const newType = filters.type.includes(type)
      ? filters.type.filter(t => t !== type)
      : [...filters.type, type];
    onFiltersChange({ ...filters, type: newType });
  };

  const toggleTag = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag];
    onFiltersChange({ ...filters, tags: newTags });
  };

  return (
    <motion.div
      className="bg-white rounded-xl border border-neutral-200 p-4 shadow-lg"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">Filters</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status */}
      <div className="mb-4">
        <p className="text-sm font-medium text-neutral-700 mb-2">Status</p>
        <div className="flex flex-wrap gap-2">
          {(['draft', 'review', 'approved', 'expired', 'archived'] as DocumentStatus[]).map(
            status => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  filters.status.includes(status)
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                )}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Document Type */}
      <div className="mb-4">
        <p className="text-sm font-medium text-neutral-700 mb-2">Document Type</p>
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filters.type.includes(type)
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="mb-4">
        <p className="text-sm font-medium text-neutral-700 mb-2">Tags</p>
        <div className="flex flex-wrap gap-2">
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filters.tags.includes(tag)
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div className="mb-4">
        <p className="text-sm font-medium text-neutral-700 mb-2">Modified</p>
        <div className="flex flex-wrap gap-2">
          {(['all', 'today', 'week', 'month', 'year'] as const).map(range => (
            <button
              key={range}
              onClick={() => onFiltersChange({ ...filters, dateRange: range })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filters.dateRange === range
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              )}
            >
              {range === 'all' ? 'All time' : range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Clear filters */}
      <button
        onClick={() =>
          onFiltersChange({ status: [], type: [], tags: [], dateRange: 'all', starred: null })
        }
        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        Clear all filters
      </button>
    </motion.div>
  );
});

FilterPanel.displayName = 'FilterPanel';

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT CARD (GRID VIEW)
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentCardProps {
  document: Document;
  index: number;
  onToggleStar: (id: string) => void;
}

const DocumentCard: React.FC<DocumentCardProps> = memo(({ document, index, onToggleStar }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

  return (
    <motion.div
      className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-neutral-300 transition-all cursor-pointer"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -2 }}
    >
      {/* Thumbnail */}
      <div className={cn('h-32 relative', document.thumbnailColor || 'bg-neutral-200')}>
        <FileText className="absolute inset-0 m-auto w-12 h-12 text-white/30" />

        {/* Star button */}
        <button
          onClick={e => {
            e.stopPropagation();
            onToggleStar(document.id);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/20 backdrop-blur hover:bg-white/30 transition-colors"
        >
          {document.starred ? (
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          ) : (
            <StarOff className="w-4 h-4 text-white/70" />
          )}
        </button>

        {/* Version badge */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/30 backdrop-blur text-white text-xs font-medium">
          v{document.version}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-neutral-900 truncate group-hover:text-primary-600 transition-colors">
              {document.name}
            </h3>
            <p className="text-sm text-neutral-500 mt-0.5">
              {document.type} • {document.size}
            </p>
          </div>
          <StatusBadge status={document.status} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-3">
          {document.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-xs"
            >
              {tag}
            </span>
          ))}
          {document.tags.length > 3 && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-xs">
              +{document.tags.length - 3}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between mt-4 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {document.author.split(' ').pop()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(document.modifiedAt)}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

DocumentCard.displayName = 'DocumentCard';

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT ROW (LIST VIEW)
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentRowProps {
  document: Document;
  index: number;
  onToggleStar: (id: string) => void;
}

const DocumentRow: React.FC<DocumentRowProps> = memo(({ document, index, onToggleStar }) => {
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      date
    );

  return (
    <motion.div
      className="group flex items-center gap-4 p-4 bg-white border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0',
          document.thumbnailColor || 'bg-neutral-200'
        )}
      >
        <FileText className="w-5 h-5 text-white" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-neutral-900 truncate group-hover:text-primary-600 transition-colors">
            {document.name}
          </h3>
          <span className="text-xs text-neutral-400">v{document.version}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-sm text-neutral-500">
          <span>{document.type}</span>
          <span>•</span>
          <span>{document.program}</span>
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={document.status} />

      {/* Modified */}
      <div className="hidden sm:block text-sm text-neutral-500 w-24 text-right">
        {formatDate(document.modifiedAt)}
      </div>

      {/* Size */}
      <div className="hidden md:block text-sm text-neutral-400 w-20 text-right">
        {document.size}
      </div>

      {/* Star */}
      <button
        onClick={e => {
          e.stopPropagation();
          onToggleStar(document.id);
        }}
        className="p-1.5 rounded-lg hover:bg-neutral-200 transition-colors"
      >
        {document.starred ? (
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
        ) : (
          <Star className="w-4 h-4 text-neutral-300 group-hover:text-neutral-400" />
        )}
      </button>

      {/* Actions */}
      <button className="p-1.5 rounded-lg hover:bg-neutral-200 transition-colors opacity-0 group-hover:opacity-100">
        <MoreVertical className="w-4 h-4 text-neutral-500" />
      </button>
    </motion.div>
  );
});

DocumentRow.displayName = 'DocumentRow';

// ═══════════════════════════════════════════════════════════════════════════════
// FOLDER SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
}

const FolderSidebar: React.FC<FolderSidebarProps> = memo(
  ({ folders, selectedFolderId, onSelectFolder }) => (
    <div className="w-64 bg-white border-r border-neutral-200 flex-shrink-0 hidden lg:block">
      <div className="p-4">
        <h2 className="font-semibold text-neutral-900 mb-4">Library</h2>

        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
            selectedFolderId === null
              ? 'bg-primary-50 text-primary-700'
              : 'text-neutral-600 hover:bg-neutral-50'
          )}
        >
          <FileText className="w-5 h-5" />
          <span className="font-medium">All Documents</span>
        </button>

        <div className="mt-4 space-y-1">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                selectedFolderId === folder.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-neutral-600 hover:bg-neutral-50'
              )}
            >
              {selectedFolderId === folder.id ? (
                <FolderOpen className="w-5 h-5" />
              ) : (
                <Folder className="w-5 h-5" />
              )}
              <span className="flex-1 font-medium">{folder.name}</span>
              <span className="text-xs text-neutral-400">{folder.documentCount}</span>
            </button>
          ))}
        </div>

        <button className="flex items-center gap-2 w-full px-3 py-2 mt-4 text-sm text-neutral-400 hover:text-primary-600 transition-colors">
          <Plus className="w-4 h-4" />
          New folder
        </button>
      </div>
    </div>
  )
);

FolderSidebar.displayName = 'FolderSidebar';

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

const EmptyState: React.FC<{ searchQuery: string }> = ({ searchQuery }) => (
  <motion.div
    className="flex flex-col items-center justify-center py-16"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
      <FileSearch className="w-8 h-8 text-neutral-400" />
    </div>
    <h3 className="font-semibold text-neutral-900 mb-1">No documents found</h3>
    <p className="text-neutral-500 text-center max-w-sm">
      {searchQuery
        ? `No documents match "${searchQuery}". Try adjusting your search or filters.`
        : 'This folder is empty. Upload a document to get started.'}
    </p>
    <button className="flex items-center gap-2 mt-6 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors">
      <Upload className="w-4 h-4" />
      Upload Document
    </button>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const EvidenceLibraryV3: React.FC<{ className?: string }> = ({ className }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [documents, setDocuments] = useState(MOCK_DOCUMENTS);
  const [filters, setFilters] = useState<FilterState>({
    status: [],
    type: [],
    tags: [],
    dateRange: 'all',
    starred: null,
  });

  const handleToggleStar = useCallback((id: string) => {
    setDocuments(docs =>
      docs.map(doc => (doc.id === id ? { ...doc, starred: !doc.starred } : doc))
    );
  }, []);

  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        doc =>
          doc.name.toLowerCase().includes(query) ||
          doc.type.toLowerCase().includes(query) ||
          doc.author.toLowerCase().includes(query) ||
          doc.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      result = result.filter(doc => filters.status.includes(doc.status));
    }

    // Type filter
    if (filters.type.length > 0) {
      result = result.filter(doc => filters.type.includes(doc.type));
    }

    // Tags filter
    if (filters.tags.length > 0) {
      result = result.filter(doc => filters.tags.some(tag => doc.tags.includes(tag)));
    }

    // Starred filter
    if (filters.starred !== null) {
      result = result.filter(doc => doc.starred === filters.starred);
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return b.modifiedAt.getTime() - a.modifiedAt.getTime();
        case 'size':
          return parseFloat(b.size) - parseFloat(a.size);
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return result;
  }, [documents, searchQuery, filters, sortBy]);

  const activeFilterCount =
    filters.status.length +
    filters.type.length +
    filters.tags.length +
    (filters.dateRange !== 'all' ? 1 : 0) +
    (filters.starred !== null ? 1 : 0);

  return (
    <div className={cn('flex h-full bg-neutral-50', className)}>
      {/* Sidebar */}
      <FolderSidebar
        folders={MOCK_FOLDERS}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-neutral-200 p-4">
          <div className="flex items-center justify-between gap-4">
            <SearchInput value={searchQuery} onChange={setSearchQuery} />

            <div className="flex items-center gap-2">
              {/* Filter button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  showFilters || activeFilterCount > 0
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                )}
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 rounded-lg bg-neutral-100 text-neutral-600 text-sm font-medium border-none focus:ring-2 focus:ring-primary-200 cursor-pointer"
              >
                <option value="date">Last modified</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="status">Status</option>
              </select>

              {/* View toggle */}
              <ViewToggle value={viewMode} onChange={setViewMode} />

              {/* Upload button */}
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </div>
          </div>

          {/* Filter panel */}
          <AnimatePresence>
            {showFilters && (
              <div className="mt-4">
                <FilterPanel
                  filters={filters}
                  onFiltersChange={setFilters}
                  onClose={() => setShowFilters(false)}
                />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Results info */}
        <div className="px-4 py-3 bg-white border-b border-neutral-100">
          <p className="text-sm text-neutral-500">
            {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>

        {/* Documents */}
        <div className="flex-1 overflow-auto p-4">
          {filteredDocuments.length === 0 ? (
            <EmptyState searchQuery={searchQuery} />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDocuments.map((doc, index) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  index={index}
                  onToggleStar={handleToggleStar}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              {/* List header */}
              <div className="flex items-center gap-4 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                <div className="w-10" />
                <div className="flex-1">Name</div>
                <div className="w-24">Status</div>
                <div className="hidden sm:block w-24 text-right">Modified</div>
                <div className="hidden md:block w-20 text-right">Size</div>
                <div className="w-8" />
                <div className="w-8" />
              </div>
              {filteredDocuments.map((doc, index) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  index={index}
                  onToggleStar={handleToggleStar}
                />
              ))}
            </div>
          )}
        </div>

        {/* AI Insight Bar */}
        <motion.div
          className="bg-gradient-to-r from-primary-50 to-accent-50 border-t border-primary-200 p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100">
                <Sparkles className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-900">3 documents need attention</p>
                <p className="text-xs text-primary-600">
                  IB review pending • CMC section incomplete • Protocol update available
                </p>
              </div>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
              <Eye className="w-4 h-4" />
              Review
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default EvidenceLibraryV3;
