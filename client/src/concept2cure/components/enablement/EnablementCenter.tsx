import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LEARNING_PATHS,
  LEARNING_MODULES,
  CERTIFICATIONS,
  RELEASE_NOTES,
  WORKFLOW_SCENARIOS,
  COMING_SOON_FEATURES,
} from './enablement-data';
import { DualAITheater, THEATER_SCENARIOS } from './DualAITheater';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CapabilityConstellation } from './CapabilityConstellation';
import { MissionBrowser } from './MicroMissions';

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
  | 'whats-new'
  | 'about'
  | 'ai-in-action';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS: { key: ViewKey; label: string }[] = [
  { key: 'learning-paths', label: 'Learning Paths' },
  { key: 'all-modules', label: 'Modules' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'whats-new', label: "What's New" },
  { key: 'about', label: 'About' },
  { key: 'ai-in-action', label: 'In Action' },
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

function actorLabel(actor?: string): string {
  if (actor === 'dr-sage') return 'Dr. Sage';
  if (actor === 'ana') return 'AnA 1.0';
  return 'Dr. Sage + AnA 1.0';
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
              className="py-6 border-b border-zinc-100"
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
                className="bg-white rounded-lg border border-zinc-100 p-5 cursor-pointer shadow-sm"
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
                      <div className="mt-4 pt-4 border-t border-zinc-100 space-y-2">
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
            className="py-6 border-b border-zinc-100"
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
// View: What's New
// ---------------------------------------------------------------------------

function WhatsNewView() {
  const featured = RELEASE_NOTES.length > 0 ? RELEASE_NOTES[0] : null;
  const timeline = RELEASE_NOTES.slice(1);

  return (
    <div className="px-8 py-8">
      <h2 className="text-2xl font-semibold text-zinc-900 mb-1">
        What&apos;s New
      </h2>
      <p className="text-sm text-zinc-600 mb-10">
        Latest features, improvements, and announcements
      </p>

      {/* Featured item */}
      {featured && (
        <motion.div className="mb-12" {...fade}>
          <p className="text-xs text-zinc-400 mb-2">{featured.date}</p>
          <h3 className="text-xl font-semibold text-zinc-900 mb-2">
            {featured.title}
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-2xl mb-3">
            {featured.description}
          </p>
          {featured.ctaLabel && (
            <button className="text-sm text-blue-600 hover:underline">
              {featured.ctaLabel} &rarr;
            </button>
          )}
        </motion.div>
      )}

      {/* Timeline */}
      <div className="relative mb-12">
        <div className="absolute left-[3px] top-2 bottom-2 w-px bg-zinc-100" />

        {timeline.map((note, idx) => (
          <motion.div
            key={note.id || idx}
            className="relative pl-8 pb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: idx * 0.04 }}
          >
            {/* Dot */}
            <div className="absolute left-0 top-2 h-[7px] w-[7px] rounded-full bg-zinc-300" />

            <p className="text-xs text-zinc-400 mb-1">{note.date}</p>
            <h4 className="text-sm font-semibold text-zinc-900 mb-1">
              {note.title}
            </h4>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {note.description}
            </p>
            {note.ctaLabel && (
              <button className="text-sm text-blue-600 hover:underline mt-1 inline-block">
                {note.ctaLabel} &rarr;
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Coming Soon */}
      {COMING_SOON_FEATURES.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">
            Coming Soon
          </h3>
          {COMING_SOON_FEATURES.map((feature, idx) => (
            <div key={feature.id || idx} className="mb-4">
              <p className="text-sm text-zinc-400">
                {feature.title}{' '}
                <span className="text-zinc-300">
                  &middot; {feature.expectedDate}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
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
// View: In Action
// ---------------------------------------------------------------------------

function AiInActionView() {
  const [selectedScenario, setSelectedScenario] = useState<number>(0);

  const scenario =
    WORKFLOW_SCENARIOS.length > 0 ? WORKFLOW_SCENARIOS[selectedScenario] : null;

  return (
    <div className="px-8 py-8">
      <h2 className="text-2xl font-semibold text-zinc-900 mb-1">
        Dr. Sage + AnA 1.0 in Action
      </h2>
      <p className="text-sm text-zinc-600 mb-8">
        See how our dual-AI system transforms real regulatory workflows
      </p>

      {/* Scenario selector — text links */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-10">
        {WORKFLOW_SCENARIOS.map((sc, idx) => (
          <button
            key={sc.id || idx}
            onClick={() => setSelectedScenario(idx)}
            className={cn(
              'text-sm transition-colors',
              selectedScenario === idx
                ? 'font-medium text-zinc-900 underline underline-offset-4'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {sc.title}
          </button>
        ))}
      </div>

      {/* Selected scenario detail */}
      <AnimatePresence mode="wait">
        {scenario && (
          <motion.div
            key={selectedScenario}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-sm text-zinc-600 leading-relaxed mb-8 max-w-2xl">
              {scenario.description}
            </p>

            {/* Workflow steps — numbered list */}
            <ol className="space-y-3 mb-10 max-w-2xl">
              {(scenario.steps || []).map((step: any, idx: number) => {
                const status = step.status || 'pending';
                const isComplete = status === 'complete';
                const isActive = status === 'running';

                return (
                  <li
                    key={step.id || idx}
                    className={cn(
                      'text-sm leading-relaxed',
                      isComplete && 'text-zinc-400 line-through',
                      isActive && 'font-medium text-zinc-900',
                      !isComplete && !isActive && 'text-zinc-600'
                    )}
                  >
                    <span className="text-zinc-400 mr-2">{idx + 1}.</span>
                    {step.title}{' '}
                    <span className="text-zinc-400">
                      ({actorLabel(step.actor)})
                    </span>
                    {isComplete && (
                      <Check className="inline h-3.5 w-3.5 ml-1.5 text-zinc-400" />
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Why this is better — quiet italic paragraph */}
            <p className="text-sm text-zinc-500 italic max-w-2xl leading-relaxed mb-12">
              Without Concept2Cure, this workflow requires manual coordination
              across multiple teams, days of effort, and inconsistent quality.
              With the dual-AI system, Dr. Sage orchestrates each step while AnA
              1.0 provides real-time intelligence, reducing cycle time from weeks
              to hours with higher confidence in outcomes.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live components — wrapped minimally */}
      <div className="space-y-12 mt-4">
        <section>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Watch them work
          </h3>
          <p className="text-sm text-zinc-600 mb-4">
            See Dr. Sage and AnA 1.0 collaborate in real time with visible
            reasoning
          </p>
          <div className="rounded-lg border border-zinc-100 overflow-hidden">
            <DualAITheater
              scenario={THEATER_SCENARIOS['evidence-review']}
              autoPlay
              speed="normal"
            />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            See the difference
          </h3>
          <p className="text-sm text-zinc-600 mb-4">
            Drag the slider to compare legacy workflows with Concept2Cure
          </p>
          <BeforeAfterSlider />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Platform capability map
          </h3>
          <p className="text-sm text-zinc-600 mb-4">
            Explore the full constellation of interconnected capabilities
          </p>
          <div
            className="rounded-lg overflow-hidden border border-zinc-100"
            style={{ height: 500 }}
          >
            <CapabilityConstellation interactive />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Try it now — 60-second missions
          </h3>
          <p className="text-sm text-zinc-600 mb-4">
            Hands-on challenges to experience the platform in action
          </p>
          <MissionBrowser
            onStartMission={() => {}}
            userRole="regulatory-writer"
          />
        </section>
      </div>
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
      case 'whats-new':
        return <WhatsNewView />;
      case 'about':
        return <AboutView />;
      case 'ai-in-action':
        return <AiInActionView />;
      default:
        return <LearningPathsView />;
    }
  }, [activeView]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FAFAF9]">
      {/* Top bar */}
      <header className="flex-shrink-0 h-12 border-b border-zinc-100 bg-white">
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
