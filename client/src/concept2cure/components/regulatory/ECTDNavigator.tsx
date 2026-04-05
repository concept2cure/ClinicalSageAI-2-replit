/**
 * Concept2Cure - eCTD Navigator
 *
 * Visual navigation and management of eCTD (electronic Common Technical Document) structure
 * supporting ICH M4 format for drug submissions and technical files for devices.
 *
 * Features:
 * - Module 1-5 hierarchical visualization
 * - Document status tracking
 * - Submission sequence management
 * - Lifecycle management (initial, amendment, supplement)
 * - Regional variations support
 *
 * @module components/regulatory/eCTDNavigator
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Upload,
  Download,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Settings,
  Eye,
  Sparkles,
  Globe,
  Package,
  GitBranch,
  History,
  BarChart3,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type DocumentStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'pending'
  | 'not_applicable'
  | 'not_started';
type SubmissionType = 'initial' | 'amendment' | 'supplement' | 'variation' | 'annual_report';
type DocumentOperation = 'new' | 'replace' | 'append' | 'delete';

interface eCTDDocument {
  id: string;
  title: string;
  section: string;
  fileName?: string;
  status: DocumentStatus;
  version: string;
  lastModified: string;
  assignee?: string;
  comments?: number;
  operation?: DocumentOperation;
}

interface eCTDSection {
  id: string;
  title: string;
  description?: string;
  children?: eCTDSection[];
  documents?: eCTDDocument[];
  required: boolean;
  applicableTo?: string[];
}

interface SubmissionSequence {
  id: string;
  sequenceNumber: string;
  type: SubmissionType;
  description: string;
  status: 'draft' | 'ready' | 'submitted' | 'acknowledged';
  createdDate: string;
  submittedDate?: string;
  documents: number;
  healthAuthority: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// eCTD STRUCTURE DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

const ECTD_STRUCTURE: eCTDSection[] = [
  {
    id: 'm1',
    title: 'Module 1 - Administrative Information and Prescribing Information',
    required: true,
    applicableTo: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'TGA'],
    children: [
      {
        id: 'm1.1',
        title: '1.1 Forms',
        required: true,
        documents: [
          {
            id: 'd1',
            title: 'Application Form',
            section: '1.1',
            status: 'approved',
            version: '1.0',
            lastModified: '2025-01-15',
          },
        ],
      },
      {
        id: 'm1.2',
        title: '1.2 Cover Letter',
        required: true,
        documents: [
          {
            id: 'd2',
            title: 'Cover Letter',
            section: '1.2',
            status: 'in_review',
            version: '1.0',
            lastModified: '2025-01-18',
            assignee: 'John Smith',
          },
        ],
      },
      {
        id: 'm1.3',
        title: '1.3 Administrative Information',
        required: true,
        children: [
          { id: 'm1.3.1', title: '1.3.1 Contact/Sponsor Information', required: true },
          { id: 'm1.3.2', title: '1.3.2 Field Copy Certification', required: false },
          { id: 'm1.3.3', title: '1.3.3 Debarment Certification', required: true },
          { id: 'm1.3.4', title: '1.3.4 Financial Certification', required: true },
          { id: 'm1.3.5', title: '1.3.5 Patent Certification', required: false },
        ],
      },
      {
        id: 'm1.4',
        title: '1.4 References',
        required: false,
      },
      {
        id: 'm1.5',
        title: '1.5 Application-Specific Information',
        required: false,
      },
      {
        id: 'm1.14',
        title: '1.14 Labeling',
        required: true,
        children: [
          {
            id: 'm1.14.1',
            title: '1.14.1 Prescribing Information',
            required: true,
            documents: [
              {
                id: 'd3',
                title: 'USPI',
                section: '1.14.1',
                status: 'in_review',
                version: '2.0',
                lastModified: '2025-01-20',
                assignee: 'Medical Writing',
              },
            ],
          },
          { id: 'm1.14.2', title: '1.14.2 Patient Labeling', required: true },
          { id: 'm1.14.3', title: '1.14.3 Container/Carton Labels', required: true },
        ],
      },
    ],
  },
  {
    id: 'm2',
    title: 'Module 2 - Common Technical Document Summaries',
    required: true,
    children: [
      {
        id: 'm2.2',
        title: '2.2 Introduction',
        required: true,
        documents: [
          {
            id: 'd4',
            title: 'CTD Introduction',
            section: '2.2',
            status: 'approved',
            version: '1.0',
            lastModified: '2025-01-10',
          },
        ],
      },
      {
        id: 'm2.3',
        title: '2.3 Quality Overall Summary (QOS)',
        required: true,
        documents: [
          {
            id: 'd5',
            title: 'Quality Overall Summary',
            section: '2.3',
            status: 'in_review',
            version: '1.2',
            lastModified: '2025-01-19',
            assignee: 'CMC Team',
          },
        ],
      },
      {
        id: 'm2.4',
        title: '2.4 Nonclinical Overview',
        required: true,
        documents: [
          {
            id: 'd6',
            title: 'Nonclinical Overview',
            section: '2.4',
            status: 'approved',
            version: '1.0',
            lastModified: '2025-01-08',
          },
        ],
      },
      {
        id: 'm2.5',
        title: '2.5 Clinical Overview',
        required: true,
        documents: [
          {
            id: 'd7',
            title: 'Clinical Overview',
            section: '2.5',
            status: 'draft',
            version: '0.8',
            lastModified: '2025-01-21',
            assignee: 'Medical Writing',
          },
        ],
      },
      {
        id: 'm2.6',
        title: '2.6 Nonclinical Written and Tabulated Summaries',
        required: true,
        children: [
          { id: 'm2.6.1', title: '2.6.1 Pharmacology Written Summary', required: true },
          { id: 'm2.6.2', title: '2.6.2 Pharmacology Tabulated Summary', required: true },
          { id: 'm2.6.3', title: '2.6.3 Pharmacokinetics Written Summary', required: true },
          { id: 'm2.6.4', title: '2.6.4 Pharmacokinetics Tabulated Summary', required: true },
          { id: 'm2.6.5', title: '2.6.5 Toxicology Written Summary', required: true },
          { id: 'm2.6.6', title: '2.6.6 Toxicology Tabulated Summary', required: true },
          { id: 'm2.6.7', title: '2.6.7 Literature References', required: false },
        ],
      },
      {
        id: 'm2.7',
        title: '2.7 Clinical Summary',
        required: true,
        children: [
          { id: 'm2.7.1', title: '2.7.1 Biopharmaceutics Summary', required: true },
          { id: 'm2.7.2', title: '2.7.2 Clinical Pharmacology Summary', required: true },
          { id: 'm2.7.3', title: '2.7.3 Clinical Efficacy Summary', required: true },
          { id: 'm2.7.4', title: '2.7.4 Clinical Safety Summary', required: true },
          { id: 'm2.7.5', title: '2.7.5 Literature References', required: false },
          { id: 'm2.7.6', title: '2.7.6 Individual Study Synopses', required: true },
        ],
      },
    ],
  },
  {
    id: 'm3',
    title: 'Module 3 - Quality',
    required: true,
    children: [
      {
        id: 'm3.2',
        title: '3.2 Body of Data',
        required: true,
        children: [
          {
            id: 'm3.2.S',
            title: '3.2.S Drug Substance',
            required: true,
            children: [
              { id: 'm3.2.S.1', title: '3.2.S.1 General Information', required: true },
              { id: 'm3.2.S.2', title: '3.2.S.2 Manufacture', required: true },
              { id: 'm3.2.S.3', title: '3.2.S.3 Characterisation', required: true },
              { id: 'm3.2.S.4', title: '3.2.S.4 Control of Drug Substance', required: true },
              { id: 'm3.2.S.5', title: '3.2.S.5 Reference Standards', required: true },
              { id: 'm3.2.S.6', title: '3.2.S.6 Container Closure System', required: true },
              { id: 'm3.2.S.7', title: '3.2.S.7 Stability', required: true },
            ],
          },
          {
            id: 'm3.2.P',
            title: '3.2.P Drug Product',
            required: true,
            children: [
              { id: 'm3.2.P.1', title: '3.2.P.1 Description and Composition', required: true },
              { id: 'm3.2.P.2', title: '3.2.P.2 Pharmaceutical Development', required: true },
              { id: 'm3.2.P.3', title: '3.2.P.3 Manufacture', required: true },
              { id: 'm3.2.P.4', title: '3.2.P.4 Control of Excipients', required: true },
              { id: 'm3.2.P.5', title: '3.2.P.5 Control of Drug Product', required: true },
              { id: 'm3.2.P.6', title: '3.2.P.6 Reference Standards', required: true },
              { id: 'm3.2.P.7', title: '3.2.P.7 Container Closure System', required: true },
              { id: 'm3.2.P.8', title: '3.2.P.8 Stability', required: true },
            ],
          },
          {
            id: 'm3.2.A',
            title: '3.2.A Appendices',
            required: false,
            children: [
              { id: 'm3.2.A.1', title: '3.2.A.1 Facilities and Equipment', required: false },
              { id: 'm3.2.A.2', title: '3.2.A.2 Adventitious Agents', required: false },
              { id: 'm3.2.A.3', title: '3.2.A.3 Novel Excipients', required: false },
            ],
          },
          {
            id: 'm3.2.R',
            title: '3.2.R Regional Information',
            required: false,
          },
        ],
      },
      {
        id: 'm3.3',
        title: '3.3 Literature References',
        required: false,
      },
    ],
  },
  {
    id: 'm4',
    title: 'Module 4 - Nonclinical Study Reports',
    required: true,
    children: [
      {
        id: 'm4.2',
        title: '4.2 Study Reports',
        required: true,
        children: [
          { id: 'm4.2.1', title: '4.2.1 Pharmacology', required: true },
          { id: 'm4.2.2', title: '4.2.2 Pharmacokinetics', required: true },
          { id: 'm4.2.3', title: '4.2.3 Toxicology', required: true },
        ],
      },
      {
        id: 'm4.3',
        title: '4.3 Literature References',
        required: false,
      },
    ],
  },
  {
    id: 'm5',
    title: 'Module 5 - Clinical Study Reports',
    required: true,
    children: [
      {
        id: 'm5.2',
        title: '5.2 Tabular Listing of All Clinical Studies',
        required: true,
      },
      {
        id: 'm5.3',
        title: '5.3 Clinical Study Reports',
        required: true,
        children: [
          { id: 'm5.3.1', title: '5.3.1 BA/BE Study Reports', required: false },
          { id: 'm5.3.2', title: '5.3.2 PK/PD Study Reports', required: false },
          { id: 'm5.3.3', title: '5.3.3 Human PK Study Reports', required: false },
          { id: 'm5.3.4', title: '5.3.4 Human PD Study Reports', required: false },
          { id: 'm5.3.5', title: '5.3.5 Efficacy and Safety Study Reports', required: true },
          { id: 'm5.3.6', title: '5.3.6 Reports of Post-Marketing Experience', required: false },
          {
            id: 'm5.3.7',
            title: '5.3.7 Case Report Forms and Individual Patient Listings',
            required: false,
          },
        ],
      },
      {
        id: 'm5.4',
        title: '5.4 Literature References',
        required: false,
      },
    ],
  },
];

const MOCK_SEQUENCES: SubmissionSequence[] = [
  {
    id: 'seq-001',
    sequenceNumber: '0000',
    type: 'initial',
    description: 'Initial NDA Submission',
    status: 'submitted',
    createdDate: '2024-11-01',
    submittedDate: '2024-12-15',
    documents: 245,
    healthAuthority: 'FDA',
  },
  {
    id: 'seq-002',
    sequenceNumber: '0001',
    type: 'amendment',
    description: 'Response to Day 74 Letter',
    status: 'ready',
    createdDate: '2025-01-10',
    documents: 12,
    healthAuthority: 'FDA',
  },
  {
    id: 'seq-003',
    sequenceNumber: '0002',
    type: 'supplement',
    description: 'Manufacturing Site Change',
    status: 'draft',
    createdDate: '2025-01-18',
    documents: 8,
    healthAuthority: 'FDA',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: { label: 'Draft', color: 'bg-stone-100 text-stone-700', icon: <File className="w-4 h-4" /> },
  in_review: {
    label: 'In Review',
    color: 'bg-stone-100 text-stone-700',
    icon: <Clock className="w-4 h-4" />,
  },
  approved: {
    label: 'Approved',
    color: 'bg-stone-100 text-stone-800',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  pending: {
    label: 'Pending',
    color: 'bg-stone-100 text-stone-700',
    icon: <Clock className="w-4 h-4" />,
  },
  not_applicable: {
    label: 'N/A',
    color: 'bg-stone-50 text-stone-500',
    icon: <File className="w-4 h-4" />,
  },
  not_started: {
    label: 'Not Started',
    color: 'bg-stone-100 text-stone-700',
    icon: <AlertCircle className="w-4 h-4" />,
  },
};

function countDocuments(section: eCTDSection): {
  total: number;
  approved: number;
  inReview: number;
  draft: number;
} {
  let total = 0,
    approved = 0,
    inReview = 0,
    draft = 0;

  if (section.documents) {
    total += section.documents.length;
    approved += section.documents.filter(d => d.status === 'approved').length;
    inReview += section.documents.filter(d => d.status === 'in_review').length;
    draft += section.documents.filter(d => d.status === 'draft').length;
  }

  if (section.children) {
    for (const child of section.children) {
      const counts = countDocuments(child);
      total += counts.total;
      approved += counts.approved;
      inReview += counts.inReview;
      draft += counts.draft;
    }
  }

  return { total, approved, inReview, draft };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Section Tree Node Component
 */
