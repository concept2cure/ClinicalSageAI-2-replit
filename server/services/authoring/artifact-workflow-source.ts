/** Exact registry materialization for the existing workflow-source importer.
 * Registry, Authoring and Vault identities remain distinct; no original is edited. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { artifactImportId, type WorkflowImportOrigin, type WorkflowImportSource } from '../../../shared/authoring/source-import';
import { plainTextToHtml } from '../../../shared/authoring/plain-text-html';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { createSourceHash } from '../cmc-module3-compiler';
import { readCsrProjectActor } from '../csr/project-scope';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import { artifactDataEligibleSql } from '../document-data-disposition/eligibility';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { hashSpanText, listLiveMachineSpans } from '../clinical-regulatory-evidence/span-lineage.service';
import { WORKFLOW_IMPORT_AUTHOR_ID } from './revision-ledger';
import type { Queryable } from './authoring-evidence';
import { WorkflowSourceImportError, type MaterializedWorkflowSource, type WorkflowMaterializationInput } from './workflow-source-import';

type ArtifactInput = WorkflowMaterializationInput & { source: Extract<WorkflowImportSource, { kind: 'artifact' }> };
type Snapshot = NonNullable<WorkflowImportOrigin['artifactSource']>;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647;
function fail(code: string, message: string): never { throw new WorkflowSourceImportError(409, code, message); }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;

async function admittedHead(input: ArtifactInput, q: Queryable): Promise<Record<string, unknown>> {
  const actor = await readCsrProjectActor(q, input.organizationId, input.userId, { forShare: true });
  const anchor = await readProgramAnchorRow(q, { programId: input.target.programId, orgId: input.organizationId,
    context: 'artifact-workflow-import', requireUnique: true });
  if (!anchor || anchor.id !== input.target.projectId) fail('ARTIFACT_SOURCE_SCOPE_UNVERIFIED', 'The selected artifact project could not be verified.');
  if (!await canAccessReportProject(input.organizationId, actor, anchor.id, q)) {
    throw new WorkflowSourceImportError(403, 'ARTIFACT_SOURCE_ACCESS_DENIED', 'Current project access is required to read this artifact.');
  }
  await lockDocumentDispositionProgram(q, input.organizationId, input.target.programId);
  const result = await q.query(`SELECT a.id, a.artifact_id, a.organization_id, a.project_id,
      a.title, a.type, a.category, a.content, a.content_hash, a.version, a.status,
      a.metadata, to_jsonb(a)->'citations' AS citations, a.ctd_section,
      to_jsonb(a)->>'updated_at' AS updated_at,
      ${artifactDataEligibleSql('a')} AS data_eligible
    FROM concept2cure_artifacts a
    WHERE a.artifact_id=$1 AND a.organization_id=$2 AND a.project_id=$3
    LIMIT 2 FOR SHARE OF a`, [input.source.artifactId, input.organizationId, anchor.id]);
  if (result.rows.length !== 1) throw new WorkflowSourceImportError(404, 'ARTIFACT_SOURCE_NOT_FOUND', 'Saved artifact not found in the selected project.');
  const row = result.rows[0];
  if (row.organization_id !== input.organizationId || row.project_id !== anchor.id || row.artifact_id !== input.source.artifactId || !integer(row.id)) {
    fail('ARTIFACT_SOURCE_SCOPE_UNVERIFIED', 'The saved artifact identity could not be verified.');
  }
  if (row.data_eligible !== true) fail('ARTIFACT_SOURCE_WITHDRAWN', 'This artifact’s data is withdrawn or superseded and cannot start a working copy.');
  return row;
}
function verifiedHead(row: Record<string, unknown>, input: ArtifactInput): string {
  if (!integer(row.version) || row.version !== input.source.version) fail('ARTIFACT_SOURCE_CHANGED', 'Choose this artifact’s current version and preview it again. Historical versions cannot start an editing copy.');
  if (['archived', 'deleted', 'superseded', 'withdrawn'].includes(String(row.status).toLowerCase())) fail('ARTIFACT_SOURCE_RETIRED', 'This artifact is retired and cannot start a working copy.');
  if (!text(row.title) || !text(row.type) || !text(row.category) || !text(row.status)
    || typeof row.content !== 'string' || !row.content.trim() || row.content.length > 2_000_000) {
    fail('ARTIFACT_SOURCE_CONTENT_UNVERIFIED', 'This artifact has no supported saved text within the editor limits.');
  }
  return row.content;
}
function normalizedHash(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !HASH.test(value.trim().toLowerCase())) fail('ARTIFACT_SOURCE_HASH_MISMATCH', 'The artifact has an invalid recorded content hash. Nothing was imported.');
  return value.trim().toLowerCase();
}
function headHashScheme(row: Record<string, unknown>, content: string): Snapshot['hashScheme'] {
  const recorded = normalizedHash(row.content_hash);
  if (recorded === null) return 'unrecorded';
  if (recorded === sha(content)) return 'raw-sha256';
  const metadata = record(row.metadata), sectionKey = text(metadata.sectionKey);
  const cmcIdentity = metadata.compiledFrom === 'module3-os' && sectionKey !== null
    && sectionKey.startsWith('3.') && normalizeCtdCode(sectionKey) === sectionKey && sectionKey === row.ctd_section;
  if (cmcIdentity && recorded === createSourceHash({ narrative: content, sectionKey })) return 'cmc-source-hash';
  return fail('ARTIFACT_SOURCE_HASH_MISMATCH', 'The artifact text does not match its recorded content hash or a verified source hash scheme. Nothing was imported.');
}
async function verifiedVersion(q: Queryable, input: ArtifactInput, row: Record<string, unknown>, content: string): Promise<Record<string, unknown> | null> {
  const result = await q.query(`SELECT id, artifact_id, organization_id, version, content, content_hash
    FROM concept2cure_artifact_versions WHERE artifact_id=$1 AND organization_id=$2 AND version=$3
    LIMIT 2 FOR SHARE`, [row.id, input.organizationId, input.source.version]);
  const version = result.rows[0];
  if (result.rows.length === 0) return null;
  if (result.rows.length !== 1 || !integer(version?.id) || version.artifact_id !== row.id
    || version.organization_id !== input.organizationId || version.version !== row.version
    || version.content !== content || normalizedHash(version.content_hash) !== sha(content)) {
    fail('ARTIFACT_SOURCE_VERSION_UNVERIFIED', 'The exact current artifact version and its content hash could not be verified. Nothing was imported.');
  }
  return version;
}
function modelFrom(metadata: Record<string, unknown>, events: Record<string, unknown>[]): string | null {
  const recorded = text(metadata.model) ?? text(metadata.modelTier) ?? text(metadata.aiModel);
  if (recorded) return recorded;
  for (const event of events) {
    const details = record(event.details);
    const model = text(record(details.generation).model) ?? text(details.model) ?? text(details.modelTier) ?? text(details.aiModel);
    if (model) return model;
  }
  return null;
}
function currentModelEvents(events: Record<string, unknown>[], version: Record<string, unknown> | null, sourceVersion: number, content: string) {
  return events.filter(event => {
    const details = record(event.details);
    return (version !== null && event.artifact_version_id === version.id)
      || (text(details.contentHash)?.toLowerCase() === sha(content) && details.version === sourceVersion);
  });
}
function snapshotUpdateTime(row: Record<string, unknown>, version: Record<string, unknown> | null): string | null {
  const at = typeof row.updated_at === 'string' ? new Date(row.updated_at) : null;
  if (at && Number.isFinite(at.getTime())) return at.toISOString();
  if (version === null) fail('ARTIFACT_SOURCE_SNAPSHOT_UNVERIFIED', 'This artifact has no retained version or valid current update time to bind its saved-text snapshot.');
  return null;
}
function sourceSections(row: Record<string, unknown>, content: string) {
  const literal = ['code', 'chart', 'form', 'table'].includes(String(row.type).toLowerCase())
    || ['interactive', 'visualization'].includes(String(row.category).toLowerCase()) || content.trim().startsWith('{') || content.trim().startsWith('[');
  return { literal, sections: [{ code: 'artifact.content', title: String(row.title), content: literal ? plainTextToHtml(content) : content }] };
}
async function validatedMachineSpans(input: ArtifactInput, row: Record<string, unknown>, content: string, q: Queryable) {
  const spans = (await listLiveMachineSpans(input.organizationId, { documentTable: 'concept2cure_artifacts', documentId: String(row.id) }, q))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (!spans.every(span => Number.isSafeInteger(span.charStart) && Number.isSafeInteger(span.charEnd)
    && span.charStart >= 0 && span.charEnd > span.charStart && span.charEnd <= content.length
    && hashSpanText(content.slice(span.charStart, span.charEnd)) === span.spanTextSha256)) {
    fail('ARTIFACT_SOURCE_LINEAGE_UNVERIFIED', 'Saved artifact machine lineage does not match the source text. Reconcile its provenance before importing.');
  }
  return spans;
}
function verifiedMetadata(row: Record<string, unknown>) {
  if (row.metadata != null && (typeof row.metadata !== 'object' || Array.isArray(row.metadata))) fail('ARTIFACT_SOURCE_ORIGIN_UNVERIFIED', 'The recorded artifact origin is malformed.');
  if (row.citations != null && !Array.isArray(row.citations)) fail('ARTIFACT_SOURCE_ORIGIN_UNVERIFIED', 'The recorded artifact citations are malformed.');
  return record(row.metadata);
}
function recordedMachine(metadata: Record<string, unknown>, events: Record<string, unknown>[]): boolean {
  const known = (facts: Record<string, unknown>) => facts.source === 'ana_document_studio' || facts.generationMethod === 'ai'
    || facts.ai_generated === true || facts.aiGenerated === true || record(facts.generation).mode === 'ai_generated'
    || Boolean(text(facts.model) ?? text(facts.modelTier) ?? text(facts.aiModel));
  return known(metadata) || events.some(event => event.event_action === 'ai_generate' || known(record(event.details)));
}
export async function materializeArtifactSource(input: ArtifactInput, q: Queryable): Promise<MaterializedWorkflowSource> {
  if (!artifactImportId(input.source.artifactId, input.source.version)) throw new WorkflowSourceImportError(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved artifact and current version.');
  const row = await admittedHead(input, q), content = verifiedHead(row, input);
  const hashScheme = headHashScheme(row, content), version = await verifiedVersion(q, input, row, content);
  const metadata = verifiedMetadata(row), spans = await validatedMachineSpans(input, row, content, q);
  const events = (await q.query(`SELECT id, artifact_version_id, event_type, event_action, details
    FROM concept2cure_provenance_events WHERE artifact_id=$1 AND organization_id=$2 ORDER BY id`, [row.id, input.organizationId])).rows;
  const model = modelFrom(metadata, currentModelEvents(events, version, input.source.version, content));
  const machine = recordedMachine(metadata, events) || spans.some(span => span.machineAuthorId !== WORKFLOW_IMPORT_AUTHOR_ID);
  const scope = { level: 'program' as const, programId: input.target.programId, projectId: input.target.projectId };
  const source = { kind: 'artifact' as const, artifactId: input.source.artifactId, version: input.source.version };
  const { literal, sections } = sourceSections(row, content);
  const sectionOrigins = [{ code: 'artifact.content', sourceRowId: version ? `concept2cure_artifact_versions:${version.id}` : `concept2cure_artifacts:${row.id}`,
    contentSha256: sha(sections[0].content), originalAuthorship: machine ? 'machine' as const : 'unknown' as const,
    model, modelEvidence: model ? 'recorded-name-only' as const : 'unrecorded' as const }];
  const artifactSource: Snapshot = {
    artifactId: source.artifactId, version: source.version, contentSha256: sha(content),
    verificationBasis: version ? 'retained-version' : 'current-head-snapshot', hashScheme,
    recordedContentHash: normalizedHash(row.content_hash), updatedAt: snapshotUpdateTime(row, version),
    type: String(row.type), category: String(row.category), status: String(row.status), ctdSection: text(row.ctd_section),
    metadata, citations: Array.isArray(row.citations) ? row.citations : [],
    machineLineage: JSON.parse(stableStringify(spans)), provenanceEvents: JSON.parse(stableStringify(events)),
  };
  const gaps = ['Recorded citations and source references are retained as provenance; their support and scientific or regulatory correctness have not been verified for this copy.'];
  if (literal) gaps.push('This is the literal stored representation of a chart, code, form, table or JSON source. No chart, form, table or clinical meaning was interpreted or validated.');
  const warnings = [
    'This is an independent unbound working draft. Source completion, approval and signatures are not transferred.',
    'Saving this copy does not change the registry artifact or its original version. Filing requires an explicit governed action.',
    'Recorded model names and original machine-use indicators do not establish model qualification or evidence support.',
    'Historical generation events are retained as disclosure. An event without an exact current content/version binding does not establish the model that produced today’s text.',
  ];
  if (!version) warnings.push('This is a current saved-text snapshot, not historical-version proof. Its exact current source is rechecked when creating or releasing this copy.');
  if (hashScheme === 'unrecorded') warnings.push('The source has no recorded content hash. This copy’s computed digest binds the text read now and does not establish prior integrity.');
  const fingerprint = sha(stableStringify({ source, scope, row, version, artifactSource, sections, sectionOrigins, gaps }));
  const origin: WorkflowImportOrigin = { kind: source.kind, id: source.artifactId, title: String(row.title), programId: input.target.programId,
    documentType: null, sectionCode: null, fingerprint, selection: source, version: String(source.version), conversion: 'artifact-snapshot',
    sourceScope: scope, association: { mode: 'recorded', reason: null }, sectionOrigins, artifactSource, gaps };
  return { origin, fingerprint, sections, gaps, warnings, association: { mode: 'recorded', required: false, reasonRequired: false,
    sourceProgramId: scope.programId, sourceProjectId: scope.projectId, targetProgramId: scope.programId } };
}
