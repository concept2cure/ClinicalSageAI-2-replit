"""
Enhanced Section Generation Agent for eCTD CoAuthor Module

This agent provides LLM-powered, source-based generation for regulatory document sections
within the existing eCTD CoAuthor workflow. It integrates directly with the document
workspace and maintains full traceability of generated content.
"""

import os
import json
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
import openai
from dataclasses import dataclass, asdict
import hashlib
import uuid

# Set up OpenAI client
openai.api_key = os.getenv('OPENAI_API_KEY')

@dataclass
class SourceReference:
    """Represents a source document reference used in generation"""
    document_id: str
    document_title: str
    section: str
    page_number: Optional[int]
    excerpt: str
    confidence_score: float
    timestamp: str

@dataclass
class GeneratedSection:
    """Represents a generated document section with full traceability"""
    section_id: str
    section_title: str
    content: str
    source_references: List[SourceReference]
    generation_metadata: Dict[str, Any]
    quality_score: float
    regulatory_compliance_score: float
    timestamp: str

class EnhancedSectionGenerator:
    """
    Enhanced section generator that integrates with the eCTD CoAuthor module
    to provide intelligent, source-based content generation.
    """
    
    def __init__(self):
        self.model = "gpt-4o"  # Latest OpenAI model
        self.generation_history = []
        self.source_database = {}
        
    async def generate_regulatory_section(
        self,
        section_type: str,
        context_documents: List[Dict],
        user_requirements: Dict,
        compliance_region: str = "FDA"
    ) -> GeneratedSection:
        """
        Generate a regulatory document section with full source traceability
        
        Args:
            section_type: Type of section (e.g., "executive_summary", "safety_overview")
            context_documents: List of source documents with content
            user_requirements: User-specified requirements and constraints
            compliance_region: Regulatory region (FDA, EMA, PMDA, etc.)
            
        Returns:
            GeneratedSection with content and full traceability
        """
        
        section_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()
        
        # Prepare source context from documents
        source_context = self._prepare_source_context(context_documents)
        
        # Generate regulatory-compliant content
        generated_content = await self._generate_content_with_sources(
            section_type, source_context, user_requirements, compliance_region
        )
        
        # Extract and validate source references
        source_references = self._extract_source_references(
            generated_content, context_documents
        )
        
        # Calculate quality and compliance scores
        quality_score = await self._calculate_quality_score(generated_content)
        compliance_score = await self._calculate_compliance_score(
            generated_content, section_type, compliance_region
        )
        
        # Create generation metadata
        metadata = {
            "model_used": self.model,
            "generation_timestamp": timestamp,
            "user_id": user_requirements.get("user_id", "unknown"),
            "section_type": section_type,
            "compliance_region": compliance_region,
            "source_document_count": len(context_documents),
            "content_hash": hashlib.sha256(generated_content.encode()).hexdigest(),
            "generation_parameters": user_requirements
        }
        
        generated_section = GeneratedSection(
            section_id=section_id,
            section_title=user_requirements.get("title", f"Generated {section_type}"),
            content=generated_content,
            source_references=source_references,
            generation_metadata=metadata,
            quality_score=quality_score,
            regulatory_compliance_score=compliance_score,
            timestamp=timestamp
        )
        
        # Store in generation history for traceability
        self.generation_history.append(generated_section)
        
        return generated_section
    
    def _prepare_source_context(self, documents: List[Dict]) -> str:
        """Prepare source document context for generation"""
        context_parts = []
        
        for doc in documents:
            doc_context = f"Document: {doc.get('title', 'Unknown')}\n"
            doc_context += f"Type: {doc.get('type', 'Unknown')}\n"
            doc_context += f"Content: {doc.get('content', '')[:2000]}...\n"
            doc_context += "---\n"
            context_parts.append(doc_context)
        
        return "\n".join(context_parts)
    
    async def _generate_content_with_sources(
        self,
        section_type: str,
        source_context: str,
        requirements: Dict,
        region: str
    ) -> str:
        """Generate content using OpenAI with source-based prompting"""
        
        # Build regulatory-specific prompt
        prompt = self._build_regulatory_prompt(section_type, source_context, requirements, region)
        
        try:
            client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert regulatory writer specializing in {region} submissions. "
                                   "Generate content that is accurate, compliant, and fully traceable to source documents. "
                                   "Always cite specific sources and maintain regulatory standards. "
                                   "Return your response as JSON with 'content' field."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,  # Lower temperature for more consistent regulatory content
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
            
            content_data = json.loads(response.choices[0].message.content)
            return content_data.get("content", "")
            
        except Exception as e:
            print(f"Error generating content: {e}")
            return f"Error generating {section_type}: {str(e)}"
    
    def _build_regulatory_prompt(
        self,
        section_type: str,
        source_context: str,
        requirements: Dict,
        region: str
    ) -> str:
        """Build a regulatory-specific prompt for content generation"""
        
        prompt = f"""
        Generate a {section_type} section for an {region} regulatory submission based on the provided source documents.
        
        Requirements:
        - Section Type: {section_type}
        - Regulatory Region: {region}
        - Length: {requirements.get('length', 'standard')}
        - Focus Areas: {', '.join(requirements.get('focus_areas', []))}
        
        Source Documents:
        {source_context}
        
        Instructions:
        1. Generate content that is accurate and compliant with {region} regulatory standards
        2. Base all statements on the provided source documents
        3. Include specific citations to source documents
        4. Maintain professional regulatory writing style
        5. Ensure logical flow and clear structure
        6. Include any required regulatory disclosures
        
        Return your response as JSON with the following structure:
        {{
            "content": "Generated section content with proper citations",
            "key_points": ["List of key points covered"],
            "compliance_notes": ["Any regulatory compliance considerations"],
            "source_citations": ["List of sources referenced"]
        }}
        """
        
        return prompt.strip()
    
    def _extract_source_references(
        self,
        content: str,
        documents: List[Dict]
    ) -> List[SourceReference]:
        """Extract and validate source references from generated content"""
        
        references = []
        timestamp = datetime.utcnow().isoformat()
        
        for doc in documents:
            # Simple extraction based on document mentions in content
            if doc.get('title', '').lower() in content.lower():
                reference = SourceReference(
                    document_id=doc.get('id', str(uuid.uuid4())),
                    document_title=doc.get('title', 'Unknown'),
                    section=doc.get('section', 'Unknown'),
                    page_number=doc.get('page', None),
                    excerpt=doc.get('content', '')[:200] + "...",
                    confidence_score=0.85,  # Placeholder - would use actual similarity scoring
                    timestamp=timestamp
                )
                references.append(reference)
        
        return references
    
    async def _calculate_quality_score(self, content: str) -> float:
        """Calculate content quality score based on various metrics"""
        
        # Simple quality metrics (would be enhanced with proper NLP analysis)
        score = 0.0
        
        # Length appropriateness
        if 500 <= len(content) <= 5000:
            score += 0.3
        
        # Professional language indicators
        professional_terms = ["clinical", "regulatory", "compliance", "safety", "efficacy"]
        term_count = sum(1 for term in professional_terms if term in content.lower())
        score += min(term_count * 0.1, 0.4)
        
        # Structure indicators
        if content.count('\n') > 3:  # Has paragraphs
            score += 0.2
        
        # Citation indicators
        if "[" in content and "]" in content:  # Has citations
            score += 0.1
        
        return min(score, 1.0)
    
    async def _calculate_compliance_score(
        self,
        content: str,
        section_type: str,
        region: str
    ) -> float:
        """Calculate regulatory compliance score"""
        
        # Placeholder compliance scoring (would integrate with regulatory knowledge base)
        base_score = 0.7
        
        # Region-specific compliance checks
        if region == "FDA":
            if "FDA" in content or "CFR" in content:
                base_score += 0.1
        elif region == "EMA":
            if "EMA" in content or "EU" in content:
                base_score += 0.1
        
        # Section-specific compliance
        if section_type == "safety_overview" and "safety" in content.lower():
            base_score += 0.1
        
        return min(base_score, 1.0)
    
    def get_generation_history(self) -> List[Dict]:
        """Get history of all generated sections"""
        return [asdict(section) for section in self.generation_history]
    
    def get_section_by_id(self, section_id: str) -> Optional[GeneratedSection]:
        """Retrieve a specific generated section by ID"""
        for section in self.generation_history:
            if section.section_id == section_id:
                return section
        return None

