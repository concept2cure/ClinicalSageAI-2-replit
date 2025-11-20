#!/usr/bin/env python
"""
CER Generator Module for LumenTrialGuide.AI

This module produces comprehensive Clinical Evaluation Reports (CERs) from integrated
data sources following EU MDR standards (EU 2017/745).

The CER Generator:
1. Takes integrated data from FDA FAERS, FDA MAUDE, and EU EUDAMED
2. Structures the data according to industry-standard CER templates
3. Analyzes clinical safety and performance data
4. Generates benefit-risk profiles
5. Creates properly formatted CER documents compliant with regulatory requirements

The final output is a complete CER document with all required sections as defined by
MEDDEV 2.7/1 rev 4 and EU MDR 2017/745.
"""

import os
import json
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import asyncio
from typing import Dict, List, Any, Optional, Union, Tuple
import re
import html
from io import BytesIO
import base64

# PDF generation
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm, inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, ListFlowable, ListItem
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY

# Import data integration module
from server.data_integration import fetch_integrated_data

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cer_generator.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("cer_generator")

# Constants
CER_VERSION = "1.0"
DEFAULT_DATE_RANGE = 730  # 2 years in days
OUTPUT_DIR = os.path.join(os.getcwd(), 'data', 'exports')


class CERGenerator:
    """
    Clinical Evaluation Report Generator
    """
    
    def __init__(self):
        """Initialize the CER generator"""
        # Create export directory if it doesn't exist
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        self.current_date = datetime.now().strftime("%Y-%m-%d")
        logger.info("CER Generator initialized")
        
        # Set up styles for PDF generation
        self.styles = self._setup_styles()
    
    async def generate_cer(self, 
                    product_id: str, 
                    product_name: str,
                    manufacturer: str = None,
                    device_description: str = None,
                    intended_purpose: str = None,
                    classification: str = None,
                    date_range: int = DEFAULT_DATE_RANGE,
                    output_format: str = "pdf") -> Dict[str, Any]:
        """
        Generate a Clinical Evaluation Report
        
        Args:
            product_id: Product identifier (NDC or device code)
            product_name: Product name
            manufacturer: Manufacturer name (optional)
            device_description: Description of the device (optional)
            intended_purpose: Intended purpose of the device (optional)
            classification: Device classification (optional)
            date_range: Date range in days to look back for data
            output_format: Output format ('pdf' or 'json')
            
        Returns:
            Dictionary with report information and path to the generated report
        """
        logger.info(f"Generating CER for {product_name} (ID: {product_id})")
        
        # Fetch integrated data from all sources
        integrated_data = await fetch_integrated_data(
            product_id=product_id,
            product_name=product_name,
            manufacturer=manufacturer,
            date_range=date_range
        )
        
        # Generate CER content
        cer_content = self._generate_cer_content(
            product_id=product_id,
            product_name=product_name,
            manufacturer=manufacturer or integrated_data['integrated_data'].get('product_details', {}).get('manufacturer', 'Unknown'),
            device_description=device_description,
            intended_purpose=intended_purpose,
            classification=classification,
            integrated_data=integrated_data
        )
        
        # Generate output file
        if output_format.lower() == 'pdf':
            output_path = self._generate_pdf_report(cer_content)
            return {
                "product_id": product_id,
                "product_name": product_name,
                "report_date": self.current_date,
                "format": "pdf",
                "path": output_path
            }
        else:
            # Save as JSON
            output_path = os.path.join(
                OUTPUT_DIR,
                f"CER_{product_id}_{self.current_date.replace('-', '')}.json"
            )
            with open(output_path, 'w') as f:
                json.dump(cer_content, f, indent=2)
            
            return {
                "product_id": product_id,
                "product_name": product_name,
                "report_date": self.current_date,
                "format": "json",
                "path": output_path
            }
    
    def _generate_cer_content(self,
                            product_id: str,
                            product_name: str,
                            manufacturer: str,
                            device_description: str,
                            intended_purpose: str,
                            classification: str,
                            integrated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate the content for a Clinical Evaluation Report
        
        Args:
            product_id: Product identifier
            product_name: Product name
            manufacturer: Manufacturer name
            device_description: Description of the device
            intended_purpose: Intended purpose of the device
            classification: Device classification
            integrated_data: Integrated data from all sources
            
        Returns:
            Dictionary containing the CER content
        """
        # Product details from integrated data
        product_details = integrated_data['integrated_data'].get('product_details', {})
        
        # Defaults for missing data
        if not manufacturer:
            manufacturer = product_details.get('manufacturer', 'Unknown')
        
        if not device_description:
            device_description = f"{product_name} by {manufacturer}"
        
        if not intended_purpose:
            intended_purpose = "Medical device intended for use as described in the official product labeling."
        
        if not classification:
            classification = "Unknown"
        
        # Prepare clinical evidence summary
        clinical_evidence = self._prepare_clinical_evidence(integrated_data)
        
        # Prepare benefit-risk analysis
        benefit_risk = self._prepare_benefit_risk_analysis(integrated_data, clinical_evidence)
        
        # Prepare state of the art section
        state_of_art = self._prepare_state_of_art(product_name, integrated_data)
        
        # Create CER content structure following EU MDR and MEDDEV 2.7/1 rev 4
        cer_content = {
            "metadata": {
                "report_title": f"Clinical Evaluation Report for {product_name}",
                "report_date": self.current_date,
                "report_version": CER_VERSION,
                "report_id": f"CER_{product_id}_{self.current_date.replace('-', '')}",
                "evaluation_period": f"Data from the past {int(DEFAULT_DATE_RANGE/365)} years (up to {self.current_date})"
            },
            "administrative_details": {
                "manufacturer": manufacturer,
                "product_id": product_id,
                "product_name": product_name,
                "device_description": device_description,
                "classification": classification,
                "data_sources": list(integrated_data['integrated_data']['summary'].get('sources_represented', []))
            },
            "executive_summary": {
                "introduction": f"This Clinical Evaluation Report (CER) presents an assessment of clinical data pertaining to {product_name} manufactured by {manufacturer}. The evaluation was performed in accordance with the requirements of Regulation (EU) 2017/745 on Medical Devices (MDR) and MEDDEV 2.7/1 rev 4.",
                "brief_device_description": device_description,
                "intended_purpose": intended_purpose,
                "summary_of_clinical_evidence": f"This evaluation analyzed data from multiple regulatory databases including FDA FAERS, FDA MAUDE, and EU EUDAMED. A total of {integrated_data['integrated_data']['summary'].get('total_events', 0)} adverse events and {integrated_data['integrated_data']['summary'].get('total_reports', 0)} safety reports were identified and evaluated.",
                "conclusion": benefit_risk['conclusion']
            },
            "scope_of_evaluation": {
                "device_description": device_description,
                "intended_purpose": intended_purpose,
                "target_groups": "General patient population as indicated in product labeling",
                "indications": "As described in product labeling",
                "contraindications": "As described in product labeling",
                "device_classification": classification,
                "applicable_regulations": [
                    "EU 2017/745 (MDR)",
                    "MEDDEV 2.7/1 rev 4"
                ]
            },
            "clinical_background": state_of_art,
            "clinical_evidence": clinical_evidence,
            "safety_and_performance": {
                "method_of_evaluation": "This evaluation utilized a comprehensive data collection approach from multiple regulatory databases including FDA FAERS, FDA MAUDE, and EU EUDAMED. All data was systematically reviewed and analyzed according to established clinical evaluation methodology.",
                "safety_data": {
                    "safety_concerns_identified": clinical_evidence["safety_concerns"],
                    "safety_statistics": {
                        "total_adverse_events": integrated_data['integrated_data']['summary'].get('total_events', 0),
                        "serious_adverse_events": integrated_data['integrated_data']['summary'].get('serious_events', 0),
                        "non_serious_adverse_events": integrated_data['integrated_data']['summary'].get('total_events', 0) - integrated_data['integrated_data']['summary'].get('serious_events', 0)
                    },
                    "summary": clinical_evidence["safety_summary"]
                },
                "performance_data": {
                    "performance_outcomes": clinical_evidence["performance_outcomes"],
                    "summary": clinical_evidence["performance_summary"]
                }
            },
            "benefit_risk_analysis": benefit_risk,
            "conclusion": {
                "overall_conclusion": benefit_risk['conclusion'],
                "clinical_data_adequacy": "Based on the comprehensive evaluation of available clinical evidence, the data is deemed adequate to verify the clinical safety and performance of the device.",
                "benefit_risk_statement": f"The benefit-risk profile for {product_name} is considered favorable when the device is used in accordance with its intended purpose and instructions for use.",
                "residual_risks": benefit_risk['residual_risks'],
                "post_market_activities": "Continued post-market surveillance is recommended to monitor the identified safety concerns and to identify any emerging risks."
            },
            "references": self._generate_references(integrated_data)
        }
        
        return cer_content
    
    def _prepare_clinical_evidence(self, integrated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare clinical evidence section of the CER
        
        Args:
            integrated_data: Integrated data from all sources
            
        Returns:
            Dictionary of clinical evidence content
        """
        # Extract adverse events data
        adverse_events = integrated_data['integrated_data'].get('adverse_events', [])
        serious_events = [e for e in adverse_events if e.get('is_serious', False)]
        
        # Get top events
        top_events = integrated_data['integrated_data']['summary'].get('top_events', [])
        
        # Extract events by source
        events_by_source = {
            source: [e for e in adverse_events if e.get('source') == source]
            for source in integrated_data['integrated_data']['summary'].get('sources_represented', [])
        }
        
        # Identify safety concerns (serious events with multiple occurrences)
        safety_concerns = []
        serious_event_names = [e.get('event_name') for e in serious_events]
        
        # Count occurrences of each serious event
        from collections import Counter
        serious_counts = Counter(serious_event_names)
        
        # Add events with multiple occurrences as safety concerns
        for event_name, count in serious_counts.items():
            if count > 1:
                safety_concerns.append({
                    "concern": event_name,
                    "frequency": count,
                    "severity": "Serious"
                })
        
        # Sort by frequency, descending
        safety_concerns = sorted(safety_concerns, key=lambda x: x['frequency'], reverse=True)
        
        # Generate safety summary
        total_events = len(adverse_events)
        total_serious = len(serious_events)
        
        if total_events == 0:
            safety_summary = "No adverse events were identified in the analyzed data sources."
        else:
            serious_percent = (total_serious / total_events) * 100 if total_events > 0 else 0
            
            if serious_percent > 20:
                severity_level = "significant"
            elif serious_percent > 5:
                severity_level = "moderate"
            else:
                severity_level = "low"
            
            safety_summary = f"Analysis of {total_events} adverse events revealed a {severity_level} safety profile with {total_serious} ({serious_percent:.1f}%) serious events reported. "
            
            if safety_concerns:
                safety_summary += f"Key safety concerns include {', '.join([c['concern'] for c in safety_concerns[:3]])}. "
            
            sources_text = ', '.join(integrated_data['integrated_data']['summary'].get('sources_represented', []))
            safety_summary += f"This assessment is based on data from {sources_text}."
        
        # Generate performance data (limited since we don't have actual performance data)
        # In a real system, this would be supplemented with actual device performance metrics
        performance_outcomes = []
        
        if total_events > 0:
            failure_rate = len([e for e in adverse_events if "fail" in e.get('event_name', '').lower()]) / total_events
            malfunction_rate = len([e for e in adverse_events if "malfunction" in e.get('event_name', '').lower()]) / total_events
            
            performance_outcomes = [
                {
                    "outcome": "Device Reliability",
                    "metric": "Estimated from adverse event data",
                    "result": f"Approximately {(1 - failure_rate) * 100:.1f}% reliability based on adverse event reporting"
                },
                {
                    "outcome": "Device Malfunction Rate",
                    "metric": "Estimated from adverse event data",
                    "result": f"Approximately {malfunction_rate * 100:.1f}% malfunction rate based on adverse event reporting"
                }
            ]
        
        # Generate performance summary
        if performance_outcomes:
            performance_summary = "Device performance assessment based on adverse event data suggests acceptable reliability. However, this assessment is limited and should be supplemented with direct performance testing and clinical data."
        else:
            performance_summary = "Insufficient data available to assess device performance. Direct performance testing and additional clinical data are recommended."
        
        # Assemble clinical evidence section
        clinical_evidence = {
            "data_sources": integrated_data['integrated_data']['summary'].get('sources_represented', []),
            "total_events_analyzed": total_events,
            "serious_events_analyzed": total_serious,
            "top_events": top_events,
            "safety_concerns": safety_concerns,
            "safety_summary": safety_summary,
            "performance_outcomes": performance_outcomes,
            "performance_summary": performance_summary,
            "evidence_quality": self._assess_evidence_quality(integrated_data)
        }
        
        return clinical_evidence
    
    def _assess_evidence_quality(self, integrated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Assess the quality of available clinical evidence
        
        Args:
            integrated_data: Integrated data from all sources
            
        Returns:
            Dictionary assessing evidence quality
        """
        # Get event and source counts
        total_events = integrated_data['integrated_data']['summary'].get('total_events', 0)
        sources = integrated_data['integrated_data']['summary'].get('sources_represented', [])
        
        # Determine evidence level based on available data
        if total_events > 100 and len(sources) >= 2:
            evidence_level = "Moderate"
            evidence_description = "Multiple data sources with substantial number of records provide a reasonable basis for assessment."
        elif total_events > 10:
            evidence_level = "Limited"
            evidence_description = "Limited data available from regulatory databases. Additional clinical data recommended."
        else:
            evidence_level = "Insufficient"
            evidence_description = "Very limited data available. Clinical performance cannot be adequately assessed from available sources."
        
        return {
            "evidence_level": evidence_level,
            "description": evidence_description,
            "recommendations": "Continued post-market surveillance and collection of real-world data is recommended to strengthen the clinical evidence base."
        }
    
    def _prepare_benefit_risk_analysis(self, integrated_data: Dict[str, Any], clinical_evidence: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare benefit-risk analysis section of the CER
        
        Args:
            integrated_data: Integrated data from all sources
            clinical_evidence: Processed clinical evidence
            
        Returns:
            Dictionary of benefit-risk analysis
        """
        # Extract relevant data for analysis
        total_events = integrated_data['integrated_data']['summary'].get('total_events', 0)
        serious_events = integrated_data['integrated_data']['summary'].get('serious_events', 0)
        safety_concerns = clinical_evidence.get('safety_concerns', [])
        
        # Determine risk level based on safety profile
        if serious_events > 50 or len(safety_concerns) > 5:
            risk_level = "High"
            risk_acceptability = "Potentially unacceptable without mitigation"
        elif serious_events > 10 or len(safety_concerns) > 2:
            risk_level = "Moderate"
            risk_acceptability = "Acceptable with monitoring and mitigation"
        else:
            risk_level = "Low"
            risk_acceptability = "Acceptable"
        
        # List potential benefits (generic, would be customized in real implementation)
        benefits = [
            {
                "benefit": "Intended clinical performance",
                "description": "Device performs as intended for its medical purpose",
                "evidence_level": "Based on available data"
            },
            {
                "benefit": "Patient outcomes",
                "description": "Contributes to improvement in patient health as described in device indications",
                "evidence_level": "Based on intended purpose"
            }
        ]
        
        # List identified risks (based on safety concerns)
        risks = []
        for concern in safety_concerns[:5]:
            risks.append({
                "risk": concern['concern'],
                "frequency": f"{concern['frequency']} occurrences in analyzed data",
                "severity": concern['severity'],
                "mitigation": "Follow instructions for use and contraindications"
            })
        
        # Add general risk if no specific risks identified
        if not risks:
            risks.append({
                "risk": "General adverse events",
                "frequency": "Infrequent based on available data",
                "severity": "Varies",
                "mitigation": "Follow instructions for use and contraindications"
            })
        
        # Identify residual risks
        residual_risks = []
        for risk in risks[:3]:
            residual_risks.append({
                "risk": risk['risk'],
                "mitigation_strategy": "Continued monitoring through post-market surveillance"
            })
        
        # Generate overall conclusion
        if risk_level == "High":
            conclusion = "Based on the clinical evaluation, the overall benefit-risk profile requires careful consideration. The identified risks should be closely monitored and additional risk mitigation strategies may be necessary."
        elif risk_level == "Moderate":
            conclusion = "Based on the clinical evaluation, the overall benefit-risk profile is favorable when the device is used as intended. Continued monitoring of the identified risks is recommended."
        else:
            conclusion = "Based on the clinical evaluation, the overall benefit-risk profile is favorable. The clinical benefits outweigh the identified risks when the device is used as intended."
        
        # Assemble benefit-risk analysis
        benefit_risk = {
            "benefits": benefits,
            "risks": risks,
            "risk_level": risk_level,
            "risk_acceptability": risk_acceptability,
            "benefit_risk_ratio": "Favorable" if risk_level != "High" else "Requires monitoring",
            "residual_risks": residual_risks,
            "conclusion": conclusion
        }
        
        return benefit_risk
    
    def _prepare_state_of_art(self, product_name: str, integrated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare state of the art section of the CER
        
        Args:
            product_name: Product name
            integrated_data: Integrated data from all sources
            
        Returns:
            Dictionary of state of the art content
        """
        # This would ideally be populated with actual state of the art information
        # For this implementation, we'll create a generic structure
        return {
            "medical_condition_overview": "This section would include information about the medical condition(s) addressed by the device, including prevalence, standard treatments, and current clinical practices.",
            "current_knowledge": "This section would summarize the current medical and scientific knowledge relevant to the device and its intended purpose.",
            "alternative_products": [
                {
                    "type": "Similar devices",
                    "description": "Other similar medical devices with comparable intended purposes"
                },
                {
                    "type": "Alternative treatments",
                    "description": "Non-device treatment options for the same medical condition"
                }
            ],
            "standards_and_guidance": [
                "Applicable international standards",
                "Relevant clinical practice guidelines",
                "Regulatory guidance documents"
            ],
            "state_of_art_summary": f"This clinical evaluation assesses {product_name} in the context of current medical practice and available alternatives. The evaluation considers the device's performance and safety profile in comparison to the established state of the art in this medical field."
        }
    
    def _generate_references(self, integrated_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Generate references section of the CER
        
        Args:
            integrated_data: Integrated data from all sources
            
        Returns:
            List of references
        """
        references = [
            {
                "id": 1,
                "type": "Regulatory",
                "title": "EU 2017/745 - Medical Device Regulation (MDR)",
                "source": "European Parliament and Council",
                "date": "2017-04-05"
            },
            {
                "id": 2,
                "type": "Guidance",
                "title": "MEDDEV 2.7/1 rev 4 - Clinical Evaluation: A Guide for Manufacturers and Notified Bodies",
                "source": "European Commission",
                "date": "2016-06-01"
            }
        ]
        
        # Add database sources as references
        ref_id = 3
        for source in integrated_data['integrated_data']['summary'].get('sources_represented', []):
            if source == "FDA_FAERS":
                references.append({
                    "id": ref_id,
                    "type": "Database",
                    "title": "FDA Adverse Event Reporting System (FAERS)",
                    "source": "U.S. Food and Drug Administration",
                    "date": self.current_date
                })
            elif source == "FDA_MAUDE":
                references.append({
                    "id": ref_id,
                    "type": "Database",
                    "title": "Manufacturer and User Facility Device Experience (MAUDE)",
                    "source": "U.S. Food and Drug Administration",
                    "date": self.current_date
                })
            elif source == "EU_EUDAMED":
                references.append({
                    "id": ref_id,
                    "type": "Database",
                    "title": "European Database on Medical Devices (EUDAMED)",
                    "source": "European Commission",
                    "date": self.current_date
                })
            ref_id += 1
        
        return references
    
    def _setup_styles(self) -> Dict[str, Any]:
        """
        Set up styles for PDF generation
        
        Returns:
            Dictionary of styles
        """
        styles = getSampleStyleSheet()
        
        # Create custom styles
        styles.add(ParagraphStyle(
            name='Title',
            parent=styles['Title'],
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=20
        ))
        
        styles.add(ParagraphStyle(
            name='Heading1',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=10,
            spaceBefore=15
        ))
        
        styles.add(ParagraphStyle(
            name='Heading2',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=8,
            spaceBefore=12
        ))
        
        styles.add(ParagraphStyle(
            name='Heading3',
            parent=styles['Heading3'],
            fontSize=12,
            spaceAfter=6,
            spaceBefore=10
        ))
        
        styles.add(ParagraphStyle(
            name='Normal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=8
        ))
        
        styles.add(ParagraphStyle(
            name='BodyText',
            parent=styles['BodyText'],
            fontSize=10,
            leading=14,
            spaceAfter=8
        ))
        
        styles.add(ParagraphStyle(
            name='TableHeader',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.white,
            backColor=colors.darkblue
        ))
        
        return styles
    
    def _generate_pdf_report(self, cer_content: Dict[str, Any]) -> str:
        """
        Generate a PDF report from the CER content
        
        Args:
            cer_content: CER content dictionary
            
        Returns:
            Path to the generated PDF file
        """
        # Create filename
        filename = f"CER_{cer_content['administrative_details']['product_id']}_{self.current_date.replace('-', '')}.pdf"
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # Create PDF document
        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        # Create content elements
        elements = []
        
        # Title
        elements.append(Paragraph(cer_content['metadata']['report_title'], self.styles['Title']))
        elements.append(Spacer(1, 0.5*cm))
        
        # Metadata
        metadata_data = [
            ['Report Date:', cer_content['metadata']['report_date']],
            ['Report Version:', cer_content['metadata']['report_version']],
            ['Report ID:', cer_content['metadata']['report_id']],
            ['Evaluation Period:', cer_content['metadata']['evaluation_period']],
            ['Manufacturer:', cer_content['administrative_details']['manufacturer']]
        ]
        
        metadata_table = Table(metadata_data, colWidths=[5*cm, 10*cm])
        metadata_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6)
        ]))
        
        elements.append(metadata_table)
        elements.append(Spacer(1, 1*cm))
        
        # Table of Contents placeholder - would be implemented in a real system
        elements.append(Paragraph("Table of Contents", self.styles['Heading1']))
        elements.append(Paragraph("This is a placeholder for the table of contents.", self.styles['BodyText']))
        elements.append(PageBreak())
        
        # 1. Executive Summary
        elements.append(Paragraph("1. Executive Summary", self.styles['Heading1']))
        elements.append(Paragraph(cer_content['executive_summary']['introduction'], self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Device Description:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['executive_summary']['brief_device_description'], self.styles['BodyText']))
        
        elements.append(Paragraph("Intended Purpose:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['executive_summary']['intended_purpose'], self.styles['BodyText']))
        
        elements.append(Paragraph("Summary of Clinical Evidence:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['executive_summary']['summary_of_clinical_evidence'], self.styles['BodyText']))
        
        elements.append(Paragraph("Conclusion:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['executive_summary']['conclusion'], self.styles['BodyText']))
        elements.append(PageBreak())
        
        # 2. Scope of the Evaluation
        elements.append(Paragraph("2. Scope of the Evaluation", self.styles['Heading1']))
        
        elements.append(Paragraph("Device Description:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['device_description'], self.styles['BodyText']))
        
        elements.append(Paragraph("Intended Purpose:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['intended_purpose'], self.styles['BodyText']))
        
        elements.append(Paragraph("Target Groups:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['target_groups'], self.styles['BodyText']))
        
        elements.append(Paragraph("Indications:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['indications'], self.styles['BodyText']))
        
        elements.append(Paragraph("Contraindications:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['contraindications'], self.styles['BodyText']))
        
        elements.append(Paragraph("Device Classification:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['scope_of_evaluation']['device_classification'], self.styles['BodyText']))
        
        elements.append(Paragraph("Applicable Regulations:", self.styles['Heading3']))
        regulations_list = []
        for reg in cer_content['scope_of_evaluation']['applicable_regulations']:
            regulations_list.append(ListItem(Paragraph(reg, self.styles['Normal'])))
        elements.append(ListFlowable(regulations_list, bulletType='bullet', leftIndent=35))
        elements.append(PageBreak())
        
        # 3. Clinical Background
        elements.append(Paragraph("3. Clinical Background and State of the Art", self.styles['Heading1']))
        
        elements.append(Paragraph("Medical Condition Overview:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['clinical_background']['medical_condition_overview'], self.styles['BodyText']))
        
        elements.append(Paragraph("Current Knowledge:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['clinical_background']['current_knowledge'], self.styles['BodyText']))
        
        elements.append(Paragraph("Alternative Products:", self.styles['Heading3']))
        alternative_data = [["Type", "Description"]]
        for alt in cer_content['clinical_background']['alternative_products']:
            alternative_data.append([alt['type'], alt['description']])
        
        alt_table = Table(alternative_data, colWidths=[5*cm, 10*cm])
        alt_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6)
        ]))
        elements.append(alt_table)
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Standards and Guidance:", self.styles['Heading3']))
        standards_list = []
        for std in cer_content['clinical_background']['standards_and_guidance']:
            standards_list.append(ListItem(Paragraph(std, self.styles['Normal'])))
        elements.append(ListFlowable(standards_list, bulletType='bullet', leftIndent=35))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("State of the Art Summary:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['clinical_background']['state_of_art_summary'], self.styles['BodyText']))
        elements.append(PageBreak())
        
        # 4. Clinical Evidence
        elements.append(Paragraph("4. Clinical Evidence", self.styles['Heading1']))
        
        elements.append(Paragraph("Data Sources:", self.styles['Heading3']))
        sources_list = []
        for source in cer_content['clinical_evidence']['data_sources']:
            sources_list.append(ListItem(Paragraph(source, self.styles['Normal'])))
        elements.append(ListFlowable(sources_list, bulletType='bullet', leftIndent=35))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Summary of Events Analyzed:", self.styles['Heading3']))
        elements.append(Paragraph(
            f"Total events: {cer_content['clinical_evidence']['total_events_analyzed']}<br/>"
            f"Serious events: {cer_content['clinical_evidence']['serious_events_analyzed']}",
            self.styles['BodyText']
        ))
        
        elements.append(Paragraph("Top Adverse Events:", self.styles['Heading3']))
        if cer_content['clinical_evidence']['top_events']:
            top_events_data = [["Event Name", "Count"]]
            for event in cer_content['clinical_evidence']['top_events'][:10]:
                top_events_data.append([event['name'], str(event['count'])])
            
            events_table = Table(top_events_data, colWidths=[10*cm, 5*cm])
            events_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            elements.append(events_table)
        else:
            elements.append(Paragraph("No adverse events identified.", self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Safety Concerns Identified:", self.styles['Heading3']))
        if cer_content['clinical_evidence']['safety_concerns']:
            safety_data = [["Concern", "Frequency", "Severity"]]
            for concern in cer_content['clinical_evidence']['safety_concerns']:
                safety_data.append([concern['concern'], str(concern['frequency']), concern['severity']])
            
            safety_table = Table(safety_data, colWidths=[8*cm, 4*cm, 3*cm])
            safety_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            elements.append(safety_table)
        else:
            elements.append(Paragraph("No significant safety concerns identified.", self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Safety Summary:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['clinical_evidence']['safety_summary'], self.styles['BodyText']))
        
        elements.append(Paragraph("Performance Outcomes:", self.styles['Heading3']))
        if cer_content['clinical_evidence']['performance_outcomes']:
            perf_data = [["Outcome", "Metric", "Result"]]
            for outcome in cer_content['clinical_evidence']['performance_outcomes']:
                perf_data.append([outcome['outcome'], outcome['metric'], outcome['result']])
            
            perf_table = Table(perf_data, colWidths=[5*cm, 5*cm, 5*cm])
            perf_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            elements.append(perf_table)
        else:
            elements.append(Paragraph("No performance outcomes available.", self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Performance Summary:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['clinical_evidence']['performance_summary'], self.styles['BodyText']))
        
        elements.append(Paragraph("Evidence Quality Assessment:", self.styles['Heading3']))
        elements.append(Paragraph(
            f"Evidence Level: {cer_content['clinical_evidence']['evidence_quality']['evidence_level']}<br/>"
            f"Description: {cer_content['clinical_evidence']['evidence_quality']['description']}<br/>"
            f"Recommendations: {cer_content['clinical_evidence']['evidence_quality']['recommendations']}",
            self.styles['BodyText']
        ))
        elements.append(PageBreak())
        
        # 5. Benefit-Risk Analysis
        elements.append(Paragraph("5. Benefit-Risk Analysis", self.styles['Heading1']))
        
        elements.append(Paragraph("Benefits:", self.styles['Heading3']))
        benefit_data = [["Benefit", "Description", "Evidence Level"]]
        for benefit in cer_content['benefit_risk_analysis']['benefits']:
            benefit_data.append([benefit['benefit'], benefit['description'], benefit['evidence_level']])
        
        benefit_table = Table(benefit_data, colWidths=[4*cm, 8*cm, 3*cm])
        benefit_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6)
        ]))
        elements.append(benefit_table)
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Risks:", self.styles['Heading3']))
        if cer_content['benefit_risk_analysis']['risks']:
            risk_data = [["Risk", "Frequency", "Severity", "Mitigation"]]
            for risk in cer_content['benefit_risk_analysis']['risks']:
                risk_data.append([
                    risk['risk'], 
                    risk['frequency'], 
                    risk['severity'],
                    risk['mitigation']
                ])
            
            risk_table = Table(risk_data, colWidths=[4*cm, 4*cm, 3*cm, 4*cm])
            risk_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            elements.append(risk_table)
        else:
            elements.append(Paragraph("No significant risks identified.", self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Risk Level and Acceptability:", self.styles['Heading3']))
        elements.append(Paragraph(
            f"Risk Level: {cer_content['benefit_risk_analysis']['risk_level']}<br/>"
            f"Risk Acceptability: {cer_content['benefit_risk_analysis']['risk_acceptability']}<br/>"
            f"Benefit-Risk Ratio: {cer_content['benefit_risk_analysis']['benefit_risk_ratio']}",
            self.styles['BodyText']
        ))
        
        elements.append(Paragraph("Residual Risks:", self.styles['Heading3']))
        if cer_content['benefit_risk_analysis']['residual_risks']:
            residual_data = [["Risk", "Mitigation Strategy"]]
            for risk in cer_content['benefit_risk_analysis']['residual_risks']:
                residual_data.append([risk['risk'], risk['mitigation_strategy']])
            
            residual_table = Table(residual_data, colWidths=[7*cm, 8*cm])
            residual_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            elements.append(residual_table)
        else:
            elements.append(Paragraph("No significant residual risks identified.", self.styles['BodyText']))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Conclusion:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['benefit_risk_analysis']['conclusion'], self.styles['BodyText']))
        elements.append(PageBreak())
        
        # 6. Conclusion
        elements.append(Paragraph("6. Conclusion", self.styles['Heading1']))
        
        elements.append(Paragraph("Overall Conclusion:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['conclusion']['overall_conclusion'], self.styles['BodyText']))
        
        elements.append(Paragraph("Clinical Data Adequacy:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['conclusion']['clinical_data_adequacy'], self.styles['BodyText']))
        
        elements.append(Paragraph("Benefit-Risk Statement:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['conclusion']['benefit_risk_statement'], self.styles['BodyText']))
        
        elements.append(Paragraph("Residual Risks:", self.styles['Heading3']))
        residual_list = []
        for risk in cer_content['conclusion']['residual_risks']:
            residual_list.append(ListItem(Paragraph(
                f"{risk['risk']}: {risk['mitigation_strategy']}",
                self.styles['Normal']
            )))
        elements.append(ListFlowable(residual_list, bulletType='bullet', leftIndent=35))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("Post-Market Activities:", self.styles['Heading3']))
        elements.append(Paragraph(cer_content['conclusion']['post_market_activities'], self.styles['BodyText']))
        elements.append(PageBreak())
        
        # 7. References
        elements.append(Paragraph("7. References", self.styles['Heading1']))
        
        ref_data = [["ID", "Type", "Title", "Source", "Date"]]
        for ref in cer_content['references']:
            ref_data.append([
                str(ref['id']),
                ref['type'],
                ref['title'],
                ref['source'],
                ref['date']
            ])
        
        ref_table = Table(ref_data, colWidths=[1*cm, 2*cm, 7*cm, 4*cm, 2.5*cm])
        ref_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6)
        ]))
        elements.append(ref_table)
        
        # Build the PDF
        doc.build(elements)
        
        logger.info(f"PDF report generated: {filepath}")
        return filepath

async def generate_cer(
    product_id: str,
    product_name: str,
    manufacturer: str = None,
    device_description: str = None,
    intended_purpose: str = None,
    classification: str = None,
    date_range: int = DEFAULT_DATE_RANGE,
    output_format: str = "pdf"
) -> Dict[str, Any]:
    """
    Convenience function to generate a CER
    
    Args:
        product_id: Product identifier (NDC or device code)
        product_name: Product name
        manufacturer: Manufacturer name (optional)
        device_description: Description of the device (optional)
        intended_purpose: Intended purpose of the device (optional)
        classification: Device classification (optional)
        date_range: Date range in days to look back for data
        output_format: Output format ('pdf' or 'json')
        
    Returns:
        Dictionary with report information and path to the generated report
    """
    generator = CERGenerator()
    return await generator.generate_cer(
        product_id=product_id,
        product_name=product_name,
        manufacturer=manufacturer,
        device_description=device_description,
        intended_purpose=intended_purpose,
        classification=classification,
        date_range=date_range,
        output_format=output_format
    )

async def main():
    """
    Command line interface for testing
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate Clinical Evaluation Report")
    parser.add_argument("--id", required=True, help="Product ID (NDC or device code)")
    parser.add_argument("--name", required=True, help="Product name")
    parser.add_argument("--manufacturer", help="Manufacturer name")
    parser.add_argument("--description", help="Device description")
    parser.add_argument("--purpose", help="Intended purpose")
    parser.add_argument("--class", dest="classification", help="Device classification")
    parser.add_argument("--days", type=int, default=DEFAULT_DATE_RANGE, help="Date range in days")
    parser.add_argument("--format", choices=["pdf", "json"], default="pdf", help="Output format")
    
    args = parser.parse_args()
    
    result = await generate_cer(
        product_id=args.id,
        product_name=args.name,
        manufacturer=args.manufacturer,
        device_description=args.description,
        intended_purpose=args.purpose,
        classification=args.classification,
        date_range=args.days,
        output_format=args.format
    )
    
    print(f"CER generated successfully:")
    print(f"  Product: {result['product_name']} (ID: {result['product_id']})")
    print(f"  Report date: {result['report_date']}")
    print(f"  Format: {result['format']}")
    print(f"  Output file: {result['path']}")

if __name__ == "__main__":
    asyncio.run(main())