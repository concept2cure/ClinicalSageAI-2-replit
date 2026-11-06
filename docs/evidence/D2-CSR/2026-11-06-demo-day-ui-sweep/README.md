# Demo-day UI sweep: every screen, as the three demo people, on today's trunk (2026-11-06)

Launch row D2, ledger package L1. The founder asked: "make sure everything from the UI will work today". This is a
read-only sweep of the running app at `325e1177c`. It ran on the Lumen demonstration pack, on the database of
`../2026-11-05-lmn201-demo-rehearsal/`.

The server ran as the founder's Codespace runs it (`.devcontainer/post-start.sh`): `NODE_ENV=development`, launch
scope unset (off) and RLS enforced. It had a placeholder `ANTHROPIC_API_KEY`, so every AI path runs up to the provider
and stops there with the provider's refusal. No model output was produced or claimed.

## What already exists (RULE 3)

Nothing was built for this. The sweep drives the product's own screens:
- the rail;
- the project's six steps;
- each surface's tabs;
- the protocol workspace;
- the one editor with its panels and its AnA menu;
- Search;
- the account menu's pages.

The scripts are Playwright walks kept in the session's scratchpad, like the rehearsal's.

## What was walked

| Who | Stops | Result |
|---|---|---|
| Author (demo@) | 75: LMN-201's home and six steps; the ten rail destinations and every tab on each (Vault 5, Submission Center 8, CMC 4, RBM 10, Quality 8, Reporting 5); the protocol workspace and its 16 tabs | No page error and no unexpected refused request. Only the expected CMC refusal below and two honest notes. |
| Reviewer (rhea.reviewer@) | 74, the same | Same as the author |
| Approver (ava.approver@) | 74, the same | Same as the author |
| Author | The CSR in the editor: Document view, and Sources, Project files, Versions, Exports, Review tasks, Signatures, Audit trail, Access | Clean |
| Author | Search; the account menu: Account, What AnA remembers, Admin, Subscription & features, Access requests, Usage & limits, Subscription & billing, Get help | Clean |
| Author | LMN-401, LMN-301 and LMN-801, each home and its six steps; LMN-201's links to Study & Protocol Design, Biostatistics, Risk-based monitoring, its reports, its IND filing and Project settings | Clean |

## The AI paths, up to the model

Each sent a valid request to Anthropic, which refused the placeholder key. None was refused before sending as "model
not approved".

| Path | What the page said |
|---|---|
| The project's composer: "Draft the clinical study report … show it to me in the canvas" | "The AI provider (Anthropic) refused this deployment's API key …" |
| Build from the study's data → Build CSR draft (`POST /api/csr/jobs`, 202) | 94 provider calls, each refused for the key; the build stopped at "failed · 26%" |
| The editor's AnA menu → Draft with AnA | It opens the conversation docked beside the editor, with "Draft 1 Title Page from the linked section evidence." pre-filled. Sent: the provider's refusal, and "Insert into 1 as tracked suggestion" held because the answer did not finish (`01-…`) |

With no Anthropic key and an OpenAI key only, the same composer answered "No model approved for regulatory drafting
and review is configured on this deployment …". `/readyz` then said `no_high_risk_model`, "AI provider(s) enabled:
openai". That is what the founder saw in the Codespace. The Codespace session fixed its start script to restart an
app that lacks a key it now has (`11b191038`).

## Found

| # | What | Where | Status |
|---|---|---|---|
| U-1 | The docked conversation's composer foot overflows its column at 1440. "AnA drives: on" starts at 260 px, left of the column's 264. "Engine: Balanced" ends at 667, right of its 663. "Between steps" squeezes into a stack 179 px tall (`02-…`). `.ct-comp-foot` is a centred flex row that does not wrap. | `styles/app-v2.css:2944` | Sent to the design lead (`011Dpx…`) with the fix, `flex-wrap:wrap;row-gap:6px`. Injected into the running page, everything fits inside 288–639 in two rows, 111 px tall (`03-…`). `app-v2.css` takes one holder at a time, so it was not edited here. |
| U-2 | On a biologic, CMC's "Run ICH compliance check" and "Generate control strategy" stay enabled although the tab already says Module 3 is not composed for this project. A click shows the server's sentence in a red notice (`04-…`). Honest, and a disabled control with the reason would be calmer. | `surfaces/CmcQuality.tsx` | Noted. Not changed on demo day. |
| U-3 | "Run contradiction sweep" on a biologic answers 200, while every other Module 3 route refuses with `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`. The page still shows the refusal banner. | `/api/cmc/module3-os/contradictions/:id` | Noted for the CMC lane |

## For the demo

- **CMC Module 3 cannot be shown on the Lumen pack.** All four Lumen projects record a biologic. Module 3 is composed
  only for a small-molecule drug under a US IND (decision P-28), and each Module 3 tab says so in those words.
- **Search finds places, project steps and conversations, not documents.** That is by design (`cmdkPlaces.test.tsx`).
  Open the CSR from the project's Author step, or from the editor's document finder (`05-…`).
- **Before the demo, in the Codespace:**
  - stop and start it after adding the keys;
  - read the start log's "AnA in the running app:" line;
  - ask AnA one short question in the project.

  An answer, rather than "No model approved…", means drafting works. Add `OPENAI_API_KEY` as well: Vault, knowledge
  base and memory search embed with it.
