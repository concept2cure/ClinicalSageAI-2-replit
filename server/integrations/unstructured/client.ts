import { createScopedLogger } from '../../utils/logger';
import type { ParsedDocument } from '../../services/documentIntelligence/contracts';

const logger = createScopedLogger('unstructured-client');

export class UnstructuredClient {
  constructor(
    private readonly baseUrl = process.env.UNSTRUCTURED_BASE_URL || 'http://localhost:8000',
    private readonly timeoutMs = Number(process.env.UNSTRUCTURED_TIMEOUT_MS || 45000)
  ) {}

  async parse(input: Buffer, filename: string): Promise<ParsedDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formData = new FormData();
      formData.append('files', new Blob([input]), filename);
      formData.append('strategy', 'fast');

      const response = await fetch(`${this.baseUrl}/general/v0/general`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Unstructured responded ${response.status}`);
      }

      const payload = (await response.json()) as Array<{
        text?: string;
        type?: string;
        metadata?: { page_number?: number };
      }>;

      const sections = payload
        .filter((entry) => Boolean(entry.text))
        .map((entry, index) => ({
          id: `unstructured_${index}`,
          title: entry.type || `Element ${index + 1}`,
          level: 2,
          text: entry.text || '',
          pageStart: entry.metadata?.page_number,
        }));

      return {
        provider: 'unstructured',
        text: sections.map((section) => section.text).join('\n\n'),
        sections,
        confidence: sections.length > 0 ? 0.65 : 0.1,
        warnings: [],
      };
    } catch (error: any) {
      logger.warn('Unstructured parse failed', { error: error?.message, filename });
      return {
        provider: 'unstructured',
        text: '',
        sections: [],
        confidence: 0,
        warnings: [error?.message || 'unstructured_unavailable'],
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
