import React, { useState, useEffect } from 'react';
// Safely handle LumenAiAssistant context access with fallbacks
import { useLumenAiAssistant } from '@/contexts/LumenAiAssistantContext';
import { useToast } from '@/components/ui/toaster';
import { queryClient } from '@/lib/queryClient';
import SharePointFileManager from '@/components/sharepoint/SharePointFileManager';
import axios from 'axios';
// CER imports disabled - focusing on 510(k) workflow only
// import CerBuilderPanel from '@/components/cer/CerBuilderPanel';
// import CerPreviewPanel from '@/components/cer/CerPreviewPanel';
// import LiteratureSearchPanel from '@/components/cer/LiteratureSearchPanel';
// import LiteratureMethodologyPanel from '@/components/cer/LiteratureMethodologyPanel';
import ComplianceScorePanel from '@/components/cer/ComplianceScorePanel';
// import CerAssistantPanel from '@/components/cer/CerAssistantPanel';
import DocumentVaultPanel from '@/components/cer/DocumentVaultPanel';
import CerDataRetrievalPanel from '@/components/cer/CerDataRetrievalPanel';
// Using 510k specific components instead of CER ones
import EquivalenceBuilderPanel from '@/components/510k/EquivalenceBuilderPanel';
import ComplianceCheckPanel from '@/components/510k/ComplianceCheckPanel';
import LiteratureVisualizationPanel from '@/components/510k/LiteratureVisualizationPanel';
import ESTARBuilderPanel from '@/components/510k/ESTARBuilderPanel';
import { FDA510kService } from '@/services/FDA510kService';
import fdaPMAService from '@/services/FDAPMAService';
import StateOfArtPanel from '@/components/cer/StateOfArtPanel';
import ClinicalEvaluationPlanPanel from '@/components/cer/ClinicalEvaluationPlanPanel';
import QualityManagementPlanPanel from '@/components/cer/QualityManagementPlanPanel';
import RegulatoryTraceabilityMatrix from '@/components/cer/RegulatoryTraceabilityMatrix';
import GSPRMappingPanel from '@/components/cer/GSPRMappingPanel';
import LiteratureReviewWorkflow from '@/components/cer/LiteratureReviewWorkflow';
import NotificationBanner from '@/components/cer/NotificationBanner';
import InternalClinicalDataPanel from '@/components/cer/InternalClinicalDataPanel';
import ExportModule from '@/components/cer/ExportModule';
import CerComprehensiveReportsPanel from '@/components/cer/CerComprehensiveReportsPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import MAUDIntegrationPanel from '@/components/cer/MAUDIntegrationPanel';
import KAutomationPanel from '@/components/cer/KAutomationPanel';

