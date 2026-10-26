# D2 — slice 0: what a client meets today that is false, locked or a dead end

Plan: `.design/client-journey/INFORMATION_ARCHITECTURE.md`, section 8, "Slice 0", and each surface's row in section 5.
Small items, no founder admission, each on a path a client reaches today. This folder fills as the items land; each
commit names the items it carries.

## What already exists

Every item below changes something that exists; nothing is built beside it (Rule 3).

| Path | What it did | What it does now |
| --- | --- | --- |
| `client/src/concept2cure/v2/appMentions.tsx` (`useAppMentions`), `shared/navigation/callable-apps.ts` | The `@` menu in AnA's composers offered every callable feature: 56 on Home locally, about forty of them outside the release. Choosing one ended on "not in this release". | Offers only what this viewer can open, by the rail's rule (`useSurfaceAvailable`), asked of the surface each navigation id opens (`DEEP_LINK_ALIASES`), filtered before the eight are taken. With `LAUNCH_SCOPE_ENFORCE=on`, as in production, the Home menu offers 28. |
| `client/src/concept2cure/v2/Shell.tsx` `AccountMenu` | "Codebase coverage" (an engineering view of the surface registry, outside the release) in every member's account menu, opening a lock. | Beside Licensing, for platform administrators, and only when it can be opened. Under the launch scope it is not offered at all; admitting it is a decision, not this slice. |
| `client/src/concept2cure/v2/Shell.tsx` `CmdK` | "Jump to" listed the first eight registry rows (Plan & features, Artifacts center, a locked Regulatory workspace among them); a search listed every registry surface, those outside the release as locks. | "Jump to" lists the places in the rail's order, by the rail's rule; with a project open, its six steps, each opening the project on that step through `project-home.set-stage`; a surface outside the release is not listed. A licence lock (a plan, a module switched off) is still listed with its reason, because its unlock panel says what to do. |
| `client/src/concept2cure/v2/surfaces/ProjectSide.tsx` | Author's Memory and Instructions cards said "No project memory yet" and "No custom instructions yet" on every project: the page has no read for the store that holds them. | They say the page does not read them yet, never that there is nothing. |

Not done in this commit, and why:

- **A folded id resolving to its canonical in ⌘K.** No registry id is an alias today; the rule has nothing to act on
  until the first fold (slice 2 onwards).
- **A card in Plan & features losing Open for a feature not yet shown.** Several in-release features (human factors,
  device Pre-Sub and others) are reached today only from that card and ⌘K. Removing the door before their homes exist
  would lose them, against the founder's "nothing is lost". The card already offers Open only for a feature the
  organisation can open. Kept until each feature's slice places it.
- **The post-login redirect for client (sponsor) users.** It lands on `client-portal`, outside the release. Sending an
  external role to the internal Home changes what an external user sees; the map lists external users as founder
  decision 2.
- **Communication and CMC / Module 3 at signup**: a pricing decision (the map's decision 1).
- **`OPEN_PROGRAM_SURFACE`, AnA's aliases, Admin's prompt-only actions, Author's protocol line, the conversation's
  evidence chips**: their files carry the uncommitted "program" → "project" wording sweep; they land after it.

## Tests, each made to fail first (`red/`)

| Guard | Test | Red |
| --- | --- | --- |
| The `@` menu offers only what can be opened; a navigation id is checked as the surface it opens | `appMentions.test.tsx` (2 new) | `at-menu-offers-out-of-release.txt` |
| A locked feature never takes one of the eight places | `appMentions.test.tsx` (1 new) | `at-menu-sliced-before-filtering.txt` (filtered after slicing) |
| Coverage: not for members or org admins; for a platform admin only when it can be opened | `accountMenuMasterLicensing.test.tsx` (3 new) | `coverage-in-every-menu.txt` |
| ⌘K: places in "Jump to", the open project's steps, nothing outside the release | `cmdkPlaces.test.tsx` (5, new) | `cmdk-catalogue.txt` |
| Memory and Instructions say they are not read | `projectSideNotRead.test.tsx` (new) | `author-memory-said-empty.txt` |

`cmdkLicenseGating.test.tsx` contract 7 (a destination with no catalog row never locks) used Plan & features, which
left "Jump to"; it now uses Home, which the shell synthesises and the catalog has no row for.

Affected set: every test naming `Shell`, `appMentions`, `ProjectSide` or the palette (16 files): 15 pass;
`conversationRailTwins.test.tsx` fails 32 of 32 identically at HEAD (`useAuth must be used within an AuthProvider`,
from `CanvasDocumentList.tsx`'s `useAuth`, added in `cc1607c3a` on 2026-10-18; the test has no auth mock).
