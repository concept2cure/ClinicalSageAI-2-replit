/**
 * Letter of Authorization / Right of Reference — eCTD Module 1.4.1 (21 CFR 314.420).
 *
 * When an IND relies on information held in another file — a Drug Master File
 * (DMF) for the drug substance, or another IND/NDA/BLA — the holder of that file
 * must grant the IND sponsor a right of reference via a Letter of Authorization
 * (LOA). FDA cannot review the referenced file in support of the IND without it.
 *
 * This pure (no-DB) service assembles the LOA document model from the supplied
 * particulars, reports the fields still missing (so a reviewer sees what is
 * incomplete before signature), and emits the eCTD placement intent (m1.4.1) so
 * the LOA can be filed as a leaf. Pure / deterministic.
 *
 * Regulatory reference: 21 CFR 314.420 (Drug Master Files) — a right of reference
 * is granted by an authorization letter; eCTD US regional Module 1.4.1 (Letters
 * of Authorization / Cross-Reference) and 1.4.2 (Statement of Right of Reference).
 *
 * @module server/services/ind-lifecycle/ind-loa-service
 */

/** The kind of file the LOA authorizes the sponsor to reference. */
export type ReferencedFileType = 'DMF' | 'IND' | 'NDA' | 'BLA';

export interface LetterOfAuthorizationInput {
  /** Type of the file being referenced. */
  referencedFileType: ReferencedFileType;
  /** The referenced file's number (e.g. DMF number, IND number). */
  referencedFileNumber: string;
  /** Holder of the referenced file (the party granting the right of reference). */
  holderName: string;
  holderAddress?: string;
  /** The IND sponsor being authorized to reference the file. */
  authorizedPartyName: string;
  /** Subject of the reference (drug substance / product / intermediate). */
  subjectName: string;
  /** The specific sections / information authorized for reference (defaults to "in its entirety"). */
  authorizedSections?: string[];
  /** The IND the reference supports (the receiving application), if known. */
  supportingIndNumber?: string;
  /** Signatory on behalf of the holder. */
  signatoryName: string;
  signatoryTitle?: string;
  /** ISO date of signature. */
  signatureDate?: string;
}

export interface LoaSection {
  key: string;
  heading: string;
  body: string;
}

export interface LetterOfAuthorizationModel {
  documentType: 'LETTER_OF_AUTHORIZATION';
  referencedFileType: ReferencedFileType;
  referencedFileNumber: string;
  sections: LoaSection[];
  /** Required particulars that were not supplied. */
  gaps: string[];
}

/** A planned eCTD leaf for the LOA (m1.4.1). */
export interface LoaLeafIntent {
  sectionCode: string;
  title: string;
  lifecycleOp: 'new';
  documentType: 'letter_of_authorization';
}

const REQUIRED_FIELDS: Array<{ key: keyof LetterOfAuthorizationInput; label: string }> = [
  { key: 'referencedFileType', label: 'referenced file type' },
  { key: 'referencedFileNumber', label: 'referenced file number' },
  { key: 'holderName', label: 'file holder name' },
  { key: 'authorizedPartyName', label: 'authorized party (IND sponsor)' },
  { key: 'subjectName', label: 'subject (drug substance/product)' },
  { key: 'signatoryName', label: 'signatory name' },
];

function present(v: unknown): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : v !== undefined && v !== null;
}

/**
 * Assemble the Letter of Authorization document model + gap list. Pure.
 */
export function assembleLetterOfAuthorization(input: LetterOfAuthorizationInput): LetterOfAuthorizationModel {
  const gaps = REQUIRED_FIELDS.filter((f) => !present(input[f.key])).map((f) => f.label);

  const scope =
    input.authorizedSections && input.authorizedSections.length > 0
      ? input.authorizedSections.join('; ')
      : 'the file in its entirety';

  const fileLabel = `${input.referencedFileType} ${input.referencedFileNumber}`.trim();

  const sections: LoaSection[] = [
    {
      key: 'reference',
      heading: 'Reference',
      body: [
        `Re: ${fileLabel} — ${input.subjectName || '[subject to be specified]'}.`,
        input.supportingIndNumber ? `In support of IND ${input.supportingIndNumber}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      key: 'authorization',
      heading: 'Authorization',
      body: [
        `${input.holderName || '[holder]'}${input.holderAddress ? `, ${input.holderAddress},` : ''}`,
        `as holder of ${fileLabel}, hereby authorizes ${input.authorizedPartyName || '[authorized party]'}`,
        `and the U.S. Food and Drug Administration to reference ${scope}`,
        `in support of the above-referenced application. The information referenced may be relied upon`,
        `by FDA in its review of the sponsor's submission.`,
      ].join(' '),
    },
    {
      key: 'scope',
      heading: 'Authorized Scope',
      body: `Authorized for reference: ${scope}.`,
    },
    {
      key: 'signature',
      heading: 'Signature',
      body: [
        `Authorized by: ${input.signatoryName || '[signatory]'}`,
        input.signatoryTitle ? `, ${input.signatoryTitle}` : '',
        input.signatureDate ? `\nDate: ${input.signatureDate}` : '',
      ].join(''),
    },
  ];

  return {
    documentType: 'LETTER_OF_AUTHORIZATION',
    referencedFileType: input.referencedFileType,
    referencedFileNumber: input.referencedFileNumber,
    sections,
    gaps,
  };
}

/**
 * Build the eCTD placement intent for the LOA (US regional Module 1.4.1).
 * Pure / deterministic.
 */
export function buildLoaLeafIntent(model: LetterOfAuthorizationModel): LoaLeafIntent {
  return {
    sectionCode: 'm1.4.1',
    title: `Letter of Authorization — ${model.referencedFileType} ${model.referencedFileNumber}`,
    lifecycleOp: 'new',
    documentType: 'letter_of_authorization',
  };
}
