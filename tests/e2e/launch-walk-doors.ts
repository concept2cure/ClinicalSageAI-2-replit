import { DEVICE_DOORS, STEP_DOORS } from '../../client/src/concept2cure/v2/projectDoors';

// These names belong to buttons that navigate in ProjectHome/ProjectMdxWorkflow.
// Their job names can end in a lower-case place, or start with Run/Export while
// opening the feature that owns the job. Only exact known names bypass the
// mutation exclusion below; similarly prefixed actions still stay untouched.
const NAMED_DOORS = new Set<string>([
  ...Object.entries(STEP_DOORS).flatMap(([key, value]) =>
    key !== 'yourTasksHeading' && typeof value === 'string' ? [value] : []),
  ...Object.values(DEVICE_DOORS).flatMap(value => typeof value === 'string' ? [value] : []),
  ...Object.values(DEVICE_DOORS.pathway).flatMap(pathway => Object.values(pathway)),
]);

/** A door leaves the step and names the place it opens. */
const DOOR = /\b(in|on|to)\s+(the\s+)?[A-Z][\w &/().-]*$|\bin the protocol workspace$|^Open\b|^See\b|^Check what stops sending$/;
/** Buttons that change records or open a form; the walk never presses them. */
const NOT_A_DOOR = /^(Assign|Create|Add a market|Delete|Remove|Send|Save|Approve|Sign|Upload|Attach|Revoke|Invite|Start|Run|Generate|Draft|Compile|Export|Download|Work with AnA|Prepare this work with AnA|Ask AnA)/;

export function isLaunchWalkDoor(name: string): boolean {
  return !!name && name.length < 120 &&
    (NAMED_DOORS.has(name) || (DOOR.test(name) && !NOT_A_DOOR.test(name)));
}
