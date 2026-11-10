# Faux Biotech — data-only operational runbook

**No application code, API, schema, or UI changes authorized.** This document records proposed steps, not completed live application actions. Existing ZIP: `Faux_Biotech_CSR_Full_Lifecycle_Demo_Data.zip`. See `README.md` for scientific scope and `PROJECT_PORTFOLIO.csv` for project shells.

## A. Organization and identities

1. Use the *hosted* Concept2Cure application under an account authorized to create organizations. Create **Faux Biotech Therapeutics [DEMO / FICTIONAL]** with slug `faux-biotech-therapeutics-demo`, without borrowing the founder's personal tenant or altering authentication policy.
2. Add a dedicated, appropriately authorized demonstration user by the **existing** membership workflow. Confirm the actual signed-in organization's name and ID. Never log or commit credentials.
3. Create **Clinical Development / CSR Demonstration** workspace, then **FBT-102**, **FBT-201**, and **FBT-202** as separate project records. FBT-201 is the only project with simulated clinical outcomes. For any classification prompt, FBT-201's fictional investigational product is a **biologic**.

## B. Data Room

Import the ZIP contents **as individual source documents**, not as a pretend already-processed CSR. Refer to `CSR_SOURCE_CATALOG.csv` for file types and section links. The protocol and SAP precede the analysis datasets; the result summaries follow. On every upload, verify file extension support, storage/processing status, content hash and project scope. An unsupported type or failed extraction is an **open gap**, not a successful ingestion.

## C. Biostatistics to medical writing

- Confirm randomized/ITT/safety n = 80 for active and 80 for placebo in the uploaded synthetic ADSL.
- Independently recompute PASI75: active 52/80 (65.0%) and placebo 30/80 (37.5%). Absolute difference 27.5 percentage points. Summary JSON states a descriptive unadjusted Wald 95% interval 12.6–42.4 percentage points and illustrative two-sided Fisher exact p=0.000840; it is not an efficacy claim.
- Cross-check treatment completion 76/80 vs 77/80 and safety counts 42/80 vs 37/80 TEAE, 3/80 vs 2/80 SAE and 2/80 vs 1/80 AE withdrawal.
- Use the **existing** CSR ICH E3 draft/editor path and link each numerical claim to source tables. Preserve missing exposure, causality and verification caveats. Nothing here asserts that any AnA draft has been generated, approved, or saved in the application.

## D. Tasking, Communication and governance

`12_HUMAN_REVIEW_AND_TASKS.csv` provides proposed tasks; `CSR_REVIEW_MESSAGES.csv` provides *unsent* messages. Create, assign and send them only through authorized existing in-app actions. Reviewers should comment in the document itself. `Complete` in a mock CSV is not an executed governed action. Electronic signature must occur through the actual app with authorized credentials, identity, meaning, audit receipt and content hash. No signoff or regulatory submission is simulated as real.

## E. End-to-end demonstration acceptance (not yet executed)

| Step | Required observation | Status |
|---|---|---|
| 1 | Demo sign-in returns expected Faux Biotech organization and role | NOT VERIFIED |
| 2 | Projects lists all three records; FBT-201 can reopen | NOT VERIFIED |
| 3 | New project creates and persists after refresh | NOT VERIFIED |
| 4 | Vault/Data Room shows ingested documents with actual saved hashes | NOT VERIFIED |
| 5 | Biostatistics opens and reconciles synthetic results | NOT VERIFIED |
| 6 | Editor opens 16-heading CSR, saves and reopens modified draft | NOT VERIFIED |
| 7 | Tasking and Communication left-rail links load and work | NOT VERIFIED |
| 8 | Reviewer comments/tasks persist and can be reopened | NOT VERIFIED |
| 9 | Approved signature is actual authorized app event (if attempted) | NOT VERIFIED |
| 10 | No page remains indefinitely loading; errors are actionable | NOT VERIFIED |

Collect real tenant IDs, artifact IDs, deployment revision, timestamps, and screenshots in an **operator-only** record after exercising the live application. Do not paste personal information or tokens into GitHub. **A committed dataset is not a populated organization.**
