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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${route.title} | TrialSage™</title>
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
        <p>Join leading pharmaceutical companies who have accelerated their submissions and improved approval rates with TrialSage™.</p>
        <a href="/request-demo" class="btn btn-secondary">Request Demo</a>
      </section>
    </div>
  </div>
  
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
            <li><a href="/cookies">Cookie Settings</a></li>
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
          © 2025 TrialSage™ by Concept2Cure.AI. All rights reserved.
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}
