import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  LayoutGrid,
  Award,
  Zap,
  Info,
  Sparkles,
  ArrowLeft,
  Brain,
  Bot,
  BookOpen,
  Shield,
  Clock,
  ChevronRight,
  CheckCircle2,
  Play,
  Users,
  Target,
  Compass,
  Star,
  TrendingUp,
  FileText,
  Search,
  Filter,
  Eye,
  Wrench,
  Layers,
  Building2,
  Beaker,
  FlaskConical,
  Globe,
  Lock,
  Unlock,
  BarChart3,
  CircleDot,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageSquare,
  Heart,
  Rocket,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { BeforeAfterSlider, COMPARISON_PRESETS } from './BeforeAfterSlider';
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

interface NavTab {
  key: ViewKey;
  label: string;
  icon: React.ElementType;
  accent?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAV_TABS: NavTab[] = [
  { key: 'learning-paths', label: 'Learning Paths', icon: GraduationCap },
  { key: 'all-modules', label: 'All Modules', icon: LayoutGrid },
  { key: 'certifications', label: 'Certifications', icon: Award },
  { key: 'whats-new', label: "What's New", icon: Zap },
  { key: 'about', label: 'About', icon: Info },
  {
    key: 'ai-in-action',
    label: 'Dr. Sage + AnA 1.0 in Action',
    icon: Sparkles,
    accent: true,
  },
];

const PATH_COLORS: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
  indigo: 'from-indigo-500 to-indigo-600',
  emerald: 'from-emerald-500 to-emerald-600',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
  cyan: 'from-cyan-500 to-cyan-600',
  teal: 'from-teal-500 to-teal-600',
};

const PATH_BORDER_COLORS: Record<string, string> = {
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  indigo: 'border-l-indigo-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  cyan: 'border-l-cyan-500',
  teal: 'border-l-teal-500',
};

