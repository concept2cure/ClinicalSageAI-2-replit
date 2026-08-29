/**
 * Deterministic golden fixtures for eCTD qualification.
 *
 * A small, fixed set of leaves/documents (cover letter, Form FDA 356h, a
 * Module 2 summary, a Module 3 quality doc) with byte-stable content, so a
 * qualification run produces the same package bytes every time and the
 * "reopen the ZIP and re-verify every checksum" step is meaningful.
 *
 * @module server/services/ectd/qualification/golden-fixtures
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { EctdLeaf, PackagerInput } from '../../submission-gateways/regional-packager';
import type { Region } from '../../submission-gateways/types';
import type { RpsMessageInput } from '../ectd4';
import { submissionUnitId, contextOfUseId, documentId } from '../ectd4';
import { oidForV4List } from '../controlled-vocab';

/** A minimal, valid, byte-stable PDF (header + one object + EOF). */
export function goldenPdf(label: string): Buffer {
  const body = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj
% ${label}
trailer<< /Root 1 0 R >>
%%EOF
`;
  return Buffer.from(body, 'utf8');
}

/** The golden leaf set (section, filename, title) — module 1 + 2 + 3 + 5 (study). */
export const GOLDEN_LEAVES: Array<{ ctdSection: string; fileName: string; title: string }> = [
  { ctdSection: '1.2', fileName: 'cover-letter.pdf', title: 'Cover Letter' },
  { ctdSection: '2.2', fileName: 'intro.pdf', title: 'Introduction' },
  { ctdSection: '3.2.p.1', fileName: 'description-composition.pdf', title: 'Description and Composition' },
  { ctdSection: '5.3.5.1', fileName: 'study-report.pdf', title: 'Pivotal Study Report' },
];

/** The golden transmittal form (Form FDA 356h) rendered under submission-information. */
export const GOLDEN_FORM = { ctdSection: '1.1', fileName: 'form-356h.pdf', title: 'Form FDA 356h', formType: '356h' };

export interface GoldenPaths {
  dir: string;
  byName: Record<string, string>;
}

/** Materialize the golden leaf files (+ the form) into `dir`. */
export async function writeGoldenLeaves(dir: string): Promise<GoldenPaths> {
  await fs.mkdir(dir, { recursive: true });
  const byName: Record<string, string> = {};
  for (const l of [...GOLDEN_LEAVES, GOLDEN_FORM]) {
    const p = path.join(dir, l.fileName);
    await fs.writeFile(p, goldenPdf(l.title));
    byName[l.fileName] = p;
  }
  return { dir, byName };
}

/* ─── v3.2.2 fixtures ─────────────────────────────────────────────── */

/** Build a v3.2.2 PackagerInput for a region + sequence. When `lifecycle` is
 *  set, the content leaves carry replace/delete/append against the prior seq. */
export function v3GoldenInput(opts: {
  region: Region;
  sequence: string;
  applicationId: string;
  outputDir: string;
  paths: GoldenPaths;
  lifecycle?: boolean;
  priorSequence?: string;
}): PackagerInput {
  const { region, sequence, applicationId, outputDir, paths, lifecycle, priorSequence } = opts;
  const op = (base: EctdLeaf['operation']): EctdLeaf['operation'] => (lifecycle ? base : 'new');

  // For a lifecycle sequence, the prior leaf lives at the same section path in
  // the prior sequence's package; modified-file points back at it.
  const m1Sub: Record<string, string> = { fda: 'us', ema: 'eu', pmda: 'jp', ca: 'ca' };
  const sub = m1Sub[region] ?? region;
  const modFile = (section: string, fileName: string) =>
    lifecycle && priorSequence
      ? `../../../../${priorSequence}/m1/${sub}/${section.replace(/\./g, '-')}/${fileName}`
      : undefined;

  // Form FDA 356h is a DOCUMENT in the package at 1.1, not only an entry in the
  // fda.forms list, and it must be the SAME OBJECT in both places. The packager
  // resolves a backbone reference through a Map keyed by leaf IDENTITY
  // (refByLeaf.get(l) in regional-packager.ts), so an equivalent-but-distinct
  // object does not match. This fixture previously declared the form only under
  // fda.forms, so the backbone referenced a file the packager never read, hashed
  // or wrote — which it now refuses outright rather than emitting a ref that
  // declares a legally-required form present while it is absent from the zip.
  const formLeaf: EctdLeaf = {
    ctdSection: GOLDEN_FORM.ctdSection,
    operation: 'new',
    sourcePath: paths.byName[GOLDEN_FORM.fileName],
    fileName: GOLDEN_FORM.fileName,
    title: GOLDEN_FORM.title,
  };

  const leaves: EctdLeaf[] = [
    ...(region === 'fda' ? [formLeaf] : []),
    {
      ctdSection: '1.2', operation: op('replace'), sourcePath: paths.byName['cover-letter.pdf'],
      fileName: 'cover-letter.pdf', title: 'Cover Letter',
      modifiedFile: modFile('1.2', 'cover-letter.pdf'),
    },
    {
      ctdSection: '2.2', operation: op('append'), sourcePath: paths.byName['intro.pdf'],
      fileName: 'intro.pdf', title: 'Introduction',
    },
    {
      ctdSection: '3.2.p.1', operation: op('delete'), sourcePath: paths.byName['description-composition.pdf'],
      fileName: 'description-composition.pdf', title: 'Description and Composition',
    },
    {
      // M5 study-report leaf → drives Study Tagging File generation + cross-linking.
      ctdSection: '5.3.5.1', operation: 'new', sourcePath: paths.byName['study-report.pdf'],
      fileName: 'study-report.pdf', title: 'Pivotal Study Report',
      studyId: 'STUDY-001', stfFileTag: 'study-report-body',
    },
  ];

  return {
    region,
    applicationId,
    sequence,
    submissionType: 'original',
    sponsorId: 'DUNS-000000000',
    sponsorName: 'Golden Sponsor Inc.',
    productName: 'Goldenmab',
    outputDir,
    emitUnzipped: true,
    environment: 'staging',
    leaves,
    studyMeta: [{ studyId: 'STUDY-001', studyTitle: 'Pivotal efficacy study', studyCategory: 'clinical-study-report' }],
    // A resolvable intra-package cross-reference (2.7.1 clinical summary cites the study report).
    crossReferences: [{ source: '2.5', target: '5.3.5.1', label: 'clinical overview cites the pivotal study' }],
    fda: region === 'fda' ? {
      applicationType: 'nda',
      submissionType: 'original application',
      submissionSubType: lifecycle ? 'amendment' : 'original',
      contacts: [{ type: 'regulatory', name: 'Jane Smith', email: 'jane@example.com' }],
      // Same object as the one in `leaves` above — see the note there.
      forms: [{ formType: '356h', leaf: formLeaf }],
    } : undefined,
  };
}

/* ─── v4.0 fixtures ───────────────────────────────────────────────── */

/** Build a v4.0 RPS message + document sources for a sequence. */
export function v4GoldenMessage(opts: {
  applicationId: string;
  sequence: string;
  lifecycle?: boolean;
  priorSequence?: string;
}): { message: RpsMessageInput; sources: Map<string, Buffer> } {
  const { applicationId: app, sequence, lifecycle, priorSequence } = opts;
  const couOid = oidForV4List('contextOfUse');
  const sources = new Map<string, Buffer>();

  const mk = (couCode: string, docKey: string, title: string, href: string, priority: number, related?: string) => {
    const docIdV = documentId(app, docKey);
    sources.set(docIdV, goldenPdf(title));
    return {
      cou: {
        id: contextOfUseId(app, couCode, `${docKey}|${sequence}`),
        code: couCode,
        codeSystem: couOid,
        title,
        priorityNumber: priority,
        status: (lifecycle && related ? 'active' : 'active') as 'active',
        documentId: docIdV,
        operation: (lifecycle ? 'revise' : 'create') as 'revise' | 'create',
        relatedContextOfUseId:
          lifecycle && priorSequence ? contextOfUseId(app, couCode, `${docKey}|${priorSequence}`) : undefined,
      },
      doc: {
        id: docIdV, title, href, mediaType: 'application/pdf',
        checksum: 'placeholder', checksumType: 'SHA256' as const,
      },
    };
  };

  const a = mk('us_1.2', '1.2|cover.pdf', 'Cover Letter', '1-2/cover.pdf', 1);
  const b = mk('us_1.14.1.3', '1.14.1.3|labeling.pdf', 'Draft Labeling Text', '1-14-1-3/labeling.pdf', 2);

  return {
    message: {
      submissionUnit: {
        id: submissionUnitId(app, sequence),
        unitTypeCode: lifecycle ? 'us_submission_unit_type_4' : 'us_submission_unit_type_1',
        title: lifecycle ? 'Amendment' : 'Original NDA submission',
        sequenceNumber: sequence,
        status: 'active',
      },
      submission: { typeCode: 'us_submission_type_1' },
      application: { number: app, typeCode: 'us_application_type_1', center: 'cder' },
      contextsOfUse: [a.cou, b.cou],
      documents: [a.doc, b.doc],
      creationTime: '20260730120000',
    },
    sources,
  };
}
