import { useEffect } from 'react';

/**
 * Keyboard Shortcuts Hook
 * 
 * Provides keyboard navigation and shortcuts for the CERv2 Workbench.
 * 
 * Shortcuts:
 * - Esc: Close inspector/modal
 * - Cmd/Ctrl + K: Focus search
 * - Cmd/Ctrl + /: Toggle shortcuts help
 * - Cmd/Ctrl + S: Save (prevent browser default)
 * 
 * Usage:
 * ```jsx
 * import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
 * 
 * function MyComponent() {
 *   useKeyboardShortcuts({
 *     onEscape: () => setInspectorOpen(false),
 *     onSearch: () => searchInputRef.current?.focus(),
 *   });
 *   // ...
 * }
 * ```
 */

export function useKeyboardShortcuts({
  onEscape,
  onSearch,
  onHelp,
  onSave,
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      const { key, metaKey, ctrlKey } = event;
      const cmdOrCtrl = metaKey || ctrlKey;

      // Esc: Close modals/inspector
      if (key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }

      // Cmd/Ctrl + K: Focus search
      if (key === 'k' && cmdOrCtrl && onSearch) {
        event.preventDefault();
        onSearch();
        return;
      }

      // Cmd/Ctrl + /: Toggle help
      if (key === '/' && cmdOrCtrl && onHelp) {
        event.preventDefault();
        onHelp();
        return;
      }

      // Cmd/Ctrl + S: Save (prevent browser default)
      if (key === 's' && cmdOrCtrl) {
        if (onSave) {
          event.preventDefault();
          onSave();
        } else {
          // Still prevent default even if no handler
          event.preventDefault();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onEscape, onSearch, onHelp, onSave]);
}

/**
 * ShortcutsHelp Component
 * 
 * Displays a modal with available keyboard shortcuts.
 */

export function ShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { keys: 'Esc', description: 'Close inspector or modal' },
    { keys: 'Cmd/Ctrl + K', description: 'Focus search' },
    { keys: 'Cmd/Ctrl + /', description: 'Show keyboard shortcuts' },
    { keys: 'Cmd/Ctrl + S', description: 'Save current work' },
    { keys: 'Tab', description: 'Navigate between fields' },
    { keys: 'Shift + Tab', description: 'Navigate backwards' },
    { keys: 'Enter', description: 'Submit form or confirm action' },
    { keys: '↑ ↓', description: 'Navigate lists' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-slate-600">{shortcut.description}</span>
              <kbd className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-300 text-xs font-mono text-slate-700">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
