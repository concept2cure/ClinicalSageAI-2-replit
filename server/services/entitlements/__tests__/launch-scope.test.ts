/**
 * Launch scope — the release boundary the rail, catalog and deep links share.
 *
 * WHY THESE TESTS EXIST. `applyLaunchScope` is the one function that turns the
 * list in shared/constants/launch-scope.ts into verdicts. Both wrong
 * directions are real damage: widen, and a surface the release excludes
 * renders from a deep link with the rail silent about it; narrow, and a
 * launch app the customer is paying for goes dark. The mode reader is tested
 * because "unset means on in production" is the whole point of the flag —
 * an operator who forgets it must get the narrow product, not the wide one.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../module-grants.js', () => ({ writeModuleGrant: vi.fn() }));
vi.mock('../../license-manager.js', () => ({ getLicenseInfo: vi.fn(), getModuleCatalog: vi.fn() }));
vi.mock('../../../db', () => ({ query: vi.fn() }));
const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => log }));

import { readLaunchScopeMode, launchScopeEnforced } from '../launch-scope.js';
import { applyLaunchScope, type NavSurfaceEntitlement } from '../navigation-entitlements.js';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '../../../../shared/constants/mdx-project-features';
import {
  LAUNCH_APPS,
  LAUNCH_MODULE_IDS,
  LAUNCH_SURFACE_IDS,
  isLaunchSurface,
} from '../../../../shared/constants/launch-scope';

const v = (id: string, over: Partial<NavSurfaceEntitlement> = {}): NavSurfaceEntitlement => ({
  id,
  label: id,
  entitled: true,
  source: 'included',
  requiredTier: null,
  ...over,
});

describe('readLaunchScopeMode', () => {
  it('unset ⇒ on in production, off elsewhere', () => {
    expect(readLaunchScopeMode({ NODE_ENV: 'production' })).toBe('on');
    expect(readLaunchScopeMode({ NODE_ENV: 'development' })).toBe('off');
    expect(readLaunchScopeMode({})).toBe('off');
  });
  it('explicit values win in either environment', () => {
    expect(readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' })).toBe('off');
    expect(readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'ON ' })).toBe('on');
    expect(launchScopeEnforced({ NODE_ENV: 'test', LAUNCH_SCOPE_ENFORCE: 'on' })).toBe(true);
  });
  it('an explicit off in production is said once, as an error; off elsewhere and on are quiet', async () => {
    vi.resetModules(); // a fresh module: the line is logged once per process
    const fresh = await import('../launch-scope.js');
    log.error.mockClear();
    fresh.readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'off' });
    fresh.readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'on' });
    fresh.readLaunchScopeMode({ NODE_ENV: 'production' });
    expect(log.error).not.toHaveBeenCalled();
    fresh.readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' });
    fresh.launchScopeEnforced({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(String(log.error.mock.calls[0][0])).toMatch(/LAUNCH_SCOPE_ENFORCE=off in production/);
  });
  it('a value that is neither on nor off refuses to boot in production, and is off elsewhere', () => {
    expect(() => readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'yes' })).toThrow(/on.*off/);
    expect(readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'yes' })).toBe('off');
  });
});

describe('the scope list itself', () => {
  it('reaches MDX as project features without adding app or module grants', () => {
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.modules).toEqual(['projects', 'tasks']);
    for (const id of MDX_PROJECT_FEATURE_SURFACE_IDS) {
      expect(projects.surfaces).toContain(id);
      expect(LAUNCH_MODULE_IDS).not.toContain(id);
      expect(applyLaunchScope([v(id, { source: 'subscribed' })])[0].source).toBe('subscribed');
      const locked = v(id, { entitled: false, source: 'disabled' });
      expect(applyLaunchScope([locked])[0]).toEqual(locked);
    }
    expect(LAUNCH_APPS.map((app) => app.id)).not.toContain('mdx');
  });
  it('has eight apps and every app surface is in the id set', () => {
    expect(LAUNCH_APPS).toHaveLength(8);
    for (const a of LAUNCH_APPS) for (const s of a.surfaces) expect(isLaunchSurface(s)).toBe(true);
  });
  it('CMC / Module 3 is a launch app — decision P-28, 2026-10-12', () => {
    const cmc = LAUNCH_APPS.find((a) => a.id === 'cmc');
    expect(cmc?.label).toBe('CMC / Module 3');
    expect(cmc?.surfaces).toEqual(['cmc']);
    expect(isLaunchSurface('cmc')).toBe(true);
    /* The screen was refused to EVERY organisation before this entry,
       entitled or not: outside the catalog, applyLaunchScope overwrites the
       verdict with a launch-scope lock whatever the licence said. */
    const [locked] = applyLaunchScope([v('cmc', { source: 'subscribed' })]);
    expect(locked.entitled).toBe(true);
    expect(locked.source).toBe('subscribed');
  });
  it('CMC grants NO module, so the professional band still decides who sees it', () => {
    /* provisionLaunchModules writes an explicit grant for every module id in
       the list, and a grant outranks tier permanently. Listing 'cmc' would
       hand the module to every new organisation and overturn the band the
       product owner set on 2026-08-24, whose grandfather grants already cover
       everyone entitled then. Pricing is not a side effect of a scope list. */
    const cmc = LAUNCH_APPS.find((a) => a.id === 'cmc')!;
    expect(cmc.modules).toEqual([]);
    expect(LAUNCH_MODULE_IDS).not.toContain('cmc');
    // And the boundary does not widen it: a tier lock on the surface stands.
    const [out] = applyLaunchScope([
      v('cmc', { entitled: false, source: 'tier', requiredTier: 'professional' }),
    ]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('tier');
    expect(out.requiredTier).toBe('professional');
  });
  it('Reporting & analytics is a launch app — founder decision, 2026-09-26', () => {
    const reporting = LAUNCH_APPS.find((a) => a.id === 'reporting');
    expect(reporting?.label).toBe('Reporting & analytics');
    expect(reporting?.surfaces).toEqual(expect.arrayContaining(['insights', 'compliance-reports']));
    expect(reporting?.modules).toContain('insights');
    expect(isLaunchSurface('insights')).toBe(true);
    expect(isLaunchSurface('compliance-reports')).toBe(true);
    // The verdict the rail reads for the canvas: a grant is kept, never overwritten to launch-scope.
    const [out] = applyLaunchScope([v('insights', { source: 'subscribed' })]);
    expect(out.entitled).toBe(true);
    expect(out.source).toBe('subscribed');
  });
  it('protocol development is in the Authoring app — founder decision, 2026-09-21', () => {
    const authoring = LAUNCH_APPS.find((a) => a.id === 'authoring')!;
    expect(authoring.surfaces).toContain('protocol-dev');
    expect(authoring.modules).toContain('protocol-dev');
    // The verdict the rail and deep link read: never overwritten to launch-scope.
    const [out] = applyLaunchScope([v('protocol-dev', { source: 'master_admin' })]);
    expect(out.entitled).toBe(true);
    expect(out.source).toBe('master_admin');
  });
  it('the authoring engine explainer is outside the scope — swapped out for protocol development', () => {
    expect(isLaunchSurface('authoring-engine')).toBe(false);
    const authoring = LAUNCH_APPS.find((a) => a.id === 'authoring')!;
    expect(authoring.modules).not.toContain('authoring-engine');
    // A bought row is still not in this release.
    const [out] = applyLaunchScope([v('authoring-engine', { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
  });
  it('keeps the Part 11 surface the catalog may never gate', () => {
    // part11-console folded into audit-trail on 2026-10-29 (see 'the folded Part 11 console').
    expect(LAUNCH_SURFACE_IDS.has('audit-trail')).toBe(true);
  });
  // docs/SURFACE_DECISIONS_2026-10-08.md: each was assessed and checked by a
  // skeptic, and none does what its place promises for a real organisation.
  // The seven apps stay; these screens leave them, and their code stays
  // behind the flag.
  it.each([
    ['program-journey', 'projects', 'fixture-demo: empty for every program a client creates'],
    ['filings-catalog', 'projects', 'folded identity: reference discovery and creation live in the New project wizard'],
    ['regulatory-workspace', 'authoring', 'a fixed paragraph where the editor should be'],
    ['template-library', 'authoring', 'a saved template formats no document'],
    ['ectd-coauthor', 'submission-center', 'a second editor whose checks report a fixed failure'],
    ['dossier-map', 'projects', 'retired screen: its tracked records are reached in project Author'],
    ['ectd-publishing', 'submission-center', 'a reference page that publishes nothing'],
    ['qmp', 'qms', 'a plan cannot be given its gates, and nothing reads them'],
  ])('%s is out of the %s app — %s', (surface, app) => {
    const a = LAUNCH_APPS.find((x) => x.id === app)!;
    expect(a.surfaces).not.toContain(surface);
    expect(a.modules).not.toContain(surface);
    expect(isLaunchSurface(surface)).toBe(false);
    // A bought row is still not in this release.
    const [out] = applyLaunchScope([v(surface, { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
  });
  it.each([
    ['ana-command', 'enterprise-only, and says runs are recorded that are not'],
    ['ana-memory', 'shows a store nothing writes, not the memory AnA loads'],
    ['training', 'no path, lesson or certification exists'],
  ])('the shell no longer carries %s — %s', (surface) => {
    expect(isLaunchSurface(surface)).toBe(false);
  });
  it('every app keeps a screen a client can work in', () => {
    for (const a of LAUNCH_APPS) expect(a.surfaces.length).toBeGreaterThan(0);
  });
});

describe('the folded device task workbench', () => {
  it('is in neither project scope list: Tasks holds it (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/. The subset pin in
       'the scope list itself' would pass with the id left in the Projects list
       alone, so this names it. */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.surfaces).not.toContain('device-tasks');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-tasks');
    expect(isLaunchSurface('device-tasks')).toBe(false);
    expect(projects.surfaces).toContain('tasks');
  });
});

describe('the folded Artifacts center and device vault', () => {
  it('are in no scope list and no new grant: the Vault holds both (D2, fold F3, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/. The subset pin in
       'the scope list itself' would pass with either id left in a list, so this
       names them. A new organisation is granted the Vault and not the retired
       module; an existing grant is kept, deprecated, by the catalogue. */
    const vault = LAUNCH_APPS.find((app) => app.id === 'vault')!;
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(vault.surfaces).toEqual(['vault']);
    expect(vault.modules).toEqual(['vault']);
    expect(projects.surfaces).not.toContain('device-vault');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-vault');
    for (const id of ['artifacts-center', 'device-vault']) {
      expect(isLaunchSurface(id), id).toBe(false);
      expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(id);
    }
    expect(LAUNCH_MODULE_IDS).toContain('vault');
  });
});

describe('the folded Part 11 console', () => {
  it('is in no scope list and no grant: Audit trail holds both chain verdicts (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/. It was a shell
       surface, never a catalogue module (21 CFR §11.10(e)); its two functions,
       the audit_events chain's live verdict and AnA reading it, are Audit
       trail's now. Audit trail stays a shell surface the catalog cannot gate. */
    expect(LAUNCH_SURFACE_IDS.has('part11-console')).toBe(false);
    expect(isLaunchSurface('part11-console')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('part11-console');
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('audit-trail');
    expect(isLaunchSurface('audit-trail')).toBe(true);
  });
});

describe('the folded setup', () => {
  it('is in no scope list and no grant: Admin and access → Settings holds the organisation\'s setup (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/. It was a shell surface,
       never a catalogue module; its name and client type, and the gateway,
       session, PDF/A, retention and legal-hold cards, are on admin-console's
       Settings tab. admin-console stays a shell surface the catalog cannot gate. */
    expect(LAUNCH_SURFACE_IDS.has('setup')).toBe(false);
    expect(isLaunchSurface('setup')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('setup');
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('admin-console');
    expect(isLaunchSurface('admin-console')).toBe(true);
  });
});

describe('the folded eCTD publishing reference', () => {
  it('is in no scope list and no grant: eCTD Compile holds the reference (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/. It left the
       Submission Center app on 2026-10-08 ('is out of the submission-center app'
       above); its spec versions, Regional IG OID and vocabularies are eCTD
       Compile's now, which is in that app, so a bought ectd-publishing row can
       buy nothing and the reference needs no grant of its own. */
    const submit = LAUNCH_APPS.find((app) => app.id === 'submission-center')!;
    expect(isLaunchSurface('ectd-publishing')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('ectd-publishing');
    expect(submit.surfaces).toContain('ectd-compile');
    expect(submit.modules).toContain('ectd-compile');
  });
});

describe('the folded billing screen', () => {
  it('is in no scope list and no grant: Licensing holds the invoices, usage keeps the limits (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/. It was a shell surface
       (account administration), never a catalogue module: the second id of the
       usage screen, opening its invoice tab. The invoices are on Licensing for
       billing administrators; usage keeps the session window, weekly caps and
       the enforced rate limits (P-68). Both stay shell surfaces. */
    expect(LAUNCH_SURFACE_IDS.has('billing')).toBe(false);
    expect(isLaunchSurface('billing')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('billing');
    expect(isLaunchSurface('licensing')).toBe(true);
    expect(isLaunchSurface('usage')).toBe(true);
  });
});

describe('the folded AnA memory', () => {
  it('is in no scope list and no grant: the conversation holds what AnA remembers (D2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/. It left the shell on
       2026-10-08 ('the shell no longer carries' above) and was never a catalogue
       module; its two real reads are the conversation's "What AnA remembers".
       The conversation is a launch shell surface, so a bought ana-memory row can
       buy nothing. */
    expect(LAUNCH_SURFACE_IDS.has('ana-memory')).toBe(false);
    expect(isLaunchSurface('ana-memory')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('ana-memory');
    expect(isLaunchSurface('conversation-thread')).toBe(true);
  });
});

describe('the folded risk file, design-control trace and IVDR readiness board', () => {
  it('are in no scope list and no new grant: Engineering and IVDR evidence hold them (D2, folds F1c and F2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/. The
       subset pin in 'the scope list itself' would pass with an id left in one
       list, so this names them. Each was a catalogue module; an existing grant
       is kept, deprecated, by the catalogue, and carries to its target (P-61
       item 4). Neither target is in the Projects app's grants: each keeps its
       own commercial verdict, as every MDX project feature does. */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    for (const id of ['risk', 'design-controls', 'ivd-completeness']) {
      expect(projects.surfaces, id).not.toContain(id);
      expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[], id).not.toContain(id);
      expect(isLaunchSurface(id), id).toBe(false);
      expect(LAUNCH_MODULE_IDS as readonly string[], id).not.toContain(id);
    }
    for (const id of ['device-engineering', 'device-diagnostics']) {
      expect(projects.surfaces, id).toContain(id);
      expect(isLaunchSurface(id), id).toBe(true);
    }
    expect(projects.modules).toEqual(['projects', 'tasks']);
  });
});

describe('the retired organization-wide blocker list', () => {
  it('is in no scope list and no new grant: each filing\'s readiness holds its blockers (D2, fold F5 item 2, 2026-10-29)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/; decision P-61
       item 2. The subset pin in 'the scope list itself' would pass with the id
       left in one list, so this names it. It was a catalogue module; an existing
       grant is kept, deprecated, by the catalogue, and carries to Submission
       Center (P-61 item 4), which its old address opens. */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.surfaces).not.toContain('device-validation');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-validation');
    expect(isLaunchSurface('device-validation')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('device-validation');
    expect(isLaunchSurface('submission-center')).toBe(true);
    expect(projects.modules).toEqual(['projects', 'tasks']);
  });
});

describe('the folded device submission packages', () => {
  it('are in no scope list and no new grant: Submission Center holds the device filings (D2, fold F5 item 1, 2026-10-30)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/; decision P-61
       item 1. The subset pin in 'the scope list itself' would pass with the id
       left in one list, so this names it. It was a catalogue module; an existing
       grant is kept, deprecated, by the catalogue, and carries to Submission
       Center (P-61 item 4). */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.surfaces).not.toContain('device-submission');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-submission');
    expect(isLaunchSurface('device-submission')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('device-submission');
    expect(LAUNCH_APPS.find((app) => app.id === 'submission-center')!.surfaces).toContain('submission-center');
    expect(projects.modules).toEqual(['projects', 'tasks']);
  });
});

