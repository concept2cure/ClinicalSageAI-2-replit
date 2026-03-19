/**
 * @fileoverview Acceptable Use Policy (AUP)
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const AcceptableUsePolicy: React.FC = () => (
  <LegalPageLayout title="Acceptable Use Policy" lastUpdated="March 19, 2026">
    <h2>1. Purpose</h2>
    <p>
      This Acceptable Use Policy ("AUP") defines the acceptable and prohibited uses of the Concept2Cure platform.
      All users must comply with this AUP. Violations may result in suspension or termination of access.
    </p>

    <h2>2. Acceptable Uses</h2>
    <p>The Platform is intended for legitimate life sciences and regulatory purposes including:</p>
    <ul>
      <li>Regulatory submission preparation, review, and management</li>
      <li>Clinical and regulatory document authoring and collaboration</li>
      <li>Compliance analysis, audit readiness, and quality management</li>
      <li>Clinical trial intelligence, evidence synthesis, and literature review</li>
      <li>Regulatory strategy and pathway planning</li>
      <li>Training and professional development in regulatory affairs</li>
    </ul>

    <h2>3. Prohibited Uses</h2>
    <p>You may not use the Platform to:</p>
    <ul>
      <li>Submit falsified, fabricated, or misleading data to any regulatory authority</li>
      <li>Circumvent security controls, audit trails, or access restrictions</li>
      <li>Process data in violation of HIPAA, GDPR, or other applicable data protection laws</li>
      <li>Share credentials or allow unauthorized access to your account</li>
      <li>Reverse engineer, decompile, or extract source code from the Platform</li>
      <li>Use the Platform for any purpose unrelated to life sciences regulatory activities</li>
      <li>Attempt to disable, modify, or bypass 21 CFR Part 11 compliance controls</li>
      <li>Upload malware, viruses, or other malicious content</li>
      <li>Use AI-generated content without qualified human review before regulatory submission</li>
      <li>Exceed rate limits or use automated tools to access the Platform beyond intended use</li>
    </ul>

    <h2>4. Data Integrity</h2>
    <p>
      Users are responsible for ensuring the accuracy and integrity of all data entered into the Platform. The
      Platform maintains immutable audit trails as required by 21 CFR Part 11. Users must not attempt to alter,
      delete, or falsify audit records.
    </p>

    <h2>5. Reporting Violations</h2>
    <p>
      If you become aware of any violation of this AUP, please report it immediately to compliance@concept2cure.com.
      Reports may be made anonymously.
    </p>

    <h2>6. Enforcement</h2>
    <p>
      Concept2Cure reserves the right to investigate suspected violations and take appropriate action, including
      temporary suspension, permanent termination, or reporting to relevant authorities.
    </p>

    <h2>Contact</h2>
    <p>
      <strong>Compliance Team</strong><br />
      Concept2Cure, Inc.<br />
      Email: compliance@concept2cure.com
    </p>
  </LegalPageLayout>
);

export default AcceptableUsePolicy;
