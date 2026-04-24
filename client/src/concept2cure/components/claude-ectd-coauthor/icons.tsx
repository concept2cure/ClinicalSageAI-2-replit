/**
 * Icons — ported verbatim from docs/design/concept2cure-design-system/
 * project/ui_kits/ectd_coauthor/Icons.jsx. Uses lucide-react so we match
 * the bundle's stroke weight and glyph set without inline SVG.
 */
import type { ReactElement } from 'react';
import {
  ChevronRight,
  Search,
  PanelLeft,
  History,
  MoreHorizontal,
  ArrowUp,
  Paperclip,
  Settings2,
  ChevronDown,
  Check,
  FileText,
  Share2,
  Download,
  Maximize2,
  Undo2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export type IconKey =
  | 'chevron' | 'search' | 'panelLeft' | 'history' | 'dots' | 'arrowUp'
  | 'attach' | 'tools' | 'down' | 'check' | 'file' | 'share' | 'download'
  | 'focus' | 'revert' | 'sparkle' | 'shield';

type IconProps = { size?: number };

export const I: Record<IconKey, (props: IconProps) => ReactElement> = {
  chevron:   ({ size = 14 }) => <ChevronRight size={size} strokeWidth={1.75} />,
  search:    ({ size = 14 }) => <Search size={size} strokeWidth={1.75} />,
  panelLeft: ({ size = 14 }) => <PanelLeft size={size} strokeWidth={1.75} />,
  history:   ({ size = 14 }) => <History size={size} strokeWidth={1.75} />,
  dots:      ({ size = 14 }) => <MoreHorizontal size={size} strokeWidth={1.75} />,
  arrowUp:   ({ size = 14 }) => <ArrowUp size={size} strokeWidth={1.75} />,
  attach:    ({ size = 14 }) => <Paperclip size={size} strokeWidth={1.75} />,
  tools:     ({ size = 14 }) => <Settings2 size={size} strokeWidth={1.75} />,
  down:      ({ size = 14 }) => <ChevronDown size={size} strokeWidth={1.75} />,
  check:     ({ size = 14 }) => <Check size={size} strokeWidth={1.75} />,
  file:      ({ size = 14 }) => <FileText size={size} strokeWidth={1.75} />,
  share:     ({ size = 14 }) => <Share2 size={size} strokeWidth={1.75} />,
  download:  ({ size = 14 }) => <Download size={size} strokeWidth={1.75} />,
  focus:     ({ size = 14 }) => <Maximize2 size={size} strokeWidth={1.75} />,
  revert:    ({ size = 14 }) => <Undo2 size={size} strokeWidth={1.75} />,
  sparkle:   ({ size = 14 }) => <Sparkles size={size} strokeWidth={1.75} />,
  shield:    ({ size = 14 }) => <ShieldCheck size={size} strokeWidth={1.75} />,
};

export function Ico({ name, size = 14 }: { name: IconKey; size?: number }) {
  const Fn = I[name];
  return <Fn size={size} />;
}
