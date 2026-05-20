/**
 * AnaQueueStatusBanner — single-line "Queued: N / Working / Clear" strip
 * shown above the composer when the user has rapid-fired prompts faster
 * than AnA can respond.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * Previously appeared inline in two places (overlay + main return); now
 * a single component drives both call sites.
 *
 * Renders nothing when the queue is empty — callers don't need their
 * own length-guard.
 *
 * @module client/src/concept2cure/components/chat/AnaQueueStatusBanner
 */

import React from 'react';
import type { ConversationQueueItem } from './anaPanelTypes';

interface Props {
  /** Full queue including completed / working / failed items. */
  queue: ConversationQueueItem[];
  /** Id of the item AnA is currently working on, if any. */
  activeQueueItemId: string | null;
  /** Wipe-the-queue handler — also dismisses the banner. */
  onClear: () => void;
}

export function AnaQueueStatusBanner({ queue, activeQueueItemId, onClear }: Props) {
  if (queue.length === 0) return null;

  const queuedCount = queue.filter(i => i.status === 'queued').length;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border-t border-stone-100 text-[11px] text-stone-500">
      {activeQueueItemId && <span className="text-amber-600">● Working</span>}
      {queuedCount > 0 && <span>Queued: {queuedCount}</span>}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-stone-400 hover:text-stone-600"
      >
        Clear
      </button>
    </div>
  );
}

export default AnaQueueStatusBanner;
