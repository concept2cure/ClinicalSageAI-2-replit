/**
 * Traceability Linking UI
 * 
 * Phase 5: Intelligent Document System
 * Provides UI for linking document claims to source materials with
 * cryptographic hash verification and citation management.
 * 
 * Features:
 * - Source document browser with search
 * - Hash-verified citation linking
 * - Source preview with excerpt
 * - Link integrity validation
 * - Citation formatting
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Link,
  Search,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Hash,
  Calendar,
  User,
  ChevronRight,
  ChevronDown,
  Eye,
  Copy,
  Trash2,
  RefreshCw,
  Filter,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceDocument {
  id: string;
  title: string;
  hash: string;
  version: string;
  documentType: 'clinical_study' | 'regulatory_guidance' | 'literature' | 'internal_sop' | 'device_spec' | 'test_report' | 'other';
  excerpt?: string;
  fullContent?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  tags?: string[];
  citationCount?: number;
}

export interface TraceabilityLink {
  id: string;
  sourceDocumentId: string;
  sourceHash: string;
  sourceVersion: string;
  targetDocumentId: string;
  targetRange: { from: number; to: number };
  linkedText: string;
  citationType: 'direct_quote' | 'paraphrase' | 'reference' | 'data_source';
  confidence: number; // 0-100
  createdAt: string;
  createdBy: string;
  verifiedAt?: string;
  verificationStatus: 'valid' | 'outdated' | 'broken' | 'pending';
}

export interface TraceabilityLinkingProps {
  targetDocumentId: string;
  availableSources: SourceDocument[];
  existingLinks: TraceabilityLink[];
  selectedText?: string;
  selectedRange?: { from: number; to: number };
  onCreateLink: (link: Omit<TraceabilityLink, 'id' | 'createdAt'>) => Promise<void>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onVerifyLink: (linkId: string) => Promise<boolean>;
  onSourceClick?: (source: SourceDocument) => void;
  onLinkClick?: (link: TraceabilityLink) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Type Badge
// ─────────────────────────────────────────────────────────────────────────────

const DocumentTypeBadge: React.FC<{ type: SourceDocument['documentType'] }> = ({ type }) => {
  const config = {
    clinical_study: { label: 'Clinical Study', color: 'bg-purple-100 text-purple-700' },
    regulatory_guidance: { label: 'Guidance', color: 'bg-blue-100 text-blue-700' },
    literature: { label: 'Literature', color: 'bg-green-100 text-green-700' },
    internal_sop: { label: 'SOP', color: 'bg-orange-100 text-orange-700' },
    device_spec: { label: 'Device Spec', color: 'bg-cyan-100 text-cyan-700' },
    test_report: { label: 'Test Report', color: 'bg-yellow-100 text-yellow-700' },
    other: { label: 'Other', color: 'bg-zinc-100 text-zinc-700' },
  };

  const { label, color } = config[type] || config.other;

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${color}`}>
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Verification Status Badge
// ─────────────────────────────────────────────────────────────────────────────

const VerificationBadge: React.FC<{ status: TraceabilityLink['verificationStatus'] }> = ({ status }) => {
  const config = {
    valid: { icon: CheckCircle, label: 'Valid', color: 'text-green-500' },
    outdated: { icon: RefreshCw, label: 'Outdated', color: 'text-yellow-500' },
    broken: { icon: AlertTriangle, label: 'Broken', color: 'text-red-500' },
    pending: { icon: RefreshCw, label: 'Pending', color: 'text-zinc-400 animate-spin' },
  };

  const { icon: Icon, label, color } = config[status];

  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Source Document Card
// ─────────────────────────────────────────────────────────────────────────────

interface SourceDocumentCardProps {
  source: SourceDocument;
  isSelected?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
}

const SourceDocumentCard: React.FC<SourceDocumentCardProps> = ({
  source,
  isSelected,
  onSelect,
  onPreview,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start gap-3">
          <FileText className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isSelected ? 'text-blue-500' : 'text-zinc-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-zinc-800 line-clamp-1">
                {source.title}
              </h4>
              {isSelected && <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <DocumentTypeBadge type={source.documentType} />
              <span className="text-xs text-zinc-500">v{source.version}</span>
              {source.citationCount !== undefined && (
                <span className="text-xs text-zinc-400">{source.citationCount} citations</span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Hash & Details Toggle */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-zinc-500">
              <Hash className="w-3 h-3" />
              <code className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono">
                {source.hash.slice(0, 16)}...
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(source.hash)}
                className="p-0.5 hover:bg-zinc-200 rounded"
                title="Copy hash"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            {source.author && (
              <div className="flex items-center gap-2 text-zinc-500">
                <User className="w-3 h-3" />
                <span>{source.author}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-zinc-500">
              <Calendar className="w-3 h-3" />
              <span>Updated {new Date(source.updatedAt).toLocaleDateString()}</span>
            </div>
            {source.excerpt && (
              <p className="text-zinc-600 mt-2 line-clamp-3 italic">
                "{source.excerpt}"
              </p>
            )}
            {onPreview && (
              <button
                onClick={onPreview}
                className="flex items-center gap-1 mt-2 text-blue-600 hover:text-blue-700"
              >
                <Eye className="w-3 h-3" />
                Preview full document
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Link Card
// ─────────────────────────────────────────────────────────────────────────────

interface LinkCardProps {
  link: TraceabilityLink;
  source?: SourceDocument;
  onVerify: () => void;
  onRemove: () => void;
  onClick?: () => void;
}

const LinkCard: React.FC<LinkCardProps> = ({ link, source, onVerify, onRemove, onClick }) => {
  const citationTypeLabels = {
    direct_quote: 'Direct Quote',
    paraphrase: 'Paraphrase',
    reference: 'Reference',
    data_source: 'Data Source',
  };

  return (
    <div className="p-3 bg-white border border-zinc-200 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onClick}
          className="flex-1 text-left hover:text-blue-600 transition-colors"
        >
          <p className="text-sm text-zinc-700 line-clamp-2">
            "{link.linkedText}"
          </p>
        </button>
        <VerificationBadge status={link.verificationStatus} />
      </div>

      {source && (
        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <FileText className="w-3 h-3" />
          <span className="truncate">{source.title}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 bg-zinc-100 rounded">
            {citationTypeLabels[link.citationType]}
          </span>
          <span className="text-xs text-zinc-400">
            {link.confidence}% confidence
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onVerify}
            className="p-1 text-zinc-400 hover:text-blue-500 rounded"
            title="Verify link"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-zinc-400 hover:text-red-500 rounded"
            title="Remove link"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Citation Type Selector
// ─────────────────────────────────────────────────────────────────────────────

interface CitationTypeSelectorProps {
  value: TraceabilityLink['citationType'];
  onChange: (type: TraceabilityLink['citationType']) => void;
}

const CitationTypeSelector: React.FC<CitationTypeSelectorProps> = ({ value, onChange }) => {
  const options: Array<{ value: TraceabilityLink['citationType']; label: string; description: string }> = [
    { value: 'direct_quote', label: 'Direct Quote', description: 'Exact text from source' },
    { value: 'paraphrase', label: 'Paraphrase', description: 'Restated in own words' },
    { value: 'reference', label: 'Reference', description: 'General reference to source' },
    { value: 'data_source', label: 'Data Source', description: 'Source of data/statistics' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`p-2 text-left rounded-lg border transition-colors ${
            value === option.value
              ? 'border-blue-500 bg-blue-50'
              : 'border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <p className="text-sm font-medium text-zinc-800">{option.label}</p>
          <p className="text-xs text-zinc-500">{option.description}</p>
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Traceability Linking Component
// ─────────────────────────────────────────────────────────────────────────────

export const TraceabilityLinking: React.FC<TraceabilityLinkingProps> = ({
  targetDocumentId,
  availableSources,
  existingLinks,
  selectedText = '',
  selectedRange,
  onCreateLink,
  onRemoveLink,
  onVerifyLink,
  onSourceClick,
  onLinkClick,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<SourceDocument | null>(null);
  const [citationType, setCitationType] = useState<TraceabilityLink['citationType']>('reference');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<SourceDocument['documentType'] | 'all'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'links'>('sources');

  // Filter sources
  const filteredSources = useMemo(() => {
    let filtered = availableSources;

    if (documentTypeFilter !== 'all') {
      filtered = filtered.filter(s => s.documentType === documentTypeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.title.toLowerCase().includes(query) ||
          s.excerpt?.toLowerCase().includes(query) ||
          s.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [availableSources, searchQuery, documentTypeFilter]);

  // Get source for each link
  const getSourceById = useCallback(
    (sourceId: string) => availableSources.find(s => s.id === sourceId),
    [availableSources]
  );

  // Create link handler
  const handleCreateLink = useCallback(async () => {
    if (!selectedSource || !selectedRange || !selectedText.trim()) return;

    setIsCreating(true);
    try {
      await onCreateLink({
        sourceDocumentId: selectedSource.id,
        sourceHash: selectedSource.hash,
        sourceVersion: selectedSource.version,
        targetDocumentId,
        targetRange: selectedRange,
        linkedText: selectedText,
        citationType,
        confidence: 100,
        createdBy: 'current-user', // Should come from auth context
        verificationStatus: 'valid',
      });
      setSelectedSource(null);
    } catch (error) {
      console.error('Failed to create link:', error);
    } finally {
      setIsCreating(false);
    }
  }, [selectedSource, selectedRange, selectedText, targetDocumentId, citationType, onCreateLink]);

  return (
    <div className={`flex flex-col h-full bg-zinc-50 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Link className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-zinc-800">Traceability Linking</h2>
        </div>

        {/* Selected Text Preview */}
        {selectedText && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-600 mb-1">Selected text to link:</p>
            <p className="text-sm text-zinc-700 line-clamp-2">"{selectedText}"</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'sources'
                ? 'bg-white text-zinc-800 shadow'
                : 'text-zinc-600 hover:text-zinc-800'
            }`}
          >
            Sources ({availableSources.length})
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'links'
                ? 'bg-white text-zinc-800 shadow'
                : 'text-zinc-600 hover:text-zinc-800'
            }`}
          >
            Links ({existingLinks.length})
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'sources' ? (
        <>
          {/* Search & Filter */}
          <div className="p-3 border-b border-zinc-200 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search sources..."
                className="w-full pl-9 pr-3 py-2 bg-zinc-100 border-0 rounded-lg text-sm"
              />
            </div>
            <select
              value={documentTypeFilter}
              onChange={e => setDocumentTypeFilter(e.target.value as typeof documentTypeFilter)}
              className="w-full p-2 bg-zinc-100 border-0 rounded-lg text-sm"
            >
              <option value="all">All document types</option>
              <option value="clinical_study">Clinical Studies</option>
              <option value="regulatory_guidance">Regulatory Guidance</option>
              <option value="literature">Literature</option>
              <option value="internal_sop">Internal SOPs</option>
              <option value="device_spec">Device Specifications</option>
              <option value="test_report">Test Reports</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Sources List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredSources.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No sources found</p>
              </div>
            ) : (
              filteredSources.map(source => (
                <SourceDocumentCard
                  key={source.id}
                  source={source}
                  isSelected={selectedSource?.id === source.id}
                  onSelect={() => setSelectedSource(source)}
                  onPreview={() => onSourceClick?.(source)}
                />
              ))
            )}
          </div>

          {/* Link Creation Panel */}
          {selectedSource && selectedText && (
            <div className="p-4 border-t border-zinc-200 bg-white space-y-3">
              <h3 className="text-sm font-medium text-zinc-700">Citation Type</h3>
              <CitationTypeSelector value={citationType} onChange={setCitationType} />
              <button
                onClick={handleCreateLink}
                disabled={isCreating || !selectedRange}
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Link className="w-4 h-4" />
                {isCreating ? 'Creating Link...' : 'Create Traceability Link'}
              </button>
            </div>
          )}
        </>
      ) : (
        /* Links Tab */
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {existingLinks.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Link className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No traceability links yet</p>
              <p className="text-xs mt-1">Select text and link to a source</p>
            </div>
          ) : (
            existingLinks.map(link => (
              <LinkCard
                key={link.id}
                link={link}
                source={getSourceById(link.sourceDocumentId)}
                onVerify={() => onVerifyLink(link.id)}
                onRemove={() => onRemoveLink(link.id)}
                onClick={() => onLinkClick?.(link)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default TraceabilityLinking;
