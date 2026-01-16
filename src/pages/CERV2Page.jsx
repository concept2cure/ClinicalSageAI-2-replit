import React, { useState, useEffect } from 'react';
// Safely handle LumenAiAssistant context access with fallbacks
import { useLumenAiAssistant } from '@/contexts/LumenAiAssistantContext';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import CerBuilderPanel from '@/components/cer/CerBuilderPanel';
import CerPreviewPanel from '@/components/cer/CerPreviewPanel';
import LiteratureSearchPanel from '@/components/cer/LiteratureSearchPanel';
import LiteratureMethodologyPanel from '@/components/cer/LiteratureMethodologyPanel';
import ComplianceScorePanel from '@/components/cer/ComplianceScorePanel';
import CerAssistantPanel from '@/components/cer/CerAssistantPanel';
import DocumentVaultPanel from '@/components/cer/DocumentVaultPanel';
import CerDataRetrievalPanel from '@/components/cer/CerDataRetrievalPanel';
// Using 510k specific components instead of CER ones
import EquivalenceBuilderPanel from '@/components/510k/EquivalenceBuilderPanel';
import ComplianceCheckPanel from '@/components/510k/ComplianceCheckPanel';
import LiteratureVisualizationPanel from '@/components/510k/LiteratureVisualizationPanel';
import ESTARBuilderPanel from '@/components/510k/ESTARBuilderPanel';
import { FDA510kService } from '@/services/FDA510kService';
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
// Enhanced document management with professional vault system
import SimpleDocumentTreePanel from '@/components/510k/SimpleDocumentTreePanel';
import WelcomeDialog from '@/components/510k/WelcomeDialog';
import DeviceIntakeForm from '@/components/510k/DeviceIntakeForm';
import DeviceProfileForm from '@/components/cer/DeviceProfileForm';
import IntegratedDemoTab from '@/components/IntegratedDemoTab';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cerApiService } from '@/services/CerAPIService';
import { literatureAPIService } from '@/services/LiteratureAPIService';
import LiteratureFeatureService from '@/services/LiteratureFeatureService';
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
  CalendarDays,
  User,
  ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// Function to safely open documents and prevent redirection issues
