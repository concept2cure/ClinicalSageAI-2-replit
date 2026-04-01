export interface OpenSearchIndexDocument {
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
  content: string;
  createdAt?: string;
}

export function isOpenSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPENSEARCH_ENABLED === 'true' && Boolean(env.OPENSEARCH_BASE_URL);
}

function endpoint(path: string): string {
  const base = (process.env.OPENSEARCH_BASE_URL || '').replace(/\/$/, '');
  const index = process.env.OPENSEARCH_INDEX || 'concept2cure-documents';
  return `${base}/${index}${path}`;
}

export async function indexGovernedDocument(doc: OpenSearchIndexDocument): Promise<void> {
  if (!isOpenSearchEnabled()) return;

  await fetch(endpoint(`/_doc/${encodeURIComponent(doc.id)}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OPENSEARCH_API_KEY ? { Authorization: `ApiKey ${process.env.OPENSEARCH_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      ...doc,
      searchableText: doc.content,
      updatedAt: new Date().toISOString(),
    }),
  });
}

export async function searchGovernedDocuments(input: {
  query: string;
  organizationId: number;
  projectId?: number;
  size?: number;
}) {
  if (!isOpenSearchEnabled()) return null;

  const resp = await fetch(endpoint('/_search'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OPENSEARCH_API_KEY ? { Authorization: `ApiKey ${process.env.OPENSEARCH_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      size: input.size ?? 20,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: input.query,
                fields: ['title^3', 'content', 'tags^2', 'source', 'module', 'section'],
              },
            },
          ],
          filter: [
            { term: { organizationId: input.organizationId } },
            ...(input.projectId ? [{ term: { projectId: input.projectId } }] : []),
          ],
        },
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenSearch query failed (${resp.status})`);
  }

  return resp.json();
}
