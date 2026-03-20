import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LEARNING_PATHS,
  LEARNING_MODULES,
  CERTIFICATIONS,
} from './enablement-data';

// Lazy-load agent components to keep bundle lean
const AgentShowcase = React.lazy(() => import('./AgentShowcase'));
const AgentSetupWizard = React.lazy(() => import('./AgentSetupWizard'));
const AgentWorkflowMonitor = React.lazy(() => import('./AgentWorkflowMonitor'));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnablementCenterProps {
  onClose: () => void;
  initialView?: string;
  contextProfile?: {
    productType?: string;
    userRole?: string;
    clientType?: string;
  };
}

type ViewKey =
  | 'learning-paths'
  | 'all-modules'
  | 'certifications'
  | 'ai-agents'
  | 'about';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS: { key: ViewKey; label: string }[] = [
  { key: 'learning-paths', label: 'Learning Paths' },
  { key: 'all-modules', label: 'Modules' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'ai-agents', label: 'AI Agents' },
  { key: 'about', label: 'About' },
];

const MODULE_CATEGORIES = [
  'all',
  'onboarding',
  'evidence-intelligence',
  'authoring',
  'governance',
  'review-audit',
  'dossier-placement',
  'export-readiness',
  'dual-ai-workflows',
  'platform-mastery',
  'ai-agents',
];

// ---------------------------------------------------------------------------
// Animation — only subtle fade
// ---------------------------------------------------------------------------

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aiModeLabel(mode?: string): string {
  if (mode === 'dr-sage') return 'Dr. Sage';
  if (mode === 'ana') return 'AnA 1.0';
  return 'Dr. Sage + AnA 1.0';
}

function focusLabel(focus?: string): string {
  if (focus === 'dr-sage') return 'Dr. Sage';
  if (focus === 'ana') return 'AnA 1.0';
  return 'Combined: Dr. Sage + AnA 1.0';
}

