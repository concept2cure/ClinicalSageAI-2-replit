"""
Enhanced Traceability Indexer for eCTD CoAuthor Module

This indexer tags and stores references per section, maintaining complete traceability
of all content sources and their relationships within the eCTD document structure.
"""

import os
import json
import asyncio
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime
import hashlib
import uuid
from dataclasses import dataclass, asdict
from collections import defaultdict
import re

@dataclass
class ContentReference:
    """Represents a traceable content reference"""
    reference_id: str
    source_document_id: str
    source_document_title: str
    source_section: str
    source_page: Optional[int]
    source_paragraph: Optional[int]
    referenced_text: str
    context_before: str
    context_after: str
    reference_type: str  # 'direct_quote', 'paraphrase', 'summary', 'data_point'
    confidence_score: float
    timestamp: str
    created_by: str

@dataclass
class SectionTraceability:
    """Complete traceability record for a document section"""
    section_id: str
    section_title: str
    ectd_module: str
    ectd_section: str
    content_references: List[ContentReference]
    dependency_map: Dict[str, List[str]]  # Maps content to source dependencies
    quality_metrics: Dict[str, float]
    compliance_status: str
    last_updated: str
    version: str

class EnhancedTraceabilityIndexer:
    """
    Advanced traceability system that maintains comprehensive source tracking
    for all content within the eCTD CoAuthor module.
    """
    
    def __init__(self):
        self.traceability_database = {}
        self.reference_index = {}
        self.dependency_graph = defaultdict(set)
        self.content_fingerprints = {}
        
    async def index_section_content(
        self,
        section_id: str,
        section_title: str,
        content: str,
        source_documents: List[Dict],
        ectd_context: Dict
    ) -> SectionTraceability:
        """
        Create comprehensive traceability index for a document section
        
        Args:
            section_id: Unique identifier for the section
            section_title: Human-readable section title
            content: The actual content to be indexed
            source_documents: List of source documents used
            ectd_context: eCTD module and section information
            
        Returns:
            SectionTraceability object with complete reference mapping
        """
        
        timestamp = datetime.utcnow().isoformat()
        
        # Extract content references from the section
        content_refs = await self._extract_content_references(
            content, source_documents, section_id
        )
        
        # Build dependency map
        dependency_map = self._build_dependency_map(content, content_refs)
        
        # Calculate quality metrics
        quality_metrics = await self._calculate_quality_metrics(
            content, content_refs, source_documents
        )
        
        # Determine compliance status
        compliance_status = await self._assess_compliance_status(
            content_refs, ectd_context
        )
        
        # Create traceability record
        traceability = SectionTraceability(
            section_id=section_id,
            section_title=section_title,
            ectd_module=ectd_context.get('module', 'Unknown'),
            ectd_section=ectd_context.get('section', 'Unknown'),
            content_references=content_refs,
            dependency_map=dependency_map,
            quality_metrics=quality_metrics,
            compliance_status=compliance_status,
            last_updated=timestamp,
            version=ectd_context.get('version', '1.0')
        )
        
        # Store in database
        self.traceability_database[section_id] = traceability
        
        # Update reference index
        for ref in content_refs:
            self.reference_index[ref.reference_id] = section_id
        
        # Update dependency graph
        self._update_dependency_graph(section_id, content_refs)
        
        return traceability
    
    async def _extract_content_references(
        self,
        content: str,
        source_documents: List[Dict],
        section_id: str
    ) -> List[ContentReference]:
        """Extract and classify content references from text"""
        
        references = []
        timestamp = datetime.utcnow().isoformat()
        
        # Parse content into sentences and paragraphs
        sentences = self._split_into_sentences(content)
        paragraphs = content.split('\n\n')
        
        for doc in source_documents:
            doc_content = doc.get('content', '')
            doc_sentences = self._split_into_sentences(doc_content)
            
            # Find potential references using multiple methods
            refs = await self._find_document_references(
                sentences, doc_sentences, doc, section_id, timestamp
            )
            references.extend(refs)
        
        return references
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences for analysis"""
        # Simple sentence splitting (would use proper NLP in production)
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    async def _find_document_references(
        self,
        content_sentences: List[str],
        source_sentences: List[str],
        source_doc: Dict,
        section_id: str,
        timestamp: str
    ) -> List[ContentReference]:
        """Find references between content and source document"""
        
        references = []
        
        for i, content_sent in enumerate(content_sentences):
            for j, source_sent in enumerate(source_sentences):
                # Calculate similarity (simplified - would use embedding similarity)
                similarity = self._calculate_text_similarity(content_sent, source_sent)
                
                if similarity > 0.7:  # High similarity threshold
                    ref_type = self._classify_reference_type(content_sent, source_sent, similarity)
                    
                    # Get context
                    context_before = ' '.join(content_sentences[max(0, i-1):i])
                    context_after = ' '.join(content_sentences[i+1:min(len(content_sentences), i+2)])
                    
                    reference = ContentReference(
                        reference_id=str(uuid.uuid4()),
                        source_document_id=source_doc.get('id', 'unknown'),
                        source_document_title=source_doc.get('title', 'Unknown'),
                        source_section=source_doc.get('section', 'Unknown'),
                        source_page=source_doc.get('page'),
                        source_paragraph=j // 5,  # Approximate paragraph number
                        referenced_text=content_sent,
                        context_before=context_before,
                        context_after=context_after,
                        reference_type=ref_type,
                        confidence_score=similarity,
                        timestamp=timestamp,
                        created_by="traceability_indexer"
                    )
                    
                    references.append(reference)
        
        return references
    
    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two text strings"""
        # Simple word overlap similarity (would use embeddings in production)
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0.0
    
    def _classify_reference_type(self, content_text: str, source_text: str, similarity: float) -> str:
        """Classify the type of reference based on similarity and patterns"""
        
        if similarity > 0.95:
            return 'direct_quote'
        elif similarity > 0.8:
            return 'paraphrase'
        elif self._contains_numerical_data(content_text) and self._contains_numerical_data(source_text):
            return 'data_point'
        else:
            return 'summary'
    
    def _contains_numerical_data(self, text: str) -> bool:
        """Check if text contains numerical data"""
        return bool(re.search(r'\d+(\.\d+)?%?', text))
    
    def _build_dependency_map(
        self,
        content: str,
        references: List[ContentReference]
    ) -> Dict[str, List[str]]:
        """Build a map of content dependencies to sources"""
        
        dependency_map = defaultdict(list)
        
        # Map each paragraph to its source dependencies
        paragraphs = content.split('\n\n')
        
        for i, paragraph in enumerate(paragraphs):
            para_key = f"paragraph_{i}"
            
            for ref in references:
                if ref.referenced_text in paragraph:
                    dependency_map[para_key].append(ref.source_document_id)
        
        return dict(dependency_map)
    
    async def _calculate_quality_metrics(
        self,
        content: str,
        references: List[ContentReference],
        source_documents: List[Dict]
    ) -> Dict[str, float]:
        """Calculate quality metrics for traceability"""
        
        metrics = {}
        
        # Source coverage: percentage of content with traceable sources
        total_sentences = len(self._split_into_sentences(content))
        referenced_sentences = len(set(ref.referenced_text for ref in references))
        metrics['source_coverage'] = referenced_sentences / total_sentences if total_sentences > 0 else 0.0
        
        # Reference diversity: variety of source documents used
        unique_sources = len(set(ref.source_document_id for ref in references))
        total_sources = len(source_documents)
        metrics['reference_diversity'] = unique_sources / total_sources if total_sources > 0 else 0.0
        
        # Average confidence: mean confidence score of all references
        if references:
            metrics['average_confidence'] = sum(ref.confidence_score for ref in references) / len(references)
        else:
            metrics['average_confidence'] = 0.0
        
        # Reference balance: balance between different reference types
        ref_types = [ref.reference_type for ref in references]
        type_counts = {t: ref_types.count(t) for t in set(ref_types)}
        if type_counts:
            max_count = max(type_counts.values())
            min_count = min(type_counts.values())
            metrics['reference_balance'] = min_count / max_count if max_count > 0 else 0.0
        else:
            metrics['reference_balance'] = 0.0
        
        return metrics
    
    async def _assess_compliance_status(
        self,
        references: List[ContentReference],
        ectd_context: Dict
    ) -> str:
        """Assess regulatory compliance status based on traceability"""
        
        # Check minimum traceability requirements
        if not references:
            return "non_compliant"
        
        # Check for required reference types based on eCTD section
        required_types = self._get_required_reference_types(ectd_context)
        available_types = set(ref.reference_type for ref in references)
        
        if not required_types.issubset(available_types):
            return "partial_compliance"
        
        # Check confidence thresholds
        low_confidence_refs = [ref for ref in references if ref.confidence_score < 0.6]
        if len(low_confidence_refs) > len(references) * 0.2:  # More than 20% low confidence
            return "review_required"
        
        return "compliant"
    
    def _get_required_reference_types(self, ectd_context: Dict) -> Set[str]:
        """Get required reference types based on eCTD section"""
        
        section_requirements = {
            'module2': {'summary', 'data_point'},
            'module4': {'direct_quote', 'data_point'},
            'module5': {'direct_quote', 'data_point', 'summary'},
            'safety_overview': {'direct_quote', 'data_point'},
            'efficacy_overview': {'data_point', 'summary'}
        }
        
        ectd_module = ectd_context.get('module', '').lower()
        ectd_section = ectd_context.get('section', '').lower()
        
        return section_requirements.get(ectd_module, set()) | section_requirements.get(ectd_section, set())
    
    def _update_dependency_graph(self, section_id: str, references: List[ContentReference]):
        """Update the global dependency graph"""
        
        for ref in references:
            self.dependency_graph[section_id].add(ref.source_document_id)
    
    def get_section_traceability(self, section_id: str) -> Optional[SectionTraceability]:
        """Retrieve traceability information for a specific section"""
        return self.traceability_database.get(section_id)
    
    def get_references_by_source(self, source_document_id: str) -> List[ContentReference]:
        """Get all references that use a specific source document"""
        
        all_references = []
        for traceability in self.traceability_database.values():
            source_refs = [ref for ref in traceability.content_references 
                          if ref.source_document_id == source_document_id]
            all_references.extend(source_refs)
        
        return all_references
    
    def analyze_cross_section_dependencies(self) -> Dict[str, List[str]]:
        """Analyze dependencies between different sections"""
        
        dependencies = {}
        
        for section_id, sources in self.dependency_graph.items():
            # Find other sections that use the same sources
            related_sections = []
            for other_section, other_sources in self.dependency_graph.items():
                if section_id != other_section and sources.intersection(other_sources):
                    related_sections.append(other_section)
            
            dependencies[section_id] = related_sections
        
        return dependencies
    
    def generate_traceability_report(self, section_ids: Optional[List[str]] = None) -> Dict:
        """Generate a comprehensive traceability report"""
        
        if section_ids is None:
            section_ids = list(self.traceability_database.keys())
        
        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'sections_analyzed': len(section_ids),
            'sections': {},
            'summary_metrics': {},
            'cross_dependencies': self.analyze_cross_section_dependencies()
        }
        
        all_quality_metrics = []
        
        for section_id in section_ids:
            traceability = self.traceability_database.get(section_id)
            if traceability:
                report['sections'][section_id] = asdict(traceability)
                all_quality_metrics.append(traceability.quality_metrics)
        
        # Calculate summary metrics
        if all_quality_metrics:
            report['summary_metrics'] = {
                'average_source_coverage': sum(m.get('source_coverage', 0) for m in all_quality_metrics) / len(all_quality_metrics),
                'average_reference_diversity': sum(m.get('reference_diversity', 0) for m in all_quality_metrics) / len(all_quality_metrics),
                'average_confidence': sum(m.get('average_confidence', 0) for m in all_quality_metrics) / len(all_quality_metrics)
            }
        
        return report

