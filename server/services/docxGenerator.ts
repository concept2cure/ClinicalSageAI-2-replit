// DOCX Runtime: JS docx v9.5.1 (canonical)
// Owner: document-export team
// See: docs/architecture/docx-pipeline-canonical-designation.md

import path from 'path';
import fs from 'fs/promises';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  PageBreak,
  Footer,
  Header,
  ShadingType,
} from 'docx';
import type { IvdrPackContent } from './ivdrPackContent';

// ═══════════════════════════════════════════════════════════════════════════════
// Generic DOCX helpers (existing)
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateDocxBuffer(title: string, content: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title || 'Document',
            heading: HeadingLevel.HEADING_1,
          }),
          ...content.split('\n\n').map(p => new Paragraph({ children: [new TextRun(p)] })),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

export async function saveGeneratedDocx(buffer: Buffer, filename: string): Promise<string> {
  const baseDir = path.resolve(process.cwd(), 'generated_documents');
  await fs.mkdir(baseDir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const outPath = path.join(baseDir, safe);
  await fs.writeFile(outPath, buffer);
  return outPath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IVDR Tech-Doc DOCX generator
//
// Consumes IvdrPackContent (built once by ivdrPackContent.ts).
// No DB queries here — pure rendering.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Table helpers ───────────────────────────────────────────────────────────

const BORDER_THIN = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
} as const;

function cellPara(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text || '—', bold, size: 20 })],
    spacing: { after: 40 },
  });
}

function hdrCell(text: string): TableCell {
  return new TableCell({
    children: [cellPara(text, true)],
    shading: { type: ShadingType.SOLID, color: 'E2E8F0' },
    width: { size: 0, type: WidthType.AUTO },
  });
}

function dCell(text: string): TableCell {
  return new TableCell({
    children: [cellPara(text)],
    width: { size: 0, type: WidthType.AUTO },
  });
}

function p(text: string, opts?: { bold?: boolean; italics?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: opts?.bold, italics: opts?.italics, size: opts?.size || 22 }),
    ],
    spacing: { after: 80 },
  });
}

/**
 * Generate an IVDR Technical Documentation DOCX from pre-built content.
 *
 * Sections:
 *   1. Cover page
 *   2. Classification (Annex VIII trace)
 *   3. Analytical validation table
 *   4. Clinical evidence table
 *   5. CDx summary
 *   6. Binder evidence appendix
 *   7. AI provenance chain + verifier summary
 *   8. Integrity hashes
 */
