/**
 * The device-and-diagnostics surfaces, rendered inside the v2 shell.
 *
 * ── What this replaces ────────────────────────────────────────────────────────
 * `mdx/App.tsx` was a second application. It drew its own Rail, TopBar, TabBar,
 * AnA rail and ⌘K palette, held its own `activeNav` in localStorage, and ran its
 * own `useAnaChat` conversation. It mounted in two places: as a top-level route,
 * and — via `v2/surfaces/DeviceWorkstream` — INSIDE `.c2c-v2 .shell`, which
 * draws a Rail and a TopBar of its own. Five shipping surfaces therefore
 * rendered two rails, two topbars and two AnA composers at once.
 *
 * There is one shell. It is v2's. This module contributes surfaces to it, the
 * way `v2/surfaces/QualityModule` already does for the quality kit.
 *
 * ── What that changes, concretely ─────────────────────────────────────────────
 * `activeNav` is gone: the surface id v2 routed to IS the nav. Rail collapse,
 * AnA open/mode and ⌘K state are gone — the shell owns all four. `useAnaChat` is
 * gone; `onAsk` from `SurfaceViewProps` pushes into the shell's one
 * conversation, so a question asked on a device surface lands in the same
 * thread as one asked anywhere else. That was the "one shell, one composer"
 * rule, and it is now structural rather than aspirational.
 *
 * Program context comes from `window.C2C_PROJECT`, the selection every other v2
 * surface reads, instead of a `selectedProgram` this module kept to itself. Two
 * places holding "the open project" is the same defect as two rails, one level
 * down.
 *
 * @module client/src/concept2cure/mdx/MdxSurfaceHost
 */

import * as React from 'react';
import { isIvdFamily } from '@shared/constants/domain/product-types';

import type { SurfaceViewProps } from '../v2/surfaceViews';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import {
  clearEditorTarget,
  setEditorTarget,
  type EditorSectionRef,
} from '../v2/editorTarget';
import { Overview } from './surfaces/Overview';
import { K510Surface } from './surfaces/K510Surface';
import { PmaSurface } from './surfaces/PmaSurface';
import { CerSurface } from './surfaces/CerSurface';
import { IvdSurface, type IvdReadinessReport } from './surfaces/IvdSurface';
import { ClinicalStudiesSurface } from './surfaces/ClinicalStudiesSurface';
import { SoftwareSurface } from './surfaces/SoftwareSurface';
import { EngineeringSurface } from './surfaces/EngineeringSurface';
import type { EngineeringPanelsContext } from './surfaces/engineeringPanelsContext';
import { UdiSurface } from './surfaces/UdiSurface';
import { PostmarketSurface } from './surfaces/PostmarketSurface';
import { AnalyticsSurface } from './surfaces/AnalyticsSurface';
import {
  ValidationSurface,
  SubmissionsSurface,
} from './workbench/Workbench';
import { PreSubManager } from './presub/PreSubManager';
import { type Program } from './data/programs';
import { useMdxPrograms } from './hooks/useMdxPrograms';
import type { MdxSurfaceId } from './surfaceIds';

import './app.css';
import './pathway-tabs.css';
import './files-tree.css';
/* LAST, deliberately. `surface-text-ramp.css` re-bases `--text-400` /
   `--text-300` on every element that establishes a tinted surface, so it has to
   load after the sheets that declare those surfaces — a custom property set
   earlier in the cascade would be overwritten by the rule it is correcting.
   This is the mdx/ slice: one generated sheet per shell tree, because Vite keeps
   every shell CSS chunk in <head> for the session and a class defined in two
   trees is a page-wide collision (ci:check-shell-css-collisions).
   GENERATED: scripts/design/generate-surface-text-ramp.mjs, drift-checked by
   ci:surface-text-ramp. See GA ledger L102. */
import './surface-text-ramp.css';
import { publishShellProject, useShellProject } from '../v2/shellProject';
import { usePublishSurfaceContext, type SurfaceContext } from '../v2/surfaceContext';
import { openNewProject } from '../v2/surfaceActions';
import { openLetterInCommunication } from '../v2/surfaces/cmcAgencyQuestions';

/* The id list lives in `./surfaceIds` with no component or stylesheet imports,
   so the v2 registry can read it at module scope without pulling this file —
   and its four stylesheets — into the entry chunk. Re-exported here so the
   host's own callers have one import. */