# Global instance for use in the eCTD CoAuthor module
traceability_indexer = EnhancedTraceabilityIndexer()

async def index_ectd_section_traceability(
    section_id: str,
    section_title: str,
    content: str,
    source_documents: List[Dict],
    ectd_context: Dict
) -> Dict:
    """
    Main function to index section traceability from the CoAuthor module
    
    Returns:
        Dictionary containing traceability data
    """
    
    traceability = await traceability_indexer.index_section_content(
        section_id, section_title, content, source_documents, ectd_context
    )
    
    return asdict(traceability)

def get_section_references(section_id: str) -> Optional[Dict]:
    """Get traceability references for a specific section"""
    
    traceability = traceability_indexer.get_section_traceability(section_id)
    return asdict(traceability) if traceability else None

def generate_full_traceability_report() -> Dict:
    """Generate a complete traceability report for all indexed sections"""
    
    return traceability_indexer.generate_traceability_report()

if __name__ == "__main__":
    # Test the indexer
    test_content = """
    The clinical study demonstrated significant efficacy in the primary endpoint.
    Safety profile was acceptable with mild adverse events reported in 12% of subjects.
    The study population included 250 subjects across multiple sites.
    """
    
    test_sources = [
        {
            "id": "csr_001",
            "title": "Clinical Study Report - Phase III",
            "content": "The study demonstrated significant efficacy with p<0.001 for primary endpoint. Safety analysis showed mild adverse events in 12% of treated subjects.",
            "section": "Results"
        }
    ]
    
    test_context = {
        "module": "module5",
        "section": "clinical_overview",
        "version": "1.0"
    }
    
    result = asyncio.run(index_ectd_section_traceability(
        "test_section_001", "Clinical Overview", test_content, test_sources, test_context
    ))
    
    print(json.dumps(result, indent=2))if __name__ == "__main__":
    import sys
    import json
    import argparse
    import asyncio
    
    parser = argparse.ArgumentParser(description="Traceability Indexer Agent")
    parser.add_argument("--input", type=str, required=True, help="JSON input data")
    args = parser.parse_args()
    
    try:
        input_data = json.loads(args.input)
        
        async def main():
            result = await index_ectd_section_traceability(
                section_id=input_data.get("section_id", ""),
                section_title=input_data.get("section_title", ""),
                content=input_data.get("content", ""),
                source_documents=input_data.get("source_documents", []),
                ectd_context=input_data.get("ectd_context", {})
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
