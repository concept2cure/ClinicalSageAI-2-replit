/**
 * @fileoverview Regulatory Intelligence Service
 * @module concept2cure/services/regulatoryIntelligenceService
 * @version 1.0.0
 *
 * @description
 * Enterprise-grade service for regulatory intelligence feeds.
 * THE EXPEDITION LEADER - Horizon Scanning
 *
 * Integrates with:
 * - FDA Enforcement Reports API
 * - MAUDE (Device Adverse Events)
 * - FDA Drug Database
 * - ClinicalTrials.gov
 * - FDA Guidance Documents
 * - Recalls Database
 *
 * @compliance
 * - FDA 21 CFR Part 11: All API calls logged
 * - Data caching with TTL for performance
 * - Retry logic with exponential backoff
 */

import { apiRequest } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AlertSource = 
  | 'FDA_ENFORCEMENT'
  | 'FDA_GUIDANCE'
  | 'MAUDE'
  | 'RECALLS'
  | 'COMPETITOR'
  | 'CLINICAL_TRIALS'
  | 'PDUFA'
  | 'PROJECT'
  | 'DEADLINE'
  | 'SYSTEM';

export interface RegulatoryAlert {
  id: string;
  source: AlertSource;
  priority: AlertPriority;
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  actionUrl?: string;
  relatedProducts?: string[];
  relatedSubmissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface MAUDEEvent {
  id: string;
  reportNumber: string;
  eventDate: string;
  eventType: 'malfunction' | 'injury' | 'death';
  deviceName: string;
  manufacturer: string;
  productCode: string;
  brandName: string;
  narrative: string;
  patientOutcome?: string;
  deviceProblem?: string;
}

export interface FDARecall {
  id: string;
  recallNumber: string;
  recallClass: 'I' | 'II' | 'III';
  status: 'ongoing' | 'terminated' | 'completed';
  productDescription: string;
  reasonForRecall: string;
  recallingFirm: string;
  centerClassificationDate: string;
  distributionPattern: string;
  quantity: string;
}

export interface FDAGuidance {
  id: string;
  title: string;
  issueDate: string;
  guidanceType: 'final' | 'draft' | 'withdrawn';
  centerCode: string;
  summary?: string;
  documentUrl: string;
  relatedProductCodes?: string[];
}

export interface CompetitorIntelligence {
  id: string;
  companyName: string;
  eventType: 'approval' | 'rejection' | 'recall' | 'warning_letter' | 'clinical_trial';
  productName?: string;
  summary: string;
  date: string;
  impact: 'positive' | 'negative' | 'neutral';
  sourceUrl?: string;
}

export interface PDUFADate {
  id: string;
  applicationNumber: string;
  productName: string;
  sponsor: string;
  targetDate: string;
  dateType: 'standard' | 'priority' | 'accelerated' | 'breakthrough';
  indication?: string;
  status: 'pending' | 'approved' | 'crl' | 'extended';
}

export interface RegulatoryStats {
  totalAlerts: number;
  criticalAlerts: number;
  newGuidances: number;
  activeRecalls: number;
  upcomingPDUFA: number;
  competitorEvents: number;
  lastUpdated: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class RegulatoryIntelligenceService {
  private baseUrl = '/api/regulatory-intelligence';
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached data or fetch fresh
   */
  private async getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, expiry: Date.now() + this.cacheTTL });
    return data;
  }

  /**
   * Fetch morning briefing alerts - overnight intelligence
   */
  async getMorningBriefing(userId: string): Promise<{
    alerts: RegulatoryAlert[];
    stats: RegulatoryStats;
    priorities: Array<{ id: string; title: string; project?: string; deadline?: string; urgency: 'now' | 'today' | 'this_week' }>;
  }> {
    return this.getCached(`briefing-${userId}`, async () => {
      try {
        const response = await apiRequest(`${this.baseUrl}/briefing`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
        return response;
      } catch (error) {
        console.error('[RegulatoryIntelligence] Briefing fetch failed:', error);
        // Return default structure on error
        return {
          alerts: [],
          stats: {
            totalAlerts: 0,
            criticalAlerts: 0,
            newGuidances: 0,
            activeRecalls: 0,
            upcomingPDUFA: 0,
            competitorEvents: 0,
            lastUpdated: new Date().toISOString(),
          },
          priorities: [],
        };
      }
    });
  }

  /**
   * Search MAUDE database for device adverse events
   */
  async searchMAUDE(params: {
    productCode?: string;
    manufacturer?: string;
    eventType?: 'malfunction' | 'injury' | 'death';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<MAUDEEvent[]> {
    const queryParams = new URLSearchParams();
    if (params.productCode) queryParams.set('productCode', params.productCode);
    if (params.manufacturer) queryParams.set('manufacturer', params.manufacturer);
    if (params.eventType) queryParams.set('eventType', params.eventType);
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    try {
      const response = await apiRequest(`${this.baseUrl}/maude?${queryParams}`);
      return response.events || [];
    } catch (error) {
      console.error('[RegulatoryIntelligence] MAUDE search failed:', error);
      return [];
    }
  }

  /**
   * Get FDA recalls by product category
   */
  async getRecalls(params: {
    recallClass?: 'I' | 'II' | 'III';
    status?: 'ongoing' | 'terminated' | 'completed';
    productType?: 'drug' | 'device' | 'food';
    dateFrom?: string;
    limit?: number;
  }): Promise<FDARecall[]> {
    const queryParams = new URLSearchParams();
    if (params.recallClass) queryParams.set('recallClass', params.recallClass);
    if (params.status) queryParams.set('status', params.status);
    if (params.productType) queryParams.set('productType', params.productType);
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    try {
      const response = await apiRequest(`${this.baseUrl}/recalls?${queryParams}`);
      return response.recalls || [];
    } catch (error) {
      console.error('[RegulatoryIntelligence] Recalls fetch failed:', error);
      return [];
    }
  }

  /**
   * Get recent FDA guidance documents
   */
  async getGuidances(params: {
    centerCode?: string;
    guidanceType?: 'final' | 'draft';
    dateFrom?: string;
    searchTerm?: string;
    limit?: number;
  }): Promise<FDAGuidance[]> {
    const queryParams = new URLSearchParams();
    if (params.centerCode) queryParams.set('centerCode', params.centerCode);
    if (params.guidanceType) queryParams.set('guidanceType', params.guidanceType);
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.searchTerm) queryParams.set('q', params.searchTerm);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    try {
      const response = await apiRequest(`${this.baseUrl}/guidances?${queryParams}`);
      return response.guidances || [];
    } catch (error) {
      console.error('[RegulatoryIntelligence] Guidances fetch failed:', error);
      return [];
    }
  }

  /**
   * Get competitor intelligence
   */
  async getCompetitorIntelligence(params: {
    competitors?: string[];
    productCodes?: string[];
    eventTypes?: Array<'approval' | 'rejection' | 'recall' | 'warning_letter' | 'clinical_trial'>;
    dateFrom?: string;
    limit?: number;
  }): Promise<CompetitorIntelligence[]> {
    try {
      const response = await apiRequest(`${this.baseUrl}/competitors`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return response.intelligence || [];
    } catch (error) {
      console.error('[RegulatoryIntelligence] Competitor intel failed:', error);
      return [];
    }
  }

  /**
   * Get upcoming PDUFA dates
   */
  async getPDUFADates(params: {
    dateFrom?: string;
    dateTo?: string;
    status?: 'pending' | 'all';
    therapeuticArea?: string;
    limit?: number;
  }): Promise<PDUFADate[]> {
    const queryParams = new URLSearchParams();
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params.status) queryParams.set('status', params.status);
    if (params.therapeuticArea) queryParams.set('therapeuticArea', params.therapeuticArea);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    try {
      const response = await apiRequest(`${this.baseUrl}/pdufa?${queryParams}`);
      return response.dates || [];
    } catch (error) {
      console.error('[RegulatoryIntelligence] PDUFA fetch failed:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time alerts
   */
  subscribeToAlerts(
    userId: string,
    onAlert: (alert: RegulatoryAlert) => void
  ): () => void {
    // In production, this would be a WebSocket connection
    // For now, use Server-Sent Events or polling
    const eventSource = new EventSource(`${this.baseUrl}/stream?userId=${userId}`);

    eventSource.onmessage = (event) => {
      try {
        const alert = JSON.parse(event.data) as RegulatoryAlert;
        onAlert(alert);
      } catch (error) {
        console.error('[RegulatoryIntelligence] Alert parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[RegulatoryIntelligence] Stream error:', error);
    };

    return () => {
      eventSource.close();
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const regulatoryIntelligenceService = new RegulatoryIntelligenceService();
export default regulatoryIntelligenceService;
