/** Reach the existing engineering subsection through the canonical one-shot navigation channel. */
import { useEffect, useRef } from 'react';
import { resolveNavigation } from '@shared/navigation';
import { captureAuthoringSession } from '../../v2/editor/authoringCurrentRead';
import { captureShellProjectGuard } from '../../v2/shellProject';
import { consumeNavParams, NAV_PARAMS_EVENT, stashNavParamsForTarget, surfaceLeaveRefusal } from '../../v2/navParams';

export type EngineeringPanel = 'risk' | 'design-controls';
const guardedEntries = new WeakMap<object, () => boolean>();
const isPanel = (value: unknown): value is EngineeringPanel => value === 'risk' || value === 'design-controls';

/** Adds no authority: Engineering still admits the current project before drawing its records. */
export function openEngineeringPanel(programId: string, panel: EngineeringPanel, onNav: (id: string) => void): void {
  if (!surfaceLeaveRefusal()) {
    const resolved = resolveNavigation('device-engineering', { engineeringPanel: panel, programId });
    if (!resolved.ok) return;
    const session = captureAuthoringSession(), projectCurrent = captureShellProjectGuard();
    stashNavParamsForTarget(resolved.directive.targetId, resolved.directive.params);
    if (window.C2C_NAV_PARAMS) guardedEntries.set(window.C2C_NAV_PARAMS, () => session.sameRevision() && projectCurrent());
  }
  onNav('device-engineering');
}

/** Native heading focus works on a new mount and on repeated moves to the already open feature. */
export function useEngineeringPanelTarget(programId: string | null) {
  const risk = useRef<HTMLHeadingElement>(null), designControls = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const receive = () => {
      const entry = window.C2C_NAV_PARAMS;
      const current = entry ? guardedEntries.get(entry) : undefined;
      const params = consumeNavParams('device-engineering');
      if (!params || !programId || !isPanel(params.engineeringPanel) || surfaceLeaveRefusal()) return;
      if (params.programId && params.programId !== programId || current && !current()) return;
      const heading = params.engineeringPanel === 'risk' ? risk.current : designControls.current;
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    };
    receive();
    window.addEventListener(NAV_PARAMS_EVENT, receive);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, receive);
  }, [programId]);
  return { risk, designControls };
}