// 510k components - directly importing only what we need
import PredicateFinderPanel from '@/components/510k/PredicateFinderPanel';
import ReportGenerator from '@/components/510k/ReportGenerator';
import WorkflowPanel from '@/components/510k/WorkflowPanel';
import WorkflowEnabledReportGenerator from '@/components/510k/WorkflowEnabledReportGenerator';
// Enhanced document management with professional vault system
import SimpleDocumentTreePanel from '@/components/510k/SimpleDocumentTreePanel';
import EnhancedDocumentVault from '@/components/510k/EnhancedDocumentVault';
import WelcomeDialog from '@/components/510k/WelcomeDialog';
import Enhanced510kIntakeWorkflow from '@/components/510k/Enhanced510kIntakeWorkflow';
import RTAChecklistPanel from '@/components/510k/RTAChecklistPanel';
import FDATimelineTracker from '@/components/510k/FDATimelineTracker';
import DocumentImportPanel from '@/components/510k/DocumentImportPanel';
import DeviceProfileForm from '@/components/cer/DeviceProfileForm';
import DeviceDataCenter from '@/components/DeviceDataCenter';
import DeviceDataCenterEnhanced from '@/components/DeviceDataCenterEnhanced';
import FDAFormGenerator from '@/components/FDAFormGenerator';
import SmartFormsManager from '@/components/SmartFormsManager';
// DocumentGenerationPanel removed - document generation is now automatic during workflow

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cerApiService } from '@/services/CerAPIService';
import MedicalDeviceDocumentEditor from '@/components/MedicalDeviceDocumentEditor';
import { literatureAPIService } from '@/services/LiteratureAPIService';
import LiteratureFeatureService from '@/services/LiteratureFeatureService';
import { ensureProfileIntegrity, createNewDeviceProfile } from '@/utils/deviceProfileUtils';
import {
  FileText,
  BookOpen,
  CheckSquare,
  Download,
  MessageSquare,
  Clock,
  FileCheck,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ZapIcon,
  BarChart,
  FolderOpen,
  Database,
  GitCompare,
  BookMarked,
  Lightbulb,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  Trophy,
  ShieldCheck,
  Shield,
  Play,
  PlayCircle,
  Archive,
  Activity,
  Cpu,
  HardDrive,
  Network,
  Code,
  XCircle,
  DownloadCloud,
  Search,
  Calendar,
  Info,
  ArrowRight,
  AlertTriangle,
  Files,
  FolderTree,
  X,
  FilePlus,
  FolderPlus,
  PlusCircle,
  Loader2,
  UploadCloud,
  Upload,
  Target,
  Zap,
  ClipboardCheck,
  CalendarDays,
  User,
  ChevronRight,
  ExternalLink,
  Edit3,
  Heart,
  Lock,
  Users,
  Package,
  Send,
  Tag,
  TestTube,
  Beaker,
  Award,
  Droplet,
  Workflow,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

// Create a fallback if context is unavailable
const safeAssistantHook = () => {
  try {
    return useLumenAiAssistant();
  } catch (e) {
    console.warn('LumenAiAssistant context not available, using fallback');
    return {
      openAssistant: () => console.log('Opening Lumen AI Assistant...'),
      setModuleContext: () => {},
      isOpen: false,
      closeAssistant: () => {},
    };
  }
};

export default function CERV2Page({ initialDocumentType, initialActiveTab }) {
  // Use the safe assistant hook instead of direct context access
  const assistantContext = safeAssistantHook();
  const { openAssistant = () => {}, setModuleContext = () => {} } = assistantContext || {};
  const { toast } = useToast();
  
  // Organization and workspace IDs for project management
  const organizationId = '6'; // Default organization ID
  const clientWorkspaceId = '26'; // Default workspace ID
  
  // Set organization ID in localStorage for API interceptor
  useEffect(() => {
    localStorage.setItem('currentOrganizationId', organizationId);
  }, [organizationId]);

  // Multi-Project Management State
  const [allProjects, setAllProjects] = useState([]);
  
  const [currentProjectId, setCurrentProjectId] = useState(() => {
    try {
      const saved = localStorage.getItem('currentMedicalDeviceProjectId');
      return saved || null;
    } catch (error) {
      return null;
    }
  });

  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  
  // Fetch projects from database on mount and when workspace changes
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        console.log('Fetching projects from database...');
        
        // Using organizationId and clientWorkspaceId defined at component level
        console.log('Using org ID:', organizationId, 'workspace ID:', clientWorkspaceId);
        
        // Build query params
        const params = new URLSearchParams();
        params.append('organization_id', organizationId);
        params.append('client_workspace_id', clientWorkspaceId);
        
        const url = `/api/projects?${params.toString()}`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (response.ok) {
          const projects = await response.json();
          console.log('Received projects from API:', projects);
          
          // Transform database projects to match frontend format
          const transformedProjects = projects.map(p => ({
            id: p.id?.toString() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            deviceName: p.name || 'Untitled Device',
            deviceType: p.type || 'medical_device',
            manufacturer: p.metadata?.manufacturer || '',
            deviceClass: p.metadata?.deviceClass || 'II',
            intendedUse: p.metadata?.intendedUse || '',
            status: p.status || 'draft',
            createdAt: p.created_at || new Date().toISOString(),
            updatedAt: p.updated_at || new Date().toISOString(),
            attachedDocuments: p.metadata?.attachedDocuments || [],
            state: p.metadata?.state || {}
          }));
          
          console.log('Transformed projects:', transformedProjects);
          setAllProjects(transformedProjects);
          
          // Also cache in localStorage for offline access
          localStorage.setItem('medicalDeviceProjects', JSON.stringify(transformedProjects));
        } else {
          console.error('Failed to fetch projects, status:', response.status);
          // If API fails, still try loading from localStorage
          const saved = localStorage.getItem('medicalDeviceProjects');
          if (saved) {
            try {
              const projects = JSON.parse(saved);
              console.log('Loaded cached projects from localStorage:', projects);
              setAllProjects(projects.map(p => ({
                ...p,
                attachedDocuments: p.attachedDocuments || []
              })));
            } catch (parseError) {
              console.warn('Error parsing localStorage projects:', parseError);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching projects from database:', error);
        // Fall back to localStorage if API fails
        try {
          const saved = localStorage.getItem('medicalDeviceProjects');
          if (saved) {
            const projects = JSON.parse(saved);
            console.log('Loaded projects from localStorage:', projects);
            setAllProjects(projects.map(p => ({
              ...p,
              attachedDocuments: p.attachedDocuments || []
            })));
          }
        } catch (localError) {
          console.warn('Error loading projects from localStorage:', localError);
        }
      }
    };
    
    // Add a small delay to ensure the component is mounted
    setTimeout(fetchProjects, 100);
  }, []); // Run once on mount

  // State variables
  const [title, setTitle] = useState('FDA 510(k) Submission');
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [showDeviceIntakeForm, setShowDeviceIntakeForm] = useState(false);
  const [newClientMode, setNewClientMode] = useState(false);
  const [deviceIntakeData, setDeviceIntakeData] = useState(null);
  const [deviceType, setDeviceType] = useState('Class II Medical Device');
  
  // Document viewer state for inline document display
  const [documentViewerData, setDocumentViewerData] = useState({
    isOpen: false,
    url: '',
    documentName: '',
    type: 'other'
  });
  const [documentType, setDocumentType] = useState('510k'); // Force 510k mode for now
  const [deviceName, setDeviceName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [faers, setFaers] = useState([]);
  const [showESTARDemo, setShowESTARDemo] = useState(false);
  const [cerDocumentId, setCerDocumentId] = useState(() => {
    const prefix = 'CER-';
    return prefix + Math.floor(100000 + Math.random() * 900000);
  });
  const [k510DocumentId, setK510DocumentId] = useState(() => {
    const prefix = '510K-';
    return prefix + Math.floor(100000 + Math.random() * 900000);
  });
  const [comparators, setComparators] = useState([]);
  const [sections, setSections] = useState([]);
  const [equivalenceData, setEquivalenceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingFaers, setIsFetchingFaers] = useState(false);
  const [isFetchingLiterature, setIsFetchingLiterature] = useState(false);
  // Start users at Device Intake Form - the clear starting point for 510(k)
  const [activeTab, setActiveTab] = useState(initialActiveTab || 'device-intake');

  // Helper function to load saved state from localStorage
  const loadSavedState = (key, defaultValue) => {
    try {
      const savedValue = localStorage.getItem(`510k_${key}`);
      return savedValue ? JSON.parse(savedValue) : defaultValue;
    } catch (error) {
      console.warn(`Error loading saved state for ${key}:`, error);
      return defaultValue;
    }
  };

  // Helper function to save state to localStorage
  const saveState = (key, value) => {
    try {
      localStorage.setItem(`510k_${key}`, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error saving state for ${key}:`, error);
    }
  };

  // Multi-Project Management Functions
  const saveAllProjects = (projects) => {
    try {
      localStorage.setItem('medicalDeviceProjects', JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  };

  const createNewProject = (projectData) => {
    const newProject = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deviceName: projectData.deviceName || 'Untitled Device',
      deviceType: documentType,
      manufacturer: projectData.manufacturer || '',
      deviceClass: projectData.deviceClass || 'II',
      intendedUse: projectData.intendedUse || '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachedDocuments: [], // Initialize empty attachedDocuments array
      // Store complete project state
      state: {
        deviceProfile,
        predicateDevices,
        literatureResults,
        complianceScore,
        workflowStep,
        documentType
      }
    };
    
    const updated = [...allProjects, newProject];
    setAllProjects(updated);
    saveAllProjects(updated);
    setCurrentProjectId(newProject.id);
    localStorage.setItem('currentMedicalDeviceProjectId', newProject.id);
    
    toast({
      title: 'New Project Created',
      description: `Created project for ${newProject.deviceName}`,
    });
    
    return newProject;
  };

  const switchToProject = async (projectId) => {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    // Save current project state before switching
    if (currentProjectId) {
      saveCurrentProjectState();
    }
    
    // Load the selected project's state
    setCurrentProjectId(projectId);
    localStorage.setItem('currentMedicalDeviceProjectId', projectId);
    
    // Fetch FDA 510(k) stage data from database
    try {
      const response = await fetch(`/api/fda-510k/projects/${projectId}/stage`);
      if (response.ok) {
        const stageData = await response.json();
        console.log('Loaded FDA 510(k) stage data:', stageData);
        
        // Set the workflow step based on the database stage
        if (stageData.current_stage) {
          setWorkflowStep(stageData.current_stage);
          
          // Also set the appropriate tab based on stage
          const stageTabMap = {
            1: 'device-intake',  // Stage 1: Initial Device Assessment
            2: 'predicate',      // Stage 2: Predicate Analysis
            3: 'equivalence',    // Stage 3: Performance Testing
            4: 'compliance',     // Stage 4: Clinical Validation
            5: 'estar',          // Stage 5: eSTAR & RTA Prep
            6: 'submission',     // Stage 6: Final QC Review
            7: 'submission'      // Stage 7: FDA Submission
          };
          
          const targetTab = stageTabMap[stageData.current_stage] || 'device-intake';
          setActiveTab(targetTab);
          
          // Update workflow progress
          setWorkflowProgress(stageData.overall_progress || 0);
          
          // If we have eSTAR/RTA status, set those too
          if (stageData.estar_status) {
            setEstarStatus(stageData.estar_status);
          }
          if (stageData.rta_status) {
            setRtaStatus(stageData.rta_status);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching FDA 510(k) stage data:', error);
      // Fall back to saved state
      if (project.state) {
        setWorkflowStep(project.state.workflowStep || 1);
      }
    }
    
    // Restore project state
    if (project.state) {
      setDeviceProfile(project.state.deviceProfile || {});
      setPredicateDevices(project.state.predicateDevices || []);
      setLiteratureResults(project.state.literatureResults || []);
      setComplianceScore(project.state.complianceScore || null);
      setDocumentType(project.state.documentType || '510k');
    }
    
    toast({
      title: 'Switched Project',
      description: `Now working on ${project.deviceName}`,
    });
    
    setShowProjectSelector(false);
  };

  const saveCurrentProjectState = () => {
    if (!currentProjectId) return;
    
    const updatedProjects = allProjects.map(p => {
      if (p.id === currentProjectId) {
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          deviceName: deviceProfile?.deviceName || p.deviceName,
          // Preserve attachedDocuments from existing project
          attachedDocuments: p.attachedDocuments || [],
          state: {
            deviceProfile,
            predicateDevices,
            literatureResults,
            complianceScore,
            workflowStep,
            documentType
          }
        };
      }
      return p;
    });
    
    setAllProjects(updatedProjects);
    saveAllProjects(updatedProjects);
  };

  const deleteProject = (projectId) => {
    // Use functional update to avoid stale state issues
    setAllProjects(prevProjects => {
      const project = prevProjects.find(p => p.id === projectId);
      if (!project) return prevProjects;
      
      const updated = prevProjects.filter(p => p.id !== projectId);
      saveAllProjects(updated);
      
      // If deleting current project, switch to another or clear
      if (currentProjectId === projectId) {
        if (updated.length > 0) {
          // Directly set the new project ID without calling switchToProject
          // to avoid saveCurrentProjectState being called with stale allProjects
          setCurrentProjectId(updated[0].id);
          localStorage.setItem('currentMedicalDeviceProjectId', updated[0].id);
        } else {
          setCurrentProjectId(null);
          localStorage.removeItem('currentMedicalDeviceProjectId');
        }
      }
      
      toast({
        title: 'Project Deleted',
        description: `Deleted project: ${project.deviceName}`,
      });
      
      return updated;
    });
  };

  // 510k workflow specific state with persistence
  const [workflowStep, setWorkflowStep] = useState(() => loadSavedState('workflowStep', 1));
  const [workflowProgress, setWorkflowProgress] = useState(() =>
    loadSavedState('workflowProgress', 25)
  );
  const [predicatesFound, setPredicatesFound] = useState(() =>
    loadSavedState('predicatesFound', false)
  );
  // eSTAR and RTA status state for Stage 5
  const [estarStatus, setEstarStatus] = useState('not_started');
  const [rtaStatus, setRtaStatus] = useState('not_started');
  const [predicateDevices, setPredicateDevices] = useState(() =>
    loadSavedState('predicateDevices', [])
  );
  const [literatureResults, setLiteratureResults] = useState([]);

  // eSTAR Builder state variables
  const [isValidatingEstar, setIsValidatingEstar] = useState(false);
  const [isGeneratingEstar, setIsGeneratingEstar] = useState(false);
  const [estarValidationResults, setEstarValidationResults] = useState(null);
  const [estarGeneratedUrl, setEstarGeneratedUrl] = useState('');
  const [estarFormat, setEstarFormat] = useState('zip');
  const [selectedLiterature, setSelectedLiterature] = useState([]);
  const [equivalenceCompleted, setEquivalenceCompleted] = useState(false);
  const [complianceScore, setComplianceScore] = useState(null);
  const [submissionReady, setSubmissionReady] = useState(false);

  // eSTAR specific state variables are defined above

  // FDA 510(k) Risk Assessment state variables
  const [riskAssessmentData, setRiskAssessmentData] = useState(() =>
    loadSavedState('riskAssessmentData', null)
  );
  const [isAssessingRisks, setIsAssessingRisks] = useState(false);
  const [riskAssessmentProgress, setRiskAssessmentProgress] = useState(0);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [complianceFixes, setComplianceFixes] = useState(null);
  const [isGeneratingFixes, setIsGeneratingFixes] = useState(false);
  const [showFixesDialog, setShowFixesDialog] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [templateData, setTemplateData] = useState(null);
  
  // Document Vault & Section Editing State
  const [selectedSection, setSelectedSection] = useState(null); // Section selected from vault to edit
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  // Create a deviceProfile object for easier passing to 510k components with localStorage persistence
  const [deviceProfile, setDeviceProfile] = useState(() => {
    // First try to load from localStorage
    const savedProfile = loadSavedState('deviceProfile', null);

    // If we have a saved profile, ensure it has proper structure before using it
    if (savedProfile) {
      // Ensure the loaded profile has proper structure and metadata
      const validatedProfile = ensureProfileIntegrity(savedProfile);
      return validatedProfile;
    }

    // Otherwise create a new default profile with proper structure
    const baseProfile = createNewDeviceProfile({
      id: k510DocumentId,
      deviceName: deviceName || '',
      manufacturer: manufacturer || '',
      productCode: 'UNASSIGNED',
      deviceClass: 'II',
      intendedUse: intendedUse || '',
      description: '',
      technicalSpecifications: '',
      regulatoryClass: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      // Ensure structure and metadata are properly set
      structure: {
        documentType: '510k',
        sections: ['device-info', 'predicates', 'compliance'],
        version: '1.0',
      },
      metadata: {
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    });
    
    // Ensure profile integrity before returning
    return ensureProfileIntegrity(baseProfile);
  });
  const [compliance, setCompliance] = useState(null);
  const [draftStatus, setDraftStatus] = useState('in-progress');
  const [exportTimestamp, setExportTimestamp] = useState(null);
  const [isComplianceRunning, setIsComplianceRunning] = useState(false);
  const [isGeneratingFullCER, setIsGeneratingFullCER] = useState(false);
  const [showDeviceInfoDialog, setShowDeviceInfoDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('eu-mdr');
  const [showWizard, setShowWizard] = useState(false);
  const [showEvidenceReminder, setShowEvidenceReminder] = useState(true);
  const [showSystemHealth, setShowSystemHealth] = useState(false);
  const [showDocumentTree, setShowDocumentTree] = useState(false);
  const [documentPreview, setDocumentPreview] = useState({ show: false, path: '', title: '' });

  // PMA-related state variables
  const [pmaSearchQuery, setPmaSearchQuery] = useState('');
  const [pmaDevices, setPmaDevices] = useState([]);
  const [selectedPmaDevices, setSelectedPmaDevices] = useState([]);
  const [pmaComparisonResults, setPmaComparisonResults] = useState(null);
  const [pmaSubmissionData, setPmaSubmissionData] = useState({});
  const [isLoadingPma, setIsLoadingPma] = useState(false);
  const [pmaError, setPmaError] = useState(null);
  const [pathwayAnalysis, setPathwayAnalysis] = useState(null);
  const [recommendedPathway, setRecommendedPathway] = useState(null);
  const [isAnalyzingPathway, setIsAnalyzingPathway] = useState(false);
  const [pmaSupplements, setPmaSupplements] = useState({});

  // Document Vault - folder expansion state
  const [expandedFolders, setExpandedFolders] = useState({
    regulatory: true,
    clinical: true,
    submissions: true,
    technical: true,
    global: false,
    cer: false,
    k510: false,
  });

  // Floating Document Vault panel state (Windows File Explorer style)
  const [isDocumentVaultOpen, setIsDocumentVaultOpen] = useState(false);

  // Toggle folder expansion in document tree
  const toggleFolder = folderId => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Document Vault - file management state
  const [documentView, setDocumentView] = useState('all'); // 'all', 'cer', '510k', 'global'
  const [systemInfo, setSystemInfo] = useState({
    memory: { used: 0, total: 0, percentage: 0 },
    api: { status: 'unknown', latency: 0 },
    uptime: 0,
    errorCount: 0,
    lastChecked: null,
  });

  // Load project state when currentProjectId changes
  useEffect(() => {
    if (!currentProjectId) return;
    
    const project = allProjects.find(p => p.id === currentProjectId);
    if (project && project.state) {
      // Rehydrate all project state
      setDeviceProfile(project.state.deviceProfile || {});
      setPredicateDevices(project.state.predicateDevices || []);
      setLiteratureResults(project.state.literatureResults || []);
      setComplianceScore(project.state.complianceScore || {});
      setWorkflowStep(project.state.workflowStep || 1);
      setDocumentType(project.state.documentType || project.deviceType || '510k');
    }
  }, [currentProjectId, allProjects]);

  // Auto-save current project state periodically
  useEffect(() => {
    if (!currentProjectId) return;
    
    const saveInterval = setInterval(() => {
      saveCurrentProjectState();
    }, 30000); // Save every 30 seconds
    
    return () => clearInterval(saveInterval);
  }, [currentProjectId, deviceProfile, predicateDevices, literatureResults, complianceScore, workflowStep]);

  // Update device profile when device information changes and persist it
  useEffect(() => {
    if (documentType === '510k' && (deviceName || manufacturer || intendedUse)) {
      setDeviceProfile(prevProfile => {
        const updatedProfile = {
          ...prevProfile,
          deviceName: deviceName || prevProfile.deviceName,
          manufacturer: manufacturer || prevProfile.manufacturer,
          intendedUse: intendedUse || prevProfile.intendedUse,
          updatedAt: new Date().toISOString(),
        };

        // Ensure the updated profile maintains proper structure
        const validatedProfile = ensureProfileIntegrity(updatedProfile);
        
        // Persist device profile to localStorage
        saveState('deviceProfile', validatedProfile);
        
        return validatedProfile;
      });
    }
  }, [deviceName, manufacturer, intendedUse, documentType]);

  // Add a watcher to persist device profile when it changes from other sources
  useEffect(() => {
    // Don't save if the profile is empty or null
    if (deviceProfile && Object.keys(deviceProfile).length > 0) {
      saveState('deviceProfile', deviceProfile);
    }
  }, [deviceProfile]);

  // Persist risk assessment data when it changes
  useEffect(() => {
    if (riskAssessmentData) {
      saveState('riskAssessmentData', riskAssessmentData);
    }
  }, [riskAssessmentData]);

  // Helper function to format CtQ factors for a specific objective
  const getCtqFactorsForSection = (objectiveId, ctqFactors) => {
    const factors = ctqFactors.filter(factor => factor.objectiveId === objectiveId);

    if (factors.length === 0) {
      return 'No Critical-to-Quality factors defined.';
    }

    return `**Critical-to-Quality Factors:**\n${factors
      .map(
        factor => `
* **${factor.name}**
  * Associated Section: ${factor.associatedSection}
  * Risk Level: ${factor.riskLevel}
  * Description: ${factor.description}
  * Mitigation: ${factor.mitigation}
`
      )
      .join('')}`;
  };

  // Function to safely open documents and prevent redirection issues
  const openDocumentSafely = (event, url, documentName, showToast) => {
    // CRITICAL: Prevent default behavior and stop event propagation
    // This prevents unwanted navigation back to client portal home
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Always open in the inline document viewer for consistent experience
    setDocumentViewerData({
      isOpen: true,
      url: url,
      documentName: documentName,
      type: url.endsWith('.pdf') ? 'pdf' : 'other'
    });
    
    if (showToast) {
      showToast({
        title: 'Opening Document',
        description: `Viewing ${documentName}`,
        variant: 'default',
      });
    }
  };

  // Set up the 510K workflow if initialized with that document type
  // and handle state persistence on page load
  useEffect(() => {
    if (documentType === '510k') {
      // Load saved device profile from localStorage if available
      const savedDeviceProfile = localStorage.getItem('510k_deviceProfile');
      if (savedDeviceProfile) {
        try {
          const parsedProfile = JSON.parse(savedDeviceProfile);
          setDeviceProfile(parsedProfile);

          // Also restore workflow step if available
          const savedStep = localStorage.getItem('510k_workflowStep');
          if (savedStep) {
            const step = parseInt(savedStep);
            setWorkflowStep(step);

            // Don't automatically change tabs based on saved step
            // Let users start at Pathway Analyzer for better onboarding
            // They can navigate to their previous work using the sequential tabs
          }
        } catch (error) {
          console.error('Error restoring saved device profile:', error);
          toast({
            title: 'Error Restoring Data',
            description: "We couldn't restore your previous work. Starting with a fresh form.",
            variant: 'destructive',
          });
        }
      }
    }
  }, [documentType]);

  // Update workflow progress when steps change and persist state to localStorage
  useEffect(() => {
    if (documentType === '510k') {
      // Calculate progress based on workflow step
      const progressMap = {
        1: deviceProfile ? 25 : 5,
        2: predicatesFound ? 50 : 30,
        3: equivalenceCompleted ? 75 : 55,
        4: complianceScore ? 90 : 80,
        5: submissionReady ? 100 : 95,
      };

      setWorkflowProgress(progressMap[workflowStep] || 0);

      // Save current step to localStorage for persistence across page refreshes
      localStorage.setItem('510k_workflowStep', workflowStep.toString());

      // Also save device profile if it exists
      if (deviceProfile && Object.keys(deviceProfile).length > 0) {
        localStorage.setItem('510k_deviceProfile', JSON.stringify(deviceProfile));
      }
    }
  }, [
    documentType,
    workflowStep,
    deviceProfile,
    predicatesFound,
    equivalenceCompleted,
    complianceScore,
    submissionReady,
  ]);

  // Handler functions for 510k workflow
  // Completely rewritten handler for predicate completion to fix workflow transition
  const handlePredicatesComplete = (data, literatureData = []) => {
    console.log('[CERV2 Workflow] Predicate completion handler called:', {
      predicateCount: data?.length || 0,
      literatureCount: literatureData?.length || 0,
    });

    // Basic validation
    if (!data || data.length === 0) {
      toast({
        title: 'Missing Predicate Devices',
        description: 'Please select at least one predicate device before proceeding.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    try {
      // 1. First update the device profile to include the predicate information
      const updatedDeviceProfile = {
        ...deviceProfile,
        predicateDevices: data.map(p => ({
          id: p.id || p.k_number,
          k_number: p.k_number,
          name: p.device_name || p.deviceName,
          applicant: p.applicant_100 || p.manufacturer,
        })),
      };

      // Ensure the profile maintains proper structure
      const validatedProfile = ensureProfileIntegrity(updatedDeviceProfile);

      // 2. Set all state variables synchronously for workflow transition
      setPredicatesFound(true);
      setPredicateDevices(data);
      setDeviceProfile(validatedProfile);

      // 3. Process literature if available
      if (literatureData && literatureData.length > 0) {
        setLiteratureResults(literatureData);
        setSelectedLiterature(
          literatureData.filter(item => item.relevanceScore >= 0.8).slice(0, 5)
        );
      }

      // 4. Success notification
      toast({
        title: 'Predicate Devices Selected',
        description: `Found ${data.length} predicate devices for comparison.`,
        duration: 2000,
      });

      // 5. Critical workflow transition fix - direct and synchronous workflow navigation
      console.log('[CERV2 Workflow] Directly transitioning to Equivalence step');
      setActiveTab('equivalence');
      setWorkflowStep(3);
    } catch (error) {
      console.error('[CERV2 Workflow] Error during predicate selection completion:', error);
      toast({
        title: 'Workflow Error',
        description: 'There was an issue processing the selected predicates. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  // Handle literature selection updates
  const handleLiteratureSelect = item => {
    if (selectedLiterature.some(lit => lit.id === item.id)) {
      setSelectedLiterature(prev => prev.filter(lit => lit.id !== item.id));
    } else {
      setSelectedLiterature(prev => [...prev, item]);
    }
  };

  const handleEquivalenceComplete = data => {
    setEquivalenceCompleted(true);
    setEquivalenceData(data); // Store the equivalence data including literature evidence

    // Explicitly move to the next step in the workflow
    setWorkflowStep(4);
    setActiveTab('compliance');

    console.log('Equivalence step completed successfully, transitioning to compliance step');

    // Save literature-feature connections if available
    if (data && data.literatureEvidence && Object.keys(data.literatureEvidence).length > 0) {
      // Save to the server via the LiteratureFeatureService
      LiteratureFeatureService.saveLiteratureFeatureConnections({
        documentId: deviceProfile?.id || data.documentId,
        featureEvidence: data.literatureEvidence,
        organizationId: deviceProfile?.organizationId,
      })
        .then(() => {
          // Log successful connection
          const connectionCount = Object.values(data.literatureEvidence).reduce(
            (acc, papers) => acc + papers.length,
            0
          );
          console.log(
            `Saved ${connectionCount} literature evidence connections for ${Object.keys(data.literatureEvidence).length} features`
          );

          // Update toast message to include literature connections
          toast({
            title: 'Equivalence Analysis Complete',
            description: `Substantial equivalence documentation has been prepared with ${connectionCount} literature evidence connections.`,
          });
        })
        .catch(error => {
          console.error('Error saving literature evidence connections:', error);

          // Show error toast
          toast({
            title: 'Warning',
            description:
              "Equivalence analysis saved, but there was an issue connecting literature evidence. This won't affect your submission.",
            variant: 'default',
          });
        });
    } else {
      // Standard completion toast when no literature evidence
      toast({
        title: 'Equivalence Analysis Complete',
        description: 'Substantial equivalence documentation has been prepared.',
      });
    }

    // Automatically advance to compliance check
    setWorkflowStep(4);
    setActiveTab('compliance');
  };

  const handleComplianceComplete = score => {
    const numericScore = typeof score === 'number' ? score : 85;
    setComplianceScore(numericScore);

    toast({
      title: 'Compliance Check Complete',
      description: `Your 510(k) submission is ${numericScore}% compliant with FDA requirements.`,
      variant: numericScore <= 80 ? 'destructive' : undefined,
    });

    // Set submission ready based on compliance score
    if (numericScore >= 70) {
      setSubmissionReady(true);
    }

    // Use a timeout to ensure state updates are processed before navigation
    setTimeout(() => {
      try {
        // First update the tab to ensure it's ready when we change the step
        setActiveTab('submission');

        // Short delay to let the tab change apply
        setTimeout(() => {
          // Then update the workflow step
          setWorkflowStep(5);

          console.log('[CERV2 Flow] Successfully advanced to final submission step');

          // Confirm the navigation with a user-friendly toast
          toast({
            title: 'Final Submission Ready',
            description: 'You can now review and generate your eSTAR package',
          });
        }, 100);
      } catch (error) {
        console.error('[CERV2 Flow] Error navigating to final step:', error);

        // Fallback approach if the primary navigation fails
        goToStep(5);
      }
    }, 200);
  };

  const handleSubmissionReady = () => {
    setSubmissionReady(true);
    toast({
      title: 'Submission Package Ready',
      description: 'Your 510(k) submission package is now ready for final review.',
    });
  };

  /**
   * Validate the eSTAR package against FDA requirements
   *
   * @param {boolean} strictMode Whether to apply strict validation rules
   * @returns {Promise<void>}
   */
  const validateESTARPackage = async (strictMode = false) => {
    if (!deviceProfile?.id) {
      toast({
        title: 'Validation Error',
        description: 'No device profile found. Please complete device setup first.',
        variant: 'destructive',
      });
      return;
    }

    setIsValidatingEstar(true);
    setEstarValidationResults(null);

    try {
      const results = await FDA510kService.validateESTARPackage(deviceProfile.id, strictMode);

      setEstarValidationResults(results);

      if (results.valid) {
        toast({
          title: 'Validation Successful',
          description: 'eSTAR package meets FDA submission requirements.',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Validation Issues Found',
          description: `${results.issues?.length || 0} issues need to be resolved before submission.`,
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error validating eSTAR package:', error);
      toast({
        title: 'Validation Error',
        description: 'Failed to validate eSTAR package. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsValidatingEstar(false);
    }
  };

  /**
   * Generate a FDA-compliant eSTAR package
   *
   * @param {string} format Format for the eSTAR package ('zip', 'pdf', or 'json')
   * @returns {Promise<void>}
   */
  const generateESTARPackage = async (format = 'zip') => {
    if (!deviceProfile?.id) {
      toast({
        title: 'Generation Error',
        description: 'No device profile found. Please complete device setup first.',
        variant: 'destructive',
      });
      return;
    }

    if (!submissionReady) {
      toast({
        title: 'Not Ready for Submission',
        description: 'Please complete all required sections before generating the eSTAR package.',
        variant: 'default',
      });
      return;
    }

    setIsGeneratingEstar(true);
    setEstarGeneratedUrl('');

    try {
      // Collect all the necessary data for the eSTAR package
      const reportData = {
        deviceProfile: deviceProfile,
        compliance: {
          score: complianceScore,
          status: draftStatus,
        },
        equivalence: {
          predicateDevices: predicateDevices,
          completed: equivalenceCompleted,
        },
        sections: sections,
        options: {
          format: format,
          includeAttachments: true,
          validateBeforeGeneration: true,
        },
      };

      // Generate the final 510(k) report including eSTAR package
      const result = await FDA510kService.generateFinal510kReport(reportData);

      if (result?.downloadUrl) {
        setEstarGeneratedUrl(result.downloadUrl);
        toast({
          title: 'eSTAR Package Generated',
          description: 'Your eSTAR package has been generated successfully.',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Generation Warning',
          description: 'eSTAR package was generated but no download URL was returned.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error generating eSTAR package:', error);
      toast({
        title: 'Generation Error',
        description: 'Failed to generate eSTAR package. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingEstar(false);
    }
  };

  // Track loading state for navigation
  const [isNavigating, setIsNavigating] = useState(false);

  // Enhanced navigation function for 510k workflow with robust error handling and data consistency
  const goToStep = step => {
    if (step >= 1 && step <= 5) {
      // Set navigating state to show loading indicators
      setIsNavigating(true);

      try {
        console.log(`[CERV2 Navigation] Transitioning to step ${step}`);

        // Map steps to tabs - this is the core navigation logic
        const tabMap = {
          1: 'device-profile', // Device Profile
          2: 'predicates', // Predicate Finder
          3: 'equivalence', // Substantial Equivalence
          4: 'compliance', // Compliance Check
          5: 'submission', // Final Submission
        };

        // Get target tab based on step
        const targetTab = tabMap[step] || 'device-profile';

        // Calculate progress values based on step - calibrated for smoother progression
        const progressMap = {
          1: 20, // Initial step
          2: 40, // Predicate finding
          3: 60, // Equivalence analysis
          4: 80, // Compliance check
          5: 100, // Final submission
        };

        // Perform data integrity checks to ensure required data exists
        if (step > 1 && (!deviceProfile || !deviceProfile.deviceName)) {
          // Try to recover device profile from localStorage if it exists there
          const savedProfile = loadSavedState('deviceProfile', null);
          if (savedProfile && savedProfile.deviceName) {
            console.log(
              '[CERV2 Recovery] Recovered device profile from localStorage:',
              savedProfile.deviceName
            );
            setDeviceProfile(savedProfile);
          } else {
            console.warn(
              '[CERV2 Navigation] Cannot advance to step',
              step,
              'without completing step 1 (Device Profile)'
            );
            toast({
              title: 'Complete Device Profile First',
              description:
                'Please create and save a device profile before proceeding to the next step.',
              variant: 'default',
            });
            setIsNavigating(false);
            return;
          }
        }

        if (step > 2 && (!predicateDevices || predicateDevices.length === 0)) {
          // Try to recover predicate devices from localStorage if they exist there
          const savedPredicates = loadSavedState('predicateDevices', []);
          if (savedPredicates && savedPredicates.length > 0) {
            console.log(
              '[CERV2 Recovery] Recovered predicate devices from localStorage:',
              savedPredicates.length
            );
            setPredicateDevices(savedPredicates);
            setPredicatesFound(true);
          } else {
            console.warn(
              '[CERV2 Navigation] Cannot advance to step',
              step,
              'without completing step 2 (Predicate Finder)'
            );
            toast({
              title: 'Find Predicates First',
              description:
                'Please select at least one predicate device before moving to equivalence building.',
              variant: 'default',
            });
            setIsNavigating(false);
            return;
          }
        }

        if (step > 3 && !equivalenceCompleted) {
          // Try to recover equivalence data from localStorage if it exists
          const savedEquivalence = loadSavedState('equivalenceData', null);
          if (savedEquivalence) {
            console.log('[CERV2 Recovery] Recovered equivalence data from localStorage');
            setEquivalenceData(savedEquivalence);
            setEquivalenceCompleted(true);
          } else {
            console.warn(
              '[CERV2 Navigation] Cannot advance to step',
              step,
              'without completing step 3 (Equivalence)'
            );
            toast({
              title: 'Complete Equivalence First',
              description:
                'Please complete the substantial equivalence analysis before proceeding to compliance check.',
              variant: 'default',
            });
            setIsNavigating(false);
            return;
          }
        }

        if (step > 4 && !complianceScore) {
          // Try to recover compliance data from localStorage if it exists
          const savedCompliance = loadSavedState('complianceScore', null);
          if (savedCompliance) {
            console.log(
              '[CERV2 Recovery] Recovered compliance score from localStorage:',
              savedCompliance
            );
            setComplianceScore(savedCompliance);
          } else {
            console.warn(
              '[CERV2 Navigation] Cannot advance to step',
              step,
              'without completing step 4 (Compliance)'
            );
            toast({
              title: 'Complete Compliance Check First',
              description: 'Please finish the compliance check before generating your submission.',
              variant: 'default',
            });
            setIsNavigating(false);
            return;
          }
        }

        // Save current state to ensure nothing is lost during transition
        if (deviceProfile) {
          saveState('deviceProfile', deviceProfile);
        }

        if (predicateDevices && predicateDevices.length > 0) {
          saveState('predicateDevices', predicateDevices);
          saveState('predicatesFound', true);
        }

        if (equivalenceData) {
          saveState('equivalenceData', equivalenceData);
          saveState('equivalenceCompleted', true);
        }

        if (complianceScore) {
          saveState('complianceScore', complianceScore);
        }

        // Use a slight delay to allow the loading state to be visible
        // and to ensure state updates are processed correctly
        setTimeout(() => {
          // Update step with proper persistence
          setWorkflowStep(step);
          saveState('workflowStep', step);

          // Update progress with proper persistence
          setWorkflowProgress(progressMap[step]);
          saveState('workflowProgress', progressMap[step]);

          // Update tab with proper persistence
          setActiveTab(targetTab);
          saveState('activeTab', targetTab);

          console.log(
            `[CERV2 Navigation] Successfully transitioned to step ${step} and tab "${targetTab}"`
          );

          // Show success toast only when navigation completes successfully
          toast({
            title: 'Navigation Successful',
            description: `Moved to ${tabMap[step].replace('-', ' ')} step.`,
            variant: 'default',
          });

          // Clear navigation loading state
          setIsNavigating(false);
        }, 500);
      } catch (error) {
        console.error(`[CERV2 Navigation] Error transitioning to step ${step}:`, error);

        // Show error to user with specific message from error if available
        toast({
          title: 'Navigation Error',
          description:
            error.message || 'There was a problem navigating to the next step. Please try again.',
          variant: 'destructive',
        });

        // Enhanced error state recovery - restore from localStorage where possible
        try {
          // Attempt to restore critical state from localStorage
          const savedStep = loadSavedState('workflowStep', workflowStep);
          const savedTab = loadSavedState('activeTab', activeTab);

          console.log(`[CERV2 Recovery] Restoring to step ${savedStep} and tab "${savedTab}"`);

          // Restore to previous known good state
          setWorkflowStep(savedStep);
          setActiveTab(savedTab);

          setTimeout(() => setIsNavigating(false), 300);
        } catch (recoveryError) {
          console.error('[CERV2 Navigation] Recovery attempt failed:', recoveryError);
          setIsNavigating(false);
        }
      }
    } else {
      // Handle invalid step numbers
      console.error(`[CERV2 Navigation] Invalid step number: ${step}`);
      toast({
        title: 'Navigation Error',
        description: `Invalid step number: ${step}. Steps must be between 1 and 5.`,
        variant: 'destructive',
      });
    }
  };


  // Helper function to check if a tab is completed with proper validation
  // Placed at component level so it's accessible from both renderContent and renderNavigation
  const isTabCompleted = (tabId) => {
    switch(tabId) {
      case 'device-intake':
        // Must have all required fields, not just some
        const isComplete = deviceProfile && 
               deviceProfile.deviceName && 
               deviceProfile.manufacturer && 
               deviceProfile.intendedUse && 
               deviceProfile.productCode && 
               deviceProfile.regulationNumber &&
               deviceProfile.deviceClass;
        
        if (tabId === 'device-intake') {
          console.log('🔍 Checking Device Intake completion:', {
            hasDeviceProfile: !!deviceProfile,
            deviceName: deviceProfile?.deviceName,
            manufacturer: deviceProfile?.manufacturer,
            intendedUse: deviceProfile?.intendedUse,
            productCode: deviceProfile?.productCode,
            regulationNumber: deviceProfile?.regulationNumber,
            deviceClass: deviceProfile?.deviceClass,
            isComplete
          });
        }
        
        return isComplete;
      case 'pathway-analyzer':
        return recommendedPathway && recommendedPathway.pathway;
      case 'predicates':
        // Must have found and selected at least one predicate
        return (predicatesFound || (predicateDevices && predicateDevices.length > 0)) && selectedPredicate;
      case 'device-data-center':
        return false; // Can check if minimum files uploaded
      case 'document-editor':
        return sections && sections.length > 0;
      case 'equivalence':
        return equivalenceCompleted;
      case 'compliance':
        return complianceScore > 0;
      case 'submission':
        return submissionReady;
      default:
        return false;
    }
  };

  // Helper function to check if files are present for a section
  const checkFilesPresent = (category) => {
    // Check EnhancedDocumentVault uploads or deviceProfile file references
    switch(category) {
      case 'bench': return !!deviceProfile?.benchFiles?.length;
      case 'biocompatibility': return !!deviceProfile?.biocompFiles?.length;
      case 'software': return !!deviceProfile?.softwareFiles?.length;
      case 'cybersecurity': return !!deviceProfile?.cyberFiles?.length;
      case 'clinical': return !!deviceProfile?.clinicalFiles?.length;
      case 'sterility': return !!deviceProfile?.sterilityFiles?.length;
      case 'emc': return !!deviceProfile?.emcFiles?.length;
      case 'usability': return !!deviceProfile?.usabilityFiles?.length;
      case 'labeling': return !!deviceProfile?.labelingFiles?.length;
      default: return false;
    }
  };

  // Helper function to check if a section is complete
  const checkSectionComplete = (sectionId) => {
    // Check if all required fields and documents for a section are complete
    switch(sectionId) {
      case 'device-intake':
        return deviceProfile?.deviceName && deviceProfile?.manufacturer && 
               deviceProfile?.intendedUse && deviceProfile?.productCode;
      case 'pathway-analyzer':
        return !!deviceProfile?.recommendedPathway;
      case 'predicates':
        return !!deviceProfile?.primaryPredicate;
      case 'se-strategy':
        return !!deviceProfile?.seStrategy;
      case 'standards-matrix':
        return !!deviceProfile?.standardsMatrix;
      case 'test-plan':
        return !!deviceProfile?.testPlan;
      case 'bench-testing':
        return checkFilesPresent('bench');
      case 'biocompatibility':
        return checkFilesPresent('biocompatibility');
      case 'admin-forms':
        return !!deviceProfile?.forms3514 && !!deviceProfile?.forms3601;
      case '510k-summary':
        return !!deviceProfile?.summaryType && 
               (!!deviceProfile?.summary807_92 || !!deviceProfile?.statement807_93);
      default:
        return false;
    }
  };

  // FDA 510(k) 7-Stage Workflow Gate Conditions - Enhanced with all 6 gate types
  const checkStageGateConditions = (stage) => {
    switch (stage) {
      case 'setup':
        return {
          // Boolean checks
          programSelected: { type: 'boolean', value: !!deviceProfile?.submissionType, label: 'Program Selected' },
          // String non-empty checks
          productCodeSet: { type: 'string_nonempty', value: deviceProfile?.productCode, label: 'Product Code' },
          intendedUseDrafted: { type: 'string_nonempty', value: deviceProfile?.intendedUse, label: 'Intended Use' },
          // Section complete check
          deviceIntakeComplete: { type: 'section_complete', value: checkSectionComplete('device-intake'), label: 'Device Intake' },
          // Overall gate status
          passed: !!deviceProfile?.submissionType && !!deviceProfile?.productCode && 
                  deviceProfile?.productCode !== 'UNASSIGNED' && checkSectionComplete('device-intake')
        };
      
      case 'strategy':
        const setupGate = checkStageGateConditions('setup');
        return {
          // Boolean check
          predicateSelected: { type: 'boolean', value: !!deviceProfile?.primaryPredicate, label: 'Predicate Selected' },
          // Section complete check
          seStrategyDefined: { type: 'section_complete', value: checkSectionComplete('se-strategy'), label: 'SE Strategy' },
          // Overall gate status
          passed: setupGate.passed && !!deviceProfile?.primaryPredicate && checkSectionComplete('se-strategy')
        };
      
      case 'evidence_plan':
        const strategyGate = checkStageGateConditions('strategy');
        return {
          // Section complete checks
          standardsMatrixReady: { type: 'section_complete', value: checkSectionComplete('standards-matrix'), label: 'Standards Matrix' },
          testPlanReady: { type: 'section_complete', value: checkSectionComplete('test-plan'), label: 'Test Plan' },
          // Overall gate status
          passed: strategyGate.passed && checkSectionComplete('standards-matrix') && checkSectionComplete('test-plan')
        };
      
      case 'evidence':
        const evidencePlanGate = checkStageGateConditions('evidence_plan');
        const benchFilesPresent = checkFilesPresent('bench');
        const biocompFilesPresent = checkFilesPresent('biocompatibility');
        return {
          // File present checks
          benchTestingFiles: { type: 'file_present', value: benchFilesPresent, label: 'Bench Test Reports' },
          biocompatibilityFiles: { type: 'file_present', value: biocompFilesPresent, label: 'Biocompatibility Reports' },
          // Coverage threshold check
          evidenceCoverage: { type: 'coverage', value: deviceProfile?.evidenceCoverage || 0, threshold: 0.8, label: 'Evidence Coverage' },
          // Overall gate status
          passed: evidencePlanGate.passed && (deviceProfile?.evidenceCoverage >= 0.8)
        };
      
      case 'authoring':
        const evidenceGate = checkStageGateConditions('evidence');
        return {
          // Section complete checks
          adminFormsReady: { type: 'section_complete', value: (!!deviceProfile?.forms3514 && !!deviceProfile?.forms3601), label: 'Admin Forms' },
          narrativesReady: { type: 'section_complete', value: !!deviceProfile?.seDiscussion, label: 'SE Discussion' },
          summaryComplete: { type: 'section_complete', value: checkSectionComplete('510k-summary'), label: '510(k) Summary/Statement' },
          // Overall gate status
          passed: evidenceGate.passed && !!deviceProfile?.forms3514 && !!deviceProfile?.forms3601 && checkSectionComplete('510k-summary')
        };
      
      case 'estar_rta':
        const authoringGate = checkStageGateConditions('authoring');
        return {
          // File present check
          estarPackageFile: { type: 'file_present', value: !!deviceProfile?.estarPackageFile, label: 'eSTAR Package' },
          // Threshold check
          rtaScore: { type: 'threshold', value: deviceProfile?.rtaScore || 0, threshold: 0.9, label: 'RTA Score' },
          // Overall gate status
          passed: authoringGate.passed && (deviceProfile?.rtaScore >= 0.9)
        };
      
      case 'submit_ai':
        const estarGate = checkStageGateConditions('estar_rta');
        return {
          // String non-empty check
          submissionId: { type: 'string_nonempty', value: deviceProfile?.submissionId, label: 'Submission ID' },
          // Overall gate status
          passed: estarGate.passed && !!deviceProfile?.submissionId
        };
      
      default:
        return { passed: true };
    }
  };

  // Stage-based visibility for conditional sections based on device toggles
  const isSectionVisible = (sectionId) => {
    // Software-specific sections
    const softwareSections = ['software', 'software_summary'];
    if (softwareSections.includes(sectionId)) {
      return deviceProfile?.software || deviceProfile?.toggles?.hasSoftware || false;
    }

    // Cybersecurity sections
    const cyberSections = ['cybersecurity', 'cybersecurity_summary'];
    if (cyberSections.includes(sectionId)) {
      return deviceProfile?.cybersecurity || deviceProfile?.toggles?.isCyberDevice || false;
    }

    // Sterility sections
    const sterilitySections = ['sterility', 'sterility_summary'];
    if (sterilitySections.includes(sectionId)) {
      return deviceProfile?.sterilization || deviceProfile?.toggles?.isSterile || false;
    }

    // Clinical data sections
    const clinicalSections = ['clinical_data', 'fda_3674'];
    if (clinicalSections.includes(sectionId)) {
      return deviceProfile?.clinicalData || deviceProfile?.toggles?.hasClinicalData || false;
    }

    // Default: section is visible
    return true;
  };

  const renderContent = () => {
    // Enhanced 510(k) Intake Workflow - comprehensive 7-stage gated process
    if (activeTab === 'device-intake') {
      return (
        <Enhanced510kIntakeWorkflow
          existingProject={deviceProfile}
          organizationId={organizationId}
          projectId={k510DocumentId || deviceProfile?.id}
          onSave={(workflowData) => {
            // Update device profile with enhanced workflow data
            const enhancedProfile = {
              ...deviceProfile,
              // Map workflow data to device profile format
              deviceName: workflowData.deviceName,
              manufacturer: workflowData.applicantName,
              intendedUse: workflowData.intendedUse,
              indicationsForUse: workflowData.indicationsForUse,
              productCode: workflowData.productCode,
              regulationNumber: workflowData.regulationNumber,
              deviceClass: workflowData.deviceClass,
              // Additional enhanced fields
              submissionType: workflowData.submissionType,
              dunsNumber: workflowData.dunsNumber,
              establishmentNumber: workflowData.establishmentNumber,
              contactName: workflowData.contactName,
              contactEmail: workflowData.contactEmail,
              contactPhone: workflowData.contactPhone,
              deviceModels: workflowData.deviceModels,
              deviceAccessories: workflowData.deviceAccessories,
              // Feature flags
              hasSoftware: workflowData.hasSoftware,
              isCyberDevice: workflowData.isCyberDevice,
              isSterile: workflowData.isSterile,
              hasClinicalData: workflowData.hasClinicalData,
              hasPatientContacting: workflowData.hasPatientContacting,
              contactDuration: workflowData.contactDuration,
              contactType: workflowData.contactType,
              // Predicate info
              primaryPredicate: workflowData.primaryPredicateKNumber,
              predicateManufacturer: workflowData.predicateManufacturer,
              // Store full workflow data
              workflowMetadata: workflowData
            };
            
            setDeviceProfile(enhancedProfile);
            // Save to localStorage
            localStorage.setItem('510k_deviceProfile', JSON.stringify(enhancedProfile));
            localStorage.setItem('510k_enhanced_workflow', JSON.stringify(workflowData));
            
            toast({
              title: 'Progress Saved',
              description: 'Your 510(k) workflow data has been saved successfully.',
            });
          }}
          onComplete={(completedData) => {
            toast({
              title: '510(k) Workflow Complete',
              description: 'All stages completed. Ready for FDA submission.',
              duration: 5000,
            });
            
            // Navigate to submission tab
            setActiveTab('submission');
          }}
        />
      );
    }
    
    // Pathway Analyzer Component - helps users choose between 510(k), PMA, or De Novo
    else if (activeTab === 'pathway-analyzer') {
      return (
        <div className="p-6 space-y-6">
          {/* Contextual Help Banner */}
          <Card className="bg-purple-50 border-purple-200 context-banner-enter">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Step 2: Determine Your Regulatory Pathway</h4>
                  <p className="text-sm text-purple-800">
                    Based on your device profile from Step 1, this AI-powered analyzer will recommend the appropriate 
                    FDA regulatory pathway (510(k), PMA, or De Novo). The recommendation considers device class, 
                    intended use, and risk profile.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Prerequisites:</strong> Device Intake Form must be completed (Step 1). The analyzer uses 
                    your device classification, intended use, and risk factors to determine the best pathway.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Summary Widget - Only show if user has started */}
          {deviceProfile && Object.keys(deviceProfile).length > 0 && (
            <Card className="bg-white border-gray-200 shadow-sm context-banner-enter">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    Overall Progress
                  </h3>
                  <span className="text-xs text-gray-500">
                    {[
                      isTabCompleted('device-intake'),
                      isTabCompleted('pathway-analyzer'),
                      isTabCompleted('predicates'),
                      isTabCompleted('equivalence'),
                      isTabCompleted('compliance')
                    ].filter(Boolean).length} / 5 Core Steps Complete
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-green-600 h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${([
                        isTabCompleted('device-intake'),
                        isTabCompleted('pathway-analyzer'),
                        isTabCompleted('predicates'),
                        isTabCompleted('equivalence'),
                        isTabCompleted('compliance')
                      ].filter(Boolean).length / 5) * 100}%` 
                    }}
                  />
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-green-50 rounded p-2 text-center">
                    <div className="font-bold text-green-700">
                      {[
                        isTabCompleted('device-intake'),
                        isTabCompleted('pathway-analyzer'),
                        isTabCompleted('predicates'),
                        isTabCompleted('equivalence'),
                        isTabCompleted('compliance')
                      ].filter(Boolean).length}
                    </div>
                    <div className="text-green-600">Completed</div>
                  </div>
                  <div className="bg-blue-50 rounded p-2 text-center">
                    <div className="font-bold text-blue-700">
                      {5 - [
                        isTabCompleted('device-intake'),
                        isTabCompleted('pathway-analyzer'),
                        isTabCompleted('predicates'),
                        isTabCompleted('equivalence'),
                        isTabCompleted('compliance')
                      ].filter(Boolean).length}
                    </div>
                    <div className="text-blue-600">Remaining</div>
                  </div>
                  <div className="bg-purple-50 rounded p-2 text-center">
                    <div className="font-bold text-purple-700">{deviceProfile.deviceName ? '1' : '0'}</div>
                    <div className="text-purple-600">Device(s)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Getting Started Banner */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="bg-blue-600 p-3 rounded-lg">
                  <Lightbulb className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Welcome to Medical Device & Diagnostics Regulatory Module - Your 510(k) Submission Builder
                    </h3>
                    {/* Resume Button for returning users */}
                    {deviceProfile && Object.keys(deviceProfile).length > 0 && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          // Intelligently determine next incomplete step using validation
                          const isDeviceIntakeComplete = deviceProfile.deviceName && 
                                                         deviceProfile.manufacturer && 
                                                         deviceProfile.intendedUse && 
                                                         deviceProfile.productCode && 
                                                         deviceProfile.regulationNumber &&
                                                         deviceProfile.deviceClass;
                          
                          const isPathwayComplete = recommendedPathway && recommendedPathway.pathway;
                          const isPredicatesComplete = (predicatesFound || (predicateDevices && predicateDevices.length > 0)) && selectedPredicate;
                          
                          let nextStep = 'device-intake';
                          let nextStepName = 'Device Intake Form';
                          
                          if (!isDeviceIntakeComplete) {
                            nextStep = 'device-intake';
                            nextStepName = 'Device Intake Form';
                          } else if (!isPathwayComplete) {
                            nextStep = 'pathway-analyzer';
                            nextStepName = 'Pathway Analyzer';
                          } else if (!isPredicatesComplete) {
                            nextStep = 'predicates';
                            nextStepName = 'Predicate Finder';
                          } else if (!equivalenceCompleted) {
                            nextStep = 'equivalence';
                            nextStepName = 'Equivalence Analysis';
                          } else if (!complianceScore || complianceScore === 0) {
                            nextStep = 'compliance';
                            nextStepName = 'Compliance Check';
                          } else {
                            nextStep = 'document-editor';
                            nextStepName = 'Document Editor';
                          }
                          
                          setActiveTab(nextStep);
                          toast({
                            title: 'Resuming Your Work',
                            description: `Taking you to: ${nextStepName}`,
                          });
                        }}
                        data-testid="button-resume-work"
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Continue Where You Left Off
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-4">
                    Follow this step-by-step workflow to build your complete FDA 510(k) submission package:
                  </p>
                  
                  {/* Step Progress Indicator */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-gray-900">Your 510(k) Submission Workflow</h4>
                      <span className="text-xs text-gray-500">Follow steps 1-12 in order</span>
                    </div>
                    
                    {/* Visual Progress Flow */}
                    <div className="flex items-center justify-between space-x-2 mb-4 overflow-x-auto">
                      <div className="flex items-center space-x-1">
                        <div className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">1</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">2</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">3</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-cyan-100 text-cyan-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">4</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">5</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-yellow-100 text-yellow-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">6</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">7</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-orange-100 text-orange-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">8</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-red-100 text-red-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">9</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">10</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-teal-100 text-teal-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">11</div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">12</div>
                      </div>
                    </div>
                    
                    {/* Quick Start Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</div>
                          <h5 className="font-semibold text-xs text-blue-900">Step 1: Device Intake</h5>
                        </div>
                        <p className="text-xs text-blue-700 mb-2">Complete comprehensive intake form</p>
                        <Button 
                          size="sm" 
                          variant="default"
                          className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => setActiveTab('device-intake')}
                          data-testid="banner-step1-start"
                        >
                          <PlayCircle className="h-3 w-3 mr-1" />
                          Start Here
                        </Button>
                      </div>
                      
                      <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-3 rounded-lg border border-cyan-200">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="bg-cyan-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</div>
                          <h5 className="font-semibold text-xs text-cyan-900">Step 2: Data Collection</h5>
                        </div>
                        <p className="text-xs text-cyan-700 mb-2">Upload test reports & documents</p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full text-xs bg-white hover:bg-cyan-50"
                          onClick={() => setActiveTab('device-data-center')}
                          data-testid="banner-step2-datacenter"
                        >
                          <HardDrive className="h-3 w-3 mr-1" />
                          Data Center
                        </Button>
                      </div>
                      
                      <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</div>
                          <h5 className="font-semibold text-xs text-green-900">Step 3: Document Creation</h5>
                        </div>
                        <p className="text-xs text-green-700 mb-2">Write 510(k) with AI assistance</p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full text-xs bg-white hover:bg-green-50"
                          onClick={() => setActiveTab('document-editor')}
                          data-testid="banner-step3-editor"
                        >
                          <Edit3 className="h-3 w-3 mr-1" />
                          Document Editor
                        </Button>
                      </div>
                      
                      <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-3 rounded-lg border border-teal-200">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</div>
                          <h5 className="font-semibold text-xs text-teal-900">Step 4: Submission</h5>
                        </div>
                        <p className="text-xs text-teal-700 mb-2">Compliance check & finalize</p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full text-xs bg-white hover:bg-teal-50"
                          onClick={() => setActiveTab('compliance')}
                          data-testid="banner-step4-compliance"
                        >
                          <CheckSquare className="h-3 w-3 mr-1" />
                          FDA Compliance
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      New to 510(k)?
                    </span>
                    <Button 
                      variant="link" 
                      className="h-auto p-0 text-xs text-blue-600"
                      onClick={() => setActiveTab('fda-guidance')}
                      data-testid="banner-goto-guidance"
                    >
                      Read FDA Guidance
                    </Button>
                    <span className="text-gray-400">•</span>
                    <Button 
                      variant="link" 
                      className="h-auto p-0 text-xs text-blue-600"
                      onClick={() => setActiveTab('assistant')}
                      data-testid="banner-goto-assistant"
                    >
                      Ask AI Assistant
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-800">
                FDA Regulatory Pathway Analyzer
              </CardTitle>
              <CardDescription>
                Determine the appropriate regulatory submission pathway for your medical device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Device Characteristics Input */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="device-risk" className="text-sm font-medium">
                    Device Risk Level
                  </Label>
                  <Select 
                    onValueChange={(value) => {
                      setPathwayAnalysis(prev => ({ ...prev, riskLevel: value }));
                    }}
                    data-testid="select-risk-level"
                  >
                    <SelectTrigger id="device-risk">
                      <SelectValue placeholder="Select risk level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Risk (Class I)</SelectItem>
                      <SelectItem value="moderate">Moderate Risk (Class II)</SelectItem>
                      <SelectItem value="high">High Risk (Class III)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="predicate-exists" className="text-sm font-medium">
                    Similar Device on Market?
                  </Label>
                  <Select 
                    onValueChange={(value) => {
                      setPathwayAnalysis(prev => ({ ...prev, predicateExists: value }));
                    }}
                    data-testid="select-predicate-exists"
                  >
                    <SelectTrigger id="predicate-exists">
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes - Similar device exists</SelectItem>
                      <SelectItem value="no">No - Novel device</SelectItem>
                      <SelectItem value="unsure">Unsure - Need to research</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="device-type" className="text-sm font-medium">
                    Device Type
                  </Label>
                  <Select 
                    onValueChange={(value) => {
                      setPathwayAnalysis(prev => ({ ...prev, deviceType: value }));
                    }}
                    data-testid="select-device-type"
                  >
                    <SelectTrigger id="device-type">
                      <SelectValue placeholder="Select device type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="implantable">Implantable</SelectItem>
                      <SelectItem value="life-sustaining">Life-Sustaining/Life-Supporting</SelectItem>
                      <SelectItem value="diagnostic">In Vitro Diagnostic</SelectItem>
                      <SelectItem value="therapeutic">Therapeutic</SelectItem>
                      <SelectItem value="monitoring">Monitoring/Measurement</SelectItem>
                      <SelectItem value="surgical">Surgical Instrument</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="intended-use-risk" className="text-sm font-medium">
                    Intended Use Risk
                  </Label>
                  <Select 
                    onValueChange={(value) => {
                      setPathwayAnalysis(prev => ({ ...prev, intendedUseRisk: value }));
                    }}
                    data-testid="select-intended-use-risk"
                  >
                    <SelectTrigger id="intended-use-risk">
                      <SelectValue placeholder="Select risk level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal patient risk</SelectItem>
                      <SelectItem value="moderate">Moderate patient risk</SelectItem>
                      <SelectItem value="significant">Significant patient risk</SelectItem>
                      <SelectItem value="critical">Critical - life threatening if fails</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Analyze Button */}
              <Button
                onClick={async () => {
                  setIsAnalyzingPathway(true);
                  setPmaError(null);
                  
                  try {
                    // Simulate pathway analysis logic
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    // Determine recommended pathway based on inputs
                    const analysis = pathwayAnalysis || {};
                    let recommended = '510(k)';
                    let confidence = 85;
                    let reasons = [];
                    
                    if (analysis.riskLevel === 'high' || analysis.deviceType === 'implantable' || 
                        analysis.deviceType === 'life-sustaining' || analysis.intendedUseRisk === 'critical') {
                      recommended = 'PMA';
                      reasons.push('High-risk device classification');
                      reasons.push('Requires clinical data to demonstrate safety and effectiveness');
                      confidence = 92;
                    } else if (analysis.predicateExists === 'no' && analysis.riskLevel === 'moderate') {
                      recommended = 'De Novo';
                      reasons.push('Novel device without predicate');
                      reasons.push('Moderate risk classification');
                      confidence = 88;
                    } else {
                      reasons.push('Predicate device exists');
                      reasons.push('Can demonstrate substantial equivalence');
                      confidence = 90;
                    }
                    
                    setRecommendedPathway({
                      pathway: recommended,
                      confidence: confidence,
                      reasons: reasons,
                      analysisDate: new Date().toISOString()
                    });
                    
                    toast({
                      title: "Analysis Complete",
                      description: `Recommended pathway: ${recommended} (${confidence}% confidence)`,
                    });
                  } catch (error) {
                    console.error('Pathway analysis error:', error);
                    setPmaError('Failed to analyze pathway. Please try again.');
                    toast({
                      title: "Analysis Failed",
                      description: "Error analyzing regulatory pathway",
                      variant: "destructive"
                    });
                  } finally {
                    setIsAnalyzingPathway(false);
                  }
                }}
                disabled={isAnalyzingPathway || !pathwayAnalysis?.riskLevel}
                className="w-full"
                data-testid="button-analyze-pathway"
              >
                {isAnalyzingPathway ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing Pathway...
                  </>
                ) : (
                  <>
                    <Activity className="mr-2 h-4 w-4" />
                    Analyze Regulatory Pathway
                  </>
                )}
              </Button>

              {/* Results Display */}
              {recommendedPathway && (
                <Card className="border-2 border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-blue-600" />
                      Recommended Pathway: {recommendedPathway.pathway}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-white">
                        Confidence: {recommendedPathway.confidence}%
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Key Factors:</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {recommendedPathway.reasons.map((reason, idx) => (
                          <li key={idx} className="text-sm text-gray-700">{reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-4 flex gap-2">
                      <Button
                        onClick={() => {
                          if (recommendedPathway.pathway === 'PMA') {
                            setActiveTab('pma-search');
                          } else if (recommendedPathway.pathway === '510(k)') {
                            setActiveTab('device-profile');
                          }
                          toast({
                            title: "Starting Submission Process",
                            description: `Navigating to ${recommendedPathway.pathway} workflow`,
                          });
                        }}
                        className="flex-1"
                        data-testid="button-start-submission"
                      >
                        Start {recommendedPathway.pathway} Submission
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Display */}
              {pmaError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{pmaError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // PMA Search Component
    else if (activeTab === 'pma-search') {
      return (
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-800">
                PMA Device Search
              </CardTitle>
              <CardDescription>
                Search FDA Pre-Market Approval database for Class III medical devices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search Form */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="pma-search" className="text-sm font-medium">
                    Search Query
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="pma-search"
                      placeholder="Enter device name, manufacturer, or PMA number..."
                      value={pmaSearchQuery}
                      onChange={(e) => setPmaSearchQuery(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          document.getElementById('pma-search-button')?.click();
                        }
                      }}
                      data-testid="input-pma-search"
                    />
                    <Button
                      id="pma-search-button"
                      onClick={async () => {
                        setIsLoadingPma(true);
                        setPmaError(null);
                        setPmaDevices([]);
                        
                        try {
                          const searchCriteria = {
                            deviceName: pmaSearchQuery,
                            genericName: pmaSearchQuery,
                            manufacturer: pmaSearchQuery
                          };
                          
                          const results = await fdaPMAService.searchPMADevices(searchCriteria);
                          
                          if (results && results.length > 0) {
                            setPmaDevices(results);
                            toast({
                              title: "Search Complete",
                              description: `Found ${results.length} PMA devices`,
                            });
                          } else {
                            setPmaDevices([]);
                            toast({
                              title: "No Results",
                              description: "No PMA devices found matching your search",
                              variant: "default"
                            });
                          }
                        } catch (error) {
                          console.error('PMA search error:', error);
                          setPmaError('Failed to search PMA devices. Please try again.');
                          toast({
                            title: "Search Failed",
                            description: error.message || "Error searching PMA database",
                            variant: "destructive"
                          });
                        } finally {
                          setIsLoadingPma(false);
                        }
                      }}
                      disabled={isLoadingPma || !pmaSearchQuery}
                      data-testid="button-pma-search"
                    >
                      {isLoadingPma ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Search PMA Database
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingPma && (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              )}

              {/* Results Display */}
              {!isLoadingPma && pmaDevices.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Search Results ({pmaDevices.length})</h3>
                    <Badge variant="outline">
                      FDA PMA Database
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {pmaDevices.map((device, idx) => (
                      <Card 
                        key={idx} 
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          const isSelected = selectedPmaDevices.find(d => d.pma_number === device.pma_number);
                          if (isSelected) {
                            setSelectedPmaDevices(selectedPmaDevices.filter(d => d.pma_number !== device.pma_number));
                          } else {
                            setSelectedPmaDevices([...selectedPmaDevices, device]);
                          }
                        }}
                        data-testid={`card-pma-device-${idx}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedPmaDevices.some(d => d.pma_number === device.pma_number)}
                                  onChange={() => {}}
                                  className="h-4 w-4 text-blue-600"
                                  data-testid={`checkbox-pma-${idx}`}
                                />
                                <h4 className="font-medium text-lg">
                                  {device.trade_name || device.generic_name}
                                </h4>
                                <Badge variant="secondary" className="ml-auto">
                                  {device.pma_number}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Applicant:</span>
                                  <p className="font-medium">{device.applicant}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Approval Date:</span>
                                  <p className="font-medium">
                                    {new Date(device.decision_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Product Code:</span>
                                  <p className="font-medium">{device.product_code}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Advisory Committee:</span>
                                  <p className="font-medium">{device.advisory_committee}</p>
                                </div>
                              </div>
                              {device.expedited_review && (
                                <Badge variant="outline" className="bg-yellow-50">
                                  Expedited Review
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const supplements = await fdaPMAService.getPMASupplements(device.pma_number);
                                  setPmaSupplements(prev => ({
                                    ...prev,
                                    [device.pma_number]: supplements
                                  }));
                                  toast({
                                    title: "Supplements Retrieved",
                                    description: `Found ${supplements.total_supplements} supplements for ${device.pma_number}`,
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Error",
                                    description: "Failed to retrieve supplements",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              data-testid={`button-supplements-${idx}`}
                            >
                              View Supplements
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  {selectedPmaDevices.length > 0 && (
                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        onClick={() => {
                          setActiveTab('pma-comparison');
                          toast({
                            title: "Compare Devices",
                            description: `Comparing ${selectedPmaDevices.length} selected devices`,
                          });
                        }}
                        disabled={selectedPmaDevices.length < 2}
                        data-testid="button-compare-devices"
                      >
                        <GitCompare className="mr-2 h-4 w-4" />
                        Compare Selected ({selectedPmaDevices.length})
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setActiveTab('pma-builder');
                        }}
                        data-testid="button-start-pma-submission"
                      >
                        Start PMA Submission
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {pmaError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{pmaError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // PMA Device Comparison Component
    else if (activeTab === 'pma-comparison') {
      return (
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-800">
                PMA Device Comparison
              </CardTitle>
              <CardDescription>
                Compare selected PMA devices side-by-side to analyze similarities and differences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {selectedPmaDevices.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Devices Selected</AlertTitle>
                  <AlertDescription>
                    Please search and select PMA devices from the PMA Search tab to compare.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {/* Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Attribute
                          </th>
                          {selectedPmaDevices.map((device, idx) => (
                            <th 
                              key={idx} 
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              data-testid={`header-device-${idx}`}
                            >
                              Device {idx + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            PMA Number
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              <Badge variant="outline">{device.pma_number}</Badge>
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Trade Name
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 text-sm text-gray-900 font-medium">
                              {device.trade_name}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Generic Name
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 text-sm text-gray-500">
                              {device.generic_name}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Applicant
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 text-sm text-gray-500">
                              {device.applicant}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Approval Date
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {new Date(device.decision_date).toLocaleDateString()}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Product Code
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              <code className="bg-gray-100 px-2 py-1 rounded">
                                {device.product_code}
                              </code>
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Advisory Committee
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 text-sm text-gray-500">
                              {device.advisory_committee}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Expedited Review
                          </td>
                          {selectedPmaDevices.map((device, idx) => (
                            <td key={idx} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {device.expedited_review ? (
                                <Badge variant="outline" className="bg-green-50">Yes</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-gray-50">No</Badge>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Analysis Button */}
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={async () => {
                        setIsLoadingPma(true);
                        try {
                          const analysis = fdaPMAService.analyzePMAComparison(
                            deviceProfile,
                            selectedPmaDevices
                          );
                          setPmaComparisonResults(analysis);
                          toast({
                            title: "Analysis Complete",
                            description: "Device comparison analysis generated",
                          });
                        } catch (error) {
                          toast({
                            title: "Analysis Failed",
                            description: "Error analyzing devices",
                            variant: "destructive"
                          });
                        } finally {
                          setIsLoadingPma(false);
                        }
                      }}
                      disabled={isLoadingPma}
                      data-testid="button-analyze-comparison"
                    >
                      {isLoadingPma ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <BarChart className="mr-2 h-4 w-4" />
                          Generate Similarity Analysis
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedPmaDevices([]);
                        setActiveTab('pma-search');
                      }}
                      data-testid="button-new-search"
                    >
                      New Search
                    </Button>
                  </div>

                  {/* Comparison Results */}
                  {pmaComparisonResults && (
                    <Card className="mt-6 border-blue-200">
                      <CardHeader>
                        <CardTitle className="text-lg">Similarity Analysis Results</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-gray-600">
                          Analyzing: <strong>{pmaComparisonResults.device_profile}</strong>
                        </p>
                        {pmaComparisonResults.comparisons.map((comp, idx) => (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">
                                  {comp.pma_device.trade_name}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  PMA: {comp.pma_device.pma_number}
                                </p>
                              </div>
                              <Badge variant={comp.similarity_score > 0.6 ? "default" : "secondary"}>
                                {Math.round(comp.similarity_score * 100)}% Match
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <p className="text-sm font-medium">Matching Factors:</p>
                              <ul className="list-disc pl-5 text-sm text-gray-600">
                                {comp.matching_factors.map((factor, fidx) => (
                                  <li key={fidx}>{factor}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="mt-2 text-sm text-blue-600">
                              {comp.recommendation}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // PMA Submission Builder Component
    else if (activeTab === 'pma-builder') {
      return (
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-800">
                PMA Submission Builder
              </CardTitle>
              <CardDescription>
                Build your Pre-Market Approval application with FDA requirements guidance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Submission Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pma-device-name">Device Name</Label>
                    <Input
                      id="pma-device-name"
                      placeholder="Enter device name"
                      value={pmaSubmissionData.deviceName || ''}
                      onChange={(e) => setPmaSubmissionData(prev => ({
                        ...prev,
                        deviceName: e.target.value
                      }))}
                      data-testid="input-pma-device-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pma-manufacturer">Manufacturer</Label>
                    <Input
                      id="pma-manufacturer"
                      placeholder="Enter manufacturer name"
                      value={pmaSubmissionData.manufacturer || ''}
                      onChange={(e) => setPmaSubmissionData(prev => ({
                        ...prev,
                        manufacturer: e.target.value
                      }))}
                      data-testid="input-pma-manufacturer"
                    />
                  </div>
                </div>

                {/* PMA Sections */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">PMA Application Sections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { id: 'admin', label: 'Administrative Information', icon: FileText },
                        { id: 'device-desc', label: 'Device Description', icon: Cpu },
                        { id: 'indications', label: 'Indications for Use', icon: ClipboardList },
                        { id: 'marketing', label: 'Marketing History', icon: BarChart },
                        { id: 'summary', label: 'Summary of Safety & Effectiveness', icon: ShieldCheck },
                        { id: 'conformity', label: 'Declaration of Conformity', icon: CheckSquare },
                        { id: 'clinical', label: 'Clinical Investigations', icon: Activity },
                        { id: 'nonclinical', label: 'Non-Clinical Laboratory Studies', icon: HardDrive },
                        { id: 'bibliography', label: 'Bibliography', icon: BookOpen },
                      ].map((section) => (
                        <div key={section.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <section.icon className="h-5 w-5 text-blue-600" />
                            <span className="font-medium">{section.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={pmaSubmissionData[section.id] ? "default" : "outline"}>
                              {pmaSubmissionData[section.id] ? "Complete" : "Pending"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPmaSubmissionData(prev => ({
                                  ...prev,
                                  [section.id]: !prev[section.id]
                                }));
                                toast({
                                  title: "Section Updated",
                                  description: `${section.label} marked as ${!pmaSubmissionData[section.id] ? "complete" : "pending"}`,
                                });
                              }}
                              data-testid={`button-toggle-${section.id}`}
                            >
                              Toggle Status
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Submission Actions */}
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => {
                      const completedSections = Object.keys(pmaSubmissionData).filter(
                        key => pmaSubmissionData[key] === true
                      ).length;
                      
                      if (completedSections < 5) {
                        toast({
                          title: "Incomplete Submission",
                          description: "Please complete all required sections before validation",
                          variant: "destructive"
                        });
                      } else {
                        toast({
                          title: "Validation Successful",
                          description: "Your PMA submission is ready for review",
                        });
                      }
                    }}
                    className="flex-1"
                    data-testid="button-validate-pma"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Validate Submission
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({
                        title: "Draft Saved",
                        description: "Your PMA submission draft has been saved",
                      });
                    }}
                    data-testid="button-save-draft"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Save Draft
                  </Button>
                  <Button
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      toast({
                        title: "Generating PMA Package",
                        description: "Your FDA-compliant PMA submission package is being prepared",
                      });
                    }}
                    data-testid="button-generate-pma"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generate PMA Package
                  </Button>
                </div>

                {/* Guidance Panel */}
                <Alert className="mt-6">
                  <Info className="h-4 w-4" />
                  <AlertTitle>PMA Submission Guidance</AlertTitle>
                  <AlertDescription className="mt-2 space-y-2">
                    <p>The PMA application must demonstrate reasonable assurance of safety and effectiveness for the device's intended use.</p>
                    <ul className="list-disc pl-5 text-sm">
                      <li>Clinical data is typically required to support PMA approval</li>
                      <li>Manufacturing information must comply with Quality System Regulation</li>
                      <li>Labeling must meet all FDA requirements</li>
                      <li>Post-approval studies may be required</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // DOCUMENT EDITOR MUST BE CHECKED FIRST - BEFORE 510k GENERAL CHECK
    else if (activeTab === 'document-editor' && documentType === '510k') {
      console.log('🔥 RENDERING DOCUMENT EDITOR FOR 510(k)');
      return (
        <div className="p-6 space-y-6">
          {/* Auto-Population Status Banner */}
          <Card className="bg-blue-50 border-blue-200 context-banner-enter">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-1">Document Editor - Pre-Populated from Your Intake Data</h4>
                  <p className="text-sm text-blue-800 mb-2">
                    All FDA 510(k) document templates have been automatically populated with your device information from Step 1.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white rounded p-2 border border-blue-200">
                      <div className="font-semibold text-blue-900 mb-1">Device Info ✓</div>
                      <div className="text-blue-700">{deviceProfile?.deviceName || 'Not set'}</div>
                    </div>
                    <div className="bg-white rounded p-2 border border-blue-200">
                      <div className="font-semibold text-blue-900 mb-1">Manufacturer ✓</div>
                      <div className="text-blue-700">{deviceProfile?.manufacturer || 'Not set'}</div>
                    </div>
                    <div className="bg-white rounded p-2 border border-blue-200">
                      <div className="font-semibold text-blue-900 mb-1">Product Code ✓</div>
                      <div className="text-blue-700">{deviceProfile?.productCode || 'Not set'}</div>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold mt-2">
                    💡 Simply edit the pre-filled sections or use the AI Writing Helper to enhance content!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <MedicalDeviceDocumentEditor
            documentType="cerv2_510k"
            selectedSection={selectedSection} // Pass section selected from vault
          deviceProfile={deviceProfile || {
            deviceName: deviceName,
            manufacturer: manufacturer,
            intendedUse: intendedUse,
            productCode: productCode,
            regulationNumber: regulationNumber,
            predicateDevice: selectedPredicate?.k_number,
            predicateManufacturer: selectedPredicate?.applicant,
            mdClass: deviceClass,
            udi: deviceUdi,
            description: deviceProfile?.description || '',
            technicalSpecifications: deviceProfile?.technicalSpecifications || ''
          }}
          predicateDevices={predicateDevices}
          onSectionSaved={async (section) => {
            // Invalidate React Query cache to refresh vault immediately
            await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });
            
            toast({
              title: 'Section Saved',
              description: `${section.section_number} ${section.section_title} saved - Vault refreshed`,
            });
          }}
          literatureResults={literatureResults}
          documentId={k510DocumentId || `510K-${Date.now()}`}
          existingContent={loadSavedState(`document_content_510k`, '')}
          onSave={(data) => {
            toast({
              title: 'FDA 510(k) Document Saved',
              description: 'Your submission has been saved successfully',
            });
            
            if (!k510DocumentId && data.documentId) {
              setK510DocumentId(data.documentId);
            }
          }}
          onExport={(format) => {
            toast({
              title: `Export ${format.toUpperCase()} Successful`,
              description: 'Your 510(k) document has been exported',
            });
          }}
          readOnly={false}
          />
        </div>
      );
    }
    
    // Document Vault - handle for BOTH CER and 510k
    else if (activeTab === 'document-vault') {
      return (
        <EnhancedDocumentVault
          documentType={documentType}
          projectId={currentProjectId}
          onSectionSelect={(section) => {
            setSelectedSection(section);
            setActiveTab('document-editor');
            toast({
              title: 'Section Opened',
              description: `Editing: ${section.section_number} ${section.section_title}`,
            });
          }}
          onFileClick={(file) => {
            toast({
              title: 'Document Selected',
              description: `Opening ${file.name}`,
            });
          }}
          onUpload={() => {
            toast({
              title: 'Upload Document',
              description: 'Use the Import tab to upload Word or PDF documents',
            });
          }}
        />
      );
    }
    
    // Device Data Center - handle for 510k
    else if (activeTab === 'device-data-center') {
      return (
        <div className="p-6">
          <DeviceDataCenterEnhanced 
            projectId={deviceProfile?.id?.toString()}
            workflowStage={workflowStep}
            mode="full"
          />
        </div>
      );
    }
    
    // ============================================================================
    // STAGE 0: SETUP - Device Intake & Predicate Search
    // ============================================================================
    
    // Predicate Finder - FDA workflow tab
    else if (activeTab === 'predicates') {
      console.log('[CERV2Page] Rendering predicates tab:', {
        activeTab,
        deviceProfile,
        PredicateFinderPanelExists: !!PredicateFinderPanel
      });
      
      return (
        <div className="p-6 space-y-6" data-testid="predicate-finder-content">
          <Card className="bg-purple-50 border-purple-200 context-banner-enter">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Predicate & Regulation Finder</h4>
                  <p className="text-sm text-purple-800">
                    Search FDA's database for cleared devices similar to yours. Predicate devices are previously 
                    cleared products with similar intended use and technological characteristics. Finding strong 
                    predicates is essential for demonstrating substantial equivalence.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Prerequisites:</strong> Device profile from Device Intake (device name, product code, intended use). 
                    Search uses your product code, regulation number, and device description to find relevant predicates.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <PredicateFinderPanel
            deviceProfile={deviceProfile}
            setDeviceProfile={newProfile => {
              if (newProfile) {
                setDeviceProfile(newProfile);
              }
            }}
            documentId={deviceProfile?.id}
            onPredicatesFound={handlePredicatesComplete}
          />
        </div>
      );
    }

    // ============================================================================
    // STAGE 1: STRATEGY - Substantial Equivalence Development
    // ============================================================================
    
    else if (activeTab === 'se-strategy') {
      return (
        <div className="p-6 space-y-6" data-testid="se-strategy-content">
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <GitCompare className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-orange-900 mb-1">Substantial Equivalence Strategy</h4>
                  <p className="text-sm text-orange-800">
                    Document your strategy for demonstrating substantial equivalence to the predicate device(s).
                    Define technological characteristics, intended use comparison, and testing approach.
                  </p>
                  <div className="mt-2 text-xs text-orange-700">
                    <strong>Prerequisites:</strong> Predicate device(s) selected from Stage 0.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EquivalenceBuilderPanel
            deviceProfile={deviceProfile}
            setDeviceProfile={newProfile => {
              if (newProfile) {
                setDeviceProfile(newProfile);
              }
            }}
            documentId={deviceProfile?.id || k510DocumentId}
            onComplete={(data) => {
              setDeviceProfile({ ...deviceProfile, seStrategy: data });
              toast({
                title: 'SE Strategy Saved',
                description: 'Your substantial equivalence strategy has been documented.',
              });
            }}
            predicateDevices={predicateDevices}
            selectedLiterature={selectedLiterature}
          />
        </div>
      );
    }

    // ============================================================================
    // STAGE 2: EVIDENCE PLAN - Standards Matrix & Test Planning
    // ============================================================================
    
    else if (activeTab === 'standards-matrix') {
      return (
        <div className="p-6 space-y-6" data-testid="standards-matrix-content">
          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-indigo-900 mb-1">Standards Matrix & Declarations of Conformity</h4>
                  <p className="text-sm text-indigo-800">
                    Select applicable consensus standards (IEC, ISO, ASTM, etc.) and create Declarations of Conformity.
                    This defines the regulatory framework for your testing strategy.
                  </p>
                  <div className="mt-2 text-xs text-indigo-700">
                    <strong>What to include:</strong> ISO 10993 (biocompatibility), IEC 60601 (electrical safety), 
                    IEC 62304 (software), ISO 14971 (risk management), and product-specific standards.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Standards Selection Matrix</CardTitle>
              <CardDescription>Select applicable regulatory standards for your device</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-indigo-300" />
                <p className="mb-2">Standards Matrix Editor</p>
                <p className="text-sm">Coming soon - Select and document consensus standards compliance</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    else if (activeTab === 'test-plan') {
      return (
        <div className="p-6 space-y-6" data-testid="test-plan-content">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Activity className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Integrated Test Plan</h4>
                  <p className="text-sm text-purple-800">
                    Create a comprehensive test protocol detailing all verification and validation testing.
                    Links standards from Standards Matrix to specific test methods and acceptance criteria.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Prerequisites:</strong> Standards Matrix must be completed to define testing scope.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Protocol Development</CardTitle>
              <CardDescription>Define test methods, acceptance criteria, and protocols</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-3 text-purple-300" />
                <p className="mb-2">Test Plan Editor</p>
                <p className="text-sm">Coming soon - Create detailed test protocols and acceptance criteria</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // ============================================================================
    // STAGE 3: EVIDENCE - Testing Artifacts & Reports
    // ============================================================================
    
    else if (activeTab === 'evidence-matrix') {
      // Calculate coverage percentages based on uploaded documents
      const calculateCoverage = (category) => {
        // This would normally check actual uploaded files in the vault
        // For now, use deviceProfile data as proxy
        switch(category) {
          case 'bench':
            return deviceProfile?.benchTestReports ? 100 : 0;
          case 'biocompatibility':
            return deviceProfile?.biocompTestReports ? 100 : 0;
          case 'software':
            return (deviceProfile?.software || deviceProfile?.toggles?.hasSoftware) ? 
              (deviceProfile?.softwareDocs ? 100 : 0) : null;
          case 'cybersecurity':
            return (deviceProfile?.cybersecurity || deviceProfile?.toggles?.isCyberDevice) ?
              (deviceProfile?.cyberDocs ? 100 : 0) : null;
          case 'clinical':
            return (deviceProfile?.clinicalData || deviceProfile?.toggles?.hasClinicalData) ?
              (deviceProfile?.clinicalReports ? 100 : 0) : null;
          case 'sterility':
            return (deviceProfile?.sterilization || deviceProfile?.toggles?.isSterile) ?
              (deviceProfile?.sterilityReports ? 100 : 0) : null;
          case 'emc':
            return deviceProfile?.emcReports ? 100 : 0;
          case 'usability':
            return deviceProfile?.usabilityReports ? 100 : 0;
          case 'labeling':
            return deviceProfile?.labelingDocs ? 100 : 0;
          default:
            return 0;
        }
      };
      
      // Evidence categories with conditional items
      const evidenceCategories = [
        { id: 'bench', name: 'Bench Testing', icon: TestTube, color: 'green', required: true },
        { id: 'biocompatibility', name: 'Biocompatibility', icon: Heart, color: 'red', required: true },
        { id: 'emc', name: 'EMC & Electrical Safety', icon: Zap, color: 'yellow', required: true },
        { id: 'usability', name: 'Usability/HF', icon: Users, color: 'purple', required: true },
        { id: 'labeling', name: 'Labeling', icon: FileText, color: 'blue', required: true },
        { id: 'software', name: 'Software V&V', icon: Code, color: 'cyan', 
          required: deviceProfile?.software || deviceProfile?.toggles?.hasSoftware },
        { id: 'cybersecurity', name: 'Cybersecurity', icon: Lock, color: 'gray',
          required: deviceProfile?.cybersecurity || deviceProfile?.toggles?.isCyberDevice },
        { id: 'sterility', name: 'Sterility', icon: Shield, color: 'indigo',
          required: deviceProfile?.sterilization || deviceProfile?.toggles?.isSterile },
        { id: 'clinical', name: 'Clinical Data', icon: FileText, color: 'teal',
          required: deviceProfile?.clinicalData || deviceProfile?.toggles?.hasClinicalData }
      ].filter(cat => cat.required !== false);
      
      // Calculate overall coverage
      const coverages = evidenceCategories.map(cat => calculateCoverage(cat.id)).filter(c => c !== null);
      const overallCoverage = coverages.length > 0 ? 
        Math.round(coverages.reduce((a, b) => a + b, 0) / coverages.length) : 0;
      
      // Update device profile with coverage
      if (deviceProfile?.evidenceCoverage !== overallCoverage / 100) {
        setDeviceProfile({ ...deviceProfile, evidenceCoverage: overallCoverage / 100 });
      }
      
      return (
        <div className="p-6 space-y-6" data-testid="evidence-matrix-content">
          {/* Coverage Overview Card */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <BarChart className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-1">Evidence Matrix Coverage Dashboard</h4>
                  <p className="text-sm text-blue-800">
                    Track your testing and documentation progress across all required evidence categories.
                    Gate requirement: ≥80% overall coverage to proceed to Stage 4.
                  </p>
                  
                  {/* Overall Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-blue-900">Overall Coverage</span>
                      <span className="text-sm font-bold text-blue-900">{overallCoverage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          overallCoverage >= 80 ? 'bg-green-600' : 
                          overallCoverage >= 60 ? 'bg-yellow-500' : 
                          overallCoverage >= 40 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${overallCoverage}%` }}
                        data-testid="overall-coverage-bar"
                      />
                    </div>
                    <div className="mt-1 text-xs text-blue-700">
                      {overallCoverage >= 80 ? 
                        '✅ Gate requirement met - Ready for Stage 4' : 
                        `⚠️ Need ${80 - overallCoverage}% more coverage to proceed`}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Individual Category Coverage */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence Category Breakdown</CardTitle>
              <CardDescription>Upload test reports and documentation for each required category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {evidenceCategories.map((category) => {
                  const IconComponent = category.icon;
                  const coverage = calculateCoverage(category.id);
                  const colorClass = `text-${category.color}-600`;
                  const bgColorClass = `bg-${category.color}-50`;
                  
                  return (
                    <div key={category.id} className="border rounded-lg p-4" data-testid={`coverage-${category.id}`}>
                      <div className="flex items-start gap-3">
                        <IconComponent className={`h-5 w-5 ${colorClass} mt-0.5`} />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-medium text-gray-900">{category.name}</h5>
                            <span className={`text-sm font-bold ${coverage === 100 ? 'text-green-600' : 'text-gray-600'}`}>
                              {coverage}%
                            </span>
                          </div>
                          
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${
                                coverage === 100 ? 'bg-green-600' : 
                                coverage > 0 ? 'bg-yellow-500' : 'bg-gray-300'
                              }`}
                              style={{ width: `${coverage}%` }}
                            />
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-600">
                            {coverage === 100 ? 
                              '✅ Complete' : 
                              coverage > 0 ? 
                              '⏳ In Progress' : 
                              '📋 Not Started'}
                          </div>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 text-xs"
                            onClick={() => setActiveTab(category.id === 'emc' ? 'emc-es' : 
                                                     category.id === 'clinical' ? 'clinical-data' :
                                                     category.id)}
                            data-testid={`goto-${category.id}`}
                          >
                            {coverage === 100 ? 'Review' : 'Upload'} Documents →
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Summary Statistics */}
              <div className="mt-6 pt-6 border-t">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {evidenceCategories.filter(cat => calculateCoverage(cat.id) === 100).length}
                    </div>
                    <div className="text-xs text-gray-600">Complete</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {evidenceCategories.filter(cat => {
                        const cov = calculateCoverage(cat.id);
                        return cov > 0 && cov < 100;
                      }).length}
                    </div>
                    <div className="text-xs text-gray-600">In Progress</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-600">
                      {evidenceCategories.filter(cat => calculateCoverage(cat.id) === 0).length}
                    </div>
                    <div className="text-xs text-gray-600">Not Started</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    else if (activeTab === 'bench-testing') {
      return (
        <div className="p-6 space-y-6" data-testid="bench-testing-content">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <TestTube className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 mb-1">Bench / Performance Testing</h4>
                  <p className="text-sm text-green-800">
                    Upload and manage bench test reports, performance testing data, and technical summaries.
                  </p>
                  <div className="mt-2 text-xs text-green-700">
                    <strong>What to upload:</strong> Performance test reports, validation protocols, raw data, statistical analysis.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="bench-testing" />
        </div>
      );
    }
    
    else if (activeTab === 'biocompatibility') {
      return (
        <div className="p-6 space-y-6" data-testid="biocompatibility-content">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-900 mb-1">Biocompatibility Testing</h4>
                  <p className="text-sm text-red-800">
                    Manage ISO 10993 biocompatibility test reports and biological evaluation summaries.
                  </p>
                  <div className="mt-2 text-xs text-red-700">
                    <strong>Required tests:</strong> Cytotoxicity, sensitization, irritation, systemic toxicity (based on ISO 10993-1 matrix).
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="biocompatibility" />
        </div>
      );
    }
    
    else if (activeTab === 'sterility') {
      return (
        <div className="p-6 space-y-6" data-testid="sterility-content">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Sterilization & Shelf Life</h4>
                  <p className="text-sm text-blue-800">
                    Document sterilization validation, shelf-life testing, and packaging validation.
                  </p>
                  <div className="mt-2 text-xs text-blue-700">
                    <strong>Required documentation:</strong> Sterilization validation per ISO 11135/11137, package integrity per ASTM F1980.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="sterility" />
        </div>
      );
    }
    
    else if (activeTab === 'emc-es') {
      return (
        <div className="p-6 space-y-6" data-testid="emc-es-content">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-yellow-900 mb-1">Electrical Safety & EMC</h4>
                  <p className="text-sm text-yellow-800">
                    Upload electrical safety (IEC 60601-1) and electromagnetic compatibility (IEC 60601-1-2) test reports.
                  </p>
                  <div className="mt-2 text-xs text-yellow-700">
                    <strong>Required standards:</strong> IEC 60601-1 (electrical safety), IEC 60601-1-2 (EMC).
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="electrical-emc" />
        </div>
      );
    }
    
    else if (activeTab === 'software') {
      return (
        <div className="p-6 space-y-6" data-testid="software-content">
          <Card className="bg-cyan-50 border-cyan-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Code className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-cyan-900 mb-1">Software Documentation (IEC 62304)</h4>
                  <p className="text-sm text-cyan-800">
                    Document software development lifecycle, verification/validation, and cybersecurity per IEC 62304.
                  </p>
                  <div className="mt-2 text-xs text-cyan-700">
                    <strong>Required documentation:</strong> Software development plan, architecture, V&V protocols, hazard analysis.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="software" />
        </div>
      );
    }
    
    else if (activeTab === 'cybersecurity') {
      return (
        <div className="p-6 space-y-6" data-testid="cybersecurity-content">
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Cybersecurity Documentation</h4>
                  <p className="text-sm text-gray-800">
                    Document cybersecurity risk management, threat modeling, and secure design per FDA guidance.
                  </p>
                  <div className="mt-2 text-xs text-gray-700">
                    <strong>Required documentation:</strong> Cybersecurity management plan, threat analysis, SBOM, secure development.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="cybersecurity" />
        </div>
      );
    }
    
    else if (activeTab === 'usability') {
      return (
        <div className="p-6 space-y-6" data-testid="usability-content">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Usability / Human Factors</h4>
                  <p className="text-sm text-purple-800">
                    Document human factors engineering and usability validation per IEC 62366 and FDA HFE guidance.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Required documentation:</strong> Use-related risk analysis, formative testing, summative validation.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="usability" />
        </div>
      );
    }
    
    else if (activeTab === 'clinical-data') {
      return (
        <div className="p-6 space-y-6" data-testid="clinical-data-content">
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-teal-900 mb-1">Clinical Data</h4>
                  <p className="text-sm text-teal-800">
                    Upload clinical study reports, literature reviews, or clinical data summaries if required.
                  </p>
                  <div className="mt-2 text-xs text-teal-700">
                    <strong>When required:</strong> Novel technology, significant design changes, or FDA requests clinical evidence.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="clinical" />
        </div>
      );
    }

    // ============================================================================
    // STAGE 4: AUTHOR - eSTAR Section Narratives & Forms
    // ============================================================================
    
    else if (activeTab === 'biocomp-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="biocomp-summary-content">
          <Card className="bg-pink-50 border-pink-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Beaker className="h-5 w-5 text-pink-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-pink-900 mb-1">Biocompatibility Summary</h4>
                  <p className="text-sm text-pink-800">
                    Summarize ISO 10993-1 rationale, test matrix, and biocompatibility test results. Auto-populated from Stage 3 biocompatibility evidence.
                  </p>
                  <div className="mt-2 text-xs text-pink-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_biocomp_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="biocompatibility-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_biocomp_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, biocompSummary: data });
              toast({ title: 'Biocompatibility Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'cybersecurity-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="cybersecurity-summary-content">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-900 mb-1">Cybersecurity Summary</h4>
                  <p className="text-sm text-red-800">
                    Document threat model, SBOM, update mechanisms, and vulnerability management. Auto-populated from Stage 3 cybersecurity evidence.
                  </p>
                  <div className="mt-2 text-xs text-red-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_cybersecurity_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="cybersecurity-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_cybersecurity_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, cybersecuritySummary: data });
              toast({ title: 'Cybersecurity Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'emc-es-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="emc-es-summary-content">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-yellow-900 mb-1">Electrical Safety & EMC Summary</h4>
                  <p className="text-sm text-yellow-800">
                    Summarize IEC 60601-1 and 60601-1-2 test results and standards conformities. Auto-populated from Stage 3 EMC/ES evidence.
                  </p>
                  <div className="mt-2 text-xs text-yellow-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_emc_es_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="emc-es-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_emc_es_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, emcEsSummary: data });
              toast({ title: 'Electrical Safety & EMC Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'software-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="software-summary-content">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Code className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Software Summary</h4>
                  <p className="text-sm text-blue-800">
                    Document software level of concern, architecture, and V&V traceability per IEC 62304. Auto-populated from Stage 3 software evidence.
                  </p>
                  <div className="mt-2 text-xs text-blue-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_software_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="software-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_software_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, softwareSummary: data });
              toast({ title: 'Software Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'standards-declarations') {
      return (
        <div className="p-6 space-y-6" data-testid="standards-declarations-content">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Award className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 mb-1">Standards & Declarations of Conformity</h4>
                  <p className="text-sm text-green-800">
                    List all FDA-recognized consensus standards with edition, clauses, and extent of conformity. Auto-populated from Stage 2 standards matrix.
                  </p>
                  <div className="mt-2 text-xs text-green-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_standards_doc
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="standards-declarations"
            documentId={`${deviceProfile?.id || k510DocumentId}_standards_doc`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, standardsDeclarations: data });
              toast({ title: 'Standards & DoCs Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'sterility-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="sterility-summary-content">
          <Card className="bg-cyan-50 border-cyan-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Droplet className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-cyan-900 mb-1">Sterilization & Shelf Life Summary</h4>
                  <p className="text-sm text-cyan-800">
                    Document sterilization method, SAL, pyrogen limits, and packaging integrity/aging. Auto-populated from Stage 3 sterility evidence.
                  </p>
                  <div className="mt-2 text-xs text-cyan-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_sterility_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="sterility-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_sterility_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, sterilitySummary: data });
              toast({ title: 'Sterilization & Shelf Life Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'usability-summary') {
      return (
        <div className="p-6 space-y-6" data-testid="usability-summary-content">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Usability Summary</h4>
                  <p className="text-sm text-purple-800">
                    Provide risk-based justification or summative human factors study summary per IEC 62366. Auto-populated from Stage 3 usability evidence.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Document ID:</strong> {deviceProfile?.id || k510DocumentId}_usability_summary
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="usability-summary"
            documentId={`${deviceProfile?.id || k510DocumentId}_usability_summary`}
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, usabilitySummary: data });
              toast({ title: 'Usability Summary Saved', description: 'Document linked to submission workflow.' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'admin-forms') {
      return (
        <div className="p-6 space-y-6" data-testid="admin-forms-content">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Administrative & Forms</h4>
                  <p className="text-sm text-blue-800">
                    Complete FDA Forms 3514 (User Fee Cover Sheet) and 3601 (Indications Statement). Include cover letter and transmittal letter.
                  </p>
                  <div className="mt-2 text-xs text-blue-700">
                    <strong>Required forms:</strong> FDA 3514, FDA 3601, Cover Letter, Transmittal Letter.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="administrative"
            onSave={(data) => {
              setDeviceProfile({ ...deviceProfile, forms3514: data.form3514, forms3601: data.form3601 });
              toast({ title: 'Administrative Forms Saved' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'indications-for-use') {
      return (
        <div className="p-6 space-y-6" data-testid="indications-content">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 mb-1">Indications for Use (FDA Form 3881)</h4>
                  <p className="text-sm text-green-800">
                    Draft the Indications for Use statement defining intended use, patient population, and clinical application.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="indications"
            onSave={(data) => {
              toast({ title: 'Indications Saved' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'device-description') {
      return (
        <div className="p-6 space-y-6" data-testid="device-description-content">
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Device Description</h4>
                  <p className="text-sm text-gray-800">
                    Comprehensive technical description of device components, materials, specifications, and principles of operation.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="device_description"
            onSave={(data) => {
              toast({ title: 'Device Description Saved' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'se-discussion') {
      return (
        <div className="p-6 space-y-6" data-testid="se-discussion-content">
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <GitCompare className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-orange-900 mb-1">Substantial Equivalence Discussion</h4>
                  <p className="text-sm text-orange-800">
                    Detailed narrative comparing your device to the predicate(s), demonstrating substantial equivalence.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            predicateDevices={predicateDevices}
            section="substantial_equivalence"
            onSave={(data) => {
              toast({ title: 'SE Discussion Saved' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'document-editor') {
      // Render the comprehensive MedicalDeviceDocumentEditor with all 22 FDA sections
      return (
        <MedicalDeviceDocumentEditor
          documentType="cerv2_510k"
          selectedSection={selectedSection}
          deviceProfile={deviceProfile || {
            deviceName: deviceName,
            manufacturer: manufacturer,
            intendedUse: intendedUse,
            productCode: productCode,
            regulationNumber: regulationNumber,
            predicateDevice: selectedPredicate?.k_number,
            predicateManufacturer: selectedPredicate?.applicant,
            mdClass: deviceClass,
            udi: deviceUdi,
            description: deviceProfile?.description || '',
            technicalSpecifications: deviceProfile?.technicalSpecifications || ''
          }}
          predicateDevices={predicateDevices}
          onSectionSaved={async (section) => {
            // Invalidate React Query cache to refresh vault immediately
            await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });
            
            toast({
              title: 'Section Saved',
              description: `${section.section_number} ${section.section_title} saved - Vault refreshed`,
            });
          }}
          literatureResults={literatureResults}
          documentId={k510DocumentId || `510K-${Date.now()}`}
          existingContent={loadSavedState(`document_content_510k`, '')}
          onSave={(data) => {
            toast({
              title: 'FDA 510(k) Document Saved',
              description: 'Your submission has been saved successfully',
            });
            
            if (!k510DocumentId && data.documentId) {
              setK510DocumentId(data.documentId);
            }
          }}
          onExport={(format) => {
            toast({
              title: `Export ${format.toUpperCase()} Successful`,
              description: 'Your 510(k) document has been exported',
            });
          }}
          readOnly={false}
        />
      );
    }
    
    else if (activeTab === 'labeling') {
      return (
        <div className="p-6 space-y-6" data-testid="labeling-content">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Tag className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">Labeling</h4>
                  <p className="text-sm text-purple-800">
                    Upload draft labeling including instructions for use, device labels, and packaging labels.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <EnhancedDocumentVault documentType="510k" projectId={k510DocumentId} category="labeling" />
        </div>
      );
    }
    
    else if (activeTab === 'performance-summaries') {
      return (
        <div className="p-6 space-y-6" data-testid="performance-summaries-content">
          <Card className="bg-cyan-50 border-cyan-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <BarChart className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-cyan-900 mb-1">Performance Testing Summaries</h4>
                  <p className="text-sm text-cyan-800">
                    Summarize all verification and validation testing performed, referencing test reports from Stage 3.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="performance_testing"
            onSave={(data) => {
              toast({ title: 'Performance Summaries Saved' });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === '510k-summary') {
      // XOR validation state - track user's selection between Summary or Statement
      const [summaryType, setSummaryType] = useState(deviceProfile?.summaryType || 'summary');
      
      return (
        <div className="p-6 space-y-6" data-testid="510k-summary-content">
          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-indigo-900 mb-1">510(k) Summary or Statement</h4>
                  <p className="text-sm text-indigo-800">
                    Create a 510(k) Summary (public) or 510(k) Statement (confidential). Summary is recommended.
                  </p>
                  <div className="mt-2 text-xs text-indigo-700">
                    <strong>FDA Requirement:</strong> You must select either a Summary (21 CFR 807.92) OR a Statement (21 CFR 807.93), not both.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* XOR Selection - Radio buttons to enforce mutual exclusivity */}
          <Card>
            <CardHeader>
              <CardTitle>Select Document Type</CardTitle>
              <CardDescription>Choose one required document type for your 510(k) submission</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="radio"
                    id="summary-option"
                    name="summary-type"
                    value="summary"
                    checked={summaryType === 'summary'}
                    onChange={(e) => {
                      setSummaryType(e.target.value);
                      setDeviceProfile({ ...deviceProfile, summaryType: 'summary', statementType: null });
                    }}
                    className="mt-1"
                    data-testid="radio-summary"
                  />
                  <label htmlFor="summary-option" className="cursor-pointer">
                    <div>
                      <div className="font-medium">510(k) Summary (21 CFR 807.92)</div>
                      <div className="text-sm text-gray-600">
                        Public document summarizing safety and effectiveness. Recommended for transparency.
                        Released to public after clearance.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="flex items-start space-x-3">
                  <input
                    type="radio"
                    id="statement-option"
                    name="summary-type"
                    value="statement"
                    checked={summaryType === 'statement'}
                    onChange={(e) => {
                      setSummaryType(e.target.value);
                      setDeviceProfile({ ...deviceProfile, summaryType: null, statementType: 'statement' });
                    }}
                    className="mt-1"
                    data-testid="radio-statement"
                  />
                  <label htmlFor="statement-option" className="cursor-pointer">
                    <div>
                      <div className="font-medium">510(k) Statement (21 CFR 807.93)</div>
                      <div className="text-sm text-gray-600">
                        Certifies that a summary will be provided upon request. Keeps information confidential.
                        Protects proprietary information.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              
              {/* Visual indicator of current selection */}
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="text-sm font-medium text-blue-900">
                  Current Selection: {summaryType === 'summary' ? '510(k) Summary' : '510(k) Statement'}
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section={summaryType} // Pass either 'summary' or 'statement'
            documentType={summaryType === 'summary' ? '807.92' : '807.93'}
            onSave={(data) => {
              const updatedProfile = {
                ...deviceProfile,
                summaryType: summaryType,
                [summaryType === 'summary' ? 'summary807_92' : 'statement807_93']: data
              };
              setDeviceProfile(updatedProfile);
              toast({ 
                title: summaryType === 'summary' ? '510(k) Summary Saved' : '510(k) Statement Saved',
                description: `Document type ${summaryType === 'summary' ? '21 CFR 807.92' : '21 CFR 807.93'} has been saved.`
              });
            }}
          />
        </div>
      );
    }
    
    else if (activeTab === 'truthful-accurate') {
      return (
        <div className="p-6 space-y-6" data-testid="truthful-accurate-content">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-900 mb-1">Truthful & Accurate Statement</h4>
                  <p className="text-sm text-red-800">
                    Regulatory certification that all information in the 510(k) is truthful and accurate.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ESTARBuilderPanel 
            deviceProfile={deviceProfile}
            section="truthful_accurate"
            onSave={(data) => {
              toast({ title: 'Truthful & Accurate Statement Saved' });
            }}
          />
        </div>
      );
    }

    // ============================================================================
    // STAGE 5: eSTAR & RTA - Assembly and Validation
    // ============================================================================
    
    else if (activeTab === 'estar-assembly') {
      return (
        <div className="p-6 space-y-6" data-testid="estar-assembly-content">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">eSTAR Package Assembly</h4>
                  <p className="text-sm text-blue-800">
                    Compile all sections and documents into an FDA eSTAR-compliant package structure.
                  </p>
                  <div className="mt-2 text-xs text-blue-700">
                    <strong>Prerequisites:</strong> All Stage 4 authoring sections must be complete.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>eSTAR Package Compiler</CardTitle>
              <CardDescription>Assemble submission into FDA eSTAR format</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-3 text-blue-300" />
                <p className="mb-2">eSTAR Assembly Engine</p>
                <p className="text-sm">Coming soon - Automated eSTAR package generation</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    else if (activeTab === 'rta-check') {
      return (
        <div className="p-6 space-y-6" data-testid="rta-check-content">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-900 mb-1">RTA (Refuse to Accept) Pre-Check</h4>
                  <p className="text-sm text-green-800">
                    Validate your submission against FDA's RTA checklist to avoid submission rejection.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <RTAChecklistPanel 
            deviceProfile={deviceProfile}
            onComplete={(score) => {
              setDeviceProfile({ ...deviceProfile, rtaScore: score });
              toast({ 
                title: 'RTA Check Complete',
                description: `Your submission scored ${Math.round(score * 100)}% - ${score >= 0.9 ? 'Ready to submit!' : 'Address issues before submitting'}`
              });
            }}
          />
        </div>
      );
    }

    // ============================================================================
    // STAGE 6: SUBMIT & AI - Portal Submission and Tracking
    // ============================================================================
    
    else if (activeTab === 'fda-forms') {
      return (
        <div className="p-6 space-y-6" data-testid="fda-forms-content">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-purple-900 mb-1">SMART Forms System</h4>
                  <p className="text-sm text-purple-800">
                    Comprehensive FDA SMART Forms system with 30+ forms for 510(k), PMA, and special submissions.
                    All forms feature intelligent auto-population from the Medical Device & Diagnostics Regulatory Module workflow data, AI-powered field suggestions,
                    and real-time synchronization across all stages.
                  </p>
                  <div className="mt-2 text-xs text-purple-700">
                    <strong>Features:</strong> Auto-generation • Smart validation • Batch processing • Form dependencies • Cross-reference mapping
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {deviceProfile?.id ? (
            <SmartFormsManager projectId={deviceProfile.id.toString()} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="mb-2">No Project Selected</p>
                  <p className="text-sm">Complete the Device Intake Form to start generating FDA forms</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      );
    }
    
    else if (activeTab === 'submission') {
      return (
        <div className="p-6 space-y-6" data-testid="submission-content">
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-teal-900 mb-1">eSTAR Portal Submission</h4>
                  <p className="text-sm text-teal-800">
                    Submit your completed 510(k) package to FDA via the eSTAR portal.
                  </p>
                  <div className="mt-2 text-xs text-teal-700">
                    <strong>Prerequisites:</strong> RTA score ≥90%, all required sections complete.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submission Portal</CardTitle>
              <CardDescription>Upload and submit to FDA eSTAR</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Send className="h-12 w-12 mx-auto mb-3 text-teal-300" />
                <p className="mb-2">eSTAR Submission Interface</p>
                <p className="text-sm">Coming soon - Direct FDA portal integration</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    else if (activeTab === 'ai-tracking') {
      return (
        <div className="p-6 space-y-6" data-testid="ai-tracking-content">
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 mb-1">Interactive Review / AI Tracking</h4>
                  <p className="text-sm text-amber-800">
                    Track your submission status and respond to FDA interactive review requests.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <FDATimelineTracker 
            deviceProfile={deviceProfile}
            submissionId={deviceProfile?.submissionId}
          />
        </div>
      );
    }

    // Special handling for equivalence tab outside of workflow steps
    else if (activeTab === 'equivalence') {

      try {
        return (
          <div className="p-4 space-y-4">
            {/* Display literature visualization if literature results exist */}
            {literatureResults.length > 0 && (
              <div className="mb-6">
                <LiteratureVisualizationPanel
                  literatureData={literatureResults}
                  selectedItems={selectedLiterature}
                  onSelectItem={handleLiteratureSelect}
                  deviceProfile={deviceProfile}
                />
              </div>
            )}

            <EquivalenceBuilderPanel
              deviceProfile={deviceProfile}
              setDeviceProfile={newProfile => {
                // Just save the updated device profile
                if (newProfile) {
                  setDeviceProfile(newProfile);
                }
              }}
              documentId={deviceProfile?.id || k510DocumentId}
              onComplete={handleEquivalenceComplete}
              predicateDevices={predicateDevices}
              selectedLiterature={selectedLiterature}
            />
          </div>
        );
      } catch (error) {
        console.error('[CERV2 Content] Error rendering Equivalence tab:', error);
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <h3 className="text-lg font-medium text-red-700">Error Loading Equivalence Tab</h3>
            <p className="mt-2 text-red-600">
              There was an error loading the Substantial Equivalence tab. Please try refreshing the
              page.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-4"
              onClick={() => {
                setActiveTab('predicates');
                setTimeout(() => setActiveTab('equivalence'), 500);
              }}
            >
              Retry Loading
            </Button>
          </div>
        );
      }
    }

    // CER functionality disabled - focusing on 510(k) workflow only
    // All CER-related tabs have been removed to prevent confusion
    else if (activeTab === 'compliance') {
      return (
        <ComplianceScorePanel
          documentId={documentType === 'cer' ? cerDocumentId : k510DocumentId}
          documentType={documentType}
          sections={sections}
          deviceProfile={deviceProfile}
          predicateDevices={predicateDevices}
          equivalenceData={equivalenceData}
        />
      );
    // CER Assistant disabled
    } else if (activeTab === 'documents') {
      // Support both CER and 510k documents in the vault
      const currentProject = allProjects.find(p => p.id === currentProjectId);
      return (
        <DocumentVaultPanel
          documentType={documentType}
          jobId={documentType === 'cer' ? cerDocumentId : k510DocumentId}
          position="left"
          isOpen={true}
          projectId={currentProjectId}
          attachedDocuments={currentProject?.attachedDocuments || []}
          onAttachDocument={(documentId) => {
            if (!currentProjectId) {
              toast({
                title: 'No Project Selected',
                description: 'Please create or select a project first',
                variant: 'destructive',
              });
              return;
            }
            
            const updatedProjects = allProjects.map(p => {
              if (p.id === currentProjectId) {
                const alreadyAttached = p.attachedDocuments?.includes(documentId);
                return {
                  ...p,
                  attachedDocuments: alreadyAttached
                    ? p.attachedDocuments.filter(id => id !== documentId)
                    : [...(p.attachedDocuments || []), documentId],
                  updatedAt: new Date().toISOString(),
                };
              }
              return p;
            });
            
            setAllProjects(updatedProjects);
            localStorage.setItem('cerv2_all_projects', JSON.stringify(updatedProjects));
            
            const isAttaching = !currentProject?.attachedDocuments?.includes(documentId);
            toast({
              title: isAttaching ? 'Document Attached' : 'Document Detached',
              description: isAttaching 
                ? 'Document successfully attached to submission'
                : 'Document removed from submission',
            });
          }}
        />
      );
    } 
    // CER data retrieval disabled
    else if (activeTab === 'equivalence') {
      // Support both CER and 510k document types for the equivalence tab
      return (
        <EquivalenceBuilderPanel
          deviceProfile={deviceProfile}
          documentId={documentType === 'cer' ? cerDocumentId : k510DocumentId}
          predicateDevices={predicateDevices}
          selectedLiterature={selectedLiterature}
          onComplete={handleEquivalenceComplete}
        />
      );
    // All CER-specific tabs have been disabled to focus on 510(k) workflow
    } else if (activeTab === 'import') {
      // Document Import Panel for Word/PDF files
      return (
        <DocumentImportPanel
          onImportComplete={(data) => {
            toast({
              title: 'Import Complete',
              description: `Successfully imported ${data.fileName}`,
            });
          }}
          onContentExtracted={(content) => {
            // Pass content to document editor if needed
            console.log('Content extracted:', content);
          }}
        />
      );
    } else if (activeTab === 'rta-checklist') {
      // RTA Checklist Panel
      return (
        <RTAChecklistPanel
          documentId={documentType === '510k' ? k510DocumentId : null}
          projectId={currentProjectId}
          deviceProfile={deviceProfile}
          onChecklistUpdate={(data) => {
            console.log('RTA Checklist updated:', data);
          }}
          onValidationComplete={(isValid) => {
            toast({
              title: isValid ? 'RTA Requirements Met' : 'RTA Issues Found',
              description: isValid 
                ? 'Your submission meets FDA RTA requirements' 
                : 'Please address the identified issues',
              variant: isValid ? 'default' : 'destructive',
            });
          }}
        />
      );
    } else if (activeTab === 'fda-timeline') {
      // FDA Day 1-100 Timeline Tracker
      return (
        <FDATimelineTracker
          submissionId={k510DocumentId}
          projectId={currentProjectId}
          submissionDate={localStorage.getItem(`fda_submission_date_${currentProjectId}`)}
          reviewType="traditional"
          onMilestoneReached={(milestone) => {
            toast({
              title: `FDA Milestone: Day ${milestone.day}`,
              description: milestone.title,
              variant: milestone.critical ? 'destructive' : 'default',
            });
          }}
          onTimelineUpdate={(data) => {
            console.log('FDA Timeline updated:', data);
          }}
        />
      );
    } 
    else if (activeTab === 'submission') {
      // Final Submission Panel
      return (
        <div className="p-6 space-y-6">
          <Card className="bg-teal-50 border-teal-200 context-banner-enter">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-teal-900 mb-1">Final Submission Package</h4>
                  <p className="text-sm text-teal-800">
                    Review and finalize your complete 510(k) submission package. Ensure all required documents 
                    are complete, validated, and ready for FDA submission.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {deviceProfile && deviceProfile.id ? (
            <ReportGenerator
              deviceProfile={deviceProfile}
              documentId={deviceProfile.id}
              exportTimestamp={new Date().toISOString()}
              draftStatus={(compliance && compliance.status) ? compliance.status : 'draft'}
              setDraftStatus={setDraftStatus}
              sections={Array.isArray(sections) ? sections : []}
              onSubmissionReady={handleSubmissionReady}
            />
          ) : (
            <div className="text-center p-8">
              <p className="text-gray-600">Please complete device profile before generating submission package.</p>
            </div>
          )}
        </div>
      );
    }
    else if (activeTab === 'fda-guidance') {
      // FDA Guidance and Resources
      return (
        <div className="p-6 space-y-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-3">FDA 510(k) Guidance Documents</h4>
                  <div className="space-y-4 text-sm text-blue-800">
                    <div>
                      <h5 className="font-medium mb-2">Key Guidance Documents:</h5>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>The 510(k) Program: Evaluating Substantial Equivalence in Premarket Notifications</li>
                        <li>Refuse to Accept Policy for 510(k)s</li>
                        <li>Format for Traditional and Abbreviated 510(k)s</li>
                        <li>Deciding When to Submit a 510(k) for a Change to an Existing Device</li>
                        <li>FDA and Industry Actions on Premarket Notification (510(k)) Submissions</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium mb-2">Helpful Resources:</h5>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>FDA 510(k) Database - Search cleared devices</li>
                        <li>Product Classification Database</li>
                        <li>Device Advice: Comprehensive Regulatory Assistance</li>
                        <li>eSubmitter - FDA's electronic submission software</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    // OLD DUPLICATE CODE REMOVED - NOW HANDLED EARLIER IN FUNCTION
    else {
      // Default to showing the 510(k) workflow overview
      return (
        <div className="p-6">
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-6 w-6 text-blue-600" />
                FDA 510(k) Submission Workflow
              </CardTitle>
              <CardDescription className="text-blue-700">
                Complete 7-stage gated process for FDA 510(k) submission
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 0</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Setup</p>
                    <p className="text-sm text-gray-600">Device intake and predicate analysis</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 1</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Strategy</p>
                    <p className="text-sm text-gray-600">Regulatory pathway determination</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 2</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Evidence Plan</p>
                    <p className="text-sm text-gray-600">Testing and validation strategy</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 3</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Evidence</p>
                    <p className="text-sm text-gray-600">Collect testing data and reports</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 4</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Author</p>
                    <p className="text-sm text-gray-600">Write submission documents</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 5</Badge>
                  <div className="flex-1">
                    <p className="font-medium">eSTAR & RTA</p>
                    <p className="text-sm text-gray-600">Review and acceptance criteria</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100">
                  <Badge className="bg-blue-100 text-blue-700">Stage 6</Badge>
                  <div className="flex-1">
                    <p className="font-medium">Submit & AI</p>
                    <p className="text-sm text-gray-600">Portal submission and tracking</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-blue-200">
                <Button 
                  onClick={() => setActiveTab('device-intake')} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Start Stage 0: Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
  };

  // Simple navigation tab rendering function
  const renderNavigation = () => {
    // Define 510k specific tab groups if the document type is 510k
    if (documentType === '510k') {
      // Note: isTabCompleted is now defined at component level for reusability
      // FDA eSTAR-compliant 7-Stage Workflow Structure
      const k510TabGroups = [
        // Stage 0: Setup - Project intake and predicate search
        {
          label: 'Stage 0: Setup',
          stage: 'setup',
          gateStatus: checkStageGateConditions('setup'),
          tabs: [
            {
              id: 'device-intake',
              label: (
                <div className="flex items-center">
                  {isTabCompleted('device-intake') ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mr-1.5" />
                  ) : (
                    <FileText className="h-4 w-4 mr-1.5 text-blue-600" />
                  )}
                  <span>Device Intake</span>
                  {!deviceProfile?.deviceName && (
                    <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">START</span>
                  )}
                </div>
              ),
              required: true,
              status: deviceProfile?.deviceName ? 'ready' : 'todo',
            },
            {
              id: 'predicates',
              label: (
                <div className="flex items-center">
                  {deviceProfile?.primaryPredicate ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mr-1.5" />
                  ) : (
                    <Search className="h-4 w-4 mr-1.5 text-purple-600" />
                  )}
                  <span>Predicate & Regulation Finder</span>
                </div>
              ),
              required: true,
              status: deviceProfile?.primaryPredicate ? 'ready' : 'todo',
            },
          ],
        },
        // Stage 1: Strategy - SE strategy development
        {
          label: 'Stage 1: Strategy',
          stage: 'strategy',
          gateStatus: checkStageGateConditions('strategy'),
          tabs: [
            {
              id: 'se-strategy',
              label: (
                <div className="flex items-center">
                  <GitCompare className="h-4 w-4 mr-1.5 text-orange-600" />
                  <span>Substantial Equivalence Strategy</span>
                </div>
              ),
              required: true,
              status: deviceProfile?.seStrategy ? 'ready' : 'todo',
            },
          ],
        },
        // Stage 2: Evidence Plan - Standards matrix and test planning
        {
          label: 'Stage 2: Evidence Plan',
          stage: 'evidence_plan',
          gateStatus: checkStageGateConditions('evidence_plan'),
          tabs: [
            {
              id: 'standards-matrix',
              label: (
                <div className="flex items-center">
                  <ClipboardCheck className="h-4 w-4 mr-1.5 text-indigo-600" />
                  <span>Standards & DoCs</span>
                </div>
              ),
              required: true,
              status: deviceProfile?.standardsMatrix ? 'ready' : 'todo',
            },
            {
              id: 'test-plan',
              label: (
                <div className="flex items-center">
                  <Activity className="h-4 w-4 mr-1.5 text-purple-600" />
                  <span>Integrated Test Plan</span>
                </div>
              ),
              required: true,
              status: deviceProfile?.testPlan ? 'ready' : 'todo',
            },
          ],
        },
        // Stage 3: Evidence - Collect testing reports and artifacts
        {
          label: 'Stage 3: Evidence',
          stage: 'evidence',
          gateStatus: checkStageGateConditions('evidence'),
          tabs: [
            {
              id: 'evidence-matrix',
              label: 'Evidence Matrix Dashboard',
              icon: <BarChart className="h-4 w-4 mr-1.5 text-blue-600" />,
              required: false,
              status: 'todo',
            },
            {
              id: 'bench-testing',
              label: 'Bench / Performance Testing',
              icon: <TestTube className="h-4 w-4 mr-1.5 text-green-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'biocompatibility',
              label: 'Biocompatibility',
              icon: <Heart className="h-4 w-4 mr-1.5 text-red-600" />,
              required: true,
              status: 'todo',
            },
            // Conditional sections based on device toggles
            ...(isSectionVisible('sterility') ? [{
              id: 'sterility',
              label: 'Sterilization & Shelf Life',
              icon: <Shield className="h-4 w-4 mr-1.5 text-blue-600" />,
              required: false,
              status: 'todo',
            }] : []),
            {
              id: 'emc-es',
              label: 'Electrical Safety & EMC',
              icon: <Zap className="h-4 w-4 mr-1.5 text-yellow-600" />,
              required: true,
              status: 'todo',
            },
            ...(isSectionVisible('software') ? [{
              id: 'software',
              label: 'Software Documentation',
              icon: <Code className="h-4 w-4 mr-1.5 text-cyan-600" />,
              required: false,
              status: 'todo',
            }] : []),
            ...(isSectionVisible('cybersecurity') ? [{
              id: 'cybersecurity',
              label: 'Cybersecurity',
              icon: <Lock className="h-4 w-4 mr-1.5 text-gray-600" />,
              required: false,
              status: 'todo',
            }] : []),
            {
              id: 'usability',
              label: 'Usability / Human Factors',
              icon: <Users className="h-4 w-4 mr-1.5 text-purple-600" />,
              required: false,
              status: 'todo',
            },
            ...(isSectionVisible('clinical_data') ? [{
              id: 'clinical-data',
              label: 'Clinical Data',
              icon: <FileText className="h-4 w-4 mr-1.5 text-teal-600" />,
              required: false,
              status: 'todo',
            }] : []),
          ],
        },
        // Stage 4: Author - Write narratives in eSTAR order
        {
          label: 'Stage 4: Author',
          stage: 'authoring',
          gateStatus: checkStageGateConditions('authoring'),
          tabs: [
            {
              id: 'admin-forms',
              label: 'Administrative & Forms',
              icon: <FileText className="h-4 w-4 mr-1.5 text-blue-600" />,
              required: true,
              status: deviceProfile?.forms3514 ? 'ready' : 'todo',
            },
            {
              id: 'indications-for-use',
              label: 'Indications for Use (Form 3881)',
              icon: <FileCheck className="h-4 w-4 mr-1.5 text-green-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'device-description',
              label: 'Device Description',
              icon: <FileText className="h-4 w-4 mr-1.5 text-gray-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'document-editor',
              label: '📝 Full Document Editor',
              icon: <Edit3 className="h-4 w-4 mr-1.5 text-green-600" />,
              required: true,
              status: 'ready',
            },
            {
              id: 'se-discussion',
              label: 'Substantial Equivalence Discussion',
              icon: <GitCompare className="h-4 w-4 mr-1.5 text-orange-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'labeling',
              label: 'Labeling',
              icon: <Tag className="h-4 w-4 mr-1.5 text-purple-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'biocomp-summary',
              label: 'Biocompatibility Summary',
              icon: <Beaker className="h-4 w-4 mr-1.5 text-pink-600" />,
              required: true,
              status: 'todo',
            },
            ...(isSectionVisible('cybersecurity') ? [{
              id: 'cybersecurity-summary',
              label: 'Cybersecurity Summary',
              icon: <Shield className="h-4 w-4 mr-1.5 text-red-600" />,
              required: false,
              status: 'todo',
            }] : []),
            {
              id: 'emc-es-summary',
              label: 'Electrical Safety & EMC Summary',
              icon: <Zap className="h-4 w-4 mr-1.5 text-yellow-600" />,
              required: true,
              status: 'todo',
            },
            ...(isSectionVisible('software') ? [{
              id: 'software-summary',
              label: 'Software Summary',
              icon: <Code className="h-4 w-4 mr-1.5 text-blue-600" />,
              required: false,
              status: 'todo',
            }] : []),
            {
              id: 'standards-declarations',
              label: 'Standards & Declarations of Conformity',
              icon: <Award className="h-4 w-4 mr-1.5 text-green-600" />,
              required: true,
              status: 'todo',
            },
            ...(isSectionVisible('sterility') ? [{
              id: 'sterility-summary',
              label: 'Sterilization & Shelf Life Summary',
              icon: <Droplet className="h-4 w-4 mr-1.5 text-cyan-600" />,
              required: false,
              status: 'todo',
            }] : []),
            {
              id: 'usability-summary',
              label: 'Usability Summary',
              icon: <Users className="h-4 w-4 mr-1.5 text-purple-600" />,
              required: false,
              status: 'todo',
            },
            {
              id: 'performance-summaries',
              label: 'Performance Testing Summaries',
              icon: <FileText className="h-4 w-4 mr-1.5 text-cyan-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: '510k-summary',
              label: '510(k) Summary or Statement',
              icon: <FileText className="h-4 w-4 mr-1.5 text-indigo-600" />,
              required: true,
              status: 'todo',
            },
            {
              id: 'truthful-accurate',
              label: 'Truthful & Accurate Statement',
              icon: <Shield className="h-4 w-4 mr-1.5 text-red-600" />,
              required: true,
              status: 'todo',
            },
          ],
        },
        // Stage 5: eSTAR & RTA - Assembly and validation
        {
          label: 'Stage 5: eSTAR & RTA',
          stage: 'estar_rta',
          gateStatus: checkStageGateConditions('estar_rta'),
          tabs: [
            {
              id: 'estar-assembly',
              label: (
                <div className="flex items-center">
                  <Package className="h-4 w-4 mr-1.5 text-blue-600" />
                  <span>eSTAR Assembly</span>
                </div>
              ),
              required: true,
              status: deviceProfile?.estarPackage ? 'ready' : 'todo',
            },
            {
              id: 'rta-check',
              label: (
                <div className="flex items-center">
                  <ClipboardCheck className="h-4 w-4 mr-1.5 text-green-600" />
                  <span>RTA Pre-Check</span>
                  {deviceProfile?.rtaScore && (
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                      deviceProfile.rtaScore >= 0.9 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {Math.round(deviceProfile.rtaScore * 100)}%
                    </span>
                  )}
                </div>
              ),
              required: true,
              status: deviceProfile?.rtaScore >= 0.9 ? 'ready' : 'todo',
            },
          ],
        },
        // Stage 6: Submit & AI - Portal submission and tracking
        {
          label: 'Stage 6: Submit & AI',
          stage: 'submit_ai',
          gateStatus: checkStageGateConditions('submit_ai'),
          tabs: [
            {
              id: 'fda-forms',
              label: (
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1.5 text-purple-600" />
                  <span>FDA Forms</span>
                </div>
              ),
              required: true,
              status: 'todo',
            },
            {
              id: 'submission',
              label: (
                <div className="flex items-center">
                  <Send className="h-4 w-4 mr-1.5 text-teal-600" />
                  <span>Submission</span>
                  {deviceProfile?.submissionId && (
                    <span className="ml-1.5 bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">
                      #{deviceProfile.submissionId}
                    </span>
                  )}
                </div>
              ),
              required: true,
              status: deviceProfile?.submissionId ? 'ready' : 'todo',
            },
            {
              id: 'ai-tracking',
              label: 'Interactive Review / AI Tracking',
              icon: <MessageSquare className="h-4 w-4 mr-1.5 text-amber-600" />,
              required: true,
              status: 'todo',
            },
          ],
        },
      ];

      // Return FDA 7-stage workflow with gate indicators
      return (
        <div className="mt-2 mb-4 border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto pb-3 px-6 space-x-8">
            {k510TabGroups.map((group, groupIndex) => {
              const gateStatus = group.gateStatus || { passed: false };
              const isPreviousStagePassed = groupIndex === 0 || k510TabGroups[groupIndex - 1]?.gateStatus?.passed;
              const isStageAccessible = groupIndex === 0 || isPreviousStagePassed;

              return (
                <div key={groupIndex} className="space-y-2 min-w-fit">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {group.label}
                    </span>
                    {/* Gate Status Indicator */}
                    {gateStatus.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : isStageAccessible ? (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <Lock className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1" role="tablist">
                    {group.tabs.map((tab, tabIndex) => {
                      const isTabEnabled = isStageAccessible && (tab.status !== 'blocked');
                      
                      // Status chip colors
                      const statusColors = {
                        'todo': 'bg-gray-100 text-gray-600',
                        'draft': 'bg-yellow-100 text-yellow-700',
                        'ready': 'bg-green-100 text-green-700',
                        'blocked': 'bg-red-100 text-red-700',
                      };

                      return (
                        <div key={tab.id} className="relative">
                          <Button
                            role="tab"
                            tabIndex={activeTab === tab.id ? 0 : -1}
                            aria-selected={activeTab === tab.id}
                            aria-disabled={!isTabEnabled}
                            data-testid={`tab-${tab.id}`}
                            data-active={activeTab === tab.id}
                            variant={activeTab === tab.id ? 'default' : 'outline'}
                            disabled={!isTabEnabled}
                            className={`h-auto px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                              activeTab === tab.id
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                : isTabEnabled
                                  ? 'text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                                  : 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                            }`}
                            onClick={() => {
                              if (!isTabEnabled) {
                                toast({
                                  title: 'Stage Not Accessible',
                                  description: `Complete ${group.label.replace(/Stage \d+: /, '')} requirements first.`,
                                  variant: 'default',
                                });
                                return;
                              }
                              setActiveTab(tab.id);
                            }}
                          >
                            <div className="flex flex-col items-start gap-1">
                              <div className="flex items-center gap-1.5">
                                {tab.icon || (tab.label && typeof tab.label === 'object' ? null : <FileText className="h-3.5 w-3.5" />)}
                                <span className="font-medium">{typeof tab.label === 'object' ? tab.label : tab.label}</span>
                              </div>
                              {/* Status Badge */}
                              {tab.status && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[tab.status]}`}>
                                  {tab.status.toUpperCase()}
                                </span>
                              )}
                              {/* Required Indicator */}
                              {tab.required && (
                                <span className="text-[10px] text-red-500">Required</span>
                              )}
                            </div>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Default CER tab groups
    const tabGroups = [
      {
        label: 'Preparation:',
        tabs: [
          {
            id: 'builder',
            label: 'Builder',
            icon: <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
          {
            id: 'document-editor',
            label: 'Document Editor',
            icon: <Edit3 className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
          {
            id: 'cep',
            label: 'Evaluation Plan',
            icon: <ClipboardList className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
          {
            id: 'qmp',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>Quality Management</span>
                <span className="text-[0.65rem] text-blue-600">ICH E6(R3)</span>
              </div>
            ),
            icon: <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
          {
            id: 'documents',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>Documents</span>
                <span className="text-[0.65rem] text-blue-600">Validated for GxP</span>
              </div>
            ),
            icon: <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
          {
            id: 'data-retrieval',
            label: 'Data Retrieval',
            icon: <Database className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
          },
        ],
      },
      {
        label: 'Evidence:',
        tabs: [
          {
            id: 'literature',
            label: 'Literature',
            icon: <BookOpen className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
          },
          {
            id: 'literature-review',
            label: 'Literature Review',
            icon: <BookOpen className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
          },
          {
            id: 'internal-clinical-data',
            label: 'Internal Clinical Data',
            icon: <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
          },
          {
            id: 'sota',
            label: 'State of Art',
            icon: <BookMarked className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
          },
        ],
      },
      {
        label: 'Analysis:',
        tabs: [
          {
            id: 'equivalence',
            label: 'Equivalence',
            icon: <GitCompare className="h-3.5 w-3.5 mr-1.5 text-purple-600" />,
          },
          {
            id: 'gspr-mapping',
            label: 'GSPR Mapping',
            icon: <BarChart className="h-3.5 w-3.5 mr-1.5 text-purple-600" />,
          },
          {
            id: 'traceability',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>Regulatory Traceability</span>
                <span className="text-[0.65rem] text-purple-600">EU MDR and FDA</span>
              </div>
            ),
            icon: <Layers className="h-3.5 w-3.5 mr-1.5 text-purple-600" />,
          },
          {
            id: 'compliance',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>EU MDR Compliance</span>
                <span className="text-[0.65rem] text-purple-600">CER Requirements</span>
              </div>
            ),
            icon: <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-purple-600" />,
          },
        ],
      },
      {
        label: 'Output:',
        tabs: [
          {
            id: 'preview',
            label: 'Preview',
            icon: <FileText className="h-3.5 w-3.5 mr-1.5 text-orange-600" />,
          },
          {
            id: 'export',
            label: 'Export',
            icon: <Download className="h-3.5 w-3.5 mr-1.5 text-orange-600" />,
          },
          {
            id: 'reports',
            label: 'Reports',
            icon: <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-orange-600" />,
          },
          {
            id: 'assistant',
            label: (
              <div className="flex items-center">
                <span>AI Assistant</span>
                <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full shadow-sm">
                  GPT-4o
                </span>
              </div>
            ),
            icon: <Lightbulb className="h-3.5 w-3.5 mr-1.5 text-amber-500" />,
          },
        ],
      },
      {
        label: 'Integrations:',
        tabs: [
          {
            id: 'maud',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>MAUD Integration</span>
                <span className="text-[0.65rem] text-teal-600">Adverse Events</span>
              </div>
            ),
            icon: <Activity className="h-3.5 w-3.5 mr-1.5 text-teal-600" />,
          },
          {
            id: 'k-automation',
            label: (
              <div className="flex flex-col items-center leading-tight">
                <span>K-Automation</span>
                <span className="text-[0.65rem] text-teal-600">PMCF/PSUR</span>
              </div>
            ),
            icon: <Cpu className="h-3.5 w-3.5 mr-1.5 text-teal-600" />,
          },
          {
            id: '510k',
            label: (
              <div className="flex flex-col items-center leading-tight text-center">
                <span>510(k) Automation</span>
                <span className="text-[0.65rem] text-teal-600">FDA Submission</span>
              </div>
            ),
            icon: <Archive className="h-3.5 w-3.5 mr-1.5 text-teal-600" />,
          },
        ],
      },
    ];

    // Return CER tabs only when not in 510(k) mode (should never happen now)
    // This is commented out since we're focusing on 510(k) workflow only
    return null; // Remove CER tabs completely
    /*
    return (
      <div className="mt-2 mb-4 border-b border-neutral-100">
        <div className="flex overflow-x-auto pb-2 px-6 space-x-6">
          {tabGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-1 min-w-fit">
              <div className="text-xs font-medium text-gray-600 pl-1">{group.label}</div>
              <div className="flex space-x-1" role="tablist">
                {group.tabs.map((tab, tabIndex) => (
                  <Button
                    key={tab.id}
                    role="tab"
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    aria-selected={activeTab === tab.id}
                    data-testid={`tab-${tab.id}`}
                    data-active={activeTab === tab.id}
                    variant={activeTab === tab.id ? 'default' : 'ghost'}
                    className={`h-9 px-2.5 py-1.5 text-xs font-medium rounded-md cerv2-tab ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white hover:bg-blue-700 cerv2-tab-active'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      // Special case for 510k tab
                      if (tab.id === '510k') {
                        setDocumentType('510k');
                        setActiveTab('predicates');
                      }
                    }}
                    onKeyDown={(e) => {
                      // Keyboard navigation for accessibility - WAI-ARIA tab pattern
                      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        const allTabs = group.tabs;
                        const currentIndex = allTabs.findIndex(t => t.id === tab.id);
                        let nextIndex;
                        if (e.key === 'ArrowRight') {
                          nextIndex = currentIndex + 1 < allTabs.length ? currentIndex + 1 : 0;
                        } else {
                          nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : allTabs.length - 1;
                        }
                        // Arrow keys only move focus, do not activate
                        const nextTab = document.querySelector(`[data-testid="tab-${allTabs[nextIndex].id}"]`);
                        nextTab?.focus();
                      } else if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // Enter/Space activate the focused tab
                        setActiveTab(tab.id);
                        if (tab.id === '510k') {
                          setDocumentType('510k');
                          setActiveTab('predicates');
                        }
                      }
                    }}
                  >
                    <span className="flex items-center">
                      {tab.icon}
                      {tab.label}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
    */
  };

  // Helper functions
  const handleExport = async format => {
    setIsLoading(true);
    try {
      // Code for export handling
      setExportTimestamp(new Date());
      toast({
        title: `Export ${format.toUpperCase()} Successful`,
        description: 'Your Clinical Evaluation Report has been exported.',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error.message || 'There was an error exporting your CER.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle new client onboarding
  const startNewClientOnboarding = () => {
    setNewClientMode(true);
    setShowWelcomeDialog(true);
  };

  // Function to handle welcome dialog continue
  const handleWelcomeContinue = () => {
    setShowWelcomeDialog(false);
    setShowDeviceIntakeForm(true);
  };

  // Function to handle device intake form submission
  const handleDeviceIntakeSubmit = data => {
    setDeviceIntakeData(data);
    setShowDeviceIntakeForm(false);

    // Update device profile with intake form data
    setDeviceName(data.deviceName);
    setManufacturer(data.manufacturer);
    setDeviceType(`Class ${data.deviceClass} Medical Device`);

    // Set active tab to predicates to start the 510(k) workflow
    setActiveTab('predicates');

    toast({
      title: 'Device Profile Created',
      description:
        'Your device profile has been created successfully. You can now proceed with the 510(k) submission process.',
      duration: 5000,
    });
  };

  const generateFullCER = async () => {
    setIsGeneratingFullCER(true);
    try {
      // Code for CER generation
      toast({
        title: 'CER Generated Successfully',
        description:
          'Your Clinical Evaluation Report has been generated with all required sections.',
      });
    } catch (error) {
      toast({
        title: 'CER Generation Failed',
        description: error.message || 'There was an error generating your CER.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingFullCER(false);
    }
  };

  const getWizardStep = tab => {
    if (['builder', 'cep', 'qmp', 'documents', 'data-retrieval'].includes(tab)) {
      return 'preparation';
    } else if (
      ['literature', 'literature-review', 'internal-clinical-data', 'sota'].includes(tab)
    ) {
      return 'evidence';
    } else if (['equivalence', 'gspr-mapping', 'compliance', 'assistant'].includes(tab)) {
      return 'analysis';
    } else if (['export'].includes(tab)) {
      return 'export';
    } else {
      return 'output';
    }
  };

  // Handle the change of document type
  const handleSetDocumentType = type => {
    setDocumentType(type);
    if (type === 'cer') {
      setActiveTab('builder');
    } else if (type === '510k') {
      setActiveTab('predicates');
    }
  };

  // Document type banner disabled - focusing on 510(k) workflow only
  const renderDocumentTypeBanner = () => null;

  // Render page
  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                FDA 510(k) Submission Pipeline
              </h1>
              
              {/* Multi-Project Selector */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProjectSelector(!showProjectSelector)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:from-blue-100 hover:to-indigo-100"
                  data-testid="button-project-selector"
                >
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    {currentProjectId
                      ? allProjects.find(p => p.id === currentProjectId)?.deviceName || 'Select Project'
                      : 'No Project Selected'}
                  </span>
                  <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">
                    {allProjects.length}
                  </Badge>
                </Button>

                {/* Project Selector Dropdown */}
                {showProjectSelector && (
                  <Card className="absolute top-full left-0 mt-2 w-96 shadow-lg z-50 border-2 border-blue-200">
                    <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Files className="h-5 w-5 text-blue-600" />
                          My Medical Device Projects
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowProjectSelector(false)}
                          className="h-7 w-7 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {allProjects.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <FolderPlus className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No projects yet</p>
                            <p className="text-xs mt-1">Create your first medical device project</p>
                          </div>
                        ) : (
                          allProjects.map(project => (
                            <div
                              key={project.id}
                              className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                project.id === currentProjectId
                                  ? 'bg-blue-50 border-blue-300 shadow-sm'
                                  : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                              }`}
                              onClick={() => switchToProject(project.id)}
                              data-testid={`project-item-${project.id}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-gray-900">{project.deviceName}</h4>
                                    {project.id === currentProjectId && (
                                      <CheckCircle className="h-4 w-4 text-blue-600" />
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 mt-0.5">{project.manufacturer}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {project.deviceType === 'cer' ? 'CER' : '510(k)'}
                                    </Badge>
                                    <Badge
                                      variant="secondary"
                                      className={`text-xs ${
                                        project.status === 'submitted'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-yellow-100 text-yellow-700'
                                      }`}
                                    >
                                      {project.status}
                                    </Badge>
                                    <span className="text-xs text-gray-500">
                                      Updated {new Date(project.updatedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete project "${project.deviceName}"?`)) {
                                      deleteProject(project.id);
                                    }
                                  }}
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`button-delete-project-${project.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <Button
                        className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                          setShowNewProjectDialog(true);
                          setShowProjectSelector(false);
                        }}
                        data-testid="button-create-new-project"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Create New Project
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* PROMINENT CORE FEATURES - Primary Work Areas */}
            <div className="flex items-center space-x-2">
              {/* Device Data Center - PRIMARY DATA ROOM */}
              <Button
                variant="default"
                size="lg"
                onClick={() => setActiveTab('device-data-center')}
                className={`flex items-center gap-2 px-5 py-2.5 font-bold shadow-lg transition-all ${
                  activeTab === 'device-data-center'
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white ring-2 ring-cyan-400 ring-offset-2'
                    : 'bg-gradient-to-r from-cyan-50 to-cyan-100 text-cyan-800 border-2 border-cyan-300 hover:from-cyan-100 hover:to-cyan-200'
                }`}
                data-testid="quick-access-data-center"
              >
                <HardDrive className="h-5 w-5" />
                <div className="flex flex-col items-start">
                  <span className="text-sm leading-tight">Data Center</span>
                  <span className="text-xs opacity-90 leading-tight">File Repository</span>
                </div>
              </Button>

              {/* Document Editor - PRIMARY WRITING TOOL */}
              <Button
                variant="default"
                size="lg"
                onClick={() => setActiveTab('document-editor')}
                className={`flex items-center gap-2 px-5 py-2.5 font-bold shadow-lg transition-all ${
                  activeTab === 'document-editor'
                    ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white ring-2 ring-green-400 ring-offset-2'
                    : 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border-2 border-green-300 hover:from-green-100 hover:to-green-200'
                }`}
                data-testid="quick-access-document-editor"
              >
                <Edit3 className="h-5 w-5" />
                <div className="flex flex-col items-start">
                  <span className="text-sm leading-tight">Document Editor</span>
                  <span className="text-xs opacity-90 leading-tight">Write & Edit</span>
                </div>
              </Button>

              {/* Document Vault - PRIMARY FILE MANAGER */}
              <Button
                variant="default"
                size="lg"
                onClick={() => setIsDocumentVaultOpen(true)}
                className={`flex items-center gap-2 px-5 py-2.5 font-bold shadow-lg transition-all ${
                  isDocumentVaultOpen
                    ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white ring-2 ring-yellow-400 ring-offset-2'
                    : 'bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-800 border-2 border-yellow-300 hover:from-yellow-100 hover:to-amber-100'
                }`}
                data-testid="quick-access-document-vault"
              >
                <FolderOpen className="h-5 w-5" />
                <div className="flex flex-col items-start">
                  <span className="text-sm leading-tight">Document Vault</span>
                  <span className="text-xs opacity-90 leading-tight">Manage Files</span>
                </div>
              </Button>

              {/* Secondary Actions */}
              <div className="ml-4 pl-4 border-l-2 border-gray-200 flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700 border-green-600"
                  onClick={() => setShowNewProjectDialog(true)}
                  data-testid="button-new-device-submission"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  New Project
                </Button>

                {documentType === '510k' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAssistant()}
                    className="flex items-center text-gray-600"
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    AI Assistant
                  </Button>
                )}

                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={documentType === 'cer' ? generateFullCER : handleSubmissionReady}
                  disabled={documentType === 'cer' ? isGeneratingFullCER : !equivalenceCompleted}
                >
                  {documentType === 'cer' ? (
                    <>
                      <ZapIcon className="mr-1.5 h-4 w-4" />
                      {isGeneratingFullCER ? 'Generating...' : 'Generate CER'}
                    </>
                  ) : (
                    <>
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {renderDocumentTypeBanner()}

      <div className="container mx-auto px-6 mt-4">
        {renderNavigation()}

        <div className="flex">
          {/* Document Vault Sidebar */}
          {showDocumentTree && (
            <div className="w-64 bg-gray-50 border-r border-gray-200 shadow-md h-full overflow-auto">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center p-3 border-b bg-gray-100">
                  <h2 className="text-base font-semibold flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 text-blue-600"
                    >
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                    </svg>
                    Document Vault
                  </h2>
                  <button
                    onClick={() => setShowDocumentTree(false)}
                    className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18"></path>
                      <path d="m6 6 12 12"></path>
                    </svg>
                  </button>
                </div>

                {/* Document View Tabs */}
                <div className="border-b">
                  <div className="flex">
                    <button
                      className={`flex-1 py-2 text-sm font-medium text-center ${documentView === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setDocumentView('all')}
                    >
                      All Files
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium text-center ${documentView === 'cer' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setDocumentView('cer')}
                    >
                      CER
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium text-center ${documentView === '510k' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setDocumentView('510k')}
                    >
                      510(k)
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium text-center ${documentView === 'global' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setDocumentView('global')}
                    >
                      Global
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="p-2 border-b">
                  <div className="relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"
                    >
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search documents..."
                      className="pl-8 pr-2 py-2 w-full text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                {/* Navigation Tree */}
                <div className="flex-1 overflow-auto bg-white">
                  <nav className="p-1">
                    {/* Regulatory Documents */}
                    <div className="mb-0.5">
                      <div
                        className="flex items-center py-2 px-3 hover:bg-blue-50 cursor-pointer"
                        onClick={() => toggleFolder('regulatory')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${expandedFolders.regulatory ? 'rotate-90' : ''} mr-2 text-gray-500`}
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-2 text-blue-600"
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="text-sm font-medium">Regulatory</span>
                        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          3
                        </span>
                      </div>
                      {expandedFolders.regulatory && (
                        <div>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/Format-and-Content-of-the-Clinical-and-Statistical-Sections-of-an-Application.pdf',
                                '510(k) Summary',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">510(k) Summary</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v1.3</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/E3-Structure-and-Content-of-Clinical-Study-Reports.pdf',
                                'Clinical Study Report',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Clinical Study Report</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v2.0</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/7.19.13.Miller-Clinical-Trials.pdf',
                                'Regulatory Checklist',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Regulatory Checklist</span>
                            <span className="ml-auto text-xs text-amber-600 font-medium">
                              Draft
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Clinical Documents */}
                    <div className="mb-0.5">
                      <div
                        className="flex items-center py-2 px-3 hover:bg-blue-50 cursor-pointer"
                        onClick={() => toggleFolder('clinical')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${expandedFolders.clinical ? 'rotate-90' : ''} mr-2 text-gray-500`}
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-2 text-blue-600"
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="text-sm font-medium">Clinical</span>
                        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          4
                        </span>
                      </div>
                      {expandedFolders.clinical && (
                        <div>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/CER REPORT EXAMPLE OUTPUT.pdf',
                                'CER Report',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">CER Report</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v2.4</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/ICER_Acute-Pain_Evidence-Report_For-Publication_020525.pdf',
                                'Evidence Report',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Evidence Report</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v1.1</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/AO_2508_2023_1-3.pdf',
                                'PMS Data Analysis',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">PMS Data Analysis</span>
                            <span className="ml-auto text-xs text-amber-600 font-medium">
                              Draft
                            </span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/9789240097711-eng.pdf',
                                'Clinical Guidelines',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Clinical Guidelines</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v3.0</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* FDA Submissions */}
                    <div className="mb-0.5 bg-blue-50">
                      <div
                        className="flex items-center py-2 px-3 hover:bg-blue-100 cursor-pointer bg-blue-50"
                        onClick={() => toggleFolder('submissions')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${expandedFolders.submissions ? 'rotate-90' : ''} mr-2 text-blue-600`}
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-2 text-blue-600"
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="text-sm font-medium">FDA Submissions</span>
                        <div className="ml-auto flex items-center">
                          <span className="mr-1.5 text-xs text-gray-700 bg-white px-1.5 py-0.5 rounded-full border border-blue-200">
                            New
                          </span>
                          <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full border border-blue-200">
                            3
                          </span>
                        </div>
                      </div>
                      {expandedFolders.submissions && (
                        <div>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-100 bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/1 - CER 2021 Update - Arthrosurface Shoulder Implant Systems - 10.07.2021 (FINAL).pdf',
                                '510(k) Submission',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-blue-600"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm font-medium">510(k) Submission</span>
                            <span className="ml-auto text-xs text-blue-700 font-medium">Final</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-100 bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/Clinical-Evaluation-Reports-How-To-Leverage-Published-Data-–-Pro-Te-Fall-2016.pdf',
                                'Predicate Device',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-blue-600"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm font-medium">Predicate Device</span>
                            <span className="ml-auto text-xs text-blue-700 font-medium">Final</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-100 bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/Human-Factors-Studies-and-Related-Clinical-Study-Considerations-in-Combination-Product-Design-and-Development.pdf',
                                'eSTAR Package',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-blue-600"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm font-medium">eSTAR Package</span>
                            <span className="ml-auto text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                              NEW
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Technical Documentation */}
                    <div className="mb-0.5">
                      <div
                        className="flex items-center py-2 px-3 hover:bg-blue-50 cursor-pointer"
                        onClick={() => toggleFolder('technical')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${expandedFolders.technical ? 'rotate-90' : ''} mr-2 text-gray-500`}
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-2 text-blue-600"
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="text-sm font-medium">Technical</span>
                        <div className="ml-auto flex items-center">
                          <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            2
                          </span>
                        </div>
                      </div>
                      {expandedFolders.technical && (
                        <div>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/ENVIA_Whitepaper_SOTApdf.pdf',
                                'Technical Specs',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Technical Specs</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v4.2</span>
                          </button>
                          <button
                            type="button"
                            className="flex items-center w-full text-left py-2 px-3 pl-9 hover:bg-blue-50"
                            onClick={(e) =>
                              openDocumentSafely(
                                e,
                                '/attached_assets/DI_Intelligent-clinical-trials.pdf',
                                'Risk Analysis',
                                toast
                              )
                            }
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-2 text-gray-500"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span className="text-sm">Risk Analysis</span>
                            <span className="ml-auto text-xs text-green-600 font-medium">v1.8</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Global Documents Folder */}
                    {(documentView === 'all' || documentView === 'global') && (
                      <div className="mb-0.5">
                        <div
                          className="flex items-center py-2 px-3 hover:bg-blue-50 cursor-pointer bg-gray-50"
                          onClick={() => toggleFolder('global')}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform ${expandedFolders.global ? 'rotate-90' : ''} mr-2 text-gray-500`}
                          >
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="mr-2 text-purple-600"
                          >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                          </svg>
                          <span className="text-sm font-medium">Global Documents</span>
                          <div className="ml-auto flex items-center">
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                              1
                            </span>
                          </div>
                        </div>
                        {expandedFolders.global && (
                          <div>
                            <button
                              type="button"
                              className="flex w-full items-center py-2 px-3 pl-9 hover:bg-blue-50 cursor-pointer text-left"
                              onClick={(e) =>
                                openDocumentSafely(
                                  e,
                                  '/attached_assets/9789240097711-eng.pdf',
                                  'Shared Resources',
                                  toast
                                )
                              }
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-2 text-purple-500"
                              >
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                              <span className="text-sm">Shared Resources</span>
                              <span className="ml-auto text-xs text-green-600 font-medium">
                                v2.0
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </nav>
                </div>

                {/* Action buttons */}
                <div className="p-2 border-t bg-gray-50">
                  <div className="flex space-x-2">
                    <label className="flex items-center justify-center py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md cursor-pointer">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-1.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      Upload to Vault
                    </label>
                    <button
                      className="flex items-center justify-center py-1.5 px-3 border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-md"
                      onClick={() => {
                        toast({
                          title: 'Document Export',
                          description: 'Preparing document export...',
                        });

                        // In a real app, this would trigger a download
                        setTimeout(() => {
                          toast({
                            title: 'Export Complete',
                            description: 'Documents have been exported successfully',
                          });
                        }, 1500);
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-1.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Export
                    </button>
                  </div>

                  {/* Create new folder button */}
                  <div className="mt-2">
                    <button
                      className="w-full flex items-center justify-center py-1.5 px-3 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium rounded-md"
                      onClick={() => {
                        // Create a new folder functionality
                        toast({
                          title: 'New Folder',
                          description: 'Created new folder in current view',
                        });

                        // This would typically involve server operations
                        setExpandedFolders(prev => ({
                          ...prev,
                          newFolder: true,
                        }));
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-1.5"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                        <line x1="9" y1="14" x2="15" y2="14"></line>
                      </svg>
                      Create New Folder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`bg-white rounded-lg border shadow-sm flex-1 ${showDocumentTree ? 'rounded-l-none' : ''}`}
          >
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Welcome Dialog for new client onboarding */}
      <WelcomeDialog
        open={showWelcomeDialog}
        onOpenChange={setShowWelcomeDialog}
        onContinue={handleWelcomeContinue}
        documentType={documentType}
      />

      {/* Enhanced 510k Intake Workflow is now integrated directly in the device-intake tab */}

      {/* New Project Dialog */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-blue-600" />
              Create New Medical Device Project
            </DialogTitle>
            <DialogDescription>
              Start a new 510(k) submission or CER report for your medical device.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const projectData = {
                deviceName: formData.get('deviceName'),
                manufacturer: formData.get('manufacturer'),
                deviceClass: formData.get('deviceClass'),
                intendedUse: formData.get('intendedUse'),
              };
              
              const newProject = createNewProject(projectData);
              setShowNewProjectDialog(false);
              setActiveTab('device-profile');
              
              toast({
                title: 'Project Created',
                description: `Created new project: ${projectData.deviceName}`,
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="deviceName">Device Name *</Label>
                <Input
                  id="deviceName"
                  name="deviceName"
                  placeholder="e.g., CardioMonitor Pro 3000"
                  required
                  data-testid="input-project-device-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer *</Label>
                <Input
                  id="manufacturer"
                  name="manufacturer"
                  placeholder="e.g., MedTech Industries"
                  required
                  data-testid="input-project-manufacturer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deviceClass">Device Class *</Label>
                <Select name="deviceClass" defaultValue="II">
                  <SelectTrigger data-testid="select-device-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">Class I</SelectItem>
                    <SelectItem value="IIa">Class IIa</SelectItem>
                    <SelectItem value="IIb">Class IIb</SelectItem>
                    <SelectItem value="III">Class III</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="intendedUse">Intended Use</Label>
                <Textarea
                  id="intendedUse"
                  name="intendedUse"
                  placeholder="Describe the intended use of the device..."
                  rows={3}
                  data-testid="input-project-intended-use"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewProjectDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" data-testid="button-submit-new-project">
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Modal */}
      {documentViewerData.isOpen && (
        <div 
          className="fixed inset-0 z-[9999] bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close when clicking on backdrop (not on the modal itself)
            if (e.target === e.currentTarget) {
              setDocumentViewerData({
                isOpen: false,
                url: '',
                documentName: '',
                type: 'other'
              });
            }
          }}
          onKeyDown={(e) => {
            // Close on Escape key press
            if (e.key === 'Escape') {
              setDocumentViewerData({
                isOpen: false,
                url: '',
                documentName: '',
                type: 'other'
              });
            }
          }}
          tabIndex={0}
          role="dialog"
          aria-modal="true"
          aria-label="Document viewer modal"
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Viewer Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                {documentViewerData.documentName || 'Document Viewer'}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Try to open in new tab as backup
                    window.open(documentViewerData.url, '_blank');
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in New Tab
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Reset the document viewer state completely
                    setDocumentViewerData({
                      isOpen: false,
                      url: '',
                      documentName: '',
                      type: 'other'
                    });
                  }}
                  className="h-8 w-8 p-0"
                  aria-label="Close document viewer"
                  data-testid="close-document-viewer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Document Display Area */}
            <div className="flex-1 overflow-hidden p-4 bg-gray-50">
              {documentViewerData.type === 'pdf' ? (
                <iframe
                  src={documentViewerData.url}
                  className="w-full h-full border rounded-lg bg-white"
                  title={documentViewerData.documentName}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      Document Preview Not Available
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      This document type cannot be displayed inline
                    </p>
                    <Button
                      variant="default"
                      onClick={() => {
                        window.open(documentViewerData.url, '_blank');
                        // Reset the document viewer state completely
                        setDocumentViewerData({
                          isOpen: false,
                          url: '',
                          documentName: '',
                          type: 'other'
                        });
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Document
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Document Vault Button (Windows File Explorer Style) - Always Accessible */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsDocumentVaultOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="floating-document-vault-button"
          aria-label="Open Document Vault"
        >
          <FolderOpen className="h-6 w-6" />
        </Button>
        {!isDocumentVaultOpen && (
          <div className="absolute bottom-full right-0 mb-2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap pointer-events-none">
            Document Vault
          </div>
        )}
      </div>

      {/* Slide-out Document Vault Panel */}
      {isDocumentVaultOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[100]"
          onClick={() => setIsDocumentVaultOpen(false)}
          data-testid="document-vault-backdrop"
        >
          <div
            className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-[101]"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideInRight 0.3s ease-out' }}
            data-testid="document-vault-panel"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b bg-blue-50">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-6 w-6 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Document Vault</h2>
                  <p className="text-xs text-gray-600">Manage your 510(k) submission files</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDocumentVaultOpen(false)}
                className="h-8 w-8 p-0"
                aria-label="Close Document Vault"
                data-testid="close-document-vault-panel"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Panel Content - Full Document Vault */}
            <div className="h-[calc(100vh-80px)] overflow-y-auto">
              <EnhancedDocumentVault
                projectId={currentProjectId}
                deviceProfile={deviceProfile}
                onDocumentSelect={(doc) => {
                  // Handle document selection
                  console.log('Document selected from vault:', doc);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
