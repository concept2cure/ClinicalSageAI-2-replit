/**
 * AnaThinkingIndicator — animated three-dot row shown below the AnA
 * avatar while a turn is in flight.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * Two near-identical inline versions previously lived in the overlay
 * composer and the main-return composer; both now drive this single
 * component.
 *
 * The `message` prop differs between the two original sites: the
 * main-return version surfaced a rotating "Thinking…" / persona line
 * next to the dots; the overlay omitted it. When `message` is empty
 * the component renders just the dots + phase label, matching the
 * overlay behavior.
 *
 * @module client/src/concept2cure/components/chat/AnaThinkingIndicator
 */

import React from 'react';
import { Sparkles } from 'lucide-react';

interface Props {
  /** Active orchestration phase ("Reading project context", etc.). */
  statusPhase: string;
  /**
   * Optional rotating "thinking" message. Pass an empty string to
   * suppress the inline message (overlay-style minimal rendering).
   */
  message?: string;
}

export function AnaThinkingIndicator({ statusPhase, message }: Props) {
  return (
    <div className="px-4 py-3 bg-white">
      <div className="flex gap-2.5 max-w-3xl mx-auto">
        <div className="w-6 h-6 rounded-full bg-[#D97757] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <div>
          <span className="text-xs font-semibold text-[#2D2C28]">AnA</span>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_infinite]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
            </div>
            {message !== undefined && message !== '' && (
              <span className="text-xs text-[#D97757] font-medium">{message}</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#8A8880]">{statusPhase}</p>
        </div>
      </div>
    </div>
  );
}

export default AnaThinkingIndicator;
