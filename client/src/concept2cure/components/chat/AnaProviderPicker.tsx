/**
 * AnaProviderPicker — minimal AI-model selector inside the composer.
 *
 * Dropdown content lists every entry in AI_PROVIDERS; the selected
 * provider is highlighted with its activeColor. Click-outside closes
 * the dropdown.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 *
 * @module client/src/concept2cure/components/chat/AnaProviderPicker
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Bot, ChevronDown, Check } from 'lucide-react';

import { AI_PROVIDERS } from './anaPanelConstants';
import type { AIProviderChoice } from './anaPanelTypes';
import { useClickOutside } from '../../hooks/useClickOutside';

interface Props {
  value: AIProviderChoice;
  onChange: (next: AIProviderChoice) => void;
}

export function AnaProviderPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const containerRef = useClickOutside<HTMLDivElement>(open, close);

  const active = AI_PROVIDERS.find(p => p.id === value);

  return (
    <div className="relative flex-shrink-0 self-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
          value !== 'auto'
            ? `bg-[#F5F4EF] ${active?.activeColor || 'text-[#D97757]'} hover:bg-[#EDEAE0]`
            : 'text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]',
        )}
        title="Select AI model"
      >
        <Bot className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{active?.label}</span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
          {AI_PROVIDERS.map(prov => (
            <button
              key={prov.id}
              type="button"
              onClick={() => {
                onChange(prov.id);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-[#FAF9F5] transition-colors',
                value === prov.id && 'bg-[#FAF9F5]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex-shrink-0',
                  value === prov.id ? prov.activeColor : prov.color,
                )}
              >
                <Bot className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#141413]">{prov.label}</div>
                <div className="text-[10px] text-[#B0AEA5] leading-tight">{prov.description}</div>
              </div>
              {value === prov.id && (
                <Check className={cn('w-4 h-4 ml-auto mt-0.5 flex-shrink-0', prov.activeColor)} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AnaProviderPicker;
