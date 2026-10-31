/**
 * The Client Review Room on a device project's Review step (D2, fold F6,
 * 2026-10-30; decision P-61 item 5; .design/client-journey/FUNCTION_PARITY.md,
 * "From `device-workstream`": "Client Review Room ... Goes to: a mount on
 * Project home that passes the integer projects.id").
 *
 * The room is the device kit's (mdx/ClientReviewRoom.tsx over
 * mdx/components/ClientReviewZone.tsx), so it is loaded lazily, with the kit's
 * stylesheet, only when a device project's Review step is open. It reads only
 * once the project is verified: `projectId` is Project home's verified integer
 * project (useProjectTeam), and the route admits it and the program before
 * anything is read or shared. Without both it reads and draws nothing.
 */
import React from 'react';
import { EmptyState } from '../dataConnect';

const Room = React.lazy(() =>
  import('../../mdx/ClientReviewRoom').then((m) => ({ default: m.ClientReviewRoom })),
);

export function ProjectClientReview({ programId, projectId }: { programId: string | null; projectId: number | null }) {
  if (!programId || projectId == null) return null;
  return (
    <React.Suspense fallback={<EmptyState busy title="Loading the client review room" />}>
      <Room programId={programId} projectId={projectId} />
    </React.Suspense>
  );
}
