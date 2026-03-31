import { TikaClient } from '../../integrations/tika/client';
import { DocumentIntakePipeline } from '../documentIntelligence/intakePipeline';
import type { IntakePipelineReport } from '../documentIntelligence/contracts';
import { isOssFeatureEnabledViaEnv } from '../../config/ossStackFeatureFlags';

export interface TikaNormalizedExtraction {
  contentType: string;
  normalizedMimeType: string;
  metadata: Record<string, unknown>;
  extractedText: string;
  parserProvider: string;
  warnings: string[];
  provenance: IntakePipelineReport['provenance'];
}

function normalizeMimeType(contentType: string): string {
  const base = (contentType || '').split(';')[0]?.trim().toLowerCase();
  if (!base) return 'application/octet-stream';
  if (base === 'application/x-pdf') return 'application/pdf';
  return base;
}

export class TikaIngestionService {
  private readonly tikaEnabled =
    isOssFeatureEnabledViaEnv('oss.ingestion.tika_enabled') ||
    String(process.env.TIKA_ENABLED || 'false').toLowerCase() === 'true';

  constructor(
    private readonly tika = new TikaClient(),
    private readonly intakePipeline = new DocumentIntakePipeline()
  ) {}

  async extractFromBuffer(params: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<TikaNormalizedExtraction> {
    if (!this.tikaEnabled) {
      const report = await this.intakePipeline.process({
        file: {
          filename: params.filename,
          mimeType: params.mimeType,
          sizeBytes: params.buffer.length,
        },
        inputBuffer: params.buffer,
      });

      const selected = report.selectedProvider === report.primaryParse.provider
        ? report.primaryParse
        : report.fallbackParse || report.primaryParse;

      return {
        contentType: params.mimeType || 'application/octet-stream',
        normalizedMimeType: normalizeMimeType(params.mimeType),
        metadata: { source: 'legacy_parser_fallback', tikaEnabled: false },
        extractedText: selected.text || '',
        parserProvider: selected.provider,
        warnings: ['tika_disabled', ...(selected.warnings || [])],
        provenance: report.provenance,
      };
    }

    const metadata = await this.tika.detectMetadata(params.buffer, params.filename);
    const report = await this.intakePipeline.process({
      file: {
        filename: params.filename,
        mimeType: metadata.contentType || params.mimeType,
        sizeBytes: params.buffer.length,
      },
      inputBuffer: params.buffer,
    });

    const selected = report.selectedProvider === report.primaryParse.provider
      ? report.primaryParse
      : report.fallbackParse || report.primaryParse;

    return {
      contentType: metadata.contentType,
      normalizedMimeType: normalizeMimeType(metadata.contentType || params.mimeType),
      metadata: {
        ...metadata.metadata,
        languageHints: metadata.languageHints,
        isScannedPdf: metadata.isScannedPdf,
      },
      extractedText: selected.text || '',
      parserProvider: report.selectedProvider,
      warnings: selected.warnings || [],
      provenance: report.provenance,
    };
  }
}

export const tikaIngestionService = new TikaIngestionService();
