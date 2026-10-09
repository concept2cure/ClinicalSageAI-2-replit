/**
 * Builders for FDA forms whose security was changed after FDA issued them —
 * the shapes the 2026-09-22 adversarial review of leaf-pdf-security found
 * passing as "an FDA form as issued" while pdf.js demanded a password.
 *
 * Each appends an incremental update to the vendored FDA_1571.pdf, so the
 * FDA-issued bytes stay an exact prefix. Standard security handler maths
 * (ISO 32000-1 §7.6.3, R4) is inlined so a test builds a real user-password
 * dictionary rather than a string that merely looks like one.
 *
 * 2026-09-23 (W5/D7, round-2 review): plus an update whose cross-reference
 * stream pdf.js cannot parse (it falls back to the template's own trailer), and
 * a filled eSTAR carrying an embedded file.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { templatePathFor } from '../../../ind-forms/ind-form-fill-service';
import { listVendoredTemplates } from '../../../pathway-engines/estar/estar-template-registry';
import { attachPlannedFiles } from '../../../pathway-engines/estar/estar-fill';

const L = (s: string) => Buffer.from(s, 'latin1');
const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = (...b: Buffer[]) => crypto.createHash('md5').update(Buffer.concat(b)).digest();

function rc4(key: Buffer, data: Buffer): Buffer {
  const S = [...Array(256).keys()];
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length);
  let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}
const pad = (pw: string) => Buffer.concat([L(pw), PAD]).subarray(0, 32);
function rc4x20(key: Buffer, data: Buffer): Buffer {
  let d = rc4(key, data);
  for (let i = 1; i <= 19; i++) d = rc4(Buffer.from(key.map((b) => b ^ i)), d);
  return d;
}
function computeO(owner: string, user: string): Buffer {
  let h = md5(pad(owner));
  for (let i = 0; i < 50; i++) h = md5(h);
  return rc4x20(h.subarray(0, 16), pad(user));
}
function computeKey(user: string, O: Buffer, P: number, id0: Buffer): Buffer {
  const p = Buffer.alloc(4); p.writeInt32LE(P);
  let h = md5(pad(user), O, p, id0);
  for (let i = 0; i < 50; i++) h = md5(h.subarray(0, 16));
  return h.subarray(0, 16);
}
const computeU = (key: Buffer, id0: Buffer) => Buffer.concat([rc4x20(key, md5(PAD, id0)), Buffer.alloc(16)]);

export function tamperKit() {
  const template = fs.readFileSync(templatePathFor('FDA_1571'));
  const tl = template.toString('latin1');
  const idm = /\/ID\[<([0-9A-F]+)><([0-9A-F]+)>\]/.exec(tl)!;
  const id0 = Buffer.from(idm[1], 'hex');
  const prevXref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tl)![1]);
  const P = -3904;
  const O = computeO('owner-pw', 'secret');
  const U = computeU(computeKey('secret', O, P, id0), id0);
  const encDict = `<</Filter/Standard/V 4/R 4/Length 128/CF<</StdCF<</AuthEvent/DocOpen/CFM/AESV2/Length 16>>>>/StmF/StdCF/StrF/StdCF/O<${O.toString('hex')}>/U<${U.toString('hex')}>/P ${P}>>`;

  /** Object 47 (FDA's encryption dictionary) redefined under `objHeader`, with a user password. */
  function redefinedAs(objHeader: string): Buffer {
    const parts: string[] = [];
    let pos = template.length;
    const offs: Record<number, number> = {};
    const add = (num: number, s: string) => { offs[num] = pos + 1; const t = '\n' + s; parts.push(t); pos += t.length; };
    add(47, `${objHeader}\n${encDict}\nendobj`);
    add(200, '200 0 obj\n<</Type/Catalog/Pages 201 0 R>>\nendobj');
    add(201, '201 0 obj\n<</Type/Pages/Kids[202 0 R]/Count 1>>\nendobj');
    add(202, '202 0 obj\n<</Type/Page/Parent 201 0 R/MediaBox[0 0 612 792]>>\nendobj');
    const e = (o: number) => `${String(o).padStart(10, '0')} 00000 n\r\n`;
    const xrefOff = pos + 1;
    parts.push(
      `\nxref\n0 1\n0000000000 65535 f\r\n47 1\n${e(offs[47])}200 3\n${e(offs[200])}${e(offs[201])}${e(offs[202])}` +
        `trailer\n<</Size 203/Root 200 0 R/Encrypt 47 0 R/ID[<${idm[1]}><${idm[2]}>]/Prev ${prevXref}>>\nstartxref\n${xrefOff}\n%%EOF\n`,
    );
    return Buffer.concat([template, L(parts.join(''))]);
  }

  /**
   * Object 47 redefined inside an object stream, re-pointed by an xref stream — no text header at all.
   * `type3` (2026-09-23) also adds a type-3 entry, so pdf.js falls back to FDA's own section and
   * opens it, while qpdf and pypdf follow the appended entry for object 47 and ask for a password.
   */
  function redefinedInObjectStream(opts: { type3?: boolean } = {}): Buffer {
    const chunks: Buffer[] = [template];
    let pos = template.length;
    const offs: Record<number, number> = {};
    const push = (b: Buffer) => { chunks.push(b); pos += b.length; };
    const add = (num: number, s: string | Buffer) => { push(L('\n')); offs[num] = pos; push(typeof s === 'string' ? L(s) : s); };
    const header = '47 0 ';
    const body = L(header + encDict);
    add(210, Buffer.concat([L(`210 0 obj\n<</Type/ObjStm/N 1/First ${header.length}/Length ${body.length}>>stream\n`), body, L('\nendstream\nendobj')]));
    add(200, '200 0 obj\n<</Type/Catalog/Pages 201 0 R>>\nendobj');
    add(201, '201 0 obj\n<</Type/Pages/Kids[202 0 R]/Count 1>>\nendobj');
    add(202, '202 0 obj\n<</Type/Page/Parent 201 0 R/MediaBox[0 0 612 792]>>\nendobj');
    push(L('\n'));
    const xrefOff = pos;
    offs[211] = pos;
    const rows: Array<[number, number, number]> = [
      [2, 210, 0], [1, offs[200], 0], [1, offs[201], 0], [1, offs[202], 0], [1, offs[210], 0], [1, offs[211], 0],
    ];
    if (opts.type3) rows.push([3, 0, 0]);
    const tail = rows.length - 4; // objects 210 on
    const data = Buffer.alloc(rows.length * 7);
    rows.forEach(([t, f2, f3], i) => { data[i * 7] = t; data.writeUInt32BE(f2, i * 7 + 1); data.writeUInt16BE(f3, i * 7 + 5); });
    push(Buffer.concat([
      L(`211 0 obj\n<</Type/XRef/W[1 4 2]/Index[47 1 200 3 210 ${tail}]/Size ${210 + tail}/Root 200 0 R/Encrypt 47 0 R/ID[<${idm[1]}><${idm[2]}>]/Prev ${prevXref}/Length ${data.length}>>stream\n`),
      data,
      L(`\nendstream\nendobj\nstartxref\n${xrefOff}\n%%EOF\n`),
    ]));
    return Buffer.concat(chunks);
  }

  /**
   * FDA's dictionary untouched; the appended trailer carries `id` (or no /ID at all when null).
   * `literal` (2026-09-23) writes the first /ID string as a literal string of octal escapes —
   * the same bytes, spelled the other way ISO 32000-1 §7.3.4 allows.
   */
  function withTrailerId(id: string | null, opts: { literal?: boolean } = {}): Buffer {
    const xrefOff = template.length + 1;
    const first = opts.literal && id !== null ? `(${[...Buffer.from(id, 'hex')].map((c) => `\\${c.toString(8).padStart(3, '0')}`).join('')})` : `<${id}>`;
    const idPart = id === null ? '' : `/ID[${first}<${idm[2]}>]`;
    return Buffer.concat([
      template,
      L(`\nxref\n0 1\n0000000000 65535 f\r\ntrailer\n<</Size 108/Root 48 0 R/Info 45 0 R/Encrypt 47 0 R${idPart}/Prev ${prevXref}>>\nstartxref\n${xrefOff}\n%%EOF\n`),
    ]);
  }

  /**
   * One incremental update whose cross-reference section is a STREAM — the
   * shape FDA's own templates and the platform's fill both use (2026-09-23,
   * W5/D7, round-2 review).
   *
   * `type3` adds an entry of type 3, which ISO 32000-1 Table 18 says "shall be
   * interpreted as a reference to the null object". pdf.js 5 throws "Invalid
   * XRef entry type", indexes the whole file, and lands on the template's own
   * cross-reference stream; qpdf and pypdf follow this one, as the spec
   * requires. `startxrefDelta` moves the final startxref off the section.
   */
  function xrefStreamUpdate(opts: { id: string | null; encrypt: boolean; type3?: boolean; startxrefDelta?: number; base?: Buffer }): Buffer {
    // `base`: append to an already-updated form (a later save) rather than to the blank template.
    const on = opts.base ?? template;
    const ol = on.toString('latin1');
    const prev = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(ol)![1]);
    const xnum = Number(/\/Size (\d+)/.exec(ol.slice(prev))![1]); // the xref stream's own object number
    const xrefOff = on.length + 1;
    const rows: Array<[number, number, number]> = [[1, xrefOff, 0]];
    if (opts.type3) rows.push([3, 0, 0]);
    const data = Buffer.alloc(rows.length * 7);
    rows.forEach(([t, f2, f3], i) => { data[i * 7] = t; data.writeUInt32BE(f2, i * 7 + 1); data.writeUInt16BE(f3, i * 7 + 5); });
    const idPart = opts.id === null ? '' : `/ID[<${opts.id}><${idm[2]}>]`;
    const enc = opts.encrypt ? '/Encrypt 47 0 R' : '';
    const dict = `<</Type/XRef/W[1 4 2]/Index[${xnum} ${rows.length}]/Size ${xnum + rows.length}/Root 48 0 R/Info 45 0 R${enc}${idPart}/Prev ${prev}/Length ${data.length}>>`;
    return Buffer.concat([
      on,
      L(`\n${xnum} 0 obj\n${dict}stream\n`), data, L(`\nendstream\nendobj\nstartxref\n${xrefOff + (opts.startxrefDelta ?? 0)}\n%%EOF\n`),
    ]);
  }

  return { template, templateId0: idm[1], redefinedAs, redefinedInObjectStream, withTrailerId, xrefStreamUpdate };
}

