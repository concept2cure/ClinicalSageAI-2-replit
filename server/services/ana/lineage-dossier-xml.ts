/**
 * Document Lineage & Decision Dossier XML serializer.
 *
 * Turns a DocumentLineageDossier into a stable, well-formed XML document so a
 * generated document can carry — or be exported alongside — its full data +
 * decision lineage as structured metadata (the "all documents obtain the XML
 * metadata" requirement). It nests the existing AnALedger v1 payload (reused
 * verbatim from the docx-export serializer) inside a superset dossier root that
 * adds the version history (all iterations), the AI-vs-human decision ledger,
 * the provenance event trail, AnA's persisted reasoning, and the evidence
 * data-lineage.
 *
 * Schema namespace: http://concept2cure.com/schemas/DocumentLineageDossier/v1
 *
 * Serialization rules match the AnALedger serializer: all text/attributes are
 * XML-escaped; dates are ISO-8601; arbitrary JSON (decision provenance,
 * provenance-event details) is CDATA-wrapped under a <Json/> child; pretty
 * printed so a forensic reviewer can read it directly.
 *
 * @module server/services/ana/lineage-dossier-xml
 */
import { serializeAnALedgerXml } from '../export/docx-ledger-xml.js';
import type { DocumentLineageDossier } from './lineage-dossier.js';

export const DOSSIER_NAMESPACE =
  'http://concept2cure.com/schemas/DocumentLineageDossier/v1';

function xmlEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control chars that would invalidate the XML (intentional).
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function attr(name: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  return ` ${name}="${xmlEscape(value)}"`;
}

function leafEl(name: string, value: unknown, indent: string): string {
  if (value === null || value === undefined) return `${indent}<${name} xsi:nil="true"/>\n`;
  return `${indent}<${name}>${xmlEscape(value)}</${name}>\n`;
}

function jsonEl(name: string, value: unknown, indent: string): string {
  if (value === null || value === undefined) return `${indent}<${name} xsi:nil="true"/>\n`;
  const safe = JSON.stringify(value).replace(/]]>/g, ']]]]><![CDATA[>');
  return `${indent}<${name}><![CDATA[${safe}]]></${name}>\n`;
}

/**
 * Nest the AnALedger XML (a standalone document) under the dossier root:
 * strip its XML prolog and re-indent every line by two spaces so it sits as a
 * child element without breaking well-formedness.
 */
function embedLedger(dossier: DocumentLineageDossier): string {
  const ledgerXml = serializeAnALedgerXml(dossier.ledger);
  return ledgerXml
    .split('\n')
    .filter((line) => !line.startsWith('<?xml'))
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n');
}

