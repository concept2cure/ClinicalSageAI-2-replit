/**
 * The device kit's surface ids — and nothing else.
 *
 * Split out from `MdxSurfaceHost` on purpose. The v2 registry needs this list at
 * module scope to build its entries, and `V2App` imports the registry at module
 * scope; importing it from the host would drag the host — and with it four
 * stylesheets and fourteen surface components — into the entry chunk of every
 * session, including a pharma user's who never opens a device surface. That is
 * the regression `tests/ui/shell-kit-lazy.test.ts` exists to catch, and it
 * caught this.
 *
 * Keep this file free of component and stylesheet imports.
 *
 * @module client/src/concept2cure/mdx/surfaceIds
 */

export const MDX_SURFACE_IDS = [
  // No `device-workstream`. The kit portfolio (surfaces/Overview.tsx) folded into
  // Projects (D2, fold F6, 2026-10-30; decision P-61 item 5): Projects with its
  // MDX filter counts the device portfolio on the server, and the Client Review
  // Room is on each device project's Review step. The old id is a
  // DEEP_LINK_ALIASES entry for `projects` that applies the MDX filter.
  'device-510k',
  'device-pma',
  'device-cer',
  'device-diagnostics',
  'device-clinical-studies',
  'device-software',
  'device-engineering',
  'device-udi',
  'device-postmarket',
  'device-presub',
  // No `device-precedent`. The kit's PrecedentSurface and v2's PrecedentEngine
  // both read `/api/saved-precedent-queries`; the v2 one is 665 lines against
  // four endpoints where the kit's was 198 against two. Two rail entries for the
  // same data is the double-rail problem one level down, so the kit's is deleted
  // and `precedent-intelligence` is the one precedent surface. Same reasoning
  // retired the kit's Templates tab (v2 `template-library`), its AnA Memory
  // surface (v2 `ana-memory`, identical endpoint, itself folded into the
  // conversation on 2026-10-29) and its project home (v2 `project-home`).
  // No `device-vault`. The kit's document vault folded into the Vault (D2,
  // 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/): each
  // project's Governed artifacts branch lists every artifact of the project with
  // its versions and audit, and the old id is a DEEP_LINK_ALIASES entry.
  // No `device-tasks`. The kit's task workbench folded into Tasks (D2,
  // 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/): Tasks
  // reads the same work item by item, and the old id is a DEEP_LINK_ALIASES
  // entry that lands there.
  // No `device-validation`. The organization-wide blocker list retired (D2, fold
  // F5 item 2, 2026-10-29; decision P-61 item 2): a blocker belongs to a filing,
  // from that filing's deterministic readiness (EstarFilingPanel), and the old id
  // is a DEEP_LINK_ALIASES entry for Submission Center.
  // No `device-submission`. The device submission-packages screen folded into
  // Submission Center (D2, fold F5 item 1, 2026-10-30; decision P-61 item 1: one
  // device-filing store, estar_submissions), whose device filings carry a status
  // filter, each draft's gate and each filing's history; the old id is a
  // DEEP_LINK_ALIASES entry that lands there.
  // No `device-analytics`. Device analytics joined Reporting & analytics (D2, fold
  // F4, 2026-10-30; decision P-61 item 3): its status counts, submission pace and
  // AnA draft acceptance rate are the device section of the Reporting overview,
  // over the projects the reader can open, and the old id is a DEEP_LINK_ALIASES
  // entry for `insights`.
] as const;

export type MdxSurfaceId = (typeof MDX_SURFACE_IDS)[number];
