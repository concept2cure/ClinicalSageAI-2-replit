import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  FlaskConical,
  BarChart3,
  Shield,
  Clock,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit,
  Download,
  Upload,
  Search,
  Filter,
  Microscope,
  TestTube,
  Activity,
  Clipboard,
  Settings,
  Database,
  FileCheck,
  TrendingUp,
  AlertCircle,
  Calendar,
  User,
  Eye,
  Trash2,
  Save,
  X,
  Package,
  Pill,
  ArrowRight as ArrowLeft,
  FileText,
  PlayCircle,
  Award,
  Globe,
  Archive,
  Edit3,
  BookOpen,
  GitBranch,
  Link,
  Zap,
  Languages,
  Flag,
  History,
  RefreshCw,
  Brain,
  Sparkles,
  PenTool,
  Lightbulb,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image,
  Type,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Lock,
  Unlock,
  FileType,
  Table as TableIcon,
  Award as AwardIcon,
  TestTube as TestTubeIcon,
  MessageSquare,
  RotateCcw,
  RotateCw,
  Copy,
  Highlighter,
  Code,
  Hash,
  AtSign,
  FileSearch,
  Loader2,
  Factory,
  Leaf,
  Recycle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// import { useLocation } from 'wouter'; // Removed for simpler state-based routing
import DocumentAuthoringComponent from './DocumentAuthoringFixed';
import AnalyticalMethodsTab from './AnalyticalMethodsTab';
import MethodDetails from './MethodDetails';
import GapResolutionModal from './GapResolutionModal';
import ProcessTab from './ProcessTab';