function formatCategory(cat: string): string {
  return cat
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Hero Section
// ---------------------------------------------------------------------------

function HeroSection() {
  const pathCount = LEARNING_PATHS.length;
  const moduleCount = LEARNING_MODULES.length;
  const certCount = CERTIFICATIONS.length;

  return (
    <motion.section className="py-12 px-8" {...fade}>
      <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight mb-3">
        Your intelligent guide to regulatory excellence
      </h1>
      <p className="text-base text-zinc-500 max-w-2xl leading-relaxed mb-6">
        Dr. Sage guides your workflow. AnA 1.0 powers your intelligence.
        Together, they help you produce better, faster, more defensible outcomes
        across the entire regulatory lifecycle.
      </p>
      <button className="text-blue-600 font-medium hover:underline text-sm mb-8 inline-block">
        Start my path &rarr;
      </button>
      <p className="text-sm text-zinc-400">
        {pathCount} learning paths &middot; {moduleCount} modules &middot;{' '}
        {certCount} certifications
      </p>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// View: Learning Paths
// ---------------------------------------------------------------------------

function LearningPathsView() {
  return (
    <div>
      <HeroSection />

      <div className="px-8 pb-12">
        {LEARNING_PATHS.map((path, idx) => {
          const moduleCount = path.moduleIds?.length ?? 0;
          return (
            <motion.div
              key={path.id || idx}
              className="py-6 border-b border-zinc-200"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.04 }}
            >
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1.5">
                {path.role}
              </p>
              <h3 className="text-lg font-semibold text-zinc-900 mb-1">
                {path.title}
              </h3>
              <p className="text-sm text-zinc-600 leading-relaxed max-w-xl mb-2">
                {path.promise}
              </p>
              <p className="text-xs text-zinc-400 mb-2">
                {moduleCount} modules &middot; ~{path.estimatedTime}
              </p>
              <button className="text-sm text-blue-600 hover:underline">
                Start path &rarr;
              </button>
              {path.aiHighlight && (
                <p className="text-xs text-zinc-400 italic mt-2">
                  Includes AnA 1.0 intelligence modules
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: All Modules
// ---------------------------------------------------------------------------

function AllModulesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const filteredModules = useMemo(() => {
    let modules = [...LEARNING_MODULES];
    if (activeCategory !== 'all') {
      modules = modules.filter((m) => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      modules = modules.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)) ||
          (m.category && m.category.toLowerCase().includes(q))
      );
    }
    return modules;
  }, [searchQuery, activeCategory]);

  return (
    <div className="px-8 py-8">
      <h2 className="text-2xl font-semibold text-zinc-900 mb-1">Modules</h2>
      <p className="text-sm text-zinc-600 mb-8">
        Browse and launch any module across all learning paths
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search modules..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md rounded-md border border-zinc-200 bg-white py-2 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none transition-colors"
        />
      </div>

      {/* Category filters — text toggles */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-8">
        {MODULE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'text-sm transition-colors',
              activeCategory === cat
                ? 'font-medium text-zinc-900'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {cat === 'all' ? 'All' : formatCategory(cat)}
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-400 mb-6">
        Showing {filteredModules.length} of {LEARNING_MODULES.length} modules
      </p>

      {/* Module grid — 2 columns max */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredModules.map((mod, idx) => {
          const isExpanded = expandedModule === (mod.id || String(idx));
          return (
            <motion.div
              key={mod.id || idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.03 }}
            >
              <div
                className="bg-white rounded-lg border border-zinc-200 p-5 cursor-pointer shadow-sm"
                onClick={() =>
                  setExpandedModule(isExpanded ? null : mod.id || String(idx))
                }
              >
                <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1.5">
                  {formatCategory(mod.category || 'general')}
                </p>
                <h4 className="text-base font-semibold text-zinc-900 mb-1">
                  {mod.title}
                </h4>
                <p className="text-sm text-zinc-500 leading-relaxed mb-3">
                  {mod.description}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    {aiModeLabel(mod.aiMode)}
                  </p>
                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />~{mod.estimatedMinutes} min
                  </p>
                </div>

                {/* Expandable lessons */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-zinc-200 space-y-2">
                        {(mod.lessons || []).map(
                          (
                            lesson: { title: string; description: string } | string,
                            li: number
                          ) => (
                            <p
                              key={li}
                              className="text-sm text-zinc-600"
                            >
                              <span className="text-zinc-400 mr-2">
                                {li + 1}.
                              </span>
                              {typeof lesson === 'string'
                                ? lesson
                                : lesson.title}
                            </p>
                          )
                        )}
                        <button
                          className="text-sm text-blue-600 hover:underline mt-3 inline-block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Start &rarr;
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isExpanded && (
                  <button
                    className="text-sm text-blue-600 hover:underline mt-3 inline-block"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedModule(mod.id || String(idx));
                    }}
                  >
                    Start &rarr;
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredModules.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-sm text-zinc-400">
            No modules found. Try adjusting your search or filters.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: Certifications
// ---------------------------------------------------------------------------

function CertificationsView() {
  return (
    <div className="px-8 py-8">
      <h2 className="text-2xl font-semibold text-zinc-900 mb-1">
        Certifications
      </h2>
      <p className="text-sm text-zinc-600 mb-8">
        Prove your mastery and earn recognized credentials
      </p>

      {CERTIFICATIONS.map((cert, idx) => {
        const requiredCount = cert.requiredModuleIds?.length ?? 0;
        const completedCount = 0; // placeholder for real progress

        return (
          <motion.div
            key={cert.id || idx}
            className="py-6 border-b border-zinc-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: idx * 0.04 }}
          >
            <h3 className="text-lg font-semibold text-zinc-900 mb-1">
              {cert.title}
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-2">
              {cert.competence}
            </p>
            <p className="text-xs text-zinc-400 mb-3">
              Requires {requiredCount} modules
            </p>

            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 max-w-xs h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      requiredCount > 0
                        ? (completedCount / requiredCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="text-xs text-zinc-400">
                {completedCount} of {requiredCount} complete
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Focus: {focusLabel(cert.focus)}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: About
// ---------------------------------------------------------------------------

function AboutView() {
  const timelineEvents = [
    { year: '2023', event: 'Concept2Cure vision conceived' },
    { year: '2024', event: 'Dr. Sage AI assistant launched' },
    { year: '2025', event: 'AnA 1.0 analytical engine released' },
    { year: '2026', event: 'Dual-AI system integration & Enablement Center' },
  ];

  return (
    <div className="px-8 py-8 max-w-3xl">
      <h2 className="text-2xl font-semibold text-zinc-900 mb-1">
        About Concept2Cure
      </h2>
      <p className="text-sm text-zinc-600 mb-10">
        Why we exist and how our dual-AI system transforms regulatory work
      </p>

      {/* Why Concept2Cure exists */}
      <section className="mb-12">
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">
          Why Concept2Cure exists
        </h3>
        <div className="space-y-4 text-sm text-zinc-600 leading-relaxed">
          <p>
            Regulatory complexity keeps growing. Global requirements shift
            constantly, and teams struggle to stay current across FDA, EMA, PMDA,
            and dozens of other agencies. Every day of delay costs organizations
            millions, yet manual processes create bottlenecks that technology
            should eliminate.
          </p>
          <p>
            Critical submissions contain errors that cause rejections, deficiency
            letters, and clinical holds. When senior regulatory experts leave,
            their insights and decision frameworks leave with them. The industry
            needs a fundamentally better way to produce, review, and govern
            regulatory content.
          </p>
          <p>
            Concept2Cure exists to solve these problems with a dual-AI system
            that combines workflow intelligence with analytical depth, helping
            teams produce better, faster, and more defensible regulatory outcomes.
          </p>
        </div>
      </section>

      {/* The dual-AI system */}
      <section className="mb-12">
        <h3 className="text-lg font-semibold text-zinc-900 mb-6">
          The dual-AI system
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Dr. Sage */}
          <div>
            <h4 className="text-base font-semibold text-zinc-900 mb-1">
              Dr. Sage
            </h4>
            <p className="text-xs text-zinc-400 mb-3">Your Workflow Guide</p>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li>Contextual workflow guidance</li>
              <li>Risk identification and mitigation</li>
              <li>Smart document recommendations</li>
              <li>Regulatory pathway navigation</li>
            </ul>
          </div>

          {/* AnA 1.0 */}
          <div>
            <h4 className="text-base font-semibold text-zinc-900 mb-1">
              AnA 1.0
            </h4>
            <p className="text-xs text-zinc-400 mb-3">
              Your Intelligence Engine
            </p>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li>Deep regulatory data analysis</li>
              <li>Cross-reference and gap detection</li>
              <li>Intelligent document generation</li>
              <li>Predictive compliance scoring</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h3 className="text-lg font-semibold text-zinc-900 mb-6">
          Our journey
        </h3>
        <div className="relative">
          <div className="absolute left-[3px] top-2 bottom-2 w-px bg-zinc-100" />
          {timelineEvents.map((evt, idx) => (
            <motion.div
              key={idx}
              className="relative pl-8 pb-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.05 }}
            >
              <div className="absolute left-0 top-2 h-[7px] w-[7px] rounded-full bg-zinc-300" />
              <p className="text-xs text-zinc-400 mb-0.5">{evt.year}</p>
              <p className="text-sm text-zinc-900">{evt.event}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: AI Agents
// ---------------------------------------------------------------------------

function AiAgentsView() {
  const [subView, setSubView] = useState<'showcase' | 'setup' | 'monitor'>('showcase');

  return (
    <div className="py-12 px-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-zinc-900 tracking-tight">
          AI Agents
        </h2>
        <p className="text-base text-zinc-500 mt-2 max-w-2xl leading-relaxed">
          35 specialized AI agents and services power your regulatory workflows.
          Explore capabilities, configure your AI team, and monitor agent execution in real time.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-6 mb-8 border-b border-zinc-200 pb-3">
        {([
          { key: 'showcase' as const, label: 'All Capabilities' },
          { key: 'setup' as const, label: 'Setup Wizard' },
          { key: 'monitor' as const, label: 'Workflow Monitor' },
        ]).map((item) => (
          <button
            key={item.key}
            onClick={() => setSubView(item.key)}
            className={cn(
              'text-sm transition-colors',
              subView === item.key
                ? 'text-zinc-900 font-medium'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <React.Suspense
        fallback={
          <p className="text-sm text-zinc-400 py-12">Loading...</p>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={subView}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {subView === 'showcase' && <AgentShowcase />}
            {subView === 'setup' && <AgentSetupWizard />}
            {subView === 'monitor' && <AgentWorkflowMonitor />}
          </motion.div>
        </AnimatePresence>
      </React.Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component: EnablementCenter
// ---------------------------------------------------------------------------

export function EnablementCenter({
  onClose,
  initialView,
}: EnablementCenterProps) {
  const [activeView, setActiveView] = useState<ViewKey>(
    (initialView as ViewKey) || 'learning-paths'
  );

  const handleTabChange = useCallback((key: ViewKey) => {
    setActiveView(key);
  }, []);

  const renderView = useMemo(() => {
    switch (activeView) {
      case 'learning-paths':
        return <LearningPathsView />;
      case 'all-modules':
        return <AllModulesView />;
      case 'certifications':
        return <CertificationsView />;
      case 'about':
        return <AboutView />;
      case 'ai-agents':
        return <AiAgentsView />;
      default:
        return <LearningPathsView />;
    }
  }, [activeView]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FAFAF9]">
      {/* Top bar */}
      <header className="flex-shrink-0 h-12 border-b border-zinc-200 bg-white">
        <div className="flex items-center h-full px-6">
          {/* Back */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-600 transition-colors mr-4"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <span className="text-sm font-medium text-zinc-900 mr-8">
            Enablement Center
          </span>

          {/* Tabs */}
          <nav className="flex items-center gap-6 h-full overflow-x-auto">
            {TAB_LABELS.map((tab) => {
              const isActive = activeView === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'relative text-sm h-full flex items-center transition-colors whitespace-nowrap',
                    isActive
                      ? 'text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-600'
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <motion.div
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-900"
                      layoutId="activeTab"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {renderView}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
