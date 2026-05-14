/**
 * AnaSlashCommandMenu — the floating slash-command palette shown above
 * the composer when the user types a `/`.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * Previously inlined identically in two places (overlay composer +
 * main-return composer); now a single component drives both.
 *
 * Renders nothing when the menu is closed or has no matching commands.
 *
 * Keyboard navigation (up / down / enter / escape) lives in the parent
 * — this component only owns the visual list and the mouse handlers.
 *
 * @module client/src/concept2cure/components/chat/AnaSlashCommandMenu
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { SLASH_CATEGORY_COLORS } from './anaPanelConstants';
import type { SlashCommand } from './anaPanelTypes';

interface Props {
  /** Whether the menu is open. */
  open: boolean;
  /** Commands matching the current input prefix, in display order. */
  commands: SlashCommand[];
  /** Currently highlighted index (keyboard nav). */
  highlightedIndex: number;
  /** Update the highlighted index (mouse-hover handler). */
  onHover: (index: number) => void;
  /** Select a command. The parent owns the side-effects (set input, fire send, etc.). */
  onSelect: (cmd: SlashCommand) => void;
}

export function AnaSlashCommandMenu({
  open,
  commands,
  highlightedIndex,
  onHover,
  onSelect,
}: Props) {
  if (!open || commands.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-[#E8E6DC] shadow-lg max-h-[280px] overflow-y-auto z-50"
      role="listbox"
      aria-label="Slash commands"
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.command}
          type="button"
          role="option"
          aria-selected={i === highlightedIndex}
          onMouseDown={e => {
            // Prevent the textarea from blurring before the click registers.
            e.preventDefault();
            onSelect(cmd);
          }}
          onMouseEnter={() => onHover(i)}
          className={cn(
            'w-full flex items-center gap-3 px-3.5 py-2 text-left transition-colors',
            i === highlightedIndex ? 'bg-[#FAF9F5]' : 'hover:bg-[#FAF9F5]/50',
          )}
        >
          <code className="text-xs font-mono font-semibold text-[#141413] min-w-[100px]">
            {cmd.command}
          </code>
          <span className="text-xs text-[#6B6962] flex-1 truncate">{cmd.description}</span>
          <span
            className={cn(
              'text-[10px] font-medium',
              SLASH_CATEGORY_COLORS[cmd.category] || 'text-zinc-400',
            )}
          >
            {cmd.category}
          </span>
        </button>
      ))}
    </div>
  );
}

export default AnaSlashCommandMenu;
