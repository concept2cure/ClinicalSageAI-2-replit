/**
 * AnALedger XML serializer.
 *
 * Turns an ArtifactLedger into a stable, well-formed XML document that
 * lives inside a docx as customXml/item1.xml. Office Word recognizes
 * this and exposes it via Developer tab → XML Mapping.
 *
 * Schema namespace: http://concept2cure.com/schemas/AnALedger/v1
 *
 * Serialization rules:
 *   - All text content is XML-escaped.
 *   - Attribute values are XML-escaped + double-quoted.
 *   - Dates are ISO-8601 strings (already in the ArtifactLedger).
 *   - Arbitrary JSON metadata (run_metadata, audit log values) is
 *     embedded as a CDATA-wrapped JSON string under a <Json/> child —
 *     keeps the XML well-formed without losing fidelity.
 *   - Pretty-printed with two-space indent so a forensic reviewer can
 *     read it directly in Notepad.
 *
 * @module server/services/export/docx-ledger-xml
 */
import type { ArtifactLedger } from './docx-ledger-collector.js';

export const ANALEDGER_NAMESPACE =
  'http://concept2cure.com/schemas/AnALedger/v1';

function xmlEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control chars that would invalidate the XML.
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

/**
 * Wrap an arbitrary JSON-able value in a child element with a CDATA-wrapped
 * payload. CDATA can't contain `]]>` so we split-escape that sequence.
 */
function jsonEl(name: string, value: unknown, indent: string): string {
  if (value === null || value === undefined) {
    return `${indent}<${name} xsi:nil="true"/>\n`;
  }
  const json = JSON.stringify(value);
  const safe = json.replace(/]]>/g, ']]]]><![CDATA[>');
  return `${indent}<${name}><![CDATA[${safe}]]></${name}>\n`;
}

/**
 * Serialize an ArtifactLedger to a complete AnALedger XML document.
 */
