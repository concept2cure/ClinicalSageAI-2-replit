# US eCTD asset review request — unsigned

W5 / D7, MR-10 Stage3, 2026-10-30. This packet makes the pending review concrete. It contains public source facts and proposed acquisition scope; it is not a legal signoff, downloaded schema corpus, vendor license or agency acceptance.

## Exact proposed acquisition scope

| Asset | Version | Official artifact URL | Published issuer MD5 (not independently measured) |
| --- | --- | --- | --- |
| ICH eCTD DTD | 3.2 | https://admin.ich.org/sites/default/files/inline-files/ich-ectd-3-2_dtd_0.zip | 1d6f631cc6b6357f0f4fe378e5f79a27 |
| ICH eCTD Stylesheet | 2 | https://admin.ich.org/sites/default/files/inline-files/ectd-2-0_0.xsl | 3a07a202455e954a2eb203c5bb443f77 |
| ICH-STF DTD | 2.2 | https://admin.ich.org/sites/default/files/inline-files/ich-stf-v2-2_dtd_0.zip | 0972c10a4dadf3df5d2f41b2026a4a5c |
| ICH STF Stylesheet | 2.3 | https://admin.ich.org/sites/default/files/inline-files/ich-stf-stylesheet-2-3.xsl | 92bfeb4cb358a4af786317a0da2309c5 |
| Valid Values.xml | 6.0 | https://admin.ich.org/sites/default/files/inline-files/eCTD_v.3.2_Valid_Values_v6.0.zip | 797b4110bddb6d3cb4ad3869ffccb53c |
| US Regional DTD | 3.3 | https://www.accessdata.fda.gov/static/eCTD/us-regional-v3-3.zip | bea39be6d3a1716262a30a87657bce2d |
| US Regional Stylesheet | 2.2 | https://www.accessdata.fda.gov/static/eCTD/us-regional.zip | Not found on page |

The valid-values archive is needed for complete current tag/category review. The FDA Module1 specification links current attribute-specific vocabulary separately; exact links are in `dtd-agency-source-observations.json`. Archive contents, extracted filenames, parameter entities/modules, stylesheet includes and notice headers have not been inspected. Issuer MD5 values refer to the issuer-described asset; acquisition must establish whether that scope is an archive or extracted file. Actual SHA-256 values remain unmeasured. If no issuer digest can be located for an asset (currently none recorded for the US stylesheet), the existing runbook additionally requires a cross-check from a second network; no such independent-network verification is claimed here.

## Public notices for counsel review

Source: https://www.ich.org/page/legal-mentions

> Legal Mentions The information, material and photographic content provided on this website are protected by copyright and may, with the exception of the ICH logo, be used, reproduced, incorporated into other works, adapted, modified, translated or distributed under a public license provided that ICH's copyright in the information and material is acknowledged at all times. In case of any adaption, modification or translation of the information, material or photographic content, reasonable steps must be taken to clearly label, demarcate or otherwise identify that changes were made to or based on the original information or material. Any impression that the adaption, modification or translation of the original information or material is endorsed or sponsored by the ICH must be avoided. Apart from the official use of the ICH logo by the ICH Association and its bodies, the use of the ICH logo is restricted and requires the express permission of ICH, request for which may be addressed to the ICH Secretariat. ICH Members may without written permission use the ICH Member logo (available from the ICH Secretariat) to denote ICH membership within their own publications, presentations or on their website, provided, however, that the disclaimer provided by the ICH Secretariat has been signed by the respective ICH Member. The information, material and photographic content are provided "as is" without warranty of any kind. Likewise, and notwithstanding the provision of ICH permission to use the ICH logo, users of the logo shall acknowledge that access to the logo is provided "as is" without warranty of any kind. In no event shall the ICH or the authors of the original information and material be liable for any claim, damages or other liability arising from or in connection with the use of the information, material, photographic content or ICH logo. The above-mentioned permissions do not apply to content supplied by third parties. Therefore, for documents where the copyright vests in a third party, permission for reproduction must be obtained from this copyright holder. By providing personal data to us and by using our website, you consent to the collection and use of your personal data in accordance with the ICH Privacy Statement.

