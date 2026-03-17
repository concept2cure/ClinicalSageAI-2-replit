// Static Routes for Important Pages
// This module provides static HTML versions of key pages when the React app has issues loading

import path from 'path';
import fs from 'fs';

// Create a router to handle static page routes
export function setupStaticRoutes(app) {
  console.log('[StaticRoutes] Setting up static routes for key pages');

  // Serve the main landing page
  app.get('/', (req, res) => {
    console.log('[StaticRoutes] Serving clean landing page');
    const cleanLandingPath = path.join(process.cwd(), 'clean_landing_page.html');
    if (fs.existsSync(cleanLandingPath)) {
      res.sendFile(cleanLandingPath);
    } else {
      res.status(404).send('Landing page not found');
    }
  });

  // Forward React app routes to our React app
  const reactRoutes = [
    '/client-portal*',
    '/ind-wizard*',
    '/cer-generator*',
    '/cmc-wizard*',
    '/csr-analyzer*',
    '/vault*',
    '/study-architect*',
    '/analytics*',
  ];

  reactRoutes.forEach(route => {
    app.get(route, (req, res, next) => {
      console.log(`[StaticRoutes] Forwarding ${req.path} to React app`);
      // Forward to the next middleware/route handler
      next();
    });
  });

  // Serve solutions HTML files directly
  app.get('/solutions_*', (req, res) => {
    const requestedFile = req.path.substring(1); // Remove leading slash
    console.log(`[StaticRoutes] Serving solutions file: ${requestedFile}`);
    const filePath = path.join(process.cwd(), requestedFile);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`Module file ${requestedFile} not found`);
    }
  });

  // Define routes that should get static fallback pages
  const staticRoutes = [
    {
      path: '/solutions/csr-intelligence',
      title: 'CSR Intelligence™',
      description: 'Advanced clinical study report analytics and insights',
      features: [
        'Access to 3,217+ parsed clinical study reports',
        'AI-powered report analysis and comparison',
        'Automated extraction of key regulatory insights',
        'Customizable dashboards and visualizations',
      ],
    },
    {
      path: '/solutions/ind-wizard',
      title: 'IND Wizard™',
      description: 'Automated IND application preparation and submission',
      features: [
        'Guided questionnaire for IND preparation',
        'Automatic document generation from templates',
        'Real-time compliance checking against FDA requirements',
        'Integrated electronic submission capabilities',
      ],
    },
    {
      path: '/solutions/protocol-optimization',
      title: 'Protocol Optimization',
      description: 'AI-powered clinical protocol design and optimization',
      features: [
        'Statistical simulation for optimal study design',
        'Historical protocol comparison and benchmarking',
        'Automated protocol recommendations based on CSR data',
        'Regulatory alignment checking across global authorities',
      ],
    },
    {
      path: '/solutions/cmdr',
      title: 'Clinical Metadata Repository',
      description: 'Centralized management of clinical trial metadata',
      features: [
        'Standardized CDISC-compliant metadata management',
        'Version control and audit trails for all metadata',
        'Cross-study consistency validation',
        'Automated standards mapping for global submissions',
      ],
    },
    {
      path: '/solutions/vault-workspace',
      title: 'Vault™ Workspace',
      description: 'Secure, collaborative document management system',
      features: [
        'Role-based access control for document security',
        'Version tracking with automated comparison',
        'Regulatory-compliant document workflows',
        'Real-time collaborative editing and review',
      ],
    },
    {
      path: '/solutions/ich-wiz',
      title: 'ICH Wiz™',
      description: 'Digital compliance coach for global regulatory guidelines',
      features: [
        'Real-time guidance on ICH guidelines implementation',
        'Automated compliance checking for FDA, EMA, PMDA, NMPA',
        'Interactive compliance visualization and gap analysis',
        'Regulatory change monitoring and notification',
      ],
    },
    {
      path: '/solutions/study-architect',
      title: 'Study Architect™',
      description: 'AI-driven protocol design with statistical simulation',
      features: [
        'Advanced statistical power analysis and sample size calculation',
        'Monte Carlo simulations for endpoint selection',
        'Optimized inclusion/exclusion criteria recommendations',
        'Adaptive trial design support and visualization',
      ],
    },
    {
      path: '/persona/regulatory-affairs',
      title: 'For Regulatory Affairs',
      description: 'Streamline submissions and ensure compliance',
      features: [
        'Automated document generation and validation',
        'Real-time compliance monitoring across global authorities',
        'Integrated submission tracking and management',
        'Historical submission analysis and benchmarking',
      ],
    },
    {
      path: '/persona/clinical-operations',
      title: 'For Clinical Operations',
      description: 'Optimize trial design and execution',
      features: [
        'Protocol optimization based on historical data',
        'Site selection and performance analytics',
        'Enrollment forecasting and optimization',
        'Operational metrics dashboards and reporting',
      ],
    },
    {
      path: '/persona/medical-affairs',
      title: 'For Medical Affairs',
      description: 'Generate insights from clinical data',
      features: [
        'Comparative effectiveness analysis across trials',
        'Medical writing automation and assistance',
        'Publication planning and tracking',
        'Scientific communication and medical information support',
      ],
    },
    {
      path: '/persona/biostatistics',
      title: 'For Biostatistics & Data Science',
      description: 'Advanced analytics and statistical modeling',
      features: [
        'Statistical analysis plan automation',
        'Adaptive trial design modeling',
        'Bayesian statistical frameworks',
        'Integrated reporting and visualization',
      ],
    },
    {
      path: '/use-case/ectd-submissions',
      title: 'eCTD Submissions',
      description: 'Streamline electronic Common Technical Document preparation',
      features: [
        'Automated document generation in eCTD format',
        'Real-time validation against regional requirements',
        'Seamless integration with publishing tools',
        'Comprehensive submission tracking and analytics',
      ],
    },
    {
      path: '/use-case/protocol-design',
      title: 'Protocol Design & Optimization',
      description: 'Create data-driven clinical protocols',
      features: [
        'AI-powered protocol recommendations',
        'Statistical simulation for endpoint selection',
        'Automated protocol drafting and formatting',
        'Historical protocol benchmarking and comparison',
      ],
    },
    {
      path: '/use-case/regulatory-intelligence',
      title: 'Regulatory Intelligence',
      description: 'Stay ahead of global regulatory changes',
      features: [
        'Real-time monitoring of regulatory updates',
        'Impact analysis for pipeline products',
        'Automated regulatory summary generation',
        'Personalized alerts and notifications',
      ],
    },
    {
      path: '/use-case/clinical-data-standards',
      title: 'Clinical Data Standards Management',
      description: 'Ensure consistency and compliance in clinical data',
      features: [
        'CDISC standards implementation and validation',
        'Controlled terminology management',
        'Cross-study data standards harmonization',
        'Automated mapping to regulatory requirements',
      ],
    },
    {
      path: '/compare/trialsage-vs-veeva',
      title: 'TrialSage™ vs. Veeva',
      description: 'See how TrialSage™ compares to Veeva RIM Suite',
      features: [
        '40% faster document generation with advanced AI',
        'Superior protocol optimization with CSR-driven intelligence',
        'More comprehensive regulatory coverage across global authorities',
        'Fully integrated statistical simulation capabilities',
      ],
    },
    {
      path: '/compare/trialsage-vs-arisglobal',
      title: 'TrialSage™ vs. ArisGlobal',
      description: 'See how TrialSage™ compares to ArisGlobal LifeSphere',
      features: [
        'Enhanced regulatory intelligence with real-time updates',
        'More powerful protocol optimization capabilities',
        'Seamless integration between clinical and regulatory workflows',
        'Superior AI-driven document generation and analysis',
      ],
    },
    {
      path: '/compare/trialsage-vs-traditional',
      title: 'TrialSage™ vs. Traditional Methods',
      description: 'See how TrialSage™ transforms your regulatory workflows',
      features: [
        'Reduce document preparation time by up to 65%',
        'Decrease protocol amendments by 40% with data-driven design',
        'Improve first-time submission acceptance rates by 25%',
        'Cut regulatory intelligence gathering time by 75%',
      ],
    },
  ];

  // Register routes for each static page
  staticRoutes.forEach(route => {
    app.get(route.path, (req, res) => {
      console.log(`[StaticRoutes] Serving static fallback for: ${route.path}`);

      // Generate a simple but professional page for the route
      const html = generateStaticPage(route);

      // Send the HTML response
      res.set('Content-Type', 'text/html');
      res.send(html);
    });
  });

  // Create a generic fallback for other solution pages
  app.get('/solutions/*', (req, res, next) => {
    // If we made it here, we didn't have a specific static page for this solution
    // Create a generic solution page
    const pathSegments = req.path.split('/');
    const solutionName = pathSegments[pathSegments.length - 1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const route = {
      path: req.path,
      title: `${solutionName}`,
      description: 'TrialSage™ enterprise regulatory solution',
    };

    const html = generateStaticPage(route);
    res.set('Content-Type', 'text/html');
    res.send(html);
  });

  // Custom route for CSR Intelligence
  app.get('/solutions/csr-intelligence', (req, res) => {
    console.log('[StaticRoutes] Serving custom CSR Intelligence page');
    // Serve our custom CSR Intelligence page
    const customHtmlPath = path.join(process.cwd(), 'solutions_csr_intelligence.html');
    if (fs.existsSync(customHtmlPath)) {
      res.sendFile(customHtmlPath);
    } else {
      // Fallback to generated page if file doesn't exist
      const route = staticRoutes.find(r => r.path === '/solutions/csr-intelligence');
      const html = generateStaticPage(route);
      res.set('Content-Type', 'text/html');
      res.send(html);
    }
  });

  // Custom route for IND Wizard
  app.get('/solutions/ind-wizard', (req, res) => {
    console.log('[StaticRoutes] Serving custom IND Wizard page');
    // Serve our custom IND Wizard page
    const customHtmlPath = path.join(process.cwd(), 'solutions_ind_wizard.html');
    if (fs.existsSync(customHtmlPath)) {
      res.sendFile(customHtmlPath);
    } else {
      // Fallback to generated page if file doesn't exist
      const route = staticRoutes.find(r => r.path === '/solutions/ind-wizard');
      const html = generateStaticPage(route);
      res.set('Content-Type', 'text/html');
      res.send(html);
    }
  });

  // Custom route for Vault Workspace was removed from here
  // and moved to routes.ts with higher priority

  // Custom route for About Us page
  app.get('/about-us', (req, res) => {
    console.log('[StaticRoutes] Serving About Us page');
    // Serve our custom About Us page
    const aboutUsPath = path.join(process.cwd(), 'about-us.html');
    if (fs.existsSync(aboutUsPath)) {
      res.sendFile(aboutUsPath);
    } else {
      // Fallback to generated page if file doesn't exist
      const route = {
        path: '/about-us',
        title: 'About Concept2Cure',
        description: 'Accelerating Life Sciences from Concept to Cure',
        features: [
          'Our Mission - To accelerate the development of life-saving therapies from concept to cure',
          'Our Platform - Comprehensive AI-driven SaaS platform for regulatory intelligence and trial design',
          'Our Difference - End-to-end integration, real-time intelligence, and AI-powered automation',
          'Our Impact - Dramatic efficiency gains with improved compliance confidence',
        ],
      };
      const html = generateStaticPage(route);
      res.set('Content-Type', 'text/html');
      res.send(html);
    }
  });

  // Custom route for Security & Compliance page
  app.get('/security_compliance.html', (req, res) => {
    console.log('[StaticRoutes] Serving Security & Compliance page');
    const securityPath = path.join(process.cwd(), 'security_compliance.html');
    if (fs.existsSync(securityPath)) {
      res.sendFile(securityPath);
    } else {
      // Fallback to generated page if file doesn't exist
      const route = {
        path: '/security_compliance.html',
        title: 'Security & Compliance',
        description: 'Enterprise-Grade Security with Blockchain Verification',
        features: [
          'Blockchain Verification - Immutable audit trails for all regulatory documentation',
          'Multi-Factor Authentication - Enterprise-grade access control with role-based permissions',
          '21 CFR Part 11 Compliance - Exceed FDA requirements for electronic records',
          'End-to-End Encryption - AES-256 encryption at rest and TLS 1.3 in transit',
        ],
      };
      const html = generateStaticPage(route);
      res.set('Content-Type', 'text/html');
      res.send(html);
    }
  });

  // Custom route for HEOR Security page
  app.get('/heor_security.html', (req, res) => {
    console.log('[StaticRoutes] Serving HEOR Security page');
    const heorSecurityPath = path.join(process.cwd(), 'heor_security.html');
    if (fs.existsSync(heorSecurityPath)) {
      res.sendFile(heorSecurityPath);
    } else {
      // Fallback to generated page if file doesn't exist
      const route = {
        path: '/heor_security.html',
        title: 'HEOR Security Solutions',
        description: 'Specialized Protection for Health Economics Data',
        features: [
          'Patient Data Protection - Advanced anonymization and de-identification technologies',
          'Secure Analytics Environment - Isolated computational environment for sensitive health economics analysis',
          'Differential Privacy - Mathematical techniques that add carefully calibrated noise to dataset outputs',
          'Regulatory Compliance Framework - Comprehensive compliance with global health data regulations',
        ],
      };
      const html = generateStaticPage(route);
      res.set('Content-Type', 'text/html');
      res.send(html);
    }
  });

  // ===== Legal Pages =====
  const legalPages = {
    '/terms': {
      title: 'Terms of Service',
      lastUpdated: 'March 17, 2026',
      content: `
        <p class="legal-intro">[LEGAL REVIEW REQUIRED] These Terms of Service ("Terms") govern your access to and use of the TrialSage&trade; platform and related services (collectively, the "Service") provided by Concept2Cure.AI ("Company," "we," "us," or "our"). By accessing or using the Service, you agree to be bound by these Terms.</p>

        <h2>1. Definitions</h2>
        <p>"Authorized User" means any individual who is granted access to the Service under your account. "Customer Data" means all electronic data, information, or materials submitted by you or your Authorized Users to the Service, including clinical trial data, regulatory documents, and related metadata. "Platform" means the TrialSage&trade; Concept2Cure enablement platform, including all AI-driven regulatory intelligence, clinical trial design, and document management tools.</p>

        <h2>2. Account Registration and Access</h2>
        <p>To use the Service, you must register for an account and provide accurate, complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify us of any unauthorized use of your account. [LEGAL REVIEW REQUIRED]</p>
        <p>Access to the Service is granted on a subscription basis as defined in your Order Form or service agreement. We reserve the right to suspend or terminate accounts that violate these Terms.</p>

        <h2>3. Permitted Use</h2>
        <p>Subject to these Terms and your applicable subscription, you may access and use the Service solely for your internal business purposes related to clinical trial planning, regulatory submissions, and related life sciences activities. You shall not: (a) sublicense, resell, or distribute the Service; (b) reverse engineer, decompile, or disassemble any part of the Service; (c) use the Service to develop a competing product; (d) upload malicious code or attempt to gain unauthorized access to the Service infrastructure; or (e) use the Service in violation of applicable laws or regulations.</p>

        <h2>4. Customer Data and Intellectual Property</h2>
        <p>You retain all rights, title, and interest in your Customer Data. By using the Service, you grant us a limited license to process your Customer Data solely to provide and improve the Service. We will not access, use, or disclose Customer Data except as necessary to provide the Service, as permitted by you, or as required by law.</p>
        <p>The Service, including all software, algorithms, AI models, user interfaces, and documentation, is and remains the exclusive property of the Company. Nothing in these Terms grants you any rights in the Service except the limited right to use it as described herein. [LEGAL REVIEW REQUIRED]</p>

        <h2>5. AI-Generated Outputs</h2>
        <p>The Service may produce AI-generated analyses, recommendations, document drafts, and other outputs ("AI Outputs"). AI Outputs are provided for informational and decision-support purposes only. You acknowledge that: (a) AI Outputs do not constitute legal, regulatory, or medical advice; (b) you are solely responsible for reviewing, validating, and approving any AI Outputs before use in regulatory submissions or clinical decisions; (c) the Company does not guarantee the accuracy, completeness, or regulatory acceptance of AI Outputs. [LEGAL REVIEW REQUIRED]</p>

        <h2>6. Regulatory Compliance Responsibilities</h2>
        <p>While the Service is designed to support compliance with FDA, EMA, and other regulatory requirements, you are solely responsible for ensuring that your use of the Service and any resulting submissions comply with all applicable laws, regulations, and guidelines, including but not limited to 21 CFR Part 11, ICH guidelines, and applicable data protection regulations. The Company does not act as your regulatory agent or assume responsibility for regulatory outcomes.</p>

        <h2>7. Data Security</h2>
        <p>We implement industry-standard security measures to protect Customer Data, including encryption at rest and in transit, access controls, and audit logging. Our security practices are described in more detail on our <a href="/security">Security</a> page. However, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security. [LEGAL REVIEW REQUIRED]</p>

        <h2>8. Service Level and Availability</h2>
        <p>We will use commercially reasonable efforts to maintain Service availability. Specific uptime commitments, if any, are set forth in your service agreement or Order Form. We may perform scheduled maintenance with advance notice. We are not liable for downtime resulting from circumstances beyond our reasonable control. [LEGAL REVIEW REQUIRED]</p>

        <h2>9. Fees and Payment</h2>
        <p>Fees for the Service are as set forth in your Order Form or subscription agreement. All fees are non-refundable except as expressly stated in your agreement. We may adjust fees upon renewal with at least 30 days&rsquo; prior notice. Late payments may be subject to interest charges and suspension of access. [LEGAL REVIEW REQUIRED]</p>

        <h2>10. Limitation of Liability</h2>
        <p>[LEGAL REVIEW REQUIRED] TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY. THE COMPANY&rsquo;S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO LIABILITY.</p>

        <h2>11. Indemnification</h2>
        <p>You agree to indemnify, defend, and hold harmless the Company and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses arising out of: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law or regulation; or (d) any Customer Data you submit to the Service. [LEGAL REVIEW REQUIRED]</p>

        <h2>12. Term and Termination</h2>
        <p>These Terms remain in effect for the duration of your subscription. Either party may terminate upon written notice if the other party materially breaches these Terms and fails to cure within 30 days of notice. Upon termination, your access to the Service will cease. We will make Customer Data available for export for 30 days following termination, after which we may delete it. Sections that by their nature should survive termination shall survive, including Sections 4, 10, 11, and 13. [LEGAL REVIEW REQUIRED]</p>

        <h2>13. Governing Law and Dispute Resolution</h2>
        <p>[LEGAL REVIEW REQUIRED] These Terms shall be governed by and construed in accordance with the laws of [JURISDICTION], without regard to its conflict of law provisions. Any disputes shall be resolved through binding arbitration in accordance with the rules of [ARBITRATION BODY], except that either party may seek injunctive relief in a court of competent jurisdiction.</p>

        <h2>14. Changes to These Terms</h2>
        <p>We may update these Terms from time to time. We will notify you of material changes by email or through the Service at least 30 days before they take effect. Your continued use of the Service after such changes constitutes acceptance of the revised Terms.</p>

        <h2>15. Contact Information</h2>
        <p>For questions about these Terms, please contact us at:<br>
        Concept2Cure.AI<br>
        Email: <a href="mailto:legal@concept2cure.ai">legal@concept2cure.ai</a><br>
        [LEGAL REVIEW REQUIRED &mdash; Insert physical address]</p>
      `,
    },
    '/privacy': {
      title: 'Privacy Policy',
      lastUpdated: 'March 17, 2026',
      content: `
        <p class="legal-intro">[LEGAL REVIEW REQUIRED] This Privacy Policy describes how Concept2Cure.AI ("Company," "we," "us," or "our") collects, uses, discloses, and protects personal information when you use the TrialSage&trade; platform and our related services. This Policy applies to all users of the Service, including visitors to our website.</p>

        <h2>1. Information We Collect</h2>
        <h3>1.1 Information You Provide</h3>
        <ul>
          <li><strong>Account Information:</strong> Name, email address, job title, organization, phone number, and credentials when you register for an account.</li>
          <li><strong>Customer Data:</strong> Clinical trial data, regulatory documents, study protocols, and other content you upload to or create within the Service.</li>
          <li><strong>Payment Information:</strong> Billing address and payment details (processed through PCI-compliant third-party payment processors).</li>
          <li><strong>Communications:</strong> Information you provide when contacting support, requesting demos, or participating in surveys.</li>
        </ul>
        <h3>1.2 Information Collected Automatically</h3>
        <ul>
          <li><strong>Usage Data:</strong> Features accessed, pages visited, actions taken within the platform, session duration, and interaction patterns.</li>
          <li><strong>Device and Technical Data:</strong> IP address, browser type and version, operating system, device identifiers, and screen resolution.</li>
          <li><strong>Log Data:</strong> Server logs, error reports, and performance data.</li>
          <li><strong>Cookies and Tracking Technologies:</strong> As described in our <a href="/cookies">Cookie Policy</a>.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect for the following purposes:</p>
        <ul>
          <li><strong>Service Delivery:</strong> To provide, operate, and maintain the TrialSage&trade; platform and its features.</li>
          <li><strong>AI and Analytics:</strong> To power AI-driven regulatory intelligence, document analysis, and trial design recommendations. Customer Data used for AI model improvement is aggregated and de-identified.</li>
          <li><strong>Security and Compliance:</strong> To maintain audit trails, detect and prevent fraud, and comply with regulatory requirements including 21 CFR Part 11.</li>
          <li><strong>Communication:</strong> To send service notifications, technical updates, and, with your consent, marketing communications.</li>
          <li><strong>Improvement:</strong> To analyze usage patterns and improve Service functionality, performance, and user experience.</li>
        </ul>

        <h2>3. Clinical and Regulatory Data</h2>
        <p>Given the clinical and regulatory nature of the Service, we apply heightened protections to clinical trial data and regulatory documents:</p>
        <ul>
          <li>Clinical data is encrypted at rest (AES-256) and in transit (TLS 1.3).</li>
          <li>Access to clinical data is strictly controlled through role-based permissions with multi-factor authentication.</li>
          <li>Complete audit trails are maintained for all data access and modifications in compliance with 21 CFR Part 11.</li>
          <li>We do not sell or share identifiable clinical trial data with third parties.</li>
          <li>Patient-level data, if any, is handled in accordance with HIPAA and applicable data protection regulations. [LEGAL REVIEW REQUIRED]</li>
        </ul>

        <h2>4. Data Sharing and Disclosure</h2>
        <p>We may share your information in the following circumstances:</p>
        <ul>
          <li><strong>Service Providers:</strong> With trusted third-party vendors who assist in operating the Service (hosting, analytics, support), under contractual obligations to protect your data.</li>
          <li><strong>Legal Requirements:</strong> When required by law, regulation, legal process, or governmental request.</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with prior notice to affected users.</li>
          <li><strong>With Your Consent:</strong> When you direct us to share information with third parties.</li>
        </ul>
        <p>We do not sell personal information to third parties. [LEGAL REVIEW REQUIRED]</p>

        <h2>5. Data Retention</h2>
        <p>We retain personal information for as long as necessary to provide the Service and fulfill the purposes described in this Policy. Customer Data is retained for the duration of your subscription and for 30 days following termination. Audit logs are retained for a minimum of [LEGAL REVIEW REQUIRED &mdash; specify period, e.g., 7 years] to satisfy regulatory requirements. You may request deletion of your personal information subject to legal and regulatory retention obligations.</p>

        <h2>6. International Data Transfers</h2>
        <p>[LEGAL REVIEW REQUIRED] If you are located outside the United States, your information may be transferred to and processed in the United States or other jurisdictions. We implement appropriate safeguards for international transfers, including Standard Contractual Clauses (SCCs) approved by the European Commission, where applicable under GDPR.</p>

        <h2>7. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
        <ul>
          <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
          <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal and regulatory retention requirements.</li>
          <li><strong>Portability:</strong> Request transfer of your data in a structured, machine-readable format.</li>
          <li><strong>Objection:</strong> Object to processing of your data for certain purposes.</li>
          <li><strong>Restriction:</strong> Request restriction of processing under certain circumstances.</li>
          <li><strong>Withdraw Consent:</strong> Where processing is based on consent, withdraw consent at any time.</li>
        </ul>
        <p>To exercise these rights, contact us at <a href="mailto:privacy@concept2cure.ai">privacy@concept2cure.ai</a>. We will respond within 30 days (or as required by applicable law). [LEGAL REVIEW REQUIRED]</p>

        <h2>8. GDPR-Specific Provisions</h2>
        <p>[LEGAL REVIEW REQUIRED] For individuals in the European Economic Area (EEA), the United Kingdom, and Switzerland:</p>
        <ul>
          <li><strong>Legal Basis:</strong> We process personal data under the following legal bases: performance of a contract, legitimate interests, compliance with legal obligations, and consent.</li>
          <li><strong>Data Protection Officer:</strong> [LEGAL REVIEW REQUIRED &mdash; Appoint and list DPO contact information]</li>
          <li><strong>Supervisory Authority:</strong> You have the right to lodge a complaint with your local data protection authority.</li>
        </ul>

        <h2>9. HIPAA Considerations</h2>
        <p>[LEGAL REVIEW REQUIRED] To the extent that the Service processes Protected Health Information (PHI) as defined under HIPAA, we will enter into a Business Associate Agreement (BAA) with you. Our HIPAA compliance measures include administrative, physical, and technical safeguards as required by the HIPAA Security Rule.</p>

        <h2>10. Children&rsquo;s Privacy</h2>
        <p>The Service is not directed at individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that a child has provided personal information, we will take steps to delete it.</p>

        <h2>11. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service at least 30 days before they take effect. The "Last Updated" date at the top of this page indicates when the Policy was last revised.</p>

        <h2>12. Contact Us</h2>
        <p>For questions about this Privacy Policy or our data practices, please contact:<br>
        Concept2Cure.AI &mdash; Privacy Team<br>
        Email: <a href="mailto:privacy@concept2cure.ai">privacy@concept2cure.ai</a><br>
        [LEGAL REVIEW REQUIRED &mdash; Insert physical address]</p>
      `,
    },
    '/cookies': {
      title: 'Cookie Policy',
      lastUpdated: 'March 17, 2026',
      content: `
        <p class="legal-intro">[LEGAL REVIEW REQUIRED] This Cookie Policy explains how Concept2Cure.AI ("Company," "we," "us," or "our") uses cookies and similar tracking technologies on the TrialSage&trade; platform and our website.</p>

        <h2>1. What Are Cookies</h2>
        <p>Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work efficiently and provide information to site operators. Similar technologies include web beacons, pixels, and local storage.</p>

        <h2>2. How We Use Cookies</h2>
        <p>We use the following categories of cookies:</p>

        <h3>2.1 Strictly Necessary Cookies</h3>
        <p>These cookies are essential for the Service to function. They enable core features such as authentication, session management, and security. These cookies cannot be disabled.</p>
        <table class="legal-table">
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td>session_id</td><td>Maintains your authenticated session</td><td>Session</td></tr>
            <tr><td>csrf_token</td><td>Prevents cross-site request forgery</td><td>Session</td></tr>
            <tr><td>cookie_consent</td><td>Stores your cookie preferences</td><td>1 year</td></tr>
          </tbody>
        </table>

        <h3>2.2 Functional Cookies</h3>
        <p>These cookies enable enhanced functionality and personalization, such as remembering your preferences, language settings, and workspace configuration.</p>
        <table class="legal-table">
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td>user_prefs</td><td>Stores UI preferences and settings</td><td>1 year</td></tr>
            <tr><td>workspace_state</td><td>Remembers your workspace layout</td><td>30 days</td></tr>
          </tbody>
        </table>

        <h3>2.3 Analytics Cookies</h3>
        <p>These cookies help us understand how visitors interact with the Service so we can improve functionality and user experience. Analytics data is aggregated and does not identify individual users.</p>
        <table class="legal-table">
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td>_ga, _gid</td><td>Google Analytics &mdash; usage statistics</td><td>Up to 2 years</td></tr>
            <tr><td>_ts_analytics</td><td>Internal analytics and feature usage</td><td>1 year</td></tr>
          </tbody>
        </table>

        <h3>2.4 Marketing Cookies</h3>
        <p>These cookies are used to deliver relevant advertisements and track campaign effectiveness. They are only used on our public website, not within the authenticated platform.</p>
        <table class="legal-table">
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td>_fbp</td><td>Facebook advertising attribution</td><td>90 days</td></tr>
            <tr><td>_li_id</td><td>LinkedIn advertising attribution</td><td>90 days</td></tr>
          </tbody>
        </table>

        <h2>3. Managing Cookies</h2>
        <p>You can manage your cookie preferences in the following ways:</p>
        <ul>
          <li><strong>Cookie Consent Banner:</strong> When you first visit the Service, you can select which cookie categories to accept.</li>
          <li><strong>Browser Settings:</strong> Most browsers allow you to block or delete cookies through their settings. Note that blocking essential cookies will prevent the Service from functioning properly.</li>
          <li><strong>Opt-Out Links:</strong> For analytics cookies, you can opt out via <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google Analytics Opt-Out</a>.</li>
        </ul>

        <h2>4. Third-Party Cookies</h2>
        <p>Some cookies are placed by third-party services that appear on our pages. We do not control these cookies. Please refer to the respective third-party privacy policies for more information. [LEGAL REVIEW REQUIRED]</p>

        <h2>5. Updates to This Policy</h2>
        <p>We may update this Cookie Policy from time to time. Changes will be posted on this page with a revised "Last Updated" date.</p>

        <h2>6. Contact Us</h2>
        <p>For questions about this Cookie Policy, please contact:<br>
        Email: <a href="mailto:privacy@concept2cure.ai">privacy@concept2cure.ai</a></p>
      `,
    },
    '/security': {
      title: 'Security',
      lastUpdated: 'March 17, 2026',
      content: `
        <p class="legal-intro">At Concept2Cure.AI, security is foundational to the TrialSage&trade; platform. We understand that our customers entrust us with sensitive clinical trial data and regulatory documents. This page provides an overview of our security practices.</p>

        <h2>1. Infrastructure Security</h2>
        <ul>
          <li><strong>Cloud Hosting:</strong> The Service is hosted on enterprise-grade cloud infrastructure with SOC 2 Type II certified data centers. [LEGAL REVIEW REQUIRED &mdash; Confirm specific cloud provider and certifications]</li>
          <li><strong>Network Security:</strong> Multi-layer firewall protection, intrusion detection and prevention systems (IDS/IPS), and DDoS mitigation.</li>
          <li><strong>Isolation:</strong> Customer environments are logically isolated to prevent cross-tenant data access.</li>
          <li><strong>Redundancy:</strong> Geographically distributed infrastructure with automated failover for high availability.</li>
        </ul>

        <h2>2. Data Encryption</h2>
        <ul>
          <li><strong>In Transit:</strong> All data transmitted to and from the Service is encrypted using TLS 1.3.</li>
          <li><strong>At Rest:</strong> All stored data, including Customer Data and backups, is encrypted using AES-256.</li>
          <li><strong>Key Management:</strong> Encryption keys are managed through a dedicated key management service with automated rotation. [LEGAL REVIEW REQUIRED]</li>
        </ul>

        <h2>3. Access Control</h2>
        <ul>
          <li><strong>Authentication:</strong> Multi-factor authentication (MFA) is supported and can be enforced by organization administrators.</li>
          <li><strong>Role-Based Access:</strong> Granular role-based access control (RBAC) ensures users only access data and features appropriate to their role.</li>
          <li><strong>Single Sign-On:</strong> SAML 2.0 and OpenID Connect integration for enterprise SSO.</li>
          <li><strong>Session Management:</strong> Configurable session timeouts, concurrent session controls, and automatic lockout after failed attempts.</li>
        </ul>

        <h2>4. Audit and Monitoring</h2>
        <ul>
          <li><strong>Comprehensive Audit Trails:</strong> All user actions, data access, and system changes are logged with timestamps, user identification, and action details &mdash; in compliance with 21 CFR Part 11 requirements.</li>
          <li><strong>Real-Time Monitoring:</strong> 24/7 security monitoring and alerting for anomalous activity.</li>
          <li><strong>Log Retention:</strong> Audit logs are retained for a minimum of [LEGAL REVIEW REQUIRED] years and are tamper-evident.</li>
        </ul>

        <h2>5. Application Security</h2>
        <ul>
          <li><strong>Secure Development:</strong> We follow secure software development lifecycle (SSDLC) practices, including code reviews, static analysis, and dependency scanning.</li>
          <li><strong>Vulnerability Management:</strong> Regular vulnerability assessments and penetration testing by independent third parties.</li>
          <li><strong>Patch Management:</strong> Critical security patches are applied within 24 hours; other patches within established SLAs.</li>
          <li><strong>API Security:</strong> API endpoints are authenticated, rate-limited, and validated against injection and abuse.</li>
        </ul>

        <h2>6. Incident Response</h2>
        <p>We maintain a documented incident response plan that includes:</p>
        <ul>
          <li>Defined roles, escalation procedures, and communication protocols.</li>
          <li>Notification of affected customers within 72 hours of a confirmed breach, or as required by applicable law.</li>
          <li>Post-incident review and remediation to prevent recurrence.</li>
        </ul>

        <h2>7. Business Continuity</h2>
        <ul>
          <li><strong>Backups:</strong> Automated daily backups with point-in-time recovery capability.</li>
          <li><strong>Disaster Recovery:</strong> Documented DR plan with defined RTO and RPO targets. [LEGAL REVIEW REQUIRED &mdash; Specify targets]</li>
          <li><strong>Testing:</strong> Regular DR drills and tabletop exercises.</li>
        </ul>

        <h2>8. Employee Security</h2>
        <ul>
          <li>Background checks for all employees with access to customer data.</li>
          <li>Mandatory security awareness training upon hire and annually.</li>
          <li>Principle of least privilege applied to all internal access.</li>
          <li>Confidentiality agreements and acceptable use policies.</li>
        </ul>

        <h2>9. Certifications and Assessments</h2>
        <p>[LEGAL REVIEW REQUIRED &mdash; List actual certifications once obtained]</p>
        <ul>
          <li>SOC 2 Type II (in progress / certified)</li>
          <li>ISO 27001 (planned / certified)</li>
          <li>Regular third-party penetration testing</li>
          <li>Annual security risk assessments</li>
        </ul>

        <h2>10. Reporting Security Issues</h2>
        <p>If you discover a security vulnerability, please report it responsibly to <a href="mailto:security@concept2cure.ai">security@concept2cure.ai</a>. We appreciate the security research community and will acknowledge valid reports.</p>
      `,
    },
    '/compliance': {
      title: 'Compliance',
      lastUpdated: 'March 17, 2026',
      content: `
        <p class="legal-intro">TrialSage&trade; by Concept2Cure.AI is designed for the regulated life sciences industry. Our platform is built to support your compliance obligations across multiple regulatory frameworks. This page outlines how the Service addresses key regulatory requirements.</p>

        <h2>1. FDA 21 CFR Part 11</h2>
        <p>The TrialSage&trade; platform is designed to meet the requirements of 21 CFR Part 11 for electronic records and electronic signatures:</p>
        <ul>
          <li><strong>Electronic Signatures:</strong> Unique user identification with multi-factor authentication. Signatures are linked to their respective electronic records and include the printed name, date/time, and meaning of the signature.</li>
          <li><strong>Audit Trails:</strong> Computer-generated, time-stamped audit trails that independently record the date and time of operator entries and actions. Audit trail records cannot be modified and are retained for the life of the record.</li>
          <li><strong>Access Controls:</strong> System access is limited to authorized individuals. Operational system checks enforce permitted sequencing of steps and events.</li>
          <li><strong>Data Integrity:</strong> Authority checks ensure only authorized individuals can use the system, sign records, or alter records. Records are protected to enable accurate and ready retrieval throughout the retention period.</li>
          <li><strong>System Validation:</strong> The platform undergoes validation to ensure accuracy, reliability, and consistent intended performance. [LEGAL REVIEW REQUIRED]</li>
        </ul>

        <h2>2. HIPAA</h2>
        <p>[LEGAL REVIEW REQUIRED] Where the Service processes Protected Health Information (PHI), we maintain compliance with the Health Insurance Portability and Accountability Act (HIPAA):</p>
        <ul>
          <li><strong>Administrative Safeguards:</strong> Designated security officer, workforce training, access management policies, and incident response procedures.</li>
          <li><strong>Physical Safeguards:</strong> Data center security controls, workstation security policies, and device and media controls.</li>
          <li><strong>Technical Safeguards:</strong> Access controls, audit controls, integrity controls, and transmission security. All PHI is encrypted at rest and in transit.</li>
          <li><strong>Business Associate Agreements:</strong> We execute BAAs with customers who require HIPAA compliance and with our subcontractors who may access PHI.</li>
        </ul>

        <h2>3. GDPR</h2>
        <p>[LEGAL REVIEW REQUIRED] For customers and data subjects in the European Economic Area, the United Kingdom, and Switzerland, we support compliance with the General Data Protection Regulation:</p>
        <ul>
          <li><strong>Lawful Basis:</strong> Processing is based on contractual necessity, legitimate interests, legal obligations, or explicit consent.</li>
          <li><strong>Data Subject Rights:</strong> The platform supports exercise of data subject rights including access, rectification, erasure, restriction, portability, and objection.</li>
          <li><strong>Data Processing Agreements:</strong> We enter into DPAs that include Standard Contractual Clauses for international data transfers.</li>
          <li><strong>Data Protection by Design:</strong> Privacy and data protection are integrated into our development processes and platform architecture.</li>
          <li><strong>Data Protection Impact Assessments:</strong> We conduct DPIAs for high-risk processing activities.</li>
          <li><strong>Breach Notification:</strong> Procedures to notify supervisory authorities and data subjects within required timeframes.</li>
        </ul>

        <h2>4. GxP Compliance Support</h2>
        <p>The TrialSage&trade; platform supports Good Practice (GxP) requirements relevant to our customers&rsquo; operations:</p>
        <ul>
          <li><strong>Good Clinical Practice (GCP):</strong> Features that support ICH E6(R2) compliance in clinical trial planning and documentation.</li>
          <li><strong>Good Documentation Practice (GDP):</strong> Version control, change tracking, electronic signatures, and audit trails for all regulatory documents.</li>
          <li><strong>Computer System Validation (CSV):</strong> The platform is validated following GAMP 5 principles. Validation documentation is available upon request. [LEGAL REVIEW REQUIRED]</li>
        </ul>

        <h2>5. ICH Guidelines</h2>
        <p>The platform incorporates and references current ICH guidelines to support regulatory submissions globally:</p>
        <ul>
          <li>ICH E6(R2) &mdash; Good Clinical Practice</li>
          <li>ICH M4 &mdash; Common Technical Document (CTD) organization</li>
          <li>ICH E8(R1) &mdash; General Considerations for Clinical Studies</li>
          <li>ICH E9(R1) &mdash; Statistical Principles for Clinical Trials</li>
          <li>ICH M2 &mdash; Electronic Standards for Transmission of Regulatory Information</li>
        </ul>

        <h2>6. SOC 2</h2>
        <p>[LEGAL REVIEW REQUIRED &mdash; Update with actual status] We pursue SOC 2 Type II certification covering the Trust Services Criteria of Security, Availability, Processing Integrity, Confidentiality, and Privacy. Our SOC 2 report is available to customers and prospects under NDA.</p>

        <h2>7. Data Residency</h2>
        <p>[LEGAL REVIEW REQUIRED] We offer data residency options to support regulatory and organizational requirements. Contact us to discuss data residency needs for your organization.</p>

        <h2>8. Compliance Resources</h2>
        <p>We provide the following resources to support our customers&rsquo; compliance and audit needs:</p>
        <ul>
          <li>Platform validation documentation and IQ/OQ/PQ protocols</li>
          <li>SOC 2 Type II audit reports (under NDA)</li>
          <li>Data Processing Agreements and Business Associate Agreements</li>
          <li>Security questionnaire responses</li>
          <li>Compliance whitepapers and position papers</li>
        </ul>
        <p>To request compliance documentation, contact <a href="mailto:compliance@concept2cure.ai">compliance@concept2cure.ai</a>.</p>

        <h2>9. Continuous Compliance</h2>
        <p>Regulatory requirements evolve, and we are committed to maintaining alignment with current standards. Our compliance program includes:</p>
        <ul>
          <li>Ongoing monitoring of regulatory changes across key jurisdictions (FDA, EMA, PMDA, NMPA, Health Canada, TGA).</li>
          <li>Regular internal and external audits.</li>
          <li>Cross-functional compliance committee with representation from engineering, security, legal, and product teams.</li>
          <li>Annual compliance training for all employees.</li>
        </ul>
      `,
    },
  };

  // Register routes for each legal page
  Object.entries(legalPages).forEach(([routePath, page]) => {
    app.get(routePath, (req, res) => {
      console.log(`[StaticRoutes] Serving legal page: ${routePath}`);
      const html = generateLegalPage(page);
      res.set('Content-Type', 'text/html');
      res.send(html);
    });
  });

  console.log('[StaticRoutes] Static routes registered successfully');
}

