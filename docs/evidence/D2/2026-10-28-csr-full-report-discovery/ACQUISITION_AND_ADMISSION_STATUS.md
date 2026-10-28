# Full CSR acquisition and AnA admission status — 2026-10-28

The seven new candidates were confirmed at their public landing pages; no new original PDF was successfully downloaded in this session. NIH DASH lists a COLT1 redacted CSR (2.77 MB) and a Fluconazole Safety CSR (~998 KB) with companion protocols/SAPs. GSK 205013 lists a CSR download plus protocol/SAP, but its site explicitly says to contact GSK to request the **full** report. Do not classify every sponsor portal "clinical study report" download as the full unredacted ICH E3 body. GSK's general disclosure policy describes synopses, redactions and request processes. Public access does not establish commercial fine-tuning or embedding rights.

Acquisition blockers: no authenticated DASH document download/API response and no permitted GSK full-report delivery were obtained. This repo change therefore does **not** insert these seven into production Cortex, fabricate original SHA-256 hashes, or assert model training occurred.

Existing retained NIH/BPCA source: the prior 453-page meropenem CSR composite was opened and examined for document segmentation and reporting conventions. The review is recorded in `NIH_MEROPENEM_CSR_REVIEW.md`. That source is an existing retained original, not one of the seven newly discovered originals.

AnA's **existing** medical-writing guidance composer was strengthened with CSR-specific document classification, clinical-vs-reference evidence separation, protocol/SAP/TLF source requirements, denominators, Bayesian/frequentist fidelity, safety distinctions, cross-reference/footnote checks, and original evidence retention. No parallel canvas, editor, or new knowledge database was introduced.

Release gate for each candidate: retrieve actual original through permitted source channel; retain bytes and hash; inspect pages for report body/synopsis classification and tables; qualify reuse rights and page extraction; register via existing CRE evidence spine; verify AnA search and page reads in deployed environment; evaluate held-out drafting against expert-reviewed benchmark; preserve all originals and derivatives.

**No live AnA model run, new PDF admission, commercial training, or deployed validation is claimed.**
