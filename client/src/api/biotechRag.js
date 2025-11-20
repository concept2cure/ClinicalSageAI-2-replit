/**
 * Biotech RAG API Service
 * Handles all RAG-related API calls for document ingestion, search, and analysis
 */

const API_BASE = '/api/biotech-rag';

/**
 * Search documents using RAG
 */
export async function searchRAGDocuments(query, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topK: options.topK || 10,
        minScore: options.minScore || 0.5,
        searchMode: options.searchMode || 'hybrid',
        filters: options.filters || {},
        includeGraph: options.includeGraph || false,
        organizationId: options.organizationId || 7
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('RAG search error:', error);
    throw error;
  }
}

/**
 * Ask a question and get an AI-generated answer
 */
export async function askQuestion(question, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: question,
        organizationId: options.organizationId || 7,
        maxTokens: options.maxTokens || 1000
      }),
    });

    if (!response.ok) {
      throw new Error(`Question answering failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('RAG Q&A error:', error);
    throw error;
  }
}

/**
 * Upload and ingest a document
 */
export async function ingestDocument(file, metadata = {}) {
  try {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('title', metadata.title || file.name);
    formData.append('documentType', metadata.documentType || 'csr');
    formData.append('organizationId', metadata.organizationId || '7');
    
    // Add optional metadata
    if (metadata.therapeuticArea) formData.append('therapeuticArea', metadata.therapeuticArea);
    if (metadata.indication) formData.append('indication', metadata.indication);
    if (metadata.phase) formData.append('phase', metadata.phase);
    if (metadata.compound) formData.append('compound', metadata.compound);
    if (metadata.sponsor) formData.append('sponsor', metadata.sponsor);

    const response = await fetch(`${API_BASE}/ingest`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Document ingestion failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Document ingestion error:', error);
    throw error;
  }
}

/**
 * Ingest documents from regulatory sources (FDA, EMA, ICH, WHO)
 */
export async function ingestRegulatoryDocuments(options = {}) {
  try {
    const response = await fetch(`${API_BASE}/ingest/regulatory-sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sources: options.sources || ['FDA', 'EMA'],
        documentTypes: options.documentTypes || ['guidances', 'warning_letters', 'epar'],
        limit: options.limit || 10,
        organizationId: options.organizationId || 7
      }),
    });

    if (!response.ok) {
      throw new Error(`Regulatory ingestion failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Regulatory ingestion error:', error);
    throw error;
  }
}

/**
 * Start training/bulk processing pipeline
 */
export async function startTrainingPipeline(options = {}) {
  try {
    const response = await fetch(`${API_BASE}/train`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentIds: options.documentIds || [],
        documentType: options.documentType || 'csr',
        processingMode: options.processingMode || 'full',
        organizationId: options.organizationId || 7,
        options: options.additionalOptions || {}
      }),
    });

    if (!response.ok) {
      throw new Error(`Training pipeline failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Training pipeline error:', error);
    throw error;
  }
}

/**
 * Get training/processing job status
 */
export async function getTrainingStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE}/train/status/${jobId}`);

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Status check error:', error);
    throw error;
  }
}

/**
 * Analyze protocol document
 */
export async function analyzeProtocol(documentId, analysisType, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/analyze/protocol`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        analysisType,
        organizationId: options.organizationId || 7
      }),
    });

    if (!response.ok) {
      throw new Error(`Protocol analysis failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Protocol analysis error:', error);
    throw error;
  }
}

/**
 * Get knowledge graph relationships for biomarkers
 */
export async function getBiomarkerCorrelations(biomarkers, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/knowledge-graph/biomarkers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        biomarkers,
        indication: options.indication,
        organizationId: options.organizationId || 7
      }),
    });

    if (!response.ok) {
      throw new Error(`Biomarker correlation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Biomarker correlation error:', error);
    throw error;
  }
}

/**
 * Export search results
 */
export async function exportSearchResults(queryId, format = 'json') {
  try {
    const response = await fetch(`${API_BASE}/export/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queryId,
        format
      }),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    if (format === 'csv') {
      return await response.blob();
    }

    return await response.json();
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}

/**
 * Get RAG analytics and statistics
 */
export async function getRAGAnalytics(options = {}) {
  try {
    const params = new URLSearchParams({
      organizationId: options.organizationId || '7',
      timeRange: options.timeRange || '30d'
    });

    const response = await fetch(`${API_BASE}/analytics?${params}`);

    if (!response.ok) {
      throw new Error(`Analytics failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Analytics error:', error);
    throw error;
  }
}