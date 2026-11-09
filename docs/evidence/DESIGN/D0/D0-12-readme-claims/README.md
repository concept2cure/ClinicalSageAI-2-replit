# D0-12: the design-system README's claims are held, and the retired-name ratchet covers §4.7 (review fixes 14 and 15)

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0 review fixes 14 and 15
(`docs/evidence/DESIGN/D0/review/README.md`, "D0 fixes owed"). **Read at:** `37f520f3be`, 2026-11-09.

## What already exists (RULE 3)

**`design-system/README.md`, D0's own file,** stated four things the v2 stylesheets did not do:
- "no text below 12px" and "every size is a `--fs-*` token";
- "nothing moves on hover", and "cards … do not lift on hover";
- "every transition is `var(--dur)` with `var(--ease)`";
- "never Title Case".

No check held any of them.

**`__tests__/foundationsRetiredRatchet.test.ts`** held §4.6's 32 names and `sp-primary` (D0-11). Nothing stopped the
rest of §4.7's retired names from rising. That covers the tabs, segments, cards, tiles, chips, drawers, composers and
the header meta.

**Two comments** said the opposite of the README: `journey-v2.css` ("The lift is the cards' motion") and
`dialogButtonHoverSettles.test.ts` ("gives the lift to cards").

## The change

**Fix 14.** The README says where each claim stands, and a new test holds each count so it only falls:
`__tests__/foundationsReadmeClaims.test.ts`. The comments now agree with the README.

Measured at `37f520f3be`, every `*.css` in `v2/styles`, comments stripped:

| Claim | Count | Sheets |
|---|---|---|
| `font-size` of 9–11.5px | 1,200 | 29 |
| `:hover` rule declaring `transform` | 38 | 15 |
| `transition` naming `var(--dur)` without `var(--ease)` | 110 | 14 |
| `text-transform: capitalize` | 25 | 12 |

The review's own counts (1,219 / 39 / 116 / 25) were taken at `bfa9c6869` and have since fallen. A count that falls
lowers its baseline in the same commit.

**Fix 15.** 44 more of §4.7's retired names, each at its count measured with the ratchet's own rule:
- **Tabs:** `rbm-tabs`, `ml-tab`, `pd-tab`, `ra-tab`, `rl-tab` 0, `adm-tab`, `company-tabs`, `rpk-tab`, `cl-tab`,
  `qms-tabbar`.
- **Segments:** `qms-seg`, `pdev-seg`, `seg-btn` 7.
- **Cards:** `rbm-card` 7, `py-card`, `dj-card`, `cv-card`, `lic-card`, `ph-card`.
- **Tiles:** `reg-kpi` 30, `metric-card` 40, `cv-kpi`, `ra-kpi`, `etmf-kpi`, `ivd-stat`, `py-stat`, `rbm-tile`.
- **Chips:** `status-pill` 49, `sp-tag` 17, `reg-pill`, `ml-chip`, `pg-badge`, `rc-chip`.
- **Drawers:** `tt-panel`, `pdev-sheet`, `py-sheet`, `de-sheet`, `ana-sheet`, `adm-drawer`, `risk-drawer`.
- **Composers:** `ec-composer`, `rc-composer` 0, `rbm-ana-composer`.
- **Header meta:** `cm-meta` 84.

The two at 0 have no CSS left, so the "gone from the CSS at 0" rule already holds for them.

## Verified by making it fail

- **`red-planted.txt`.** One case of each kind was appended to `app-v2.css`: an 11px size, a capitalize, an ease-less
  transition and a hover lift. Each of the four ratchets fails on its own case, naming the count (1,201 against
  1,200, 39 / 38, 111 / 110, 26 / 25). The file was restored afterwards.
- **The probe case** in the new test counts a fixed stylesheet: a commented-out rule does not count, `text-transform`
  is not counted as a hover `transform`, and a transition with `var(--ease)` passes.
- **Green:**
  - `foundationsReadmeClaims` 5 of 5;
  - `foundationsRetiredRatchet` 78 of 78;
  - `dialogButtonHoverSettles`, unchanged apart from its comment.
