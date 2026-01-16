/**
 * Hook to integrate mock demo data with FDA510kPipelineService and DocumentEditorService
 * Provides seamless data flow between components and services
 */

import { useState, useCallback, useEffect } from 'react';
import mockDemoData from '@/data/mockDemoData';
import FDA510kPipelineService from '@/services/FDA510kPipelineService';
import DocumentEditorService from '@/services/DocumentEditorService';

export const useDemoDataIntegration = (onError = null) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('midstage');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [workflowData, setWorkflowData] = useState({
    deviceProfile: null,
    predicateDevices: [],
    equivalenceAnalysis: null,
    complianceCheck: null,
    submissionPackage: null,
    fdaSubmission: null,
  });

  /**
   * Load a specific device from demo data into workflow
   */
  const loadDeviceToWorkflow = useCallback(
    async (deviceId) => {
      setIsLoading(true);
      try {
        const device = mockDemoData.mockDeviceProfiles.find(d => d.id === deviceId);
        if (!device) {
          throw new Error(`Device with ID ${deviceId} not found`);
        }

        // Set selected device
        setSelectedDevice(device);

        // Build workflow data from device and scenario
        const scenario = mockDemoData.mockDemoScenarios[selectedScenario];
        const scenarioDevices = scenario?.devices || [];
        const deviceInScenario = scenarioDevices.find(d => d.id === deviceId);

        // Extract predicates used in this scenario
        const predicates = scenario?.predicates || mockDemoData.mockPredicateDevices.slice(0, 2);

        // Get equivalence analysis if available
        const equivalence =
          scenario?.equivalences?.[0] || mockDemoData.mockEquivalenceAnalyses?.[0];

        // Get compliance check if available
        const compliance = scenario?.compliance?.[0] || mockDemoData.mockComplianceChecks?.[0];

        // Update workflow data
        setWorkflowData({
          deviceProfile: device,
          predicateDevices: predicates,
          equivalenceAnalysis: equivalence,
          complianceCheck: compliance,
          submissionPackage: mockDemoData.mockSubmissionPackages?.[0],
          fdaSubmission: mockDemoData.mockFDASubmissions?.[0],
        });

        return device;
      } catch (error) {
        console.error('Error loading device to workflow:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [selectedScenario, onError]
  );

  /**
   * Load entire scenario into workflow
   */
  const loadScenarioToWorkflow = useCallback(
    async (scenarioName) => {
      setIsLoading(true);
      try {
        const scenario = mockDemoData.mockDemoScenarios[scenarioName];
        if (!scenario) {
          throw new Error(`Scenario "${scenarioName}" not found`);
        }

        setSelectedScenario(scenarioName);

        // Load first device in scenario
        if (scenario.devices && scenario.devices.length > 0) {
          return loadDeviceToWorkflow(scenario.devices[0].id);
        }

        return null;
      } catch (error) {
        console.error('Error loading scenario to workflow:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [loadDeviceToWorkflow, onError]
  );

  /**
   * Search for predicate devices using the pipeline service
   */
  const searchPredicateDevices = useCallback(
    async (queryParams) => {
      setIsLoading(true);
      try {
        // Use service to search predicates
        const results = await FDA510kPipelineService.searchPredicateDevices(queryParams);

        if (results && results.length > 0) {
          setWorkflowData(prev => ({
            ...prev,
            predicateDevices: results,
          }));
        }

        return results;
      } catch (error) {
        console.error('Error searching predicate devices:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onError]
  );

  /**
   * Analyze equivalence using the pipeline service
   */
  const analyzeEquivalence = useCallback(
    async (deviceData, predicateIds) => {
      setIsLoading(true);
      try {
        const analysis = await FDA510kPipelineService.analyzeEquivalence({
          device: deviceData,
          predicateIds: predicateIds,
        });

        setWorkflowData(prev => ({
          ...prev,
          equivalenceAnalysis: analysis,
        }));

        return analysis;
      } catch (error) {
        console.error('Error analyzing equivalence:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onError]
  );

  /**
   * Run compliance check using the pipeline service
   */
  const runComplianceCheck = useCallback(
    async (deviceData, equivalenceData) => {
      setIsLoading(true);
      try {
        const check = await FDA510kPipelineService.runComplianceCheck({
          device: deviceData,
          equivalence: equivalenceData,
        });

        setWorkflowData(prev => ({
          ...prev,
          complianceCheck: check,
        }));

        return check;
      } catch (error) {
        console.error('Error running compliance check:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onError]
  );

  /**
   * Edit a document section using the document editor service
   */
  const editDocumentSection = useCallback(
    async (documentId, sectionId, content) => {
      setIsLoading(true);
      try {
        const updatedSection = await DocumentEditorService.saveSectionContent(
          documentId,
          sectionId,
          content
        );

        return updatedSection;
      } catch (error) {
        console.error('Error editing document section:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onError]
  );

  /**
   * Export document in specified format
   */
  const exportDocument = useCallback(
    async (documentId, format = 'pdf') => {
      setIsLoading(true);
      try {
        const exportData = await DocumentEditorService.exportDocument(documentId, format);

        return exportData;
      } catch (error) {
        console.error('Error exporting document:', error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onError]
  );

  /**
   * Get current workflow progress
   */
  const getWorkflowProgress = useCallback(() => {
    const stages = {
      deviceProfile: workflowData.deviceProfile ? 1 : 0,
      predicates: workflowData.predicateDevices.length > 0 ? 1 : 0,
      equivalence: workflowData.equivalenceAnalysis ? 1 : 0,
      compliance: workflowData.complianceCheck ? 1 : 0,
      submission: workflowData.submissionPackage ? 1 : 0,
    };

    const completedStages = Object.values(stages).reduce((sum, val) => sum + val, 0);
    const totalStages = Object.keys(stages).length;

    return {
      stages,
      completedStages,
      totalStages,
      percentComplete: Math.round((completedStages / totalStages) * 100),
    };
  }, [workflowData]);

  /**
   * Reset all workflow data
   */
  const resetWorkflow = useCallback(() => {
    setSelectedDevice(null);
    setWorkflowData({
      deviceProfile: null,
      predicateDevices: [],
      equivalenceAnalysis: null,
      complianceCheck: null,
      submissionPackage: null,
      fdaSubmission: null,
    });
  }, []);

  return {
    // State
    isLoading,
    selectedScenario,
    selectedDevice,
    workflowData,

    // Actions
    loadDeviceToWorkflow,
    loadScenarioToWorkflow,
    searchPredicateDevices,
    analyzeEquivalence,
    runComplianceCheck,
    editDocumentSection,
    exportDocument,
    getWorkflowProgress,
    resetWorkflow,

    // Data access
    scenarios: mockDemoData.mockDemoScenarios,
    allDevices: mockDemoData.mockDeviceProfiles,
    allDocuments: mockDemoData.mockDocuments,
  };
};

export default useDemoDataIntegration;
