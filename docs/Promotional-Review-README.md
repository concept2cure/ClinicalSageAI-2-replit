# Promotional Review (MLR) Workflow

The Promotional Review (MLR) Workflow is an advanced module within TrialSage Vault™ designed to streamline the medical, legal, and regulatory review process for promotional materials with AI-powered claim analysis.

## Overview

Promotional material review is a critical compliance process for pharmaceutical and life sciences companies. The MLR Workflow module provides a structured, efficient process for reviewing promotional claims while leveraging AI to automatically identify potentially unsupported statements before human review begins.

## Key Features

### AI-Powered Claim Analysis

- **Automated Claim Detection**: Identifies promotional claims in submitted content
- **Evidence Matching**: Automatically links claims to supporting references in your document library
- **Gap Analysis**: Highlights claims with insufficient or missing supporting evidence
- **Risk Classification**: Assigns risk scores to claims based on regulatory precedent
- **Suggestion Engine**: Recommends alternative wording for high-risk claims

### Comprehensive Review Workflow

- **Configurable Review Routes**: Define sequential or parallel review paths based on content type
- **Role-Based Assignments**: Automatically route materials to appropriate medical, legal, and regulatory reviewers
- **Comment Aggregation**: Centralized collection and resolution of feedback from all reviewers
- **Version Comparison**: Side-by-side redline comparison between iterations
- **Approval Tracking**: Clear visibility into approval status and outstanding reviews

### Compliance Safeguards

- **Reference Library Integration**: Access to approved references and scientific data
- **Prior Approval Search**: Identify previously approved similar claims
- **Regulatory Guidance Links**: Direct links to relevant guidance for specific claim types
- **Audit Trail**: Complete history of all review activities, comments and changes
- **Final Approval Archive**: Immutable record of approved materials with supporting evidence

### Collaboration Tools

- **Real-time Notifications**: Alerts for new assignments, approaching deadlines, and status changes
- **In-context Commenting**: Precise feedback tied to specific content sections
- **Resolution Tracking**: Track comment status from initial feedback through resolution
- **Deadline Management**: Automated reminders for pending reviews
- **External Stakeholder Portal**: Secure access for agencies and external collaborators

## Technical Implementation

### Architecture

```
server/
  ├── routes/
  │   └── promo.js            # API endpoints for promotional review
  ├── services/
  │   ├── claim-analyzer.js   # AI-powered claim detection and analysis
  │   └── reference-matcher.js # Matches claims to supporting evidence
  ├── models/
  │   └── promo-workflow.js   # Data models for MLR process
  └── utils/
      └── compliance-checker.js # Regulatory compliance verification

client/
  ├── pages/
  │   └── PromoReview.jsx      # Main MLR dashboard
  └── components/
      ├── ClaimAnalysis.jsx    # AI analysis results interface
      ├── ReviewWorkflow.jsx   # Review process interface
      └── ComplianceCheck.jsx  # Compliance verification tools
```

### AI Claim Analysis Process

The AI claim analysis engine follows a sophisticated process to identify and assess promotional claims:

1. **Text Extraction**: Processes submitted content (documents, web pages, presentations)
2. **Claim Identification**: Uses NLP to identify statements that constitute promotional claims
3. **Reference Scanning**: Analyzes the document's references and your reference library
4. **Evidence Matching**: Attempts to match each claim with supporting evidence
5. **Risk Evaluation**: Assesses each claim based on:
   - Strength of supporting evidence
   - Regulatory precedent for similar claims
   - Presence of absolute statements or superlatives
   - Comparison claims against competitors
   - Off-label implications
6. **Report Generation**: Creates a comprehensive analysis for reviewer reference

## Data Model

The promotional review system is built around a flexible data model:

