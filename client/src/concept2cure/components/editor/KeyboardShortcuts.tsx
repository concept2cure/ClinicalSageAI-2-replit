import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Keyboard, Search, X, Command, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  callback: (e: KeyboardEvent) => void;
  description?: string;
}

interface KeyboardShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutDisplay {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  label: string;
  icon: React.ReactNode;
  shortcuts: ShortcutDisplay[];
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const MOD = isMac ? '\u2318' : 'Ctrl';
const SHIFT = isMac ? '\u21E7' : 'Shift';
const ALT = isMac ? '\u2325' : 'Alt';
const CTRL = isMac ? '\u2303' : 'Ctrl';

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

function buildCategories(): ShortcutCategory[] {
  return [
    {
      label: 'Editing',
      icon: <Keyboard className="h-4 w-4" />,
      shortcuts: [
        { keys: [MOD, 'S'], description: 'Save' },
        { keys: [MOD, 'Z'], description: 'Undo' },
        { keys: [MOD, 'Y'], description: 'Redo' },
        { keys: [MOD, 'F'], description: 'Find & Replace' },
        { keys: [MOD, 'A'], description: 'Select All' },
      ],
    },
    {
      label: 'Formatting',
      icon: <span className="font-semibold text-sm">B</span>,
      shortcuts: [
        { keys: [MOD, 'B'], description: 'Bold' },
        { keys: [MOD, 'I'], description: 'Italic' },
        { keys: [MOD, 'U'], description: 'Underline' },
        { keys: [MOD, SHIFT, 'X'], description: 'Strikethrough' },
        { keys: [MOD, SHIFT, 'H'], description: 'Highlight' },
      ],
    },
    {
      label: 'Headings',
      icon: <span className="font-semibold text-sm">H</span>,
      shortcuts: [
        { keys: [MOD, ALT, '1'], description: 'Heading 1' },
        { keys: [MOD, ALT, '2'], description: 'Heading 2' },
        { keys: [MOD, ALT, '3'], description: 'Heading 3' },
      ],
    },
    {
      label: 'AI Actions',
      icon: <Command className="h-4 w-4" />,
      shortcuts: [
        { keys: [MOD, SHIFT, 'Space'], description: 'Toggle AI Autocomplete' },
        { keys: [MOD, SHIFT, 'R'], description: 'AI Rewrite' },
        { keys: [MOD, SHIFT, 'E'], description: 'AI Expand' },
      ],
    },
    {
      label: 'Document Management',
      icon: <ArrowUp className="h-4 w-4" />,
      shortcuts: [
        { keys: [MOD, SHIFT, 'V'], description: 'Version History' },
        { keys: [MOD, SHIFT, 'C'], description: 'Insert Citation' },
        { keys: [MOD, 'K'], description: 'Command Palette' },
      ],
    },
    {
      label: 'Navigation',
      icon: <ArrowUp className="h-4 w-4 rotate-90" />,
      shortcuts: [
        { keys: [MOD, 'G'], description: 'Go to Line' },
        { keys: [MOD, SHIFT, 'P'], description: 'Inspector Panel' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Key badge component
// ---------------------------------------------------------------------------

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[24px] h-6 px-1.5 rounded-md',
        'bg-white/10 border border-white/20',
        'text-[11px] font-medium text-white/90 font-mono',
        'shadow-[0_1px_0_1px_rgba(0,0,0,0.3)]',
      )}
    >
      {label}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

export function KeyboardShortcutsOverlay({ isOpen, onClose }: KeyboardShortcutsOverlayProps) {
  const [search, setSearch] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const categories = useMemo(buildCategories, []);

  // Focus the search input when overlay opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      // Small delay so the animation has started
      const t = setTimeout(() => searchRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Close on click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  // Filter shortcuts by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        shortcuts: cat.shortcuts.filter(
          (s) =>
            s.description.toLowerCase().includes(q) ||
            s.keys.join(' ').toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.shortcuts.length > 0);
  }, [categories, search]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center',
        'bg-black/60 backdrop-blur-sm',
        'animate-in fade-in duration-200',
      )}
    >
      <div
        className={cn(
          'relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl',
          'bg-stone-800/95',
          'border border-white/10',
          'shadow-sm shadow-black/40',
          'backdrop-blur-xl',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-stone-400" />
            <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className={cn(
              'p-1.5 rounded-lg',
              'text-white/50 hover:text-white hover:bg-white/10',
              'transition-colors duration-150',
            )}
            aria-label="Close shortcuts overlay"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full pl-9 pr-4 py-2 rounded-lg',
                'bg-white/5 border border-white/10',
                'text-sm text-white placeholder:text-white/30',
                'focus-visible:ring-2 outline-none focus:ring-stone-400/50 focus:border-stone-400/50',
                'transition-colors duration-150',
              )}
            />
          </div>
        </div>

        {/* Shortcut grid */}
        <div className="px-6 pb-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {filtered.length === 0 && (
            <p className="text-center text-white/40 text-sm py-8">
              No shortcuts match your search.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((cat) => (
              <div key={cat.label}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-stone-400">{cat.icon}</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {cat.label}
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {cat.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className={cn(
                        'flex items-center justify-between',
                        'px-3 py-1.5 rounded-lg',
                        'hover:bg-white/5 transition-colors duration-150',
                      )}
                    >
                      <span className="text-sm text-white/80">{shortcut.description}</span>
                      <span className="flex items-center gap-1 ml-4 shrink-0">
                        {shortcut.keys.map((k, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && (
                              <span className="text-[10px] text-white/30 mx-0.5">+</span>
                            )}
                            <KeyBadge label={k} />
                          </React.Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-center gap-2">
          <span className="text-[11px] text-white/30">Press</span>
          <KeyBadge label="Esc" />
          <span className="text-[11px] text-white/30">to close</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useKeyboardShortcuts hook
// ---------------------------------------------------------------------------

export function useKeyboardShortcuts(
  shortcuts: Record<string, ShortcutDefinition>,
) {
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cheat sheet toggle: Ctrl+? (Ctrl+Shift+/)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === '?' || e.key === '/')
      ) {
        e.preventDefault();
        setShowCheatSheet((prev) => !prev);
        return;
      }

      for (const def of Object.values(shortcuts)) {
        const ctrlMatch = def.ctrl ? e.ctrlKey || e.metaKey : true;
        const shiftMatch = def.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = def.alt ? e.altKey : !e.altKey;
        const metaMatch = def.meta ? e.metaKey : true;
        const keyMatch = e.key.toLowerCase() === def.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch) {
          e.preventDefault();
          def.callback(e);
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);

  return { showCheatSheet, setShowCheatSheet };
}
