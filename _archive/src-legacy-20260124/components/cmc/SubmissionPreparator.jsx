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
import { Progress } from '@/components/ui/progress';
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
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  Upload,
  PlusCircle,
  Pencil,
  Trash2,
  FileCheck,
  FolderClosed,
  FolderOpen,
  ClipboardCheck,
  Archive,
  ArrowRight,
  ArrowUpDown,
  RefreshCw,
  Layers,
  BookOpen,
  FileSymlink,
  ChevronsRight,
  BarChart,
  Share,
  Paperclip,
  Check,
  X,
  Globe,
  Info,
  HelpCircle,
  Eye,
  Tag,
  Folders,
  Sparkles,
  ArrowRightLeft,
  MessageSquare,
  GitMerge,
  GitMerge as Workflow,
  Settings,
  Zap,
  Calendar,
  Circle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * SubmissionPreparator Component
 *
 * Advanced tool for organizing, validating, and preparing regulatory submissions
 * with intelligent document management and automatic validation against regulatory
 * requirements.
 */
const SubmissionPreparator = () => {
  const { toast } = useToast();

  // State for tracking submission details
  const [activeTab, setActiveTab] = useState('organize');
  const [submissionName, setSubmissionName] = useState('');
  const [submissionType, setSubmissionType] = useState('nda');
  const [targetRegion, setTargetRegion] = useState('fda');
  const [submissionDueDate, setSubmissionDueDate] = useState('');
  const [showCreateSubmission, setShowCreateSubmission] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [selectedRegions, setSelectedRegions] = useState(['FDA']);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDocumentDetails, setShowDocumentDetails] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  // State for tracked documents in the submission
  const [submissionDocuments, setSubmissionDocuments] = useState([]);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [documentSets, setDocumentSets] = useState([]);

  // Sample data for submissions
  const sampleSubmissions = [
    {
      id: 'sub-001',
      name: 'ACME-NDA-001',
      type: 'nda',
      typeDisplay: 'New Drug Application (NDA)',
      status: 'in_progress',
      regions: ['FDA'],
      dueDate: '2025-07-15',
      progress: 62,
      documentCount: 28,
      modules: {
        module1: 60,
        module2: 80,
        module3: 45,
        module4: 90,
        module5: 50,
      },
      validationIssues: 8,
    },
    {
      id: 'sub-002',
      name: 'ACME-MAA-001',
      type: 'maa',
      typeDisplay: 'Marketing Authorization Application (MAA)',
      status: 'planning',
      regions: ['EMA'],
      dueDate: '2025-09-30',
      progress: 25,
      documentCount: 12,
      modules: {
        module1: 40,
        module2: 35,
        module3: 15,
        module4: 20,
        module5: 10,
      },
      validationIssues: 15,
    },
  ];

  // Sample documents that might be available in the system
  const sampleAvailableDocuments = [
    {
      id: 'doc-001',
      title: 'Drug Substance Specification',
      type: 'CMC',
      section: '3.2.S.4.1',
      version: '2.0',
      status: 'approved',
      date: '2025-03-15',
      author: 'Michael Chen',
      format: 'PDF',
      size: '2.4 MB',
      path: '/documents/cmc/specifications/',
      tags: ['API', 'Specification', 'Quality'],
      description:
        'Specifications for the drug substance including analytical procedures and acceptance criteria.',
    },
    {
      id: 'doc-002',
      title: 'Drug Product Manufacturing Process',
      type: 'CMC',
      section: '3.2.P.3.3',
      version: '1.5',
      status: 'approved',
      date: '2025-03-10',
      author: 'Robert Miller',
      format: 'PDF',
      size: '5.7 MB',
      path: '/documents/cmc/manufacturing/',
      tags: ['Manufacturing', 'Process', 'Drug Product'],
      description: 'Detailed description of the manufacturing process for the drug product.',
    },
    {
      id: 'doc-003',
      title: 'Stability Data Summary',
      type: 'CMC',
      section: '3.2.P.8.1',
      version: '1.2',
      status: 'approved',
      date: '2025-02-28',
      author: 'Emily Davis',
      format: 'PDF',
      size: '3.8 MB',
      path: '/documents/cmc/stability/',
      tags: ['Stability', 'Data', 'Drug Product'],
      description:
        'Summary of stability data and conclusions regarding storage conditions and shelf-life.',
    },
    {
      id: 'doc-004',
      title: 'Analytical Method Validation Report',
      type: 'CMC',
      section: '3.2.S.4.3',
      version: '2.1',
      status: 'approved',
      date: '2025-03-05',
      author: 'David Thompson',
      format: 'PDF',
      size: '4.2 MB',
      path: '/documents/cmc/methods/',
      tags: ['Analytical', 'Validation', 'Method'],
      description:
        'Validation report for analytical methods used in the control of the drug substance.',
    },
    {
      id: 'doc-005',
      title: 'Quality Overall Summary',
      type: 'CTD',
      section: '2.3',
      version: '1.0',
      status: 'draft',
      date: '2025-04-01',
      author: 'Lisa Roberts',
      format: 'DOCX',
      size: '1.9 MB',
      path: '/documents/ctd/module2/',
      tags: ['QOS', 'Summary', 'CTD'],
      description: 'Quality Overall Summary document for Module 2.3 of CTD.',
    },
    {
      id: 'doc-006',
      title: 'Pharmacology Written Summary',
      type: 'CTD',
      section: '2.6.2',
      version: '1.1',
      status: 'in_review',
      date: '2025-03-20',
      author: 'Jennifer Williams',
      format: 'DOCX',
      size: '2.1 MB',
      path: '/documents/ctd/module2/',
      tags: ['Pharmacology', 'Summary', 'CTD'],
      description: 'Written summary of pharmacology studies for Module 2.6.2 of CTD.',
    },
    {
      id: 'doc-007',
      title: 'Clinical Overview',
      type: 'CTD',
      section: '2.5',
      version: '0.9',
      status: 'draft',
      date: '2025-04-05',
      author: 'Sarah Johnson',
      format: 'DOCX',
      size: '3.3 MB',
      path: '/documents/ctd/module2/',
      tags: ['Clinical', 'Overview', 'CTD'],
      description: 'Clinical overview document for Module 2.5 of CTD.',
    },
    {
      id: 'doc-008',
      title: 'Clinical Study Report - Phase 3 Pivotal',
      type: 'Clinical',
      section: '5.3.5.1',
      version: '1.0',
      status: 'approved',
      date: '2025-02-15',
      author: 'James Taylor',
      format: 'PDF',
      size: '15.6 MB',
      path: '/documents/clinical/reports/',
      tags: ['CSR', 'Phase 3', 'Pivotal'],
      description: 'Clinical study report for the pivotal Phase 3 study.',
    },
    {
      id: 'doc-009',
      title: 'Statistical Analysis Plan',
      type: 'Clinical',
      section: '5.3.5.3',
      version: '2.0',
      status: 'approved',
      date: '2025-01-10',
      author: 'Amanda Wilson',
      format: 'PDF',
      size: '1.8 MB',
      path: '/documents/clinical/statistics/',
      tags: ['SAP', 'Statistics', 'Analysis'],
      description: 'Statistical analysis plan for the clinical development program.',
    },
    {
      id: 'doc-010',
      title: 'Summary of Clinical Efficacy',
      type: 'CTD',
      section: '2.7.3',
      version: '0.8',
      status: 'draft',
      date: '2025-04-02',
      author: 'Sarah Johnson',
      format: 'DOCX',
      size: '4.1 MB',
      path: '/documents/ctd/module2/',
      tags: ['Efficacy', 'Clinical', 'Summary'],
      description: 'Summary of clinical efficacy for Module 2.7.3 of CTD.',
    },
  ];

  // Sample predefined document sets for different submission types
  const sampleDocumentSets = [
    {
      id: 'set-001',
      name: 'NDA CMC Core Documents',
      description: 'Core CMC documents required for NDA submission',
      count: 15,
      sections: ['3.2.S', '3.2.P'],
      applicableRegions: ['FDA'],
      documents: ['doc-001', 'doc-002', 'doc-003', 'doc-004'],
    },
    {
      id: 'set-002',
      name: 'MAA Quality Module Documents',
      description: 'Quality documents required for MAA submission',
      count: 18,
      sections: ['3.2.S', '3.2.P', '3.2.A'],
      applicableRegions: ['EMA'],
      documents: ['doc-001', 'doc-002', 'doc-003', 'doc-004'],
    },
    {
      id: 'set-003',
      name: 'Module 2 Summaries',
      description: 'CTD Module 2 summary documents',
      count: 7,
      sections: ['2.3', '2.4', '2.5', '2.6', '2.7'],
      applicableRegions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      documents: ['doc-005', 'doc-006', 'doc-007', 'doc-010'],
    },
    {
      id: 'set-004',
      name: 'Clinical Study Reports',
      description: 'Clinical study reports and related documents',
      count: 12,
      sections: ['5.3.5'],
      applicableRegions: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'NMPA'],
      documents: ['doc-008', 'doc-009'],
    },
  ];

  // Sample validation rules for submissions
  const validationRules = {
    FDA: [
      {
        id: 'rule-001',
        section: '3.2.S.4.1',
        description:
          'Drug substance specification must include acceptance criteria for all quality attributes',
        severity: 'critical',
      },
      {
        id: 'rule-002',
        section: '3.2.P.3.3',
        description:
          'Manufacturing process must include in-process controls and process parameters',
        severity: 'major',
      },
      {
        id: 'rule-003',
        section: '3.2.P.8.1',
        description:
          'Stability data must support the proposed shelf-life under the recommended storage conditions',
        severity: 'critical',
      },
      {
        id: 'rule-004',
        section: '2.3',
        description: 'Quality Overall Summary must align with Module 3 content',
        severity: 'major',
      },
      {
        id: 'rule-005',
        section: '5.3.5.1',
        description:
          'Clinical study reports must include study protocol and statistical analysis plan as appendices',
        severity: 'major',
      },
    ],
    EMA: [
      {
        id: 'rule-006',
        section: '3.2.S.4.1',
        description:
          'Drug substance specification must follow Ph. Eur. or USP monograph where applicable',
        severity: 'critical',
      },
      {
        id: 'rule-007',
        section: '3.2.P.3.3',
        description: 'Manufacturing process must include process validation strategy',
        severity: 'major',
      },
      {
        id: 'rule-008',
        section: '3.2.P.8.1',
        description:
          'Stability data must include results from studies conducted according to ICH Q1A(R2)',
        severity: 'critical',
      },
      {
        id: 'rule-009',
        section: '2.3',
        description: 'Quality Overall Summary must be comprehensive and aligned with Module 3',
        severity: 'major',
      },
      {
        id: 'rule-010',
        section: '1.3.1',
        description: 'Product Information must follow the QRD template',
        severity: 'critical',
      },
    ],
  };

  // Sample validation results
  const sampleValidationResults = {
    'sub-001': [
      {
        id: 'issue-001',
        ruleId: 'rule-001',
        document: 'doc-001',
        section: '3.2.S.4.1',
        description: 'Missing acceptance criteria for one impurity',
        severity: 'critical',
        status: 'open',
      },
      {
        id: 'issue-002',
        ruleId: 'rule-002',
        document: 'doc-002',
        section: '3.2.P.3.3',
        description: 'Incomplete in-process controls for compression step',
        severity: 'major',
        status: 'open',
      },
      {
        id: 'issue-003',
        ruleId: 'rule-003',
        document: 'doc-003',
        section: '3.2.P.8.1',
        description: 'Insufficient stability data at accelerated conditions',
        severity: 'critical',
        status: 'in_progress',
      },
      {
        id: 'issue-004',
        ruleId: 'rule-004',
        document: 'doc-005',
        section: '2.3',
        description: 'Discrepancy between QOS and Module 3 for dissolution method',
        severity: 'major',
        status: 'resolved',
      },
      {
        id: 'issue-005',
        ruleId: 'rule-005',
        document: 'doc-008',
        section: '5.3.5.1',
        description: 'Missing statistical analysis plan in appendix',
        severity: 'major',
        status: 'in_progress',
      },
    ],
  };

  // Load sample data when component mounts
  useEffect(() => {
    setAvailableDocuments(sampleAvailableDocuments);
    setDocumentSets(sampleDocumentSets);

    // Set the currently selected submission (if any)
    if (sampleSubmissions.length > 0) {
      setCurrentSubmission(sampleSubmissions[0]);
      // Add documents to the submission
      const submissionDocs = sampleAvailableDocuments
        .filter(doc =>
          ['doc-001', 'doc-002', 'doc-003', 'doc-004', 'doc-005', 'doc-008'].includes(doc.id)
        )
        .map(doc => ({
          ...doc,
          included: true,
          validateStatus: Math.random() > 0.3 ? 'pass' : Math.random() > 0.5 ? 'warning' : 'fail',
        }));
      setSubmissionDocuments(submissionDocs);
    }
  }, []);

  // Create a new submission
  const handleCreateSubmission = () => {
    if (!submissionName || !submissionType || !targetRegion || !submissionDueDate) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    const newSubmission = {
      id: `sub-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`,
      name: submissionName,
      type: submissionType,
      typeDisplay: getSubmissionTypeDisplay(submissionType),
      status: 'planning',
      regions: [targetRegion.toUpperCase()],
      dueDate: submissionDueDate,
      progress: 0,
      documentCount: 0,
      modules: {
        module1: 0,
        module2: 0,
        module3: 0,
        module4: 0,
        module5: 0,
      },
      validationIssues: 0,
    };

    // In a real app, would save this to a backend
    setCurrentSubmission(newSubmission);
    setSubmissionDocuments([]);
    setShowCreateSubmission(false);

    toast({
      title: 'Submission Created',
      description: `New submission "${submissionName}" has been created.`,
    });
  };

  // Function to display submission type in a user-friendly format
  const getSubmissionTypeDisplay = type => {
    switch (type) {
      case 'nda':
        return 'New Drug Application (NDA)';
      case 'bla':
        return 'Biologics License Application (BLA)';
      case 'anda':
        return 'Abbreviated New Drug Application (ANDA)';
      case 'ind':
        return 'Investigational New Drug (IND)';
      case 'maa':
        return 'Marketing Authorization Application (MAA)';
      case 'jnda':
        return 'Japanese New Drug Application (JNDA)';
      default:
        return type.toUpperCase();
    }
  };

  // Function to add or remove a document set to the submission
  const handleAddDocumentSet = setId => {
    const documentSet = documentSets.find(set => set.id === setId);
    if (!documentSet) return;

    // Find the documents from this set
    const setDocuments = availableDocuments.filter(doc => documentSet.documents.includes(doc.id));

    // Add the documents to the submission (if they're not already there)
    const updatedSubmissionDocuments = [...submissionDocuments];

    setDocuments.forEach(doc => {
      if (!updatedSubmissionDocuments.some(d => d.id === doc.id)) {
        updatedSubmissionDocuments.push({
          ...doc,
          included: true,
          validateStatus: Math.random() > 0.3 ? 'pass' : Math.random() > 0.5 ? 'warning' : 'fail',
        });
      }
    });

    setSubmissionDocuments(updatedSubmissionDocuments);

    toast({
      title: 'Document Set Added',
      description: `Added ${documentSet.name} (${setDocuments.length} documents)`,
    });
  };

  // Function to add or remove a document to/from the submission
  const toggleDocumentInSubmission = docId => {
    const document = availableDocuments.find(doc => doc.id === docId);
    if (!document) return;

    // Check if document is already in the submission
    const existingIndex = submissionDocuments.findIndex(doc => doc.id === docId);

    if (existingIndex >= 0) {
      // Remove the document
      const updatedDocs = [...submissionDocuments];
      updatedDocs.splice(existingIndex, 1);
      setSubmissionDocuments(updatedDocs);

      toast({
        title: 'Document Removed',
        description: `Removed "${document.title}" from submission`,
      });
    } else {
      // Add the document
      setSubmissionDocuments([
        ...submissionDocuments,
        {
          ...document,
          included: true,
          validateStatus: Math.random() > 0.3 ? 'pass' : Math.random() > 0.5 ? 'warning' : 'fail',
        },
      ]);

      toast({
        title: 'Document Added',
        description: `Added "${document.title}" to submission`,
      });
    }
  };

  // Function to run validation on the current submission
  const runValidation = () => {
    if (!currentSubmission) return;

    setLoadingValidation(true);

    // Simulate API delay
    setTimeout(() => {
      // In a real app, this would call an API endpoint to run validation
      toast({
        title: 'Validation Complete',
        description: 'Validation rules have been applied to submission documents',
      });

      setLoadingValidation(false);
    }, 2000);
  };

  // Function to filter available documents based on search query
  const filteredAvailableDocuments = searchQuery
    ? availableDocuments.filter(
        doc =>
          doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          doc.section.toLowerCase().includes(searchQuery.toLowerCase()) ||
          doc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : availableDocuments;

  // Function to filter document sets based on current submission's regions
  const filteredDocumentSets = currentSubmission
    ? documentSets.filter(set =>
        set.applicableRegions.some(region => currentSubmission.regions.includes(region))
      )
    : documentSets;

  // Function to get status badge color
  const getStatusBadge = status => {
    switch (status) {
      case 'pass':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Pass
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case 'fail':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
            <X className="h-3 w-3 mr-1" />
            Fail
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Approved
          </Badge>
        );
      case 'draft':
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            Draft
          </Badge>
        );
      case 'in_review':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            In Review
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

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Submission Preparator
            </CardTitle>
            <CardDescription className="text-gray-300 dark:text-gray-700">
              Intelligent document organization and validation for regulatory submissions
            </CardDescription>
          </div>

          {currentSubmission ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="text-white dark:text-black border-white dark:border-black hover:text-black hover:bg-white dark:hover:text-white dark:hover:bg-black"
                onClick={() => setCurrentSubmission(null)}
              >
                Switch Submission
              </Button>
              <Button
                className="bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
                onClick={() => setShowCreateSubmission(true)}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                New Submission
              </Button>
            </div>
          ) : (
            <Button
              className="bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
              onClick={() => setShowCreateSubmission(true)}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Submission
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {currentSubmission ? (
          <div>
            <div className="p-4 border-b">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{currentSubmission.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="outline">{currentSubmission.typeDisplay}</Badge>
                    {currentSubmission.regions.map(region => (
                      <Badge key={region} variant="secondary">
                        {region}
                      </Badge>
                    ))}
                    {currentSubmission.status === 'planning' && (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                        Planning
                      </Badge>
                    )}
                    {currentSubmission.status === 'in_progress' && (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                        In Progress
                      </Badge>
                    )}
                    {currentSubmission.status === 'submitted' && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        Submitted
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span>
                      Due:{' '}
                      <span className="font-medium">
                        {new Date(currentSubmission.dueDate).toLocaleDateString()}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span>
                      Documents: <span className="font-medium">{submissionDocuments.length}</span>
                    </span>

                    <AlertTriangle className="h-4 w-4 text-amber-500 ml-2" />
                    <span>
                      Issues:{' '}
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {currentSubmission.validationIssues}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>Overall Progress</span>
                  <span>{currentSubmission.progress}%</span>
                </div>
                <Progress value={currentSubmission.progress} className="h-2" />
              </div>

              <div className="grid grid-cols-5 gap-2 mt-4">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Module 1</div>
                  <Progress value={currentSubmission.modules.module1} className="h-1.5" />
                  <div className="text-xs text-right">{currentSubmission.modules.module1}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Module 2</div>
                  <Progress value={currentSubmission.modules.module2} className="h-1.5" />
                  <div className="text-xs text-right">{currentSubmission.modules.module2}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Module 3</div>
                  <Progress value={currentSubmission.modules.module3} className="h-1.5" />
                  <div className="text-xs text-right">{currentSubmission.modules.module3}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Module 4</div>
                  <Progress value={currentSubmission.modules.module4} className="h-1.5" />
                  <div className="text-xs text-right">{currentSubmission.modules.module4}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Module 5</div>
                  <Progress value={currentSubmission.modules.module5} className="h-1.5" />
                  <div className="text-xs text-right">{currentSubmission.modules.module5}%</div>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full rounded-none">
                <TabsTrigger value="organize" className="flex-1">
                  <Folders className="h-4 w-4 mr-2" />
                  Organize Documents
                </TabsTrigger>
                <TabsTrigger value="validate" className="flex-1">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Validate Submission
                </TabsTrigger>
                <TabsTrigger value="publish" className="flex-1">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Publish eCTD
                </TabsTrigger>
              </TabsList>

              <TabsContent value="organize" className="p-0">
                <div className="flex flex-col lg:flex-row">
                  <div className="lg:w-1/3 border-r">
                    <div className="p-4 border-b">
                      <h3 className="font-medium mb-2">Document Sets</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Add predefined document sets to quickly populate your submission.
                      </p>

                      <div className="space-y-3">
                        {filteredDocumentSets.map(set => (
                          <Card key={set.id} className="shadow-sm">
                            <CardHeader className="py-3">
                              <CardTitle className="text-base">{set.name}</CardTitle>
                              <CardDescription className="text-xs">
                                {set.description} • {set.count} documents
                              </CardDescription>
                            </CardHeader>
                            <CardFooter className="py-2 flex justify-between items-center">
                              <div className="flex flex-wrap gap-1">
                                {set.applicableRegions.map(region => (
                                  <Badge key={region} variant="outline" className="text-xs">
                                    {region}
                                  </Badge>
                                ))}
                              </div>
                              <Button
                                size="sm"
                                className="text-xs"
                                onClick={() => handleAddDocumentSet(set.id)}
                              >
                                <PlusCircle className="h-3.5 w-3.5 mr-1" />
                                Add Set
                              </Button>
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-medium">Available Documents</h3>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                          <Input
                            placeholder="Search documents..."
                            className="pl-8 h-8 w-[200px]"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>

                      <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-2">
                          {filteredAvailableDocuments.map(doc => {
                            const isIncluded = submissionDocuments.some(d => d.id === doc.id);

                            return (
                              <div
                                key={doc.id}
                                className={`p-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-900 flex items-start justify-between cursor-pointer ${
                                  isIncluded
                                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                                    : ''
                                }`}
                                onClick={() => toggleDocumentInSubmission(doc.id)}
                              >
                                <div className="flex items-start gap-2">
                                  <FileText
                                    className={`h-5 w-5 mt-0.5 ${
                                      isIncluded
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-gray-400 dark:text-gray-600'
                                    }`}
                                  />
                                  <div>
                                    <div className="font-medium text-sm">{doc.title}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      Section {doc.section} • v{doc.version}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {doc.tags.slice(0, 2).map((tag, index) => (
                                        <Badge
                                          key={index}
                                          variant="outline"
                                          className="text-xs px-1 py-0"
                                        >
                                          {tag}
                                        </Badge>
                                      ))}
                                      {doc.tags.length > 2 && (
                                        <Badge variant="outline" className="text-xs px-1 py-0">
                                          +{doc.tags.length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  {getStatusBadge(doc.status)}
                                  {isIncluded ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-600 dark:text-red-400"
                                      onClick={e => {
                                        e.stopPropagation();
                                        toggleDocumentInSubmission(doc.id);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-blue-600 dark:text-blue-400"
                                      onClick={e => {
                                        e.stopPropagation();
                                        toggleDocumentInSubmission(doc.id);
                                      }}
                                    >
                                      <PlusCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {filteredAvailableDocuments.length === 0 && (
                            <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                              No documents match your search criteria
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <div className="lg:w-2/3">
                    <div className="p-4 border-b">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-medium">Submission Documents</h3>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <ArrowRightLeft className="h-4 w-4 mr-1" />
                            Manage Metadata
                          </Button>
                          <Button size="sm">
                            <GitMerge className="h-4 w-4 mr-1" />
                            Auto-Organize
                          </Button>
                        </div>
                      </div>

                      <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900 mb-4">
                        <Sparkles className="h-4 w-4" />
                        <AlertTitle>AI-Powered Organization</AlertTitle>
                        <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                          Enhanced document organization automatically places documents in the
                          correct CTD sections with GPT-4o's assistance. Documents are analyzed for
                          content and matched to regulatory requirements.
                        </AlertDescription>
                      </Alert>

                      {submissionDocuments.length === 0 ? (
                        <div className="text-center py-12">
                          <Folders className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            No Documents Added
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
                            Add documents to your submission by selecting them from the available
                            documents list or adding a document set.
                          </p>
                          <Button
                            onClick={() => {
                              // Focus the search input
                              document
                                .querySelector('input[placeholder="Search documents..."]')
                                ?.focus();
                            }}
                          >
                            <Search className="h-4 w-4 mr-2" />
                            Find Documents to Add
                          </Button>
                        </div>
                      ) : (
                        <div className="border rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Document</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead>Version</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Validation</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {submissionDocuments.map(doc => (
                                <TableRow key={doc.id}>
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                      <span>{doc.title}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{doc.section}</Badge>
                                  </TableCell>
                                  <TableCell>v{doc.version}</TableCell>
                                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                                  <TableCell>
                                    {doc.validateStatus && getStatusBadge(doc.validateStatus)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setSelectedDocument(doc);
                                          setShowDocumentDetails(true);
                                        }}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-amber-600 dark:text-amber-400"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 dark:text-red-400"
                                        onClick={() => toggleDocumentInSubmission(doc.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-medium mb-4">Module Structure Preview</h3>

                      <div className="border rounded-md p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <FolderClosed className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                              <span className="font-medium">
                                Module 1: Administrative Information
                              </span>
                            </div>
                            <div className="ml-7 space-y-2">
                              <div className="flex items-center gap-2">
                                <FolderClosed className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm">1.1 Comprehensive Table of Contents</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FolderClosed className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm">1.2 Application Form</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FolderClosed className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm">1.3 Product Information</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <span className="text-sm">Application Form.pdf</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <FolderOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                              <span className="font-medium">Module 3: Quality</span>
                            </div>
                            <div className="ml-7 space-y-2">
                              <div className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm">3.2.S Drug Substance</span>
                              </div>
                              <div className="ml-6 space-y-2">
                                <div className="flex items-center gap-2">
                                  <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  <span className="text-sm">3.2.S.4 Control of Drug Substance</span>
                                </div>
                                <div className="ml-6 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    <span className="text-sm">
                                      Drug Substance Specification.pdf
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                                    <span className="text-sm">
                                      Analytical Method Validation Report.pdf
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm">3.2.P Drug Product</span>
                              </div>
                              <div className="ml-6 space-y-1">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  <span className="text-sm">
                                    Drug Product Manufacturing Process.pdf
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  <span className="text-sm">Stability Data Summary.pdf</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="validate" className="p-6 space-y-6">
                <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
                  <ClipboardCheck className="h-5 w-5" />
                  <AlertTitle>Submission Validation</AlertTitle>
                  <AlertDescription>
                    Validate your submission against regulatory requirements and technical
                    specifications. Automated checks help identify issues that may cause submission
                    rejection.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileCheck className="h-4 w-4 text-green-600" />
                        CTD Format Compliance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                          95%
                        </div>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Pass
                        </Badge>
                      </div>
                      <Progress value={95} className="h-1.5 mt-1" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-amber-600" />
                        Content Review
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                          78%
                        </div>
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Warning
                        </Badge>
                      </div>
                      <Progress value={78} className="h-1.5 mt-1" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileSymlink className="h-4 w-4 text-blue-600" />
                        Hyperlink Validation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                          100%
                        </div>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Pass
                        </Badge>
                      </div>
                      <Progress value={100} className="h-1.5 mt-1" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-600" />
                        Content Gaps
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold text-red-600 dark:text-red-400">8</div>
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                          <X className="h-3 w-3 mr-1" />
                          Critical
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Missing required documents
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="col-span-1 lg:col-span-2">
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Validation Issues</span>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                            8 Issues
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Issues identified during validation that need to be addressed
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Severity</TableHead>
                              <TableHead>Issue</TableHead>
                              <TableHead>Section</TableHead>
                              <TableHead>Document</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentSubmission &&
                              sampleValidationResults[currentSubmission.id]?.map(issue => {
                                const document = availableDocuments.find(
                                  doc => doc.id === issue.document
                                );

                                return (
                                  <TableRow key={issue.id}>
                                    <TableCell>
                                      {issue.severity === 'critical' ? (
                                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                                          Critical
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                                          Major
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {issue.description}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{issue.section}</Badge>
                                    </TableCell>
                                    <TableCell>
                                      {document ? document.title : 'Unknown Document'}
                                    </TableCell>
                                    <TableCell>
                                      {issue.status === 'open' && (
                                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                                          Open
                                        </Badge>
                                      )}
                                      {issue.status === 'in_progress' && (
                                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                                          In Progress
                                        </Badge>
                                      )}
                                      {issue.status === 'resolved' && (
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                          Resolved
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Button variant="outline" size="sm" className="h-7 text-xs">
                                          <Eye className="h-3.5 w-3.5 mr-1" />
                                          View
                                        </Button>
                                        {issue.status !== 'resolved' && (
                                          <Button size="sm" className="h-7 text-xs">
                                            <Pencil className="h-3.5 w-3.5 mr-1" />
                                            Fix
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}

                            {(!currentSubmission ||
                              !sampleValidationResults[currentSubmission.id] ||
                              sampleValidationResults[currentSubmission.id].length === 0) && (
                              <TableRow>
                                <TableCell
                                  colSpan={6}
                                  className="text-center py-6 text-gray-500 dark:text-gray-400"
                                >
                                  No validation issues found. Run validation to check your
                                  submission.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                      <CardFooter className="flex justify-between border-t py-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Last validated: April 21, 2025 at 14:32
                        </span>
                        <Button onClick={runValidation} disabled={loadingValidation}>
                          {loadingValidation ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Validating...
                            </>
                          ) : (
                            <>
                              <FileCheck className="mr-2 h-4 w-4" />
                              Run Validation
                            </>
                          )}
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>

                  <div>
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle>Regulatory Rules</CardTitle>
                        <CardDescription>
                          Validation rules applied to your submission
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <ScrollArea className="h-[400px]">
                          <div className="px-4 py-2 space-y-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Badge>FDA</Badge>
                                <span>Validation Rules</span>
                              </h4>
                              <div className="space-y-2">
                                {validationRules.FDA.map(rule => (
                                  <div key={rule.id} className="p-2 border rounded-md text-sm">
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5">
                                        {rule.severity === 'critical' ? (
                                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        ) : (
                                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">
                                            Section {rule.section}
                                          </span>
                                          {rule.severity === 'critical' ? (
                                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 text-xs">
                                              Critical
                                            </Badge>
                                          ) : (
                                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 text-xs">
                                              Major
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-gray-700 dark:text-gray-300 mt-0.5">
                                          {rule.description}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Badge>EMA</Badge>
                                <span>Validation Rules</span>
                              </h4>
                              <div className="space-y-2">
                                {validationRules.EMA.map(rule => (
                                  <div key={rule.id} className="p-2 border rounded-md text-sm">
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5">
                                        {rule.severity === 'critical' ? (
                                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        ) : (
                                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">
                                            Section {rule.section}
                                          </span>
                                          {rule.severity === 'critical' ? (
                                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 text-xs">
                                              Critical
                                            </Badge>
                                          ) : (
                                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 text-xs">
                                              Major
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-gray-700 dark:text-gray-300 mt-0.5">
                                          {rule.description}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </ScrollArea>
                      </CardContent>
                      <CardFooter className="border-t py-3">
                        <Button variant="outline" className="w-full" onClick={() => {}}>
                          <Settings className="mr-2 h-4 w-4" />
                          Configure Validation Rules
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                </div>

                <Alert className="bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100 border-amber-200 dark:border-amber-900">
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>AI-Powered Validation</AlertTitle>
                  <AlertDescription className="text-sm">
                    Our advanced AI can identify content issues and regulatory compliance concerns
                    in your documents. GPT-4o analyzes document content, identifies missing
                    information, and provides suggestions for improvement.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="publish" className="p-6 space-y-6">
                <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
                  <BookOpen className="h-5 w-5" />
                  <AlertTitle>eCTD Publishing</AlertTitle>
                  <AlertDescription>
                    Generate submission-ready eCTD packages for regulatory submissions. Your
                    documents will be organized according to regulatory specifications with proper
                    metadata.
                  </AlertDescription>
                </Alert>

                <Card>
                  <CardHeader>
                    <CardTitle>Submission Package Configuration</CardTitle>
                    <CardDescription>
                      Configure the settings for your eCTD submission package
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Target Regions</h4>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox id="region-fda" checked={selectedRegions.includes('FDA')} />
                            <Label htmlFor="region-fda">FDA (United States)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="region-ema" checked={selectedRegions.includes('EMA')} />
                            <Label htmlFor="region-ema">EMA (European Union)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="region-pmda" />
                            <Label htmlFor="region-pmda">PMDA (Japan)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="region-hc" />
                            <Label htmlFor="region-hc">Health Canada</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="region-nmpa" />
                            <Label htmlFor="region-nmpa">NMPA (China)</Label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Submission Format</h4>
                        <RadioGroup defaultValue="ectd">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="ectd" id="format-ectd" />
                            <Label htmlFor="format-ectd">eCTD Format</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="nees" id="format-nees" />
                            <Label htmlFor="format-nees">NEES Format (Japan)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="non-ectd" id="format-non-ectd" />
                            <Label htmlFor="format-non-ectd">Non-eCTD Format</Label>
                          </div>
                        </RadioGroup>

                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-2">Publication Options</h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Switch id="hyperlinks" defaultChecked />
                              <Label htmlFor="hyperlinks">Generate Hyperlinks</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch id="bookmarks" defaultChecked />
                              <Label htmlFor="bookmarks">Generate Bookmarks</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch id="toc" defaultChecked />
                              <Label htmlFor="toc">Generate TOC</Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Additional Settings</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="sequence-number">Sequence Number</Label>
                          <Input id="sequence-number" placeholder="0000" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="submission-type">Submission Type</Label>
                          <Select defaultValue="original">
                            <SelectTrigger id="submission-type">
                              <SelectValue placeholder="Select submission type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="original">Original Submission</SelectItem>
                              <SelectItem value="response">
                                Response to Information Request
                              </SelectItem>
                              <SelectItem value="amendment">Amendment</SelectItem>
                              <SelectItem value="supplement">Supplement</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t pt-5">
                    <Button variant="outline">Save Configuration</Button>
                    <div className="flex gap-2">
                      <Button variant="outline">
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Generate eCTD
                      </Button>
                    </div>
                  </CardFooter>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Publication History</CardTitle>
                      <CardDescription>
                        History of previously generated submission packages
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Format</TableHead>
                            <TableHead>Sequence</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Apr 20, 2025</TableCell>
                            <TableCell>Original</TableCell>
                            <TableCell>eCTD</TableCell>
                            <TableCell>0001</TableCell>
                            <TableCell>156 MB</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Download
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Apr 15, 2025</TableCell>
                            <TableCell>Test</TableCell>
                            <TableCell>eCTD</TableCell>
                            <TableCell>0000</TableCell>
                            <TableCell>152 MB</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Download
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Validation Report</CardTitle>
                      <CardDescription>eCTD technical validation results</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <span className="font-medium">Technical Validation</span>
                          </div>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            Pass
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <span className="font-medium">PDF Technical Compliance</span>
                          </div>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            Pass
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <span className="font-medium">XML Validation</span>
                          </div>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            Pass
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            <span className="font-medium">File/Folder Structure</span>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                            Warning
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            <span className="font-medium">Hyperlink Verification</span>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                            Warning
                          </Badge>
                        </div>

                        <div className="pt-4">
                          <Alert className="bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/50">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-sm">Warnings to Address</AlertTitle>
                            <AlertDescription className="text-xs">
                              <ul className="list-disc pl-4 space-y-1 mt-1">
                                <li>2 broken hyperlinks in document 3.2.P.8.1</li>
                                <li>Non-standard folder name in Module 5</li>
                              </ul>
                            </AlertDescription>
                          </Alert>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                      <Button variant="outline" className="w-full">
                        <Download className="mr-2 h-4 w-4" />
                        Download Full Report
                      </Button>
                    </CardFooter>
                  </Card>
                </div>

                <Alert className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100 border-indigo-200 dark:border-indigo-900">
                  <Zap className="h-4 w-4" />
                  <AlertTitle>Auto-Optimization</AlertTitle>
                  <AlertDescription className="text-sm">
                    Our system can automatically optimize your submission package to improve
                    compliance with regulatory requirements and reduce validation errors.
                    <Button variant="outline" className="mt-2" onClick={() => {}}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Run Auto-Optimization
                    </Button>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 max-w-xl mx-auto">
              <ClipboardCheck className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No Active Submission
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Create a new submission or select an existing one to organize, validate, and prepare
                your regulatory submission.
              </p>

              {sampleSubmissions.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="font-medium text-left">Select Existing Submission</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {sampleSubmissions.map(submission => (
                      <Card
                        key={submission.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => {
                          setCurrentSubmission(submission);

                          // Simulate loading submissionDocuments
                          const submissionDocs = sampleAvailableDocuments
                            .filter(doc => Math.random() > 0.5)
                            .map(doc => ({
                              ...doc,
                              included: true,
                              validateStatus:
                                Math.random() > 0.3
                                  ? 'pass'
                                  : Math.random() > 0.5
                                    ? 'warning'
                                    : 'fail',
                            }));

                          setSubmissionDocuments(submissionDocs);
                        }}
                      >
                        <CardHeader className="py-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base">{submission.name}</CardTitle>
                              <CardDescription className="text-xs">
                                {submission.typeDisplay} • {submission.regions.join(', ')}
                              </CardDescription>
                            </div>
                            <div>
                              {submission.status === 'planning' && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                                  Planning
                                </Badge>
                              )}
                              {submission.status === 'in_progress' && (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                                  In Progress
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="py-1">
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>{submission.progress}%</span>
                          </div>
                          <Progress value={submission.progress} className="h-1.5" />
                        </CardContent>
                        <CardFooter className="py-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>Due: {new Date(submission.dueDate).toLocaleDateString()}</span>
                          <span>{submission.documentCount} documents</span>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>

                  <div className="flex justify-center pt-2">
                    <Button onClick={() => setShowCreateSubmission(true)}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create New Submission
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setShowCreateSubmission(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Submission
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Create Submission Dialog */}
      <Dialog open={showCreateSubmission} onOpenChange={setShowCreateSubmission}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Submission</DialogTitle>
            <DialogDescription>
              Configure the details for your new regulatory submission
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="submission-name">Submission Name</Label>
              <Input
                id="submission-name"
                placeholder="Enter submission name"
                value={submissionName}
                onChange={e => setSubmissionName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="submission-type">Submission Type</Label>
                <Select value={submissionType} onValueChange={value => setSubmissionType(value)}>
                  <SelectTrigger id="submission-type">
                    <SelectValue placeholder="Select submission type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nda">New Drug Application (NDA)</SelectItem>
                    <SelectItem value="bla">Biologics License Application (BLA)</SelectItem>
                    <SelectItem value="anda">Abbreviated New Drug Application (ANDA)</SelectItem>
                    <SelectItem value="ind">Investigational New Drug (IND)</SelectItem>
                    <SelectItem value="maa">Marketing Authorization Application (MAA)</SelectItem>
                    <SelectItem value="jnda">Japanese New Drug Application (JNDA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-region">Primary Target Region</Label>
                <Select value={targetRegion} onValueChange={value => setTargetRegion(value)}>
                  <SelectTrigger id="target-region">
                    <SelectValue placeholder="Select primary region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FDA">FDA (United States)</SelectItem>
                    <SelectItem value="EMA">EMA (European Union)</SelectItem>
                    <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
                    <SelectItem value="Health Canada">Health Canada</SelectItem>
                    <SelectItem value="NMPA">NMPA (China)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Submission Due Date</Label>
              <Input
                id="due-date"
                type="date"
                value={submissionDueDate}
                onChange={e => setSubmissionDueDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSubmission(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmission}>Create Submission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Details Dialog */}
      <Dialog open={showDocumentDetails} onOpenChange={setShowDocumentDetails}>
        <DialogContent className="max-w-3xl">
          {selectedDocument && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  {selectedDocument.title}
                </DialogTitle>
                <DialogDescription>
                  Section {selectedDocument.section} • Version {selectedDocument.version}
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Document Type</h4>
                    <p className="text-sm">{selectedDocument.type}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1">Status</h4>
                    <div>{getStatusBadge(selectedDocument.status)}</div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1">Date</h4>
                    <p className="text-sm">
                      {new Date(selectedDocument.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedDocument.tags.map((tag, i) => (
                      <Badge key={i} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Description</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {selectedDocument.description}
                  </p>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 flex justify-between items-center border-b">
                    <h4 className="text-sm font-medium">Document Preview</h4>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
                        <Share className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-6 flex justify-center items-center h-[300px] bg-gray-100 dark:bg-gray-800">
                    <div className="text-center">
                      <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600 mb-2" />
                      <p className="text-gray-600 dark:text-gray-400">Preview not available</p>
                      <Button variant="outline" size="sm" className="mt-2">
                        <Eye className="h-4 w-4 mr-1" />
                        Open Document
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Validation Status</h4>
                  <Alert
                    className={`
                    ${
                      selectedDocument.validateStatus === 'pass'
                        ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
                        : selectedDocument.validateStatus === 'warning'
                          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                          : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                    }
                  `}
                  >
                    {selectedDocument.validateStatus === 'pass' && (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    )}
                    {selectedDocument.validateStatus === 'warning' && (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    )}
                    {selectedDocument.validateStatus === 'fail' && (
                      <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}

                    <AlertTitle
                      className={`
                      ${
                        selectedDocument.validateStatus === 'pass'
                          ? 'text-green-800 dark:text-green-300'
                          : selectedDocument.validateStatus === 'warning'
                            ? 'text-amber-800 dark:text-amber-300'
                            : 'text-red-800 dark:text-red-300'
                      }
                    `}
                    >
                      {selectedDocument.validateStatus === 'pass' && 'Validation Passed'}
                      {selectedDocument.validateStatus === 'warning' && 'Validation Warning'}
                      {selectedDocument.validateStatus === 'fail' && 'Validation Failed'}
                    </AlertTitle>

                    <AlertDescription
                      className={`
                      ${
                        selectedDocument.validateStatus === 'pass'
                          ? 'text-green-700 dark:text-green-400'
                          : selectedDocument.validateStatus === 'warning'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      } text-sm
                    `}
                    >
                      {selectedDocument.validateStatus === 'pass' &&
                        'This document meets all validation requirements for regulatory submission.'}
                      {selectedDocument.validateStatus === 'warning' &&
                        'This document has minor validation issues that should be addressed before submission.'}
                      {selectedDocument.validateStatus === 'fail' &&
                        'This document has critical validation issues that must be resolved before submission.'}
                    </AlertDescription>
                  </Alert>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDocumentDetails(false)}>
                  Close
                </Button>
                <Button>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Document
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SubmissionPreparator;
