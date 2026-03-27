import { createScopedLogger } from '../../utils/logger';
import type { TikaMetadataResult } from '../../services/documentIntelligence/contracts';

const logger = createScopedLogger('tika-client');

export class TikaClient {
  constructor(
    private readonly baseUrl = process.env.TIKA_BASE_URL || 'http://localhost:9998',
    private readonly timeoutMs = Number(process.env.TIKA_TIMEOUT_MS || 20000)
  ) {}

  async detectMetadata(input: Buffer, filename: string): Promise<TikaMetadataResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/rmeta/text`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/octet-stream',
          'X-File-Name': filename,
        },
        body: input,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Tika responded ${response.status}`);
      }

      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const first = payload[0] || {};
      const contentType = String(first['Content-Type'] || 'application/octet-stream');
      const text = String(first['X-TIKA:content'] || '');
      const isScannedPdf = contentType.includes('pdf') && text.trim().length < 40;

      return {
        contentType,
        detectedType: String(first['resourceName'] || filename),
        isScannedPdf,
        languageHints: first['dc:language'] ? [String(first['dc:language'])] : [],
        metadata: Object.fromEntries(
          Object.entries(first).filter(([key]) => !key.startsWith('X-TIKA'))
        ) as Record<string, string | number | boolean | null>,
      };
    } catch (error: any) {
      logger.warn('Tika metadata extraction failed', { error: error?.message, filename });
      return {
        contentType: 'application/octet-stream',
        detectedType: filename,
        isScannedPdf: false,
        languageHints: [],
        metadata: { fallback: true, reason: error?.message || 'unknown' },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
