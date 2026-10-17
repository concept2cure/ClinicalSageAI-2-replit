/** Retained work and its current canonical product path. This is disclosure,
 * not a new launch list, entitlement, API attribution or implementation claim. */
export interface DeferredCapability {
  surfaceId: string;
  decision: 'converge' | 'retain-deferred';
  canonicalSurfaces: readonly string[];
  implementedParts: string;
  completionNeeded: string;
  description: string;
}

export const DEFERRED_CAPABILITY_INVENTORY: readonly DeferredCapability[] = [
  { surfaceId: 'program-journey', decision: 'converge', canonicalSurfaces: ['project-home'],
    implementedParts: 'Journey canvas and seeded demonstration stages.', completionNeeded: 'Persist and advance journey stages for programs created through the product; qualify real gates and remove predictive outcome claims.',
    description: 'Deferred journey canvas. New program stages and qualified outcome forecasts are unfinished. Project home provides the current program workspace and recorded work.' },
  { surfaceId: 'filings-catalog', decision: 'converge', canonicalSurfaces: ['projects'],
    implementedParts: 'Filing-type discovery catalog.', completionNeeded: 'Carry the selected filing into canonical program creation rather than dropping the choice.',
    description: 'Deferred filing discovery catalog; its Start handoff does not retain the filing choice. Select the filing in the New project wizard.' },
  { surfaceId: 'authoring-engine', decision: 'converge', canonicalSurfaces: ['document-authoring'],
    implementedParts: 'Reference and architecture explainer.', completionNeeded: 'Converge authoring controls on the canonical editor; retire the duplicate explainer as an execution surface.',
    description: 'Deferred reference page about authoring. It does not edit, validate or export a document. The Authoring editor is the current document workflow.' },
  { surfaceId: 'regulatory-workspace', decision: 'converge', canonicalSurfaces: ['document-authoring'],
    implementedParts: 'Workspace tree and retained layout.', completionNeeded: 'Replace the static editor area and second-store reads with canonical authored records, or retire the duplicate workspace.',
    description: 'Deferred workspace layout; its editor area and record handoff are unfinished. Use the Authoring editor for saved document work.' },
  { surfaceId: 'template-library', decision: 'retain-deferred', canonicalSurfaces: ['document-authoring'],
    implementedParts: 'Saved-template CRUD, extraction/preview and retained library UI.', completionNeeded: 'Apply a saved template to canonical authored-document formatting and qualified export, preserving its source version.',
    description: 'Deferred saved-template library with extraction and preview. Applying a template to authored-document formatting and export is unfinished; document work remains in the Authoring editor.' },
  { surfaceId: 'ectd-coauthor', decision: 'converge', canonicalSurfaces: ['submission-center', 'document-authoring'],
    implementedParts: 'Retained eCTD tree and second-store section editor.', completionNeeded: 'Converge validation/compliance onto the canonical section and authoring records; qualify the full content-to-gate connection.',
    description: 'Deferred second-store eCTD editor; its content-to-validation connection is unfinished. Place filing copies in Submission Center and edit them in Authoring.' },
  { surfaceId: 'dossier-map', decision: 'converge', canonicalSurfaces: ['project-home', 'submission-center'],
    implementedParts: 'Dossier-map reader and overlays over its retained store.', completionNeeded: 'Populate or replace the map store from canonical program sections and qualify completeness for newly created programs.',
    description: 'Deferred dossier-map reader. New programs do not populate its map store. Project home and Submission Center expose the current program sections and filing structure.' },
  { surfaceId: 'ectd-publishing', decision: 'converge', canonicalSurfaces: ['ectd-compile', 'gateway-transmittals'],
    implementedParts: 'Publishing reference screen and existing specification/validation services.', completionNeeded: 'Connect a durable qualified publication operation, lifecycle state and exact delivery record; a reference screen is not publication.',
    description: 'Deferred publishing reference screen; it does not publish a package. Compile and export in the eCTD workspace, then use Gateway transmittals for recorded delivery.' },
  { surfaceId: 'orchestration', decision: 'converge', canonicalSurfaces: ['dispatch-readiness', 'tasks'],
    implementedParts: 'Persisted orchestration APIs and a retained project-based board.', completionNeeded: 'Resolve canonical program ownership and record identities before exposing board review, scan or advance outcomes.',
    description: 'Deferred orchestration board with unfinished program ownership handoffs. Dispatch readiness and Tasks provide the current filing gate and saved work.' },
  { surfaceId: 'inconsistency', decision: 'retain-deferred', canonicalSurfaces: ['document-authoring'],
    implementedParts: 'Retained analysis board and related governed-intelligence services.', completionNeeded: 'Bind scans to canonical program/documents, qualify propagation and re-approval effects, and prove saved audit/task outcomes.',
    description: 'Deferred inconsistency board; program binding and propagation outcomes need qualification. Use the Authoring editor for governed document changes.' },
  { surfaceId: 'qmp', decision: 'retain-deferred', canonicalSurfaces: ['quality'],
    implementedParts: 'Plan list/create/activate APIs and summary UI.', completionNeeded: 'Author plan gates and CTQ factors, consume them in the governed gate, and qualify their recorded decisions.',
    description: 'Deferred quality-management plans. Plan gates and CTQ factors cannot yet be authored or consumed through this workflow. Quality provides controlled documents, approvals and training of record.' },
  { surfaceId: 'ana-command', decision: 'converge', canonicalSurfaces: ['conversation-thread', 'insights', 'dispatch-readiness'],
    implementedParts: 'Enterprise portfolio commands and retained workflow controls.', completionNeeded: 'Qualify actual service effects and audit records for each command; converge on the current conversation, reports and filing gate.',
    description: 'Deferred command board; workflow effect and audit claims remain unqualified. Use AnA conversations, Reporting and Dispatch readiness for their current recorded workflows.' },
  { surfaceId: 'ana-memory', decision: 'converge', canonicalSurfaces: ['conversation-thread'],
    implementedParts: 'Memory browser over the retained MDX store.', completionNeeded: 'Read and govern the memory actually used by each AnA turn rather than an unwritten second store.',
    description: 'Deferred memory browser; it does not read the memory used by AnA conversations. Its empty list cannot establish what AnA remembers.' },
  { surfaceId: 'training', decision: 'converge', canonicalSurfaces: ['quality'],
    implementedParts: 'Retained training screen and discovery layout.', completionNeeded: 'Provide persisted lessons, paths and assessed certifications before exposure, or converge on QMS read-and-understood training.',
    description: 'Deferred training screen. Guided lessons, paths and certifications are unfinished. Quality provides the current read-and-understood training record.' },
] as const;

export function deferredSurfaceDescription(surfaceId: string): string {
  const entry = DEFERRED_CAPABILITY_INVENTORY.find(item => item.surfaceId === surfaceId);
  if (!entry) throw new Error(`No deferred capability inventory entry for ${surfaceId}`);
  return entry.description;
}
