# D2 — AnA and the platform cite ICH E6(R3), by a section that exists (2026-10-08)

Lane `…session_01SuVLo2`. Founder-directed, 2026-10-08: *"enhance her acumen, intelligence, and abilities across the board … protocols, SOPs, IND documentation, BLA"*.

## Before (measured at `6bd6b368`)

ICH E6(R3) (Principles + Annex 1) reached Step 4 on 2025-01-06 and superseded E6(R2) (currency fact `ich-e6r3-gcp-step4`). The platform had not followed:

- **E6(R2) cited as in force: 82 non-test files, 285 occurrences.** The citations were in AnA's question flows (protocol, IND, safety narrative), the war-game auditors (SOP, CSR, protocol, PMA, safety narrative), the IB builder and its surface, eTMF, the protocol risk, review, deviation and amendment services, the persona's base prompt, the reference-model constants, and the schema comments.
- **R2 section numbers.** Most of them (4.8, 5.18.4, 6.x, 7, 8.x) do not exist in R3. The R3 numbering is not R2's:
  - the 13 principles became 11;
  - investigator and sponsor became Annex 1 §2 and §3;
  - data governance is a new §4;
  - the protocol, IB and essential documents became Appendices B, A and C.
- **The R3 citations that existed named sections R3 does not have.** These included "E6(R3) §8", "§5.5.3", "§6.9" and "§7". The existing R3 knowledge (`gcp-operations-knowledge.ts`) had more errors:
  - proportionality as Principle 5 (it is 7);
  - investigational product as §3.16 (it is §3.15; §3.16 is data and records);
  - a separate "Annex" for computerised systems (it is Annex 1 §4.3);
  - Step 4 dated 2023.

`red/ich-e6r3-citations.txt` shows the gate on that tree: 2 of 5 cases red, naming every file.

## How the record was built

`shared/regulatory/ich-e6r3.ts` is the one record of E6(R3). It holds:
- the 11 principles;
- the Annex 1 sections;
- Appendices A–C;
- a crosswalk from each E6(R2) section the platform cited.

ich.org is not reachable from this environment (egress policy), so nothing was read against the Step 4 text. Instead, **three independent recalls were made blind to each other**. Only what all three gave with the same heading is in the record: every first-level Annex 1 section, plus 3.10.1 and 3.11.1–3.11.4. The crosswalk stops at the level all three agreed on, an Annex 1 section or an appendix. A fourth reviewer adjudicated the disagreements. Sub-points the recalls could not agree on (2.8.10, Appendix B's B.x numbering, the §4.2 and §4.3 sub-points) are deliberately absent, so a citation names the section and never a guessed paragraph.

Every basis is `recall` and is labelled as such (`citeE6R3`, `basisLabel`). Two numbers the platform had cited as E6(R2) sections do not exist in E6(R2) at all (5.3.5 and 6.5.4); they are recorded as such and never mapped.

## After

The sweep agents each took one batch of the cold files, and an adversarial reviewer then re-read each batch's diff and fixed it in place. Every E6(R2) citation in force now cites E6(R3) at its mapped location. Historical mentions keep R2, with "superseded by E6(R3), 2025-01-06" in the same sentence: the 2016 integrated addendum's bibliography entry, "existing R2 projects need a mapping", and do-not-translate terms that real documents still contain. Wrong R3 citations were corrected from the record. Only citation text changed; no logic, key or identifier changed.

## The gate

`tests/regulatory/ich-e6r3-citations.test.ts` scans every non-test `.ts` and `.tsx` file under `server/`, `shared/` and `client/src/`. It checks that:
- "E6(R2)" appears only with a superseded or historical qualifier within the sentence;
- every "E6(R3)" citation that names a section names one in the record.

Files another lane held carry a count that may only fall (`HANDED_ON`).

## Not done, recorded

- **Not read against the ICH text.** Reading the Step 4 PDF would raise the record to `regulator-text` and could add the sub-points.
- **Handed on.** These files were held by other lanes on 2026-10-08 and still cite E6(R2): `gateway.ts`, `AnaToolDefinitions.ts`, `AnaToolExecutor.ts` and `evidence-literature-tool-defs.ts`.
