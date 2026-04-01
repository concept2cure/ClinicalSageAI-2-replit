/**
 * Compatibility adapter for legacy OpenSearch call sites.
 *
 * Canonical implementation lives in opensearchClient.ts. This adapter preserves
 * the older class/object API expected by route handlers and tests while
 * delegating writes/queries to the canonical client.
 */
import {
  type OpenSearchIndexDocument,
  indexGovernedDocument,
  isOpenSearchEnabled,
  searchGovernedDocuments,
} from './opensearchClient';

export interface AdapterIndexDocumentInput {
  id: string;
  organizationId: number;
  projectId?: number | null;
  artifactId?: string | null;
  docType: string;
  module?: string | null;
  section?: string | null;
  title: string;
  source: string;
  provenance?: string | null;
  tags?: string[];
  lifecycleState?: string | null;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

function toCanonicalDocument(doc: AdapterIndexDocumentInput): OpenSearchIndexDocument {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    projectId: doc.projectId ?? null,
    artifactId: doc.artifactId ?? null,
    docType: doc.docType,
    module: doc.module ?? null,
    section: doc.section ?? null,
    title: doc.title,
    source: doc.source,
    provenance: doc.provenance ?? (doc.metadata ? JSON.stringify(doc.metadata) : null),
    tags: doc.tags ?? [],
    lifecycleState: doc.lifecycleState ?? null,
    content: doc.text,
    createdAt: doc.createdAt,
  };
}

export class OpenSearchAdapter {
  async indexDocument(
    doc: AdapterIndexDocumentInput
  ): Promise<{ indexed: boolean; id: string; reason?: string }> {
    if (!isOpenSearchEnabled()) {
      return { indexed: false, id: doc.id, reason: 'opensearch-disabled' };
    }

    await indexGovernedDocument(toCanonicalDocument(doc));
    return { indexed: true, id: doc.id };
  }

  async search(params: {
    query: string;
    organizationId: number;
    projectId?: number;
    size?: number;
  }) {
    return searchGovernedDocuments(params);
  }
}

export const opensearchAdapter = new OpenSearchAdapter();

export * from './opensearchClient';
