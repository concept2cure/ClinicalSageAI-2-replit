# g-cesp-centralised-refusal: regulatory facts relied on

Step: `g-cesp-centralised-refusal` (lane eu-channel, finding 42). This step depends on `g-submission-channel-function`.
Checked: 2026-10-05. WebFetch to ema.europa.eu is blocked by egress. So each "regulator text" row below rests on a regulator-hosted search result: the URL is on an EMA domain, and the wording is the search snippet, not a fetched page.

This step makes no new regulator claim. It applies the channel that `submissionChannelFor` (server/services/regulatory/registry/submittabilityCoverage.ts) already names to the real transmit path. The facts are the same ones the previous step relied on (g-submission-channel-function-facts.md rows 1-3); rows 1 and 2 were re-checked today.

| # | Fact | Basis | Source | Where it is used |
|---|---|---|---|---|
| 1 | From 1 March 2014 the eSubmission Gateway or Web Client is mandatory for all eCTD submissions through the centralised procedure. EMA no longer accepts them on CD or DVD. This covers all marketing-authorisation and variation applications for human medicines. | regulator text (search result, EMA-hosted, re-checked 2026-10-05) | https://www.ema.europa.eu/en/news/regulatory-information-esubmission-gateway-web-client-mandatory-all-ectd-submissions-through ; https://www.ema.europa.eu/en/news/esubmission-gateway-or-web-client-become-mandatory-all-ectd-submissions-through-centralised-procedure-2014 | `transmitRouteFor` (submission-service.ts) refuses an EU drug or biologic dossier whose filing has an `unconnected` channel. `EmaCespGateway.transmit` (ema-cesp.ts) refuses it before its transmittal row. Both name "EMA eSubmission Gateway / Web Client" and give the channel function's reason. |
| 2 | Centralised-procedure submissions go to EMA only through the Gateway or Web Client, and are not also sent via CESP. | regulator text (search result, EMA-hosted Q&A, listed 2026-10-05) | https://esubmission.ema.europa.eu/gateway/Q%20&%20A%20for%20EMA%20eSubmission%20Gateway.pdf ; https://esubmission.ema.europa.eu/gateway/Q&A%20for%20EMA%20Gateway%20Web%20Client.pdf | This is the reason the refusal says "CESP is not an accepted channel". That phrase comes from the channel function's reason string. It states the effect of the rule; it does not quote EMA. |
| 3 | CESP is the channel for national, MRP and DCP procedures. | **recall**, not verified on a regulator site. The repository already says the same (`server/services/global-ri/electronic-submission-format.ts:79`). | — | Positive control: EU_GENERIC_DCP (agency National_Competent_Authority) still routes to ema:cesp and still reaches the wire in the CESP gateway. |

## Implementation choices

These are engineering choices, not regulator facts.

- **Refusal type.** CESP refuses with `ValidationError(…, NOTHING_TRANSMITTED)`, not with a `GatewayError` as the plan proposed. `refusedBeforeWire` (submission-gateways/index.ts) reads a GatewayError as "may have reached the agency", and refused-before-wire.test.ts pins that. A GatewayError would therefore strand the caller's transmit claim at 'transmitting' for a sequence that was never sent. The refusal is raised before the transmittal row and before any request.
- **Refusal count.** The count pinned at refused-before-wire.test.ts:199 counts `new CredentialError(` sites, and this step adds no such site, so the count stays at 2. That test file now has a case instead: the CESP refusal of an EU_MAA is a ValidationError, writes no transmittal row, and `refusedBeforeWire` is true.
- **Unknown filing types fail closed.** An EU drug or biologic dossier whose `applicationType` names no registry filing is refused at routing. Nothing on record says CESP accepts it.
- **Lifecycle types are not judged at the gateway.** transmitSequence passes `seq.type` to the gateway, and that is a lifecycle value (original, amendment, …) that resolves to no registry filing. So the gateway refuses only a filing type it can name; routing has already decided on the submission's `applicationType`.
- **Product decision.** DECISIONS.md row 10 applies: there is no eSubmission Gateway connector (Rule 2). Centralised filings are build-only.
