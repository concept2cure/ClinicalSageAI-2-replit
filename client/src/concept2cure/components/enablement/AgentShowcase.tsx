import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

type SystemGroup =
  | "agent-swarm"
  | "cognitive-ecosystem"
  | "innovation"
  | "intelligence"
  | "foresight";

type Category =
  | "orchestration"
  | "analysis"
  | "generation"
  | "validation"
  | "prediction"
  | "monitoring";

type Status = "active" | "beta" | "coming-soon";

interface AgentCapability {
  id: string;
  name: string;
  system: SystemGroup;
  description: string;
  whatItDoes: string[];
  powersWorkflows: string[];
  status: Status;
  apiEndpoint?: string;
  category: Category;
}

// ---------------------------------------------------------------------------
// Complete capability inventory (36 items)
// ---------------------------------------------------------------------------

const capabilities: AgentCapability[] = [
  // Agent Swarm (10)
  {
    id: "coordinator",
    name: "Coordinator Agent",
    system: "agent-swarm",
    description: "Orchestrates tasks across the agent swarm, assigns work to specialists based on submission context.",
    whatItDoes: [
      "Decomposes complex submissions into discrete agent tasks",
      "Routes work to the best-fit specialist agent",
      "Manages inter-agent dependencies and sequencing",
      "Provides real-time orchestration status to users",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "510(k)", "PMA"],
    status: "active",
    apiEndpoint: "/api/agents/coordinator",
    category: "orchestration",
  },
  {
    id: "drafter",
    name: "Drafter Agent",
    system: "agent-swarm",
    description: "Generates regulatory document sections aligned to CTD structure and agency expectations.",
    whatItDoes: [
      "Produces CTD Module 2-5 section drafts from source data",
      "Applies agency-specific formatting and terminology",
      "Maintains cross-reference integrity across sections",
      "Learns from accepted submission language patterns",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "MAA"],
    status: "active",
    apiEndpoint: "/api/agents/drafter",
    category: "generation",
  },
  {
    id: "researcher",
    name: "Researcher Agent",
    system: "agent-swarm",
    description: "Conducts literature search, precedent analysis, and evidence gathering for regulatory arguments.",
    whatItDoes: [
      "Searches PubMed, FDA databases, and proprietary archives",
      "Identifies relevant precedents and prior agency decisions",
      "Extracts and summarizes key evidence points",
      "Ranks evidence by relevance and strength",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "Briefing Documents"],
    status: "active",
    apiEndpoint: "/api/agents/researcher",
    category: "analysis",
  },
  {
    id: "qc",
    name: "QC Agent",
    system: "agent-swarm",
    description: "Performs quality control and consistency checks across all document sections.",
    whatItDoes: [
      "Validates internal consistency of claims and data",
      "Checks terminology alignment across modules",
      "Flags contradictions between sections",
      "Generates QC reports with actionable findings",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "510(k)", "PMA"],
    status: "active",
    apiEndpoint: "/api/agents/qc",
    category: "validation",
  },
  {
    id: "compliance",
    name: "Compliance Agent",
    system: "agent-swarm",
    description: "Verifies adherence to 21 CFR Part 11, ICH guidelines, and regional regulatory requirements.",
    whatItDoes: [
      "Audits documents against 21 CFR Part 11 requirements",
      "Validates ICH E6, E8, E9 guideline compliance",
      "Checks regional formatting and content mandates",
      "Produces compliance gap analysis reports",
    ],
    powersWorkflows: ["All submission types"],
    status: "active",
    apiEndpoint: "/api/agents/compliance",
    category: "validation",
  },
  {
    id: "reviewer",
    name: "Reviewer Agent",
    system: "agent-swarm",
    description: "Simulates FDA reviewer perspective to predict deficiency letters and information requests.",
    whatItDoes: [
      "Applies shadow-reviewer logic trained on historical FDA actions",
      "Predicts likely deficiency letter topics",
      "Scores submission sections by review risk",
      "Suggests pre-emptive strengthening edits",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "510(k)"],
    status: "active",
    apiEndpoint: "/api/agents/reviewer",
    category: "prediction",
  },
  {
    id: "compiler",
    name: "Compiler Agent",
    system: "agent-swarm",
    description: "Assembles and validates eCTD 4.0 XML packages for electronic submission.",
    whatItDoes: [
      "Generates eCTD 4.0 compliant XML backbone",
      "Validates document lifecycle and leaf references",
      "Produces submission-ready packages for gateways",
      "Handles sequence numbering and amendment tracking",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "MAA"],
    status: "active",
    apiEndpoint: "/api/agents/compiler",
    category: "generation",
  },
  {
    id: "validator",
    name: "Validator Agent",
    system: "agent-swarm",
    description: "Runs pre-submission validation checks to catch issues before filing.",
    whatItDoes: [
      "Executes 200+ validation rules per submission type",
      "Checks PDF bookmarks, hyperlinks, and pagination",
      "Validates file naming conventions and folder structure",
      "Produces pass/fail validation report with fix guidance",
    ],
    powersWorkflows: ["All submission types"],
    status: "active",
    apiEndpoint: "/api/agents/validator",
    category: "validation",
  },
  {
    id: "evidence",
    name: "Evidence Agent",
    system: "agent-swarm",
    description: "Gathers and manages real-world evidence and literature citations for submissions.",
    whatItDoes: [
      "Curates real-world evidence from structured databases",
      "Manages citation libraries with full provenance",
      "Scores evidence quality using GRADE methodology",
      "Links evidence to specific regulatory claims",
    ],
    powersWorkflows: ["NDA", "BLA", "sNDA", "Briefing Documents"],
    status: "active",
    apiEndpoint: "/api/agents/evidence",
    category: "analysis",
  },
  {
    id: "translator",
    name: "Translator Agent",
    system: "agent-swarm",
    description: "Provides multi-language regulatory translation with domain-specific terminology.",
    whatItDoes: [
      "Translates regulatory documents across 20+ languages",
      "Preserves regulatory terminology precision",
      "Handles agency-specific formatting per locale",
      "Maintains translation memory for consistency",
    ],
    powersWorkflows: ["MAA", "Global Dossiers", "Labeling"],
    status: "beta",
    apiEndpoint: "/api/agents/translator",
    category: "generation",
  },
  // Multi-Agent Council (1)
  {
    id: "doc-quality-council",
    name: "Document Quality Council",
    system: "agent-swarm",
    description: "Multi-agent pipeline: Drafter, Statistician, Critic, and Synthesizer collaborate on document quality.",
    whatItDoes: [
      "Drafter produces initial section content",
      "Statistician validates data claims and calculations",
      "Critic identifies weaknesses and gaps",
      "Synthesizer integrates feedback into final output",
    ],
    powersWorkflows: ["NDA", "BLA", "MAA"],
    status: "active",
    apiEndpoint: "/api/agents/council/doc-quality",
    category: "orchestration",
  },
  // Cognitive Ecosystem (6)
  {
    id: "agent-runtime",
    name: "Agent Runtime",
    system: "cognitive-ecosystem",
    description: "Core infrastructure for thread management, checkpoint persistence, and human-in-the-loop breakpoints.",
    whatItDoes: [
      "Manages long-running agent execution threads",
      "Persists checkpoints for resumable workflows",
      "Enforces HITL breakpoints at critical decision gates",
      "Provides execution observability and tracing",
    ],
    powersWorkflows: ["All submission types"],
    status: "active",
    apiEndpoint: "/api/runtime/agents",
    category: "orchestration",
  },
  {
    id: "digital-twin-runtime",
    name: "Digital Twin Runtime",
    system: "cognitive-ecosystem",
    description: "Simulates virtual manufacturing processes for CMC submissions and process validation.",
    whatItDoes: [
      "Models manufacturing process parameters virtually",
      "Simulates batch outcomes under varied conditions",
      "Identifies critical process parameters via sensitivity analysis",
      "Generates CMC-ready process characterization data",
    ],
    powersWorkflows: ["NDA", "BLA", "ANDA", "CMC Supplements"],
    status: "beta",
    apiEndpoint: "/api/runtime/digital-twin",
    category: "prediction",
  },
  {
    id: "federated-learning",
    name: "Federated Learning",
    system: "cognitive-ecosystem",
    description: "Coordinates machine learning across organizations without sharing raw data.",
    whatItDoes: [
      "Trains models across distributed data sources",
      "Preserves data privacy with differential privacy guarantees",
      "Aggregates model improvements without data movement",
      "Supports cross-sponsor benchmarking anonymously",
    ],
    powersWorkflows: ["Portfolio Analytics", "Benchmarking"],
    status: "coming-soon",
    category: "analysis",
  },
  {
    id: "fhir-validation",
    name: "FHIR Validation Engine",
    system: "cognitive-ecosystem",
    description: "Validates clinical data against FHIR R4 standards for interoperability and submission readiness.",
    whatItDoes: [
      "Validates resources against FHIR R4 profiles",
      "Maps legacy clinical data formats to FHIR",
      "Checks referential integrity across bundles",
      "Produces conformance reports for submission packages",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "Clinical Data Packages"],
    status: "active",
    apiEndpoint: "/api/cognitive/fhir-validation",
    category: "validation",
  },
  {
    id: "global-dossier",
    name: "Global Dossier Service",
    system: "cognitive-ecosystem",
    description: "Coordinates multi-jurisdiction dossier assembly and tracks regional variation requirements.",
    whatItDoes: [
      "Manages region-specific content variations from a single source",
      "Tracks regulatory timelines across 30+ agencies",
      "Synchronizes updates across parallel submissions",
      "Generates jurisdiction comparison matrices",
    ],
    powersWorkflows: ["MAA", "Global IND", "NDA", "BLA"],
    status: "active",
    apiEndpoint: "/api/cognitive/global-dossier",
    category: "orchestration",
  },
  {
    id: "cognitive-audit",
    name: "Cognitive Audit",
    system: "cognitive-ecosystem",
    description: "Maintains 21 CFR Part 11 compliant audit trails for all AI-generated content and decisions.",
    whatItDoes: [
      "Records every AI decision with full provenance",
      "Timestamps and signs audit entries cryptographically",
      "Supports electronic signature workflows",
      "Generates inspection-ready audit reports",
    ],
    powersWorkflows: ["All submission types"],
    status: "active",
    apiEndpoint: "/api/cognitive/audit",
    category: "monitoring",
  },
  // Innovation Platform (8)
  {
    id: "delta-radar",
    name: "Regulatory Delta Radar",
    system: "innovation",
    description: "Monitors regulatory changes across global agencies and assesses impact on active submissions.",
    whatItDoes: [
      "Scans 30+ agency feeds for guideline updates",
      "Classifies changes by impact severity and relevance",
      "Maps changes to affected in-progress submissions",
      "Delivers prioritized alerts with recommended actions",
    ],
    powersWorkflows: ["All submission types", "Regulatory Intelligence"],
    status: "active",
    apiEndpoint: "/api/innovation/delta-radar",
    category: "monitoring",
  },
  {
    id: "confidence-heatmap",
    name: "Evidence Confidence Heatmap",
    system: "innovation",
    description: "Visualizes confidence scores across evidence packages to identify weak points.",
    whatItDoes: [
      "Maps evidence strength across submission sections",
      "Highlights low-confidence areas requiring attention",
      "Tracks confidence trends over iterative drafts",
      "Exports visual reports for stakeholder review",
    ],
    powersWorkflows: ["NDA", "BLA", "Briefing Documents"],
    status: "active",
    apiEndpoint: "/api/innovation/confidence-heatmap",
    category: "analysis",
  },
  {
    id: "readiness-twin",
    name: "Submission Readiness Twin",
    system: "innovation",
    description: "Digital twin modeling of submission readiness with real-time gap tracking.",
    whatItDoes: [
      "Models complete submission state as a digital twin",
      "Tracks readiness percentage by module and section",
      "Forecasts completion timelines based on current velocity",
      "Identifies critical-path blockers automatically",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "510(k)", "PMA"],
    status: "beta",
    apiEndpoint: "/api/innovation/readiness-twin",
    category: "prediction",
  },
  {
    id: "auto-traceability",
    name: "Auto-Traceability Engine",
    system: "innovation",
    description: "Automatically maps evidence to claims, creating auditable traceability matrices.",
    whatItDoes: [
      "Links every regulatory claim to supporting evidence",
      "Detects unsupported or weakly-supported assertions",
      "Generates eCTD-compatible traceability matrices",
      "Updates links dynamically as documents evolve",
    ],
    powersWorkflows: ["NDA", "BLA", "510(k)", "PMA"],
    status: "active",
    apiEndpoint: "/api/innovation/auto-trace",
    category: "validation",
  },
  {
    id: "adaptive-reviewer",
    name: "Adaptive Reviewer Workspace",
    system: "innovation",
    description: "AI-powered review environment that adapts to reviewer expertise and preferences.",
    whatItDoes: [
      "Personalizes review interface based on reviewer role",
      "Surfaces relevant context and precedents inline",
      "Tracks reviewer attention patterns for optimization",
      "Supports collaborative annotation and resolution",
    ],
    powersWorkflows: ["All submission types"],
    status: "beta",
    apiEndpoint: "/api/innovation/adaptive-reviewer",
    category: "analysis",
  },
  {
    id: "template-learning",
    name: "Outcome-Based Template Learning",
    system: "innovation",
    description: "Templates that continuously learn from submission outcomes to improve future drafts.",
    whatItDoes: [
      "Analyzes approval and rejection patterns by template",
      "Adjusts template language based on successful submissions",
      "A/B tests template variations across submissions",
      "Reports template effectiveness metrics quarterly",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "MAA"],
    status: "beta",
    apiEndpoint: "/api/innovation/template-learning",
    category: "generation",
  },
  {
    id: "negotiation-logbook",
    name: "Regulatory Negotiation Logbook",
    system: "innovation",
    description: "Tracks and learns from agency interactions, building institutional negotiation knowledge.",
    whatItDoes: [
      "Records all agency meeting outcomes and commitments",
      "Identifies negotiation patterns by agency and division",
      "Suggests talking points based on historical success",
      "Maintains commitment tracking with deadline alerts",
    ],
    powersWorkflows: ["Pre-IND Meetings", "Type A/B/C Meetings"],
    status: "coming-soon",
    category: "monitoring",
  },
  {
    id: "guardrails-sdk",
    name: "Compliance Guardrails SDK",
    system: "innovation",
    description: "Programmable compliance rules that can be embedded into any workflow or document pipeline.",
    whatItDoes: [
      "Provides a rule engine for custom compliance checks",
      "Ships with 500+ pre-built regulatory rules",
      "Supports custom rule authoring via simple DSL",
      "Integrates with CI/CD pipelines for automated checks",
    ],
    powersWorkflows: ["All submission types", "Custom Workflows"],
    status: "active",
    apiEndpoint: "/api/innovation/guardrails",
    category: "validation",
  },
  // Intelligence Services (6)
  {
    id: "pathway-intelligence",
    name: "Regulatory Pathway Intelligence",
    system: "intelligence",
    description: "Covers 30+ agencies and 65+ ICH guidelines with pathway recommendation engine.",
    whatItDoes: [
      "Maps product profiles to optimal regulatory pathways",
      "Compares timelines and requirements across jurisdictions",
      "Recommends expedited designations when eligible",
      "Generates pathway comparison reports for governance",
    ],
    powersWorkflows: ["Regulatory Strategy", "IND", "NDA", "BLA"],
    status: "active",
    apiEndpoint: "/api/intelligence/pathway",
    category: "analysis",
  },
  {
    id: "precedent-engine",
    name: "Precedent Engine",
    system: "intelligence",
    description: "Matches historical precedents and identifies rejection pattern recognition across agencies.",
    whatItDoes: [
      "Searches 50,000+ historical agency decisions",
      "Identifies similar product precedents by mechanism and indication",
      "Flags common rejection reasons for similar submissions",
      "Scores precedent relevance and applicability",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "Briefing Documents"],
    status: "active",
    apiEndpoint: "/api/intelligence/precedent",
    category: "analysis",
  },
  {
    id: "knowledge-graph",
    name: "Knowledge Graph",
    system: "intelligence",
    description: "Semantic relationship mapping across regulatory data, guidelines, and submission history.",
    whatItDoes: [
      "Models 2M+ entities and relationships",
      "Discovers non-obvious connections across datasets",
      "Supports natural language graph queries",
      "Powers contextual recommendations across the platform",
    ],
    powersWorkflows: ["All submission types"],
    status: "active",
    apiEndpoint: "/api/intelligence/knowledge-graph",
    category: "analysis",
  },
  {
    id: "confidence-scoring",
    name: "Confidence Scoring Engine",
    system: "intelligence",
    description: "Multi-dimensional confidence assessment for documents, evidence, and submission readiness.",
    whatItDoes: [
      "Scores confidence across 12 dimensions per section",
      "Calibrates scores against historical outcomes",
      "Provides granular breakdown of confidence factors",
      "Tracks confidence trajectory over submission lifecycle",
    ],
    powersWorkflows: ["NDA", "BLA", "510(k)", "PMA"],
    status: "active",
    apiEndpoint: "/api/intelligence/confidence",
    category: "prediction",
  },
  {
    id: "clinical-intelligence",
    name: "Clinical Intelligence",
    system: "intelligence",
    description: "Analyzes clinical data to surface insights, trends, and anomalies for regulatory use.",
    whatItDoes: [
      "Processes clinical datasets for signal detection",
      "Identifies safety trends across study populations",
      "Generates efficacy summary narratives automatically",
      "Compares results against therapeutic area benchmarks",
    ],
    powersWorkflows: ["IND", "NDA", "BLA", "Safety Reports"],
    status: "active",
    apiEndpoint: "/api/intelligence/clinical",
    category: "analysis",
  },
  {
    id: "strategic-intelligence",
    name: "Strategic Intelligence",
    system: "intelligence",
    description: "Portfolio-level strategic analysis for regulatory planning and resource allocation.",
    whatItDoes: [
      "Analyzes portfolio risk across active programs",
      "Models resource allocation scenarios",
      "Forecasts regulatory milestones and bottlenecks",
      "Generates executive dashboards for governance",
    ],
    powersWorkflows: ["Portfolio Management", "Regulatory Strategy"],
    status: "beta",
    apiEndpoint: "/api/intelligence/strategic",
    category: "prediction",
  },
  // ForesightAI (5)
  {
    id: "foresight-prediction",
    name: "ForesightAI Prediction Engine",
    system: "foresight",
    description: "Multi-modal clinical outcome prediction using ensemble machine learning models.",
    whatItDoes: [
      "Predicts trial success probability by phase and indication",
      "Combines structured data, literature, and regulatory signals",
      "Provides confidence intervals and scenario analysis",
      "Updates predictions in real-time as new data arrives",
    ],
    powersWorkflows: ["Clinical Development", "Regulatory Strategy"],
    status: "active",
    apiEndpoint: "/api/foresight/prediction",
    category: "prediction",
  },
  {
    id: "monte-carlo",
    name: "Monte Carlo Simulation",
    system: "foresight",
    description: "Probabilistic timeline and risk modeling for submission planning.",
    whatItDoes: [
      "Runs 10,000+ simulations per scenario",
      "Models timeline distributions with uncertainty ranges",
      "Identifies highest-impact risk factors",
      "Generates probability-weighted milestone forecasts",
    ],
    powersWorkflows: ["Program Planning", "Regulatory Strategy"],
    status: "active",
    apiEndpoint: "/api/foresight/monte-carlo",
    category: "prediction",
  },
  {
    id: "protocol-analyzer",
    name: "Protocol Analyzer",
    system: "foresight",
    description: "NLP-based protocol intelligence for design optimization and risk assessment.",
    whatItDoes: [
      "Parses protocol documents using specialized NLP models",
      "Identifies design risks and optimization opportunities",
      "Benchmarks against similar successful protocols",
      "Suggests endpoint and population refinements",
    ],
    powersWorkflows: ["IND", "Protocol Amendments", "Clinical Development"],
    status: "active",
    apiEndpoint: "/api/foresight/protocol-analyzer",
    category: "analysis",
  },
  {
    id: "foresight-kg",
    name: "Foresight Knowledge Graph",
    system: "foresight",
    description: "Predictive relationship mapping that identifies emerging trends and regulatory signals.",
    whatItDoes: [
      "Maps predictive relationships across clinical and regulatory data",
      "Detects emerging therapeutic area trends",
      "Identifies early signals of regulatory shifts",
      "Powers proactive strategic recommendations",
    ],
    powersWorkflows: ["Regulatory Strategy", "Portfolio Management"],
    status: "beta",
    apiEndpoint: "/api/foresight/knowledge-graph",
    category: "prediction",
  },
  {
    id: "csr-integration",
    name: "CSR Integration",
    system: "foresight",
    description: "Clinical Study Report data integration for seamless prediction model training.",
    whatItDoes: [
      "Ingests and normalizes CSR data from multiple formats",
      "Extracts key endpoints and outcomes automatically",
      "Feeds structured CSR data into prediction models",
      "Maintains versioned CSR data lake for historical analysis",
    ],
    powersWorkflows: ["NDA", "BLA", "Clinical Development"],
    status: "active",
    apiEndpoint: "/api/foresight/csr-integration",
    category: "analysis",
  },
];

