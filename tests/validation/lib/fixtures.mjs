/**
 * Shared prerequisite builders for the OQ runners. Everything here goes through
 * the product's own public API — nothing writes to the database directly — so a
 * prerequisite failing is itself an observation, recorded on the step that used it.
 */
import { createHash } from 'node:crypto';

/** A small but structurally valid PDF (one page, one text object). */
export function makePdfBuffer(text) {
  const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function createProgram(api, expect, name, programType = 'ind') {
  const r = await api('POST', '/api/c2c/projects', {
    name,
    programType,
    primaryAgency: 'FDA',
    indication: 'Validation exercise',
    priority: 'medium',
  });
  expect(r.status === 201, `program create expected 201, got ${r.status}`, r.json);
  // Intake creates the program's canonical submission spine in the same
  // transaction and reports it as meta.submissionId (routes/c2c/projects.ts).
  // Carried on the returned program so a protocol that needs "the program's
  // submission" can use it instead of creating an unrelated one.
  return { ...r.json.data, spineSubmissionId: r.json.meta?.submissionId ?? null };
}

export async function ingestPdf(api, expect, { programId, title, documentType = 'PROTOCOL', text }) {
  const buf = makePdfBuffer(text ?? title);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/pdf' }), `${title.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
  form.append('programId', programId);
  form.append('documentCode', `${title}.pdf`);
  form.append('documentTitle', title);
  form.append('documentType', documentType);
  const r = await api('POST', '/api/vault/ingest', form);
  expect(r.status === 201, `ingest expected 201, got ${r.status}`, r.json);
  return { document: r.json.document, filing: r.json.filing, bytes: buf, sha256: sha256(buf) };
}

/**
 * A submission with one sequence. Pass `submissionId` to build the sequence on
 * an EXISTING submission — the program's own spine (createProgram's
 * `spineSubmissionId`) when the step is about the open program's sequence
 * (OQ-SRDY-07, VSR-001 F-8): a submission created here with an unrelated title
 * is, by the platform's identity convention, not that program's.
 */
export async function createSubmissionWithSequence(api, expect, { title, sequenceNumber = '0000', submissionId = null }) {
  let submission;
  if (submissionId != null) {
    const g = await api('GET', `/api/submissions/${submissionId}`);
    expect(g.status === 200, `submission read expected 200, got ${g.status}`, g.json);
    submission = g.json;
  } else {
    const s = await api('POST', '/api/submissions', {
      title,
      productName: title,
      applicationType: 'IND',
      clientType: 'biotech',
      primaryRegion: 'fda',
    });
    expect(s.status === 201, `submission create expected 201, got ${s.status}`, s.json);
    submission = s.json;
  }
  const q = await api('POST', `/api/submissions/${submission.id}/sequences`, {
    region: 'fda',
    sequenceNumber,
    type: 'original',
  });
  expect(q.status === 201, `sequence create expected 201, got ${q.status}`, q.json);
  return { submission, sequence: q.json };
}
