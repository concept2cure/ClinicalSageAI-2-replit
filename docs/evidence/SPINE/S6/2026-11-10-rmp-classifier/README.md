# S6: in a pharma or biotech Vault, a Risk management plan is the dossier's (2026-11-10)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md` (Vault at Veeva parity, on the existing Vault).

## The decision

Decided by this session as the subject-matter expert, under the founder's instruction of 2026-11-10 ("Continue you
decide as the SME would"). It is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md` with the other decisions made under
delegation.

"Risk management plan" names two different documents:

- In a device or IVD file it is part of the ISO 14971 risk management file (the plan, the analysis, the report). It
  belongs with the design history file.
- In a medicinal product's dossier it is the Risk Management Plan: the EU RMP (GVP Module V), filed at EU Module 1.8.2,
  and Japan's risk management plan at 1.11. FDA's Module 1 has no single heading for it (its 1.16 is the REMS), which
  the Module 1 record states on purpose (`shared/regulatory/regional-module1.ts`).

So the Vault's view decides which one a file is. In a pharma or biotech Vault the name is the dossier's, unless the
name also says it is the device's (ISO 14971, RMF, DHF, "device", FMEA). In a device or IVD Vault nothing changes.

## The defect

The Vault's filing classifier (`classifyForFiling`, `server/services/vault/vault-filing.service.ts`) tries its rule
table first. The device rule "engineering / DHF / risk file" matches `risk management`, and it has no folder in a
pharma or biotech view. So a file named "Risk management plan" in a drug project was answered:

> Matched engineering / DHF / risk file, but the pharma vault has no folder for that kind — review where it belongs
> (quality-system records live in the Quality module, not the dossier).

It was left unfiled, called a device document, and told it was a quality-system record. The CTD filename detector,
which knows the RMP and its regional heading, was never asked. The name "RMP" did reach it, so the same document was
proposed for Module 1 under one name and refused under the other.

The sentence about quality-system records was written for an SOP. It was said of every kind with no folder: a device
verification report, a PSUR, an eCTD sequence file in a device Vault.

## What already exists

- `FILING_RULES` and `classifyByName` (`vault-filing.service.ts`): the rule table, then the CTD filename detector for
  a pharma or biotech view, then the TMF zone classifier for a service view.
- `detectCTDSection` (`server/services/ctd-ingestion-service.ts`): names a risk management plan as a Module 1
  document with the role `rmp`.
- `inProjectRegion` (`vault-filing.service.ts`, S6 V6 and F1 2026-11-05): gives a Module 1 document its region's
  heading from the record (EU 1.8.2, JP 1.11), and no section where the region has none.
- The same classifier serves the Vault ingest and the Data Room's filing proposal
  (`server/services/clinical-regulatory-evidence/data-room-processing.ts`).

Searches run: `risk.management`, `rmp`, `RMP`, `no folder for that kind`, `Quality module` over `server`, `shared`,
`client/src` and `tests`. No second classifier or message was found.

## What changed

`vault-filing.service.ts` only.

- A rule may name what the dossier owns (`dossierOwns`). The device engineering rule does: a "risk management plan" or
  "risk management system" with no device word in its name. In a pharma or biotech view the rule does not claim such
  a name, and the CTD filename detector decides it, exactly as it does for "RMP".
- A kind with no folder in a view says only what is true: "Matched <kind>, but the <view> vault has no folder for
  that kind. Review where it belongs." Only a quality-system record is told that those live in the Quality module.

No other rule yields. An SOP in a dossier Vault is still not filed into the dossier.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new cases on trunk: 3 fail (the plan is refused as a device file; the sentence is said of every kind). |
| `02-green.txt` | 41 of 41 in the classifier's suite; 14 suites, 301 tests; the running server's answer. |

Used in the running app's server (local, a US IND biotech project): a file named "Risk management plan" was ingested
through `POST /api/vault/ingest` and proposed for "Module 1 · Administrative", with "The name names Module 1 but no
section; confirm where in the module it belongs." That is the record's answer for a US project.

## What is not done

Found by the same probe, and not changed here. In a pharma or biotech Vault the device engineering rule also claims
ordinary Module 3 names, and the CTD filename detector does not know them either, so they stay unfiled:

- "Process validation report", "Sterilization validation" (3.2.P.3.5);
- "Analytical method validation report" (3.2.S.4.3 or 3.2.P.5.3);
- "Shelf life justification" (3.2.P.8.1).

Likewise "PSUR" (a PBRER is Module 5.3.6) is claimed by the device vigilance rule, and "Literature review" by the
device clinical evaluation rule. A REMS is not recognized by name. Each needs the detector to learn the name before a
rule can yield to it; until then the honest answer is "no folder, review where it belongs", now without the wrong
sentence.