## Requested per-DTD decisions

For ICH backbone3.2, ICH STF2.2 and US regional3.3, the existing Regulatory Operations/counsel review must record whether the exact artifact and its dependencies may be bundled in outgoing agency submissions, cross-agency/third-party tooling and customer-side caches, with required attribution and any third-party exclusions. The stylesheet and vocabulary terms/dependencies must also be checked. Preserve the agency headers and notices verbatim. Archive the signed packet outside this repository as the existing runbook requires and supply its reference; all decisions here remain **pending**.

The repository and bounded connected Drive searches did not locate an identifiable signed approval or validator license. This is not evidence that none exists elsewhere. Connected title search for DTD/eCTD/eValidator/LORENZ combined with approval/signoff/license/licence/agreement/counsel returned no records. No private search-result content is copied into this packet.

## External validator execution input

The existing Lorenz adapter requires an installed licensed binary or reachable endpoint plus an exact FDA profile, with actual engine version, profile build/version, criteria coverage and report format recorded. No such runtime selectors are configured here. The current FDA table lists criteria4.7 (2026-10-16) and says FDA uses Lorenz25.2. Those are targets for checking the selected engine; they do not prove local licensing, installed version, profile equivalence or code coverage.

Provide configuration through the managed runtime, using the existing `EVALIDATOR_BINARY` or `EVALIDATOR_ENDPOINT`, `EVALIDATOR_PROFILE_FDA`, and documented `EVALIDATOR_ARGS` contract where needed. Do not put secrets in this packet. Reuse `EVALIDATOR_INTEGRATION_SPEC.md` and the current adapter; no new validator wrapper is requested.

## Execution after prerequisites are supplied

1. Acquire only approved official assets and all required dependencies; inspect notices/versions without changing bytes, verify issuer digest scope and measure SHA-256. Complete the existing manifest and source runbook entry.
2. Use the existing qualification harness to generate original and amendment FDA packages. Require actual index/regional/STF DTD execution, complete captured supportive-byte integrity and exact lifecycle link checks. Verify every stylesheet PI resolves to bundled bytes; independently exercise the official stylesheets.
3. Run the configured licensed engine with the documented current FDA profile against those exact package bytes. Preserve full raw reports, engine/profile identity and package hashes. A clean internal subset, missing tool or skipped schema is not external qualification.
4. Perform independent review/human witnessing, then the normal canonical compiler/push gates. Any required FDA ESG test submission/ACK chain is a separately authorized live action with proper test account and certificates; this packet does not initiate one.

The criteria declaration in `qualification/qualify.ts` still names older criteria4.5; file-format version9.3 matches the current FDA table. Do not relabel those references as4.7 without auditing actual implemented/executed coverage. The official grammar and current engine run may expose further corrections (including STF doc-content grammar, typed categories/site properties, most-recent-STF lifecycle and index links required by stylesheet2.3); none is marked passed from examples or synthetic schemas.


FDA public notice, verbatim from https://www.fda.gov/about-fda/about-website/website-policies:

> Unless otherwise noted, the contents of the FDA website (www.fda.gov) — both text and graphics — are not copyrighted. They are in the public domain and may be republished, reprinted and otherwise used freely by anyone without the need to obtain permission from FDA. Credit to the U.S. Food and Drug Administration as the source is appreciated but not required. People are also free to link to any URL on FDA's site. FDA's preference is that people link to the material on the FDA site (rather than copying it to their personal websites) because the agency continuously updates the information on the website as better information becomes available. A person copying documents to another website, instead of linking to them, would then have to monitor the original documents to know when these documents were updated by FDA or else risk giving bad or incorrect advice to visitors to their website. Providing consumers or health professionals with advice that is not fully up to date can lead to serious public health consequences. Providing industry advice that is not fully up to date can lead to companies being out of compliance with regulatory requirements. If a person, nonetheless, decides to copy content or images, FDA strongly recommends that the copied item lists the date that the material was copied and provides a link back to its source on the FDA website. Users can then see for themselves if the copied material has been updated or changed.
