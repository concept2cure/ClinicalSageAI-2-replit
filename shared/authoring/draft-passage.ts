/**
 * A passage of a saved section, for alternatives to it alone
 * (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4). One vocabulary for the editor that
 * reads the selection, the review panel and the draft route that admits it.
 */

/** Words selected in the editor, and the text either side that names where they stand. */
export interface DraftPassage { quote: string; prefix: string; suffix: string }

/** The longest selection alternatives are drafted for. */
export const MAX_PASSAGE_CHARS = 2000;
/** The longest context, either side, the draft route takes. */
export const MAX_PASSAGE_CONTEXT_CHARS = 300;
/** The context, either side, the editor sends: enough to name one place, short enough to survive edits nearby. */
export const PASSAGE_CONTEXT_CHARS = 60;
