/**
 * Submission Context for Shared Data Between IND Wizard and eCTD Co-Author
 * 
 * This context manages the shared submission data that flows between
 * the IND Wizard module and the eCTD Co-Author module, enabling seamless
 * data exchange and state synchronization.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const SubmissionContext = createContext(null);

export const useSubmissionContext = () => {
  const context = useContext(SubmissionContext);
  if (!context) {
    throw new Error('useSubmissionContext must be used within a SubmissionProvider');
  }
  return context;
};

export const SubmissionProvider = ({ children }) => {
  // Core submission state
  const [submissionId, setSubmissionId] = useState(null);
  const [submissionType, setSubmissionType] = useState('IND'); // IND, NDA, BLA, etc.
  const [submissionStatus, setSubmissionStatus] = useState('draft');
  
  // Document storage - shared between modules
  const [documents, setDocuments] = useState([]);
  
  // Module completion tracking
  const [moduleCompletion, setModuleCompletion] = useState({
    module1: { status: 'not_started', progress: 0, documents: [] },
    module2: { status: 'not_started', progress: 0, documents: [] },
    module3: { status: 'not_started', progress: 0, documents: [] },
    module4: { status: 'not_started', progress: 0, documents: [] },
    module5: { status: 'not_started', progress: 0, documents: [] },
  });
  
  // Shared metadata between modules
  const [submissionMetadata, setSubmissionMetadata] = useState({
    sponsor: {
      name: '',
      address: '',
      contact: '',
      email: '',
      phone: '',
    },
    product: {
      name: '',
      activeIngredient: '',
      dosageForm: '',
      indication: '',
      therapeuticArea: '',
      phase: '',
    },
    regulatory: {
      applicationNumber: '',
      sequenceNumber: '',
      submissionDate: null,
      region: 'US FDA',
      type: 'Original',
    },
    investigator: {
      principalInvestigator: '',
      institution: '',
      protocol: '',
    }
  });

  // IND Wizard specific data
  const [indWizardData, setIndWizardData] = useState({
    currentStep: null,
    completedSteps: [],
    formData: {},
    uploadedDocuments: [],
  });

  // eCTD Co-Author specific data
  const [ectdData, setEctdData] = useState({
    activeModule: null,
    compiledSections: [],
    validationStatus: {},
  });

  /**
   * Add a document to the submission
   * @param {Object} document - Document object with metadata
   */
  const addDocument = useCallback((document) => {
    const newDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'IND Wizard',
      status: 'uploaded',
      ...document,
    };

    setDocuments(prev => [...prev, newDocument]);

    // Update module completion if module is specified
    if (document.module) {
      const moduleKey = `module${document.module}`;
      setModuleCompletion(prev => ({
        ...prev,
        [moduleKey]: {
          ...prev[moduleKey],
          documents: [...(prev[moduleKey]?.documents || []), newDocument.id],
          status: 'in_progress',
          progress: Math.min(100, (prev[moduleKey]?.progress || 0) + 10),
        }
      }));
    }

    return newDocument.id;
  }, []);

  /**
   * Update an existing document
   * @param {string} documentId - ID of the document to update
   * @param {Object} updates - Updates to apply to the document
   */
  const updateDocument = useCallback((documentId, updates) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === documentId ? { ...doc, ...updates, updatedAt: new Date().toISOString() } : doc
    ));
  }, []);

  /**
   * Remove a document from the submission
   * @param {string} documentId - ID of the document to remove
   */
  const removeDocument = useCallback((documentId) => {
    setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    
    // Remove from module completion tracking
    setModuleCompletion(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(module => {
        if (updated[module].documents) {
          updated[module].documents = updated[module].documents.filter(id => id !== documentId);
        }
      });
      return updated;
    });
  }, []);

  /**
   * Get documents by module ID
   * @param {string} moduleId - Module identifier (1, 2, 3, 4, 5, or specific section)
   */
  const getDocumentsByModule = useCallback((moduleId) => {
    return documents.filter(doc => {
      // Handle various module ID formats
      const normalizedModule = String(doc.module).replace('module', '');
      const normalizedQuery = String(moduleId).replace('module', '');
      
      // Check for exact match or section match (e.g., 2.5 matches module 2)
      return normalizedModule === normalizedQuery || 
             normalizedModule.startsWith(normalizedQuery + '.') ||
             (doc.section && doc.section.startsWith(normalizedQuery));
    });
  }, [documents]);

  /**
   * Get all documents for eCTD compilation
   */
  const getAllDocuments = useCallback(() => {
    return documents.map(doc => ({
      ...doc,
      moduleDisplay: doc.module ? `Module ${doc.module}` : 'Unassigned',
      canCompile: doc.status === 'uploaded' || doc.status === 'validated',
    }));
  }, [documents]);

  /**
   * Update submission metadata
   * @param {Object} data - Metadata to update
   */
  const updateSubmissionMetadata = useCallback((data) => {
    setSubmissionMetadata(prev => {
      // Deep merge the data
      const updated = { ...prev };
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'object' && !Array.isArray(data[key]) && data[key] !== null) {
          updated[key] = { ...prev[key], ...data[key] };
        } else {
          updated[key] = data[key];
        }
      });
      return updated;
    });
  }, []);

  /**
   * Get overall submission progress
   */
  const getSubmissionProgress = useCallback(() => {
    const modules = Object.values(moduleCompletion);
    const totalProgress = modules.reduce((sum, module) => sum + (module.progress || 0), 0);
    const averageProgress = modules.length > 0 ? totalProgress / modules.length : 0;
    
    const completedModules = modules.filter(m => m.status === 'completed').length;
    const inProgressModules = modules.filter(m => m.status === 'in_progress').length;
    const notStartedModules = modules.filter(m => m.status === 'not_started').length;
    
    return {
      overall: Math.round(averageProgress),
      byModule: moduleCompletion,
      summary: {
        completed: completedModules,
        inProgress: inProgressModules,
        notStarted: notStartedModules,
        total: modules.length,
      },
      documentsCount: documents.length,
      readyForSubmission: averageProgress === 100 && documents.length > 0,
    };
  }, [moduleCompletion, documents]);

  /**
   * Update module completion status
   * @param {string} moduleId - Module identifier
   * @param {Object} status - Status update object
   */
  const updateModuleCompletion = useCallback((moduleId, status) => {
    const moduleKey = moduleId.startsWith('module') ? moduleId : `module${moduleId}`;
    setModuleCompletion(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        ...status,
        updatedAt: new Date().toISOString(),
      }
    }));
  }, []);

  /**
   * Initialize a new submission
   */
  const initializeSubmission = useCallback((type = 'IND') => {
    const newSubmissionId = `SUB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSubmissionId(newSubmissionId);
    setSubmissionType(type);
    setSubmissionStatus('draft');
    
    // Reset other state
    setDocuments([]);
    setModuleCompletion({
      module1: { status: 'not_started', progress: 0, documents: [] },
      module2: { status: 'not_started', progress: 0, documents: [] },
      module3: { status: 'not_started', progress: 0, documents: [] },
      module4: { status: 'not_started', progress: 0, documents: [] },
      module5: { status: 'not_started', progress: 0, documents: [] },
    });
    
    return newSubmissionId;
  }, []);

  /**
   * Clear all submission data
   */
  const clearSubmission = useCallback(() => {
    setSubmissionId(null);
    setDocuments([]);
    setModuleCompletion({
      module1: { status: 'not_started', progress: 0, documents: [] },
      module2: { status: 'not_started', progress: 0, documents: [] },
      module3: { status: 'not_started', progress: 0, documents: [] },
      module4: { status: 'not_started', progress: 0, documents: [] },
      module5: { status: 'not_started', progress: 0, documents: [] },
    });
    setSubmissionMetadata({
      sponsor: { name: '', address: '', contact: '', email: '', phone: '' },
      product: { name: '', activeIngredient: '', dosageForm: '', indication: '', therapeuticArea: '', phase: '' },
      regulatory: { applicationNumber: '', sequenceNumber: '', submissionDate: null, region: 'US FDA', type: 'Original' },
      investigator: { principalInvestigator: '', institution: '', protocol: '' },
    });
    setIndWizardData({ currentStep: null, completedSteps: [], formData: {}, uploadedDocuments: [] });
    setEctdData({ activeModule: null, compiledSections: [], validationStatus: {} });
  }, []);

  /**
   * Save IND Wizard state
   */
  const saveIndWizardState = useCallback((state) => {
    setIndWizardData(prev => ({ ...prev, ...state }));
  }, []);

  /**
   * Save eCTD Co-Author state
   */
  const saveEctdState = useCallback((state) => {
    setEctdData(prev => ({ ...prev, ...state }));
  }, []);

  /**
   * Get shared data for cross-module communication
   */
  const getSharedData = useCallback(() => {
    return {
      submissionId,
      submissionType,
      submissionStatus,
      metadata: submissionMetadata,
      documents: documents.length,
      progress: getSubmissionProgress(),
      lastUpdated: new Date().toISOString(),
    };
  }, [submissionId, submissionType, submissionStatus, submissionMetadata, documents, getSubmissionProgress]);

  // Auto-initialize submission if none exists
  useEffect(() => {
    if (!submissionId) {
      initializeSubmission('IND');
    }
  }, [submissionId, initializeSubmission]);

  const value = {
    // Core state
    submissionId,
    submissionType,
    submissionStatus,
    documents,
    moduleCompletion,
    submissionMetadata,
    
    // Module-specific state
    indWizardData,
    ectdData,
    
    // Document methods
    addDocument,
    updateDocument,
    removeDocument,
    getDocumentsByModule,
    getAllDocuments,
    
    // Metadata methods
    updateSubmissionMetadata,
    
    // Progress methods
    getSubmissionProgress,
    updateModuleCompletion,
    
    // Submission methods
    initializeSubmission,
    clearSubmission,
    
    // Module state methods
    saveIndWizardState,
    saveEctdState,
    
    // Shared data access
    getSharedData,
    
    // Setters for direct state updates
    setSubmissionStatus,
    setSubmissionType,
  };

  return (
    <SubmissionContext.Provider value={value}>
      {children}
    </SubmissionContext.Provider>
  );
};