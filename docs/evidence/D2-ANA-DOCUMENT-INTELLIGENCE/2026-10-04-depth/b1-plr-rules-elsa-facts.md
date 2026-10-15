# b1-plr-rules-elsa — regulatory facts relied on

Checked 2026-10-04. Regulator sites are blocked for direct fetch in this
environment; each fact below was confirmed through web-search results served
from the regulator-hosted URL given (eCFR, govinfo.gov, fda.gov), so each is
labelled **regulator-text**. Anything not confirmed that way is labelled
**recall** or **unverified** and is not stated by the code as regulator text.

## 21 CFR 201.57 — PLR content and format (source of `PLR_FORMAT_RULES`)

Primary URL: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.57
Print edition: https://www.govinfo.gov/content/pkg/CFR-2006-title21-vol4/pdf/CFR-2006-title21-vol4-sec201-57.pdf
(also the 2017 edition, https://www.govinfo.gov/content/pkg/CFR-2017-title21-vol4/pdf/CFR-2017-title21-vol4-sec201-57.pdf)

| Para. | What the regulation says | Confidence | Rule id |
|---|---|---|---|
| (a)(1) | Highlights carry the verbatim statement "These highlights do not include all the information needed to use (insert name of drug product) safely and effectively. See full prescribing information for (insert name of drug product)." | regulator-text | `plr-hl-limitation-statement` |
| (a)(3) | The verbatim statement "Initial U.S. Approval" followed by the four-digit year in which FDA first approved a new molecular entity, new biological product or new combination of active ingredients, on the line immediately beneath the established name (proper name for a biological). It is a Highlights line, not a running header. | regulator-text | `plr-hl-initial-approval` |
| (a)(4) | A concise summary of any boxed warning, not to exceed 20 lines, preceded by an upper-case heading containing "WARNING"; heading and summary boxed and bolded; the verbatim statement "See full prescribing information for complete boxed warning." immediately follows the heading. | regulator-text | `plr-hl-boxed-warning` |
| (a)(5) | Recent Major Changes lists sections with substantive approved changes, limited to (c)(1) Boxed Warning, (c)(2) Indications and Usage, (c)(3) Dosage and Administration, (c)(5) Contraindications and (c)(6) Warnings and Precautions, each with its number and the month/year of the change. A changed section is listed for at least 1 year after the date of the labeling change and removed at the first printing after that year. It is therefore conditional, not a required Highlights section. | regulator-text | `plr-hl-rmc-one-year` |
| (a)(11) | The verbatim statement "To report SUSPECTED ADVERSE REACTIONS, contact (manufacturer) at (phone) or FDA at (current FDA phone number and web address for voluntary reporting of adverse reactions)"; for vaccines, VAERS in place of FDA. | regulator-text | `plr-hl-ae-reporting` |
| (b) | "Full prescribing information: contents" lists each section and subsection heading with its number. There is no page-count condition. Where a required section or subsection is omitted, the Contents heading is followed by an asterisk and Contents ends "* Sections or subsections omitted from the full prescribing information are not listed." | regulator-text | `plr-contents` |
| (d)(6) | Letter height or type size for all labeling information, headings and subheadings under (a), (b) and (c) is at least 8 points; labeling on or within the package from which the drug is to be dispensed is at least 6 points. | regulator-text | `plr-type-size` |
| (d)(8) | Highlights, except for the boxed warning, are limited to one-half page, assuming an 8½ x 11 inch page printed in two columns, single-spaced, in 8-point type with ½-inch margins on all sides and between columns. | regulator-text | `plr-hl-length` |

FDA guidance, *Labeling for Human Prescription Drug and Biological Products —
Implementing the PLR Content and Format Requirements*
(https://www.fda.gov/files/drugs/published/Labeling-for-Human-Prescription-Drug-and-Biological-Products---Implementing-the-PLR-Content-and-Format-Requirements.pdf):
a waiver of the half-page Highlights limit may be requested. **regulator-text**
(as reported by the step's verification, 2026-10-04).

### What the code said before this step, and why it was wrong

- `assessPLRStructure` said FPI may be 6-point "per 21 CFR 201.57(d)(8)". (d)(6)
  sets 8 points for Highlights, Contents and FPI; 6 points applies only on or
  within the dispensing package; (d)(8) is the Highlights length rule.
- It cited the half-page Highlights limit as 201.57(d)(4). The limit is (d)(8),
  and it excludes the boxed warning.
- It made Contents conditional ("if FPI exceeds one page"). (b) has no condition.
- It described "Initial U.S. Approval" as part of a running header. (a)(3)
  places it on the line beneath the established or proper name.
- It marked Recent Major Changes `required: true`. Under (a)(5) the section
  exists only while a change is inside its listing period.
- The 20-line limit on the Highlights boxed warning, (a)(4), appeared nowhere in
  the repository. The verbatim boxed-warning line was already stated
  (labeling-intelligence-knowledge.ts boxed-warning formatRequirements).
- The US section guard (`labeling-authoring.ts` US_REQUIRED) held only FPI
  sections 1–17, so a PI with no Highlights, no (a)(1)/(a)(3)/(a)(11)
  statements and no Contents passed `checkSectionGuard('us')`.

### Not verified (left unchanged, not stated as regulator text)

- The bolding rule "Reference to Boxed Warning: bold, with inverted black
  triangle symbol" in `assessPLRStructure` and the boxed-warning
  `symbolRequirements` line. No US regulator text was found for an inverted
  black triangle in Highlights. The inverted black triangle is the EU
  additional-monitoring symbol (Regulation (EU) No 1235/2010 / Directive
  2010/84/EU; **recall**). **Unverified**; a later step should check it
  against 201.57 and the PLR guidance, and remove it if nothing supports it.

## FDA and Elsa (source of `ELSA_NOTE.facts`)

| Fact | URL | Confidence |
|---|---|---|
| In June 2025 FDA said it "is already using Elsa to accelerate clinical protocol reviews, shorten the time needed for scientific evaluations, and identify high-priority inspection targets." | https://www.fda.gov/news-events/press-announcements/fda-launches-agency-wide-ai-tool-optimize-performance-american-people | regulator-text |
| 6 May 2026: Elsa 4.0 adds custom agents, document generation, quantitative data analysis and visualisation, OCR of scanned documents and images, and optimised search of large document repositories. HALO consolidated more than 40 application and submission data sources, systems and portals. FDA "began integrating HALO and Elsa" so staff can query data and build workflows without manually uploading documents in each chat — begun, not complete. | https://www.fda.gov/news-events/press-announcements/fda-expands-ai-capabilities-and-completes-data-platform-consolidation | regulator-text |

Not FDA text, and stated in the code only as the platform's view: that
internal numeric consistency across CSR, ISS/ISE, 2.7, 2.5 and the label
matters more as FDA connects Elsa to its submission data. The finding's link
from "inspection targets" to BIMO site selection is inference and is not
stated anywhere.

The `pdf-text` consequence no longer rests on an AI tool being unable to read an
image-only page (Elsa 4.0 adds OCR). It rests on FDA's PDF specification, which
still requires text-searchable PDFs.