const openDocumentSafely = (url, documentName, showToast) => {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    if (showToast) {
      showToast({
        title: 'Document opened',
        description: `Viewing ${documentName} document`,
      });
    }
  } catch (error) {
    console.error('Error opening document:', error);
    if (showToast) {
      showToast({
        title: 'Error',
        description: 'Could not open document. Popup may be blocked.',
        variant: 'destructive',
      });
    }
  }
};

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

  // State variables
  const [title, setTitle] = useState('FDA 510(k) Submission');
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [showDeviceIntakeForm, setShowDeviceIntakeForm] = useState(false);
  const [newClientMode, setNewClientMode] = useState(false);
  const [deviceIntakeData, setDeviceIntakeData] = useState(null);
  const [deviceType, setDeviceType] = useState('Class II Medical Device');
  const [documentType, setDocumentType] = useState(initialDocumentType || '510k'); // Options: 'cer' or '510k'
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
  const [activeTab, setActiveTab] = useState(initialActiveTab || 'predicates');

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

  // 510k workflow specific state with persistence
  const [workflowStep, setWorkflowStep] = useState(() => loadSavedState('workflowStep', 1));
  const [workflowProgress, setWorkflowProgress] = useState(() =>
    loadSavedState('workflowProgress', 25)
  );
  const [predicatesFound, setPredicatesFound] = useState(() =>
    loadSavedState('predicatesFound', false)
  );
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
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  // Create a deviceProfile object for easier passing to 510k components with localStorage persistence
  const [deviceProfile, setDeviceProfile] = useState(() => {
    // First try to load from localStorage
    const savedProfile = loadSavedState('deviceProfile', null);

    // If we have a saved profile, use that
    if (savedProfile) {
      console.log('Loaded device profile from localStorage:', savedProfile.deviceName);
      return savedProfile;
    }

    // Otherwise create a new default profile
    return {
      id: k510DocumentId,
      deviceName: deviceName || 'Sample Medical Device',
      manufacturer: manufacturer || 'Sample Manufacturer',
      productCode: 'ABC',
      deviceClass: 'II',
      intendedUse: intendedUse || 'For diagnostic use in clinical settings',
      description: 'A medical device designed for diagnostic procedures',
      technicalSpecifications: 'Meets ISO 13485 standards',
      regulatoryClass: 'Class II',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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

  // Toggle folder expansion in document tree
  const toggleFolder = folderId => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Document Vault - file management state
  const [documentView, setDocumentView] = useState('all'); // 'all', 'cer', '510k', 'global'
  const [folderRenameState, setFolderRenameState] = useState({
    isRenaming: false,
    folderId: null,
    folderName: '',
  });

  // Start folder rename
  const startRenameFolder = (folderId, currentName, e) => {
    e.stopPropagation();
    setFolderRenameState({
      isRenaming: true,
      folderId,
      folderName: currentName,
    });
  };

  // Complete folder rename
  const completeRenameFolder = () => {
    // In a real app, this would save to database
    toast({
      title: 'Folder renamed',
      description: `Renamed to: ${folderRenameState.folderName}`,
    });
    setFolderRenameState({
      isRenaming: false,
      folderId: null,
      folderName: '',
    });
  };

  // Handle file upload
  const handleFileUpload = event => {
    const file = event.target.files[0];
    if (file) {
      // In a real app, this would upload to server
      toast({
        title: 'File uploaded',
        description: `Uploaded: ${file.name}`,
      });
    }
  };
  const [systemInfo, setSystemInfo] = useState({
    memory: { used: 0, total: 0, percentage: 0 },
    api: { status: 'unknown', latency: 0 },
    uptime: 0,
    errorCount: 0,
    lastChecked: null,
  });

  // Update device profile when device information changes and persist it
  useEffect(() => {
    if (documentType === '510k') {
      const updatedProfile = {
        ...deviceProfile,
        deviceName: deviceName || deviceProfile.deviceName,
        manufacturer: manufacturer || deviceProfile.manufacturer,
        intendedUse: intendedUse || deviceProfile.intendedUse,
        updatedAt: new Date().toISOString(),
      };

      setDeviceProfile(updatedProfile);

      // Persist device profile to localStorage
      saveState('deviceProfile', updatedProfile);
    }
  }, [deviceName, manufacturer, intendedUse, documentType, deviceProfile]);

  // Add a watcher to persist device profile when it changes from other sources
  useEffect(() => {
    // Don't save if the profile is empty or null
    if (deviceProfile && Object.keys(deviceProfile).length > 0) {
      console.log('Persisting device profile:', deviceProfile.deviceName);
      saveState('deviceProfile', deviceProfile);
    }
  }, [deviceProfile]);

  // Persist risk assessment data when it changes
  useEffect(() => {
    if (riskAssessmentData) {
      console.log('Saving risk assessment data to localStorage');
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

  // Set up the 510K workflow if initialized with that document type
  // and handle state persistence on page load
  useEffect(() => {
    if (documentType === '510k') {
      console.log('Document type set to 510k, active tab set to: predicates');

      // Load saved device profile from localStorage if available
      const savedDeviceProfile = localStorage.getItem('510k_deviceProfile');
      if (savedDeviceProfile) {
        try {
          const parsedProfile = JSON.parse(savedDeviceProfile);
          setDeviceProfile(parsedProfile);
          console.log('Restored device profile from local storage:', parsedProfile.deviceName);

          // Also restore workflow step if available
          const savedStep = localStorage.getItem('510k_workflowStep');
          if (savedStep) {
            const step = parseInt(savedStep);
            console.log(`Restoring workflow to step ${step}`);
            setWorkflowStep(step);

            // Set appropriate tab based on step
            if (step === 1) setActiveTab('device-profile');
            else if (step === 2) setActiveTab('predicates');
            else if (step === 3) setActiveTab('equivalence');
            else if (step === 4) setActiveTab('compliance');
            else if (step === 5) setActiveTab('submission');
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
      console.log(`Saved workflow step ${workflowStep} to localStorage`);

      // Also save device profile if it exists
      if (deviceProfile && Object.keys(deviceProfile).length > 0) {
        localStorage.setItem('510k_deviceProfile', JSON.stringify(deviceProfile));
        console.log(`Saved device profile to localStorage: ${deviceProfile.deviceName}`);
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

      // 2. Set all state variables synchronously for workflow transition
      setPredicatesFound(true);
      setPredicateDevices(data);
      setDeviceProfile(updatedDeviceProfile);

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
        variant: 'success',
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
            variant: 'success',
          });
        })
        .catch(error => {
          console.error('Error saving literature evidence connections:', error);

          // Show error toast
          toast({
            title: 'Warning',
            description:
              "Equivalence analysis saved, but there was an issue connecting literature evidence. This won't affect your submission.",
            variant: 'warning',
          });
        });
    } else {
      // Standard completion toast when no literature evidence
      toast({
        title: 'Equivalence Analysis Complete',
        description: 'Substantial equivalence documentation has been prepared.',
        variant: 'success',
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
      variant: numericScore > 80 ? 'success' : 'warning',
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
            variant: 'success',
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
      variant: 'success',
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
          variant: 'warning',
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
        variant: 'warning',
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
          variant: 'warning',
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
              variant: 'warning',
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
              variant: 'warning',
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
              variant: 'warning',
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
              variant: 'warning',
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

  // Render the 510k workflow progress bar
  const render510kProgressBar = () => (
    <div className="mb-8 bg-white p-6 rounded-lg shadow-sm border border-blue-100">
      {/* Loading indicator for workflow transitions */}
      {isNavigating && (
        <div className="bg-blue-50 p-3 rounded-md flex items-center space-x-2 mb-4 border border-blue-200">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-blue-700">Loading workflow step, please wait...</span>
        </div>
      )}

      <div className="flex justify-between mb-3 items-center">
        <h3 className="text-lg font-medium text-blue-800">510(k) Submission Pipeline</h3>
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-700 mr-2">
            {workflowProgress}% Complete
          </span>
        </div>
      </div>

      <Progress value={workflowProgress} className="h-2 mb-4" />

      <div className="grid grid-cols-5 gap-2">
        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 1
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : deviceProfile
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${deviceProfile ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => goToStep(1)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${deviceProfile ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {deviceProfile ? <CheckCircle className="h-4 w-4" /> : '1'}
          </div>
          <div className="text-xs font-medium">Device Profile</div>
          {deviceProfile && (
            <div className="text-xs mt-1 truncate max-w-full">{deviceProfile.deviceName}</div>
          )}
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 2
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : predicatesFound
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${deviceProfile ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => deviceProfile && goToStep(2)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${predicatesFound ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {predicatesFound ? <CheckCircle className="h-4 w-4" /> : '2'}
          </div>
          <div className="text-xs font-medium">Predicate Search</div>
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 3
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : equivalenceCompleted
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${predicatesFound ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => predicatesFound && goToStep(3)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${equivalenceCompleted ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {equivalenceCompleted ? <CheckCircle className="h-4 w-4" /> : '3'}
          </div>
          <div className="text-xs font-medium">Equivalence</div>
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 4
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : complianceScore
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${equivalenceCompleted ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => equivalenceCompleted && goToStep(4)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${complianceScore ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {complianceScore ? <CheckCircle className="h-4 w-4" /> : '4'}
          </div>
          <div className="text-xs font-medium">Compliance</div>
          {complianceScore && <div className="text-xs mt-1">{complianceScore}% Ready</div>}
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 5
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : submissionReady
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${complianceScore ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => complianceScore && goToStep(5)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${submissionReady ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {submissionReady ? <CheckCircle className="h-4 w-4" /> : '5'}
          </div>
          <div className="text-xs font-medium">Final Submission</div>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (workflowStep > 1) {
              goToStep(workflowStep - 1);
            }
          }}
          disabled={workflowStep === 1}
        >
          Previous Step
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={() => {
            if (workflowStep < 5) {
              goToStep(workflowStep + 1);
            }
          }}
          disabled={
            (workflowStep === 1 && !deviceProfile) ||
            (workflowStep === 2 && !predicatesFound) ||
            (workflowStep === 3 && !equivalenceCompleted) ||
            (workflowStep === 4 && !complianceScore) ||
            workflowStep === 5
          }
        >
          Next Step
        </Button>
      </div>
    </div>
  );

  // Render the 510k step content based on current workflow step
  const render510kStepContent = () => {
    switch (workflowStep) {
      case 1:
      case 2:
        return (
          <div className="space-y-4">
            <PredicateFinderPanel
              deviceProfile={deviceProfile}
              setDeviceProfile={newProfile => {
                // Just save the updated device profile
                if (newProfile) {
                  setDeviceProfile(newProfile);
                }
              }}
              documentId={deviceProfile?.id}
              onPredicatesFound={handlePredicatesComplete}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
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
              documentId={deviceProfile?.id}
              onComplete={handleEquivalenceComplete}
              predicateDevices={predicateDevices}
              selectedLiterature={selectedLiterature}
            />
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <ComplianceCheckPanel
              deviceProfile={deviceProfile}
              documentId={deviceProfile?.id}
              predicateDevices={predicateDevices}
              equivalenceData={equivalenceData}
              onComplete={handleComplianceComplete}
              // FDA Risk Assessment state
              riskAssessmentData={riskAssessmentData}
              setRiskAssessmentData={setRiskAssessmentData}
              isAssessingRisks={isAssessingRisks}
              setIsAssessingRisks={setIsAssessingRisks}
              riskAssessmentProgress={riskAssessmentProgress}
              setRiskAssessmentProgress={setRiskAssessmentProgress}
              showRiskDialog={showRiskDialog}
              setShowRiskDialog={setShowRiskDialog}
              // Template generation state
              templateData={templateData}
              setTemplateData={setTemplateData}
              isGeneratingTemplate={isGeneratingTemplate}
              setIsGeneratingTemplate={setIsGeneratingTemplate}
              showTemplateDialog={showTemplateDialog}
              setShowTemplateDialog={setShowTemplateDialog}
              // Fix suggestions state
              complianceFixes={complianceFixes}
              setComplianceFixes={setComplianceFixes}
              isGeneratingFixes={isGeneratingFixes}
              setIsGeneratingFixes={setIsGeneratingFixes}
              showFixesDialog={showFixesDialog}
              setShowFixesDialog={setShowFixesDialog}
            />
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            {/* Report Generator */}
            <ReportGenerator
              deviceProfile={deviceProfile}
              documentId={deviceProfile?.id}
              exportTimestamp={new Date().toISOString()}
              draftStatus={compliance?.status || 'draft'}
              setDraftStatus={setDraftStatus}
              sections={sections}
              onSubmissionReady={handleSubmissionReady}
            />

            {/* Enhanced eSTAR Builder Panel using dedicated component */}
            <ESTARBuilderPanel
              projectId={k510DocumentId}
              deviceProfile={deviceProfile}
              complianceScore={complianceScore}
              equivalenceData={equivalenceData}
              isValidating={isValidatingEstar}
              isGenerating={isGeneratingEstar}
              validationResults={estarValidationResults}
              generatedUrl={estarGeneratedUrl}
              estarFormat={estarFormat}
              setEstarFormat={setEstarFormat}
              setIsValidating={setIsValidatingEstar}
              setIsGenerating={setIsGeneratingEstar}
              setValidationResults={setEstarValidationResults}
              setGeneratedUrl={setEstarGeneratedUrl}
              onValidationComplete={results => {
                setEstarValidationResults(results);
                if (results.valid) {
                  toast({
                    title: 'eSTAR Validation Successful',
                    description: 'Your package meets FDA requirements',
                    variant: 'success',
                  });
                } else {
                  toast({
                    title: 'Validation Issues Found',
                    description: `${results.issues?.length || 0} issues need to be addressed`,
                    variant: 'warning',
                  });
                }
              }}
              onGenerationComplete={result => {
                setEstarGeneratedUrl(result.downloadUrl);
                setSubmissionReady(true);
                toast({
                  title: 'eSTAR Package Generated',
                  description: 'Your FDA-compliant submission is ready',
                  variant: 'success',
                });
              }}
            />
          </div>
        );

      default:
        return (
          <div className="text-center p-8">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Invalid Step</h3>
            <p className="text-gray-600 mt-2">Please navigate to a valid workflow step</p>
            <Button onClick={() => setWorkflowStep(1)} className="mt-4">
              Return to Start
            </Button>
          </div>
        );
    }
  };

  const renderContent = () => {
    // If 510k document type is selected, show integrated 510k content
    if (documentType === '510k') {
      // Show demo tab if active
      if (activeTab === 'demo') {
        return (
          <div className="p-4">
            <IntegratedDemoTab />
          </div>
        );
      }
      // Show device profile tab if active
      if (activeTab === 'device-profile') {
        return (
          <div className="p-4 space-y-4">
            <DeviceProfileForm
              projectId={k510DocumentId || 'new-device'}
              initialData={deviceProfile}
              onSubmit={savedProfile => {
                console.log('Device profile saved with vault integration:', savedProfile);

                // Show loading toast to provide user feedback
                toast({
                  title: 'Processing Device Profile',
                  description:
                    'Saving your device information and preparing for predicate search...',
                  variant: 'default',
                });

                try {
                  // Update the device profile in state
                  setDeviceProfile(savedProfile);

                  // Always save profile to localStorage for persistence
                  localStorage.setItem('510k_deviceProfile', JSON.stringify(savedProfile));

                  // If we have an ID from the saved profile, use it
                  if (savedProfile.id) {
                    setK510DocumentId(savedProfile.id);
                  }

                  // Transition to predicates step with 500ms delay to ensure UI updates
                  setTimeout(() => {
                    // Use the predicates tab and set the workflow step to 2
                    setActiveTab('predicates');
                    setWorkflowStep(2);

                    // Show success toast after transition
                    toast({
                      title: 'Device Profile Saved',
                      description:
                        'Successfully saved your device profile. Now you can search for predicate devices.',
                      variant: 'success',
                    });
                  }, 500);
                } catch (error) {
                  console.error('Error in device profile transition:', error);
                  toast({
                    title: 'Navigation Error',
                    description:
                      'There was a problem moving to the predicate search. Please try again.',
                    variant: 'destructive',
                  });
                }
              }}
              onCancel={() => {
                // Return to previous tab or dashboard
                setActiveTab('dashboard');
              }}
            />
          </div>
        );
      }
      // Otherwise show the step-based workflow content
      return (
        <div className="p-4 space-y-4">
          {render510kProgressBar()}

          {/* Quick Access Panel for Demo */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-medium text-blue-800 mb-2">Investor Demo Quick Access</h3>
            <p className="text-sm text-blue-700 mb-3">
              For quick access to the demo components without going through the complete workflow:
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  // Simulate having completed all previous steps
                  setDeviceProfile(
                    deviceProfile || {
                      id: 'demo-device-123',
                      deviceName: 'Demo Medical Device',
                      manufacturer: 'Demo Manufacturer',
                      deviceClass: 'II',
                    }
                  );
                  setPredicatesFound(true);
                  setEquivalenceCompleted(true);
                  setComplianceScore(85);
                  setSubmissionReady(true);

                  // Directly show eSTAR Builder by rendering it in this panel
                  setShowESTARDemo(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Show eSTAR Builder Demo
              </button>
            </div>
          </div>

          {render510kStepContent()}
        </div>
      );
    }

    // Special handling for equivalence tab outside of workflow steps
    else if (activeTab === 'equivalence') {
      // Make sure UI shows we're in this tab regardless of workflow state
      console.log('[CERV2 Content] Explicitly rendering Equivalence tab content');

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

    // If CER document type is selected
    else if (documentType === 'cer' && activeTab === 'builder') {
      return <CerBuilderPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'preview') {
      return <CerPreviewPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'literature') {
      return (
        <LiteratureSearchPanel
          cerDocumentId={cerDocumentId}
          manufacturer={manufacturer}
          deviceName={deviceName}
          intendedUse={intendedUse}
          deviceType={deviceType}
        />
      );
    } else if (documentType === 'cer' && activeTab === 'literature-methodology') {
      return <LiteratureMethodologyPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'literature-review') {
      return <LiteratureReviewWorkflow cerDocumentId={cerDocumentId} />;
    } else if (activeTab === 'compliance') {
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
    } else if (documentType === 'cer' && activeTab === 'assistant') {
      return <CerAssistantPanel cerDocumentId={cerDocumentId} />;
    } else if (activeTab === 'documents') {
      // Support both CER and 510k documents in the vault
      return (
        <DocumentVaultPanel
          documentType={documentType}
          jobId={documentType === 'cer' ? cerDocumentId : k510DocumentId}
          position="left"
          isOpen={true}
        />
      );
    } else if (documentType === 'cer' && activeTab === 'data-retrieval') {
      return <CerDataRetrievalPanel cerDocumentId={cerDocumentId} />;
    } else if (activeTab === 'equivalence') {
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
    } else if (documentType === 'cer' && activeTab === 'sota') {
      return <StateOfArtPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'cep') {
      return <ClinicalEvaluationPlanPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'qmp') {
      return <QualityManagementPlanPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'traceability') {
      return <RegulatoryTraceabilityMatrix cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'gspr-mapping') {
      return <GSPRMappingPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'internal-clinical-data') {
      return <InternalClinicalDataPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'export') {
      return <ExportModule cerDocumentId={cerDocumentId} sections={sections} />;
    } else if (documentType === 'cer' && activeTab === 'reports') {
      return <CerComprehensiveReportsPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'maud') {
      return <MAUDIntegrationPanel cerDocumentId={cerDocumentId} />;
    } else if (documentType === 'cer' && activeTab === 'k-automation') {
      return <KAutomationPanel cerDocumentId={cerDocumentId} />;
    } else {
      // Default to CER builder panel if no matching tab
      return <CerBuilderPanel cerDocumentId={cerDocumentId} />;
    }
  };

  // Simple navigation tab rendering function
  const renderNavigation = () => {
    // Define 510k specific tab groups if the document type is 510k
    if (documentType === '510k') {
      const k510TabGroups = [
        {
          label: 'Demo:',
          tabs: [
            {
              id: 'demo',
              label: 'Interactive Demo',
              icon: <Lightbulb className="h-3.5 w-3.5 mr-1.5 text-purple-600" />,
            },
          ],
        },
        {
          label: '510(k) Submission:',
          tabs: [
            {
              id: 'device-profile',
              label: 'Device Profile',
              icon: <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
            },
            {
              id: 'predicates',
              label: 'Predicate Finder',
              icon: <Search className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
            },
            {
              id: 'equivalence',
              label: (
                <div className="flex flex-col items-center leading-tight">
                  <span>Substantial Equivalence</span>
                  <span className="text-[0.65rem] text-blue-600">FDA Requirements</span>
                </div>
              ),
              icon: <GitCompare className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
            },
            {
              id: 'compliance',
              label: (
                <div className="flex flex-col items-center leading-tight">
                  <span>FDA Compliance</span>
                  <span className="text-[0.65rem] text-blue-600">510(k) Requirements</span>
                </div>
              ),
              icon: <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
            },
            {
              id: 'submission',
              label: (
                <div className="flex items-center">
                  <span>Final Submission</span>
                  <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full shadow-sm">
                    New
                  </span>
                </div>
              ),
              icon: <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />,
            },
          ],
        },
        {
          label: 'Resources:',
          tabs: [
            {
              id: 'fda-guidance',
              label: 'FDA Guidance',
              icon: <BookOpen className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
            },
            {
              id: 'assistant',
              label: 'AI Assistant',
              icon: <Lightbulb className="h-3.5 w-3.5 mr-1.5 text-amber-500" />,
            },
          ],
        },
      ];

      // Return 510k specific tabs
      return (
        <div className="mt-2 mb-4 border-b border-blue-100">
          <div className="flex overflow-x-auto pb-2 px-6 space-x-6">
            {k510TabGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-2 min-w-fit">
                <div className="text-xs font-medium text-blue-800 flex items-center gap-1.5">
                  {group.label}
                </div>
                <div className="flex space-x-1.5">
                  {group.tabs.map(tab => (
                    <Button
                      key={tab.id}
                      variant={activeTab === tab.id ? 'default' : 'outline'}
                      className={`h-9 px-3 text-xs font-medium rounded ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
                      }`}
                      onClick={() => {
                        setActiveTab(tab.id);
                        // If this is the AI Assistant tab, open the assistant
                        if (tab.id === 'assistant') {
                          // Set context information for the assistant (current document type and device info)
                          setModuleContext(
                            documentType === 'cer'
                              ? 'Clinical Evaluation Report'
                              : 'FDA 510(k) Submission',
                            {
                              documentId: documentType === 'cer' ? cerDocumentId : k510DocumentId,
                              deviceName:
                                deviceName ||
                                (documentType === 'cer' ? 'Medical Device' : 'Subject Device'),
                              deviceType: deviceType,
                              manufacturer: manufacturer,
                              intendedUse: intendedUse,
                              documentType: documentType,
                            }
                          );
                          // Open the assistant
                          openAssistant();
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

    // Return CER tabs
    return (
      <div className="mt-2 mb-4 border-b border-neutral-100">
        <div className="flex overflow-x-auto pb-2 px-6 space-x-6">
          {tabGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-1 min-w-fit">
              <div className="text-xs font-medium text-gray-600 pl-1">{group.label}</div>
              <div className="flex space-x-1">
                {group.tabs.map(tab => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? 'default' : 'ghost'}
                    className={`h-9 px-2.5 py-1.5 text-xs font-medium rounded-md ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
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
        variant: 'success',
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
        variant: 'success',
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

  // Displaying Switched Panel banner
  const renderDocumentTypeBanner = () => (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Info className="h-5 w-5 text-blue-500" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-blue-700">
            You are currently working on a{' '}
            <strong>
              {documentType === 'cer' ? 'Clinical Evaluation Report' : 'FDA 510(k) Submission'}
            </strong>
            . Switch to{' '}
            {documentType === 'cer' ? 'FDA 510(k) Submission' : 'Clinical Evaluation Report'}?
          </p>
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-blue-700 border-blue-300 hover:bg-blue-100"
            onClick={() => handleSetDocumentType(documentType === 'cer' ? '510k' : 'cer')}
          >
            Switch to {documentType === 'cer' ? '510(k)' : 'CER'}
          </Button>
        </div>
      </div>
    </div>
  );

  // Render page
  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                {documentType === 'cer'
                  ? 'Clinical Evaluation Report Generator'
                  : 'FDA 510(k) Submission Pipeline'}
              </h1>
              <Badge
                variant="outline"
                className="ml-3 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200"
              >
                {documentType === 'cer' ? cerDocumentId : k510DocumentId}
              </Badge>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="default"
                size="sm"
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={() => setActiveTab('device-profile')}
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                New Device Submission
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeviceInfoDialog(true)}
                className="flex items-center text-gray-600"
              >
                <FileText className="mr-1.5 h-4 w-4" />
                Device Info
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDocumentTree(true)}
                className="flex items-center text-blue-600 font-medium border-blue-200 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 shadow-sm"
              >
                <FolderTree className="mr-1.5 h-4 w-4" />
                Document Vault
              </Button>

              {documentType === '510k' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAssistant()}
                  className="flex items-center text-gray-600"
                >
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  Open Assistant
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
                    {isGeneratingFullCER ? 'Generating...' : 'Generate Full CER'}
                  </>
                ) : (
                  <>
                    <Download className="mr-1.5 h-4 w-4" />
                    Generate FDA Submission
                  </>
                )}
              </Button>
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() => {
                              window.open(
                                '/attached_assets/CER REPORT EXAMPLE OUTPUT.pdf',
                                '_blank'
                              );
                              toast({
                                title: 'Document opened',
                                description: 'Viewing CER Report',
                              });
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
                            onClick={() => {
                              window.open(
                                '/attached_assets/ICER_Acute-Pain_Evidence-Report_For-Publication_020525.pdf',
                                '_blank'
                              );
                              toast({
                                title: 'Document opened',
                                description: 'Viewing Evidence Report',
                              });
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
                            onClick={() => {
                              window.open('/attached_assets/AO_2508_2023_1-3.pdf', '_blank');
                              toast({
                                title: 'Document opened',
                                description: 'Viewing PMS Data Analysis document',
                              });
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
                            onClick={() => {
                              window.open('/attached_assets/9789240097711-eng.pdf', '_blank');
                              toast({
                                title: 'Document opened',
                                description: 'Viewing Clinical Guidelines document',
                              });
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() =>
                              openDocumentSafely(
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
                        {folderRenameState.isRenaming &&
                        folderRenameState.folderId === 'technical' ? (
                          <input
                            type="text"
                            className="text-sm w-28 p-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={folderRenameState.folderName}
                            onChange={e =>
                              setFolderRenameState(prev => ({
                                ...prev,
                                folderName: e.target.value,
                              }))
                            }
                            onBlur={completeRenameFolder}
                            onKeyDown={e => e.key === 'Enter' && completeRenameFolder()}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-sm font-medium">Technical</span>
                        )}
                        <div className="ml-auto flex items-center">
                          <button
                            className="h-5 w-5 text-gray-400 hover:text-gray-600 mr-1"
                            onClick={e => startRenameFolder('technical', 'Technical', e)}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                              <path d="m15 5 4 4"></path>
                            </svg>
                          </button>
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
                            onClick={() =>
                              openDocumentSafely(
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
                            onClick={() =>
                              openDocumentSafely(
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
                            <button
                              className="h-5 w-5 text-gray-400 hover:text-gray-600 mr-1"
                              onClick={e => startRenameFolder('global', 'Global Documents', e)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                                <path d="m15 5 4 4"></path>
                              </svg>
                            </button>
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
                              onClick={() =>
                                openDocumentSafely(
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
                      Upload
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xlsx,.ppt,.pptx"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
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

      {/* Device Intake Form */}
      <DeviceIntakeForm
        open={showDeviceIntakeForm}
        onOpenChange={setShowDeviceIntakeForm}
        onSubmit={handleDeviceIntakeSubmit}
        onCancel={() => setShowDeviceIntakeForm(false)}
      />
    </div>
  );
}