/** Serialize a DocumentLineageDossier to a complete dossier XML document. */
export function serializeDocumentLineageDossierXml(
  dossier: DocumentLineageDossier,
): string {
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`);
  out.push(
    `<DocumentLineageDossier xmlns="${DOSSIER_NAMESPACE}"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` schemaVersion="${xmlEscape(dossier.schemaVersion)}"` +
      ` generatedAt="${xmlEscape(dossier.generatedAt)}"` +
      `${attr('threadId', dossier.threadId)}>\n`,
  );

  // Base AnALedger (artifact, org, project, citations, plan, audit, sigs, proposals, runs).
  out.push(`${embedLedger(dossier)}\n`);

  // Version history — every iteration.
  out.push(`  <VersionHistory count="${dossier.versionHistory.length}">\n`);
  for (const v of dossier.versionHistory) {
    out.push(`    <Version`);
    out.push(attr('version', v.version));
    out.push(attr('isCurrent', String(v.isCurrent)));
    out.push(attr('contentLength', v.contentLength));
    out.push(attr('createdAt', v.createdAt));
    out.push(`>\n`);
    out.push(leafEl('ContentHash', v.contentHash, '      '));
    out.push(leafEl('ChangeDescription', v.changeDescription, '      '));
    out.push(leafEl('CreatedById', v.createdById, '      '));
    out.push(`    </Version>\n`);
  }
  out.push(`  </VersionHistory>\n`);

  // Decisions — AnA vs human, with the headline rollup.
  const ds = dossier.decisionSummary;
  out.push(`  <Decisions`);
  out.push(attr('count', ds.total));
  out.push(attr('anaAuthored', ds.anaAuthored));
  out.push(attr('humanAuthored', ds.humanAuthored));
  out.push(attr('humanDecided', ds.humanDecided));
  out.push(attr('approved', ds.approved));
  out.push(attr('rejected', ds.rejected));
  out.push(attr('pending', ds.pending));
  out.push(`>\n`);
  for (const d of dossier.decisions) {
    out.push(`    <Decision`);
    out.push(attr('id', d.id));
    out.push(attr('authoredBy', d.authoredBy));
    out.push(attr('decidedBy', d.decidedBy));
    out.push(attr('contextType', d.contextType));
    out.push(attr('confidence', d.confidence));
    out.push(attr('actionState', d.actionState));
    out.push(attr('approvalState', d.approvalState));
    out.push(attr('governanceBoundary', d.governanceBoundary));
    out.push(attr('createdAt', d.createdAt));
    out.push(`>\n`);
    out.push(leafEl('RecommendationType', d.recommendationType, '      '));
    out.push(leafEl('RecommendationSummary', d.recommendationSummary, '      '));
    out.push(leafEl('ContextDescription', d.contextDescription, '      '));
    out.push(leafEl('CreatedById', d.createdById, '      '));
    out.push(leafEl('ApprovedById', d.approvedById, '      '));
    out.push(leafEl('ApprovedAt', d.approvedAt, '      '));
    out.push(leafEl('RejectedById', d.rejectedById, '      '));
    out.push(leafEl('RejectedAt', d.rejectedAt, '      '));
    out.push(leafEl('RejectionReason', d.rejectionReason, '      '));
    out.push(leafEl('RelatedArtifactVersionId', d.relatedArtifactVersionId, '      '));
    out.push(leafEl('ExecutedArtifactVersionId', d.executedArtifactVersionId, '      '));
    out.push(jsonEl('EvidenceSources', d.evidenceSources, '      '));
    out.push(`    </Decision>\n`);
  }
  out.push(`  </Decisions>\n`);

  // Provenance events — the "how this was made" trail.
  out.push(`  <ProvenanceEvents count="${dossier.provenanceEvents.length}">\n`);
  for (const e of dossier.provenanceEvents) {
    out.push(`    <Event`);
    out.push(attr('eventId', e.eventId));
    out.push(attr('eventType', e.eventType));
    out.push(attr('eventAction', e.eventAction));
    out.push(attr('actorId', e.actorId));
    out.push(attr('artifactVersionId', e.artifactVersionId));
    out.push(attr('backendService', e.backendService));
    out.push(attr('createdAt', e.createdAt));
    out.push(`>\n`);
    out.push(leafEl('ActorName', e.actorName, '      '));
    out.push(leafEl('ActorEmail', e.actorEmail, '      '));
    out.push(leafEl('SourceDescription', e.sourceDescription, '      '));
    out.push(jsonEl('Details', e.details, '      '));
    out.push(`    </Event>\n`);
  }
  out.push(`  </ProvenanceEvents>\n`);

  // Reasoning — AnA's persisted thought process, per turn.
  out.push(`  <Reasoning count="${dossier.reasoning.length}">\n`);
  for (const t of dossier.reasoning) {
    out.push(`    <Turn`);
    out.push(attr('turn', t.turn));
    out.push(attr('model', t.model));
    out.push(attr('createdAt', t.createdAt));
    out.push(`>\n`);
    out.push(leafEl('Thought', t.reasoning, '      '));
    out.push(`    </Turn>\n`);
  }
  out.push(`  </Reasoning>\n`);

  // Human controls — pause / interject / redirect / cancel during the run.
  out.push(`  <HumanControls count="${dossier.humanControls.length}">\n`);
  for (const c of dossier.humanControls) {
    out.push(`    <Control`);
    out.push(attr('action', c.action));
    out.push(attr('turn', c.turn));
    out.push(attr('round', c.round));
    out.push(attr('at', c.at));
    out.push(`>\n`);
    out.push(leafEl('Message', c.message, '      '));
    out.push(`    </Control>\n`);
  }
  out.push(`  </HumanControls>\n`);

  // Data lineage — evidence source → content links.
  out.push(`  <DataLineage count="${dossier.dataLineage.length}">\n`);
  for (const l of dossier.dataLineage) {
    out.push(`    <Link`);
    out.push(attr('linkageType', l.linkageType));
    out.push(attr('transformationType', l.transformationType));
    out.push(attr('confidenceScore', l.confidenceScore));
    out.push(attr('aiModelUsed', l.aiModelUsed));
    out.push(attr('createdAt', l.createdAt));
    out.push(`>\n`);
    out.push(`      <Source`);
    out.push(attr('type', l.sourceObjectType));
    out.push(attr('id', l.sourceObjectId));
    out.push(attr('contentHash', l.sourceContentHash));
    out.push(`>`);
    out.push(xmlEscape(l.sourceTitle));
    out.push(`</Source>\n`);
    out.push(`      <Target`);
    out.push(attr('type', l.targetObjectType));
    out.push(attr('id', l.targetObjectId));
    out.push(`/>\n`);
    out.push(`    </Link>\n`);
  }
  out.push(`  </DataLineage>\n`);

  out.push(`</DocumentLineageDossier>\n`);
  return out.join('');
}