export { MDX_SURFACE_IDS, type MdxSurfaceId } from './surfaceIds';

/**
 * Document type a pathway feature opens in the shared editor. This never
 * selects a project; project identity comes only from the shell selection.
 */
const PATHWAY_ANCHOR: Partial<Record<MdxSurfaceId, Program['pathway'] | null>> = {
  'device-510k': 'k510',
  'device-pma': 'pma',
  'device-cer': 'cer',
  'device-diagnostics': 'ivdr',
};

/**
 * What each device screen IS, for AnA's screen-state channel — the title in the
 * words the surface's own heading uses, and a one-line blurb describing what
 * the leaf renders. Blurbs describe the screen; they never claim data values —
 * the host does not hold the leaves' counts, and absent beats guessed.
 */
const DEVICE_SCREEN_META: Record<MdxSurfaceId, { title: string; blurb: string }> = {
  'device-workstream': {
    title: 'Device portfolio',
    blurb: 'the device portfolio overview — project cards and portfolio health KPIs.',
  },
  'device-510k': {
    title: '510(k) pathway',
    blurb:
      'the 510(k) pathway workspace — predicate intelligence, the substantial-equivalence matrix and eSTAR sections.',
  },
  'device-pma': {
    title: 'PMA pathway',
    blurb: 'the PMA pathway workspace — premarket-approval modules for the project in context.',
  },
  'device-cer': {
    title: 'Clinical Evaluation Report',
    blurb: 'the CER pathway workspace for clinical evaluation under EU MDR.',
  },
  'device-diagnostics': {
    title: 'IVD pathway',
    blurb: 'the IVD pathway workspace for in-vitro diagnostic programs.',
  },
  'device-clinical-studies': {
    title: 'Clinical studies',
    blurb: 'the clinical studies register for device programs.',
  },
  'device-software': {
    title: 'Software lifecycle',
    blurb: 'software documentation completeness for the project in context.',
  },
  'device-engineering': {
    title: 'Device engineering',
    blurb: 'the engineering and design-controls workspace.',
  },
  'device-udi': {
    title: 'UDI and labeling',
    blurb: "the project's labels and UDI records, with the label symbols and translations still open.",
  },
  'device-postmarket': {
    title: 'Post-market vigilance',
    blurb: 'postmarket surveillance with its triage queue.',
  },
  'device-presub': {
    title: 'Pre-Sub manager',
    blurb: "the project's FDA Q-Submissions, with their questions, FDA's feedback and the commitments.",
  },
  'device-validation': {
    title: 'Validation center',
    blurb: 'the validation workbench.',
  },
  'device-submission': {
    title: 'Submission center',
    blurb: 'the submission-packages workbench.',
  },
  'device-analytics': {
    title: 'Analytics',
    blurb: 'device analytics panels.',
  },
};

/**
 * The two things a user can truthfully do from any device screen. No operable
 * screen actions are advertised because none are registered for the device
 * surfaces; governed operations are proposed by AnA in conversation only.
 */
const DEVICE_SCREEN_ACTIONS: string[] = [
  "Ask AnA about what is on this screen — the registers and counts render from the org's live device data",
  'Signatures, transmissions, uploads and profile changes are governed — AnA proposes them in conversation, never through screen controls',
];

/* device-udi and device-presub left this list on 2026-10-29: each reads the
   open project now (D2, device-features-reach-three). device-tasks left the kit
   the same day: it folded into Tasks (D2, fold-device-tasks). */
const ORGANIZATION_VIEWS = new Set<MdxSurfaceId>([
  'device-validation', 'device-submission', 'device-analytics',
]);

type ScreenContext = Omit<SurfaceContext, 'surfaceId'>;

/**
 * device-engineering's context with its two panels': the project's risk
 * register and design-control trace (fold F1 slice B mounted both;
 * EngineeringSurface reports them through `onPanelsContext`). The store holds
 * one context, so they ride this host's one publish rather than a second that
 * would replace it. Merged only when they were read for the project in context:
 * on a project switch the previous project's panels are still held here until
 * the screen reports the next one's, and they are not this project's (D2,
 * 2026-10-29, device-vault-admits-project fix 2).
 */
