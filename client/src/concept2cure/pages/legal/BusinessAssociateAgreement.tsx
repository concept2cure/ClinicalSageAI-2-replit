/**
 * @fileoverview Business Associate Agreement (BAA)
 * HIPAA-compliant BAA for Concept2Cure platform.
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const BusinessAssociateAgreement: React.FC = () => (
  <LegalPageLayout title="Business Associate Agreement" lastUpdated="March 19, 2026">
    <h2>1. Purpose</h2>
    <p>
      This Business Associate Agreement ("BAA") is entered into between the subscribing organization ("Covered
      Entity") and Concept2Cure, Inc. ("Business Associate") to comply with the Health Insurance Portability and
      Accountability Act of 1996 ("HIPAA"), the Health Information Technology for Economic and Clinical Health Act
      ("HITECH Act"), and their implementing regulations (collectively, "HIPAA Rules").
    </p>

    <h2>2. Definitions</h2>
    <p>
      "Protected Health Information" ("PHI"), "Electronic Protected Health Information" ("ePHI"), "Business
      Associate," "Covered Entity," "Breach," and "Security Incident" have the meanings ascribed to them in the
      HIPAA Rules.
    </p>

    <h2>3. Obligations of Business Associate</h2>
    <p>Business Associate agrees to:</p>
    <ul>
      <li>Not use or disclose PHI except as permitted by this BAA or required by law</li>
      <li>Implement administrative, physical, and technical safeguards to protect ePHI</li>
      <li>Report any Security Incident or Breach to Covered Entity without unreasonable delay and no later than 60 days after discovery</li>
      <li>Ensure that any subcontractors who access PHI agree to the same restrictions and conditions</li>
      <li>Make PHI available for access requests by individuals within 30 days</li>
      <li>Make PHI available for amendment and incorporate amendments as directed</li>
      <li>Maintain and make available information required for an accounting of disclosures</li>
      <li>Make internal practices and records available to the Secretary of HHS for compliance determination</li>
    </ul>

    <h2>4. Permitted Uses and Disclosures</h2>
    <p>Business Associate may use or disclose PHI solely for:</p>
    <ul>
      <li>Performing Platform services as specified in the Terms of Service</li>
      <li>Proper management and administration of the Business Associate</li>
      <li>Providing data aggregation services relating to the Covered Entity's healthcare operations</li>
      <li>Complying with legal obligations</li>
    </ul>

    <h2>5. Security Standards</h2>
    <p>Business Associate shall implement safeguards including:</p>
    <ul>
      <li>Access controls: unique user identification, automatic logoff, encryption</li>
      <li>Audit controls: immutable logging of all access to PHI (21 CFR Part 11 compliant)</li>
      <li>Integrity controls: mechanisms to authenticate ePHI and protect against improper alteration</li>
      <li>Transmission security: encryption of ePHI in transit using TLS 1.3</li>
      <li>Storage security: AES-256 encryption of ePHI at rest</li>
      <li>Workforce training on HIPAA requirements</li>
      <li>Regular risk assessments and vulnerability testing</li>
    </ul>

    <h2>6. Breach Notification</h2>
    <p>
      Following discovery of a Breach of Unsecured PHI, Business Associate shall notify Covered Entity without
      unreasonable delay and in no case later than 60 calendar days after discovery. Notification shall include
      identification of affected individuals, the nature of the PHI involved, and recommended mitigation steps.
    </p>

    <h2>7. Term and Termination</h2>
    <p>
      This BAA is effective for the duration of the subscription. Upon termination, Business Associate shall return
      or destroy all PHI in its possession, or if return or destruction is not feasible, extend the protections of
      this BAA to the retained PHI. Business Associate shall certify destruction in writing.
    </p>

    <h2>8. Minimum Necessary Standard</h2>
    <p>
      Business Associate shall limit its use, disclosure, and request of PHI to the minimum amount necessary to
      accomplish the intended purpose, consistent with the minimum necessary standard under 45 CFR § 164.502(b).
    </p>

    <h2>9. Regulatory Changes</h2>
    <p>
      The parties agree to negotiate in good faith to amend this BAA to comply with changes in HIPAA Rules or
      applicable law.
    </p>

    <h2>Contact</h2>
    <p>
      <strong>HIPAA Privacy Officer</strong><br />
      Concept2Cure, Inc.<br />
      Email: hipaa@concept2cure.com
    </p>
  </LegalPageLayout>
);

export default BusinessAssociateAgreement;
