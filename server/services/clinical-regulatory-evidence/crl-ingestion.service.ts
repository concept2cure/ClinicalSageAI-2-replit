/**
 * FDA CRL ingestion — an official Complete Response Letter mapped into the shared
 * evidence spine (§9), NOT into a separate crl_deficiencies universe.
 *
 * One CRL creates: one cre_evidence_source (source_type='fda_crl', GLOBAL_PUBLIC),
 * one application identity, zero or more linked studies, MULTIPLE
 * cre_regulatory_findings (the normalized deficiencies), one or more
 * cre_regulatory_outcomes, and the typed relationships between them
 * (REVIEWED_IN_APPLICATION, DEFICIENCY_APPLIES_TO_STUDY/…). Every finding keeps
 * its source evidence — page + verbatim excerpt + explicit-vs-inferred +
 * extraction confidence (§5/§14).
 *
 * Extraction is STAGED and pluggable (§5): the mapping core (`ingestCrl`) takes
 * already-structured findings and is deterministic + fully testable; the
 * document→findings step (`extractFindingsFromText`) runs through the AI Gateway's
 * schema-based structuredOutput. A new CRL never moves a client-facing prediction
 * merely by being ingested (§6) — it only lands evidence.
 *
 * @module server/services/clinical-regulatory-evidence/crl-ingestion.service
 */

import {
  createSource, createFinding, createOutcome, addRelationship, upsertStudy,
} from './evidence-spine.service';
import { FINDING_DOMAINS, type EvidenceSource, type RegulatoryFinding, type RegulatoryOutcome, type OutcomeType } from './types';

/** A normalized deficiency extracted from a CRL, with its source evidence. */
export interface CrlFindingInput {
  findingDomain?: string;
  findingCategory?: string;
  findingSubcategory?: string;
  fdaReviewDiscipline?: string;
  findingText: string;
  normalizedSummary?: string;
  requestedAction?: string;
  severity?: string;
  affectedCtdSection?: string;
  affectedIchE3Section?: string;
  affectedProtocolElement?: string;
  affectedSapElement?: string;
  affectedStudyDesignFeature?: string;
  sourcePage?: number;
  sourceExcerpt?: string;
  explicitOrInferred?: 'explicit' | 'inferred';
  extractionConfidence?: number;
  relatedStudyKeys?: string[];   // canonical study keys this deficiency applies to
}

export interface CrlIngestInput {
  applicationNumber: string;
  agency?: string;                 // default FDA
  applicationType?: string;        // NDA | BLA | ...
  product?: string;
  sponsor?: string;
  indication?: string;
  therapeuticArea?: string;
  phase?: string;
  documentDate?: string;
  officialUrl?: string;
  sourceRecordIdentifier?: string;
  checksum?: string;
  storedArtifactRef?: string;
  /** Canonical study keys this CRL reviews (may be empty — application-level). */
  relatedStudyKeys?: string[];
  findings: CrlFindingInput[];
  /** The lifecycle outcome(s) this document evidences; defaults to a single CRL. */
  outcomes?: { outcomeType: string; outcomeDate?: string; approvalDate?: string; timeToResolutionDays?: number }[];
}

export interface CrlIngestResult {
  source: EvidenceSource;
  findings: RegulatoryFinding[];
  outcomes: RegulatoryOutcome[];
  linkedStudyIds: number[];
  relationshipCount: number;
}

function normalizeDomain(d?: string): string | undefined {
  if (!d) return undefined;
  const v = d.toLowerCase().replace(/\s+/g, '_');
  return (FINDING_DOMAINS as readonly string[]).includes(v) ? v : 'other';
}

/**
 * Ingest a CRL whose deficiencies are already structured (deterministic path).
 * Public FDA CRLs are GLOBAL_PUBLIC evidence. Idempotent on (application_number,
 * source_record_identifier) is NOT enforced here — callers dedupe by checksum.
 */
