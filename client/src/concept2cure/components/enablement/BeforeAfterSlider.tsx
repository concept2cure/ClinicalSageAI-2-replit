import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  CheckCircle2,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonItem {
  text: string;
}

interface ComparisonConfig {
  before: ComparisonItem[];
  after: ComparisonItem[];
  beforeTitle: string;
  afterTitle: string;
}

interface BeforeAfterSliderProps {
  className?: string;
  initialPosition?: number; // 0-100, default 50
  preset?: keyof typeof COMPARISON_PRESETS;
  config?: ComparisonConfig;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const COMPARISON_PRESETS = {
  workflow: {
    beforeTitle: "Legacy Workflow",
    afterTitle: "Concept2Cure Workflow",
    before: [
      { text: "5+ disconnected tools for one submission" },
      { text: "Manual evidence cross-referencing in spreadsheets" },
      { text: "No audit trail or provenance tracking" },
      { text: "Compliance gaps found at FDA review" },
      { text: "Weeks of rework after deficiency letters" },
      { text: "Siloed knowledge, no institutional memory" },
    ],
    after: [
      { text: "One governed platform, end to end" },
      { text: "AnA 1.0 analyzes evidence automatically" },
      { text: "Full provenance and audit trail on every artifact" },
      { text: "Dr. Sage catches gaps before submission" },
      { text: "AI-assisted remediation in hours, not weeks" },
      { text: "Shared intelligence across every project" },
    ],
  },
  evidence: {
    beforeTitle: "Manual Evidence Review",
    afterTitle: "AnA 1.0 Intelligence",
    before: [
      { text: "Manually searching through thousands of pages" },
      { text: "Missed cross-references between studies" },
      { text: "Subjective evidence strength assessments" },
      { text: "Inconsistent predicate device comparisons" },
      { text: "Hours spent on literature review summaries" },
      { text: "No automated gap detection in evidence packages" },
    ],
    after: [
      { text: "AI-powered semantic search across all documents" },
      { text: "Automatic cross-reference mapping and linking" },
      { text: "Quantified evidence scoring with rationale" },
      { text: "Standardized predicate comparison matrices" },
      { text: "Auto-generated literature review drafts in minutes" },
      { text: "Real-time evidence coverage gap analysis" },
    ],
  },
  compliance: {
    beforeTitle: "Reactive Compliance",
    afterTitle: "Proactive Compliance",
    before: [
      { text: "Discover issues during FDA audit" },
      { text: "Manual checklist tracking in spreadsheets" },
      { text: "Regulatory updates found weeks after publication" },
      { text: "No visibility into cross-module dependencies" },
      { text: "Retrospective CAPA after non-conformances" },
      { text: "Inconsistent formatting across submissions" },
    ],
    after: [
      { text: "Continuous compliance monitoring in real time" },
      { text: "Automated compliance scoring per requirement" },
      { text: "Instant alerts on new guidance and regulations" },
      { text: "Full dependency graph across all modules" },
      { text: "Predictive risk detection before issues arise" },
      { text: "Template-enforced formatting and structure" },
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// BeforeAfterSlider
// ---------------------------------------------------------------------------

export function BeforeAfterSlider({
  className,
  initialPosition = 50,
  preset = "workflow",
  config,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const comparison = config ?? COMPARISON_PRESETS[preset];

  const updatePosition = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
      setPosition(pct);
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      updatePosition(e.touches[0].clientX);
    },
    [updatePosition],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updatePosition(e.clientX);
    const handleTouchMove = (e: TouchEvent) =>
      updatePosition(e.touches[0].clientX);
    const handleEnd = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, updatePosition]);

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden select-none",
        "bg-white dark:bg-zinc-950",
        className,
      )}
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ cursor: isDragging ? "grabbing" : "col-resize" }}
    >
      {/* ---- After side (full width, behind) ---- */}
      <div className="relative w-full min-h-[420px] p-8">
        <AfterPanel items={comparison.after} title={comparison.afterTitle} />
      </div>

      {/* ---- Before side (clipped overlay) ---- */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <div
          className="min-h-[420px] p-8"
          style={{ width: containerRef.current?.offsetWidth ?? "100%" }}
        >
          <BeforePanel items={comparison.before} title={comparison.beforeTitle} />
        </div>
      </div>

      {/* ---- Divider line ---- */}
      <div
        className="absolute top-0 bottom-0 z-20 w-[2px]"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        <div className="h-full w-full bg-gradient-to-b from-blue-500/40 via-violet-500/60 to-blue-500/40" />
      </div>

      {/* ---- Drag handle ---- */}
      <motion.div
        className={cn(
          "absolute z-30 flex items-center justify-center",
          "w-12 h-12 rounded-full",
          "bg-gradient-to-br from-blue-500 to-violet-600",
          "shadow-lg text-white",
          "transition-shadow duration-200",
          isDragging && "shadow-[0_0_24px_rgba(99,102,241,0.5)]",
        )}
        style={{
          left: `${position}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
        animate={{
          scale: isDragging ? 1.2 : isHovering ? 1.08 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <ArrowLeftRight className="w-5 h-5" />
      </motion.div>

      {/* ---- Labels ---- */}
      <motion.div
        className="absolute top-3 left-4 z-10 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Before
      </motion.div>
      <motion.div
        className="absolute top-3 right-4 z-10 text-[11px] font-semibold uppercase tracking-wider text-violet-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        After
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before Panel
// ---------------------------------------------------------------------------

function BeforePanel({
  items,
  title,
}: {
  items: ComparisonItem[];
  title: string;
}) {
  return (
    <div className="h-full bg-zinc-100 dark:bg-zinc-900 rounded-xl p-6 pt-10 filter saturate-[0.35] opacity-90">
      <h3 className="text-lg font-bold text-zinc-500 dark:text-zinc-400 mb-6">
        {title}
      </h3>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <motion.li
            key={i}
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.35 }}
          >
            <X className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {item.text}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// After Panel
// ---------------------------------------------------------------------------

function AfterPanel({
  items,
  title,
}: {
  items: ComparisonItem[];
  title: string;
}) {
  return (
    <div className="h-full bg-gradient-to-br from-blue-50 via-violet-50/50 to-white dark:from-blue-950/30 dark:via-violet-950/20 dark:to-zinc-950 rounded-xl p-6 pt-10">
      <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent mb-6">
        {title}
      </h3>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <motion.li
            key={i}
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.35 }}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {item.text}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default BeforeAfterSlider;
