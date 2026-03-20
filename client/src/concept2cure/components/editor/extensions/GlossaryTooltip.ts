/**
 * GlossaryTooltip — TipTap extension for regulatory term glossary.
 *
 * Auto-detects regulatory and pharmaceutical terms in document content,
 * highlights them with a dotted underline, and shows tooltip definitions
 * on hover. Ships with ~50 built-in regulatory terms; custom terms can
 * be added via extension options.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  term: string;
  abbreviation: string;
  definition: string;
  regulation: string;
  category: string;
}

export interface GlossaryOptions {
  enabled: boolean;
  customTerms: GlossaryEntry[];
}

// ---------------------------------------------------------------------------
// Built-in glossary (~50 regulatory / pharmaceutical terms)
// ---------------------------------------------------------------------------

const BUILT_IN_GLOSSARY: GlossaryEntry[] = [
  // Regulatory submissions — FDA
  {
    term: 'Investigational New Drug',
    abbreviation: 'IND',
    definition:
      'An application submitted to the FDA to begin clinical trials of a new drug in humans. Required before any interstate shipment of an investigational drug.',
    regulation: '21 CFR 312',
    category: 'Regulatory Submission',
  },
  {
    term: 'New Drug Application',
    abbreviation: 'NDA',
    definition:
      'The formal submission to the FDA requesting approval to market a new pharmaceutical for sale and distribution in the United States.',
    regulation: '21 CFR 314',
    category: 'Regulatory Submission',
  },
  {
    term: 'Biologics License Application',
    abbreviation: 'BLA',
    definition:
      'A request for permission to introduce, or deliver for introduction, a biologic product into interstate commerce, submitted to the FDA.',
    regulation: '42 USC 262',
    category: 'Regulatory Submission',
  },
  {
    term: '510(k)',
    abbreviation: '510(k)',
    definition:
      'A premarket notification submitted to the FDA to demonstrate that a medical device is substantially equivalent to a legally marketed predicate device.',
    regulation: '21 CFR 807 Subpart E',
    category: 'Medical Devices',
  },
  {
    term: 'Premarket Approval',
    abbreviation: 'PMA',
    definition:
      'The most stringent type of device marketing application required by the FDA, applicable to Class III medical devices.',
    regulation: '21 CFR 814',
    category: 'Medical Devices',
  },
  {
    term: 'De Novo',
    abbreviation: 'De Novo',
    definition:
      'A regulatory pathway for novel, low-to-moderate risk medical devices that lack a predicate device for 510(k) clearance.',
    regulation: '21 CFR 860',
    category: 'Medical Devices',
  },
  {
    term: 'Abbreviated New Drug Application',
    abbreviation: 'ANDA',
    definition:
      'An application for a generic drug approval that relies on the safety and efficacy data of the reference listed drug.',
    regulation: '21 CFR 314 Subpart C',
    category: 'Regulatory Submission',
  },
  {
    term: 'Emergency Use Authorization',
    abbreviation: 'EUA',
    definition:
      'A mechanism that allows the FDA to authorize unapproved medical products during public health emergencies.',
    regulation: '21 USC 360bbb-3',
    category: 'Regulatory Submission',
  },

  // ICH & standards
  {
    term: 'International Council for Harmonisation',
    abbreviation: 'ICH',
    definition:
      'An organization that brings together regulatory authorities and the pharmaceutical industry to harmonize scientific and technical aspects of drug registration.',
    regulation: 'ICH Guidelines',
    category: 'Standards Body',
  },
  {
    term: 'Good Clinical Practice',
    abbreviation: 'GCP',
    definition:
      'An international ethical and scientific quality standard for designing, conducting, recording, and reporting clinical trials involving human subjects.',
    regulation: 'ICH E6(R2)',
    category: 'Quality Standard',
  },
  {
    term: 'Good Manufacturing Practice',
    abbreviation: 'GMP',
    definition:
      'Regulations that require manufacturers to ensure their products are consistently produced and controlled according to quality standards.',
    regulation: '21 CFR 210/211',
    category: 'Quality Standard',
  },
  {
    term: 'Good Laboratory Practice',
    abbreviation: 'GLP',
    definition:
      'A set of principles for non-clinical laboratory studies that support or are intended to support regulatory submissions.',
    regulation: '21 CFR 58',
    category: 'Quality Standard',
  },

  // Documents
  {
    term: 'Common Technical Document',
    abbreviation: 'CTD',
    definition:
      'The internationally agreed format for organizing the quality, safety, and efficacy information in regulatory submissions.',
    regulation: 'ICH M4',
    category: 'Document Format',
  },
  {
    term: 'Electronic Common Technical Document',
    abbreviation: 'eCTD',
    definition:
      'The electronic version of the CTD used for electronic submissions to regulatory authorities worldwide.',
    regulation: 'ICH M8',
    category: 'Document Format',
  },
  {
    term: 'Case Report Form',
    abbreviation: 'CRF',
    definition:
      'A printed, optical, or electronic document designed to record protocol-required information for each trial subject during a clinical study.',
    regulation: 'ICH E6(R2)',
    category: 'Clinical Document',
  },
  {
    term: 'Clinical Study Report',
    abbreviation: 'CSR',
    definition:
      'A comprehensive document describing the methods, results, and analysis of a completed clinical trial, formatted per ICH E3 guidelines.',
    regulation: 'ICH E3',
    category: 'Clinical Document',
  },
  {
    term: "Investigator's Brochure",
    abbreviation: 'IB',
    definition:
      'A compilation of clinical and nonclinical data on an investigational product relevant to the study of the product in human subjects.',
    regulation: 'ICH E6(R2) Section 7',
    category: 'Clinical Document',
  },
  {
    term: 'Investigational Medicinal Product Dossier',
    abbreviation: 'IMPD',
    definition:
      'An EU-specific document submitted as part of a Clinical Trial Application containing quality, manufacturing, and nonclinical data on the investigational product.',
    regulation: 'EU Regulation 536/2014',
    category: 'Clinical Document',
  },
  {
    term: 'Clinical Evaluation Report',
    abbreviation: 'CER',
    definition:
      'A document that summarizes clinical evidence for a medical device to demonstrate conformity with relevant safety and performance requirements.',
    regulation: 'EU MDR 2017/745',
    category: 'Clinical Document',
  },
  {
    term: 'Periodic Safety Update Report',
    abbreviation: 'PSUR',
    definition:
      'A pharmacovigilance document providing a comprehensive safety evaluation of a marketed medicinal product at defined intervals.',
    regulation: 'ICH E2C(R2)',
    category: 'Safety Document',
  },

  // Oversight bodies
  {
    term: 'Data Safety Monitoring Board',
    abbreviation: 'DSMB',
    definition:
      'An independent committee that reviews data while a clinical trial is ongoing to ensure participant safety and study integrity.',
    regulation: '21 CFR 312.32',
    category: 'Oversight',
  },
  {
    term: 'Institutional Review Board',
    abbreviation: 'IRB',
    definition:
      'An independent ethics committee that reviews and approves biomedical research involving human subjects to protect their rights and welfare.',
    regulation: '21 CFR 56',
    category: 'Oversight',
  },

  // Safety terms
  {
    term: 'Adverse Event',
    abbreviation: 'AE',
    definition:
      'Any untoward medical occurrence in a patient administered a pharmaceutical product, whether or not it is related to the treatment.',
    regulation: 'ICH E2A',
    category: 'Safety',
  },
  {
    term: 'Serious Adverse Event',
    abbreviation: 'SAE',
    definition:
      'An adverse event that results in death, is life-threatening, requires hospitalization, causes persistent disability, or involves a congenital anomaly.',
    regulation: 'ICH E2A',
    category: 'Safety',
  },
  {
    term: 'Suspected Unexpected Serious Adverse Reaction',
    abbreviation: 'SUSAR',
    definition:
      'A serious adverse reaction that is both suspected to be related to the investigational product and is not consistent with the known risk profile.',
    regulation: 'ICH E2A / EU Directive 2001/20/EC',
    category: 'Safety',
  },
  {
    term: 'Risk Evaluation and Mitigation Strategy',
    abbreviation: 'REMS',
    definition:
      'A drug safety program required by the FDA to manage known or potential serious risks associated with a drug product.',
    regulation: '21 USC 355-1',
    category: 'Safety',
  },

  // PK/PD & ADME
  {
    term: 'Pharmacokinetics',
    abbreviation: 'PK',
    definition:
      'The study of how the body absorbs, distributes, metabolizes, and excretes a drug over time.',
    regulation: 'ICH E4/E5',
    category: 'Pharmacology',
  },
  {
    term: 'Pharmacodynamics',
    abbreviation: 'PD',
    definition:
      'The study of the biochemical and physiological effects of drugs on the body and the mechanisms of drug action.',
    regulation: 'ICH E4/E5',
    category: 'Pharmacology',
  },
  {
    term: 'Absorption, Distribution, Metabolism, and Excretion',
    abbreviation: 'ADME',
    definition:
      'The four processes that describe the disposition of a pharmaceutical compound within an organism from administration to elimination.',
    regulation: 'ICH M3(R2)',
    category: 'Pharmacology',
  },

  // Manufacturing & quality
  {
    term: 'Active Pharmaceutical Ingredient',
    abbreviation: 'API',
    definition:
      'The biologically active component of a drug product that produces the intended pharmacological effect.',
    regulation: 'ICH Q7',
    category: 'Manufacturing',
  },
  {
    term: 'Drug Master File',
    abbreviation: 'DMF',
    definition:
      'A submission to the FDA that provides confidential detailed information about facilities, processes, or articles used in manufacturing a drug.',
    regulation: '21 CFR 314.420',
    category: 'Manufacturing',
  },
  {
    term: 'Chemistry, Manufacturing, and Controls',
    abbreviation: 'CMC',
    definition:
      'The section of a regulatory submission that details the composition, manufacture, and quality control of the drug substance and product.',
    regulation: 'ICH Q8/Q9/Q10',
    category: 'Manufacturing',
  },
  {
    term: 'Quality by Design',
    abbreviation: 'QbD',
    definition:
      'A systematic approach to pharmaceutical development that begins with predefined objectives and emphasizes product and process understanding.',
    regulation: 'ICH Q8(R2)',
    category: 'Manufacturing',
  },
  {
    term: 'Process Analytical Technology',
    abbreviation: 'PAT',
    definition:
      'A system for designing, analyzing, and controlling manufacturing through timely measurements of critical quality and performance attributes.',
    regulation: 'FDA PAT Guidance (2004)',
    category: 'Manufacturing',
  },
  {
    term: 'Corrective and Preventive Action',
    abbreviation: 'CAPA',
    definition:
      'A quality system process for investigating, resolving, and preventing recurrence of nonconformities, deviations, and quality issues.',
    regulation: '21 CFR 820.90',
    category: 'Quality System',
  },
  {
    term: 'Out of Specification',
    abbreviation: 'OOS',
    definition:
      'A test result that falls outside the established acceptance criteria or specifications for a product or material.',
    regulation: '21 CFR 211.160',
    category: 'Quality System',
  },
  {
    term: 'Out of Trend',
    abbreviation: 'OOT',
    definition:
      'A stability or in-process result that is within specification but shows an atypical pattern compared to historical data.',
    regulation: 'FDA OOS Guidance',
    category: 'Quality System',
  },

  // Regulatory authorities
  {
    term: 'Food and Drug Administration',
    abbreviation: 'FDA',
    definition:
      'The United States federal agency responsible for protecting public health by regulating drugs, biologics, medical devices, food, and cosmetics.',
    regulation: '21 USC 301 et seq.',
    category: 'Regulatory Authority',
  },
  {
    term: 'European Medicines Agency',
    abbreviation: 'EMA',
    definition:
      'The EU agency responsible for the scientific evaluation, supervision, and safety monitoring of medicines in the European Union.',
    regulation: 'EC Regulation 726/2004',
    category: 'Regulatory Authority',
  },
  {
    term: 'Pharmaceuticals and Medical Devices Agency',
    abbreviation: 'PMDA',
    definition:
      'The Japanese regulatory authority responsible for ensuring the safety, efficacy, and quality of pharmaceuticals, medical devices, and regenerative products.',
    regulation: 'Japan PMD Act',
    category: 'Regulatory Authority',
  },
  {
    term: 'Therapeutic Goods Administration',
    abbreviation: 'TGA',
    definition:
      "Australia's regulatory authority for therapeutic goods including prescription medicines, vaccines, medical devices, and blood products.",
    regulation: 'Therapeutic Goods Act 1989',
    category: 'Regulatory Authority',
  },
  {
    term: 'Health Canada',
    abbreviation: 'Health Canada',
    definition:
      'The Canadian federal department responsible for national public health, including the regulation of drugs, medical devices, and natural health products.',
    regulation: 'Food and Drugs Act (Canada)',
    category: 'Regulatory Authority',
  },
  {
    term: 'Marketing Authorization Application',
    abbreviation: 'MAA',
    definition:
      'The application submitted to the EMA or national authority in the EU to gain marketing authorization for a medicinal product.',
    regulation: 'EC Regulation 726/2004',
    category: 'Regulatory Submission',
  },
  {
    term: 'Committee for Medicinal Products for Human Use',
    abbreviation: 'CHMP',
    definition:
      'The EMA committee responsible for providing opinions on questions concerning the authorization and supervision of medicinal products for human use.',
    regulation: 'EC Regulation 726/2004',
    category: 'Oversight',
  },

  // Regulations
  {
    term: 'Code of Federal Regulations',
    abbreviation: 'CFR',
    definition:
      'The codification of the general and permanent rules and regulations published in the Federal Register by U.S. federal agencies.',
    regulation: '44 USC 1510',
    category: 'Regulation',
  },
  {
    term: '21 CFR Part 11',
    abbreviation: '21 CFR Part 11',
    definition:
      'FDA regulations establishing criteria for acceptance of electronic records and electronic signatures as equivalent to paper records and handwritten signatures.',
    regulation: '21 CFR Part 11',
    category: 'Regulation',
  },

  // Clinical study design
  {
    term: 'Bioequivalence',
    abbreviation: 'BE',
    definition:
      'The demonstration that a generic drug product delivers the same amount of active ingredient at the same rate as the reference listed drug.',
    regulation: '21 CFR 320',
    category: 'Clinical Science',
  },
  {
    term: 'Bioavailability',
    abbreviation: 'BA',
    definition:
      'The rate and extent to which the active ingredient is absorbed from a drug product and becomes available at the site of action.',
    regulation: '21 CFR 320',
    category: 'Clinical Science',
  },
  {
    term: 'Intention to Treat',
    abbreviation: 'ITT',
    definition:
      'A strategy for analyzing clinical trial data where all randomized participants are included in the analysis regardless of protocol adherence or withdrawal.',
    regulation: 'ICH E9',
    category: 'Clinical Science',
  },
  {
    term: 'Per Protocol',
    abbreviation: 'PP',
    definition:
      'A clinical trial analysis that includes only participants who completed the study in compliance with the protocol, without major deviations.',
    regulation: 'ICH E9',
    category: 'Clinical Science',
  },

  // Trial phases
  {
    term: 'Phase I',
    abbreviation: 'Phase I',
    definition:
      'The first stage of clinical testing in humans, focused on safety, tolerability, pharmacokinetics, and pharmacodynamics in a small group of healthy volunteers.',
    regulation: '21 CFR 312',
    category: 'Clinical Phase',
  },
  {
    term: 'Phase II',
    abbreviation: 'Phase II',
    definition:
      'Clinical trials conducted to evaluate efficacy and side effects of a drug in patients with the target condition, and to determine optimal dosing.',
    regulation: '21 CFR 312',
    category: 'Clinical Phase',
  },
  {
    term: 'Phase III',
    abbreviation: 'Phase III',
    definition:
      'Large-scale clinical trials designed to confirm efficacy, monitor adverse reactions, and collect safety data sufficient for regulatory submission.',
    regulation: '21 CFR 312',
    category: 'Clinical Phase',
  },
  {
    term: 'Phase IV',
    abbreviation: 'Phase IV',
    definition:
      'Post-marketing surveillance studies conducted after a drug receives regulatory approval, focused on long-term safety and real-world effectiveness.',
    regulation: '21 CFR 312 / 314',
    category: 'Clinical Phase',
  },
];

// ---------------------------------------------------------------------------
// Tooltip DOM helpers
// ---------------------------------------------------------------------------

let activeTooltip: HTMLElement | null = null;

function removeTooltip(): void {
  if (activeTooltip && activeTooltip.parentNode) {
    activeTooltip.parentNode.removeChild(activeTooltip);
  }
  activeTooltip = null;
}

function createTooltip(entry: GlossaryEntry, rect: DOMRect): HTMLElement {
  removeTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'glossary-tooltip';
  tooltip.setAttribute('role', 'tooltip');

  // Category color mapping
  const categoryColors: Record<string, string> = {
    'Regulatory Submission': '#2563eb',
    'Medical Devices': '#7c3aed',
    'Standards Body': '#0891b2',
    'Quality Standard': '#059669',
    'Document Format': '#d97706',
    'Clinical Document': '#ea580c',
    'Safety Document': '#dc2626',
    Oversight: '#4f46e5',
    Safety: '#dc2626',
    Pharmacology: '#7c3aed',
    Manufacturing: '#0d9488',
    'Quality System': '#059669',
    'Regulatory Authority': '#1d4ed8',
    Regulation: '#64748b',
    'Clinical Science': '#8b5cf6',
    'Clinical Phase': '#6366f1',
  };

  const badgeColor = categoryColors[entry.category] || '#64748b';

  tooltip.innerHTML = `
    <div style="
      position: fixed;
      z-index: 99999;
      max-width: 380px;
      min-width: 260px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.12), 0 4px 6px -2px rgba(0,0,0,0.05);
      padding: 14px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #334155;
      pointer-events: auto;
    " class="glossary-tooltip-inner">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="
          font-weight: 700;
          font-size: 14px;
          color: #0f172a;
        ">${escapeHtml(entry.abbreviation)}</span>
        ${
          entry.abbreviation !== entry.term
            ? `<span style="
                font-size: 12px;
                color: #64748b;
              ">\u2014 ${escapeHtml(entry.term)}</span>`
            : ''
        }
      </div>
      <p style="margin: 0 0 10px 0; color: #475569;">
        ${escapeHtml(entry.definition)}
      </p>
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span style="
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          background: ${badgeColor}15;
          color: ${badgeColor};
          border: 1px solid ${badgeColor}30;
        ">${escapeHtml(entry.regulation)}</span>
        <span style="
          display: inline-block;
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 4px;
          background: #f1f5f9;
          color: #64748b;
        ">${escapeHtml(entry.category)}</span>
      </div>
    </div>
  `;

  document.body.appendChild(tooltip);

  // Position the inner element near the term
  const inner = tooltip.querySelector('.glossary-tooltip-inner') as HTMLElement;
  if (inner) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + 6;
    let left = rect.left;

    // If it would overflow right, shift left
    if (left + 380 > viewportWidth) {
      left = viewportWidth - 395;
    }
    if (left < 8) left = 8;

    // If it would overflow bottom, show above
    if (top + 200 > viewportHeight) {
      top = rect.top - 10;
      inner.style.transform = 'translateY(-100%)';
    }

    inner.style.left = `${left}px`;
    inner.style.top = `${top}px`;
  }

  // Auto-dismiss on mouse leave from tooltip
  tooltip.addEventListener('mouseleave', removeTooltip);

  activeTooltip = tooltip;
  return tooltip;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ---------------------------------------------------------------------------
// Term matching helpers
// ---------------------------------------------------------------------------

interface TermMatch {
  from: number;
  to: number;
  entry: GlossaryEntry;
}

function buildTermRegex(entries: GlossaryEntry[]): RegExp | null {
  if (entries.length === 0) return null;

  // Collect all matchable strings (abbreviation + full term) and sort
  // longest-first so the regex matches greedily.
  const patterns: string[] = [];
  for (const e of entries) {
    patterns.push(escapeRegExp(e.abbreviation));
    if (e.abbreviation !== e.term) {
      patterns.push(escapeRegExp(e.term));
    }
  }
  // Sort longest first for greedy matching
  patterns.sort((a, b) => b.length - a.length);

  // Word-boundary match; the `g` flag allows multiple matches.
  return new RegExp(`\\b(?:${patterns.join('|')})\\b`, 'gi');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Map from lowercase match text -> GlossaryEntry for fast lookup. */
