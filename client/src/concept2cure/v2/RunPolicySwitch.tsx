/**
 * RunPolicySwitch — "Between steps": does AnA stop for you before each further
 * step (Manual), or keep going until she judges the task done (Auto)?
 *
 * A SEPARATE control from Ask / Agent. That one is the Live Drive preference —
 * who operates the screens (Shell.tsx `agent`, pinned by anaRailActions.test.tsx)
 * — and this is the run policy the server enforces between steps (row 74):
 * sent as `run_policy` on the shell chat's turns, read by the stream's round
 * budget, stop directive, hold and checkpoint (services/ana/turn-run-policy.ts).
 * Neither changes what the other does.
 *
 * Reads the preference from RunPolicyContext (provided by V2App beside the
 * Live Drive controls); renders nothing outside the shell, on the
 * LiveDriveSwitch pattern. Two variants: 'menu' (the rail's control menu,
 * each option with its description) and 'foot' (beside a composer).
 *
 * RunPolicyDockNote is the one line a dock with its OWN chat shows: those
 * chats send no policy, so neither Manual nor Auto's ceilings reach them, and
 * the person is told so rather than left to assume they do.
 */
import React from 'react';

import { ANA_RUN_POLICIES, type AnaRunPolicy } from '@shared/ana/run-control-limits';
import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { I } from './icons';
import { ANA_RUN_POLICY_COPY } from './registryModel';

export interface RunPolicyValue {
  runPolicy: AnaRunPolicy;
  setRunPolicy: (policy: AnaRunPolicy) => void;
  /** A turn is running now: a change applies to the next message, not this one. */
  streaming?: boolean;
}

export const RunPolicyContext = React.createContext<RunPolicyValue | null>(null);

/** Arrow keys move the choice (and focus) through the options, wrapping. */
const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Each option is a radio NAMED by its label and DESCRIBED by what it does
 * (aria-describedby), so a screen reader hears "Auto, radio, checked" and then
 * the description, not three sentences as a name. The description sits beside
 * the radio, never inside it: visible under each option in the menu, and in
 * the foot read to assistive technology, with the chosen policy's short line
 * on screen — hover-only words (a title) reach neither keyboard nor touch.
 * The chosen option carries a check mark: never colour alone.
 */
export function RunPolicySwitch({ variant }: { variant: 'menu' | 'foot' }) {
  const ctl = React.useContext(RunPolicyContext);
  const baseId = React.useId();
  const optionRefs = React.useRef<Partial<Record<AnaRunPolicy, HTMLButtonElement | null>>>({});
  if (!ctl) return null;
  const hintId = `${baseId}-hint`;
  const descId = (policy: AnaRunPolicy) => `${baseId}-${policy}-desc`;
  const onKeyDown = (e: React.KeyboardEvent, from: AnaRunPolicy) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const i = ANA_RUN_POLICIES.indexOf(from);
    const next = ANA_RUN_POLICIES[(i + step + ANA_RUN_POLICIES.length) % ANA_RUN_POLICIES.length];
    ctl.setRunPolicy(next);
    optionRefs.current[next]?.focus();
  };
  return (
    <div
      className={`ana-policy ana-policy-${variant}`}
      role="radiogroup"
      aria-label="Between steps"
      aria-describedby={ctl.streaming ? hintId : undefined}
    >
      {variant === 'foot' && (
        <span className="ana-policy-label" aria-hidden="true">
          Between steps
        </span>
      )}
      {ANA_RUN_POLICIES.map((policy) => {
        const copy = ANA_RUN_POLICY_COPY[policy];
        const on = ctl.runPolicy === policy;
        return (
          <React.Fragment key={policy}>
            <button
              ref={(el) => {
                optionRefs.current[policy] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-describedby={descId(policy)}
              tabIndex={on ? 0 : -1}
              className="ana-policy-opt"
              data-on={on ? 'true' : 'false'}
              title={copy.desc}
              onClick={() => {
                if (!on) ctl.setRunPolicy(policy);
              }}
              onKeyDown={(e) => onKeyDown(e, policy)}
            >
              {on && (
                <span className="ana-policy-check" aria-hidden="true">
                  {I.check}
                </span>
              )}
              <span>{copy.label}</span>
            </button>
            {variant === 'menu' ? (
              <span id={descId(policy)} className="ana-policy-desc">
                {copy.desc}
              </span>
            ) : (
              <span id={descId(policy)} style={SR_ONLY_STYLE}>
                {copy.desc}
              </span>
            )}
          </React.Fragment>
        );
      })}
      {variant === 'foot' && (
        <span className="ana-policy-short" aria-hidden="true">
          {ANA_RUN_POLICY_COPY[ctl.runPolicy].short}
        </span>
      )}
      {ctl.streaming && (
        <span className="ana-policy-hint" id={hintId}>
          Applies to your next message
        </span>
      )}
    </div>
  );
}

/**
 * What a dock with its own chat says (see the module note), under each policy.
 * Manual does not reach it — she does not stop between steps there — and
 * neither does Auto's time limit or its stop on an unanswered request: the
 * dock's turn is today's effort-bounded one either way.
 */
export const DOCK_RUN_POLICY_NOTE =
  'Manual applies to the AnA rail and conversation. Here AnA works without stopping between steps, ' +
  'up to her round limit; anything that changes a record still waits for you.';
export const DOCK_AUTO_POLICY_NOTE =
  'Auto applies to the AnA rail and conversation. Here AnA works up to her usual round limit, with no time limit, ' +
  'and an unanswered request does not end her turn; anything that changes a record still waits for you.';

export function RunPolicyDockNote() {
  const ctl = React.useContext(RunPolicyContext);
  if (!ctl) return null;
  return (
    <p className="ana-policy-dock-note" role="note">
      {ctl.runPolicy === 'manual' ? DOCK_RUN_POLICY_NOTE : DOCK_AUTO_POLICY_NOTE}
    </p>
  );
}

/** The current policy's label, for a control that names it ("Ask · Balanced · Auto"); null outside the shell. */
export function useRunPolicyLabel(): string | null {
  const ctl = React.useContext(RunPolicyContext);
  return ctl ? ANA_RUN_POLICY_COPY[ctl.runPolicy].label : null;
}
