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
import { IvdSurface } from './surfaces/IvdSurface';
import { ClinicalStudiesSurface } from './surfaces/ClinicalStudiesSurface';
import { SoftwareSurface } from './surfaces/SoftwareSurface';
import { EngineeringSurface } from './surfaces/EngineeringSurface';
import { UdiSurface } from './surfaces/UdiSurface';
import { PostmarketSurface } from './surfaces/PostmarketSurface';
import { AnalyticsSurface } from './surfaces/AnalyticsSurface';
import { VaultSurface } from './surfaces/VaultSurface';
import {
  TasksSurface,
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
import './drafter.css';
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
import { publishShellProject } from '../v2/shellProject';
import { usePublishSurfaceContext } from '../v2/surfaceContext';

/* The id list lives in `./surfaceIds` with no component or stylesheet imports,
   so the v2 registry can read it at module scope without pulling this file —
   and its four stylesheets — into the entry chunk. Re-exported here so the
   host's own callers have one import. */
export { MDX_SURFACE_IDS, type MdxSurfaceId } from './surfaceIds';

/**
 * Which pathway a surface anchors to when the user has not picked a project.
 *
 * Carried over from `App.tsx`'s `programForContext`. Org-scoped surfaces map to
 * null deliberately: they read org-wide lists and anchoring them to an
 * arbitrary program would silently narrow what the user sees.
 */
const PATHWAY_ANCHOR: Partial<Record<MdxSurfaceId, Program['pathway'] | null>> = {
  'device-510k': 'k510',
  'device-pma': 'pma',
  'device-cer': 'cer',
  'device-diagnostics': 'ivdr',
  // Software lifecycle is project-scoped; anchor to a device program so the
  // completeness summary can load when nothing is selected.
  'device-software': 'k510',
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
    blurb: 'the device portfolio overview — program cards and portfolio health KPIs.',
  },
  'device-510k': {
    title: '510(k) pathway',
    blurb:
      'the 510(k) pathway workspace — predicate intelligence, the substantial-equivalence matrix and eSTAR sections.',
  },
  'device-pma': {
    title: 'PMA pathway',
    blurb: 'the PMA pathway workspace — premarket-approval modules for the program in context.',
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
    blurb: 'software documentation completeness for the program in context.',
  },
  'device-engineering': {
    title: 'Device engineering',
    blurb: 'the engineering and design-controls workspace.',
  },
  'device-udi': {
    title: 'UDI and labeling',
    blurb: 'the UDI register.',
  },
  'device-postmarket': {
    title: 'Post-market vigilance',
    blurb: 'postmarket surveillance with its triage queue.',
  },
  'device-presub': {
    title: 'Pre-Sub manager',
    blurb: 'the pre-submission manager.',
  },
  'device-vault': {
    title: 'Document vault',
    blurb: 'device vault artifacts.',
  },
  'device-tasks': {
    title: 'Tasks and reviews',
    blurb: 'the device task workbench.',
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

export interface MdxSurfaceHostProps extends SurfaceViewProps {
  /** Which surface to render. Supplied by the registry entry, not by state. */
  nav: MdxSurfaceId;
}

export function MdxSurfaceHost({ nav, onAsk, onNav }: MdxSurfaceHostProps) {
  const liveProgramsResult = useMdxPrograms();
  const programs = liveProgramsResult.programs ?? [];

  /**
   * The open project, from the shell's selection.
   *
   * `window.C2C_PROJECT.id` is the `regulatory_programs` UUID, and MDX programs
   * come from `/api/regulatory-programs` — the same table — so the ids match
   * directly. When nothing is selected the pathway anchor above stands in, which
   * is what the surfaces did before via their own selection state.
   */
  const programForContext = React.useMemo<Program | null>(() => {
    const selectedId = typeof window !== 'undefined' ? window.C2C_PROJECT?.id : undefined;
    if (selectedId) {
      const match = programs.find((p) => String(p.id) === String(selectedId));
      if (match) return match;
    }
    const anchor = PATHWAY_ANCHOR[nav];
    if (!anchor) return null;
    const match = programs.find((p) => p.pathway === anchor);
    if (match) return match;
    // No `?? programs[0]`. An earlier version fell back to the first program of
    // ANY pathway, so an org with no PMA opened the PMA surface showing a
    // 510(k) program's modules and trial metrics — the wrong dossier under the
    // right heading. Only `device-software` may borrow another program, because
    // the software lifecycle is genuinely cross-pathway and its own comment in
    // PATHWAY_ANCHOR says so; every other surface reports nothing rather than
    // something false.
    return nav === 'device-software' ? programs[0] ?? null : null;
  }, [programs, nav]);

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
        publishShellProject({ id: String(prog.id), title: prog.title });
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
  const openEditor = React.useCallback(
    (section?: EditorSectionRef) => {
      if (typeof window !== 'undefined' && programForContext) {
        // REPLACE, never merge — same rule and same reason as openProgram above.
        publishShellProject({ id: String(programForContext.id), title: programForContext.title });
      }
      const docType = programForContext?.pathway ?? PATHWAY_ANCHOR[nav] ?? null;
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
   * honesty rule above: only `device-software` may borrow a program; every
   * other surface reports nothing rather than something false. No leaf-level
   * counts are published — the host does not hold them.
   */
  const programCount = programs.length;
  const anaContext = React.useMemo(() => {
    const meta = DEVICE_SCREEN_META[nav];
    if (liveProgramsResult.loading) {
      return {
        summary: `${meta.title} — the regulatory-program read is still loading; nothing program-scoped is final yet.`,
        facts: { screen: nav },
        availableActions: DEVICE_SCREEN_ACTIONS,
      };
    }
    if (liveProgramsResult.error) {
      return {
        summary: `${meta.title} — the regulatory programs could not be read — program-scoped content is missing because of a failure, not because none exists.`,
        facts: { screen: nav },
        availableActions: DEVICE_SCREEN_ACTIONS,
      };
    }
    return {
      summary:
        `${meta.title} — ${meta.blurb}` +
        (programForContext
          ? ` Program in context: ${programForContext.title}.`
          : ' No device program is in context; program-scoped registers show their empty states.'),
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

  /*
   * One builder, sixteen literal publish calls. The AnA coverage gate counts
   * single-quoted literal surface ids, so a single dynamic
   * `usePublishSurfaceContext(nav, …)` would register as covering nothing —
   * this is the sanctioned multi-id shape from v2/surfaces/UsageBilling.tsx.
   * Only the call whose id matches `nav` publishes; the store treats the
   * fifteen null calls as no-ops (each clears only its own id), and hook order
   * stays fixed because every call runs unconditionally on every render.
   */
  usePublishSurfaceContext('device-workstream', nav === 'device-workstream' ? anaContext : null);
  usePublishSurfaceContext('device-510k', nav === 'device-510k' ? anaContext : null);
  usePublishSurfaceContext('device-pma', nav === 'device-pma' ? anaContext : null);
  usePublishSurfaceContext('device-cer', nav === 'device-cer' ? anaContext : null);
  usePublishSurfaceContext('device-diagnostics', nav === 'device-diagnostics' ? anaContext : null);
  usePublishSurfaceContext('device-clinical-studies', nav === 'device-clinical-studies' ? anaContext : null);
  usePublishSurfaceContext('device-software', nav === 'device-software' ? anaContext : null);
  usePublishSurfaceContext('device-engineering', nav === 'device-engineering' ? anaContext : null);
  usePublishSurfaceContext('device-udi', nav === 'device-udi' ? anaContext : null);
  usePublishSurfaceContext('device-postmarket', nav === 'device-postmarket' ? anaContext : null);
  usePublishSurfaceContext('device-presub', nav === 'device-presub' ? anaContext : null);
  usePublishSurfaceContext('device-vault', nav === 'device-vault' ? anaContext : null);
  usePublishSurfaceContext('device-tasks', nav === 'device-tasks' ? anaContext : null);
  usePublishSurfaceContext('device-validation', nav === 'device-validation' ? anaContext : null);
  usePublishSurfaceContext('device-submission', nav === 'device-submission' ? anaContext : null);
  usePublishSurfaceContext('device-analytics', nav === 'device-analytics' ? anaContext : null);

  let surface: React.ReactNode;
  switch (nav) {
    case 'device-510k':
      surface = <K510Surface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} />;
      break;
    case 'device-pma':
      surface = <PmaSurface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} />;
      break;
    case 'device-cer':
      surface = <CerSurface program={programForContext} onAskAna={onAsk} onOpenEditor={openEditor} />;
      break;
    case 'device-diagnostics':
      surface = (
        <IvdSurface
          program={programForContext}
          onAskAna={onAsk}
          onOpenEditor={openEditor}
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
      surface = <EngineeringSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-udi':
      surface = <UdiSurface onAskAna={onAsk} />;
      break;
    case 'device-postmarket':
      surface = <PostmarketSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-presub':
      surface = <PreSubManager onAskAna={onAsk} />;
      break;
    case 'device-vault':
      surface = <VaultSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-tasks':
      surface = <TasksSurface onAskAna={onAsk} />;
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
        <EmptyState busy title="Loading device programs" testId="mdx-programs-loading" />
      ) : liveProgramsResult.error ? (
        <ErrorState
          variant="panel"
          title="Couldn't load your device programs"
          message={liveProgramsResult.error}
          retry={liveProgramsResult.refresh}
          testId="mdx-programs-error"
        />
      ) : (
        <Overview programs={programs} onOpenProgram={openProgram} onAskAna={onAsk} />
      );
      break;
  }

  /*
   * The scope root. Not optional, and not decoration.
   *
   * Every rule in app.css, pathway-tabs.css, files-tree.css and drafter.css is
   * scoped under `.mdx-shell` — 1,067/1,067, 247/247, 73/73 and 188/188 as of
   * the surfaces.css port, measured with a CSS parser rather than counted by
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
        <div className="page-inner">{surface}</div>
      </div>
    </div>
  );
}
