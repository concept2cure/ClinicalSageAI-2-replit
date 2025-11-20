/**
 * Regulatory Brain Database Schema
 *
 * This file defines the schema for the Regulatory Knowledge Core, which is the
 * foundation of the AI-powered eCTD system. It contains structured definitions
 * for regulatory documents, their relationships, and the metadata model.
 */

// Document Types Enum - Categories of regulatory documents
const DOCUMENT_TYPES = {
  CFR: 'cfr', // Code of Federal Regulations
  ICH: 'ich', // International Council for Harmonisation
  FDA_GUIDANCE: 'fda_guid', // FDA Guidance Documents
  WARNING_LETTER: 'warning', // FDA Warning Letters
  CRL: 'crl', // Complete Response Letters
  RTF: 'rtf', // Refuse to File Letters
  CLINICAL_HOLD: 'hold', // Clinical Hold Notices
  IR: 'ir', // Information Requests
};

// CTD Module Mapping - Maps documents to relevant CTD modules
const CTD_MODULES = {
  MODULE_1: 'm1', // Administrative Information and Prescribing Information
  MODULE_2: 'm2', // Common Technical Document Summaries
  MODULE_3: 'm3', // Quality
  MODULE_4: 'm4', // Nonclinical Study Reports
  MODULE_5: 'm5', // Clinical Study Reports
};

// Application Types - Types of regulatory applications
const APPLICATION_TYPES = {
  IND: 'ind', // Investigational New Drug
  NDA: 'nda', // New Drug Application
  BLA: 'bla', // Biologics License Application
  DMF: 'dmf', // Drug Master File
  ANDA: 'anda', // Abbreviated New Drug Application
};

// Document Schema - Structure for regulatory documents
const documentSchema = {
  id: 'string', // Unique identifier
  type: 'enum(DOCUMENT_TYPES)', // Type of document
  title: 'string', // Document title
  content: 'string', // Full text content
  sections: [
    // Document sections
    {
      id: 'string', // Section identifier
      title: 'string', // Section title
      content: 'string', // Section content
      embedding: 'vector', // Vector embedding
      metadata: 'object', // Additional metadata
    },
  ],
  source_url: 'string', // Original source URL
  publication_date: 'date', // Publication date
  last_updated: 'date', // Last update date
  version: 'string', // Version number
  related_ctd_modules: ['enum(CTD_MODULES)'], // Related CTD modules
  related_application_types: ['enum(APPLICATION_TYPES)'], // Related application types
  citation_count: 'number', // Number of times cited
  importance_score: 'number', // Calculated importance score
};

// Embedding Schema - Structure for vector embeddings
const embeddingSchema = {
  section_id: 'string', // Reference to document section
  vector: 'vector', // The embedding vector
  model: 'string', // Model used to generate embedding
  dimensions: 'number', // Dimensions of the vector
  created_at: 'date', // Creation timestamp
};

// Relationship Schema - Defines relationships between regulatory documents
const relationshipSchema = {
  id: 'string', // Unique identifier
  source_id: 'string', // Source document ID
  target_id: 'string', // Target document ID
  relationship_type: 'string', // Type of relationship
  strength: 'number', // Strength of relationship
  created_at: 'date', // Creation timestamp
  metadata: 'object', // Additional metadata
};

// Query Log Schema - Records user queries for training and improvement
const queryLogSchema = {
  id: 'string', // Unique identifier
  query: 'string', // User query
  context: 'object', // Query context
  returned_documents: ['string'], // IDs of returned documents
  user_feedback: 'number', // User rating (1-5)
  timestamp: 'date', // Query timestamp
};

// Export all schemas
module.exports = {
  DOCUMENT_TYPES,
  CTD_MODULES,
  APPLICATION_TYPES,
  documentSchema,
  embeddingSchema,
  relationshipSchema,
  queryLogSchema,
};
