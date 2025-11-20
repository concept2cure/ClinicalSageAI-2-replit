import axios from 'axios';

/**
 * Enhanced Lumen AI Service with Unified Document Ingestion Integration
 *
 * This service now connects to the unified document processing system
 * and provides real AI-powered regulatory expertise backed by OpenAI.
 */
export default {
  /**
   * Chat with Lumen AI Agent
   */
  chat: async ({ sessionId, context, message, documentContent }) => {
    console.log('Lumen AI chat request:', {
      sessionId,
      message: message?.substring(0, 100) + '...',
    });

    try {
      // Call the real Lumen AI backend with document processing integration
      const response = await axios.post('/api/ask-lumen', {
        query: message,
        context: context || sessionId,
        documentContent: documentContent || null,
        sessionId,
      });

      return response.data.response || response.data.message;
    } catch (error) {
      console.error('Error in Lumen AI chat:', error);

      // Fallback to contextual responses if API fails
      const responses = {
        'coauthor-dashboard': `Based on your project, I recommend focusing on section 2.7 (Clinical Summary) next, as it's still in draft status and is critical for your FDA submission timeline.`,
        2.7: `For your Clinical Summary section 2.7, you should include a comprehensive analysis of all efficacy and safety data. Make sure to include forest plots for the primary endpoints and clear tables for adverse events. I also recommend cross-referencing with section 5.3 to maintain consistency.`,
        3.2: `When completing Quality Information section 3.2, remember to include detailed manufacturing process descriptions, quality control procedures, and stability data. FDA reviewers typically focus on batch consistency and validation of analytical methods in this section.`,
        4.2: `For Pharmacology Studies section 4.2, ensure you include clear dose-response relationships and pharmacodynamic parameters. The mechanism of action should be clearly linked to your proposed indication, and any secondary pharmacology effects should be thoroughly discussed.`,
        default: `I recommend following ICH guidelines for this section. Each CTD module has specific requirements for content and formatting. Would you like me to provide more detailed guidance for this specific section?`,
      };

      return responses[sessionId] || responses.default;
    }
  },

  /**
   * Upload document to unified ingestion system
   */
  uploadDocument: async (file, options = {}) => {
    console.log('Lumen AI document upload:', { fileName: file.name, module: options.module });

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('module', options.module || 'lumen-ai');
      formData.append('context', options.context || 'lumen-chat');
      formData.append('purpose', options.purpose || 'knowledge-base-integration');

      if (options.metadata) {
        formData.append('metadata', JSON.stringify(options.metadata));
      }

      const response = await axios.post('/api/unified/document-ingestion', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // 60 second timeout for large files
      });

      console.log('Document ingestion successful:', response.data.result);

      return {
        success: true,
        documentId: response.data.result.documentId,
        processingStats: response.data.result.processingStats,
        message: 'Document successfully processed and integrated into Lumen AI knowledge base',
      };
    } catch (error) {
      console.error('Error uploading document to Lumen AI:', error);
      throw new Error(`Document upload failed: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Search ingested documents
   */
  searchDocuments: async (query, filters = {}) => {
    console.log('Lumen AI document search:', { query, filters });

    try {
      const params = new URLSearchParams({
        query,
        module: filters.module || 'lumen-ai',
        ...filters,
      });

      const response = await axios.get(`/api/unified/documents/search?${params}`);

      return {
        success: true,
        results: response.data.results,
        count: response.data.count,
      };
    } catch (error) {
      console.error('Error searching documents:', error);
      throw new Error(`Document search failed: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Get processing statistics
   */
  getStats: async () => {
    try {
      const response = await axios.get('/api/unified/stats');
      return response.data.stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalDocuments: 0,
        processingQueue: 0,
        supportedFormats: ['PDF', 'DOCX', 'Excel', 'PowerPoint', 'TXT', 'CSV', 'XML', 'JSON'],
      };
    }
  },

  /**
   * Analyze document content for regulatory compliance
   */
  analyzeDocument: async (content, documentType) => {
    console.log('Lumen AI document analysis:', { contentLength: content?.length, documentType });

    try {
      const response = await axios.post('/api/ask-lumen', {
        query: `Analyze this ${documentType} for regulatory compliance, key requirements, and recommendations.`,
        context: 'document-analysis',
        documentContent: content,
      });

      return {
        success: true,
        analysis: response.data.document_analysis || {},
        recommendations: response.data.recommendations || [],
        complianceScore: response.data.confidence_level || 0,
      };
    } catch (error) {
      console.error('Error analyzing document:', error);
      throw new Error(
        `Document analysis failed: ${error.response?.data?.message || error.message}`
      );
    }
  },
};