function withEngineeringPanels(base: ScreenContext, panels: EngineeringPanelsContext | null, program: Program | null): ScreenContext {
  if (!panels || !program || panels.programId !== String(program.id)) return base;
  const { risk, designControls } = panels;
  return {
    summary: `${base.summary} ${risk.summary} ${designControls.summary}`,
    facts: { ...base.facts, riskRegister: risk.facts ?? null, designControlsTrace: designControls.facts ?? null },
    availableActions: [...(base.availableActions ?? []), ...(risk.availableActions ?? []), ...(designControls.availableActions ?? [])],
  };
}

/**
 * device-diagnostics' context with its IVDR readiness board's (fold F2,
 * 2026-10-29: the board and the IVD assessment workbench were the
 * ivd-completeness screen's, which published the readiness under its own id).
 * The store holds one context, so the board's rides this host's one publish, as
 * Engineering's panels do above. Merged only when it was read for the project in
 * context.
 */
function withIvdReadiness(base: ScreenContext, report: IvdReadinessReport | null, program: Program | null): ScreenContext {
  if (!report || !program || report.programId !== String(program.id)) return base;
  const { readiness } = report;
  return {
    summary: `${base.summary} ${readiness.summary}`,
    facts: { ...base.facts, ivdReadiness: readiness.facts ?? null },
    availableActions: [...(base.availableActions ?? []), ...(readiness.availableActions ?? [])],
  };
}

function viewScopeNotice(nav: MdxSurfaceId): string | null {
  if (nav === 'device-postmarket') return 'Reporting clocks are for this project; signals, CAPA board, trends and PMS plan execution are not shown until they are read for this project';
  return ORGANIZATION_VIEWS.has(nav) ? 'Organization-wide view' : null;
}

export interface MdxSurfaceHostProps extends SurfaceViewProps {
  /** Which surface to render. Supplied by the registry entry, not by state. */
  nav: MdxSurfaceId;
}

