/** The existing protocol tab/section state and shared leave guard, used by every protocol door. */
import { useEffect, useRef, useState } from 'react';
import { registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? '' : String(value);

export function useProtocolWorkNavigation({ initialSection, sections, pending, dialogs, tabs }: {
  initialSection: string; sections: Row[]; pending: boolean; dialogs: unknown[];
  tabs: readonly { id: string }[];
}) {
  const [tab, setTab] = useState('document');
  const [activeSec, setActiveSec] = useState(initialSection);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const pendingReason = pending ? 'Save the pending section changes before switching work.'
    : dialogs.some(Boolean) ? 'Finish or close the open dialog before switching work.' : null;
  const leaveReason = useRef<string | null>(pendingReason);
  leaveReason.current = pendingReason;
  useEffect(() => registerSurfaceLeaveGuard(() => leaveReason.current), []);
  useEffect(() => { if (!pendingReason) setNavigationNotice(null); }, [pendingReason]);

  const workChangeRefusal = () => {
    const reason = surfaceLeaveRefusal();
    setNavigationNotice(reason);
    return reason;
  };
  const requestTab = (next: string): boolean => {
    if (!tabs.some(item => item.id === next)) return false;
    if (next === tab) return true;
    if (workChangeRefusal()) return false;
    setTab(next);
    return true;
  };
  const sec = sections.find(item => item.id === activeSec) ?? sections[0];
  const openSectionId = sec ? text(sec.id) : null;
  const onSec = (section: Row) => {
    const next = text(section.tab) || 'document';
    if (text(section.id) === openSectionId && next === tab) return;
    if (workChangeRefusal()) return;
    setActiveSec(text(section.id)); setTab(next);
  };
  return { tab, activeSec, sec, openSectionId, onSec, requestTab, workChangeRefusal, navigationNotice };
}
