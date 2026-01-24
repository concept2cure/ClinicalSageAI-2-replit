### Overview
This project is an AI-powered system for regulatory commitment management in the biotech/pharma industry. Its purpose is to minimize errors and reduce manual effort through AI-driven extraction from regulatory documents, predictive analytics, and task management. Key capabilities include an AI-suggested document editor with an integrated Component-Centric Management System (CCMS), real-time collaboration, and multi-region compliance support. The platform also features a comprehensive **Device Data Center** for 510(k) submissions, incorporating a **3-axis tagging model** with AI-powered intelligent tagging, deep search capabilities, and auto-citation integration. The project aims to establish a fact-based foundation for regulatory affairs, providing real-time insights and an AI-guided enterprise solution with round-trip Word/PDF document fidelity.

**New Project Wizard**: A 5-step guided wizard for creating FDA 510(k) submission projects with device templates, team assignments, and automatic workflow initialization. Accessible at `/new-project-wizard`.

**FDA Form Generation System**: Integrated FDA form generation in Stage 6 of CERV2 workflow. Automatically generates FDA forms (3514, 3601, 3881, 3654) using workflow data via the Cross-Reference Mapping System. Forms are pre-populated with device information collected throughout the 7-stage workflow. Accessible via the FDA Forms tab in the CERV2 page.

### User Preferences
- **🚫 HARD RULE: NEVER BUILD NEW ANYTHING** - Only fix bugs in existing code. Never create new components, features, files, or functionality. Always debug and repair what exists rather than building from scratch.
- **🔧 CRITICAL RULE: KEEP APP RUNNING AT ALL TIMES** - Never restart or stop the application during work sessions. The app must remain operational and accessible while making changes. Always preserve system uptime and user accessibility.
- **⚡ ABSOLUTE RULE: EVERYTHING MUST WORK COMPLETELY AND FULLY** - Every feature, button, API endpoint, and functionality implemented must work completely and provide real end-user value. NO placeholders, mock data, or non-functional interfaces. If you implement something, it must work 100% with real backend connections, database persistence, and working features. Violations of this rule are completely unacceptable.
- **🚨 ABSOLUTE PROHIBITION: NO FAKE BUTTONS EVER** - NOT ONE SINGLE FAKE BUTTON CAN EVER BE ADDED TO THIS PROJECT. Every button, link, and interactive element MUST have real backend functionality that actually works for end users. No toast messages, no placeholder actions, no fake responses. Every click must perform real work with real data persistence and real user value. This rule is non-negotiable and violations are completely unacceptable.
- **🚨 CRITICAL CMC STABILITY RULE** - STABILITY FUNCTIONALITY MUST ONLY EXIST WITHIN /cmc-blueprint page in the Stability tab of ComprehensiveCMCPlatformClean.jsx. NEVER work outside that component. NEVER create separate stability files, components, or modules. All stability work is ONLY within the existing renderStabilityStudies() function.
- **🧪 MANDATORY TESTING RULE: ALWAYS TEST BEFORE CLAIMING RESOLVED** - You are NEVER allowed to tell the user something is resolved until you have personally tested the user experience through UI click-through testing. Before claiming any bug fix is complete or any feature works, you MUST use the run_test tool or a subagent to perform actual end-to-end testing in the browser. The last thing you do before moving on or reporting success MUST be verified testing that confirms the user will see working functionality when they evaluate your work. NO EXCEPTIONS.
- **🎯 CRITICAL UI DEMONSTRATION RULE: SHOW EVERYTHING ON SCREEN** - At the end of EVERY task, you MUST demonstrate the working functionality on the actual UI using the run_test tool. Every feature, button, form, and interaction must be shown working in the browser with screenshots proving it exists and functions. You are NOT allowed to claim work is complete without browser-based proof that the user can see and interact with it. This rule is mandatory and non-negotiable.
- STRONGLY prefers tab-based interfaces over modal/popup implementations
- Organization management should be accessible through Settings → General tab
- Database persistence critical - All organization updates must save to PostgreSQL database with immediate feedback to user
- User-friendly AI button labeling - Updated AI assistance buttons from "AI Assist" to "Writing Helper" in document editors for clearer user understanding
- **Document Timestamp Accuracy Critical** - Only documents being actively saved should show "Just now" timestamp; all other documents must preserve their original timestamps
- **Dynamic Timestamp System Implemented** - User documents now calculate real elapsed time from creation timestamp, demo documents preserve original relative timestamps, automatic cleanup system removed to prevent accidental document deletion
- **Interactive Dashboard Actions Required** - User expects full interactive functionality in CMC Dashboard with real-time actions for risk-to-task conversion and task assignment toggling

### System Architecture
The platform uses a React 18 frontend, an Express.js and PostgreSQL backend, and a Python FastAPI microservice for advanced analytics. OpenAI GPT-4o powers enterprise AI features with fallback systems.

