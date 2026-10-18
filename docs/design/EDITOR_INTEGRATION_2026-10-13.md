# Extend the existing document editor

Launch workstream W1, row D2 (Authoring, Projects and Vault), with D5 evidence
for attributed AnA remedies. This change extends the current editor; it creates
no replacement editor, authoring store, surface or model integration.

## Existing paths and observed gaps

DocumentAuthoring and DocumentCanvas both mount DocumentWorkbench, which mounts
RichSectionEditor. The project-files rail can read, cite and refer to files but
cannot create a working copy. Vault upload rows currently deep-link by section
title rather than the exact uploaded file. The IND pyramid has document
deliverables without an editor handoff. AnA can read the saved authoring store
and the project Vault, but the existing version-checked replacement bridge has
no production caller.

## Contracts

- Pull a source through a project-scoped, governed server endpoint, reusing
  verified Vault/data-room reads and the existing DOCX parser or deterministic
  text extraction. Create the working copy through createDocumentFromDraft in
  the existing authoring store. Return the exact document id and import
  warnings. Preserve original bytes and source checksum; do not imply a text
  extraction preserves PDF or spreadsheet layout. Refuse empty, unavailable,
  foreign-project and unsupported inputs. No document-type whitelist.
- A shared client pull dialog is used by the existing project-files rail and
  source entry points. It states the conversion limits and obtains the reason
  for creating a working copy. Navigation happens only after a confirmed save
  and carries the returned authoring document id. Keep the unsaved-work guard.
- AnA oversight actions read the saved document and linked project evidence
  through existing tools, follow paging, name unread/missing evidence, and
  distinguish suggestions from accepted facts. The context names the saved
  section version, linked sections and available source identities.
- Targeted remedies are explicit anchored proposals, carrying section identity,
  original quote, replacement and saved base version. The existing governed
  replacement door checks model qualification, section, seal, version and quote;
  application is an attributed tracked suggestion, not a silent save or approval.
- IND deliverables are derived from the canonical pyramid definition, including
  all phases. Open or draft work in the same editor; do not create a parallel
  document-type catalogue or imply all deliverables are authored or complete.

## Ownership and validation

Control tower owns source UI, source entry points and integration. The source
session owns import server service/router and source boundary tests. The AnA
session owns oversight/context and remedy UI with tests. Sessions do not edit
each other's files without coordination. Stay on concept2cure-v2.

Evidence goes under docs/evidence/D2-EDITOR-INTEGRATION/2026-10-13/. Validate
foreign-project and unavailable-source refusals, conversion warnings, exact-id
handoffs, tracked remedy refusal/application, and the existing single-editor
CI contracts. No claim of a live model or staging qualification without a run.
