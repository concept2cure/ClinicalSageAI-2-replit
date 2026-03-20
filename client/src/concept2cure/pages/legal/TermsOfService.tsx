/**
 * @fileoverview Terms of Service
 * Legal terms governing use of the Concept2Cure platform.
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const TermsOfService: React.FC = () => (
  <LegalPageLayout title="Terms of Service" lastUpdated="March 19, 2026">
    <h2>1. Acceptance of Terms</h2>
    <p>
      By accessing or using the Concept2Cure platform ("Platform"), you agree to be bound by these Terms of Service
      ("Terms"). If you are using the Platform on behalf of an organization, you represent that you have authority to
      bind that organization to these Terms. If you do not agree, you may not access or use the Platform.
    </p>

    <h2>2. Description of Service</h2>
    <p>
      Concept2Cure provides an AI-powered regulatory intelligence platform designed for life sciences professionals.
      The Platform includes tools for regulatory submission management, document authoring, compliance analysis,
      clinical trial intelligence, and related services. The Platform is intended for use by qualified regulatory
      affairs professionals, clinical researchers, and authorized personnel.
    </p>

    <h2>3. Account Registration and Security</h2>
    <p>
      You must register for an account to access the Platform. You agree to provide accurate, current, and complete
      information during registration and to keep your account information updated. You are responsible for maintaining
      the confidentiality of your credentials and for all activities under your account. You must notify us immediately
      of any unauthorized use.
    </p>
    <p>
      The Platform supports multi-factor authentication (MFA) and enterprise single sign-on (SSO) in compliance with
      21 CFR Part 11 requirements for electronic records and signatures.
    </p>

    <h2>4. Permitted Use</h2>
    <p>You may use the Platform solely for lawful purposes related to:</p>
    <ul>
      <li>Regulatory submission preparation and management</li>
      <li>Clinical and regulatory document authoring</li>
      <li>Compliance analysis and audit readiness</li>
      <li>Clinical trial intelligence and evidence synthesis</li>
      <li>Quality management and risk assessment</li>
    </ul>
    <p>
      You may not use the Platform for any purpose that violates applicable laws, regulations, or industry standards,
      including but not limited to FDA regulations, EU MDR/IVDR, ICH guidelines, and GxP requirements.
    </p>

    <h2>5. Intellectual Property</h2>
    <p>
      The Platform, including its software, algorithms, designs, documentation, and trademarks, is the property of
      Concept2Cure, Inc. and is protected by intellectual property laws. Your use of the Platform does not grant you
      ownership of any intellectual property rights in the Platform.
    </p>
    <p>
      You retain ownership of all data, documents, and content you submit to the Platform ("Your Content"). You grant
      Concept2Cure a limited license to process Your Content solely to provide the Platform services.
    </p>

    <h2>6. AI-Generated Content Disclaimer</h2>
    <p>
      The Platform uses artificial intelligence to assist with regulatory document generation, compliance analysis, and
      intelligence synthesis. AI-generated content is provided as a drafting aid and must be reviewed, validated, and
      approved by qualified professionals before use in any regulatory submission or compliance activity.
    </p>
    <p>
      <strong>Concept2Cure does not guarantee the accuracy, completeness, or regulatory acceptability of AI-generated
      content.</strong> Users are solely responsible for verifying all content against applicable regulatory
      requirements before submission to any regulatory authority.
    </p>

    <h2>7. Data Security and Compliance</h2>
    <p>
      Concept2Cure implements industry-standard security measures including encryption at rest and in transit, access
      controls, audit logging, and regular security assessments. The Platform is designed to support compliance with:
    </p>
    <ul>
      <li>FDA 21 CFR Part 11 (Electronic Records and Signatures)</li>
      <li>HIPAA (Health Insurance Portability and Accountability Act)</li>
      <li>GDPR (General Data Protection Regulation)</li>
      <li>SOC 2 Type II security controls</li>
      <li>ICH E6(R3) GCP guidelines</li>
    </ul>

    <h2>8. Subscription and Payment</h2>
    <p>
      Access to the Platform requires a paid subscription. Pricing, billing cycles, and payment terms are set forth in
      your Order Form or Subscription Agreement. Fees are non-refundable except as required by law or as specified in
      your agreement.
    </p>

    <h2>9. Limitation of Liability</h2>
    <p>
      TO THE MAXIMUM EXTENT PERMITTED BY LAW, CONCEPT2CURE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
      CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PLATFORM, INCLUDING BUT NOT LIMITED TO DAMAGES
      RESULTING FROM REGULATORY SUBMISSIONS, CLINICAL TRIAL OUTCOMES, OR COMPLIANCE DECISIONS MADE USING THE PLATFORM.
    </p>

    <h2>10. Indemnification</h2>
    <p>
      You agree to indemnify and hold harmless Concept2Cure, its officers, directors, employees, and agents from any
      claims, damages, or expenses arising from your use of the Platform, your violation of these Terms, or your
      violation of any applicable law or regulation.
    </p>

    <h2>11. Termination</h2>
    <p>
      Either party may terminate the subscription as specified in the applicable agreement. Upon termination, you will
      retain access to export Your Content for a period of 30 days. After this period, Your Content may be deleted in
      accordance with our data retention policies.
    </p>

    <h2>12. Governing Law</h2>
    <p>
      These Terms shall be governed by the laws of the State of Delaware, without regard to conflict of law principles.
      Any disputes shall be resolved through binding arbitration administered by the American Arbitration Association.
    </p>

    <h2>13. Changes to Terms</h2>
    <p>
      Concept2Cure reserves the right to modify these Terms at any time. Material changes will be communicated via
      email or in-platform notification at least 30 days before taking effect. Continued use of the Platform after
      changes take effect constitutes acceptance of the modified Terms.
    </p>

    <h2>14. Contact</h2>
    <p>
      For questions about these Terms, please contact:<br />
      <strong>Concept2Cure, Inc.</strong><br />
      Legal Department<br />
      Email: legal@concept2cure.com
    </p>
  </LegalPageLayout>
);

export default TermsOfService;