// Generate a static HTML page for the given route
function generateStaticPage(route) {
  // Generate feature cards based on the route's features array
  let featureCardsHTML = '';

  // Use custom features if available, otherwise use default features
  const features = route.features || [
    'Accelerate Workflows - Reduce time spent on regulatory documentation by up to 65% with AI-assisted tools and automation.',
    'Data-Driven Insights - Leverage our database of 3,200+ clinical study reports to make informed decisions backed by historical data.',
    'Compliance Confidence - Ensure regulatory compliance with built-in validation against the latest FDA, EMA, and global standards.',
    'Seamless Integration - Connect with your existing systems through our robust API and integration capabilities.',
  ];

  // Generate a feature card for each feature
  const featureIcons = ['🚀', '📊', '✓', '🔗', '🛡️', '🔍', '📱', '⚙️'];
  features.forEach((feature, index) => {
    const featureTitle = feature.includes(' - ') ? feature.split(' - ')[0] : feature;
    const featureDesc = feature.includes(' - ') ? feature.split(' - ')[1] : '';
    const icon = featureIcons[index % featureIcons.length];

    featureCardsHTML += `
      <div class="feature-card">
        <div class="feature-icon">${icon}</div>
        <h3>${featureTitle}</h3>
        <p>${featureDesc || feature}</p>
      </div>
    `;
  });

  // Determine the route type for navigation highlighting
  const isModule = route.path.includes('/solutions/');
  const isPersona = route.path.includes('/persona/');
  const isUseCase = route.path.includes('/use-case/');
  const isComparison = route.path.includes('/compare/');

  // Generate related links based on the route type
  let relatedLinksHTML = '';
  if (isModule) {
    relatedLinksHTML = `
      <section class="related-links">
        <h2>Related Solutions</h2>
        <div class="related-grid">
          <a href="/solutions/csr-intelligence" class="related-link">CSR Intelligence™</a>
          <a href="/solutions/ind-wizard" class="related-link">IND Wizard™</a>
          <a href="/solutions/protocol-optimization" class="related-link">Protocol Optimization</a>
          <a href="/solutions/cmdr" class="related-link">Clinical Metadata Repository</a>
          <a href="/solutions/vault-workspace" class="related-link">Vault™ Workspace</a>
          <a href="/solutions/ich-wiz" class="related-link">ICH Wiz™</a>
          <a href="/solutions/study-architect" class="related-link">Study Architect™</a>
        </div>
      </section>
    `;
  } else if (isPersona) {
    relatedLinksHTML = `
      <section class="related-links">
        <h2>Other Personas</h2>
        <div class="related-grid">
          <a href="/persona/regulatory-affairs" class="related-link">For Regulatory Affairs</a>
          <a href="/persona/clinical-operations" class="related-link">For Clinical Operations</a>
          <a href="/persona/medical-affairs" class="related-link">For Medical Affairs</a>
          <a href="/persona/biostatistics" class="related-link">For Biostatistics & Data Science</a>
        </div>
      </section>
    `;
  } else if (isUseCase) {
    relatedLinksHTML = `
      <section class="related-links">
        <h2>Other Use Cases</h2>
        <div class="related-grid">
          <a href="/use-case/ectd-submissions" class="related-link">eCTD Submissions</a>
          <a href="/use-case/protocol-design" class="related-link">Protocol Design & Optimization</a>
          <a href="/use-case/regulatory-intelligence" class="related-link">Regulatory Intelligence</a>
          <a href="/use-case/clinical-data-standards" class="related-link">Clinical Data Standards Management</a>
        </div>
      </section>
    `;
  } else if (isComparison) {
    relatedLinksHTML = `
      <section class="related-links">
        <h2>Other Comparisons</h2>
        <div class="related-grid">
          <a href="/compare/trialsage-vs-veeva" class="related-link">TrialSage™ vs. Veeva</a>
          <a href="/compare/trialsage-vs-arisglobal" class="related-link">TrialSage™ vs. ArisGlobal</a>
          <a href="/compare/trialsage-vs-traditional" class="related-link">TrialSage™ vs. Traditional Methods</a>
        </div>
      </section>
    `;
  }

  return generatePageShell(route.title, `
  <div class="main-content">
    <div class="container">
      <section class="hero">
        <div class="hero-content">
          <h1>${route.title}</h1>
          <p>${route.description}</p>
          <div class="hero-buttons">
            <a href="/request-demo" class="btn btn-primary">Request Demo</a>
            <a href="/contact" class="btn btn-outline">Contact Sales</a>
          </div>
        </div>
      </section>

      <section>
        <h2 class="section-title">Key Features</h2>
        <p class="section-subtitle">Discover how ${route.title} can transform your regulatory workflows and accelerate submissions.</p>

        <div class="features">
          ${featureCardsHTML}
        </div>
      </section>

      ${relatedLinksHTML}

      <section class="cta-section">
        <h2>Ready to Transform Your Regulatory Process?</h2>
        <p>Join leading pharmaceutical companies who have accelerated their submissions and improved approval rates with TrialSage&trade;.</p>
        <a href="/request-demo" class="btn btn-secondary">Request Demo</a>
      </section>
    </div>
  </div>`, '', {
    isModule: route.path.includes('/solutions/'),
    isUseCase: route.path.includes('/use-case/'),
    isPersona: route.path.includes('/persona/'),
    isComparison: route.path.includes('/compare/'),
  });
}

