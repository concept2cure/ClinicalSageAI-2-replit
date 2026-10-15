Concept2Cure Data Room and AnA study — supporting evidence
Research date: 14 October 2026
Repository: concept2cure/ClinicalSageAI-2-replit
Branch: concept2cure-v2
Commit: 87b27c897c5d1be20b0527009bcaf425ebbf3af6

The PDF, DOCX and Markdown contain the consolidated recommendations.
The supporting notes preserve the detailed competitor, regulator, AI architecture
and current-code evidence. Regulatory notes include additional jurisdictions;
the final assessment prioritizes the USA, Europe, Japan, Canada and Australia.

catalog-context-probe-result.json is fresh output from the actual catalog core.
To repeat it, place catalog-context-probe.mjs in docs/reports/ in a checkout of
the pinned repository, then run:
  node docs/reports/catalog-context-probe.mjs
Use Node with native TypeScript type stripping (Node 22.18+ or Node 24).
The probe uses synthetic data, no database or model credentials, and makes no writes.

Evidence levels:
- Code findings show implementation at the pinned commit.
- Static failure-path findings are not claims of reproduced production incidents.
- Historical test artifacts are not fresh runs at this commit.
- Vendor marketing and release/preview/customer-case evidence are distinguished.
- Proposed features and acceptance criteria are not shipped improvements.

Repository documents created locally:
  docs/reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md
  docs/reports/data-room-catalog-context-probe.mjs
No push, application deployment, tenant mutation or agency submission was performed.

