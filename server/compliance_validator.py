"""
Compliance Validator for TrialSage
----------------------------------
This module analyzes clinical trial protocol text for regulatory compliance issues,
structural problems, and CSR alignment gaps. It provides detailed feedback and
suggested fixes based on regulatory guidelines and best practices.
"""

import re
import os
from typing import Dict, List, Any, Optional, Tuple
import json

# Check if OpenAI API key is available
try:
    import openai
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
    openai.api_key = OPENAI_API_KEY
    OPENAI_AVAILABLE = OPENAI_API_KEY is not None
except ImportError:
    OPENAI_AVAILABLE = False

# Check if Hugging Face API key is available
try:
    from huggingface_hub import InferenceClient
    HF_API_KEY = os.environ.get("HF_API_KEY")
    HF_AVAILABLE = HF_API_KEY is not None
except ImportError:
    HF_AVAILABLE = False

# Regulatory guidelines structure
REGULATORY_GUIDELINES = {
    "fda": {
        "general": [
            "Protocol should include a clear statement of the primary objective",
            "Study design must be clearly described",
            "Inclusion and exclusion criteria must be specified",
            "Statistical methods must be described in detail",
            "Safety monitoring procedures must be outlined"
        ],
        "phase1": [
            "Dose escalation criteria must be specified",
            "Safety assessment criteria must be detailed"
        ],
        "phase2": [
            "Endpoint selection must be justified",
            "Sample size calculation must be provided"
        ],
        "phase3": [
            "Primary and secondary endpoints must be clearly distinguished",
            "Power calculations must be included"
        ]
    },
    "ema": {
        "general": [
            "Protocol should include risk management measures",
            "Pharmacovigilance procedures must be described"
        ]
    },
    "ich": {
        "general": [
            "Protocol should follow ICH E6 Good Clinical Practice guidelines"
        ]
    }
}

# Protocol section patterns for structural validation
PROTOCOL_SECTIONS = {
    "title": r"(?i)^\s*(title|protocol\s+title)",
    "objectives": r"(?i)^\s*(objectives?|study\s+objectives?)",
    "background": r"(?i)^\s*(background|introduction|rationale)",
    "study_design": r"(?i)^\s*(study\s+design|trial\s+design)",
    "inclusion_criteria": r"(?i)^\s*(inclusion\s+criteria|eligibility)",
    "exclusion_criteria": r"(?i)^\s*(exclusion\s+criteria)",
    "endpoints": r"(?i)^\s*(endpoints?|outcome\s+measures?)",
    "statistical_methods": r"(?i)^\s*(statistical\s+methods|statistics|data\s+analysis)",
    "sample_size": r"(?i)^\s*(sample\s+size|power\s+calculation)",
    "safety_monitoring": r"(?i)^\s*(safety\s+monitoring|adverse\s+events|ae\s+reporting)"
}

class ComplianceIssue:
    """Represents a compliance issue found in the protocol."""
    
    def __init__(self, 
                 issue_type: str, 
                 description: str, 
                 severity: str,
                 location: Optional[str] = None,
                 guideline: Optional[str] = None,
                 suggestion: Optional[str] = None):
        """
        Initialize a compliance issue.
        
        Args:
            issue_type: Type of issue (regulatory, structural, csr_alignment)
            description: Description of the issue
            severity: Severity level (high, medium, low)
            location: Where in the protocol the issue was found
            guideline: Specific regulatory guideline related to the issue
            suggestion: Suggested fix for the issue
        """
        self.issue_type = issue_type
        self.description = description
        self.severity = severity
        self.location = location
        self.guideline = guideline
        self.suggestion = suggestion
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "issue_type": self.issue_type,
            "description": self.description,
            "severity": self.severity,
            "location": self.location,
            "guideline": self.guideline,
            "suggestion": self.suggestion
        }

