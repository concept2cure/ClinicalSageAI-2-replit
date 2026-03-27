import { CitationJsClient } from '../../integrations/citationjs/client';
import { GrobidClient } from '../../integrations/grobid/client';
import { ScispacyClient } from '../../integrations/scispacy/client';
import type { CitationNormalizationPayload, CitationNormalized } from '../documentIntelligence/contracts';

const DOI_PATTERN = /(10\.\d{4,9}\/[\-._;()\/:A-Z0-9]+)/i;
const PMID_PATTERN = /\bPMID[:\s]*(\d{5,9})\b/i;

function buildFallbackReference(raw: string, index: number): CitationNormalized {
  const doi = raw.match(DOI_PATTERN)?.[1]?.toLowerCase();
  const pmid = raw.match(PMID_PATTERN)?.[1];

  return {
    citationId: `ref_${index + 1}`,
    sourceText: raw.trim(),
    doi,
    pmid,
    renderedApa: raw.trim(),
  };
}

export class CitationNormalizationService {
  constructor(
    private readonly grobid = new GrobidClient(),
    private readonly scispacy = new ScispacyClient(),
    private readonly citationJs = new CitationJsClient()
  ) {}

  async normalize(params: { sourceDocumentId: string; rawText: string }): Promise<CitationNormalizationPayload> {
    const referencesFromGrobid = await this.grobid.extractReferences(params.rawText);
    const fallbackReferences = extractReferencesFromRawText(params.rawText);

    const chosen = referencesFromGrobid.length > 0
      ? referencesFromGrobid.map((reference, index) => ({
          citationId: `grobid_ref_${index + 1}`,
          sourceText: reference.raw,
          doi: reference.doi,
          renderedApa: renderApaFallback(reference.raw, reference.year),
        }))
      : fallbackReferences.map(buildFallbackReference);

    const citationJsNormalized = await Promise.all(chosen.map((entry) => this.normalizeWithCitationJs(entry)));
    const enrichment = await this.scispacy.enrich(params.rawText.slice(0, 12000));

    return {
      sourceDocumentId: params.sourceDocumentId,
      references: citationJsNormalized.map((entry) => ({
        ...entry,
        cslJson: {
          ...(entry.cslJson || {}),
          biomedicalEntities: enrichment.entities.slice(0, 15),
          abbreviations: enrichment.abbreviations.slice(0, 10),
        },
      })),
    };
  }

  private async normalizeWithCitationJs(reference: CitationNormalized): Promise<CitationNormalized> {
    const normalized = await this.citationJs.normalize(reference.sourceText);
    return {
      ...reference,
      cslJson: normalized.cslJson || reference.cslJson,
      renderedApa: normalized.renderedApa || reference.renderedApa,
      doi: reference.doi || normalized.doi,
      pmid: reference.pmid || normalized.pmid,
    };
  }
}

function extractReferencesFromRawText(rawText: string): string[] {
  const referencesBlock = rawText.match(/(?:references|bibliography)\s*[:\n]([\s\S]+)/i)?.[1] || rawText;
  return referencesBlock
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20)
    .slice(0, 200);
}

function renderApaFallback(raw: string, year?: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!year) return normalized;
  return `${normalized} (${year}).`;
}
