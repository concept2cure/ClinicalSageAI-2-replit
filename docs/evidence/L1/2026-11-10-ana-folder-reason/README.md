# L1 (D5) — a folder AnA makes records the person's reason, not her rationale (2026-11-10)

**Red on trunk:** `server/services/ana/__tests__/governed-reason-not-invented.test.ts`, 2 cases:

```
place_project_document document-placement-tools.ts:187: parsed.rationale is written here, not stated by the person
these tools carry a reason to a write but are proposed without the person's reason: [ 'place_project_document' ]
```

**Cause.** `7d918fe90e` (S6 step 4, 2026-11-10) let `place_project_document` make a folder first (`new_folder`)
through the Vault's governed writer (`vault-folders.ts createProgramFolder` → `vault.folder.create` audit row), and
passed AnA's own `rationale` as that row's `reason`. The tool was at the `confirm` tier, so the person's yes was
recorded against a reason for change the model wrote. The rule it broke is D5 (2026-09-29): a reason on a governed
write is the person's, typed or adopted at confirmation (21 CFR Part 11 §11.10(e)). A person making the same folder
in the Vault is asked for their reason.

## What already exists

- The stated-reason rule and its one reading: `server/services/ana/stated-reason-input.ts`
  (`REASON_REQUIRED_TOOLS`, `gatedReason`, `ReasonNotStatedError`).
- The tier a tool is confirmed at: `governed-tool-gate.ts registeredToolTier`; the pre-handler refusal
  `AnaToolExecutor.ts preHandlerRefusal` (rule 2a); the confirmation route `routes/ana-ri/utility.ts`, which
  replaces the model's proposed reason with what the person submitted (`persons-reason.ts`).
- The invariant test that caught this, and the tool's own suite `document-placement-tools.test.ts`.

Nothing was added beside these; the fix completes `stated-reason-input.ts` and the handler.

## The fix

- `stated-reason-input.ts`: `place_project_document` joins `REASON_REQUIRED_TOOLS`, with a per-call rule
  (`reasonRequiredFor(tool, input)`): the reason is required when the call makes a folder (`new_folder`), and
  only then. Suggesting an existing folder or unfiling writes no reason for change (AnA's rationale is her note on
  a suggestion a person confirms in the Vault), so those stay a plain yes.
- `registeredToolTier(name, input)`, `preHandlerRefusal` and the confirmation route read that one function, so the
  proposal card, the refusal and the route agree on the tier for the same call.
- `document-placement-tools.ts`: the folder's `reason` is `gatedReason(input)`, checked before any lookup or write.
  Without the person's reason nothing is read, made or placed; the registration wrapper answers by asking for it
  (`withCaughtErrors` now lets `ReasonNotStatedError` through instead of flattening it into a generic failure).
  AnA's rationale stays in her provenance on the same audit row.
- `document-catalog-tool-defs.ts`: the tool takes `reason` (`STATED_REASON_INPUT`), and `new_folder` no longer
  says "with your rationale as its reason".

## Tests

- Red before, green after: `governed-reason-not-invented.test.ts` (2 failing → 0).
- `document-placement-tools.test.ts`: the folder is made with the person's reason, not the rationale; a missing,
  empty, short or non-string reason makes no folder and places nothing (no lookup either); a suggestion and an
  unfile ask for none.
- `governed-tool-gate.test.ts`: `place_project_document` is `confirm` for a suggestion or unfile and `reason` for
  `new_folder`, including a malformed `new_folder`.
- Every suite naming the tool, the tier, the stated reason or `createProgramFolder`, excluding database suites:
  43 files, all pass.

## Not verified here

- Not walked in the running app: this container has no model key, so AnA cannot be driven to propose the call.
  The reason-tier card and the confirmation route are the ones every other reason-tier tool already uses.
- `tests/db/vault-placement.dbtest.ts` and `vault-filing-vocabulary.dbtest.ts` need a database and were not run.
