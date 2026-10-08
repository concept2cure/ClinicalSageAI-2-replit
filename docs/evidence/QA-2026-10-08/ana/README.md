# QA 2026-10-08 — AnA conversation handling on a project (j5 cluster)

Findings file: `scratchpad/qa/findings/j5-ana-path.json` (walk on 5077, older code).
Reproduced on 5078 (current tree, michael.brown, Vorelinib) before any change.
Browser scripts: `browser/` (harness `h.mjs`; the password is read from `QA_PW`).

| Finding | Reproduced on 5078 | Product / stand-in | Fix | Red | Green |
|---|---|---|---|---|---|
| Send from project composer drops the conversation from view | yes (`browser/before-5078-vault-after-send.png`) | product | Drive strip offers "Back to conversation" while the shell's chat answers off the conversation; a reply that finishes off it leaves "AnA's reply is in the conversation" with its end, Back and Dismiss | `red/liveDriveBackToConversation.txt` (3 of 4) | `green/targeted.txt`; real browser on a 5088 instance of this tree: `browser/after-*.png` |
| Reload shows an empty "New conversation" | yes (`r2-reload.mjs`) | product | URL names the conversation (`/concept2cure/conversation-thread/<id>`, query kept); a fresh load opens it; New conversation drops the id | `red/conversationThreadUrl.txt` (5 of 6) | `green/targeted.txt` |
| Stop leaves no answer and no marker | yes (`r3-stop.mjs`: AnA turn "✻" only; DB user row only) | product | Transcript note "The run was stopped before AnA finished." (client `stopped` mapped to `cancelled`); server saves a stopped answer (possibly empty) in both the post-processing and error paths; reopened empty stopped answers are kept; empty answers are not sent to the model | `red/stop.txt` (12) | `green/targeted.txt` |
| Rail reply below the fold | no: the rail is not mounted (9ff77226c, slice 9); `AnaRail` deletion is queued in the D2 lane | n/a | none | — | — |
| Chip "read · 20 words" vs name-only turn | yes (`r5-attach.mjs`: chip "read · 22 words", `context_used` name_only) | product (copy); file text reaching the model stays behind `ANA_ENABLE_PDF_INTAKE`, the founder's switch | Chip says "text extracted · N words" (one shared helper) | `red/attachment-chip.txt` (6) | `green/targeted.txt` |
| + menu items send a sentence | no: only in the unmounted `AnaRail`; the conversation composer has no + menu | n/a | none | — | — |
| Draft requests get "Understood." | stand-in | stand-in: the saved requests (`scratchpad/qa/requests/0014.json`) offer `draft_authoring_document` and `draft_clinical_overview_m2_5` and the prompt says "Save through draft_authoring_document"; the stand-in plans only navigation/act/search | none (a "no document was saved" notice would be a new check; product decision) | — | — |
| Project conversation list shows newest 8 only | yes (code; michael has 4) | product | Reads 9 to know whether more exist; "Show older conversations" reads the next screenful (`offset`, stable `t.id` tie-break); a failed read says so | `red/conversation-list-paging.txt` (5) | `green/targeted.txt` |
| Vault banner shows column names | yes (`browser/before-5078-vault-after-send.png`) | product (copy) | Resolver detail rewritten: no schema names, says what still works and to ask the organization administrator to link the project | `red/vault-banner-copy.txt` (2) | `green/targeted.txt` |
| Save disabled / off-screen toolbar; approved section revise | — | authoring editor (`DocumentWorkbench.tsx`), which the canvas embeds | left to the authoring fixer | — | — |

Not verified in a browser after the fix: reload, Stop, chip, list paging, banner (unit and route tests only; the 5088 instance stopped before those runs).
Pre-existing, not touched: `server/routes/ana-ri/__tests__/stream-tool-carry-over.test.ts` "a step the person declined is not carried" fails at HEAD too.
