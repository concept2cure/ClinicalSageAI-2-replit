export interface DraftRequest {
  documentId: string;
  sectionId: string;
  context: string;
}

export interface SourceReference {
  id: string;
  name: string;
  type: 'dataset' | 'document';
  confidenceScore: number;
}

export interface DraftResponse {
  success: boolean;
  markdown: string;
  sources: SourceReference[];
}

interface DraftApiFact {
  id?: string | null;
  source?: string | null;
  sourceLabel?: string | null;
  confidence?: number | null;
  type?: 'dataset' | 'document' | null;
}

interface DraftApiSource {
  id?: string;
  name?: string;
  type?: 'dataset' | 'document';
  confidenceScore?: number;
}

interface DraftApiResponse {
  success?: boolean;
  text?: string;
  markdown?: string;
  sources?: DraftApiSource[];
  facts?: DraftApiFact[];
  message?: string;
}

const normaliseSourceId = (candidate?: string | null): string | null => {
  if (!candidate) {
    return null;
  }

  return candidate.trim();
};

const buildSources = (payload: DraftApiResponse): SourceReference[] => {
  const fromSources = payload.sources
    ?.map(source => {
      const id = normaliseSourceId(source.id);
      if (!id || !source.name) {
        return null;
      }

      return {
        id,
        name: source.name,
        type: source.type ?? 'dataset',
        confidenceScore: source.confidenceScore ?? 0,
      } satisfies SourceReference;
    })
    .filter((entry): entry is SourceReference => Boolean(entry)) ?? [];

  if (fromSources.length > 0) {
    return fromSources;
  }

  const fromFacts = payload.facts
    ?.map(fact => {
      const id = normaliseSourceId(fact.id) ?? normaliseSourceId(fact.source);
      const label = fact.sourceLabel ?? fact.source ?? undefined;
      if (!id || !label) {
        return null;
      }

      return {
        id,
        name: label,
        type: fact.type ?? 'dataset',
        confidenceScore: fact.confidence ?? 0,
      } satisfies SourceReference;
    })
    .filter((entry): entry is SourceReference => Boolean(entry)) ?? [];

  const deduped = new Map<string, SourceReference>();
  fromFacts.forEach(entry => {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
    }
  });

  return Array.from(deduped.values());
};

export class LumenAIService {
  public static async generateSectionDraft(request: DraftRequest): Promise<DraftResponse> {
    const response = await fetch('/api/ai/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId: request.documentId,
        sectionId: request.sectionId,
        section: request.sectionId,
        context: request.context,
        prompt: request.context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Lumen AI draft request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as DraftApiResponse;
    const markdown = payload.text ?? payload.markdown ?? '';

    if (!payload.success || !markdown) {
      throw new Error(payload.message || 'Lumen AI draft request returned no content');
    }

    return {
      success: true,
      markdown,
      sources: buildSources(payload),
    };
  }
}
