/**
 * Data Origins — the right-click affordance.
 *
 * Wraps any document surface. Select text, right-click, choose "Data Origins",
 * and the panel opens with the provenance of exactly what was selected.
 *
 * WHY IT WRAPS RATHER THAN BEING WIRED PER SURFACE
 * The rule is that EVERY document can answer where its text came from. A
 * per-surface integration would drift — some editors would get it, others would
 * not, and the guarantee would quietly become a feature of a few screens. This
 * component makes the interaction one import for any surface that can hand over
 * (a) the container element and (b) which document it is showing.
 *
 * The menu item is disabled without a selection rather than hidden, because a
 * reader who right-clicks looking for it needs to learn that it exists and that
 * selecting text is what enables it. Hiding it teaches nothing.
 *
 * @module client/src/concept2cure/lineage/DataOriginsMenu
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { DataOriginsPanel } from './DataOriginsPanel';
import { downloadDataOriginsPdf, type SelectionQuery } from './dataOriginsApi';
import { offsetsAreTrustworthy, selectionToRange } from './selectionOffsets';

export interface DataOriginsMenuProps {
  /** Which document the wrapped content is showing. */
  documentTable: string;
  documentId: string;
  documentTitle?: string;
  /**
   * The exact text the lineage was recorded against. Supplied so the component
   * can refuse to answer when the rendered text has drifted from it — offsets
   * taken against different text produce a confident report about the wrong
   * words.
   */
  canonicalText?: string;
  onNavigateToSource?: (sourceId: string) => void;
  children: ReactNode;
}

export function DataOriginsMenu({
  documentTable,
  documentId,
  documentTitle,
  canonicalText,
  onNavigateToSource,
  children,
}: DataOriginsMenuProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<SelectionQuery | null>(null);
  const [openQuery, setOpenQuery] = useState<SelectionQuery | null>(null);
  const [drift, setDrift] = useState(false);

  /**
   * Capture the selection when the menu opens, not when the item is clicked:
   * opening a context menu can collapse the selection in some browsers, and by
   * the time the click lands there may be nothing left to measure.
   */
  const captureSelection = useCallback(() => {
    const root = hostRef.current;
    const range = selectionToRange(root);

    if (!range) {
      setPending(null);
      setDrift(false);
      return;
    }

    if (canonicalText !== undefined && !offsetsAreTrustworthy(root, canonicalText)) {
      // Rendered text differs from what lineage was recorded against, so the
      // offsets mean something else. Say so rather than answer wrongly.
      setPending(null);
      setDrift(true);
      return;
    }

    setDrift(false);
    setPending({
      documentTable,
      documentId,
      documentTitle,
      charStart: range.charStart,
      charEnd: range.charEnd,
      selectionText: range.text,
    });
  }, [canonicalText, documentId, documentTable, documentTitle]);

  return (
    <>
      <ContextMenu onOpenChange={(open) => open && captureSelection()}>
        <ContextMenuTrigger asChild>
          <div ref={hostRef} style={{ display: 'contents' }}>
            {children}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-60">
          <ContextMenuItem disabled={!pending} onSelect={() => pending && setOpenQuery(pending)}>
            Data Origins
            {pending && (
              <span className="ml-auto pl-3 text-xs opacity-60">
                {pending.charEnd - pending.charStart} chars
              </span>
            )}
          </ContextMenuItem>

          <ContextMenuItem
            disabled={!pending}
            onSelect={() => {
              if (pending) void downloadDataOriginsPdf(pending);
            }}
          >
            Download origins as PDF
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem disabled>
            <span className="text-xs opacity-70">
              {drift
                ? 'Text has changed — cannot locate selection'
                : pending
                  ? `Characters ${pending.charStart}–${pending.charEnd}`
                  : 'Select text to trace its origins'}
            </span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DataOriginsPanel
        query={openQuery}
        onClose={() => setOpenQuery(null)}
        onNavigateToSource={onNavigateToSource}
      />
    </>
  );
}

export default DataOriginsMenu;
