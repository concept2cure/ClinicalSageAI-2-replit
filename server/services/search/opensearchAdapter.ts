import { isOssFeatureEnabledViaEnv } from '../../config/ossStackFeatureFlags';
export interface OpenSearchDocument {
  id: string;
  organizationId: number;
  projectId?: number | null;
  artifactId?: string | null;
  docType: string;
  module?: string | null;
  section?: string | null;
  title: string;
  source?: string | null;
  lifecycleState?: string | null;
  tags?: string[];
  text: string;
  vector?: number[];
  metadata?: Record<string, unknown>;
}

export class OpenSearchAdapter {
  private readonly enabled =
    isOssFeatureEnabledViaEnv('oss.retrieval.opensearch_enabled') ||
    String(process.env.OPENSEARCH_ENABLED || 'false').toLowerCase() === 'true';
  private readonly baseUrl = process.env.OPENSEARCH_BASE_URL || 'http://localhost:9200';
  private readonly indexName = process.env.OPENSEARCH_INDEX_NAME || 'concept2cure_objects_v1';

  async ensureIndex(): Promise<void> {
    if (!this.enabled) return;
    const head = await fetch(`${this.baseUrl}/${this.indexName}`, { method: 'HEAD' });
    if (head.ok) return;

    await fetch(`${this.baseUrl}/${this.indexName}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: { index: { knn: true } },
        mappings: {
          properties: {
            organizationId: { type: 'long' },
            projectId: { type: 'long' },
            artifactId: { type: 'keyword' },
            docType: { type: 'keyword' },
            module: { type: 'keyword' },
            section: { type: 'keyword' },
            title: { type: 'text' },
            source: { type: 'keyword' },
            lifecycleState: { type: 'keyword' },
            tags: { type: 'keyword' },
            text: { type: 'text' },
            vector: { type: 'knn_vector', dimension: 1536 },
            metadata: { type: 'object', enabled: true },
          },
        },
      }),
    });
  }

  async indexDocument(doc: OpenSearchDocument): Promise<{ indexed: boolean; reason?: string }> {
    if (!this.enabled) return { indexed: false, reason: 'opensearch_disabled' };
    await this.ensureIndex();
    const response = await fetch(`${this.baseUrl}/${this.indexName}/_doc/${encodeURIComponent(doc.id)}?refresh=true`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    });

    if (!response.ok) {
      return { indexed: false, reason: `index_failed_${response.status}` };
    }

    return { indexed: true };
  }

  async hybridSearch(params: { organizationId: number; query: string; limit: number }): Promise<Array<Record<string, unknown>>> {
    if (!this.enabled) return [];
    await this.ensureIndex();

    const response = await fetch(`${this.baseUrl}/${this.indexName}/_search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        size: params.limit,
        query: {
          bool: {
            filter: [{ term: { organizationId: params.organizationId } }],
            must: [{ multi_match: { query: params.query, fields: ['title^3', 'text', 'section', 'tags'] } }],
          },
        },
      }),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json() as any;
    return (payload?.hits?.hits || []).map((hit: any) => ({ id: hit._id, score: hit._score, ...hit._source }));
  }
}

export const opensearchAdapter = new OpenSearchAdapter();
