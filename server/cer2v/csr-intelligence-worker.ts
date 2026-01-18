import logger from '../utils/logger';
import { HealthCanadaProxy } from './health-canada-proxy';

export interface RawCSRData {
  clinicalTrialId: string;
  deviceName: string;
  sponsor: string;
  primaryEndpoint: string;
  enrollment: number;
  adverseEvents: number;
  successRate: number;
  studyStatus: 'COMPLETED' | 'ONGOING' | 'TERMINATED' | 'UNKNOWN';
  dataCompleteness: number;
  isRealData: boolean; // NEW: Tracks if this came from Health Canada API
}

export interface EnrichedCSR extends RawCSRData {
  predicateDeviceMatch: string | null;
  regulatoryRelevance: 'HIGH' | 'MEDIUM' | 'LOW';
  fdaSubstantialEquivalence: boolean;
  qcFlags: string[];
}

export class CSRFetcher {
  private proxy: HealthCanadaProxy;
  private maxRetries = 3;
  private rateLimit = 1000;

  constructor() {
    // Initialize proxy with production config
    this.proxy = new HealthCanadaProxy({
      apiKey: process.env.HEALTH_CANADA_API_KEY || '',
      useProxy: process.env.USE_HEALTH_CANADA_PROXY === 'true',
      proxyUrl: process.env.HEALTH_CANADA_PROXY_URL || undefined,
    });
  }

  async fetchCSR(csrId: string): Promise<RawCSRData> {
    logger.info(`CSR_FETCH: Initiating fetch for ${csrId}`);

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const data = await this.proxy.fetchCSRData(csrId);

        const parsed = this.parseRawData(data, csrId);
        parsed.isRealData = this.proxy.isRealData(data); // Flag real vs fallback

        logger.info(`CSR_FETCH: Successfully retrieved ${csrId} (Real data: ${parsed.isRealData})`);
        return parsed;
      } catch (error: any) {
        logger.error(`CSR_FETCH: Attempt ${attempt} failed for ${csrId}`, {
          error: error?.message || error,
        });
        if (attempt === this.maxRetries) throw error;
        await this.delay(this.rateLimit * attempt);
      }
    }

    throw new Error(`CSR_FETCH: Exhausted retries for ${csrId}`);
  }

  private parseRawData(data: any, csrId: string): RawCSRData {
    const completeness = this.calculateCompleteness(data);

    return {
      clinicalTrialId: csrId,
      deviceName: data.medicalDevice?.name || data.studyTitle || 'Unknown Device',
      sponsor: data.sponsor?.organization || 'Unknown Sponsor',
      primaryEndpoint: data.primaryEndpoint?.description || 'Not specified',
      enrollment: data.enrollment?.count || 0,
      adverseEvents: data.safetyData?.adverseEvents || 0,
      successRate: data.efficacyData?.primarySuccessRate || 0,
      studyStatus: data.studyStatus || 'UNKNOWN',
      dataCompleteness: completeness,
      isRealData: false,
    };
  }

  private calculateCompleteness(data: any): number {
    let completeFields = 0;
    const totalFields = 8;

    if (data.medicalDevice?.name) completeFields += 1;
    if (data.sponsor?.organization) completeFields += 1;
    if (data.primaryEndpoint?.description) completeFields += 1;
    if (data.enrollment?.count) completeFields += 1;
    if (data.safetyData?.adverseEvents !== undefined) completeFields += 1;
    if (data.efficacyData?.primarySuccessRate) completeFields += 1;
    if (data.studyStatus) completeFields += 1;
    if (data.studyCompletionDate) completeFields += 1;

    return Math.round((completeFields / totalFields) * 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
