import React, { createContext, useState, useContext, useEffect } from 'react';
import { listDocs, uploadDoc } from '../hooks/useDocuShare';

// Sample documents organized by module with appropriate content
const MODULE_SAMPLE_DOCUMENTS = {
  // General documents for the main document management
  default: [
    {
      objectId: 'doc1',
      displayName: 'General-Company-Procedures-2025.pdf',
      contentUrl: '#',
      type: 'Standard Operating Procedure',
      lastModified: '2025-04-15',
      status: 'Final',
      author: 'Regulatory Affairs',
      module: 'general',
      tags: ['SOP', 'Procedures'],
    },
    {
      objectId: 'doc2',
      displayName: 'Document-Management-Guidelines.pdf',
      contentUrl: '#',
      type: 'Guidelines',
      lastModified: '2025-04-10',
      status: 'Final',
      author: 'Quality Assurance',
      module: 'general',
      tags: ['Guidelines', 'Quality'],
    },
  ],

  // IND module specific documents
  ind: [
    {
      objectId: 'ind1',
      displayName: 'IND-12345-Protocol-v1.2.pdf',
      contentUrl: '#',
      type: 'Clinical Protocol',
      lastModified: '2025-04-15',
      status: 'Final',
      author: 'Dr. Sarah Miller',
      module: 'ind',
      tags: ['Protocol', 'Clinical', 'IND-12345'],
    },
    {
      objectId: 'ind2',
      displayName: 'IND-12345-CMC-Section-Draft.pdf',
      contentUrl: '#',
      type: 'Chemistry Manufacturing Controls',
      lastModified: '2025-04-12',
      status: 'Draft',
      author: 'CMC Department',
      module: 'ind',
      tags: ['CMC', 'Draft', 'IND-12345'],
    },
    {
      objectId: 'ind3',
      displayName: 'Pre-IND-Meeting-Minutes.pdf',
      contentUrl: '#',
      type: 'Meeting Minutes',
      lastModified: '2025-03-25',
      status: 'Final',
      author: 'Regulatory Affairs',
      module: 'ind',
      tags: ['Pre-IND', 'FDA', 'Meeting'],
    },
  ],

  // CSR module specific documents
  csr: [
    {
      objectId: 'csr1',
      displayName: 'CSR-XYZ-2025-Q1-Report.pdf',
      contentUrl: '#',
      type: 'Clinical Study Report',
      lastModified: '2025-04-10',
      status: 'Draft',
      author: 'John Davis, PhD',
      module: 'csr',
      tags: ['CSR', 'Study XYZ', 'Q1-2025'],
    },
    {
      objectId: 'csr2',
      displayName: 'CSR-ABC-2024-Final.pdf',
      contentUrl: '#',
      type: 'Clinical Study Report',
      lastModified: '2025-01-15',
      status: 'Final',
      author: 'Medical Writing Team',
      module: 'csr',
      tags: ['CSR', 'Study ABC', 'Final'],
    },
  ],

  // CER module specific documents
  cer: [
    {
      objectId: 'cer1',
      displayName: 'CER-Device-XYZ-2025.pdf',
      contentUrl: '#',
      type: 'Clinical Evaluation Report',
      lastModified: '2025-03-20',
      status: 'Final',
      author: 'Medical Device Team',
      module: 'cer',
      tags: ['CER', 'Device XYZ', 'MDR'],
    },
    {
      objectId: 'cer2',
      displayName: 'CER-Literature-Review-Q1-2025.pdf',
      contentUrl: '#',
      type: 'Literature Review',
      lastModified: '2025-04-05',
      status: 'Draft',
      author: 'Literature Review Team',
      module: 'cer',
      tags: ['CER', 'Literature', 'Review'],
    },
  ],

  // Regulatory submission documents
  regulatory: [
    {
      objectId: 'reg1',
      displayName: 'Regulatory-Submission-2025-04.pdf',
      contentUrl: '#',
      type: 'Regulatory Filing',
      lastModified: '2025-04-05',
      status: 'Under Review',
      author: 'Regulatory Affairs Team',
      module: 'regulatory',
      tags: ['Submission', 'FDA', 'Q2-2025'],
    },
    {
      objectId: 'reg2',
      displayName: 'EMA-Response-to-Questions.pdf',
      contentUrl: '#',
      type: 'Regulatory Response',
      lastModified: '2025-03-28',
      status: 'Final',
      author: 'EU Regulatory Team',
      module: 'regulatory',
      tags: ['EMA', 'Response', 'Questions'],
    },
  ],

  // Safety specific documents
  safety: [
    {
      objectId: 'safe1',
      displayName: 'Safety-Report-Compound-ABC.pdf',
      contentUrl: '#',
      type: 'Safety Report',
      lastModified: '2025-03-28',
      status: 'Final',
      author: 'Safety Monitoring Committee',
      module: 'safety',
      tags: ['Safety', 'Compound ABC', 'Q1-2025'],
    },
    {
      objectId: 'safe2',
      displayName: 'DSUR-Drug-XYZ-2024.pdf',
      contentUrl: '#',
      type: 'Development Safety Update Report',
      lastModified: '2025-02-15',
      status: 'Final',
      author: 'Pharmacovigilance Department',
      module: 'safety',
      tags: ['DSUR', 'Drug XYZ', 'Annual'],
    },
  ],

  // Enterprise vault documents
  enterprise: [
    {
      objectId: 'ent1',
      displayName: 'Annual-Product-Review-2024.pdf',
      contentUrl: '#',
      type: 'Annual Review',
      lastModified: '2025-01-30',
      status: 'Final',
      author: 'Product Management',
      module: 'enterprise',
      tags: ['Annual', 'Review', '2024'],
    },
    {
      objectId: 'ent2',
      displayName: 'Quality-Management-System-Audit.pdf',
      contentUrl: '#',
      type: 'Audit Report',
      lastModified: '2025-03-10',
      status: 'Final',
      author: 'QA Audit Team',
      module: 'enterprise',
      tags: ['QMS', 'Audit', 'Internal'],
    },
    {
      objectId: 'ent3',
      displayName: '21-CFR-Part-11-Validation-Report.pdf',
      contentUrl: '#',
      type: 'Validation Report',
      lastModified: '2025-02-28',
      status: 'Final',
      author: 'Validation Team',
      module: 'enterprise',
      tags: ['Validation', '21 CFR Part 11', 'Compliance'],
    },
  ],
};