export async function ingestCrl(orgId: number, input: CrlIngestInput): Promise<CrlIngestResult> {
  if (!input.applicationNumber) throw new Error('applicationNumber is required to ingest a CRL.');
  if (!input.findings?.length) throw new Error('A CRL ingest must carry at least one finding.');

  // 1) The source (public FDA record).
  const source = await createSource(orgId, {
    sourceType: 'fda_crl', visibilityClass: 'global_public', agency: input.agency ?? 'FDA',
    applicationType: input.applicationType ?? null, applicationNumber: input.applicationNumber,
    sourceRecordIdentifier: input.sourceRecordIdentifier ?? input.applicationNumber,
    title: `Complete Response Letter — ${input.applicationNumber}`,
    product: input.product ?? null, sponsor: input.sponsor ?? null, indication: input.indication ?? null,
    therapeuticArea: input.therapeuticArea ?? null, phase: input.phase ?? null,
    documentDate: input.documentDate ?? null, officialUrl: input.officialUrl ?? null,
    checksum: input.checksum ?? null, storedArtifactRef: input.storedArtifactRef ?? null,
    provenance: { ingestor: 'crl-ingestion', kind: 'official_fda_record' },
  });

  // 2) Linked study identities (application-level CRLs may have none — §4.2).
  const studyIdByKey = new Map<string, number>();
  for (const key of input.relatedStudyKeys ?? []) {
    const st = await upsertStudy(orgId, { canonicalStudyKey: key, visibilityClass: 'global_public', indication: input.indication ?? null, phase: input.phase ?? null });
    studyIdByKey.set(key, st.id);
  }

  let relationshipCount = 0;
  // 3) The findings (normalized deficiencies), each keeping its source evidence.
  const findings: RegulatoryFinding[] = [];
  for (const f of input.findings) {
    const relatedIds = (f.relatedStudyKeys ?? []).map((k) => studyIdByKey.get(k)).filter((v): v is number => typeof v === 'number');
    const finding = await createFinding(orgId, {
      sourceId: source.id, visibilityClass: 'global_public', applicationIdentifier: input.applicationNumber,
      relatedStudyIds: relatedIds, findingDomain: normalizeDomain(f.findingDomain),
      findingCategory: f.findingCategory ?? null, findingSubcategory: f.findingSubcategory ?? null,
      fdaReviewDiscipline: f.fdaReviewDiscipline ?? null, findingText: f.findingText,
      normalizedSummary: f.normalizedSummary ?? null, requestedAction: f.requestedAction ?? null,
      severity: f.severity ?? null, affectedCtdSection: f.affectedCtdSection ?? null,
      affectedIchE3Section: f.affectedIchE3Section ?? null, affectedProtocolElement: f.affectedProtocolElement ?? null,
      affectedSapElement: f.affectedSapElement ?? null, affectedStudyDesignFeature: f.affectedStudyDesignFeature ?? null,
      sourcePage: f.sourcePage ?? null, sourceExcerpt: f.sourceExcerpt ?? null,
      explicitOrInferred: f.explicitOrInferred ?? 'explicit', extractionConfidence: f.extractionConfidence ?? null,
      verificationStatus: 'unverified',
    });
    findings.push(finding);
    // The finding is reviewed in this application, and applies to each related study.
    await addRelationship(orgId, {
      fromEntityType: 'finding', fromEntityId: finding.id, toEntityType: 'source', toEntityId: source.id,
      relationshipType: 'reviewed_in_application', global: true,
    });
    relationshipCount++;
    for (const sid of relatedIds) {
      await addRelationship(orgId, {
        fromEntityType: 'finding', fromEntityId: finding.id, toEntityType: 'study', toEntityId: sid,
        relationshipType: 'deficiency_applies_to_study', global: true,
      });
      relationshipCount++;
    }
  }

  // 4) The outcome(s) — a CRL by default; never derived from trial completion.
  const outcomeSpecs = input.outcomes?.length ? input.outcomes : [{ outcomeType: 'crl', outcomeDate: input.documentDate }];
  const outcomes: RegulatoryOutcome[] = [];
  for (const o of outcomeSpecs) {
    outcomes.push(await createOutcome(orgId, {
      outcomeType: o.outcomeType as OutcomeType,
      visibilityClass: 'global_public', sourceId: source.id, applicationIdentifier: input.applicationNumber,
      outcomeDate: o.outcomeDate ?? null, approvalDate: (o as { approvalDate?: string }).approvalDate ?? null,
      timeToResolutionDays: (o as { timeToResolutionDays?: number }).timeToResolutionDays ?? null,
    }));
  }

  return {
    source, findings, outcomes,
    linkedStudyIds: [...studyIdByKey.values()],
    relationshipCount,
  };
}

/**
 * Extract structured findings from CRL text via the AI Gateway's schema-based
 * structuredOutput (§5 staged extraction). Deterministic where the letter is
 * structured; the model fills the normalized fields. The caller reconciles +
 * confidence-scores before ingest; low-confidence findings are flagged for human
 * review. Returns [] on any failure so ingestion never fabricates.
 */
export async function extractFindingsFromText(text: string, context: { applicationNumber?: string } = {}): Promise<CrlFindingInput[]> {
  if (!text || text.trim().length < 40) return [];
  try {
    const { getGateway } = await import('../ai-gateway/gateway');
    const schema = {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              findingDomain: { type: 'string' },
              findingCategory: { type: 'string' },
              fdaReviewDiscipline: { type: 'string' },
              findingText: { type: 'string' },
              normalizedSummary: { type: 'string' },
              requestedAction: { type: 'string' },
              severity: { type: 'string' },
              affectedIchE3Section: { type: 'string' },
              sourceExcerpt: { type: 'string' },
              explicitOrInferred: { type: 'string', enum: ['explicit', 'inferred'] },
              extractionConfidence: { type: 'number' },
            },
            required: ['findingText'],
          },
        },
      },
      required: ['findings'],
    };
    const prompt =
      `Extract the distinct deficiencies from this FDA Complete Response Letter${context.applicationNumber ? ` (application ${context.applicationNumber})` : ''}. ` +
      `For each deficiency return the review discipline/domain, a normalized one-line summary, the requested action, the affected ICH E3 section if stated, and a VERBATIM source excerpt. ` +
      `Do not infer beyond the text; mark anything not explicit as inferred with a lower confidence. Return only what the letter states.\n\n` +
      text.slice(0, 24000);
    const result = await getGateway().structuredOutput<{ findings: CrlFindingInput[] }>(prompt, schema, { temperature: 0.1 });
    return Array.isArray(result?.findings) ? result.findings.filter((f) => f && typeof f.findingText === 'string' && f.findingText.trim()) : [];
  } catch {
    return [];  // never fabricate on failure
  }
}
