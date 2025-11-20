/**
 * Vector Database Configuration for Enhanced Regulatory Intelligence
 *
 * This configuration provides the foundation for production-grade vector search
 * with regulatory metadata and intelligent document classification.
 */

export const VECTOR_DATABASE_CONFIG = {
  // Vector embedding configuration
  embedding: {
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    chunk_size: 1000,
    chunk_overlap: 200,
    batch_size: 50,
  },

  // Regulatory metadata schema
  metadata_schema: {
    ectd_section: {
      type: 'string',
      indexed: true,
      description: 'eCTD section number (e.g., 2.5, 3.2, 5.3)',
    },
    doc_type: {
      type: 'string',
      indexed: true,
      description: 'Document type (CSR, Protocol, ICH_Guideline, etc.)',
    },
    region_tag: {
      type: 'array',
      indexed: true,
      description: 'Regulatory regions (FDA, EMA, PMDA, etc.)',
    },
    page_number: {
      type: 'integer',
      indexed: true,
      description: 'Page number within document',
    },
    doc_title: {
      type: 'string',
      indexed: true,
      description: 'Document title',
    },
    upload_date: {
      type: 'timestamp',
      indexed: true,
      description: 'Document upload timestamp',
    },
    compliance_score: {
      type: 'float',
      indexed: true,
      description: 'Regulatory compliance score (0-1)',
    },
  },

  // Search configuration
  search: {
    default_limit: 10,
    max_limit: 100,
    similarity_threshold: 0.7,
    context_window: 3,
    enable_clustering: true,
    enable_recommendations: true,
  },

  // Regulatory intelligence configuration
  intelligence: {
    regions: ['FDA', 'EMA', 'PMDA', 'Health_Canada', 'TGA'],
    document_types: [
      'CSR',
      'Protocol',
      'ICH_Guideline',
      'FDA_Guidance',
      'EMA_Guideline',
      'PMDA_Notice',
      'Study_Report',
    ],
    ectd_sections: ['1.2', '2.5', '2.5.4', '2.5.6', '2.7.3', '3.2', '3.2.S.4.1', '5.3', '5.3.5'],
  },
};

export const REGULATORY_PATTERNS = {
  FDA: {
    patterns: [/FDA.*guidance/i, /21\s*CFR/i, /IND.*application/i, /NDA.*submission/i],
    confidence_boost: 0.1,
  },
  EMA: {
    patterns: [/EMA.*guideline/i, /CHMP.*opinion/i, /marketing.*authorization/i, /EU.*regulation/i],
    confidence_boost: 0.1,
  },
  PMDA: {
    patterns: [/PMDA.*notification/i, /J-GCP/i, /pharmaceutical.*affairs/i],
    confidence_boost: 0.1,
  },
  ICH: {
    patterns: [/ICH.*[A-Z]\d+/i, /harmonised.*tripartite/i, /international.*conference/i],
    confidence_boost: 0.15,
  },
};

export default VECTOR_DATABASE_CONFIG;