const ComprehensiveCMCPlatform = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewingMethodId, setViewingMethodId] = useState(null);
  const [analyticalMethods, setAnalyticalMethods] = useState([]);
  const [processValidations, setProcessValidations] = useState([]);
  const [stabilityStudies, setStabilityStudies] = useState([]);
  const [qcTesting, setQcTesting] = useState([]);
  const [changeControls, setChangeControls] = useState([]);
  const [drugSubstances, setDrugSubstances] = useState([]);
  const [drugProducts, setDrugProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Advanced CMC Features State
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState(
    'For Immediate Release Tablets in FDA submissions, analytical method validation should follow ICH Q2(R1) guidelines.\n\nKey validation parameters required:\n• Specificity: Demonstrate method can distinguish analyte from impurities\n• Linearity: Establish linear relationship over expected range\n• Accuracy: Recovery studies at 3 concentration levels (80%, 100%, 120%)\n• Precision: Repeatability (RSD ≤2%) and intermediate precision\n• Detection/Quantitation limits: If impurity testing required\n• Robustness: Test method under varied conditions\n\nNext steps: Prepare validation protocols and schedule studies with your analytical team.'
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiContext, setAiContext] = useState({
    completedSteps: [],
    currentFormData: {},
    projectContext:
      'Drug: Lisinopril Tablets | Dosage Form: Immediate Release Tablets | Indication: Hypertension and Heart Failure | Region: FDA | Stage: Phase III Development',
    suggestedNextSteps: [],
  });
  const [aiSuggestions, setAiSuggestions] = useState([
    {
      title: 'Method Validation Protocol',
      description:
        'For Immediate Release Tablets in FDA submissions, establish HPLC validation per ICH Q2(R1) with specificity, linearity, accuracy, precision, and robustness studies.',
      action: 'Generate validation protocol',
      priority: 'high',
    },
    {
      title: 'Dissolution Testing Strategy',
      description:
        'Immediate release tablets require dissolution testing. Consider USP Apparatus II with appropriate media selection for hypertension indication.',
      action: 'Setup dissolution studies',
      priority: 'medium',
    },
    {
      title: 'Generic Drug Considerations',
      description:
        'For generic Lisinopril tablets, bioequivalence study planning and ANDA preparation timeline should be considered.',
      action: 'Review bioequivalence requirements',
      priority: 'medium',
    },
  ]);
  const [auditData, setAuditData] = useState([]);
  const [riskAssessments, setRiskAssessments] = useState([]);
  const [mitigationPlans, setMitigationPlans] = useState([]);
  const [submissionData, setSubmissionData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState({});

  // Enhanced Dashboard with Real API Integration
  const [dashboardData, setDashboardData] = useState({
    submissionReadiness: 86,
    openValidationIssues: 18,
    tasksDue7d: 7,
    changeControlsOpen: 3,
    qualityScore: 98.7,
    methodsValidatedPct: 85,
  });
  const [stageGates, setStageGates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [validationIssues, setValidationIssues] = useState([]);
  const [risks, setRisks] = useState([]);
  const [aiInsights, setAiInsights] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const { toast } = useToast();

  // Function to navigate to method details
  const navigateToMethodDetails = methodId => {
    setViewingMethodId(methodId);
    setActiveTab('analytical');
  };

  // Function to navigate back to methods list
  const navigateBackToMethods = () => {
    setViewingMethodId(null);
  };

  // Interactive actions for dashboard
  const refreshTasks = async () => {
    try {
      const response = await fetch('/api/cmc/tasks?assignee=me');
      const tasksData = await response.json();
      setTasks(tasksData);
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    }
  };

  const refreshRisks = async () => {
    try {
      const response = await fetch('/api/cmc/risks');
      const risksData = await response.json();
      setRisks(risksData);
    } catch (error) {
      console.error('Failed to refresh risks:', error);
    }
  };

  const convertRiskToTask = async riskId => {
    try {
      const response = await fetch(`/api/cmc/risks/${riskId}/convert-to-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': 'You',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        await Promise.all([refreshTasks(), refreshRisks()]);
        toast({
          title: 'Risk Converted',
          description: 'Risk has been successfully converted to a task',
        });
      } else {
        throw new Error('Failed to convert risk');
      }
    } catch (error) {
      console.error('Error converting risk:', error);
      toast({
        title: 'Conversion Error',
        description: 'Failed to convert risk to task',
        variant: 'destructive',
      });
    }
  };

  const toggleAssign = async taskId => {
    try {
      const response = await fetch(`/api/cmc/tasks/${taskId}/toggle-assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': 'You',
        },
      });

      if (response.ok) {
        await refreshTasks();
        toast({
          title: 'Assignment Updated',
          description: 'Task assignment has been toggled',
        });
      } else {
        throw new Error('Failed to toggle assignment');
      }
    } catch (error) {
      console.error('Error toggling assignment:', error);
      toast({
        title: 'Assignment Error',
        description: 'Failed to update task assignment',
        variant: 'destructive',
      });
    }
  };

  // Fetch dashboard data on component mount
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setDashboardLoading(true);

        const [summaryRes, stageGatesRes, tasksRes, validationRes, risksRes, insightsRes] =
          await Promise.all([
            fetch('/api/cmc/dashboard/summary'),
            fetch('/api/cmc/stage-gates'),
            fetch('/api/cmc/tasks'),
            fetch('/api/cmc/validation/issues'),
            fetch('/api/cmc/risks'),
            fetch('/api/cmc/ai/insights'),
          ]);

        const [summary, stageGatesData, tasksData, validationData, risksData, insightsData] =
          await Promise.all([
            summaryRes.json(),
            stageGatesRes.json(),
            tasksRes.json(),
            validationRes.json(),
            risksRes.json(),
            insightsRes.json(),
          ]);

        setDashboardData(summary);
        setStageGates(stageGatesData);
        setTasks(tasksData);
        setValidationIssues(validationData);
        setRisks(risksData);
        setAiInsights(insightsData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load dashboard data. Using fallback data.',
          variant: 'destructive',
        });
      } finally {
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Mock data initialization
  useEffect(() => {
    const initializeData = () => {
      setAnalyticalMethods([
        {
          id: 1,
          methodCode: 'AM-001',
          technique: 'HPLC-UV',
          analyte: 'Active Pharmaceutical Ingredient',
          matrix: 'Drug Product',
          status: 'Validated',
          validationDate: '2025-07-15',
          sensitivity: '0.05 µg/mL',
          precision: '≤2.0%',
          accuracy: '98-102%',
          specificity: 'Confirmed',
          robustness: 'Acceptable',
          range: '0.05-150 µg/mL',
        },
        {
          id: 2,
          methodCode: 'AM-002',
          technique: 'GC-MS',
          analyte: 'Residual Solvents',
          matrix: 'Drug Substance',
          status: 'Under Development',
          validationDate: '2025-09-01',
          sensitivity: '10 ppm',
          precision: '≤5.0%',
          accuracy: '95-105%',
          specificity: 'In Progress',
          robustness: 'Testing',
          range: '10-500 ppm',
        },
      ]);

      setProcessValidations([
        {
          id: 1,
          processName: 'Tablet Compression',
          equipment: 'Rotary Tablet Press Model X200',
          stage: 'PV-I',
          status: 'Completed',
          completionDate: '2025-06-20',
          batchesProduced: 15,
          keyParameters: ['Compression Force', 'Turret Speed', 'Fill Depth'],
          acceptanceCriteria: 'All parameters within specification',
          deviation: 'None',
          conclusion: 'Process consistently meets requirements',
        },
      ]);

      setStabilityStudies([
        {
          id: 1,
          studyId: 'SS-2024-001',
          productName: 'Product A 10mg Tablets',
          condition: '25°C/60% RH',
          duration: '24 months',
          status: 'Ongoing',
          timepoints: ['0M', '3M', '6M', '9M', '12M'],
          testParameters: ['Assay', 'Dissolution', 'Impurities', 'Appearance'],
          currentTimepoint: '9M',
          nextSampling: '2025-12-15',
          trend: 'Stable',
        },
      ]);

      setQcTesting([
        {
          id: 1,
          lotNumber: 'LOT-2025-A001',
          productName: 'Product A 10mg',
          testDate: '2025-08-10',
          status: 'Released',
          assay: '99.2%',
          dissolution: 'Compliant',
          impurities: '≤0.1%',
          microbialLimits: 'Pass',
          endotoxins: '<0.25 EU/mL',
          analyst: 'Dr. Johnson',
          reviewer: 'Dr. Smith',
        },
      ]);

      setRiskAssessments([
        {
          id: 1,
          title: 'Manufacturing Process Risk Assessment',
          category: 'Process',
          riskLevel: 'Medium',
          probability: 3,
          severity: 4,
          riskScore: 12,
          status: 'Active',
          owner: 'Process Development Team',
          dueDate: '2025-12-01',
        },
      ]);

      setAuditData([
        {
          id: 1,
          action: 'Updated analytical method AM-001',
          user: 'Dr. Sarah Johnson',
          timestamp: '2025-08-15 14:30:25',
          entity: 'Analytical Methods',
          details: 'Modified precision acceptance criteria from ≤1.5% to ≤2.0%',
          impact: 'Medium',
        },
      ]);

      setSubmissionData([
        {
          id: 1,
          submissionType: 'NDA',
          productName: 'Product A',
          agency: 'FDA',
          status: 'Under Review',
          submissionDate: '2025-06-15',
          targetDate: '2025-12-15',
          priority: 'Standard',
          reviewDivision: 'DPARP',
          progress: 65,
        },
      ]);

      setLoading(false);
    };

    setTimeout(initializeData, 1000);
  }, []);

  // Handlers
  const openModal = (type, item = null) => {
    setModalType(type);
    setSelectedItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
  };

  const handleSubmit = async formData => {
    console.log('Form submitted:', formData);

    // Update AI context based on form submission
    updateAiContext(modalType, formData);

    // Handle server persistence for analytical methods
    if (modalType === 'analytical-methods') {
      try {
        const currentOrgId = localStorage.getItem('currentOrganization') || '7';
        const headers = {
          'x-tenant-id': currentOrgId,
          'x-user-name': 'Current User',
          'Content-Type': 'application/json',
        };

        if (selectedItem) {
          // Update existing method
          const response = await fetch(`/api/analytical/methods/${selectedItem.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              title: formData.title,
              technique: formData.technique,
              analyte: formData.analyte,
              matrix: formData.matrix,
              range: formData.range,
              precisionTarget: formData.precisionTarget,
              accuracyTarget: formData.accuracyTarget,
              owner: formData.owner,
            }),
          });

          if (response.ok) {
            // Refresh the methods list to show updated data
            window.location.reload();
          }
        } else {
          // Create new method
          const response = await fetch('/api/analytical/methods', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              code: formData.code || `AM-${Date.now().toString().slice(-8)}`,
              title: formData.title,
              technique: formData.technique,
              analyte: formData.analyte,
              matrix: formData.matrix,
              range: formData.range,
              precisionTarget: formData.precisionTarget,
              accuracyTarget: formData.accuracyTarget,
              owner: formData.owner || 'Unassigned',
              dueDate: formData.dueDate,
            }),
          });

          if (response.ok) {
            toast({
              title: 'Method Created',
              description: 'New analytical method has been created successfully',
            });
            // Refresh the methods list to show new method
            window.location.reload();
          } else {
            throw new Error('Failed to create method');
          }
        }
      } catch (error) {
        console.error('Error saving analytical method:', error);
        toast({
          title: 'Error',
          description: 'Failed to save analytical method',
          variant: 'destructive',
        });
        return;
      }
    }

    // Update the respective state arrays for other types
    switch (modalType) {
      case 'analytical-methods':
        // Already handled above with server call
        break;
      case 'process-validation':
        if (selectedItem) {
          setProcessValidations(prev =>
            prev.map(item =>
              item.id === selectedItem.id ? { ...formData, id: selectedItem.id } : item
            )
          );
        } else {
          setProcessValidations(prev => [...prev, { ...formData, id: Date.now() }]);
        }
        break;
      case 'stability-studies':
        if (selectedItem) {
          setStabilityStudies(prev =>
            prev.map(item =>
              item.id === selectedItem.id ? { ...formData, id: selectedItem.id } : item
            )
          );
        } else {
          setStabilityStudies(prev => [...prev, { ...formData, id: Date.now() }]);
        }
        break;
    }

    toast({
      title: 'Success',
      description: `${modalType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} saved successfully. AI Assistant has been updated with contextual guidance.`,
    });
    closeModal();
  };

  // Enhanced AI Processing Functions
  const [aiProcessing, setAiProcessing] = useState(false);

  const analyzeDocumentForSuggestions = async documentContent => {
    setAiProcessing(true);
    try {
      const response = await fetch('/api/ai/analyze-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          documentType: 'CMC',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggestions && data.suggestions.length > 0) {
          setRegulatorySuggestions(data.suggestions);
          toast({
            title: 'AI Analysis Complete',
            description: `Found ${data.suggestions.length} regulatory suggestions`,
          });
        } else {
          toast({
            title: 'Analysis Complete',
            description: 'Document appears compliant with current standards',
          });
        }
      } else {
        throw new Error('Analysis failed');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      toast({
        title: 'Analysis Error',
        description: 'Using fallback compliance analysis',
        variant: 'destructive',
      });
      // Fallback to mock suggestions for demo
      generateMockSuggestions();
    } finally {
      setAiProcessing(false);
    }
  };

  const enhanceContentQuality = async () => {
    setAiProcessing(true);
    try {
      const documentContent = editorRef.current?.innerHTML || '';
      const response = await fetch('/api/ai/enhance-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          enhancementType: 'quality',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (editorRef.current) {
          editorRef.current.innerHTML = data.enhancedContent;
          setEditorContent(data.enhancedContent);
          toast({
            title: 'Content Enhanced',
            description: 'Document quality improvements applied successfully',
          });
        }
      } else {
        throw new Error('Enhancement failed');
      }
    } catch (error) {
      console.error('Content enhancement error:', error);
      toast({
        title: 'Enhancement Error',
        description: 'AI enhancement service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const generateMissingSections = async () => {
    setAiProcessing(true);
    try {
      const documentContent = editorRef.current?.innerHTML || '';
      const response = await fetch('/api/ai/generate-sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          documentType: 'CMC',
          guidelines: ['FDA', 'ICH', 'EMA'],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.generatedSections && data.generatedSections.length > 0) {
          // Insert generated sections into document
          const currentContent = editorRef.current?.innerHTML || '';
          const enhancedContent = currentContent + '\n\n' + data.generatedSections.join('\n\n');
          if (editorRef.current) {
            editorRef.current.innerHTML = enhancedContent;
            setEditorContent(enhancedContent);
          }
          toast({
            title: 'Sections Generated',
            description: `Added ${data.generatedSections.length} regulatory sections`,
          });
        }
      } else {
        throw new Error('Section generation failed');
      }
    } catch (error) {
      console.error('Section generation error:', error);
      toast({
        title: 'Generation Error',
        description: 'AI section generation service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const performComplianceCheck = async () => {
    setAiProcessing(true);
    try {
      const documentContent = editorRef.current?.innerHTML || '';
      const response = await fetch('/api/ai/compliance-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          agencies: ['FDA', 'ICH', 'EMA'],
          checkType: 'comprehensive',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComplianceAnalysis({
          fdaCompliance: data.compliance.fda || 92,
          ichCompliance: data.compliance.ich || 88,
          emaCompliance: data.compliance.ema || 85,
          gaps: data.gaps || [],
        });

        if (data.suggestions && data.suggestions.length > 0) {
          setRegulatorySuggestions(prev => [...prev, ...data.suggestions]);
        }

        toast({
          title: 'Compliance Check Complete',
          description: `Found ${data.gaps?.length || 0} compliance gaps`,
        });
      } else {
        throw new Error('Compliance check failed');
      }
    } catch (error) {
      console.error('Compliance check error:', error);
      toast({
        title: 'Compliance Check Error',
        description: 'AI compliance service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const addCitationsAndReferences = async () => {
    setAiProcessing(true);
    try {
      const documentContent = editorRef.current?.innerHTML || '';
      const response = await fetch('/api/ai/add-citations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          citationType: 'regulatory',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (editorRef.current) {
          editorRef.current.innerHTML = data.contentWithCitations;
          setEditorContent(data.contentWithCitations);
          toast({
            title: 'Citations Added',
            description: `Added ${data.citationCount || 0} regulatory references`,
          });
        }
      } else {
        throw new Error('Citation addition failed');
      }
    } catch (error) {
      console.error('Citation addition error:', error);
      toast({
        title: 'Citation Error',
        description: 'AI citation service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const applyProfessionalFormatting = async () => {
    setAiProcessing(true);
    try {
      const documentContent = editorRef.current?.innerHTML || '';
      const response = await fetch('/api/ai/format-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
          formatType: 'regulatory_submission',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (editorRef.current) {
          editorRef.current.innerHTML = data.formattedContent;
          setEditorContent(data.formattedContent);
          toast({
            title: 'Formatting Applied',
            description: 'Professional regulatory formatting applied successfully',
          });
        }
      } else {
        throw new Error('Formatting failed');
      }
    } catch (error) {
      console.error('Formatting error:', error);
      toast({
        title: 'Formatting Error',
        description: 'AI formatting service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const insertSmartTemplates = async () => {
    setAiProcessing(true);
    try {
      const response = await fetch('/api/ai/smart-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          section: selectedSection,
          documentType: 'CMC',
          templateType: 'regulatory_boilerplate',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.templates && data.templates.length > 0) {
          const currentContent = editorRef.current?.innerHTML || '';
          const templateContent = data.templates.join('\n\n');
          const enhancedContent = currentContent + '\n\n' + templateContent;
          if (editorRef.current) {
            editorRef.current.innerHTML = enhancedContent;
            setEditorContent(enhancedContent);
          }
          toast({
            title: 'Templates Inserted',
            description: `Added ${data.templates.length} regulatory templates`,
          });
        }
      } else {
        throw new Error('Template insertion failed');
      }
    } catch (error) {
      console.error('Template insertion error:', error);
      toast({
        title: 'Template Error',
        description: 'AI template service temporarily unavailable',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  // Enhanced suggestion handling functions
  const applySuggestionWithAI = async suggestionId => {
    setAiProcessing(true);
    try {
      const suggestion = regulatorySuggestions.find(s => s.id === suggestionId);
      if (!suggestion) return;

      const response = await fetch('/api/ai/apply-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          suggestion,
          documentContent: editorRef.current?.innerHTML || '',
          section: selectedSection,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (editorRef.current) {
          editorRef.current.innerHTML = data.updatedContent;
          setEditorContent(data.updatedContent);
        }

        // Mark suggestion as completed
        setRegulatorySuggestions(prev =>
          prev.map(s => (s.id === suggestionId ? { ...s, status: 'completed' } : s))
        );

        toast({
          title: 'Suggestion Applied',
          description: 'AI has successfully implemented the regulatory suggestion',
        });
      } else {
        throw new Error('Suggestion application failed');
      }
    } catch (error) {
      console.error('Suggestion application error:', error);
      toast({
        title: 'Application Error',
        description: 'Could not apply suggestion automatically',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const previewSuggestion = async suggestionId => {
    const suggestion = regulatorySuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    try {
      const response = await fetch('/api/ai/preview-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': '7',
          'x-user-id': '1',
        },
        body: JSON.stringify({
          suggestion,
          documentContent: editorRef.current?.innerHTML || '',
          section: selectedSection,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRegulatorySuggestions(prev =>
          prev.map(s =>
            s.id === suggestionId
              ? { ...s, showPreview: true, previewContent: data.previewContent }
              : s
          )
        );
      } else {
        throw new Error('Preview generation failed');
      }
    } catch (error) {
      console.error('Preview error:', error);
      setRegulatorySuggestions(prev =>
        prev.map(s =>
          s.id === suggestionId
            ? { ...s, showPreview: true, previewContent: 'Preview temporarily unavailable' }
            : s
        )
      );
    }
  };

  const acceptPreview = suggestionId => {
    const suggestion = regulatorySuggestions.find(s => s.id === suggestionId);
    if (!suggestion || !suggestion.previewContent) return;

    if (editorRef.current) {
      editorRef.current.innerHTML = suggestion.previewContent;
      setEditorContent(suggestion.previewContent);
    }

    setRegulatorySuggestions(prev =>
      prev.map(s => (s.id === suggestionId ? { ...s, status: 'completed', showPreview: false } : s))
    );

    toast({
      title: 'Preview Accepted',
      description: 'Changes have been applied to the document',
    });
  };

  const hidePreview = suggestionId => {
    setRegulatorySuggestions(prev =>
      prev.map(s => (s.id === suggestionId ? { ...s, showPreview: false } : s))
    );
  };

  const editSuggestion = suggestionId => {
    // Implementation for editing suggestions
    toast({
      title: 'Edit Suggestion',
      description: 'Suggestion editing feature coming soon',
    });
  };

  const applyAllSuggestions = async () => {
    const pendingSuggestions = regulatorySuggestions.filter(s => s.status !== 'completed');
    if (pendingSuggestions.length === 0) return;

    setAiProcessing(true);
    try {
      for (const suggestion of pendingSuggestions) {
        await applySuggestionWithAI(suggestion.id);
      }
      toast({
        title: 'All Suggestions Applied',
        description: `Successfully applied ${pendingSuggestions.length} suggestions`,
      });
    } catch (error) {
      console.error('Bulk application error:', error);
      toast({
        title: 'Bulk Application Error',
        description: 'Some suggestions could not be applied',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  const generateMockSuggestions = () => {
    // Fallback mock suggestions for demonstration
    setRegulatorySuggestions([
      {
        id: Date.now() + 1,
        type: 'compliance',
        title: 'Add ICH Q6A Reference',
        suggestion: 'Consider adding reference to ICH Q6A guidelines for analytical procedures',
        guideline: 'ICH Q6A',
        severity: 'medium',
        status: 'pending',
      },
      {
        id: Date.now() + 2,
        type: 'content',
        title: 'Enhance Method Description',
        suggestion:
          'Provide more detailed description of the analytical method validation parameters',
        guideline: 'ICH Q2(R1)',
        severity: 'low',
        status: 'pending',
      },
    ]);
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">CMC Dashboard</h2>
          <p className="text-gray-600">Real-time CMC project status and AI-powered insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Quick Action
          </Button>
        </div>
      </div>

      {dashboardLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Target className="h-4 w-4 mr-2 text-blue-500" />
                  Submission Readiness
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {dashboardData.submissionReadiness}%
                </div>
                <Progress value={dashboardData.submissionReadiness} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">Overall preparation status</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                  Methods Validated
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {dashboardData.methodsValidatedPct}%
                </div>
                <Progress value={dashboardData.methodsValidatedPct} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">Analytical methods approved</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Award className="h-4 w-4 mr-2 text-purple-500" />
                  Quality Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {dashboardData.qualityScore}
                </div>
                <p className="text-xs text-muted-foreground">Compliance excellence metric</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-orange-500" />
                  Action Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{dashboardData.tasksDue7d}</div>
                <p className="text-xs text-muted-foreground">Tasks due in 7 days</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights Section */}
          {aiInsights.length > 0 && (
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center text-purple-800">
                  <Brain className="h-5 w-5 mr-2" />
                  AI-Powered Insights
                </CardTitle>
                <CardDescription>Smart recommendations for your CMC submission</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiInsights.map(insight => (
                    <div key={insight.id} className="bg-white p-4 rounded border border-purple-200">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-purple-900">{insight.text}</p>
                            {insight.confidence && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  insight.confidence >= 0.9
                                    ? 'bg-green-50 text-green-700 border-green-300'
                                    : insight.confidence >= 0.8
                                      ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                                      : 'bg-gray-50 text-gray-700 border-gray-300'
                                }`}
                              >
                                {Math.round(insight.confidence * 100)}% confidence
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-purple-700 mt-1">Why: {insight.why}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                insight.type === 'predictive'
                                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                                  : insight.type === 'compliance'
                                    ? 'bg-red-50 text-red-700 border-red-300'
                                    : insight.type === 'opportunity'
                                      ? 'bg-green-50 text-green-700 border-green-300'
                                      : insight.type === 'risk_assessment'
                                        ? 'bg-orange-50 text-orange-700 border-orange-300'
                                        : insight.type === 'multi_agency'
                                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                                          : 'bg-gray-50 text-gray-700 border-gray-300'
                              }`}
                            >
                              {insight.type?.replace('_', ' ') || 'analysis'}
                            </Badge>
                            <Badge
                              variant={
                                insight.impactLevel === 'HIGH'
                                  ? 'destructive'
                                  : insight.impactLevel === 'MEDIUM'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-xs"
                            >
                              {insight.impactLevel} Impact
                            </Badge>
                          </div>
                        </div>
                        {insight.ownerSuggestion && (
                          <Badge variant="outline" className="text-purple-700 border-purple-300">
                            {insight.ownerSuggestion}
                          </Badge>
                        )}
                      </div>
                      <div className="bg-purple-100 p-2 rounded text-sm text-purple-800 mb-3">
                        <span className="font-medium">Recommended Action:</span> {insight.action}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                          <Zap className="h-3 w-3 mr-1" />
                          Take Action
                        </Button>
                        {insight.type === 'predictive' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            <BarChart3 className="h-3 w-3 mr-1" />
                            View Model
                          </Button>
                        )}
                        {insight.type === 'compliance' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Check Rules
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage Gates Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitBranch className="h-5 w-5 mr-2" />
                Stage Gates Progress
              </CardTitle>
              <CardDescription>Critical path milestones and deliverables</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stageGates.map(stage => (
                  <div key={stage.id} className="p-4 border rounded">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium">{stage.name}</h4>
                        <p className="text-sm text-gray-600">Owner: {stage.owner}</p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={
                            stage.status === 'APPROVED'
                              ? 'default'
                              : stage.status === 'READY_FOR_QA'
                                ? 'secondary'
                                : stage.status === 'IN_PROGRESS'
                                  ? 'outline'
                                  : 'destructive'
                          }
                        >
                          {stage.status.replace('_', ' ')}
                        </Badge>
                        <p className="text-sm text-gray-500 mt-1">
                          Due: {new Date(stage.due).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{stage.progress}%</span>
                      </div>
                      <Progress value={stage.progress} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tasks and Issues Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Critical Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Critical Tasks
                </CardTitle>
                <CardDescription>High-priority items requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tasks
                    .filter(task => task.priority === 'CRITICAL' || task.priority === 'HIGH')
                    .slice(0, 5)
                    .map(task => (
                      <div key={task.id} className="p-3 border rounded">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{task.title}</p>
                            <p className="text-xs text-gray-600">{task.section}</p>
                            {task.why && <p className="text-xs text-gray-500 mt-1">{task.why}</p>}
                          </div>
                          <Badge
                            variant={task.priority === 'CRITICAL' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-gray-500">{task.owner}</span>
                          {task.due && (
                            <span className="text-xs text-orange-600">
                              Due: {new Date(task.due).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {task.link && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                              <Link className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => toggleAssign(task.id)}
                          >
                            <Users className="h-3 w-3 mr-1" />
                            {task.owner === 'You' ? 'Unassign' : 'Assign'}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Validation Issues */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Validation Issues
                </CardTitle>
                <CardDescription>Open compliance and validation concerns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {validationIssues.slice(0, 5).map(issue => (
                    <div key={issue.id} className="p-3 border rounded">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{issue.title}</p>
                          <p className="text-xs text-gray-600">
                            {issue.section} • {issue.rule_id}
                          </p>
                        </div>
                        <Badge
                          variant={issue.severity === 'ERROR' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {issue.severity}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">{issue.owner}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(issue.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Risk Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Risk Management
              </CardTitle>
              <CardDescription>Project risks and mitigation strategies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {risks.map(risk => (
                  <div key={risk.id} className="p-4 border rounded">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium">{risk.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{risk.mitigation}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            Impact: {risk.impact}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Prob: {risk.probability}
                          </Badge>
                        </div>
                        <Badge
                          variant={risk.status === 'OPEN' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {risk.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-gray-500">Owner: {risk.owner}</div>
                      {risk.status === 'OPEN' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={() => convertRiskToTask(risk.id)}
                        >
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          Convert to Task
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setActiveTab('analytical-methods')}
            >
              <CardContent className="p-6 text-center">
                <Microscope className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Analytical Methods</h3>
                <p className="text-sm text-gray-600">
                  Manage method validation and analytical procedures
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setActiveTab('process-validation')}
            >
              <CardContent className="p-6 text-center">
                <Settings className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Process Validation</h3>
                <p className="text-sm text-gray-600">
                  Monitor manufacturing process validation studies
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setActiveTab('quality-control')}
            >
              <CardContent className="p-6 text-center">
                <TestTube className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Quality Control</h3>
                <p className="text-sm text-gray-600">Batch release testing and QC oversight</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );

  const renderAnalyticalMethods = () => {
    // Check if we're viewing method details
    if (viewingMethodId) {
      return <MethodDetails methodId={viewingMethodId} onBack={navigateBackToMethods} />;
    }

    return <AnalyticalMethodsTab openModal={openModal} onViewMethod={navigateToMethodDetails} />;
  };

  const renderProcessValidation = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Process Validation</h2>
          <p className="text-gray-600">Manufacturing process validation and lifecycle management</p>
        </div>
        <Button
          onClick={() => openModal('process-validation')}
          className="bg-green-600 hover:bg-green-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Validation
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {processValidations.map(validation => (
          <Card key={validation.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{validation.processName}</CardTitle>
                  <CardDescription>{validation.equipment}</CardDescription>
                </div>
                <Badge variant="default">{validation.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Key Parameters</h4>
                  <ul className="text-sm space-y-1">
                    {validation.keyParameters.map((param, index) => (
                      <li key={index} className="flex items-center">
                        <CheckCircle2 className="w-3 h-3 text-green-500 mr-2" />
                        {param}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Validation Details</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Stage:</span> {validation.stage}
                    </p>
                    <p>
                      <span className="font-medium">Batches:</span> {validation.batchesProduced}
                    </p>
                    <p>
                      <span className="font-medium">Completion:</span> {validation.completionDate}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Status</h4>
                  <div className="text-sm">
                    <p className="text-green-600">{validation.conclusion}</p>
                    <div className="mt-2 flex space-x-2">
                      <Button size="sm" variant="outline">
                        <Eye className="w-3 h-3 mr-1" />
                        Report
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderStabilityStudies = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Stability Studies</h2>
          <p className="text-gray-600">Long-term stability monitoring and data management</p>
        </div>
        <Button
          onClick={() => openModal('stability-studies')}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Study
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {stabilityStudies.map(study => (
          <Card key={study.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{study.productName}</CardTitle>
                  <CardDescription>
                    {study.studyId} • {study.condition}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{study.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Study Details</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Duration:</span> {study.duration}
                    </p>
                    <p>
                      <span className="font-medium">Current:</span> {study.currentTimepoint}
                    </p>
                    <p>
                      <span className="font-medium">Next Sampling:</span> {study.nextSampling}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Test Parameters</h4>
                  <div className="text-sm space-y-1">
                    {study.testParameters.map((param, index) => (
                      <div key={index} className="flex items-center">
                        <CheckCircle2 className="w-3 h-3 text-green-500 mr-2" />
                        {param}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Timepoints</h4>
                  <div className="flex flex-wrap gap-1">
                    {study.timepoints.map((timepoint, index) => (
                      <Badge
                        key={index}
                        variant={timepoint === study.currentTimepoint ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {timepoint}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Trend Analysis</h4>
                  <div className="text-sm">
                    <div className="flex items-center">
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-green-600">{study.trend}</span>
                    </div>
                    <Button size="sm" variant="outline" className="mt-2">
                      <BarChart3 className="w-3 h-3 mr-1" />
                      View Data
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderQualityControl = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Quality Control</h2>
          <p className="text-gray-600">Batch release testing and quality monitoring</p>
        </div>
        <Button onClick={() => openModal('qc-testing')} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 mr-2" />
          New Test
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {qcTesting.map(test => (
          <Card key={test.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{test.lotNumber}</CardTitle>
                  <CardDescription>{test.productName}</CardDescription>
                </div>
                <Badge variant="default">{test.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Test Results</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Assay:</span>
                      <span className="font-medium text-green-600">{test.assay}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dissolution:</span>
                      <span className="font-medium text-green-600">{test.dissolution}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Impurities:</span>
                      <span className="font-medium text-green-600">{test.impurities}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Microbial Testing</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Microbial Limits:</span>
                      <span className="font-medium text-green-600">{test.microbialLimits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Endotoxins:</span>
                      <span className="font-medium text-green-600">{test.endotoxins}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Review Chain</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Analyst:</span> {test.analyst}
                    </p>
                    <p>
                      <span className="font-medium">Reviewer:</span> {test.reviewer}
                    </p>
                    <p>
                      <span className="font-medium">Test Date:</span> {test.testDate}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderRegulatoryManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Regulatory Management</h2>
          <p className="text-gray-600">Multi-agency submissions and regulatory compliance</p>
        </div>
        <Button
          onClick={() => openModal('submission')}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Submission
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {submissionData.map(submission => (
          <Card key={submission.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{submission.productName}</CardTitle>
                  <CardDescription>
                    {submission.submissionType} • {submission.agency}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{submission.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Submission Date:</span>
                    <p>{submission.submissionDate}</p>
                  </div>
                  <div>
                    <span className="font-medium">Target Date:</span>
                    <p>{submission.targetDate}</p>
                  </div>
                  <div>
                    <span className="font-medium">Priority:</span>
                    <p>{submission.priority}</p>
                  </div>
                  <div>
                    <span className="font-medium">Review Division:</span>
                    <p>{submission.reviewDivision}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm">{submission.progress}%</span>
                  </div>
                  <Progress value={submission.progress} className="h-2" />
                </div>
                <div className="flex space-x-2">
                  <Button size="sm" variant="outline">
                    <FileText className="w-3 h-3 mr-1" />
                    Documents
                  </Button>
                  <Button size="sm" variant="outline">
                    <Calendar className="w-3 h-3 mr-1" />
                    Timeline
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // COMPREHENSIVE ENHANCED DOCUMENT EDITOR - ALL FEATURES CONSOLIDATED
  const renderDocumentAuthoring = () => {
    const [editorView, setEditorView] = useState('editor');
    const [selectedSection, setSelectedSection] = useState('3.2.S.1');
    const [documentState, setDocumentState] = useState('DRAFT');
    const [trackChangesMode, setTrackChangesMode] = useState(false);
    const [rightPanelTab, setRightPanelTab] = useState('guidance');
    const [isDownloading, setIsDownloading] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showContextHints, setShowContextHints] = useState(true);
    const [editorContent, setEditorContent] = useState(`
      <h1>3.2.S.1 - General Information</h1>
      <h2>Nomenclature</h2>
      <p>Provide the chemical name, approved name, proprietary name, company code, and other descriptive names for the drug substance. Include the Chemical Abstracts Service (CAS) registry number.</p>
      
      <h2>Structure</h2>
      <p>Provide the structural formula, including stereochemistry, the molecular formula, and molecular weight of the drug substance.</p>
      
      <h2>General Properties</h2>
      <p>Describe the general properties of the drug substance (e.g., appearance, color, physical state, hygroscopicity).</p>
    `);

    // Enhanced AI Compliance Analysis State
    const [complianceAnalysis, setComplianceAnalysis] = useState({
      overallScore: 88,
      fdaCompliance: 85,
      ichCompliance: 92,
      emaCompliance: 86,
      gaps: [
        { section: '3.2.S.1', issue: 'Missing CAS registry number', severity: 'medium' },
        { section: '3.2.S.7', issue: 'Incomplete stability commitment', severity: 'high' },
      ],
      suggestions: [
        'Add comprehensive stability data for accelerated conditions',
        'Include detailed impurity profile analysis',
        'Provide manufacturing scale considerations',
      ],
    });

    // Context Hints System (from EnhancedDocumentEditor)
    const [contextHints, setContextHints] = useState([
      {
        type: 'structure',
        title: 'ICH Guideline Structure',
        content: 'Follow ICH M4Q format for consistent organization',
        priority: 'high',
      },
      {
        type: 'compliance',
        title: 'FDA Requirement',
        content: 'Include CAS registry number for substance identification',
        priority: 'medium',
      },
      {
        type: 'content',
        title: 'Missing Content',
        content: 'Add stereochemistry details for optical activity',
        priority: 'low',
      },
    ]);

    // Regulatory Spell Check & Suggestions (Grammarly-like)
    const [regulatorySuggestions, setRegulatorySuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [suggestionPosition, setSuggestionPosition] = useState({ x: 0, y: 0 });
    const [activeSuggestion, setActiveSuggestion] = useState(null);
    const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);

    // Version History with localStorage (from EnhancedDocumentEditor)
    const [versions, setVersions] = useState(() => {
      const savedVersions = localStorage.getItem('cmc-document-versions');
      if (savedVersions) {
        return JSON.parse(savedVersions).map(v => ({
          ...v,
          timestamp: new Date(v.timestamp),
        }));
      }
      return [
        {
          id: 'current',
          timestamp: new Date(),
          author: 'You',
          changes: 'Current working version',
          content: editorContent,
          isCurrent: true,
        },
      ];
    });

    // Dossier Structure (from DocumentAuthoringFixed)
    const dossierStructure = {
      'Module 3 - Quality': {
        'S - Drug Substance': {
          '3.2.S.1': {
            title: 'General Information',
            status: 'In Progress',
            validation: 'Minor Issues',
          },
          '3.2.S.2': { title: 'Manufacture', status: 'Draft', validation: 'Pending' },
          '3.2.S.3': { title: 'Characterisation', status: 'Complete', validation: 'Pass' },
          '3.2.S.4': {
            title: 'Control of Drug Substance',
            status: 'In Progress',
            validation: 'Major Issues',
          },
          '3.2.S.5': { title: 'Reference Standards', status: 'Complete', validation: 'Pass' },
          '3.2.S.6': { title: 'Container Closure System', status: 'Draft', validation: 'Pending' },
          '3.2.S.7': { title: 'Stability', status: 'In Progress', validation: 'Minor Issues' },
        },
        'P - Drug Product': {
          '3.2.P.1': {
            title: 'Description and Composition',
            status: 'Complete',
            validation: 'Pass',
          },
          '3.2.P.2': {
            title: 'Pharmaceutical Development',
            status: 'In Progress',
            validation: 'Minor Issues',
          },
        },
      },
    };

    // Professional Rich Text Editor Configuration (MS Word-like experience)
    const editorRef = useRef(null);
    const [characterCount, setCharacterCount] = useState(0);
    const [activeFormats, setActiveFormats] = useState({
      bold: false,
      italic: false,
      underline: false,
      justifyLeft: false,
      justifyCenter: false,
      justifyRight: false,
      insertUnorderedList: false,
      insertOrderedList: false,
    });

    // Check active formatting states
    const updateActiveFormats = () => {
      if (!editorRef.current) return;

      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    };

    // Enhanced Regulatory Analysis Engine with Enterprise API Integration
    const analyzeRegulatoryCompliance = async text => {
      try {
        // Try enterprise API first
        const response = await fetch('/api/enterprise/regulatory/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': '7',
            'x-user-id': '1',
          },
          body: JSON.stringify({
            text: text,
            documentType: 'CMC',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.analysis.suggestions || [];
        }

        // Fallback to local analysis if API fails
        console.log('Using local regulatory analysis fallback');
        return performLocalAnalysis(text);
      } catch (error) {
        console.log('Enterprise API unavailable, using local analysis:', error);
        return performLocalAnalysis(text);
      }
    };

    // Local analysis fallback function
    const performLocalAnalysis = text => {
      const suggestions = [];
      const textLower = text.toLowerCase();

      // FDA terminology suggestions
      const fdaTerms = {
        'drug substance': 'active pharmaceutical ingredient (API)',
        excipient: 'inactive ingredient',
        formulation: 'drug product composition',
        batch: 'lot',
        testing: 'analytical testing',
        specification: 'acceptance criteria',
        impurity: 'related substance',
        'degradation product': 'degradation impurity',
        'process validation': 'process performance qualification',
      };

      // ICH compliance checks
      const ichRequirements = {
        stability: 'Include ICH Q1A(R2) stability testing conditions',
        impurities: 'Follow ICH Q3A(R2) and Q3B(R2) impurity guidelines',
        'analytical methods': 'Validate per ICH Q2(R1) analytical validation guidelines',
        'pharmaceutical development': 'Include ICH Q8(R2) quality by design principles',
        specifications: 'Follow ICH Q6A specifications guidelines',
      };

      // Required sections check
      const requiredElements = [
        {
          term: 'cas registry number',
          suggestion: 'Include CAS registry number for substance identification (FDA requirement)',
        },
        {
          term: 'molecular formula',
          suggestion: 'Provide molecular formula and molecular weight (ICH M4Q requirement)',
        },
        {
          term: 'stereochemistry',
          suggestion:
            'Include stereochemistry details including absolute configuration (ICH requirement)',
        },
        {
          term: 'polymorphism',
          suggestion: 'Address polymorphic forms and control strategy (ICH Q6A)',
        },
        { term: 'solubility', suggestion: 'Include pH-dependent solubility data (FDA guidance)' },
      ];

      // Check for incorrect terminology
      Object.entries(fdaTerms).forEach(([incorrect, correct]) => {
        if (textLower.includes(incorrect) && !textLower.includes(correct)) {
          suggestions.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'terminology',
            severity: 'medium',
            text: incorrect,
            suggestion: `Consider using FDA-preferred term: "${correct}"`,
            action: 'Replace',
            guideline: 'FDA',
            position: textLower.indexOf(incorrect),
            replacement: correct,
          });
        }
      });

      // Check ICH compliance
      Object.entries(ichRequirements).forEach(([term, requirement]) => {
        if (textLower.includes(term)) {
          suggestions.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'compliance',
            severity: 'high',
            text: term,
            suggestion: requirement,
            action: 'Enhance',
            guideline: 'ICH',
            position: textLower.indexOf(term),
          });
        }
      });

      // Check for missing required elements
      requiredElements.forEach(({ term, suggestion }) => {
        if (!textLower.includes(term)) {
          suggestions.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'missing',
            severity: 'high',
            text: '',
            suggestion: suggestion,
            action: 'Add',
            guideline: 'Regulatory Requirement',
            position: -1,
          });
        }
      });

      // Grammar and style checks specific to regulatory writing
      const styleChecks = [
        {
          pattern: /\bi\.e\./gi,
          suggestion: 'Use "that is" instead of "i.e." for clarity in regulatory documents',
        },
        {
          pattern: /\be\.g\./gi,
          suggestion: 'Use "for example" instead of "e.g." for clarity in regulatory documents',
        },
        {
          pattern: /\bshall\b/gi,
          suggestion:
            'Consider using "will" or "must" instead of "shall" for modern regulatory style',
        },
        {
          pattern: /\bdata is\b/gi,
          suggestion: 'Use "data are" (data is plural in scientific writing)',
        },
      ];

      styleChecks.forEach(({ pattern, suggestion }) => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            suggestions.push({
              id: Math.random().toString(36).substr(2, 9),
              type: 'style',
              severity: 'low',
              text: match,
              suggestion: suggestion,
              action: 'Revise',
              guideline: 'Style Guide',
              position: text.indexOf(match),
            });
          });
        }
      });

      return suggestions;
    };

    const handleEditorChange = async () => {
      if (editorRef.current) {
        const html = editorRef.current.innerHTML;
        const text = editorRef.current.textContent || '';
        setEditorContent(html);
        setCharacterCount(text.length);
        updateActiveFormats();

        // Real-time regulatory analysis with enterprise integration
        if (suggestionsEnabled && text.length > 10) {
          try {
            const suggestions = await analyzeRegulatoryCompliance(text);
            setRegulatorySuggestions(suggestions);
          } catch (error) {
            console.log('Analysis error:', error);
            // Keep existing suggestions if analysis fails
          }
        }

        // Auto-save to localStorage
        localStorage.setItem('cmc-document-content', html);
      }
    };

    const handleEditorKeyUp = () => {
      updateActiveFormats();
    };

    const handleEditorClick = () => {
      updateActiveFormats();
    };

    const execCommand = (command, value = null) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      handleEditorChange();
      // Small delay to ensure command is applied before checking state
      setTimeout(updateActiveFormats, 10);
    };

    const insertTable = () => {
      const table = `
        <table border="1" style="border-collapse: collapse; width: 100%; margin: 16px 0; font-family: inherit;">
          <tr>
            <th style="padding: 12px; background: #f8f9fa; border: 1px solid #dee2e6; font-weight: 600;">Header 1</th>
            <th style="padding: 12px; background: #f8f9fa; border: 1px solid #dee2e6; font-weight: 600;">Header 2</th>
            <th style="padding: 12px; background: #f8f9fa; border: 1px solid #dee2e6; font-weight: 600;">Header 3</th>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 1</td>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 2</td>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 3</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 4</td>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 5</td>
            <td style="padding: 12px; border: 1px solid #dee2e6;">Cell 6</td>
          </tr>
        </table>
        <p><br></p>
      `;
      document.execCommand('insertHTML', false, table);
      handleEditorChange();
    };

    // Accept/Reject suggestion functions
    const acceptSuggestion = suggestionId => {
      const suggestion = regulatorySuggestions.find(s => s.id === suggestionId);
      if (!suggestion || !editorRef.current) return;

      if (suggestion.type === 'terminology' && suggestion.replacement) {
        const currentContent = editorRef.current.innerHTML;
        const updatedContent = currentContent.replace(
          new RegExp(suggestion.text, 'gi'),
          suggestion.replacement
        );
        editorRef.current.innerHTML = updatedContent;
        handleEditorChange();
      }

      // Remove accepted suggestion
      setRegulatorySuggestions(prev => prev.filter(s => s.id !== suggestionId));
      setActiveSuggestion(null);

      toast({
        title: 'Suggestion Applied',
        description: 'Regulatory suggestion has been applied to your document',
        variant: 'success',
      });
    };

    const rejectSuggestion = suggestionId => {
      setRegulatorySuggestions(prev => prev.filter(s => s.id !== suggestionId));
      setActiveSuggestion(null);

      toast({
        title: 'Suggestion Dismissed',
        description: 'Regulatory suggestion has been dismissed',
        variant: 'default',
      });
    };

    // Keyboard shortcuts for common commands
    const handleKeyDown = e => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'b':
            e.preventDefault();
            execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            execCommand('underline');
            break;
          case 's':
            e.preventDefault();
            saveVersion('Keyboard shortcut save');
            break;
        }
      }
    };

    // Save new version
    const saveVersion = changes => {
      const newVersion = {
        id: Date.now(),
        timestamp: new Date(),
        author: 'You',
        changes: changes || 'Document updated',
        content: editorContent,
        isCurrent: false,
      };

      const updatedVersions = [newVersion, ...versions.filter(v => !v.isCurrent)];
      setVersions(updatedVersions);
      localStorage.setItem('cmc-document-versions', JSON.stringify(updatedVersions));

      toast({
        title: 'Version Saved',
        description: 'Document version saved successfully',
        variant: 'success',
      });
    };

    // Download as RTF (Word-compatible)
    const downloadRTF = async () => {
      setIsDownloading(true);
      try {
        // Convert HTML to RTF format
        const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
          \\f0\\fs24 ${editorContent.replace(/<[^>]*>/g, '').replace(/\n/g, '\\par ')}
        }`;

        const blob = new Blob([rtfContent], { type: 'application/rtf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedSection}_${documentState}.rtf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Download Complete',
          description: 'Document downloaded as RTF format',
          variant: 'success',
        });
      } catch (error) {
        toast({
          title: 'Download Failed',
          description: 'Error downloading document',
          variant: 'destructive',
        });
      } finally {
        setIsDownloading(false);
      }
    };

    return (
      <div className="h-full flex flex-col bg-white">
        {/* Enhanced Header with Professional Toolbar */}
        <div className="border-b bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setEditorView('overview')}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Templates
              </Button>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Document Section</span>
                <Badge variant="outline">{documentState}</Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTrackChangesMode(!trackChangesMode)}
                className={trackChangesMode ? 'bg-yellow-100 border-yellow-300' : ''}
              >
                Track Changes
              </Button>
              <Button variant="outline" size="sm" onClick={downloadRTF} disabled={isDownloading}>
                {isDownloading ? (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-1" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                DOCX
              </Button>
              <Button onClick={() => saveVersion('Manual save')}>
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Select value="EN" onValueChange={() => {}}>
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EN">EN</SelectItem>
                  <SelectItem value="DE">DE</SelectItem>
                  <SelectItem value="FR">FR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Enhanced MS Word-Style Formatting Toolbar */}
          <div className="flex items-center gap-1 p-3 bg-white rounded border shadow-sm">
            {/* Font Formatting */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeFormats.bold ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('bold')}
                className={`transition-all ${activeFormats.bold ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                variant={activeFormats.italic ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('italic')}
                className={`transition-all ${activeFormats.italic ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                variant={activeFormats.underline ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('underline')}
                className={`transition-all ${activeFormats.underline ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Text Alignment */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeFormats.justifyLeft ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('justifyLeft')}
                className={`transition-all ${activeFormats.justifyLeft ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Align Left"
              >
                <AlignLeft className="w-4 h-4" />
              </Button>
              <Button
                variant={activeFormats.justifyCenter ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('justifyCenter')}
                className={`transition-all ${activeFormats.justifyCenter ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Center Align"
              >
                <AlignCenter className="w-4 h-4" />
              </Button>
              <Button
                variant={activeFormats.justifyRight ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('justifyRight')}
                className={`transition-all ${activeFormats.justifyRight ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Align Right"
              >
                <AlignRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Lists */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeFormats.insertUnorderedList ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('insertUnorderedList')}
                className={`transition-all ${activeFormats.insertUnorderedList ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Bullet List"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={activeFormats.insertOrderedList ? 'default' : 'ghost'}
                size="sm"
                onClick={() => execCommand('insertOrderedList')}
                className={`transition-all ${activeFormats.insertOrderedList ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}`}
                title="Numbered List"
              >
                <ListOrdered className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Table and Formatting */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={insertTable} title="Insert Table">
                <TableIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('hiliteColor', '#ffff00')}
                title="Highlight Text"
              >
                <Highlighter className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-2" />

            {/* Text Style Dropdown */}
            <select
              onChange={e => {
                if (e.target.value) {
                  execCommand('formatBlock', e.target.value);
                  e.target.value = ''; // Reset selection
                }
              }}
              className="px-3 py-1.5 text-sm border rounded hover:border-blue-300 focus:border-blue-500 focus:outline-none"
              defaultValue=""
            >
              <option value="">Style</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="p">Normal</option>
            </select>

            {/* Additional Tools */}
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('undo')}
                title="Undo (Ctrl+Z)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('redo')}
                title="Redo (Ctrl+Y)"
              >
                <RotateCw className="w-4 h-4" />
              </Button>

              {/* Regulatory Suggestions Toggle */}
              <div className="w-px h-6 bg-gray-300 mx-2" />
              <Button
                variant={suggestionsEnabled ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSuggestionsEnabled(!suggestionsEnabled)}
                className={`transition-all ${suggestionsEnabled ? 'bg-green-100 text-green-800 border-green-300' : ''}`}
                title="Toggle Regulatory Suggestions"
              >
                <Brain className="w-4 h-4" />
                {regulatorySuggestions.length > 0 && (
                  <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                    {regulatorySuggestions.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Left Panel - Dossier Structure */}
          <div className="w-80 border-r bg-gray-50 overflow-y-auto">
            <div className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Dossier Structure
              </h3>

              {Object.entries(dossierStructure).map(([module, sections]) => (
                <div key={module} className="mb-4">
                  <div className="font-medium text-sm text-gray-700 mb-2">{module}</div>
                  {Object.entries(sections).map(([category, items]) => (
                    <div key={category} className="ml-2 mb-2">
                      <div className="font-medium text-xs text-gray-600 mb-1">{category}</div>
                      {Object.entries(items).map(([code, info]) => (
                        <div
                          key={code}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer mb-1 ${
                            selectedSection === code
                              ? 'bg-blue-100 border-blue-300'
                              : 'hover:bg-white'
                          }`}
                          onClick={() => setSelectedSection(code)}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{code}</div>
                            <div className="text-xs text-gray-600">{info.title}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={info.status === 'Complete' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {info.status}
                            </Badge>
                            {info.validation === 'Pass' && (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            )}
                            {info.validation === 'Major Issues' && (
                              <AlertCircle className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Center Panel - TipTap Editor */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedSection} -{' '}
                  {
                    dossierStructure['Module 3 - Quality']['S - Drug Substance'][selectedSection]
                      ?.title
                  }
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                  >
                    <History className="w-4 h-4 mr-1" />
                    History
                  </Button>
                  <Badge variant="outline">{characterCount} characters</Badge>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-white">
              {/* Professional Rich Text Editor */}
              <div className="relative">
                <div
                  ref={editorRef}
                  contentEditable={true}
                  className="focus:outline-none min-h-[600px] border rounded-lg bg-white shadow-sm editor-content"
                  style={{
                    padding: '32px 48px',
                    lineHeight: '1.8',
                    fontSize: '16px',
                    fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
                    color: '#333333',
                    letterSpacing: '0.01em',
                    wordSpacing: '0.05em',
                    maxWidth: '21cm', // A4 width simulation
                    margin: '0 auto',
                    minHeight: '29.7cm', // A4 height simulation
                    boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                    background: '#ffffff',
                    position: 'relative',
                  }}
                  onInput={handleEditorChange}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleEditorKeyUp}
                  onClick={handleEditorClick}
                  dangerouslySetInnerHTML={{ __html: editorContent }}
                  suppressContentEditableWarning={true}
                  spellCheck={true}
                />

                {/* Add custom styles for MS Word-like appearance and regulatory suggestions */}
                <style jsx>{`
                  .editor-content p {
                    margin: 0 0 12px 0;
                    line-height: 1.6;
                  }

                  .editor-content h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 24px 0 16px 0;
                    color: #2c3e50;
                    line-height: 1.3;
                  }

                  .editor-content h2 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 20px 0 12px 0;
                    color: #34495e;
                    line-height: 1.4;
                  }

                  .editor-content h3 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 16px 0 8px 0;
                    color: #34495e;
                    line-height: 1.4;
                  }

                  .editor-content ul,
                  .editor-content ol {
                    margin: 12px 0;
                    padding-left: 24px;
                  }

                  .editor-content li {
                    margin: 4px 0;
                    line-height: 1.6;
                  }

                  .editor-content table {
                    margin: 16px 0;
                    width: 100%;
                    border-collapse: collapse;
                    font-family: inherit;
                  }

                  .editor-content table th {
                    background: #f8f9fa;
                    font-weight: 600;
                    text-align: left;
                  }

                  .editor-content table td,
                  .editor-content table th {
                    padding: 12px;
                    border: 1px solid #dee2e6;
                    vertical-align: top;
                  }

                  .editor-content strong {
                    font-weight: 600;
                  }

                  .editor-content em {
                    font-style: italic;
                  }

                  .editor-content u {
                    text-decoration: underline;
                  }

                  .editor-content:focus {
                    outline: none;
                    border-color: #4285f4;
                    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
                  }

                  .editor-content br {
                    line-height: 1.6;
                  }

                  .editor-content div {
                    margin: 0;
                  }

                  /* Fix for empty lines */
                  .editor-content div:empty::after {
                    content: '\\A';
                    white-space: pre;
                  }

                  /* Regulatory suggestion highlights */
                  .regulatory-highlight {
                    background-color: rgba(59, 130, 246, 0.1);
                    border-bottom: 2px solid #3b82f6;
                    cursor: pointer;
                    position: relative;
                  }

                  .regulatory-highlight.severity-high {
                    border-bottom-color: #ef4444;
                    background-color: rgba(239, 68, 68, 0.1);
                  }

                  .regulatory-highlight.severity-medium {
                    border-bottom-color: #f59e0b;
                    background-color: rgba(245, 158, 11, 0.1);
                  }

                  .regulatory-highlight:hover {
                    background-color: rgba(59, 130, 246, 0.2);
                  }
                `}</style>

                {/* Professional Context Toolbar */}
                <div className="absolute top-2 right-2 flex gap-1 bg-white border rounded shadow-sm p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => execCommand('bold')}
                    className="w-8 h-8 p-0"
                    title="Bold"
                  >
                    <Bold className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => execCommand('italic')}
                    className="w-8 h-8 p-0"
                    title="Italic"
                  >
                    <Italic className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => execCommand('hiliteColor', '#ffff00')}
                    className="w-8 h-8 p-0"
                    title="Highlight"
                  >
                    <Highlighter className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Context & Analysis */}
          <div className="w-80 border-l bg-gray-50 overflow-y-auto">
            <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="h-full">
              <TabsList className="grid w-full grid-cols-5 p-1">
                <TabsTrigger value="suggestions" className="text-xs relative">
                  Suggestions
                  {regulatorySuggestions.length > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 px-1 py-0 text-xs"
                    >
                      {regulatorySuggestions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="guidance" className="text-xs">
                  Guidance
                </TabsTrigger>
                <TabsTrigger value="data" className="text-xs">
                  Data
                </TabsTrigger>
                <TabsTrigger value="citations" className="text-xs">
                  Citations
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  History
                </TabsTrigger>
              </TabsList>

              {/* Regulatory Suggestions Tab */}
              <TabsContent value="suggestions" className="p-4 space-y-4 h-full">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-600" />
                    Regulatory Suggestions
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSuggestionsEnabled(!suggestionsEnabled)}
                    className={suggestionsEnabled ? 'text-green-600' : 'text-gray-400'}
                  >
                    {suggestionsEnabled ? 'ON' : 'OFF'}
                  </Button>
                </div>

                {!suggestionsEnabled && (
                  <div className="text-center py-8 text-gray-500">
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Regulatory suggestions are disabled</p>
                    <p className="text-xs">Enable to get real-time guidance</p>
                  </div>
                )}

                {suggestionsEnabled && regulatorySuggestions.length === 0 && (
                  <div className="space-y-4">
                    <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
                      <div className="text-lg font-medium text-green-700 mb-1">
                        Document Compliant
                      </div>
                      <div className="text-sm text-gray-600">
                        No immediate regulatory issues detected
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const documentContent = editorRef.current?.innerHTML || '';
                          if (documentContent.trim()) {
                            analyzeDocumentForSuggestions(documentContent);
                          }
                        }}
                        className="text-xs mt-2"
                        data-testid="button-analyze-document"
                      >
                        <Brain className="w-3 h-3 mr-1" />
                        Writing Assistant
                      </Button>
                    </div>

                    {/* Enhanced AI Action Options */}
                    <div className="space-y-3">
                      <h5 className="font-medium text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        AI Enhancement Options
                      </h5>

                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-blue-900 mb-1 text-sm">
                                Enhance Content Quality
                              </h6>
                              <p className="text-xs text-blue-700 mb-2">
                                Improve clarity, completeness, and regulatory compliance
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => enhanceContentQuality()}
                              className="bg-blue-600 hover:bg-blue-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-enhance-content"
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              Enhance
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-purple-900 mb-1 text-sm">
                                Generate Missing Sections
                              </h6>
                              <p className="text-xs text-purple-700 mb-2">
                                Auto-generate missing regulatory sections
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => generateMissingSections()}
                              className="bg-purple-600 hover:bg-purple-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-generate-sections"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Generate
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-green-900 mb-1 text-sm">
                                Compliance Check
                              </h6>
                              <p className="text-xs text-green-700 mb-2">
                                Analyze against FDA, ICH, and EMA requirements
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => performComplianceCheck()}
                              className="bg-green-600 hover:bg-green-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-compliance-check"
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              Check
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-orange-900 mb-1 text-sm">
                                Citation & References
                              </h6>
                              <p className="text-xs text-orange-700 mb-2">
                                Add regulatory citations and references
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => addCitationsAndReferences()}
                              className="bg-orange-600 hover:bg-orange-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-add-citations"
                            >
                              <BookOpen className="w-3 h-3 mr-1" />
                              Citations
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-indigo-900 mb-1 text-sm">
                                Professional Formatting
                              </h6>
                              <p className="text-xs text-indigo-700 mb-2">
                                Apply regulatory submission formatting
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => applyProfessionalFormatting()}
                              className="bg-indigo-600 hover:bg-indigo-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-format-document"
                            >
                              <FileType className="w-3 h-3 mr-1" />
                              Format
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h6 className="font-medium text-teal-900 mb-1 text-sm">
                                Smart Templates
                              </h6>
                              <p className="text-xs text-teal-700 mb-2">
                                Insert regulatory templates and boilerplate
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => insertSmartTemplates()}
                              className="bg-teal-600 hover:bg-teal-700 text-xs px-2 py-1 h-7 flex-shrink-0"
                              data-testid="button-smart-templates"
                            >
                              <FileSearch className="w-3 h-3 mr-1" />
                              Templates
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {suggestionsEnabled &&
                  regulatorySuggestions.map(suggestion => (
                    <div key={suggestion.id} className="border rounded-lg p-3 bg-white shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              suggestion.severity === 'high'
                                ? 'bg-red-500'
                                : suggestion.severity === 'medium'
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500'
                            }`}
                          />
                          <Badge variant="outline" className="text-xs">
                            {suggestion.guideline}
                          </Badge>
                          <Badge
                            variant={
                              suggestion.severity === 'high'
                                ? 'destructive'
                                : suggestion.severity === 'medium'
                                  ? 'secondary'
                                  : 'default'
                            }
                            className="text-xs"
                          >
                            {suggestion.severity}
                          </Badge>
                        </div>
                      </div>

                      {suggestion.text && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500 mb-1">Found:</p>
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                            "{suggestion.text}"
                          </code>
                        </div>
                      )}

                      <div className="mb-3">
                        <p className="text-sm text-gray-700">{suggestion.suggestion}</p>
                      </div>

                      {/* Enhanced Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {suggestion.type === 'terminology' && suggestion.replacement && (
                          <Button
                            size="sm"
                            onClick={() => applySuggestionWithAI(suggestion.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
                            data-testid={`button-auto-apply-${suggestion.id}`}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Auto-Apply
                          </Button>
                        )}
                        {suggestion.type !== 'terminology' && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => applySuggestionWithAI(suggestion.id)}
                              className="text-xs"
                              data-testid={`button-apply-${suggestion.id}`}
                            >
                              <Zap className="w-3 h-3 mr-1" />
                              Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => previewSuggestion(suggestion.id)}
                              className="text-xs"
                              data-testid={`button-preview-${suggestion.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Preview
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => editSuggestion(suggestion.id)}
                          className="text-xs"
                          data-testid={`button-edit-${suggestion.id}`}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Customize
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rejectSuggestion(suggestion.id)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                          data-testid={`button-dismiss-${suggestion.id}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Dismiss
                        </Button>
                      </div>

                      {/* AI Implementation Preview */}
                      {suggestion.showPreview && (
                        <div className="mt-3 p-3 bg-gray-50 border rounded-lg">
                          <h6 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                            <Eye className="w-3 h-3" />
                            AI Implementation Preview
                          </h6>
                          <div className="text-sm text-gray-700 bg-white p-2 rounded border font-mono max-h-32 overflow-y-auto">
                            {suggestion.previewContent || 'Generating AI preview...'}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => acceptPreview(suggestion.id)}
                              className="text-xs"
                            >
                              Accept & Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => hidePreview(suggestion.id)}
                              className="text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                {suggestionsEnabled && regulatorySuggestions.length > 0 && (
                  <div className="pt-4 border-t space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyAllSuggestions()}
                        className="text-xs"
                        data-testid="button-apply-all"
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Apply All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRegulatorySuggestions([])}
                        className="text-xs text-gray-500"
                        data-testid="button-dismiss-all"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Dismiss All
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="guidance" className="p-4 space-y-4 h-full">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    ICH Guidelines
                  </h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    <p>• Include complete chemical nomenclature</p>
                    <p>• Provide structural formula with stereochemistry</p>
                    <p>• Describe general properties and appearance</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    Common Deficiencies
                  </h4>
                  <div className="space-y-2">
                    {complianceAnalysis.gaps.map((gap, index) => (
                      <div
                        key={index}
                        className="p-2 bg-orange-50 border border-orange-200 rounded text-sm"
                      >
                        <div className="font-medium text-orange-800">{gap.issue}</div>
                        <div className="text-orange-600 text-xs">Section: {gap.section}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {showContextHints && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      Smart Context Hints
                    </h4>
                    <div className="space-y-2">
                      {contextHints.map((hint, index) => (
                        <div
                          key={index}
                          className="p-2 bg-blue-50 border border-blue-200 rounded text-sm"
                        >
                          <div className="font-medium text-blue-800">{hint.title}</div>
                          <div className="text-blue-600 text-xs">{hint.content}</div>
                          <Badge
                            variant={hint.priority === 'high' ? 'destructive' : 'secondary'}
                            className="text-xs mt-1"
                          >
                            {hint.priority}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="data" className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Compliance Metrics</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>FDA Compliance</span>
                        <span>{complianceAnalysis.fdaCompliance}%</span>
                      </div>
                      <Progress value={complianceAnalysis.fdaCompliance} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>ICH Compliance</span>
                        <span>{complianceAnalysis.ichCompliance}%</span>
                      </div>
                      <Progress value={complianceAnalysis.ichCompliance} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>EMA Compliance</span>
                        <span>{complianceAnalysis.emaCompliance}%</span>
                      </div>
                      <Progress value={complianceAnalysis.emaCompliance} className="h-2" />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="citations" className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Document References</h4>
                  <div className="space-y-2 text-sm">
                    <div className="p-2 border rounded">
                      <div className="font-medium">ICH Q6A Guidelines</div>
                      <div className="text-gray-600 text-xs">Regulatory Guideline</div>
                    </div>
                    <div className="p-2 border rounded">
                      <div className="font-medium">StabilityReport_2025Q1</div>
                      <div className="text-gray-600 text-xs">LIMS System Report</div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="p-4 space-y-4">
                {showVersionHistory && (
                  <div>
                    <h4 className="font-semibold mb-2">Version History</h4>
                    <div className="space-y-2">
                      {versions.slice(0, 5).map(version => (
                        <div key={version.id} className="p-2 border rounded text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium">
                              {version.isCurrent ? 'Current' : `v${version.id}`}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {version.author}
                            </Badge>
                          </div>
                          <div className="text-gray-600 text-xs mb-1">
                            {version.timestamp.toLocaleDateString()}{' '}
                            {version.timestamp.toLocaleTimeString()}
                          </div>
                          <div className="text-gray-700">{version.changes}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  };

  const renderManufacturingExcellence = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Manufacturing Excellence</h2>
          <p className="text-gray-600">Production monitoring and GMP compliance tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GMP Compliance</CardTitle>
            <CardDescription>Current compliance status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">98.7%</div>
              <Progress value={98.7} className="h-3" />
              <p className="text-sm text-gray-500 mt-2">Excellent compliance</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Equipment Status</CardTitle>
            <CardDescription>Active equipment monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Operational</span>
                <Badge variant="default">12 Units</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Maintenance</span>
                <Badge variant="secondary">2 Units</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Qualification</span>
                <Badge variant="outline">1 Unit</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Production Metrics</CardTitle>
            <CardDescription>Current batch performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Yield</span>
                <span className="font-medium text-green-600">96.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Quality Rate</span>
                <span className="font-medium text-green-600">99.1%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">OEE</span>
                <span className="font-medium text-blue-600">87.3%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderSupplyChainManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Supply Chain Management</h2>
          <p className="text-gray-600">Supplier qualification and material management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Qualified Suppliers</CardTitle>
            <CardDescription>Active supplier network</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">47</div>
              <p className="text-sm text-gray-500">Qualified suppliers worldwide</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>API Suppliers</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Excipient Suppliers</span>
                  <span className="font-medium">18</span>
                </div>
                <div className="flex justify-between">
                  <span>Packaging Suppliers</span>
                  <span className="font-medium">17</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory Status</CardTitle>
            <CardDescription>Current stock levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Raw Materials</span>
                <div className="flex items-center space-x-2">
                  <Progress value={75} className="w-20 h-2" />
                  <span className="text-sm font-medium">75%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Packaging Materials</span>
                <div className="flex items-center space-x-2">
                  <Progress value={60} className="w-20 h-2" />
                  <span className="text-sm font-medium">60%</span>
                </div>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mr-2" />
                  <span className="text-sm font-medium text-yellow-800">3 items low stock</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderIntelligenceHub = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">AI Intelligence Hub</h2>
          <p className="text-gray-600">
            Advanced analytics and intelligent insights for regulatory success
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Models
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Analysis
          </Button>
        </div>
      </div>

      {/* Advanced AI Analytics Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Predictive Analytics Card */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-100">
          <CardHeader>
            <CardTitle className="flex items-center text-blue-800">
              <BarChart3 className="h-5 w-5 mr-2" />
              Predictive Analytics
            </CardTitle>
            <CardDescription>AI-powered submission success forecasting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">FDA Approval Probability</span>
                  <Badge variant="default" className="bg-green-600">
                    92%
                  </Badge>
                </div>
                <Progress value={92} className="h-2" />
                <p className="text-xs text-gray-600 mt-1">
                  Based on 847 similar submissions (2019-2024)
                </p>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Timeline Risk</span>
                  <Badge variant="secondary">Low</Badge>
                </div>
                <Progress value={25} className="h-2" />
                <p className="text-xs text-gray-600 mt-1">
                  Current trajectory suggests on-time delivery
                </p>
              </div>
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                <Brain className="h-3 w-3 mr-1" />
                View Detailed Model
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Multi-Agency Intelligence */}
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-100">
          <CardHeader>
            <CardTitle className="flex items-center text-purple-800">
              <Globe className="h-5 w-5 mr-2" />
              Multi-Agency Intelligence
            </CardTitle>
            <CardDescription>Global regulatory harmonization analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">FDA Alignment</span>
                  <Badge variant="default" className="bg-green-600">
                    94%
                  </Badge>
                </div>
                <Progress value={94} className="h-2" />
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">EMA Alignment</span>
                  <Badge variant="secondary">87%</Badge>
                </div>
                <Progress value={87} className="h-2" />
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">PMDA Readiness</span>
                  <Badge variant="outline">78%</Badge>
                </div>
                <Progress value={78} className="h-2" />
              </div>
              <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700">
                <Languages className="h-3 w-3 mr-1" />
                Regional Analysis
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Real-time Risk Assessment */}
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-red-100">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-800">
              <Shield className="h-5 w-5 mr-2" />
              Risk Intelligence
            </CardTitle>
            <CardDescription>Dynamic risk monitoring and mitigation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Critical Risks</span>
                  <Badge variant="destructive">2</Badge>
                </div>
                <p className="text-xs text-gray-600">Method validation, shelf-life claims</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Emerging Risks</span>
                  <Badge variant="secondary">4</Badge>
                </div>
                <p className="text-xs text-gray-600">Supply chain, regulatory changes</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Risk Score</span>
                  <Badge variant="outline">Medium</Badge>
                </div>
                <Progress value={45} className="h-2" />
              </div>
              <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Risk Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive AI Intelligence Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Manufacturing Intelligence */}
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-100">
          <CardHeader>
            <CardTitle className="flex items-center text-green-800 text-sm">
              <Factory className="h-4 w-4 mr-2" />
              Manufacturing AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Process Efficiency</span>
                  <span className="text-xs text-green-600 font-bold">87.3%</span>
                </div>
                <Progress value={87.3} className="h-1 mt-1" />
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Quality Prediction</span>
                  <Badge variant="default" className="text-xs bg-green-600">
                    Stable
                  </Badge>
                </div>
              </div>
              <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-xs">
                <Settings className="h-3 w-3 mr-1" />
                Optimize
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Intelligence */}
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center text-indigo-800 text-sm">
              <FileText className="h-4 w-4 mr-2" />
              Regulatory AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Compliance Score</span>
                  <span className="text-xs text-indigo-600 font-bold">89.7%</span>
                </div>
                <Progress value={89.7} className="h-1 mt-1" />
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">New Guidances</span>
                  <Badge variant="destructive" className="text-xs">
                    3
                  </Badge>
                </div>
              </div>
              <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-xs">
                <BookOpen className="h-3 w-3 mr-1" />
                Review
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quality Intelligence */}
        <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-100">
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-800 text-sm">
              <Award className="h-4 w-4 mr-2" />
              Quality AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Method Validation</span>
                  <span className="text-xs text-yellow-600 font-bold">85%</span>
                </div>
                <Progress value={85} className="h-1 mt-1" />
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Stability Trend</span>
                  <Badge variant="secondary" className="text-xs">
                    Improving
                  </Badge>
                </div>
              </div>
              <Button size="sm" className="w-full bg-yellow-600 hover:bg-yellow-700 text-xs">
                <TrendingUp className="h-3 w-3 mr-1" />
                Analyze
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sustainability Intelligence */}
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100">
          <CardHeader>
            <CardTitle className="flex items-center text-emerald-800 text-sm">
              <Leaf className="h-4 w-4 mr-2" />
              Sustainability AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Green Score</span>
                  <Badge variant="default" className="text-xs bg-emerald-600">
                    B+
                  </Badge>
                </div>
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Energy Efficiency</span>
                  <span className="text-xs text-emerald-600 font-bold">82.4%</span>
                </div>
                <Progress value={82.4} className="h-1 mt-1" />
              </div>
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-xs">
                <Recycle className="h-3 w-3 mr-1" />
                Improve
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Brain className="w-5 w-5 mr-2" />
              Regulatory Advisor
            </CardTitle>
            <CardDescription>Ask questions about CMC requirements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="Ask about analytical method validation, process validation, or regulatory requirements..."
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                rows={3}
              />
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={!aiQuery.trim()}
              >
                <Zap className="w-4 h-4 mr-2" />
                Get AI Guidance
              </Button>
              {aiResponse && (
                <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm">{aiResponse}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Predictive Analytics
            </CardTitle>
            <CardDescription>Approval likelihood and risk predictions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Approval Likelihood</span>
                  <span className="text-sm font-bold text-green-600">92%</span>
                </div>
                <Progress value={92} className="h-3" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Quality Risk Score</span>
                  <span className="text-sm font-bold text-yellow-600">Medium</span>
                </div>
                <Progress value={35} className="h-3" />
              </div>
              <div className="pt-2 border-t">
                <h4 className="font-medium text-sm mb-2">Key Risk Factors</h4>
                <ul className="text-xs space-y-1 text-gray-600">
                  <li>• Stability data trending requires monitoring</li>
                  <li>• Process validation in progress</li>
                  <li>• Supplier audit pending completion</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderRiskManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Risk Management</h2>
          <p className="text-gray-600">Comprehensive risk assessment and mitigation</p>
        </div>
        <Button
          onClick={() => openModal('risk-assessment')}
          className="bg-red-600 hover:bg-red-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Risk Assessment
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {riskAssessments.map(risk => (
          <Card key={risk.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{risk.title}</CardTitle>
                  <CardDescription>{risk.category} Risk Assessment</CardDescription>
                </div>
                <Badge
                  variant={
                    risk.riskLevel === 'High'
                      ? 'destructive'
                      : risk.riskLevel === 'Medium'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {risk.riskLevel} Risk
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Risk Scoring</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Probability:</span> {risk.probability}/5
                    </p>
                    <p>
                      <span className="font-medium">Severity:</span> {risk.severity}/5
                    </p>
                    <p>
                      <span className="font-medium">Score:</span> {risk.riskScore}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Management</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Status:</span> {risk.status}
                    </p>
                    <p>
                      <span className="font-medium">Owner:</span> {risk.owner}
                    </p>
                    <p>
                      <span className="font-medium">Due:</span> {risk.dueDate}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Mitigation Progress</h4>
                  <Progress value={65} className="h-2 mb-2" />
                  <p className="text-xs text-gray-500">65% complete</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Actions</h4>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3 h-3 mr-1" />
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderAuditAndDocumentation = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Audit & Documentation</h2>
          <p className="text-gray-600">Comprehensive audit trail and document management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Database className="w-8 h-8 mx-auto text-blue-600 mb-2" />
            <div className="text-2xl font-bold">2,847</div>
            <p className="text-sm text-gray-600">Audit Entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="w-8 h-8 mx-auto text-green-600 mb-2" />
            <div className="text-2xl font-bold">1,247</div>
            <p className="text-sm text-gray-600">Documents Managed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <FileCheck className="w-8 h-8 mx-auto text-purple-600 mb-2" />
            <div className="text-2xl font-bold">127</div>
            <p className="text-sm text-gray-600">Reports Generated</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Activity</CardTitle>
          <CardDescription>System-wide audit trail and change tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auditData.map(audit => (
              <div key={audit.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium">{audit.action}</h4>
                    <p className="text-sm text-gray-600">{audit.details}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>User: {audit.user}</span>
                      <span>Entity: {audit.entity}</span>
                      <span>Time: {audit.timestamp}</span>
                    </div>
                  </div>
                  <Badge variant={audit.impact === 'Critical' ? 'destructive' : 'secondary'}>
                    {audit.impact}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // AI Context Management Functions
  const updateAiContext = (stepType, formData) => {
    const newContext = { ...aiContext };

    // Update completed steps
    if (!newContext.completedSteps.includes(stepType)) {
      newContext.completedSteps.push(stepType);
    }

    // Update current form data
    newContext.currentFormData[stepType] = formData;

    // Generate contextual suggestions based on completed steps
    const suggestions = generateContextualSuggestions(
      newContext.completedSteps,
      formData,
      stepType
    );
    newContext.suggestedNextSteps = suggestions;

    setAiContext(newContext);
    setAiSuggestions(suggestions);

    // Show AI Assistant with new suggestions
    setShowAiAssistant(true);

    // Generate contextual AI response
    generateContextualResponse(stepType, formData);
  };

  const generateContextualSuggestions = (completedSteps, latestFormData, stepType) => {
    const suggestions = [];

    switch (stepType) {
      case 'analytical-methods':
        if (latestFormData.technique === 'HPLC-UV') {
          suggestions.push({
            title: 'HPLC Method Validation Protocol',
            description: `For your ${latestFormData.analyte} analysis using HPLC-UV, develop validation protocol covering specificity, linearity, accuracy, precision, and robustness per ICH Q2(R1).`,
            action: `Generate HPLC validation protocol for ${latestFormData.analyte}`,
            priority: 'high',
          });
        }
        if (latestFormData.matrix === 'Drug Product') {
          suggestions.push({
            title: 'Dissolution Method Development',
            description: `Since you're analyzing drug product, consider developing dissolution methods. USP Apparatus II is commonly used for immediate release tablets.`,
            action: 'Guide dissolution method development',
            priority: 'medium',
          });
        }
        break;

      case 'process-validation':
        suggestions.push({
          title: 'Stability Study Design',
          description: `With process validation complete, design stability studies for your validated process. Consider ICH Q1A conditions and bracketing approaches.`,
          action: 'Design stability studies for validated process',
          priority: 'high',
        });
        break;

      case 'stability-studies':
        if (completedSteps.includes('analytical-methods')) {
          suggestions.push({
            title: 'Quality Control Testing Strategy',
            description: `Link your validated analytical methods to QC release testing. Establish batch release criteria based on stability data.`,
            action: 'Establish QC testing strategy',
            priority: 'medium',
          });
        }
        break;
    }

    return suggestions;
  };

  const generateContextualResponse = (stepType, formData) => {
    let contextualResponse = '';

    switch (stepType) {
      case 'analytical-methods':
        contextualResponse =
          `Based on your analytical method entry:\n\n` +
          `• Technique: ${formData.technique}\n` +
          `• Analyte: ${formData.analyte}\n` +
          `• Matrix: ${formData.matrix}\n\n` +
          `Next recommended actions:\n` +
          `1. Develop validation protocol per ICH Q2(R1)\n` +
          `2. Plan precision/accuracy studies\n` +
          `3. Consider method robustness testing\n\n` +
          `Would you like specific guidance on validation parameters for ${formData.technique} analysis?`;
        break;

      case 'process-validation':
        contextualResponse =
          `Process validation entry completed:\n\n` +
          `• Process: ${formData.processName}\n` +
          `• Stage: ${formData.stage}\n` +
          `• Equipment: ${formData.equipment}\n\n` +
          `Recommended next steps:\n` +
          `1. Design stability studies for validated batches\n` +
          `2. Establish continued process verification\n` +
          `3. Plan scale-up considerations\n\n` +
          `Ready to help with stability study design or process monitoring strategies.`;
        break;

      case 'stability-studies':
        contextualResponse =
          `Stability study planned:\n\n` +
          `• Product: ${formData.productName}\n` +
          `• Condition: ${formData.condition}\n` +
          `• Duration: ${formData.duration}\n\n` +
          `Consider these aspects:\n` +
          `1. Sampling timepoints alignment with ICH guidelines\n` +
          `2. Analytical method suitability for degradation products\n` +
          `3. Statistical analysis for shelf-life determination\n\n` +
          `Need help with specific stability protocol details?`;
        break;

      default:
        contextualResponse = `Form completed successfully! Based on your entries, I can provide specific regulatory guidance and next steps. What would you like to know more about?`;
    }

    setAiResponse(contextualResponse);
  };

  // Enhanced fallback response generator
  const generateContextualFallback = (query, context) => {
    const lowerQuery = query.toLowerCase();

    // Analytical methods guidance
    if (
      lowerQuery.includes('analytical') ||
      lowerQuery.includes('hplc') ||
      lowerQuery.includes('validation') ||
      lowerQuery.includes('method')
    ) {
      return `For analytical method development in ${context.projectContext.includes('FDA') ? 'FDA' : 'EMA'} submissions:

• Method Validation: Follow ICH Q2(R1) guidelines for specificity, linearity, accuracy, precision, detection limits, and robustness
• HPLC Methods: Ensure gradient stability, column specifications, and system suitability parameters
• Dissolution Testing: USP Apparatus II typically preferred for tablets with appropriate media selection
• Impurity Testing: Related substances method with 0.1% reporting threshold for new drug substances
• Stability-Indicating: Validate degradation conditions (acid, base, oxidation, thermal, photolytic)

${context.projectContext.includes('Tablets') ? 'For immediate release tablets, focus on dissolution profile consistency across manufacturing batches.' : 'Consider dosage form-specific analytical requirements.'}`;
    }

    // Process validation guidance
    if (
      lowerQuery.includes('process') ||
      lowerQuery.includes('manufacturing') ||
      lowerQuery.includes('batch') ||
      lowerQuery.includes('ppq')
    ) {
      return `Process Validation guidance for pharmaceutical manufacturing:

• Stage 1 (Design): Process design based on knowledge and risk assessment
• Stage 2 (Qualification): PPQ studies with 3 consecutive successful batches
• Stage 3 (Monitoring): Ongoing verification with statistical process control
• Critical Process Parameters: Temperature, mixing time, compression force, coating parameters
• Process Capability: Cpk ≥ 1.33 for critical quality attributes

${context.projectContext.includes('Phase III') ? 'For Phase III commercial preparation, establish process capability studies and technology transfer protocols.' : 'Align validation scope with development stage requirements.'}`;
    }

    // Stability studies guidance
    if (
      lowerQuery.includes('stability') ||
      lowerQuery.includes('shelf life') ||
      lowerQuery.includes('storage') ||
      lowerQuery.includes('degradation')
    ) {
      return `Stability Studies for drug product registration:

• ICH Q1A(R2): Long-term (25°C/60%RH), intermediate (30°C/65%RH), accelerated (40°C/75%RH)
• Photostability: ICH Q1B with UV and visible light exposure
• Study Duration: Minimum 12 months long-term data at filing
• Container Closure: Test in proposed commercial packaging
• Analytical Methods: Stability-indicating with validated methods

${context.projectContext.includes('Tablets') ? 'Solid dosage forms typically demonstrate 24-36 month shelf life with appropriate packaging.' : 'Consider dosage form-specific storage requirements and testing intervals.'}`;
    }

    // Quality control guidance
    if (
      lowerQuery.includes('quality control') ||
      lowerQuery.includes('qc') ||
      lowerQuery.includes('testing') ||
      lowerQuery.includes('specification')
    ) {
      return `Quality Control Testing Strategy:

• Drug Substance Specifications: Identity, assay (95.0-105.0%), related substances, residual solvents, heavy metals
• Drug Product Specifications: Appearance, identity, assay, dissolution, uniformity, microbial limits
• Raw Materials: Certificate of analysis review with periodic identity testing
• Container Closure: Extractables/leachables studies for new packaging systems
• Microbiological: USP <61> and <62> for non-sterile products, <71> for sterile products

Release vs. shelf-life specifications should account for stability degradation patterns.`;
    }

    // Regulatory submission guidance
    if (
      lowerQuery.includes('submission') ||
      lowerQuery.includes('filing') ||
      lowerQuery.includes('dossier') ||
      lowerQuery.includes('ctd')
    ) {
      return `CMC Regulatory Submission Requirements:

• Module 3.2.S (Drug Substance): Manufacture, characterization, control of materials, controls of drug substance, reference standards
• Module 3.2.P (Drug Product): Description, pharmaceutical development, manufacture, control of excipients, controls of drug product
• Module 3.2.A (Appendices): Facilities and equipment, adventitious agents safety, excipients, novel excipients

${context.projectContext.includes('FDA') ? 'FDA submissions require eCTD format with comprehensive pharmaceutical development data (QbD approach recommended).' : 'EMA submissions emphasize Quality by Design principles and lifecycle maintenance.'}`;
    }

    // Default comprehensive guidance
    return `I'm currently experiencing API connectivity issues, but I can provide guidance on these CMC topics:

**Analytical Development**: Method validation per ICH Q2(R1), HPLC optimization, stability-indicating methods
**Process Development**: Scale-up considerations, process validation stages, critical parameter identification  
**Quality Control**: Specification setting, testing strategies, release vs. shelf-life criteria
**Regulatory Strategy**: CTD Module 3 preparation, agency-specific requirements, submission readiness

Based on your project context: ${context.projectContext}

What specific aspect would you like to explore further? I can provide detailed guidance on any CMC area.`;
  };

  // AI Assistant Functions
  const handleAskAI = async query => {
    if (!query || !query.trim()) return;

    setAiLoading(true);
    try {
      const contextualQuery = `${query}\n\nProject Context: ${aiContext.projectContext}\nCompleted Steps: ${aiContext.completedSteps.join(', ')}\nCurrent Form Data: ${JSON.stringify(aiContext.currentFormData)}`;

      const response = await fetch('/api/ai/regulatory-guidance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: contextualQuery,
          context: aiContext,
          contextData: aiContext.currentFormData,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.response || 'No response received from AI';
      setAiResponse(responseText);
      setAiQuery(''); // Clear the input after successful response
    } catch (error) {
      console.error('AI query error:', error);
      // Provide intelligent fallback based on query content
      const fallbackResponse = generateContextualFallback(query, aiContext);
      setAiResponse(fallbackResponse);
    } finally {
      setAiLoading(false);
    }
  };

  const getSuggestedQuestions = () => {
    const tabQuestions = {
      dashboard: [
        'What are the critical CMC activities for FDA submission?',
        'How do I prioritize analytical method validation?',
        'What quality metrics should I track?',
      ],
      analytical: [
        'What validation parameters are required for HPLC methods?',
        'How do I establish method robustness?',
        'What are ICH Q2(R1) requirements?',
      ],
      process: [
        'What is required for process validation stages?',
        'How do I establish critical process parameters?',
        'What documentation is needed for PV studies?',
      ],
      stability: [
        'What stability conditions are required for FDA?',
        'How do I design stability protocols?',
        'What are shelf-life determination requirements?',
      ],
      quality: [
        'What QC testing is required for tablets?',
        'How do I establish specifications?',
        'What are batch release requirements?',
      ],
      regulatory: [
        'What CMC sections are required in CTD Module 3?',
        'How do I prepare for regulatory meetings?',
        'What are post-approval change requirements?',
      ],
    };

    return tabQuestions[activeTab] || tabQuestions.dashboard;
  };

  const renderAIAssistantPanel = () => (
    <div
      className={`fixed top-0 right-0 h-screen bg-white shadow-2xl border-l transition-transform duration-300 ease-in-out ${showAiAssistant ? 'translate-x-0' : 'translate-x-full'}`}
      style={{ width: '480px', zIndex: 9999 }}
    >
      <div className="flex flex-col h-full">
        <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">CMC Regulatory Advisor</h3>
                <p className="text-sm text-blue-100">
                  Expert Regulatory Intelligence & Strategic Guidance
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowAiAssistant(false)}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 p-2"
              data-testid="button-close-ai-assistant"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <div className="text-sm">
            <div className="font-medium text-gray-900 mb-1">Project Context</div>
            <div className="text-gray-700 text-sm">{aiContext.projectContext}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {aiSuggestions.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Smart Suggestions
              </h4>
              <div className="space-y-3">
                {aiSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h5 className="font-medium text-gray-900 text-sm">{suggestion.title}</h5>
                      <Badge
                        variant={
                          suggestion.priority === 'high'
                            ? 'destructive'
                            : suggestion.priority === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {suggestion.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{suggestion.description}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setAiQuery(suggestion.action);
                        handleAskAI(suggestion.action);
                      }}
                      data-testid={`button-suggestion-${index}`}
                    >
                      {suggestion.action}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Suggested Questions</h4>
            <div className="space-y-2">
              {getSuggestedQuestions().map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full text-left justify-start h-auto p-3 text-sm hover:bg-blue-50"
                  onClick={() => {
                    setAiQuery(question);
                    handleAskAI(question);
                  }}
                  data-testid={`button-suggested-question-${index}`}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Response
              {!aiResponse && <span className="text-xs text-red-500 ml-2">(No response)</span>}
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 border min-h-[100px]">
              <div className="text-lg text-gray-800 leading-relaxed whitespace-pre-wrap">
                {aiResponse || 'Ask me anything about CMC regulatory requirements...'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <Input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              placeholder="Ask about CMC regulatory requirements..."
              className="flex-1"
              onKeyPress={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAskAI(aiQuery);
                }
              }}
              data-testid="input-ai-query"
            />
            <Button
              onClick={() => handleAskAI(aiQuery)}
              disabled={aiLoading || !aiQuery.trim()}
              size="sm"
              data-testid="button-ask-ai"
            >
              {aiLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Ask'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CMC Management Platform</h1>
            <p className="text-gray-600 mt-2">
              Chemistry, Manufacturing & Controls - Pharmaceutical Development
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowAiAssistant(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
              data-testid="button-toggle-ai-assistant"
            >
              <div className="p-1.5 bg-white/20 rounded">
                <Brain className="w-4 h-4" />
              </div>
              <span>Regulatory Advisor</span>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="grid grid-cols-1 gap-4 mb-4">
            <TabsList className="grid w-full grid-cols-12" data-testid="cmc-comprehensive-tabs">
              <TabsTrigger value="dashboard" data-testid="tab-dashboard">
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="analytical" data-testid="tab-analytical">
                Analytical
              </TabsTrigger>
              <TabsTrigger value="process" data-testid="tab-process">
                Process
              </TabsTrigger>
              <TabsTrigger value="stability" data-testid="tab-stability">
                Stability
              </TabsTrigger>
              <TabsTrigger value="quality" data-testid="tab-quality">
                Quality
              </TabsTrigger>
              <TabsTrigger value="regulatory" data-testid="tab-regulatory">
                Regulatory
              </TabsTrigger>
              <TabsTrigger value="document-authoring" data-testid="tab-document-authoring">
                Document Authoring
              </TabsTrigger>
              <TabsTrigger value="manufacturing" data-testid="tab-manufacturing">
                Manufacturing
              </TabsTrigger>
              <TabsTrigger value="supply-chain" data-testid="tab-supply-chain">
                Supply Chain
              </TabsTrigger>
              <TabsTrigger value="intelligence" data-testid="tab-intelligence">
                AI Intelligence
              </TabsTrigger>
              <TabsTrigger value="risk-management" data-testid="tab-risk">
                Risk Management
              </TabsTrigger>
              <TabsTrigger value="audit-docs" data-testid="tab-audit">
                Audit & Docs
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard">{renderDashboard()}</TabsContent>
          <TabsContent value="analytical">{renderAnalyticalMethods()}</TabsContent>
          <TabsContent value="process">
            <ProcessTab />
          </TabsContent>
          <TabsContent value="stability">{renderStabilityStudies()}</TabsContent>
          <TabsContent value="quality">{renderQualityControl()}</TabsContent>
          <TabsContent value="regulatory">{renderRegulatoryManagement()}</TabsContent>
          <TabsContent value="document-authoring">{renderDocumentAuthoring()}</TabsContent>
          <TabsContent value="manufacturing">{renderManufacturingExcellence()}</TabsContent>
          <TabsContent value="supply-chain">{renderSupplyChainManagement()}</TabsContent>
          <TabsContent value="intelligence">{renderIntelligenceHub()}</TabsContent>
          <TabsContent value="risk-management">{renderRiskManagement()}</TabsContent>
          <TabsContent value="audit-docs">{renderAuditAndDocumentation()}</TabsContent>
        </Tabs>

        {/* Dynamic Modal for all CMC operations */}
        <CMCModal
          isOpen={showModal}
          onClose={closeModal}
          type={modalType}
          item={selectedItem}
          onSubmit={handleSubmit}
        />
      </div>

      {/* AI Assistant Panel */}
      {renderAIAssistantPanel()}
    </div>
  );
};

// Modal Component for CMC Forms
const CMCModal = ({ isOpen, onClose, type, item, onSubmit }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      setFormData({});
    }
  }, [item, type]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = e => {
    e.preventDefault();

    // Validate required fields for analytical methods
    if (type === 'analytical-methods') {
      const requiredFields = ['title', 'technique', 'analyte', 'matrix'];
      const missingFields = requiredFields.filter(
        field => !formData[field] || formData[field].trim() === ''
      );

      if (missingFields.length > 0) {
        alert(`Please fill in the following required fields: ${missingFields.join(', ')}`);
        return;
      }

      // Validate scientific formats
      if (formData.precisionTarget && !isValidRSDFormat(formData.precisionTarget)) {
        alert('Precision Target must be in format "≤X.X% RSD" (e.g., "≤2.0% RSD")');
        return;
      }

      if (formData.accuracyTarget && !isValidAccuracyFormat(formData.accuracyTarget)) {
        alert('Accuracy Target must be in format "XX-XX%" (e.g., "98-102%")');
        return;
      }

      if (formData.detectionLimit && !isValidConcentrationFormat(formData.detectionLimit)) {
        alert('Detection Limit must include units (e.g., "0.05 μg/mL")');
        return;
      }

      if (formData.quantitationLimit && !isValidConcentrationFormat(formData.quantitationLimit)) {
        alert('Quantitation Limit must include units (e.g., "0.15 μg/mL")');
        return;
      }
    }

    onSubmit(formData);
  };

  // Validation helper functions
  const isValidRSDFormat = value => {
    const rsdPattern = /^≤?\d+(\.\d+)?%?\s?(RSD|rsd)?$/i;
    return rsdPattern.test(value.trim());
  };

  const isValidAccuracyFormat = value => {
    const accuracyPattern = /^\d+(\.\d+)?-\d+(\.\d+)?%?$/;
    return accuracyPattern.test(value.trim());
  };

  const isValidConcentrationFormat = value => {
    const concentrationPattern = /^\d+(\.\d+)?\s*(μg\/mL|mg\/mL|ng\/mL|ppm|ppb|%|w\/w|g\/L)$/i;
    return concentrationPattern.test(value.trim());
  };

  const renderFormContent = () => {
    switch (type) {
      case 'analytical-methods':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Method Code</Label>
                <Input
                  value={formData.code || ''}
                  onChange={e => handleInputChange('code', e.target.value)}
                  placeholder="AM-001"
                />
              </div>
              <div>
                <Label>Technique</Label>
                <Select
                  value={formData.technique || ''}
                  onValueChange={value => handleInputChange('technique', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select technique" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HPLC-UV">HPLC-UV</SelectItem>
                    <SelectItem value="UPLC-MS/MS">UPLC-MS/MS</SelectItem>
                    <SelectItem value="GC-FID">GC-FID</SelectItem>
                    <SelectItem value="ICP-MS">ICP-MS</SelectItem>
                    <SelectItem value="UV-VIS">UV-VIS</SelectItem>
                    <SelectItem value="HPLC">HPLC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Method Title</Label>
              <Input
                value={formData.title || ''}
                onChange={e => handleInputChange('title', e.target.value)}
                placeholder="HPLC-UV API Assay"
                required
              />
            </div>
            <div>
              <Label>Method Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={e => handleInputChange('description', e.target.value)}
                placeholder="Detailed description of the analytical method..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Analyte</Label>
                <Select
                  value={formData.analyte || ''}
                  onValueChange={value => handleInputChange('analyte', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select analyte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active Pharmaceutical Ingredient">
                      Active Pharmaceutical Ingredient
                    </SelectItem>
                    <SelectItem value="Related Substances">Related Substances</SelectItem>
                    <SelectItem value="Volatile Organic Compounds">
                      Volatile Organic Compounds
                    </SelectItem>
                    <SelectItem value="Elemental Impurities">Elemental Impurities</SelectItem>
                    <SelectItem value="Residual Solvents">Residual Solvents</SelectItem>
                    <SelectItem value="Dissolution">Dissolution</SelectItem>
                    <SelectItem value="Content Uniformity">Content Uniformity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Matrix</Label>
                <Select
                  value={formData.matrix || ''}
                  onValueChange={value => handleInputChange('matrix', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select matrix" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Drug Product">Drug Product</SelectItem>
                    <SelectItem value="Drug Substance">Drug Substance</SelectItem>
                    <SelectItem value="Raw Material">Raw Material</SelectItem>
                    <SelectItem value="Excipient">Excipient</SelectItem>
                    <SelectItem value="Finished Product">Finished Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Range</Label>
                <Input
                  value={formData.range || ''}
                  onChange={e => handleInputChange('range', e.target.value)}
                  placeholder="0.05-150 μg/mL"
                />
              </div>
              <div>
                <Label>Owner</Label>
                <Input
                  value={formData.owner || ''}
                  onChange={e => handleInputChange('owner', e.target.value)}
                  placeholder="Dr. Smith"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Precision Target</Label>
                <Input
                  value={formData.precisionTarget || ''}
                  onChange={e => handleInputChange('precisionTarget', e.target.value)}
                  placeholder="≤2.0% RSD"
                />
              </div>
              <div>
                <Label>Accuracy Target</Label>
                <Input
                  value={formData.accuracyTarget || ''}
                  onChange={e => handleInputChange('accuracyTarget', e.target.value)}
                  placeholder="98-102%"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Detection Limit</Label>
                <Input
                  value={formData.detectionLimit || ''}
                  onChange={e => handleInputChange('detectionLimit', e.target.value)}
                  placeholder="0.05 μg/mL"
                />
              </div>
              <div>
                <Label>Quantitation Limit</Label>
                <Input
                  value={formData.quantitationLimit || ''}
                  onChange={e => handleInputChange('quantitationLimit', e.target.value)}
                  placeholder="0.15 μg/mL"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Robustness Parameters</Label>
                <Input
                  value={formData.robustnessParams || ''}
                  onChange={e => handleInputChange('robustnessParams', e.target.value)}
                  placeholder="pH, temperature, flow rate"
                />
              </div>
              <div>
                <Label>Reference Standard</Label>
                <Input
                  value={formData.referenceStandard || ''}
                  onChange={e => handleInputChange('referenceStandard', e.target.value)}
                  placeholder="USP Reference Standard"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Equipment Requirements</Label>
                <Input
                  value={formData.equipment || ''}
                  onChange={e => handleInputChange('equipment', e.target.value)}
                  placeholder="HPLC with UV detector"
                />
              </div>
              <div>
                <Label>Due Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.dueDate || ''}
                  onChange={e => handleInputChange('dueDate', e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Method Development Notes</Label>
              <Textarea
                value={formData.developmentNotes || ''}
                onChange={e => handleInputChange('developmentNotes', e.target.value)}
                placeholder="Development challenges, optimization parameters, special considerations..."
                rows={3}
              />
            </div>
          </div>
        );
      case 'process-validation':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Process Name</Label>
                <Input
                  value={formData.processName || ''}
                  onChange={e => handleInputChange('processName', e.target.value)}
                  placeholder="Tablet Compression"
                />
              </div>
              <div>
                <Label>Equipment</Label>
                <Input
                  value={formData.equipment || ''}
                  onChange={e => handleInputChange('equipment', e.target.value)}
                  placeholder="Rotary Tablet Press Model X200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stage</Label>
                <Select
                  value={formData.stage || ''}
                  onValueChange={value => handleInputChange('stage', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PV-I">Stage 1 (PV-I)</SelectItem>
                    <SelectItem value="PV-II">Stage 2 (PV-II)</SelectItem>
                    <SelectItem value="PV-III">Stage 3 (PV-III)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status || ''}
                  onValueChange={value => handleInputChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      case 'stability-studies':
        return (
          <div className="space-y-4">
            <div>
              <Label>Product Name</Label>
              <Input
                value={formData.productName || ''}
                onChange={e => handleInputChange('productName', e.target.value)}
                placeholder="Product A 10mg Tablets"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Condition</Label>
                <Select
                  value={formData.condition || ''}
                  onValueChange={value => handleInputChange('condition', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25°C/60% RH">25°C/60% RH (Long-term)</SelectItem>
                    <SelectItem value="40°C/75% RH">40°C/75% RH (Accelerated)</SelectItem>
                    <SelectItem value="30°C/65% RH">30°C/65% RH (Intermediate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select
                  value={formData.duration || ''}
                  onValueChange={value => handleInputChange('duration', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6 months">6 months</SelectItem>
                    <SelectItem value="12 months">12 months</SelectItem>
                    <SelectItem value="24 months">24 months</SelectItem>
                    <SelectItem value="36 months">36 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Test Parameters</Label>
              <Textarea
                value={formData.testParameters || ''}
                onChange={e => handleInputChange('testParameters', e.target.value)}
                placeholder="Assay, Dissolution, Impurities, Appearance"
                rows={3}
              />
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <p>Form content for {type} will be implemented here.</p>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit' : 'Add New'}{' '}
            {type?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </DialogTitle>
          <DialogDescription>
            Fill in the details below to {item ? 'update' : 'create'} the record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {renderFormContent()}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{item ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ComprehensiveCMCPlatform;
