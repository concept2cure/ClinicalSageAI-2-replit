import { apiRequest, extractData } from './queryClient';

/**
 * TrialSage API Connector
 *
 * This service provides a centralized interface for all API calls to the backend services.
 * It follows a modular structure based on the different service domains.
 */

// Types for API responses and requests
interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
}

interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

interface CsrQueryParams extends PaginationParams {
  indication?: string;
  phase?: string;
  sponsor?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface CerQueryParams extends PaginationParams {
  productType?: string;
  manufacturer?: string;
  ndcCode?: string;
}

interface ProtocolQueryParams extends PaginationParams {
  indication?: string;
  phase?: string;
  status?: string;
}

// Helper function to build query string
function buildQueryString(params: Record<string, any>): string {
  const query = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return query ? `?${query}` : '';
}

/**
 * CSR Intelligence API Service
 */
const csrIntelligenceApi = {
  // Get CSR list with filters and pagination
  getCsrList: async (params: CsrQueryParams = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/csr/list${queryString}`);
    return extractData(response);
  },

  // Get a single CSR by ID
  getCsrById: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/csr/${id}`);
    return extractData(response);
  },

  // Upload a new CSR document
  uploadCsr: async (formData: FormData): Promise<ApiResponse<any>> => {
    // Use native fetch for file upload
    const response = await fetch('/api/csr/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    return response.json();
  },

  // Get CSR analytics data
  getCsrAnalytics: async (filters: any = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(filters);
    const response = await apiRequest('GET', `/api/csr/analytics${queryString}`);
    return extractData(response);
  },

  // Compare multiple CSRs
  compareMultipleCsrs: async (csrIds: string[]): Promise<ApiResponse<any>> => {
    const response = await apiRequest('POST', '/api/csr/compare', { csrIds });
    return extractData(response);
  },
};

/**
 * Regulatory module API service
 */
const cerGeneratorApi = {
  // Get CERs with filters and pagination
  getCerList: async (params: CerQueryParams = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/cer/list${queryString}`);
    return extractData(response);
  },

  // Get a single CER by ID
  getCerById: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/cer/${id}`);
    return extractData(response);
  },

  // Generate a new CER
  generateCer: async (cerData: any): Promise<ApiResponse<any>> => {
    const response = await apiRequest('POST', '/api/cer/generate', cerData);
    return extractData(response);
  },

  // Get FAERS data for a product
  getFaersData: async (ndcCode: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/cer/faers/${ndcCode}`);
    return extractData(response);
  },

  // Export CER as PDF or Word
  exportCer: async (id: string, format: 'pdf' | 'docx'): Promise<Blob> => {
    const response = await fetch(`/api/cer/${id}/export?format=${format}`, {
      method: 'GET',
      credentials: 'include',
    });
    return response.blob();
  },
};

/**
 * Protocol Optimizer API Service
 */
const protocolOptimizerApi = {
  // Get protocols with filters and pagination
  getProtocolList: async (params: ProtocolQueryParams = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/protocol/list${queryString}`);
    return extractData(response);
  },

  // Get a single protocol by ID
  getProtocolById: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/protocol/${id}`);
    return extractData(response);
  },

  // Create/Update a protocol
  saveProtocol: async (protocolData: any): Promise<ApiResponse<any>> => {
    const isNew = !protocolData.id;
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/protocol/create' : `/api/protocol/${protocolData.id}`;

    const response = await apiRequest(method, url, protocolData);
    return extractData(response);
  },

  // Analyze a protocol against CSR data
  analyzeProtocol: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('POST', `/api/protocol/${id}/analyze`);
    return extractData(response);
  },

  // Get success prediction for a protocol
  getPrediction: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/protocol/${id}/prediction`);
    return extractData(response);
  },
};

/**
 * IND Automation API Service
 */
const indAutomationApi = {
  // Get IND submissions with filters and pagination
  getIndList: async (params: PaginationParams = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/ind/list${queryString}`);
    return extractData(response);
  },

  // Get a single IND by ID
  getIndById: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', `/api/ind/${id}`);
    return extractData(response);
  },

  // Create/Update an IND
  saveInd: async (indData: any): Promise<ApiResponse<any>> => {
    const isNew = !indData.id;
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/ind/create' : `/api/ind/${indData.id}`;

    const response = await apiRequest(method, url, indData);
    return extractData(response);
  },

  // Generate eCTD package
  generateEctd: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('POST', `/api/ind/${id}/generate-ectd`);
    return extractData(response);
  },

  // Submit to FDA ESG
  submitToEsg: async (id: string): Promise<ApiResponse<any>> => {
    const response = await apiRequest('POST', `/api/ind/${id}/submit-esg`);
    return extractData(response);
  },
};

/**
 * Analytics API Service
 */
const analyticsApi = {
  // Get trial success rates
  getSuccessRates: async (params: any = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/analytics/success-rates${queryString}`);
    return extractData(response);
  },

  // Get trial duration statistics
  getDurationStats: async (params: any = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/analytics/duration-stats${queryString}`);
    return extractData(response);
  },

  // Get endpoint trends
  getEndpointTrends: async (params: any = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/analytics/endpoint-trends${queryString}`);
    return extractData(response);
  },

  // Get inclusion/exclusion criteria trends
  getCriteriaTrends: async (params: any = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/analytics/criteria-trends${queryString}`);
    return extractData(response);
  },
};

/**
 * User API Service
 */
const userApi = {
  // Get current user info
  getCurrentUser: async (): Promise<ApiResponse<any>> => {
    const response = await apiRequest('GET', '/api/user/me');
    return extractData(response);
  },

  // Update user preferences
  updatePreferences: async (preferences: any): Promise<ApiResponse<any>> => {
    const response = await apiRequest('PUT', '/api/user/preferences', preferences);
    return extractData(response);
  },

  // Get user activity log
  getActivityLog: async (params: PaginationParams = {}): Promise<ApiResponse<any>> => {
    const queryString = buildQueryString(params);
    const response = await apiRequest('GET', `/api/user/activity${queryString}`);
    return extractData(response);
  },
};

// Main API service that combines all domain-specific APIs
export const trialsageApi = {
  csr: csrIntelligenceApi,
  cer: cerGeneratorApi,
  protocol: protocolOptimizerApi,
  ind: indAutomationApi,
  analytics: analyticsApi,
  user: userApi,
};

// Export individual services for more specific imports
export {
  csrIntelligenceApi,
  cerGeneratorApi,
  protocolOptimizerApi,
  indAutomationApi,
  analyticsApi,
  userApi,
};
