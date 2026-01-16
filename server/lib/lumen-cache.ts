export class LumenCache {
  private static exactStore = new Map<
    string,
    { response: { text: string; sources?: string[] }; expiresAt: number; storedAt: number }
  >();

  // In-memory semantic cache (disabled until real embeddings are available)
  private static vectorStore: Array<{
    embedding: number[];
    metadata: { tenantId: string; module: string; normalizedQuery: string; ts: number; expiresAt: number };
    response: { text: string; sources?: string[] };
    queryHash: string;
  }> = [];

  private static stats = {
    exactHits: 0,
    exactMisses: 0,
    semanticHits: 0,
    semanticMisses: 0,
    stores: 0,
  };

  static getStats() {
    return { ...this.stats };
  }

  static async lookupExact(cacheKey: string): Promise<{ text: string; sources?: string[] } | null> {
    const hit = this.exactStore.get(cacheKey);
    const now = Date.now();
    if (!hit) {
      this.stats.exactMisses++;
      return null;
    }
    if (hit.expiresAt && hit.expiresAt <= now) {
      this.exactStore.delete(cacheKey);
      this.stats.exactMisses++;
      return null;
    }
    this.stats.exactHits++;
    return { text: hit.response.text, sources: hit.response.sources || [] };
  }

  static async lookup(
    tenantId: string,
    module: string,
    normalizedQuery: string,
    threshold = 0.9
  ): Promise<{ response: { text: string; sources?: string[] }; score: number; queryHash: string } | null> {
    const now = Date.now();
    this.stats.semanticMisses++;
    return null;
  }

  static async store(params: {
    tenantId: string;
    module: string;
    normalizedQuery: string;
    queryHash: string;
    response: { text: string; sources?: string[] };
    ttlMs: number;
  }) {
    const now = Date.now();
    const expiresAt = now + Math.max(0, params.ttlMs || 0);
    const cacheKey = `${params.tenantId}:${params.module}:${params.queryHash}`;

    // Exact cache
    this.exactStore.set(cacheKey, { response: params.response, expiresAt, storedAt: now });

    // Semantic cache entry
    // Semantic cache disabled until real embeddings are configured.

    this.stats.stores++;
  }

  private static _cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return magA && magB ? dot / (magA * magB) : 0;
  }
}