// ---------------------------------------------------------------------------
// Filter labels
// ---------------------------------------------------------------------------

const systemLabels: Record<string, string> = {
  all: "All",
  "agent-swarm": "Agent Swarm",
  "cognitive-ecosystem": "Cognitive",
  innovation: "Innovation",
  intelligence: "Intelligence",
  foresight: "ForesightAI",
};

const categoryLabels: Record<string, string> = {
  all: "All",
  orchestration: "Orchestration",
  analysis: "Analysis",
  generation: "Generation",
  validation: "Validation",
  prediction: "Prediction",
  monitoring: "Monitoring",
};

const statusLabel: Record<Status, string> = {
  active: "Active",
  beta: "Beta",
  "coming-soon": "Coming Soon",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterBar({
  options,
  value,
  onChange,
}: {
  options: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(options).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors duration-150",
            value === key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CapabilityCard({ cap }: { cap: AgentCapability }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="bg-white border border-zinc-100 rounded-lg p-5"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-zinc-900 leading-snug">
            {cap.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-400">
              {systemLabels[cap.system]}
            </span>
            <span className="text-zinc-200">·</span>
            <span className="text-xs text-zinc-400">
              {categoryLabels[cap.category]}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "text-xs shrink-0 mt-0.5",
            cap.status === "active" && "text-zinc-900",
            cap.status === "beta" && "text-zinc-400",
            cap.status === "coming-soon" && "text-zinc-400"
          )}
        >
          {statusLabel[cap.status]}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-600 leading-relaxed line-clamp-2 mb-3">
        {cap.description}
      </p>

      {/* Expandable section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-2"
      >
        What it does
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-150",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <ul className="mb-3 space-y-1">
              {cap.whatItDoes.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-zinc-600 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-300"
                >
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Powers workflows */}
      <p className="text-xs text-zinc-400 leading-relaxed">
        <span className="text-zinc-500">Powers:</span>{" "}
        {cap.powersWorkflows.join(", ")}
      </p>

      {/* API endpoint */}
      {cap.apiEndpoint && (
        <p className="text-xs text-zinc-300 font-mono mt-2">
          {cap.apiEndpoint}
        </p>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentShowcase() {
  const [systemFilter, setSystemFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = useMemo(() => {
    return capabilities.filter((cap) => {
      if (systemFilter !== "all" && cap.system !== systemFilter) return false;
      if (categoryFilter !== "all" && cap.category !== categoryFilter)
        return false;
      return true;
    });
  }, [systemFilter, categoryFilter]);

  const counts = useMemo(() => {
    const active = capabilities.filter((c) => c.status === "active").length;
    const beta = capabilities.filter((c) => c.status === "beta").length;
    const coming = capabilities.filter((c) => c.status === "coming-soon").length;
    return { active, beta, coming };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
            AI Capabilities
          </h1>
          <p className="text-sm text-zinc-600 mt-1.5">
            35 specialized AI agents and services power your regulatory
            workflows
          </p>
          <p className="text-xs text-zinc-400 mt-3">
            {counts.active} active · {counts.beta} in beta · {counts.coming}{" "}
            coming soon
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-8">
          <FilterBar
            options={systemLabels}
            value={systemFilter}
            onChange={setSystemFilter}
          />
          <FilterBar
            options={categoryLabels}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        </div>

        {/* Results count */}
        <p className="text-xs text-zinc-400 mb-4">
          {filtered.length} {filtered.length === 1 ? "capability" : "capabilities"}
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((cap) => (
              <CapabilityCard key={cap.id} cap={cap} />
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-zinc-400">
              No capabilities match the selected filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentShowcase;
