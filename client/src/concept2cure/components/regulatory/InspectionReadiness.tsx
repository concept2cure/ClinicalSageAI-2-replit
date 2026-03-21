/**
 * Concept2Cure - Inspection Readiness Module
 *
 * Comprehensive inspection preparation and management for:
 * - FDA Pre-Approval Inspections (PAI)
 * - GMP/GCP/GLP Inspections
 * - EU MDR Notified Body Audits
 * - ISO 13485 Audits
 * - Internal Audit Management
 *
 * Features:
 * - Document readiness tracking
 * - Mock inspection scheduling
 * - Finding tracking and remediation
 * - Back room preparation
 * - SME identification and training
 *
 * @module components/regulatory/InspectionReadiness
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  Users,
  Calendar,
  ClipboardCheck,
  Shield,
  AlertCircle,
  BookOpen,
  Building2,
  Eye,
  Target,
  TrendingUp,
  Sparkles,
  FileWarning,
  Award,
  UserCheck,
  Briefcase,
  Map,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type InspectionType =
  | 'FDA_PAI'
  | 'FDA_GMP'
  | 'FDA_BIMO'
  | 'EMA_GMP'
  | 'EMA_GCP'
  | 'NB_MDR'
  | 'ISO_13485'
  | 'ISO_9001'
  | 'INTERNAL';

type InspectionStatus = 'scheduled' | 'preparing' | 'in_progress' | 'completed' | 'follow_up';

type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';

type ReadinessCategory =
  | 'documentation'
  | 'personnel'
  | 'facility'
  | 'equipment'
  | 'processes'
  | 'records'
  | 'training';

interface InspectionEvent {
  id: string;
  title: string;
  type: InspectionType;
  inspector: string;
  status: InspectionStatus;
  scheduledDate: string;
  endDate?: string;
  location: string;
  scope: string[];
  leadContact: string;
  findings: Finding[];
  readinessScore: number;
}

interface Finding {
  id: string;
  reference: string;
  description: string;
  severity: FindingSeverity;
  area: string;
  responseDeadline: string;
  responsiblePerson: string;
  status: 'open' | 'in_progress' | 'submitted' | 'accepted' | 'closed';
  capaId?: string;
}

interface ReadinessItem {
  id: string;
  category: ReadinessCategory;
  item: string;
  description: string;
  owner: string;
  status: 'ready' | 'in_progress' | 'not_ready' | 'na';
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  evidence?: string[];
  notes?: string;
}

interface SubjectMatterExpert {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  trainingCompleted: boolean;
  available: boolean;
  backupName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const INSPECTION_TYPES: Record<
  InspectionType,
  { label: string; icon: React.ReactNode; agency: string }
> = {
  FDA_PAI: {
    label: 'FDA Pre-Approval Inspection',
    icon: <Shield className="w-4 h-4" />,
    agency: 'FDA',
  },
  FDA_GMP: { label: 'FDA GMP Inspection', icon: <Building2 className="w-4 h-4" />, agency: 'FDA' },
  FDA_BIMO: { label: 'FDA BIMO Inspection', icon: <FileText className="w-4 h-4" />, agency: 'FDA' },
  EMA_GMP: { label: 'EMA GMP Inspection', icon: <Building2 className="w-4 h-4" />, agency: 'EMA' },
  EMA_GCP: {
    label: 'EMA GCP Inspection',
    icon: <ClipboardCheck className="w-4 h-4" />,
    agency: 'EMA',
  },
  NB_MDR: {
    label: 'Notified Body MDR Audit',
    icon: <Award className="w-4 h-4" />,
    agency: 'Notified Body',
  },
  ISO_13485: {
    label: 'ISO 13485 Audit',
    icon: <Target className="w-4 h-4" />,
    agency: 'Certification Body',
  },
  ISO_9001: {
    label: 'ISO 9001 Audit',
    icon: <Target className="w-4 h-4" />,
    agency: 'Certification Body',
  },
  INTERNAL: { label: 'Internal Audit', icon: <Eye className="w-4 h-4" />, agency: 'Internal' },
};

const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { label: string; color: string; responseTime: string }
> = {
  critical: { label: 'Critical', color: 'bg-red-500 text-white', responseTime: '5 business days' },
  major: { label: 'Major', color: 'bg-orange-500 text-white', responseTime: '15 business days' },
  minor: { label: 'Minor', color: 'bg-yellow-500 text-white', responseTime: '30 business days' },
  observation: {
    label: 'Observation',
    color: 'bg-blue-100 text-blue-800',
    responseTime: 'No formal response',
  },
};

const READINESS_CATEGORIES: Record<ReadinessCategory, { label: string; icon: React.ReactNode }> = {
  documentation: { label: 'Documentation', icon: <FileText className="w-4 h-4" /> },
  personnel: { label: 'Personnel', icon: <Users className="w-4 h-4" /> },
  facility: { label: 'Facility', icon: <Building2 className="w-4 h-4" /> },
  equipment: { label: 'Equipment', icon: <Target className="w-4 h-4" /> },
  processes: { label: 'Processes', icon: <ClipboardCheck className="w-4 h-4" /> },
  records: { label: 'Records', icon: <BookOpen className="w-4 h-4" /> },
  training: { label: 'Training', icon: <Award className="w-4 h-4" /> },
};

// Mock Data
const MOCK_INSPECTIONS: InspectionEvent[] = [
  {
    id: 'INS-2025-001',
    title: 'FDA Pre-Approval Inspection - CardioGuard NDA',
    type: 'FDA_PAI',
    inspector: 'FDA CDER',
    status: 'preparing',
    scheduledDate: '2025-02-15',
    endDate: '2025-02-19',
    location: 'Manufacturing Site - Boston',
    scope: ['Drug Substance', 'Drug Product', 'Analytical Methods', 'Stability'],
    leadContact: 'Dr. Sarah Chen',
    findings: [],
    readinessScore: 78,
  },
  {
    id: 'INS-2025-002',
    title: 'Notified Body MDR Audit - SmartStent',
    type: 'NB_MDR',
    inspector: 'BSI',
    status: 'scheduled',
    scheduledDate: '2025-03-10',
    endDate: '2025-03-12',
    location: 'Corporate HQ',
    scope: ['Technical Documentation', 'Clinical Evaluation', 'PMS', 'QMS'],
    leadContact: 'Michael Torres',
    findings: [],
    readinessScore: 65,
  },
  {
    id: 'INS-2024-015',
    title: 'FDA GMP Inspection - Annual',
    type: 'FDA_GMP',
    inspector: 'FDA ORA',
    status: 'follow_up',
    scheduledDate: '2024-11-15',
    endDate: '2024-11-18',
    location: 'Manufacturing Site - Boston',
    scope: ['Manufacturing', 'Laboratory Controls', 'Quality Systems'],
    leadContact: 'Robert Martinez',
    findings: [
      {
        id: 'F-001',
        reference: '21 CFR 211.68',
        description: 'Automatic computer systems validation documentation incomplete',
        severity: 'major',
        area: 'Computer Systems',
        responseDeadline: '2025-01-15',
        responsiblePerson: 'IT Director',
        status: 'in_progress',
        capaId: 'CAPA-2024-089',
      },
      {
        id: 'F-002',
        reference: '21 CFR 211.180',
        description: 'Annual product review not completed within required timeframe',
        severity: 'minor',
        area: 'Quality Assurance',
        responseDeadline: '2025-02-01',
        responsiblePerson: 'QA Director',
        status: 'submitted',
      },
    ],
    readinessScore: 92,
  },
];

const MOCK_READINESS: ReadinessItem[] = [
  // Documentation
  {
    id: 'r1',
    category: 'documentation',
    item: 'Batch Records',
    description: 'All batch records for submitted batches available and reviewed',
    owner: 'QA Manager',
    status: 'ready',
    priority: 'high',
    evidence: ['Batch Record Review Log'],
  },
  {
    id: 'r2',
    category: 'documentation',
    item: 'Validation Reports',
    description: 'Process validation reports complete and approved',
    owner: 'Validation Manager',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2025-02-10',
  },
  {
    id: 'r3',
    category: 'documentation',
    item: 'SOPs',
    description: 'All relevant SOPs current and staff trained',
    owner: 'Document Control',
    status: 'ready',
    priority: 'high',
  },
  // Personnel
  {
    id: 'r4',
    category: 'personnel',
    item: 'Back Room Team',
    description: 'Back room support team identified and trained',
    owner: 'RA Lead',
    status: 'ready',
    priority: 'high',
  },
  {
    id: 'r5',
    category: 'personnel',
    item: 'SME Availability',
    description: 'Subject matter experts confirmed available',
    owner: 'Site Director',
    status: 'in_progress',
    priority: 'high',
  },
  {
    id: 'r6',
    category: 'personnel',
    item: 'Mock Interview Training',
    description: 'Key personnel completed mock interview sessions',
    owner: 'QA Training',
    status: 'not_ready',
    priority: 'high',
    dueDate: '2025-02-08',
  },
  // Facility
  {
    id: 'r7',
    category: 'facility',
    item: 'Conference Room',
    description: 'Inspector work room set up with required equipment',
    owner: 'Facilities',
    status: 'ready',
    priority: 'medium',
  },
  {
    id: 'r8',
    category: 'facility',
    item: 'Site Tour Route',
    description: 'Tour route planned and areas cleaned/organized',
    owner: 'Operations',
    status: 'in_progress',
    priority: 'medium',
  },
  // Equipment
  {
    id: 'r9',
    category: 'equipment',
    item: 'Equipment Qualifications',
    description: 'All equipment IQ/OQ/PQ documentation current',
    owner: 'Engineering',
    status: 'ready',
    priority: 'high',
  },
  {
    id: 'r10',
    category: 'equipment',
    item: 'Calibration Records',
    description: 'Calibration certificates current for all critical equipment',
    owner: 'Metrology',
    status: 'ready',
    priority: 'high',
  },
  // Training
  {
    id: 'r11',
    category: 'training',
    item: 'Inspection Awareness',
    description: 'All staff completed inspection awareness training',
    owner: 'Training Dept',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2025-02-05',
  },
  {
    id: 'r12',
    category: 'training',
    item: 'Role-Specific Training',
    description: 'Training records current for all roles',
    owner: 'Training Dept',
    status: 'ready',
    priority: 'medium',
  },
];

const MOCK_SMES: SubjectMatterExpert[] = [
  {
    id: 'sme1',
    name: 'Dr. Sarah Chen',
    role: 'Site Director',
    expertise: ['Quality Systems', 'CAPA', 'Management Review'],
    trainingCompleted: true,
    available: true,
    backupName: 'Dr. Michael Torres',
  },
  {
    id: 'sme2',
    name: 'Jennifer Lee',
    role: 'QA Director',
    expertise: ['Batch Record Review', 'OOS Investigations', 'Change Control'],
    trainingCompleted: true,
    available: true,
  },
  {
    id: 'sme3',
    name: 'Robert Martinez',
    role: 'Manufacturing Director',
    expertise: ['Process Validation', 'Production Operations', 'Equipment'],
    trainingCompleted: true,
    available: true,
  },
  {
    id: 'sme4',
    name: 'Lisa Park',
    role: 'QC Director',
    expertise: ['Analytical Methods', 'Stability', 'Lab Controls'],
    trainingCompleted: false,
    available: true,
    backupName: 'Dr. Kim Wong',
  },
  {
    id: 'sme5',
    name: 'David Kim',
    role: 'Regulatory Affairs',
    expertise: ['Submissions', 'CMC', 'Commitments'],
    trainingCompleted: true,
    available: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspection Dashboard Metrics
 */
