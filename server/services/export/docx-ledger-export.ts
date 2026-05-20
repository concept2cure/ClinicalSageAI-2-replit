/**
 * Orchestrator: export an artifact as .docx with the AnALedger embedded.
 *
 * Steps:
 *   1. Collect the artifact's full provenance ledger (citations, audit,
 *      signatures, applied/superseded proposals, run summary).
 *   2. Generate a baseline .docx body from the artifact's content +
 *      title.
 *   3. Optionally append a human-readable "Provenance Summary" page so
 *      a reviewer can read the ledger in Word without unzipping.
 *   4. Serialize the ledger to AnALedger XML.
 *   5. Inject the XML as a custom XML part into the .docx zip.
 *
 * Returns the docx Buffer ready to send back to the caller.
 *
 * @module server/services/export/docx-ledger-export
 */
import { generateDocxBuffer } from '../docxGenerator.js';
import { getPool } from '../../db/runtime.js';
import {
  collectArtifactLedger,
  type ArtifactLedger,
} from './docx-ledger-collector.js';
import { serializeAnALedgerXml } from './docx-ledger-xml.js';
import { embedLedgerInDocx } from './docx-ledger-embedder.js';

export interface ExportArtifactWithLedgerOptions {
  /**
   * When true, append a human-readable "Provenance Summary" section
   * after the artifact's content showing citation rollup, audit
   * highlights, signatures, etc. Default true.
   */
  includeProvenanceSummary?: boolean;
}

export interface ExportArtifactWithLedgerResult {
  buffer: Buffer;
  filename: string;
  ledger: ArtifactLedger;
  ledgerXmlByteLength: number;
  finalDocxByteLength: number;
}

/**
 * Generate a docx for the artifact with the ledger embedded. Tenant-
 * scoped via collectArtifactLedger. Returns null when the artifact
 * doesn't exist or is cross-tenant.
 */
export async function exportArtifactWithLedger(
  artifactId: string,
  organizationId: number,
  options: ExportArtifactWithLedgerOptions = {}
): Promise<ExportArtifactWithLedgerResult | null> {
  const includeProvenanceSummary = options.includeProvenanceSummary !== false;

  const ledger = await collectArtifactLedger(artifactId, organizationId);
  if (!ledger) return null;

  // 1. Pull the artifact's content body for the docx body. The collector
  // reads the lighter columns; the content is large so we fetch it
  // separately.
  const { rows: contentRows } = await getPool().query(
    `SELECT content
       FROM concept2cure_artifacts
      WHERE artifact_id = $1
        AND organization_id = $2
      LIMIT 1`,
    [artifactId, organizationId]
  );
  const body = String(contentRows[0]?.content ?? '');

  // 2. Build the baseline docx body — title + content. Optionally
  // append a Provenance Summary block.
  let docxBody = body;
  if (includeProvenanceSummary) {
    docxBody = `${body}\n\n${renderProvenanceSummaryText(ledger)}`;
  }
  const docxBuffer = await generateDocxBuffer(ledger.artifact.title, docxBody);

  // 3. Serialize the ledger and embed it.
  const ledgerXml = serializeAnALedgerXml(ledger);
  const ledgerXmlByteLength = Buffer.byteLength(ledgerXml, 'utf8');
  const finalBuffer = await embedLedgerInDocx(docxBuffer, ledgerXml);

  const safeArtifactId = artifactId.replace(/[^A-Za-z0-9._-]+/g, '_');
  const filename = `${safeArtifactId}-v${ledger.artifact.version}.docx`;

  return {
    buffer: finalBuffer,
    filename,
    ledger,
    ledgerXmlByteLength,
    finalDocxByteLength: finalBuffer.byteLength,
  };
}

/**
 * Plain-text Provenance Summary appendix. Goes through the existing
 * generateDocxBuffer paragraph splitter (double-newline boundaries) so
 * each section becomes its own paragraph in Word. No formatting beyond
 * what the splitter does — keeps the embedder dependency-free.
 */
export function renderProvenanceSummaryText(ledger: ArtifactLedger): string {
  const lines: string[] = [];
  lines.push('--- PROVENANCE SUMMARY ---');
  lines.push(
    `Artifact: ${ledger.artifact.artifactId} (v${ledger.artifact.version}, status=${ledger.artifact.status})`
  );
  if (ledger.artifact.ctdSection) {
    lines.push(`CTD section: ${ledger.artifact.ctdSection}`);
  }
  lines.push(
    `Organization: ${ledger.organization.name ?? '(unnamed)'} (#${ledger.organization.organizationId})`
  );
  lines.push(`Project: ${ledger.project.name ?? '(unnamed)'} (#${ledger.project.projectId})`);
  lines.push(`Generated at: ${ledger.generatedAt}`);
  lines.push(`Schema version: ${ledger.schemaVersion}`);
  lines.push('');

  // Citations
  if (ledger.citations) {
    const c = ledger.citations;
    lines.push('Citations:');
    lines.push(
      `  ${c.totalSentences} sentences — ` +
        `${c.supportedCount} supported, ${c.contradictedCount} contradicted, ${c.gapCount} gaps`
    );
    lines.push(
      `  Readiness delta: ${c.totalReadinessDelta}` +
        (c.filingBlocked ? ' (filing BLOCKED)' : '')
    );
    if (c.citationsAt) lines.push(`  Computed at: ${c.citationsAt}`);
    if (c.citationRunId) lines.push(`  Run id: ${c.citationRunId}`);
  } else {
    lines.push('Citations: none computed yet.');
  }
  lines.push('');

  // Audit
  lines.push(`Audit log entries: ${ledger.auditLog.length}`);
  const recentAudit = ledger.auditLog.slice(-5);
  for (const e of recentAudit) {
    lines.push(
      `  ${e.timestamp} — ${e.action} by ${e.userName ?? 'unknown'}` +
        (e.changeReason ? ` — "${e.changeReason}"` : '')
    );
  }
  lines.push('');

  // Signatures
  lines.push(`E-signatures: ${ledger.signatures.length}`);
  for (const s of ledger.signatures) {
    lines.push(
      `  ${s.signedAt} — ${s.signerName} <${s.signerEmail}> (${s.signaturePurpose})` +
        (s.secondFactorVerified ? ' [2FA]' : '')
    );
    if (s.signatureMeaning) lines.push(`    "${s.signatureMeaning}"`);
  }
  lines.push('');

  // Proposals
  lines.push(`Proposals: ${ledger.proposals.length}`);
  for (const p of ledger.proposals.slice(-5)) {
    lines.push(
      `  ${p.createdAt} — ${p.proposalId} (${p.status})` +
        (p.appliedAt ? ` applied ${p.appliedAt}` : '')
    );
  }
  lines.push('');

  // Runs
  lines.push(`Citation runs: ${ledger.runs.totalRuns}`);
  if (ledger.runs.latestRunAt) {
    lines.push(`  Latest: ${ledger.runs.latestRunAt} (${ledger.runs.latestRunId})`);
  }
  if (ledger.runs.modelsUsed.length > 0) {
    lines.push(`  Models: ${ledger.runs.modelsUsed.join(', ')}`);
  }

  return lines.join('\n');
}
