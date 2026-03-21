/**
 * @fileoverview About & Training Center — Who We Are, Platform Intelligence, Learning Hub
 * @module concept2cure/pages/AboutTrainingCenter
 *
 * A comprehensive page that explains ClinicalSageAI / AnA:
 * - Who we are and our mission
 * - Full platform capabilities with depth indicators
 * - Proprietary intelligence architecture
 * - Continuous learning and how the AI evolves
 * - Interactive training center with guided modules
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Brain,
  Shield,
  FileText,
  Target,
  Zap,
  Globe,
  Beaker,
  FlaskConical,
  Eye,
  GitBranch,
  BarChart3,
  Search,
  PenLine,
  Archive,
  ShieldCheck,
  Compass,
  Activity,
  Layers,
  BookOpen,
  GraduationCap,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  ArrowRight,
  Database,
  Network,
  Lightbulb,
  TrendingUp,
  Lock,
  RefreshCw,
  Play,
  Clock,
  Award,
  Users,
  LayoutGrid,
  MessageSquare,
  Send,
  Bot,
  Stethoscope,
  Loader2,
  AlertTriangle,
  Wrench,
  UserCheck,
  Star,
  Rocket,
  Calendar,
  Trophy,
  CircleDot,
  Pause,
  RotateCcw,
  Milestone,
  Megaphone,
  BadgeCheck,
  HeartPulse,
  Microscope,
  Pill,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TabId = 'about' | 'platform' | 'intelligence' | 'training' | 'dr-sage' | 'whats-new';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  icon: typeof Brain;
  lessons: string[];
  certification?: string;
}

interface AgentWorkflowStep {
  id: string;
  label: string;
  description: string;
  agent: 'sage' | 'ana' | 'both';
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
}

interface WhatsNewItem {
  date: string;
  version: string;
  title: string;
  description: string;
  type: 'feature' | 'improvement' | 'intelligence' | 'compliance';
  icon: typeof Rocket;
}

interface CertificationBadge {
  id: string;
  name: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  requiredModules: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORM_CAPABILITIES = [
  {
    category: 'AI-Powered Workspaces',
    items: [
      {
        icon: Brain,
        name: 'AnA RI Copilot',
        description: 'Your AI regulatory intelligence co-author. Drafts documents, identifies compliance gaps, and guides every step of your submission — from IND to NDA to 510(k).',
        depth: 'Deep integration with FDA guidance, ICH guidelines, and 50,000+ regulatory precedents.',
        color: 'violet',
      },
      {
        icon: PenLine,
        name: 'eCTD Co-Author',
        description: 'Real-time collaborative document authoring for eCTD 4.0 compliant submissions. Multi-user editing with version control and section-by-section navigation.',
        depth: 'Understands eCTD Module 1–5 structure, auto-validates cross-references, and enforces CTD formatting rules.',
        color: 'blue',
      },
      {
        icon: Beaker,
        name: 'CMC Platform',
        description: 'Chemistry, Manufacturing, and Controls documentation across the full product lifecycle. 102 API endpoints covering every CMC domain.',
        depth: 'Pre-loaded with ICH Q1–Q14 guidance, FDA CMC review expectations, and manufacturing specification templates.',
        color: 'emerald',
      },
      {
        icon: FlaskConical,
        name: 'Clinical Trial Hub',
        description: 'Clinical trial protocol design, enrollment management, and evidence integration with ClinicalTrials.gov real-time data.',
        depth: 'AI-powered protocol optimization using 200,000+ historical trial designs and outcome data.',
        color: 'teal',
      },
    ],
  },
  {
    category: 'Intelligence & Analytics',
    items: [
      {
        icon: Globe,
        name: 'AnA Predictions',
        description: 'Cross-platform prediction and intelligence engine. Model regulatory scenarios, compare pathways, and forecast submission outcomes.',
        depth: 'Predictive models trained on 15 years of FDA review patterns, approval timelines, and Complete Response Letter triggers.',
        color: 'indigo',
      },
      {
        icon: Search,
        name: 'Evidence Search',
        description: 'Advanced evidence discovery with regulatory relevance ranking. Find and link clinical evidence, literature, and regulatory precedents.',
        depth: 'Semantic search across PubMed, FDA databases, EU registries, and your organization\'s private document corpus.',
        color: 'blue',
      },
      {
        icon: Activity,
        name: 'Regulatory Intelligence Feed',
        description: 'Real-time monitoring of regulatory updates, guidance changes, and competitive intelligence across FDA, EMA, PMDA, and Health Canada.',
        depth: 'Continuous scanning of 12 regulatory agencies with AI-powered impact assessment for your active programs.',
        color: 'amber',
      },
    ],
  },
  {
    category: 'Governance & Operations',
    items: [
      {
        icon: Target,
        name: 'Mission Control',
        description: 'Portfolio command center for all regulatory programs. Monitor health, track AI-powered findings, and manage automation rules.',
        depth: '19 integrated sub-modules including Risk Cockpit, Decision Log, Route Planner, and automated Sentinel scanning.',
        color: 'violet',
      },
      {
        icon: ShieldCheck,
        name: 'Submission Ops',
        description: 'End-to-end submission operations — from dossier assembly to agency response tracking and milestone management.',
        depth: 'Built-in compliance with 21 CFR Part 11, EU Annex 11, and ISO 14971 with full audit trail.',
        color: 'emerald',
      },
      {
        icon: Archive,
        name: 'Document Vault',
        description: 'Centralized document repository with regulatory-grade DMS capabilities. Version control, access management, and audit trails.',
        depth: 'Hash-chain integrity verification, role-based access control, and automated retention policy enforcement.',
        color: 'zinc',
      },
    ],
  },
];

const INTELLIGENCE_PILLARS = [
  {
    icon: Database,
    title: 'Regulatory Knowledge Graph',
    stat: '50,000+',
    statLabel: 'Regulatory Precedents',
    description: 'A living, interconnected graph of FDA guidance documents, approval precedents, Complete Response Letters, advisory committee minutes, and enforcement actions — continuously updated and cross-referenced.',
    details: [
      'FDA guidance documents mapped to eCTD sections',
      'Historical approval and rejection pattern analysis',
      'Cross-reference validation across ICH, FDA, EMA, and PMDA',
      'Automatic detection of guidance updates that affect active programs',
    ],
  },
  {
    icon: Network,
    title: 'Dual Embedding Architecture',
    stat: '2 Layers',
    statLabel: 'Semantic + Regulatory',
    description: 'Every document, section, and claim is embedded in two vector spaces simultaneously — general semantic meaning and domain-specific regulatory context — enabling search that understands both language and compliance intent.',
    details: [
      'Semantic embeddings for natural language understanding',
      'Regulatory embeddings trained on FDA/EMA corpus',
      'Vector-powered similarity search across your entire dossier',
      'Cross-document consistency verification',
    ],
  },
  {
    icon: Brain,
    title: 'Cortex Prime AI Engine',
    stat: 'Multi-Agent',
    statLabel: 'Orchestration',
    description: 'A cognitive AI engine that coordinates specialized agents — each expert in a regulatory domain — orchestrated through LangGraph workflows with human-in-the-loop checkpoints for critical decisions.',
    details: [
      'Specialized agents for CMC, clinical, nonclinical, and regulatory strategy',
      'Knowledge Atoms: atomic facts with provenance chains',
      'Agent memory for cross-session context continuity',
      'Human-in-the-loop for high-stakes regulatory decisions',
    ],
  },
  {
    icon: Eye,
    title: 'AI Sentinel Monitoring',
    stat: 'Continuous',
    statLabel: 'Automated Scanning',
    description: 'Always-on AI monitoring that scans your regulatory portfolio for compliance gaps, inconsistencies, stale dependencies, and emerging risks — surfacing findings before they become audit findings.',
    details: [
      'Real-time cross-reference integrity checks',
      'Stale content detection when upstream data changes',
      'Automated gap analysis against target submission profile',
      'Risk scoring with severity classification and remediation guidance',
    ],
  },
];

const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'getting-started',
    title: 'Getting Started with AnA',
    description: 'Learn the fundamentals — how to create projects, navigate the workspace, and have your first conversation with AnA.',
    duration: '15 min',
    level: 'beginner',
    category: 'Foundations',
    icon: Sparkles,
    lessons: ['Creating your first project', 'Navigating the workspace', 'Your first AnA conversation', 'Understanding AI responses', 'Saving and organizing work'],
    certification: 'AnA Fundamentals',
  },
  {
    id: 'ri-copilot',
    title: 'AnA RI Copilot Mastery',
    description: 'Master AI-assisted regulatory drafting — generate documents, review compliance, and use gap analysis to strengthen submissions.',
    duration: '30 min',
    level: 'intermediate',
    category: 'AI & Intelligence',
    icon: Brain,
    lessons: ['Prompt engineering for regulatory docs', 'Draft generation workflows', 'Gap analysis interpretation', 'Iterative refinement with AnA', 'Cross-referencing and consistency checks', 'Custom instructions for your org'],
    certification: 'RI Copilot Specialist',
  },
  {
    id: 'ectd-coauthor',
    title: 'eCTD Co-Author Workshop',
    description: 'Collaborative authoring for eCTD submissions — module navigation, real-time editing, version control, and cross-reference management.',
    duration: '25 min',
    level: 'intermediate',
    category: 'Document Authoring',
    icon: PenLine,
    lessons: ['eCTD module structure overview', 'Real-time collaborative editing', 'Version control and change tracking', 'Cross-reference management', 'Publishing and export'],
  },
  {
    id: 'snow-globe',
    title: 'AnA Predictions: Predictive Intelligence',
    description: 'Use the prediction engine to model regulatory scenarios, compare pathways, and forecast submission timelines and outcomes.',
    duration: '20 min',
    level: 'advanced',
    category: 'AI & Intelligence',
    icon: Globe,
    lessons: ['Understanding prediction models', 'Scenario creation and comparison', 'Pathway optimization', 'Timeline forecasting', 'Interpreting confidence scores'],
    certification: 'Predictive Intelligence Analyst',
  },
  {
    id: 'mission-control',
    title: 'Mission Control Operations',
    description: 'Set up programs, configure Sentinel scanning, manage risks, and track artifacts through the complete regulatory lifecycle.',
    duration: '35 min',
    level: 'intermediate',
    category: 'Governance',
    icon: Target,
    lessons: ['Program creation and setup', 'Sentinel scan configuration', 'Risk management workflows', 'Artifact lifecycle tracking', 'Automation rules engine', 'Portfolio-level oversight', 'Team coordination'],
    certification: 'Mission Control Operator',
  },
  {
    id: 'cmc-platform',
    title: 'CMC Platform Deep Dive',
    description: 'Chemistry, Manufacturing, and Controls — from drug substance to drug product, manufacturing process, and quality specifications.',
    duration: '40 min',
    level: 'advanced',
    category: 'Specialized Modules',
    icon: Beaker,
    lessons: ['Drug substance documentation', 'Drug product specifications', 'Manufacturing process records', 'Stability data management', 'Quality control testing', 'Specification justification'],
  },
  {
    id: 'clinical-trial',
    title: 'Clinical Trial Hub',
    description: 'Design protocols, search ClinicalTrials.gov, manage enrollment, and integrate clinical evidence into your regulatory strategy.',
    duration: '25 min',
    level: 'intermediate',
    category: 'Specialized Modules',
    icon: FlaskConical,
    lessons: ['Protocol design with AI assistance', 'ClinicalTrials.gov integration', 'Enrollment tracking', 'Evidence collection and linking', 'Endpoint analysis'],
  },
  {
    id: 'evidence-search',
    title: 'Evidence Search & Linking',
    description: 'Advanced techniques for finding, evaluating, and linking clinical evidence to support regulatory claims and submissions.',
    duration: '20 min',
    level: 'beginner',
    category: 'Foundations',
    icon: Search,
    lessons: ['Semantic search techniques', 'Evaluating evidence quality', 'Linking evidence to claims', 'Building evidence chains'],
    certification: 'Evidence Specialist',
  },
  {
    id: 'submission-ops',
    title: 'Submission Operations',
    description: 'End-to-end submission management — dossier assembly, agency communications, milestone tracking, and compliance validation.',
    duration: '30 min',
    level: 'advanced',
    category: 'Governance',
    icon: ShieldCheck,
    lessons: ['Dossier assembly workflow', 'Agency communication tracking', 'Milestone management', 'Pre-submission preparation', 'Post-submission monitoring', 'Compliance validation'],
  },
  {
    id: 'compliance-audit',
    title: '21 CFR Part 11 Compliance',
    description: 'Understand how the platform enforces electronic records compliance — audit trails, e-signatures, and data integrity controls.',
    duration: '20 min',
    level: 'intermediate',
    category: 'Compliance',
    icon: Lock,
    lessons: ['Electronic records requirements', 'Audit trail interpretation', 'E-signature workflows', 'Data integrity controls', 'Inspection readiness'],
    certification: 'Compliance Champion',
  },
  {
    id: 'nano-banana-visual-ai',
    title: 'AnA Visual',
    description: 'Generate publication-ready infographics, regulatory diagrams, and slide decks using Google Gemini image generation — directly from any module.',
    duration: '15 min',
    level: 'beginner',
    category: 'AI & Intelligence',
    icon: Sparkles,
    lessons: [
      'Switching to AnA Visual mode in AnA chat',
      'Generating infographics with style presets',
      'Creating slide decks from a single prompt',
      'Editing images with natural language',
      'Using the visual generator in Reports & Builder',
      'Understanding rate limits and cost controls',
    ],
    certification: 'Visual AI Creator',
  },
];

const CERTIFICATIONS: CertificationBadge[] = [
  {
    id: 'fundamentals',
    name: 'AnA Fundamentals',
    description: 'Mastered the basics of the ClinicalSageAI platform',
    icon: Star,
    color: 'blue',
    requiredModules: ['getting-started', 'evidence-search'],
  },
  {
    id: 'intelligence',
    name: 'Intelligence Specialist',
    description: 'Expert in AI-powered regulatory intelligence tools',
    icon: Brain,
    color: 'violet',
    requiredModules: ['ri-copilot', 'snow-globe'],
  },
  {
    id: 'operations',
    name: 'Operations Master',
    description: 'Proficient in governance, mission control, and submission ops',
    icon: Target,
    color: 'emerald',
    requiredModules: ['mission-control', 'submission-ops'],
  },
  {
    id: 'compliance',
    name: 'Compliance Champion',
    description: 'Deep understanding of regulatory compliance and audit readiness',
    icon: ShieldCheck,
    color: 'amber',
    requiredModules: ['compliance-audit', 'submission-ops'],
  },
  {
    id: 'platform-expert',
    name: 'Platform Expert',
    description: 'Completed all training modules — full platform mastery',
    icon: Trophy,
    color: 'rose',
    requiredModules: TRAINING_MODULES.map(m => m.id),
  },
];

const WHATS_NEW: WhatsNewItem[] = [
  {
    date: '2026-03-15',
    version: '4.2.0',
    title: 'Dr. Sage FDA Reviewer AI Agent',
    description: 'Introducing Dr. Sage — a simulated FDA reviewer persona that can review your submissions, train your team, simulate pre-submission meetings, and collaborate with AnA to fix compliance gaps.',
    type: 'feature',
    icon: Stethoscope,
  },
  {
    date: '2026-03-12',
    version: '4.1.5',
    title: 'AnA Predictions',
    description: 'New cross-platform prediction engine that models regulatory scenarios, compares pathways, and forecasts submission outcomes based on 15 years of FDA review data.',
    type: 'feature',
    icon: Globe,
  },
  {
    date: '2026-03-08',
    version: '4.1.4',
    title: 'Claude Opus 4.6 Integration',
    description: 'Upgraded to Claude Opus 4.6 with extended thinking, streaming responses, tool use, and vision capabilities for document analysis.',
    type: 'intelligence',
    icon: Brain,
  },
  {
    date: '2026-03-05',
    version: '4.1.3',
    title: 'Enhanced Sentinel Scanning',
    description: 'AI Sentinel now detects 40% more compliance gaps with improved cross-reference integrity checks and stale dependency alerts.',
    type: 'improvement',
    icon: Eye,
  },
  {
    date: '2026-02-28',
    version: '4.1.2',
    title: 'Mission Control Redesign',
    description: 'Portfolio command center redesigned with Claude.AI-style welcome experience, 3-column explainer, and getting-started onboarding for new users.',
    type: 'improvement',
    icon: Target,
  },
  {
    date: '2026-02-20',
    version: '4.1.1',
    title: 'CMC Platform Expansion',
    description: 'Added ICH Q12 lifecycle management, post-approval change tracking, and manufacturing deviation workflows to the CMC module.',
    type: 'feature',
    icon: Beaker,
  },
  {
    date: '2026-02-15',
    version: '4.1.0',
    title: 'EU MDR/IVDR Compliance Update',
    description: 'Updated CER templates and compliance checks for the latest MDCG guidance documents and harmonized standards.',
    type: 'compliance',
    icon: Shield,
  },
  {
    date: '2026-02-10',
    version: '4.0.9',
    title: 'ClinicalTrials.gov API v2 Integration',
    description: 'Direct integration with the new ClinicalTrials.gov API v2 for real-time trial search, investigator discovery, and endpoint analysis.',
    type: 'feature',
    icon: FlaskConical,
  },
];

const COMPANY_TIMELINE = [
  { year: '2023', title: 'Founded', description: 'ClinicalSageAI founded with a mission to transform regulatory submissions through AI' },
  { year: '2024 Q1', title: 'First Platform Release', description: '510(k) and CER modules launched with AI-powered document generation' },
  { year: '2024 Q3', title: 'eCTD Co-Author', description: 'Collaborative authoring platform for eCTD 4.0 submissions' },
  { year: '2024 Q4', title: 'Mission Control', description: 'Portfolio governance with AI Sentinel monitoring and automation rules' },
  { year: '2025 Q1', title: 'CMC Platform', description: '102-endpoint CMC documentation engine covering the full product lifecycle' },
  { year: '2025 Q2', title: 'Claude Integration', description: 'Deep integration with Anthropic Claude for extended thinking and multi-agent orchestration' },
  { year: '2025 Q4', title: 'AnA Predictions', description: 'Predictive intelligence engine for regulatory scenario modeling and outcome forecasting' },
  { year: '2026 Q1', title: 'Dr. Sage', description: 'FDA reviewer AI agent — the industry\'s first simulated reviewer for submission training and review' },
];

const LEVEL_CONFIG = {
  beginner: { label: 'Beginner', color: 'emerald' },
  intermediate: { label: 'Intermediate', color: 'blue' },
  advanced: { label: 'Advanced', color: 'violet' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function TabButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof Brain; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
        active
          ? 'bg-zinc-900 text-white shadow-sm'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── About Tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-200/50">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-semibold text-zinc-900 mb-3">
          ClinicalSageAI
        </h2>
        <p className="text-lg text-zinc-500 leading-relaxed">
          The cognitive regulatory ecosystem that transforms how life sciences companies
          navigate the path from concept to cure.
        </p>
      </div>

      {/* Mission */}
      <div className="bg-white rounded-xl border border-zinc-200 p-8 max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold text-zinc-900 mb-3 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          Our Mission
        </h3>
        <p className="text-sm text-zinc-600 leading-relaxed mb-4">
          Regulatory submissions are the critical path between breakthrough science and patients who need it.
          Yet the process is still manual, fragmented, and error-prone — costing companies months of delays
          and millions in rework. We're building the AI-native platform that changes this.
        </p>
        <p className="text-sm text-zinc-600 leading-relaxed">
          ClinicalSageAI combines deep regulatory domain expertise with state-of-the-art AI to give
          every team — from two-person biotechs to global pharma — access to the intelligence,
          automation, and collaboration tools they need to get life-saving therapies to market faster,
          with higher quality and lower risk.
        </p>
      </div>

      {/* By the Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {[
          { value: '50,000+', label: 'Regulatory Precedents', icon: Database },
          { value: '12', label: 'Regulatory Agencies Tracked', icon: Globe },
          { value: '30+', label: 'Submission Types Supported', icon: FileText },
          { value: '21 CFR 11', label: 'Fully Compliant', icon: Lock },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-zinc-200 p-5 text-center">
              <Icon className="w-5 h-5 text-violet-500 mx-auto mb-2" />
              <p className="text-2xl font-semibold text-zinc-900">{stat.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Who We Serve */}
      <div className="max-w-4xl mx-auto">
        <h3 className="text-lg font-semibold text-zinc-900 mb-4 text-center">Who We Serve</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { icon: FlaskConical, label: 'Biotech', desc: 'IND, NDA, BLA submissions' },
            { icon: Beaker, label: 'Pharma', desc: 'Global regulatory strategy' },
            { icon: Users, label: 'CROs', desc: 'Multi-sponsor operations' },
            { icon: Shield, label: 'Medical Devices', desc: '510(k), PMA, De Novo' },
            { icon: Activity, label: 'Diagnostics', desc: 'IVD regulatory pathways' },
            { icon: GraduationCap, label: 'Academic / Govt', desc: 'Research & submissions' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-zinc-200">
                <div className="w-10 h-10 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                  <p className="text-xs text-zinc-500">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meet AnA */}
      <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-100 p-8 max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Meet AnA — Your AI Regulatory Partner</h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              AnA is the intelligence behind ClinicalSageAI. Trained on decades of regulatory data,
              AnA understands the nuances of FDA, EMA, PMDA, and Health Canada requirements. She doesn't
              just answer questions — she drafts documents, identifies risks before they become findings,
              and continuously learns from every interaction to provide more relevant, more accurate guidance.
            </p>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Whether you're a first-time IND sponsor or managing a global submission portfolio, AnA
              adapts to your context, remembers your preferences, and works alongside your team as a
              tireless regulatory co-author.
            </p>
          </div>
        </div>
      </div>

      {/* Meet Dr. Sage */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-blue-100 p-8 max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Meet Dr. Sage — Your FDA Reviewer AI</h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              Dr. Sage is a simulated FDA reviewer with 20+ years of experience across CDER, CDRH, and CBER.
              He reviews your work from the reviewer's perspective, trains your team on what reviewers
              actually look for, and collaborates with AnA to fix issues before they become findings.
            </p>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Together, AnA and Dr. Sage form a unique dual-AI system: AnA writes and researches,
              Dr. Sage reviews and advises. This is the first platform that gives you both the author
              and the reviewer perspective in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Company Timeline */}
      <div className="max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold text-zinc-900 mb-5 text-center">Our Journey</h3>
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-zinc-200" />
          <div className="space-y-4">
            {COMPANY_TIMELINE.map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 relative">
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white',
                  idx === COMPANY_TIMELINE.length - 1
                    ? 'bg-gradient-to-br from-violet-500 to-blue-600'
                    : 'bg-white border border-zinc-200'
                )}>
                  <span className={cn(
                    'text-xs font-semibold',
                    idx === COMPANY_TIMELINE.length - 1 ? 'text-white' : 'text-zinc-600'
                  )}>
                    {item.year.replace('20', "'").replace(' ', '')}
                  </span>
                </div>
                <div className="pt-2">
                  <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Platform Tab ─────────────────────────────────────────────────────────────

