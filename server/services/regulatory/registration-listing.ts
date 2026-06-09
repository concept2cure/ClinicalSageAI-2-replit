/**
 * Establishment registration, device listing, and Declaration of Conformity.
 *
 * Pure and deterministic. Closes the audit gap "license/registration & listing
 * — absent" and "Declaration of Conformity generation — absent". The platform
 * validated UDI syntax but did not model FDA establishment registration / device
 * listing, EU actor registration (SRN) / Basic UDI-DI, or generate an EU DoC.
 *
 * Backbone:
 *   - 21 CFR 807 Subpart B — establishment registration & device listing (FDA)
 *   - IVDR 2017/746 Art. 26-28 — UDI / EUDAMED device registration
 *   - IVDR Art. 28 — actor registration (Single Registration Number, SRN)
 *   - IVDR Art. 17 + Annex IV — EU Declaration of Conformity
 */

// ─────────────────────────────────────────────────────────────────────────────
// FDA establishment registration + device listing readiness
// ─────────────────────────────────────────────────────────────────────────────

export interface FdaRegistrationInput {
  ownerOperatorAccount: boolean;
  establishmentRegistered: boolean;
  /** Annual registration user fee paid for the current FY. */
  annualFeePaid: boolean;
  deviceListed: boolean;
  /** Premarket clearance/approval/exemption is in place for the listed device. */
  premarketStatusEstablished: boolean;
  /** US Agent designated (required for foreign establishments). */
  usAgentDesignated: boolean;
  isForeignEstablishment: boolean;
}

export interface FdaRegistrationResult {
  compliant: boolean;
  gaps: string[];
}

/** Assess FDA establishment-registration + device-listing readiness (21 CFR 807). */
export function assessFdaRegistration(input: FdaRegistrationInput): FdaRegistrationResult {
  const gaps: string[] = [];
  if (!input.ownerOperatorAccount) gaps.push('No FURLS owner/operator account.');
  if (!input.establishmentRegistered) gaps.push('Establishment is not registered (21 CFR 807.20).');
  if (!input.annualFeePaid) gaps.push('Annual establishment registration fee not paid.');
  if (!input.deviceListed) gaps.push('Device is not listed (21 CFR 807.25).');
  if (!input.premarketStatusEstablished) {
    gaps.push('Premarket clearance/approval/exemption not established for the listed device.');
  }
  if (input.isForeignEstablishment && !input.usAgentDesignated) {
    gaps.push('Foreign establishment without a designated U.S. Agent (21 CFR 807.40).');
  }
  return { compliant: gaps.length === 0, gaps };
}

// ─────────────────────────────────────────────────────────────────────────────
// EU actor + device registration readiness (EUDAMED)
// ─────────────────────────────────────────────────────────────────────────────

export interface EuRegistrationInput {
  /** Single Registration Number assigned by EUDAMED. */
  srnAssigned: boolean;
  basicUdiDiAssigned: boolean;
  udiDiAssigned: boolean;
  /** Authorised Representative designated (for non-EU manufacturers). */
  authorisedRepresentativeDesignated: boolean;
  isNonEuManufacturer: boolean;
  deviceRegisteredInEudamed: boolean;
  /** For Class B/C/D: notified-body certificate in place. */
  riskClass: 'A' | 'B' | 'C' | 'D';
  notifiedBodyCertificateInPlace: boolean;
}

export interface EuRegistrationResult {
  compliant: boolean;
  notifiedBodyRequired: boolean;
  gaps: string[];
}

/** Assess EU IVDR actor + device registration readiness (Art. 26-28). */
export function assessEuRegistration(input: EuRegistrationInput): EuRegistrationResult {
  const notifiedBodyRequired = input.riskClass !== 'A';
  const gaps: string[] = [];
  if (!input.srnAssigned) gaps.push('No Single Registration Number (SRN) assigned in EUDAMED.');
  if (!input.basicUdiDiAssigned) gaps.push('No Basic UDI-DI assigned.');
  if (!input.udiDiAssigned) gaps.push('No UDI-DI assigned.');
  if (input.isNonEuManufacturer && !input.authorisedRepresentativeDesignated) {
    gaps.push('Non-EU manufacturer without an EU Authorised Representative (Art. 11).');
  }
  if (!input.deviceRegisteredInEudamed) gaps.push('Device not registered in EUDAMED.');
  if (notifiedBodyRequired && !input.notifiedBodyCertificateInPlace) {
    gaps.push(`Class ${input.riskClass} device requires a notified-body certificate.`);
  }
  return { compliant: gaps.length === 0, notifiedBodyRequired, gaps };
}

// ─────────────────────────────────────────────────────────────────────────────
// EU Declaration of Conformity (Annex IV)
// ─────────────────────────────────────────────────────────────────────────────

export interface DoCInput {
  manufacturerName: string;
  manufacturerAddress: string;
  srn?: string;
  productName: string;
  basicUdiDi: string;
  riskClass: 'A' | 'B' | 'C' | 'D';
  /** Notified body number (required for Class B/C/D). */
  notifiedBodyNumber?: string;
  /** Certificate number issued by the notified body. */
  certificateNumber?: string;
  conformityRoute: string; // e.g. 'Annex IX'
  /** Harmonised standards / CS applied. */
  standardsApplied: string[];
}

export interface DoCResult {
  valid: boolean;
  missing: string[];
  declaration: Record<string, unknown> | null;
}

/** Generate an EU IVDR Declaration of Conformity (Annex IV). */
export function generateDeclarationOfConformity(input: DoCInput): DoCResult {
  const missing: string[] = [];
  if (!input.manufacturerName) missing.push('manufacturerName');
  if (!input.manufacturerAddress) missing.push('manufacturerAddress');
  if (!input.productName) missing.push('productName');
  if (!input.basicUdiDi) missing.push('basicUdiDi');
  if (!input.conformityRoute) missing.push('conformityRoute');

  // Class B/C/D require notified-body identification on the DoC.
  if (input.riskClass !== 'A') {
    if (!input.notifiedBodyNumber) missing.push('notifiedBodyNumber');
    if (!input.certificateNumber) missing.push('certificateNumber');
  }

  if (missing.length > 0) {
    return { valid: false, missing, declaration: null };
  }

  return {
    valid: true,
    missing,
    declaration: {
      regulation: 'EU IVDR 2017/746',
      annex: 'Annex IV',
      manufacturer: { name: input.manufacturerName, address: input.manufacturerAddress, srn: input.srn ?? null },
      product: { name: input.productName, basicUdiDi: input.basicUdiDi, riskClass: input.riskClass },
      conformityAssessment: {
        route: input.conformityRoute,
        notifiedBody: input.riskClass !== 'A'
          ? { number: input.notifiedBodyNumber, certificate: input.certificateNumber }
          : null,
      },
      standardsApplied: input.standardsApplied,
      statement:
        'This declaration of conformity is issued under the sole responsibility of the manufacturer.',
    },
  };
}
