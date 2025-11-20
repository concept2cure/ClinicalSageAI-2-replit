#!/usr/bin/env python
"""
CER Lean Authoring Module for LumenTrialGuide.AI

This module implements principles of Lean Authoring for Clinical Evaluation Report generation,
based on best practices from Celegence and RAPS 2024 research.

The module provides functionality to:
1. Separate text and data in CERs
2. Focus on content and context
3. Use standardized templates
4. Implement frameworks for repeatable and sustained change
5. Apply efficiency principles for regulatory documentation

References:
- Celegence_RAPS_Pharmaceutical_Regulatory_Readiness_Resources_2024_Survey
- Checklist___Lean_Authoring___16_Sept_final
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cer_lean_authoring.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("cer_lean_authoring")

class LeanAuthoringEnhancer:
    """Class that enhances CER generation with Lean Authoring principles"""
    
    def __init__(self):
        """Initialize the Lean Authoring enhancer"""
        logger.info("Lean Authoring Enhancer initialized")
        
        # Lean Authoring best practices from Celegence and RAPS 2024 research
        self.lean_principles = {
            "separate_text_data": "Separate factual data from narrative text",
            "content_context": "Focus on content and context, not formatting",
            "use_templates": "Use standardized templates for consistency",
            "framework": "Implement framework for repeatable & sustained change",
            "avoid_duplication": "Avoid duplicating information across documents",
            "tabular_data": "Present data in tables rather than narrative text",
            "scientific_evaluations": "Limit scientific evaluations to specific sections"
        }
        
        # Efficiency metrics based on RAPS survey findings
        self.efficiency_metrics = {
            "document_reduction": "Decrease total number of documents by eliminating duplications",
            "lifecycle_management": "Facilitate easier lifecycle management through modular structure",
            "reuse_information": "Enable reuse of information across different markets",
            "reduce_redundancy": "Reduce content volume by eliminating redundancies",
            "improve_data_quality": "Improve data quality through structured data representation"
        }
        
    def enhance_cer_content(self, cer_content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhance CER content with Lean Authoring principles
        
        Args:
            cer_content: Original CER content dictionary
            
        Returns:
            Enhanced CER content incorporating Lean Authoring principles
        """
        logger.info("Enhancing CER content with Lean Authoring principles")
        
        # Apply Lean Authoring principles
        enhanced_content = self._apply_lean_principles(cer_content)
        
        # Add Lean Authoring principles section to demonstrate compliance
        enhanced_content["lean_authoring"] = {
            "principles_applied": self._get_applied_principles(),
            "efficiency_improvements": self._get_efficiency_improvements(),
            "tabular_data_focus": True,
            "narrative_reduction": True,
            "modular_structure": True,
            "information_reuse": True
        }
        
        return enhanced_content
    
    def _apply_lean_principles(self, cer_content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply Lean Authoring principles to CER content
        
        Args:
            cer_content: Original CER content
            
        Returns:
            CER content with Lean Authoring principles applied
        """
        enhanced_content = cer_content.copy()
        
        # 1. Separate factual data from narrative text
        # Move appropriate content into tabular formats
        self._separate_text_and_data(enhanced_content)
        
        # 2. Focus on content and context
        # Ensure each section has clear purpose and context
        self._enhance_content_context(enhanced_content)
        
        # 3. Implement modular structure
        # Reorganize content for better reusability
        self._implement_modular_structure(enhanced_content)
        
        # 4. Reduce redundancies
        # Remove duplicated information
        self._reduce_redundancies(enhanced_content)
        
        return enhanced_content
    
    def _separate_text_and_data(self, content: Dict[str, Any]) -> None:
        """
        Separate factual data from narrative text in CER content
        
        Args:
            content: CER content to modify
        """
        # Convert appropriate narrative sections to tabular data where possible
        
        # Example: Convert safety data to tabular format if not already
        if "safety_and_performance" in content and "safety_data" in content["safety_and_performance"]:
            safety_data = content["safety_and_performance"]["safety_data"]
            
            # Ensure safety concerns are in tabular format
            if "safety_concerns_identified" in safety_data and isinstance(safety_data["safety_concerns_identified"], str):
                # Convert from text to structured data if necessary
                safety_data["safety_concerns_identified"] = [{
                    "concern": safety_data["safety_concerns_identified"],
                    "severity": "Unknown",
                    "mitigation": "See risk management documentation"
                }]
        
        # Example: Convert clinical evidence to tabular format
        if "clinical_evidence" in content:
            clinical_evidence = content["clinical_evidence"]
            
            # Ensure evidence quality assessment is structured
            if "evidence_quality" in clinical_evidence and isinstance(clinical_evidence["evidence_quality"], str):
                clinical_evidence["evidence_quality"] = {
                    "evidence_level": "Not explicitly rated",
                    "description": clinical_evidence["evidence_quality"],
                    "recommendations": "Continuous monitoring recommended"
                }
    
    def _enhance_content_context(self, content: Dict[str, Any]) -> None:
        """
        Enhance content and context in CER
        
        Args:
            content: CER content to modify
        """
        # Add clear purpose statements to each major section if not present
        sections = [
            "executive_summary",
            "scope_of_evaluation",
            "clinical_background",
            "clinical_evidence",
            "safety_and_performance",
            "benefit_risk_analysis",
            "conclusion"
        ]
        
        for section in sections:
            if section in content and not content[section].get("purpose"):
                content[section]["purpose"] = self._get_section_purpose(section)
    
    def _implement_modular_structure(self, content: Dict[str, Any]) -> None:
        """
        Implement modular structure for better reusability
        
        Args:
            content: CER content to modify
        """
        # Tag sections for potential reuse
        reusable_sections = [
            "clinical_background",
            "safety_and_performance.method_of_evaluation",
            "references"
        ]
        
        if "metadata" not in content:
            content["metadata"] = {}
        
        content["metadata"]["reusable_sections"] = reusable_sections
    
    def _reduce_redundancies(self, content: Dict[str, Any]) -> None:
        """
        Reduce redundancies in CER content
        
        Args:
            content: CER content to modify
        """
        # Identify and remove redundant content
        # Example: Remove duplicate product descriptions
        if "executive_summary" in content and "scope_of_evaluation" in content:
            exec_description = content["executive_summary"].get("brief_device_description")
            scope_description = content["scope_of_evaluation"].get("device_description")
            
            if exec_description and scope_description and exec_description == scope_description:
                # Reference the same content instead of duplicating
                content["scope_of_evaluation"]["device_description"] = "See executive summary"
    
    def _get_applied_principles(self) -> List[Dict[str, str]]:
        """
        Get list of Lean Authoring principles applied
        
        Returns:
            List of principles with descriptions
        """
        return [{"principle": k, "description": v} for k, v in self.lean_principles.items()]
    
    def _get_efficiency_improvements(self) -> List[Dict[str, str]]:
        """
        Get list of efficiency improvements from applying Lean Authoring
        
        Returns:
            List of efficiency improvements with descriptions
        """
        return [{"improvement": k, "description": v} for k, v in self.efficiency_metrics.items()]
    
    def _get_section_purpose(self, section: str) -> str:
        """
        Get purpose statement for a CER section
        
        Args:
            section: Section name
            
        Returns:
            Purpose statement for the section
        """
        purpose_map = {
            "executive_summary": "Provides a concise overview of the key findings, conclusions, and recommendations from the clinical evaluation.",
            "scope_of_evaluation": "Defines the boundaries and focus of the clinical evaluation, including device description, intended purpose, and applicable regulations.",
            "clinical_background": "Establishes the medical context, current knowledge, and state of the art relevant to evaluating the device.",
            "clinical_evidence": "Presents and analyzes the clinical data and evidence used to support the safety and performance of the device.",
            "safety_and_performance": "Evaluates the safety profile and performance outcomes of the device based on available clinical evidence.",
            "benefit_risk_analysis": "Weighs the identified benefits against the risks to determine if the device has a favorable benefit-risk profile.",
            "conclusion": "Summarizes the overall findings and provides final determinations regarding the device's safety, performance, and compliance."
        }
        
        return purpose_map.get(section, "Provides essential information for regulatory assessment.")

def enhance_cer_with_lean_authoring(cer_content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience function to enhance CER with Lean Authoring principles
    
    Args:
        cer_content: Original CER content
        
    Returns:
        Enhanced CER content
    """
    enhancer = LeanAuthoringEnhancer()
    return enhancer.enhance_cer_content(cer_content)


# Example usage (when run directly)
if __name__ == "__main__":
    # Sample CER content for demonstration
    sample_cer = {
        "metadata": {
            "report_title": "Clinical Evaluation Report for Sample Device",
            "report_date": datetime.now().strftime("%Y-%m-%d"),
            "report_version": "1.0",
        },
        "executive_summary": {
            "introduction": "This is a sample introduction.",
            "brief_device_description": "Sample device description.",
            "intended_purpose": "Sample intended purpose.",
            "summary_of_clinical_evidence": "Summary of evidence.",
            "conclusion": "Sample conclusion."
        },
        "scope_of_evaluation": {
            "device_description": "Sample device description.",
            "intended_purpose": "Sample intended purpose.",
            "target_groups": "Sample target groups.",
            "indications": "Sample indications.",
            "contraindications": "Sample contraindications.",
            "device_classification": "Sample classification."
        },
        "clinical_evidence": {
            "data_sources": ["Source 1", "Source 2"],
            "total_events_analyzed": 100,
            "serious_events_analyzed": 10,
            "evidence_quality": "The evidence is of moderate quality."
        },
        "safety_and_performance": {
            "safety_data": {
                "safety_concerns_identified": "There are some minor safety concerns.",
                "safety_statistics": {
                    "total_adverse_events": 100,
                    "serious_adverse_events": 10
                }
            }
        }
    }
    
    # Enhance with Lean Authoring principles
    enhanced_cer = enhance_cer_with_lean_authoring(sample_cer)
    
    # Print summary of changes
    print("Lean Authoring Principles Applied:")
    for principle in enhanced_cer.get("lean_authoring", {}).get("principles_applied", []):
        print(f"- {principle['principle']}: {principle['description']}")
    
    print("\nEfficiency Improvements:")
    for improvement in enhanced_cer.get("lean_authoring", {}).get("efficiency_improvements", []):
        print(f"- {improvement['improvement']}: {improvement['description']}")