describe('the folded device analytics', () => {
  it('is in no scope list and no new grant: Reporting & analytics holds the device section (D2, fold F4, 2026-10-30)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/; decision
       P-61 item 3: device analytics joins Reporting & analytics at its tier,
       over the projects the reader can open. The subset pin in 'the scope list
       itself' would pass with the id left in one list, so this names it. It was
       a catalogue module; an existing grant is kept, deprecated, by the
       catalogue, and carries to Reporting & analytics (P-61 item 4). */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.surfaces).not.toContain('device-analytics');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-analytics');
    expect(isLaunchSurface('device-analytics')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('device-analytics');
    expect(isLaunchSurface('insights')).toBe(true);
    expect(LAUNCH_MODULE_IDS as readonly string[]).toContain('insights');
    expect(projects.modules).toEqual(['projects', 'tasks']);
  });
});

describe('the folded device workstream', () => {
  it('is in no scope list and no new grant: Projects, with its MDX filter, is the device portfolio (D2, fold F6, 2026-10-30)', () => {
    /* docs/evidence/D2-ONE-ANA/2026-10-30/fold-f6-device-workstream/; decision
       P-61 item 5: only figures computed from the project's own records, and the
       Client Review Room admits the project. The subset pin in 'the scope list
       itself' would pass with the id left in the Projects list alone, so this
       names it. It was a catalogue module; an existing grant is kept,
       deprecated, by the catalogue, and carries to Projects (P-61 item 4). */
    const projects = LAUNCH_APPS.find((app) => app.id === 'projects')!;
    expect(projects.surfaces).not.toContain('device-workstream');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-workstream');
    expect(isLaunchSurface('device-workstream')).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain('device-workstream');
    expect(projects.surfaces).toEqual(expect.arrayContaining(['projects', 'project-home']));
    expect(projects.modules).toEqual(['projects', 'tasks']);
  });
});

