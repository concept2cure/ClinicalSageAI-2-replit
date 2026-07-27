/**
 * AnA onboarding welcome — P1 (assist-only) content model.
 *
 * The scripted-but-live welcome AnA shows a new client on first run. It is a
 * DETERMINISTIC UI greeting in AnA's voice (not fabricated data): a client-type
 * aware line plus a few "starter" prompts. Clicking a starter sends its `prompt`
 * to the real AnA conversation (/api/ana-ri/stream) — so the copy is scripted,
 * the response is live. Nothing here is presented as data; it is onboarding UX.
 *
 * P2/P3 (upload → suggestions → governed auto-fill) build on this; P1 does no
 * data entry, so there is nothing to fabricate or persist.
 *
 * The client type comes from the shell `segment` (mirrors organizations.client_type
 * set at onboarding). Matching is case-insensitive and falls back to a neutral
 * greeting so an unknown/again-renamed segment never yields an empty welcome.
 *
 * @module client/src/concept2cure/v2/onboardingWelcome
 */

export interface WelcomeStarter {
  /** Pill label shown to the client. */
  label: string;
  /** The message actually sent to AnA when the starter is clicked (live turn). */
  prompt: string;
  /** Optional icon key resolved by the rail; falls back to a neutral icon. */
  iconKey?: 'file' | 'flask' | 'search' | 'clip' | 'globe' | 'sparkles' | 'shieldCheck' | 'upload';
}

export interface OnboardingWelcome {
  /** The greeting line, in AnA's voice, adapted to the client type. */
  greeting: string;
  /** Short sub-line describing what AnA can do to help set up. */
  subline: string;
  /** 3–4 client-type-aware starter prompts. */
  starters: WelcomeStarter[];
}

/** Normalize a segment/client-type string to a known family key. */
function familyOf(segment: string | null | undefined): 'biotech' | 'pharma' | 'device' | 'diagnostics' | 'cro' | 'generic' {
  const s = String(segment ?? '').toLowerCase();
  if (/biotech|bio\b/.test(s)) return 'biotech';
  if (/pharma|drug|nda|small.?molecule/.test(s)) return 'pharma';
  if (/device|medtech|med.?device|510|pma/.test(s)) return 'device';
  if (/diagnostic|ivd|companion|assay|clia/.test(s)) return 'diagnostics';
  if (/\bcro\b|contract.?research|sponsor.?services/.test(s)) return 'cro';
  return 'generic';
}

/**
 * The always-offered upload starter — the bridge to P2/P3. In P1 it opens a
 * conversation about what AnA can extract; it does NOT perform any data entry.
 */
const UPLOAD_STARTER: WelcomeStarter = {
  label: 'Upload a document to start',
  prompt:
    'I have documents (a prior filing, protocol, company profile, or spec). What can you read from them to help set up my workspace? Walk me through it — I’ll review before anything is saved.',
  iconKey: 'upload',
};

/** Per-family greeting + the type-specific starters (upload starter appended). */
const FAMILIES: Record<
  ReturnType<typeof familyOf>,
  { label: string; subline: string; starters: WelcomeStarter[] }
> = {
  biotech: {
    label: 'biotech program',
    subline: 'I can help you stand up your first IND-enabling program and keep it submission-ready.',
    starters: [
      { label: 'Set up my first IND program', prompt: 'Help me set up my first IND-enabling program. Ask me what you need — sponsor, molecule, indication, target dates — and we’ll fill it in together.', iconKey: 'flask' },
      { label: 'Plan a clinical protocol', prompt: 'Walk me through planning a clinical protocol for my lead program — design, endpoints, and what a strong first draft needs.', iconKey: 'file' },
    ],
  },
  pharma: {
    label: 'drug program',
    subline: 'I can help you organize your program toward an NDA/BLA and keep the dossier consistent.',
    starters: [
      { label: 'Set up a submission program', prompt: 'Help me set up a program aimed at an NDA/BLA. Ask me for the drug, indication, and pathway and we’ll capture it.', iconKey: 'clip' },
      { label: 'Draft product labeling', prompt: 'Walk me through drafting product labeling for my program and how you keep it consistent with the rest of the dossier.', iconKey: 'globe' },
    ],
  },
  device: {
    label: 'medical device program',
    subline: 'I can help you start a 510(k) or PMA and set up your design controls.',
    starters: [
      { label: 'Start a 510(k) submission', prompt: 'Help me start a 510(k). Ask me about the device, intended use, and predicate strategy, and we’ll set it up.', iconKey: 'file' },
      { label: 'Find predicate devices', prompt: 'Help me find and compare candidate predicate devices for my 510(k).', iconKey: 'search' },
    ],
  },
  diagnostics: {
    label: 'diagnostics program',
    subline: 'I can help you set up an IVD performance study and organize your submission or CLIA path.',
    starters: [
      { label: 'Set up an IVD performance study', prompt: 'Help me set up an IVD performance study. Ask me about the assay, intended use, and comparator, and we’ll capture it.', iconKey: 'flask' },
      { label: 'Plan my regulatory pathway', prompt: 'Walk me through the regulatory pathway options for my diagnostic (510(k)/De Novo/PMA/CLIA LDT) and what each needs.', iconKey: 'globe' },
    ],
  },
  cro: {
    label: 'CRO workspace',
    subline: 'I can help you set up a client workspace and see everything in one portfolio.',
    starters: [
      { label: 'Set up a client workspace', prompt: 'Help me set up a workspace for one of my clients — the client, their programs, and who should have access.', iconKey: 'shieldCheck' },
      { label: 'Show my portfolio', prompt: 'Show me how to see all of my clients’ programs in one portfolio view.', iconKey: 'search' },
    ],
  },
  generic: {
    label: 'workspace',
    subline: 'I can help you set up your first program and keep it submission-ready.',
    starters: [
      { label: 'Set up my first program', prompt: 'Help me set up my first program. Ask me what you need and we’ll fill it in together.', iconKey: 'flask' },
      { label: 'Explain what I can do here', prompt: 'Give me a quick, plain-language tour of what I can do in this workspace and where to start.', iconKey: 'sparkles' },
    ],
  },
};

/**
 * Build the first-run welcome for a client of the given `segment`/type. `name`
 * is the signed-in user's first name (or a neutral fallback the caller supplies).
 */
export function welcomeFor(segment: string | null | undefined, name: string): OnboardingWelcome {
  const fam = familyOf(segment);
  const f = FAMILIES[fam];
  const who = name?.trim() ? name.trim() : 'there';
  return {
    greeting: `Welcome, ${who} — let’s get your ${f.label} set up.`,
    subline: f.subline,
    // Type-specific starters first, then the always-available upload bridge to P2/P3.
    starters: [...f.starters, UPLOAD_STARTER],
  };
}
