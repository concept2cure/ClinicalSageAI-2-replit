import { createScopedLogger } from '../../utils/logger';
import type { ParsedDocument } from '../../services/documentIntelligence/contracts';

const logger = createScopedLogger('docling-client');

export class DoclingClient {
  constructor(
    private readonly baseUrl = process.env.DOCLING_BASE_URL || 'http://localhost:8070',
    private readonly timeoutMs = Number(process.env.DOCLING_TIMEOUT_MS || 45000)
  ) {}

  async parse(input: Buffer, filename: string): Promise<ParsedDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/parse`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/octet-stream',
          'X-File-Name': filename,
        },
        body: input,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Docling responded ${response.status}`);
      }

      const payload = (await response.json()) as {
        text?: string;
        sections?: Array<{ id?: string; title?: string; level?: number; text?: string }>;
        confidence?: number;
      };

      return {
        provider: 'docling',
        text: payload.text || '',
        sections: (payload.sections || []).map((section, index) => ({
          id: section.id || `docling_${index}`,
          title: section.title || `Section ${index + 1}`,
          level: section.level || 1,
          text: section.text || '',
        })),
        confidence: payload.confidence ?? 0.7,
        warnings: [],
      };
    } catch (error: any) {
      logger.warn('Docling parse failed', { error: error?.message, filename });
      return {
        provider: 'docling',
        text: '',
        sections: [],
        confidence: 0,
        warnings: [error?.message || 'docling_unavailable'],
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
