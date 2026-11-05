# R1 reach: the protocol's engine reads, in their tabs

**Package:** R1. **Date:** 2026-11-05.

These are three engines that existed, served in production, that no screen read. Each is now reached in the tab
where its record lives. It shows what the engine says, in the engine's words. It is not a dashboard and computes
nothing on the screen.

## What already exists

| Engine | Route | Before |
|---|---|---|
| Risk register summary: `summarizeRiskRegister`, ICH E6(R3) QRM (`protocol-risks-logic.ts`) | `GET /api/protocol-risks/documents/:id/register` | Not called. The Risk register tab counted "extreme" with its own threshold (`l × i ≥ 15`), a second rule beside the engine. |
| Deviation trends: `trendDeviations`, with signals for category spike, severity rise and aging (`deviation-trends.ts`) | `GET /api/protocol-deviations/deviations/trends` | Not called. AnA could read it as a tool; no screen did. |
| EU substantiality: `substantiality.ts`, EU CTR Article 2(2)(13), which never returns "non-substantial" | `GET /api/protocol-amendments/amendments/:id/substantiality` | Not called. |

## The change (no screen, route, service or table added)

- **Risk register.** The view assembler carries `riskSummary`, computed by `summarizeRiskRegister` over the risks
  scored on both axes, the same summary the register route returns. It also counts `unscored`. The tab's line reads
  "N risks · M open high or extreme" (· "K not scored"), and the screen's own threshold is deleted.
  `pdev-view-assembler.pglite.integration.test.ts` asserts that the view's summary equals the engine's.
- **Deviation trends.** The Deviations tab shows the engine's signals, as code and message, when the protocol has
  deviations. With none it says "No trend signal over the window the trend engine reads". A failed read says so.
  The route answers `{ documentId, trends }`. The first version of the test mocked a top-level `signals`, and the
  running app showed the read as failed. The test now uses the route's real shape and checks that a reply without
  `trends` is a failed read.
- **EU substantiality.** Each amendment offers "Check EU substantiality indicators", read on demand.
  - It shows the heading "EU substantial-modification indicators (Article 2(2)(13)). The classification is the
    sponsor's."
  - Then the engine's verdict sentence, verbatim, and the Article 2(2)(13) indicators that fired.
  - Then any conflict with the declaration, and the fields that could not be compared.
  - The US IND view stays apart, as the engine keeps it. US indicators never count toward the EU verdict.
  - The screen adds no wording of its own about substantiality. A test checks it never says "non-substantial" or
    "not substantial".

## Evidence in the running app

Protocol CDI02:

| Tab | Request | Status | The screen |
|---|---|---|---|
| Risk register (after adding "Endpoint adjudication may lag recurrence events", likely × major) | `POST /protocol-risks/documents/1/risks` | 201 | "1 risks · 1 open high or extreme" |
| Deviations & CAPA | `GET …/deviations/trends?protocolDocumentId=1` | 200 | "No trend signal over the window the trend engine reads." |
| Amendments, Amendment 1 | `GET …/amendments/1/substantiality` | 200 | the engine's sentence (below) |

The engine's sentence: "No indicator fired, but 8 could not be evaluated. This is NOT a determination of
non-substantiality: the unevaluated indicators are listed, and the classification against Article 2(2)(13) remains
the sponsor's to make and record."

The run had no failed request and no page error. Screenshots: `1-risk-register-line.png`,
`2-deviation-trends.png` (taken before the shape fix, and showing the honest failed-read note),
`3-eu-substantiality.png`.

**Tests.** `protocolEngineReads.test.tsx` has 9 cases; six fail without the change. All 35 client protocol test
files (317 tests) and 11 server protocol files (195 tests) pass.
