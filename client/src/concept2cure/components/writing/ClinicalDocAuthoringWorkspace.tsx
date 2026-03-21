/**
 * @fileoverview Clinical Document Authoring Workspace
 * @module concept2cure/components/writing/ClinicalDocAuthoringWorkspace
 * @version 1.0.0
 *
 * @description
 * Workspace designed around how MEDICAL WRITERS actually work on regulatory documents.
 * 
 * MEDICAL WRITING REALITY:
 * - Documents have strict templates (ICH, CDISC, company SOPs)
 * - Multiple rounds of review (internal → cross-functional → final)
 * - Heavy use of source documents (protocols, CSRs, data tables)
 * - Annotations and comments from SMEs are critical
 * - Version control is mandatory (21 CFR Part 11)
 * - Style guides must be followed
 * - Cross-referencing between documents
 *
 * KEY USE CASES:
 * 1. "Start writing the efficacy summary for NDA Module 2.5"
 * 2. "Show me source data for Table 14.2.1"
 * 3. "Track comments from the clinical team"
 * 4. "Generate comparison of safety narratives"
 * 5. "Check consistency with the IB"
 *
 * DOCUMENT TYPES:
 * - CTD Module 2 (summaries)
 * - CSR sections
 * - IB updates
 * - Protocols
 * - Regulatory responses
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  BookOpen,
  Edit3,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Bookmark,
  Link2,
  History,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Filter,
  Eye,
  Lock,
  Unlock,
  ArrowRight,
  Target,
  Database,
  Table,
  FileCheck,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Medical Writing Workflow
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentType = 
  | 'ctd_2_3'        // Quality Overall Summary
  | 'ctd_2_4'        // Nonclinical Overview
  | 'ctd_2_5'        // Clinical Overview
  | 'ctd_2_6'        // Nonclinical Written & Tabulated Summaries
  | 'ctd_2_7'        // Clinical Summary
  | 'csr'            // Clinical Study Report
  | 'ib'             // Investigator's Brochure
  | 'protocol'
  | 'protocol_amendment'
  | 'informed_consent'
  | 'regulatory_response'
  | 'briefing_document'
  | 'dsur'
  | 'psur';

export type AuthoringStatus = 
  | 'not_started'
  | 'outline'
  | 'first_draft'
  | 'internal_review'
  | 'cross_functional_review'
  | 'revision'
  | 'final_qc'
  | 'approved'
  | 'locked';

export type ReviewCommentStatus = 'open' | 'resolved' | 'deferred' | 'not_applicable';

export interface SourceDocument {
  id: string;
  title: string;
  type: 'data_table' | 'figure' | 'appendix' | 'reference' | 'protocol' | 'csr' | 'other';
  path: string;
  linkedSection?: string;
  studyId?: string;
  version: string;
}

export interface ReviewComment {
  id: string;
  sectionId: string;
  author: string;
  authorRole: string;
  commentText: string;
  suggestedChange?: string;
  status: ReviewCommentStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  threadId?: string;  // For comment replies
  priority: 'critical' | 'major' | 'minor' | 'editorial';
}

export interface DocumentSection {
  id: string;
  number: string;       // "2.5.1" or "11.4.2"
  title: string;
  level: number;        // 1, 2, 3, etc.
  parentId?: string;
  status: 'not_started' | 'draft' | 'review' | 'complete';
  wordCount: number;
  targetWordCount?: number;
  assignedTo?: string;
  dueDate?: string;
  children?: DocumentSection[];
  sourceDocuments: SourceDocument[];
  comments: ReviewComment[];
}

export interface DocumentVersion {
  version: string;
  createdAt: string;
  createdBy: string;
  changelog: string;
  status: 'draft' | 'for_review' | 'approved' | 'archived';
}

export interface RegulatoryDocument {
  id: string;
  productId: string;
  productName: string;
  type: DocumentType;
  title: string;
  status: AuthoringStatus;
  
  // Metadata
  templateVersion: string;
  styleGuide: string;
  targetSubmission?: string;
  dueDate?: string;
  
  // Structure
  sections: DocumentSection[];
  
  // History
  versions: DocumentVersion[];
  currentVersion: string;
  
  // Team
  leadWriter: string;
  contributors: string[];
  reviewers: string[];
  approvers: string[];
  
  // Lock status
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  
  // Progress
  totalSections: number;
  completedSections: number;
  totalComments: number;
  openComments: number;
}

interface ClinicalDocAuthoringWorkspaceProps {
  documents: RegulatoryDocument[];
  activeDocumentId?: string;
  onDocumentSelect?: (document: RegulatoryDocument) => void;
  onSectionSelect?: (section: DocumentSection, document: RegulatoryDocument) => void;
  onCommentResolve?: (comment: ReviewComment) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DOC_TYPE_CONFIG: Record<DocumentType, { label: string; shortLabel: string; color: string }> = {
  ctd_2_3: { label: 'Quality Overall Summary', shortLabel: 'CTD 2.3', color: 'bg-green-100 text-green-700' },
  ctd_2_4: { label: 'Nonclinical Overview', shortLabel: 'CTD 2.4', color: 'bg-emerald-100 text-emerald-700' },
  ctd_2_5: { label: 'Clinical Overview', shortLabel: 'CTD 2.5', color: 'bg-blue-100 text-blue-700' },
  ctd_2_6: { label: 'Nonclinical Summaries', shortLabel: 'CTD 2.6', color: 'bg-teal-100 text-teal-700' },
  ctd_2_7: { label: 'Clinical Summary', shortLabel: 'CTD 2.7', color: 'bg-cyan-100 text-cyan-700' },
  csr: { label: 'Clinical Study Report', shortLabel: 'CSR', color: 'bg-violet-100 text-violet-700' },
  ib: { label: "Investigator's Brochure", shortLabel: 'IB', color: 'bg-purple-100 text-purple-700' },
  protocol: { label: 'Protocol', shortLabel: 'Protocol', color: 'bg-amber-100 text-amber-700' },
  protocol_amendment: { label: 'Protocol Amendment', shortLabel: 'Amendment', color: 'bg-orange-100 text-orange-700' },
  informed_consent: { label: 'Informed Consent', shortLabel: 'ICF', color: 'bg-pink-100 text-pink-700' },
  regulatory_response: { label: 'Regulatory Response', shortLabel: 'Response', color: 'bg-red-100 text-red-700' },
  briefing_document: { label: 'Briefing Document', shortLabel: 'Briefing', color: 'bg-rose-100 text-rose-700' },
  dsur: { label: 'DSUR', shortLabel: 'DSUR', color: 'bg-indigo-100 text-indigo-700' },
  psur: { label: 'PSUR', shortLabel: 'PSUR', color: 'bg-fuchsia-100 text-fuchsia-700' },
};

const STATUS_CONFIG: Record<AuthoringStatus, { label: string; color: string; bgColor: string; step: number }> = {
  not_started: { label: 'Not Started', color: 'text-zinc-500', bgColor: 'bg-zinc-100', step: 0 },
  outline: { label: 'Outline', color: 'text-blue-600', bgColor: 'bg-blue-100', step: 1 },
  first_draft: { label: 'First Draft', color: 'text-amber-600', bgColor: 'bg-amber-100', step: 2 },
  internal_review: { label: 'Internal Review', color: 'text-violet-600', bgColor: 'bg-violet-100', step: 3 },
  cross_functional_review: { label: 'Cross-Functional Review', color: 'text-purple-600', bgColor: 'bg-purple-100', step: 4 },
  revision: { label: 'Revision', color: 'text-orange-600', bgColor: 'bg-orange-100', step: 5 },
  final_qc: { label: 'Final QC', color: 'text-cyan-600', bgColor: 'bg-cyan-100', step: 6 },
  approved: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', step: 7 },
  locked: { label: 'Locked', color: 'text-zinc-600', bgColor: 'bg-zinc-200', step: 8 },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
  major: { label: 'Major', color: 'bg-amber-100 text-amber-700' },
  minor: { label: 'Minor', color: 'bg-blue-100 text-blue-700' },
  editorial: { label: 'Editorial', color: 'bg-zinc-100 text-zinc-600' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT OUTLINE TREE
// ═══════════════════════════════════════════════════════════════════════════════

const SectionTreeItem: React.FC<{
  section: DocumentSection;
  level: number;
  onSelect?: (section: DocumentSection) => void;
}> = ({ section, level, onSelect }) => {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = section.children && section.children.length > 0;
  
  const statusColors = {
    not_started: 'bg-zinc-200',
    draft: 'bg-blue-400',
    review: 'bg-amber-400',
    complete: 'bg-green-400',
  };
  
  return (
    <div>
      <button
        onClick={() => hasChildren ? setExpanded(!expanded) : onSelect?.(section)}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-zinc-100 rounded transition-colors',
          level === 0 && 'font-medium'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}
        
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', statusColors[section.status])} />
        
        <span className="text-xs text-zinc-400 font-mono flex-shrink-0">{section.number}</span>
        
        <span className={cn(
          'text-sm truncate flex-1',
          section.status === 'complete' ? 'text-zinc-500' : 'text-zinc-900'
        )}>
          {section.title}
        </span>
        
        {section.comments.filter(c => c.status === 'open').length > 0 && (
          <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
            {section.comments.filter(c => c.status === 'open').length}
          </span>
        )}
      </button>
      
      {expanded && hasChildren && (
        <div>
          {section.children!.map(child => (
            <SectionTreeItem
              key={child.id}
              section={child}
              level={level + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DocumentOutlineTree: React.FC<{
  document: RegulatoryDocument;
  onSectionSelect?: (section: DocumentSection) => void;
}> = ({ document, onSectionSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden h-full flex flex-col">
      <div className="p-3 border-b border-zinc-200">
        <h3 className="text-sm font-semibold text-zinc-900 mb-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-600" />
          Document Structure
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search sections..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {document.sections.map(section => (
          <SectionTreeItem
            key={section.id}
            section={section}
            level={0}
            onSelect={onSectionSelect}
          />
        ))}
      </div>
      
      {/* Legend */}
      <div className="p-3 border-t border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-200" />
            <span className="text-zinc-500">Not Started</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-zinc-500">Draft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-zinc-500">Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-zinc-500">Complete</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW COMMENTS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const ReviewCommentsPanel: React.FC<{
  document: RegulatoryDocument;
  onCommentResolve?: (comment: ReviewComment) => void;
}> = ({ document, onCommentResolve }) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  
  // Flatten all comments
  const allComments = useMemo(() => {
    const flattenSections = (sections: DocumentSection[]): ReviewComment[] => {
      return sections.flatMap(s => [
        ...s.comments.map(c => ({ ...c, sectionNumber: s.number, sectionTitle: s.title })),
        ...(s.children ? flattenSections(s.children) : []),
      ]);
    };
    return flattenSections(document.sections);
  }, [document.sections]);
  
  const filtered = allComments.filter(c => {
    if (filter === 'open') return c.status === 'open';
    if (filter === 'resolved') return c.status === 'resolved';
    return true;
  });
  
  const byPriority = {
    critical: filtered.filter(c => c.priority === 'critical'),
    major: filtered.filter(c => c.priority === 'major'),
    minor: filtered.filter(c => c.priority === 'minor'),
    editorial: filtered.filter(c => c.priority === 'editorial'),
  };
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="p-3 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-600" />
            Review Comments
          </h3>
          <span className="text-xs text-zinc-500">
            {allComments.filter(c => c.status === 'open').length} open
          </span>
        </div>
        
        <div className="flex gap-1">
          {(['open', 'resolved', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded transition-colors capitalize',
                filter === f ? 'bg-blue-100 text-blue-700' : 'text-zinc-500 hover:bg-zinc-100'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto">
        {Object.entries(byPriority).map(([priority, comments]) => {
          if (comments.length === 0) return null;
          const config = PRIORITY_CONFIG[priority];
          
          return (
            <div key={priority} className="border-b border-zinc-200 last:border-0">
              <div className="px-3 py-2 bg-zinc-50 flex items-center gap-2">
                <span className={cn('px-2 py-0.5 text-xs font-medium rounded', config.color)}>
                  {config.label}
                </span>
                <span className="text-xs text-zinc-500">({comments.length})</span>
              </div>
              
              {comments.slice(0, 5).map((comment: any) => (
                <div key={comment.id} className="p-3 border-t border-zinc-200 hover:bg-zinc-50">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-blue-600">{comment.sectionNumber}</span>
                      <span className="text-xs text-zinc-400">•</span>
                      <span className="text-xs text-zinc-500">{comment.author}</span>
                    </div>
                    {comment.status === 'open' && (
                      <button
                        onClick={() => onCommentResolve?.(comment)}
                        className="p-1 text-zinc-400 hover:text-green-600 transition-colors duration-150"
                        title="Resolve"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <p className="text-sm text-zinc-700">{comment.commentText}</p>
                  
                  {comment.suggestedChange && (
                    <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700">
                      <span className="font-medium">Suggested: </span>
                      {comment.suggestedChange}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-zinc-500 text-center italic">No comments</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE DOCUMENTS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const SourceDocumentsPanel: React.FC<{
  document: RegulatoryDocument;
}> = ({ document }) => {
  // Collect all source documents
  const allSources = useMemo(() => {
    const flattenSources = (sections: DocumentSection[]): SourceDocument[] => {
      return sections.flatMap(s => [
        ...s.sourceDocuments,
        ...(s.children ? flattenSources(s.children) : []),
      ]);
    };
    
    const sources = flattenSources(document.sections);
    // Dedupe by ID
    const unique = new Map<string, SourceDocument>();
    sources.forEach(s => unique.set(s.id, s));
    return Array.from(unique.values());
  }, [document.sections]);
  
  const byType = useMemo(() => {
    const groups: Record<string, SourceDocument[]> = {};
    allSources.forEach(s => {
      if (!groups[s.type]) groups[s.type] = [];
      groups[s.type].push(s);
    });
    return groups;
  }, [allSources]);
  
  const typeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    data_table: { label: 'Data Tables', icon: <Table className="w-4 h-4" /> },
    figure: { label: 'Figures', icon: <Target className="w-4 h-4" /> },
    appendix: { label: 'Appendices', icon: <FileText className="w-4 h-4" /> },
    reference: { label: 'References', icon: <BookOpen className="w-4 h-4" /> },
    protocol: { label: 'Protocols', icon: <FileCheck className="w-4 h-4" /> },
    csr: { label: 'Study Reports', icon: <Database className="w-4 h-4" /> },
    other: { label: 'Other', icon: <FileText className="w-4 h-4" /> },
  };
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="p-3 border-b border-zinc-200">
        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-violet-600" />
          Source Documents
        </h3>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto">
        {Object.entries(byType).map(([type, sources]) => {
          const config = typeLabels[type] || typeLabels.other;
          
          return (
            <div key={type} className="border-b border-zinc-200 last:border-0">
              <div className="px-3 py-2 bg-zinc-50 flex items-center gap-2 text-zinc-600">
                {config.icon}
                <span className="text-xs font-medium">{config.label}</span>
                <span className="text-xs text-zinc-400">({sources.length})</span>
              </div>
              
              {sources.slice(0, 5).map(source => (
                <button
                  key={source.id}
                  className="w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors border-t border-zinc-200"
                >
                  <p className="text-sm text-zinc-900 truncate">{source.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-400">v{source.version}</span>
                    {source.studyId && (
                      <span className="text-xs text-blue-600">{source.studyId}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
        
        {allSources.length === 0 && (
          <p className="p-4 text-sm text-zinc-500 text-center italic">No source documents linked</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT LIST
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentList: React.FC<{
  documents: RegulatoryDocument[];
  activeDocumentId?: string;
  onDocumentSelect?: (document: RegulatoryDocument) => void;
}> = ({ documents, activeDocumentId, onDocumentSelect }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'review'>('active');
  
  const filtered = useMemo(() => {
    return documents.filter(d => {
      if (filter === 'active') return d.status !== 'locked' && d.status !== 'approved';
      if (filter === 'review') return d.status.includes('review');
      return true;
    }).sort((a, b) => {
      const statusA = STATUS_CONFIG[a.status].step;
      const statusB = STATUS_CONFIG[b.status].step;
      return statusB - statusA;
    });
  }, [documents, filter]);
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="p-3 border-b border-zinc-200">
        <h3 className="text-sm font-semibold text-zinc-900 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Documents
        </h3>
        
        <div className="flex gap-1">
          {(['active', 'review', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded transition-colors capitalize',
                filter === f ? 'bg-blue-100 text-blue-700' : 'text-zinc-500 hover:bg-zinc-100'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto">
        {filtered.map(doc => {
          const typeConfig = DOC_TYPE_CONFIG[doc.type];
          const statusConfig = STATUS_CONFIG[doc.status];
          const isActive = doc.id === activeDocumentId;
          const progress = doc.totalSections > 0 ? Math.round((doc.completedSections / doc.totalSections) * 100) : 0;
          
          return (
            <button
              key={doc.id}
              onClick={() => onDocumentSelect?.(doc)}
              className={cn(
                'w-full p-3 text-left border-b border-zinc-200 transition-colors',
                isActive ? 'bg-blue-50' : 'hover:bg-zinc-50'
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <span className={cn('px-2 py-0.5 text-xs font-medium rounded', typeConfig.color)}>
                  {typeConfig.shortLabel}
                </span>
                <div className="flex items-center gap-1">
                  {doc.isLocked && <Lock className="w-3 h-3 text-zinc-400" />}
                  <span className={cn('px-2 py-0.5 text-xs font-medium rounded', statusConfig.bgColor, statusConfig.color)}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>
              
              <p className="text-sm font-medium text-zinc-900 truncate">{doc.title}</p>
              <p className="text-xs text-zinc-500">{doc.productName}</p>
              
              {/* Progress */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>{doc.completedSections}/{doc.totalSections} sections</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {/* Open Comments */}
              {doc.openComments > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <MessageSquare className="w-3 h-3" />
                  {doc.openComments} open comments
                </div>
              )}
            </button>
          );
        })}
        
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-zinc-500 text-center italic">No documents</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT HEADER
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentHeader: React.FC<{
  document: RegulatoryDocument;
}> = ({ document }) => {
  const typeConfig = DOC_TYPE_CONFIG[document.type];
  const statusConfig = STATUS_CONFIG[document.status];
  const progress = document.totalSections > 0 ? Math.round((document.completedSections / document.totalSections) * 100) : 0;
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('px-2 py-1 text-sm font-medium rounded', typeConfig.color)}>
              {typeConfig.shortLabel}
            </span>
            <span className={cn('px-2 py-1 text-sm font-medium rounded', statusConfig.bgColor, statusConfig.color)}>
              {statusConfig.label}
            </span>
            {document.isLocked && (
              <span className="px-2 py-1 text-xs font-medium bg-zinc-200 text-zinc-600 rounded flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Locked by {document.lockedBy}
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-zinc-900">{document.title}</h2>
          <p className="text-sm text-zinc-500">{document.productName} • v{document.currentVersion}</p>
        </div>
        
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 flex items-center gap-2">
            <History className="w-4 h-4" />
            History
          </button>
          <button className="px-4 py-2 text-sm font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>
      
      {/* Metadata */}
      <div className="grid grid-cols-5 gap-4 pt-4 border-t border-zinc-200">
        <div>
          <p className="text-xs text-zinc-500">Lead Writer</p>
          <p className="text-sm font-medium text-zinc-900">{document.leadWriter}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Template</p>
          <p className="text-sm font-medium text-zinc-900">{document.templateVersion}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Due Date</p>
          <p className="text-sm font-medium text-zinc-900">
            {document.dueDate ? formatDate(document.dueDate) : 'TBD'}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Progress</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm font-medium text-zinc-900">{progress}%</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Open Comments</p>
          <p className={cn('text-sm font-medium', document.openComments > 0 ? 'text-amber-600' : 'text-zinc-900')}>
            {document.openComments}
          </p>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ClinicalDocAuthoringWorkspace: React.FC<ClinicalDocAuthoringWorkspaceProps> = ({
  documents,
  activeDocumentId,
  onDocumentSelect,
  onSectionSelect,
  onCommentResolve,
  className,
}) => {
  const activeDocument = documents.find(d => d.id === activeDocumentId);
  
  // Metrics
  const metrics = useMemo(() => {
    const inDraft = documents.filter(d => d.status === 'first_draft' || d.status === 'outline');
    const inReview = documents.filter(d => d.status.includes('review'));
    const totalComments = documents.reduce((sum, d) => sum + d.openComments, 0);
    const avgProgress = documents.length > 0
      ? Math.round(documents.reduce((sum, d) => sum + (d.completedSections / d.totalSections) * 100, 0) / documents.length)
      : 0;
    
    return {
      totalDocuments: documents.length,
      inDraft: inDraft.length,
      inReview: inReview.length,
      openComments: totalComments,
      avgProgress,
    };
  }, [documents]);
  
  return (
    <div className={cn('flex flex-col h-full bg-zinc-50', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Clinical Document Authoring</h1>
            <p className="text-sm text-zinc-500">Regulatory document workspace</p>
          </div>
          
          <button className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-3 bg-zinc-100 rounded-lg">
            <p className="text-xs text-zinc-500">Documents</p>
            <p className="text-xl font-semibold text-zinc-900">{metrics.totalDocuments}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600">In Draft</p>
            <p className="text-xl font-semibold text-blue-700">{metrics.inDraft}</p>
          </div>
          <div className="p-3 bg-violet-50 rounded-lg">
            <p className="text-xs text-violet-600">In Review</p>
            <p className="text-xl font-semibold text-violet-700">{metrics.inReview}</p>
          </div>
          <div className={cn('p-3 rounded-lg', metrics.openComments > 0 ? 'bg-amber-50' : 'bg-zinc-100')}>
            <p className={cn('text-xs', metrics.openComments > 0 ? 'text-amber-600' : 'text-zinc-500')}>Open Comments</p>
            <p className={cn('text-xl font-semibold', metrics.openComments > 0 ? 'text-amber-700' : 'text-zinc-900')}>
              {metrics.openComments}
            </p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-green-600">Avg Progress</p>
            <p className="text-xl font-semibold text-green-700">{metrics.avgProgress}%</p>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-4 gap-6 h-full">
          {/* Document List */}
          <div className="col-span-1">
            <DocumentList
              documents={documents}
              activeDocumentId={activeDocumentId}
              onDocumentSelect={onDocumentSelect}
            />
          </div>
          
          {/* Document Workspace */}
          <div className="col-span-3">
            {activeDocument ? (
              <div className="space-y-6">
                <DocumentHeader document={activeDocument} />
                
                <div className="grid grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <DocumentOutlineTree
                      document={activeDocument}
                      onSectionSelect={section => onSectionSelect?.(section, activeDocument)}
                    />
                  </div>
                  <div className="space-y-6">
                    <ReviewCommentsPanel
                      document={activeDocument}
                      onCommentResolve={onCommentResolve}
                    />
                    <SourceDocumentsPanel document={activeDocument} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-white rounded-xl border border-zinc-200">
                <div className="text-center">
                  <FileText className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">Select a document to begin authoring</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicalDocAuthoringWorkspace;
