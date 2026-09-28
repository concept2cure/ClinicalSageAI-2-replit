# D2 — a paged portfolio says it is paged

**Row:** D2 Launch catalog (Projects). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Handed on by the vault/projects re-baseline (`docs/work-orders/README.md`, "→ Projects").

## 1. What was wrong

`GET /api/c2c/projects` answers one page, 50 programs by default, and says when there are more
(`meta.hasMore`). `Projects.tsx` never read it. For an organisation with 80 programs, the summary
read **"50 active programs"**, the average readiness covered 50, the Blocked and Filing counts
covered 50, search could not find program 51, and AnA was told the 50 were the portfolio.
Nothing on screen said any of it was partial.

## 2. What changed

When the route says `hasMore`:
- the count reads **"50+"**, a floor rather than a total;
- a status note above the list says "Showing the first 50 programs. The totals, the average
  readiness and search cover these only.";
- AnA's summary says the figures cover the first page and more exist, and its facts carry
  `portfolioTruncated: true`. That value is now in the memo's dependency list; without it the
  context could stay stale, which the linter caught.

A complete read renders exactly as before. The request is unchanged: several other tests and
surfaces match the exact URL, and the defect was the silence, not the page size.

## 3. Proof

| | |
|---|---|
| `red/portfolio-truncation.txt` | Old surface: the paged case fails (no note, the count reads as a total, AnA not told). The complete-read case passes, as it should on both. |
| `green/portfolio-truncation.txt` | 2 of 2. Every test file that mounts Projects: 6 files, 73 tests. |

## 4. Not done here

- **Loading the rest.** A "load more", or asking for the route's 200 maximum, is the next step.
  The pickers in other surfaces that call the same route with the default page have the same
  ceiling and do not say so either.
- The TaskBoard critical-path view (the other half of this handoff line) is not touched.
