/**
 * Reporting -- protocol-analysis document producer (ported from
 * reporting.jsx), not a chart dashboard: analyzes a protocol against the
 * CSR intelligence library and writes design recommendations, statistical
 * insights and an IND-readiness memo as real prose.
 *
 * Coordination note: this exact surface was already ported, verbatim, as
 * ReportEngine.tsx (same server/routes/analytics-routes.ts grounding, same
 * ported markdown generators, same registration id 'report-engine' in
 * surfaceViews.ts). Re-implementing reporting.jsx's ~250 lines of
 * generator logic a second time here would duplicate ReportEngine.tsx and
 * risk the two copies drifting apart, so this module re-exports the
 * existing surface under the kit's original component name
 * (`ReportingAnalytics`) instead of shipping a second implementation.
 * ReportEngine.tsx remains the single source of truth and the one wired
 * into SURFACE_VIEWS.
 */
export { ReportEngine, ReportEngine as ReportingAnalytics } from './ReportEngine';
