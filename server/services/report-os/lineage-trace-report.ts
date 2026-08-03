/**
 * Lineage → Report-OS adapter for `provenance.evidence_trace_report`@`document`.
 *
 * Maps an existing per-document {@link DocumentLineageDossier} (assembled by
 * `buildDocumentLineageDossier`) into Report-OS's render-target-agnostic
 * {@link RenderedReport} model, with populated {@link ProvenanceRef} atoms on
 * the table/metric blocks so the EXISTING seal (`buildSealedRecord` →
 * `extractProvenanceAtoms`) captures real provenance atoms — instead of the
 * empty list the generic renderer produces.
 *
 * This is the ONLY new logic needed to route the lineage dossier through the
 * governed Report-OS pipeline: the run/snapshot persistence, entitlement gate,
 * truthfulness gate, seal, PDF anchor, catalog, and the `ReportView` /
 * `AnaReportCanvas` client renderers are all reused unchanged. Pure and
 * DB-free — unit-tested independently.
 *
 * @module server/services/report-os/lineage-trace-report
 */
import type {
  DocumentLineageDossier,
  DossierDataLineage,
} from '../ana/lineage-dossier.js';
import type {
  ProvenanceRef,
  RenderedReport,
  ReportBlock,
  ReportSection,
} from './render/types.js';

/** Bounds so a pathological document can't bloat the stored/sealed report. */
const MAX_TABLE_ROWS = 60;
const MAX_REASONING_TURNS = 12;
const REASONING_EXCERPT_CHARS = 600;
const MAX_ATOMS_PER_BLOCK = 200;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence — completeness of the document's lineage (0-100)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score how complete a document's lineage is, as the report's confidence.
 *
 * This is honest by construction: a document with real iterations AND recorded
 * decisions clears the type's `requireConfidence` (>= 70) gate and can be
 * finalized/sealed; a thin document (e.g. iterations only) scores lower and
 * renders as a viewable `partial` that cannot be sealed. Pure; clamped to the
 * pipeline's [30, 95] band so it never fabricates certainty.
 */
