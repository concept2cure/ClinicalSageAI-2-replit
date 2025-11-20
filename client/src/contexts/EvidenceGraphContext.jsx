import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { EvidenceType, ValidationStatus, EvidenceCategory } from '@shared/evidenceSchema';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

const EvidenceGraphContext = createContext(null);

export function EvidenceGraphProvider({ children }) {
  const [evidenceGraph, setEvidenceGraph] = useState(new Map());
  const [publishers, setPublishers] = useState(new Map());
  
  // Collect evidence from a specific source
  const collectEvidence = useCallback((sourceRef) => {
    const evidence = evidenceGraph.get(sourceRef) || [];
    return evidence;
  }, [evidenceGraph]);
  
  // Add evidence from any CERV2 feature
  const addEvidence = useCallback((evidence) => {
    setEvidenceGraph(prev => {
      const newGraph = new Map(prev);
      const sourceEvidence = newGraph.get(evidence.sourceRef) || [];
      
      // Check if evidence already exists and update it
      const existingIndex = sourceEvidence.findIndex(e => e.id === evidence.id);
      if (existingIndex >= 0) {
        sourceEvidence[existingIndex] = evidence;
      } else {
        sourceEvidence.push(evidence);
      }
      
      newGraph.set(evidence.sourceRef, sourceEvidence);
      return newGraph;
    });
    
    // Notify document editor of new evidence
    queryClient.invalidateQueries({ queryKey: ['document-evidence'] });
  }, []);
  
  // Bulk add evidence
  const addBulkEvidence = useCallback((evidenceArray) => {
    evidenceArray.forEach(evidence => addEvidence(evidence));
  }, [addEvidence]);
  
  // Update existing evidence
  const updateEvidence = useCallback((id, updates) => {
    setEvidenceGraph(prev => {
      const newGraph = new Map(prev);
      
      for (const [source, evidenceList] of newGraph.entries()) {
        const index = evidenceList.findIndex(e => e.id === id);
        if (index >= 0) {
          evidenceList[index] = { ...evidenceList[index], ...updates };
          newGraph.set(source, evidenceList);
          break;
        }
      }
      
      return newGraph;
    });
    
    queryClient.invalidateQueries({ queryKey: ['document-evidence'] });
  }, []);
  
  // Get all evidence by type
  const getEvidenceByType = useCallback((type) => {
    const allEvidence = [];
    for (const evidenceList of evidenceGraph.values()) {
      allEvidence.push(...evidenceList.filter(e => e.evidenceType === type));
    }
    return allEvidence;
  }, [evidenceGraph]);
  
  // Get all evidence for a specific 510(k) section
  const getEvidenceForSection = useCallback((sectionId) => {
    const sectionEvidence = {
      required: [],
      optional: [],
      all: []
    };
    
    // Map section IDs to evidence types
    const sectionMappings = {
      'cover-letter': {
        required: [EvidenceType.DEVICE_PROFILE],
        optional: [EvidenceType.TIMELINE_MILESTONE, EvidenceType.AI_RECOMMENDATION]
      },
      'substantial-equivalence': {
        required: [EvidenceType.PREDICATE_DEVICE, EvidenceType.SUBSTANTIAL_EQUIVALENCE],
        optional: [EvidenceType.RISK_ASSESSMENT]
      },
      'device-description': {
        required: [EvidenceType.DEVICE_SPECIFICATION],
        optional: [EvidenceType.MANUFACTURING_PROCESS, EvidenceType.QUALITY_CONTROL]
      },
      'performance-testing': {
        required: [EvidenceType.BENCH_TEST],
        optional: [EvidenceType.ELECTRICAL_SAFETY_TEST, EvidenceType.SOFTWARE_VALIDATION]
      },
      'clinical-data': {
        required: [],
        optional: [
          EvidenceType.CLINICAL_TRIAL,
          EvidenceType.LITERATURE_ARTICLE,
          EvidenceType.STATISTICAL_ANALYSIS,
          EvidenceType.ADVERSE_EVENT,
          EvidenceType.MAUDE_REPORT
        ]
      },
      'biocompatibility': {
        required: [],
        optional: [EvidenceType.BIOCOMPATIBILITY_TEST]
      },
      'sterilization': {
        required: [],
        optional: [EvidenceType.STERILIZATION_VALIDATION]
      },
      'labeling': {
        required: [EvidenceType.DEVICE_PROFILE],
        optional: [EvidenceType.RISK_MITIGATION]
      },
      'certifications': {
        required: [EvidenceType.REGULATORY_COMPLIANCE],
        optional: [EvidenceType.QUALITY_CONTROL, EvidenceType.SUPPLIER_AUDIT]
      }
    };
    
    const mapping = sectionMappings[sectionId];
    if (mapping) {
      mapping.required.forEach(type => {
        sectionEvidence.required.push(...getEvidenceByType(type));
      });
      mapping.optional.forEach(type => {
        sectionEvidence.optional.push(...getEvidenceByType(type));
      });
      sectionEvidence.all = [...sectionEvidence.required, ...sectionEvidence.optional];
    }
    
    return sectionEvidence;
  }, [getEvidenceByType]);
  
  // Generate citations for evidence
  const generateCitations = useCallback((evidenceIds) => {
    const citations = [];
    let citationIndex = 1;
    
    for (const evidenceList of evidenceGraph.values()) {
      for (const evidence of evidenceList) {
        if (evidenceIds.includes(evidence.id)) {
          citations.push({
            id: `cite-${citationIndex}`,
            index: citationIndex,
            type: evidence.sourceRef.includes('pubmed') ? 'external' : 'internal',
            source: evidence.sourceRef,
            reference: evidence.data?.title || evidence.data?.name || evidence.id,
            url: evidence.data?.url || evidence.data?.link,
            accessDate: new Date(),
            evidenceId: evidence.id,
            confidence: evidence.confidence
          });
          citationIndex++;
        }
      }
    }
    
    return citations;
  }, [evidenceGraph]);
  
  // Register a feature as an evidence publisher
  const registerPublisher = useCallback((sourceRef, publisher) => {
    setPublishers(prev => {
      const newPublishers = new Map(prev);
      newPublishers.set(sourceRef, publisher);
      return newPublishers;
    });
  }, []);
  
  // Collect evidence from all registered publishers
  const collectAllEvidence = useCallback(async () => {
    const allEvidence = [];
    
    for (const [source, publisher] of publishers.entries()) {
      try {
        const evidence = await publisher.publishEvidence();
        allEvidence.push(...evidence);
      } catch (error) {
        console.error(`Failed to collect evidence from ${source}:`, error);
      }
    }
    
    addBulkEvidence(allEvidence);
    return allEvidence;
  }, [publishers, addBulkEvidence]);
  
  // Validate evidence completeness for a section
  const validateSectionCompleteness = useCallback((sectionId) => {
    const sectionEvidence = getEvidenceForSection(sectionId);
    const sectionMappings = {
      'cover-letter': {
        required: [EvidenceType.DEVICE_PROFILE]
      },
      'substantial-equivalence': {
        required: [EvidenceType.PREDICATE_DEVICE]
      },
      'performance-testing': {
        required: [EvidenceType.BENCH_TEST]
      }
    };
    
    const mapping = sectionMappings[sectionId];
    if (!mapping) {
      return { complete: true, missing: [], confidence: 1.0 };
    }
    
    const missing = [];
    let totalConfidence = 0;
    let evidenceCount = 0;
    
    mapping.required.forEach(type => {
      const evidence = getEvidenceByType(type);
      if (evidence.length === 0) {
        missing.push(type);
      } else {
        evidence.forEach(e => {
          totalConfidence += e.confidence || 0;
          evidenceCount++;
        });
      }
    });
    
    return {
      complete: missing.length === 0,
      missing,
      confidence: evidenceCount > 0 ? totalConfidence / evidenceCount : 0
    };
  }, [getEvidenceForSection, getEvidenceByType]);
  
  // Export the entire evidence graph for debugging or persistence
  const exportEvidenceGraph = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      sources: {},
      statistics: {
        totalEvidence: 0,
        byType: {},
        bySource: {},
        byValidation: {}
      }
    };
    
    for (const [source, evidenceList] of evidenceGraph.entries()) {
      exportData.sources[source] = evidenceList;
      exportData.statistics.totalEvidence += evidenceList.length;
      exportData.statistics.bySource[source] = evidenceList.length;
      
      evidenceList.forEach(evidence => {
        exportData.statistics.byType[evidence.evidenceType] = 
          (exportData.statistics.byType[evidence.evidenceType] || 0) + 1;
        exportData.statistics.byValidation[evidence.validationStatus] = 
          (exportData.statistics.byValidation[evidence.validationStatus] || 0) + 1;
      });
    }
    
    return exportData;
  }, [evidenceGraph]);
  
  const value = {
    evidenceGraph,
    addEvidence,
    addBulkEvidence,
    updateEvidence,
    collectEvidence,
    getEvidenceByType,
    getEvidenceForSection,
    generateCitations,
    registerPublisher,
    collectAllEvidence,
    validateSectionCompleteness,
    exportEvidenceGraph
  };
  
  return (
    <EvidenceGraphContext.Provider value={value}>
      {children}
    </EvidenceGraphContext.Provider>
  );
}

export function useEvidenceGraph() {
  const context = useContext(EvidenceGraphContext);
  if (!context) {
    throw new Error('useEvidenceGraph must be used within an EvidenceGraphProvider');
  }
  return context;
}