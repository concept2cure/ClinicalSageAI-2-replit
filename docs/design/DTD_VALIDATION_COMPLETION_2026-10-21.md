# Complete existing package DTD validation through eCTD Compile

W5/D7, MR-10 Stage 3 integration. Starting source: `cb4065898`.
Root owns the contract and canonical publication. Initial investigation is
read-only; implementation interfaces are approved below before code changes.

## What already exists

- `server/services/ectd/xml-validator.ts`: the real `xmllint --nonet` engine,
  capability probe and DTD/well-formedness/XSD results. Reuse this engine.
- `server/services/ectd/qualification/qualify.ts`: `validateBackboneFile`,
  package-relative DOCTYPE resolution and qualification reports. Today this
  checks index/regional XML in the qualification path, not normal packaging;
  the STF loop is missing. Extract/reach this canonical logic, do not duplicate.
- `server/services/ectd/dtd-bundler.ts`: existing supportive-file discovery,
  regional requirements, self-containment and the existing `ECTD_REQUIRE_DTD`
  enforcement posture. STF requirements are not yet included.
- `server/services/ectd/checksum-manifest.ts`: existing SHA-256 integrity checks;
  qualification uses them, normal packaging does not expose validation proof.
- `server/services/submission-gateways/regional-packager.ts` and `types.ts`:
  existing ZIP builder, optional unzipped output, DTD/style copies and dtdStatus.
  No actual per-file DTD result is carried on the normal bundle.
- `server/services/ectd/regional-backbone-readiness.ts` and
  `server/services/submission-gateways/pre-transmit-check.ts`: existing regional
  status and transmit gates. A new validator/gate/store must not be added beside
  them. Presence and actual validation are separate facts.
- `server/routes/ectd-compile.ts`: the existing compile/write/history path,
  bundle projection and self-containment submission blocker. Extend it.
- `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`: existing compiled viewer,
  status/blockers and validation results; surface actual per-file results here.
- `client/src/concept2cure/v2/shellProject.ts`: existing project revision and
  `captureShellProjectGuard` track UUID visits, but numeric/code identifiers
  accepted by the compiler collapse to null. Complete this same guard for
  those identifiers; do not change the UUID-only creation/routing helper.
- `Dockerfile.optimized`: already installs `libxml2-utils`; no production npm
  dependency is needed. The current executor has no xmllint binary yet.
- `assets/ectd-dtd/{README.md,checksums.txt,fixtures/*}` and
  `docs/runbooks/ectd-dtd-vendoring.md`: existing drop point, placeholders,
  structural fixtures and the separate agency acquisition procedure. Actual
  agency DTDs/stylesheets have not been vendored. This increment does not
  acquire them or claim agency conformance from synthetic test schemas.

Searched DTD, XML validator, backbone, conformance, checksum, package identity,
STF and readiness names across services, routes, UI, schema/migrations and AnA.
Deleted-history searches for `*dtd*`, `*DTD*`, `*Dtd*`, `*xml-validator*` and
`*backbone*valid*` found only unrelated gstack deletion `7df89f4f7`.
The prior study placement/editor work is complete and remains unchanged.

## Contract boundary

Finish the existing validation path and expose its evidence through the existing
UI. Preserve the current enforcement flag posture; MR-10 Stage 11 owns making
submission-grade flags mandatory. Missing schemas, absent xmllint, malformed or
invalid XML and missing validation evidence must never become a passed DTD check
or a conformant regional backbone. Historical bundles are unverified when proof
is absent. No additional writer, package store, viewer, schema corpus or runtime
validator is introduced. Production refusal uses the existing gate when required.

Agency acquisition remains a separate existing prerequisite: the vendoring
runbook requires per-DTD counsel sign-off before acquisition. No sign-off is
invented, and no agency artifact is downloaded or committed in this increment.
Tests may use explicitly synthetic schemas in temporary directories to prove
execution, invalid XML, missing tools/dependencies and integrity failures.

## Ownership and verification

Root initially coordinates two read-only traces: canonical validator/packager
integration, and compile/UI projection. Implementation file scopes and exact
interfaces are recorded here after those traces. Workers do not commit/push.
Failing-first regressions, existing affected suites, actual xmllint execution
with synthetic fixtures, Chromium, production build and normal compiler/push
gates are required. Human witnessing and agency acceptance remain unexecuted.

## Approved implementation interfaces

- Extract the existing DOCTYPE resolver and `validateBackboneFile` into
  `server/services/ectd/backbone-validation.ts`. Qualification re-exports its
  public names and uses this implementation, including every generated STF.
  Preserve `reports` and `dtdSkipped`; add `relPath`, `wellFormed`,
  `doctype: { valid, errors }`, and `dtd: XmlLintResult`. An unexecuted DTD
  result always has `ran:false`, `valid:false` and an explicit reason.
- Extend the existing checksum implementation with
  `verifyChecksumBuffers(files, manifestText, extensions?)`, where `files` is
  an array of `{ fileName:string, content:Buffer }`; the filesystem wrapper
  delegates to the same logic. Verify the captured bytes used in the ZIP.
- A type-only shared DTO at `shared/regulatory/ectd-dtd-validation.ts` defines
  `DtdValidationEvidence`: `version:1`, `expectedFiles:string[]`,
  `files:Array<{relPath,wellFormed,doctype,dtd}>`,
  `integrity:{verified,mismatched,missingFiles,unlistedFiles,ok}`, and
  `passed:boolean`. XML results preserve `ran`, `valid`, `errors`, `mode`.
  Extend the existing `dtdStatus` with optional `validation`; retain all
  existing members. Missing/empty evidence is unverified, never passed.
- Packaging owns exact expected-file coverage (index, regional, every STF),
  private temporary materialization of captured ZIP bytes, cleanup, relative
  diagnostics, required STF DTD/path, and aggregate truth. Passing requires
  self-containment, verified required supportive bytes and every expected
  file actually passing well-formedness, DOCTYPE and DTD validation.
  Do not certify external, escaped or symlinked XML/DTD dependencies.
- Extend existing regional classification and pre-transmit checks to consume
  this proof. Required production fails closed on absent or failed proof;
  report-only flags remain report-only. No flag default is changed.
- Compile projects full `dtdStatus` and existing regional status into its
  package. Persist one typed `package_dtd_validation` finding in the existing
  `validation_results` JSON with `{packageSha256,dtdStatus}` evidence, along
  with actionable per-file findings. History selects this existing column
  and projects that evidence. No new table, package store or agency-report
  record is introduced. Historical absence remains unverified.
- Extend the existing package/history rendering in `EctdCompile.tsx` and
  preserve its actor/project/request ownership. Status remains live content
  readiness and does not fabricate a package validation execution.

Validator worker owns extracted validator, qualification, checksum and tests.
Packaging worker owns shared DTO, bundler, STF path, packager, bundle types,
assembly wrapper, existing regional/transmit gates and tests. UI worker owns
compile route, existing UI and their tests. Root owns contract review,
independent adversarial review, browser/build evidence and canonical release.
Root also owns the narrow existing shell-project guard correction and its
existing tests. The additional identifier search and deleted-history search
for shellProject found the live canonical guard and no deleted predecessor.

The dependency check is a conservative containment check around the existing
xmllint engine, not a replacement grammar parser. Unsupported encodings or
entity constructions whose external resources cannot be proven to come from
the captured package are refused as unverified. Actual agency schemas must be
qualified after their separate acquisition; synthetic grammar tests do not
establish compatibility with that corpus.
