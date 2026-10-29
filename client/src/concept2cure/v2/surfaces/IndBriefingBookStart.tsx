/**
 * The IND screen's FDA meeting briefing book, as an editor document (slice G14,
 * docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md).
 *
 * Until 2026-10-29 the IND screen assembled the book from a form into a
 * read-only preview that could not be saved, reviewed, signed or filed
 * (`canFile: false`), beside the editor's own meeting-package start. Now it starts
 * (or opens) the project's working copy of the meeting package from the
 * built-in registry template — US_PRE_IND, or US_TYPE_A/B/C_MEETING, whose
 * outline is the platform's FDA meeting-package record — through the same
 * `TemplateStart` Project Plan uses. Writing, sources, review and signature are
 * the editor's.
 *
 * @module client/src/concept2cure/v2/surfaces/IndBriefingBookStart
 */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { useScopedDocuments } from '../editor/useScopedDocuments';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import type { AuthoringTemplate } from './AuthoringTemplatePicker';
import { TemplateStart } from './ProjectBiotechPlan';

/** The meeting types the IND screen offers, and the registry entry each package is built from. */
export const MEETING_PACKAGE_REGISTRY: ReadonlyArray<{ value: string; label: string; registryId: string }> = [
  { value: 'pre_ind', label: 'Pre-IND (Type B)', registryId: 'US_PRE_IND' },
  { value: 'type_a', label: 'Type A', registryId: 'US_TYPE_A_MEETING' },
  { value: 'type_b', label: 'Type B', registryId: 'US_TYPE_B_MEETING' },
  { value: 'type_c', label: 'Type C', registryId: 'US_TYPE_C_MEETING' },
];

/** The built-in template for exactly this registry entry; a shared template is not a stand-in. */
export function meetingPackageTemplate(templates: AuthoringTemplate[], registryId: string): AuthoringTemplate | null {
  return templates.find((t) => t.entryId === `registry:${registryId}`) ?? null;
}

const noAssignment = () => null;

export function IndBriefingBookStart({ programId, onOpenDocument, onAsk }: {
  programId: string;
  onOpenDocument: (docId: string) => void;
  onAsk: (text: string) => void;
}) {
  const { user } = useAuth();
  const session = useAuthoringReadSession(user);
  const [meeting, setMeeting] = React.useState(MEETING_PACKAGE_REGISTRY[0].value);
  const [epoch, setEpoch] = React.useState(0);
  const catalog = useLiveData<{ templates: AuthoringTemplate[] }>('/api/authoring/templates', [programId, epoch], undefined,
    { key: JSON.stringify([programId, session.actor, session.key]), current: session.sameRevision });
  const working = useScopedDocuments(programId, 'all');
  const registryId = MEETING_PACKAGE_REGISTRY.find((m) => m.value === meeting)?.registryId ?? 'US_PRE_IND';
  const template = meetingPackageTemplate(catalog.data?.templates ?? [], registryId);

  return (
    <div data-testid="ind-briefing-book-start">
      <p className="indl-dcard-desc">
        The briefing book is written in the editor, from the FDA meeting-package outline for the meeting type: its
        sources, review and signature are the editor&apos;s, and it files from there.
      </p>
      <label className="indl-dcard-desc">
        Meeting type{' '}
        <select className="c2c-input" style={{ height: 28 }} value={meeting} onChange={(e) => setMeeting(e.target.value)}>
          {MEETING_PACKAGE_REGISTRY.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      {(catalog.loading || working.docsState === 'loading') && (
        <EmptyState busy icon={I.fileText} title="Reading the meeting-package template and this project's documents…" />
      )}
      {(catalog.error || working.docsState === 'error') && (
        <EmptyState tone="error" icon={I.alertTriangle} title="The template or this project's documents could not be read"
          retry={() => { if (catalog.error) setEpoch((n) => n + 1); void working.loadDocs(); }} />
      )}
      {!catalog.loading && !catalog.error && working.docsState !== 'loading' && working.docsState !== 'error' && (
        template ? (
          <TemplateStart
            template={template}
            programId={programId}
            docs={working.docsState === 'ready' ? working.docs : []}
            ready={working.docsState === 'ready'}
            refresh={working.refreshCreationContext}
            onOpenDocument={onOpenDocument}
            onAsk={onAsk}
            assignmentOf={noAssignment}
            assignAction={noAssignment}
          />
        ) : (
          <EmptyState icon={I.fileText} title="No built-in meeting-package template is available for this meeting type"
            hint="The template catalog did not return one; nothing is started in its place." />
        )
      )}
    </div>
  );
}
