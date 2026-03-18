/**
 * @fileoverview ClinicalTrials.gov Connector
 * Uses the ClinicalTrials.gov API v2 directly.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class ClinicalTrialsGovConnector implements DataConnector {
  id = 'clinical_trials_gov';
  name = 'ClinicalTrials.gov';
  type = 'api' as const;
  requiresCredentials = false;
  requiredTier = 'free';

  private baseUrl = 'https://clinicaltrials.gov/api/v2';

  async status(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/studies?query.cond=test&pageSize=1`);
      return {
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const params = new URLSearchParams();
    if (query.indication) params.set('query.cond', query.indication);
    if (query.intervention) params.set('query.intr', query.intervention);
    if (query.sponsor) params.set('query.spons', query.sponsor);
    if (query.keywords?.length) params.set('query.term', query.keywords.join(' '));
    if (query.phase) {
      const phaseMap: Record<string, string> = {
        '1': 'PHASE1', '2': 'PHASE2', '3': 'PHASE3', '4': 'PHASE4',
        'I': 'PHASE1', 'II': 'PHASE2', 'III': 'PHASE3', 'IV': 'PHASE4',
      };
      params.set('filter.phase', phaseMap[query.phase] || query.phase);
    }
    params.set('pageSize', String(query.limit || 20));
    params.set('fields', 'NCTId,BriefTitle,Condition,InterventionName,Phase,OverallStatus,EnrollmentCount,StartDate,CompletionDate,LeadSponsorName');

    const res = await fetch(`${this.baseUrl}/studies?${params}`);
    if (!res.ok) throw new Error(`ClinicalTrials.gov API error: ${res.status}`);

    const data = await res.json();
    const studies = data.studies || [];

    return studies.map((study: any, i: number) => {
      const proto = study.protocolSection || {};
      const id = proto.identificationModule?.nctId || `CTG-${i}`;
      const title = proto.identificationModule?.briefTitle || 'Untitled Study';
      const conditions = proto.conditionsModule?.conditions?.join(', ') || '';
      const phase = proto.designModule?.phases?.join(', ') || '';
      const status = proto.statusModule?.overallStatus || '';
      const sponsor = proto.sponsorCollaboratorsModule?.leadSponsor?.name || '';
      const enrollment = proto.designModule?.enrollmentInfo?.count || 0;

      return {
        id,
        sourceConnector: this.id,
        title,
        summary: `${conditions} | Phase: ${phase} | Status: ${status} | Sponsor: ${sponsor} | N=${enrollment}`,
        relevanceScore: 1 - i * 0.03,
        metadata: { nctId: id, conditions, phase, status, sponsor, enrollment },
        url: `https://clinicaltrials.gov/study/${id}`,
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const res = await fetch(`${this.baseUrl}/studies/${resourceId}`);
    if (!res.ok) throw new Error(`Study ${resourceId} not found`);

    const data = await res.json();
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: data.protocolSection?.identificationModule?.briefTitle || resourceId,
      type: 'clinical_trial',
      content: JSON.stringify(data, null, 2),
      metadata: data.protocolSection || {},
      url: `https://clinicaltrials.gov/study/${resourceId}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {
    // No auth needed for public API
  }
}
