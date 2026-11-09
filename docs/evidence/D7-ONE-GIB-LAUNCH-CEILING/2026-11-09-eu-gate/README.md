# P-93 follow-on: the package gate refuses an EU package over 600 MiB at freeze and dispatch, and the size sentence never reads its two figures as equal (row D7, 2026-11-09)

The coordinating session's ruling of 2026-11-09, answering RIM's question after `96ca836e5`:

> **Your Q1(a) follow-on: yes.** The package gate refuses an EU (CESP) package over 600 MiB at freeze and dispatch
> too, exactly as it does for FDA. … Use the same `checkGatewaySize` and the same sentence, with no second figure.
> Renewal and transmit keep their re-checks. PMDA stays unmeasured … **The boundary rounding ("0.63 GB, over … 0.63
> GB"): fix it** in that same commit … the package in MiB to one decimal against the limit in whole MiB … or exact
> bytes when the two would round alike.

## What already exists

- `96ca836e5` made readiness refuse an EU package over its gateway's sourced 600 MiB before signing, by
  `checkGatewaySize` (`server/services/submission-gateways/pre-transmit-check.ts`). The package gate
  (`assertSequencePackageable`, freeze, dispatch and renewal) still applied only FDA's launch ceiling. So an EU
  sequence over 600 MiB could be frozen and dispatched, and was then refused at its send.
- `checkGatewaySize` printed both figures in decimal GB to two places. A package one byte over 600 MiB therefore read
  "Package is 0.63 GB, over the EMA gateway limit of 0.63 GB".

## The change

- **One size composition** in `submission-service.ts`: `packageBlockers(assembled, fda, gatewayRegion)` with
  `packageSizeRefusal`.
  - For FDA, it is the launch ceiling.
  - For any route whose gateway limit is enforced, it is that limit, judged by the guard's own sentence
    (`checkGatewaySize`).
  - A PMDA route, whose figure is unsourced, or a route with no limit, is not refused on size.
  - The package gate, readiness (`judge: 'size'`) and transmit's re-check all read it.
- The package gate reads the sequence's route (`sequenceGatewayRegion`) only when the sequence is not FDA's.
- **The leaves advice names the route's limit:** "so that each package is 600 MiB or less" for EU. For FDA it stays
  "1 GiB or less", word for word.
- **The guard's sentence** (`sizeAgainstLimit`), used by both its refusing and its warning branch:
  - FDA's decimal 10 GB stays in GB to two places, as FDA states it.
  - A binary limit is said in MiB, the package to one decimal and the limit whole: "Package is 700.0 MiB, over the
    EMA gateway limit of 600 MiB".
  - Where the two would still read alike, both are given in bytes: "Package is 629,145,601 bytes, over the EMA
    gateway limit of 629,145,600 bytes".
- `gatewaySizeLimitWords(region)` gives the limit in those same words for the advice. It reads the same table, so
  there is no second figure.
- One fixture was widened, with no assertion changed: `packageability-dry-run.test.ts`'s db mock gains the sequence's
  submission row, which the package gate now reads for a non-FDA route.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | at `7e521b0d3`: EU at freeze and at dispatch are not refused on size, and the guard's three wording cases fail |
| `green.txt` | every submission-gateways and submission-service test, and every test naming a changed function: 1525 pass, none fail |
| `mutation-1-gate-reads-no-route` | the package gate never reads the route: the EU freeze and dispatch cases fail |
| `mutation-2-boundary-not-in-bytes` | the boundary is not said in bytes: the one-byte-over cases fail |
| `mutation-3-binary-limit-in-gb` | a binary limit said in GB: the 700 MiB case fails |
| `mutation-4-move-advice-names-1-gib` | EU advice says "1 GiB": the EU freeze case fails |

The FDA control is the existing launch-ceiling cases in `launch-sequence-size.pglite.test.ts`, unchanged and green.

`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`, `Completes:
server/services/submission-gateways/pre-transmit-check.ts`.
