const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat, HeadingLevel, 
        BorderStyle, WidthType, ShadingType, PageNumber, PageBreak } = require('docx');
const fs = require('fs');

// Concept2Cure brand colors
const NAVY = "1a2e4a";
const GOLD = "c9a227";
const DARK_GRAY = "333333";
const BORDER_GRAY = "d0d0d0";
const RED = "dc2626";
const GREEN = "059669";
const ORANGE = "f59e0b";

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_GRAY };
const borders = { top: border, bottom: border, left: border, right: border };

// Helper functions
const p = (text, opts = {}) => new Paragraph({
  spacing: { after: 200, line: 276 },
  ...opts,
  children: [new TextRun({ text, size: 24, color: DARK_GRAY, ...opts.run })]
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 200 },
  children: [new TextRun({ text, size: 36, bold: true, color: NAVY })]
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 300, after: 150 },
  children: [new TextRun({ text, size: 30, bold: true, color: NAVY })]
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 250, after: 120 },
  children: [new TextRun({ text, size: 26, bold: true, color: NAVY })]
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 100 },
  children: [new TextRun({ text, size: 24, color: DARK_GRAY })]
});

const cell = (text, width, opts = {}) => new TableCell({
  borders,
  width: { size: width, type: WidthType.DXA },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  ...opts,
  children: [new Paragraph({ children: [new TextRun({ text, size: 22, ...opts.run })] })]
});

const headerCell = (text, width) => new TableCell({
  borders,
  width: { size: width, type: WidthType.DXA },
  shading: { fill: NAVY, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({ children: [new TextRun({ text, size: 22, bold: true, color: "FFFFFF" })] })]
});

