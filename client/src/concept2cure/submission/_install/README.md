# Submission Center — UI-kit install pipeline

This folder is the **drop-in pipeline** for the Submission Center UI. The backend,
data layer, and placeholders are wired now; when Claude Design ships a workspace
kit, installing it is a one-line swap.

## What's here
| File | Role |
|---|---|
| `Temporary.tsx` | Token-compliant placeholder shown until a workspace's kit lands. |
| `submissionClient.ts` | Typed fetch client over every endpoint (cookie-session auth). Returns `@shared/types/submission-api` shapes. Includes `generateSectionStream` for the authoring SSE. |
| `hooks.ts` | React Query hook per endpoint (`useSubmissions`, `useLeaves`, `usePlan`, `useRunShadowReview`, …) + `submissionKeys` for cache control. |
| `workspaces.tsx` | The seven workspace **slots** (spec §4). Each renders `Temporary` today and names the hooks its kit consumes. |

## Install a kit (the only steps)
1. Drop the kit component into the submission surface (e.g. `../surfaces/Builder.tsx`).
2. Inside it, consume the named hooks — e.g. `const { data: leaves } = useLeaves(seqId);` `const upsert = useUpsertLeaf(seqId);`. No fetch, no types to write — they come from `./hooks` and `@shared/types/submission-api`.
3. In `workspaces.tsx`, change that slot's `element` from `<Temporary …/>` to `<Builder …/>` and `status` to `'ready'`.

That's it. Routing/nav read `SUBMISSION_WORKSPACE_SLOTS`, so the kit appears with live data immediately.

## Contracts & constants (already shipped)
- Types: `@shared/types/submission-api` (request/response per endpoint).
- Enums/labels for dropdowns, badges, pills: `@shared/types/submission-constants`
  (`REGIONS`, `SEQUENCE_STATUSES`, `LIFECYCLE_OPS`, `FINDING_SEVERITIES`, … each a
  `Choice[]` with sentence-case label + neutral `tone`; map tone→palette in the kit).
- Workspace/route/error map: `@shared/types/submission-ui`.
- Endpoint → workspace manifest: `SUBMISSION_CENTER_API.md` (repo root).
- Feature gating: `submissionClient` + `GET /api/submissions/capabilities` (disable/empty a slot when its capability is false, e.g. `publishTransmit`).

## Design-system rules the kit must honor (CLAUDE.md / README)
Sentence case; no emoji/exclamations; body 13px; max title 18–24px; Claude orange
`#d97757` the only strong color, one focal point per screen; 200ms ease-out motion;
Lucide icons; second person; numbers over adjectives. Loading/empty/error states
mandatory. Tone hints from the constants map to palette tokens in
`colors_and_type.css` — never hard-code a hex in the kit.

## What is NOT decided here (left to Claude Design)
This pipeline does **not** invent the visual design, the hub layout, or the router
wiring for the seven routes — that is the design system's call. It only provides
the slots, the data, and the contracts so the kit installs without backend work.
The route patterns in `workspaces.tsx` follow spec §9.1 and can be re-pointed.
