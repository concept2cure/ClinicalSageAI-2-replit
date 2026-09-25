/**
 * The floor and ceiling for a reason for change, one definition for both sides.
 *
 * The server validates with it (server/routes/governed-reason.ts); a dialog
 * uses it to say, before a click, what the server would refuse. Eight
 * characters is the floor protocol development, review, QMS and the authoring
 * endpoints already apply. Several surfaces still restate it as a local `8`;
 * new code imports it from here.
 */
export const GOVERNED_REASON_MIN = 8;
export const GOVERNED_REASON_MAX = 2000;
