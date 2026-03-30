import { describe, expect, it, vi } from 'vitest';
import { Indent, canHandleIndentShortcut, parseIndentFromMarginLeft } from '../extensions/IndentExtension';

describe('IndentExtension helpers', () => {
  describe('parseIndentFromMarginLeft', () => {
    it('parses rem values produced by renderHTML', () => {
      expect(parseIndentFromMarginLeft('2rem')).toBe(1);
      expect(parseIndentFromMarginLeft('6rem')).toBe(3);
    });

    it('parses px values from pasted/legacy content', () => {
      expect(parseIndentFromMarginLeft('32px')).toBe(1);
      expect(parseIndentFromMarginLeft('96px')).toBe(3);
      expect(parseIndentFromMarginLeft(' 64PX ')).toBe(2);
    });

    it('clamps and sanitizes invalid values', () => {
      expect(parseIndentFromMarginLeft('200rem')).toBe(10);
      expect(parseIndentFromMarginLeft('-2rem')).toBe(0);
      expect(parseIndentFromMarginLeft('2em')).toBe(0);
      expect(parseIndentFromMarginLeft(undefined)).toBe(0);
    });
  });

  describe('canHandleIndentShortcut', () => {
    it('returns false when ai ghost text is active', () => {
      const editor = {
        storage: { aiAutocomplete: { ghostText: 'accept me' } },
        isActive: () => false,
      };

      expect(canHandleIndentShortcut(editor)).toBe(false);
    });

    it('returns false when editor is read-only', () => {
      const editor = {
        isEditable: false,
        storage: {},
        isActive: () => false,
      };

      expect(canHandleIndentShortcut(editor)).toBe(false);
    });

    it('returns false in blocked contexts and true otherwise', () => {
      const active = new Set<string>(['table']);
      const editor = {
        storage: {},
        isActive: (name: string) => active.has(name),
      };

      expect(canHandleIndentShortcut(editor)).toBe(false);
      active.clear();
      expect(canHandleIndentShortcut(editor)).toBe(true);
    });
  });

  describe('keyboard shortcut handlers', () => {
    it('invokes indent/outdent commands only in allowed contexts', () => {
      const mockEditor = {
        isEditable: true,
        storage: {},
        isActive: () => false,
        commands: {
          indent: vi.fn(),
          outdent: vi.fn(),
        },
      } as any;

      const shortcuts = (Indent.config.addKeyboardShortcuts as () => Record<string, () => boolean>).call({
        editor: mockEditor,
      });

      expect(shortcuts.Tab()).toBe(true);
      expect(mockEditor.commands.indent).toHaveBeenCalledTimes(1);

      expect(shortcuts['Shift-Tab']()).toBe(true);
      expect(mockEditor.commands.outdent).toHaveBeenCalledTimes(1);

      mockEditor.isActive = (name: string) => name === 'table';
      expect(shortcuts.Tab()).toBe(false);
      expect(shortcuts['Shift-Tab']()).toBe(false);
      expect(mockEditor.commands.indent).toHaveBeenCalledTimes(1);
      expect(mockEditor.commands.outdent).toHaveBeenCalledTimes(1);
    });
  });
});
