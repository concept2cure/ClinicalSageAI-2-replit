/**
 * @fileoverview Privacy Policy
 * Data privacy and protection policy for Concept2Cure platform.
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const PrivacyPolicy: React.FC = () => (
  <LegalPageLayout title="Privacy Policy" lastUpdated="March 19, 2026">
    <h2>1. Introduction</h2>
    <p>
      Concept2Cure, Inc. ("Concept2Cure," "we," "us") is committed to protecting the privacy and security of your
      personal information. This Privacy Policy describes how we collect, use, disclose, and protect information when
      you use our AI-powered regulatory intelligence platform ("Platform").
    </p>
    <p>
      As a life sciences technology provider, we understand the sensitivity of clinical, regulatory, and health-related
      data. Our privacy practices are designed to meet or exceed the requirements of GDPR, HIPAA, and other applicable
      data protection regulations.
    </p>

    <h2>2. Information We Collect</h2>
    <h3>2.1 Account Information</h3>
    <p>Name, email address, organization, role/title, and authentication credentials.</p>
    <h3>2.2 Platform Usage Data</h3>
    <p>Feature usage, session data, audit logs (as required by 21 CFR Part 11), and system performance metrics.</p>
    <h3>2.3 Regulatory Content</h3>
    <p>Documents, submissions, clinical data references, and regulatory intelligence artifacts that you create or upload.</p>
    <h3>2.4 Technical Data</h3>
    <p>IP address, browser type, device information, and cookies (see our Cookie Policy for details).</p>

    <h2>3. How We Use Your Information</h2>
    <ul>
      <li>Providing and improving the Platform services</li>
      <li>Authenticating users and maintaining security (including 21 CFR Part 11 compliance)</li>
      <li>Processing subscription payments</li>
      <li>Communicating service updates and regulatory alerts</li>
      <li>Generating anonymized, aggregated analytics to improve our AI models</li>
      <li>Complying with legal obligations and regulatory requirements</li>
    </ul>

    <h2>4. Data Processing and AI</h2>
    <p>
      Our Platform uses artificial intelligence to process regulatory documents and generate compliance insights.
      Your Content is processed solely to provide Platform services. All AI processing occurs within our secure
      infrastructure.
    </p>

    <h3>4.1 AI Model Improvement (Opt-In)</h3>
    <p>
      You may choose to allow Concept2Cure to use your de-identified, aggregated content to improve our AI models'
      understanding of regulatory patterns, compliance requirements, and document structures. This is an
      <strong> opt-in feature</strong> that you can enable or disable at any time from your organization's Settings
      panel under "Data & Privacy."
    </p>
    <p>When AI Learning is <strong>enabled</strong>:</p>
    <ul>
      <li>Your content may be used in aggregated, de-identified form to improve AI model quality</li>
      <li>No data is ever attributed to, associated with, or traceable back to your organization</li>
      <li>No specific documents, submissions, or proprietary content is cited or reproduced</li>
      <li>Learning is limited to general regulatory patterns and compliance structures</li>
      <li>Improvements benefit all Concept2Cure users through better AI responses</li>
    </ul>
    <p>When AI Learning is <strong>disabled</strong> (default):</p>
    <ul>
      <li>Your content is used exclusively to provide your Platform services</li>
      <li>No content is retained beyond the active session for model improvement</li>
      <li>Your data is processed, returned, and not used for any other purpose</li>
    </ul>
    <p>
      <strong>Important:</strong> Regardless of your AI Learning setting, Concept2Cure never sells your data, never
      shares identifiable content with third parties, and never uses your data to benefit specific competitors.
      The AI Learning toggle only controls whether anonymized patterns contribute to general model improvement.
    </p>

    <h3>4.2 Third-Party AI Providers</h3>
    <p>
      Concept2Cure uses Anthropic's Claude AI for certain processing tasks. Your content sent to Anthropic is subject
      to Anthropic's data processing terms. Per our agreement with Anthropic, content processed through their API is
      not used by Anthropic to train their models. You can review Anthropic's usage policy at
      anthropic.com/policies.
    </p>

    <h2>5. Data Sharing</h2>
    <p>We do not sell your personal information. We may share data with:</p>
    <ul>
      <li><strong>Service providers</strong> who assist in delivering Platform services (under data processing agreements)</li>
      <li><strong>Your organization</strong> administrators who manage your account</li>
      <li><strong>Regulatory authorities</strong> when required by law or regulation</li>
      <li><strong>Legal proceedings</strong> to comply with valid legal process</li>
    </ul>

    <h2>6. Data Retention</h2>
    <p>
      We retain your data for the duration of your subscription plus 30 days. Audit logs are retained for a minimum
      of 7 years as required by 21 CFR Part 11 and GxP regulations. You may request data export at any time.
    </p>

    <h2>7. Security Measures</h2>
    <ul>
      <li>AES-256 encryption at rest</li>
      <li>TLS 1.3 encryption in transit</li>
      <li>Multi-factor authentication (MFA)</li>
      <li>Role-based access control (RBAC)</li>
      <li>Immutable audit logging</li>
      <li>Regular penetration testing and vulnerability assessments</li>
      <li>SOC 2 Type II certified infrastructure</li>
    </ul>

    <h2>8. Your Rights</h2>
    <p>Depending on your jurisdiction, you may have the right to:</p>
    <ul>
      <li>Access your personal data</li>
      <li>Rectify inaccurate data</li>
      <li>Delete your data (subject to regulatory retention requirements)</li>
      <li>Port your data to another service</li>
      <li>Object to or restrict certain processing</li>
      <li>Withdraw consent</li>
    </ul>
    <p>To exercise these rights, contact privacy@concept2cure.com.</p>

    <h2>9. International Data Transfers</h2>
    <p>
      If your data is transferred outside your jurisdiction, we ensure appropriate safeguards through Standard
      Contractual Clauses (SCCs), adequacy decisions, or other lawful transfer mechanisms.
    </p>

    <h2>10. Children's Privacy</h2>
    <p>
      The Platform is not intended for individuals under 18. We do not knowingly collect information from minors.
    </p>

    <h2>11. Changes to This Policy</h2>
    <p>
      We may update this policy periodically. Material changes will be communicated via email at least 30 days in advance.
    </p>

    <h2>12. Contact</h2>
    <p>
      <strong>Data Protection Officer</strong><br />
      Concept2Cure, Inc.<br />
      Email: privacy@concept2cure.com
    </p>
  </LegalPageLayout>
);

export default PrivacyPolicy;