class ComplianceValidator:
    """
    Analyzes protocol text for compliance with regulatory guidelines,
    structural completeness, and alignment with CSR best practices.
    """
    
    def __init__(self):
        """Initialize the compliance validator."""
        self.has_openai = OPENAI_AVAILABLE
        self.has_hf = HF_AVAILABLE
        
        if self.has_hf:
            self.hf_client = InferenceClient(token=HF_API_KEY)
    
    def validate_protocol(self, 
                         protocol_text: str, 
                         phase: str = "general",
                         indication: Optional[str] = None) -> Dict[str, Any]:
        """
        Validate a clinical trial protocol for compliance issues.
        
        Args:
            protocol_text: The full text of the protocol
            phase: Clinical trial phase (phase1, phase2, phase3, or general)
            indication: The therapeutic area/indication
            
        Returns:
            Dictionary with validation results
        """
        # Initialize issues list
        issues = []
        
        # Check structural completeness
        structural_issues = self._check_structural_completeness(protocol_text)
        issues.extend(structural_issues)
        
        # Check regulatory compliance
        regulatory_issues = self._check_regulatory_compliance(protocol_text, phase)
        issues.extend(regulatory_issues)
        
        # Check CSR alignment if indication is provided
        if indication:
            csr_alignment_issues = self._check_csr_alignment(protocol_text, indication, phase)
            issues.extend(csr_alignment_issues)
        
        # Get overall compliance score
        compliance_score = self._calculate_compliance_score(issues)
        
        # Generate suggestions using AI if available
        suggestions = self._generate_suggestions(issues, protocol_text) if (self.has_openai or self.has_hf) else []
        
        return {
            "compliance_score": compliance_score,
            "issues": [issue.to_dict() for issue in issues],
            "suggestions": suggestions,
            "missing_sections": [i.location for i in issues if i.issue_type == "structural" and "missing" in i.description.lower()],
            "critical_issues": [i.to_dict() for i in issues if i.severity == "high"]
        }
    
    def _check_structural_completeness(self, protocol_text: str) -> List[ComplianceIssue]:
        """
        Check if the protocol contains all required sections.
        
        Args:
            protocol_text: The full text of the protocol
            
        Returns:
            List of structural compliance issues
        """
        issues = []
        
        # Check for each required section
        for section_name, pattern in PROTOCOL_SECTIONS.items():
            if not re.search(pattern, protocol_text, re.MULTILINE):
                issues.append(ComplianceIssue(
                    issue_type="structural",
                    description=f"Missing {section_name.replace('_', ' ')} section",
                    severity="high" if section_name in ["objectives", "inclusion_criteria", "endpoints"] else "medium",
                    location=section_name,
                    suggestion=f"Add a dedicated section for {section_name.replace('_', ' ')}"
                ))
        
        # Check for empty or minimal sections (sections with less than 50 characters)
        for section_name, pattern in PROTOCOL_SECTIONS.items():
            match = re.search(pattern, protocol_text, re.MULTILINE)
            if match:
                # Find the content until the next section or end of text
                start_pos = match.end()
                section_content = ""
                
                # Extract section content (until next section heading or end of text)
                for next_section, next_pattern in PROTOCOL_SECTIONS.items():
                    if next_section != section_name:
                        next_match = re.search(next_pattern, protocol_text[start_pos:], re.MULTILINE)
                        if next_match:
                            section_content = protocol_text[start_pos:start_pos + next_match.start()].strip()
                            break
                
                if not section_content:
                    section_content = protocol_text[start_pos:].strip()
                
                if len(section_content) < 50:
                    issues.append(ComplianceIssue(
                        issue_type="structural",
                        description=f"Insufficient content in {section_name.replace('_', ' ')} section",
                        severity="medium",
                        location=section_name,
                        suggestion=f"Expand the {section_name.replace('_', ' ')} section with more details"
                    ))
        
        return issues
    
    def _check_regulatory_compliance(self, protocol_text: str, phase: str) -> List[ComplianceIssue]:
        """
        Check if the protocol complies with regulatory guidelines.
        
        Args:
            protocol_text: The full text of the protocol
            phase: Clinical trial phase
            
        Returns:
            List of regulatory compliance issues
        """
        issues = []
        
        # Check FDA guidelines
        for guideline in REGULATORY_GUIDELINES["fda"]["general"]:
            keyword_pattern = self._guideline_to_pattern(guideline)
            if not re.search(keyword_pattern, protocol_text, re.IGNORECASE):
                issues.append(ComplianceIssue(
                    issue_type="regulatory",
                    description=f"May not comply with FDA guideline: {guideline}",
                    severity="high",
                    guideline="FDA General",
                    suggestion=f"Address the requirement: {guideline}"
                ))
        
        # Check phase-specific FDA guidelines
        phase_key = phase.lower() if phase.lower() in ["phase1", "phase2", "phase3"] else None
        if phase_key and phase_key in REGULATORY_GUIDELINES["fda"]:
            for guideline in REGULATORY_GUIDELINES["fda"][phase_key]:
                keyword_pattern = self._guideline_to_pattern(guideline)
                if not re.search(keyword_pattern, protocol_text, re.IGNORECASE):
                    issues.append(ComplianceIssue(
                        issue_type="regulatory",
                        description=f"May not comply with FDA {phase} guideline: {guideline}",
                        severity="high",
                        guideline=f"FDA {phase}",
                        suggestion=f"Address the requirement: {guideline}"
                    ))
        
        # Check EMA guidelines
        for guideline in REGULATORY_GUIDELINES["ema"]["general"]:
            keyword_pattern = self._guideline_to_pattern(guideline)
            if not re.search(keyword_pattern, protocol_text, re.IGNORECASE):
                issues.append(ComplianceIssue(
                    issue_type="regulatory",
                    description=f"May not comply with EMA guideline: {guideline}",
                    severity="medium",
                    guideline="EMA General",
                    suggestion=f"Address the requirement: {guideline}"
                ))
        
        # Check ICH guidelines
        for guideline in REGULATORY_GUIDELINES["ich"]["general"]:
            keyword_pattern = self._guideline_to_pattern(guideline)
            if not re.search(keyword_pattern, protocol_text, re.IGNORECASE):
                issues.append(ComplianceIssue(
                    issue_type="regulatory",
                    description=f"May not comply with ICH guideline: {guideline}",
                    severity="medium",
                    guideline="ICH General",
                    suggestion=f"Address the requirement: {guideline}"
                ))
        
        return issues
    
    def _check_csr_alignment(self, protocol_text: str, indication: str, phase: str) -> List[ComplianceIssue]:
        """
        Check if the protocol aligns with CSR best practices for the given indication.
        Note: In a real implementation, this would query a database or use ML to compare
        with successful CSRs in the same indication and phase.
        
        Args:
            protocol_text: The full text of the protocol
            indication: The therapeutic area/indication
            phase: Clinical trial phase
            
        Returns:
            List of CSR alignment issues
        """
        issues = []
        
        # Note: For a production system, you would query your CSR database here
        # or use a model to compare with similar successful protocols
        
        # Check for standard endpoints in the indication
        # These would come from your CSR database in a real implementation
        standard_endpoints = self._get_standard_endpoints(indication, phase)
        
        # Find the endpoints section
        endpoints_pattern = PROTOCOL_SECTIONS["endpoints"]
        endpoints_match = re.search(endpoints_pattern, protocol_text, re.MULTILINE)
        
        if endpoints_match:
            # Extract endpoints section content
            start_pos = endpoints_match.end()
            endpoints_section = protocol_text[start_pos:start_pos + 2000]  # Limit to reasonable size
            
            # Check for standard endpoints
            for endpoint in standard_endpoints:
                if not re.search(r'\b' + re.escape(endpoint) + r'\b', endpoints_section, re.IGNORECASE):
                    issues.append(ComplianceIssue(
                        issue_type="csr_alignment",
                        description=f"Common endpoint '{endpoint}' for {indication} studies may be missing",
                        severity="medium",
                        location="endpoints",
                        suggestion=f"Consider adding '{endpoint}' as an endpoint based on successful trials in {indication}"
                    ))
        
        return issues
    
    def _get_standard_endpoints(self, indication: str, phase: str) -> List[str]:
        """
        Get standard endpoints for a given indication and phase.
        This is a placeholder - in a real implementation this would query a database.
        
        Args:
            indication: The therapeutic area/indication
            phase: Clinical trial phase
            
        Returns:
            List of standard endpoints
        """
        # This is a simplified version; a real implementation would query your CSR database
        standard_endpoints = []
        
        indication = indication.lower()
        
        if "diabet" in indication:
            standard_endpoints = ["HbA1c", "Fasting plasma glucose", "Body weight", "Insulin sensitivity"]
        elif "oncolog" in indication or "cancer" in indication:
            standard_endpoints = ["Overall survival", "Progression-free survival", "Objective response rate", "Disease control rate"]
        elif "cardiovascular" in indication or "heart" in indication:
            standard_endpoints = ["MACE", "Cardiovascular death", "Blood pressure", "LDL cholesterol"]
        elif "alzheimer" in indication or "dementia" in indication:
            standard_endpoints = ["ADAS-Cog", "MMSE", "CDR-SB", "Functional assessment"]
        elif "pain" in indication:
            standard_endpoints = ["Visual analog scale", "Numeric rating scale", "Pain interference", "Rescue medication use"]
        elif "asthma" in indication or "copd" in indication or "respiratory" in indication:
            standard_endpoints = ["FEV1", "Asthma exacerbations", "Symptom-free days", "Rescue medication use"]
        elif "depression" in indication or "psychiatr" in indication:
            standard_endpoints = ["HAM-D", "MADRS", "CGI-S", "Response rate"]
        else:
            # Generic endpoints for any indication
            standard_endpoints = ["Safety and tolerability", "Adverse events", "Efficacy measures"]
        
        return standard_endpoints
    
    def _guideline_to_pattern(self, guideline: str) -> str:
        """
        Convert a guideline to a regex pattern for checking.
        
        Args:
            guideline: The guideline text
            
        Returns:
            Regex pattern to search for
        """
        # Extract key phrases
        key_phrases = []
        words = guideline.lower().split()
        
        for i in range(len(words)):
            if words[i] in ["must", "should"]:
                # Get the subject and verb phrase
                if i > 1:
                    key_phrase = " ".join(words[i-2:i+3])
                    key_phrases.append(key_phrase)
                
                # Get the object of the requirement
                if i < len(words) - 3:
                    key_phrase = " ".join(words[i+1:i+4])
                    key_phrases.append(key_phrase)
        
        # Add the main subject of the guideline
        subjects = ["objective", "design", "criteria", "methods", "procedures", "statistics", 
                  "safety", "sample size", "endpoints", "pharmacovigilance"]
        
        for subject in subjects:
            if subject in guideline.lower():
                key_phrases.append(subject)
        
        # If no key phrases found, use the whole guideline
        if not key_phrases:
            key_phrases = [guideline]
        
        # Create OR pattern of all key phrases
        pattern_parts = [re.escape(phrase) for phrase in key_phrases]
        return "(" + "|".join(pattern_parts) + ")"
    
    def _calculate_compliance_score(self, issues: List[ComplianceIssue]) -> int:
        """
        Calculate an overall compliance score based on issues found.
        
        Args:
            issues: List of compliance issues
            
        Returns:
            Compliance score (0-100)
        """
        # Start with perfect score
        score = 100
        
        # Deduct points for each issue based on severity
        for issue in issues:
            if issue.severity == "high":
                score -= 10
            elif issue.severity == "medium":
                score -= 5
            else:
                score -= 2
        
        # Ensure score doesn't go below 0
        return max(0, score)
    
    def _generate_suggestions(self, issues: List[ComplianceIssue], protocol_text: str) -> List[Dict[str, str]]:
        """
        Generate suggestions to fix compliance issues.
        
        Args:
            issues: List of compliance issues
            protocol_text: Original protocol text
            
        Returns:
            List of suggestions
        """
        suggestions = []
        
        # Group issues by section/location
        issues_by_location = {}
        for issue in issues:
            location = issue.location if issue.location else "general"
            if location not in issues_by_location:
                issues_by_location[location] = []
            issues_by_location[location].append(issue)
        
        # Generate suggestions for each section with issues
        for location, section_issues in issues_by_location.items():
            # Prepare a description of the issues
            issues_description = "\n".join([f"- {issue.description}" for issue in section_issues])
            
            if self.has_openai:
                try:
                    suggestion_text = self._generate_suggestion_openai(location, issues_description, protocol_text)
                    suggestions.append({
                        "section": location,
                        "issues": [issue.description for issue in section_issues],
                        "suggestion": suggestion_text
                    })
                except Exception as e:
                    print(f"Error generating suggestion with OpenAI: {e}")
                    # Fallback to basic suggestion
                    suggestions.append({
                        "section": location,
                        "issues": [issue.description for issue in section_issues],
                        "suggestion": section_issues[0].suggestion if section_issues[0].suggestion else "Review and revise this section to address compliance issues."
                    })
            elif self.has_hf:
                try:
                    suggestion_text = self._generate_suggestion_hf(location, issues_description, protocol_text)
                    suggestions.append({
                        "section": location,
                        "issues": [issue.description for issue in section_issues],
                        "suggestion": suggestion_text
                    })
                except Exception as e:
                    print(f"Error generating suggestion with Hugging Face: {e}")
                    # Fallback to basic suggestion
                    suggestions.append({
                        "section": location,
                        "issues": [issue.description for issue in section_issues],
                        "suggestion": section_issues[0].suggestion if section_issues[0].suggestion else "Review and revise this section to address compliance issues."
                    })
        
        return suggestions
    
    def _generate_suggestion_openai(self, section: str, issues_description: str, protocol_text: str) -> str:
        """
        Generate a suggestion using OpenAI.
        
        Args:
            section: Protocol section
            issues_description: Description of issues
            protocol_text: Original protocol text
            
        Returns:
            Suggestion text
        """
        # Extract the relevant section from the protocol text
        section_pattern = PROTOCOL_SECTIONS.get(section, fr"(?i)^\s*{section}")
        section_text = ""
        
        if section != "general":
            section_match = re.search(section_pattern, protocol_text, re.MULTILINE)
            if section_match:
                start_pos = section_match.end()
                # Try to find the next section
                next_section_pattern = r"(?i)^\s*([\w\s]+:)"
                next_section_match = re.search(next_section_pattern, protocol_text[start_pos:], re.MULTILINE)
                
                if next_section_match:
                    section_text = protocol_text[start_pos:start_pos + next_section_match.start()].strip()
                else:
                    # Take a reasonable chunk if no next section found
                    section_text = protocol_text[start_pos:start_pos + 1000].strip()
        
        # Prepare the prompt
        prompt = f"""
        You are an expert in clinical trial protocols and regulatory compliance. 
        Please provide a specific, detailed suggestion to fix the following issues in the '{section}' section of a clinical trial protocol:
        
        ISSUES:
        {issues_description}
        
        CURRENT SECTION TEXT (if available):
        {section_text[:500]}
        
        Please provide a specific, actionable suggestion that addresses these issues and would help the protocol comply with regulatory guidelines.
        """
        
        # Generate the suggestion
        response = openai.ChatCompletion.create(
            model="gpt-4-turbo-preview",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3
        )
        
        suggestion = response.choices[0].message.content.strip()
        return suggestion
    
    def _generate_suggestion_hf(self, section: str, issues_description: str, protocol_text: str) -> str:
        """
        Generate a suggestion using Hugging Face.
        
        Args:
            section: Protocol section
            issues_description: Description of issues
            protocol_text: Original protocol text
            
        Returns:
            Suggestion text
        """
        # Extract the relevant section from the protocol text
        section_pattern = PROTOCOL_SECTIONS.get(section, fr"(?i)^\s*{section}")
        section_text = ""
        
        if section != "general":
            section_match = re.search(section_pattern, protocol_text, re.MULTILINE)
            if section_match:
                start_pos = section_match.end()
                # Try to find the next section
                next_section_pattern = r"(?i)^\s*([\w\s]+:)"
                next_section_match = re.search(next_section_pattern, protocol_text[start_pos:], re.MULTILINE)
                
                if next_section_match:
                    section_text = protocol_text[start_pos:start_pos + next_section_match.start()].strip()
                else:
                    # Take a reasonable chunk if no next section found
                    section_text = protocol_text[start_pos:start_pos + 1000].strip()
        
        # Prepare the prompt
        prompt = f"""
        You are an expert in clinical trial protocols and regulatory compliance. 
        Please provide a specific, detailed suggestion to fix the following issues in the '{section}' section of a clinical trial protocol:
        
        ISSUES:
        {issues_description}
        
        CURRENT SECTION TEXT (if available):
        {section_text[:500]}
        
        Please provide a specific, actionable suggestion that addresses these issues and would help the protocol comply with regulatory guidelines.
        """
        
        # Call Hugging Face model (using the Mistral 7B model which is good for this task)
        try:
            response = self.hf_client.text_generation(
                prompt,
                model="mistralai/Mistral-7B-Instruct-v0.2",
                max_new_tokens=500,
                temperature=0.3
            )
            return response
        except Exception as e:
            print(f"Error calling Hugging Face model: {e}")
            return f"Please review the '{section}' section to address the compliance issues identified. Ensure all regulatory requirements are met and the section contains sufficient detail."

    def extract_protocol_metadata(self, protocol_text: str) -> Dict[str, Any]:
        """
        Extract basic metadata from a protocol.
        
        Args:
            protocol_text: The protocol text
            
        Returns:
            Dictionary with extracted metadata
        """
        metadata = {
            "title": None,
            "phase": None,
            "indication": None
        }
        
        # Try to extract title
        title_patterns = [
            r"(?i)^\s*title[:\s]+(.+?)$",
            r"(?i)protocol\s+title[:\s]+(.+?)$",
            r"(?i)study\s+title[:\s]+(.+?)$"
        ]
        
        for pattern in title_patterns:
            match = re.search(pattern, protocol_text, re.MULTILINE)
            if match:
                metadata["title"] = match.group(1).strip()
                break
        
        # Try to extract phase
        phase_patterns = [
            r"(?i)phase\s+([1-4])",
            r"(?i)phase\s+([I-IV])"
        ]
        
        for pattern in phase_patterns:
            match = re.search(pattern, protocol_text)
            if match:
                phase = match.group(1)
                # Convert Roman numerals if needed
                if phase in ["I", "i"]:
                    metadata["phase"] = "phase1"
                elif phase in ["II", "ii"]:
                    metadata["phase"] = "phase2"
                elif phase in ["III", "iii"]:
                    metadata["phase"] = "phase3"
                elif phase in ["IV", "iv"]:
                    metadata["phase"] = "phase4"
                else:
                    metadata["phase"] = f"phase{phase}"
                break
        
        # Try to extract indication (requires more context, so using AI if available would be better)
        indication_patterns = [
            r"(?i)indication[s]?[:\s]+(.+?)[\.\n]",
            r"(?i)disease[:\s]+(.+?)[\.\n]",
            r"(?i)condition[:\s]+(.+?)[\.\n]"
        ]
        
        for pattern in indication_patterns:
            match = re.search(pattern, protocol_text)
            if match:
                metadata["indication"] = match.group(1).strip()
                break
        
        return metadata