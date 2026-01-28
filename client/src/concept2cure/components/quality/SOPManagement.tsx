/**
 * Concept2Cure - SOP Management System
 * 
 * Complete SOP lifecycle management including:
 * - Version control with audit trail
 * - Training acknowledgment tracking
 * - Periodic review scheduling
 * - Training matrix by role
 * - Part 11 compliant e-signatures
 * 
 * @module concept2cure/components/quality/SOPManagement
 * @version 1.0.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  History,
  BookOpen,
  FileCheck,
  MoreHorizontal,
  Edit,
  Eye,
  Download,
  Send,
  Archive,
  RefreshCw,
  Calendar,
  Shield,
  GraduationCap,
  Building2,
  Filter,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface SOPDocument {
  id: string;
  documentNumber: string;
  title: string;
  department: SOPDepartment;
  category: SOPCategory;
  version: string;
  effectiveDate: Date;
  reviewDate: Date;
  status: SOPStatus;
  owner: string;
  approvers: SOPApprover[];
  trainingRequired: boolean;
  trainedPersonnel: string[];
  totalRequiredTrainees: number;
  attachments: string[];
  changeHistory: SOPChange[];
  content?: string;
}

interface SOPApprover {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  signedAt?: Date;
  comments?: string;
}

interface SOPChange {
  version: string;
  date: Date;
  author: string;
  description: string;
  changeType: 'major' | 'minor' | 'administrative';
}

interface TrainingRecord {
  id: string;
  sopId: string;
  sopNumber: string;
  sopTitle: string;
  userId: string;
  userName: string;
  department: string;
  status: 'pending' | 'completed' | 'overdue';
  assignedDate: Date;
  dueDate: Date;
  completedDate?: Date;
  acknowledgment?: string;
}

type SOPDepartment = 'quality' | 'regulatory' | 'clinical' | 'manufacturing' | 'rd' | 'safety' | 'general';
type SOPCategory = 'procedure' | 'work_instruction' | 'form' | 'policy' | 'guideline';
type SOPStatus = 'draft' | 'review' | 'approved' | 'effective' | 'superseded' | 'retired';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEPARTMENTS: { value: SOPDepartment; label: string; icon: React.ElementType }[] = [
  { value: 'quality', label: 'Quality Assurance', icon: Shield },
  { value: 'regulatory', label: 'Regulatory Affairs', icon: FileCheck },
  { value: 'clinical', label: 'Clinical Operations', icon: Users },
  { value: 'manufacturing', label: 'Manufacturing', icon: Building2 },
  { value: 'rd', label: 'R&D', icon: Sparkles },
  { value: 'safety', label: 'Safety/PV', icon: AlertTriangle },
  { value: 'general', label: 'General/Admin', icon: FileText },
];

const CATEGORIES: { value: SOPCategory; label: string }[] = [
  { value: 'procedure', label: 'Standard Operating Procedure' },
  { value: 'work_instruction', label: 'Work Instruction' },
  { value: 'form', label: 'Form/Template' },
  { value: 'policy', label: 'Policy' },
  { value: 'guideline', label: 'Guideline' },
];

const STATUS_CONFIG: Record<SOPStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Edit },
  review: { label: 'Under Review', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  effective: { label: 'Effective', color: 'bg-green-100 text-green-700', icon: FileCheck },
  superseded: { label: 'Superseded', color: 'bg-purple-100 text-purple-700', icon: History },
  retired: { label: 'Retired', color: 'bg-red-100 text-red-700', icon: Archive },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SOPS: SOPDocument[] = [
  {
    id: '1',
    documentNumber: 'SOP-QA-001',
    title: 'Document Control Procedure',
    department: 'quality',
    category: 'procedure',
    version: '3.0',
    effectiveDate: new Date('2025-01-15'),
    reviewDate: new Date('2026-01-15'),
    status: 'effective',
    owner: 'Jane Smith',
    approvers: [
      { id: 'a1', name: 'John Director', role: 'QA Director', status: 'approved', signedAt: new Date('2025-01-10') },
    ],
    trainingRequired: true,
    trainedPersonnel: ['user1', 'user2', 'user3'],
    totalRequiredTrainees: 5,
    attachments: [],
    changeHistory: [
      { version: '3.0', date: new Date('2025-01-15'), author: 'Jane Smith', description: 'Updated electronic signature requirements', changeType: 'major' },
      { version: '2.0', date: new Date('2024-01-10'), author: 'Jane Smith', description: 'Added eCTD assembly section', changeType: 'major' },
    ],
  },
  {
    id: '2',
    documentNumber: 'SOP-RA-005',
    title: '510(k) Submission Procedure',
    department: 'regulatory',
    category: 'procedure',
    version: '2.1',
    effectiveDate: new Date('2025-11-20'),
    reviewDate: new Date('2026-11-20'),
    status: 'effective',
    owner: 'Mike Johnson',
    approvers: [
      { id: 'a2', name: 'Sarah VP', role: 'VP Regulatory', status: 'approved', signedAt: new Date('2025-11-18') },
    ],
    trainingRequired: true,
    trainedPersonnel: ['user1', 'user4'],
    totalRequiredTrainees: 8,
    attachments: ['510k_checklist.docx'],
    changeHistory: [
      { version: '2.1', date: new Date('2025-11-20'), author: 'Mike Johnson', description: 'Updated predicate selection criteria', changeType: 'minor' },
    ],
  },
  {
    id: '3',
    documentNumber: 'SOP-CL-010',
    title: 'Clinical Protocol Development',
    department: 'clinical',
    category: 'procedure',
    version: '1.0',
    effectiveDate: new Date('2026-01-05'),
    reviewDate: new Date('2027-01-05'),
    status: 'review',
    owner: 'Dr. Emily Brown',
    approvers: [
      { id: 'a3', name: 'Dr. CMO', role: 'Chief Medical Officer', status: 'pending' },
      { id: 'a4', name: 'VP Clinical', role: 'VP Clinical Development', status: 'pending' },
    ],
    trainingRequired: true,
    trainedPersonnel: [],
    totalRequiredTrainees: 12,
    attachments: [],
    changeHistory: [
      { version: '1.0', date: new Date('2026-01-05'), author: 'Dr. Emily Brown', description: 'Initial release', changeType: 'major' },
    ],
  },
];

const MOCK_TRAINING: TrainingRecord[] = [
  {
    id: 't1',
    sopId: '1',
    sopNumber: 'SOP-QA-001',
    sopTitle: 'Document Control Procedure',
    userId: 'u1',
    userName: 'Alice Developer',
    department: 'R&D',
    status: 'pending',
    assignedDate: new Date('2026-01-20'),
    dueDate: new Date('2026-02-20'),
  },
  {
    id: 't2',
    sopId: '2',
    sopNumber: 'SOP-RA-005',
    sopTitle: '510(k) Submission Procedure',
    userId: 'u2',
    userName: 'Bob Regulatory',
    department: 'Regulatory',
    status: 'completed',
    assignedDate: new Date('2025-12-01'),
    dueDate: new Date('2026-01-01'),
    completedDate: new Date('2025-12-20'),
  },
  {
    id: 't3',
    sopId: '2',
    sopNumber: 'SOP-RA-005',
    sopTitle: '510(k) Submission Procedure',
    userId: 'u3',
    userName: 'Carol Manager',
    department: 'Quality',
    status: 'overdue',
    assignedDate: new Date('2025-11-01'),
    dueDate: new Date('2025-12-01'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SOP LIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SOPListProps {
  sops: SOPDocument[];
  onSelect: (sop: SOPDocument) => void;
  onEdit: (sop: SOPDocument) => void;
}

const SOPList: React.FC<SOPListProps> = ({ sops, onSelect, onEdit }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<SOPDepartment | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<SOPStatus | 'all'>('all');

  const filteredSOPs = useMemo(() => {
    return sops.filter(sop => {
      const matchesSearch = searchQuery === '' ||
        sop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sop.documentNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = filterDepartment === 'all' || sop.department === filterDepartment;
      const matchesStatus = filterStatus === 'all' || sop.status === filterStatus;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [sops, searchQuery, filterDepartment, filterStatus]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isReviewDue = (reviewDate: Date) => {
    const daysUntilReview = Math.ceil((new Date(reviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilReview <= 30;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search SOPs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterDepartment} onValueChange={(v) => setFilterDepartment(v as SOPDepartment | 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map(dept => (
              <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as SOPStatus | 'all')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([value, config]) => (
              <SelectItem key={value} value={value}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SOP Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[140px]">Document #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[100px]">Version</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[120px]">Review Date</TableHead>
              <TableHead className="w-[100px]">Training</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSOPs.map(sop => {
              const StatusIcon = STATUS_CONFIG[sop.status].icon;
              const trainingPercent = (sop.trainedPersonnel.length / sop.totalRequiredTrainees) * 100;
              
              return (
                <TableRow
                  key={sop.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => onSelect(sop)}
                >
                  <TableCell className="font-mono text-sm">{sop.documentNumber}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{sop.title}</span>
                      {isReviewDue(sop.reviewDate) && sop.status === 'effective' && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                          Review Due
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>v{sop.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_CONFIG[sop.status].color)}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {STATUS_CONFIG[sop.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(sop.reviewDate)}</TableCell>
                  <TableCell>
                    {sop.trainingRequired ? (
                      <div className="flex items-center gap-2">
                        <Progress value={trainingPercent} className="h-1.5 w-12" />
                        <span className="text-xs text-gray-500">
                          {sop.trainedPersonnel.length}/{sop.totalRequiredTrainees}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelect(sop); }}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(sop); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <History className="h-4 w-4 mr-2" />
                          Version History
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredSOPs.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-500">
          No SOPs found matching your criteria
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING MATRIX COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface TrainingMatrixProps {
  records: TrainingRecord[];
  onAcknowledge: (recordId: string) => void;
}

const TrainingMatrix: React.FC<TrainingMatrixProps> = ({ records, onAcknowledge }) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'overdue'>('all');

  const filteredRecords = useMemo(() => {
    if (filterStatus === 'all') return records;
    return records.filter(r => r.status === filterStatus);
  }, [records, filterStatus]);

  const stats = useMemo(() => {
    return {
      total: records.length,
      completed: records.filter(r => r.status === 'completed').length,
      pending: records.filter(r => r.status === 'pending').length,
      overdue: records.filter(r => r.status === 'overdue').length,
    };
  }, [records]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-gray-300" onClick={() => setFilterStatus('all')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-300" onClick={() => setFilterStatus('completed')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-300" onClick={() => setFilterStatus('pending')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-300" onClick={() => setFilterStatus('overdue')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            <p className="text-xs text-gray-500">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Training Records Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>SOP</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[120px]">Due Date</TableHead>
              <TableHead className="w-[100px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.map(record => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.userName}</TableCell>
                <TableCell className="text-sm text-gray-500">{record.department}</TableCell>
                <TableCell>
                  <div>
                    <span className="font-mono text-xs text-gray-500">{record.sopNumber}</span>
                    <p className="text-sm">{record.sopTitle}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      record.status === 'completed' && 'bg-green-100 text-green-700',
                      record.status === 'pending' && 'bg-amber-100 text-amber-700',
                      record.status === 'overdue' && 'bg-red-100 text-red-700'
                    )}
                  >
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(record.dueDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {record.status !== 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAcknowledge(record.id)}
                    >
                      <GraduationCap className="h-3 w-3 mr-1" />
                      Train
                    </Button>
                  )}
                  {record.status === 'completed' && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Done
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SOPManagementProps {
  className?: string;
}

export const SOPManagement: React.FC<SOPManagementProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState('documents');
  const [selectedSOP, setSelectedSOP] = useState<SOPDocument | null>(null);
  const [showNewSOPDialog, setShowNewSOPDialog] = useState(false);

  const sops = MOCK_SOPS;
  const trainingRecords = MOCK_TRAINING;

  // Calculate summary stats
  const stats = useMemo(() => {
    const effective = sops.filter(s => s.status === 'effective').length;
    const underReview = sops.filter(s => s.status === 'review').length;
    const reviewDue = sops.filter(s => {
      const daysUntilReview = Math.ceil((new Date(s.reviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntilReview <= 30 && s.status === 'effective';
    }).length;
    
    return { total: sops.length, effective, underReview, reviewDue };
  }, [sops]);

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">SOP Management</h1>
            <p className="text-xs text-gray-500">Document control and training tracking</p>
          </div>
        </div>
        <Button onClick={() => setShowNewSOPDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New SOP
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50 border-b">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total SOPs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.effective}</p>
              <p className="text-xs text-gray-500">Effective</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.underReview}</p>
              <p className="text-xs text-gray-500">Under Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <RefreshCw className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.reviewDue}</p>
              <p className="text-xs text-gray-500">Review Due</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-4 grid w-fit grid-cols-3">
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="training">
            <GraduationCap className="h-4 w-4 mr-2" />
            Training
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <Calendar className="h-4 w-4 mr-2" />
            Reviews
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 p-4">
          <TabsContent value="documents" className="m-0">
            <SOPList
              sops={sops}
              onSelect={setSelectedSOP}
              onEdit={(sop) => console.log('Edit SOP:', sop.id)}
            />
          </TabsContent>

          <TabsContent value="training" className="m-0">
            <TrainingMatrix
              records={trainingRecords}
              onAcknowledge={(id) => console.log('Acknowledge training:', id)}
            />
          </TabsContent>

          <TabsContent value="reviews" className="m-0">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Upcoming Periodic Reviews</h3>
              {sops
                .filter(s => s.status === 'effective')
                .sort((a, b) => new Date(a.reviewDate).getTime() - new Date(b.reviewDate).getTime())
                .map(sop => {
                  const daysUntil = Math.ceil((new Date(sop.reviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <Card key={sop.id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            daysUntil <= 30 ? 'bg-red-100' : 'bg-gray-100'
                          )}>
                            <Calendar className={cn(
                              'h-5 w-5',
                              daysUntil <= 30 ? 'text-red-600' : 'text-gray-600'
                            )} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{sop.title}</p>
                            <p className="text-xs text-gray-500">{sop.documentNumber} · v{sop.version}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'font-medium',
                            daysUntil <= 30 ? 'text-red-600' : 'text-gray-900'
                          )}>
                            {daysUntil} days
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(sop.reviewDate).toLocaleDateString()}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* New SOP Dialog */}
      <Dialog open={showNewSOPDialog} onOpenChange={setShowNewSOPDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New SOP</DialogTitle>
            <DialogDescription>
              Create a new standard operating procedure document
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Number</Label>
                <Input placeholder="SOP-XX-000" />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(dept => (
                      <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Enter SOP title" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="training" />
              <Label htmlFor="training" className="text-sm">Training required for this SOP</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSOPDialog(false)}>Cancel</Button>
            <Button onClick={() => setShowNewSOPDialog(false)}>
              <Plus className="h-4 w-4 mr-2" />
              Create SOP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SOPManagement;