export async function generateIvdrDocx(content: IvdrPackContent): Promise<Buffer> {
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

  const children: (Paragraph | Table)[] = [];

  // Cover page
  children.push(
    new Paragraph({ text: '', spacing: { after: 600 } }),
    new Paragraph({
      children: [new TextRun({ text: 'IVDR Technical Documentation Pack', bold: true, size: 48 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${meta.packType}  —  Version ${meta.packVersion}`, size: 28 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Organization ${meta.organizationId} | Project ${meta.projectId}`,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated ${meta.generatedAt}`, italics: true, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Pack ID: ${meta.packId}`, size: 20, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // § 1 Classification
  children.push(
    new Paragraph({ text: '1. Device Classification', heading: HeadingLevel.HEADING_1 })
  );
  if (classification) {
    children.push(
      p(`Risk Class: ${classification.riskClass}`, { bold: true }),
      p(`Device Type: ${classification.deviceType}`),
      p(`Intended Purpose: ${classification.intendedPurpose}`),
      p(`Rationale: ${classification.rationale}`),
      p(`Classified: ${classification.classifiedDate}`)
    );
  } else {
    children.push(p('No classification record found.', { italics: true }));
  }

  // § 2 Analytical validation
  children.push(
    new Paragraph({ text: '', spacing: { after: 120 } }),
    new Paragraph({ text: '2. Analytical Validation Summary', heading: HeadingLevel.HEADING_1 })
  );
  if (analyticalValidations.length > 0) {
    children.push(
      new Table({
        rows: [
          new TableRow({
            children: [
              hdrCell('Parameter'),
              hdrCell('Acceptance'),
              hdrCell('Result'),
              hdrCell('Status'),
            ],
            tableHeader: true,
          }),
          ...analyticalValidations.map(
            r =>
              new TableRow({
                children: [
                  dCell(r.parameterName),
                  dCell(r.acceptanceCriteria),
                  dCell(r.resultSummary),
                  dCell(r.status),
                ],
              })
          ),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDER_THIN,
      })
    );
  } else {
    children.push(p('No analytical validation records.', { italics: true }));
  }

  // § 3 Clinical evidence
  children.push(
    new Paragraph({ text: '', spacing: { after: 120 } }),
    new Paragraph({ text: '3. Clinical Evidence Summary', heading: HeadingLevel.HEADING_1 })
  );
  if (clinicalEvidence.length > 0) {
    children.push(
      new Table({
        rows: [
          new TableRow({
            children: [
              hdrCell('Study'),
              hdrCell('Type'),
              hdrCell('Population'),
              hdrCell('Outcome'),
              hdrCell('Status'),
            ],
            tableHeader: true,
          }),
          ...clinicalEvidence.map(
            r =>
              new TableRow({
                children: [
                  dCell(r.studyName),
                  dCell(r.studyType),
                  dCell(r.populationSize),
                  dCell(r.outcomeSummary),
                  dCell(r.status),
                ],
              })
          ),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDER_THIN,
      })
    );
  } else {
    children.push(p('No clinical evidence records.', { italics: true }));
  }

  // § 4 CDx
  children.push(
    new Paragraph({ text: '', spacing: { after: 120 } }),
    new Paragraph({
      text: '4. Companion Diagnostic (CDx) Summary',
      heading: HeadingLevel.HEADING_1,
    })
  );
  if (cdx) {
    children.push(
      p(`Drug: ${cdx.companionDrug}`, { bold: true }),
      p(`Therapeutic Area: ${cdx.therapeuticArea}`),
      p(`Biomarker: ${cdx.biomarker}`),
      p(`Assay: ${cdx.assayTechnology}`),
      p(`Status: ${cdx.status}`)
    );
  } else {
    children.push(p('No CDx workflow record.', { italics: true }));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // § 5 Binder evidence appendix
  children.push(
    new Paragraph({
      text: '5. Evidence Binder — Claims & Evidence',
      heading: HeadingLevel.HEADING_1,
    })
  );
  children.push(
    p(
      `Total: ${binderEvidence.totalClaims} | Required: ${binderEvidence.requiredClaims} | Approved: ${binderEvidence.approvedClaims}`
    )
  );
  for (const claim of binderEvidence.claims) {
    children.push(
      new Paragraph({
        text: `${claim.claimKey}: ${claim.title}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120 },
      }),
      p(
        `Status: ${claim.status} | Required: ${claim.required ? 'Yes' : 'No'} | Evidence: ${claim.evidenceCount}`
      )
    );
    for (const ev of claim.evidence) {
      const src =
        ev.sourceType === 'atom'
          ? `AI Atom (${ev.sourceAtomId || '—'})`
          : `Vault (${ev.vaultFileId || '—'})`;
      const excerpt = ev.excerptPreview ? ` — "${ev.excerptPreview.substring(0, 100)}…"` : '';
      children.push(p(`  • [${ev.sourceType.toUpperCase()}] ${src}${excerpt}`, { size: 20 }));
    }
    if (claim.evidence.length === 0) {
      children.push(p('  No evidence attached.', { italics: true, size: 20 }));
    }
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // § 6 AI Provenance
  children.push(new Paragraph({ text: '6. AI Provenance Chain', heading: HeadingLevel.HEADING_1 }));
  if (provenanceChain) {
    children.push(
      p(`Retrieval Run IDs: ${provenanceChain.retrievalRunIds.length}`),
      p(`Generation Run IDs: ${provenanceChain.generationRunIds.length}`),
      p(`Snapshot Hashes: ${provenanceChain.snapshotHashes.length}`)
    );
    if (provenanceChain.aiClaimSummary) {
      children.push(
        new Paragraph({
          text: '6.1 Verifier Summary',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 120 },
        }),
        p(`Total Claims: ${provenanceChain.aiClaimSummary.totalClaims}`),
        p(`Supported: ${provenanceChain.aiClaimSummary.supported}`),
        p(`Weak: ${provenanceChain.aiClaimSummary.weak}`),
        p(`Unsupported: ${provenanceChain.aiClaimSummary.unsupported}`),
        p(
          `Supported Rate: ${(provenanceChain.aiClaimSummary.supportedClaimRate * 100).toFixed(1)}%`,
          { bold: true }
        ),
        p(`Flagged: ${provenanceChain.aiClaimSummary.flaggedCount}`)
      );
      if (provenanceChain.aiClaimSummary.topRules.length > 0) {
        children.push(p(`Top Rules: ${provenanceChain.aiClaimSummary.topRules.join(', ')}`));
      }
    }
  } else {
    children.push(p('AI provenance chain not available.', { italics: true }));
  }

  // § 7 Hashes
  children.push(
    new Paragraph({ text: '', spacing: { after: 120 } }),
    new Paragraph({ text: '7. Integrity Hashes', heading: HeadingLevel.HEADING_1 }),
    p(`Snapshot SHA-256: ${hashes.snapshotHashSha256}`),
    p(`Manifest SHA-256: ${hashes.manifestHashSha256}`)
  );

  // ── Build document ─────────────────────────────────────────────────────

  const doc = new Document({
    creator: 'Concept2Cure — Concept2Cure Platform',
    title: `IVDR ${meta.packType} v${meta.packVersion}`,
    description: `IVDR pack for org ${meta.organizationId}, project ${meta.projectId}`,
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `IVDR ${meta.packType} v${meta.packVersion} — CONFIDENTIAL`,
                    size: 16,
                    color: '999999',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Generated by Concept2Cure | Pack ${meta.packId}`,
                    size: 16,
                    color: '999999',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
