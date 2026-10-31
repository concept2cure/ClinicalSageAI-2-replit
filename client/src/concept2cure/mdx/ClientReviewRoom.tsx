/**
 * The Client Review Room, drawn for one project inside the device kit's scope
 * root (D2, fold F6, 2026-10-30; decision P-61 item 5).
 *
 * The room (components/ClientReviewZone.tsx over GET /api/mdx/client-review) was
 * drawn on the kit portfolio, mdx/surfaces/Overview.tsx, with no project, so it
 * read the organization's room. The portfolio folded into Projects; the room is
 * mounted on the device project's Review step (v2/surfaces/ProjectClientReview,
 * which loads this module lazily) and always names the project: its verified
 * integer id and its program, both of which the route admits before anything
 * is read or shared (server/routes/mdx-client-review.ts, admitRoom).
 *
 * `.mdx-shell` is the kit's scope root: every rule the room's markup uses lives
 * under it in app.css, which this module imports so that a page outside the
 * kit's host still draws it styled. It is loaded only with this module, never
 * in the entry chunk (tests/ui/shell-kit-lazy.test.ts).
 *
 * @module client/src/concept2cure/mdx/ClientReviewRoom
 */
import * as React from 'react';
import './app.css';
import { ClientReviewZone } from './components/ClientReviewZone';

export interface ClientReviewRoomProps {
  /** The project's regulatory_programs UUID. */
  programId: string;
  /** The project's integer projects.id, verified against the program. */
  projectId: number;
}

export function ClientReviewRoom({ programId, projectId }: ClientReviewRoomProps) {
  return (
    <div className="mdx-shell" data-surface="true">
      <ClientReviewZone projectId={projectId} programId={programId} />
    </div>
  );
}