export function serializeAnALedgerXml(ledger: ArtifactLedger): string {
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`);
  out.push(
    `<AnALedger xmlns="${ANALEDGER_NAMESPACE}"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` schemaVersion="${xmlEscape(ledger.schemaVersion)}"` +
      ` generatedAt="${xmlEscape(ledger.generatedAt)}">\n`
  );

  // Organization
  out.push(`  <Organization`);
  out.push(attr('id', ledger.organization.organizationId));
  out.push(attr('uuid', ledger.organization.uuid));
  out.push(`>\n`);
  out.push(leafEl('Name', ledger.organization.name, '    '));
  out.push(`  </Organization>\n`);

  // Project
  out.push(`  <Project`);
  out.push(attr('id', ledger.project.projectId));
  out.push(`>\n`);
  out.push(leafEl('Name', ledger.project.name, '    '));
  out.push(`  </Project>\n`);

  // Artifact
  const a = ledger.artifact;
  out.push(`  <Artifact`);
  out.push(attr('id', a.artifactId));
  out.push(attr('pk', a.artifactPk));
  out.push(attr('version', a.version));
  out.push(attr('status', a.status));
  out.push(`>\n`);
  out.push(leafEl('Title', a.title, '    '));
  out.push(leafEl('CtdSection', a.ctdSection, '    '));
  out.push(leafEl('Type', a.type, '    '));
  out.push(leafEl('Category', a.category, '    '));
  out.push(leafEl('ContentHash', a.contentHash, '    '));
  out.push(leafEl('CreatedAt', a.createdAt, '    '));
  out.push(leafEl('UpdatedAt', a.updatedAt, '    '));
  out.push(leafEl('PublishedAt', a.publishedAt, '    '));
  out.push(leafEl('LockedAt', a.lockedAt, '    '));
  out.push(`  </Artifact>\n`);

  // Citations
  if (ledger.citations) {
    const c = ledger.citations;
    out.push(`  <Citations`);
    out.push(attr('runId', c.citationRunId));
    out.push(attr('citationsAt', c.citationsAt));
    out.push(attr('ranAgainstContentHash', c.ranAgainstContentHash));
    out.push(`>\n`);
    out.push(`    <Stats`);
    out.push(attr('totalSentences', c.totalSentences));
    out.push(attr('supportedCount', c.supportedCount));
    out.push(attr('contradictedCount', c.contradictedCount));
    out.push(attr('gapCount', c.gapCount));
    out.push(attr('totalReadinessDelta', c.totalReadinessDelta));
    out.push(attr('filingBlocked', String(c.filingBlocked)));
    out.push(`/>\n`);
    out.push(jsonEl('Sentences', c.sentences, '    '));
    out.push(`  </Citations>\n`);
  } else {
    out.push(`  <Citations xsi:nil="true"/>\n`);
  }

  // Audit log. A count is a claim; when the query could not run the element
  // says so instead (WO-16B finding 10).
  if (ledger.auditLogUnavailable) {
    out.push(`  <AuditLog unavailable="true"${attr('reason', ledger.auditLogUnavailable)}/>\n`);
  } else {
  out.push(`  <AuditLog count="${ledger.auditLog.length}">\n`);
  for (const e of ledger.auditLog) {
    out.push(`    <Entry`);
    out.push(attr('auditId', e.auditId));
    out.push(attr('action', e.action));
    out.push(attr('actionCategory', e.actionCategory));
    out.push(attr('userId', e.userId));
    out.push(attr('userRole', e.userRole));
    out.push(attr('isGxpRelevant', String(e.isGxpRelevant)));
    out.push(attr('timestamp', e.timestamp));
    out.push(`>\n`);
    out.push(leafEl('UserName', e.userName, '      '));
    out.push(leafEl('IpAddress', e.ipAddress, '      '));
    out.push(leafEl('ChangeReason', e.changeReason, '      '));
    out.push(jsonEl('PreviousValue', e.previousValue, '      '));
    out.push(jsonEl('NewValue', e.newValue, '      '));
    out.push(jsonEl('Metadata', e.metadata, '      '));
    out.push(`    </Entry>\n`);
  }
  out.push(`  </AuditLog>\n`);
  }

  // Signatures — same rule.
  if (ledger.signaturesUnavailable) {
    out.push(`  <Signatures unavailable="true"${attr('reason', ledger.signaturesUnavailable)}/>\n`);
  } else {
  out.push(`  <Signatures count="${ledger.signatures.length}">\n`);
  for (const s of ledger.signatures) {
    out.push(`    <Signature`);
    out.push(attr('signatureId', s.signatureId));
    out.push(attr('artifactVersionId', s.artifactVersionId));
    out.push(attr('signatureType', s.signatureType));
    out.push(attr('signaturePurpose', s.signaturePurpose));
    out.push(attr('authenticationMethod', s.authenticationMethod));
    out.push(attr('authenticationTimestamp', s.authenticationTimestamp));
    out.push(attr('secondFactorVerified', String(s.secondFactorVerified)));
    out.push(attr('signedAt', s.signedAt));
    out.push(`>\n`);
    out.push(leafEl('SignerName', s.signerName, '      '));
    out.push(leafEl('SignerEmail', s.signerEmail, '      '));
    out.push(leafEl('SignerRole', s.signerRole, '      '));
    out.push(leafEl('SignatureMeaning', s.signatureMeaning, '      '));
    out.push(leafEl('SignatureHash', s.signatureHash, '      '));
    out.push(`    </Signature>\n`);
  }
  out.push(`  </Signatures>\n`);
  }

  // Proposals
  out.push(`  <Proposals count="${ledger.proposals.length}">\n`);
  for (const p of ledger.proposals) {
    out.push(`    <Proposal`);
    out.push(attr('proposalId', p.proposalId));
    out.push(attr('status', p.status));
    out.push(attr('threadId', p.threadId));
    out.push(attr('createdAt', p.createdAt));
    out.push(attr('appliedAt', p.appliedAt));
    out.push(attr('appliedAuditId', p.appliedAuditId));
    out.push(attr('appliedVersionId', p.appliedVersionId));
    out.push(attr('expiresAt', p.expiresAt));
    out.push(`>\n`);
    out.push(leafEl('SectionCode', p.sectionCode, '      '));
    out.push(leafEl('TargetAgency', p.targetAgency, '      '));
    out.push(leafEl('Rationale', p.rationale, '      '));
    out.push(leafEl('ContentHash', p.contentHash, '      '));
    out.push(`    </Proposal>\n`);
  }
  out.push(`  </Proposals>\n`);

  // Authoring plan (Feature 2.4)
  if (ledger.authoringPlan) {
    const ap = ledger.authoringPlan;
    out.push(`  <AuthoringPlan`);
    out.push(attr('planId', ap.planId));
    out.push(attr('status', ap.status));
    out.push(attr('generatorVersion', ap.generatorVersion));
    out.push(attr('score', ap.score));
    out.push(attr('sourceCount', ap.sourceCount));
    out.push(attr('riskFactorCount', ap.riskFactorCount));
    out.push(attr('contradictionCount', ap.contradictionCount));
    out.push(`>\n`);
    out.push(leafEl('CtdSection', ap.ctdSection, '    '));
    out.push(leafEl('Title', ap.title, '    '));
    out.push(leafEl('Summary', ap.summary, '    '));
    out.push(leafEl('TherapeuticArea', ap.therapeuticArea, '    '));
    out.push(leafEl('ApprovedAt', ap.approvedAt, '    '));
    out.push(leafEl('ApprovedBy', ap.approvedBy, '    '));
    out.push(leafEl('RejectedAt', ap.rejectedAt, '    '));
    out.push(leafEl('RejectedBy', ap.rejectedBy, '    '));
    out.push(leafEl('ExecutedAt', ap.executedAt, '    '));
    out.push(leafEl('ExecutedArtifactId', ap.executedArtifactId, '    '));
    out.push(`  </AuthoringPlan>\n`);
  } else {
    out.push(`  <AuthoringPlan xsi:nil="true"/>\n`);
  }

  // Runs summary
  out.push(`  <Runs`);
  out.push(attr('total', ledger.runs.totalRuns));
  out.push(attr('latestRunId', ledger.runs.latestRunId));
  out.push(attr('latestRunAt', ledger.runs.latestRunAt));
  out.push(`>\n`);
  out.push(`    <ModelsUsed>\n`);
  for (const m of ledger.runs.modelsUsed) {
    out.push(`      <Model>${xmlEscape(m)}</Model>\n`);
  }
  out.push(`    </ModelsUsed>\n`);
  out.push(`  </Runs>\n`);

  out.push(`</AnALedger>\n`);
  return out.join('');
}