```javascript
{
  reviewId: "MLR-2025-123",
  title: "Product X Digital Campaign",
  submittedBy: "user-456",
  submissionDate: "2025-04-15",
  materialType: "Digital",
  brand: "Product X",
  priority: "Standard",
  dueDate: "2025-04-29",
  status: "In Review",
  currentVersion: 2,
  versions: [
    {
      versionId: 1,
      createdDate: "2025-04-15",
      status: "Rejected",
      document: "doc-789",
      aiAnalysis: {
        totalClaims: 14,
        unsupportedClaims: 3,
        highRiskClaims: 2,
        recommendedChanges: 5
      }
    },
    {
      versionId: 2,
      createdDate: "2025-04-22",
      status: "In Review",
      document: "doc-790",
      aiAnalysis: {
        totalClaims: 12,
        unsupportedClaims: 1,
        highRiskClaims: 0,
        recommendedChanges: 1
      }
    }
  ],
  reviewers: [
    {
      userId: "user-111",
      role: "Medical",
      status: "Approved",
      completedDate: "2025-04-24"
    },
    {
      userId: "user-222",
      role: "Legal",
      status: "In Progress",
      completedDate: null
    },
    {
      userId: "user-333",
      role: "Regulatory",
      status: "Pending",
      completedDate: null
    }
  ],
  comments: [
    {
      commentId: "comment-555",
      userId: "user-111",
      versionId: 2,
      location: "page 2, paragraph 3",
      text: "Please provide clinical trial reference for efficacy claim",
      status: "Open",
      createdDate: "2025-04-24",
      resolvedDate: null
    }
  ],
  claims: [
    {
      claimId: "claim-001",
      text: "Product X reduces symptoms by 60%",
      location: "page 1, headline",
      supportingReferences: ["ref-123", "ref-124"],
      riskLevel: "Medium",
      aiAssessment: "Partial support found. Referenced study shows 45-60% range with p<0.05.",
      status: "Under Review"
    }
  ]
}
```

## API Endpoints

The module exposes the following REST API endpoints:

- **POST /api/promo/submission** - Submit new material for review
- **GET /api/promo/submissions** - Get list of all submissions
- **GET /api/promo/submission/:id** - Get details for a specific submission
- **POST /api/promo/submission/:id/analyze** - Run AI analysis on submission
- **POST /api/promo/submission/:id/version** - Submit a new version
- **POST /api/promo/submission/:id/review** - Submit a review decision
- **POST /api/promo/submission/:id/comment** - Add a comment
- **PUT /api/promo/comment/:id** - Update comment status
- **GET /api/promo/dashboard** - Get promotional review metrics

## User Interface

### Submission Dashboard

The main MLR dashboard provides:

- **Review Queue**: List of materials pending review with status and deadline
- **My Tasks**: Personalized view of assigned reviews
- **Metrics View**: Performance data on review cycle times and approval rates
- **Search Interface**: Find previous reviews by product, claim type, or content

### AI Analysis Interface

The claim analysis view shows:

- **Claim Highlight**: Visual highlighting of claims within the content
- **Evidence Mapping**: Links between claims and supporting references
- **Risk Indicators**: Color-coded risk levels for each identified claim
- **Recommendation Panel**: AI-suggested alternatives for problematic claims
- **Reference Library**: Access to approved references and data

### Review Workflow Interface

The review interface includes:

- **Version Comparison**: Side-by-side comparison with previous versions
- **Comment Thread**: Discussion thread for each feedback item
- **Approval Controls**: Decision options (approve, reject, request changes)
- **Reference Checker**: Tool to verify supporting evidence
- **Final Approval View**: Summary screen before final approval submission

## Performance Metrics

Based on internal benchmarks, the Promotional Review Workflow delivers:

- **60% Reduction** in review cycle time
- **85% Decrease** in compliance issues post-launch
- **75% Fewer** revision cycles required
- **50% Reduction** in reviewer effort through AI pre-screening

## Future Enhancements

Planned enhancements for future releases:

1. **Cross-Market Adaptation**: Automated adaptation of approved claims for different markets
2. **Competitor Claim Database**: Repository of competitor claims and their supporting evidence
3. **Regulatory Precedent Matching**: Link to database of regulatory actions for similar claims
4. **Automated Copy Generation**: AI-assisted compliant content generation
5. **Multi-channel Preview**: Visualize how content will appear across different media

## Compliance Framework

The module is designed to support compliance with:

- **FDA Promotional Guidelines** (OPDP requirements)
- **EMA Regulations** on promotional materials
- **PMDA Standards** for pharmaceutical promotion
- **Industry Codes** including PhRMA, IFPMA, and EFPIA

## Support

For additional support with the Promotional Review Workflow:

- **Documentation**: Full user guide available in the Help Center
- **Training**: Role-specific training available through the TrialSage Academy
- **Support**: 24/7 support available via the support portal
- **Consultation**: Regulatory experts available for complex compliance questions
