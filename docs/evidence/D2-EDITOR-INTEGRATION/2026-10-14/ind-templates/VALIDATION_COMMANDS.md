# Reproduction commands

Run from the repository root with the repository's Node 22/toolchain. The
recorded session prepended `/workspace/scratch/editor-toolchain/node_modules/.bin`
to PATH; no package manifest or dependency was changed.

## Combined editor/template regression

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
  client/src/concept2cure/v2/__tests__/authoringCreateExport.test.tsx \
  client/src/concept2cure/v2/__tests__/conversationThreadCanvas.test.tsx \
  client/src/concept2cure/v2/__tests__/workflowEditorEntryPoints.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/anaInsertGate.test.ts \
  client/src/concept2cure/v2/editor/__tests__/anchorClickAndMarkerRoles.test.ts \
  client/src/concept2cure/v2/editor/__tests__/authoredHtml.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringAnAUI.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringConversationHandoff.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringConversationScope.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringConversationScopeLive.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringRemedies.test.ts \
  client/src/concept2cure/v2/editor/__tests__/captionsInCanvas.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/citationAdmission.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/citationRegistration.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/citations.test.ts \
  client/src/concept2cure/v2/editor/__tests__/citationsInCanvas.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/conversationAuthoringOrigin.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/crossReferences.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/dataRoomSourceReads.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/draftToDocument.test.ts \
  client/src/concept2cure/v2/editor/__tests__/editorBridgePropose.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/editorBridgeProposeGate.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/editorOversightNavigation.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/imageAuthorizationLifetime.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/indTemplateLoading.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/pasteAnaSuggestion.test.ts \
  client/src/concept2cure/v2/editor/__tests__/pasteFidelity.test.ts \
  client/src/concept2cure/v2/editor/__tests__/projectFilesRecovery.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/projectFilesViewer.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/projectSourceCatalog.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/projectVaultSearch.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/richSectionEditorOperable.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/roundTripFidelity.test.ts \
  client/src/concept2cure/v2/editor/__tests__/sourceImportDialog.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/sourceImportScope.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/structuralFidelity.test.ts \
  client/src/concept2cure/v2/editor/__tests__/suggestionsPropose.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/templateGuidance.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/vaultCitationConfirmation.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/workbenchCitationCatalog.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/workbenchRemedies.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/workflowImportReuse.test.ts \
  client/src/concept2cure/v2/editor/__tests__/workflowSourceImport.test.tsx \
  server/routes/__tests__/authoringTemplateStartFrom.test.ts \
  server/routes/__tests__/indTemplateEditor.pglite.integration.test.ts \
  server/services/ana/__tests__/document-template-description.test.ts \
  server/services/ana/__tests__/document-template-preparation.test.ts \
  server/services/ana/__tests__/ind-template-reference.test.ts \
  server/services/ana/__tests__/regulatory-knowledge-registration.test.ts \
  server/services/ana/__tests__/regulatory-knowledge-tools.test.ts \
  server/services/ana/__tests__/saved-document-critique.pglite.test.ts \
  server/services/ana/__tests__/saved-document-critique.test.ts \
  server/services/authoring/__tests__/ind-document-catalog.test.ts \
  server/services/authoring/__tests__/ind-template-outlines-m2-m3.test.ts \
  server/services/authoring/__tests__/ind-template-outlines-m4-m5.test.ts \
  server/services/authoring/__tests__/nonclinical-study-report-builder.test.ts \
  tests/regulatory/csr-e3-overlay.test.ts \
  tests/regulatory/template-library-truth.test.ts
```

## Compiler, build and warning delta

```
NODE_OPTIONS=--max-old-space-size=24576 npx tsc --noEmit
npm run build
node scripts/ci/check-eslint-warning-ratchet.mjs --since dd3637f4 --gate
```

Run the warning delta **after** TypeScript completes: its temporary old-file
snapshots can otherwise enter the compiler's glob. The final helper extraction
is also checked with the real HTTP and existing creation suites after the
combined run; its log records the exact final assertions. The first targeted
repeat hit only the listing test's 10-second timeout while compiler, build and
browser work ran concurrently; no content or authorization assertion failed.
The release repeat passed all 34 checks without build/compile contention. The
listing assertion now computes its expected-ID set once rather than rebuilding
the full 200-template projection for each reference; assertions and the tight
10-second timeout are unchanged. The combined-branch repeat covers that change.

## UI/canvas/source gates

```
npm run ci:design-system
npm run ci:token-contrast
npm run ci:token-cascade
npm run ci:check-css-selector-shadowing
npm run ci:check-phantom-tokens
npm run ci:surface-text-ramp
npm run ci:component-class-coverage
npm run ci:canvas-path
npm run ci:canvas-path:selftest
npm run ci:single-native-canvas
npm run ci:ana-surface-context
npm run ci:sql-interpolation
npm run ci:reg-reference-single-copy
npm run ci:check-editor-integrity
```

The class-coverage check reads the freshly built CSS. Browser reproduction and
its synthetic API boundary are documented in the browser evaluation bundle.
Normal commit and push hooks also run; no baseline or hook bypass is used.
