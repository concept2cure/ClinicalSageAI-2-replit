/**
 * eCTD Co-Author Service - Real API Integration
 * Production-grade service for document management and export
 */

const getOrgHeader = () => {
  const orgId = localStorage.getItem('currentOrganizationId') || '7';
  return { 'x-organization-id': orgId };
};

const coauthorService = {
  // Save a draft of a section
  saveDraft: async ({ sectionId, documentId, content }) => {
    try {
      const response = await fetch(`/api/coauthor/sections/${sectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getOrgHeader()
        },
        body: JSON.stringify({ content, documentId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save draft');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error saving draft:', error);
      throw error;
    }
  },

  // Get draft history for a section
  getDraftHistory: async (sectionId, documentId) => {
    try {
      const response = await fetch(`/api/coauthor/sections/${sectionId}/history?documentId=${documentId}`, {
        headers: getOrgHeader()
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching history:', error);
      throw error;
    }
  },

  // Generate a draft using AI
  generateDraft: async (sectionId, documentId, templateNumber) => {
    try {
      const response = await fetch('/api/coauthor/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrgHeader()
        },
        body: JSON.stringify({ sectionId, documentId, templateNumber })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate draft');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating draft:', error);
      throw error;
    }
  },

  // Export document to Word format
  exportToWord: async (documentId, templateNumber, includeMetadata = true) => {
    try {
      const orgId = localStorage.getItem('currentOrganizationId') || '7';
      
      // Fetch the Word document as a blob
      const response = await fetch(`/api/coauthor/export-word/${documentId}?templateNumber=${templateNumber}&includeMetadata=${includeMetadata}`, {
        method: 'GET',
        headers: {
          'x-organization-id': orgId
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to export document');
      }
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'document.docx';
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Get the blob
      const blob = await response.blob();
      
      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return {
        success: true,
        filename
      };
    } catch (error) {
      console.error('Error exporting to Word:', error);
      throw error;
    }
  },

  // Export document to PDF format
  exportToPDF: async (documentId, templateNumber, includeMetadata = true) => {
    try {
      const response = await fetch('/api/coauthor/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOrgHeader()
        },
        body: JSON.stringify({ documentId, templateNumber, includeMetadata })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to export PDF');
      }
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'document.pdf';
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return {
        success: true,
        filename
      };
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      throw error;
    }
  },

  // Export content in different formats with real downloads
  exportContent: async (documentId, format, templateNumber, options = {}) => {
    const { includeMetadata = true } = options;
    
    try {
      if (format === 'docx') {
        return await coauthorService.exportToWord(documentId, templateNumber, includeMetadata);
      } else if (format === 'pdf') {
        return await coauthorService.exportToPDF(documentId, templateNumber, includeMetadata);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error(`Error exporting content as ${format}:`, error);
      throw error;
    }
  },
};

export default coauthorService;
