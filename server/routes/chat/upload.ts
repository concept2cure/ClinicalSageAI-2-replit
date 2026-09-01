/**
 * server/routes/chat/upload.ts
 *
 * Governed file upload handler for chat.
 *
 * Handles POST /api/chat/upload. Stores file metadata in the `file_uploads` table
 * and, when a valid projectId + organizationId are present, also creates a
 * governed concept2cure_artifact (category='source') for unified Data Room access
 * and embeds the content into lumen_data_atoms for pgvector retrieval.
 *
 * Extracted from the legacy monolithic server/routes/chat.ts as part of the
 * Phase 4 chat-route decomposition. This module exports the handler only; the
 * Express Router wiring lives in the parent chat module.
 */

import type { Request, Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool } from '../../db.js';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService.js';
import { recordArtifactProvenance } from '../../services/provenance/artifact-provenance';
import { sha256, sha256Bytes } from './provenance.js';
import { createScopedLogger } from '../../utils/logger.js';
import { verifyFileSignature } from '../../utils/fileSignature';
import { scanBuffer as scanForViruses } from '../../utils/virusScan';
import { sha256Hex } from '../../services/ana/uploaded-file-access';
// Pure, dependency-free (no db import), so it is safe to load statically —
// unlike the evidence spine below, which is imported lazily so a database
// without the cre_* tables cannot break the route's module graph.
import { determineSourceVersion } from '../../services/clinical-regulatory-evidence/source-version.js';

const logger = createScopedLogger('chat-upload');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an incoming `projectId` into whichever project id-space it belongs to.
 *
 * The platform carries two, and an upload can arrive with either:
 *   - a `regulatory_programs` UUID — what the project management module
 *     (ProjectHome, /api/c2c/projects) selects and what the user actually has
 *     open;
 *   - a numeric workspace id, optionally `proj_`-prefixed — the legacy space.
 *
 * Treating every id as numeric is what made a UUID-scoped upload unusable: it
 * parsed to NaN, and the governed-artifact block rejected the request outright.
 */
function resolveProjectScope(
  projectId: unknown,
): { programId: string | null; workspaceId: number | null } {
  if (projectId == null || projectId === '') return { programId: null, workspaceId: null };
  const raw = String(projectId).trim();
  if (UUID_RE.test(raw)) return { programId: raw, workspaceId: null };
  const numeric = parseInt(raw.replace(/^proj_/, ''), 10);
  return Number.isFinite(numeric)
    ? { programId: null, workspaceId: numeric }
    : { programId: null, workspaceId: null };
}

