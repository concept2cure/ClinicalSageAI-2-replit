/**
 * AnaIntentLensStrip — pill row below the composer that lets the user
 * pick the active intent lens (Auto / Audit / Improve / Risk /
 * Strategy / Compare).
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 *
 * @module client/src/concept2cure/components/chat/AnaIntentLensStrip
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { INTENT_LENSES } from './anaPanelConstants';
import type { IntentLens } from './anaPanelTypes';

interface Props {
  value: IntentLens;
  onChange: (lens: IntentLens) => void;
}

export function AnaIntentLensStrip({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5 pl-1">
      {INTENT_LENSES.map(lens => (
        <button
          key={lens.id}
          type="button"
          onClick={() => onChange(lens.id)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
            value === lens.id
              ? 'bg-[#FBF0EB] text-[#D97757]'
              : 'text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]',
          )}
          title={lens.description}
        >
          {lens.icon}
          <span className="hidden sm:inline">{lens.label}</span>
        </button>
      ))}
    </div>
  );
}

export default AnaIntentLensStrip;
