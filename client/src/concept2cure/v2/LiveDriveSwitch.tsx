/**
 * LiveDriveSwitch — AnA's hands, switchable from the composer you are typing in.
 *
 * The Live Drive toggle, the guided tour and the demonstrations lived only in
 * the rail's collapsed "Ask · engine" menu, and the rail is not drawn on the
 * screens people type into most — the front door lands on the conversation
 * thread, which owns its conversation. So the one control that decides whether
 * AnA moves the screen was unreachable where it mattered. This puts it beside
 * the composer: one switch that says what it does and shows its state, and a
 * Demos menu that starts a tour or a demonstration exactly as the rail does.
 *
 * Reads the shell's controls from LiveDriveControlsContext (provided by
 * V2App); renders nothing outside the shell.
 */
import React from 'react';
import { availableDemoScripts } from '../components/ana/anaLockedScreens';

export interface LiveDriveControlsValue {
  on: boolean;
  /** An honest lock (entitlement), with the reason, or null. */
  locked: { reason: string; requiredTier?: string | null } | null;
  setOn: (on: boolean) => void;
  onStartDemo: (demoId: string, title: string) => void;
  onStartTour: () => void;
}

export const LiveDriveControlsContext = React.createContext<LiveDriveControlsValue | null>(null);

/** Room the menu needs above its button before it opens upward instead. */
const MENU_ROOM_PX = 300;

export function LiveDriveSwitch() {
  const ctl = React.useContext(LiveDriveControlsContext);
  const [open, setOpen] = React.useState(false);
  /* Fixed to the viewport from the button's own rect: composers clip their
     overflow (the front door's rounds its corners with overflow:hidden), and a
     menu positioned inside one was cut off and its items unclickable. */
  const [place, setPlace] = React.useState<React.CSSProperties>({});
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const menuId = React.useId();
  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPlace(
        r.top > MENU_ROOM_PX
          ? { position: 'fixed', left: r.left, bottom: window.innerHeight - r.top + 6, right: 'auto', top: 'auto' }
          : { position: 'fixed', left: r.left, top: r.bottom + 6, right: 'auto', bottom: 'auto' }
      );
    }
    setOpen(true);
  };
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e: Event) => {
      if (wrapRef.current && e.target instanceof Node && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);
  if (!ctl) return null;
  if (ctl.locked) {
    return (
      <span className="ana-drive-ctl">
        <span className="ana-drive-btn" title="AnA cannot move the screen for this workspace">
          Screen moves unavailable
          {ctl.locked.requiredTier ? ` · ${ctl.locked.requiredTier} plan` : ''}
        </span>
      </span>
    );
  }
  const demos = availableDemoScripts();
  return (
    <span className="ana-drive-ctl" ref={wrapRef}>
      <button
        type="button"
        role="switch"
        aria-checked={ctl.on}
        className="ana-drive-btn"
        data-on={ctl.on ? 'true' : 'false'}
        title={
          ctl.on
            ? 'AnA opens screens and operates them for you. Switch off to have her offer each move as a button instead.'
            : 'AnA offers each move as a button. Switch on to have her open screens and operate them for you.'
        }
        onClick={() => ctl.setOn(!ctl.on)}
      >
        <span className="ana-drive-dot" aria-hidden="true" data-on={ctl.on ? 'true' : 'false'} />
        {ctl.on ? 'AnA drives: on' : 'AnA drives: off'}
      </button>
      <button
        type="button"
        className="ana-drive-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        ref={btnRef}
        onClick={toggleMenu}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        Demos
      </button>
      {open && (
        <div className="ana-menu ana-drive-ctl-menu" role="menu" id={menuId} style={place}>
          <div className="ana-menu-sec">Guided</div>
          <button
            type="button"
            role="menuitem"
            className="ana-menu-item"
            onClick={() => {
              setOpen(false);
              ctl.onStartTour();
            }}
          >
            Show me around
          </button>
          {demos.length > 0 && <div className="ana-menu-sec">Demonstrations</div>}
          {demos.map((d) => (
            <button
              key={d.id}
              type="button"
              role="menuitem"
              className="ana-menu-item"
              onClick={() => {
                setOpen(false);
                ctl.onStartDemo(d.id, d.title);
              }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
