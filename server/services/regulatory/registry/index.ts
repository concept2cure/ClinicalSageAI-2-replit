/**
 * Registry — Barrel export for the server-side registry service layer.
 *
 * @module server/services/regulatory/registry
 */

export * from './globalDocumentRegistryService.js';
export * from './legacySubmissionTypeMapper.js';
export * from './registrySearch.js';
/* `registryValidation` is NOT re-exported. Every one of its exports is
   uncalled, and this barrel is itself imported by nothing — so re-exporting it
   made a dead module look like part of the registry's public surface.
   It is kept rather than deleted because one residual is real and worth fixing
   rather than losing: `registryId` is accepted as any string up to 50 chars
   with no existence check, and an unresolvable type silently falls back to a
   full US IND tree. Two of the original claims against it do NOT hold — section
   codes always come from canonical data, and the submission structure is
   registry-derived — so this is a narrower defect than it first read as.
   Re-export it when something calls it. */
// export * from './registryValidation.js';
export * from './registryCoverage.js';