const FILTER_CATEGORIES = [
  { key: 'role', label: 'Role', icon: Users },
  { key: 'clientType', label: 'Client Type', icon: Building2 },
  { key: 'workflow', label: 'Workflow', icon: Layers },
  { key: 'aiMode', label: 'AI Mode', icon: Brain },
  { key: 'category', label: 'Category', icon: Filter },
  { key: 'status', label: 'Status', icon: CircleDot },
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const fadeSlideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

// ---------------------------------------------------------------------------
// Sub-components: Shared
// ---------------------------------------------------------------------------

function AiModeIndicator({ mode }: { mode?: string }) {
  if (mode === 'dr-sage') {
    return (
      <div className="flex items-center gap-1 text-xs text-blue-400">
        <Bot className="h-3.5 w-3.5" />
        <span>Dr. Sage</span>
      </div>
    );
  }
  if (mode === 'ana') {
    return (
      <div className="flex items-center gap-1 text-xs text-violet-400">
        <Brain className="h-3.5 w-3.5" />
        <span>AnA 1.0</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-indigo-400">
      <Bot className="h-3.5 w-3.5" />
      <span>+</span>
      <Brain className="h-3.5 w-3.5" />
      <span>Both</span>
    </div>
  );
}

function ProgressRing({
  current,
  total,
  size = 48,
  strokeWidth = 4,
}: {
  current: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? current / total : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
        {current}/{total}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-400">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-slate-400 ml-13 pl-0.5">{subtitle}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero Section
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <motion.section
      className="relative overflow-hidden rounded-2xl mb-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-violet-900" />

      {/* Animated mesh overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl animate-pulse"
          style={{ animationDelay: '1.5s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/15 blur-3xl animate-pulse"
          style={{ animationDelay: '3s' }}
        />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative px-8 py-16 md:px-16 md:py-20">
        <motion.div
          className="max-w-3xl"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={staggerItem}>
            <Badge className="mb-4 bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30">
              <Sparkles className="mr-1 h-3 w-3" />
              Concept2Cure Enablement
            </Badge>
          </motion.div>

          <motion.h1
            className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight"
            variants={staggerItem}
          >
            Your Intelligent Guide to{' '}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Regulatory Excellence
            </span>
          </motion.h1>

          <motion.p
            className="text-lg text-slate-300 mb-8 max-w-2xl leading-relaxed"
            variants={staggerItem}
          >
            Dr. Sage guides your workflow. AnA 1.0 powers your intelligence.
            Together, they help you produce better, faster, more defensible
            outcomes.
          </motion.p>

          <motion.div
            className="flex flex-wrap items-center gap-3 mb-10"
            variants={staggerItem}
          >
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25"
            >
              <Compass className="mr-2 h-4 w-4" />
              Start My Path
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-500 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Watch Dr. Sage + AnA 1.0 Work
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-white/5"
            >
              <Award className="mr-2 h-4 w-4" />
              Explore Certifications
            </Button>
          </motion.div>

          <motion.div
            className="flex flex-wrap items-center gap-6 text-sm"
            variants={staggerItem}
          >
            {[
              { value: '12', label: 'Learning Paths' },
              { value: '48', label: 'Modules' },
              { value: '5', label: 'Certifications' },
              { value: '2', label: 'AI Systems Working Together' },
            ].map((stat, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">
                  {stat.value}
                </span>
                <span className="text-slate-400">{stat.label}</span>
                {i < 3 && (
                  <span className="ml-4 h-4 w-px bg-slate-600" />
                )}
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
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

      <SectionHeader
        icon={GraduationCap}
        title="Learning Paths"
        subtitle="Curated journeys designed for your role and goals"
      />

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {LEARNING_PATHS.map((path, idx) => {
          const colorKey = path.color || 'blue';
          const borderColor =
            PATH_BORDER_COLORS[colorKey] || 'border-l-blue-500';
          const gradientColor =
            PATH_COLORS[colorKey] || 'from-blue-500 to-blue-600';

          return (
            <motion.div key={path.id || idx} variants={staggerItem}>
              <Card
                className={cn(
                  'group relative overflow-hidden border-l-4 bg-slate-900/60 border-slate-800 hover:border-slate-700 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-blue-900/10 cursor-pointer',
                  borderColor
                )}
              >
                {/* Hover glow */}
                <div
                  className={cn(
                    'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r',
                    gradientColor,
                    'to-transparent'
                  )}
                  style={{ maxWidth: '4px' }}
                />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="outline"
                          className="text-xs border-slate-600 text-slate-300"
                        >
                          {path.role || 'All Roles'}
                        </Badge>
                        {path.aiHighlight && (
                          <Badge className="text-xs bg-violet-500/20 text-violet-300 border-violet-500/30">
                            <Brain className="mr-1 h-3 w-3" />
                            AnA 1.0
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg text-white group-hover:text-blue-300 transition-colors">
                        {path.title}
                      </CardTitle>
                    </div>
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br',
                        gradientColor,
                        'text-white shadow-lg'
                      )}
                    >
                      <GraduationCap className="h-5 w-5" />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {path.promise ||
                      'Master this pathway to unlock new capabilities and earn your certification.'}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {path.moduleCount || 0} Modules
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {path.estimatedTime || '~8 hours'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Progress</span>
                      <span className="text-slate-400">
                        {path.progress || 0}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <motion.div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r',
                          gradientColor
                        )}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${path.progress || 0}%`,
                        }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>

                  {path.anaHighlight && (
                    <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 text-xs text-violet-300">
                      <div className="flex items-center gap-1.5 mb-1 font-medium">
                        <Brain className="h-3.5 w-3.5" />
                        AnA 1.0 Highlight
                      </div>
                      <span className="text-violet-400">
                        {path.anaHighlight}
                      </span>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full justify-between text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 group/btn"
                  >
                    <span>Start Path</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: All Modules
// ---------------------------------------------------------------------------

function AllModulesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {}
  );
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const filteredModules = useMemo(() => {
    let modules = [...LEARNING_MODULES];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      modules = modules.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)) ||
          (m.category && m.category.toLowerCase().includes(q))
      );
    }
    // Apply any active filters
    Object.entries(activeFilters).forEach(([filterKey, filterValue]) => {
      if (!filterValue) return;
      modules = modules.filter((m) => {
        const field = (m as any)[filterKey];
        if (!field) return true;
        return (
          String(field).toLowerCase() === filterValue.toLowerCase()
        );
      });
    });
    return modules;
  }, [searchQuery, activeFilters]);

  const toggleFilter = useCallback(
    (key: string, value: string) => {
      setActiveFilters((prev) => ({
        ...prev,
        [key]: prev[key] === value ? '' : value,
      }));
    },
    []
  );

  return (
    <div>
      <SectionHeader
        icon={LayoutGrid}
        title="All Modules"
        subtitle="Browse and launch any module across all learning paths"
      />

      {/* Search and Filter Bar */}
      <div className="mb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search modules by name, category, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTER_CATEGORIES.map((cat) => (
            <Button
              key={cat.key}
              variant="outline"
              size="sm"
              className={cn(
                'rounded-full border-slate-700 text-slate-400 hover:text-white hover:border-slate-500',
                activeFilters[cat.key] &&
                  'border-blue-500 text-blue-400 bg-blue-500/10'
              )}
              onClick={() => toggleFilter(cat.key, cat.label)}
            >
              <cat.icon className="mr-1.5 h-3.5 w-3.5" />
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Module count */}
      <div className="mb-4 text-sm text-slate-500">
        Showing {filteredModules.length} of {LEARNING_MODULES.length} modules
      </div>

      {/* Module Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {filteredModules.map((mod, idx) => {
          const isExpanded = expandedModule === (mod.id || String(idx));

          return (
            <motion.div key={mod.id || idx} variants={staggerItem}>
              <Card
                className={cn(
                  'group bg-slate-900/60 border-slate-800 hover:border-slate-700 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-indigo-900/10 cursor-pointer',
                  isExpanded && 'border-blue-500/50 shadow-lg shadow-blue-900/20'
                )}
                onClick={() =>
                  setExpandedModule(
                    isExpanded ? null : mod.id || String(idx)
                  )
                }
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Badge
                        variant="outline"
                        className="mb-2 text-xs border-slate-600 text-slate-400"
                      >
                        {mod.category || 'General'}
                      </Badge>
                      <CardTitle className="text-sm font-semibold text-white leading-snug group-hover:text-blue-300 transition-colors">
                        {mod.title}
                      </CardTitle>
                    </div>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    </motion.div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {mod.description ||
                      'Explore key concepts and hands-on exercises in this focused module.'}
                  </p>

                  <div className="flex items-center justify-between">
                    <AiModeIndicator mode={mod.aiMode} />
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {mod.timeEstimate || '30 min'}
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {mod.lessonCount || 4} lessons
                      </span>
                    </div>
                  </div>

                  {/* Expanded lesson outline */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                          <p className="text-xs font-medium text-slate-300 mb-2">
                            Lesson Outline
                          </p>
                          {(
                            mod.lessons || [
                              'Introduction & Context',
                              'Core Concepts',
                              'Hands-on Exercise',
                              'Assessment & Review',
                            ]
                          ).map((lesson: string, li: number) => (
                            <div
                              key={li}
                              className="flex items-center gap-2 text-xs text-slate-400"
                            >
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-500">
                                {li + 1}
                              </div>
                              <span>{lesson}</span>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Rocket className="mr-1.5 h-3.5 w-3.5" />
                            Launch Mission
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isExpanded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedModule(mod.id || String(idx));
                      }}
                    >
                      <Rocket className="mr-1.5 h-3.5 w-3.5" />
                      Launch Mission
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {filteredModules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Search className="h-12 w-12 mb-4 text-slate-600" />
          <p className="text-lg font-medium">No modules found</p>
          <p className="text-sm">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: Certifications
// ---------------------------------------------------------------------------

function CertificationsView() {
  const certGradients = [
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-indigo-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
  ];

  const certIcons = [Shield, Award, Star, Target, Trophy];

  // Fallback if Trophy is not available
  const Trophy = Award;

  return (
    <div>
      <SectionHeader
        icon={Award}
        title="Certifications"
        subtitle="Prove your mastery and earn recognized credentials"
      />

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {CERTIFICATIONS.map((cert, idx) => {
          const gradient = certGradients[idx % certGradients.length];
          const CertIcon = certIcons[idx % certIcons.length];

          return (
            <motion.div key={cert.id || idx} variants={staggerItem}>
              <Card className="group bg-slate-900/60 border-slate-800 hover:border-slate-700 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-violet-900/15 overflow-hidden">
                {/* Gradient badge area */}
                <div
                  className={cn(
                    'relative h-32 bg-gradient-to-br',
                    gradient,
                    'flex items-center justify-center'
                  )}
                >
                  {/* Subtle pattern */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}
                  />
                  <motion.div
                    className="relative"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm text-white shadow-lg">
                      <CertIcon className="h-8 w-8" />
                    </div>
                  </motion.div>

                  {/* Level badge */}
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-white/20 text-white border-white/30 text-xs backdrop-blur-sm">
                      {cert.level || 'Professional'}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-5 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                      {cert.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {cert.competence ||
                        'Demonstrate comprehensive mastery of key regulatory workflows and AI-assisted processes.'}
                    </p>
                  </div>

                  {/* AI focus */}
                  <div className="flex items-center gap-2">
                    <AiModeIndicator mode={cert.aiFocus} />
                  </div>

                  {/* Progress section */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      <span className="text-slate-300 font-medium">
                        {cert.requiredModules || 8}
                      </span>{' '}
                      modules required
                    </div>
                    <ProgressRing
                      current={cert.completedModules || 0}
                      total={cert.requiredModules || 8}
                    />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 group/btn"
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    View Requirements
                    <ChevronRight className="ml-auto h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: What's New
// ---------------------------------------------------------------------------

function WhatsNewView() {
  const impactColors: Record<string, string> = {
    high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const typeIcons: Record<string, React.ElementType> = {
    feature: Rocket,
    improvement: TrendingUp,
    fix: Wrench,
    update: Zap,
  };

  const featured =
    RELEASE_NOTES.length > 0 ? RELEASE_NOTES[0] : null;
  const timeline = RELEASE_NOTES.slice(1);

  return (
    <div>
      <SectionHeader
        icon={Zap}
        title="What's New"
        subtitle="Latest features, improvements, and announcements"
      />

      {/* Featured Release Hero */}
      {featured && (
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-900/40 via-indigo-900/40 to-violet-900/40 border-blue-500/30">
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />

            <CardContent className="relative p-8">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge className="mb-3 bg-blue-500/20 text-blue-300 border-blue-500/30">
                    <Star className="mr-1 h-3 w-3" />
                    Featured Release
                  </Badge>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {featured.title}
                  </h3>
                  <p className="text-sm text-slate-300 mb-1">
                    {featured.version || 'v2.4.0'} &middot;{' '}
                    {featured.date || 'March 2026'}
                  </p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-400">
                  <Rocket className="h-7 w-7" />
                </div>
              </div>
              <p className="text-slate-400 leading-relaxed mb-6 max-w-2xl">
                {featured.description ||
                  'A major release bringing enhanced AI capabilities and new workflow automation features.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(featured.highlights || []).map(
                  (h: string, i: number) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="border-slate-600 text-slate-300"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-400" />
                      {h}
                    </Badge>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Timeline */}
      <div className="mb-12">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-400" />
          Recent Updates
        </h3>
        <motion.div
          className="relative space-y-0"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Timeline line */}
          <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-800" />

          {timeline.map((note, idx) => {
            const TypeIcon =
              typeIcons[note.type || 'update'] || Zap;
            const impact = note.impact || 'medium';

            return (
              <motion.div
                key={note.id || idx}
                className="relative pl-14 pb-8"
                variants={staggerItem}
              >
                {/* Timeline dot */}
                <div className="absolute left-3.5 top-1.5 flex h-3 w-3 items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 ring-4 ring-slate-950" />
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="h-4 w-4 text-blue-400" />
                      <h4 className="text-sm font-semibold text-white">
                        {note.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('text-xs', impactColors[impact])}
                      >
                        {impact} impact
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {note.date || 'March 2026'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {note.description ||
                      'Improvements to the platform experience.'}
                  </p>
                  {note.impactStatement && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-indigo-400">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{note.impactStatement}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Coming Soon */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" />
          Coming Soon
        </h3>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {COMING_SOON_FEATURES.map((feature, idx) => (
            <motion.div key={feature.id || idx} variants={staggerItem}>
              <Card className="bg-slate-900/40 border-slate-800 border-dashed hover:border-violet-500/40 transition-all duration-300 group">
                <CardContent className="p-5 space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 transition-colors">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">
                    {feature.title}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {feature.description ||
                      'Exciting new capability coming to the platform.'}
                  </p>
                  <Badge
                    variant="outline"
                    className="border-violet-500/30 text-violet-400 text-xs"
                  >
                    {feature.eta || 'Q2 2026'}
                  </Badge>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: About
// ---------------------------------------------------------------------------

function AboutView() {
  const painPoints = [
    {
      icon: AlertCircle,
      title: 'Regulatory complexity keeps growing',
      desc: 'Global requirements shift constantly. Teams struggle to stay current across FDA, EMA, PMDA, and dozens of other agencies.',
    },
    {
      icon: Clock,
      title: 'Timelines are brutal',
      desc: 'Every day of delay costs organizations millions. Manual processes create bottlenecks that AI should eliminate.',
    },
    {
      icon: FileText,
      title: 'Document quality is inconsistent',
      desc: 'Critical submissions contain errors that cause rejections, deficiency letters, and clinical holds.',
    },
    {
      icon: Users,
      title: 'Institutional knowledge walks out the door',
      desc: 'When senior regulatory experts leave, their insights and decision frameworks leave with them.',
    },
  ];

  const timelineEvents = [
    { year: '2023', event: 'Concept2Cure vision conceived', icon: Lightbulb },
    { year: '2024', event: 'Dr. Sage AI assistant launched', icon: Bot },
    {
      year: '2025',
      event: 'AnA 1.0 analytical engine released',
      icon: Brain,
    },
    {
      year: '2026',
      event: 'Dual-AI system integration & Enablement Center',
      icon: Sparkles,
    },
  ];

  return (
    <div>
      <SectionHeader
        icon={Info}
        title="About Concept2Cure"
        subtitle="Why we exist and how our dual-AI system transforms regulatory work"
      />

      {/* Why section */}
      <div className="mb-14">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-400" />
          Why Concept2Cure Exists
        </h3>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {painPoints.map((point, idx) => (
            <motion.div key={idx} variants={staggerItem}>
              <Card className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-colors">
                <CardContent className="p-5 flex gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 flex-shrink-0">
                    <point.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">
                      {point.title}
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {point.desc}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Meet the Dual-AI System */}
      <div className="mb-14">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          Meet the Dual-AI System
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dr. Sage */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="h-full bg-gradient-to-br from-blue-900/30 to-slate-900/60 border-blue-500/30 hover:border-blue-500/50 transition-colors">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-400">
                    <Bot className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">Dr. Sage</h4>
                    <p className="text-xs text-blue-400">
                      Your Workflow Guide
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Dr. Sage is your intelligent regulatory companion. It guides
                  you through complex workflows, suggests next actions,
                  identifies risks, and ensures you never miss a critical step.
                </p>
                <div className="space-y-2">
                  {[
                    'Contextual workflow guidance',
                    'Risk identification & mitigation',
                    'Smart document recommendations',
                    'Regulatory pathway navigation',
                  ].map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-slate-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* AnA 1.0 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="h-full bg-gradient-to-br from-violet-900/30 to-slate-900/60 border-violet-500/30 hover:border-violet-500/50 transition-colors">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-400">
                    <Brain className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">AnA 1.0</h4>
                    <p className="text-xs text-violet-400">
                      Your Intelligence Engine
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  AnA 1.0 is the analytical powerhouse behind Concept2Cure. It
                  processes regulatory data, generates insights, performs
                  cross-reference analysis, and powers intelligent document
                  generation.
                </p>
                <div className="space-y-2">
                  {[
                    'Deep regulatory data analysis',
                    'Cross-reference & gap detection',
                    'Intelligent document generation',
                    'Predictive compliance scoring',
                  ].map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-slate-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Company Timeline */}
      <div>
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-400" />
          Our Journey
        </h3>
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500 via-indigo-500 to-violet-500 opacity-30" />
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {timelineEvents.map((evt, idx) => (
              <motion.div
                key={idx}
                className="relative pl-14 group"
                variants={staggerItem}
              >
                <div className="absolute left-2.5 top-2 flex h-5 w-5 items-center justify-center">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 ring-4 ring-slate-950 flex items-center justify-center">
                    <evt.icon className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 group-hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className="border-indigo-500/30 text-indigo-400"
                    >
                      {evt.year}
                    </Badge>
                    <span className="text-sm text-white">{evt.event}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View: Dr. Sage + AnA 1.0 in Action
// ---------------------------------------------------------------------------

function AiInActionView() {
  const [selectedScenario, setSelectedScenario] = useState<number>(0);

  const scenario =
    WORKFLOW_SCENARIOS.length > 0
      ? WORKFLOW_SCENARIOS[selectedScenario]
      : null;

  const actorStyles: Record<
    string,
    { bg: string; text: string; icon: React.ElementType; label: string }
  > = {
    'dr-sage': {
      bg: 'bg-blue-500/15 border-blue-500/30',
      text: 'text-blue-400',
      icon: Bot,
      label: 'Dr. Sage',
    },
    ana: {
      bg: 'bg-violet-500/15 border-violet-500/30',
      text: 'text-violet-400',
      icon: Brain,
      label: 'AnA 1.0',
    },
    both: {
      bg: 'bg-indigo-500/15 border-indigo-500/30',
      text: 'text-indigo-400',
      icon: Sparkles,
      label: 'Both',
    },
    user: {
      bg: 'bg-slate-500/15 border-slate-500/30',
      text: 'text-slate-400',
      icon: Users,
      label: 'You',
    },
  };

  const statusColors: Record<string, string> = {
    complete: 'text-emerald-400 bg-emerald-500/15',
    active: 'text-blue-400 bg-blue-500/15',
    pending: 'text-slate-500 bg-slate-500/15',
  };

  return (
    <div>
      <SectionHeader
        icon={Sparkles}
        title="Dr. Sage + AnA 1.0 in Action"
        subtitle="See how our dual-AI system transforms real regulatory workflows"
      />

      {/* Scenario Selector */}
      <div className="mb-10">
        <p className="text-sm text-slate-400 mb-4">
          Select a scenario to see the step-by-step workflow:
        </p>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {WORKFLOW_SCENARIOS.map((sc, idx) => (
            <motion.div key={sc.id || idx} variants={staggerItem}>
              <button
                onClick={() => setSelectedScenario(idx)}
                className={cn(
                  'w-full text-left rounded-xl border p-4 transition-all duration-200',
                  selectedScenario === idx
                    ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-900/20'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold',
                      selectedScenario === idx
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    )}
                  >
                    {idx + 1}
                  </div>
                  <h4
                    className={cn(
                      'text-sm font-medium',
                      selectedScenario === idx
                        ? 'text-white'
                        : 'text-slate-300'
                    )}
                  >
                    {sc.title}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {sc.description || 'Explore this AI-powered workflow scenario.'}
                </p>
              </button>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Selected Scenario Detail */}
      <AnimatePresence mode="wait">
        {scenario && (
          <motion.div
            key={selectedScenario}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Scenario header */}
            <Card className="mb-8 bg-gradient-to-br from-slate-900 via-blue-900/20 to-violet-900/20 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Badge className="mb-2 bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                      Scenario {selectedScenario + 1}
                    </Badge>
                    <h3 className="text-xl font-bold text-white">
                      {scenario.title}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    {scenario.actors?.map((actor: string, i: number) => {
                      const style = actorStyles[actor] || actorStyles['user'];
                      const ActorIcon = style.icon;
                      return (
                        <Badge
                          key={i}
                          variant="outline"
                          className={cn(
                            'text-xs',
                            style.bg,
                            style.text
                          )}
                        >
                          <ActorIcon className="mr-1 h-3 w-3" />
                          {style.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {scenario.description}
                </p>
              </CardContent>
            </Card>

            {/* Workflow Steps */}
            <div className="relative mb-10">
              <div className="absolute left-7 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/50 via-indigo-500/50 to-violet-500/50" />

              <motion.div
                className="space-y-4"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {(scenario.steps || []).map(
                  (step: any, idx: number) => {
                    const actor = step.actor || 'both';
                    const style =
                      actorStyles[actor] || actorStyles['both'];
                    const ActorIcon = style.icon;
                    const status = step.status || 'pending';

                    return (
                      <motion.div
                        key={idx}
                        className="relative pl-16"
                        variants={staggerItem}
                      >
                        {/* Step number node */}
                        <div className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center">
                          <div
                            className={cn(
                              'h-7 w-7 rounded-full ring-4 ring-slate-950 flex items-center justify-center text-xs font-bold',
                              status === 'complete'
                                ? 'bg-emerald-500 text-white'
                                : status === 'active'
                                ? 'bg-blue-500 text-white animate-pulse'
                                : 'bg-slate-700 text-slate-400'
                            )}
                          >
                            {status === 'complete' ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                        </div>

                        <Card
                          className={cn(
                            'border transition-all duration-200',
                            status === 'active'
                              ? 'border-blue-500/50 bg-slate-900/80 shadow-lg shadow-blue-900/20'
                              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                          )}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs',
                                    style.bg,
                                    style.text
                                  )}
                                >
                                  <ActorIcon className="mr-1 h-3 w-3" />
                                  {style.label}
                                </Badge>
                                <h4 className="text-sm font-medium text-white">
                                  {step.title}
                                </h4>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs capitalize',
                                  statusColors[status]
                                )}
                              >
                                {status}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {step.description ||
                                'This step is part of the automated workflow.'}
                            </p>
                            {step.output && (
                              <div className="mt-2 rounded-lg bg-slate-800/50 p-2.5 text-xs text-slate-300 border border-slate-700/50">
                                <span className="text-slate-500 mr-1">
                                  Output:
                                </span>
                                {step.output}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  }
                )}
              </motion.div>
            </div>

            {/* Results */}
            {scenario.results && (
              <Card className="mb-8 bg-emerald-900/10 border-emerald-500/20">
                <CardContent className="p-6">
                  <h4 className="text-base font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Results
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(Array.isArray(scenario.results)
                      ? scenario.results
                      : [scenario.results]
                    ).map((result: any, i: number) => (
                      <div
                        key={i}
                        className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3"
                      >
                        <div className="text-lg font-bold text-emerald-400">
                          {result.value || result}
                        </div>
                        {result.label && (
                          <div className="text-xs text-emerald-300/70">
                            {result.label}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Why This Is Better */}
            {scenario.comparison && (
              <Card className="bg-slate-900/60 border-slate-800">
                <CardContent className="p-6">
                  <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-indigo-400" />
                    Why This Is Better
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Without AI */}
                    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-400">
                        <Lock className="h-4 w-4 text-slate-500" />
                        Without Concept2Cure
                      </div>
                      <div className="space-y-2">
                        {(
                          scenario.comparison.without || [
                            'Manual, error-prone processes',
                            'Days or weeks of effort',
                            'Inconsistent quality',
                          ]
                        ).map((item: string, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-slate-500"
                          >
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* With AI */}
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-indigo-400">
                        <Unlock className="h-4 w-4 text-indigo-400" />
                        With Concept2Cure
                      </div>
                      <div className="space-y-2">
                        {(
                          scenario.comparison.with || [
                            'AI-guided, validated processes',
                            'Hours instead of weeks',
                            'Consistent, high-quality output',
                          ]
                        ).map((item: string, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-indigo-300"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live Dual-AI Theater ── */}
      <div className="mt-16 mb-12">
        <SectionHeader
          icon={Play}
          title="Watch Them Work — Live"
          subtitle="See Dr. Sage and AnA 1.0 collaborate in real time with visible reasoning"
        />
        <Card className="bg-slate-900/80 border-slate-700 overflow-hidden">
          <CardContent className="p-0">
            <DualAITheater
              scenario={THEATER_SCENARIOS['evidence-review']}
              autoPlay
              speed="normal"
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Before / After Comparison ── */}
      <div className="mb-12">
        <SectionHeader
          icon={Eye}
          title="See the Difference"
          subtitle="Drag the slider to compare legacy workflows with Concept2Cure"
        />
        <BeforeAfterSlider />
      </div>

      {/* ── Capability Constellation ── */}
      <div className="mb-12">
        <SectionHeader
          icon={Globe}
          title="Platform Capability Map"
          subtitle="Explore the full constellation of interconnected capabilities"
        />
        <div className="rounded-2xl overflow-hidden border border-slate-700" style={{ height: 500 }}>
          <CapabilityConstellation interactive />
        </div>
      </div>

      {/* ── Quick-Win Micro-Missions ── */}
      <div className="mb-12">
        <SectionHeader
          icon={Rocket}
          title="Try It Now — 60-Second Missions"
          subtitle="Hands-on challenges to experience the platform in action"
        />
        <MissionBrowser
          onStartMission={() => {}}
          userRole="regulatory-writer"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
/// Main Component: EnablementCenter
// ---------------------------------------------------------------------------

export function EnablementCenter({
  onClose,
  initialView,
  contextProfile,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      {/* ------------------------------------------------------------------ */}
      {/* Top Navigation Bar                                                 */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Back button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          {/* Divider */}
          <div className="h-5 w-px bg-slate-800" />

          {/* Title */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <h1 className="text-sm font-semibold text-white whitespace-nowrap">
              Concept2Cure Enablement Center
            </h1>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Context profile indicator */}
          {contextProfile?.userRole && (
            <Badge
              variant="outline"
              className="hidden md:flex border-slate-700 text-slate-400 text-xs"
            >
              <Users className="mr-1 h-3 w-3" />
              {contextProfile.userRole}
            </Badge>
          )}
        </div>

        {/* Tab bar */}
        <div className="px-6 -mb-px overflow-x-auto scrollbar-hide">
          <nav className="flex items-center gap-1">
            {NAV_TABS.map((tab) => {
              const isActive = activeView === tab.key;
              const TabIcon = tab.icon;

              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'group relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <TabIcon
                    className={cn(
                      'h-3.5 w-3.5 transition-colors',
                      isActive ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400',
                      tab.accent && !isActive && 'text-violet-500'
                    )}
                  />
                  <span>{tab.label}</span>

                  {tab.accent && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                  )}

                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                      layoutId="activeTabIndicator"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Content Area                                                       */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {renderView}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default EnablementCenter;
