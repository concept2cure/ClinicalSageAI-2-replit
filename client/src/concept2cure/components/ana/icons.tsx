/**
 * Icons — ported from docs/design/concept2cure-design-system/project/ui_kits/ana_ri/Icons.jsx
 *
 * Bundle uses inline SVG; production uses lucide-react (same glyphs, smaller
 * bundle) per the concept2cure-home precedent. Each export maps 1:1 to a bundle icon.
 */
import {
  Plus,
  Menu,
  PanelLeft,
  MessageSquare,
  FolderOpen,
  Sparkles,
  Search,
  BookOpen,
  Paperclip,
  Wrench,
  ArrowUp,
  Share2,
  MoreHorizontal,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  FlaskConical,
  FileText,
  Globe,
  Clipboard,
  Check,
  ArrowUpRight,
  Square,
  X,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

export const I = {
  plus: Plus,
  menu: Menu,
  panelLeft: PanelLeft,
  chat: MessageSquare,
  folder: FolderOpen,
  sparkles: Sparkles,
  search: Search,
  book: BookOpen,
  attach: Paperclip,
  tools: Wrench,
  arrowUp: ArrowUp,
  share: Share2,
  dots: MoreHorizontal,
  copy: Copy,
  redo: RotateCcw,
  thumbUp: ThumbsUp,
  thumbDown: ThumbsDown,
  down: ChevronDown,
  flask: FlaskConical,
  file: FileText,
  globe: Globe,
  clip: Clipboard,
  check: Check,
  upgrade: ArrowUpRight,
  stop: Square,
  close: X,
  shieldCheck: ShieldCheck,
  alert: TriangleAlert,
} as const;

export type IconKey = keyof typeof I;
