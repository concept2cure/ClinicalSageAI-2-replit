/**
 * FDA meeting briefing-book assembler (Pre-IND / Type A / B / C).
 *
 * The audit flagged meeting management as thin: a Q-submission schema existed
 * but there was no briefing-package assembler. This builds the structured
 * briefing-book document model per FDA's meeting guidance — product background,
 * nonclinical / clinical / CMC summaries, the proposed development plan, a
 * protocol synopsis, and (the core of any meeting package) the numbered
 * questions for FDA with the sponsor's position on each.
 *
 * Pure / deterministic. Render it to a navigable PDF via renderBriefingBookPdf
 * (ind-document-renderer). Gaps list the required sections still empty.
 */

export type MeetingType = 'pre_ind' | 'type_a' | 'type_b' | 'type_c';

export interface BriefingQuestion {
  /** 1-based question number as it will appear to FDA. */
  number: number;
  /** Short topic label (e.g. "Nonclinical package", "Phase 1 design"). */
  topic: string;
  /** The question posed to FDA. */
  question: string;
  /** The sponsor's position / proposed approach for this question. */
  sponsorPosition?: string;
}

export interface BriefingBookInput {
  productName: string;
  indication: string;
  meetingType: MeetingType;
  /** Proposed phase of the program the meeting concerns. */
  proposedPhase?: string;
  /** Background, mechanism, and development rationale. */
  productBackground?: string;
  /** Summary of available nonclinical (pharmacology / PK / toxicology) data. */
  nonclinicalSummary?: string;
  /** Summary of any available clinical data. */
  clinicalSummary?: string;
  /** CMC / quality summary. */
  cmcSummary?: string;
  /** Proposed clinical development plan. */
  proposedClinicalPlan?: string;
  /** Synopsis of the proposed first protocol. */
  protocolSynopsis?: string;
  /** Prior regulatory interactions / history. */
  regulatoryHistory?: string;
  /** Numbered questions for FDA with the sponsor's position. */
  questions: BriefingQuestion[];
}

export interface BriefingBookSection {
  key: string;
  heading: string;
  body: string;
  /** Whether the section currently has substantive content. */
  complete: boolean;
  /** Whether an empty section blocks a usable package. */
  required: boolean;
}

export interface BriefingBookGap {
  sectionKey: string;
  heading: string;
  message: string;
}

export interface BriefingBookModel {
  reportType: 'FDA_BRIEFING_BOOK';
  meetingType: MeetingType;
  productName: string;
  indication: string;
  sections: BriefingBookSection[];
  gaps: BriefingBookGap[];
  questionCount: number;
}

const MEETING_LABEL: Record<MeetingType, string> = {
  pre_ind: 'Pre-IND Meeting',
  type_a: 'Type A Meeting',
  type_b: 'Type B Meeting',
  type_c: 'Type C Meeting',
};

function section(
  key: string,
  heading: string,
  body: string | undefined,
  required: boolean,
): BriefingBookSection {
  const text = (body ?? '').trim();
  return { key, heading, body: text, complete: text.length > 0, required };
}

/** Render the numbered questions block (the core of the package). */
function questionsBody(questions: BriefingQuestion[]): string {
  if (questions.length === 0) return '';
  return questions
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((q) => {
      const lines = [`Question ${q.number} — ${q.topic}`, q.question.trim()];
      if (q.sponsorPosition && q.sponsorPosition.trim().length > 0) {
        lines.push(`Sponsor position: ${q.sponsorPosition.trim()}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Assemble the briefing-book model. Deterministic; `gaps` lists required
 * sections (and the questions block) that are still empty.
 */
export function assembleBriefingBook(input: BriefingBookInput): BriefingBookModel {
  const meetingLabel = MEETING_LABEL[input.meetingType];
  const sections: BriefingBookSection[] = [
    section(
      'cover',
      '1. Administrative Information',
      `${meetingLabel} briefing document.\nProduct: ${input.productName}\nIndication: ${input.indication}` +
        (input.proposedPhase ? `\nProposed phase: ${input.proposedPhase}` : ''),
      true,
    ),
    section('background', '2. Product Background and Development Rationale', input.productBackground, true),
    section('nonclinical', '3. Summary of Nonclinical Data', input.nonclinicalSummary, true),
    section('clinical', '4. Summary of Clinical Data', input.clinicalSummary, false),
    section('cmc', '5. CMC / Quality Summary', input.cmcSummary, false),
    section('plan', '6. Proposed Clinical Development Plan', input.proposedClinicalPlan, true),
    section('protocol', '7. Proposed Protocol Synopsis', input.protocolSynopsis, false),
    section('history', '8. Regulatory History', input.regulatoryHistory, false),
    section('questions', '9. Questions for FDA', questionsBody(input.questions), true),
  ];

  const gaps: BriefingBookGap[] = sections
    .filter((s) => s.required && !s.complete)
    .map((s) => ({
      sectionKey: s.key,
      heading: s.heading,
      message:
        s.key === 'questions'
          ? 'A meeting package must include at least one numbered question for FDA.'
          : `Required section "${s.heading}" has no content.`,
    }));

  return {
    reportType: 'FDA_BRIEFING_BOOK',
    meetingType: input.meetingType,
    productName: input.productName,
    indication: input.indication,
    sections,
    gaps,
    questionCount: input.questions.length,
  };
}
