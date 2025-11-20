import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Database,
  FileText,
  SearchCode,
  ChevronRight,
  CheckCircle,
  GitCompare,
  CheckSquare,
  Archive,
  FileCheck,
  ShieldCheck,
  ClipboardSignature,
  History,
  FileOutput,
  Globe,
  Network,
  MapPin,
  ArrowRightLeft,
  Target,
  Workflow,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Import services and components
import { FDA510kService } from '../../services/FDA510kService';
import DeviceProfileList from '../cer/DeviceProfileList';
import PredicateFinderPanel from './PredicateFinderPanel';
import EquivalenceBuilderPanel from './EquivalenceBuilderPanel';
import ComplianceCheckPanel from './ComplianceCheckPanel';
import ReportGenerator from './ReportGenerator';
import ESTARBuilderPanel from './ESTARBuilderPanel';
import ManagerSignOffDialog from './ManagerSignOffDialog';
import ManagerSignOffService from '../../services/ManagerSignOffService';
import AuditTrailPanel from './AuditTrailPanel';

// Cross-Format Harmonizer: Multi-Regional Workflow Orchestration
const REGIONAL_WORKFLOWS = {
  FDA_510K: {
    name: 'FDA 510(k)',
    flag: '🇺🇸',
    color: 'blue',
    steps: [
      { id: 1, name: 'Device Profile', requirement: 'Device description and classification' },
      { id: 2, name: 'Predicate Research', requirement: 'Identify substantial equivalence' },
      { id: 3, name: 'Equivalence Analysis', requirement: 'Compare with predicate devices' },
      { id: 4, name: 'FDA Compliance', requirement: 'Validate FDA requirements' },
      { id: 5, name: 'Submission Package', requirement: 'Generate 510(k) submission' }
    ],
    approvalStages: ['Device Profile Review', 'Predicate Device Selection', 'Substantial Equivalence', 'FDA Compliance Check', 'Final Submission']
  },
  EU_MDR: {
    name: 'EU MDR',
    flag: '🇪🇺',
    color: 'green',
    steps: [
      { id: 1, name: 'Device Profile', requirement: 'Technical documentation and classification' },
      { id: 2, name: 'Clinical Evaluation', requirement: 'Clinical evidence and literature review' },
      { id: 3, name: 'Risk Management', requirement: 'ISO 14971 risk analysis' },
      { id: 4, name: 'MDR Compliance', requirement: 'Validate EU MDR requirements' },
      { id: 5, name: 'Technical File', requirement: 'Generate EU MDR technical file' }
    ],
    approvalStages: ['Technical Documentation', 'Clinical Evidence Review', 'Risk Management Review', 'MDR Compliance Check', 'Technical File Approval']
  },
  HEALTH_CANADA: {
    name: 'Health Canada',
    flag: '🇨🇦',
    color: 'red',
    steps: [
      { id: 1, name: 'Device Profile', requirement: 'Device description and Canadian classification' },
      { id: 2, name: 'Safety Assessment', requirement: 'Safety and effectiveness evaluation' },
      { id: 3, name: 'Quality System', requirement: 'Quality management system documentation' },
      { id: 4, name: 'HC Compliance', requirement: 'Validate Health Canada requirements' },
      { id: 5, name: 'License Application', requirement: 'Generate Health Canada submission' }
    ],
    approvalStages: ['Device Profile Review', 'Safety Assessment', 'Quality System Review', 'HC Compliance Check', 'License Application']
  }
};

// Cross-Format Harmonizer: Workflow synchronization utilities
const WORKFLOW_SYNC_STRATEGIES = {
  PARALLEL: 'parallel',      // Run all regional workflows simultaneously
  SEQUENTIAL: 'sequential',  // Complete one region before starting next
  PRIMARY_FIRST: 'primary_first' // Complete primary market first, then adapt to others
};

/**
 * 510(k) Cross-Format Harmonizer Workflow Panel
 *
 * This component provides multi-regional workflow orchestration for medical device submissions,
 * coordinating workflows across FDA 510(k), EU MDR, and Health Canada requirements with
 * Cross-Format Harmonizer integration and regional manager sign-offs.
 */