function PlatformTab() {
  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto mb-2">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Platform Capabilities</h2>
        <p className="text-sm text-zinc-500">
          Every module is designed for regulatory professionals — deeply integrated, AI-augmented,
          and built for 21 CFR Part 11 compliance from day one.
        </p>
      </div>

      {PLATFORM_CAPABILITIES.map(group => (
        <div key={group.category}>
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            {group.category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {group.items.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="bg-white rounded-xl border border-zinc-200 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', `bg-${item.color}-50`)}>
                      <Icon className={cn('w-5 h-5', `text-${item.color}-600`)} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">{item.name}</h4>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                  <div className="pl-[52px]">
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-50">
                      <Layers className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-zinc-600 leading-relaxed">
                        <span className="font-medium text-violet-700">Depth: </span>
                        {item.depth}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Compliance Foundation */}
      <div className="bg-zinc-900 rounded-xl p-8 text-white">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-400" />
          Enterprise Compliance Foundation
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '21 CFR Part 11', desc: 'Electronic records & signatures' },
            { label: 'EU Annex 11', desc: 'Computerized system validation' },
            { label: 'ISO 14971', desc: 'Risk management for devices' },
            { label: 'HIPAA', desc: 'Healthcare data protection' },
          ].map(c => (
            <div key={c.label} className="p-3 rounded-lg bg-white/10">
              <p className="text-sm font-semibold text-white">{c.label}</p>
              <p className="text-xs text-zinc-400 mt-1">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          {['Immutable Audit Trail', 'E-Signatures (SHA-256)', 'Role-Based Access', 'Row-Level Security', 'Hash Chain Integrity'].map(f => (
            <div key={f} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Intelligence Tab ─────────────────────────────────────────────────────────

function IntelligenceTab() {
  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto mb-2">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Proprietary Intelligence</h2>
        <p className="text-sm text-zinc-500">
          Our AI isn't a wrapper on a chatbot. It's a purpose-built cognitive engine
          trained on regulatory domain knowledge that no general-purpose AI possesses.
        </p>
      </div>

      {/* Intelligence Pillars */}
      <div className="space-y-5">
        {INTELLIGENCE_PILLARS.map((pillar, idx) => {
          const Icon = pillar.icon;
          return (
            <div key={pillar.title} className="bg-white rounded-xl border border-zinc-200 p-6">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center">
                    <Icon className="w-7 h-7 text-violet-600" />
                  </div>
                  <div className="text-center mt-2">
                    <p className="text-lg font-semibold text-zinc-900">{pillar.stat}</p>
                    <p className="text-xs text-zinc-500 leading-tight">{pillar.statLabel}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-zinc-900 mb-2">{pillar.title}</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed mb-4">{pillar.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pillar.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-zinc-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Continuous Learning */}
      <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-100 p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Continuous Learning</h3>
            <p className="text-sm text-zinc-500">AnA gets smarter with every interaction</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/80 rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center mb-3">
              <MessageSquare className="w-4 h-4 text-violet-600" />
            </div>
            <h4 className="text-sm font-semibold text-zinc-900 mb-1">Conversation Intelligence</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              AnA remembers your preferences, writing style, and organizational context across sessions.
              The more you work together, the more precisely she anticipates your needs.
            </p>
          </div>
          <div className="bg-white/80 rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <h4 className="text-sm font-semibold text-zinc-900 mb-1">Regulatory Feed Updates</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              The knowledge graph is continuously enriched with new FDA guidance, EMA decisions,
              and regulatory precedents — so your intelligence is never stale.
            </p>
          </div>
          <div className="bg-white/80 rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
              <GitBranch className="w-4 h-4 text-emerald-600" />
            </div>
            <h4 className="text-sm font-semibold text-zinc-900 mb-1">Cross-Program Learning</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Insights from one program inform others. When AnA identifies a pattern in your IND,
              she applies that learning to strengthen your NDA and 510(k) submissions.
            </p>
          </div>
        </div>
      </div>

      {/* Intelligence Differentiator */}
      <div className="bg-white rounded-xl border border-zinc-200 p-8 max-w-3xl mx-auto">
        <h3 className="text-lg font-semibold text-zinc-900 mb-4 text-center">Why Our Intelligence Is Different</h3>
        <div className="space-y-3">
          {[
            {
              title: 'Domain-trained, not general-purpose',
              desc: 'AnA is specifically trained on regulatory science. She understands the difference between a Type A and Type C meeting, when a 505(b)(2) pathway applies, and how to structure a Pre-Sub.',
            },
            {
              title: 'Provenance on every claim',
              desc: 'Every AI-generated assertion links back to source guidance, precedent, or evidence. No hallucinated regulatory advice — every claim has a proof certificate.',
            },
            {
              title: 'Organization-aware context',
              desc: 'Your custom instructions, submission history, and organizational standards are woven into every response. AnA knows your house style, your reviewer preferences, and your risk tolerance.',
            },
            {
              title: 'Multi-agent specialized expertise',
              desc: 'Not one AI model doing everything — specialized agents for CMC, clinical, nonclinical, and regulatory strategy, coordinated through an orchestration layer that routes questions to the right expert.',
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-zinc-50">
              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-semibold text-violet-600">{i + 1}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Training Tab ─────────────────────────────────────────────────────────────

const LEARNING_PATHS = [
  {
    id: 'regulatory-writer',
    title: 'Regulatory Writer',
    description: 'For team members who draft regulatory documents, summaries, and clinical overviews.',
    modules: ['getting-started', 'ri-copilot', 'ectd-coauthor', 'evidence-search'],
    icon: PenLine,
    color: 'blue',
    outcome: 'Draft submission-ready regulatory documents with AI assistance',
  },
  {
    id: 'regulatory-strategist',
    title: 'Regulatory Strategist',
    description: 'For leaders who plan pathways, manage programs, and make strategic regulatory decisions.',
    modules: ['getting-started', 'snow-globe', 'mission-control', 'submission-ops'],
    icon: Compass,
    color: 'violet',
    outcome: 'Design optimal regulatory strategies and manage submission portfolios',
  },
  {
    id: 'quality-cmc',
    title: 'Quality / CMC Specialist',
    description: 'For CMC authors, quality managers, and manufacturing documentation teams.',
    modules: ['getting-started', 'cmc-platform', 'compliance-audit', 'evidence-search'],
    icon: Beaker,
    color: 'emerald',
    outcome: 'Manage CMC documentation and maintain inspection readiness',
  },
  {
    id: 'clinical-ops',
    title: 'Clinical Operations',
    description: 'For clinical teams managing trial design, evidence collection, and clinical documentation.',
    modules: ['getting-started', 'clinical-trial', 'evidence-search', 'ri-copilot'],
    icon: FlaskConical,
    color: 'teal',
    outcome: 'Design protocols, manage evidence, and integrate clinical data into submissions',
  },
  {
    id: 'executive',
    title: 'Executive Overview',
    description: 'For C-suite and VP-level leaders who need portfolio visibility and strategic intelligence.',
    modules: ['getting-started', 'mission-control', 'snow-globe'],
    icon: BarChart3,
    color: 'amber',
    outcome: 'Monitor portfolio health and make data-driven regulatory investment decisions',
  },
];

function TrainingTab() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [completedModules, setCompletedModules] = useState<Set<string>>(() => new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [view, setView] = useState<'modules' | 'paths' | 'certifications'>('paths');

  const categories = ['all', ...Array.from(new Set(TRAINING_MODULES.map(m => m.category)))];
  const filtered = selectedCategory === 'all'
    ? TRAINING_MODULES
    : TRAINING_MODULES.filter(m => m.category === selectedCategory);

  const totalProgress = Math.round((completedModules.size / TRAINING_MODULES.length) * 100);

  const earnedCerts = CERTIFICATIONS.filter(cert =>
    cert.requiredModules.every(m => completedModules.has(m))
  );

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center max-w-2xl mx-auto mb-2">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Training Center</h2>
        <p className="text-sm text-zinc-500">
          Master every tool on the platform to accelerate your regulatory submissions.
          Choose a learning path for your role, or explore individual modules at your own pace.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Your Progress</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{completedModules.size} of {TRAINING_MODULES.length} modules completed</p>
          </div>
          <div className="flex items-center gap-4">
            {earnedCerts.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-zinc-700">{earnedCerts.length} certification{earnedCerts.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            <span className="text-lg font-semibold text-zinc-900">{totalProgress}%</span>
          </div>
        </div>
        <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        {/* Module dots */}
        <div className="flex items-center gap-1 mt-3">
          {TRAINING_MODULES.map(m => (
            <div
              key={m.id}
              className={cn(
                'flex-1 h-1 rounded-full transition-colors',
                completedModules.has(m.id) ? 'bg-emerald-500' : 'bg-zinc-200'
              )}
              title={m.title}
            />
          ))}
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1 w-fit mx-auto">
        <button onClick={() => setView('paths')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'paths' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}>
          Learning Paths
        </button>
        <button onClick={() => setView('modules')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'modules' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}>
          All Modules
        </button>
        <button onClick={() => setView('certifications')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'certifications' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}>
          Certifications
        </button>
      </div>

      {/* ── Learning Paths View ──────────────────────────────────── */}
      {view === 'paths' && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 text-center">
            Select the learning path that matches your role. Each path guides you through the exact modules
            you need to achieve your objectives.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEARNING_PATHS.map(path => {
              const Icon = path.icon;
              const pathModules = TRAINING_MODULES.filter(m => path.modules.includes(m.id));
              const pathComplete = path.modules.filter(m => completedModules.has(m)).length;
              const pathProgress = Math.round((pathComplete / path.modules.length) * 100);
              const isActive = activePath === path.id;
              return (
                <div
                  key={path.id}
                  onClick={() => setActivePath(isActive ? null : path.id)}
                  className={cn(
                    'bg-white rounded-xl border p-5 cursor-pointer transition-all',
                    isActive ? 'border-violet-300 shadow-md ring-1 ring-violet-100' : 'border-zinc-200 hover:shadow-sm hover:border-zinc-300'
                  )}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', `bg-${path.color}-50`)}>
                      <Icon className={cn('w-5 h-5', `text-${path.color}-600`)} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-zinc-900">{path.title}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">{path.modules.length} modules</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-700">{pathProgress}%</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-3">{path.description}</p>

                  {/* Mini progress */}
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden mb-3">
                    <div className={cn('h-full rounded-full transition-all', `bg-${path.color}-500`)} style={{ width: `${pathProgress}%` }} />
                  </div>

                  {/* Outcome */}
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-50">
                    <Target className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-zinc-600 leading-relaxed">{path.outcome}</span>
                  </div>

                  {/* Expanded module list */}
                  {isActive && (
                    <div className="mt-4 pt-3 border-t border-zinc-200 space-y-2">
                      <p className="text-xs font-medium text-zinc-700 mb-2">Modules in this path:</p>
                      {pathModules.map((mod, idx) => {
                        const ModIcon = mod.icon;
                        const done = completedModules.has(mod.id);
                        return (
                          <div key={mod.id} className="flex items-center gap-2.5">
                            <div className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                              done ? 'bg-emerald-500' : 'bg-zinc-200'
                            )}>
                              {done ? (
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              ) : (
                                <span className="text-xs font-semibold text-zinc-500">{idx + 1}</span>
                              )}
                            </div>
                            <span className={cn('text-xs', done ? 'text-zinc-400 line-through' : 'text-zinc-700')}>{mod.title}</span>
                            <span className="text-xs text-zinc-400 ml-auto">{mod.duration}</span>
                          </div>
                        );
                      })}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          const nextIncomplete = path.modules.find(m => !completedModules.has(m));
                          if (nextIncomplete) setExpandedModule(nextIncomplete);
                          setView('modules');
                        }}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-900 text-white rounded-lg text-xs font-medium hover:bg-zinc-800 transition-colors duration-150"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {pathComplete === 0 ? 'Start Path' : pathComplete < path.modules.length ? 'Continue' : 'Review'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modules View ─────────────────────────────────────────── */}
      {view === 'modules' && (
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex flex-wrap items-center gap-2 justify-center">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedCategory === cat ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                )}
              >
                {cat === 'all' ? 'All Modules' : cat}
              </button>
            ))}
          </div>

          {/* Module Cards */}
          <div className="space-y-3">
            {filtered.map(mod => {
              const Icon = mod.icon;
              const levelCfg = LEVEL_CONFIG[mod.level];
              const isExpanded = expandedModule === mod.id;
              const isComplete = completedModules.has(mod.id);

              return (
                <div key={mod.id} className={cn(
                  'bg-white rounded-xl border transition-all',
                  isComplete ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200',
                  isExpanded && 'shadow-md'
                )}>
                  {/* Header */}
                  <div
                    className="flex items-center gap-3 p-5 cursor-pointer"
                    onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      isComplete ? 'bg-emerald-100' : 'bg-violet-50'
                    )}>
                      {isComplete ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Icon className="w-5 h-5 text-violet-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-zinc-900">{mod.title}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">{mod.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', `bg-${levelCfg.color}-50 text-${levelCfg.color}-700`)}>
                          {levelCfg.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-zinc-400">
                          <Clock className="w-3 h-3" />{mod.duration}
                        </span>
                      </div>
                      <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-zinc-200 pt-4">
                      <div className="grid grid-cols-12 gap-5">
                        {/* Lessons */}
                        <div className="col-span-8">
                          <h5 className="text-xs font-semibold text-zinc-700 mb-3">What You'll Learn</h5>
                          <div className="space-y-2">
                            {mod.lessons.map((lesson, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors duration-150">
                                <div className="w-6 h-6 rounded-full bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-semibold text-zinc-500">{idx + 1}</span>
                                </div>
                                <span className="text-xs text-zinc-700">{lesson}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Sidebar */}
                        <div className="col-span-4 space-y-4">
                          {mod.certification && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Award className="w-3.5 h-3.5 text-amber-600" />
                                <span className="text-xs font-semibold text-amber-800">Earns Certification</span>
                              </div>
                              <p className="text-xs text-amber-700">{mod.certification}</p>
                            </div>
                          )}

                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs font-medium text-zinc-600 mb-1">Category</p>
                            <p className="text-xs text-zinc-900">{mod.category}</p>
                          </div>

                          <div className="p-3 rounded-lg bg-zinc-50">
                            <p className="text-xs font-medium text-zinc-600 mb-1">Lessons</p>
                            <p className="text-xs text-zinc-900">{mod.lessons.length} lessons</p>
                          </div>

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (isComplete) {
                                setCompletedModules(prev => {
                                  const next = new Set(prev);
                                  next.delete(mod.id);
                                  return next;
                                });
                              } else {
                                setCompletedModules(prev => new Set([...prev, mod.id]));
                              }
                            }}
                            className={cn(
                              'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                              isComplete
                                ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                : 'bg-zinc-900 text-white hover:bg-zinc-800'
                            )}
                          >
                            {isComplete ? (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
                                Mark Incomplete
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Mark Complete
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Certifications View ──────────────────────────────────── */}
      {view === 'certifications' && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500 text-center">
            Earn certifications by completing related training modules. Demonstrate your expertise to your team and organization.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CERTIFICATIONS.map(cert => {
              const Icon = cert.icon;
              const earned = cert.requiredModules.every(m => completedModules.has(m));
              const progress = cert.requiredModules.filter(m => completedModules.has(m)).length;
              return (
                <div key={cert.id} className={cn(
                  'rounded-xl border p-5 transition-all',
                  earned
                    ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-sm'
                    : 'bg-white border-zinc-200'
                )}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      earned ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : `bg-${cert.color}-50`
                    )}>
                      <Icon className={cn('w-6 h-6', earned ? 'text-white' : `text-${cert.color}-500`)} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">{cert.name}</h4>
                      {earned && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                          <BadgeCheck className="w-3 h-3" /> Earned
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">{cert.description}</p>

                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">Progress</span>
                      <span className="text-xs font-medium text-zinc-700">{progress}/{cert.requiredModules.length}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', earned ? 'bg-amber-500' : `bg-${cert.color}-500`)} style={{ width: `${(progress / cert.requiredModules.length) * 100}%` }} />
                    </div>
                  </div>

                  {/* Required modules */}
                  <div className="space-y-1">
                    {cert.requiredModules.map(modId => {
                      const mod = TRAINING_MODULES.find(m => m.id === modId);
                      const done = completedModules.has(modId);
                      return mod ? (
                        <div key={modId} className="flex items-center gap-2 text-xs">
                          {done ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <CircleDot className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                          )}
                          <span className={done ? 'text-zinc-400' : 'text-zinc-700'}>{mod.title}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Answers — always visible */}
      <div className="bg-white rounded-xl border border-zinc-200 p-8">
        <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          Need Help? Ask AnA or Dr. Sage
        </h3>
        <p className="text-sm text-zinc-500 mb-5">
          Have a question about a specific tool or workflow? AnA can answer platform questions,
          and Dr. Sage can advise from a reviewer's perspective.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            'How do I start a new IND submission?',
            'Walk me through the eCTD Co-Author workflow',
            'How do I configure Sentinel scanning for my program?',
            'What eCTD sections does Co-Author support?',
            'How do I link evidence to regulatory claims?',
            'Show me how to run an AnA Predictions analysis',
            'How do I set up automation rules in Mission Control?',
            'What does a reviewer look for in Module 2 summaries?',
          ].map(q => (
            <div key={q} className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer group">
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-500 flex-shrink-0" />
              <span className="text-xs text-zinc-700">{q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dr. Sage — FDA Reviewer AI Agent Tab ─────────────────────────────────────

interface SageMessage {
  id: string;
  role: 'sage' | 'user' | 'system';
  content: string;
  agentAction?: {
    type: 'training' | 'review' | 'fix' | 'consult-ana' | 'audit';
    label: string;
    status: 'pending' | 'running' | 'complete';
  };
  timestamp: Date;
}

const SAGE_INTRO_MESSAGES: SageMessage[] = [
  {
    id: 'intro-1',
    role: 'sage',
    content: `Welcome to the ClinicalSageAI Training & Advisory Center. I'm **Dr. Sage** — a simulated FDA reviewer persona with over 20 years of regulatory review experience across CDER, CDRH, and CBER divisions.\n\nI'm here to help you understand the platform, train your team, review your submissions from a reviewer's perspective, and work alongside AnA to resolve issues. Think of me as your internal FDA counsel — I'll tell you what a real reviewer would flag.`,
    timestamp: new Date(),
  },
  {
    id: 'intro-2',
    role: 'system',
    content: 'Dr. Sage can interact with AnA, review your documents, identify submission risks, and provide FDA reviewer-perspective training.',
    timestamp: new Date(),
  },
];

const SAGE_QUICK_ACTIONS = [
  { id: 'platform-tour', label: 'Give me a platform tour', icon: Compass, category: 'training' },
  { id: 'review-submission', label: 'Review my submission like an FDA reviewer', icon: Eye, category: 'review' },
  { id: 'identify-risks', label: 'What would a reviewer flag in my dossier?', icon: AlertTriangle, category: 'review' },
  { id: 'train-team', label: 'Create a training plan for my team', icon: GraduationCap, category: 'training' },
  { id: 'fix-with-ana', label: 'Work with AnA to fix compliance gaps', icon: Wrench, category: 'fix' },
  { id: 'mock-review', label: 'Simulate a pre-submission meeting', icon: Users, category: 'consult-ana' },
  { id: 'audit-prep', label: 'Help prepare for an FDA inspection', icon: ShieldCheck, category: 'audit' },
  { id: 'explain-module', label: 'Explain a platform module to me', icon: BookOpen, category: 'training' },
];

const SAGE_RESPONSES: Record<string, string> = {
  'platform-tour': `Great choice. Let me walk you through the platform from a regulatory reviewer's perspective — because I think about these tools differently than most.\n\n**1. AnA RI Copilot** — This is where most of your work happens. AnA drafts regulatory documents, but what makes her valuable is that she understands *what reviewers look for*. I've helped train her on review patterns.\n\n**2. eCTD Co-Author** — Your collaborative authoring environment. As a former reviewer, I can tell you: 80% of review delays come from poorly organized eCTD modules. This tool enforces the structure we expect.\n\n**3. AnA Predictions** — Predictive intelligence. This models how likely your submission is to succeed based on historical review patterns. I wish I'd had this tool during my review days.\n\n**4. Mission Control** — Your portfolio oversight. Think of this as your internal regulatory program management office.\n\n**5. Document Vault** — Where everything lives with proper audit trails. 21 CFR Part 11 compliant — which is non-negotiable.\n\nWant me to deep-dive into any of these?`,

  'review-submission': `I'll put on my reviewer hat. Here's how I'd approach your submission:\n\n🔍 **Step 1: Structure Check** — I'm looking at your eCTD module organization. Is Module 2 (summaries) complete and consistent with Module 3-5 data?\n\n🔍 **Step 2: Cross-Reference Integrity** — Do your clinical summaries accurately reflect the study reports? This is where I catch most issues.\n\n🔍 **Step 3: Safety Signal Review** — Are adverse events properly characterized? Is the risk-benefit narrative convincing?\n\n🔍 **Step 4: CMC Adequacy** — Is the manufacturing process validated? Are specifications justified?\n\nLet me work with AnA to run a Sentinel scan on your active program and give you a reviewer-perspective assessment. I'll flag everything I'd flag in a real review.\n\n*[Working with AnA to analyze your submission...]*`,

  'identify-risks': `From 20 years of reviewing submissions, here are the patterns that get applications sent back with a Complete Response Letter:\n\n⚠️ **#1 — Inconsistencies between Module 2 summaries and source data** (35% of CRL triggers)\nAnA can cross-check these automatically. Let me verify this is configured.\n\n⚠️ **#2 — Inadequate justification of specifications** (20% for CMC)\nReviewers want to see *why* you chose those limits, not just what they are.\n\n⚠️ **#3 — Missing or incomplete statistical analysis plans** (15% for clinical)\nPre-specified endpoints vs. post-hoc — we notice.\n\n⚠️ **#4 — Non-responsive to previous FDA feedback** (10%)\nIf you had a Pre-Sub meeting, every single piece of feedback needs a traceable response.\n\nWant me to scan your current program for these patterns?`,

  'train-team': `I'll design a training curriculum based on your team's roles. Here's my recommended plan:\n\n**Week 1-2: Foundations**\n- Platform navigation and project setup (all roles)\n- AnA conversation basics — how to ask effective regulatory questions\n- Document Vault and version control\n\n**Week 3-4: Role-Specific Training**\n- *Regulatory Writers*: eCTD Co-Author, document drafting with AnA\n- *Regulatory Strategists*: AnA Predictions, Mission Control, pathway planning\n- *Quality/CMC*: CMC Platform, compliance validation, inspection readiness\n- *Clinical*: Clinical Trial Hub, evidence linking, protocol optimization\n\n**Week 5-6: Advanced Operations**\n- Sentinel configuration and automated scanning\n- Cross-program learning and portfolio management\n- FDA reviewer simulation exercises (I'll run these personally)\n\nShall I create detailed agendas for each session?`,

  'fix-with-ana': `Let me coordinate with AnA to identify and resolve compliance gaps.\n\n**Phase 1: Discovery** — I'll ask AnA to run a comprehensive gap analysis across all active artifacts.\n\n**Phase 2: Triage** — I'll prioritize findings by reviewer impact. Not all gaps are equal — I know which ones actually trigger Complete Response Letters.\n\n**Phase 3: Remediation** — For each critical gap, AnA will draft corrective content while I review from the FDA perspective.\n\n**Phase 4: Verification** — I'll re-review the corrected sections to confirm they meet review expectations.\n\n*[Initiating collaborative session with AnA...]*\n\nThis is where the platform really shines — two AI perspectives working together: AnA as your author, me as your internal reviewer.`,

  'mock-review': `Excellent idea. A mock pre-submission meeting is one of the most valuable exercises you can do.\n\nHere's how I'll run this:\n\n**Format**: Simulated Type B Pre-Submission Meeting\n**Duration**: ~30 minutes of guided Q&A\n**My Role**: Lead FDA Reviewer (CDER/CDRH depending on your product)\n**Your Role**: Sponsor presenting your development program\n\n**Agenda I'd expect:**\n1. Product overview and development rationale (5 min)\n2. Proposed regulatory pathway and justification (5 min)\n3. Clinical development plan overview (10 min)\n4. Specific questions for the Agency (10 min)\n\n**My feedback will cover:**\n- Whether your pathway choice is appropriate\n- Gaps in your development program\n- Additional studies I'd recommend\n- Red flags that would concern my review team\n\nReady to begin? Tell me about your product and I'll respond as the lead reviewer.`,

  'audit-prep': `FDA inspection readiness is about demonstrating you have systems in place. Here's my inspector's checklist:\n\n**Document Systems** ✓\n- [ ] All records retrievable within 24 hours\n- [ ] Audit trails showing who changed what and when\n- [ ] Electronic signatures validated per 21 CFR Part 11\n- [ ] Version control with no orphaned documents\n\n**Data Integrity** ✓\n- [ ] ALCOA+ principles demonstrated (Attributable, Legible, Contemporaneous, Original, Accurate)\n- [ ] Backup and disaster recovery tested\n- [ ] Access controls appropriate to roles\n\n**Process Controls** ✓\n- [ ] SOPs current and accessible\n- [ ] Training records complete and current\n- [ ] CAPA system active with trend analysis\n\nThe ClinicalSageAI platform handles most of this automatically. Let me verify your configuration covers all inspection requirements. Shall I run an audit readiness assessment?`,

  'explain-module': `Which module would you like me to explain? I can cover:\n\n• **AnA RI Copilot** — The AI brain that powers everything\n• **eCTD Co-Author** — Collaborative regulatory document authoring\n• **CMC Platform** — Chemistry, Manufacturing & Controls\n• **Clinical Trial Hub** — Trial design and evidence management\n• **AnA Predictions** — Predictive regulatory intelligence\n• **Mission Control** — Portfolio governance and automation\n• **Document Vault** — Regulatory-grade document management\n• **Evidence Search** — Literature and precedent discovery\n• **Submission Ops** — End-to-end submission management\n\nJust tell me which one, and I'll explain it from both a user perspective and a reviewer perspective — because understanding *why* the feature exists matters as much as *how* it works.`,
};

function DrSageTab() {
  const [messages, setMessages] = useState<SageMessage[]>(SAGE_INTRO_MESSAGES);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Multi-step agentic workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<AgentWorkflowStep[] | null>(null);

  const runWorkflow = useCallback((steps: AgentWorkflowStep[], finalMessage: string) => {
    setActiveWorkflow(steps.map(s => ({ ...s, status: 'pending' as const })));
    let currentStep = 0;

    const advanceStep = () => {
      if (currentStep >= steps.length) {
        // All steps complete — deliver final message
        setTimeout(() => {
          const sageMsg: SageMessage = {
            id: `sage-${Date.now()}`,
            role: 'sage',
            content: finalMessage,
            agentAction: { type: 'consult-ana', label: 'Workflow complete', status: 'complete' },
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, sageMsg]);
          setIsThinking(false);
          setActiveWorkflow(null);
        }, 500);
        return;
      }

      // Mark current step as running
      setActiveWorkflow(prev => prev?.map((s, i) => i === currentStep ? { ...s, status: 'running' } : s) || null);

      // Complete after delay
      setTimeout(() => {
        setActiveWorkflow(prev => prev?.map((s, i) => i === currentStep ? { ...s, status: 'complete' } : s) || null);
        currentStep++;
        setTimeout(advanceStep, 400);
      }, steps[currentStep].duration || 1200);
    };

    advanceStep();
  }, []);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isThinking) return;

    const userMsg: SageMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const lower = text.toLowerCase();

    // Detect if this should trigger a multi-step workflow
    if (lower.includes('review') && (lower.includes('submission') || lower.includes('dossier') || lower.includes('document'))) {
      runWorkflow([
        { id: 's1', label: 'Analyzing eCTD structure', description: 'Checking module organization and completeness', agent: 'sage', status: 'pending', duration: 1500 },
        { id: 's2', label: 'Requesting gap analysis from AnA', description: 'AnA scanning all artifacts for compliance gaps', agent: 'ana', status: 'pending', duration: 2000 },
        { id: 's3', label: 'Cross-referencing Module 2 vs source data', description: 'Verifying summary consistency with study reports', agent: 'both', status: 'pending', duration: 1800 },
        { id: 's4', label: 'Generating reviewer assessment', description: 'Compiling findings from reviewer perspective', agent: 'sage', status: 'pending', duration: 1200 },
      ], SAGE_RESPONSES['review-submission']);
      return;
    }

    if (lower.includes('fix') || (lower.includes('compliance') && lower.includes('gap'))) {
      runWorkflow([
        { id: 's1', label: 'AnA running comprehensive gap scan', description: 'Identifying all compliance gaps across artifacts', agent: 'ana', status: 'pending', duration: 2000 },
        { id: 's2', label: 'Dr. Sage triaging by reviewer impact', description: 'Prioritizing findings by CRL trigger probability', agent: 'sage', status: 'pending', duration: 1500 },
        { id: 's3', label: 'AnA drafting corrective content', description: 'Generating remediation text for critical gaps', agent: 'ana', status: 'pending', duration: 2200 },
        { id: 's4', label: 'Dr. Sage reviewing corrections', description: 'Verifying fixes meet FDA review expectations', agent: 'sage', status: 'pending', duration: 1500 },
        { id: 's5', label: 'Generating remediation report', description: 'Compiling before/after comparison with confidence scores', agent: 'both', status: 'pending', duration: 1000 },
      ], SAGE_RESPONSES['fix-with-ana']);
      return;
    }

    if (lower.includes('audit') || lower.includes('inspection')) {
      runWorkflow([
        { id: 's1', label: 'Checking document system compliance', description: 'Verifying 21 CFR Part 11 controls', agent: 'sage', status: 'pending', duration: 1500 },
        { id: 's2', label: 'AnA verifying audit trail integrity', description: 'Scanning for gaps in electronic records', agent: 'ana', status: 'pending', duration: 1800 },
        { id: 's3', label: 'Assessing data integrity controls', description: 'ALCOA+ compliance verification', agent: 'sage', status: 'pending', duration: 1200 },
        { id: 's4', label: 'Generating inspection readiness score', description: 'Compiling checklist and recommendations', agent: 'both', status: 'pending', duration: 1000 },
      ], SAGE_RESPONSES['audit-prep']);
      return;
    }

    // Default response for free-text
    setTimeout(() => {
      const context = lower.includes('510') ? 'For 510(k) submissions specifically, ' :
        lower.includes('ind') ? 'For IND applications, ' :
        lower.includes('nda') ? 'For NDA submissions, ' :
        lower.includes('cer') ? 'For Clinical Evaluation Reports under EU MDR, ' :
        lower.includes('cmc') ? 'From a CMC review perspective, ' :
        lower.includes('clinical') ? 'On the clinical side, ' : '';

      const sageMsg: SageMessage = {
        id: `sage-${Date.now()}`,
        role: 'sage',
        content: `${context}Based on my experience reviewing thousands of submissions at FDA, here's my perspective:\n\n${lower.includes('review') ? 'From a reviewer standpoint, the key things we look for are completeness, consistency, and scientific rigor. Every claim needs supporting evidence, and every cross-reference needs to actually match.\n\n' : ''}${lower.includes('train') ? 'Training is critical — I\'ve seen too many submissions fail because teams didn\'t understand the regulatory expectations. I recommend starting with the Learning Paths in the Training tab — pick the one that matches your role.\n\n' : ''}${lower.includes('fix') || lower.includes('issue') ? 'Let me work with AnA to identify the root cause. Often what looks like a documentation issue is actually a data gap that needs to be addressed upstream.\n\n' : ''}${lower.includes('help') || lower.includes('how') ? 'I can walk you through any platform feature from both a user perspective and a reviewer perspective. The key is understanding not just *how* the tool works, but *why* it matters for your submission.\n\n' : ''}I can provide more specific guidance if you tell me about your product type and target indication. Or try one of the quick actions on the right to start a specific workflow.\n\nRemember — I give you the reviewer's perspective. AnA handles the writing, I handle the "would this pass review?" question.`,
        agentAction: lower.includes('ana') ? {
          type: 'consult-ana',
          label: 'Consulted with AnA',
          status: 'complete',
        } : undefined,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, sageMsg]);
      setIsThinking(false);
    }, 1500);
  }, [isThinking, runWorkflow]);

  const handleQuickAction = useCallback((actionId: string) => {
    const action = SAGE_QUICK_ACTIONS.find(a => a.id === actionId);
    if (!action || isThinking) return;

    const userMsg: SageMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: action.label,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    setTimeout(() => {
      const response = SAGE_RESPONSES[actionId] || 'Let me look into that for you...';
      const sageMsg: SageMessage = {
        id: `sage-${Date.now()}`,
        role: 'sage',
        content: response,
        agentAction: ['fix-with-ana', 'review-submission', 'mock-review'].includes(actionId)
          ? { type: 'consult-ana' as const, label: 'Working with AnA...', status: 'complete' as const }
          : undefined,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, sageMsg]);
      setIsThinking(false);
    }, 2000);
  }, [isThinking]);

  return (
    <div className="space-y-6">
      {/* Dr. Sage Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-blue-400 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-violet-400 blur-[80px]" />
        </div>
        <div className="relative flex items-start gap-5">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-semibold">Dr. Sage</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30">
                FDA Reviewer AI Agent
              </span>
            </div>
            <p className="text-sm text-blue-100 leading-relaxed mb-3">
              Simulated FDA reviewer with 20+ years of experience across CDER, CDRH, and CBER.
              I serve as your platform advisor, training host, and internal regulatory counsel.
              I can review your work from a reviewer's perspective, train your team, and collaborate
              with AnA to resolve issues.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: GraduationCap, label: 'Platform Trainer' },
                { icon: Eye, label: 'Submission Reviewer' },
                { icon: Wrench, label: 'Works with AnA' },
                { icon: UserCheck, label: 'Mock FDA Meetings' },
                { icon: ShieldCheck, label: 'Audit Advisor' },
              ].map(badge => {
                const Icon = badge.icon;
                return (
                  <span key={badge.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-xs text-blue-100">
                    <Icon className="w-3 h-3" />
                    {badge.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Chat + Quick Actions Layout */}
      <div className="grid grid-cols-12 gap-5">
        {/* Chat Window */}
        <div className="col-span-8 bg-white rounded-xl border border-zinc-200 flex flex-col" style={{ height: '520px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'justify-end')}>
                {msg.role === 'sage' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="w-4 h-4 text-white" />
                  </div>
                )}
                {msg.role === 'system' && (
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-zinc-500" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[80%] rounded-xl px-4 py-3',
                  msg.role === 'sage' && 'bg-zinc-50 border border-zinc-200',
                  msg.role === 'user' && 'bg-zinc-900 text-white',
                  msg.role === 'system' && 'bg-blue-50 border border-blue-100 text-blue-800',
                )}>
                  <div className={cn(
                    'text-sm leading-relaxed whitespace-pre-wrap',
                    msg.role === 'system' && 'text-xs',
                  )}>
                    {/* Simple markdown-like bold rendering */}
                    {msg.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
                      }
                      return <span key={i}>{part}</span>;
                    })}
                  </div>
                  {msg.agentAction && (
                    <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        msg.agentAction.status === 'running' ? 'bg-amber-400 animate-pulse' :
                        msg.agentAction.status === 'complete' ? 'bg-emerald-500' : 'bg-zinc-300'
                      )} />
                      <span className="text-xs text-zinc-500">{msg.agentAction.label}</span>
                      {msg.agentAction.status === 'complete' && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Multi-step agentic workflow visualization */}
            {isThinking && activeWorkflow && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="w-4 h-4 text-white" />
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-4 max-w-[80%]">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-xs font-semibold text-zinc-700">Agentic Workflow Running...</span>
                  </div>
                  <div className="space-y-2">
                    {activeWorkflow.map((step, idx) => (
                      <div key={step.id} className={cn(
                        'flex items-start gap-2.5 p-2 rounded-lg transition-colors',
                        step.status === 'running' ? 'bg-blue-50' :
                        step.status === 'complete' ? 'bg-emerald-50/50' : 'bg-transparent'
                      )}>
                        <div className="mt-0.5 flex-shrink-0">
                          {step.status === 'complete' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : step.status === 'running' ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          ) : (
                            <CircleDot className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-medium', step.status === 'complete' ? 'text-emerald-700' : step.status === 'running' ? 'text-blue-700' : 'text-zinc-400')}>
                              {step.label}
                            </span>
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-xs font-medium',
                              step.agent === 'sage' ? 'bg-blue-100 text-blue-600' :
                              step.agent === 'ana' ? 'bg-violet-100 text-violet-600' :
                              'bg-zinc-100 text-zinc-600'
                            )}>
                              {step.agent === 'sage' ? 'Dr. Sage' : step.agent === 'ana' ? 'AnA' : 'Both'}
                            </span>
                          </div>
                          {step.status === 'running' && (
                            <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {isThinking && !activeWorkflow && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="w-4 h-4 text-white" />
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-zinc-500">Dr. Sage is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-zinc-200 p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend(input)}
                placeholder="Ask Dr. Sage about the platform, regulatory strategy, or training..."
                className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/20 focus:border-blue-400"
                disabled={isThinking}
              />
              <button
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isThinking}
                className="px-3 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 transition-colors duration-150"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Quick Actions
            </h3>
            <div className="space-y-2">
              {SAGE_QUICK_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.id)}
                    disabled={isThinking}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left hover:bg-zinc-50 transition-colors disabled:opacity-60 group"
                  >
                    <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50">
                      <Icon className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-600" />
                    </div>
                    <span className="text-xs text-zinc-700 leading-tight">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dr. Sage Capabilities */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100 p-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-2">What Dr. Sage Can Do</h3>
            <div className="space-y-2">
              {[
                { icon: GraduationCap, text: 'Train your team on every platform module' },
                { icon: Eye, text: 'Review submissions from an FDA perspective' },
                { icon: Wrench, text: 'Collaborate with AnA to fix compliance gaps' },
                { icon: Users, text: 'Simulate pre-submission FDA meetings' },
                { icon: ShieldCheck, text: 'Prepare for FDA inspections and audits' },
                { icon: Brain, text: 'Explain regulatory strategy rationale' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-zinc-600 leading-relaxed">{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AnA + Dr. Sage Collaboration */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex -space-x-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center border-2 border-white z-10">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center border-2 border-white">
                  <Stethoscope className="w-3 h-3 text-white" />
                </div>
              </div>
              <span className="text-xs font-semibold text-zinc-900">AnA + Dr. Sage</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Dr. Sage and AnA work together. AnA drafts and researches — Dr. Sage reviews
              from the FDA perspective. When they collaborate, you get documents that are both
              well-written and reviewer-ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── What's New Tab ───────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  feature: { label: 'New Feature', color: 'violet', icon: Rocket },
  improvement: { label: 'Improvement', color: 'blue', icon: TrendingUp },
  intelligence: { label: 'Intelligence', color: 'emerald', icon: Brain },
  compliance: { label: 'Compliance', color: 'amber', icon: Shield },
};

function WhatsNewTab() {
  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto mb-2">
        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">What's New</h2>
        <p className="text-sm text-zinc-500">
          The latest features, intelligence updates, and improvements to help you
          get more from the platform.
        </p>
      </div>

      {/* Latest highlight */}
      {WHATS_NEW.length > 0 && (() => {
        const latest = WHATS_NEW[0];
        const LatestIcon = latest.icon;
        const typeCfg = TYPE_CONFIG[latest.type];
        return (
          <div className="bg-gradient-to-br from-violet-50 via-blue-50 to-cyan-50 rounded-xl border border-violet-100 p-8">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-200/50">
                <LatestIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', `bg-${typeCfg.color}-100 text-${typeCfg.color}-700`)}>
                    {typeCfg.label}
                  </span>
                  <span className="text-xs text-zinc-400">v{latest.version} — {new Date(latest.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{latest.title}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{latest.description}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-zinc-200" />
        <div className="space-y-4">
          {WHATS_NEW.slice(1).map((item, idx) => {
            const Icon = item.icon;
            const typeCfg = TYPE_CONFIG[item.type];
            return (
              <div key={idx} className="flex items-start gap-4 relative">
                <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 z-10">
                  <Icon className={cn('w-5 h-5', `text-${typeCfg.color}-500`)} />
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-4 flex-1 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', `bg-${typeCfg.color}-50 text-${typeCfg.color}-700`)}>
                      {typeCfg.label}
                    </span>
                    <span className="text-xs text-zinc-400">v{item.version}</span>
                    <span className="text-xs text-zinc-400 ml-auto">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-zinc-900 mb-1">{item.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roadmap Teaser */}
      <div className="bg-zinc-900 rounded-xl p-8 text-white">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-violet-400" />
          Coming Soon
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Real-Time Co-Review', desc: 'Dr. Sage and AnA reviewing documents simultaneously with live annotation overlay', icon: Eye },
            { title: 'Global Regulatory Map', desc: 'Visual intelligence map across 20+ regulatory agencies with pathway comparison', icon: Globe },
            { title: 'Automated Pre-Sub Package', desc: 'One-click generation of complete pre-submission meeting packages with briefing documents', icon: FileText },
          ].map(item => {
            const RoadmapIcon = item.icon;
            return (
              <div key={item.title} className="p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors duration-150">
                <RoadmapIcon className="w-5 h-5 text-violet-300 mb-2" />
                <h4 className="text-sm font-semibold text-white mb-1">{item.title}</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AboutTrainingCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dr-sage');

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#FAFAF9]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-8 p-1 bg-zinc-100 rounded-xl w-fit mx-auto">
          <TabButton active={activeTab === 'about'} label="Who We Are" icon={Sparkles} onClick={() => setActiveTab('about')} />
          <TabButton active={activeTab === 'platform'} label="Platform" icon={LayoutGrid} onClick={() => setActiveTab('platform')} />
          <TabButton active={activeTab === 'intelligence'} label="Intelligence" icon={Brain} onClick={() => setActiveTab('intelligence')} />
          <TabButton active={activeTab === 'training'} label="Training" icon={GraduationCap} onClick={() => setActiveTab('training')} />
          <TabButton active={activeTab === 'dr-sage'} label="Dr. Sage" icon={Stethoscope} onClick={() => setActiveTab('dr-sage')} />
          <TabButton active={activeTab === 'whats-new'} label="What's New" icon={Megaphone} onClick={() => setActiveTab('whats-new')} />
        </div>

        {/* Tab Content */}
        {activeTab === 'about' && <AboutTab />}
        {activeTab === 'platform' && <PlatformTab />}
        {activeTab === 'intelligence' && <IntelligenceTab />}
        {activeTab === 'training' && <TrainingTab />}
        {activeTab === 'dr-sage' && <DrSageTab />}
        {activeTab === 'whats-new' && <WhatsNewTab />}
      </div>
    </div>
  );
};

export default AboutTrainingCenter;
