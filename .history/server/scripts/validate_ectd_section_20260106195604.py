#!/usr/bin/env python3
import sys
import json
import os
import sys

# Add parent directory to path to import compliance_validator
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from compliance_validator import ComplianceValidator, ComplianceIssue
except ImportError:
    # Fallback if run from different CWD
    sys.path.append(os.getcwd())
    try:
        from server.compliance_validator import ComplianceValidator, ComplianceIssue
    except ImportError:
        # Last resort for direct execution
        sys.path.append(os.path.join(os.getcwd(), 'server'))
        from compliance_validator import ComplianceValidator, ComplianceIssue

def main():
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            return
            
        data = json.loads(input_data)
        content = data.get('content', '')
        section = data.get('section', 'General')
        
        validator = ComplianceValidator()
        
        # 1. Run Regulatory Checks (skipping structural checks for partial content)
        # mapped phase "general" to be safe for now
        regulatory_issues = validator._check_regulatory_compliance(content, phase="general")
        
        # 2. Convert to dictionary format expected by frontend
        findings = []
        for issue in regulatory_issues:
            findings.append({
                "id": str(issue.issue_id) if hasattr(issue, 'issue_id') else "reg-issue",
                "type": issue.severity.lower() if hasattr(issue, 'severity') else 'warning', # high->critical mapping handled in frontend or here
                "message": issue.description,
                "section": section,
                "citation": issue.guideline if hasattr(issue, 'guideline') else "FDA"
            })
            
        # 3. Generate AI suggestions if available and content is substantial
        if (validator.has_openai or validator.has_hf) and len(content) > 100:
             # Create temporary issues list for the AI to reason about
             ai_suggestions = validator._generate_suggestions(regulatory_issues, content)
             
             # Merge suggestions back into findings if possible, or add as separate items
             # For now, let's just append generic suggestions as "suggestion" type
             for suggestion in ai_suggestions:
                 findings.append({
                     "id": "ai-sugg",
                     "type": "suggestion",
                     "message": suggestion,
                     "section": section
                 })

        # 4. If no findings and content is short/empty, add a placeholder
        if not findings and len(content) < 50:
             findings.append({
                 "id": "warn-empty",
                 "type": "warning",
                 "message": "Content is too short for comprehensive regulatory validation.",
                 "section": section
             })
             
        # Output result
        print(json.dumps({
            "success": True,
            "findings": findings
        }))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "findings": [{
                "id": "err-script",
                "type": "warning",
                "message": f"Validation script error: {str(e)}",
                "section": "System"
            }]
        }))

if __name__ == "__main__":
    main()
