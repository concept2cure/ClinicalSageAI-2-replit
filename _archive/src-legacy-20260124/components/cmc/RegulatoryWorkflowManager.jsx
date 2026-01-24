import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  FileText,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  Share2,
  FileCheck,
  CheckSquare,
  GitMerge as Workflow,
  Shield,
  Shield as ShieldCheck,
  User,
  Users,
  Clock,
  Calendar,
  ClipboardCheck,
  BarChart3,
  PlusCircle,
  Eye,
  Edit,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  GitBranch,
  GitMerge,
  GitFork,
  Activity,
  SquarePen,
  BookOpen,
  LockKeyhole,
  Fingerprint,
  History,
  FileQuestion,
  UserCheck,
  FileCog,
  XCircle,
  GitPullRequestDraft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * RegulatoryWorkflowManager
 *
 * Component for managing intelligent, compliant workflows following
 * regulatory processes and procedures for pharmaceutical documentation.
 */
const RegulatoryWorkflowManager = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('activeWorkflows');
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [showNewWorkflowDialog, setShowNewWorkflowDialog] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [userRole, setUserRole] = useState('quality_assurance');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    title: '',
    workflowType: 'documentReview',
    priority: 'medium',
    deadline: '',
    description: '',
    assignees: [],
    documents: [],
    regulatory: [],
  });

  // Sample workflow templates that follow regulated processes
  const workflowTemplates = {
    documentReview: {
      title: 'Document Review',
      stages: [
        {
          id: 'author_creation',
          name: 'Author Creation',
          role: 'author',
          description: 'Initial document creation by assigned author',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
        {
          id: 'peer_review',
          name: 'Peer Review',
          role: 'peer_reviewer',
          description: 'Technical accuracy review by subject matter expert',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10'],
        },
        {
          id: 'qa_review',
          name: 'QA Review',
          role: 'quality_assurance',
          description: 'Quality assurance review for procedural compliance',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10', 'ISO 9001'],
        },
        {
          id: 'regulatory_review',
          name: 'Regulatory Review',
          role: 'regulatory_affairs',
          description: 'Regulatory compliance review',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10', 'ICH M4'],
        },
        {
          id: 'final_approval',
          name: 'Final Approval',
          role: 'approver',
          description: 'Final approval by authorized approver',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10', 'ALCOA+'],
        },
      ],
      metadata: {
        regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q10', 'ICH M4'],
        dataIntegrityPrinciples: ['ALCOA+'],
        auditTrail: true,
        electronicSignatures: true,
        versionControl: true,
      },
    },
    changeControl: {
      title: 'Change Control',
      stages: [
        {
          id: 'change_request',
          name: 'Change Request',
          role: 'requester',
          description: 'Initial request for change with justification',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
        {
          id: 'impact_assessment',
          name: 'Impact Assessment',
          role: 'evaluator',
          description: 'Evaluation of potential impact on quality, safety, and efficacy',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        },
        {
          id: 'qa_review',
          name: 'QA Review',
          role: 'quality_assurance',
          description: 'Quality assurance review of change request and impact assessment',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10'],
        },
        {
          id: 'approval',
          name: 'Approval',
          role: 'approver',
          description: 'Formal approval of change request',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ALCOA+'],
        },
        {
          id: 'implementation',
          name: 'Implementation',
          role: 'implementer',
          description: 'Implementation of approved changes',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
        {
          id: 'verification',
          name: 'Verification',
          role: 'verifier',
          description: 'Verification that changes were implemented correctly',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ALCOA+'],
        },
      ],
      metadata: {
        regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        dataIntegrityPrinciples: ['ALCOA+'],
        auditTrail: true,
        electronicSignatures: true,
        versionControl: true,
        riskBased: true,
      },
    },
    deviationManagement: {
      title: 'Deviation Management',
      stages: [
        {
          id: 'identification',
          name: 'Identification & Recording',
          role: 'identifier',
          description: 'Initial identification and recording of deviation',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
        {
          id: 'initial_assessment',
          name: 'Initial Assessment',
          role: 'evaluator',
          description: 'Initial assessment of deviation severity and impact',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q9'],
        },
        {
          id: 'investigation',
          name: 'Investigation',
          role: 'investigator',
          description: 'Root cause analysis and investigation',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        },
        {
          id: 'capa',
          name: 'CAPA Development',
          role: 'capa_developer',
          description: 'Development of corrective and preventive actions',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        },
        {
          id: 'qa_review',
          name: 'QA Review',
          role: 'quality_assurance',
          description: 'Quality assurance review of investigation and CAPA',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q10'],
        },
        {
          id: 'approval',
          name: 'Approval',
          role: 'approver',
          description: 'Formal approval of investigation and CAPA plan',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ALCOA+'],
        },
        {
          id: 'implementation',
          name: 'CAPA Implementation',
          role: 'implementer',
          description: 'Implementation of approved CAPAs',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
        {
          id: 'effectiveness_verification',
          name: 'Effectiveness Verification',
          role: 'verifier',
          description: 'Verification of CAPA effectiveness',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        },
        {
          id: 'closure',
          name: 'Closure',
          role: 'approver',
          description: 'Final closure of deviation',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ALCOA+'],
        },
      ],
      metadata: {
        regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
        dataIntegrityPrinciples: ['ALCOA+'],
        auditTrail: true,
        electronicSignatures: true,
        versionControl: true,
        riskBased: true,
      },
    },
    regulatorySubmission: {
      title: 'Regulatory Submission',
      stages: [
        {
          id: 'planning',
          name: 'Submission Planning',
          role: 'regulatory_affairs',
          description: 'Planning submission strategy, timeline, and requirements',
          compliantStandards: ['GxP', 'ICH M4'],
        },
        {
          id: 'document_collection',
          name: 'Document Collection',
          role: 'document_collector',
          description: 'Collection and organization of required documents',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
        },
        {
          id: 'review',
          name: 'Review',
          role: 'regulatory_reviewer',
          description: 'Review of submission dossier for completeness and compliance',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
        },
        {
          id: 'publishing',
          name: 'Publishing',
          role: 'publisher',
          description: 'Formatting and publishing of submission in required format',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
        },
        {
          id: 'qc',
          name: 'Quality Control',
          role: 'quality_control',
          description: 'Final quality control check of submission package',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD', 'ALCOA+'],
        },
        {
          id: 'approval',
          name: 'Approval',
          role: 'approver',
          description: 'Final executive approval of submission',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ALCOA+'],
        },
        {
          id: 'submission',
          name: 'Submission',
          role: 'submitter',
          description: 'Formal submission to regulatory authority',
          compliantStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
        },
        {
          id: 'tracking',
          name: 'Tracking & Responses',
          role: 'regulatory_affairs',
          description: 'Tracking submission status and responding to queries',
          compliantStandards: ['GxP', '21 CFR Part 11'],
        },
      ],
      metadata: {
        regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
        dataIntegrityPrinciples: ['ALCOA+'],
        auditTrail: true,
        electronicSignatures: true,
        versionControl: true,
        submissionFormat: 'eCTD',
      },
    },
  };

  // Sample workflow data
  const sampleWorkflows = [
    {
      id: 'wf-001',
      title: 'API Specification Document Review',
      workflowType: 'documentReview',
      initiatedBy: 'Sarah Johnson',
      initiatedDate: '2025-04-10T14:30:00Z',
      status: 'in_progress',
      currentStage: 'qa_review',
      priority: 'high',
      deadline: '2025-04-30T23:59:59Z',
      percentComplete: 60,
      documentIds: ['doc-123', 'doc-124'],
      documents: [
        {
          id: 'doc-123',
          title: 'API Specification',
          version: '1.2',
          documentType: 'specification',
        },
        {
          id: 'doc-124',
          title: 'API Test Methods',
          version: '1.1',
          documentType: 'testing',
        },
      ],
      stageHistory: [
        {
          stage: 'author_creation',
          completedBy: 'Michael Chen',
          role: 'author',
          completedDate: '2025-04-12T09:15:00Z',
          comment: 'Initial draft completed with all required sections',
          electronicSignature: {
            signedBy: 'Michael Chen',
            timestamp: '2025-04-12T09:15:00Z',
            ipAddress: '192.168.1.45',
          },
        },
        {
          stage: 'peer_review',
          completedBy: 'Jennifer Williams',
          role: 'peer_reviewer',
          completedDate: '2025-04-15T16:30:00Z',
          comment:
            'Technical content reviewed and approved. Minor corrections to analytical methods section.',
          electronicSignature: {
            signedBy: 'Jennifer Williams',
            timestamp: '2025-04-15T16:30:00Z',
            ipAddress: '192.168.1.72',
          },
        },
      ],
      nextApprover: {
        name: 'Lisa Parker',
        role: 'quality_assurance',
      },
      regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q6A'],
      auditTrail: [
        {
          action: 'Workflow Initiated',
          timestamp: '2025-04-10T14:30:00Z',
          user: 'Sarah Johnson',
          details: 'Document review workflow initiated for API Specification',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-12T09:15:00Z',
          user: 'Michael Chen',
          details: 'Author Creation stage completed',
        },
        {
          action: 'Document Updated',
          timestamp: '2025-04-14T11:45:00Z',
          user: 'Michael Chen',
          details: 'Document version updated from 1.1 to 1.2',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-15T16:30:00Z',
          user: 'Jennifer Williams',
          details: 'Peer Review stage completed',
        },
      ],
    },
    {
      id: 'wf-002',
      title: 'Manufacturing Process Change Control',
      workflowType: 'changeControl',
      initiatedBy: 'Robert Miller',
      initiatedDate: '2025-04-05T10:15:00Z',
      status: 'in_progress',
      currentStage: 'impact_assessment',
      priority: 'critical',
      deadline: '2025-04-25T23:59:59Z',
      percentComplete: 35,
      documentIds: ['doc-345', 'doc-346'],
      documents: [
        {
          id: 'doc-345',
          title: 'Manufacturing Process Description',
          version: '2.3',
          documentType: 'process',
        },
        {
          id: 'doc-346',
          title: 'Change Request Form',
          version: '1.0',
          documentType: 'change_control',
        },
      ],
      stageHistory: [
        {
          stage: 'change_request',
          completedBy: 'Robert Miller',
          role: 'requester',
          completedDate: '2025-04-05T10:15:00Z',
          comment:
            'Request to update the manufacturing process to improve yield and reduce process time',
          electronicSignature: {
            signedBy: 'Robert Miller',
            timestamp: '2025-04-05T10:15:00Z',
            ipAddress: '192.168.1.58',
          },
        },
      ],
      nextApprover: {
        name: 'David Thompson',
        role: 'evaluator',
      },
      regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q9', 'ICH Q10'],
      auditTrail: [
        {
          action: 'Workflow Initiated',
          timestamp: '2025-04-05T10:15:00Z',
          user: 'Robert Miller',
          details: 'Change control workflow initiated for manufacturing process update',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-05T10:15:00Z',
          user: 'Robert Miller',
          details: 'Change Request stage completed',
        },
        {
          action: 'Document Created',
          timestamp: '2025-04-05T10:20:00Z',
          user: 'Robert Miller',
          details: 'Created Change Request Form document (ID: doc-346)',
        },
      ],
    },
    {
      id: 'wf-003',
      title: 'Stability Testing Deviation Management',
      workflowType: 'deviationManagement',
      initiatedBy: 'Emily Davis',
      initiatedDate: '2025-04-08T09:00:00Z',
      status: 'in_progress',
      currentStage: 'investigation',
      priority: 'medium',
      deadline: '2025-04-28T23:59:59Z',
      percentComplete: 40,
      documentIds: ['doc-567', 'doc-568'],
      documents: [
        {
          id: 'doc-567',
          title: 'Stability Protocol',
          version: '1.4',
          documentType: 'protocol',
        },
        {
          id: 'doc-568',
          title: 'Deviation Report',
          version: '1.0',
          documentType: 'deviation',
        },
      ],
      stageHistory: [
        {
          stage: 'identification',
          completedBy: 'Emily Davis',
          role: 'identifier',
          completedDate: '2025-04-08T09:00:00Z',
          comment:
            'Temperature excursion observed in stability chamber during 6-month testing period',
          electronicSignature: {
            signedBy: 'Emily Davis',
            timestamp: '2025-04-08T09:00:00Z',
            ipAddress: '192.168.1.92',
          },
        },
        {
          stage: 'initial_assessment',
          completedBy: 'Kevin Zhang',
          role: 'evaluator',
          completedDate: '2025-04-10T14:45:00Z',
          comment:
            'Initial assessment shows potential impact on stability results for batches X001 and X002',
          electronicSignature: {
            signedBy: 'Kevin Zhang',
            timestamp: '2025-04-10T14:45:00Z',
            ipAddress: '192.168.1.103',
          },
        },
      ],
      nextApprover: {
        name: 'Amanda Wilson',
        role: 'investigator',
      },
      regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q1A(R2)', 'ICH Q9'],
      auditTrail: [
        {
          action: 'Workflow Initiated',
          timestamp: '2025-04-08T09:00:00Z',
          user: 'Emily Davis',
          details:
            'Deviation management workflow initiated for stability testing temperature excursion',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-08T09:00:00Z',
          user: 'Emily Davis',
          details: 'Identification & Recording stage completed',
        },
        {
          action: 'Document Created',
          timestamp: '2025-04-08T10:30:00Z',
          user: 'Emily Davis',
          details: 'Created Deviation Report document (ID: doc-568)',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-10T14:45:00Z',
          user: 'Kevin Zhang',
          details: 'Initial Assessment stage completed',
        },
      ],
    },
    {
      id: 'wf-004',
      title: 'Drug Product NDA Submission',
      workflowType: 'regulatorySubmission',
      initiatedBy: 'Lisa Roberts',
      initiatedDate: '2025-03-15T11:30:00Z',
      status: 'in_progress',
      currentStage: 'review',
      priority: 'high',
      deadline: '2025-05-15T23:59:59Z',
      percentComplete: 65,
      documentIds: ['doc-789', 'doc-790', 'doc-791'],
      documents: [
        {
          id: 'doc-789',
          title: 'eCTD Module 3 Quality',
          version: '1.0',
          documentType: 'regulatory',
        },
        {
          id: 'doc-790',
          title: 'Module 2.3 Quality Overall Summary',
          version: '1.0',
          documentType: 'regulatory',
        },
        {
          id: 'doc-791',
          title: 'Submission Plan',
          version: '2.1',
          documentType: 'planning',
        },
      ],
      stageHistory: [
        {
          stage: 'planning',
          completedBy: 'Lisa Roberts',
          role: 'regulatory_affairs',
          completedDate: '2025-03-20T15:45:00Z',
          comment: 'Submission strategy and timeline finalized, target for Q2 2025 submission',
          electronicSignature: {
            signedBy: 'Lisa Roberts',
            timestamp: '2025-03-20T15:45:00Z',
            ipAddress: '192.168.1.62',
          },
        },
        {
          stage: 'document_collection',
          completedBy: 'James Taylor',
          role: 'document_collector',
          completedDate: '2025-04-10T09:30:00Z',
          comment: 'All required documents collected and organized according to eCTD structure',
          electronicSignature: {
            signedBy: 'James Taylor',
            timestamp: '2025-04-10T09:30:00Z',
            ipAddress: '192.168.1.84',
          },
        },
      ],
      nextApprover: {
        name: 'Michelle Johnson',
        role: 'regulatory_reviewer',
      },
      regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH M4', 'eCTD'],
      auditTrail: [
        {
          action: 'Workflow Initiated',
          timestamp: '2025-03-15T11:30:00Z',
          user: 'Lisa Roberts',
          details: 'Regulatory submission workflow initiated for Drug Product NDA',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-03-20T15:45:00Z',
          user: 'Lisa Roberts',
          details: 'Submission Planning stage completed',
        },
        {
          action: 'Document Updated',
          timestamp: '2025-03-25T14:20:00Z',
          user: 'Lisa Roberts',
          details: 'Submission Plan updated to version 2.1',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-10T09:30:00Z',
          user: 'James Taylor',
          details: 'Document Collection stage completed',
        },
      ],
    },
    {
      id: 'wf-005',
      title: 'Method Validation Protocol Review',
      workflowType: 'documentReview',
      initiatedBy: 'David Thompson',
      initiatedDate: '2025-04-12T13:45:00Z',
      status: 'completed',
      currentStage: 'final_approval',
      priority: 'medium',
      deadline: '2025-04-22T23:59:59Z',
      percentComplete: 100,
      completedDate: '2025-04-20T10:30:00Z',
      documentIds: ['doc-234'],
      documents: [
        {
          id: 'doc-234',
          title: 'HPLC Method Validation Protocol',
          version: '2.0',
          documentType: 'protocol',
        },
      ],
      stageHistory: [
        {
          stage: 'author_creation',
          completedBy: 'David Thompson',
          role: 'author',
          completedDate: '2025-04-13T11:30:00Z',
          comment: 'Protocol drafted according to ICH Q2(R1) guidelines',
          electronicSignature: {
            signedBy: 'David Thompson',
            timestamp: '2025-04-13T11:30:00Z',
            ipAddress: '192.168.1.58',
          },
        },
        {
          stage: 'peer_review',
          completedBy: 'Kevin Zhang',
          role: 'peer_reviewer',
          completedDate: '2025-04-15T09:45:00Z',
          comment: 'Technical content reviewed, acceptance criteria aligned with current standards',
          electronicSignature: {
            signedBy: 'Kevin Zhang',
            timestamp: '2025-04-15T09:45:00Z',
            ipAddress: '192.168.1.103',
          },
        },
        {
          stage: 'qa_review',
          completedBy: 'Amanda Wilson',
          role: 'quality_assurance',
          completedDate: '2025-04-17T14:20:00Z',
          comment: 'QA review complete, protocol complies with SOP-VAL-001',
          electronicSignature: {
            signedBy: 'Amanda Wilson',
            timestamp: '2025-04-17T14:20:00Z',
            ipAddress: '192.168.1.115',
          },
        },
        {
          stage: 'regulatory_review',
          completedBy: 'Lisa Roberts',
          role: 'regulatory_affairs',
          completedDate: '2025-04-19T11:05:00Z',
          comment: 'Regulatory review complete, protocol meets ICH and FDA requirements',
          electronicSignature: {
            signedBy: 'Lisa Roberts',
            timestamp: '2025-04-19T11:05:00Z',
            ipAddress: '192.168.1.62',
          },
        },
        {
          stage: 'final_approval',
          completedBy: 'Sarah Johnson',
          role: 'approver',
          completedDate: '2025-04-20T10:30:00Z',
          comment: 'Protocol approved for implementation',
          electronicSignature: {
            signedBy: 'Sarah Johnson',
            timestamp: '2025-04-20T10:30:00Z',
            ipAddress: '192.168.1.45',
          },
        },
      ],
      nextApprover: null,
      regulatoryStandards: ['GxP', '21 CFR Part 11', 'ICH Q2(R1)'],
      auditTrail: [
        {
          action: 'Workflow Initiated',
          timestamp: '2025-04-12T13:45:00Z',
          user: 'David Thompson',
          details: 'Document review workflow initiated for HPLC Method Validation Protocol',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-13T11:30:00Z',
          user: 'David Thompson',
          details: 'Author Creation stage completed',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-15T09:45:00Z',
          user: 'Kevin Zhang',
          details: 'Peer Review stage completed',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-17T14:20:00Z',
          user: 'Amanda Wilson',
          details: 'QA Review stage completed',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-19T11:05:00Z',
          user: 'Lisa Roberts',
          details: 'Regulatory Review stage completed',
        },
        {
          action: 'Stage Completed',
          timestamp: '2025-04-20T10:30:00Z',
          user: 'Sarah Johnson',
          details: 'Final Approval stage completed',
        },
        {
          action: 'Workflow Completed',
          timestamp: '2025-04-20T10:30:00Z',
          user: 'Sarah Johnson',
          details: 'Document review workflow completed',
        },
      ],
    },
  ];

  // Load sample workflows on component mount
  useEffect(() => {
    setWorkflows(sampleWorkflows);
  }, []);

  // Filter workflows based on search query and status filter
  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch =
      searchQuery === '' ||
      workflow.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.workflowType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && workflow.status === 'in_progress') ||
      (filterStatus === 'completed' && workflow.status === 'completed');

    return matchesSearch && matchesStatus;
  });

  // Count workflows by type for dashboard
  const workflowCounts = {
    total: workflows.length,
    active: workflows.filter(w => w.status === 'in_progress').length,
    completed: workflows.filter(w => w.status === 'completed').length,
    byType: {
      documentReview: workflows.filter(w => w.workflowType === 'documentReview').length,
      changeControl: workflows.filter(w => w.workflowType === 'changeControl').length,
      deviationManagement: workflows.filter(w => w.workflowType === 'deviationManagement').length,
      regulatorySubmission: workflows.filter(w => w.workflowType === 'regulatorySubmission').length,
    },
  };

  // Function to handle workflow approval
  const handleApproveWorkflow = workflowId => {
    if (!approvalComment.trim()) {
      toast({
        title: 'Comment Required',
        description: 'Please provide a comment for this approval step.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      // Update workflow with approval
      const updatedWorkflows = workflows.map(workflow => {
        if (workflow.id === workflowId) {
          // Find current stage and template for next stage
          const currentStageId = workflow.currentStage;
          const workflowTemplate = workflowTemplates[workflow.workflowType];
          const stageIndex = workflowTemplate.stages.findIndex(s => s.id === currentStageId);

          // Determine if this is the last stage
          const isLastStage = stageIndex === workflowTemplate.stages.length - 1;

          // Create stage history entry
          const newStageHistory = [
            ...workflow.stageHistory,
            {
              stage: currentStageId,
              completedBy: 'Current User', // In a real app, this would be the actual user name
              role: userRole,
              completedDate: new Date().toISOString(),
              comment: approvalComment,
              electronicSignature: {
                signedBy: 'Current User',
                timestamp: new Date().toISOString(),
                ipAddress: '192.168.1.100', // Simulated IP
              },
            },
          ];

          // Create audit trail entry
          const newAuditTrail = [
            ...workflow.auditTrail,
            {
              action: 'Stage Completed',
              timestamp: new Date().toISOString(),
              user: 'Current User',
              details: `${workflowTemplate.stages[stageIndex].name} stage completed`,
            },
          ];

          // If last stage, add workflow completion audit entry
          if (isLastStage) {
            newAuditTrail.push({
              action: 'Workflow Completed',
              timestamp: new Date().toISOString(),
              user: 'Current User',
              details: `${workflow.workflowType} workflow completed`,
            });
          }

          // Update workflow
          return {
            ...workflow,
            currentStage: isLastStage ? currentStageId : workflowTemplate.stages[stageIndex + 1].id,
            status: isLastStage ? 'completed' : 'in_progress',
            percentComplete: isLastStage
              ? 100
              : Math.round(((stageIndex + 1) / workflowTemplate.stages.length) * 100),
            completedDate: isLastStage ? new Date().toISOString() : undefined,
            stageHistory: newStageHistory,
            auditTrail: newAuditTrail,
            nextApprover: isLastStage
              ? null
              : {
                  name: 'Next Approver', // Would be determined by system/role in a real app
                  role: workflowTemplate.stages[stageIndex + 1].role,
                },
          };
        }
        return workflow;
      });

      setWorkflows(updatedWorkflows);
      setApprovalComment('');
      setShowApprovalDialog(false);
      setLoading(false);

      toast({
        title: 'Stage Approved',
        description: 'Your approval has been recorded and the workflow has been advanced.',
      });
    }, 1500);
  };

  // Function to handle creation of new workflow
  const handleCreateWorkflow = () => {
    if (!newWorkflow.title.trim() || !newWorkflow.workflowType || !newWorkflow.deadline) {
      toast({
        title: 'Required Fields Missing',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      // Generate new workflow
      const workflowTemplate = workflowTemplates[newWorkflow.workflowType];

      const newId = `wf-${String(workflows.length + 1).padStart(3, '0')}`;
      const currentDate = new Date().toISOString();

      const createdWorkflow = {
        id: newId,
        title: newWorkflow.title,
        workflowType: newWorkflow.workflowType,
        initiatedBy: 'Current User', // In a real app, this would be the actual user name
        initiatedDate: currentDate,
        status: 'in_progress',
        currentStage: workflowTemplate.stages[0].id,
        priority: newWorkflow.priority,
        deadline: new Date(newWorkflow.deadline).toISOString(),
        percentComplete: 0,
        documentIds: [],
        documents: [],
        stageHistory: [],
        nextApprover: {
          name: 'Assigned Approver', // Would be determined by system/role in a real app
          role: workflowTemplate.stages[0].role,
        },
        regulatoryStandards: workflowTemplate.metadata.regulatoryStandards,
        auditTrail: [
          {
            action: 'Workflow Initiated',
            timestamp: currentDate,
            user: 'Current User',
            details: `${workflowTemplate.title} workflow initiated: ${newWorkflow.title}`,
          },
        ],
      };

      // Add to workflows
      setWorkflows([...workflows, createdWorkflow]);

      // Reset form
      setNewWorkflow({
        title: '',
        workflowType: 'documentReview',
        priority: 'medium',
        deadline: '',
        description: '',
        assignees: [],
        documents: [],
        regulatory: [],
      });

      setShowNewWorkflowDialog(false);
      setLoading(false);

      toast({
        title: 'Workflow Created',
        description: `${workflowTemplate.title} workflow has been initiated successfully.`,
      });
    }, 1500);
  };

  // Format date for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get workflow type display name
  const getWorkflowTypeDisplay = type => {
    switch (type) {
      case 'documentReview':
        return 'Document Review';
      case 'changeControl':
        return 'Change Control';
      case 'deviationManagement':
        return 'Deviation Management';
      case 'regulatorySubmission':
        return 'Regulatory Submission';
      default:
        return type;
    }
  };

  // Get current stage display name
  const getCurrentStageDisplay = workflow => {
    const template = workflowTemplates[workflow.workflowType];
    if (!template) return workflow.currentStage;

    const stage = template.stages.find(s => s.id === workflow.currentStage);
    return stage ? stage.name : workflow.currentStage;
  };

  // Get status badge
  const getStatusBadge = status => {
    switch (status) {
      case 'in_progress':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            In Progress
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Completed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            Pending
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            {status}
          </Badge>
        );
    }
  };

  // Get priority badge
  const getPriorityBadge = priority => {
    switch (priority) {
      case 'critical':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
            Critical
          </Badge>
        );
      case 'high':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Low
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            {priority}
          </Badge>
        );
    }
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Regulatory Workflow Manager
            </CardTitle>
            <CardDescription className="text-gray-300 dark:text-gray-700">
              Intelligent workflow management compliant with regulatory processes and procedures
            </CardDescription>
          </div>
          <div>
            <Button
              onClick={() => setShowNewWorkflowDialog(true)}
              className="bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
            >
              <GitFork className="h-4 w-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="dashboard" className="flex-1">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="activeWorkflows" className="flex-1">
              Active Workflows
            </TabsTrigger>
            <TabsTrigger value="myTasks" className="flex-1">
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">
              Completed
            </TabsTrigger>
            <TabsTrigger value="compliance" className="flex-1">
              Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Active Workflows
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">{workflowCounts.active}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Completed This Month
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">{workflowCounts.completed}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Tasks Due Soon
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">3</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    Compliance Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">98%</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Workflow Distribution</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Document Reviews</span>
                        <span>{workflowCounts.byType.documentReview}</span>
                      </div>
                      <Progress
                        value={(workflowCounts.byType.documentReview / workflowCounts.total) * 100}
                        className="h-2"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Change Controls</span>
                        <span>{workflowCounts.byType.changeControl}</span>
                      </div>
                      <Progress
                        value={(workflowCounts.byType.changeControl / workflowCounts.total) * 100}
                        className="h-2"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Deviation Management</span>
                        <span>{workflowCounts.byType.deviationManagement}</span>
                      </div>
                      <Progress
                        value={
                          (workflowCounts.byType.deviationManagement / workflowCounts.total) * 100
                        }
                        className="h-2"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Regulatory Submissions</span>
                        <span>{workflowCounts.byType.regulatorySubmission}</span>
                      </div>
                      <Progress
                        value={
                          (workflowCounts.byType.regulatorySubmission / workflowCounts.total) * 100
                        }
                        className="h-2"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tasks Requiring Attention</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workflow</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflows
                        .filter(
                          wf => wf.status === 'in_progress' && wf.nextApprover?.role === userRole
                        )
                        .slice(0, 3)
                        .map(workflow => (
                          <TableRow key={workflow.id}>
                            <TableCell className="font-medium">{workflow.title}</TableCell>
                            <TableCell>{getCurrentStageDisplay(workflow)}</TableCell>
                            <TableCell>{formatDate(workflow.deadline)}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWorkflow(workflow);
                                  setShowApprovalDialog(true);
                                }}
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}

                      {workflows.filter(
                        wf => wf.status === 'in_progress' && wf.nextApprover?.role === userRole
                      ).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-gray-500 dark:text-gray-400"
                          >
                            No tasks requiring your attention
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Compliance KPIs</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium">On-Time Completion</div>
                      <div className="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">
                        95%
                      </div>
                      <Progress value={95} className="h-1.5 mt-1" />
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Target: 90%
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="text-sm font-medium">Average Approval Time</div>
                      <div className="text-3xl font-bold mt-1">2.3 days</div>
                      <Progress value={80} className="h-1.5 mt-1" />
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Target: 3 days
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="text-sm font-medium">Required Signatures</div>
                      <div className="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">
                        100%
                      </div>
                      <Progress value={100} className="h-1.5 mt-1" />
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Target: 100%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activeWorkflows" className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search workflows..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="completed">Completed Only</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('all');
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkflows
                    .sort((a, b) => new Date(b.initiatedDate) - new Date(a.initiatedDate))
                    .map(workflow => (
                      <TableRow key={workflow.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {workflow.workflowType === 'documentReview' && (
                              <FileText className="h-4 w-4 text-blue-600" />
                            )}
                            {workflow.workflowType === 'changeControl' && (
                              <GitFork className="h-4 w-4 text-indigo-600" />
                            )}
                            {workflow.workflowType === 'deviationManagement' && (
                              <FileQuestion className="h-4 w-4 text-amber-600" />
                            )}
                            {workflow.workflowType === 'regulatorySubmission' && (
                              <BookOpen className="h-4 w-4 text-green-600" />
                            )}
                            <span>{workflow.title}</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Initiated {formatDate(workflow.initiatedDate)}
                          </span>
                        </TableCell>
                        <TableCell>{getWorkflowTypeDisplay(workflow.workflowType)}</TableCell>
                        <TableCell>{getCurrentStageDisplay(workflow)}</TableCell>
                        <TableCell>{getStatusBadge(workflow.status)}</TableCell>
                        <TableCell>{getPriorityBadge(workflow.priority)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={workflow.percentComplete} className="h-2 w-[60px]" />
                            <span className="text-xs">{workflow.percentComplete}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(workflow.deadline)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedWorkflow(workflow);
                                setExpandedWorkflow(workflow.id);
                                setShowWorkflowDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {workflow.status === 'in_progress' &&
                              workflow.nextApprover?.role === userRole && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 dark:text-green-400"
                                  onClick={() => {
                                    setSelectedWorkflow(workflow);
                                    setShowApprovalDialog(true);
                                  }}
                                >
                                  <CheckSquare className="h-4 w-4" />
                                </Button>
                              )}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 dark:text-blue-400"
                              onClick={() => {
                                setSelectedWorkflow(workflow);
                                setShowAuditDialog(true);
                              }}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                  {filteredWorkflows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-gray-500 dark:text-gray-400 py-6"
                      >
                        <div className="flex flex-col items-center">
                          <Workflow className="h-10 w-10 text-gray-300 dark:text-gray-700 mb-2" />
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            No workflows found
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-4">
                            Try adjusting your filters or create a new workflow
                          </p>
                          <Button onClick={() => setShowNewWorkflowDialog(true)}>
                            <GitFork className="h-4 w-4 mr-2" />
                            Create New Workflow
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredWorkflows.length} of {workflows.length} workflows
              </div>
              <div>
                <Button variant="outline" onClick={() => setShowNewWorkflowDialog(true)}>
                  <GitFork className="h-4 w-4 mr-2" />
                  Create New Workflow
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="myTasks" className="p-6 space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Tasks Assigned to Me</h3>
              <Select value={userRole} onValueChange={setUserRole}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="author">Author</SelectItem>
                  <SelectItem value="peer_reviewer">Peer Reviewer</SelectItem>
                  <SelectItem value="quality_assurance">Quality Assurance</SelectItem>
                  <SelectItem value="regulatory_affairs">Regulatory Affairs</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {workflows
                .filter(wf => wf.status === 'in_progress' && wf.nextApprover?.role === userRole)
                .map(workflow => (
                  <Card key={workflow.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between">
                        <div>
                          <CardTitle className="text-lg">{workflow.title}</CardTitle>
                          <CardDescription>
                            {getWorkflowTypeDisplay(workflow)} • {getCurrentStageDisplay(workflow)}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getStatusBadge(workflow.status)}
                          {getPriorityBadge(workflow.priority)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Progress:</span>
                          <span>{workflow.percentComplete}% Complete</span>
                        </div>
                        <Progress value={workflow.percentComplete} className="h-2" />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block">
                              Due Date:
                            </span>
                            <span className="font-medium">{formatDate(workflow.deadline)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block">
                              Your Role:
                            </span>
                            <span className="font-medium capitalize">
                              {userRole.replace('_', ' ')}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block">
                              Action Required:
                            </span>
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              Review and Approve
                            </span>
                          </div>
                        </div>

                        {workflow.documents.length > 0 && (
                          <div className="mt-3">
                            <h4 className="text-sm font-medium mb-2">Related Documents:</h4>
                            <div className="space-y-2">
                              {workflow.documents.map(doc => (
                                <div
                                  key={doc.id}
                                  className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded"
                                >
                                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                  <div>
                                    <div className="text-sm font-medium">{doc.title}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      v{doc.version} • {doc.documentType}
                                    </div>
                                  </div>

                                  <Button variant="ghost" size="sm" className="ml-auto">
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    View
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="border-t pt-3 flex justify-between">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedWorkflow(workflow);
                          setShowWorkflowDetails(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>

                      <Button
                        onClick={() => {
                          setSelectedWorkflow(workflow);
                          setShowApprovalDialog(true);
                        }}
                      >
                        <CheckSquare className="h-4 w-4 mr-2" />
                        Review & Approve
                      </Button>
                    </CardFooter>
                  </Card>
                ))}

              {workflows.filter(
                wf => wf.status === 'in_progress' && wf.nextApprover?.role === userRole
              ).length === 0 && (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    No Tasks Pending
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                    You have no pending tasks requiring your attention. Change your role to view
                    tasks assigned to different roles.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="completed" className="p-6 space-y-6">
            <Alert className="bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-100 border-green-200 dark:border-green-900">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>All workflows completed with electronic signatures</AlertTitle>
              <AlertDescription>
                These workflows have been completed following 21 CFR Part 11 compliance for
                electronic signatures and are securely stored with comprehensive audit trails.
              </AlertDescription>
            </Alert>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Final Approver</TableHead>
                    <TableHead>Completion Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows
                    .filter(wf => wf.status === 'completed')
                    .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))
                    .map(workflow => (
                      <TableRow key={workflow.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {workflow.workflowType === 'documentReview' && (
                              <FileText className="h-4 w-4 text-blue-600" />
                            )}
                            {workflow.workflowType === 'changeControl' && (
                              <GitFork className="h-4 w-4 text-indigo-600" />
                            )}
                            {workflow.workflowType === 'deviationManagement' && (
                              <FileQuestion className="h-4 w-4 text-amber-600" />
                            )}
                            {workflow.workflowType === 'regulatorySubmission' && (
                              <BookOpen className="h-4 w-4 text-green-600" />
                            )}
                            <span>{workflow.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getWorkflowTypeDisplay(workflow.workflowType)}</TableCell>
                        <TableCell>
                          {workflow.stageHistory && workflow.stageHistory.length > 0
                            ? workflow.stageHistory[workflow.stageHistory.length - 1].completedBy
                            : 'Unknown'}
                        </TableCell>
                        <TableCell>{formatDate(workflow.completedDate)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedWorkflow(workflow);
                                setShowWorkflowDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 dark:text-blue-400"
                              onClick={() => {
                                setSelectedWorkflow(workflow);
                                setShowAuditDialog(true);
                              }}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-600 dark:text-gray-400"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                  {workflows.filter(wf => wf.status === 'completed').length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-gray-500 dark:text-gray-400 py-6"
                      >
                        No completed workflows found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="compliance" className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Compliance Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">98%</div>
                  <Progress value={98} className="h-1.5 mt-1" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-blue-600" />
                    E-Signatures
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">100%</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    21 CFR Part 11 Compliant
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <History className="h-4 w-4 text-indigo-600" />
                    Audit Trail Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">100%</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Complete Record Retention
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4 text-amber-600" />
                    Data Integrity
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">ALCOA+</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fully Implemented
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Regulatory Standards Compliance</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-medium">21 CFR Part 11</span>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Compliant
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Electronic records and signatures meet all requirements for closed systems
                      including validation, audit trails, record retention, and system security.
                    </div>
                    <Accordion type="single" collapsible className="border rounded-md">
                      <AccordionItem value="details-1">
                        <AccordionTrigger className="px-4">Implementation Details</AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 text-sm">
                          <div className="space-y-2">
                            <p>
                              <strong>System Validation:</strong> Validated according to SOP-IT-001
                            </p>
                            <p>
                              <strong>Electronic Signatures:</strong> Username, timestamp, and
                              purpose, with unique credentials and biometric verification
                            </p>
                            <p>
                              <strong>Record Retention:</strong> All records maintained with
                              complete audit history for full product lifecycle
                            </p>
                            <p>
                              <strong>System Controls:</strong> Role-based access, automatic
                              logouts, and security monitoring
                            </p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-medium">ICH Q9 (Quality Risk Management)</span>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Compliant
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Risk assessment integrated throughout all workflows with formal risk
                      evaluation, control, communication, and review procedures.
                    </div>
                    <Accordion type="single" collapsible className="border rounded-md">
                      <AccordionItem value="details-2">
                        <AccordionTrigger className="px-4">Implementation Details</AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 text-sm">
                          <div className="space-y-2">
                            <p>
                              <strong>Risk Assessment:</strong> FMEA and HACCP methodologies
                              incorporated in change control and deviation workflows
                            </p>
                            <p>
                              <strong>Risk Control:</strong> Mitigation strategies with verification
                              steps
                            </p>
                            <p>
                              <strong>Risk Review:</strong> Periodic risk review processes with
                              documented outcomes
                            </p>
                            <p>
                              <strong>Risk Communication:</strong> Automated notification and
                              escalation pathways
                            </p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-medium">ALCOA+ Principles</span>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Compliant
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Data integrity ensured through Attributable, Legible, Contemporaneous,
                      Original, Accurate, Complete, Consistent, Enduring, and Available principles.
                    </div>
                    <Accordion type="single" collapsible className="border rounded-md">
                      <AccordionItem value="details-3">
                        <AccordionTrigger className="px-4">Implementation Details</AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 text-sm">
                          <div className="space-y-2">
                            <p>
                              <strong>Attributable:</strong> All actions tracked with username,
                              timestamp, and purpose
                            </p>
                            <p>
                              <strong>Legible:</strong> Human-readable formats with consistent
                              templates
                            </p>
                            <p>
                              <strong>Contemporaneous:</strong> Real-time recording with automated
                              timestamps
                            </p>
                            <p>
                              <strong>Original:</strong> Source data preserved with all subsequent
                              changes tracked
                            </p>
                            <p>
                              <strong>Accurate:</strong> Validation checks and verification steps
                            </p>
                            <p>
                              <strong>Complete:</strong> Required field validation and completeness
                              checks
                            </p>
                            <p>
                              <strong>Consistent:</strong> Standardized formats and controlled
                              vocabularies
                            </p>
                            <p>
                              <strong>Enduring:</strong> Secure long-term storage with backup and
                              recovery
                            </p>
                            <p>
                              <strong>Available:</strong> Accessible through secure, role-based
                              permissions
                            </p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Validation Status</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Validation Component</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Validated</TableHead>
                      <TableHead>Next Review</TableHead>
                      <TableHead className="text-right">Documentation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCog className="h-4 w-4 text-gray-600" />
                          <span>User Requirements</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          Approved
                        </Badge>
                      </TableCell>
                      <TableCell>Jan 15, 2025</TableCell>
                      <TableCell>Jan 15, 2026</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          URS-001
                        </Button>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCog className="h-4 w-4 text-gray-600" />
                          <span>Functional Specification</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          Approved
                        </Badge>
                      </TableCell>
                      <TableCell>Feb 10, 2025</TableCell>
                      <TableCell>Feb 10, 2026</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          FS-001
                        </Button>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCog className="h-4 w-4 text-gray-600" />
                          <span>IQ/OQ/PQ Testing</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          Approved
                        </Badge>
                      </TableCell>
                      <TableCell>Mar 05, 2025</TableCell>
                      <TableCell>Mar 05, 2026</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          VAL-001
                        </Button>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCog className="h-4 w-4 text-gray-600" />
                          <span>Traceability Matrix</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          Approved
                        </Badge>
                      </TableCell>
                      <TableCell>Mar 05, 2025</TableCell>
                      <TableCell>Mar 05, 2026</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          RTM-001
                        </Button>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCog className="h-4 w-4 text-gray-600" />
                          <span>Validation Summary Report</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          Approved
                        </Badge>
                      </TableCell>
                      <TableCell>Mar 20, 2025</TableCell>
                      <TableCell>Mar 20, 2026</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          VSR-001
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Workflow Details Dialog */}
      <Dialog open={showWorkflowDetails} onOpenChange={setShowWorkflowDetails}>
        <DialogContent className="max-w-5xl">
          {selectedWorkflow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  {selectedWorkflow.workflowType === 'documentReview' && (
                    <FileText className="h-5 w-5 text-blue-600" />
                  )}
                  {selectedWorkflow.workflowType === 'changeControl' && (
                    <GitFork className="h-5 w-5 text-indigo-600" />
                  )}
                  {selectedWorkflow.workflowType === 'deviationManagement' && (
                    <FileQuestion className="h-5 w-5 text-amber-600" />
                  )}
                  {selectedWorkflow.workflowType === 'regulatorySubmission' && (
                    <BookOpen className="h-5 w-5 text-green-600" />
                  )}
                  {selectedWorkflow.title}
                </DialogTitle>
                <DialogDescription>
                  {getWorkflowTypeDisplay(selectedWorkflow.workflowType)} • Initiated on{' '}
                  {formatDate(selectedWorkflow.initiatedDate)} by {selectedWorkflow.initiatedBy}
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-6">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium">Status:</span>
                  {getStatusBadge(selectedWorkflow.status)}

                  <span className="text-sm font-medium ml-4">Priority:</span>
                  {getPriorityBadge(selectedWorkflow.priority)}

                  <span className="text-sm font-medium ml-4">Deadline:</span>
                  <span className="text-sm">{formatDate(selectedWorkflow.deadline)}</span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Workflow Progress</h4>
                  <Progress value={selectedWorkflow.percentComplete} className="h-2" />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Initiated</span>
                    <span>Completion</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Workflow Stages</h4>

                    <div className="border rounded-md overflow-hidden">
                      {workflowTemplates[selectedWorkflow.workflowType]?.stages.map(
                        (stage, index) => {
                          const stageHistory = selectedWorkflow.stageHistory?.find(
                            h => h.stage === stage.id
                          );
                          const isCurrentStage = selectedWorkflow.currentStage === stage.id;
                          const isFutureStage = !stageHistory && !isCurrentStage;

                          return (
                            <div
                              key={stage.id}
                              className={`p-3 flex items-start gap-3 border-b last:border-b-0 ${
                                isCurrentStage
                                  ? 'bg-blue-50 dark:bg-blue-950/30'
                                  : stageHistory
                                    ? 'bg-green-50 dark:bg-green-950/30'
                                    : 'bg-gray-50 dark:bg-gray-900'
                              }`}
                            >
                              <div className="mt-0.5">
                                {stageHistory ? (
                                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                                ) : isCurrentStage ? (
                                  <GitPullRequestDraft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <Circle
                                    className={`h-5 w-5 text-gray-300 dark:text-gray-700 ${index > 0 ? '' : ''}`}
                                  />
                                )}
                              </div>

                              <div className="flex-1">
                                <div className="flex justify-between">
                                  <div className="font-medium">{stage.name}</div>
                                  <div>
                                    {stageHistory && (
                                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                        Completed
                                      </Badge>
                                    )}
                                    {isCurrentStage && (
                                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                                        Current
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {stage.description}
                                </div>

                                {stageHistory && (
                                  <div className="mt-2 text-sm">
                                    <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
                                      <UserCheck className="h-3.5 w-3.5" />
                                      <span className="font-medium">
                                        {stageHistory.completedBy}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {new Date(stageHistory.completedDate).toLocaleString()}
                                    </div>
                                    <div className="mt-1 p-2 bg-white dark:bg-gray-800 rounded border text-xs">
                                      {stageHistory.comment}
                                    </div>
                                  </div>
                                )}

                                {isCurrentStage && selectedWorkflow.nextApprover && (
                                  <div className="mt-2 flex items-center">
                                    <Badge
                                      variant="outline"
                                      className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 flex items-center gap-1"
                                    >
                                      <User className="h-3 w-3" />
                                      <span>Awaiting: {selectedWorkflow.nextApprover.name}</span>
                                    </Badge>

                                    {selectedWorkflow.nextApprover.role === userRole && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-auto"
                                        onClick={() => {
                                          setShowWorkflowDetails(false);
                                          setShowApprovalDialog(true);
                                        }}
                                      >
                                        <CheckSquare className="h-4 w-4 mr-1" />
                                        Review & Approve
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Related Documents</h4>

                      {selectedWorkflow.documents.length > 0 ? (
                        <div className="space-y-2">
                          {selectedWorkflow.documents.map(doc => (
                            <Card key={doc.id} className="p-3 flex items-start gap-3">
                              <div className="mt-1">
                                <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">{doc.title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  Version {doc.version} • {doc.documentType}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button variant="outline" size="sm" className="text-xs h-7">
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    View
                                  </Button>
                                  <Button variant="outline" size="sm" className="text-xs h-7">
                                    <Download className="h-3.5 w-3.5 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No documents associated with this workflow
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-3">Regulatory Compliance</h4>

                      <Card className="p-3">
                        <div className="space-y-3">
                          <div>
                            <div className="text-sm font-medium mb-1">Regulatory Standards</div>
                            <div className="flex flex-wrap gap-2">
                              {selectedWorkflow.regulatoryStandards?.map((standard, index) => (
                                <Badge key={index} variant="outline">
                                  {standard}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium mb-1">Data Integrity</div>
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30">
                              ALCOA+ Compliant
                            </Badge>
                          </div>

                          <div>
                            <div className="text-sm font-medium mb-1">Electronic Signatures</div>
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30">
                              21 CFR Part 11 Compliant
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowWorkflowDetails(false);
                      setShowAuditDialog(true);
                    }}
                  >
                    <History className="h-4 w-4 mr-1" />
                    View Audit Trail
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowWorkflowDetails(false)}>
                  Close
                </Button>

                {selectedWorkflow.status === 'in_progress' &&
                  selectedWorkflow.nextApprover?.role === userRole && (
                    <Button
                      onClick={() => {
                        setShowWorkflowDetails(false);
                        setShowApprovalDialog(true);
                      }}
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Review & Approve
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          {selectedWorkflow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-green-600" />
                  Approve Workflow Stage
                </DialogTitle>
                <DialogDescription>
                  You are approving the {getCurrentStageDisplay(selectedWorkflow)} stage for{' '}
                  {selectedWorkflow.title}.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-6">
                <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
                  <Info className="h-4 w-4" />
                  <AlertTitle>21 CFR Part 11 Electronic Signature</AlertTitle>
                  <AlertDescription className="text-xs">
                    This action will be recorded as an electronic signature compliant with 21 CFR
                    Part 11. It will be attributable, timestamped, and stored with your IP address
                    and user information.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="approval-comment">Comment (Required)</Label>
                    <Textarea
                      id="approval-comment"
                      placeholder="Enter your review comments..."
                      rows={4}
                      value={approvalComment}
                      onChange={e => setApprovalComment(e.target.value)}
                      className="resize-none"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox id="terms" defaultChecked />
                    <Label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I confirm this electronic signature is the legal equivalent of my manual
                      signature
                    </Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleApproveWorkflow(selectedWorkflow.id)}
                  disabled={!approvalComment.trim() || loading}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckSquare className="mr-2 h-4 w-4" />
                      Sign & Approve
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit Trail Dialog */}
      <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <DialogContent className="max-w-3xl">
          {selectedWorkflow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-blue-600" />
                  Audit Trail
                </DialogTitle>
                <DialogDescription>
                  Complete audit history for {selectedWorkflow.title} workflow.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4">
                <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900 mb-4">
                  <LockKeyhole className="h-4 w-4" />
                  <AlertTitle>Secure Audit Trail</AlertTitle>
                  <AlertDescription className="text-xs">
                    This audit trail is cryptographically signed and tamper-evident, compliant with
                    21 CFR Part 11 and data integrity requirements. All actions are attributable,
                    time-stamped, and preserved.
                  </AlertDescription>
                </Alert>

                <ScrollArea className="h-[400px] rounded-md border p-4">
                  <div className="space-y-4">
                    {selectedWorkflow.auditTrail?.map((entry, index) => (
                      <div
                        key={index}
                        className="flex gap-3 pb-4 border-b last:border-b-0 last:pb-0"
                      >
                        <div className="mt-0.5">
                          {entry.action.includes('Completed') && (
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          )}
                          {entry.action.includes('Initiated') && (
                            <GitFork className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          )}
                          {entry.action.includes('Updated') && (
                            <SquarePen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          )}
                          {entry.action.includes('Created') && (
                            <FilePlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          )}
                          {!entry.action.includes('Completed') &&
                            !entry.action.includes('Initiated') &&
                            !entry.action.includes('Updated') &&
                            !entry.action.includes('Created') && (
                              <Activity className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            )}
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                            <div className="font-medium">{entry.action}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 sm:text-right">
                              {new Date(entry.timestamp).toLocaleString()}
                            </div>
                          </div>

                          <div className="text-sm mt-1">{entry.details}</div>

                          <div className="flex items-center gap-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                            <User className="h-3.5 w-3.5" />
                            <span>{entry.user}</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!selectedWorkflow.auditTrail || selectedWorkflow.auditTrail.length === 0) && (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No audit trail records found
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAuditDialog(false)}>
                  Close
                </Button>
                <Button>
                  <Download className="mr-2 h-4 w-4" />
                  Export Audit Report
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New Workflow Dialog */}
      <Dialog open={showNewWorkflowDialog} onOpenChange={setShowNewWorkflowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-indigo-600" />
              Create New Workflow
            </DialogTitle>
            <DialogDescription>Start a new regulatory compliant workflow.</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-title">Workflow Title</Label>
                <Input
                  id="workflow-title"
                  placeholder="Enter workflow title"
                  value={newWorkflow.title}
                  onChange={e => setNewWorkflow({ ...newWorkflow, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workflow-type">Workflow Type</Label>
                <Select
                  value={newWorkflow.workflowType}
                  onValueChange={value => setNewWorkflow({ ...newWorkflow, workflowType: value })}
                >
                  <SelectTrigger id="workflow-type">
                    <SelectValue placeholder="Select workflow type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="documentReview">Document Review</SelectItem>
                    <SelectItem value="changeControl">Change Control</SelectItem>
                    <SelectItem value="deviationManagement">Deviation Management</SelectItem>
                    <SelectItem value="regulatorySubmission">Regulatory Submission</SelectItem>
                  </SelectContent>
                </Select>

                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {newWorkflow.workflowType === 'documentReview' &&
                    'A structured workflow for document review with peer, QA, and regulatory review stages.'}
                  {newWorkflow.workflowType === 'changeControl' &&
                    'A regulated process for evaluating, approving, and implementing changes with impact assessment.'}
                  {newWorkflow.workflowType === 'deviationManagement' &&
                    'A workflow for managing deviations with investigation, CAPA, and effectiveness verification.'}
                  {newWorkflow.workflowType === 'regulatorySubmission' &&
                    'A submission preparation workflow with document collection, review, and publishing steps.'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workflow-priority">Priority</Label>
                  <Select
                    value={newWorkflow.priority}
                    onValueChange={value => setNewWorkflow({ ...newWorkflow, priority: value })}
                  >
                    <SelectTrigger id="workflow-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workflow-deadline">Deadline</Label>
                  <Input
                    id="workflow-deadline"
                    type="date"
                    value={newWorkflow.deadline}
                    onChange={e => setNewWorkflow({ ...newWorkflow, deadline: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description (Optional)</Label>
                <Textarea
                  id="workflow-description"
                  placeholder="Enter workflow description..."
                  rows={3}
                  value={newWorkflow.description}
                  onChange={e => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                  className="resize-none"
                />
              </div>
            </div>

            <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Regulatory Compliance</AlertTitle>
              <AlertDescription className="text-xs">
                This workflow will be created in compliance with GxP, 21 CFR Part 11, and applicable
                ICH guidelines. All actions will be recorded in a secure audit trail.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewWorkflowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkflow}
              disabled={
                !newWorkflow.title.trim() ||
                !newWorkflow.workflowType ||
                !newWorkflow.deadline ||
                loading
              }
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <GitFork className="mr-2 h-4 w-4" />
                  Create Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RegulatoryWorkflowManager;
