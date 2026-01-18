import logger from '../utils/logger';
import type { EnrichedCSR, RawCSRData } from './csr-intelligence-worker';

export class CSRValidator {
  // Stage 2: Validate data quality
  validate(rawCSR: RawCSRData): string[] {
    const errors: string[] = [];

    if (rawCSR.dataCompleteness < 70) {
      errors.push(`Insufficient data completeness: ${rawCSR.dataCompleteness}%`);
    }

    if (rawCSR.enrollment < 30) {
      errors.push(`Enrollment too low: ${rawCSR.enrollment} patients`);
    }

    if (rawCSR.successRate < 50 || rawCSR.successRate > 100) {
      errors.push(`Invalid success rate: ${rawCSR.successRate}%`);
    }

    if (rawCSR.studyStatus !== 'COMPLETED') {
      errors.push(`Study not completed: ${rawCSR.studyStatus}`);
    }

    return errors;
  }
}

export class CSREnricher {
  private predicateDatabase = [
    {
      predicateId: 'PRED-2023-001',
      deviceName: 'Legacy Stent System',
      indication: 'Coronary artery disease',
    },
    {
      predicateId: 'PRED-2022-008',
      deviceName: 'Standard Balloon Catheter',
      indication: 'Percutaneous transluminal coronary angioplasty',
    },
  ];

  // Stage 3: Enrich with predicate matching
  enrich(rawCSR: RawCSRData): EnrichedCSR {
    logger.info(`CSR_ENRICH: Enriching ${rawCSR.clinicalTrialId}`);

    const predicateMatch = this.findBestPredicate(rawCSR);
    const relevance = this.calculateRegulatoryRelevance(rawCSR);

    return {
      ...rawCSR,
      predicateDeviceMatch: predicateMatch?.predicateId || null,
      regulatoryRelevance: relevance,
      fdaSubstantialEquivalence: this.evaluateSubstantialEquivalence(rawCSR, predicateMatch),
      qcFlags: this.generateQCFlags(rawCSR, relevance),
    };
  }

  private findBestPredicate(rawCSR: RawCSRData): any | null {
    const endpoint = rawCSR.primaryEndpoint?.toLowerCase() || '';
    return (
      this.predicateDatabase.find(p => endpoint.includes(p.indication.toLowerCase())) || null
    );
  }

  private calculateRegulatoryRelevance(rawCSR: RawCSRData): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (rawCSR.dataCompleteness >= 85 && rawCSR.enrollment >= 100) return 'HIGH';
    if (rawCSR.dataCompleteness >= 70 && rawCSR.enrollment >= 50) return 'MEDIUM';
    return 'LOW';
  }

  private evaluateSubstantialEquivalence(rawCSR: RawCSRData, predicate: any): boolean {
    return predicate !== null && rawCSR.successRate >= 80 && rawCSR.adverseEvents < 5;
  }

  private generateQCFlags(
    rawCSR: RawCSRData,
    relevance: 'HIGH' | 'MEDIUM' | 'LOW'
  ): string[] {
    const flags: string[] = [];

    if (rawCSR.dataCompleteness < 85) flags.push('INCOMPLETE_DATA');
    if (rawCSR.adverseEvents > 10) flags.push('SAFETY_CONCERN');
    if (relevance === 'LOW') flags.push('LOW_RELEVANCE');

    return flags;
  }
}
