/**
 * @fileoverview Zen Command Palette
 * @module concept2cure/components/command/ZenCommandPalette
 * @version 3.0.0
 *
 * @description
 * Spotlight/Raycast/ChatGPT-style command palette for quick navigation and actions.
 * Keyboard-first experience with ⌘K shortcut.
 *
 * Features:
 * - Quick project switching
 * - Start new submissions
 * - Navigate to tools/modules
 * - Search conversations
 * - AI quick actions
 *
 * @compliance
 * - FDA 21 CFR Part 11: All actions logged
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  FileText,
  MessageSquare,
  Plus,
  Settings,
  User,
  History,
  Sparkles,
  ArrowRight,
  Hash,
  Folder,
  ChevronRight,
  Command,
  Beaker,
  Pill,
  Activity,
  Shield,
  ClipboardList,
  BarChart2,
  BookOpen,
  Globe,
  AlertTriangle,
  CheckSquare,
  Microscope,
  Building2,
  FileCheck,
  Brain,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: CommandCategory;
  action: () => void;
  keywords?: string[];
}

type CommandCategory =
  | 'recent'
  | 'submissions'
  | 'tools'
  | 'projects'
  | 'settings'
  | 'ai';

interface CommandGroup {
  category: CommandCategory;
  label: string;
  items: CommandItem[];
}

interface ZenCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction?: (actionId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const createCommands = (onAction: (id: string) => void): CommandItem[] => [
  // Recent
  {
    id: 'new-chat',
    title: 'New Chat',
    subtitle: 'Start a new conversation with AnA',
    icon: <MessageSquare className="w-4 h-4" />,
    shortcut: '⌘N',
    category: 'recent',
    action: () => onAction('new-chat'),
    keywords: ['conversation', 'message', 'talk'],
  },
  {
    id: 'search-conversations',
    title: 'Search Conversations',
    subtitle: 'Find past chats and documents',
    icon: <Search className="w-4 h-4" />,
    shortcut: '⌘F',
    category: 'recent',
    action: () => onAction('search-conversations'),
    keywords: ['find', 'history', 'lookup'],
  },

  // Submissions
  {
    id: 'new-510k',
    title: 'New 510(k) Submission',
    subtitle: 'Start a premarket notification',
    icon: <FileText className="w-4 h-4 text-blue-600" />,
    category: 'submissions',
    action: () => onAction('new-510k'),
    keywords: ['device', 'clearance', 'premarket'],
  },
  {
    id: 'new-ind',
    title: 'New IND Application',
    subtitle: 'Investigational New Drug',
    icon: <Beaker className="w-4 h-4 text-purple-600" />,
    category: 'submissions',
    action: () => onAction('new-ind'),
    keywords: ['investigational', 'drug', 'clinical'],
  },
  {
    id: 'new-nda',
    title: 'New NDA Submission',
    subtitle: 'New Drug Application',
    icon: <Pill className="w-4 h-4 text-green-600" />,
    category: 'submissions',
    action: () => onAction('new-nda'),
    keywords: ['drug', 'approval', 'marketing'],
  },
  {
    id: 'new-bla',
    title: 'New BLA Submission',
    subtitle: 'Biologics License Application',
    icon: <Activity className="w-4 h-4 text-orange-600" />,
    category: 'submissions',
    action: () => onAction('new-bla'),
    keywords: ['biologics', 'vaccine', 'blood'],
  },
  {
    id: 'new-pma',
    title: 'New PMA Submission',
    subtitle: 'Premarket Approval',
    icon: <Shield className="w-4 h-4 text-red-600" />,
    category: 'submissions',
    action: () => onAction('new-pma'),
    keywords: ['class3', 'device', 'high-risk'],
  },

  // Tools
  {
    id: 'tool-ectd',
    title: 'eCTD Navigator',
    subtitle: 'Manage submission structure',
    icon: <Folder className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-ectd'),
    keywords: ['module', 'structure', 'document'],
  },
  {
    id: 'tool-protocol',
    title: 'Protocol Designer',
    subtitle: 'Design clinical study protocols',
    icon: <ClipboardList className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-protocol'),
    keywords: ['clinical', 'trial', 'study'],
  },
  {
    id: 'tool-sop',
    title: 'SOP Management',
    subtitle: 'Standard Operating Procedures',
    icon: <BookOpen className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-sop'),
    keywords: ['quality', 'procedure', 'training'],
  },
  {
    id: 'tool-capa',
    title: 'CAPA Management',
    subtitle: 'Corrective & Preventive Actions',
    icon: <AlertTriangle className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-capa'),
    keywords: ['quality', 'corrective', 'preventive'],
  },
  {
    id: 'tool-pms',
    title: 'Post-Market Surveillance',
    subtitle: 'Safety monitoring & vigilance',
    icon: <BarChart2 className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-pms'),
    keywords: ['safety', 'vigilance', 'psur'],
  },
  {
    id: 'tool-inspection',
    title: 'Inspection Readiness',
    subtitle: 'Audit preparation & findings',
    icon: <CheckSquare className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-inspection'),
    keywords: ['audit', 'fda', 'inspection'],
  },
  {
    id: 'tool-intelligence',
    title: 'Regulatory Intelligence',
    subtitle: 'Guidance & competitive analysis',
    icon: <Globe className="w-4 h-4" />,
    category: 'tools',
    action: () => onAction('tool-intelligence'),
    keywords: ['guidance', 'news', 'competitive'],
  },

  // AnA Intelligence Features
  {
    id: 'tool-ri-feed',
    title: 'Regulatory Intelligence Feed',
    subtitle: 'Live FDA/EMA guidance updates & alerts',
    icon: <Globe className="w-4 h-4 text-blue-600" />,
    category: 'tools',
    action: () => onAction('nav-intelligence-feed'),
    keywords: ['feed', 'guidance', 'alert', 'fda', 'ema', 'news', 'live'],
  },
  {
    id: 'tool-gap-analysis',
    title: 'Submission Gap Analysis',
    subtitle: 'eCTD readiness scoring & gap detection',
    icon: <CheckSquare className="w-4 h-4 text-emerald-600" />,
    category: 'tools',
    action: () => onAction('nav-gap-analysis'),
    keywords: ['gap', 'readiness', 'ectd', 'missing', 'requirements', 'score'],
  },
  {
    id: 'tool-change-impact',
    title: 'Document Change Impact',
    subtitle: 'How guidance changes affect your submission',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    category: 'tools',
    action: () => onAction('nav-change-impact'),
    keywords: ['change', 'impact', 'rework', 'guidance', 'revision'],
  },
  {
    id: 'tool-ana-memory',
    title: 'AnA Memory',
    subtitle: 'Project context & persistent memory',
    icon: <Brain className="w-4 h-4 text-violet-600" />,
    category: 'tools',
    action: () => onAction('nav-ana-memory'),
    keywords: ['memory', 'context', 'remember', 'ana', 'project', 'preferences'],
  },

  // AI
  {
    id: 'ai-analyze',
    title: 'Analyze Document',
    subtitle: 'AI-powered document analysis',
    icon: <Brain className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-analyze'),
    keywords: ['analyze', 'review', 'ai'],
  },
  {
    id: 'ai-draft',
    title: 'Draft with AI',
    subtitle: 'Generate regulatory content',
    icon: <Sparkles className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-draft'),
    keywords: ['generate', 'write', 'create'],
  },
  {
    id: 'ai-compare',
    title: 'Compare Documents',
    subtitle: 'Side-by-side comparison',
    icon: <FileCheck className="w-4 h-4 text-violet-600" />,
    category: 'ai',
    action: () => onAction('ai-compare'),
    keywords: ['diff', 'compare', 'review'],
  },

  // Settings
  {
    id: 'settings-account',
    title: 'Account Settings',
    subtitle: 'Manage your account',
    icon: <User className="w-4 h-4" />,
    shortcut: '⌘,',
    category: 'settings',
    action: () => onAction('settings-account'),
    keywords: ['profile', 'user', 'account'],
  },
  {
    id: 'settings-org',
    title: 'Organization Settings',
    subtitle: 'Team & workspace settings',
    icon: <Building2 className="w-4 h-4" />,
    category: 'settings',
    action: () => onAction('settings-org'),
    keywords: ['team', 'org', 'workspace'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY LABELS
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  recent: 'Quick Actions',
  submissions: 'New Submission',
  tools: 'Tools & Modules',
  projects: 'Projects',
  settings: 'Settings',
  ai: 'AI Actions',
};

const CATEGORY_ORDER: CommandCategory[] = [
  'recent',
  'submissions',
  'tools',
  'ai',
  'settings',
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenCommandPalette: React.FC<ZenCommandPaletteProps> = ({
  isOpen,
  onClose,
  onAction = () => {},
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get commands
  const commands = useMemo(
    () => createCommands((id) => {
      onAction(id);
      onClose();
    }),
    [onAction, onClose]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) => {
      const searchText = [
        cmd.title,
        cmd.subtitle,
        ...(cmd.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      return searchText.includes(lowerQuery);
    });
  }, [commands, query]);

  // Group filtered commands by category
  const groupedCommands = useMemo(() => {
    const groups: CommandGroup[] = [];

    CATEGORY_ORDER.forEach((category) => {
      const items = filteredCommands.filter((cmd) => cmd.category === category);
      if (items.length > 0) {
        groups.push({
          category,
          label: CATEGORY_LABELS[category],
          items,
        });
      }
    });

    return groups;
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatList = useMemo(
    () => groupedCommands.flatMap((g) => g.items),
    [groupedCommands]
  );

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedItem = document.querySelector(`[data-command-index="${selectedIndex}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatList[selectedIndex]) {
            flatList[selectedIndex].action();
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    },
    [flatList, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  // Calculate cumulative index for each item
  let cumulativeIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100">
          <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, tools, submissions..."
            className="flex-1 text-base bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 bg-zinc-100 rounded-md">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2 zen-scroll"
        >
          {flatList.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                No commands found for "{query}"
              </p>
            </div>
          ) : (
            groupedCommands.map((group) => {
              const groupStartIndex = cumulativeIndex;

              return (
                <div key={group.category} className="mb-2">
                  {/* Group header */}
                  <div className="px-4 py-2">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>

                  {/* Items */}
                  {group.items.map((item, itemIndex) => {
                    const absoluteIndex = groupStartIndex + itemIndex;
                    const isSelected = absoluteIndex === selectedIndex;

                    // Increment for next iteration
                    if (itemIndex === group.items.length - 1) {
                      cumulativeIndex = absoluteIndex + 1;
                    }

                    return (
                      <button
                        key={item.id}
                        data-command-index={absoluteIndex}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'bg-zinc-100'
                            : 'hover:bg-zinc-50'
                        )}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                            isSelected ? 'bg-white shadow-sm' : 'bg-zinc-100'
                          )}
                        >
                          {item.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-zinc-500 truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>

                        {/* Shortcut */}
                        {item.shortcut && (
                          <kbd className="flex-shrink-0 text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded">
                            {item.shortcut}
                          </kbd>
                        )}

                        {/* Arrow */}
                        <ChevronRight
                          className={cn(
                            'w-4 h-4 flex-shrink-0 transition-opacity',
                            isSelected
                              ? 'opacity-100 text-zinc-600'
                              : 'opacity-0'
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 bg-zinc-50">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-600">↵</kbd>
              <span>Select</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Command className="w-3 h-3" />
            <span>K to open</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ZenCommandPalette;
