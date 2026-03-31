import { GrobidClient } from '../../integrations/grobid/client';
import { isOssFeatureEnabledViaEnv } from '../../config/ossStackFeatureFlags';

export interface ScholarlyExtractionResult {
  title?: string;
  authors: string[];
  abstract?: string;
  sections: Array<{ title: string; content: string }>;
  references: Array<{ raw: string; title?: string; authors?: string[]; doi?: string }>;
  provider: 'grobid' | 'fallback';
  warnings: string[];
}

const SCHOLARLY_HINTS = [/doi\s*:/i, /abstract/i, /references/i, /journal/i, /pmid/i];

export function shouldUseGrobid(params: { filename?: string; mimeType?: string; text?: string }): boolean {
  const file = (params.filename || '').toLowerCase();
  const mime = (params.mimeType || '').toLowerCase();
  const text = params.text || '';

  if (mime.includes('pdf') && SCHOLARLY_HINTS.some((rx) => rx.test(text.slice(0, 8000)))) {
    return true;
  }

  return file.endsWith('.pdf') && SCHOLARLY_HINTS.some((rx) => rx.test(text.slice(0, 8000)));
}

export class GrobidLiteratureService {
  private readonly grobidEnabled =
    isOssFeatureEnabledViaEnv('oss.ingestion.grobid_enabled') ||
    String(process.env.GROBID_ENABLED || 'false').toLowerCase() === 'true';

  constructor(private readonly grobidClient = new GrobidClient()) {}

  async extractStructuredLiterature(params: {
    filename: string;
    mimeType: string;
    text: string;
  }): Promise<ScholarlyExtractionResult> {
    const base = fallbackExtraction(params.text);

    if (!this.grobidEnabled || !shouldUseGrobid(params)) {
      return {
        ...base,
        provider: 'fallback',
        warnings: this.grobidEnabled ? ['grobid_not_selected'] : ['grobid_disabled'],
      };
    }

    const refs = await this.grobidClient.extractReferences(params.text);

    return {
      ...base,
      references: refs.map((r) => ({
        raw: r.raw,
        title: r.title,
        authors: r.authors,
        doi: r.doi,
      })),
      provider: 'grobid',
      warnings: refs.length ? [] : ['grobid_returned_no_references'],
    };
  }
}

function fallbackExtraction(text: string): Omit<ScholarlyExtractionResult, 'provider' | 'warnings'> {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = lines[0];
  const abstractMatch = text.match(/abstract\s*[:\n]([\s\S]*?)(?:\n\s*\n|\n1\.|\nintroduction)/i);
  const referencesBlock = text.match(/references\s*[:\n]([\s\S]*)$/i)?.[1] || '';

  return {
    title,
    authors: [],
    abstract: abstractMatch?.[1]?.trim(),
    sections: [],
    references: referencesBlock
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 20)
      .slice(0, 150)
      .map((line) => ({ raw: line })),
  };
}

export const grobidLiteratureService = new GrobidLiteratureService();
