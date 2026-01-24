/**
 * Google API Configuration
 *
 * This file contains configuration settings for Google API integration,
 * including OAuth scopes and API endpoints.
 */

// OAuth configuration
export const GOOGLE_CONFIG = {
  // Using Google OAuth client ID from the user-provided credentials file
  CLIENT_ID:
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '1045075234440-sve60m8va1d4djdistod8g4lbo8vp791.apps.googleusercontent.com',
  API_KEY: import.meta.env.VITE_GOOGLE_API_KEY || '',
  DISCOVERY_DOCS: [
    'https://docs.googleapis.com/$discovery/rest?version=v1',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  ],
  SCOPES: [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'profile',
    'email',
  ],
  // Authorized domains for OAuth
  AUTHORIZED_ORIGINS: [
    window.location.origin,
    'https://trialsage.com',
    'https://app.trialsage.com',
    'https://regulatory-pilot.com',
  ],
  // OAuth redirect URI - fixed to match Google OAuth Console registration and Replit environment
  REDIRECT_URI: `https://abb15664-61d9-4852-884c-d59384023199-00-1rbx8h3zks8bw.picard.replit.dev/api/google-docs/auth/google/callback`,
};

// Sample document IDs for testing
export const SAMPLE_DOCUMENTS = {
  module_2_5: '1LfAYfIxHWDNTxzzHK9HuZZvDJCZpPGXbDJF-UaXgTf8', // Clinical Overview template
  module_2_7: '1lHBM9PlzCDuiJaVeUFvCuqglEELXJRBGTJFHvcfSYw4', // Clinical Summary template
  default: '1B1AYPsjPO-Fvdovua3vPg9PY14IXLujk4lvkEiH0wNo',
};

// API endpoints
export const API_ENDPOINTS = {
  CREATE_DOC: '/api/google-docs/documents',
  EXPORT_DOC: '/api/google-docs/documents/:documentId/export',
  SAVE_TO_VAULT: '/api/google-docs/save-to-vault',
  FROM_TEMPLATE: '/api/google-docs/documents/template',
  USER_PROFILE: '/api/google-docs/user',
  GET_DOC_LIST: '/api/google-docs/documents',
};

// Templates categorized by module
export const DOCUMENT_TEMPLATES = {
  module_1: {
    cover_letter: 'template-id-for-cover-letter',
    form_1571: 'template-id-for-form-1571',
    investigator_brochure: 'template-id-for-investigator-brochure',
  },
  module_2: {
    clinical_overview: SAMPLE_DOCUMENTS.module_2_5,
    clinical_summary: SAMPLE_DOCUMENTS.module_2_7,
    quality_overall_summary: 'template-id-for-quality-overall-summary',
  },
  module_3: {
    quality_manufacturing: 'template-id-for-quality-manufacturing',
    batch_analysis: 'template-id-for-batch-analysis',
  },
  module_4: {
    toxicology_summary: 'template-id-for-toxicology-summary',
  },
  module_5: {
    clinical_study_report: 'template-id-for-clinical-study-report',
    protocol: 'template-id-for-protocol',
  },
};
