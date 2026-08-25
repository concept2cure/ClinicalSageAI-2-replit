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
    constructor(
      message: string,
      status: number,
      payload?: unknown,
      code?: string,
      correlationId?: string,
    );
    readonly status: number;
    readonly payload?: unknown;
    /** The server's machine-readable error code. Branch on THIS, never on
     *  `message` — the message is user copy and is expected to change. */
    readonly code?: string;
    /** The `X-Request-Id` the server echoed, for a user to quote to support. */
    readonly correlationId?: string;
  }
  /** The canonical reduction of an API error envelope to displayable copy plus a
   *  machine code. Every surface that renders a failure must use this rather
   *  than reaching into `{ error }` itself — reading `error` first is what put
   *  the literal token `PENDING_STORE` on screen. */
  export function extractApiError(
    payload: unknown,
    status: number,
  ): { message: string; code?: string };
  /** The human sentence the server actually sent, or null if it sent none worth
   *  showing. Use when the call site has a better fallback of its own. */
  export function serverMessage(payload: unknown): string | null;
  /** The server's machine-readable error code, when it sent one. */
  export function errorCodeOf(payload: unknown): string | undefined;
  /** The last gate before a string reaches a screen: returns `fallback` when the
   *  value is an enum token or carries SQL, a relation name, a route, a file
   *  path or an env var. `<ErrorState>` runs every message through it. */
  export function redactInternals(value: unknown, fallback: string): string;
  /** DOM event raised for every useMutation failure whose call site supplied no
   *  `onError` of its own. `<GlobalMutationErrors>` listens; see the
   *  MutationCache in client/src/lib/queryClient.ts. */
  export const MUTATION_ERROR_EVENT: string;
  export interface MutationErrorDetail {
    message: string;
    code?: string;
    correlationId?: string;
    status?: number;
  }
}
