/**
 * @fileoverview PubMed / NCBI E-utilities Connector
 * Free public API for biomedical literature search.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class PubMedConnector implements DataConnector {
  id = 'pubmed';
  name = 'PubMed / MEDLINE';
  type = 'api' as const;
  requiresCredentials = false;
  requiredTier = 'free';

  private baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

  async status(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/einfo.fcgi?db=pubmed&retmode=json`);
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch {
      return { status: 'unavailable', lastChecked: new Date() };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const terms: string[] = [];
    if (query.indication) terms.push(`${query.indication}[MeSH Terms]`);
    if (query.intervention) terms.push(`${query.intervention}[Title/Abstract]`);
    if (query.keywords?.length) terms.push(query.keywords.join(' AND '));
    if (query.therapeuticArea) terms.push(`${query.therapeuticArea}[MeSH Terms]`);

    const searchTerm = terms.join(' AND ') || 'clinical trial';
    const limit = query.limit || 20;

    // ESearch to get IDs
    const searchRes = await fetch(
      `${this.baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=${limit}&retmode=json&sort=relevance`
    );
    if (!searchRes.ok) throw new Error(`PubMed search error: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids: string[] = searchData.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    // ESummary to get details
    const summaryRes = await fetch(
      `${this.baseUrl}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
    );
    if (!summaryRes.ok) throw new Error(`PubMed summary error: ${summaryRes.status}`);
    const summaryData = await summaryRes.json();
    const results = summaryData.result || {};

    return ids.map((id, i) => {
      const article = results[id] || {};
      const authors = (article.authors || []).map((a: any) => a.name).slice(0, 3).join(', ');
      const journal = article.fulljournalname || article.source || '';
      const year = article.pubdate?.split(' ')[0] || '';

      return {
        id: `PMID:${id}`,
        sourceConnector: this.id,
        title: article.title || `PubMed ${id}`,
        summary: `${authors}${authors ? '. ' : ''}${journal} (${year}). ${article.title || ''}`,
        relevanceScore: 1 - i * 0.04,
        metadata: { pmid: id, journal, year, authors: article.authors, doi: article.elocationid },
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const pmid = resourceId.replace('PMID:', '');
    const res = await fetch(`${this.baseUrl}/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`);
    if (!res.ok) throw new Error(`PubMed fetch error: ${res.status}`);

    const content = await res.text();
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `PubMed Article ${pmid}`,
      type: 'publication',
      content,
      metadata: { pmid },
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {
    // Public API
  }
}
