# Scope the existing AnA section playbook to its US IND document

W1 / D2, local/Codespaces. Approved contract: the contextual expertise
follow-through in `docs/design/EDITOR_ANA_AMENDMENTS_2026-10-26.md`.

## What already exists

`lumen-context/sections.ts` owns the existing CTD/IND section playbooks. Both
canonical chat doors already prefetch the open document through
`ana-ri/open-document.ts`, which resolves a saved template before a surface
label and supplies `openDocumentRegistryId`. Their OPEN DOCUMENT brief and
template/read tools already supply the appropriate reference context.
`lumen-context-builder.ts` also calls the same section helper for the Cortex
convenience path, which has no verified open-document type.

The defect was code-only interpretation: an M11 protocol's section `3` received
the CTD Module 3 supplement, and Canadian/Japanese local section numbers could
receive FDA Module 1 material. The correction extends the same helper and its
three existing callers; it introduces no taxonomy, reader, tool or provider.
Missing or other document scope now returns null; exact canonical `US_IND`
retains the existing playbook. Both chat doors pass their prefetched registry;
the Cortex convenience call passes null. The OPEN DOCUMENT brief and canonical
regional/template readers are unchanged.

## Behavioral evidence

`RED.log.gz` records twenty-seven failures and eighty-six passing controls across
six suites, exit 1, with unchanged pinned inputs. Eighteen failures expose
inappropriate/default helper output, eight exercise missing scope arguments in
the actual chat builder and existing HTTP stream harness, and one exposes the
actual Cortex convenience prompt's code-only supplement. The export already
existed: these are behavioral failures, not missing-symbol failures.

`GREEN.log.gz` records all 113 tests passing, exit 0, with unchanged inputs.
The wrappers in the existing chat/stream fixtures delegate to the actual
section helper. They verify both the canonical scope argument and resulting
prompt inclusion/suppression. Existing regulatory fixtures retain every
assertion and now state their intended `US_IND` scope explicitly.

`INITIAL-GREEN.log.gz` retains a 112-pass/one-failure intermediate epoch. Its
sole failure came from the stream harness returning the same mutable
orchestration object every turn: a positive US IND case appended a prompt that
survived into the later null case. The local fixture now returns a fresh
shallow object per call, as the actual orchestrator does. No production scope
rule was weakened. All raw logs and exact snapshots for that epoch remain.

## Lint and integrity

Strict lint over all six changed test files exits 0 with zero warnings/errors.
The four production files have zero errors, and their existing warning counts
and every line-count/function-length/complexity metric remain identical to the
captured baseline: stream 25, chat context builder 5, lumen context builder 6,
section helper 0. Raw ESLint JSON, command receipts and
`lint-comparison.json` retain that comparison; no baseline was changed.

`red-inputs.json`, `green-initial-inputs.json` and `green-inputs.json` pin exact
source/test/configuration bytes with gzip snapshots. `final-inputs.json`
records agreement with the final GREEN epoch for root's publication union.
Every compressed snapshot is decompressed and checked against its phase hash.
`callers.txt` records the final repository search: all three production callers
pass explicit scope; the sole one-argument test intentionally verifies null.
`ARTIFACTS-SHA256.json` hashes every other artifact in this packet.

All model/network/database seams in these fixtures are local stand-ins. These
checks do not establish a live model's answer, human acceptance, scientific
completeness, agency acceptance or deployment. No compiler, build, global gate
or Git operation was run by this worker. Root owns post-merge combined checks
and publication.