# Global instance for use in the eCTD CoAuthor module
section_generator = EnhancedSectionGenerator()

async def generate_ectd_section(
    section_type: str,
    documents: List[Dict],
    requirements: Dict,
    region: str = "FDA"
) -> Dict:
    """
    Main function to generate eCTD sections from the CoAuthor module
    
    Returns:
        Dictionary containing generated section data
    """
    
    generated_section = await section_generator.generate_regulatory_section(
        section_type, documents, requirements, region
    )
    
    return asdict(generated_section)

if __name__ == "__main__":
    # Test the generator
    test_docs = [
        {
            "id": "doc1",
            "title": "Clinical Study Report 001",
            "type": "csr",
            "content": "This study evaluated the safety and efficacy of the investigational drug..."
        }
    ]
    
    test_requirements = {
        "title": "Safety Overview",
        "length": "standard",
        "focus_areas": ["adverse_events", "serious_aes"],
        "user_id": "test_user"
    }
    
    result = asyncio.run(generate_ectd_section(
        "safety_overview", test_docs, test_requirements
    ))
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    import sys
    import json
    import argparse
    import asyncio
    
    parser = argparse.ArgumentParser(description='Enhanced Section Generation Agent')
    parser.add_argument('--input', type=str, required=True, help='JSON input data')
    args = parser.parse_args()
    
    try:
        input_data = json.loads(args.input)
        
        async def main():
            result = await generate_ectd_section(
                section_type=input_data.get('section_type', ''),
                documents=input_data.get('documents', []),
                requirements=input_data.get('requirements', {}),
                region=input_data.get('compliance_region', 'FDA')
            )
            print(json.dumps(result))
        
        asyncio.run(main())
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Command line execution error: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))