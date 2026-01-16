/**
 * FDA 510K Submission Pipeline Service
 * 
 * Complete end-to-end 510(k) submission workflow including:
 * - Predicate device discovery and selection
 * - Substantial equivalence demonstration
 * - Compliance checking
 * - eSTAR file generation
 * - Final submission package assembly
 */

import { io as ioClient } from 'socket.io-client';

let _socket = null;

export const FDA510kPipelineService = {
  // Pipeline states for workflow management
  pipelineStages: {
    DEVICE_PROFILE: 'device_profile',
    PREDICATE_SEARCH: 'predicate_search',
    EQUIVALENCE_ANALYSIS: 'equivalence_analysis',
    COMPLIANCE_CHECK: 'compliance_check',
    SUBMISSION_PACKAGE: 'submission_package',
    FINAL_SUBMISSION: 'final_submission',
  },

  /**
   * Initialize 510(k) submission workflow
   */
  initializePipeline(deviceProfile) {
    return {
      id: `510k_${Date.now()}`,
      deviceProfile: deviceProfile,
      stages: {
        [this.pipelineStages.DEVICE_PROFILE]: { completed: true, data: deviceProfile },
        [this.pipelineStages.PREDICATE_SEARCH]: { completed: false, data: null },
        [this.pipelineStages.EQUIVALENCE_ANALYSIS]: { completed: false, data: null },
        [this.pipelineStages.COMPLIANCE_CHECK]: { completed: false, data: null },
        [this.pipelineStages.SUBMISSION_PACKAGE]: { completed: false, data: null },
        [this.pipelineStages.FINAL_SUBMISSION]: { completed: false, data: null },
      },
      progress: 16, // 1 out of 6 stages complete
      errors: [],
      warnings: [],
      createdAt: new Date().toISOString(),
      submissionNumber: null, // Will be assigned by FDA
    };
  },

  /**
   * STAGE 1: Search for predicate devices with comprehensive FDA integration
   */
  async searchPredicateDevices(deviceProfile, pipelineId = null) {
    try {
      const response = await fetch('/api/fda510k/predicates/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          deviceName: deviceProfile.deviceName,
          deviceClass: deviceProfile.deviceClass,
          productCode: deviceProfile.productCode,
          intendedUse: deviceProfile.intendedUse,
          manufacturer: deviceProfile.manufacturer,
          searchMethod: 'comprehensive', // Uses multiple FDA APIs
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('Predicate search failed');
      }

      const data = await response.json();

      return {
        success: true,
        predicates: data.predicates || [],
        totalFound: data.total || 0,
        searchMetrics: {
          executionTime: data.executionTime,
          queriesExecuted: data.queriesExecuted || 1,
          fdaApiCalls: data.fdaApiCalls || 0,
        },
      };
    } catch (error) {
      console.error('Predicate search error:', error);
      return { success: false, error: error.message, predicates: [] };
    }
  },

  /**
   * Select primary and backup predicates
   */
  selectPredicates(primaryPredicateId, backupPredicateIds = []) {
    return {
      primaryPredicateId,
      backupPredicateIds,
      selectionDate: new Date().toISOString(),
      rationale: {
        similarities: [],
        differences: [],
        regulatoryJustification: '',
      },
    };
  },

  /**
   * STAGE 2: Perform substantial equivalence analysis
   */
  async performEquivalenceAnalysis(deviceProfile, predicates, selectedLiterature = [], pipelineId = null) {
    try {
      const response = await fetch('/api/fda510k/equivalence-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          subjectDevice: deviceProfile,
          predicateDevices: predicates,
          literature: selectedLiterature,
          analysisType: 'comprehensive',
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('Equivalence analysis failed');
      }

      const data = await response.json();
      return {
        success: true,
        equivalenceScore: data.equivalenceScore || 0,
        analysis: {
          similarities: data.similarities || [],
          differences: data.differences || [],
          riskAssessment: data.riskAssessment || {},
          literatureSupport: data.literatureSupport || [],
          complianceIndicators: data.complianceIndicators || [],
        },
        narrative: data.narrative || '',
      };
    } catch (error) {
      console.error('Equivalence analysis error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * STAGE 3: Run comprehensive FDA compliance check
   */
  async runFDAComplianceCheck(deviceProfile, predicates, equivalenceData, pipelineId = null) {
    try {
      const response = await fetch('/api/fda510k/compliance-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          deviceProfile,
          predicates,
          equivalenceData,
          checkType: 'comprehensive',
          includeRiskAnalysis: true,
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('Compliance check failed');
      }

      const data = await response.json();
      return {
        success: true,
        complianceScore: data.complianceScore || 0,
        issues: data.issues || [],
        warnings: data.warnings || [],
        criticalDeficiencies: data.criticalDeficiencies || [],
        recommendations: data.recommendations || [],
        canProceed: (data.complianceScore || 0) >= 85,
      };
    } catch (error) {
      console.error('Compliance check error:', error);
      return { success: false, error: error.message, complianceScore: 0 };
    }
  },

  /**
   * STAGE 4: Generate eSTAR submission file
   */
  async generateESTARFile(deviceProfile, predicates, equivalenceData, complianceData, pipelineId = null) {
    try {
      const response = await fetch('/api/fda510k/generate-estar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          deviceProfile,
          predicates,
          equivalenceData,
          complianceData,
          format: 'estar', // eSTAR format required by FDA
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('eSTAR generation failed');
      }

      const blob = await response.blob();
      const fileName = `510k_${deviceProfile.deviceName?.replace(/\s+/g, '_')}_eSTAR.zip`;

      return {
        success: true,
        blob,
        fileName,
        fileSize: blob.size,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('eSTAR generation error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * STAGE 5: Assemble complete 510(k) submission package
   */
  async assembleSubmissionPackage(
    deviceProfile,
    predicates,
    equivalenceData,
    complianceData,
    editorSections,
    attachments = [],
    pipelineId = null
  ) {
    try {
      const response = await fetch('/api/fda510k/assemble-package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          deviceProfile,
          predicates,
          equivalenceData,
          complianceData,
          sections: editorSections,
          attachments,
          packageType: 'complete_510k',
          timestamp: new Date().toISOString(),
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('Package assembly failed');
      }

      const data = await response.json();
      return {
        success: true,
        packageId: data.packageId,
        contents: {
          mainSummary: data.mainSummary,
          predicateComparison: data.predicateComparison,
          equivalenceStatement: data.equivalenceStatement,
          technicalData: data.technicalData,
          attachments: data.attachments || [],
        },
        fileSize: data.fileSize,
        validationStatus: data.validationStatus || 'pending',
      };
    } catch (error) {
      console.error('Package assembly error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Download submission package for offline review
   */
  async downloadPackage(packageId, format = 'pdf') {
    try {
      const response = await fetch(`/api/fda510k/download-package/${packageId}?format=${format}`, {
        headers: { 'x-organization-id': localStorage.getItem('orgId') || '1' },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const fileName = `510k_submission_${packageId}.${format === 'pdf' ? 'pdf' : 'zip'}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true, fileName, fileSize: blob.size };
    } catch (error) {
      console.error('Download error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * STAGE 6: Submit to FDA (mock for demonstration)
   */
  async submitToFDA(packageId, companyInfo, pipelineId = null) {
    try {
      const response = await fetch('/api/fda510k/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('orgId') || '1',
        },
        body: JSON.stringify({
          packageId,
          companyInfo,
          submissionDate: new Date().toISOString(),
          submissionMethod: 'electronic',
          pipelineId,
        }),
      });

      if (!response.ok) {
        throw new Error('Submission failed');
      }

      const data = await response.json();
      return {
        success: true,
        submissionNumber: data.submissionNumber || 'K' + Math.random().toString().substring(2, 8),
        confirmationNumber: data.confirmationNumber,
        receivedDate: data.receivedDate || new Date().toISOString(),
        estimatedDecisionDate: data.estimatedDecisionDate,
        nextSteps: [
          'FDA receipt confirmation will be sent within 2-3 weeks',
          'Submission will be reviewed for completeness',
          'You will be notified of any deficiencies',
          'Final decision typically within 90 days',
        ],
      };
    } catch (error) {
      console.error('Submission error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Track submission status
   */
  async getSubmissionStatus(submissionNumber) {
    try {
      const response = await fetch(`/api/fda510k/status/${submissionNumber}`, {
        headers: { 'x-organization-id': localStorage.getItem('orgId') || '1' },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Status check error:', error);
      return null;
    }
  },

  /**
   * Get pipeline progress
   */
  getPipelineProgress(stages) {
    const completedStages = Object.values(stages).filter(s => s.completed).length;
    return Math.round((completedStages / Object.keys(stages).length) * 100);
  },

  /**
   * Realtime subscription helper using Socket.IO (optional)
   * Returns an unsubscribe function.
   */
  subscribeToRealtime(pipelineId, handlers = {}) {
    try {
      if (_socket) {
        try { _socket.disconnect(); } catch (e) { /* ignore */ }
        _socket = null;
      }

      _socket = ioClient();

      _socket.on('connect', () => {
        console.log('Realtime connected', _socket.id);
        if (pipelineId) _socket.emit('subscribeTo510k', { pipelineId });
      });

      _socket.on('510k:progress', payload => {
        if (!pipelineId || payload.pipelineId === pipelineId) {
          handlers.onProgress && handlers.onProgress(payload);
        }
      });

      _socket.on('510k:suggestion', payload => {
        if (!pipelineId || payload.pipelineId === pipelineId) {
          handlers.onSuggestion && handlers.onSuggestion(payload);
        }
      });

      _socket.on('510k:completed', payload => {
        if (!pipelineId || payload.pipelineId === pipelineId) {
          handlers.onCompleted && handlers.onCompleted(payload);
        }
      });

      return () => {
        if (_socket) {
          try { _socket.disconnect(); } catch (e) { /* ignore */ }
          _socket = null;
        }
      };
    } catch (err) {
      console.error('subscribeToRealtime error:', err);
      return () => {};
    }
  },

  /**
   * Validate entire submission before FDA upload
   */
  validateSubmission(pipeline) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Check each stage
    if (!pipeline.stages.predicate_search?.completed) {
      validation.errors.push('No predicate devices selected');
      validation.isValid = false;
    }

    if (!pipeline.stages.equivalence_analysis?.completed) {
      validation.errors.push('Substantial equivalence analysis not completed');
      validation.isValid = false;
    }

    if (!pipeline.stages.compliance_check?.completed) {
      validation.errors.push('FDA compliance check not completed');
      validation.isValid = false;
    }

    if (pipeline.stages.compliance_check?.data?.complianceScore < 85) {
      validation.warnings.push('Low compliance score - consider addressing deficiencies');
    }

    return validation;
  },
};

export default FDA510kPipelineService;