// Generate a legal page with document-style layout
function generateLegalPage(page) {
  const bodyContent = `
  <div class="main-content legal-page">
    <div class="container">
      <div class="legal-header">
        <h1>${page.title}</h1>
        <p class="legal-updated">Last Updated: ${page.lastUpdated}</p>
      </div>
      <div class="legal-body">
        ${page.content}
      </div>
      <div class="legal-footer-nav">
        <h3>Related Legal Documents</h3>
        <div class="legal-nav-links">
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/security">Security</a>
          <a href="/compliance">Compliance</a>
          <a href="/cookies">Cookie Policy</a>
        </div>
      </div>
    </div>
  </div>`;

  const extraStyles = `
    .legal-page .container {
      max-width: 860px;
    }

    .legal-header {
      padding-top: 2rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 1.5rem;
    }

    .legal-header h1 {
      font-family: 'Montserrat', sans-serif;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--primary-dark);
      margin-bottom: 0.5rem;
    }

    .legal-updated {
      font-size: 0.9rem;
      color: var(--text-light);
    }

    .legal-body {
      line-height: 1.8;
      color: var(--text);
    }

    .legal-body h2 {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--primary-dark);
      margin-top: 2.5rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid var(--border);
    }

    .legal-body h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text);
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .legal-body p {
      margin-bottom: 1rem;
      font-size: 0.975rem;
    }

    .legal-intro {
      font-size: 1.05rem !important;
      color: var(--text-light);
      background: var(--primary-lighter);
      border-left: 4px solid var(--primary);
      padding: 1rem 1.25rem;
      border-radius: 0 6px 6px 0;
      margin-bottom: 1.5rem;
    }

    .legal-body ul {
      margin: 0.75rem 0 1rem 1.5rem;
      font-size: 0.975rem;
    }

    .legal-body ul li {
      margin-bottom: 0.5rem;
    }

    .legal-body a {
      color: var(--primary);
      text-decoration: underline;
    }

    .legal-body a:hover {
      color: var(--primary-dark);
    }

    .legal-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 1.5rem;
      font-size: 0.925rem;
    }

    .legal-table th,
    .legal-table td {
      padding: 0.65rem 1rem;
      text-align: left;
      border: 1px solid var(--border);
    }

    .legal-table th {
      background: var(--background-alt);
      font-weight: 600;
      color: var(--text);
    }

    .legal-table tr:nth-child(even) {
      background: var(--background-alt);
    }

    .legal-footer-nav {
      margin-top: 3rem;
      padding: 1.5rem;
      background: var(--background-alt);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .legal-footer-nav h3 {
      font-family: 'Montserrat', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--text);
    }

    .legal-nav-links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .legal-nav-links a {
      color: var(--primary);
      font-weight: 500;
      font-size: 0.925rem;
    }

    .legal-nav-links a:hover {
      color: var(--primary-dark);
      text-decoration: underline;
    }

    @media (max-width: 768px) {
      .legal-header h1 {
        font-size: 1.75rem;
      }
      .legal-nav-links {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  `;

  return generatePageShell(page.title, bodyContent, extraStyles);
}

