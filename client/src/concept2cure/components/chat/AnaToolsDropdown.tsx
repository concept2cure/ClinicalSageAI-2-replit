/**
 * AnaToolsDropdown — "+ Tools" button next to the composer.
 *
 * Currently exposes a single tool toggle (Firecrawl). The dropdown
 * exists as a separate component so future tools (deep-research mode,
 * file-upload variants, etc.) can be added without touching the
 * composer's JSX.
 *
 * The Firecrawl toggle reflects three states surfaced via the
 * `firecrawlDisabledReason` and `firecrawlQuotaRemaining` props:
 *
 *   - null reason + null/positive quota → toggleable
 *   - 'quota_exhausted'                 → disabled, "On but quota exhausted"
 *   - 'admin_disabled'                  → disabled, "On but admin-disabled"
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 *
 * @module client/src/concept2cure/components/chat/AnaToolsDropdown
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FolderPlus, Search, Check } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';

type FirecrawlDisabledReason = 'quota_exhausted' | 'admin_disabled' | null;

interface Props {
  useFirecrawl: boolean;
  onToggleFirecrawl: () => void;
  firecrawlDisabledReason: FirecrawlDisabledReason;
  firecrawlQuotaRemaining: number | null;
}

export function AnaToolsDropdown({
  useFirecrawl,
  onToggleFirecrawl,
  firecrawlDisabledReason,
  firecrawlQuotaRemaining,
}: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const containerRef = useClickOutside<HTMLDivElement>(open, close);

  const helpText =
    firecrawlDisabledReason === 'quota_exhausted'
      ? 'On but quota exhausted'
      : firecrawlDisabledReason === 'admin_disabled'
        ? 'On but admin-disabled for workspace'
        : firecrawlQuotaRemaining !== null
          ? `Optional open-web evidence (${firecrawlQuotaRemaining} free remaining)`
          : 'Optional governed open-web evidence';

  return (
    <div className="relative flex-shrink-0 self-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]"
        title="Add tools"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Tools</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
          <button
            type="button"
            onClick={() => {
              if (firecrawlDisabledReason) return;
              onToggleFirecrawl();
              setOpen(false);
            }}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
              firecrawlDisabledReason ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#FAF9F5]',
              useFirecrawl && 'bg-[#FAF9F5]',
            )}
          >
            <Search className="w-4 h-4 mt-0.5 text-[#D97757] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#141413]">Use Firecrawl</div>
              <div className="text-[10px] text-[#8A8880] leading-tight">{helpText}</div>
            </div>
            {useFirecrawl && <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

export default AnaToolsDropdown;