/** A PDF with security settings: an /Encrypt entry in its trailer. */
export const SECURED_PDF = L('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF\n');
/** The same PDF with no security settings. */
export const UNSECURED_PDF = L('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/**
 * A verified vendored eSTAR with `bytes` embedded the way the /official route
 * embeds a slot's file (attachPlannedFiles: an EmbeddedFile stream enciphered
 * with the eSTAR's own key, so the attachment's own /Encrypt is not in the
 * raw bytes). Null when no verified eSTAR template is vendored.
 */
export async function estarWithAttachment(bytes: Buffer, fileName = 'biocompatibility-report.pdf'): Promise<Buffer | null> {
  const t = (await listVendoredTemplates()).find((x) => x.integrity === 'verified');
  if (!t) return null;
  return Buffer.from(
    attachPlannedFiles(Buffer.from(t.bytes), [
      {
        slot: 'root.CoverLetter.CLAddAttachment110',
        field: 'CLAddAttachment110',
        chapter: '/CHAPTER 1/CH1.01/',
        fileName,
        dataObjectName: '2026-09-23T10:00:00',
        description: null,
        mimeType: 'application/pdf',
        bytes,
        byteLength: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        token: `<<${fileName}|/CHAPTER 1/CH1.01/>>`,
        source: { kind: 'vault_document', documentId: '33333333-3333-4333-8333-333333333333' },
      },
    ]),
  );
}
