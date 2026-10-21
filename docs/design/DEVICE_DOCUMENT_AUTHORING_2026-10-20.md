# Reach device and diagnostics document authoring

W1 / D2, canonical `concept2cure-v2`. The founder requests device and diagnostics
work from project initialization through drafting, review and submission for the
US, Canada, Europe and Japan. This increment completes existing authoring
connections and corrects regional scope; it does not qualify a gateway.

## What already exists

- `shared/regulatory/global-document-registry.ts` records device, IVD, software,
  CDx and lifecycle documents. `shared/regulatory/project-bootstrap.ts` supplies
  heading scaffolds; several reused spines incorrectly imply FDA equivalence or
  EU MDR requirements for other filings. No new filing registry is needed.
- `server/services/market-specs/document-template-library.ts` resolves exact
  existing registry outlines and component records. Coverage currently selects
  only pharma. Its output is an authoring scaffold, not an agency schema.
- `server/services/authoring/builtin-authoring-templates.ts` projects existing
  outlines into stable UUIDs, section guidance and recorded filing context.
  Its regional selector excludes devices/IVDs and its component selector excludes
  device-only records. `server/routes/authoring.router.ts` already lists, loads
  and saves these projections into the sole document editor.
- `server/services/ana/{document-template-tool,builtin-template-reference,
  AnaDocumentDraftingService}.ts` and `market-specs/document-preparation.ts`
  already serve inquiry, reference and drafting. Pharma-only guards keep device
  outlines from the same preparation path. Saved template oversight already
  reads recorded UUID/version/hash/context; no second reviewer is needed.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` and
  `server/routes/c2c/projects.ts` initialize projects and governed documents.
  `shared/regulatory/device-class.ts` and `programme-profile-write.ts` already
  define/persist EU MDR and IVDR classes, but the wizard currently renders FDA
  classes for every device family. The modern dossier comes from
  `c2c_rule_packs`, not the shared heading scaffold.
- `server/services/c2c/{document-class,scaffold-project-documents}.ts` and
  `shared/regulatory/filing-document-classes.ts` govern class/pack identity.
  Generic device/ivd is deliberately not a pathway. Canada/Japan project
  creation cannot be enabled just by changing a heading template.
- Submission Center, `device-assembly/assemble-device-submission.ts`,
  `submittabilityCoverage.ts`, `health-canada-gateway.ts`, `pmda-gateway.ts`
  and `transport-refusals.ts` already distinguish preparation from transmission.
  EU device files use the applicable notified body/national authority. Canada
  and Japan gateways refuse transmission; FDA transport lacks agency proof D7.

The seven device/IVD-only `cross_cutting` QMS records are already indexed in
`global-document-registry.ts` and `project-bootstrap.ts`: quality manual, design
controls/DHF, DMR, DHR, MDSAP, QMSR and ISO 13485. Existing template coverage and
the built-in picker exclude their segment. Their exact blueprints reuse generic
QMS headings and legacy QSR citations. Reach these same records as manual
preparation worksheets after correcting only their exact blueprint mappings to
record-specific, explicitly limited platform groups. Keep the generic QMS source
and the earlier medicinal snapshots intact; preserve original signed production,
certification and independent audit records. The existing registry classification
predicate in document preparation is shared rather than duplicated.

Searches covered device/diagnostic/IVD/CDx/SaMD, FDA/PMDA/Health Canada/MDR/IVDR,
project creation, templates, routes, services, shared taxonomy, AnA and migrations.
`git log --all --diff-filter=D` over the same names found retired device/template
paths, including the explicit canonical-510(k) convergence. None warrants a
second editor, bootstrap, registry, drafting service or submission channel.

## Contract

1. Reach every active medical_devices/diagnostics_ivd registry entry in the
   existing US/CA/EU/JP/GLOBAL built-in template projection and exact UUID lookup,
   including the seven device/IVD-only cross-cutting QMS records.
   Preserve existing medicinal/IND identities and snapshots. Reuse all existing
   device component records, with correct region/body context. Keep original
   forms and non-narrative artefacts as preparation worksheets; no unsupported
   AI eligibility or readiness is inferred.
2. Reach the missing Japanese Class I notification (Todokede) as its own
   registry identity and limited preparation outline; preserve the existing
   certification ID while correcting Ninsho/body metadata. PMDA official route
   text was retrieved separately; that does not verify a complete agency template.
   Correct known mis-scoped device outlines in their canonical source before
   exposing them: PMA/De Novo/HDE do not require 510(k) equivalence, Canadian and
   Japanese applications do not cite MDR Annexes as their own requirements, and
   IVDR guidance cites IVDR. These are explicitly limited platform authoring
   groups with cited reference locations, not independently verified agency
   templates. Required flags never decide sponsor applicability.
3. Extend the existing preparation/reference path to devices and IVDs. Questions
   cover intended use, device/version identity, classification facts, analytical
   and clinical evidence, risk, software/cybersecurity, manufacturing, local
   representatives/language and review ownership as applicable. Refuse incompatible component/filing preparation even within one market. Never
   substitute medicinal PK/PD questions for device evidence. Discussed markers are not proof.
4. Reach existing EU MDR/IVDR classification vocabulary and persistence from
   project setup. FDA product-code/predicate controls apply only to FDA filings.
   Unstated facts stay null; invalid/conflicting facts, including class-specific
   filing contradictions, are refused through one shared UI/server projection. Generic
   Canada/Japan device/ivd project classes remain unoffered until exact governed
   regional packs and transactional creation are qualified.
5. Correct existing submission-channel fallbacks after recipient metadata fixes:
   EU device national-authority/reference-laboratory files and Japanese
   registered-body files must not inherit a medicines gateway. Preserve existing
   medicines DCP routing through CESP and all transport refusals. Market-offer copy
   states unproven transmission in plain language, with technical diagnostics
   retained in structured detail. Existing channel/market-support names were
   searched in code and deleted history; no deleted competing implementation was
   found.
6. Reuse current controls, styles, template picker, editor target and saved
   review. No CSS, dependency, parallel surface, editor, provider or transport.
   No actual agency submission is authorized by this development/test task.

## Qualification and remaining scope

Record meaningful pre-fix failures, focused green runs, exact source pins,
compiler/build/lint/gates and representative editor integration. Cover exact
regional source/context, original-format restrictions, medicinal compatibility,
manual editing and AnA reference/oversight. Persist evidence in
`docs/evidence/D2-DEVICE-DOCUMENT-COVERAGE/2026-10-20/`.

This increment is not a claim that every current agency template or legal
requirement has been independently verified. A complete submission journey
still needs exact regional governed project packs where absent, class-conditional
requirements, original agency forms/technical files, expert acceptance and
qualified agency transports. EMEA is not one regulator; this increment addresses
recorded EU workflows, not every Middle Eastern or African jurisdiction.
