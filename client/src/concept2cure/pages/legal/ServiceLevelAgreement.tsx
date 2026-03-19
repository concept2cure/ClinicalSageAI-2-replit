/**
 * @fileoverview Service Level Agreement (SLA)
 * Platform availability and support commitments.
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const ServiceLevelAgreement: React.FC = () => (
  <LegalPageLayout title="Service Level Agreement" lastUpdated="March 19, 2026">
    <h2>1. Overview</h2>
    <p>
      This Service Level Agreement ("SLA") defines the service commitments for the Concept2Cure regulatory
      intelligence platform. This SLA applies to all Enterprise and Professional tier subscriptions.
    </p>

    <h2>2. Platform Availability</h2>
    <table>
      <thead>
        <tr><th>Tier</th><th>Monthly Uptime Target</th><th>Service Credit</th></tr>
      </thead>
      <tbody>
        <tr><td>Enterprise</td><td>99.95%</td><td>10% for &lt;99.95%, 25% for &lt;99.0%</td></tr>
        <tr><td>Professional</td><td>99.9%</td><td>10% for &lt;99.9%, 25% for &lt;99.0%</td></tr>
        <tr><td>Starter</td><td>99.5%</td><td>Best effort — no SLA credits</td></tr>
      </tbody>
    </table>
    <p>
      Uptime is calculated as: ((Total Minutes − Downtime Minutes) / Total Minutes) × 100. Scheduled maintenance
      windows (communicated 48 hours in advance) are excluded from downtime calculations.
    </p>

    <h2>3. Support Response Times</h2>
    <table>
      <thead>
        <tr><th>Severity</th><th>Description</th><th>Enterprise Response</th><th>Professional Response</th></tr>
      </thead>
      <tbody>
        <tr><td>P1 — Critical</td><td>Platform unavailable, data loss risk, submission deadline at risk</td><td>1 hour</td><td>4 hours</td></tr>
        <tr><td>P2 — High</td><td>Major feature degraded, workaround available</td><td>4 hours</td><td>8 hours</td></tr>
        <tr><td>P3 — Medium</td><td>Non-critical feature issue, minor impact</td><td>1 business day</td><td>2 business days</td></tr>
        <tr><td>P4 — Low</td><td>Enhancement request, cosmetic issue</td><td>3 business days</td><td>5 business days</td></tr>
      </tbody>
    </table>

    <h2>4. Data Protection</h2>
    <ul>
      <li>RPO (Recovery Point Objective): 1 hour — data backed up hourly</li>
      <li>RTO (Recovery Time Objective): 4 hours — full service restoration</li>
      <li>Daily encrypted backups with 90-day retention</li>
      <li>Geographic redundancy across multiple availability zones</li>
    </ul>

    <h2>5. Compliance Commitments</h2>
    <ul>
      <li>21 CFR Part 11 compliant electronic records and signatures</li>
      <li>Immutable audit trail with minimum 7-year retention</li>
      <li>Annual SOC 2 Type II audit reports provided upon request</li>
      <li>HIPAA BAA available for all tiers</li>
      <li>EU-US Data Privacy Framework certified</li>
    </ul>

    <h2>6. Scheduled Maintenance</h2>
    <p>
      Routine maintenance is performed during low-usage windows (Sundays 02:00–06:00 UTC). Emergency maintenance
      may occur with best-effort advance notice. All maintenance windows are communicated via email and in-platform
      notification.
    </p>

    <h2>7. Service Credits</h2>
    <p>
      Service credits are applied as a percentage of the monthly subscription fee for the affected month. Credits
      must be requested within 30 days of the downtime event. Maximum credit per month: 50% of monthly fee.
    </p>

    <h2>8. Exclusions</h2>
    <p>This SLA does not apply to downtime caused by:</p>
    <ul>
      <li>Force majeure events</li>
      <li>Third-party service outages (cloud providers, DNS, etc.)</li>
      <li>Customer network or equipment failures</li>
      <li>Scheduled maintenance within notified windows</li>
      <li>Customer actions that violate the Acceptable Use Policy</li>
    </ul>

    <h2>Contact</h2>
    <p>
      <strong>Support Team</strong><br />
      Email: support@concept2cure.com<br />
      Enterprise Hotline: Available to Enterprise tier subscribers
    </p>
  </LegalPageLayout>
);

export default ServiceLevelAgreement;
