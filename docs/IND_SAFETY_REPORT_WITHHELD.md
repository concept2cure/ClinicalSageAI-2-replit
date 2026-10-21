# Retained IND safety-report card

Decision P-32 in [LAUNCH_DEFINITION_OF_DONE.md](LAUNCH_DEFINITION_OF_DONE.md) withholds 21 CFR 312.32 safety reporting and ICSR transmission from this release. The live IND lifecycle continues to show no safety-report action, and production API launch gates continue to refuse those routes.

The retained card specification now lives at [tests/fixtures/withheld/indSafetyReportCard.ts](../tests/fixtures/withheld/indSafetyReportCard.ts). Its full intake, server-verdict presentation, route contract, qualification comments and restoration instructions are preserved. Moving it outside the production client graph keeps a withheld capability available for qualification without treating it as reachable product code.

The existing [indLifecycleDeliverables.test.tsx](../client/src/concept2cure/v2/__tests__/indLifecycleDeliverables.test.tsx) imports the retained specification directly. It still checks the unstated safety determinations, expectedness and onset semantics, server verdicts, and absence of a live safety-report card. The production client reachability and launch API gates remain unchanged.

Restoring the user-facing card still requires the launch decision and ownership changes recorded in the retained specification. This move does not activate its routes or add an exception to a guard baseline.
