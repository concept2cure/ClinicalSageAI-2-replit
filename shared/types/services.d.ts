/**
 * Type declarations for JavaScript service modules
 */

/// <reference lib="dom" />

// ============================================================================
// API Services
// ============================================================================
declare module '@/services/api' {
  export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }

  export function get(url: string, options?: globalThis.RequestInit): Promise<ApiResponse>;
  export function post(
    url: string,
    data?: any,
    options?: globalThis.RequestInit
  ): Promise<ApiResponse>;
  export function put(
    url: string,
    data?: any,
    options?: globalThis.RequestInit
  ): Promise<ApiResponse>;
  export function del(url: string, options?: globalThis.RequestInit): Promise<ApiResponse>;
  export function patch(
    url: string,
    data?: any,
    options?: globalThis.RequestInit
  ): Promise<ApiResponse>;

  const api: {
    get: typeof get;
    post: typeof post;
    put: typeof put;
    delete: typeof del;
    patch: typeof patch;
  };

  export default api;
}

declare module '../../services/api' {
  export * from '@/services/api';
  export { default } from '@/services/api';
}

declare module '../services/api' {
  export * from '@/services/api';
  export { default } from '@/services/api';
}

// ============================================================================
// CSR API
// ============================================================================
declare module '@/api/csr' {
  export interface CSRDocument {
    id: string;
    title: string;
    content: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }

  export function searchCSR(query: string, filters?: any): Promise<CSRDocument[]>;
  export function getCSR(id: string): Promise<CSRDocument>;
  export function createCSR(data: Partial<CSRDocument>): Promise<CSRDocument>;
  export function updateCSR(id: string, data: Partial<CSRDocument>): Promise<CSRDocument>;
  export function deleteCSR(id: string): Promise<void>;

  const csrApi: {
    search: typeof searchCSR;
    get: typeof getCSR;
    create: typeof createCSR;
    update: typeof updateCSR;
    delete: typeof deleteCSR;
  };

  export default csrApi;
}

declare module '../api/csr' {
  export * from '@/api/csr';
  export { default } from '@/api/csr';
}

// ============================================================================
// Analytics API
// ============================================================================
declare module '@/api/analytics' {
  export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
  }

  export interface AnalyticsApi {
    getSuccessRates: (params?: any) => Promise<ApiResponse<any>>;
    getDurationStats: (params?: any) => Promise<ApiResponse<any>>;
    getEndpointTrends: (params?: any) => Promise<ApiResponse<any>>;
    getCriteriaTrends: (params?: any) => Promise<ApiResponse<any>>;
    getBenchmarkData: (params?: any) => Promise<ApiResponse<any>>;
    getAiModelData: (params?: any) => Promise<ApiResponse<any>>;
  }

  const analyticsApi: AnalyticsApi;
  export default analyticsApi;
}

declare module '../api/analytics' {
  export * from '@/api/analytics';
  export { default } from '@/api/analytics';
}

// ============================================================================
// Chart Components (UI)
// ============================================================================
declare module '@/components/ui/chart' {
  import { ComponentType, ReactNode } from 'react';

  export interface ChartProps {
    data?: any[];
    children?: ReactNode;
    className?: string;
  }

  export const BarChart: ComponentType<ChartProps & { layout?: 'vertical' | 'horizontal' }>;
  export const LineChart: ComponentType<ChartProps>;
  export const PieChart: ComponentType<ChartProps>;
  export const AreaChart: ComponentType<ChartProps>;
  export const ChartBars: ComponentType<{ dataKey: string; fill?: string; className?: string }>;
  export const ChartLine: ComponentType<{ dataKey: string; stroke?: string; className?: string }>;
  export const ChartArea: ComponentType<{ dataKey: string; fill?: string; className?: string }>;
  export const ChartPie: ComponentType<{ dataKey: string; nameKey?: string; className?: string }>;
  export const ChartTooltip: ComponentType<any>;
  export const ChartLegend: ComponentType<any>;
  export const ChartXAxis: ComponentType<{ dataKey?: string }>;
  export const ChartYAxis: ComponentType<any>;
  export const ChartGrid: ComponentType<{ strokeDasharray?: string }>;

  export const ChartContainer: ComponentType<{
    config?: Record<string, { label?: string; color?: string }>;
    children?: ReactNode;
    className?: string;
  }>;

  export const ChartTooltipContent: ComponentType<any>;
}

// ============================================================================
// JS Service Modules (server)
// These are plain .js files imported by TypeScript barrel/routes.
// ============================================================================

declare module '*/documentService.js' {
  const documentService: {
    getDocumentById(id: string): Promise<any>;
    convertToText(doc: any): string;
  };
  export default documentService;
}

declare module '*/fdaService.js' {
  export function fetchFaersData(params: Record<string, unknown>): Promise<any>;
  export function analyzeFaersDataForCER(data: any): any;
}

declare module '*/kimiAIService.js' {
  const kimiAIService: Record<string, (...args: any[]) => any>;
  export default kimiAIService;
}

declare module '*/pdfGenerator.js' {
  const pdfGenerator: Record<string, (...args: any[]) => any>;
  export default pdfGenerator;
}

declare module '*/enhancedPdfBuilder.js' {
  const enhancedPdfBuilder: Record<string, (...args: any[]) => any>;
  export default enhancedPdfBuilder;
}

declare module '*/fda510kDocumentGenerator.js' {
  const fda510kDocumentGenerator: Record<string, (...args: any[]) => any>;
  export default fda510kDocumentGenerator;
}

declare module '*/cmcBlueprintService.js' {
  const cmcBlueprintService: Record<string, (...args: any[]) => any>;
  export default cmcBlueprintService;
}

declare module '*/harvestEngine.js' {
  export function executeHarvest(
    submissionId: string,
    options?: Record<string, unknown>
  ): Promise<any>;
  export function getHarvestHistory(
    submissionId: string,
    options?: Record<string, unknown>
  ): Promise<any>;
  const harvestEngine: {
    executeHarvest: typeof executeHarvest;
    getHarvestHistory: typeof getHarvestHistory;
  };
  export default harvestEngine;
}

declare module '*/dataHarvester.js' {
  export function processDocument(documentId: string, submissionId: string): Promise<any>;
  export function getHarvestingJobStatus(jobId: string): Promise<any>;
  export function queueDocumentsForHarvesting(
    documentIds: string[],
    submissionId: string
  ): Promise<any>;
  export function getHarvestingStats(submissionId: string): Promise<any>;
  export function searchHarvestableDocuments(filters: any): Promise<any>;
  const dataHarvester: Record<string, (...args: any[]) => any>;
  export default dataHarvester;
}

declare module '*/enhancedFaersService.js' {
  export class EnhancedFAERSClient {
    constructor();
  }
  export function fetchFaersAnalysis(...args: any[]): Promise<any>;
}