function buildLookup(entries: GlossaryEntry[]): Map<string, GlossaryEntry> {
  const map = new Map<string, GlossaryEntry>();
  for (const e of entries) {
    map.set(e.abbreviation.toLowerCase(), e);
    if (e.abbreviation !== e.term) {
      map.set(e.term.toLowerCase(), e);
    }
  }
  return map;
}

function findTerms(
  doc: { textContent: string; nodesBetween: (from: number, to: number, callback: (node: { isText: boolean; text?: string }, pos: number) => boolean | void) => void; content: { size: number } },
  regex: RegExp,
  lookup: Map<string, GlossaryEntry>,
): TermMatch[] {
  const matches: TermMatch[] = [];

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText || !node.text) return;

    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(node.text)) !== null) {
      const entry = lookup.get(m[0].toLowerCase());
      if (entry) {
        matches.push({
          from: pos + m.index,
          to: pos + m.index + m[0].length,
          entry,
        });
      }
    }
  });

  return matches;
}

// ---------------------------------------------------------------------------
// ProseMirror Plugin
// ---------------------------------------------------------------------------

const glossaryPluginKey = new PluginKey('glossaryTooltip');

function createGlossaryPlugin(allTerms: GlossaryEntry[]): Plugin {
  const regex = buildTermRegex(allTerms);
  const lookup = buildLookup(allTerms);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return new Plugin({
    key: glossaryPluginKey,

    state: {
      init(_, state) {
        if (!regex) return DecorationSet.empty;
        return buildDecorations(state.doc, regex, lookup);
      },
      apply(tr, oldDecos, _oldState, newState) {
        if (!regex) return DecorationSet.empty;
        // Only recalculate when the document actually changed
        if (!tr.docChanged) return oldDecos;
        // Return mapped (stale but fast) set immediately; the view plugin
        // will schedule a debounced full rebuild via metadata.
        return oldDecos.map(tr.mapping, tr.doc);
      },
    },

    props: {
      decorations(state) {
        return glossaryPluginKey.getState(state) as DecorationSet;
      },
    },

    view(editorView) {
      // Bind hover events to the editor DOM
      const handleMouseOver = (event: Event) => {
        const target = event.target as HTMLElement;
        if (!target || !target.classList?.contains('glossary-term')) return;

        const termKey = target.getAttribute('data-glossary-key');
        if (!termKey) return;

        const entry = lookup.get(termKey.toLowerCase());
        if (!entry) return;

        const rect = target.getBoundingClientRect();
        createTooltip(entry, rect);
      };

      const handleMouseOut = (event: Event) => {
        const target = event.target as HTMLElement;
        if (!target || !target.classList?.contains('glossary-term')) return;

        // Small delay so user can move to the tooltip itself
        setTimeout(() => {
          if (activeTooltip) {
            const tooltipRect = activeTooltip.querySelector('.glossary-tooltip-inner')?.getBoundingClientRect();
            // Keep tooltip if the mouse is currently over it
            if (tooltipRect) {
              // We rely on the tooltip's own mouseleave to dismiss
              return;
            }
          }
          removeTooltip();
        }, 150);
      };

      editorView.dom.addEventListener('mouseover', handleMouseOver);
      editorView.dom.addEventListener('mouseout', handleMouseOut);

      // Schedule a full rebuild after debounce whenever the doc changes
      const scheduleRebuild = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!regex) return;
          const { state } = editorView;
          const decos = buildDecorations(state.doc, regex, lookup);
          const tr = state.tr.setMeta(glossaryPluginKey, decos);
          editorView.dispatch(tr);
        }, 2000);
      };

      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) {
            scheduleRebuild();
          }
        },
        destroy() {
          editorView.dom.removeEventListener('mouseover', handleMouseOver);
          editorView.dom.removeEventListener('mouseout', handleMouseOut);
          if (debounceTimer) clearTimeout(debounceTimer);
          removeTooltip();
        },
      };
    },
  });
}

function buildDecorations(
  doc: Parameters<typeof findTerms>[0],
  regex: RegExp,
  lookup: Map<string, GlossaryEntry>,
): DecorationSet {
  const matches = findTerms(doc, regex, lookup);
  const decorations = matches.map((m) =>
    Decoration.inline(m.from, m.to, {
      class: 'glossary-term',
      style:
        'border-bottom: 1px dotted #94a3b8; cursor: help; text-decoration: none;',
      'data-glossary-key': m.entry.abbreviation,
    }),
  );
  return DecorationSet.create(doc as Parameters<typeof DecorationSet.create>[0], decorations);
}

// ---------------------------------------------------------------------------
// TipTap Extension
// ---------------------------------------------------------------------------

export const GlossaryTooltip = Extension.create<GlossaryOptions>({
  name: 'glossaryTooltip',

  addOptions() {
    return {
      enabled: true,
      customTerms: [],
    };
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) return [];

    const allTerms = [...BUILT_IN_GLOSSARY, ...this.options.customTerms];
    return [createGlossaryPlugin(allTerms)];
  },
});

export default GlossaryTooltip;