function SectionNode({
  section,
  depth = 0,
  onSelect,
}: {
  section: eCTDSection;
  depth?: number;
  onSelect: (section: eCTDSection) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const hasChildren = section.children && section.children.length > 0;
  const hasDocuments = section.documents && section.documents.length > 0;
  const counts = useMemo(() => countDocuments(section), [section]);

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l pl-2' : ''}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded px-2 group">
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-6" />
          )}

          {hasChildren || hasDocuments ? (
            isOpen ? (
              <FolderOpen className="h-4 w-4 text-stone-900" />
            ) : (
              <Folder className="h-4 w-4 text-stone-900" />
            )
          ) : (
            <File className="h-4 w-4 text-stone-400" />
          )}

          <span
            className="flex-1 text-sm cursor-pointer hover:text-stone-600"
            onClick={() => onSelect(section)}
          >
            {section.title}
          </span>

          {counts.total > 0 && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {counts.approved > 0 && (
                <Badge variant="outline" className="text-xs bg-stone-100 text-stone-800">
                  {counts.approved} ✓
                </Badge>
              )}
              {counts.inReview > 0 && (
                <Badge variant="outline" className="text-xs bg-stone-100 text-stone-700">
                  {counts.inReview} 👁
                </Badge>
              )}
              {counts.draft > 0 && (
                <Badge variant="outline" className="text-xs bg-stone-50 text-stone-600">
                  {counts.draft} ✎
                </Badge>
              )}
            </div>
          )}

          {section.required && (
            <Badge variant="outline" className="text-xs">
              Required
            </Badge>
          )}
        </div>

        {hasChildren && (
          <CollapsibleContent>
            {section.children?.map(child => (
              <SectionNode key={child.id} section={child} depth={depth + 1} onSelect={onSelect} />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

/**
 * Section Detail Panel
 */
function SectionDetail({ section }: { section: eCTDSection }) {
  return (
    <div className="border border-border/40 rounded-sm bg-background">
      <div className="px-3 py-2 border-b border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Folder className="w-5 h-5 text-stone-900" />
          {section.title}
        </h3>
        {section.description && <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>}
      </div>
      <div className="px-3 py-2">
        {section.documents && section.documents.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.documents.map(doc => {
                const statusConfig = STATUS_CONFIG[doc.status];
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-stone-900" />
                        <span className="font-medium">{doc.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>{doc.version}</TableCell>
                    <TableCell>
                      <Badge className={statusConfig.color}>
                        {statusConfig.icon}
                        <span className="ml-1">{statusConfig.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>{doc.assignee || '-'}</TableCell>
                    <TableCell>{doc.lastModified}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No documents in this section</p>
            <Button className="mt-4" variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Submission Sequences Panel
 */
function SubmissionSequences({ sequences }: { sequences: SubmissionSequence[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Submission Sequences</h3>
          <p className="text-sm text-muted-foreground">
            Manage eCTD submission sequences and lifecycle
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Sequence
        </Button>
      </div>

      <div className="grid gap-4">
        {sequences.map(seq => (
          <div
            key={seq.id}
            className={`border border-border/40 rounded-sm bg-background ${
              seq.status === 'submitted'
                ? 'border-stone-200'
                : seq.status === 'ready'
                  ? 'border-stone-200'
                  : ''
            }`}
          >
            <div className="px-3 py-2 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-stone-100 rounded-lg">
                    <Package className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      Sequence {seq.sequenceNumber}
                      <Badge variant="outline" className="capitalize">
                        {seq.type}
                      </Badge>
                    </h4>
                    <p className="text-sm text-muted-foreground">{seq.description}</p>
                  </div>
                </div>
                <Badge
                  variant={
                    seq.status === 'submitted'
                      ? 'default'
                      : seq.status === 'ready'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {seq.status}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Health Authority</p>
                  <p className="font-medium">{seq.healthAuthority}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Documents</p>
                  <p className="font-medium">{seq.documents}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{seq.createdDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{seq.submittedDate || '-'}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline">
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
                {seq.status === 'draft' && (
                  <Button size="sm" variant="outline">
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Validate
                  </Button>
                )}
                {seq.status === 'ready' && (
                  <Button size="sm">
                    <Upload className="w-4 h-4 mr-1" />
                    Submit
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Module Progress Overview
 */
function ModuleProgress({ sections }: { sections: eCTDSection[] }) {
  const moduleStats = useMemo(() => {
    return sections.map(section => {
      const counts = countDocuments(section);
      const progress = counts.total > 0 ? (counts.approved / counts.total) * 100 : 0;
      return {
        id: section.id,
        title: section.title.split(' - ')[0],
        ...counts,
        progress,
      };
    });
  }, [sections]);

  return (
    <div className="border border-border/40 rounded-sm bg-background">
      <div className="px-3 py-2 border-b border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Module Progress
        </h3>
      </div>
      <div className="px-3 py-2">
        <div className="space-y-4">
          {moduleStats.map(module => (
            <div key={module.id}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{module.title}</span>
                <span className="text-muted-foreground">
                  {module.approved}/{module.total} approved
                </span>
              </div>
              <Progress value={module.progress} className="h-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Real Data Overlay ─────────────────────────────────────────────────────────
// Maps real project artifacts (from useProject context) onto the CTD structure,
// replacing mock documents with live data from the database.

function mapArtifactStatus(status?: string): DocumentStatus {
  if (!status) return 'draft';
  const s = status.toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'review' || s === 'under_review' || s === 'in_review') return 'in_review';
  if (s === 'locked' || s === 'published') return 'approved';
  return 'draft';
}

function overlayRealArtifacts(
  structure: eCTDSection[],
  artifacts: Array<{ id: string; title: string; ctdSection?: string; status?: string; version?: number; updatedAt?: string }>,
): eCTDSection[] {
  // Group artifacts by CTD section prefix
  const bySection: Record<string, eCTDDocument[]> = {};
  for (const a of artifacts) {
    if (!a.ctdSection) continue;
    // Normalize section: "2.7" -> match m2.7, "m2.7" -> match m2.7
    const key = a.ctdSection.startsWith('m') ? a.ctdSection : `m${a.ctdSection}`;
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push({
      id: a.id,
      title: a.title,
      section: a.ctdSection,
      status: mapArtifactStatus(a.status),
      version: String(a.version ?? 1),
      lastModified: a.updatedAt ?? new Date().toISOString(),
    });
  }

  function overlaySection(section: eCTDSection): eCTDSection {
    const docs = bySection[section.id] || section.documents || [];
    return {
      ...section,
      documents: docs.length > 0 ? docs : section.documents,
      children: section.children?.map(overlaySection),
    };
  }

  return structure.map(overlaySection);
}

/**
 * Main eCTD Navigator Component
 *
 * Integrates with project context to overlay real artifact data onto the
 * standard ICH CTD Module 1-5 structure. Falls back to mock structure
 * when no project is active.
 */
export function ECTDNavigator() {
  const [selectedSection, setSelectedSection] = useState<eCTDSection | null>(null);
  const [selectedHA, setSelectedHA] = useState<string>('FDA');
  const [searchTerm, setSearchTerm] = useState('');

  // Pull real artifacts from project context
  const { activeProject, artifacts: projectArtifacts } = useProject();

  // Overlay real artifacts onto CTD structure when project is active
  const liveStructure = useMemo(() => {
    if (!activeProject || !projectArtifacts || projectArtifacts.length === 0) {
      return ECTD_STRUCTURE;
    }
    return overlayRealArtifacts(ECTD_STRUCTURE, projectArtifacts.map((a: any) => ({
      id: String(a.id),
      title: a.title,
      ctdSection: a.ctdSection,
      status: a.status,
      version: a.version,
      updatedAt: a.updatedAt,
    })));
  }, [activeProject, projectArtifacts]);

  // Calculate overall stats from live structure
  const overallStats = useMemo(() => {
    let total = 0,
      approved = 0,
      inReview = 0,
      draft = 0;
    for (const section of liveStructure) {
      const counts = countDocuments(section);
      total += counts.total;
      approved += counts.approved;
      inReview += counts.inReview;
      draft += counts.draft;
    }
    return { total, approved, inReview, draft };
  }, [liveStructure]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-3">
            <Package className="w-8 h-8 text-stone-600" />
            eCTD Navigator
          </h1>
          <p className="text-muted-foreground">
            Electronic Common Technical Document structure and management
          </p>
          {activeProject && (
            <p className="text-xs text-stone-700 flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" />
              Live data from: {activeProject.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={selectedHA} onValueChange={setSelectedHA}>
            <SelectTrigger className="w-48">
              <Globe className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FDA">FDA (United States)</SelectItem>
              <SelectItem value="EMA">EMA (Europe)</SelectItem>
              <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
              <SelectItem value="Health Canada">Health Canada</SelectItem>
              <SelectItem value="TGA">TGA (Australia)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-base font-semibold">{overallStats.total}</p>
              </div>
              <FileText className="w-8 h-8 text-stone-900" />
            </div>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-base font-semibold text-stone-700">{overallStats.approved}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-stone-900" />
            </div>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Review</p>
                <p className="text-base font-semibold text-stone-600">{overallStats.inReview}</p>
              </div>
              <Clock className="w-8 h-8 text-stone-900" />
            </div>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-base font-semibold text-stone-600">{overallStats.draft}</p>
              </div>
              <File className="w-8 h-8 text-stone-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure">eCTD Structure</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="history">Submission History</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="mt-6">
          <div className="grid grid-cols-12 gap-6">
            {/* Tree View */}
            <div className="col-span-4">
              <div className="border border-border/40 rounded-sm bg-background h-[600px] overflow-auto">
                <div className="px-3 py-2 border-b border-border/30 sticky top-0 bg-white z-10 border-b">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sections..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="px-3 py-2 p-2">
                  {liveStructure.map(section => (
                    <SectionNode key={section.id} section={section} onSelect={setSelectedSection} />
                  ))}
                </div>
              </div>
            </div>

            {/* Detail Panel */}
            <div className="col-span-8 space-y-6">
              {selectedSection ? (
                <SectionDetail section={selectedSection} />
              ) : (
                <div className="border border-border/40 rounded-sm bg-background h-64 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a section from the tree to view details</p>
                  </div>
                </div>
              )}

              <ModuleProgress sections={liveStructure} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sequences" className="mt-6">
          <SubmissionSequences sequences={MOCK_SEQUENCES} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="w-5 h-5" />
                Submission History
              </h3>
            </div>
            <div className="px-3 py-2">
              <div className="text-center py-8 text-muted-foreground">
                <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>View complete submission history and lifecycle</p>
                <Button variant="outline" className="mt-4">
                  View Timeline
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* RI Assistance */}
      <div className="border border-border/40 rounded-sm bg-background border-stone-200 bg-stone-50">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-stone-200 rounded-full">
              <Sparkles className="w-6 h-6 text-stone-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-stone-900">RI eCTD Assistant</h3>
              <p className="text-sm text-stone-700">
                Validate eCTD structure, identify missing documents, generate section templates, and
                ensure compliance with regional requirements.
              </p>
            </div>
            <Button variant="outline" className="border-stone-300 text-stone-700">
              Validate Structure
            </Button>
            <Button className="bg-stone-600 hover:bg-stone-700">RI Guidance</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ECTDNavigator;
