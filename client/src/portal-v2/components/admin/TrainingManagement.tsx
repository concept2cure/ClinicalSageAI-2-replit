/**
 * Concept2Cure Client Portal V2 - Training Management System
 *
 * Compliance training management with:
 * - Training curriculum management
 * - User progress tracking
 * - Certification and recertification
 * - Training assignment workflows
 * - Completion reports
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(i), ICH E6(R2)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { adminLogger } from '../../utils/logger';
import {
  GraduationCap,
  BookOpen,
  Award,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Play,
  Pause,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  Upload,
  Users,
  User,
  Target,
  TrendingUp,
  FileText,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart,
  PieChart,
  Settings,
  Mail,
  Bell,
  ExternalLink,
  Video,
  FileQuestion,
  ClipboardCheck,
  Info,
  Star,
  Timer,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type TrainingType = 'onboarding' | 'compliance' | 'system' | 'role_specific' | 'advanced';
type TrainingStatus = 'not_started' | 'in_progress' | 'completed' | 'expired' | 'overdue';
type AssessmentType = 'quiz' | 'practical' | 'certification';
type ContentType = 'video' | 'document' | 'interactive' | 'assessment';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  type: TrainingType;
  durationMinutes: number;
  passingScore: number;
  recertificationDays: number;
  isRequired: boolean;
  isActive: boolean;
  version: string;
  createdAt: Date;
  updatedAt: Date;
  content: TrainingContent[];
  prerequisites: string[];
  roles: string[];
  completionCount: number;
  averageScore: number;
}

interface TrainingContent {
  id: string;
  type: ContentType;
  title: string;
  durationMinutes: number;
  order: number;
  url?: string;
}

interface UserTrainingProgress {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  department: string;
  moduleId: string;
  moduleTitle: string;
  status: TrainingStatus;
  progress: number;
  score?: number;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  dueDate?: Date;
  certificateId?: string;
}

interface TrainingAssignment {
  id: string;
  moduleId: string;
  moduleTitle: string;
  assignedTo: string[];
  assignedBy: string;
  dueDate: Date;
  createdAt: Date;
  remindersSent: number;
  status: 'pending' | 'completed' | 'overdue';
}

interface TrainingStats {
  totalModules: number;
  totalAssignments: number;
  completionRate: number;
  overdueCount: number;
  averageScore: number;
  totalTrainingHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  TrainingType,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  onboarding: {
    label: 'Onboarding',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    icon: Star,
  },
  compliance: {
    label: 'Compliance',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    icon: ClipboardCheck,
  },
  system: {
    label: 'System',
    color: 'text-stone-800',
    bgColor: 'bg-stone-100',
    icon: Settings,
  },
  role_specific: {
    label: 'Role-Specific',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    icon: Target,
  },
  advanced: {
    label: 'Advanced',
    color: 'text-stone-800',
    bgColor: 'bg-stone-100',
    icon: Award,
  },
};

const STATUS_CONFIG: Record<TrainingStatus, { label: string; color: string; bgColor: string }> = {
  not_started: { label: 'Not Started', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  in_progress: { label: 'In Progress', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  completed: { label: 'Completed', color: 'text-stone-700', bgColor: 'bg-stone-100' },
  expired: { label: 'Expired', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  overdue: { label: 'Overdue', color: 'text-stone-700', bgColor: 'bg-stone-100' },
};

const CONTENT_TYPE_ICONS: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  document: FileText,
  interactive: BookOpen,
  assessment: FileQuestion,
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_MODULES: TrainingModule[] = [
  {
    id: 'mod_001',
    title: 'FDA 21 CFR Part 11 Compliance Fundamentals',
    description:
      'Comprehensive training on electronic records and electronic signatures requirements for pharmaceutical and biotech companies.',
    type: 'compliance',
    durationMinutes: 90,
    passingScore: 80,
    recertificationDays: 365,
    isRequired: true,
    isActive: true,
    version: '2.1',
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2025-01-10'),
    content: [
      { id: 'c1', type: 'video', title: 'Introduction to Part 11', durationMinutes: 15, order: 1 },
      {
        id: 'c2',
        type: 'document',
        title: 'Regulatory Framework Overview',
        durationMinutes: 20,
        order: 2,
      },
      {
        id: 'c3',
        type: 'interactive',
        title: 'Electronic Signatures Deep Dive',
        durationMinutes: 25,
        order: 3,
      },
      { id: 'c4', type: 'video', title: 'Audit Trail Requirements', durationMinutes: 15, order: 4 },
      { id: 'c5', type: 'assessment', title: 'Final Assessment', durationMinutes: 15, order: 5 },
    ],
    prerequisites: [],
    roles: ['all'],
    completionCount: 156,
    averageScore: 87,
  },
  {
    id: 'mod_002',
    title: 'Electronic Signature Training',
    description:
      'Learn how to properly apply electronic signatures in accordance with FDA requirements and company SOPs.',
    type: 'compliance',
    durationMinutes: 45,
    passingScore: 85,
    recertificationDays: 365,
    isRequired: true,
    isActive: true,
    version: '1.3',
    createdAt: new Date('2024-08-01'),
    updatedAt: new Date('2025-01-05'),
    content: [
      { id: 'c6', type: 'video', title: 'E-Signature Overview', durationMinutes: 10, order: 1 },
      { id: 'c7', type: 'interactive', title: 'Hands-on Practice', durationMinutes: 20, order: 2 },
      { id: 'c8', type: 'assessment', title: 'Certification Quiz', durationMinutes: 15, order: 3 },
    ],
    prerequisites: ['mod_001'],
    roles: ['all'],
    completionCount: 142,
    averageScore: 91,
  },
  {
    id: 'mod_003',
    title: 'Concept2Cure Platform Onboarding',
    description:
      'Complete onboarding course covering all core features of the Concept2Cure regulatory submission platform.',
    type: 'onboarding',
    durationMinutes: 120,
    passingScore: 75,
    recertificationDays: 0,
    isRequired: true,
    isActive: true,
    version: '3.0',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2025-01-20'),
    content: [
      { id: 'c9', type: 'video', title: 'Platform Overview', durationMinutes: 20, order: 1 },
      {
        id: 'c10',
        type: 'interactive',
        title: 'Navigation & Interface',
        durationMinutes: 30,
        order: 2,
      },
      { id: 'c11', type: 'video', title: 'Document Management', durationMinutes: 25, order: 3 },
      {
        id: 'c12',
        type: 'interactive',
        title: 'Submission Workflows',
        durationMinutes: 30,
        order: 4,
      },
      {
        id: 'c13',
        type: 'assessment',
        title: 'Platform Proficiency Test',
        durationMinutes: 15,
        order: 5,
      },
    ],
    prerequisites: [],
    roles: ['all'],
    completionCount: 189,
    averageScore: 88,
  },
  {
    id: 'mod_004',
    title: 'Regulatory Affairs Specialist Training',
    description:
      'Advanced training for regulatory affairs professionals on IND/NDA submission requirements and best practices.',
    type: 'role_specific',
    durationMinutes: 180,
    passingScore: 80,
    recertificationDays: 730,
    isRequired: false,
    isActive: true,
    version: '2.0',
    createdAt: new Date('2024-03-15'),
    updatedAt: new Date('2024-12-01'),
    content: [
      { id: 'c14', type: 'video', title: 'IND Submission Process', durationMinutes: 40, order: 1 },
      {
        id: 'c15',
        type: 'document',
        title: 'eCTD Module Structure',
        durationMinutes: 30,
        order: 2,
      },
      {
        id: 'c16',
        type: 'interactive',
        title: 'Document Compilation Workshop',
        durationMinutes: 50,
        order: 3,
      },
      {
        id: 'c17',
        type: 'video',
        title: 'FDA Communication Protocols',
        durationMinutes: 30,
        order: 4,
      },
      {
        id: 'c18',
        type: 'assessment',
        title: 'Specialist Certification',
        durationMinutes: 30,
        order: 5,
      },
    ],
    prerequisites: ['mod_001', 'mod_003'],
    roles: ['regulatory_specialist', 'regulatory_manager'],
    completionCount: 45,
    averageScore: 82,
  },
  {
    id: 'mod_005',
    title: 'Data Integrity & GxP Compliance',
    description:
      'Training on data integrity principles and Good Practice regulations across pharmaceutical development.',
    type: 'compliance',
    durationMinutes: 60,
    passingScore: 80,
    recertificationDays: 365,
    isRequired: true,
    isActive: true,
    version: '1.5',
    createdAt: new Date('2024-09-01'),
    updatedAt: new Date('2025-01-15'),
    content: [
      { id: 'c19', type: 'video', title: 'ALCOA+ Principles', durationMinutes: 20, order: 1 },
      {
        id: 'c20',
        type: 'interactive',
        title: 'Data Integrity Scenarios',
        durationMinutes: 25,
        order: 2,
      },
      {
        id: 'c21',
        type: 'assessment',
        title: 'Knowledge Assessment',
        durationMinutes: 15,
        order: 3,
      },
    ],
    prerequisites: ['mod_001'],
    roles: ['all'],
    completionCount: 134,
    averageScore: 85,
  },
];

const MOCK_PROGRESS: UserTrainingProgress[] = [
  {
    userId: 'user_001',
    userName: 'John Smith',
    userEmail: 'john.smith@pharma.com',
    userRole: 'Regulatory Specialist',
    department: 'Regulatory Affairs',
    moduleId: 'mod_001',
    moduleTitle: 'FDA 21 CFR Part 11 Compliance Fundamentals',
    status: 'completed',
    progress: 100,
    score: 92,
    attempts: 1,
    startedAt: new Date('2024-12-01'),
    completedAt: new Date('2024-12-03'),
    expiresAt: new Date('2025-12-03'),
    certificateId: 'cert_001',
  },
  {
    userId: 'user_001',
    userName: 'John Smith',
    userEmail: 'john.smith@pharma.com',
    userRole: 'Regulatory Specialist',
    department: 'Regulatory Affairs',
    moduleId: 'mod_002',
    moduleTitle: 'Electronic Signature Training',
    status: 'completed',
    progress: 100,
    score: 88,
    attempts: 1,
    startedAt: new Date('2024-12-05'),
    completedAt: new Date('2024-12-05'),
    expiresAt: new Date('2025-12-05'),
    certificateId: 'cert_002',
  },
  {
    userId: 'user_002',
    userName: 'Sarah Johnson',
    userEmail: 'sarah.johnson@pharma.com',
    userRole: 'QA Manager',
    department: 'Quality Assurance',
    moduleId: 'mod_001',
    moduleTitle: 'FDA 21 CFR Part 11 Compliance Fundamentals',
    status: 'in_progress',
    progress: 65,
    attempts: 0,
    startedAt: new Date('2025-01-20'),
    dueDate: new Date('2025-02-01'),
  },
  {
    userId: 'user_003',
    userName: 'Mike Chen',
    userEmail: 'mike.chen@pharma.com',
    userRole: 'Clinical Data Manager',
    department: 'Clinical Operations',
    moduleId: 'mod_005',
    moduleTitle: 'Data Integrity & GxP Compliance',
    status: 'overdue',
    progress: 30,
    attempts: 0,
    startedAt: new Date('2025-01-05'),
    dueDate: new Date('2025-01-15'),
  },
  {
    userId: 'user_004',
    userName: 'Lisa Park',
    userEmail: 'lisa.park@pharma.com',
    userRole: 'Regulatory Associate',
    department: 'Regulatory Affairs',
    moduleId: 'mod_003',
    moduleTitle: 'Concept2Cure Platform Onboarding',
    status: 'not_started',
    progress: 0,
    attempts: 0,
    dueDate: new Date('2025-02-15'),
  },
  {
    userId: 'user_005',
    userName: 'Alex Rivera',
    userEmail: 'alex.rivera@pharma.com',
    userRole: 'Regulatory Manager',
    department: 'Regulatory Affairs',
    moduleId: 'mod_001',
    moduleTitle: 'FDA 21 CFR Part 11 Compliance Fundamentals',
    status: 'expired',
    progress: 100,
    score: 85,
    attempts: 1,
    startedAt: new Date('2024-01-10'),
    completedAt: new Date('2024-01-12'),
    expiresAt: new Date('2025-01-12'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING MODULE CARD
// ─────────────────────────────────────────────────────────────────────────────

const TrainingModuleCard: React.FC<{
  module: TrainingModule;
  onViewDetails: (module: TrainingModule) => void;
  onAssign: (module: TrainingModule) => void;
  onEdit: (module: TrainingModule) => void;
}> = ({ module, onViewDetails, onAssign, onEdit }) => {
  const typeConfig = TYPE_CONFIG[module.type];
  const TypeIcon = typeConfig.icon;

  return (
    <Card className={!module.isActive ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
              <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            </div>
            <div>
              <CardTitle className="text-lg">{module.title}</CardTitle>
              <CardDescription className="mt-1">{module.description}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDetails(module)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAssign(module)}>
                <Users className="mr-2 h-4 w-4" />
                Assign Training
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(module)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Module
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge className={`${typeConfig.bgColor} ${typeConfig.color} border-0`}>
            {typeConfig.label}
          </Badge>
          {module.isRequired && <Badge variant="destructive">Required</Badge>}
          {!module.isActive && <Badge variant="secondary">Inactive</Badge>}
          <Badge variant="outline">v{module.version}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span>{module.durationMinutes} minutes</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span>Pass: {module.passingScore}%</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{module.completionCount} completed</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Avg: {module.averageScore}%</span>
          </div>
        </div>

        {module.recertificationDays > 0 && (
          <div className="mt-3 p-2 bg-muted rounded text-sm text-muted-foreground">
            <RefreshCw className="inline h-3 w-3 mr-1" />
            Recertification required every {module.recertificationDays} days
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <div className="flex gap-2 w-full">
          <Button variant="outline" className="flex-1" onClick={() => onViewDetails(module)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
          <Button className="flex-1" onClick={() => onAssign(module)}>
            <Users className="mr-2 h-4 w-4" />
            Assign
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// USER PROGRESS TABLE
// ─────────────────────────────────────────────────────────────────────────────

const UserProgressTable: React.FC<{
  progress: UserTrainingProgress[];
  onSendReminder: (progress: UserTrainingProgress) => void;
  onViewCertificate: (certificateId: string) => void;
}> = ({ progress, onSendReminder, onViewCertificate }) => {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">User</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Module</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Progress</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Due Date</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {progress.map((p, idx) => {
            const statusConfig = STATUS_CONFIG[p.status];
            return (
              <tr key={`${p.userId}-${p.moduleId}-${idx}`} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{p.userName}</p>
                    <p className="text-sm text-muted-foreground">{p.department}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm">{p.moduleTitle}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
                    {statusConfig.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 w-32">
                  <div className="space-y-1">
                    <Progress value={p.progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                      {p.progress}%{p.score !== undefined && ` • Score: ${p.score}%`}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {p.dueDate ? (
                    <p className={`text-sm ${p.status === 'overdue' ? 'text-stone-700' : ''}`}>
                      {p.dueDate.toLocaleDateString()}
                    </p>
                  ) : p.expiresAt ? (
                    <p className={`text-sm ${p.status === 'expired' ? 'text-stone-600' : ''}`}>
                      Expires: {p.expiresAt.toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {(p.status === 'not_started' ||
                      p.status === 'in_progress' ||
                      p.status === 'overdue') && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => onSendReminder(p)}>
                              <Bell className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Send Reminder</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {p.certificateId && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onViewCertificate(p.certificateId!)}
                            >
                              <Award className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Certificate</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {p.status === 'expired' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reassign for Recertification</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STATS OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

const StatsOverview: React.FC<{ stats: TrainingStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
    <Card>
      <CardContent className="p-4 text-center">
        <BookOpen className="h-8 w-8 mx-auto text-stone-600 mb-2" />
        <p className="text-2xl font-bold">{stats.totalModules}</p>
        <p className="text-sm text-muted-foreground">Modules</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 text-center">
        <Users className="h-8 w-8 mx-auto text-stone-600 mb-2" />
        <p className="text-2xl font-bold">{stats.totalAssignments}</p>
        <p className="text-sm text-muted-foreground">Assignments</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 text-center">
        <TrendingUp className="h-8 w-8 mx-auto text-stone-700 mb-2" />
        <p className="text-2xl font-bold">{stats.completionRate}%</p>
        <p className="text-sm text-muted-foreground">Completion</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto text-stone-700 mb-2" />
        <p className="text-2xl font-bold">{stats.overdueCount}</p>
        <p className="text-sm text-muted-foreground">Overdue</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 text-center">
        <Target className="h-8 w-8 mx-auto text-stone-600 mb-2" />
        <p className="text-2xl font-bold">{stats.averageScore}%</p>
        <p className="text-sm text-muted-foreground">Avg Score</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4 text-center">
        <Clock className="h-8 w-8 mx-auto text-stone-600 mb-2" />
        <p className="text-2xl font-bold">{stats.totalTrainingHours}</p>
        <p className="text-sm text-muted-foreground">Hours</p>
      </CardContent>
    </Card>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MODULE DETAILS DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const ModuleDetailsDialog: React.FC<{
  module: TrainingModule | null;
  open: boolean;
  onClose: () => void;
}> = ({ module, open, onClose }) => {
  if (!module) return null;

  const typeConfig = TYPE_CONFIG[module.type];
  const TypeIcon = typeConfig.icon;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${typeConfig.bgColor} ${typeConfig.color} border-0`}>
              {typeConfig.label}
            </Badge>
            {module.isRequired && <Badge variant="destructive">Required</Badge>}
          </div>
          <DialogTitle className="text-xl">{module.title}</DialogTitle>
          <DialogDescription>{module.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Module Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">{module.durationMinutes} minutes</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Passing Score</p>
              <p className="font-medium">{module.passingScore}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium">{module.version}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Recertification</p>
              <p className="font-medium">
                {module.recertificationDays > 0
                  ? `Every ${module.recertificationDays} days`
                  : 'Not required'}
              </p>
            </div>
          </div>

          {/* Content Breakdown */}
          <div className="space-y-3">
            <h4 className="font-semibold">Course Content</h4>
            <div className="space-y-2">
              {module.content.map(content => {
                const ContentIcon = CONTENT_TYPE_ICONS[content.type];
                return (
                  <div
                    key={content.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-muted">
                        <ContentIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{content.title}</p>
                        <p className="text-sm text-muted-foreground capitalize">{content.type}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{content.durationMinutes} min</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prerequisites */}
          {module.prerequisites.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Prerequisites</h4>
              <div className="flex flex-wrap gap-2">
                {module.prerequisites.map(prereq => (
                  <Badge key={prereq} variant="outline">
                    {MOCK_MODULES.find(m => m.id === prereq)?.title || prereq}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="space-y-3">
            <h4 className="font-semibold">Performance Statistics</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Completions</p>
                <p className="text-2xl font-bold">{module.completionCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Average Score</p>
                <p className="text-2xl font-bold">{module.averageScore}%</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const AssignmentDialog: React.FC<{
  module: TrainingModule | null;
  open: boolean;
  onClose: () => void;
  onAssign: (moduleId: string, users: string[], dueDate: Date) => void;
}> = ({ module, open, onClose, onAssign }) => {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  if (!module) return null;

  const handleAssign = async () => {
    if (selectedUsers.length === 0 || !dueDate) return;
    setIsAssigning(true);
    await new Promise(r => setTimeout(r, 800));
    onAssign(module.id, selectedUsers, new Date(dueDate));
    setIsAssigning(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
          <DialogDescription>Assign "{module.title}" to users</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Users</Label>
            <Select value={selectedUsers[0] || ''} onValueChange={v => setSelectedUsers([v])}>
              <SelectTrigger>
                <SelectValue placeholder="Select users to assign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="dept_regulatory">Regulatory Affairs Team</SelectItem>
                <SelectItem value="dept_qa">Quality Assurance Team</SelectItem>
                <SelectItem value="dept_clinical">Clinical Operations Team</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Assigned users will receive email notifications with training instructions. Progress
              will be tracked per FDA 21 CFR Part 11.10(i) requirements.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedUsers.length === 0 || !dueDate || isAssigning}
          >
            {isAssigning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Assign Training
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TRAINING MANAGEMENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const TrainingManagement: React.FC = () => {
  const [modules] = useState<TrainingModule[]>(MOCK_MODULES);
  const [progress] = useState<UserTrainingProgress[]>(MOCK_PROGRESS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('modules');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TrainingType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | 'all'>('all');
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [assigningModule, setAssigningModule] = useState<TrainingModule | null>(null);

  // Calculate stats
  const stats: TrainingStats = useMemo(
    () => ({
      totalModules: modules.filter(m => m.isActive).length,
      totalAssignments: progress.length,
      completionRate: Math.round(
        (progress.filter(p => p.status === 'completed').length / progress.length) * 100
      ),
      overdueCount: progress.filter(p => p.status === 'overdue').length,
      averageScore: Math.round(
        progress.filter(p => p.score).reduce((sum, p) => sum + (p.score || 0), 0) /
          progress.filter(p => p.score).length
      ),
      totalTrainingHours: Math.round(
        modules.reduce((sum, m) => sum + m.completionCount * m.durationMinutes, 0) / 60
      ),
    }),
    [modules, progress]
  );

  // Filter modules
  const filteredModules = useMemo(() => {
    return modules.filter(module => {
      const matchesSearch =
        searchQuery === '' ||
        module.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || module.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [modules, searchQuery, typeFilter]);

  // Filter progress
  const filteredProgress = useMemo(() => {
    return progress.filter(p => {
      const matchesSearch =
        searchQuery === '' ||
        p.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.moduleTitle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [progress, searchQuery, statusFilter]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setIsLoading(false);
  };

  const handleSendReminder = (p: UserTrainingProgress) => {
    adminLogger.info('Training reminder sent', { userName: p.userName });
  };

  const handleViewCertificate = (certificateId: string) => {
    adminLogger.debug('Certificate viewed', { certificateId });
  };

  const handleAssign = (moduleId: string, users: string[], dueDate: Date) => {
    adminLogger.audit('Training assigned', { moduleId, users, dueDate });
  };

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Training Management
          </h1>
          <p className="text-muted-foreground">Manage compliance training and certifications</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Module
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsOverview stats={stats} />

      {/* Overdue Alert */}
      {stats.overdueCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Overdue Training</AlertTitle>
          <AlertDescription>
            {stats.overdueCount} training{' '}
            {stats.overdueCount === 1 ? 'assignment is' : 'assignments are'} overdue. Please review
            and send reminders to affected users.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="modules">Training Modules</TabsTrigger>
          <TabsTrigger value="progress">
            User Progress
            {stats.overdueCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.overdueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search modules..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select
                  value={typeFilter}
                  onValueChange={v => setTypeFilter(v as TrainingType | 'all')}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="role_specific">Role-Specific</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Module Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModules.map(module => (
              <TrainingModuleCard
                key={module.id}
                module={module}
                onViewDetails={setSelectedModule}
                onAssign={setAssigningModule}
                onEdit={() => {}}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users or modules..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={v => setStatusFilter(v as TrainingStatus | 'all')}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Progress Table */}
          <UserProgressTable
            progress={filteredProgress}
            onSendReminder={handleSendReminder}
            onViewCertificate={handleViewCertificate}
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Training Reports</CardTitle>
              <CardDescription>Generate compliance training reports for audits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Button variant="outline" className="h-auto p-4 justify-start">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">Completion Report</p>
                      <p className="text-sm text-muted-foreground">
                        Training completion status by user
                      </p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="h-auto p-4 justify-start">
                  <div className="flex items-center gap-3">
                    <Award className="h-8 w-8 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">Certification Matrix</p>
                      <p className="text-sm text-muted-foreground">
                        Active certifications and expirations
                      </p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="h-auto p-4 justify-start">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">Overdue Report</p>
                      <p className="text-sm text-muted-foreground">Overdue and at-risk training</p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="h-auto p-4 justify-start">
                  <div className="flex items-center gap-3">
                    <BarChart className="h-8 w-8 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">Audit Report</p>
                      <p className="text-sm text-muted-foreground">Full training audit trail</p>
                    </div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Module Details Dialog */}
      <ModuleDetailsDialog
        module={selectedModule}
        open={!!selectedModule}
        onClose={() => setSelectedModule(null)}
      />

      {/* Assignment Dialog */}
      <AssignmentDialog
        module={assigningModule}
        open={!!assigningModule}
        onClose={() => setAssigningModule(null)}
        onAssign={handleAssign}
      />
    </div>
  );
};

export default TrainingManagement;