const WorkflowPanel = ({
  projectId,
  organizationId,
  deviceProfile,
  setDeviceProfile,
  onComplianceChange,
  onPredicatesFound,
  onEquivalenceComplete,
  onComplianceComplete,
  onSubmissionReady,
  activeStep,
  onStepChange,
  predicates = [],
  complianceStatus = 'draft',
  sections = [],
  // Cross-Format Harmonizer props
  targetMarkets = ['FDA_510K'],
  primaryMarket = 'FDA_510K',
  harmonizationMode = 'single',
}) => {
  // Tab and workflow state
  const [activeTab, setActiveTab] = useState('workflow');
  const [workflowStep, setWorkflowStep] = useState(activeStep || 1);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  
  // Cross-Format Harmonizer: Multi-regional workflow state
  const [selectedRegion, setSelectedRegion] = useState(primaryMarket);
  const [workflowSyncStrategy, setWorkflowSyncStrategy] = useState(WORKFLOW_SYNC_STRATEGIES.PRIMARY_FIRST);
  const [regionalWorkflowStates, setRegionalWorkflowStates] = useState({});
  const [multiRegionalProgress, setMultiRegionalProgress] = useState({});
  const [crossRegionalSyncStatus, setCrossRegionalSyncStatus] = useState('idle');
  const [workflowHarmonizationResults, setWorkflowHarmonizationResults] = useState(null);

  // Device and data state
  const [selectedDeviceProfile, setSelectedDeviceProfile] = useState(deviceProfile || null);
  const [predicatesFound, setPredicatesFound] = useState(false);
  const [predicateDevices, setPredicateDevices] = useState([]);
  const [equivalenceCompleted, setEquivalenceCompleted] = useState(false);
  const [complianceScore, setComplianceScore] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [isComplianceRunning, setIsComplianceRunning] = useState(false);
  const [submissionReady, setSubmissionReady] = useState(false);
  const [exportTimestamp, setExportTimestamp] = useState(null);
  const [draftStatus, setDraftStatus] = useState('in-progress');

  // Loading states
  const [isLoading, setIsLoading] = useState({
    predicateFinder: false,
    complianceChecker: false,
    exportPackage: false,
    workflowTransition: false,
    deviceProfile: false,
    predicates: false,
    equivalence: false,
    compliance: false,
    submission: false,
    signOff: false,
    estarValidation: false,
    estarGeneration: false,
  });

  // ESTAR state
  const [isValidatingESTAR, setIsValidatingESTAR] = useState(false);
  const [isGeneratingESTAR, setIsGeneratingESTAR] = useState(false);
  const [estarValidationResults, setESTARValidationResults] = useState(null);
  const [estarGeneratedUrl, setESTARGeneratedUrl] = useState('');
  const [estarFormat, setESTARFormat] = useState('pdf');

  // Manager sign-off state (enhanced for multi-regional)
  const [showSignOffDialog, setShowSignOffDialog] = useState(false);
  const [currentSignOffStage, setCurrentSignOffStage] = useState('');
  const [signOffHistory, setSignOffHistory] = useState({});
  const [regionalSignOffs, setRegionalSignOffs] = useState({});
  const [pendingRegionalApprovals, setPendingRegionalApprovals] = useState([]);

  const { toast } = useToast();

  // Sync the local selectedDeviceProfile with the parent's deviceProfile
  useEffect(() => {
    if (
      deviceProfile &&
      (!selectedDeviceProfile || deviceProfile.id !== selectedDeviceProfile.id)
    ) {
      setSelectedDeviceProfile(deviceProfile);
    }

    if (selectedDeviceProfile && typeof setDeviceProfile === 'function') {
      setDeviceProfile(selectedDeviceProfile);
    }
  }, [deviceProfile, selectedDeviceProfile, setDeviceProfile]);

  // Load manager sign-off history
  useEffect(() => {
    if (selectedDeviceProfile?.deviceName) {
      try {
        const deviceSignOffs = ManagerSignOffService.getApprovalHistory(
          selectedDeviceProfile.deviceName
        );
        setSignOffHistory(deviceSignOffs);
        console.log('[WorkflowPanel] Loaded sign-off history:', deviceSignOffs);
      } catch (error) {
        console.error('[WorkflowPanel] Error loading sign-off history:', error);
      }
    }
  }, [selectedDeviceProfile]);

  // Cross-Format Harmonizer: Multi-regional workflow orchestration
  const orchestrateMultiRegionalWorkflow = async (action, data) => {
    setCrossRegionalSyncStatus('syncing');
    
    try {
      const orchestrationResult = {
        action,
        timestamp: new Date().toISOString(),
        regions: {},
        syncStrategy: workflowSyncStrategy,
        overallProgress: 0
      };
      
      // Process each target market
      for (const market of targetMarkets) {
        const workflow = REGIONAL_WORKFLOWS[market];
        if (!workflow) continue;
        
        const regionState = regionalWorkflowStates[market] || {
          currentStep: 1,
          completedSteps: [],
          approvals: [],
          progress: 0,
          status: 'pending'
        };
        
        // Apply action to regional workflow
        switch (action) {
          case 'advance_step':
            if (regionState.currentStep < workflow.steps.length) {
              regionState.completedSteps.push(regionState.currentStep);
              regionState.currentStep += 1;
              regionState.progress = (regionState.completedSteps.length / workflow.steps.length) * 100;
            }
            break;
          case 'request_approval':
            const approvalStage = workflow.approvalStages[regionState.currentStep - 1];
            if (approvalStage && !regionState.approvals.includes(approvalStage)) {
              regionState.approvals.push(approvalStage);
              setPendingRegionalApprovals(prev => [
                ...prev.filter(p => p.region !== market),
                { region: market, stage: approvalStage, timestamp: new Date().toISOString() }
              ]);
            }
            break;
          case 'sync_completion':
            regionState.status = 'completed';
            regionState.progress = 100;
            break;
        }
        
        orchestrationResult.regions[market] = regionState;
      }
      
      // Calculate overall progress
      const totalProgress = Object.values(orchestrationResult.regions)
        .reduce((sum, state) => sum + state.progress, 0);
      orchestrationResult.overallProgress = totalProgress / targetMarkets.length;
      
      // Update state
      setRegionalWorkflowStates(orchestrationResult.regions);
      setMultiRegionalProgress(prev => ({ ...prev, ...Object.fromEntries(
        Object.entries(orchestrationResult.regions).map(([region, state]) => [region, state.progress])
      )}));
      
      setWorkflowHarmonizationResults(orchestrationResult);
      
      toast({
        title: 'Multi-Regional Workflow Updated',
        description: `${action.replace('_', ' ')} completed across ${targetMarkets.length} region(s)`,
      });
      
    } catch (error) {
      console.error('Multi-regional workflow orchestration error:', error);
      toast({
        title: 'Workflow Orchestration Error',
        description: 'Failed to synchronize workflows across regions',
        variant: 'destructive',
      });
    } finally {
      setCrossRegionalSyncStatus('idle');
    }
  };
  
  // Enhanced workflow progress calculation with multi-regional support
  const calculateEnhancedProgress = useMemo(() => {
    if (harmonizationMode === 'single' || targetMarkets.length === 1) {
      // Single region progress (legacy calculation)
      const progressMap = {
        1: selectedDeviceProfile ? 20 : 0,
        2: predicatesFound ? 40 : 20,
        3: equivalenceCompleted ? 60 : 40,
        4: complianceScore ? 80 : 60,
        5: submissionReady ? 100 : 80,
      };
      return progressMap[workflowStep] || 0;
    } else {
      // Multi-regional progress calculation
      if (Object.keys(multiRegionalProgress).length === 0) return 0;
      const totalProgress = Object.values(multiRegionalProgress).reduce((sum, progress) => sum + progress, 0);
      return Math.round(totalProgress / targetMarkets.length);
    }
  }, [harmonizationMode, targetMarkets, workflowStep, selectedDeviceProfile, predicatesFound, equivalenceCompleted, complianceScore, submissionReady, multiRegionalProgress]);
  
  // Update workflow progress
  useEffect(() => {
    setWorkflowProgress(calculateEnhancedProgress);
  }, [calculateEnhancedProgress]);
  
  // Initialize regional workflow states
  useEffect(() => {
    if (harmonizationMode === 'multi' && targetMarkets.length > 0) {
      const initialStates = {};
      targetMarkets.forEach(market => {
        if (!regionalWorkflowStates[market]) {
          initialStates[market] = {
            currentStep: 1,
            completedSteps: [],
            approvals: [],
            progress: 0,
            status: 'pending'
          };
        }
      });
      
      if (Object.keys(initialStates).length > 0) {
        setRegionalWorkflowStates(prev => ({ ...prev, ...initialStates }));
      }
    }
  }, [harmonizationMode, targetMarkets]);

  // Enhanced predicate finder with multi-regional support
  const handlePredicateFinder = async foundPredicates => {
    try {
      setPredicateDevices(foundPredicates || []);
      setPredicatesFound(true);

      toast({
        title: 'Predicate Search Complete',
        description: `Found ${foundPredicates?.length || 0} potential predicate devices`,
        variant: 'default',
      });

      // Notify parent of predicate finding completion
      if (typeof onPredicatesFound === 'function') {
        onPredicatesFound(foundPredicates || []);
      }

      // Cross-Format Harmonizer: Orchestrate multi-regional workflow advancement
      if (harmonizationMode === 'multi') {
        await orchestrateMultiRegionalWorkflow('advance_step', { predicates: foundPredicates });
        await orchestrateMultiRegionalWorkflow('request_approval', { stage: 'predicate_selection' });
      } else {
        // Request manager sign-off for single region
        requestManagerSignOff('Predicate Device Selection');
      }
    } catch (error) {
      console.error('[WorkflowPanel] Error handling predicate finder completion:', error);
      toast({
        title: 'Predicate Finder Error',
        description: error.message || 'An error occurred processing predicate devices',
        variant: 'destructive',
      });
    }
  };

  // Handle equivalence completion
  const handleEquivalenceComplete = data => {
    setEquivalenceCompleted(true);

    toast({
      title: 'Equivalence Analysis Complete',
      description: 'Substantial equivalence documentation has been prepared',
      variant: 'default',
    });

    // Notify parent of equivalence completion
    if (typeof onEquivalenceComplete === 'function') {
      onEquivalenceComplete(data);
    }

    // Request manager sign-off for equivalence
    requestManagerSignOff('Substantial Equivalence');
  };

  // Handle compliance check completion
  const handleComplianceComplete = result => {
    setComplianceScore(result.score);
    setCompliance(result);

    toast({
      title: 'Compliance Check Complete',
      description: `Compliance score: ${result.score}%`,
      variant: 'default',
    });

    // Notify parent of compliance completion
    if (typeof onComplianceComplete === 'function') {
      onComplianceComplete(result);
    }

    // Request manager sign-off for compliance
    requestManagerSignOff('FDA Compliance Check');
  };

  // Enhanced final submission with multi-regional support
  const handleSubmissionReady = async data => {
    setSubmissionReady(true);

    toast({
      title: harmonizationMode === 'multi' ? 'Multi-Regional Submissions Ready' : 'Submission Package Ready',
      description: harmonizationMode === 'multi' 
        ? `Submission packages ready for ${targetMarkets.length} region(s)`
        : 'Your 510(k) submission package is ready for final review',
      variant: 'default',
    });

    // Notify parent of submission readiness
    if (typeof onSubmissionReady === 'function') {
      onSubmissionReady(data);
    }

    // Cross-Format Harmonizer: Orchestrate multi-regional workflow completion
    if (harmonizationMode === 'multi') {
      await orchestrateMultiRegionalWorkflow('sync_completion', { submissionData: data });
      await orchestrateMultiRegionalWorkflow('request_approval', { stage: 'final_submission' });
      
      toast({
        title: 'Multi-Regional Workflow Complete',
        description: `Submissions ready for ${targetMarkets.length} region(s)`,
        variant: 'default',
      });
    } else {
      // Request manager sign-off for single region
      requestManagerSignOff('Final Submission');
    }
  };

  // Handle export package
  const handleExportPackage = async () => {
    setIsLoading({ ...isLoading, exportPackage: true });

    try {
      // Set timestamp for the export
      const timestamp = new Date().toISOString();
      setExportTimestamp(timestamp);

      toast({
        title: 'Package Export Started',
        description: 'Your 510(k) submission package is being prepared for export.',
      });

      // Simulate export delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: 'Package Export Complete',
        description: 'Your 510(k) submission package has been successfully exported.',
        variant: 'default',
      });

      // Update status
      setDraftStatus('ready-for-submission');
    } catch (error) {
      console.error('[WorkflowPanel] Error exporting package:', error);
      toast({
        title: 'Export Error',
        description: error.message || 'Could not export the submission package',
        variant: 'destructive',
      });
    } finally {
      setIsLoading({ ...isLoading, exportPackage: false });
    }
  };

  // Handle device profile selection
  const handleDeviceProfileSelect = profile => {
    setSelectedDeviceProfile(profile);

    // Pass the profile up to the parent component if needed
    if (typeof setDeviceProfile === 'function') {
      setDeviceProfile(profile);
    }

    toast({
      title: 'Device Profile Selected',
      description: `${profile.deviceName} has been selected for your 510(k) submission`,
      variant: 'default',
    });
  };

  // Navigation functions
  const goToStep = step => {
    setWorkflowStep(step);

    // Map steps to their corresponding tab values
    const stepToTabValueMap = {
      1: 'workflow',
      2: 'predicates',
      3: 'equivalence',
      4: 'compliance',
      5: 'submission',
    };

    // Change active tab
    setActiveTab(stepToTabValueMap[step] || 'workflow');

    // Notify parent of step change
    if (typeof onStepChange === 'function') {
      onStepChange(step);
    }
  };

  // Manager sign-off functions

  // Request manager sign-off for a specific stage
  const requestManagerSignOff = stageName => {
    setCurrentSignOffStage(stageName);
    setShowSignOffDialog(true);
  };

  // Handle manager sign-off approval
  const handleSignOffApproval = async approvalData => {
    setIsLoading({ ...isLoading, signOff: true });

    try {
      // Record the sign-off
      const signOffRecord = await ManagerSignOffService.recordSignOff({
        ...approvalData,
        deviceName: selectedDeviceProfile?.deviceName || 'Unknown Device',
      });

      // Update local sign-off history
      setSignOffHistory(prev => ({
        ...prev,
        [approvalData.stageName]: signOffRecord,
      }));

      // Continue with workflow transition
      handlePostSignOffTransition(approvalData.stageName);

      return signOffRecord;
    } catch (error) {
      console.error('[WorkflowPanel] Error recording sign-off:', error);
      toast({
        title: 'Sign-Off Error',
        description: error.message || 'Failed to record manager sign-off',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading({ ...isLoading, signOff: false });
    }
  };

  // Handle post-approval workflow transition
  const handlePostSignOffTransition = stageName => {
    // Map stage names to workflow steps
    const stageToStepMap = {
      'Predicate Device Selection': 3, // Go to Substantial Equivalence
      'Substantial Equivalence': 4, // Go to FDA Compliance Check
      'FDA Compliance Check': 5, // Go to Final Submission
      'Final Submission': 5, // Stay on Final Submission
    };

    const nextStep = stageToStepMap[stageName];
    if (nextStep) {
      // Use a small delay to ensure the dialog is closed before transition
      setTimeout(() => {
        goToStep(nextStep);
      }, 500);
    }
  };

  // Check if a stage has been signed off
  const isStageSignedOff = stageName => {
    if (!selectedDeviceProfile?.deviceName) return false;
    return ManagerSignOffService.isStageApproved(stageName, selectedDeviceProfile.deviceName);
  };

  // Render sign-off badge for a stage
  const renderSignOffBadge = stageName => {
    const isApproved = isStageSignedOff(stageName);

    if (isApproved) {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-200 ml-2">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Manager Approved
        </Badge>
      );
    }

    return null;
  };

  // Render the manager sign-off dialog
  const renderManagerSignOffDialog = () => {
    if (!showSignOffDialog) return null;

    // Get requirements for the current stage
    const requirements = ManagerSignOffService.getStageRequirements(currentSignOffStage);

    return (
      <ManagerSignOffDialog
        isOpen={showSignOffDialog}
        onClose={() => setShowSignOffDialog(false)}
        onApprove={handleSignOffApproval}
        stageName={currentSignOffStage}
        deviceName={selectedDeviceProfile?.deviceName}
        requirements={requirements}
      />
    );
  };

  return (
    <>
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b pb-8">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold text-gray-800">
                FDA 510(k) Submission Workflow
              </CardTitle>
              <CardDescription className="text-gray-600 mt-1">
                Guide your medical device through the FDA 510(k) clearance process with our
                step-by-step workflow.
              </CardDescription>
            </div>
            <div>
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                {submissionReady ? 'Ready for Submission' : 'In Progress'}
              </Badge>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium text-gray-500">Workflow Progress</div>
              <div className="text-sm text-gray-500">{workflowProgress}%</div>
            </div>
            <Progress value={workflowProgress} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="workflow">
                <Database className="h-4 w-4 mr-1" />
                Device Profile
              </TabsTrigger>
              <TabsTrigger value="predicates">
                <SearchCode className="h-4 w-4 mr-1" />
                Predicate Devices
                {renderSignOffBadge('Predicate Device Selection')}
              </TabsTrigger>
              <TabsTrigger value="equivalence">
                <GitCompare className="h-4 w-4 mr-1" />
                Substantial Equivalence
                {renderSignOffBadge('Substantial Equivalence')}
              </TabsTrigger>
              <TabsTrigger value="compliance">
                <CheckSquare className="h-4 w-4 mr-1" />
                FDA Compliance
                {renderSignOffBadge('FDA Compliance Check')}
              </TabsTrigger>
              <TabsTrigger value="submission">
                <Archive className="h-4 w-4 mr-1" />
                Final Submission
                {renderSignOffBadge('Final Submission')}
              </TabsTrigger>
              <TabsTrigger value="estar">
                <FileOutput className="h-4 w-4 mr-1" />
                eSTAR Package
              </TabsTrigger>
              <TabsTrigger value="auditTrail">
                <History className="h-4 w-4 mr-1" />
                Audit Trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workflow" className="mt-6">
              <div className="bg-gray-50 rounded-md p-4 mb-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                  <FileCheck className="text-blue-500 mr-2 h-5 w-5" />
                  Device Profile Selection
                </h3>
                <p className="text-gray-600 mt-1 mb-4">
                  Select or create a device profile to begin the 510(k) submission process.
                </p>

                <DeviceProfileList
                  onSelect={handleDeviceProfileSelect}
                  selected={selectedDeviceProfile}
                  isLoading={isLoading.deviceProfile}
                />
              </div>

              {selectedDeviceProfile && (
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => goToStep(2)}
                    disabled={!selectedDeviceProfile || isLoading.workflowTransition}
                  >
                    {isLoading.workflowTransition ? (
                      <>Loading...</>
                    ) : (
                      <>
                        Continue to Predicate Finder
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="predicates" className="space-y-6">
              <PredicateFinderPanel
                deviceProfile={selectedDeviceProfile}
                onPredicatesFound={handlePredicateFinder}
                isLoading={isLoading.predicateFinder}
                predicates={predicateDevices}
                predicatesFound={predicatesFound}
              />

              {predicatesFound && (
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => goToStep(1)}>
                    Back to Device Profile
                  </Button>

                  {isStageSignedOff('Predicate Device Selection') ? (
                    <Button onClick={() => goToStep(3)} disabled={isLoading.workflowTransition}>
                      {isLoading.workflowTransition ? (
                        <>Loading...</>
                      ) : (
                        <>
                          Continue to Equivalence Builder
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => requestManagerSignOff('Predicate Device Selection')}
                      variant="outline"
                      className="bg-blue-50"
                    >
                      <ClipboardSignature className="mr-2 h-4 w-4" />
                      Request Manager Sign-Off
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="equivalence" className="space-y-6">
              <EquivalenceBuilderPanel
                deviceProfile={selectedDeviceProfile}
                predicates={predicateDevices}
                onComplete={handleEquivalenceComplete}
                isComplete={equivalenceCompleted}
              />

              {equivalenceCompleted && (
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => goToStep(2)}>
                    Back to Predicate Finder
                  </Button>

                  {isStageSignedOff('Substantial Equivalence') ? (
                    <Button onClick={() => goToStep(4)} disabled={isLoading.workflowTransition}>
                      {isLoading.workflowTransition ? (
                        <>Loading...</>
                      ) : (
                        <>
                          Continue to Compliance Check
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => requestManagerSignOff('Substantial Equivalence')}
                      variant="outline"
                      className="bg-blue-50"
                    >
                      <ClipboardSignature className="mr-2 h-4 w-4" />
                      Request Manager Sign-Off
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="compliance" className="space-y-6">
              <ComplianceCheckPanel
                deviceProfile={selectedDeviceProfile}
                predicates={predicateDevices}
                onCompleted={handleComplianceComplete}
                isRunning={isComplianceRunning}
                complianceResult={compliance}
                score={complianceScore}
              />

              {complianceScore !== null && (
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => goToStep(3)}>
                    Back to Equivalence Builder
                  </Button>

                  {isStageSignedOff('FDA Compliance Check') ? (
                    <Button onClick={() => goToStep(5)} disabled={isLoading.workflowTransition}>
                      {isLoading.workflowTransition ? (
                        <>Loading...</>
                      ) : (
                        <>
                          Continue to Final Submission
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => requestManagerSignOff('FDA Compliance Check')}
                      variant="outline"
                      className="bg-blue-50"
                    >
                      <ClipboardSignature className="mr-2 h-4 w-4" />
                      Request Manager Sign-Off
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="submission" className="space-y-6">
              <ReportGenerator
                deviceProfile={selectedDeviceProfile}
                predicates={predicateDevices}
                compliance={compliance}
                onSubmissionReady={handleSubmissionReady}
                isReady={submissionReady}
                onExport={handleExportPackage}
                exportTimestamp={exportTimestamp}
                isExporting={isLoading.exportPackage}
              />

              {submissionReady && (
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => goToStep(4)}>
                    Back to Compliance Check
                  </Button>

                  {!isStageSignedOff('Final Submission') && (
                    <Button
                      onClick={() => requestManagerSignOff('Final Submission')}
                      variant="outline"
                      className="bg-blue-50"
                    >
                      <ClipboardSignature className="mr-2 h-4 w-4" />
                      Request Final Manager Sign-Off
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="estar" className="space-y-6">
              <ESTARBuilderPanel
                projectId={projectId}
                deviceProfile={selectedDeviceProfile}
                complianceScore={complianceScore}
                equivalenceData={equivalenceCompleted ? { predicates: predicateDevices } : null}
                onGenerationComplete={result => {
                  setESTARGeneratedUrl(result.downloadUrl);
                  toast({
                    title: 'eSTAR Package Ready',
                    description:
                      'Your eSTAR package has been successfully generated and is ready for FDA submission.',
                    variant: 'default',
                  });
                }}
                onValidationComplete={results => {
                  setESTARValidationResults(results);
                }}
                isValidating={isValidatingESTAR}
                isGenerating={isGeneratingESTAR}
                validationResults={estarValidationResults}
                generatedUrl={estarGeneratedUrl}
                estarFormat={estarFormat}
                setEstarFormat={setESTARFormat}
                setIsValidating={setIsValidatingESTAR}
                setIsGenerating={setIsGeneratingESTAR}
                setValidationResults={setESTARValidationResults}
                setGeneratedUrl={setESTARGeneratedUrl}
              />

              {(estarValidationResults || estarGeneratedUrl) && (
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => goToStep(5)}>
                    Back to Final Submission
                  </Button>

                  {estarGeneratedUrl && (
                    <Button
                      onClick={() => requestManagerSignOff('FDA eSTAR Submission')}
                      variant="outline"
                      className="bg-blue-50"
                    >
                      <ClipboardSignature className="mr-2 h-4 w-4" />
                      Request eSTAR Sign-Off
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="auditTrail" className="space-y-6">
              <AuditTrailPanel
                deviceProfile={selectedDeviceProfile}
                organizationId={organizationId}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Render the manager sign-off dialog */}
      {renderManagerSignOffDialog()}
    </>
  );
};

export default WorkflowPanel;
