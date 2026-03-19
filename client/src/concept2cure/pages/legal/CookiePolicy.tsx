/**
 * @fileoverview Cookie Policy
 */

import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const CookiePolicy: React.FC = () => (
  <LegalPageLayout title="Cookie Policy" lastUpdated="March 19, 2026">
    <h2>1. What Are Cookies</h2>
    <p>
      Cookies are small text files stored on your device when you visit a website. They help the website remember
      your preferences and provide a better experience. The Concept2Cure platform uses cookies and similar
      technologies as described below.
    </p>

    <h2>2. Cookies We Use</h2>
    <h3>2.1 Strictly Necessary Cookies</h3>
    <p>
      These cookies are essential for the Platform to function. They enable authentication, session management, and
      security features including 21 CFR Part 11 compliance. These cannot be disabled.
    </p>
    <table>
      <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
      <tbody>
        <tr><td>c2c_session</td><td>Authentication session</td><td>24 hours</td></tr>
        <tr><td>c2c_refresh</td><td>Session refresh token</td><td>7 days</td></tr>
        <tr><td>c2c_csrf</td><td>Cross-site request forgery protection</td><td>Session</td></tr>
        <tr><td>c2c_mfa</td><td>Multi-factor authentication state</td><td>Session</td></tr>
      </tbody>
    </table>

    <h3>2.2 Functional Cookies</h3>
    <p>
      These cookies remember your preferences such as theme selection, sidebar state, and workspace configuration.
    </p>
    <table>
      <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
      <tbody>
        <tr><td>c2c_theme</td><td>Light/dark mode preference</td><td>1 year</td></tr>
        <tr><td>c2c_workspace</td><td>Last active workspace</td><td>30 days</td></tr>
        <tr><td>c2c_compact</td><td>Compact mode preference</td><td>1 year</td></tr>
      </tbody>
    </table>

    <h3>2.3 Analytics Cookies</h3>
    <p>
      We use analytics cookies to understand how the Platform is used and to improve our services. These cookies
      collect anonymized usage data.
    </p>

    <h2>3. Managing Cookies</h2>
    <p>
      You can manage cookie preferences through your browser settings. Note that disabling strictly necessary cookies
      will prevent you from using the Platform. For functional and analytics cookies, you can opt out through the
      Platform's Settings panel under Appearance.
    </p>

    <h2>4. Contact</h2>
    <p>
      For questions about our cookie practices, contact privacy@concept2cure.com.
    </p>
  </LegalPageLayout>
);

export default CookiePolicy;