export const uploadHandler = async (req: Request, res: Response) => {
  try {
    const fileBuffer: Buffer | undefined = (req as any).file?.buffer;

    // FAIL CLOSED ON MISSING BYTES.
    //
    // Every field below used to fall back to a request-body value and then to
    // a constant, so a request carrying no file still produced a
    // `file_uploads` row named 'uploaded_file' with file_size 0, a
    // storage_path nothing was written to, a `cre_evidence_sources` row
    // stamped ingestion_status='ingested', and a 200 {status:'ready'}. For the
    // whole time no multipart parser was mounted (see server/routes/chat.ts),
    // that was EVERY upload.
    //
    // Evidence with no bytes is not evidence. There is nothing to checksum,
    // nothing to extract, and nothing a later citation could be verified
    // against — so this refuses rather than recording a document that does not
    // exist. The body-only shape is gone with it: an upload endpoint that
    // accepts a filename and a size without a file has no honest use.
    if (!fileBuffer || fileBuffer.length === 0) {
      logger.warn('Upload rejected — no file bytes received', {
        hasFile: Boolean((req as any).file),
        contentType: req.headers['content-type'] ?? null,
      });
      return res.status(400).json({
        error: {
          code: 'NO_FILE_RECEIVED',
          message:
            'No file bytes were received. Send the file as multipart/form-data under the field name "file".',
        },
      });
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fileName = (req as any).file?.originalname || 'uploaded_file';
    const mimeType = (req as any).file?.mimetype || 'application/octet-stream';
    // Trust the buffer's own length over any declared size.
    const fileSize = fileBuffer.length;
    const projectId = req.body?.projectId || req.body?.project_id;
    const userId = (req as any).user?.id || null;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    // SECURITY: verify the actual file bytes match the declared MIME
    // type. multer's `file.mimetype` comes from the request's
    // Content-Type header — an attacker can set it to anything. The
    // magic-number check catches an executable uploaded as
    // `application/pdf`, an HTML phishing payload uploaded as
    // `image/png`, etc. Only applied when we have a real buffer
    // (memory-storage uploads); body-only requests skip this gate.
    if (fileBuffer && fileBuffer.length > 0) {
      const sig = verifyFileSignature(fileBuffer, mimeType);
      if (!sig.ok) {
        logger.warn('Upload rejected by signature check', {
          fileName,
          declaredMime: mimeType,
          reason: sig.reason,
        });
        return res.status(400).json({
          error: 'File content does not match declared type',
          code: 'FILE_SIGNATURE_MISMATCH',
        });
      }

      // Antivirus scan. No-op when CLAMAV_HOST is unset (returns
      // scanned=false, clean=true) — production must set the env var
      // for the scanner to engage. When the scan finds something,
      // reject with a generic 400 and a specific log entry. We do
      // NOT echo the signature name back to the client (it would
      // help an attacker craft a payload that evades the scanner).
      const scan = await scanForViruses(fileBuffer);
      if (!scan.clean) {
        logger.warn('Upload rejected by virus scanner', {
          fileName,
          declaredMime: mimeType,
          signature: scan.signature,
          orgId,
        });
        return res.status(400).json({
          error: 'File rejected by content scan',
          code: 'FILE_SCAN_REJECTED',
        });
      }
      if (!scan.scanned) {
        // Fail-open path: we let the upload through but record the
        // miss so ops can monitor scanner reachability. Log volume
        // is bounded by upload volume.
        logger.warn('Virus scan bypassed', {
          fileName,
          reason: scan.reason,
        });
      }
    }

    // SECURITY: tenant-scoped storage path. The legacy `uploads/${fileId}`
    // flat layout meant any process that read by file id alone could
    // retrieve another tenant's file — and the file id, while
    // timestamp-suffixed, is enumerable. By prefixing the org id we
    // ensure a foreign-tenant lookup hits a path the caller's org
    // doesn't own. `orgId` here is the JWT-derived value from
    // req.tenantId / req.tenantContext.organizationId (never body /
    // query). When no org is available we anchor under `unscoped/` so
    // those rows never collide with a real tenant's namespace.
    const orgSegment = orgId != null ? `org-${Number(orgId)}` : 'unscoped';
    const storagePath = `uploads/${orgSegment}/${fileId}`;

    // Persist the bytes so downstream paths (e.g. ANA PDF intake via
    // readLocalUploadBuffer) can re-read the file. Previously only metadata
    // was stored, leaving storage_path dangling. Best-effort: a write
    // failure must not fail the upload — the metadata row is still useful.
    if (fileBuffer && fileBuffer.length > 0) {
      try {
        const resolved = path.resolve(process.cwd(), storagePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, fileBuffer);
      } catch (err) {
        logger.warn('Upload byte persistence failed (non-fatal)', {
          fileId,
          reason: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    // Save metadata to DB.
    //
    // `organization_id` is written alongside the tenant-scoped storage path so
    // both halves of the tenancy contract agree (see
    // migrations/20260726_file_uploads_tenancy.sql). Omitting it — as this
    // INSERT previously did — made every `WHERE organization_id = $n` lookup in
    // the chat/stream paths match zero rows, silently dropping attachments.
    await pool.query(
      `INSERT INTO file_uploads (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', NOW())`,
      [
        fileId,
        userId,
        orgId != null ? Number(orgId) : null,
        fileName,
        mimeType,
        fileSize,
        storagePath,
        // SHA-256 of the bytes as received, so loadUploadedFile can later prove
        // the file on disk is still the one that was uploaded. Nothing recorded
        // a digest before this, which is why no stored document was verifiable
        // after the fact (GA ledger L25). Null only if this route ever runs
        // without a buffer — the checksum must describe real bytes or nothing.
        fileBuffer ? sha256Hex(fileBuffer) : null,
      ]
    );

    // ── Text extraction (runs for every upload with a buffer) ──
    // Extract real text once so: (a) the response can report it was read
    // (method + word count) regardless of project scope, and (b) the
    // project-scoped block below reuses it for the artifact + memory atom.
    // Falls back to a filename placeholder on failure.
    let extractionMethod: string | null = null;
    let extractionWords = 0;
    let extractedText = `[Uploaded via chat: ${fileName}] (${mimeType}, ${fileSize} bytes)`;
    if (fileBuffer && fileBuffer.length > 0) {
      try {
        const { extractDocumentText } = await import('../../services/ocr/index.js');
        const extracted = await extractDocumentText(fileBuffer, mimeType, fileName);
        if (extracted.text && extracted.text.trim().length > 0) {
          extractedText = extracted.text;
          extractionMethod = extracted.method;
          extractionWords = extracted.text.trim().split(/\s+/).length;
          logger.info('Upload text extracted', { fileId, method: extracted.method, chars: extracted.text.length });
        }
      } catch (extractErr: any) {
        logger.warn('Upload text extraction failed (non-fatal)', { err: extractErr?.message, fileId });
      }
    }

    // Which project id-space this upload arrived with, resolved once and used
    // by both the governed-artifact block and the source identity below.
    const projectScope = resolveProjectScope(projectId);

    // ── Data Room convergence: create artifact + embed for retrieval ──
    //
    // `concept2cure_artifacts.project_id` is an INTEGER, so this block can only
    // run for the numeric id-space. A UUID-scoped upload skips it and still
    // gets its canonical source identity below — previously it was rejected
    // with a 400, which meant a file could not be uploaded at all while a
    // UUID-keyed program was open.
    let artifactId: string | null = null;
    if (projectId && orgId && projectScope.workspaceId != null) {
      const numericProjectId = projectScope.workspaceId;
      const numericOrgId = parseInt(String(orgId), 10);
      if (isNaN(numericOrgId)) {
        return res.status(400).json({
          error: 'projectId and organizationId must be valid for governed upload',
          code: 'GOVERNED_UPLOAD_CONTEXT_INVALID',
        });
      }

      const artId = `artifact_chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const boundedContent = extractedText.substring(0, 100000);

      const governedResolution = resolveGovernedContext({
        req,
        projectId: numericProjectId,
        artifactId: null,
        documentType: 'source_document',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'api_route',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'evidence_memo',
        readinessGate: 'internal_review',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'evidence_analysis',
        placementContainerId: String(numericProjectId),
        title: fileName,
        content: boundedContent,
        sourceRefs: [`upload:${fileId}`],
        provider: 'chat_upload',
        model: 'file_ingest',
        exportAllowed: false,
        eventType: 'artifact.created',
      });

      if (!governedResolution.validation.valid) {
        return res.status(400).json({
          error: 'Governed document contract validation failed',
          code: 'GOVERNED_CONTRACT_INVALID',
          details: {
            errors: governedResolution.validation.errors,
            warnings: governedResolution.validation.warnings,
            resolved: governedResolution.resolved,
          },
        });
      }

      try {
        const contentHash = sha256(boundedContent);
        const uploadIns = await pool.query<{ id: number }>(
          `INSERT INTO concept2cure_artifacts
             (organization_id, project_id, artifact_id, type, category, title, content, content_hash, version, metadata, created_by_id)
           VALUES ($1, $2, $3, 'source_document', 'source', $4, $5, $6, 1, $7, $8)
           RETURNING id`,
          [
            numericOrgId,
            numericProjectId,
            artId,
            fileName,
            boundedContent,
            contentHash,
            JSON.stringify({
              uploadSource: 'chat',
              fileId,
              mimeType,
              fileSize,
              harness: {
                clientTrack: governedResolution.contract.clientTrack,
                submissionProgram: governedResolution.contract.submissionProgram,
                persona: governedResolution.contract.persona,
                regulatorScope: governedResolution.contract.regulatorScope,
                documentClass: governedResolution.contract.documentClass,
                readinessGate: governedResolution.contract.readinessGate,
                workspaceTarget: governedResolution.contract.workspaceTarget,
                originSurface: governedResolution.contract.originSurface,
                recommendationSource: governedResolution.contract.recommendationSource,
                regulatorIntent: governedResolution.contract.regulatorIntent,
                gateChecks: governedResolution.contract.exportEligibility.gateChecks,
                blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
                readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
              },
            }),
            userId,
          ]
        );
        artifactId = artId;
        // Uniform provenance: an uploaded source document is a 'source_input'
        // event. Best-effort — inside the existing artifact-persist try, a
        // provenance hiccup must not fail the upload.
        try {
          await recordArtifactProvenance(pool, {
            artifactId: uploadIns.rows[0].id,
            organizationId: numericOrgId,
            eventType: 'source_input',
            eventAction: 'upload',
            actorId: typeof userId === 'number' ? userId : null,
            details: { uploadSource: 'chat', fileId, mimeType, fileSize },
            backendService: 'routes/chat/upload',
          });
        } catch { /* upload provenance is best-effort */ }
      } catch (artErr: any) {
        // Log the raw cause through the scoped logger (redacted by
        // SENSITIVE_KEYS) — never echo it back to the client.
        logger.error('Governed artifact persistence failed', {
          err: artErr?.message,
          fileId,
          orgId,
        });
        return res.status(500).json({
          error: 'Governed artifact persistence failed for upload',
          code: 'ARTIFACT_CONSEQUENCE_REQUIRED',
        });
      }

      // Auto-embed into lumen_data_atoms for pgvector retrieval
      try {
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'chat_upload', $2, 'source_document', $3, $4, '{source,chat_upload}', 0.85, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [numericOrgId, artId, fileName, boundedContent.substring(0, 16000)]
        );
        if (atomResult.rows.length > 0) {
          const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomResult.rows[0].id);
        }
      } catch (embedErr: any) {
        logger.warn('Chat upload embedding failed (non-fatal)', {
          err: embedErr?.message,
          fileId,
        });
      }
    }

    // ── Canonical source identity ──────────────────────────────────────────
    //
    // Every uploaded file resolves to ONE `cre_evidence_sources` row of type
    // `client_document`. This is the identity the Data Room, evidence linking
    // and dossier relationships hang off — without it an upload exists only as
    // a `file_uploads` row, a governed artifact and an embedding atom, none of
    // which can answer "which dossier sections use this file, and what changed
    // when it was replaced".
    //
    // Runs for any authenticated org, not just project-scoped uploads: a file
    // attached in chat without a project still deserves an identity, otherwise
    // it can never be adopted into one later.
    //
    // Idempotent on the raw-byte checksum — re-uploading the same document
    // resolves the existing source instead of minting a second identity for it.
    //
    // Best-effort by design: a CRE failure must not fail an upload the user has
    // already completed. It is logged at error level (not warn) because a miss
    // means that file has no canonical identity, which is a real gap rather
    // than a degraded nicety. `sourceId` is returned so callers and tests can
    // observe whether identity resolution actually happened.
    let sourceId: number | null = null;
    // The org must resolve to a real numeric id. `tenantContext.organizationId`
    // is not guaranteed numeric, and passing NaN through would write a garbage
    // owner onto the canonical identity — worse than having no identity.
    const numericOrgId = orgId != null ? Number(orgId) : NaN;
    if (Number.isFinite(numericOrgId) && numericOrgId > 0) {
      try {
        // Checksum the raw bytes, not the truncated extracted text: file
        // identity is the document itself.
        //
        // There is deliberately NO fallback. It used to be
        // `sha256(extractedText)`, and extractedText on that branch was the
        // placeholder built from fileName/mimeType/fileSize — a formatted
        // metadata string, not content. With no multipart parser mounted those
        // three were constants, so the "checksum" was a platform-wide
        // constant: findSourceByChecksum matched the first upload every time,
        // and every subsequent upload in an org adopted that row's id. Four
        // different documents became one source called 'uploaded_file', and
        // any section citing it recorded whichever file happened to be
        // uploaded first.
        //
        // Content identity over anything but content is not identity. The
        // handler now refuses byte-less uploads outright, so this is
        // unconditional.
        const checksum = sha256Bytes(fileBuffer);
        const { createSource, createSupersedingSource, findSourceByChecksum, findSupersededCandidate } =
          await import('../../services/clinical-regulatory-evidence/evidence-spine.service.js');

        const existing = await findSourceByChecksum(numericOrgId, checksum, {
          sourceType: 'client_document',
        });
        if (existing) {
          sourceId = existing.id;
          logger.info('Upload resolved to an existing source identity', {
            fileId,
            sourceId,
            checksum,
          });
        } else {
          // The platform has two project id-spaces and an upload may arrive
          // with either: a `regulatory_programs` UUID (what the project
          // management module selects) or the numeric workspace id. Stamp
          // whichever we actually got rather than assuming one.
          const scope = projectScope;
          const scopedToProject = scope.programId != null || scope.workspaceId != null;

          // ── Dossier classification (capture → classify) ────────────────────
          // The same deterministic classifier the Vault ingest runs, stamped
          // into the source's metadata so the Data Room can show WHAT this is
          // and WHERE it likely belongs the moment it lands — the 'classified'
          // stage of the capture→classify→file pipeline. A proposal, never a
          // commitment: filing into the vault stays a governed act. Failure to
          // classify must never fail the capture.
          let dossier: Record<string, unknown> | null = null;
          try {
            const { classifyForFiling, resolveVaultView, resolveOrgVaultView } = await import(
              '../../services/vault/vault-filing.service.js'
            );
            const view = scope.programId
              ? await resolveVaultView(scope.programId, numericOrgId)
              : await resolveOrgVaultView(numericOrgId);
            const c = classifyForFiling({
              fileName,
              title: fileName,
              mimeType,
              extractedText: extractionMethod ? extractedText : null,
              view,
            });
            dossier = {
              view,
              evidenceKind: c.evidenceKind,
              suggestedFolder: c.folderId,
              ctdSection: c.ctdSection,
              confidence: c.confidence,
              needsReview: c.needsReview,
              rationale: c.rationale,
            };
          } catch (classifyErr: any) {
            logger.warn('Upload dossier classification failed (non-fatal)', {
              err: classifyErr?.message,
              fileId,
            });
          }
          // Is this a REVISION of a document this project already holds?
          //
          // A new checksum means new bytes, and until now that was the end of
          // it: the revision became an unrelated source row, and every citation
          // of the old one went on reporting "content unchanged since cited"
          // forever, because a source's checksum is never rewritten. Linking the
          // two is what makes a superseded citation visible at all.
          //
          // The lookup is deliberately narrow and declines to decide when two
          // documents in the project share a filename — see
          // findSupersededCandidate. It is also best-effort: on a database
          // without the versioning migration it throws, and "no predecessor
          // known" is the honest fallback rather than a failed upload.
          let supersedes: { id: number } | null = null;
          try {
            supersedes = await findSupersededCandidate(numericOrgId, {
              title: fileName,
              sourceType: 'client_document',
              programId: scope.programId,
              workspaceId: scope.workspaceId,
            });
          } catch (verErr: any) {
            logger.warn('Source version lookup unavailable — treating upload as a new document', {
              fileId,
              err: verErr?.message,
            });
          }

          // What version of this document is it? (ledger L21)
          //
          // `cre_evidence_sources.version` has existed since the spine
          // migration and NOTHING has ever passed it, so every row reads NULL
          // and no fact can be told which revision of a protocol it rests on.
          //
          // The value written is only ever one the document DECLARES — read off
          // its title page, or off its filename — never this system's count of
          // how many times a file with that name has been uploaded. A sponsor's
          // first upload into a new project is routinely revision 4 of a
          // protocol that lived in email for a year; stamping `1` on it would
          // put a number in a provenance column indistinguishable from a real
          // one. When nothing declares a version, `version` stays NULL and the
          // determination itself is recorded, so a reviewer can tell "this
          // document is unversioned" from "nobody looked".
          const versionDetermination = determineSourceVersion({
            // The filename placeholder built when extraction fails is metadata,
            // not document text — the same distinction the classifier draws
            // above. Reading a version out of it would be reading it out of the
            // filename twice.
            documentText: extractionMethod ? extractedText : null,
            fileName,
          });

          // Typed against createSource's parameter so pulling the literal out of
          // the call keeps its string-union fields (sourceType, visibilityClass,
          // the two statuses) instead of widening them to string.
          const sourceParams: Parameters<typeof createSource>[1] = {
            sourceType: 'client_document',
            // Project uploads are scoped to the project; an unscoped chat
            // attachment stays tenant-private rather than leaking project-wide.
            visibilityClass: scopedToProject ? 'project_private' : 'tenant_private',
            clientProgramId: scope.programId,
            clientWorkspaceId: scope.workspaceId,
            title: fileName,
            // The stored blob these bytes live at; the governed artifact (when
            // one exists) is in metadata below.
            storedArtifactRef: storagePath,
            checksum,
            // Null unless the document actually declares one; the determination
            // travels in provenance either way.
            version: versionDetermination.version,
            // The bytes are stored and were read at ingest, so neither status
            // is 'pending' — reporting otherwise would misstate the corpus.
            ingestionStatus: 'ingested',
            extractionStatus: extractionMethod ? 'extracted' : 'failed',
            provenance: {
              origin: 'chat_upload',
              fileUploadId: fileId,
              storagePath,
              extractionMethod,
              extractionWords,
              uploadedByUserId: userId,
              // How the version above was arrived at — including when it could
              // not be. Its ABSENCE on a row means no determination was ever
              // made, which is not the same fact as `declared: false`.
              versionDeclaration: {
                ...versionDetermination.declaration,
                determinedBy: 'chat_upload ingest',
              },
            },
            metadata: {
              originalName: fileName,
              mimeType,
              fileSize,
              artifactId,
              ...(dossier ? { dossier } : {}),
            },
          };

          // How the link was established travels WITH the record. A reviewer
          // asking "why does this say my source was superseded" gets the answer
          // from the row, not from this file.
          const created = supersedes
            ? (await createSupersedingSource(
                numericOrgId,
                {
                  ...sourceParams,
                  provenance: {
                    ...sourceParams.provenance,
                    supersedes: {
                      sourceId: supersedes.id,
                      matchedOn: 'title+projectScope+sourceType',
                      decidedBy: 'chat_upload ingest',
                    },
                  },
                },
                supersedes.id,
              )).source
            : await createSource(numericOrgId, sourceParams);
          sourceId = created.id;
          logger.info(
            supersedes
              ? 'Upload superseded an existing source identity'
              : 'Upload created a canonical source identity',
            { fileId, sourceId, supersededId: supersedes?.id ?? null },
          );
        }
      } catch (sourceErr: any) {
        logger.error('Canonical source identity not created for upload', {
          err: sourceErr?.message,
          fileId,
          orgId,
        });
      }
    }

    // ── Retrieval embedding for program-scoped (UUID) uploads ──────────────
    //
    // The numeric-workspace path above embeds inside its governed-artifact
    // block, but that block is skipped for the UUID id-space because
    // concept2cure_artifacts.project_id is an INTEGER. The Data Room (ProjectHome)
    // opens a `regulatory_programs` UUID, so EVERY upload a real customer makes
    // there took the UUID path: it got a canonical source identity but its
    // extracted text was never embedded — read once, used for a word count, then
    // dropped from the retrieval corpus. That is the foundational gap behind the
    // whole "ingest the sponsor's source data and cite it back" premise: with no
    // atom + embedding, the content is not retrievable by RAG and cannot be cited
    // in authoring.
    //
    // Embed here so program uploads join the corpus too. lumen_data_atoms is
    // org-scoped (no project column) with `tags` for finer scoping, so the atom
    // carries a `program:<uuid>` tag for program-scoped retrieval and is keyed to
    // the canonical source id for idempotency (re-uploading the same file resolves
    // the same source, so the guarded insert is a no-op rather than a duplicate).
    if (
      projectScope.programId != null &&
      extractionMethod && // only real extracted content, never the filename placeholder
      extractedText.trim().length > 0 &&
      Number.isFinite(numericOrgId) &&
      numericOrgId > 0
    ) {
      try {
        const atomSourceId = sourceId != null ? `cre_source:${sourceId}` : `upload:${fileId}`;
        const boundedContent = extractedText.substring(0, 16000);
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           SELECT $1, 'chat_upload', $2, 'source_document', $3, $4, $5::text[], 0.85, 'active'
            WHERE NOT EXISTS (
              SELECT 1 FROM lumen_data_atoms
               WHERE organization_id = $1 AND source_id = $2
            )
           RETURNING id`,
          [
            numericOrgId,
            atomSourceId,
            fileName,
            boundedContent,
            ['source', 'chat_upload', `program:${projectScope.programId}`],
          ]
        );
        if (atomResult.rows.length > 0) {
          const { getEmbeddingService } = await import(
            '../../services/enhancedEmbeddingService.js'
          );
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomResult.rows[0].id);
          logger.info('Program-scoped upload embedded into retrieval corpus', {
            fileId,
            sourceId,
            atomId: atomResult.rows[0].id,
            programId: projectScope.programId,
          });
        }
      } catch (embedErr: any) {
        logger.warn('Program-scoped upload embedding failed (non-fatal)', {
          err: embedErr?.message,
          fileId,
        });
      }
    }

    res.json({
      fileId,
      message: 'File uploaded successfully',
      status: 'ready',
      fileName,
      artifactId,
      // Canonical `cre_evidence_sources` id for this document. Null means
      // identity resolution did not happen (no org context, or a CRE failure —
      // see the error log), not that the upload failed.
      sourceId,
      // Extraction summary for the chat UI: which method read the file and how
      // many words landed in memory (null/0 when unscoped or extraction failed).
      extractionMethod,
      extractionWords,
    });
  } catch (error: any) {
    logger.error('Upload error', { err: error?.message });
    res.status(500).json({
      error: 'Failed to upload file',
      code: 'UPLOAD_ERROR',
    });
  }
};
