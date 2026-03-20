/**
 * IVDR Pack HTML Renderer
 *
 * Converts IvdrPackContent → HTML string for PDF rendering via
 * the existing Puppeteer / PDFKit fallback path in server/export/renderers.ts.
 *
 * @module server/services/ivdrPackHtml
 */

import type { IvdrPackContent } from './ivdrPackContent';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render the full IVDR Technical Documentation as an HTML string.
 * Designed to be passed to Puppeteer's page.setContent() → page.pdf().
 */
export function renderIvdrPackHtml(content: IvdrPackContent): string {
  const {
    meta,
    classification,
    analyticalValidations,
    clinicalEvidence,
    cdx,
    binderEvidence,
    provenanceChain,
    hashes,
  } = content;

  const parts: string[] = [];

  // ── Inline styles ──────────────────────────────────────────────────────
  parts.push(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IVDR ${esc(meta.packType)} v${meta.packVersion}</title>
<style>
  @page { size: A4; margin: 2.5cm; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 16pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 28px; }
  h2 { font-size: 13pt; margin-top: 20px; }
  .cover { text-align: center; padding-top: 120px; page-break-after: always; }
  .cover h1 { border: none; font-size: 24pt; }
  .cover .sub { font-size: 13pt; color: #444; margin-top: 8px; }
  .cover .meta { font-size: 10pt; color: #888; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #e2e8f0; font-weight: bold; }
  .kv { margin: 4px 0; }
  .kv strong { display: inline-block; min-width: 160px; }
  .evidence-item { font-size: 9pt; margin: 2px 0 2px 16px; }
  .hash-box { background: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; margin: 12px 0; font-family: monospace; font-size: 9pt; word-break: break-all; }
  .page-break { page-break-before: always; }
  .muted { color: #666; font-style: italic; }
  .header-bar { font-size: 8pt; color: #999; text-align: right; margin-bottom: 6px; }
  .footer-bar { font-size: 8pt; color: #999; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style>
</head>
<body>`);

  // ── Cover page ─────────────────────────────────────────────────────────
  parts.push(`
<div class="cover">
  <h1>IVDR Technical Documentation Pack</h1>
  <div class="sub">${esc(meta.packType)} &mdash; Version ${meta.packVersion}</div>
  <div class="sub">Organization ${meta.organizationId} | Project ${esc(meta.projectId)}</div>
  <div class="meta">Generated ${esc(meta.generatedAt)}</div>
  <div class="meta">Pack ID: ${esc(meta.packId)}</div>
</div>`);

  // ── Header bar  ────────────────────────────────────────────────────────
  parts.push(
    `<div class="header-bar">IVDR ${esc(meta.packType)} v${meta.packVersion} &mdash; CONFIDENTIAL</div>`
  );

  // ── § 1 Classification ─────────────────────────────────────────────────
  parts.push(`<h1>1. Device Classification</h1>`);
  if (classification) {
    parts.push(`
<div class="kv"><strong>Risk Class:</strong> ${esc(classification.riskClass)}</div>
<div class="kv"><strong>Device Type:</strong> ${esc(classification.deviceType)}</div>
<div class="kv"><strong>Intended Purpose:</strong> ${esc(classification.intendedPurpose)}</div>
<div class="kv"><strong>Rationale:</strong> ${esc(classification.rationale)}</div>
<div class="kv"><strong>Classified:</strong> ${esc(classification.classifiedDate)}</div>`);
  } else {
    parts.push(`<p class="muted">No classification record found.</p>`);
  }

  // ── § 2 Analytical validation ──────────────────────────────────────────
  parts.push(`<h1>2. Analytical Validation Summary</h1>`);
  if (analyticalValidations.length > 0) {
    parts.push(
      `<table><thead><tr><th>Parameter</th><th>Acceptance</th><th>Result</th><th>Status</th></tr></thead><tbody>`
    );
    for (const r of analyticalValidations) {
      parts.push(
        `<tr><td>${esc(r.parameterName)}</td><td>${esc(r.acceptanceCriteria)}</td><td>${esc(r.resultSummary)}</td><td>${esc(r.status)}</td></tr>`
      );
    }
    parts.push(`</tbody></table>`);
  } else {
    parts.push(`<p class="muted">No analytical validation records.</p>`);
  }

  // ── § 3 Clinical evidence ──────────────────────────────────────────────
  parts.push(`<h1>3. Clinical Evidence Summary</h1>`);
  if (clinicalEvidence.length > 0) {
    parts.push(
      `<table><thead><tr><th>Study</th><th>Type</th><th>Population</th><th>Outcome</th><th>Status</th></tr></thead><tbody>`
    );
    for (const r of clinicalEvidence) {
      parts.push(
        `<tr><td>${esc(r.studyName)}</td><td>${esc(r.studyType)}</td><td>${esc(r.populationSize)}</td><td>${esc(r.outcomeSummary)}</td><td>${esc(r.status)}</td></tr>`
      );
    }
    parts.push(`</tbody></table>`);
  } else {
    parts.push(`<p class="muted">No clinical evidence records.</p>`);
  }

  // ── § 4 CDx ────────────────────────────────────────────────────────────
  parts.push(`<h1>4. Companion Diagnostic (CDx) Summary</h1>`);
  if (cdx) {
    parts.push(`
<div class="kv"><strong>Drug:</strong> ${esc(cdx.companionDrug)}</div>
<div class="kv"><strong>Therapeutic Area:</strong> ${esc(cdx.therapeuticArea)}</div>
<div class="kv"><strong>Biomarker:</strong> ${esc(cdx.biomarker)}</div>
<div class="kv"><strong>Assay:</strong> ${esc(cdx.assayTechnology)}</div>
<div class="kv"><strong>Status:</strong> ${esc(cdx.status)}</div>`);
  } else {
    parts.push(`<p class="muted">No CDx workflow record.</p>`);
  }

  // ── § 5 Binder evidence ────────────────────────────────────────────────
  parts.push(`<div class="page-break"></div>`);
  parts.push(`<h1>5. Evidence Binder &mdash; Claims &amp; Evidence</h1>`);
  parts.push(
    `<p>Total: ${binderEvidence.totalClaims} | Required: ${binderEvidence.requiredClaims} | Approved: ${binderEvidence.approvedClaims}</p>`
  );

  for (const claim of binderEvidence.claims) {
    parts.push(`<h2>${esc(claim.claimKey)}: ${esc(claim.title)}</h2>`);
    parts.push(
      `<p>Status: ${esc(claim.status)} | Required: ${claim.required ? 'Yes' : 'No'} | Evidence: ${claim.evidenceCount}</p>`
    );
    if (claim.evidence.length > 0) {
      for (const ev of claim.evidence) {
        const src =
          ev.sourceType === 'atom'
            ? `AI Atom (${esc(ev.sourceAtomId || '—')})`
            : `Vault (${esc(ev.vaultFileId || '—')})`;
        const excerpt = ev.excerptPreview
          ? ` &mdash; &ldquo;${esc(ev.excerptPreview.substring(0, 100))}&hellip;&rdquo;`
          : '';
        parts.push(
          `<div class="evidence-item">&bull; [${esc(ev.sourceType.toUpperCase())}] ${src}${excerpt}</div>`
        );
      }
    } else {
      parts.push(`<div class="evidence-item muted">No evidence attached.</div>`);
    }
  }

  // ── § 6 AI Provenance ──────────────────────────────────────────────────
  parts.push(`<div class="page-break"></div>`);
  parts.push(`<h1>6. AI Provenance Chain</h1>`);
  if (provenanceChain) {
    parts.push(`<p>Retrieval Run IDs: ${provenanceChain.retrievalRunIds.length}</p>`);
    parts.push(`<p>Generation Run IDs: ${provenanceChain.generationRunIds.length}</p>`);
    parts.push(`<p>Snapshot Hashes: ${provenanceChain.snapshotHashes.length}</p>`);
    if (provenanceChain.aiClaimSummary) {
      const s = provenanceChain.aiClaimSummary;
      parts.push(`<h2>6.1 Verifier Summary</h2>`);
      parts.push(`
<div class="kv"><strong>Total Claims:</strong> ${s.totalClaims}</div>
<div class="kv"><strong>Supported:</strong> ${s.supported}</div>
<div class="kv"><strong>Weak:</strong> ${s.weak}</div>
<div class="kv"><strong>Unsupported:</strong> ${s.unsupported}</div>
<div class="kv"><strong>Supported Rate:</strong> ${(s.supportedClaimRate * 100).toFixed(1)}%</div>
<div class="kv"><strong>Flagged:</strong> ${s.flaggedCount}</div>`);
      if (s.topRules.length > 0) {
        parts.push(
          `<div class="kv"><strong>Top Rules:</strong> ${s.topRules.map(esc).join(', ')}</div>`
        );
      }
    }
  } else {
    parts.push(`<p class="muted">AI provenance chain not available.</p>`);
  }

  // ── § 7 Hashes ─────────────────────────────────────────────────────────
  parts.push(`<h1>7. Integrity Hashes</h1>`);
  parts.push(
    `<div class="hash-box">Snapshot SHA-256: ${esc(hashes.snapshotHashSha256)}<br>Manifest SHA-256: ${esc(hashes.manifestHashSha256)}</div>`
  );

  // ── Footer ─────────────────────────────────────────────────────────────
  parts.push(
    `<div class="footer-bar">Generated by Concept2Cure.RI | Pack ${esc(meta.packId)}</div>`
  );
  parts.push(`</body></html>`);

  return parts.join('\n');
}
