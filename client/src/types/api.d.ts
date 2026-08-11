// API Response types for Concept2Cure application

// Protocol Optimizer API responses
interface ProtocolOptimizationResponse {
  success: boolean;
  recommendation: string;
  keySuggestions: string[];
  riskFactors: string[];
  matchedCsrInsights: {
    id: string;
    title: string;
    phase: string;
    indication: string;
    insight?: string;
  }[];
  suggestedEndpoints: string[];
  suggestedArms: string[];
  error?: string;
}

interface SaveOptimizationResponse {
  saved: boolean;
  version_count: number;
  error?: string;
}

// Extend the fetch Response type to allow property access with types
declare global {
  interface Window {
    apiResponse: any; // Global for debugging
  }
}

// Allow API requests to return properly typed responses.
// This ambient declaration is the authoritative type for '@/lib/queryClient' in
// the full-program typecheck, so it must expose every member consumers import —
// including ApiRequestError, which apiRequest throws on non-2xx and callers use
// to distinguish HTTP failure states (status/payload) without parsing strings.
declare module '@/lib/queryClient' {
  export function apiRequest(method: string, url: string, data?: any): Promise<any>;
  export class ApiRequestError extends Error {
    constructor(message: string, status: number, payload?: unknown);
    readonly status: number;
    readonly payload?: unknown;
  }
}