// Get documents for a specific module (or combine all if requested)
const getModuleDocuments = (moduleName, includeGeneral = true) => {
  const moduleSpecificDocs = MODULE_SAMPLE_DOCUMENTS[moduleName] || [];

  if (includeGeneral && moduleName !== 'default') {
    return [...moduleSpecificDocs, ...MODULE_SAMPLE_DOCUMENTS.default];
  }

  return moduleSpecificDocs;
};

// Create the context
export const DocuShareContext = createContext();

export function DocuShareProvider({
  children,
  moduleName = 'default',
  moduleLabel = 'Document Repository',
  includeGeneral = true,
}) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [docFilter, setDocFilter] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [viewUrl, setViewUrl] = useState(null);

  useEffect(() => {
    const fetchDocs = async () => {
      setLoading(true);
      try {
        const data = await listDocs();
        if (Array.isArray(data) && data.length > 0) {
          setDocs(data);
          setError(null);
          setUseDemoMode(false);
        } else {
          throw new Error('No documents available');
        }
      } catch (err) {
        setError('Unable to connect to document service');

        // Use demo documents specific to the module
        const moduleDocs = getModuleDocuments(moduleName, includeGeneral);
        setDocs(moduleDocs);
        setUseDemoMode(true);
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, [moduleName, includeGeneral]);

  const onFile = async file => {
    if (!file) return;

    if (useDemoMode) {
      // In demo mode, simulate uploading by adding a new document to the sample list
      const newDoc = {
        objectId: `doc${Date.now()}`,
        displayName: file.name,
        contentUrl: '#',
        type: `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Document`,
        lastModified: new Date().toISOString().split('T')[0],
        status: 'New',
        author: 'Current User',
        module: moduleName,
        tags: [moduleName, 'Uploaded'],
      };

      setDocs([newDoc, ...docs]);
      return newDoc;
    }

    try {
      await uploadDoc(file);
      const data = await listDocs();
      setDocs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError('Unable to upload document');
    }
  };

  const filteredDocs = docs.filter(doc => {
    // Apply search term filter
    const matchesSearch =
      searchTerm === '' ||
      doc.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.type && doc.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.author && doc.author.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));

    // Apply document type filter
    const matchesFilter =
      docFilter === 'all' ||
      (docFilter === 'clinical' && doc.type?.includes('Clinical')) ||
      (docFilter === 'regulatory' && doc.type?.includes('Regulatory')) ||
      (docFilter === 'safety' && doc.type?.includes('Safety')) ||
      (docFilter === 'cmc' && doc.type?.includes('CMC'));

    return matchesSearch && matchesFilter;
  });

  // Optional filter by module
  const getDocumentsByModule = moduleFilter => {
    return docs.filter(doc => doc.module === moduleFilter || !doc.module);
  };

  const selectDocument = doc => {
    setSelectedDoc(doc);
    setViewUrl(doc.contentUrl);
  };

  const clearSelection = () => {
    setSelectedDoc(null);
    setViewUrl(null);
  };

  const refreshDocuments = async () => {
    setLoading(true);
    try {
      const data = await listDocs();
      if (Array.isArray(data) && data.length > 0) {
        setDocs(data);
        setError(null);
        setUseDemoMode(false);
      } else {
        throw new Error('No documents available');
      }
    } catch (err) {
      // Keep using demo mode
    } finally {
      setLoading(false);
    }
  };

  const value = {
    docs,
    filteredDocs,
    loading,
    error,
    useDemoMode,
    searchTerm,
    setSearchTerm,
    docFilter,
    setDocFilter,
    selectedDoc,
    viewUrl,
    selectDocument,
    clearSelection,
    onFile,
    moduleLabel,
    moduleName,
    refreshDocuments,
    getDocumentsByModule,
  };

  return <DocuShareContext.Provider value={value}>{children}</DocuShareContext.Provider>;
}

// Custom hook to use the DocuShare context
export const useDocuShare = () => {
  const context = useContext(DocuShareContext);
  if (!context) {
    throw new Error('useDocuShare must be used within a DocuShareProvider');
  }
  return context;
};
