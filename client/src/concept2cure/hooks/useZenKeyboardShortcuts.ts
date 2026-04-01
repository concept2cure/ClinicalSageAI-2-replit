/**
 * useZenKeyboardShortcuts — Extracted from ZenApp.tsx (Stage 10)
 *
 * Global keyboard shortcuts for the Zen shell:
 *   ⌘K / Ctrl+K  → Command palette
 *   ⌘N / Ctrl+N  → New chat
 *   ⌘, / Ctrl+,  → Settings
 *   ⌘E / Ctrl+E  → Edit project (workspace mode only)
 *   Escape        → Close tool panel
 *   Alt+V         → Open vault drawer
 *
 * Also listens for 'mc-navigate' custom events (inter-page navigation).
 */
import { useEffect, useRef } from 'react';
import type { LayoutMode, ToolPanel } from '../zen-app-constants';

interface ZenKeyboardActions {
  openCommandPalette: () => void;
  openSettings: () => void;
  openEditProject: () => void;
  closeToolPanel: () => void;
  openVaultPanel: () => void;
  handleNewChat: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
}

interface ZenKeyboardState {
  activeToolPanel: ToolPanel;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  layoutMode: LayoutMode;
  activeProjectId: number | null;
}

export function useZenKeyboardShortcuts(
  state: ZenKeyboardState,
  actions: ZenKeyboardActions
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      const act = actionsRef.current;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        act.openCommandPalette();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        act.handleNewChat();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        act.openSettings();
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'e' &&
        st.layoutMode === 'workspace' &&
        st.activeProjectId
      ) {
        e.preventDefault();
        act.openEditProject();
      }

      if (e.key === 'Escape' && st.activeToolPanel && !st.commandPaletteOpen && !st.settingsOpen) {
        act.closeToolPanel();
      }

      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        act.openVaultPanel();
      }
    };

    const handleMcNavigate = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as LayoutMode;
      if (mode) {
        actionsRef.current.setLayoutMode(mode);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mc-navigate', handleMcNavigate);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mc-navigate', handleMcNavigate);
    };
  }, []);
}