// Shared page shell used by both generateStaticPage and generateLegalPage
function generatePageShell(title, bodyContent, extraStyles, navState) {
  const isModule = navState?.isModule || false;
  const isUseCase = navState?.isUseCase || false;
  const isPersona = navState?.isPersona || false;
  const isComparison = navState?.isComparison || false;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | TrialSage™</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    :root {
      --primary: #2c8c6c;
      --primary-light: #4CAF50;
      --primary-lighter: #e6f7f1;
      --primary-dark: #1B5E20;
      --accent: #ff7f50;
      --accent-light: #ffb74d;
      --accent-dark: #ef6c00;
      --text: #2d3748;
      --text-light: #718096;
      --text-lighter: #a0aec0;
      --background: #fff;
      --background-alt: #f7fafc;
      --border: #e2e8f0;
      --border-dark: #cbd5e0;
      --success: #48bb78;
      --warning: #ed8936;
      --danger: #e53e3e;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: var(--text);
      background-color: var(--background);
      margin: 0;
      padding: 0;
    }
    
    a {
      color: var(--primary);
      text-decoration: none;
      transition: all 0.2s ease;
    }
    
    a:hover {
      color: var(--primary-dark);
    }
    
    .header {
      background-color: white;
      padding: 1rem 2rem;
      box-shadow: var(--shadow);
      position: fixed;
      width: 100%;
      top: 0;
      z-index: 1000;
    }
    
    .header-content {
      max-width: 1280px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: 800;
      font-family: 'Montserrat', sans-serif;
      color: var(--primary);
      display: flex;
      align-items: center;
    }
    
    .logo img {
      height: 40px;
      margin-right: 10px;
    }
    
    .nav {
      display: flex;
      gap: 2rem;
    }
    
    .nav-item {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
      font-size: 1rem;
      position: relative;
      padding: 0.5rem 0;
    }
    
    .nav-item:hover {
      color: var(--primary);
    }
    
    .nav-item::after {
      content: '';
      position: absolute;
      width: 0;
      height: 2px;
      bottom: 0;
      left: 0;
      background-color: var(--primary);
      transition: width 0.3s;
    }
    
    .nav-item:hover::after {
      width: 100%;
    }
    
    .nav-item.active {
      color: var(--primary);
    }
    
    .nav-item.active::after {
      width: 100%;
    }
    
    .auth-buttons {
      display: flex;
      gap: 1rem;
    }
    
    .btn {
      display: inline-block;
      padding: 0.625rem 1.25rem;
      font-weight: 600;
      font-size: 0.875rem;
      text-align: center;
      text-decoration: none;
      border-radius: 0.375rem;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    
    .btn-outline {
      background-color: transparent;
      border: 1.5px solid var(--primary);
      color: var(--primary);
    }
    
    .btn-outline:hover {
      background-color: var(--primary-lighter);
    }
    
    .btn-primary {
      background-color: var(--primary);
      border: 1.5px solid var(--primary);
      color: white;
      box-shadow: var(--shadow-sm);
    }
    
    .btn-primary:hover {
      background-color: var(--primary-dark);
      border-color: var(--primary-dark);
      box-shadow: var(--shadow);
      transform: translateY(-1px);
    }
    
    .btn-secondary {
      background-color: var(--accent);
      border: 1.5px solid var(--accent);
      color: white;
      box-shadow: var(--shadow-sm);
    }
    
    .btn-secondary:hover {
      background-color: var(--accent-dark);
      border-color: var(--accent-dark);
      box-shadow: var(--shadow);
      transform: translateY(-1px);
    }
    
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 2rem;
    }
    
    .main-content {
      padding-top: 6rem;
    }
    
    .hero {
      background: linear-gradient(135deg, var(--primary-lighter) 0%, rgba(255, 255, 255, 0.8) 100%);
      padding: 5rem 2rem;
      text-align: center;
      margin-bottom: 4rem;
      border-radius: 0.5rem;
      position: relative;
      overflow: hidden;
    }
    
    .hero::after {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 100%;
      height: 200%;
      background: radial-gradient(circle, var(--primary-lighter) 0%, rgba(255, 255, 255, 0) 70%);
      opacity: 0.5;
      z-index: 0;
    }
    
    .hero-content {
      position: relative;
      z-index: 1;
    }
    
    .hero h1 {
      font-size: 3rem;
      font-weight: 800;
      color: var(--primary-dark);
      margin-bottom: 1.5rem;
      line-height: 1.2;
      font-family: 'Montserrat', sans-serif;
    }
    
    .hero p {
      font-size: 1.25rem;
      color: var(--text);
      max-width: 800px;
      margin: 0 auto 2rem;
      line-height: 1.6;
    }
    
    .hero-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    
    .section-title {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.5rem;
      text-align: center;
      font-family: 'Montserrat', sans-serif;
    }
    
    .section-subtitle {
      font-size: 1.125rem;
      color: var(--text-light);
      max-width: 800px;
      margin: 0 auto 3rem;
      text-align: center;
      line-height: 1.6;
    }
    
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 4rem;
    }
    
    .feature-card {
      background-color: white;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 2rem;
      transition: all 0.3s ease;
      box-shadow: var(--shadow);
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .feature-card:hover {
      transform: translateY(-5px);
      box-shadow: var(--shadow-lg);
      border-color: var(--primary-light);
    }
    
    .feature-icon {
      font-size: 2.5rem;
      color: var(--primary);
      margin-bottom: 1.5rem;
    }
    
    .feature-card h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1rem;
      font-family: 'Montserrat', sans-serif;
    }
    
    .feature-card p {
      color: var(--text-light);
      line-height: 1.6;
      flex-grow: 1;
    }
    
    .related-links {
      margin-bottom: 4rem;
    }
    
    .related-links h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.5rem;
      text-align: center;
      font-family: 'Montserrat', sans-serif;
    }
    
    .related-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
    }
    
    .related-link {
      background-color: var(--background-alt);
      color: var(--text);
      padding: 0.75rem 1.5rem;
      border-radius: 2rem;
      font-weight: 500;
      transition: all 0.2s ease;
      border: 1px solid var(--border);
    }
    
    .related-link:hover {
      background-color: var(--primary-lighter);
      color: var(--primary-dark);
      border-color: var(--primary-light);
    }
    
    .cta-section {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      padding: 4rem 2rem;
      text-align: center;
      border-radius: 0.5rem;
      color: white;
      margin-bottom: 4rem;
    }
    
    .cta-section h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      font-family: 'Montserrat', sans-serif;
    }
    
    .cta-section p {
      font-size: 1.125rem;
      max-width: 700px;
      margin: 0 auto 2rem;
      line-height: 1.6;
    }
    
    .footer {
      background-color: var(--background-alt);
      padding: 4rem 2rem 2rem;
      color: var(--text-light);
      border-top: 1px solid var(--border);
    }
    
    .footer-content {
      max-width: 1280px;
      margin: 0 auto;
    }
    
    .footer-main {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 3rem;
      margin-bottom: 3rem;
    }
    
    .footer-col h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 1rem;
      font-family: 'Montserrat', sans-serif;
    }
    
    .footer-links {
      list-style: none;
    }
    
    .footer-links li {
      margin-bottom: 0.5rem;
    }
    
    .footer-links a {
      color: var(--text-light);
      transition: all 0.2s ease;
    }
    
    .footer-links a:hover {
      color: var(--primary);
    }
    
    .footer-bottom {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
    }
    
    .social-links {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      justify-content: center;
    }
    
    .social-link {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: var(--background);
      color: var(--text-light);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      border: 1px solid var(--border);
    }
    
    .social-link:hover {
      background-color: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    
    .copyright {
      font-size: 0.875rem;
      color: var(--text-lighter);
    }
    
    @media screen and (max-width: 1024px) {
      .hero h1 {
        font-size: 2.5rem;
      }
    }
    
    @media screen and (max-width: 768px) {
      .nav, .auth-buttons {
        display: none;
      }
      
      .hero h1 {
        font-size: 2rem;
      }
      
      .hero p {
        font-size: 1.125rem;
      }
      
      .section-title {
        font-size: 1.75rem;
      }
      
      .hero-buttons {
        flex-direction: column;
        gap: 0.75rem;
      }
      
      .features {
        grid-template-columns: 1fr;
      }
    }
    ${extraStyles || ''}
  </style>
</head>
<body>
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <img src="https://img.freepik.com/premium-vector/green-health-logo_7888-106.jpg" alt="TrialSage Logo">
        TrialSage™
      </div>
      <nav class="nav">
        <a href="/" class="nav-item">Home</a>
        <a href="/solutions" class="nav-item ${isModule ? 'active' : ''}">Solutions</a>
        <a href="/use-cases" class="nav-item ${isUseCase ? 'active' : ''}">Use Cases</a>
        <a href="/personas" class="nav-item ${isPersona ? 'active' : ''}">Personas</a>
        <a href="/compare" class="nav-item ${isComparison ? 'active' : ''}">Compare</a>
        <a href="/about" class="nav-item">About</a>
      </nav>
      <div class="auth-buttons">
        <a href="/login" class="btn btn-outline">Log In</a>
        <a href="/signup" class="btn btn-primary">Sign Up</a>
      </div>
    </div>
  </header>

  ${bodyContent}

  <footer class="footer">
    <div class="footer-content">
      <div class="footer-main">
        <div class="footer-col">
          <h3>Solutions</h3>
          <ul class="footer-links">
            <li><a href="/solutions/csr-intelligence">CSR Intelligence™</a></li>
            <li><a href="/solutions/ind-wizard">IND Wizard™</a></li>
            <li><a href="/solutions/cmdr">Clinical Metadata Repository</a></li>
            <li><a href="/solutions/vault-workspace">Vault™ Workspace</a></li>
            <li><a href="/solutions/ich-wiz">ICH Wiz™</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Resources</h3>
          <ul class="footer-links">
            <li><a href="/resources/blog">Blog</a></li>
            <li><a href="/resources/webinars">Webinars</a></li>
            <li><a href="/resources/case-studies">Case Studies</a></li>
            <li><a href="/resources/whitepapers">Whitepapers</a></li>
            <li><a href="/resources/documentation">Documentation</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Company</h3>
          <ul class="footer-links">
            <li><a href="/about">About Us</a></li>
            <li><a href="/careers">Careers</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/press">Press</a></li>
            <li><a href="/partners">Partners</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Legal</h3>
          <ul class="footer-links">
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/security">Security</a></li>
            <li><a href="/compliance">Compliance</a></li>
            <li><a href="/cookies">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="social-links">
          <a href="#" class="social-link"><i class="fab fa-linkedin-in"></i></a>
          <a href="#" class="social-link"><i class="fab fa-twitter"></i></a>
          <a href="#" class="social-link"><i class="fab fa-facebook-f"></i></a>
          <a href="#" class="social-link"><i class="fab fa-youtube"></i></a>
        </div>
        <div class="copyright">
          &copy; 2026 TrialSage&trade; by Concept2Cure.AI. All rights reserved.
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}
