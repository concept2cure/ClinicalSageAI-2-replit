# Reporting legal chooser completion — W1 / D2

Discovery source: `9f8cae7f0` on `concept2cure-v2`. Status: inventory complete;
qualification pending. Contract:
`docs/design/REPORTING_LEGAL_CHOOSER_COMPLETION_2026-10-23.md`.

## What already exists

`InsightsLegalPackage.tsx` already explicitly selects up to 50 eligible legal
originals and downloads the canonical report ZIP, but reads the whole company
profile into an unpaged list. `InsightsBundlesPanel.tsx` reaches it.
`company-documents/PagedCompanyLegalPicker.tsx` already supports 25-row search,
kind filters and cross-page IDs for legal requirements/lifecycle forms.
`server/routes/company-legal-inventory.ts` and
`server/services/company-documents/legal-inventory.ts` already provide that
paged exact-version inventory with current program access and source refusals.
`companySession.ts` / `useCompanyLegalResource.ts` already guard canonical owners
and scope visits. `InsightsPackageStationery.tsx` already pages published designs.
`server/services/report-os/report-package.ts` and `server/routes/report-os.ts`
already enforce distinct IDs, current legal access/approval/hash and unchanged
original bytes, ZIP integrity, size and export audit.

Searches covered alternate companion/package/library/picker/letterhead names,
current claims, reachable callers, routes/services/shared contracts/migrations
and deleted InsightsLegal/CompanyLegalPicker/legal-package/report-package history.
No competing completion or deleted predecessor was found. Existing report and
company workflow tests cover ordinary exports and shared cross-page selection;
the report-specific paging, cap and current-owner integration are the gap.

## Qualification record

Pending. Local mounted checks do not establish production deployment or agency
acceptance. No server export policy or company registry change is planned.
