/**
 * @fileoverview Data Processing Agreement (DPA)
 * GDPR-compliant DPA for Concept2Cure platform.
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const DataProcessingAgreement: React.FC = () => (
  <LegalPageLayout title="Data Processing Agreement" lastUpdated="March 19, 2026">
    <h2>1. Scope and Purpose</h2>
    <p>
      This Data Processing Agreement ("DPA") supplements the Terms of Service between Concept2Cure, Inc.
      ("Processor") and the subscribing organization ("Controller") and governs the processing of personal data
      in connection with the Concept2Cure regulatory intelligence platform.
    </p>
    <p>
      This DPA is designed to meet the requirements of the EU General Data Protection Regulation (GDPR), the UK
      GDPR, the Swiss Federal Act on Data Protection, and other applicable data protection laws.
    </p>

    <h2>2. Definitions</h2>
    <p>
      "Personal Data," "Processing," "Data Subject," "Controller," "Processor," and "Sub-processor" have the
      meanings given in Article 4 of the GDPR. "Platform Data" means all personal data processed by Concept2Cure
      on behalf of the Controller through the Platform.
    </p>

    <h2>3. Processing Instructions</h2>
    <p>
      Concept2Cure shall process Platform Data only on documented instructions from the Controller, including with
      regard to transfers of personal data to a third country, unless required by applicable law. The subject matter,
      duration, nature, and purpose of processing, types of personal data, and categories of data subjects are set
      forth in Annex 1 to this DPA.
    </p>

    <h2>4. Confidentiality</h2>
    <p>
      Concept2Cure ensures that persons authorized to process Platform Data have committed themselves to
      confidentiality or are under an appropriate statutory obligation of confidentiality.
    </p>

    <h2>5. Security Measures</h2>
    <p>
      Concept2Cure implements appropriate technical and organizational measures to ensure a level of security
      appropriate to the risk, including:
    </p>
    <ul>
      <li>Encryption of personal data at rest (AES-256) and in transit (TLS 1.3)</li>
      <li>Ability to ensure ongoing confidentiality, integrity, availability, and resilience of processing systems</li>
      <li>Ability to restore availability and access to personal data in a timely manner following an incident</li>
      <li>Regular testing, assessing, and evaluating the effectiveness of security measures</li>
      <li>21 CFR Part 11 compliant audit trails and electronic signature controls</li>
    </ul>

    <h2>6. Sub-processors</h2>
    <p>
      Concept2Cure shall not engage a sub-processor without prior written authorization of the Controller. A current
      list of approved sub-processors is available upon request. Concept2Cure shall inform the Controller of any
      intended changes to sub-processors, giving the Controller the opportunity to object.
    </p>

    <h2>7. Data Subject Rights</h2>
    <p>
      Concept2Cure shall assist the Controller in responding to requests from data subjects exercising their rights
      under applicable data protection law, including rights of access, rectification, erasure, restriction,
      portability, and objection.
    </p>

    <h2>8. Data Breach Notification</h2>
    <p>
      Concept2Cure shall notify the Controller without undue delay (and in any event within 72 hours) after becoming
      aware of a personal data breach. Notification shall include the nature of the breach, categories and approximate
      number of data subjects affected, likely consequences, and measures taken or proposed to address the breach.
    </p>

    <h2>9. Data Return and Deletion</h2>
    <p>
      Upon termination of the agreement, Concept2Cure shall, at the Controller's choice, return all Platform Data
      or delete it, unless applicable law requires retention. Regulatory audit logs required under 21 CFR Part 11
      shall be retained for the minimum period required by law.
    </p>

    <h2>10. Audits and Inspections</h2>
    <p>
      Concept2Cure shall make available to the Controller all information necessary to demonstrate compliance with
      this DPA and shall allow for and contribute to audits conducted by the Controller or an auditor mandated by
      the Controller. Concept2Cure shall provide SOC 2 Type II reports and relevant compliance certifications upon request.
    </p>

    <h2>11. International Transfers</h2>
    <p>
      Any transfer of Platform Data outside the EEA, UK, or Switzerland shall be subject to appropriate safeguards
      as required by applicable data protection law, including the EU Standard Contractual Clauses (Module 2:
      Controller to Processor) as adopted by the European Commission.
    </p>

    <h2>Annex 1: Details of Processing</h2>
    <p><strong>Subject matter:</strong> Regulatory intelligence and document management services</p>
    <p><strong>Duration:</strong> For the term of the subscription agreement</p>
    <p><strong>Nature and purpose:</strong> Processing personal data for regulatory submission management, document authoring, compliance analysis, and audit trail maintenance</p>
    <p><strong>Types of personal data:</strong> User account data, audit log entries (user actions, timestamps, IP addresses), document metadata, and clinical/regulatory content as uploaded by the Controller</p>
    <p><strong>Categories of data subjects:</strong> Controller's employees, contractors, clinical research personnel, and regulatory affairs professionals</p>

    <h2>Contact</h2>
    <p>
      <strong>Data Protection Officer</strong><br />
      Concept2Cure, Inc.<br />
      Email: dpo@concept2cure.com
    </p>
  </LegalPageLayout>
);

export default DataProcessingAgreement;
