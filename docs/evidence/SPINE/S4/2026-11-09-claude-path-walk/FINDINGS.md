# What the 2026-11-09 sweep confirmed, and where each finding stands on 2026-11-12

On demo day, readers swept five parts of AnA's Claude path (tiers, models, tools, the two walkthroughs, the client).
Each finding was then checked by a second reader told to refute it. Sixteen survived, two were refuted, two were
wording only. Several describe the same defect from different sides, so they are grouped here by cause.

"Open" was checked against the code on trunk `a9b5af1873` on 2026-11-12, by reading. Nothing below was measured
against a real provider.

## Fixed

| Finding | Fix |
|---|---|
| An email address or a phone-shaped number anywhere in a turn, a tool result or the history refused every Claude call for the rest of the conversation | `c5926d7d8b`: the tier wall judges the copy that is sent, after the PII pass |
| Reading a CONFIDENTIAL Vault or Data Room document ended the turn with "blocked by AI gateway policy". "Review with AnA" in the editor hit this, because its instruction tells AnA to open the project's files | `45dbe6a695`, `63ed463af6`: `read_project_document` refuses at the read and says why |
| "Start" or "Create" a document went to the model that may not draft; the person confirmed, then was refused | `367bdf0d21` |

A consequence of the second fix, recorded by the session that repaired its test fixtures (`33ba1f3ecd`): an upload is
stored CONFIDENTIAL (`server/services/vault/vault-ingest.service.ts`), which is Tier 2. So AnA on an outside provider
refuses to read an uploaded document until a person reclassifies it. That is the rule working as written. Whether it
is the rule the founder wants is question 2 below.

## Fixed on 2026-11-12, each with a test that failed first

| Finding | Fix |
|---|---|
| A drafting request worded with a document's everyday name went to the model that may not draft: CSR, IB, brochure, SAP, synopsis, QOS, DSUR, CER. So did "revise" and "insert" | `governed-write-tools.ts` `GOVERNED_DRAFT_REQUEST`. Nine new cases red, then green. "update", "save" and "file" are left out on purpose: they are as often a question ("any update on the report?") as a write, and a write they miss still meets the gate |
| On a turn served by a model that may not draft, AnA asked the person to confirm the write and refused it after their yes | The model gate now answers before the question is put (`stream.ts` approval pass, reading `governedWriteModelRefusal`, the same rule the tool gate reads). The step says: "… did not run: the model that answered this turn is not approved for regulatory drafting. Ask again with Thorough effort." New case in `stream-turn-timeline.test.ts` (7b), red against the old route. Seven suites scripted a governed save from a placeholder model and expected the question; they now serve an approved model, which is what their subject needs |
| `draft_nonclinical_overview_m2_4` and `draft_nonclinical_summaries_m2_6` recorded the run at Tier 3 before checking that any study exists, so with no studies AnA could not even say so | An empty eligible set is recorded at the conversation's tier; the absence is still pinned by the recheck (`module2-nonclinical-inputs.ts`). Assertion added to the empty-set case, red then green |
| `run_agent`'s description told AnA that every child call is "T3/local-only" | Says what is true since 2026-11-09 (`agentic-workflow-tools.ts`). `docs/ana-capability-manifest.json` still carries the old sentence: it is generated, belongs to no plan package, and is already out of date for other tools, so it was not regenerated here |

Run on 2026-11-12, with the change: every suite under `server/routes/ana-ri/__tests__` plus the gate, rule-zero and
step suites, 66 files and 811 tests. 809 passed; the 2 that failed were in `stream-declined-not-a-failure.test.ts`,
which still served the placeholder model, and pass since it serves an approved one (rerun with `runs-read`, 26 of
26). The whole set was not run a second time. Also green: the self-drive, model-linkage, founder-path, nonclinical
and sub-agent-toolset suites, 8 files and 246 tests.

## Open, narrow, in files this lane may change

| # | Finding | Where |
|---|---|---|
| 1 | When a refusal arrives after AnA has written anything, the person reads "Review the partial text before asking AnA to try again." The server's own sentence is shown nowhere. The same file drops the server's sentence for a refusal before the stream opens (see "Refuted as demo risks") | `client/src/concept2cure/components/ana/useAnaChat.ts` `partialReplyRecoveryText`, `streamRefusalText` |
| 2 | The drafting council reads its statistician's and critic's JSON strictly. A reply wrapped in a code fence fails the council on all three attempts | `server/services/multi-agent-council.ts` |

## Open, and a founder decision

| # | Finding | The question |
|---|---|---|
| 1 | **A personal rule saved in "What AnA remembers" makes every later AnA turn for that person fail**, in any conversation. A private rule is owner-private, which is Tier 3, and it rides on every turn | May a person's own rule be sent to the outside model that serves their turn? If not, the turn should leave the rule out and say so, not fail |
| 2 | An uploaded document is CONFIDENTIAL until a person reclassifies it, so AnA on Claude will not read it | Should an upload be classified by its content at ingest, or stay CONFIDENTIAL by default? |
| 3 | `read_vault_document` records every artifact at Tier 3, including drafts AnA wrote in the same conversation. A sub-agent's read raises the parent's tier too, so one research agent can end the parent's turn | What tier is AnA's own draft? Until decided, this read can at least refuse at the read, as `read_project_document` now does |
| 4 | The conversation's history and what AnA remembers reach Claude unclassified since the Tier 1 decision | Promised on 2026-11-09: revisit after the demo |

## Open, another lane's

| Finding | Lane |
|---|---|
| A CSR build labels every heading that contains one "[DATA TO BE INSERTED]" as "Template · data missing", and says the build kept its template text, which is false for text AnA wrote | CSR lane (`csr-builder.ts` is held) |
| A CSR build drafts about 115 headings one at a time. Its duration with a real key was not measured | CSR lane |
| The biotech and device walkthrough scripts, and one footnote on the dispatch readiness screen, say no AI provider is configured | Whoever next edits `docs/demo/**` |

## Refuted as demo risks

- "A seeded demo document can be read once reclassified": the refusal on a CONFIDENTIAL read is real, intended and
  pinned by a test (`model-call-scope.test.ts`, "a turn that read a CONFIDENTIAL or RESTRICTED source is still refused
  on a frontier provider"). The finding's one new claim, that the seeded Lumen project's INTERNAL documents can be
  read, was false.
- "A refusal before the stream opens drops the server's sentence": refuted only as a demo risk, because the seeded
  data and the normal intake path do not produce these refusals. The client defect is real and open:
  `useAnaChat.ts` reads the refusal's code and not its message, and `streamRefusalText` has no branch for the
  project-admission codes, so a 403 reads "Sign in again…" and the rest read a generic "Try again". It belongs with
  open item 1 above.
