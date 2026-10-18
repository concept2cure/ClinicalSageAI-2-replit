# Retained reports: actual browser and download verification

Light and dark desktop (1440 px) and mobile (390 px) passed the actual Bundles
workflow. Each shows both existing-style export actions, downloads the actual
server PDF for reports and manifest modes, and shows the correct Saved filename.
All three have zero page/console errors, zero failed API responses and no body
horizontal overflow. This is real native QA data; no API/permission/PDF mocks
were used. Six received files are retained byte-for-byte with their digests.
Independent owner inspection matches all six files to six distinct export
audit rows by exact SHA/length, payload hash, export identity and page facts.
The tenant chain verifies through 14 rows, and one prior native export stays
separate. `report-pack-browser-audit-validation.json` records the exact facts.

The screenshot/card retains the cream/terracotta visual system and wraps its
long invented QA name and export controls on mobile. The 29-page native packet's
cover, long-table non-final page and final-signature page were separately
visually inspected; the native renderer proof pins the original packet. The current
browser packet retains run 10 as completed and run 9 as final, matching its
audited constituents. Each download has its own actual export ID/time; those
byte digests are distinct from the earlier native packet, whose content/status
qualification remains separate.

The browser uses a separate localhost5001 composition of actual core/auth,
real route registration and Vite. Bootstrap writers/schedulers are omitted;
localhost5000 and its database/env configuration were unchanged. This is not a
full production boot or deployment proof. An initial white-page run was blocked
by the alternate process's exact-origin CORS policy. Its original screenshot,
summary and server logs remain private and qualified; setting only that QA
process's canonical ALLOWED_ORIGINS to its exact localhost origin fixed module
serving. No wildcard or product security policy was changed.

Every non-read API/provider-turn request was blocked at the browser boundary;
none was attempted in the green workflows. Audited PDF GET delivery intentionally
creates its successful export audit record. There were no report generation,
finalization, provider, agency or external-message actions. Private session
credentials are excluded from all artifacts. The component source pins and
composition metadata qualify these observations; they do not establish full
regulatory coverage, clinical/scientific validity, PDF/A or agency acceptance.