describe('Submission Center carries the IND lifecycle tools — decision P-32', () => {
  it('the IND lifecycle and forms screen is a feature of Submission Center — decision P-32, 2026-10-15', () => {
    const sc = LAUNCH_APPS.find((a) => a.id === 'submission-center')!;
    expect(sc.surfaces).toContain('ind-checklist');
    expect(isLaunchSurface('ind-checklist')).toBe(true);
    /* It was refused to every organisation before this entry, entitled or
       not; a subscribed verdict now survives. */
    const [out] = applyLaunchScope([v('ind-checklist', { source: 'subscribed' })]);
    expect(out.entitled).toBe(true);
    expect(out.source).toBe('subscribed');
  });
  it('agency questions stay locked until approval is a signed act', () => {
    /* Coordinator decision on P-32 (2026-10-15): the approve route records a
       status with no Part 11 signature, reason or role check, and the FDA
       response package is assembled from those approvals. A bought row is
       still not in this release. */
    const sc = LAUNCH_APPS.find((a) => a.id === 'submission-center')!;
    expect(sc.surfaces).not.toContain('haq-manager');
    expect(LAUNCH_SURFACE_IDS.has('haq-manager')).toBe(false);
    const [out] = applyLaunchScope([v('haq-manager', { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
  });
  it('P-32 grants NO module: the Submission Center modules are its own three plus dispatch-readiness, and the standard tier still decides', () => {
    /* As in P-28: provisionLaunchModules writes an explicit grant for every
       module listed, and a grant outranks tier permanently. The surface is
       listed; its module is not. */
    const sc = LAUNCH_APPS.find((a) => a.id === 'submission-center')!;
    expect(sc.modules).toEqual(['submission-center', 'ectd-compile', 'gateway-transmittals', 'dispatch-readiness']);
    expect(LAUNCH_MODULE_IDS).not.toContain('ind-checklist');
    expect(LAUNCH_MODULE_IDS).not.toContain('haq-manager');
    const [out] = applyLaunchScope([v('ind-checklist', { entitled: false, source: 'tier', requiredTier: 'standard' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('tier');
    expect(out.requiredTier).toBe('standard');
  });
  it('pharmacovigilance, which holds the IND safety-report routes, stays outside the scope (P-32)', () => {
    for (const id of ['pharmacovigilance', 'pv-cockpit', 'safety-narrative']) {
      expect(isLaunchSurface(id), id).toBe(false);
      const [out] = applyLaunchScope([v(id, { source: 'subscribed' })]);
      expect(out.source, id).toBe('launch-scope');
    }
  });
});

describe('applyLaunchScope', () => {
  it('leaves a launch surface verdict untouched, whatever it said', () => {
    const locked = v('vault', { entitled: false, source: 'tier', requiredTier: 'standard' });
    const [out] = applyLaunchScope([locked]);
    expect(out).toEqual(locked);
  });
  it('locks a bought module outside the scope — the boundary never widens', () => {
    const [out] = applyLaunchScope([v('research-admin', { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
    expect(out.requiredTier).toBeNull();
  });
  it('emits a verdict for every registered surface outside the scope that has no catalog row', () => {
    const out = applyLaunchScope([]);
    const ids = new Set(out.map((x) => x.id));
    // Both un-catalogued (contextual) and catalogued-but-absent surfaces appear.
    expect(ids.has('coverage')).toBe(true);
    expect(ids.has('client-portal')).toBe(true);
    expect(ids.has('research-admin')).toBe(true);
    for (const x of out) {
      expect(x.entitled).toBe(false);
      expect(x.source).toBe('launch-scope');
      expect(isLaunchSurface(x.id)).toBe(false);
    }
  });
  it('never emits a launch-scope verdict for a launch surface', () => {
    const out = applyLaunchScope([]);
    for (const id of LAUNCH_SURFACE_IDS) expect(out.find((x) => x.id === id)).toBeUndefined();
  });
});

describe('Submission Readiness is a Submission Center screen — founder decision, 2026-10-17', () => {
  it('is no longer an app of its own', () => {
    expect(LAUNCH_APPS.map((a) => a.id)).not.toContain('submission-readiness');
  });
  it('its surface and module moved to Submission Center, so the readiness verdict stays reachable', () => {
    const sc = LAUNCH_APPS.find((a) => a.id === 'submission-center')!;
    expect(sc.surfaces).toContain('dispatch-readiness');
    expect(sc.modules).toContain('dispatch-readiness');
    expect(isLaunchSurface('dispatch-readiness')).toBe(true);
  });
  it('grants a new organisation exactly the modules it was granted before the fold', () => {
    expect([...LAUNCH_MODULE_IDS].sort()).toEqual(
      [
        // artifacts-center left on 2026-10-29: it folded into the Vault (fold F3), which every new organisation is granted.
        'projects', 'tasks', 'vault', 'document-authoring', 'review', 'protocol-dev',
        'submission-center', 'ectd-compile', 'gateway-transmittals', 'dispatch-readiness', 'quality', 'insights',
      ].sort(),
    );
  });
});
