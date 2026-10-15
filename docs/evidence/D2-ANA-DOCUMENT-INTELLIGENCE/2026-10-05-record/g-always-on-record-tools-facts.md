# g-always-on-record-tools — facts relied on

**Regulatory facts: none.** This step changes which tools reach the model on a
turn. It adds no requirement, rule or regulator statement. The prompts in the new
test ("ISS", "2.7.4", "CSR", "quality overall summary", "investigator brochure",
"database lock") are user phrasings, not claims about regulator content.

## Code facts (checked in this checkout, 2026-10-05)

| Fact | Where |
|---|---|
| The persona orders AnA to call `plan_submission_from_database_lock` after lock, `get_document_section_requirements` before drafting or reviewing any section, and `list_fda_technical_rules` on acceptance and Elsa questions | `server/services/ana-ri/persona.ts:352`, `:354`, `:356`, `:365`, `:375` |
| The stream route selects with `selectToolsForTurn(governedTools, message, { pinned: [...selected_tools, ...invokedAppPins, ...SELF_DRIVE_TOOLS], … })` and the default cap of 50 | `server/routes/ana-ri/stream.ts:1691-1711` |
| With launch scope enforced, which is the production default, the governed pool is `withoutHiddenAppTools(getAllEnabledTools())` | `server/services/ana/governed-toolset.ts:75` |
| The tokenizer keeps only `[a-z0-9]{3,}`, so "2.7.4" yields no term. Scoring is by substring, so "iss" matches "submission" | `server/services/ana/tool-selection.ts` (`tokenize`, `scoreTool`) |
| The same `ALWAYS_ON_TOOLS` set applies to voice and deep investigations, which share the selector | `ana-realtime.ts`, `deep-investigation.ts`, `chat/send-message.ts` |

## Measured

- **Red** (`g-always-on-record-tools-red.txt`): 8 of the 9 natural prompts fail at HEAD in the production composition. Seven are the section-requirements prompts and one is "will my submission be rejected". "what do I do after database lock" already passed. All three tools are in the launch-scoped pool, which is asserted.
- **Green** (`g-always-on-record-tools-green.txt`): all of the following pass with the three tools always-on:
  - tool-selection-routing, including the 29 original cases, which are unchanged;
  - tool-selection, which has the maxTools 30 tight-cap cases;
  - self-drive-regressions, which has the SELF_DRIVE/ALWAYS_ON disjointness check;
  - turn-plan-and-context;
  - chat-path-parity.