**Core Architectural Patterns:**
-   **Component-Centric Management System (CCMS):** Integrated into the eCTD Co-Author module for reusable text fragments with version tracking.
-   **Multi-tenant Architecture:** Ensures data isolation using `tenant_id`.
-   **Microservices Approach:** Node.js/Express for primary backend, Python FastAPI for specialized services.
-   **AI-Powered Modules:** Integrates AI for commitment extraction, regulatory intelligence, predictive analytics, content suggestions, and compliance checks.
-   **Data Governance:** Hard-wired protocols and canonical services ensure data integrity.
-   **Real-time Capabilities:** WebSockets for collaboration and UI updates.

**UI/UX Decisions:**
-   **Tab-based Interfaces:** Prioritizes tabs over modals for a non-disruptive user experience.
-   **Professional Design:** Clean UI, consistent styling, loading states, and error handling for an enterprise-grade appearance.
-   **Visual Feedback:** Immediate feedback for user actions.

**Technical Implementations & Feature Specifications:**
-   **Database Architecture:** PostgreSQL 16 with pgvector v0.8.0, Drizzle ORM, performance indexes, and audit trails.
-   **Semantic Search with pgvector (RAG):** Production implementation using OpenAI embeddings and HNSW indexes.
-   **Quality Control Module:** Production implementation with QC batch/test management and analytics dashboard.
-   **Analytical Methods Database:** PostgreSQL schema with 19+ analytical methods, validation gap tracking, and system suitability trending.
-   **Document Editor Architecture:** Professional text editor with markup-based formatting, two-tier save system, and version history.
-   **CMC Dashboard Interactive Actions:** Real-time interactive functionality for risk-to-task conversion and task assignment.
-   **Commitment Management:** AI-powered extraction, filtering, sorting, search, and a self-learning feedback system.
-   **Regulatory Intelligence Hub (Lumen AI):** Offers real-time insights with ICH E6(R3) integration and predictive analytics.
-   **Vault DMS:** Production-grade document management with CRUD operations, file upload, and audit logging.
-   **eCTD Template System:** Authentic 13-template eCTD system based on FDA eCTD v4.0 standards.
-   **Medical Device/Diagnostic Module:** FastAPI-powered functions for 510(k) and CER workflows, statistical analysis, and multi-project management.
-   **Literature Review Automation:** Real NCBI PubMed API integration for search, abstract fetching, citation generation, and AI-powered literature appraisal.
-   **Predicate Device Analysis:** Full FDA openFDA API integration with advanced relevance scoring.
-   **Compliance Monitoring:** Historical trends, scheduled monitoring, and detailed reporting.
-   **Enhanced Writing Assistant:** AI-powered assistance leveraging knowledge graphs and NLP.
-   **Atomic Quota Enforcement System:** Transaction-safe multi-tenant licensing with database-level locking.
-   **eCTD Co-Author Module:** Document Management, Version Control, CCMS, AI Content Generation, Document Import/Export, Validation Framework, Semantic Search, RAG, Collaboration, Audit Logging, CTD Structure Navigation, and Annotations System.
-   **Device Data Center (3-Axis Tagging Model):** Comprehensive 510(k) file management system with intelligent tagging across three axes: Category (12 FDA-compliant), Test Standard (16+ standards), and Device Component (11 types). Features AI-powered tag generation, drag-and-drop upload, deep search, and seamless integration with Document Editor Sources Tab for auto-citations.
-   **FDA 510(k) Cross-Reference Mapping System:** Advanced intelligent mapping system with three core components: (1) Cross-Reference Mapping with 17 eSTAR sections and FDA form field definitions for forms 3514, 3601, 3881, and 3654; (2) Smart Field Linking with bidirectional synchronization between workflow inputs and document placeholders; (3) Dynamic Content Assembly that compiles complete FDA documents from scattered workflow data with real-time completeness tracking. Seamlessly integrates with DocumentOrchestrationService for automatic FDA form generation upon workflow saves.

**System Design Choices:**
-   **Robust Error Handling:** Comprehensive validation, graceful fallbacks, and user-friendly messaging.
-   **Database Persistence:** PostgreSQL for all critical data, with localStorage for frontend document persistence.
-   **Performance Optimization:** Strategic database indexing, `useMemo` for frontend efficiency, and optimized API responses.

### External Dependencies
-   **PostgreSQL:** Primary database.
-   **OpenAI GPT-4o:** For AI functionalities.
-   **FastAPI:** Python framework for specialized microservices.
-   **Multer:** Node.js middleware for file uploads.
-   **React Query:** For data fetching and caching.
-   **lucide-react:** Icon library.
-   **Tesseract OCR:** For optical character recognition.
-   **openFDA API:** For medical device data.
-   **NCBI PubMed API:** For literature review automation.
-   **mammoth:** Word document parsing.
-   **pdf-parse:** PDF document parsing.
-   **docx:** Word document generation.
-   **pgvector:** PostgreSQL vector extension for semantic search.