# AnA planning contract — full-file verification and publication

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `6c167eb4efc6a34a5baabf9918632bfd02387232`  
Plan: F1; completes `server/services/ana/bla-biologics-tool-defs.ts`.

## What already exists

| Existing owner | Responsibility and boundary |
| --- | --- |
| `shared/regulatory/document-taxonomy.ts` | Existing 11 ProductClass and 20 ApplicationFamily values; a vocabulary, not authorization or market eligibility. Unchanged. |
| `server/services/ana/bla-biologics-tool-defs.ts` | Existing model-visible `resolve_submission_plan` definition, imported into the one AnA registry. Its product/family enums were incomplete. |
| `server/services/ana/skills/library/submissions.ts` | Existing submission skill; its planning paragraph described regional candidates as equivalents. |
| `server/services/regulatory/submission-resolver.ts` | Existing shared resolver reports selected identity, compatible candidates and explicit support gaps. Unchanged. |
| `shared/regulatory/submission-type-bridge.ts` | Existing filing identity and curated alias authority. Unchanged. |
| `server/routes/biopharma/submissions.ts` | Existing HTTP planning boundary repaired by the preceding commit. Unchanged. |

This completes the previously supplied NOT_PUSHED repair bundle, not a new
planning service. GitHub writes are available in this session. The two complete
production files and complete canonical taxonomy were fetched/reconstituted,
and each original byte sequence was checked against its immutable Git blob
before applying the prepared patch. The current branch still matched the
reviewed baseline at preparation. The branch update uses an expected-head
check; this evidence file by itself is not proof that publication succeeded.

## Repair

The existing tool now exposes all 11 canonical product classes, restoring
medical_device, ivd, combination_product and otc; and all 20 application
families, restoring the 13 missing choices. Prior medicine choices remain.
The tool name, four argument names, optional-argument contract and eight-region
selector are unchanged. No new tools, services, routes, tables, UI, dependencies,
regulatory records or license rules are added.

The tool description and the one matching skill paragraph distinguish
compatible candidates from legal equivalents. They instruct AnA to preserve
recorded selections, disclose omitted-region defaults, retain unsupported,
portal-only and unconnected outcomes, and not treat catalog coverage as
readiness, entitlement, delivery acceptance, regulatory approval or authority
to sign/release/transmit. These are model instructions, not a new enforcement
gate or proof of live model compliance. The resolver and human-approval gates
are unchanged. Existing regional support limitations are not widened.

## Executed verification

The same Node contract suite was executed against the COMPLETE, hash-verified
original files and patched files, rather than the prior excerpt rehearsal:

| Version | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Original | 10 | 3 | 7 | 0 |
| Patched | 10 | 10 | 0 | 0 |

`before-full.tap` and `after-full.tap` contain raw results. `execution.json`
records every case, source identities, byte lengths and raw-result hashes.
The test extracts/evaluates the actual tool object using TypeScript's parser
and compares its choices with the actual canonical type unions. It checks
identity, defaults and skill/tool instructions. It does not call a model,
handler, project store or filing channel.

`verify-full-files.cjs` separately transpiled and evaluated both entire modules
before and after. All 24 other tool definitions and all eight specialist skills
were deeply identical; only the one planning tool and one planning-instruction
line changed. The skill-registration factory alone was an explicit identity
substitute. Both module pairs had no parse/transpile diagnostics. This is NOT
whole-repository semantic typechecking or full integration qualification.

## Reproduction

From the repository root with its existing TypeScript dependency installed:

```sh
node --test tests/services/regulatory/submission-plan-tool-schema.test.cjs
node docs/evidence/D2-PLATFORM/2026-11-04-ana-planning-contract/verify-full-files.cjs /path/to/baseline-snapshot .
```

The baseline snapshot needs the two original production files at the baseline
commit, not another development branch. For the contract's before run also
include the unchanged taxonomy and set `C2C_REPAIR_SOURCE_ROOT` to that snapshot.
`C2C_TS_PATH` may name an already installed TypeScript package; no dependency
was installed for this repair. The original suite intentionally fails seven
cases. Direct GitHub writes do not run local pre-push hooks.

## Still open

Full repository semantic typechecking, build, pre-push gates, native handler
integration, approved-provider schema acceptance, authenticated AnA chat,
project-settings/entitlement propagation and hosted deployment remain unverified.
The source enum change does not prove every caller reaches every pathway.
No clinical calculations, regulatory rules or existing specialist-skill content
were revalidated or changed by this scoped contract repair. Repository history
could not be cloned in the container (DNS unavailable); existing owners were
established through connected GitHub reads and earlier recorded searches.

Rollback is an ordinary revert of this scoped commit; no migration or backfill.
