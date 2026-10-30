# Shared CSR ethics fallback correction

## What already exists

`server/services/csr-builder.ts:generateSectionTemplate` supplies the same section5 fallback to the on-demand HTTP draft, worker provenance drafting and synchronous builder. It asserted ethics approval, written consent and GCP from metadata lacking those source records. Existing `hasUnresolvedPlaceholders` and status gates already classify explicit missing-record placeholders; no second checker is introduced.

## Actual RED and correction

`red.json`: two genuine route failures after refusal/empty provider output. `full-red.json`: three genuine fallback failures plus one fixture calibration failure: synchronous empty provider content stays empty, so that case did not exercise a fallback. Retained `calibration.json` discloses this. Corrected prepatch `corrected-red.json`: four actual failures, four controls pass, no drift, with refusal exercising the real synchronous fallback.

Production replaces only the shared section5 fallback string with explicit ethics-record gaps and the established bracketed placeholder convention. Actual template origin remains, and no approval/consent/conduct facts are invented. `green.json` passes31 checks across the route, completeness and E3 brief suites with no drift. Root final regression qualifies the combined source. These scripted gateway fixtures do not validate actual model assertions or ethical/legal compliance.