const priorityCell = (priority, width) => {
  const colors = { P0: RED, P1: ORANGE, P2: GOLD, P3: GREEN };
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: colors[priority] || DARK_GRAY, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: priority, size: 22, bold: true, color: "FFFFFF" })] })]
  });
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 250, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        { level: 2, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]}
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Concept2Cure AI", color: NAVY, size: 20, bold: true }),
            new TextRun({ text: " | Enterprise Sign-On Specification", color: "666666", size: 20 })
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "CONFIDENTIAL – FDA 21 CFR Part 11 Compliant | Page ", size: 18, color: "666666" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666" }),
            new TextRun({ text: " of ", size: 18, color: "666666" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "666666" })
          ]
        })]
      })
    },
    children: [
      // ========== COVER PAGE ==========
      new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Concept2Cure AI", size: 72, bold: true, color: NAVY })
      ]}),
      new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Enterprise Client Sign-On", size: 48, color: GOLD })
      ]}),
      new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Complete Feature Specification & Gap Remediation Plan", size: 28, color: DARK_GRAY })
      ]}),
      new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "21 CFR Part 11 Compliant | FDA Audit Ready | Enterprise Security", size: 22, italics: true, color: "666666" })
      ]}),
      new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Biotech & Pharmaceutical Enterprise Platform", size: 20, color: "888888" })
      ]}),
      new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Version 1.0 | January 2026", size: 20, color: "888888" })
      ]}),

      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 1: EXECUTIVE SUMMARY ==========
      h1("1. Executive Summary"),
      
      p("This document provides the unified specification for completing and hardening the Concept2Cure AI client sign-on system. It combines security gap analysis, enterprise feature requirements, 21 CFR Part 11 compliance mapping, and implementation priorities into a single authoritative reference for the development team."),
      
      p("The Concept2Cure platform serves biotech companies, pharmaceutical enterprises, CROs, and independent regulatory consultants. The sign-on page is the security gateway to sensitive regulatory submission data including eCTD documents, clinical trial protocols, CMC manufacturing data, and AI-generated regulatory intelligence. Every authentication decision has compliance implications."),

      h2("1.1 Current State Assessment"),
      
      p("The existing authentication system provides foundational capabilities including JWT-based sessions, bcrypt password hashing, basic role-based access, and multi-organization support. However, critical enterprise security features are missing or incomplete, creating significant risk for FDA-regulated operations."),

      h2("1.2 Critical Gaps Requiring Immediate Action"),
      
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [800, 2800, 3200, 2560],
        rows: [
          new TableRow({ children: [
            headerCell("Priority", 800),
            headerCell("Gap", 2800),
            headerCell("Risk", 3200),
            headerCell("21 CFR Part 11", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P0", 800),
            cell("No Rate Limiting", 2800),
            cell("Brute force attacks can compromise accounts", 3200),
            cell("§11.10(d) - Access controls", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P0", 800),
            cell("No Account Lockout", 2800),
            cell("Unlimited login attempts allowed", 3200),
            cell("§11.300(d) - Unauthorized use", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P0", 800),
            cell("CSRF Protection Disabled", 2800),
            cell("Cross-site request forgery attacks", 3200),
            cell("§11.10(d) - System integrity", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P0", 800),
            cell("Insecure CORS Configuration", 2800),
            cell("Access-Control-Allow-Origin: * in production", 3200),
            cell("§11.10(d) - Access controls", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P0", 800),
            cell("Weak Password Policy", 2800),
            cell("8-character minimum without complexity", 3200),
            cell("§11.300(a) - Unique identification", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P1", 800),
            cell("SSO Buttons Non-Functional", 2800),
            cell("Microsoft/Google buttons hit non-existent endpoints", 3200),
            cell("§11.10(d) - Authorized access", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P1", 800),
            cell("No MFA/2FA", 2800),
            cell("Single factor auth only - TOTP not implemented", 3200),
            cell("§11.100(a) - Signature uniqueness", 2560)
          ]}),
          new TableRow({ children: [
            priorityCell("P1", 800),
            cell("No Auth Audit Logging", 2800),
            cell("Zero forensics capability for login events", 3200),
            cell("§11.10(e) - Audit trails", 2560)
          ]})
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 2: COMPLETE FEATURE INVENTORY ==========
      h1("2. Complete Feature Inventory"),
      
      p("The following comprehensive inventory documents every feature required for enterprise-grade authentication. Features are organized by functional category with implementation status and compliance mapping."),

      h2("2.1 Core Authentication Features"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [2800, 3500, 1400, 1660],
        rows: [
          new TableRow({ children: [
            headerCell("Feature", 2800),
            headerCell("Description", 3500),
            headerCell("Status", 1400),
            headerCell("CFR §11", 1660)
          ]}),
          new TableRow({ children: [
            cell("Email + Password Authentication", 2800),
            cell("Primary credential-based login with bcrypt hashing", 3500),
            cell("✅ Complete", 1400, { run: { color: GREEN } }),
            cell("§11.100(a)", 1660)
          ]}),
          new TableRow({ children: [
            cell("JWT Token-Based Sessions", 2800),
            cell("Stateless authentication with signed tokens", 3500),
            cell("✅ Complete", 1400, { run: { color: GREEN } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Multi-Factor Authentication (MFA)", 2800),
            cell("TOTP-based second factor with authenticator apps", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.100(a)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Hardware Security Keys (FIDO2)", 2800),
            cell("WebAuthn support for YubiKey and similar devices", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.100(a)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Passkey Authentication", 2800),
            cell("Passwordless biometric authentication", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.100(a)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Microsoft Entra ID SSO", 2800),
            cell("SAML/OIDC integration with Azure AD", 3500),
            cell("⚠️ UI Only", 1400, { run: { color: ORANGE } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Google Workspace SSO", 2800),
            cell("OAuth 2.0 integration with Google identity", 3500),
            cell("⚠️ UI Only", 1400, { run: { color: ORANGE } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Okta SSO", 2800),
            cell("Enterprise identity provider integration", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("SAML 2.0 Generic", 2800),
            cell("Support for any SAML-compliant IdP", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(d)", 1660)
          ]})
        ]
      }),

      h2("2.2 Security & Protection Features"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [2800, 3500, 1400, 1660],
        rows: [
          new TableRow({ children: [
            headerCell("Feature", 2800),
            headerCell("Description", 3500),
            headerCell("Status", 1400),
            headerCell("CFR §11", 1660)
          ]}),
          new TableRow({ children: [
            cell("Rate Limiting", 2800),
            cell("Throttle login attempts per IP and user", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Account Lockout", 2800),
            cell("Lock account after N failed attempts", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.300(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Failed Login Tracking", 2800),
            cell("Record and alert on failed authentication", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(e)", 1660)
          ]}),
          new TableRow({ children: [
            cell("CSRF Protection", 2800),
            cell("Token-based cross-site request forgery prevention", 3500),
            cell("⚠️ Disabled", 1400, { run: { color: ORANGE } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Secure CORS Configuration", 2800),
            cell("Whitelist-based origin access control", 3500),
            cell("⚠️ Too Open", 1400, { run: { color: ORANGE } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Password Complexity Rules", 2800),
            cell("Require uppercase, lowercase, number, symbol", 3500),
            cell("⚠️ Weak", 1400, { run: { color: ORANGE } }),
            cell("§11.300(a)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Password History", 2800),
            cell("Prevent reuse of last N passwords", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.300(c)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Password Expiration", 2800),
            cell("Forced rotation every 90-180 days", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.300(c)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Compromised Password Detection", 2800),
            cell("Check against HaveIBeenPwned database", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.300(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("IP Allowlist/Blocklist", 2800),
            cell("Restrict login to approved IP ranges", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(d)", 1660)
          ]}),
          new TableRow({ children: [
            cell("Device Fingerprinting", 2800),
            cell("Track and validate trusted devices", 3500),
            cell("❌ Missing", 1400, { run: { color: RED } }),
            cell("§11.10(d)", 1660)
          ]})
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 3: IMPLEMENTATION PRIORITIES ==========
      h1("3. Implementation Priorities"),

      p("The following prioritization considers regulatory criticality, security risk, and implementation dependencies. Features are organized into implementation phases."),

      h2("3.1 Phase 1: Critical Security (Week 1-2)"),

      p("These features address immediate security vulnerabilities that put regulated data at risk."),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 4000, 2360],
        rows: [
          new TableRow({ children: [
            headerCell("Feature", 3000),
            headerCell("Implementation Notes", 4000),
            headerCell("Effort", 2360)
          ]}),
          new TableRow({ children: [
            cell("Enable Rate Limiting", 3000),
            cell("express-rate-limit middleware on /api/auth/* routes", 4000),
            cell("4 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Implement Account Lockout", 3000),
            cell("Add failed_login_attempts, locked_until columns; update auth.js", 4000),
            cell("8 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Enable CSRF Protection", 3000),
            cell("Uncomment security middleware in index.ts; add tokens to forms", 4000),
            cell("4 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Secure CORS Configuration", 3000),
            cell("Whitelist specific origins instead of wildcard", 4000),
            cell("2 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Password Complexity Rules", 3000),
            cell("Add validation: 12+ chars, uppercase, lowercase, number, symbol", 4000),
            cell("4 hours", 2360)
          ]})
        ]
      }),

      h2("3.2 Phase 2: Compliance Foundation (Week 3-4)"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 4000, 2360],
        rows: [
          new TableRow({ children: [
            headerCell("Feature", 3000),
            headerCell("Implementation Notes", 4000),
            headerCell("Effort", 2360)
          ]}),
          new TableRow({ children: [
            cell("Authentication Audit Trail", 3000),
            cell("Create auth_audit_log table; instrument auth.js", 4000),
            cell("16 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("MFA/TOTP Implementation", 3000),
            cell("New mfa_secrets table; speakeasy library; enrollment UI", 4000),
            cell("24 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Failed Login Tracking", 3000),
            cell("Log all failed attempts with IP, user agent", 4000),
            cell("8 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Session Timeout Enhancement", 3000),
            cell("Add inactivity tracking; frontend warning; auto-logout", 4000),
            cell("8 hours", 2360)
          ]})
        ]
      }),

      h2("3.3 Phase 3: Enterprise SSO (Week 5-6)"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 4000, 2360],
        rows: [
          new TableRow({ children: [
            headerCell("Feature", 3000),
            headerCell("Implementation Notes", 4000),
            headerCell("Effort", 2360)
          ]}),
          new TableRow({ children: [
            cell("Microsoft Entra ID Integration", 3000),
            cell("@azure/msal-node; /api/auth/sso/microsoft/* routes", 4000),
            cell("24 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Google OAuth Integration", 3000),
            cell("passport-google-oauth20; callback handling", 4000),
            cell("16 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Domain-Based SSO Detection", 3000),
            cell("org_sso_configs table; email domain lookup", 4000),
            cell("8 hours", 2360)
          ]}),
          new TableRow({ children: [
            cell("Just-In-Time Provisioning", 3000),
            cell("Create user on first SSO login; map attributes", 4000),
            cell("8 hours", 2360)
          ]})
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 4: 21 CFR PART 11 COMPLIANCE ==========
      h1("4. 21 CFR Part 11 Compliance Matrix"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [1400, 3600, 4360],
        rows: [
          new TableRow({ children: [
            headerCell("Section", 1400),
            headerCell("Requirement", 3600),
            headerCell("Concept2Cure Implementation", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.10(d)", 1400),
            cell("Limit system access to authorized individuals", 3600),
            cell("Authentication, MFA, SSO, IP allowlisting, rate limiting", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.10(e)", 1400),
            cell("Secure, computer-generated, time-stamped audit trails", 3600),
            cell("Auth audit logging with UTC timestamps, immutable storage", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.10(g)", 1400),
            cell("Authority checks at input/approval points", 3600),
            cell("Role-based access control, permission checks", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.100(a)", 1400),
            cell("Electronic signatures unique to one individual", 3600),
            cell("Unique user ID (UUID), MFA requirement", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.300(a)", 1400),
            cell("Unique identification code for each user", 3600),
            cell("Email + UUID identifier, no shared accounts", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.300(b)", 1400),
            cell("Prevent use of IDs/passwords by others", 3600),
            cell("Password hashing, MFA, session limits", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.300(c)", 1400),
            cell("Periodic revision of passwords", 3600),
            cell("Password expiration, history enforcement", 4360)
          ]}),
          new TableRow({ children: [
            cell("§11.300(d)", 1400),
            cell("Detect unauthorized use attempts", 3600),
            cell("Failed login tracking, account lockout, alerts", 4360)
          ]})
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 5: LOCKED CONFIG ==========
      h1("5. Locked Configuration Reference"),

      p("The following configuration has been verified working and must not be modified without explicit authorization."),

      h2("5.1 Production Credentials"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 6360],
        rows: [
          new TableRow({ children: [
            headerCell("Item", 3000),
            headerCell("Value", 6360)
          ]}),
          new TableRow({ children: [
            cell("Admin Email", 3000),
            cell("jm.smith@concept2cure.pro", 6360)
          ]}),
          new TableRow({ children: [
            cell("Admin Password", 3000),
            cell("demo123 (Change immediately in production)", 6360)
          ]}),
          new TableRow({ children: [
            cell("Organization", 3000),
            cell("Concept2Cure (ID: 2)", 6360)
          ]}),
          new TableRow({ children: [
            cell("User Type", 3000),
            cell("INTERNAL_ADMIN", 6360)
          ]})
        ]
      }),

      h2("5.2 Database Connection"),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 6360],
        rows: [
          new TableRow({ children: [
            headerCell("Item", 3000),
            headerCell("Value", 6360)
          ]}),
          new TableRow({ children: [
            cell("Environment Variable", 3000),
            cell("DATABASE_NEON_NEW_SECRET", 6360)
          ]}),
          new TableRow({ children: [
            cell("Host", 3000),
            cell("ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech", 6360)
          ]}),
          new TableRow({ children: [
            cell("Database", 3000),
            cell("neondb", 6360)
          ]}),
          new TableRow({ children: [
            cell("SSL Mode", 3000),
            cell("require", 6360)
          ]})
        ]
      }),

      new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "— End of Specification —", italics: true, color: "888888" })
      ]}),
    ]
  }]
});

const outputPath = process.argv[2] || './Concept2Cure_Enterprise_SignOn_Specification.docx';

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  logger.info(`✅ Document created: ${outputPath}`);
}).catch(err => {
  logger.error('❌ Error creating document:', err);
  process.exit(1);
});
