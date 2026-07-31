/**
 * Deterministic (regex/keyword) memory-atom extraction.
 *
 * These are the heuristic fallback extractors used by resolveMemoryEntries()
 * (server/services/memory/llm-extraction.ts) when governed LLM extraction is
 * disabled, unavailable, or returns nothing. They are pure — text in, memory-
 * entry drafts out, no database or tenant context — which is why they live here
 * as a standalone, unit-tested module rather than inside the client-intelligence
 * service. Behavior is intentionally identical to the previous in-service
 * implementation; this was a lift-and-shift to shrink that governed file and put
 * the extractors under direct test.
 *
 * @module server/services/memory/heuristic-extraction
 */
import type { MemoryEntryDraft } from './llm-extraction.js';

/**
 * Client-level heuristic extraction: company identity, therapeutic areas,
 * regulatory pathways, compound identifiers, competitors, clinical phases, key
 * personnel, plus an always-present document-ingestion summary entry.
 */
export function extractMemoryEntriesFromText(
  text: string,
  fileName: string,
  profileName: string,
): MemoryEntryDraft[] {
  const entries: MemoryEntryDraft[] = [];

  // Truncate to reasonable size for analysis
  const analysisText = text.slice(0, 50000);
  const lowerText = analysisText.toLowerCase();

  // ── Extract company identity signals ──────────────────────────
  if (lowerText.includes('mission') || lowerText.includes('vision') || lowerText.includes('founded')) {
    const missionMatch = analysisText.match(/(?:mission|vision|purpose)[:\s]*([^\n.]{20,300})/i);
    if (missionMatch) {
      entries.push({
        category: 'persona',
        subcategory: 'mission_vision',
        title: `${profileName} Mission/Vision Statement`,
        content: missionMatch[1].trim(),
        confidenceScore: 0.85,
        importanceLevel: 'high',
      });
    }
  }

  // ── Extract therapeutic area signals ──────────────────────────
  const therapeuticPatterns = [
    'oncology', 'immunology', 'neurology', 'cardiology', 'rare disease',
    'gene therapy', 'cell therapy', 'ophthalmology', 'dermatology',
    'infectious disease', 'metabolic', 'respiratory', 'hematology',
    'gastroenterology', 'endocrinology', 'musculoskeletal',
  ];
  const foundAreas = therapeuticPatterns.filter(area => lowerText.includes(area));
  if (foundAreas.length > 0) {
    entries.push({
      category: 'pipeline',
      subcategory: 'therapeutic_areas',
      title: `${profileName} Therapeutic Focus Areas`,
      content: `Identified therapeutic areas: ${foundAreas.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.75,
      importanceLevel: 'high',
    });
  }

  // ── Extract regulatory pathway signals ────────────────────────
  const regulatoryPatterns = [
    { pattern: /\b(IND|investigational new drug)\b/i, label: 'IND' },
    { pattern: /\b(NDA|new drug application)\b/i, label: 'NDA' },
    { pattern: /\b(BLA|biologics license)\b/i, label: 'BLA' },
    { pattern: /\b510\(k\)/i, label: '510(k)' },
    { pattern: /\b(PMA|premarket approval)\b/i, label: 'PMA' },
    { pattern: /\b(De Novo)\b/i, label: 'De Novo' },
    { pattern: /\b(MAA|marketing authorisation)\b/i, label: 'MAA' },
    { pattern: /\b(eCTD)\b/i, label: 'eCTD' },
  ];
  const foundPathways = regulatoryPatterns
    .filter(p => p.pattern.test(analysisText))
    .map(p => p.label);
  if (foundPathways.length > 0) {
    entries.push({
      category: 'regulatory',
      subcategory: 'submission_pathways',
      title: `${profileName} Regulatory Pathways Referenced`,
      content: `Regulatory pathways mentioned: ${foundPathways.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'high',
    });
  }

  // ── Extract pipeline/drug names ───────────────────────────────
  const drugPatterns = analysisText.match(/\b[A-Z]{2,4}[-\s]?\d{3,5}\b/g);
  if (drugPatterns && drugPatterns.length > 0) {
    const unique = [...new Set(drugPatterns)].slice(0, 10);
    entries.push({
      category: 'pipeline',
      subcategory: 'compound_identifiers',
      title: `${profileName} Compound/Product Identifiers`,
      content: `Potential compound identifiers found: ${unique.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.65,
      importanceLevel: 'medium',
    });
  }

  // ── Extract competitor signals ─────────────────────────────────
  const competitorPatterns = analysisText.match(
    /(?:competitor|competing|rival|versus|vs\.?)\s*(?:include|are|:)?\s*([^\n.]{10,200})/gi
  );
  if (competitorPatterns) {
    entries.push({
      category: 'competitive',
      subcategory: 'competitor_mentions',
      title: `${profileName} Competitive References`,
      content: competitorPatterns.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Extract Phase/Clinical Trial signals ──────────────────────
  const phaseMatches = analysisText.match(/Phase\s*[I1][I1]?[I1]?[abAB]?/g);
  if (phaseMatches) {
    const uniquePhases = [...new Set(phaseMatches)];
    entries.push({
      category: 'clinical',
      subcategory: 'development_phases',
      title: `${profileName} Clinical Development Phases`,
      content: `Clinical phases referenced: ${uniquePhases.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'medium',
    });
  }

  // ── Extract key personnel/stakeholders ────────────────────────
  const titlePatterns = analysisText.match(
    /(?:CEO|CTO|CMO|CSO|COO|VP|Director|Head|Chief)\s*(?:of\s+)?[A-Z][a-zA-Z\s]{3,40}/g
  );
  if (titlePatterns) {
    entries.push({
      category: 'operational',
      subcategory: 'key_personnel',
      title: `${profileName} Key Personnel`,
      content: `Key roles identified: ${[...new Set(titlePatterns)].slice(0, 8).join('; ')}. Source: ${fileName}`,
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Always create a document summary entry ─────────────────────
  const firstParagraph = analysisText.slice(0, 500).replace(/\s+/g, ' ').trim();
  entries.push({
    category: 'history',
    subcategory: 'document_ingestion',
    title: `Ingested: ${fileName}`,
    content: `Document "${fileName}" was ingested into client intelligence. Opening content: ${firstParagraph}...`,
    confidenceScore: 1.0,
    importanceLevel: 'low',
  });

  return entries;
}

/**
 * Project-level heuristic extraction: clinical endpoints, patient population,
 * study design, risk/safety signals, CMC references, regulatory agency
 * feedback, plus an always-present document-ingestion summary entry.
 */
export function extractProjectMemoryEntries(
  text: string,
  fileName: string,
  projectName: string,
): MemoryEntryDraft[] {
  const entries: MemoryEntryDraft[] = [];

  const analysisText = text.slice(0, 50000);
  const lowerText = analysisText.toLowerCase();

  // ── Endpoint extraction ────────────────────────────────────────
  const endpointPatterns = analysisText.match(
    /(?:primary|secondary|exploratory)\s*(?:endpoint|outcome)[s]?\s*(?:include|are|:)?\s*([^\n.]{10,300})/gi
  );
  if (endpointPatterns) {
    entries.push({
      category: 'endpoint',
      subcategory: 'primary_endpoints',
      title: `${projectName} Clinical Endpoints`,
      content: endpointPatterns.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.85,
      importanceLevel: 'high',
    });
  }

  // ── Patient population extraction ──────────────────────────────
  const populationMatch = analysisText.match(
    /(?:patient|subject|participant)\s*(?:population|cohort|group)[s]?\s*(?:include|consist|comprise)[s]?\s*([^\n.]{10,300})/i
  );
  if (populationMatch) {
    entries.push({
      category: 'clinical',
      subcategory: 'patient_population',
      title: `${projectName} Patient Population`,
      content: populationMatch[1].trim(),
      confidenceScore: 0.8,
      importanceLevel: 'high',
    });
  }

  // ── Study design extraction ────────────────────────────────────
  const designPatterns = [
    'randomized', 'double-blind', 'placebo-controlled', 'open-label',
    'single-arm', 'crossover', 'parallel-group', 'dose-escalation',
    'adaptive', 'basket', 'umbrella', 'platform',
  ];
  const foundDesigns = designPatterns.filter(d => lowerText.includes(d));
  if (foundDesigns.length > 0) {
    entries.push({
      category: 'strategy',
      subcategory: 'study_design',
      title: `${projectName} Study Design Elements`,
      content: `Study design characteristics: ${foundDesigns.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'medium',
    });
  }

  // ── Risk factors extraction ────────────────────────────────────
  const riskMatch = analysisText.match(
    /(?:risk|safety|adverse|concern|limitation)[s]?\s*(?:include|are|:)?\s*([^\n.]{15,300})/gi
  );
  if (riskMatch) {
    entries.push({
      category: 'risk',
      subcategory: 'identified_risks',
      title: `${projectName} Risk/Safety Signals`,
      content: riskMatch.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.75,
      importanceLevel: 'high',
    });
  }

  // ── Manufacturing/CMC signals ──────────────────────────────────
  const cmcPatterns = ['drug substance', 'drug product', 'formulation', 'stability',
    'manufacturing process', 'excipient', 'packaging', 'shelf life', 'GMP'];
  const foundCMC = cmcPatterns.filter(p => lowerText.includes(p));
  if (foundCMC.length >= 2) {
    entries.push({
      category: 'manufacturing',
      subcategory: 'cmc_signals',
      title: `${projectName} CMC References`,
      content: `CMC topics referenced: ${foundCMC.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Regulatory decision extraction ─────────────────────────────
  const decisionMatch = analysisText.match(
    /(?:FDA|EMA|PMDA|agency)\s*(?:recommended|required|requested|approved|denied|suggested)\s*([^\n.]{10,200})/gi
  );
  if (decisionMatch) {
    entries.push({
      category: 'decision',
      subcategory: 'agency_feedback',
      title: `${projectName} Regulatory Agency Feedback`,
      content: decisionMatch.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.85,
      importanceLevel: 'critical',
    });
  }

  // ── Document summary ───────────────────────────────────────────
  const firstParagraph = analysisText.slice(0, 400).replace(/\s+/g, ' ').trim();
  entries.push({
    category: 'strategy',
    subcategory: 'document_ingestion',
    title: `Ingested: ${fileName}`,
    content: `Document "${fileName}" ingested for project "${projectName}". Content preview: ${firstParagraph}...`,
    confidenceScore: 1.0,
    importanceLevel: 'low',
  });

  return entries;
}
