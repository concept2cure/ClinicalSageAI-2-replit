import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('scispacy-client');

export interface ScispacyEntity {
  text: string;
  label: string;
  cui?: string;
}

export interface ScispacyEnrichment {
  entities: ScispacyEntity[];
  abbreviations: Array<{ shortForm: string; longForm: string }>;
}

export class ScispacyClient {
  constructor(
    private readonly baseUrl = process.env.SCISPACY_BASE_URL || 'http://localhost:8090',
    private readonly timeoutMs = Number(process.env.SCISPACY_TIMEOUT_MS || 20000)
  ) {}

  async enrich(text: string): Promise<ScispacyEnrichment> {
    if (!text.trim()) return { entities: [], abbreviations: [] };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`scispaCy responded ${response.status}`);
      }

      const payload = (await response.json()) as ScispacyEnrichment;
      return {
        entities: payload.entities || [],
        abbreviations: payload.abbreviations || [],
      };
    } catch (error: any) {
      logger.warn('scispaCy enrichment failed', { error: error?.message });
      return { entities: [], abbreviations: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}
