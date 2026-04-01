/**
 * @deprecated Use the canonical client at ./opensearchClient instead.
 * This file re-exports for backward compatibility.
 */
export * from './opensearchClient';

import { indexGovernedDocument } from './opensearchClient';

export class OpenSearchAdapter {
  async indexDocument(input: {
    id: string;
    organizationId: number;
    projectId?: number | null;
    docType: string;
    title: string;
    text: string;
  }): Promise<{ indexed: boolean }> {
    if (process.env.OPENSEARCH_ENABLED !== 'true' || !process.env.OPENSEARCH_BASE_URL) {
      return { indexed: false };
    }

    await indexGovernedDocument({
      id: input.id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      docType: input.docType,
      title: input.title,
      source: 'legacy-adapter',
      content: input.text,
    });

    return { indexed: true };
  }
}
