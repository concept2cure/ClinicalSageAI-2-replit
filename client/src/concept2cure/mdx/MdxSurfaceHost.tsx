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
        window.C2C_PROJECT = { ...(window.C2C_PROJECT ?? {}), id: String(prog.id), title: prog.title };
      }
      onNav('project-home');
    },
    [onNav],
  );

  /** The authoring shell is the one editor; the shell owns the layout swap. */
  const openEditor = React.useCallback((docType: string) => onNav(`document-authoring#${docType}`), [onNav]);

  let surface: React.ReactNode;
  switch (nav) {
    case 'device-510k':
      surface = <K510Surface program={programForContext} onAskAna={onAsk} onOpenEditor={() => openEditor('k510')} />;
      break;
    case 'device-pma':
      surface = <PmaSurface program={programForContext} onAskAna={onAsk} onOpenEditor={() => openEditor('pma')} />;
      break;
    case 'device-cer':
      surface = <CerSurface program={programForContext} onAskAna={onAsk} />;
      break;
    case 'device-diagnostics':
      surface = (
        <IvdSurface
          program={programForContext}
          onAskAna={onAsk}
          onOpenEditor={() => openEditor('device-diagnostics-workbench')}
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
      surface = liveProgramsResult.loading ? (
        <div role="status">Loading device programs…</div>
      ) : liveProgramsResult.error ? (
        <div role="alert">Device program data is unavailable. {liveProgramsResult.error}</div>
      ) : (
        <Overview programs={programs} onOpenProgram={openProgram} onAskAna={onAsk} />
      );
      break;
  }

  /*
   * The scope root. Not optional, and not decoration.
   *
   * Every rule in app.css, pathway-tabs.css, files-tree.css and drafter.css is
   * scoped under `.mdx-shell` — 845 of app.css's 846 rules, and 100% of the
   * other three. The class is what makes any of the kit's styling apply, and it
   * also carries the custom-property block those rules read. Without an element
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
