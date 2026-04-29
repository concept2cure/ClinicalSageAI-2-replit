/**
 * Phase 3 Projects — icon map.
 *
 * The prototype uses a global `I` object (design-system/ui_kits/home/Icons.jsx)
 * with the keys below. Here we map each prototype name to its Lucide React
 * counterpart so JSX can stay 1:1 with the prototype while satisfying the
 * design-system non-negotiable "Lucide icons only".
 *
 * Usage in components:
 *   import { I } from '../icons';
 *   <span className="prj-icon-btn">{I.bell}</span>
 */

import type { ReactElement } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Atom,
  BarChart3,
  Beaker,
  Bell,
  Brain,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock,
  Copy,
  Download,
  FileText,
  FlaskConical,
  Folder,
  Globe,
  HelpCircle,
  Lock,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Notebook,
  Paperclip,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCcw,
  Scroll,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sigma,
  Sparkles,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  TrendingUp,
  Users,
  Vault,
  Wrench,
  X,
  AlertCircle,
  Archive,
  Microscope,
} from 'lucide-react';

// Lucide icons render at 16px by default in this surface; the prototype's CSS
// constrains svg width/height to 14–16px, so the default is fine.
const sz = 16;

export const I: Record<string, ReactElement> = {
  /* navigation / chrome */
  panelLeft:    <PanelLeft size={sz} />,
  search:       <Search size={sz} />,
  bell:         <Bell size={sz} />,
  notification: <Bell size={sz} />,
  help:         <HelpCircle size={sz} />,
  settings:     <Settings size={sz} />,
  sliders:      <SlidersHorizontal size={sz} />,
  dots:         <MoreHorizontal size={sz} />,
  more:         <MoreHorizontal size={sz} />,
  close:        <X size={sz} />,

  /* arrows */
  down:         <ChevronDown size={sz} />,
  right:        <ChevronRight size={sz} />,
  arrowRight:   <ArrowRight size={sz} />,
  arrowUp:      <ArrowUp size={sz} />,
  arrowLeft:    <ArrowLeft size={sz} />,

  /* actions */
  plus:         <Plus size={sz} />,
  attach:       <Paperclip size={sz} />,
  tools:        <Wrench size={sz} />,
  download:     <Download size={sz} />,
  archive:      <Archive size={sz} />,
  trash:        <Trash2 size={sz} />,
  copy:         <Copy size={sz} />,
  refresh:      <RefreshCcw size={sz} />,
  pencil:       <Pencil size={sz} />,
  mic:          <Mic size={sz} />,

  /* status / glyphs */
  check:        <Check size={sz} />,
  checkCircle:  <CheckCircle size={sz} />,
  star:         <Sparkles size={sz} />, // prototype falls back to '★' when missing; we use sparkles
  lock:         <Lock size={sz} />,
  shieldCheck:  <ShieldCheck size={sz} />,
  sparkles:     <Sparkles size={sz} />,
  alertCircle:  <AlertCircle size={sz} />,
  trendingUp:   <TrendingUp size={sz} />,
  clock:        <Clock size={sz} />,

  /* content kinds */
  file:         <FileText size={sz} />,
  fileText:     <FileText size={sz} />,
  chat:         <MessageSquare size={sz} />,
  folder:       <Folder size={sz} />,
  vault:        <Vault size={sz} />,
  scroll:       <Scroll size={sz} />,
  brain:        <Brain size={sz} />,
  users:        <Users size={sz} />,
  clip:         <Clipboard size={sz} />,
  send:         <Send size={sz} />,

  /* domain */
  atom:         <Atom size={sz} />,
  beaker:       <Beaker size={sz} />,
  flask:        <FlaskConical size={sz} />,
  microscope:   <Microscope size={sz} />,
  sigma:        <Sigma size={sz} />,
  stethoscope:  <Stethoscope size={sz} />,
  globe:        <Globe size={sz} />,
  barChart:     <BarChart3 size={sz} />,

  /* misc */
  notebook:     <Notebook size={sz} />,
};