export function MdxSurfaceHost({ nav, onAsk, onNav }: MdxSurfaceHostProps) {
  const liveProgramsResult = useMdxPrograms();
  const programs = liveProgramsResult.programs ?? [];
  const selectedProject = useShellProject();
  const selectedId = selectedProject?.id == null ? null : String(selectedProject.id);
  const scopeNotice = viewScopeNotice(nav);

  /**
   * The open project, from the shell's selection.
   *
   * `window.C2C_PROJECT.id` is the `regulatory_programs` UUID, and MDX programs
   * come from `/api/regulatory-programs` — the same table — so the ids match
   * directly. A missing or unavailable selection never borrows another
   * project's dossier, including another project on the same pathway.
   */
  const programForContext = React.useMemo<Program | null>(() => {
    return selectedId ? programs.find(p => String(p.id) === selectedId) ?? null : null;
  }, [programs, selectedId]);

  /** Hand a program off to the shell's project home — there is only one. */
  const openProgram = React.useCallback(
    (prog: Program) => {
      if (typeof window !== 'undefined') {
        // REPLACE, never merge. Spreading the previous value kept `code`, `ws`,
        // `status` and `product` from whatever project was open before, and
        // ProjectHome prefers those over the row it fetches — so opening a
        // device program after any other project rendered its Project Home with
        // the PREVIOUS project's submission-type, client-type and status chips.
        // v2/surfaces/Projects.tsx:389 replaces the whole object; this now
        // matches it, and omits keys it cannot honestly supply rather than
        // inheriting stale ones.
        publishShellProject({ id: String(prog.id), title: prog.title, productType: prog.productType });
      }
      onNav('project-home');
    },
    [onNav],
  );

  /**
   * Open the one editor — on the section the click named, when it named one.
   *
   * An earlier version sent `document-authoring#<docType>`: wouter navigates on
   * `location.pathname`, so the fragment never reached the router and every
   * click landed on the editor's default view while the code claimed otherwise.
   * The context now travels the way this shell already moves context between
   * surfaces — a typed window channel plus navigation, the same shape as
   * `window.C2C_PROJECT` (set two callbacks up) and `window.C2C_CONVO`
   * (V2App.startShellConversation):
   *
   *   1. The program hand-off mirrors `openProgram` exactly: REPLACE
   *      `window.C2C_PROJECT` with the program whose section is being opened,
   *      so the editor's document scope, filing outline and data room all
   *      agree on which program the click meant.
   *   2. The section rides `window.C2C_EDITOR_TARGET` (v2/editorTarget.ts,
   *      one-shot, TTL-guarded). `DocumentAuthoring` consumes it on mount and
   *      either opens the named document+section or says honestly that it
   *      could not — never a silent wrong-document open.
   *
   * A click with no section (PmaSurface's plain "Open module editor") CLEARS
   * the channel instead of writing to it, so an older target cannot ride along
   * with a navigation that never named one. With no resolvable program and no
   * section this collapses to the plain navigation it always was — nothing is
   * claimed that cannot be honoured.
   */
  /** A device letter is answered where every letter is: on its record in Communication (P-39 step 3, S2). */
  const openLetter = React.useCallback((letterId: string) => openLetterInCommunication(onNav, letterId), [onNav]);

  const openEditor = React.useCallback(
    (section?: EditorSectionRef) => {
      if (typeof window !== 'undefined' && programForContext) {
        // REPLACE, never merge — same rule and same reason as openProgram above.
        publishShellProject({ id: String(programForContext.id), title: programForContext.title, productType: programForContext.productType });
      }
      const docType = nav === 'device-cer' || nav === 'device-diagnostics'
        ? PATHWAY_ANCHOR[nav] ?? null : programForContext?.pathway ?? PATHWAY_ANCHOR[nav] ?? null;
      if (docType && section && (section.code != null || section.label)) {
        setEditorTarget({
          docType,
          code: section.code,
          label: section.label,
          programId: programForContext ? String(programForContext.id) : null,
          programTitle: programForContext?.title ?? null,
        });
      } else {
        clearEditorTarget();
      }
      onNav('document-authoring');
    },
    [onNav, programForContext, nav],
  );

  /**
   * What AnA can see of the device screen the user is on.
   *
   * Load and failure are stated as themselves — "still loading" and "could not
   * be read" are different claims from "there are no programs", and publishing
   * the wrong one makes AnA confidently wrong. The program named in the
   * context comes only from `programForContext`, which already carries the
   * project-selection rule above: no feature may borrow a program. No leaf-level
   * counts are published — the host does not hold them — except on
   * device-engineering, whose screen hands up its two panels' own context
   * (withEngineeringPanels, below).
   */
  const programCount = programs.length;
  const anaContext = React.useMemo(() => {
    const meta = DEVICE_SCREEN_META[nav];
    if (liveProgramsResult.loading) {
      return {
        summary: `${meta.title} — the projects read is still loading; nothing project-scoped is final yet.`,
        facts: { screen: nav },
        availableActions: DEVICE_SCREEN_ACTIONS,
      };
    }
    if (liveProgramsResult.error) {
      return {
        summary: `${meta.title} — the projects could not be read — project-scoped content is missing because of a failure, not because none exists.`,
        facts: { screen: nav },
        availableActions: DEVICE_SCREEN_ACTIONS,
      };
    }
    return {
      summary:
        `${meta.title} — ${meta.blurb}` +
        (programForContext
          ? ` Project in context: ${programForContext.title}.`
          : ' No device project is in context; project-scoped registers show their empty states.'),
      facts: {
        screen: nav,
        program: programForContext
          ? {
              id: programForContext.id,
              code: programForContext.code,
              title: programForContext.title,
            }
          : null,
        programCount,
      },
      availableActions: DEVICE_SCREEN_ACTIONS,
    };
  }, [nav, liveProgramsResult.loading, liveProgramsResult.error, programForContext, programCount]);

  /* What Engineering's risk register and design-control trace report; null
     when the screen is not mounted (it clears on unmount). */
  const [engineeringPanels, setEngineeringPanels] = React.useState<EngineeringPanelsContext | null>(null);
  const engineeringContext = React.useMemo(
    () => withEngineeringPanels(anaContext, engineeringPanels, programForContext),
    [anaContext, engineeringPanels, programForContext],
  );
  /* What IVDR evidence's readiness board reports; null when the screen is not mounted. */
  const [ivdReadiness, setIvdReadiness] = React.useState<IvdReadinessReport | null>(null);
  const diagnosticsContext = React.useMemo(
    () => withIvdReadiness(anaContext, ivdReadiness, programForContext),
    [anaContext, ivdReadiness, programForContext],
  );

  /*
   * One builder, fourteen literal publish calls. The AnA coverage gate counts
   * single-quoted literal surface ids, so a single dynamic
   * `usePublishSurfaceContext(nav, …)` would register as covering nothing —
   * this is the sanctioned multi-id shape (v2/surfaces/UsageBilling.tsx used it
   * for `usage` and `billing` until billing folded into Licensing, 2026-10-29).
   * Only the call whose id matches `nav` publishes; the store treats the
   * thirteen null calls as no-ops (each clears only its own id), and hook order
   * stays fixed because every call runs unconditionally on every render.
   */
  usePublishSurfaceContext('device-workstream', nav === 'device-workstream' ? anaContext : null);
  usePublishSurfaceContext('device-510k', nav === 'device-510k' ? anaContext : null);
  usePublishSurfaceContext('device-pma', nav === 'device-pma' ? anaContext : null);
  usePublishSurfaceContext('device-cer', nav === 'device-cer' ? anaContext : null);
  usePublishSurfaceContext('device-diagnostics', nav === 'device-diagnostics' ? diagnosticsContext : null);
  usePublishSurfaceContext('device-clinical-studies', nav === 'device-clinical-studies' ? anaContext : null);
  usePublishSurfaceContext('device-software', nav === 'device-software' ? anaContext : null);
  usePublishSurfaceContext('device-engineering', nav === 'device-engineering' ? engineeringContext : null);
  usePublishSurfaceContext('device-udi', nav === 'device-udi' ? anaContext : null);
  usePublishSurfaceContext('device-postmarket', nav === 'device-postmarket' ? anaContext : null);
  usePublishSurfaceContext('device-presub', nav === 'device-presub' ? anaContext : null);
  usePublishSurfaceContext('device-validation', nav === 'device-validation' ? anaContext : null);
  usePublishSurfaceContext('device-submission', nav === 'device-submission' ? anaContext : null);
  usePublishSurfaceContext('device-analytics', nav === 'device-analytics' ? anaContext : null);

  let surface: React.ReactNode;
  switch (nav) {
    case 'device-510k':
      surface = <K510Surface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} onOpenLetter={openLetter} />;
      break;
    case 'device-pma':
      surface = <PmaSurface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} onOpenLetter={openLetter} />;
      break;
    case 'device-cer':
      surface = <CerSurface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} onOpenLetter={openLetter} />;
      break;
    case 'device-diagnostics':
      surface = (
        <IvdSurface
          program={programForContext}
          onAskAna={onAsk}
          onOpenEditor={openEditor}
          onOpenLetter={openLetter}
          onNav={onNav}
          onReadinessContext={setIvdReadiness}
        />
      );
      break;
    case 'device-clinical-studies':
      surface = <ClinicalStudiesSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-software':
      surface = <SoftwareSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-engineering':
      surface = <EngineeringSurface program={programForContext} onAskAna={onAsk} onPanelsContext={setEngineeringPanels} />;
      break;
    case 'device-udi':
      /* Keyed by the project, so a switch starts the read afresh and never
         draws the previous project's labels while the next project's read is in flight. */
      surface = <UdiSurface key={programForContext?.id ?? 'none'} programId={programForContext ? String(programForContext.id) : null} onAskAna={onAsk} />;
      break;
    case 'device-postmarket':
      surface = <PostmarketSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-presub':
      /* Keyed by the project for the same reason as device-udi. */
      surface = <PreSubManager key={programForContext?.id ?? 'none'} programId={programForContext ? String(programForContext.id) : null} onAskAna={onAsk} />;
      break;
    case 'device-validation':
      surface = <ValidationSurface onAskAna={onAsk} />;
      break;
    case 'device-submission':
      surface = <SubmissionsSurface onAskAna={onAsk} />;
      break;
    case 'device-analytics':
      surface = <AnalyticsSurface onAskAna={onAsk} />;
      break;
    case 'device-workstream':
    default:
      // The portfolio. Loading and failure are stated rather than rendered as
      // an empty portfolio, which would read as "you have no programs". Both
      // are assigned rather than returned early, so they go through the same
      // wrapper as everything else — an early return here would escape the
      // scope root and render the status text unstyled.
      /* THE RAW SERVER STRING IS GONE FROM THE LANE'S ENTRY SURFACE.
         This read `{liveProgramsResult.error}` — interpolated verbatim into the
         alert. `useFetchJson` sets that field to `HTTP ${status} ${path}` or to
         a caught exception's message, so the highest-traffic failure in the MDX
         lane rendered an API route, or a driver error, at a regulatory
         director. That is an information-disclosure finding in a regulated
         product, not a cosmetic one, and it is the exact class W0-4 closed
         everywhere else. `<ErrorState>` runs every message through the
         internals filter, so the guarantee holds here by construction rather
         than by remembering.

         It also had no way out. The hook has exposed `refresh` all along and
         nothing called it, so a transient failure on the portfolio left the
         user with a dead screen and no control — UI standards §8. */
      surface = liveProgramsResult.loading ? (
        <EmptyState busy title="Loading device projects" testId="mdx-programs-loading" />
      ) : liveProgramsResult.error ? (
        <ErrorState
          variant="panel"
          title="Couldn't load your device projects"
          message={liveProgramsResult.error}
          retry={liveProgramsResult.refresh}
          testId="mdx-programs-error"
        />
      ) : (
        <Overview programs={programs} onOpenProgram={openProgram} onAskAna={onAsk} onNewProject={() => openNewProject(onNav)} />
      );
      break;
  }

  // The project is the entry point for every MDX feature. Do not mount a leaf
  // against a null program: several older leaves interpret null as org-wide.
  // The portfolio remains the discovery view that opens the chosen project.
  if (nav !== 'device-workstream') {
    if (liveProgramsResult.loading) {
      surface = <EmptyState busy title="Loading this project's MDX context" testId="mdx-project-loading" />;
    } else if (liveProgramsResult.error) {
      surface = <ErrorState variant="panel" title="Couldn't verify this project's MDX context" message={liveProgramsResult.error} retry={liveProgramsResult.refresh} testId="mdx-project-error" />;
    } else if (!programForContext) {
      surface = <section data-testid="mdx-project-required">
        <EmptyState title={selectedId ? 'The selected device or diagnostic project is unavailable' : 'Open a project to continue'}
          hint="Choose the client project from Projects to open its MDX workflow and evidence." />
        <button type="button" className="btn ghost" onClick={() => onNav('projects')}>Open projects</button>
      </section>;
    } else if (nav === 'device-cer' && isIvdFamily(programForContext.productType)) {
      surface = <section data-testid="mdx-per-required">
        <EmptyState title="Diagnostics use a performance evaluation report"
          hint="Open the diagnostic workflow for scientific validity, analytical performance, clinical performance and the IVDR PER." />
        <button type="button" className="btn ghost" onClick={() => onNav('device-diagnostics')}>Open diagnostic evidence</button>
      </section>;
    }
  }

  /*
   * The scope root. Not optional, and not decoration.
   *
   * Every rule in app.css, pathway-tabs.css and files-tree.css is scoped
   * under `.mdx-shell` — 1,067/1,067, 247/247 and 73/73 as of the surfaces.css
   * port (drafter.css, 188/188, went with the AnaDrafter on 2026-10-29), measured with a CSS parser rather than counted by
   * hand. The class is what makes any of the kit's styling apply, and it also
   * carries the custom-property block those rules read. Without an element
   * carrying it, the surfaces render as unstyled markup with no tokens.
   *
   * `data-surface` drops the shell LAYOUT the same class used to carry — a
   * three-column grid at 100vh, which would put the canvas in the rail slot of
   * a shell that no longer exists. `.page` / `.page-inner` are the kit's
   * content measure (max-width 1280, 24/64px padding), which every surface was
   * designed against; they are not chrome.
   */
  return (
    <div className="mdx-shell" data-surface="true">
      <div className="page">
        <div className="page-inner">
          {nav !== 'device-workstream' && programForContext && !liveProgramsResult.loading && !liveProgramsResult.error && (
            <nav aria-label="Project context" className="page-actions">
              <button type="button" className="btn ghost" onClick={() => onNav('project-home')}>Return to project workflow</button>
              <span>{programForContext.title}</span>
              {scopeNotice && <span>{scopeNotice}</span>}
            </nav>
          )}
          {surface}
        </div>
      </div>
    </div>
  );
}