export function computeLineageConfidence(dossier: DocumentLineageDossier): number {
  let score = 30;
  if (dossier.versionHistory.length >= 1) score += 25;
  if (dossier.decisions.length >= 1) score += 15;
  if (dossier.provenanceEvents.length >= 1) score += 10;
  const hasCitations =
    !!dossier.ledger.citations && (dossier.ledger.citations as any).totalSentences > 0;
  if (dossier.dataLineage.length >= 1 || hasCitations) score += 10;
  if (dossier.reasoning.length >= 1) score += 5;
  if (dossier.ledger.signatures.length >= 1) score += 5;
  return Math.max(30, Math.min(95, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Block builders
// ─────────────────────────────────────────────────────────────────────────────

function metric(
  label: string,
  value: number | string | null,
  provenance?: ProvenanceRef[],
): ReportBlock {
  return { kind: 'metric', label, value, ...(provenance ? { provenance } : {}) };
}

function table(
  columns: string[],
  rows: Array<Array<string | number | null>>,
  provenance?: ProvenanceRef[],
): ReportBlock {
  const capped = rows.slice(0, MAX_TABLE_ROWS);
  return {
    kind: 'table',
    columns,
    rows: capped,
    ...(provenance ? { provenance: provenance.slice(0, MAX_ATOMS_PER_BLOCK) } : {}),
  };
}

function dataLineageRef(l: DossierDataLineage): ProvenanceRef {
  return {
    sourceTable: 'data_lineage_records',
    sourceField: l.sourceObjectType,
    recordId: l.sourceObjectId,
    transformation: l.transformationType ?? undefined,
    confidence: l.confidenceScore != null ? Math.round(l.confidenceScore) / 100 : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper
// ─────────────────────────────────────────────────────────────────────────────

export interface LineageReportMeta {
  reportTypeId: string;
  reportTypeLabel: string;
  /** Initial status stamp; the run's truthfulness gate re-stamps it at render/finalize. */
  status: RenderedReport['status'];
}

/**
 * Map a DocumentLineageDossier into a RenderedReport with provenance atoms.
 * The returned report is stored on the run at creation and re-stamped with the
 * live truthfulness status when rendered/finalized.
 */
export function dossierToRenderedReport(
  dossier: DocumentLineageDossier,
  meta: LineageReportMeta,
): RenderedReport {
  const a = dossier.ledger.artifact;
  const sections: ReportSection[] = [];

  // 1. Overview + decision rollup (AnA vs human).
  const s = dossier.decisionSummary;
  const decisionAtoms: ProvenanceRef[] = dossier.decisions.map((d) => ({
    sourceTable: 'decision_records',
    recordId: d.id,
    auditId: d.id,
  }));
  sections.push({
    id: 'overview',
    title: 'Document',
    blocks: [
      {
        kind: 'summary',
        text:
          `${a.title} — ${a.type}/${a.category}, status ${a.status}, current v${a.version}` +
          (a.ctdSection ? `, CTD ${a.ctdSection}` : '') +
          (dossier.ledger.project.name ? ` · project ${dossier.ledger.project.name}` : ''),
      },
      metric('Iterations', dossier.versionHistory.length),
      metric('Decisions (total)', s.total, decisionAtoms.length ? decisionAtoms : undefined),
      metric('AnA-authored decisions', s.anaAuthored),
      metric('Human-decided', s.humanDecided),
      metric('Approved', s.approved),
      metric('Rejected', s.rejected),
      metric('Pending', s.pending),
      metric('Signatures', dossier.ledger.signatures.length),
    ],
  });

  // 2. Iterations — every version.
  if (dossier.versionHistory.length > 0) {
    const versionAtoms: ProvenanceRef[] = dossier.versionHistory.map((v) => ({
      sourceTable: 'concept2cure_artifact_versions',
      sourceField: 'content_hash',
      recordId: v.version,
    }));
    sections.push({
      id: 'iterations',
      title: `Iterations (${dossier.versionHistory.length})`,
      blocks: [
        table(
          ['Version', 'Current', 'Change', 'Chars', 'Created'],
          dossier.versionHistory.map((v) => [
            `v${v.version}`,
            v.isCurrent ? 'yes' : '',
            v.changeDescription ?? '',
            v.contentLength,
            v.createdAt,
          ]),
          versionAtoms,
        ),
      ],
    });
  }

  // 3. Decisions — AnA vs human.
  if (dossier.decisions.length > 0) {
    sections.push({
      id: 'decisions',
      title: `Decisions — AnA & human (${dossier.decisions.length})`,
      blocks: [
        table(
          ['Authored by', 'Decided by', 'Context', 'Recommendation', 'Confidence', 'State'],
          dossier.decisions.map((d) => [
            d.authoredBy,
            d.decidedBy ?? 'pending',
            d.contextType,
            truncate(d.recommendationSummary, 160),
            d.confidence,
            d.rejectedById != null
              ? `rejected${d.rejectionReason ? `: ${truncate(d.rejectionReason, 80)}` : ''}`
              : d.approvedById != null
                ? 'approved'
                : d.actionState,
          ]),
          decisionAtoms,
        ),
      ],
    });
  }

  // 4. Evidence data-lineage — the richest atom source (source → content).
  if (dossier.dataLineage.length > 0) {
    sections.push({
      id: 'data-lineage',
      title: `Evidence data-lineage (${dossier.dataLineage.length})`,
      blocks: [
        table(
          ['Linkage', 'Source', 'Source type', 'Transformation', 'Confidence', 'Model'],
          dossier.dataLineage.map((l) => [
            l.linkageType,
            l.sourceTitle ?? l.sourceObjectId,
            l.sourceObjectType,
            l.transformationType ?? '',
            l.confidenceScore != null ? `${l.confidenceScore}%` : '',
            l.aiModelUsed ?? '',
          ]),
          dossier.dataLineage.map(dataLineageRef),
        ),
      ],
    });
  }

  // 5. Provenance events — the "how this was made" trail.
  if (dossier.provenanceEvents.length > 0) {
    const eventAtoms: ProvenanceRef[] = dossier.provenanceEvents.map((e) => ({
      sourceTable: 'concept2cure_provenance_events',
      sourceField: e.eventType,
      recordId: e.eventId,
      auditId: e.eventId,
    }));
    sections.push({
      id: 'provenance',
      title: `Provenance events (${dossier.provenanceEvents.length})`,
      blocks: [
        table(
          ['Type', 'Action', 'Actor', 'When'],
          dossier.provenanceEvents.map((e) => [
            e.eventType,
            e.eventAction,
            e.actorName ?? 'system',
            e.createdAt,
          ]),
          eventAtoms,
        ),
      ],
    });
  }

  // 6. AnA reasoning — narrative blocks (flip the seal's aiDisclosed flag).
  if (dossier.reasoning.length > 0) {
    const disclosure =
      'AI-generated reasoning captured verbatim from AnA. Provided for transparency; ' +
      'not a substitute for reviewer judgement.';
    const blocks: ReportBlock[] = dossier.reasoning
      .slice(0, MAX_REASONING_TURNS)
      .map((t) => ({
        kind: 'narrative' as const,
        text: `Turn ${t.turn}${t.model ? ` (${t.model})` : ''}: ${truncate(t.reasoning, REASONING_EXCERPT_CHARS)}`,
        aiGenerated: true as const,
        disclosure,
      }));
    sections.push({ id: 'reasoning', title: `AnA reasoning (${dossier.reasoning.length})`, blocks });
  }

  // 7. Human control actions (pause / interject / redirect), if any.
  if (dossier.humanControls.length > 0) {
    sections.push({
      id: 'human-controls',
      title: `Human control actions (${dossier.humanControls.length})`,
      blocks: [
        table(
          ['Action', 'Message', 'Turn', 'When'],
          dossier.humanControls.map((c) => [
            c.action,
            c.message ? truncate(c.message, 120) : '',
            c.turn,
            c.at ?? '',
          ]),
        ),
      ],
    });
  }

  // 8. Gaps — pending decisions + absent lineage (honest, non-fabricated).
  const gapItems: Array<{ title: string; severity?: 'critical' | 'high' | 'medium' | 'low'; message?: string }> = [];
  if (s.pending > 0) {
    gapItems.push({
      title: `${s.pending} decision(s) awaiting a human`,
      severity: 'medium',
      message: 'Decisions recorded but not yet approved or rejected.',
    });
  }
  if (dossier.dataLineage.length === 0) {
    gapItems.push({
      title: 'No evidence data-lineage links recorded',
      severity: 'low',
      message: 'This document has no source→content lineage rows yet.',
    });
  }
  if (dossier.ledger.signatures.length === 0) {
    gapItems.push({
      title: 'No e-signatures on any version',
      severity: 'low',
      message: 'No 21 CFR Part 11 signature has been applied to a version of this document.',
    });
  }
  if (gapItems.length > 0) {
    sections.push({ id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: gapItems }] });
  }

  // 9. AI disclosure — also flips the seal's aiDisclosed flag.
  sections.push({
    id: 'disclosure',
    title: 'Disclosure',
    blocks: [
      {
        kind: 'disclosure',
        method: 'Document lineage & decision dossier (AnALedger v1 + decision/provenance convergence)',
        validated: dossier.ledger.signatures.length > 0,
        note:
          'Assembled from the artifact version history, decision records, provenance events, ' +
          'evidence lineage, and AnA reasoning. Every figure links to its source record.',
      },
    ],
  });

  return {
    reportTypeId: meta.reportTypeId,
    scopeType: 'document',
    scopeId: a.artifactId,
    generatedAt: dossier.generatedAt,
    status: meta.status,
    sections,
  };
}
