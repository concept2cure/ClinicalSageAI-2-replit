/**
 * eCTD v4.0 (HL7 RPS) packager.
 *
 * Assembles a v4.0 sequence: the single `submissionUnit.xml` RPS message plus
 * every referenced document, into a ZIP. Reuses the v3.2.2 packager's proven
 * primitives — PDF/A finalization and checksum recomputation — so document
 * bytes are submission-grade and the in-message SHA-256 `integrityCheck`
 * matches the bytes actually shipped.
 *
 * Layout (v4.0 has no folder/heading tree and no index-md5.txt — integrity is
 * per-document inside the message):
 *
 *   NNNN/
 *     submissionUnit.xml          ← the RPS message
 *     <document href>…            ← physical files at their CoU-referenced paths
 *     util/index-md5.txt          ← convenience manifest (MD5), advisory
 *
 * @module server/services/ectd/ectd4/rps-packager
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { finalizePdfA } from '../pdfa-pipeline';
import { buildMd5Index } from '../../submission-gateways/regional-packager';
import { listVendoredSchemas } from '../schema-bundler';
import { buildRpsMessage, RPS_MESSAGE_PATH } from './rps-message-builder';
import { validateRpsMessage, type RpsValidationResult } from './rps-validator';
import type { RpsMessageInput } from './types';

export interface RpsPackagerInput {
  message: RpsMessageInput;
  /** Document bytes keyed by document id (RpsDocument.id). */
  sources: Map<string, Buffer>;
  /** Output directory; the zip is written here. */
  outputDir: string;
  /** HL7 creationTime (YYYYMMDDHHMMSS) for a reproducible message. */
  creationTime?: string;
  /** Also emit the unzipped tree (for a validator that walks the folder). */
  emitUnzipped?: boolean;
}

export interface RpsPackageResult {
  path: string;
  sha256: string;
  sizeBytes: number;
  /** The serialized submissionUnit.xml (post finalization, with real checksums). */
  messageXml: string;
  /** Model validation run over the finalized message. */
  validation: RpsValidationResult;
}

/** Finalize one document's bytes to submission grade (PDF/A) + SHA-256. */
async function finalizeBytes(buf: Buffer, mediaType: string): Promise<{ bytes: Buffer; sha256: string }> {
  let bytes = buf;
  if (mediaType === 'application/pdf') {
    const r = await finalizePdfA(buf);
    if (r.converted) bytes = Buffer.from(r.pdfBytes);
  }
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/**
 * Build a v4.0 RPS package. Finalizes each document's bytes first, recomputes
 * SHA-256, writes the recomputed integrity into the message model, THEN
 * serializes — so the message never advertises a checksum it did not ship.
 */
export async function packageRpsSubmission(input: RpsPackagerInput): Promise<RpsPackageResult> {
  const zip = new JSZip();
  const md5Entries: { relPath: string; md5: string }[] = [];

  // Deep-ish copy the message so we can update document checksums without
  // mutating the caller's object.
  const message: RpsMessageInput = {
    ...input.message,
    documents: input.message.documents.map((d) => ({ ...d })),
    contextsOfUse: input.message.contextsOfUse.map((c) => ({ ...c })),
  };

  for (const doc of message.documents) {
    const raw = input.sources.get(doc.id);
    if (!raw) {
      throw new Error(`RPS packager: no source bytes provided for document ${doc.id} (${doc.href}).`);
    }
    // A zero-length buffer is truthy and would otherwise be hashed and zipped as
    // a "valid" (but blank) leaf whose checksum correctly matches nothing. An
    // empty leaf must never ship — fail closed.
    if (raw.length === 0) {
      throw new Error(`RPS packager: source bytes for document ${doc.id} (${doc.href}) are empty (0 bytes) — refusing to package a blank leaf.`);
    }
    const { bytes, sha256 } = await finalizeBytes(raw, doc.mediaType);
    doc.checksum = sha256; // integrity matches shipped bytes
    zip.file(doc.href, bytes);
    md5Entries.push({ relPath: doc.href, md5: createHash('md5').update(bytes).digest('hex') });
  }

  // Serialize the message AFTER checksums are finalized.
  const messageXml = buildRpsMessage({ ...message, creationTime: input.creationTime });
  zip.file(RPS_MESSAGE_PATH, messageXml);
  md5Entries.push({ relPath: RPS_MESSAGE_PATH, md5: createHash('md5').update(messageXml).digest('hex') });

  // Bundle vendored XSDs into util/schema/ so the v4.0 package is schema
  // self-contained (submissionUnit.xml validates against the RPS message schema;
  // the .gc files against genericode.xsd). The licensed ICH RPS schema is not
  // committed — it comes from assets/ectd-schema/ or $ECTD_SCHEMA_DIR — so this
  // is a no-op when absent.
  const vendoredSchemas = await listVendoredSchemas();
  for (const s of vendoredSchemas) {
    const relPath = `util/schema/${s.fileName}`;
    zip.file(relPath, s.bytes);
    md5Entries.push({ relPath, md5: createHash('md5').update(s.bytes).digest('hex') });
  }

  // Advisory MD5 manifest (v4.0 integrity is per-document in the message; this
  // manifest aids tooling that still expects a package-level checksum list).
  zip.file('util/index-md5.txt', buildMd5Index(md5Entries));

  const validation = validateRpsMessage(message, message.submissionUnit.sequenceNumber);

  await fs.mkdir(input.outputDir, { recursive: true });
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${message.application.number}-${message.submissionUnit.sequenceNumber}-fda-v4.zip`;
  const outPath = path.join(input.outputDir, filename);
  await fs.writeFile(outPath, buffer);

  if (input.emitUnzipped) {
    const extractDir = path.join(
      input.outputDir,
      `${message.application.number}-${message.submissionUnit.sequenceNumber}-fda-v4`,
    );
    await fs.mkdir(extractDir, { recursive: true });
    for (const [relPath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const dest = path.join(extractDir, relPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, await (file as JSZip.JSZipObject).async('nodebuffer'));
    }
  }

  return {
    path: outPath,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    messageXml,
    validation,
  };
}