function InspectionMetrics({
  inspections,
  readinessItems,
}: {
  inspections: InspectionEvent[];
  readinessItems: ReadinessItem[];
}) {
  const upcoming = inspections.filter(
    i => i.status === 'scheduled' || i.status === 'preparing'
  ).length;
  const openFindings = inspections.reduce(
    (acc, i) =>
      acc + i.findings.filter(f => f.status !== 'closed' && f.status !== 'accepted').length,
    0
  );
  const avgReadiness = Math.round(
    inspections.reduce((acc, i) => acc + i.readinessScore, 0) / inspections.length
  );
  const readyItems = readinessItems.filter(r => r.status === 'ready').length;
  const totalItems = readinessItems.filter(r => r.status !== 'na').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Upcoming</p>
              <p className="text-2xl font-semibold">{upcoming}</p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Open Findings</p>
              <p className="text-2xl font-semibold text-orange-600">{openFindings}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Readiness</p>
              <p
                className={`text-2xl font-semibold ${
                  avgReadiness >= 80
                    ? 'text-green-600'
                    : avgReadiness >= 60
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {avgReadiness}%
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ready Items</p>
              <p className="text-2xl font-semibold">
                {readyItems}/{totalItems}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inspection Calendar/List
 */
function InspectionList({
  inspections,
  onSelect,
}: {
  inspections: InspectionEvent[];
  onSelect: (inspection: InspectionEvent) => void;
}) {
  return (
    <div className="space-y-4">
      {inspections.map(inspection => {
        const typeConfig = INSPECTION_TYPES[inspection.type];
        const daysUntil = Math.floor(
          (new Date(inspection.scheduledDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        return (
          <div
            key={inspection.id}
            className={`border border-border/40 rounded-sm bg-background cursor-pointer transition-shadow ${
              inspection.status === 'preparing' && daysUntil <= 14 ? 'border-orange-300' : ''
            }`}
            onClick={() => onSelect(inspection)}
          >
            <div className="px-3 py-2 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      inspection.status === 'completed' || inspection.status === 'follow_up'
                        ? 'bg-zinc-100'
                        : 'bg-blue-100'
                    }`}
                  >
                    {typeConfig.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold">{inspection.title}</h4>
                    <p className="text-sm text-muted-foreground">{inspection.location}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">{typeConfig.label}</Badge>
                      <Badge
                        variant={
                          inspection.status === 'completed'
                            ? 'default'
                            : inspection.status === 'in_progress'
                              ? 'secondary'
                              : inspection.status === 'preparing'
                                ? 'outline'
                                : 'outline'
                        }
                      >
                        {inspection.status.replace('_', ' ')}
                      </Badge>
                      {inspection.findings.length > 0 && (
                        <Badge variant="destructive">
                          {inspection.findings.filter(f => f.status !== 'closed').length} Open
                          Findings
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{inspection.scheduledDate}</p>
                  {daysUntil > 0 && inspection.status !== 'completed' && (
                    <p
                      className={`text-sm ${daysUntil <= 14 ? 'text-orange-600 font-medium' : 'text-muted-foreground'}`}
                    >
                      {daysUntil} days
                    </p>
                  )}
                  <div className="mt-2">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-muted-foreground">Readiness</span>
                      <Progress value={inspection.readinessScore} className="w-20 h-2" />
                      <span className="text-xs font-medium">{inspection.readinessScore}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Readiness Checklist
 */
function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      return true;
    });
  }, [items, filterCategory, filterStatus]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { ready: number; total: number }> = {};
    for (const item of items) {
      if (item.status === 'na') continue;
      if (!stats[item.category]) {
        stats[item.category] = { ready: 0, total: 0 };
      }
      stats[item.category].total++;
      if (item.status === 'ready') {
        stats[item.category].ready++;
      }
    }
    return stats;
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Category Progress */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(categoryStats).map(([category, stats]) => {
          const config = READINESS_CATEGORIES[category as ReadinessCategory];
          const progress = (stats.ready / stats.total) * 100;
          return (
            <div key={category} className="border border-border/40 rounded-sm bg-background">
              <div className="px-3 py-2 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {config.icon}
                  <span className="font-medium text-sm">{config.label}</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.ready}/{stats.total} ready
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(READINESS_CATEGORIES).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="not_ready">Not Ready</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Checklist Table */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox checked={item.status === 'ready'} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.item}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{READINESS_CATEGORIES[item.category].label}</Badge>
                  </TableCell>
                  <TableCell>{item.owner}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.priority === 'high'
                          ? 'destructive'
                          : item.priority === 'medium'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.dueDate || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === 'ready'
                          ? 'default'
                          : item.status === 'in_progress'
                            ? 'outline'
                            : 'destructive'
                      }
                    >
                      {item.status === 'ready' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {item.status === 'not_ready' && <AlertCircle className="w-3 h-3 mr-1" />}
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

/**
 * SME Directory
 */
function SMEDirectory({ smes }: { smes: SubjectMatterExpert[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Subject Matter Experts</h3>
          <p className="text-sm text-muted-foreground">Key personnel for inspection support</p>
        </div>
        <Button variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Add SME
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {smes.map(sme => (
          <div key={sme.id} className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{sme.name}</h4>
                    <p className="text-sm text-muted-foreground">{sme.role}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sme.expertise.map(exp => (
                        <Badge key={exp} variant="outline" className="text-xs">
                          {exp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {sme.trainingCompleted ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Trained
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Training Needed
                    </Badge>
                  )}
                  {sme.available ? (
                    <Badge variant="outline" className="text-green-600">
                      Available
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600">
                      Unavailable
                    </Badge>
                  )}
                </div>
              </div>
              {sme.backupName && (
                <p className="text-xs text-muted-foreground mt-3">Backup: {sme.backupName}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Findings Tracker
 */
function FindingsTracker({ inspections }: { inspections: InspectionEvent[] }) {
  const allFindings = inspections.flatMap(i =>
    i.findings.map(f => ({ ...f, inspectionId: i.id, inspectionTitle: i.title }))
  );
  const openFindings = allFindings.filter(f => f.status !== 'closed' && f.status !== 'accepted');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Open Findings</h3>
          <p className="text-sm text-muted-foreground">
            {openFindings.length} findings require attention
          </p>
        </div>
      </div>

      {openFindings.length === 0 ? (
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
            <p className="text-muted-foreground">No open findings</p>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Inspection</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openFindings.map(finding => {
              const severityConfig = SEVERITY_CONFIG[finding.severity];
              const daysRemaining = Math.floor(
                (new Date(finding.responseDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              const isOverdue = daysRemaining < 0;

              return (
                <TableRow key={finding.id} className={isOverdue ? 'bg-red-50' : ''}>
                  <TableCell className="font-mono text-sm">{finding.reference}</TableCell>
                  <TableCell className="text-sm">{finding.inspectionTitle}</TableCell>
                  <TableCell className="max-w-xs truncate">{finding.description}</TableCell>
                  <TableCell>
                    <Badge className={severityConfig.color}>{severityConfig.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                      {finding.responseDeadline}
                      {isOverdue && ' (Overdue)'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{finding.status.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Main Inspection Readiness Component
 */
export function InspectionReadiness() {
  const [inspections] = useState<InspectionEvent[]>(MOCK_INSPECTIONS);
  const [readinessItems] = useState<ReadinessItem[]>(MOCK_READINESS);
  const [smes] = useState<SubjectMatterExpert[]>(MOCK_SMES);
  const [selectedInspection, setSelectedInspection] = useState<InspectionEvent | null>(null);

  return (
    <div className="p-6 space-y-6">
      {/* Early Access Banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs">
        <span className="font-semibold px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-xs uppercase tracking-wider">Early Access</span>
        <span>This module displays sample data for demonstration. Live data integration coming soon.</span>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-blue-600" />
            Inspection Readiness
          </h1>
          <p className="text-muted-foreground">Prepare for regulatory inspections and audits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Mock Inspection
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Inspection
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <InspectionMetrics inspections={inspections} readinessItems={readinessItems} />

      {/* Main Content */}
      <Tabs defaultValue="upcoming">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="smes">SMEs</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="backroom">Back Room</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          <InspectionList inspections={inspections} onSelect={setSelectedInspection} />
        </TabsContent>

        <TabsContent value="readiness" className="mt-6">
          <ReadinessChecklist items={readinessItems} />
        </TabsContent>

        <TabsContent value="smes" className="mt-6">
          <SMEDirectory smes={smes} />
        </TabsContent>

        <TabsContent value="findings" className="mt-6">
          <FindingsTracker inspections={inspections} />
        </TabsContent>

        <TabsContent value="backroom" className="mt-6">
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                Back Room Setup
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Resources and materials for inspection support team</p>
            </div>
            <div className="px-3 py-2">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Document Binders</h4>
                  <div className="space-y-2">
                    {[
                      'Quality Manual',
                      'SOPs Index',
                      'Training Records',
                      'Equipment Logs',
                      'Batch Records',
                      'Validation Reports',
                    ].map(doc => (
                      <div
                        key={doc}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded"
                      >
                        <span className="text-sm">{doc}</span>
                        <Badge variant="outline" className="text-green-600">
                          Ready
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-3">Communication</h4>
                  <div className="space-y-3">
                    <div className="border border-border/40 rounded-sm bg-background p-3">
                      <p className="text-sm font-medium">Back Room Hotline</p>
                      <p className="text-lg font-mono">ext. 5555</p>
                    </div>
                    <div className="border border-border/40 rounded-sm bg-background p-3">
                      <p className="text-sm font-medium">Runner Assignments</p>
                      <div className="space-y-1 mt-2">
                        <p className="text-sm">Day 1: Alex Johnson</p>
                        <p className="text-sm">Day 2: Maria Garcia</p>
                        <p className="text-sm">Day 3: Chris Lee</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* RI Assistance */}
      <div className="border border-border/40 rounded-sm bg-background border-purple-200 bg-zinc-50">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-full">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-purple-900">RI Inspection Prep</h3>
              <p className="text-sm text-purple-700">
                Generate inspection-specific document requests, identify documentation gaps, prepare
                Q&A guides, and simulate inspector questions based on historical patterns.
              </p>
            </div>
            <Button variant="outline" className="border-purple-300 text-purple-700">
              Gap Analysis
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700">Mock Interview</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InspectionReadiness;
