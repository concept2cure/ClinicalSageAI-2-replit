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
// NO ambient `declare module '@/lib/queryClient'` here, deliberately.
//
// There used to be one, and its own comment called it "the authoritative type
// for '@/lib/queryClient' in the full-program typecheck, so it must expose every
// member consumers import". That is a hand-maintained copy of a module that
// already types itself, and it had drifted exactly as such a copy does: it
// declared `apiRequest(...): Promise<any>` where the real function returns
// `Promise<Response>`, so every caller typechecked against a signature the
// implementation does not have — and a newly exported member was invisible to
// the compiler until someone remembered to add it here too.
//
// An ambient `declare module` for a path that RESOLVES to a real file shadows
// that file entirely. Deleting it makes client/src/lib/queryClient.ts the single
// source of its own types; the full-program typecheck passes with zero errors
// without it. Do not reintroduce one.

