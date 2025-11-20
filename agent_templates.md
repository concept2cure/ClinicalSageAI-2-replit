# Replit Agent Command Templates - Enhanced Control System

Use these exact phrases when interacting with the Replit Agent for maximum control and safety:

## 🔍 Analysis Commands (Read-Only):

- "ANALYZE ONLY - do not modify: [describe what to analyze]"
- "EXPLAIN EXISTING CODE in [file path] - no changes"
- "LIST FILES that contain [specific pattern] - read-only"
- "SHOW ME the structure of [component/function] - inspection only"
- "REVIEW ARCHITECTURE for [module/component] - documentation only"
- "IDENTIFY DEPENDENCIES in [file/module] - mapping only"
- "TRACE DATA FLOW in [component] - visualization only"

## ⚠️ Controlled Modification Commands:

- "AWAIT APPROVAL - propose changes to [specific file] for [exact purpose]"
- "SINGLE FILE ONLY - modify [exact file path] to [specific change]"
- "CONFIRM BEFORE EXECUTING - [specific task]"
- "ENHANCE EXISTING FUNCTION: [function name] in [file] to [specific improvement]"
- "ADD NEW FEATURE to [specific component] - [detailed requirements]"
- "REFACTOR COMPONENT: [component name] for [specific optimization]"

## 🛡️ Safety Commands:

- "READ-ONLY MODE - inspect [target] without changes"
- "BACKUP BEFORE CHANGES: [file/component]"
- "VALIDATE SYNTAX ONLY: [file path]"
- "STOP ALL ACTIONS - revert to read-only mode"
- "CANCEL CURRENT OPERATION - await new instructions"
- "EMERGENCY ROLLBACK: [component/file]"

## 🏥 TrialSage Module-Specific Commands:

### CER (Clinical Evaluation Report) Module:

- "CER MODULE ONLY - work on [specific task] in client/src/components/cer/"
- "CER GENERATION ONLY - modify [specific generator] for [purpose]"
- "CER VALIDATION ONLY - enhance [validation component]"
- "CER COMPLIANCE ONLY - update [compliance checker]"

### CoAuthor Document System:

- "COAUTHOR MODULE ONLY - work on [task] in client/src/components/coauthor/"
- "DOCUMENT EDITOR ONLY - enhance [editor feature]"
- "DOCUMENT TEMPLATE ONLY - modify [template type]"
- "COLLABORATION ONLY - update [collaboration feature]"

### 510k FDA Submission:

- "510K MODULE ONLY - work on [task] in client/src/components/510k/"
- "FDA COMPLIANCE ONLY - update [compliance component]"
- "PREDICATE ANALYSIS ONLY - enhance [analysis feature]"
- "SUBMISSION BUILDER ONLY - modify [builder component]"

### Server-Side Operations:

- "SERVER ROUTE ONLY - modify [specific route] for [exact purpose]"
- "API ENDPOINT ONLY - enhance [endpoint] in server/routes/"
- "DATABASE SCHEMA ONLY - adjust [table/field] in shared/schema.ts"
- "MIDDLEWARE ONLY - update [middleware] in server/middleware/"

### Client-Side Components:

- "CLIENT COMPONENT ONLY - update [component] in client/src/components/"
- "UI LIBRARY ONLY - enhance [ui component] in client/src/components/ui/"
- "SERVICE LAYER ONLY - modify [service] in client/src/services/"
- "HOOK ONLY - update [hook] in client/src/hooks/"

## 🚨 Priority Levels:

- "LOW PRIORITY: [task description]"
- "MEDIUM PRIORITY: [task description]"
- "HIGH PRIORITY: [task description]"
- "CRITICAL PRIORITY: [task description]"

## 📋 Context Templates:

- "CONTEXT: Working on regulatory compliance feature for [specific regulation]"
- "CONTEXT: Enhancing user experience for [specific user type]"
- "CONTEXT: Fixing bug related to [specific functionality]"
- "CONTEXT: Optimizing performance for [specific operation]"
- "CONTEXT: Adding security enhancement for [specific area]"

## 🔐 Approval Workflow:

1. "PROPOSE CHANGES FIRST - do not implement immediately"
2. "SHOW DIFF PREVIEW - before making changes"
3. "AWAIT EXPLICIT APPROVAL - for each file modification"
4. "CONFIRM COMPLETION - after successful implementation"

## 🎯 Complete Command Structure:

```
🔒 REPLIT AGENT - STRICT CONTROL MODE

📋 COMMAND: [Primary action using templates above]
🎯 MODULE: [Specific TrialSage module]
🚨 PRIORITY: [Low/Medium/High/Critical]
⚠️ CONSTRAINTS: [Specific limitations and requirements]
📊 CONTEXT: [Background information and goals]
✅ APPROVAL: [Required/Granted/Pending]
```

## 🛠️ Example Complete Commands:

### Safe Analysis:

```
🔒 REPLIT AGENT - STRICT CONTROL MODE
📋 COMMAND: ANALYZE ONLY - review CER generation workflow
🎯 MODULE: CER
🚨 PRIORITY: Medium
⚠️ CONSTRAINTS: Read-only analysis, no code changes
📊 CONTEXT: Understanding current CER generation process for optimization planning
✅ APPROVAL: Not required for read-only analysis
```

### Controlled Modification:

```
🔒 REPLIT AGENT - STRICT CONTROL MODE
📋 COMMAND: AWAIT APPROVAL - enhance CER validation component
🎯 MODULE: CER
🚨 PRIORITY: High
⚠️ CONSTRAINTS: Only modify client/src/components/cer/CerValidationPanel.jsx
📊 CONTEXT: Adding EU MDR compliance checks to existing validation
✅ APPROVAL: REQUIRED - awaiting explicit approval
```
