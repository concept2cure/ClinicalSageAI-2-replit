/**
 * SlashCommandMenu — TipTap slash command extension.
 *
 * Triggered by typing "/" at the start of a line or after whitespace.
 * Shows a floating menu with document and AI actions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  Sparkles,
  Table as TableIcon,
  Heading1,
  Heading2,
  Heading3,
  Link,
  ListChecks,
  FileText,
  Maximize2,
  Minimize2,
  BookOpen,
} from 'lucide-react';

// ── Command definitions ─────────────────────────────────────────────────────

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'ai' | 'insert' | 'format';
  action: (editor: Parameters<NonNullable<SuggestionOptions['command']>>[0]['editor']) => void;
  onAIAction?: (action: string, selectedText: string) => void;
}

export function getSlashCommands(
  onAIAction?: (action: string, selectedText: string) => void
): SlashCommandItem[] {
  return [
    // AI Actions
    {
      id: 'ai-rewrite',
      label: 'AI Rewrite',
      description: 'Improve clarity and precision',
      icon: <Sparkles className="w-4 h-4 text-purple-500" />,
      category: 'ai',
      action: () => onAIAction?.('rewrite', ''),
    },
    {
      id: 'ai-expand',
      label: 'AI Expand',
      description: 'Add detail and evidence',
      icon: <Maximize2 className="w-4 h-4 text-purple-500" />,
      category: 'ai',
      action: () => onAIAction?.('expand', ''),
    },
    {
      id: 'ai-summarize',
      label: 'AI Summarize',
      description: 'Create executive summary',
      icon: <Minimize2 className="w-4 h-4 text-purple-500" />,
      category: 'ai',
      action: () => onAIAction?.('summarize', ''),
    },
    {
      id: 'ai-regulatory',
      label: 'Regulatory Tone',
      description: 'Convert to formal FDA/EMA language',
      icon: <FileText className="w-4 h-4 text-purple-500" />,
      category: 'ai',
      action: () => onAIAction?.('regulatory-tone', ''),
    },
    {
      id: 'ai-references',
      label: 'Add References',
      description: 'Insert reference placeholders',
      icon: <BookOpen className="w-4 h-4 text-purple-500" />,
      category: 'ai',
      action: () => onAIAction?.('add-references', ''),
    },
    // Insert actions
    {
      id: 'table',
      label: 'Table',
      description: 'Insert a 3x3 table',
      icon: <TableIcon className="w-4 h-4 text-blue-500" />,
      category: 'insert',
      action: (editor) => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      id: 'checklist',
      label: 'Checklist',
      description: 'Insert a task list',
      icon: <ListChecks className="w-4 h-4 text-blue-500" />,
      category: 'insert',
      action: (editor) => {
        editor.chain().focus().toggleTaskList().run();
      },
    },
    {
      id: 'source-link',
      label: 'Link to Source',
      description: 'Link selected text to a source document',
      icon: <Link className="w-4 h-4 text-blue-500" />,
      category: 'insert',
      action: () => {
        // Trigger the source linking modal via the parent
        onAIAction?.('link-source', '');
      },
    },
    // Format actions
    {
      id: 'heading-1',
      label: 'Heading 1',
      description: 'Large section heading',
      icon: <Heading1 className="w-4 h-4 text-zinc-600" />,
      category: 'format',
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      },
    },
    {
      id: 'heading-2',
      label: 'Heading 2',
      description: 'Medium section heading',
      icon: <Heading2 className="w-4 h-4 text-zinc-600" />,
      category: 'format',
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
    },
    {
      id: 'heading-3',
      label: 'Heading 3',
      description: 'Small section heading',
      icon: <Heading3 className="w-4 h-4 text-zinc-600" />,
      category: 'format',
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
    },
  ];
}

// ── Floating menu component ─────────────────────────────────────────────────

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = React.forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  SlashCommandListProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command(item);
    },
    [items, command]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  // Group items by category
  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, SlashCommandItem[]>
  );

  const categoryLabels: Record<string, string> = {
    ai: 'AI Actions',
    insert: 'Insert',
    format: 'Format',
  };

  let flatIndex = -1;

  return (
    <div
      ref={containerRef}
      className="bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden w-72 max-h-80 overflow-y-auto"
    >
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category}>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50">
            {categoryLabels[category] || category}
          </div>
          {categoryItems.map((item) => {
            flatIndex++;
            const idx = flatIndex;
            return (
              <button
                key={item.id}
                onClick={() => selectItem(idx)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  idx === selectedIndex
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-zinc-500 truncate">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      ))}
      {items.length === 0 && (
        <div className="px-3 py-4 text-sm text-zinc-500 text-center">
          No commands found
        </div>
      )}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';

// ── TipTap Extension ────────────────────────────────────────────────────────

const slashCommandPluginKey = new PluginKey('slashCommand');

export function createSlashCommandExtension(
  onAIAction?: (action: string, selectedText: string) => void
) {
  const commands = getSlashCommands(onAIAction);

  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          pluginKey: slashCommandPluginKey,
          command: ({
            editor,
            range,
            props: item,
          }: {
            editor: Parameters<NonNullable<SuggestionOptions['command']>>[0]['editor'];
            range: { from: number; to: number };
            props: SlashCommandItem;
          }) => {
            // Delete the "/" trigger character
            editor.chain().focus().deleteRange(range).run();
            // Execute the command
            item.action(editor);
          },
          items: ({ query }: { query: string }) => {
            return commands.filter(
              (item) =>
                item.label.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: Record<string, unknown>) => {
                component = new ReactRenderer(SlashCommandList, {
                  props,
                  editor: props.editor as Parameters<NonNullable<SuggestionOptions['command']>>[0]['editor'],
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate: (props: Record<string, unknown>) => {
                component?.updateProps(props);
                if (props.clientRect && popup?.[0]) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                  });
                }
              },
              onKeyDown: (props: { event: KeyboardEvent }) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as { onKeyDown: (props: { event: KeyboardEvent }) => boolean } | null)?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        } as Partial<SuggestionOptions>,
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

export default createSlashCommandExtension;
