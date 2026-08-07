/**
 * The device kit's surface ids — and nothing else.
 *
 * Split out from `MdxSurfaceHost` on purpose. The v2 registry needs this list at
 * module scope to build its entries, and `V2App` imports the registry at module
 * scope; importing it from the host would drag the host — and with it four
 * stylesheets and sixteen surface components — into the entry chunk of every
 * session, including a pharma user's who never opens a device surface. That is
 * the regression `tests/ui/shell-kit-lazy.test.ts` exists to catch, and it
 * caught this.
 *
 * Keep this file free of component and stylesheet imports.
 *
 * @module client/src/concept2cure/mdx/surfaceIds
 */

export const MDX_SURFACE_IDS = [
  'device-workstream',
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
  // surface (v2 `ana-memory`, identical endpoint) and its project home
  // (v2 `project-home`).
  'device-vault',
  'device-tasks',
  'device-validation',
  'device-submission',
  'device-analytics',
] as const;

export type MdxSurfaceId = (typeof MDX_SURFACE_IDS)[number];
