import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('grobid-client');

export interface GrobidReference {
  raw: string;
  title?: string;
  authors?: string[];
  journal?: string;
  year?: string;
  doi?: string;
}

export class GrobidClient {
  constructor(
    private readonly baseUrl = process.env.GROBID_BASE_URL || 'http://localhost:8071',
    private readonly timeoutMs = Number(process.env.GROBID_TIMEOUT_MS || 30000)
  ) {}

  async extractReferences(fullText: string): Promise<GrobidReference[]> {
    if (!fullText.trim()) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formData = new FormData();
      formData.append('text', fullText);
      formData.append('consolidateCitations', '1');

      const response = await fetch(`${this.baseUrl}/api/processCitationList`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`GROBID responded ${response.status}`);
      }

      const xml = await response.text();
      return extractReferencesFromTei(xml);
    } catch (error: any) {
      logger.warn('GROBID extraction failed', { error: error?.message });
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractReferencesFromTei(xml: string): GrobidReference[] {
  const refs: GrobidReference[] = [];
  const entries = xml.match(/<biblStruct[\s\S]*?<\/biblStruct>/g) || [];

  for (const entry of entries) {
    const title = firstMatch(entry, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const year = firstMatch(entry, /<date[^>]*when="(\d{4})"/i);
    const journal = firstMatch(entry, /<title level="j"[^>]*>([\s\S]*?)<\/title>/i);
    const doi = firstMatch(entry, /<idno type="DOI">([\s\S]*?)<\/idno>/i);
    const authorMatches = [...entry.matchAll(/<surname>([^<]+)<\/surname>/g)].map((match) => match[1]);

    refs.push({
      raw: stripTei(entry),
      title,
      authors: authorMatches.length ? authorMatches : undefined,
      journal,
      year,
      doi,
    });
  }

  return refs;
}

function firstMatch(input: string, regex: RegExp): string | undefined {
  const match = input.match(regex);
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

function stripTei(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
