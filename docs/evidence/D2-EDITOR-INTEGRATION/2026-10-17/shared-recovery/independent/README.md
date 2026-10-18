# Independent specialist recovery interaction evidence

W1 / D2, 2026-10-17. Canonical `concept2cure-v2`, initial HEAD
`bfec9be6bedcdddf6fe01ff59caada558b702341`. This evaluation owns only
`client/src/concept2cure/v2/__tests__/specialistRecoveryInteraction.test.tsx`
and this evidence folder. It makes no production edits.

The test renders the actual Reporting, Biostatistics, statistical calculator,
PV, CMC change, CMC quality and CMC correspondence components. These are seven
rendered components across the six specialist surface modules; CMC change and
correspondence share `CmcModule.tsx`. The canonical writer/controller, actual
`authService` session events, shell-project channel and exact editor-target
channel run unchanged. Only the API transport and its returned data are
synthetic. There is no database, provider, real browser, human-review,
deployment or regulatory-readiness claim.

## Results

- `baseline-red.txt`: all three baseline cases fail on genuine duplicate
  document requests: overlapping Biostatistics Open and Attach, repeated
  Reporting Open after an unknown document receipt, and repeated Open after a
  lost section response. The verbatim initial executable test is retained as
  `baseline-spec.txt`; it predates the subsequent independent coverage.
- `first-green-candidate.txt`: 17 / 21 passed. Three failures were test
  interaction assumptions that pending controls kept their idle labels; the
  corrected test retains their actual DOM controls before starting the action.
  The fourth fixture omitted fresh saved section rows required by the expanded
  current-read reuse contract. Only test fixtures were corrected.
- `second-green-candidate.txt`: 21 / 21 passed.
- `final-interaction.txt`: expanded coverage, 26 / 26 passed.
- `lint-final.txt`: strict ESLint, zero errors and zero warnings. The earlier
  `lint.txt` records one `structuredClone` environment-global warning; the
  plain request record is now copied directly.

The final pinned run and exact source/receipt hashes are recorded in
`verification.json`. Receipt output is retained in this folder; any removal of
extra blank lines at EOF is explicitly recorded with both raw and stored
hashes. No assertion was weakened to make production code pass.

## Behavior exercised

1. Open and Attach admit one synchronous two-stage writer. An uncertain
   document or section write keeps all repeat creation blocked.
2. The six specialist modules expose recovery beside their actual source
   controls and retain their uncertain saves. Reading recovery never sends a
   document, section or correspondence mutation.
3. A known-parent check verifies scoped inventory, exact document and sections.
   Explicit continuation posts only the retained original section payload,
   even when the Reporting source result has since changed.
4. A normalized code collision preserves current text. A section introduced
   after Check is read again before continuation and prevents that write.
   Empty sections cannot establish a missing parent. An inspected empty
   document opens by exact ID/project without a fictional section target.
5. Unknown document inventory never guesses which document belongs to the
   interrupted request. Another document starts only on a later explicit
   creation action following a successful check.
6. Repeated complete actions verify the current saved document/section and
   reuse their exact receipt without creating another copy. A missing section
   or refused read keeps the attempt held and suppresses navigation.
7. Failed correspondence lifecycle PATCH leaves the saved draft inspectable.
   Its inspection does not retry PATCH. Section recovery checks and inspection
   do not advance the agency-question lifecycle.
8. Late checks after project A → B → A, account change, organization change or
   unmount cannot publish inventory or navigate. An older check or continuation
   finalizer cannot release a newer pending save in a different project.

## Reproduction and limits

Use the repository's Node 22 toolchain and installed dependencies:

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run client/src/concept2cure/v2/__tests__/specialistRecoveryInteraction.test.tsx
./node_modules/.bin/eslint client/src/concept2cure/v2/__tests__/specialistRecoveryInteraction.test.tsx --max-warnings 0
```

This is a component-owned, in-memory recovery mechanism. The proof does not
cover a remount, reload, another tab, durable backend idempotency or provider
behavior. A successful inventory read cannot prove an unknown write did not
commit or identify its author. New creation after that check is a deliberate
human choice. Current write permission remains a server decision.
