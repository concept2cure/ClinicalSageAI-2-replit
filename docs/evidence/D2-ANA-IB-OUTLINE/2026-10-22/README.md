# D2 — a new IB project is numbered like the canonical IB outline

Row **D2**. This is the fourth slice of the IB outline work. Earlier slices: `../2026-10-15/`. The remap decision was delegated by the founder on 2026-10-21.

## What already exists

- **The canonical outline:** `server/services/market-specs/document-template-library.ts` `investigators_brochure`, with front matter and sub-sections in `ib-outline-detail.ts`. The body is numbered 1–6.
- **The Projects blueprint:** `shared/regulatory/project-bootstrap.ts` `IB_SECTIONS`, reached through the registry default `ich_ib_sections` for `ICH_IB`. It seeds `project_sections` rows. It numbered the IB 1–9, with the front matter as 1–3, so a project's section "4" was the Summary, while the library, the IB builder, the Authoring seed and AnA's open-document brief all use "4" for Nonclinical Studies.

## Decision

- **New projects** take the canonical body codes 1–6, and the front matter becomes 0.1–0.3. The front matter sorts first because the project sections list orders by `section_code` as text.
- **Existing projects are not renumbered.** `section_code` is stored by value in `section_dependencies`, in history and in the authoring, chat-proposal and rendered-leaf tables. A remap would have to rewrite every one of those consistently, and any row it missed would detach from its section. That fails the condition the decision was made under.

## Red → green

- **Red:** `tests/regulatory/ib-one-outline.test.ts`, "a new IB project is numbered like the canonical outline", failed at `f3d998d04`.
- **Green:** that file passes 13/13. The blueprint, registry-coverage, bootstrap, template-library and IB-builder suites pass 299/299, and `shared/` passes 1076/1076. Typecheck reports 0 errors and the ESLint ratchet is unchanged.
